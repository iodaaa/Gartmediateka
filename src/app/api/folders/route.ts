import { NextResponse } from "next/server";
import { library } from "@/server/library";
import { localRequest, failure, jsonBody, textField } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    localRequest(request);
    const data = await jsonBody(request);
    return NextResponse.json(
      await library().createFolder(
        textField(data, "parentId"),
        textField(data, "name"),
      ),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    localRequest(request);
    const data = await jsonBody(request);
    return NextResponse.json(
      await library().renameFolder(
        textField(data, "folderId"),
        textField(data, "name"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
