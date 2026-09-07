import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
async function main() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "gart-ui05-")),
    media = path.join(base, "media"),
    state = path.join(base, "state");
  for (const name of [
    "Source/Child",
    "SidebarDest/Nested",
    "Empty",
    "Filled/Sub",
  ])
    await fs.mkdir(path.join(media, name), { recursive: true });
  await fs.mkdir(path.join(base, "fixtures"));
  for (let i = 1; i <= 5; i++) {
    const bytes = await sharp({
      create: {
        width: 160 + i,
        height: 120,
        channels: 3,
        background: i % 2 ? "#527854" : "#7b5f4f",
      },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(path.join(base, "fixtures", i + ".jpg"), bytes);
    if (i <= 3)
      await fs.writeFile(
        path.join(media, "Source", "Иванов_" + i + ".jpg"),
        bytes,
      );
  }
  const result = spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test"],
    {
      env: {
        ...process.env,
        GART_E2E_ROOT: base,
        GART_FOCUSED: "mvp05",
        MEDIA_STORAGE_PATH: media,
        GART_STATE_PATH: state,
        DATABASE_URL:
          "file:" + path.join(state, "media.db").replaceAll("\\", "/"),
      },
      stdio: "inherit",
    },
  );
  console.log("Retained MVP05 UI data:", base);
  if (result.status !== 0) throw new Error("MVP05 UI checks failed");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
