import type { MediaAsset } from "@prisma/client";
import type { LibraryService } from "./library";
import { pathKey } from "./storage/local";

export async function scanDuplicate(
  base: LibraryService,
  folderId: string,
  found: { name: string; path: string },
  hash: string,
  indexed?: MediaAsset | null,
) {
  const existing = await base.db.mediaAsset.findFirst({
    where: { checksumSha256: hash },
    orderBy: [{ trashId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  if (!existing || existing.id === indexed?.id) return null;
  let id: string, status: string;
  if (indexed) {
    // Legacy independent assets are reported, never silently merged or replaced.
    id = "asset:" + indexed.id;
    status = (await base.db.auditLog.findFirst({
      where: { action: "LEGACY_DUPLICATE_KEPT", entityId: indexed.id },
    }))
      ? "KEPT"
      : "PENDING";
  } else {
    const previous = await base.db.physicalCopy.findUnique({
      where: { pathKey: pathKey(found.path) },
    });
    const copy = await base.db.physicalCopy.upsert({
      where: { pathKey: pathKey(found.path) },
      create: {
        assetId: existing.id,
        folderId,
        storagePath: found.path,
        pathKey: pathKey(found.path),
        checksumSha256: hash,
      },
      update: {
        assetId: existing.id,
        folderId,
        storagePath: found.path,
        checksumSha256: hash,
        trashId: null,
        status:
          previous?.checksumSha256 === hash && previous.status === "KEPT"
            ? "KEPT"
            : "PENDING",
      },
    });
    id = copy.id;
    status = copy.status;
  }
  return {
    id,
    status,
    filename: found.name,
    storagePath: found.path,
    checksum: hash,
    assetId: existing.id,
    mediaId: existing.mediaId,
    existingFilename: existing.storedFilename,
    existingPath: existing.storagePath,
    folderId: existing.folderId,
    existingTrash: !!existing.trashId,
    legacy: !!indexed,
  };
}
