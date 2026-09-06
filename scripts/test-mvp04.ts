import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import sharp from "sharp";
async function main() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "gart-ui04-")),
    media = path.join(base, "media"),
    state = path.join(base, "state");
  for (const name of [
    "Inbox",
    "Destination/Nested",
    "01_КЛИЕНТСКИЕ_ПРОЕКТЫ/2026/GART-0111_Иванов/01_ОТ_КЛИЕНТА",
  ])
    await fs.mkdir(path.join(media, name), { recursive: true });
  await fs.mkdir(path.join(base, "fixtures"));
  for (let i = 0; i < 6; i++) {
    const bytes = await sharp({
      create: {
        width: i === 1 ? 180 : 320 + i,
        height: i === 1 ? 320 : 200,
        channels: 3,
        background: [
          "#456759",
          "#957344",
          "#343473",
          "#937397",
          "#339283",
          "#239998",
        ][i],
      },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(path.join(base, "fixtures", i + ".jpg"), bytes);
  }
  const env = {
    ...process.env,
    GART_E2E_ROOT: base,
    GART_FOCUSED: "mvp04",
    MEDIA_STORAGE_PATH: media,
    GART_STATE_PATH: state,
    DATABASE_URL: "file:" + path.join(state, "media.db").replaceAll("\\", "/"),
  };
  const r = spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test"],
    { env, stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("Адресные UI-тесты не прошли");
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3100",
    ],
    { env, stdio: "inherit" },
  );
  try {
    let result: {
      indexed: number;
      folders: { id: string; storagePath: string }[];
    } | null = null;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch("http://127.0.0.1:3100/api/library");
        if (r.ok) {
          result = await r.json();
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!result || result.indexed !== 5)
      throw new Error("Изображения не сохранились после перезапуска");
    const folder = result.folders.find(
      (f) => f.storagePath === "Destination/Nested",
    )!;
    const listing = await (
      await fetch("http://127.0.0.1:3100/api/library?folderId=" + folder.id)
    ).json();
    if (
      !listing.assets.some(
        (a: { storedFilename: string }) => a.storedFilename === "Плакат.jpg",
      )
    )
      throw new Error("Переименование не сохранилось");
    console.log(
      "Restart verified: five assets, renamed files retained. Isolated data:",
      base,
    );
  } finally {
    server.kill();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
