import { NextResponse } from "next/server";
import { library } from "@/server/library";
import { localRequest, failure } from "@/server/http";
import { readUpload } from "@/server/multipart";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    localRequest(request);
    const data = await readUpload(request);
    return NextResponse.json(
      await library().ingest(data.folderId, data.files, data.sourceType),
    );
  } catch (error) {
    return failure(error);
  }
}
