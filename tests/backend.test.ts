import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { LibraryService } from "../src/server/library";
import {
  LocalStorageProvider,
  pathKey,
  validName,
} from "../src/server/storage/local";
import { checksum, inspectImage } from "../src/server/image";
import { localRequest } from "../src/server/http";
import { WorkspaceOperations } from "../src/server/workspace-operations";
import { download } from "../src/server/downloads";
import { unzip } from "./zip-helper";
import { projectTemplates } from "../src/server/project-templates";

let base: string,
  root: string,
  state: string,
  db: PrismaClient,
  service: LibraryService,
  provider: LocalStorageProvider;
let original: Buffer, second: Buffer, third: Buffer;
const fixture = async (color: string) =>
  sharp({ create: { width: 100, height: 80, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
before(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "gart-mvp02-"));
  root = path.join(base, "media");
  state = path.join(base, "state");
  await fs.mkdir(
    path.join(root, "01_КЛИЕНТСКИЕ_ПРОЕКТЫ", "Существующий проект", "Фото"),
    { recursive: true },
  );
  original = await fixture("#334f48");
  second = await fixture("#d8a72e");
  third = await fixture("#6e71ac");
  await fs.writeFile(
    path.join(
      root,
      "01_КЛИЕНТСКИЕ_ПРОЕКТЫ",
      "Существующий проект",
      "Фото",
      "оригинал.jpg",
    ),
    original,
  );
  await fs.writeFile(
    path.join(root, "не-изображение.txt"),
    "keep this document",
  );
  provider = new LocalStorageProvider(root, state);
  await provider.initialize();
  const url = "file:" + path.join(state, "media.db").replaceAll("\\", "/");
  const initializer = new PrismaClient({ datasources: { db: { url } } });
  await initializer.$connect();
  await initializer.$disconnect();
  const migrate = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" },
  );
  assert.equal(migrate.status, 0, migrate.stderr + migrate.stdout);
  db = new PrismaClient({ datasources: { db: { url } } });
  service = new LibraryService(db, provider);
});
after(async () => {
  await db?.$disconnect();
  console.log("Retained isolated test data:", base);
});

test("SQLite scan preserves original bytes and is idempotent", async () => {
  const first = await service.scan();
  assert.equal(first.folderCount, 4);
  assert.equal(first.imageCount, 1);
  const counts = [await db.folder.count(), await db.mediaAsset.count()];
  const again = await service.scan();
  assert.equal(again.imageCount, 0);
  assert.deepEqual(
    [await db.folder.count(), await db.mediaAsset.count()],
    counts,
  );
  const asset = await db.mediaAsset.findFirstOrThrow();
  assert.equal(asset.checksumSha256, checksum(original));
  assert.equal(asset.width, 100);
  assert.equal(asset.height, 80);
  assert.deepEqual(await provider.read(asset.storagePath), original);
  assert.equal(
    (await sharp(await provider.readThumbnail(asset.thumbnailPath)).metadata())
      .format,
    "webp",
  );
  assert.equal(
    await fs.readFile(path.join(root, "не-изображение.txt"), "utf8"),
    "keep this document",
  );
});
test("physical folder creation, conflict and rejected names leave DB valid", async () => {
  const rootFolder = await db.folder.findUniqueOrThrow({
    where: { pathKey: "" },
  });
  const created = await service.createFolder(rootFolder.id, "Новая папка");
  assert.equal(
    (await fs.stat(path.join(root, created.storagePath))).isDirectory(),
    true,
  );
  const count = await db.folder.count();
  await assert.rejects(service.createFolder(rootFolder.id, "Новая папка"));
  for (const name of [
    "../escape",
    "CON",
    "LPT1.jpg",
    "folder.",
    "x:y",
    "a\\b",
    "a/b",
    " trailing ",
  ])
    await assert.rejects(service.createFolder(rootFolder.id, name));
  assert.equal(await db.folder.count(), count);
});
test("single and batch ingest, same name without overwrite, exact duplicate", async () => {
  const folder = await db.folder.findUniqueOrThrow({
    where: { pathKey: pathKey("Новая папка") },
  });
  const one = await service.ingest(
    folder.id,
    [{ name: "photo.jpg", bytes: second }],
    "GART",
  );
  assert.equal(one.results[0].status, "imported");
  const png = await sharp(third).png().toBuffer(),
    webp = await sharp(second).webp().toBuffer();
  const batch = await service.ingest(
    folder.id,
    [
      { name: "photo.jpg", bytes: third },
      { name: "image.png", bytes: png },
      { name: "image.webp", bytes: webp },
      { name: "duplicate.jpeg", bytes: original },
      { name: "fake.jpg", bytes: Buffer.from("not an image") },
    ],
    "CLIENT",
  );
  assert.deepEqual(
    batch.results.map((r) => r.status),
    ["imported", "imported", "imported", "duplicate", "error"],
  );
  assert.ok(batch.results[3].storagePath?.endsWith("оригинал.jpg"));
  const stored = await db.mediaAsset.findMany({
    where: { folderId: folder.id, originalFilename: "photo.jpg" },
  });
  assert.equal(stored.length, 2);
  assert.notEqual(stored[0].storedFilename, stored[1].storedFilename);
  for (const a of stored)
    assert.equal(
      checksum(await provider.read(a.storagePath)),
      a.checksumSha256,
    );
  assert.equal(
    (await db.ingestBatch.findUniqueOrThrow({ where: { id: batch.batchId } }))
      .fileCount,
    5,
  );
  assert.equal(
    await db.auditLog.count({ where: { action: "DUPLICATE_SKIPPED" } }),
    1,
  );
});
test("concurrent uploads of identical bytes publish exactly one original", async () => {
  const folder = await db.folder.findUniqueOrThrow({ where: { pathKey: "" } });
  const bytes = await fixture("#df55bc");
  const results = await Promise.all([
    service.ingest(folder.id, [{ name: "a.jpg", bytes }], "UNKNOWN"),
    service.ingest(folder.id, [{ name: "b.jpg", bytes }], "UNKNOWN"),
  ]);
  assert.deepEqual(
    results.flatMap((r) => r.results.map((i) => i.status)).sort(),
    ["duplicate", "imported"],
  );
  assert.equal(
    await db.mediaAsset.count({ where: { checksumSha256: checksum(bytes) } }),
    1,
  );
});
test("rename updates descendants, breadcrumbs and media paths, rejects collision/root", async () => {
  const folder = await db.folder.findUniqueOrThrow({
    where: { pathKey: pathKey("01_КЛИЕНТСКИЕ_ПРОЕКТЫ/Существующий проект") },
  });
  const asset = await db.mediaAsset.findFirstOrThrow({
    where: { originalFilename: "оригинал.jpg" },
  });
  await service.renameFolder(folder.id, "Новое имя");
  const updated = await db.mediaAsset.findUniqueOrThrow({
    where: { id: asset.id },
  });
  assert.ok(updated.storagePath.includes("/Новое имя/Фото/"));
  assert.deepEqual(await provider.read(updated.storagePath), original);
  const child = await db.folder.findUniqueOrThrow({
    where: { id: updated.folderId },
  });
  assert.equal(child.parentId, folder.id);
  await assert.rejects(
    service.renameFolder(
      (await db.folder.findUniqueOrThrow({ where: { pathKey: "" } })).id,
      "another-root",
    ),
  );
  await service.createFolder(folder.parentId!, "Занято");
  await assert.rejects(service.renameFolder(folder.id, "Занято"));
  assert.deepEqual(await provider.read(updated.storagePath), original);
});
test("provider blocks escapes, links, original overwrite and mismatched formats", async () => {
  for (const p of [
    "../outside.jpg",
    "/outside.jpg",
    "C:/outside.jpg",
    "x\\..\\outside.jpg",
  ])
    await assert.rejects(provider.read(p));
  const item = await db.mediaAsset.findFirstOrThrow();
  const bytes = await provider.read(item.storagePath);
  await assert.rejects(provider.saveOriginal(item.storagePath, second));
  assert.deepEqual(await provider.read(item.storagePath), bytes);
  await assert.rejects(
    inspectImage(await sharp(original).png().toBuffer(), "mismatch.jpg"),
  );
  assert.throws(() => validName("NUL"));
  const outside = path.join(base, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "outside.jpg"), third);
  await fs.symlink(
    outside,
    path.join(root, "junction"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(provider.read("junction/outside.jpg"));
  const scan = await service.scan();
  assert.ok(scan.warnings.some((w) => w.includes("junction")));
  assert.equal(
    await db.folder.count({ where: { storagePath: "junction" } }),
    0,
  );
});
test("filesystem failure does not create a false Folder row", async () => {
  class FailingStorage extends LocalStorageProvider {
    override async createFolder() {
      throw new Error("Injected disk error");
    }
  }
  const broken = new LibraryService(db, new FailingStorage(root, state));
  const rootFolder = await db.folder.findUniqueOrThrow({
    where: { pathKey: "" },
  });
  await assert.rejects(broken.createFolder(rootFolder.id, "Не создано"));
  assert.equal(await db.folder.count({ where: { name: "Не создано" } }), 0);
  assert.equal(await provider.exists("Не создано"), false);
});
function interruptedService() {
  const proxy = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return async () => {
          throw new Error("Injected database failure");
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new LibraryService(proxy, provider);
}
test("durable journal repairs database failure after physical mkdir", async () => {
  const rootFolder = await db.folder.findUniqueOrThrow({
    where: { pathKey: "" },
  });
  await assert.rejects(
    interruptedService().createFolder(rootFolder.id, "Восстановленная папка"),
  );
  assert.equal(await provider.exists("Восстановленная папка"), true);
  assert.equal(
    await db.folder.count({ where: { name: "Восстановленная папка" } }),
    0,
  );
  await service.list(rootFolder.id);
  assert.equal(
    await db.folder.count({ where: { name: "Восстановленная папка" } }),
    1,
  );
  assert.equal(
    await db.auditLog.count({ where: { action: "OPERATION_PENDING" } }),
    0,
  );
});
test("durable journal repairs rename and ingest after interrupted DB commits", async () => {
  const folder = await db.folder.findUniqueOrThrow({
    where: { pathKey: pathKey("Восстановленная папка") },
  });
  await assert.rejects(
    interruptedService().renameFolder(folder.id, "Восстановленное имя"),
  );
  await service.list(folder.id);
  assert.equal(
    (await db.folder.findUniqueOrThrow({ where: { id: folder.id } })).name,
    "Восстановленное имя",
  );
  const bytes = await fixture("#acdede");
  await assert.rejects(
    interruptedService().ingest(
      folder.id,
      [{ name: "recover.jpg", bytes }],
      "UNKNOWN",
    ),
  );
  await service.list(folder.id);
  const asset = await db.mediaAsset.findFirstOrThrow({
    where: { originalFilename: "recover.jpg" },
  });
  assert.deepEqual(await provider.read(asset.storagePath), bytes);
  assert.equal(
    await db.auditLog.count({ where: { action: "OPERATION_PENDING" } }),
    0,
  );
});
test("new Prisma connection retains catalog after restart", async () => {
  const expected = await db.mediaAsset.count();
  await db.$disconnect();
  db = new PrismaClient({
    datasources: {
      db: { url: "file:" + path.join(state, "media.db").replaceAll("\\", "/") },
    },
  });
  service = new LibraryService(db, new LocalStorageProvider(root, state));
  const result = await service.list(null);
  assert.equal(result.indexed, expected);
  assert.equal((await service.scan()).imageCount, 0);
});
test("local request boundary rejects cross-site writes and DNS rebinding hosts", () => {
  assert.doesNotThrow(() =>
    localRequest(
      new Request("http://localhost:3000/api/scan", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    localRequest(
      new Request("http://127.0.0.1:3000/api/scan", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:3000" },
      }),
    ),
  );
  assert.throws(() =>
    localRequest(
      new Request("http://127.0.0.1:3000/api/scan", {
        headers: { origin: "https://evil.example" },
      }),
    ),
  );
  assert.throws(() =>
    localRequest(new Request("http://evil.example:3000/api/scan")),
  );
});

test("single download is byte-exact; ZIP handles duplicate names and nested non-image files", async () => {
  const ops = new WorkspaceOperations(service);
  const folder = await service.createFolder(
    (await service.list(null)).rootId!,
    "Download test",
  );
  const first = await service.ingest(
    folder.id,
    [
      { name: "same.jpg", bytes: await fixture("#122233") },
      { name: "same.jpg", bytes: await fixture("#445566") },
    ],
    "GART",
  );
  const ids = first.results.map((r) => r.assetId!);
  const direct = await download(ops, { ids: [ids[0]] });
  const chunks: Buffer[] = [];
  for await (const c of direct.stream) chunks.push(c);
  assert.deepEqual(Buffer.concat(chunks), await fixture("#122233"));
  const archive = await download(ops, { ids });
  const zipChunks: Buffer[] = [];
  for await (const c of archive.stream) zipChunks.push(c);
  const entries = await unzip(Buffer.concat(zipChunks));
  assert.deepEqual([...entries.keys()].sort(), ["same (2).jpg", "same.jpg"]);
  const child = await service.createFolder(folder.id, "Nested");
  await fs.writeFile(
    path.join(root, child.storagePath, "readme.txt"),
    "keep document",
  );
  const folderArchive = await download(ops, { folderId: folder.id });
  const parts: Buffer[] = [];
  for await (const c of folderArchive.stream) parts.push(c);
  assert.equal(
    (await unzip(Buffer.concat(parts)))
      .get("Download test/Nested/readme.txt")
      ?.toString(),
    "keep document",
  );
});

test("multiple trash, restore and path conflict never overwrite existing bytes; scan excludes trash", async () => {
  const ops = new WorkspaceOperations(service);
  const folder = await service.createFolder(
    (await service.list(null)).rootId!,
    "Trash files",
  );
  const batch = await service.ingest(
    folder.id,
    [
      { name: "one.jpg", bytes: await fixture("#abcdef") },
      { name: "two.jpg", bytes: await fixture("#fedcba") },
    ],
    "GART",
  );
  const ids = batch.results.map((r) => r.assetId!);
  const originalAssets = await db.mediaAsset.findMany({
    where: { id: { in: ids } },
  });
  const preview = await ops.previewTrash({ ids });
  assert.equal(
    (await ops.trash({ ids }, preview.token)).results.filter((r) => r.ok)
      .length,
    2,
  );
  assert.equal((await service.list(folder.id)).total, 0);
  const before = await db.mediaAsset.count();
  await service.scan();
  assert.equal(await db.mediaAsset.count(), before);
  for (const a of originalAssets)
    assert.equal(await provider.exists(a.storagePath), false);
  const entries = (await ops.trashList()).filter((e) =>
    ids.includes(e.entityId),
  );
  const a = originalAssets.find((a) => a.id === entries[0].entityId)!;
  await fs.writeFile(path.join(root, a.storagePath), "CONFLICT");
  await assert.rejects(ops.restore(entries[0].id), /Конфликт/);
  assert.equal(
    await fs.readFile(path.join(root, a.storagePath), "utf8"),
    "CONFLICT",
  );
  // Move the test-created conflicting file aside; never remove it.
  await fs.rename(
    path.join(root, a.storagePath),
    path.join(root, a.storagePath + ".conflict"),
  );
  await ops.restore(entries[0].id);
  await ops.restore(entries[1].id);
  assert.equal((await service.list(folder.id)).total, 2);
  for (const a of originalAssets)
    assert.equal(
      checksum(await provider.read(a.storagePath)),
      a.checksumSha256,
    );
});

test("nonempty folder Trash includes unindexed documents; restore keeps descendants and handles parent Trash", async () => {
  const ops = new WorkspaceOperations(service),
    rootId = (await service.list(null)).rootId!;
  const folder = await service.createFolder(rootId, "Whole folder");
  const child = await service.createFolder(folder.id, "Child");
  await fs.writeFile(
    path.join(root, child.storagePath, "document.txt"),
    "non-image original",
  );
  const asset = (
    await service.ingest(
      child.id,
      [{ name: "whole.jpg", bytes: await fixture("#123456") }],
      "GART",
    )
  ).results[0];
  const p = await ops.previewTrash({ folderId: folder.id });
  assert.equal(p.fileCount, 2);
  assert.equal(p.folderCount, 1);
  const ap = await ops.previewTrash({ ids: [asset.assetId!] });
  await ops.trash({ ids: [asset.assetId!] }, ap.token);
  const p2 = await ops.previewTrash({ folderId: folder.id });
  await ops.trash({ folderId: folder.id }, p2.token);
  const entries = await ops.trashList();
  const fileEntry = entries.find((e) => e.entityId === asset.assetId)!;
  const folderEntry = entries.find((e) => e.entityId === folder.id)!;
  await assert.rejects(ops.restore(fileEntry.id), /Сначала восстановите/);
  assert.equal(
    (await service.list(null)).folders.some((f) => f.id === child.id),
    false,
  );
  await ops.restore(folderEntry.id);
  await ops.restore(fileEntry.id);
  assert.equal(
    await fs.readFile(
      path.join(root, child.storagePath, "document.txt"),
      "utf8",
    ),
    "non-image original",
  );
  assert.equal((await service.list(child.id)).total, 1);
});

test("confirmation fingerprint detects changed nonempty folder contents", async () => {
  const ops = new WorkspaceOperations(service);
  const folder = await service.createFolder(
    (await service.list(null)).rootId!,
    "Changed folder",
  );
  const preview = await ops.previewTrash({ folderId: folder.id });
  await fs.writeFile(
    path.join(root, folder.storagePath, "new.txt"),
    "new original",
  );
  await assert.rejects(
    ops.trash({ folderId: folder.id }, preview.token),
    /Содержимое изменилось/,
  );
  assert.equal(await provider.exists(folder.storagePath), true);
});

test("moving selected files updates SQLite and survives new service connection", async () => {
  const ops = new WorkspaceOperations(service),
    rootId = (await service.list(null)).rootId!;
  const from = await service.createFolder(rootId, "Move from"),
    to = await service.createFolder(rootId, "Move to");
  const batch = await service.ingest(
    from.id,
    [{ name: "move.jpg", bytes: await fixture("#553311") }],
    "GART",
  );
  const ids = batch.results.map((r) => r.assetId!);
  await ops.move(ids, to.id);
  assert.equal((await service.list(from.id)).total, 0);
  assert.equal((await service.list(to.id)).total, 1);
  assert.equal(
    checksum(
      await provider.read((await service.list(to.id)).assets[0].storagePath),
    ),
    checksum(await fixture("#553311")),
  );
  const next = new LibraryService(db, new LocalStorageProvider(root, state));
  assert.equal((await next.list(to.id)).total, 1);
});

test("template creates Project and exactly six immediate folders; failures are explicit and atomic in SQLite", async () => {
  const ops = new WorkspaceOperations(service);
  const p = await ops.createProject({
    projectId: "GART-0264",
    name: "Иванов",
    year: 2026,
    description: "Test",
    templateId: "standard",
  });
  const folder = await db.folder.findUniqueOrThrow({
    where: { id: p.folderId },
  });
  assert.equal(
    folder.storagePath,
    "01_КЛИЕНТСКИЕ_ПРОЕКТЫ/2026/GART-0264_Иванов",
  );
  assert.deepEqual(
    (await provider.list(folder.storagePath)).map((e) => e.name).sort(),
    [...projectTemplates[0].folders].sort(),
  );
  await assert.rejects(
    ops.createProject({
      projectId: "GART-0264",
      name: "Другой",
      year: 2026,
      templateId: "standard",
    }),
    /уже существует/,
  );
  const broken = new Proxy(provider, {
    get(target, prop) {
      if (prop === "createFolder")
        return async (relative: string) => {
          if (relative.endsWith("/03_РЕНДЕРЫ"))
            throw new Error("injected disk failure");
          return target.createFolder(relative);
        };
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  await assert.rejects(
    new WorkspaceOperations(new LibraryService(db, broken)).createProject({
      projectId: "GART-0999",
      name: "Failure",
      year: 2026,
      templateId: "standard",
    }),
    /FAILED/,
  );
  assert.equal(
    await db.project.count({ where: { projectId: "GART-0999" } }),
    0,
  );
  assert.equal(
    await db.folder.count({
      where: { storagePath: { contains: "GART-0999" } },
    }),
    0,
  );
  const log = await db.auditLog.findFirstOrThrow({
    where: { action: "PROJECT_FAILED" },
  });
  assert.ok(JSON.parse(log.details).created.length > 0);
  assert.equal(await provider.exists(folder.storagePath), true);
});

test("failed SQLite commit after physical Trash is recovered, without deleting original", async () => {
  const ops = new WorkspaceOperations(service);
  const folder = await service.createFolder(
    (await service.list(null)).rootId!,
    "Recovery trash",
  );
  const a = (
    await service.ingest(
      folder.id,
      [{ name: "recovery.jpg", bytes: await fixture("#111777") }],
      "GART",
    )
  ).results[0];
  const p = await ops.previewTrash({ ids: [a.assetId!] });
  const brokenDb = new Proxy(db, {
    get(target, prop) {
      if (prop === "$transaction")
        return () => Promise.reject(new Error("injected commit failure"));
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const result = await new WorkspaceOperations(
    new LibraryService(brokenDb, provider),
  ).trash({ ids: [a.assetId!] }, p.token);
  assert.equal(result.results[0].ok, false);
  await service.list(null);
  const entry = (await ops.trashList()).find((e) => e.entityId === a.assetId)!;
  assert.ok(entry);
  assert.equal(
    checksum(await provider.read(entry.storagePath)),
    checksum(await fixture("#111777")),
  );
  await ops.restore(entry.id);
});

test("select-all includes assets beyond the visible page; cancelled ZIP releases storage", async () => {
  const ops = new WorkspaceOperations(service);
  const folder = await service.createFolder(
    (await service.list(null)).rootId!,
    "All pages",
  );
  const files = await Promise.all(
    Array.from({ length: 65 }, async (_, i) => ({
      name: "page-" + i + ".jpg",
      bytes: await sharp({
        create: {
          width: 100 + i,
          height: 80,
          channels: 3,
          background: "#bb44dd",
        },
      })
        .jpeg()
        .toBuffer(),
    })),
  );
  const batch = await service.ingest(folder.id, files, "GART");
  assert.equal(batch.results.filter((r) => r.status === "imported").length, 65);
  assert.equal((await service.list(folder.id)).assets.length, 60);
  assert.equal((await ops.ids(folder.id)).length, 65);
  await fs.writeFile(
    path.join(root, folder.storagePath, "large-test.bin"),
    Buffer.alloc(2 * 1024 * 1024, 7),
  );
  const controller = new AbortController();
  const result = await download(
    ops,
    { folderId: folder.id },
    controller.signal,
  );
  controller.abort();
  result.stream.destroy();
  const listing = await service.list(folder.id);
  assert.equal(listing.total, 65);
});
