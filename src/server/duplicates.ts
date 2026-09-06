import path from "node:path";
import type { LibraryService } from "./library";
import { checksum } from "./image";
import { performMove, operationId } from "./mutations";
export async function resolveDuplicate(
  base: LibraryService,
  id: string,
  action: "keep" | "trash",
) {
  return base.locked(async () => {
    const copy = await base.db.physicalCopy.findUniqueOrThrow({
      where: { id, trashId: null, status: { in: ["PENDING", "KEPT"] } },
      include: { asset: true },
    });
    if (copy.storagePath === copy.asset.storagePath)
      throw new Error("Нельзя применить действие к основному оригиналу");
    if (
      checksum(await base.storage.read(copy.storagePath)) !==
        copy.checksumSha256 ||
      checksum(await base.storage.read(copy.asset.storagePath)) !==
        copy.checksumSha256
    )
      throw new Error(
        "Файл изменился или оригинал недоступен. Повторите Scan, ничего не перемещено.",
      );
    if (action === "keep") {
      await base.db.$transaction([
        base.db.physicalCopy.update({
          where: { id },
          data: { status: "KEPT" },
        }),
        base.db.auditLog.create({
          data: {
            action: "PHYSICAL_COPY_KEPT",
            entityType: "PhysicalCopy",
            entityId: id,
            details: JSON.stringify({
              storagePath: copy.storagePath,
              assetId: copy.assetId,
              checksum: copy.checksumSha256,
            }),
          },
        }),
      ]);
    } else {
      const trashId = operationId(),
        target = "trash:" + trashId + "/payload";
      await performMove(base.db, base.storage, {
        kind: "relocate",
        source: copy.storagePath,
        target,
        entityType: "PhysicalCopy",
        entityId: copy.id,
        parentId: copy.folderId,
        trashId,
        entry: {
          id: trashId,
          entityType: "PhysicalCopy",
          entityId: copy.id,
          name: path.posix.basename(copy.storagePath),
          originalPath: copy.storagePath,
          originalParentId: copy.folderId,
          storagePath: target,
          fileCount: 1,
          folderCount: 0,
        },
      });
    }
    return { ok: true };
  });
}
