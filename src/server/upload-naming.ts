import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { StorageProvider } from "./storage/provider";
import { pathKey } from "./storage/local";
import {
  makeName,
  filenameParts,
  type NamingOptions,
  defaultNaming,
} from "../lib/naming";
import { namingContext } from "./naming-context";
export async function freeFilename(
  db: PrismaClient,
  storage: StorageProvider,
  folderPath: string,
  name: string,
  reserved = new Set<string>(),
) {
  const { stem, extension } = filenameParts(name);
  for (let n = 1; n <= 100000; n++) {
    const candidate = n === 1 ? name : stem + " (" + n + ")" + extension;
    const relative = path.posix.join(folderPath, candidate);
    await storage.validateFilePath(relative);
    if (
      reserved.has(pathKey(relative)) ||
      (await storage.exists(relative)) ||
      (await db.mediaAsset.findUnique({
        where: { pathKey: pathKey(relative) },
      }))
    )
      continue;
    reserved.add(pathKey(relative));
    return candidate;
  }
  throw new Error("Не удалось подобрать свободное имя");
}
export async function uploadNames(
  db: PrismaClient,
  storage: StorageProvider,
  folderId: string,
  names: string[],
  sourceType: string,
  options: NamingOptions = defaultNaming,
) {
  if (
    !Array.isArray(names) ||
    names.length > 50000 ||
    names.some((n) => typeof n !== "string" || n.length > 500)
  )
    throw new Error("Некорректный список имён");
  const info = await namingContext(db, folderId, sourceType),
    reserved = new Set<string>();
  const rows = [];
  for (const [i, name] of names.entries()) {
    try {
      const requested = makeName(
        name,
        name,
        options,
        {
          ...info.context,
          type: filenameParts(name).extension.slice(1).toUpperCase(),
        },
        i,
      );
      const newName = await freeFilename(
        db,
        storage,
        info.folderPath,
        requested,
        reserved,
      );
      rows.push({ oldName: name, newName });
    } catch (e) {
      rows.push({ oldName: name, newName: "", error: (e as Error).message });
    }
  }
  return { ...info, rows };
}
