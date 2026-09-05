import sharp from "sharp";
import { createHash } from "node:crypto";
import path from "node:path";
import { MAX_IMAGE_BYTES } from "./storage/local";
export const extensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const checksum = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export async function inspectImage(bytes: Buffer, filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (!extensions.has(ext) || !bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new Error("Поддерживаются JPG, JPEG, PNG, WEBP до 50 МБ");
  const pipeline = sharp(bytes, {
    limitInputPixels: 80_000_000,
    failOn: "warning",
    animated: false,
  });
  const meta = await pipeline.metadata();
  const format = ext === ".jpg" || ext === ".jpeg" ? "jpeg" : ext.slice(1);
  if (
    meta.format !== format ||
    !meta.width ||
    !meta.height ||
    (meta.pages || 1) > 1
  )
    throw new Error(
      "Содержимое не соответствует расширению или изображение анимированное",
    );
  // Force a full decode, rather than trusting extension or client MIME type.
  const thumbnail = await pipeline
    .rotate()
    .resize(600, 400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const swapped = meta.orientation && meta.orientation >= 5;
  return {
    extension: ext.slice(1),
    mimeType: "image/" + format,
    width: swapped ? meta.height : meta.width,
    height: swapped ? meta.width : meta.height,
    checksumSha256: checksum(bytes),
    fileSize: bytes.length,
    thumbnail,
  };
}
