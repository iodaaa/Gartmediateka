import path from "node:path";
import "dotenv/config";

export function isInside(root: string, target: string) {
  const rel = path.relative(root, target);
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
}
export function configuration() {
  const media = process.env.MEDIA_STORAGE_PATH;
  const state = process.env.GART_STATE_PATH;
  if (!media || !state || !path.isAbsolute(media) || !path.isAbsolute(state))
    throw new Error(
      "Укажите абсолютные MEDIA_STORAGE_PATH и GART_STATE_PATH в .env",
    );
  const mediaRoot = path.resolve(media),
    stateRoot = path.resolve(state),
    repo = process.cwd();
  if (
    isInside(repo, mediaRoot) ||
    isInside(mediaRoot, repo) ||
    isInside(repo, stateRoot) ||
    isInside(stateRoot, repo) ||
    isInside(mediaRoot, stateRoot) ||
    isInside(stateRoot, mediaRoot)
  )
    throw new Error(
      "Код, оригиналы и служебные данные должны находиться в отдельных каталогах",
    );
  const databaseUrl =
    "file:" + path.join(stateRoot, "media.db").replaceAll("\\", "/");
  if (process.env.DATABASE_URL !== databaseUrl)
    throw new Error(
      "DATABASE_URL должен указывать на media.db внутри GART_STATE_PATH",
    );
  return { mediaRoot, stateRoot, databaseUrl };
}
