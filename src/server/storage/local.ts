import * as fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import { isInside } from "../config";
import type { StorageProvider, StorageEntry } from "./provider";

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export function validName(name: string) {
  if (
    !name ||
    name !== name.trim() ||
    name.length > 180 ||
    /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) ||
    name === "." ||
    name === ".."
  )
    throw new Error(
      "Недопустимое имя: используйте обычное имя без путей и специальных символов",
    );
  return name;
}
export function pathKey(relative: string) {
  return process.platform === "win32" ? relative.toLowerCase() : relative;
}

// This class is the only owner of media/staging/thumbnail filesystem operations.
// No method for deleting originals or folders is exposed.
export class LocalStorageProvider implements StorageProvider {
  readonly rootName: string;
  constructor(
    readonly root: string,
    readonly state: string,
  ) {
    this.rootName = path.basename(root);
  }
  private async noLinks(absolute: string) {
    const parsed = path.parse(absolute);
    let cursor = parsed.root;
    for (const part of absolute
      .slice(parsed.root.length)
      .split(path.sep)
      .filter(Boolean)) {
      cursor = path.join(cursor, part);
      try {
        if ((await fs.lstat(cursor)).isSymbolicLink())
          throw new Error("Символические ссылки и junction не поддерживаются");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
        throw error;
      }
    }
  }
  private async safe(relative: string, root = this.root): Promise<string> {
    if (relative.startsWith("trash:")) {
      if (!/^trash:[a-f0-9-]+\/payload(?:\/|$)/.test(relative))
        throw new Error("Некорректный путь корзины");
      return this.safe("trash/" + relative.slice(6), this.state);
    }
    if (
      relative.includes("\\") ||
      relative.includes(":") ||
      relative.startsWith("/") ||
      relative.split("/").some((p) => p === ".." || p === ".")
    )
      throw new Error("Путь выходит за пределы хранилища");
    const resolved = path.resolve(root, relative);
    if (!isInside(root, resolved))
      throw new Error("Путь выходит за пределы хранилища");
    await this.noLinks(resolved);
    return resolved;
  }
  async initialize() {
    await this.noLinks(this.root);
    await this.noLinks(this.state);
    if (!(await fs.stat(this.root)).isDirectory())
      throw new Error("MEDIA_STORAGE_PATH не является папкой");
    await fs.mkdir(this.state, { recursive: true });
    const marker = path.join(this.state, "storage-root.json");
    const expected = JSON.stringify({ root: pathKey(path.resolve(this.root)) });
    try {
      await fs.writeFile(marker, expected, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if ((await fs.readFile(marker, "utf8")) !== expected)
      throw new Error("Служебная база привязана к другому хранилищу");
    for (const name of ["staging", "thumbnails", "trash"]) {
      const dir = await this.safe(name, this.state);
      await fs.mkdir(dir, { recursive: true });
    }
  }
  async list(relative: string): Promise<StorageEntry[]> {
    return this.listEntries(relative);
  }
  async hasEntries(relative: string) {
    const dir = await fs.opendir(await this.safe(relative));
    try {
      return (await dir.read()) !== null;
    } finally {
      await dir.close();
    }
  }
  private async listEntries(relative: string): Promise<StorageEntry[]> {
    const absolute = await this.safe(relative);
    const result: StorageEntry[] = [];
    for (const entry of await fs.readdir(absolute, { withFileTypes: true })) {
      const child = relative ? relative + "/" + entry.name : entry.name;
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
        result.push({
          path: child,
          name: entry.name,
          type: "unsupported",
          size: 0,
          modified: 0,
        });
        continue;
      }
      const stat = await fs.lstat(await this.safe(child));
      result.push({
        path: child,
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        size: stat.size,
        modified: stat.mtimeMs,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }
  async exists(relative: string) {
    try {
      await fs.lstat(await this.safe(relative));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  async read(relative: string) {
    const handle = await fs.open(await this.safe(relative), "r");
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size > MAX_IMAGE_BYTES)
        throw new Error("Файл не является изображением до 50 МБ");
      const bytes = await handle.readFile();
      const after = await handle.stat();
      if (
        bytes.length > MAX_IMAGE_BYTES ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs
      )
        throw new Error(
          "Файл изменился во время чтения. Повторите Scan позднее",
        );
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async createFolder(relative: string) {
    validName(path.posix.basename(relative));
    if (!relative) throw new Error("Корневая папка уже существует");
    await fs.mkdir(await this.safe(relative)); // EEXIST is an error; never adopts an existing destination.
  }
  async validateFilePath(relative: string) {
    validName(path.posix.basename(relative));
    if ((await this.safe(relative)).length > 240)
      throw new Error("Путь превышает безопасные 240 символов");
  }
  async undoMove(from: string, to: string) {
    const source = await this.safe(from),
      target = await this.safe(to);
    const a = await this.exists(from),
      b = await this.exists(to);
    if (a && b) {
      const x = await fs.stat(source),
        y = await fs.stat(target);
      if (x.dev !== y.dev || x.ino !== y.ino || !x.isFile())
        throw new Error("Rollback: оба пути заняты разными объектами");
      await fs.unlink(target);
    } else if (b) await this.move(to, from);
    else if (!a) throw new Error("Rollback: исходный файл не найден");
  }
  async openRead(relative: string) {
    const handle = await fs.open(await this.safe(relative), "r");
    try {
      if (!(await handle.stat()).isFile())
        throw new Error("Ожидается обычный файл");
      return handle.createReadStream({ autoClose: true });
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async move(from: string, to: string) {
    if (!from || !to || from === to)
      throw new Error("Недопустимое перемещение");
    const source = await this.safe(from),
      target = await this.safe(to);
    if (await this.exists(to))
      throw new Error("Конфликт: путь уже занят, данные не перезаписаны");
    if (/^trash:[a-f0-9-]+\/payload$/.test(to)) {
      await fs.mkdir(path.dirname(target));
    }
    // Exclusive hard-link publication protects files even if an external writer races the check.
    // Removing the old directory entry is a move: the identical original remains at target.
    if ((await fs.lstat(source)).isFile()) {
      await fs.link(source, target);
      await fs.unlink(source);
    } else {
      // Local Windows directory rename refuses existing destination directories.
      await fs.rename(source, target);
    }
  }
  async renameFolder(from: string, to: string) {
    if (!from || !to || path.posix.dirname(from) !== path.posix.dirname(to))
      throw new Error(
        "Разрешено только переименование внутри родительской папки",
      );
    validName(path.posix.basename(to));
    const source = await this.safe(from),
      target = await this.safe(to);
    if (!(await fs.lstat(source)).isDirectory())
      throw new Error("Исходная папка не найдена");
    if (await this.exists(to))
      throw new Error("Папка с таким именем уже существует");
    await fs.rename(source, target);
  }
  async saveOriginal(relative: string, bytes: Buffer) {
    const destination = await this.safe(relative);
    const stage = await this.safe(
      "staging/" + randomUUID() + ".part",
      this.state,
    );
    const handle = await fs.open(stage, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    // Atomic publication without overwrite. State and media must be on the same volume.
    // Only the private staging link is removed, never an original.
    try {
      await fs.link(stage, destination);
    } finally {
      await fs.unlink(stage);
    }
  }
  async saveThumbnail(key: string, bytes: Buffer) {
    if (!/^[a-f0-9-]+\.webp$/.test(key))
      throw new Error("Некорректный ключ превью");
    await fs.writeFile(
      await this.safe("thumbnails/" + key, this.state),
      bytes,
      { flag: "wx" },
    );
  }
  async readThumbnail(key: string) {
    if (!/^[a-f0-9-]+\.webp$/.test(key))
      throw new Error("Некорректный ключ превью");
    return fs.readFile(await this.safe("thumbnails/" + key, this.state));
  }
  async withLock<T>(work: () => Promise<T>): Promise<T> {
    const release = await lockfile.lock(this.state, {
      realpath: true,
      stale: 120000,
      update: 10000,
      retries: { retries: 60, minTimeout: 250, maxTimeout: 1000 },
    });
    try {
      return await work();
    } finally {
      await release();
    }
  }
  async capacity() {
    const s = await fs.statfs(this.root);
    return {
      total: Number(s.blocks) * Number(s.bsize),
      available: Number(s.bavail) * Number(s.bsize),
    };
  }
}
