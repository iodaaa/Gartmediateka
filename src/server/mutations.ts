import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import type { StorageProvider } from "./storage/provider";
import { pathKey } from "./storage/local";
import { recoverRenames } from "./rename";

export type MovePlan = {
  kind: "relocate";
  source: string;
  target: string;
  entityType: "Folder" | "MediaAsset" | "PhysicalCopy";
  entityId: string;
  parentId: string;
  trashId: string | null;
  restoreId?: string;
  entry?: Prisma.TrashEntryUncheckedCreateInput;
};
export async function commitMove(
  db: PrismaClient,
  journalId: string,
  op: MovePlan,
) {
  await db.$transaction(
    async (tx) => {
      if (op.entityType === "Folder") {
        const folders = (await tx.folder.findMany()).filter(
          (f) =>
            f.storagePath === op.source ||
            f.storagePath.startsWith(op.source + "/"),
        );
        const assets = (
          await tx.mediaAsset.findMany({
            where: { folderId: { in: folders.map((f) => f.id) } },
          })
        ).filter((a) => a.storagePath.startsWith(op.source + "/"));
        for (const asset of assets) {
          const target = op.target + asset.storagePath.slice(op.source.length);
          await tx.mediaAsset.update({
            where: { id: asset.id },
            data: {
              storagePath: target,
              pathKey: pathKey(target),
              trashId: op.trashId,
            },
          });
        }
        for (const copy of (await tx.physicalCopy.findMany()).filter((c) =>
          c.storagePath.startsWith(op.source + "/"),
        )) {
          const target = op.target + copy.storagePath.slice(op.source.length);
          await tx.physicalCopy.update({
            where: { id: copy.id },
            data: {
              storagePath: target,
              pathKey: pathKey(target),
              trashId: op.trashId,
            },
          });
        }
        for (const folder of folders) {
          const target = op.target + folder.storagePath.slice(op.source.length);
          await tx.folder.update({
            where: { id: folder.id },
            data: {
              storagePath: target,
              pathKey: pathKey(target),
              trashId: op.trashId,
              ...(folder.id === op.entityId ? { parentId: op.parentId } : {}),
            },
          });
        }
      } else if (op.entityType === "PhysicalCopy") {
        await tx.physicalCopy.update({
          where: { id: op.entityId },
          data: {
            storagePath: op.target,
            pathKey: pathKey(op.target),
            folderId: op.parentId,
            trashId: op.trashId,
            status: op.trashId ? "TRASHED" : "PENDING",
          },
        });
      } else {
        await tx.mediaAsset.update({
          where: { id: op.entityId },
          data: {
            storagePath: op.target,
            pathKey: pathKey(op.target),
            folderId: op.parentId,
            trashId: op.trashId,
          },
        });
      }
      if (op.entry) await tx.trashEntry.create({ data: op.entry });
      if (op.restoreId)
        await tx.trashEntry.update({
          where: { id: op.restoreId },
          data: { restoredAt: new Date() },
        });
      await tx.auditLog.update({
        where: { id: journalId },
        data: {
          action: op.restoreId
            ? "TRASH_RESTORED"
            : op.entry
              ? "TRASH_CREATED"
              : "ASSET_MOVED",
        },
      });
    },
    { timeout: 60000 },
  );
}
export async function recoverMutations(
  db: PrismaClient,
  storage: StorageProvider,
) {
  await recoverRenames(db, storage);
  const pending = await db.auditLog.findMany({
    where: { action: "MOVE_PENDING" },
    orderBy: { createdAt: "asc" },
  });
  for (const log of pending) {
    const op = JSON.parse(log.details) as MovePlan;
    const source = await storage.exists(op.source),
      target = await storage.exists(op.target);
    if (source === target)
      throw new Error(
        "Незавершённое перемещение: неоднозначные пути. Ничего не удалено; требуется проверка журнала.",
      );
    if (source)
      await db.auditLog.update({
        where: { id: log.id },
        data: { action: "MOVE_ABORTED" },
      });
    else await commitMove(db, log.id, op);
  }
  // Project metadata is committed only when the complete physical template exists.
  // A crash before that transaction leaves a clearly failed, inspectable journal, never a half Project.
  await db.auditLog.updateMany({
    where: { action: "PROJECT_PENDING" },
    data: { action: "PROJECT_FAILED_INTERRUPTED" },
  });
}
export async function performMove(
  db: PrismaClient,
  storage: StorageProvider,
  op: MovePlan,
) {
  if (await storage.exists(op.target))
    throw new Error("Конфликт: исходный путь занят. Ничего не перезаписано.");
  const log = await db.auditLog.create({
    data: {
      action: "MOVE_PENDING",
      entityType: op.entityType,
      entityId: op.entityId,
      details: JSON.stringify(op),
    },
  });
  try {
    await storage.move(op.source, op.target);
  } catch (error) {
    // The provider may have completed a move before reporting an error. Keep a recoverable journal.
    await recoverMutations(db, storage);
    if (!(await storage.exists(op.target))) throw error;
    return;
  }
  await commitMove(db, log.id, op);
}
export const operationId = () => randomUUID();
