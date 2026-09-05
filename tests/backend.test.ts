import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { LibraryService } from "../src/server/library";
import {
  LocalStorageProvider,
  pathKey,
  validName,
} from "../src/server/storage/local";
import { checksum, inspectImage } from "../src/server/image";
import { localRequest } from "../src/server/http";

let base: string,
  root: string,
  state: string,
  db: PrismaClient,
  service: LibraryService,
  provider: LocalStorageProvider;
let original: Buffer, second: Buffer, third: Buffer;
const fixture = async (color: string) =>
  sharp({ create: { width: 100, height: 80, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
before(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "gart-mvp02-"));
  root = path.join(base, "media");
  state = path.join(base, "state");
  await fs.mkdir(
    path.join(root, "01_КЛИЕНТСКИЕ_ПРОЕКТЫ", "Существующий проект", "Фото"),
    { recursive: true },
  );
  original = await fixture("#334f48");
  second = await fixture("#d8a72e");
  third = await fixture("#6e71ac");
  await fs.writeFile(
    path.join(
      root,
      "01_КЛИЕНТСКИЕ_ПРОЕКТЫ",
      "Существующий проект",
      "Фото",
      "оригинал.jpg",
    ),
    original,
  );
  await fs.writeFile(
    path.join(root, "не-изображение.txt"),
    "keep this document",
  );
  provider = new LocalStorageProvider(root, state);
  await provider.initialize();
  const url = "file:" + path.join(state, "media.db").replaceAll("\\", "/");
  const initializer = new PrismaClient({ datasources: { db: { url } } });
  await initializer.$connect();
  await initializer.$disconnect();
  const migrate = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" },
  );
  assert.equal(migrate.status, 0, migrate.stderr + migrate.stdout);
  db = new PrismaClient({ datasources: { db: { url } } });
  service = new LibraryService(db, provider);
});
after(async () => {
  await db?.$disconnect();
  console.log("Retained isolated test data:", base);
});

test("SQLite scan preserves original bytes and is idempotent", async () => {
  const first = await service.scan();
  assert.equal(first.folderCount, 4);
  assert.equal(first.imageCount, 1);
  const counts = [await db.folder.count(), await db.mediaAsset.count()];
  const again = await service.scan();
  assert.equal(again.imageCount, 0);
  assert.deepEqual(
    [await db.folder.count(), await db.mediaAsset.count()],
    counts,
  );
  const asset = await db.mediaAsset.findFirstOrThrow();
  assert.equal(asset.checksumSha256, checksum(original));
  assert.equal(asset.width, 100);
  assert.equal(asset.height, 80);
  assert.deepEqual(await provider.read(asset.storagePath), original);
  assert.equal(
    (await sharp(await provider.readThumbnail(asset.thumbnailPath)).metadata())
      .format,
    "webp",
  );
  assert.equal(
    await fs.readFile(path.join(root, "не-изображение.txt"), "utf8"),
    "keep this document",
  );
});
test("physical folder creation, conflict and rejected names leave DB valid", async () => {
  const rootFolder = await db.folder.findUniqueOrThrow({
    where: { pathKey: "" },
  });
  const created = await service.createFolder(rootFolder.id, "Новая папка");
  assert.equal(
    (await fs.stat(path.join(root, created.storagePath))).isDirectory(),
    true,
  );
  const count = await db.folder.count();
  await assert.rejects(service.createFolder(rootFolder.id, "Новая папка"));
  for (const name of [
    "../escape",
    "CON",
    "LPT1.jpg",
    "folder.",
    "x:y",
    "a\\b",
    "a/b",
    " trailing ",
  ])
    await assert.rejects(service.createFolder(rootFolder.id, name));
  assert.equal(await db.folder.count(), count);
});
test("single and batch ingest, same name without overwrite, exact duplicate", async () => {
  const folder = await db.folder.findUniqueOrThrow({
    where: { pathKey: pathKey("Новая папка") },
  });
  const one = await service.ingest(
    folder.id,
    [{ name: "photo.jpg", bytes: second }],
    "GART",
  );
  assert.equal(one.results[0].status, "imported");
  const png = await sharp(third).png().toBuffer(),
    webp = await sharp(second).webp().toBuffer();
  const batch = await service.ingest(
    folder.id,
    [
      { name: "photo.jpg", bytes: third },
      { name: "image.png", bytes: png },
      { name: "image.webp", bytes: webp },
      { name: "duplicate.jpeg", bytes: original },
      { name: "fake.jpg", bytes: Buffer.from("not an image") },
    ],
    "CLIENT",
  );
  assert.deepEqual(
    batch.results.map((r) => r.status),
    ["imported", "imported", "imported", "duplicate", "error"],
  );
  assert.ok(batch.results[3].storagePath?.endsWith("оригинал.jpg"));
  const stored = await db.mediaAsset.findMany({
    where: { folderId: folder.id, originalFilename: "photo.jpg" },
  });
  assert.equal(stored.length, 2);
  assert.notEqual(stored[0].storedFilename, stored[1].storedFilename);
  for (const a of stored)
    assert.equal(
      checksum(await provider.read(a.storagePath)),
      a.checksumSha256,
    );
  assert.equal(
    (await db.ingestBatch.findUniqueOrThrow({ where: { id: batch.batchId } }))
      .fileCount,
    5,
  );
  assert.equal(
    await db.auditLog.count({ where: { action: "DUPLICATE_SKIPPED" } }),
    1,
  );
});
test("concurrent uploads of identical bytes publish exactly one original", async () => {
  const folder = await db.folder.findUniqueOrThrow({ where: { pathKey: "" } });
  const bytes = await fixture("#df55bc");
  const results = await Promise.all([
    service.ingest(folder.id, [{ name: "a.jpg", bytes }], "UNKNOWN"),
    service.ingest(folder.id, [{ name: "b.jpg", bytes }], "UNKNOWN"),
  ]);
  assert.deepEqual(
    results.flatMap((r) => r.results.map((i) => i.status)).sort(),
    ["duplicate", "imported"],
  );
  assert.equal(
    await db.mediaAsset.count({ where: { checksumSha256: checksum(bytes) } }),
    1,
  );
});
test("rename updates descendants, breadcrumbs and media paths, rejects collision/root", async () => {
  const folder = await db.folder.findUniqueOrThrow({
    where: { pathKey: pathKey("01_КЛИЕНТСКИЕ_ПРОЕКТЫ/Существующий проект") },
  });
  const asset = await db.mediaAsset.findFirstOrThrow({
    where: { originalFilename: "оригинал.jpg" },
  });
  await service.renameFolder(folder.id, "Новое имя");
  const updated = await db.mediaAsset.findUniqueOrThrow({
    where: { id: asset.id },
  });
  assert.ok(updated.storagePath.includes("/Новое имя/Фото/"));
  assert.deepEqual(await provider.read(updated.storagePath), original);
  const child = await db.folder.findUniqueOrThrow({
    where: { id: updated.folderId },
  });
  assert.equal(child.parentId, folder.id);
  await assert.rejects(
    service.renameFolder(
      (await db.folder.findUniqueOrThrow({ where: { pathKey: "" } })).id,
      "another-root",
    ),
  );
  await service.createFolder(folder.parentId!, "Занято");
  await assert.rejects(service.renameFolder(folder.id, "Занято"));
  assert.deepEqual(await provider.read(updated.storagePath), original);
});
test("provider blocks escapes, links, original overwrite and mismatched formats", async () => {
  for (const p of [
    "../outside.jpg",
    "/outside.jpg",
    "C:/outside.jpg",
    "x\\..\\outside.jpg",
  ])
    await assert.rejects(provider.read(p));
  const item = await db.mediaAsset.findFirstOrThrow();
  const bytes = await provider.read(item.storagePath);
  await assert.rejects(provider.saveOriginal(item.storagePath, second));
  assert.deepEqual(await provider.read(item.storagePath), bytes);
  await assert.rejects(
    inspectImage(await sharp(original).png().toBuffer(), "mismatch.jpg"),
  );
  assert.throws(() => validName("NUL"));
  const outside = path.join(base, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "outside.jpg"), third);
  await fs.symlink(
    outside,
    path.join(root, "junction"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(provider.read("junction/outside.jpg"));
  const scan = await service.scan();
  assert.ok(scan.warnings.some((w) => w.includes("junction")));
  assert.equal(
    await db.folder.count({ where: { storagePath: "junction" } }),
    0,
  );
});
test("filesystem failure does not create a false Folder row", async () => {
  class FailingStorage extends LocalStorageProvider {
    override async createFolder() {
      throw new Error("Injected disk error");
    }
  }
  const broken = new LibraryService(db, new FailingStorage(root, state));
  const rootFolder = await db.folder.findUniqueOrThrow({
    where: { pathKey: "" },
  });
  await assert.rejects(broken.createFolder(rootFolder.id, "Не создано"));
  assert.equal(await db.folder.count({ where: { name: "Не создано" } }), 0);
  assert.equal(await provider.exists("Не создано"), false);
});
function interruptedService() {
  const proxy = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return async () => {
          throw new Error("Injected database failure");
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new LibraryService(proxy, provider);
}
test("durable journal repairs database failure after physical mkdir", async () => {
  const rootFolder = await db.folder.findUniqueOrThrow({
    where: { pathKey: "" },
  });
  await assert.rejects(
    interruptedService().createFolder(rootFolder.id, "Восстановленная папка"),
  );
  assert.equal(await provider.exists("Восстановленная папка"), true);
  assert.equal(
    await db.folder.count({ where: { name: "Восстановленная папка" } }),
    0,
  );
  await service.list(rootFolder.id);
  assert.equal(
    await db.folder.count({ where: { name: "Восстановленная папка" } }),
    1,
  );
  assert.equal(
    await db.auditLog.count({ where: { action: "OPERATION_PENDING" } }),
    0,
  );
});
test("durable journal repairs rename and ingest after interrupted DB commits", async () => {
  const folder = await db.folder.findUniqueOrThrow({
    where: { pathKey: pathKey("Восстановленная папка") },
  });
  await assert.rejects(
    interruptedService().renameFolder(folder.id, "Восстановленное имя"),
  );
  await service.list(folder.id);
  assert.equal(
    (await db.folder.findUniqueOrThrow({ where: { id: folder.id } })).name,
    "Восстановленное имя",
  );
  const bytes = await fixture("#acdede");
  await assert.rejects(
    interruptedService().ingest(
      folder.id,
      [{ name: "recover.jpg", bytes }],
      "UNKNOWN",
    ),
  );
  await service.list(folder.id);
  const asset = await db.mediaAsset.findFirstOrThrow({
    where: { originalFilename: "recover.jpg" },
  });
  assert.deepEqual(await provider.read(asset.storagePath), bytes);
  assert.equal(
    await db.auditLog.count({ where: { action: "OPERATION_PENDING" } }),
    0,
  );
});
test("new Prisma connection retains catalog after restart", async () => {
  const expected = await db.mediaAsset.count();
  await db.$disconnect();
  db = new PrismaClient({
    datasources: {
      db: { url: "file:" + path.join(state, "media.db").replaceAll("\\", "/") },
    },
  });
  service = new LibraryService(db, new LocalStorageProvider(root, state));
  const result = await service.list(null);
  assert.equal(result.indexed, expected);
  assert.equal((await service.scan()).imageCount, 0);
});
test("local request boundary rejects cross-site writes and DNS rebinding hosts", () => {
  assert.doesNotThrow(() =>
    localRequest(
      new Request("http://localhost:3000/api/scan", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    localRequest(
      new Request("http://127.0.0.1:3000/api/scan", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:3000" },
      }),
    ),
  );
  assert.throws(() =>
    localRequest(
      new Request("http://127.0.0.1:3000/api/scan", {
        headers: { origin: "https://evil.example" },
      }),
    ),
  );
  assert.throws(() =>
    localRequest(new Request("http://evil.example:3000/api/scan")),
  );
});
