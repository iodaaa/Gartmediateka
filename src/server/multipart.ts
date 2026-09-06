import busboy from "busboy";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MAX_IMAGE_BYTES } from "./storage/local";

export async function readUpload(request: Request) {
  if (!request.body) throw new Error("Нет файлов");
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data"))
    throw new Error("Ожидается multipart/form-data");
  const parser = busboy({
    headers: { "content-type": type },
    preservePath: true,
    limits: {
      fileSize: MAX_IMAGE_BYTES,
      files: 20,
      fields: 3,
      fieldSize: 500,
      parts: 23,
    },
  });
  const files: { name: string; bytes: Buffer; error?: string }[] = [];
  const fields: Record<string, string> = {};
  let problem = "";
  parser.on("field", (name, value, info) => {
    if (info.valueTruncated) problem = "Поле слишком длинное";
    fields[name] = value;
  });
  parser.on("file", (field, stream, info) => {
    const chunks: Buffer[] = [];
    let fileError: string | undefined;
    if (field !== "files") problem = "Неизвестное поле файла";
    stream.on("limit", () => {
      fileError = "Максимальный размер изображения — 50 МБ";
    });
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () =>
      files.push({
        name: info.filename,
        bytes: fileError ? Buffer.alloc(0) : Buffer.concat(chunks),
        error: fileError,
      }),
    );
  });
  parser.on("filesLimit", () => {
    problem = "Не более 20 изображений за загрузку";
  });
  parser.on("fieldsLimit", () => {
    problem = "Слишком много полей";
  });
  parser.on("partsLimit", () => {
    problem = "Слишком много частей запроса";
  });
  let size = 0;
  const limit = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      callback(
        size > 100 * 1024 * 1024
          ? new Error("Общий размер загрузки превышает 100 МБ")
          : null,
        chunk,
      );
    },
  });
  await pipeline(
    Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
    limit,
    parser,
  );
  if (problem) throw new Error(problem);
  if (!files.length || !fields.folderId)
    throw new Error("Выберите папку и изображения");
  return {
    files,
    folderId: fields.folderId,
    sourceType: fields.sourceType || "UNKNOWN",
  };
}
