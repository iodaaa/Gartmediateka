import { NextResponse } from "next/server";
import { library, assetDto } from "@/server/library";
import { WorkspaceOperations } from "@/server/workspace-operations";
import { localRequest, failure, jsonBody, textField } from "@/server/http";
import { projectTemplates } from "@/server/project-templates";
import { RenameService } from "@/server/rename";
import { uploadNames } from "@/server/upload-naming";
import { namingContext } from "@/server/naming-context";
import { namingPresets, type NamingOptions } from "@/lib/naming";
import { resolveDuplicate } from "@/server/duplicates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    localRequest(request);
    const params = new URL(request.url).searchParams;
    const ops = new WorkspaceOperations(library());
    if (params.get("action") === "asset")
      return NextResponse.json(
        await library().locked(async () =>
          assetDto(
            await library().db.mediaAsset.findUniqueOrThrow({
              where: { id: params.get("id") || "", trashId: null },
            }),
          ),
        ),
      );
    if (params.get("action") === "naming")
      return NextResponse.json({
        ...(await library().locked(() =>
          namingContext(
            library().db,
            params.get("folderId") || "",
            params.get("sourceType") || "UNKNOWN",
          ),
        )),
        presets: namingPresets,
      });
    if (params.get("action") === "templates")
      return NextResponse.json(projectTemplates);
    if (params.get("action") === "ids")
      return NextResponse.json(await ops.ids(params.get("folderId") || ""));
    return NextResponse.json(await ops.trashList());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    localRequest(request);
    const data = await jsonBody(request, 2 * 1024 * 1024);
    const ops = new WorkspaceOperations(library());
    const selection = {
      ids: data.ids as string[] | undefined,
      folderId: data.folderId as string | undefined,
    };
    switch (data.action) {
      case "upload-preview":
        return NextResponse.json(
          await library().locked(() =>
            uploadNames(
              library().db,
              library().storage,
              textField(data, "folderId"),
              data.names as string[],
              textField(data, "sourceType"),
              data.naming as NamingOptions,
            ),
          ),
        );
      case "rename-preview":
        return NextResponse.json(
          await new RenameService(library()).preview(
            data.ids as string[],
            data.naming as NamingOptions,
          ),
        );
      case "rename-apply":
        return NextResponse.json(
          await new RenameService(library()).apply(
            data.ids as string[],
            data.naming as NamingOptions,
            textField(data, "token"),
          ),
        );
      case "duplicate-keep":
        return NextResponse.json(
          await resolveDuplicate(library(), textField(data, "id"), "keep"),
        );
      case "duplicate-trash":
        return NextResponse.json(
          await resolveDuplicate(library(), textField(data, "id"), "trash"),
        );
      case "move-folder":
        return NextResponse.json(
          await ops.moveFolder(
            textField(data, "movingFolderId"),
            textField(data, "folderId"),
          ),
        );
      case "trash-preview":
        return NextResponse.json(await ops.previewTrash(selection));
      case "trash":
        return NextResponse.json(
          await ops.trash(selection, textField(data, "token")),
        );
      case "restore":
        return NextResponse.json(await ops.restore(textField(data, "id")));
      case "move":
        return NextResponse.json(
          await ops.move(data.ids as string[], textField(data, "folderId")),
        );
      case "project":
        return NextResponse.json(
          await ops.createProject({
            projectId: textField(data, "projectId"),
            name: textField(data, "name"),
            year: Number(data.year),
            templateId: textField(data, "templateId"),
            description:
              typeof data.description === "string"
                ? data.description
                : undefined,
          }),
        );
      default:
        throw new Error("Неизвестная операция");
    }
  } catch (e) {
    return failure(e);
  }
}
