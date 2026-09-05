import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { configuration } from "../src/server/config";
import { LocalStorageProvider } from "../src/server/storage/local";
async function main() {
  const config = configuration();
  const storage = new LocalStorageProvider(config.mediaRoot, config.stateRoot);
  await storage.initialize();
  await storage.withLock(async () => {
    const client = new PrismaClient({
      datasources: { db: { url: config.databaseUrl } },
    });
    try {
      await client.$connect();
    } finally {
      await client.$disconnect();
    }
    const result = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { stdio: "inherit", env: process.env },
    );
    if (result.status !== 0)
      throw new Error("Не удалось применить миграции SQLite");
  });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
