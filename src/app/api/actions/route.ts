import { NextResponse } from "next/server";
import { library } from "@/server/library";
import { WorkspaceOperations } from "@/server/workspace-operations";
import { localRequest, failure, jsonBody, textField } from "@/server/http";
import { projectTemplates } from "@/server/project-templates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    localRequest(request);
    const params = new URL(request.url).searchParams;
    const ops = new WorkspaceOperations(library());
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
