import type { PrismaClient } from "@prisma/client";
import { namingPresets, type NamingContext } from "../lib/naming";
export async function namingContext(
  db: PrismaClient,
  folderId: string,
  sourceType = "UNKNOWN",
  date = new Date().toISOString().slice(0, 10),
): Promise<{
  context: NamingContext;
  recommended: string;
  folderPath: string;
}> {
  const folder = await db.folder.findUniqueOrThrow({
    where: { id: folderId, trashId: null },
  });
  const projects = await db.project.findMany({ include: { folder: true } });
  const project = projects
    .filter(
      (p) =>
        !p.folder.trashId &&
        (folder.storagePath === p.folder.storagePath ||
          folder.storagePath.startsWith(p.folder.storagePath + "/")),
    )
    .sort(
      (a, b) => b.folder.storagePath.length - a.folder.storagePath.length,
    )[0];
  const match = folder.storagePath.match(
    /^01_КЛИЕНТСКИЕ_ПРОЕКТЫ\/\d{4}\/(GART-\d{4,8})_([^/]+)(?:\/|$)/,
  );
  const context: NamingContext = {
    date,
    source: sourceType === "UNKNOWN" ? undefined : sourceType,
    project: project?.projectId || match?.[1],
    client: project?.name || match?.[2],
  };
  let recommended = "original";
  if (
    context.project &&
    context.client &&
    folder.storagePath.includes("01_ОТ_КЛИЕНТА")
  )
    recommended = "client";
  else if (context.project && folder.storagePath.includes("РЕНДЕР"))
    recommended = "render";
  else if (sourceType === "AI") recommended = "ai";
  if (!namingPresets.some((p) => p.id === recommended))
    recommended = "original";
  return { context, recommended, folderPath: folder.storagePath };
}
