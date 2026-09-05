import { NextResponse } from "next/server";
import { library } from "@/server/library";
import { localRequest, failure } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    localRequest(request);
    return NextResponse.json(await library().scan());
  } catch (error) {
    return failure(error);
  }
}
