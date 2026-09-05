import { NextResponse } from "next/server";
import { library } from "@/server/library";
import { localRequest, failure } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    localRequest(request);
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
    return NextResponse.json(
      await library().list(
        params.get("folderId"),
        (params.get("q") || "").slice(0, 200),
        Math.floor(page),
        params.get("sort") || "name",
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
