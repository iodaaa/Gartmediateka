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
    if (id.startsWith("asset:")) {
      const asset = await base.db.mediaAsset.findUniqueOrThrow({
        where: { id: id.slice(6), trashId: null },
      });
      const original = await base.db.mediaAsset.findFirstOrThrow({
        where: { checksumSha256: asset.checksumSha256 },
        orderBy: [{ trashId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      });
      if (original.id === asset.id)
        throw new Error("Это основной оригинал, повторите Scan");
      for (const item of [asset, original])
        if (
          checksum(await base.storage.read(item.storagePath)) !==
          asset.checksumSha256
        )
          throw new Error(
            "Файл изменился: повторите Scan, ничего не перемещено",
          );
      if (action === "keep") {
        await base.db.auditLog.create({
          data: {
            action: "LEGACY_DUPLICATE_KEPT",
            entityType: "MediaAsset",
            entityId: asset.id,
            details: JSON.stringify({
              storagePath: asset.storagePath,
              originalId: original.id,
              checksum: asset.checksumSha256,
            }),
          },
        });
      } else {
        const trashId = operationId(),
          target = "trash:" + trashId + "/payload";
        await performMove(base.db, base.storage, {
          kind: "relocate",
          source: asset.storagePath,
          target,
          entityType: "MediaAsset",
          entityId: asset.id,
          parentId: asset.folderId,
          trashId,
          entry: {
            id: trashId,
            entityType: "MediaAsset",
            entityId: asset.id,
            name: asset.storedFilename,
            originalPath: asset.storagePath,
            originalParentId: asset.folderId,
            storagePath: target,
            fileCount: 1,
            folderCount: 0,
          },
        });
      }
      return { ok: true };
    }
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
