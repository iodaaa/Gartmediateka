import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { StorageProvider } from "./storage/provider";
import type { LibraryService } from "./library";
import { WorkspaceOperations } from "./workspace-operations";
import { makeName, type NamingOptions, filenameParts } from "../lib/naming";
import { namingContext } from "./naming-context";
import { pathKey } from "./storage/local";
import { checksum } from "./image";
export type RenameRow = {
  id: string;
  oldName: string;
  newName: string;
  source: string;
  target: string;
  checksum: string;
  error?: string;
};
const fingerprint = (rows: RenameRow[]) =>
  createHash("sha256").update(JSON.stringify(rows)).digest("hex");
async function rollback(
  db: PrismaClient,
  storage: StorageProvider,
  id: string,
  rows: RenameRow[],
) {
  for (const row of [...rows].reverse()) {
    if (row.source === row.target) continue;
    const at = (await storage.exists(row.source)) ? row.source : row.target;
    if (checksum(await storage.read(at)) !== row.checksum)
      throw new Error("Rollback остановлен: файл изменился " + at);
    await storage.undoMove(row.source, row.target);
  }
  await db.auditLog.update({
    where: { id },
    data: { action: "BATCH_RENAME_ROLLED_BACK" },
  });
}
export async function recoverRenames(
  db: PrismaClient,
  storage: StorageProvider,
) {
  for (const log of await db.auditLog.findMany({
    where: { action: "BATCH_RENAME_PENDING" },
  })) {
    try {
      await rollback(db, storage, log.id, JSON.parse(log.details).rows);
    } catch (e) {
      throw new Error(
        "Незавершённый batch rename сохранён в AuditLog; требуется проверка, файлы не удалены. " +
          (e as Error).message,
      );
    }
  }
}
export class RenameService {
  constructor(readonly base: LibraryService) {}
  private async plan(ids: string[], options: NamingOptions) {
    const assets = await new WorkspaceOperations(this.base).selected(ids);
    const ordered = ids
      .map((id) => assets.find((a) => a.id === id)!)
      .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i);
    const rows: RenameRow[] = [];
    const targets = new Set<string>();
    for (const [i, a] of ordered.entries()) {
      let newName = "",
        target = "",
        error: string | undefined;
      try {
        const { context } = await namingContext(
          this.base.db,
          a.folderId,
          a.sourceType,
          a.createdAt.toISOString().slice(0, 10),
        );
        newName = makeName(
          a.originalFilename,
          a.storedFilename,
          options,
          { ...context, type: a.extension.toUpperCase() },
          i,
        );
        target = path.posix.join(path.posix.dirname(a.storagePath), newName);
        await this.base.storage.validateFilePath(target);
        if (
          target !== a.storagePath &&
          pathKey(target) === pathKey(a.storagePath)
        )
          throw new Error("Изменение только регистра не поддерживается");
        if (
          target !== a.storagePath &&
          ((await this.base.storage.exists(target)) ||
            (await this.base.db.mediaAsset.findUnique({
              where: { pathKey: pathKey(target) },
            })))
        )
          throw new Error("Конфликт имени: " + newName);
        if (targets.has(pathKey(target)))
          throw new Error("Одинаковые имена внутри batch");
        targets.add(pathKey(target));
        if (
          filenameParts(newName).extension !==
          filenameParts(a.storedFilename).extension
        )
          throw new Error("Расширение менять нельзя");
        if (
          checksum(await this.base.storage.read(a.storagePath)) !==
          a.checksumSha256
        )
          throw new Error("Оригинал изменился вне приложения");
      } catch (e) {
        error = (e as Error).message;
      }
      rows.push({
        id: a.id,
        oldName: a.storedFilename,
        newName,
        source: a.storagePath,
        target,
        checksum: a.checksumSha256,
        error,
      });
    }
    return { rows, token: fingerprint(rows) };
  }
  preview(ids: string[], options: NamingOptions) {
    return this.base.locked(() => this.plan(ids, options));
  }
  apply(ids: string[], options: NamingOptions, token: string) {
    return this.base.locked(async () => {
      const p = await this.plan(ids, options);
      if (p.rows.some((r) => r.error))
        throw new Error(
          "Переименование не начато: " +
            p.rows
              .filter((r) => r.error)
              .map((r) => r.oldName + ": " + r.error)
              .join("; "),
        );
      if (token !== p.token)
        throw new Error("Preview устарел, проверьте новые имена повторно");
      const log = await this.base.db.auditLog.create({
        data: {
          action: "BATCH_RENAME_PENDING",
          entityType: "RenameBatch",
          entityId: randomUUID(),
          details: JSON.stringify(p),
        },
      });
      try {
        for (const r of p.rows)
          if (r.source !== r.target)
            await this.base.storage.move(r.source, r.target);
        await this.base.db.$transaction(
          async (tx) => {
            for (const r of p.rows)
              await tx.mediaAsset.update({
                where: { id: r.id },
                data: {
                  storedFilename: r.newName,
                  storagePath: r.target,
                  pathKey: pathKey(r.target),
                },
              });
            await tx.auditLog.update({
              where: { id: log.id },
              data: { action: "BATCH_RENAMED" },
            });
          },
          { timeout: 60000 },
        );
      } catch (e) {
        try {
          await rollback(this.base.db, this.base.storage, log.id, p.rows);
        } catch (undo) {
          throw new Error(
            "Переименование не завершено; журнал требует восстановления. " +
              (undo as Error).message,
          );
        }
        throw new Error(
          "Переименование отменено, исходные имена восстановлены. " +
            (e as Error).message,
        );
      }
      return { count: p.rows.length };
    });
  }
}
