import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import sharp from "sharp";
async function main() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "gart-e2e-"));
  const media = path.join(base, "media"),
    state = path.join(base, "state");
  await fs.mkdir(path.join(media, "Проекты", "Тестовый проект", "Фото"), {
    recursive: true,
  });
  await fs.mkdir(path.join(base, "fixtures"));
  for (const [index, color] of [
    "#37574d",
    "#af815d",
    "#7b8299",
    "#c5687c",
    "#224466",
    "#886622",
    "#338844",
  ].entries()) {
    const bytes = await sharp({
      create: { width: 320, height: 220, channels: 3, background: color },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(
      path.join(base, "fixtures", `image-${index}.jpg`),
      bytes,
    );
    if (index === 0)
      await fs.writeFile(
        path.join(
          media,
          "Проекты",
          "Тестовый проект",
          "Фото",
          "существующее.jpg",
        ),
        bytes,
      );
  }
  const env = {
    ...process.env,
    GART_E2E_ROOT: base,
    MEDIA_STORAGE_PATH: media,
    GART_STATE_PATH: state,
    DATABASE_URL: "file:" + path.join(state, "media.db").replaceAll("\\", "/"),
  };
  const result = spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test"],
    { env, stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error("Браузерные проверки не прошли");
  // A completely new server process reads the same database after Playwright stopped its server.
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
    let response: { indexed: number } | null = null;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch("http://127.0.0.1:3100/api/library");
        if (r.ok) {
          response = await r.json();
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!response || response.indexed !== 7)
      throw new Error("Каталог не сохранился после перезапуска приложения");
    console.log(
      "Application restart: 7 real images retained in SQLite. Test data:",
      base,
    );
  } finally {
    server.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
