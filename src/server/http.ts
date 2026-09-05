import { NextResponse } from "next/server";
export function localRequest(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
    throw new Error("Доступ разрешён только с этого компьютера");
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== `${url.protocol}//${host}`) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new Error("Межсайтовый запрос отклонён");
}
export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("Ожидается JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Пустой запрос");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new Error("Слишком большой запрос");
    }
    chunks.push(chunk.value);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString());
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Ожидается объект");
  return data;
}
export function textField(data: Record<string, unknown>, key: string) {
  const value = data[key];
  if (typeof value !== "string" || !value || value.length > 200)
    throw new Error("Некорректное поле " + key);
  return value;
}
export function failure(error: unknown) {
  console.error("[GART]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Ошибка операции" },
    { status: 400 },
  );
}
