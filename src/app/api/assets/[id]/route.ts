import { library } from "@/server/library";
import { localRequest, failure } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    localRequest(request);
    const { id } = await context.params;
    const content = await library().content(
      id,
      new URL(request.url).searchParams.get("thumbnail") === "1",
    );
    return new Response(new Uint8Array(content.bytes), {
      headers: {
        "Content-Type": content.mimeType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
