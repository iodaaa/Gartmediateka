import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { LibraryService } from "../src/server/library";
import { LocalStorageProvider, pathKey } from "../src/server/storage/local";
import { WorkspaceOperations } from "../src/server/workspace-operations";
import { resolveDuplicate } from "../src/server/duplicates";
import { checksum } from "../src/server/image";
import { searchKey } from "../src/lib/search";
let root: string,
  state: string,
  db: PrismaClient,
  service: LibraryService,
  storage: LocalStorageProvider;
const image = (width: number) =>
  sharp({ create: { width, height: 90, channels: 3, background: "#346753" } })
    .jpeg()
    .toBuffer();
before(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "gart-mvp05-"));
  root = path.join(base, "media");
  state = path.join(base, "state");
  await fs.mkdir(root);
  storage = new LocalStorageProvider(root, state);
  await storage.initialize();
  const url = "file:" + path.join(state, "media.db").replaceAll("\\", "/");
  db = new PrismaClient({ datasources: { db: { url } } });
  await db.$connect();
  await db.$disconnect();
  const migration = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" },
  );
  assert.equal(migration.status, 0, migration.stdout + migration.stderr);
  service = new LibraryService(db, storage);
  await service.scan();
  console.log("Isolated MVP05:", base);
});
after(async () => {
  await db?.$disconnect();
});
test("folder contents reuse known children/assets and include unindexed physical files", async () => {
  const rootId = (await service.list(null)).rootId!;
  const empty = await service.createFolder(rootId, "Empty"),
    parent = await service.createFolder(rootId, "Parent"),
    docs = await service.createFolder(rootId, "Docs");
  await service.createFolder(parent.id, "Child");
  await fs.writeFile(path.join(root, docs.storagePath, "note.txt"), "document");
  const result = await service.list(rootId);
  assert.equal(
    result.folders.find((f) => f.id === empty.id)!.hasContents,
    false,
  );
  assert.equal(
    result.folders.find((f) => f.id === parent.id)!.hasContents,
    true,
  );
  assert.equal(result.folders.find((f) => f.id === docs.id)!.hasContents, true);
  const noHeavyRead = new Proxy(storage, {
    get(t, k) {
      if (k === "hasEntries")
        return async (p: string) => {
          assert.notEqual(p, "Parent");
          return t.hasEntries(p);
        };
      const v = Reflect.get(t, k);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  await new LibraryService(db, noHeavyRead).list(rootId);
});
test("Unicode filename search folds Cyrillic case, normalization, whitespace and supports current stored names", async () => {
  const rootId = (await service.list(null)).rootId!;
  const folder = await service.createFolder(rootId, "Search");
  await service.ingest(
    folder.id,
    [
      { name: "Иванов.jpg", bytes: await image(101) },
      { name: "ЙОГА.jpg", bytes: await image(102) },
    ],
    "GART",
  );
  for (const query of ["иванов", "ИВАНОВ", " ИвАнОв "])
    assert.equal((await service.list(folder.id, query)).total, 1);
  assert.equal((await service.list(folder.id, "И\u0306ога")).total, 1);
  assert.equal(searchKey(" И\u0306ВАНОВ "), "йванов");
});
test("Scan hashes renamed external files across restart, reports exact copies and is idempotent", async () => {
  const folder = await service.createFolder(
    (await service.list(null)).rootId!,
    "Manual",
  );
  await db.$disconnect();
  await fs.writeFile(path.join(root, "Manual", "unique.jpg"), await image(103));
  // Content is JPEG despite .png: checksum matching must precede format/name checks.
  await fs.writeFile(
    path.join(root, "Manual", "ДРУГОЕ ИМЯ.png"),
    await image(101),
  );
  service = new LibraryService(db, new LocalStorageProvider(root, state));
  const before = await db.mediaAsset.count(),
    result = await service.scan();
  assert.equal(result.imageCount, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.skipped, 0);
  assert.equal(await db.mediaAsset.count(), before + 1);
  const copy = result.duplicates[0];
  assert.equal(copy.filename, "ДРУГОЕ ИМЯ.png");
  assert.equal(copy.existingFilename, "Иванов.jpg");
  assert.equal(copy.checksum, checksum(await image(101)));
  assert.equal(copy.storagePath, "Manual/ДРУГОЕ ИМЯ.png");
  const again = await service.scan();
  assert.equal(again.imageCount, 0);
  assert.equal(again.duplicates[0].id, copy.id);
  assert.equal(await db.physicalCopy.count(), 1);
  await resolveDuplicate(service, copy.id, "keep");
  assert.equal((await service.scan()).duplicates[0].status, "KEPT");
  assert.equal(
    (await service.list(folder.id)).folders.find((f) => f.id === folder.id)!
      .hasContents,
    true,
  );
});
test("legacy known paths with same SHA are reported without extra asset/copy records; Trash remains restorable", async () => {
  const original = await db.mediaAsset.findFirstOrThrow({
    where: { originalFilename: "Иванов.jpg" },
  });
  const relative = "Manual/legacy.jpg";
  await fs.writeFile(
    path.join(root, relative),
    await storage.read(original.storagePath),
  );
  const folder = await db.folder.findFirstOrThrow({
    where: { storagePath: "Manual" },
  });
  const id = randomUUID();
  await db.mediaAsset.create({
    data: {
      ...original,
      id,
      mediaId: "GART-" + id,
      folderId: folder.id,
      storagePath: relative,
      pathKey: pathKey(relative),
      storedFilename: "legacy.jpg",
      createdAt: new Date("2030-01-01"),
    },
  });
  const before = await db.mediaAsset.count(),
    copies = await db.physicalCopy.count();
  const result = await service.scan();
  const legacy = result.duplicates.find((d) => d.id === "asset:" + id)!;
  assert.ok(legacy?.legacy);
  assert.equal(legacy.assetId, original.id);
  await service.scan();
  assert.equal(await db.mediaAsset.count(), before);
  assert.equal(await db.physicalCopy.count(), copies);
  await resolveDuplicate(service, legacy.id, "keep");
  await resolveDuplicate(service, legacy.id, "trash");
  assert.equal(await storage.exists(relative), false);
  const entry = await db.trashEntry.findFirstOrThrow({
    where: { entityId: id },
  });
  await new WorkspaceOperations(service).restore(entry.id);
  assert.equal(checksum(await storage.read(relative)), original.checksumSha256);
  assert.equal(
    checksum(await storage.read(original.storagePath)),
    original.checksumSha256,
  );
});
test("safe group move, conflict protection, AuditLog and all original checksums", async () => {
  const folder = await db.folder.findFirstOrThrow({
      where: { name: "Search" },
    }),
    dest = await service.createFolder(
      (await service.list(null)).rootId!,
      "Destination",
    );
  const assets = (await service.list(folder.id)).assets;
  const ops = new WorkspaceOperations(service);
  await fs.writeFile(
    path.join(root, "Destination", assets[0].storedFilename),
    "occupied",
  );
  await assert.rejects(ops.move([assets[0].id], dest.id), /Конфликт/);
  assert.equal(
    await fs.readFile(
      path.join(root, "Destination", assets[0].storedFilename),
      "utf8",
    ),
    "occupied",
  );
  const other = await service.createFolder(dest.id, "Free");
  await ops.move(
    assets.map((a) => a.id),
    other.id,
  );
  assert.equal((await service.list(other.id)).total, 2);
  assert.ok(await db.auditLog.count({ where: { entityType: "MediaAsset" } }));
  for (const a of await db.mediaAsset.findMany())
    assert.equal(checksum(await storage.read(a.storagePath)), a.checksumSha256);
});
