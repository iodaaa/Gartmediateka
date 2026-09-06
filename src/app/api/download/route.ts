import { Readable } from "node:stream";
import { library } from "@/server/library";
import { WorkspaceOperations } from "@/server/workspace-operations";
import { download } from "@/server/downloads";
import { localRequest, failure, jsonBody } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    localRequest(request);
    // A regular browser form streams the download to disk, without a giant client-side Blob.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Нет запроса");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const c = await reader.read();
      if (c.done) break;
      size += c.value.length;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Слишком большое выделение");
      }
      chunks.push(c.value);
    }
    const text = Buffer.concat(chunks).toString();
    const payload = request.headers
      .get("content-type")
      ?.startsWith("application/json")
      ? text
      : new URLSearchParams(text).get("payload") || "{}";
    const body = await jsonBody(
      new Request(request.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      }),
      2 * 1024 * 1024,
    );
    const result = await download(
      new WorkspaceOperations(library()),
      {
        ids: body.ids as string[],
        folderId: body.folderId as string | undefined,
      },
      request.signal,
    );
    return new Response(
      Readable.toWeb(result.stream) as ReadableStream<Uint8Array>,
      {
        headers: {
          "Content-Type": result.mimeType,
          "Content-Disposition": `attachment; filename="GART-download"; filename*=UTF-8''${encodeURIComponent(result.filename).replaceAll("'", "%27")}`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
