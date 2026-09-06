import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { LibraryService } from "../src/server/library";
import { LocalStorageProvider } from "../src/server/storage/local";
import { RenameService } from "../src/server/rename";
import { WorkspaceOperations } from "../src/server/workspace-operations";
import { resolveDuplicate } from "../src/server/duplicates";
import { uploadNames } from "../src/server/upload-naming";
import { defaultNaming, makeName, type NamingOptions } from "../src/lib/naming";
import { checksum } from "../src/server/image";
let root: string,
  state: string,
  db: PrismaClient,
  storage: LocalStorageProvider,
  service: LibraryService;
const photo = (width: number) =>
  sharp({ create: { width, height: 90, channels: 3, background: "#456b59" } })
    .jpeg()
    .toBuffer();
before(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "gart-mvp04-"));
  root = path.join(base, "media");
  state = path.join(base, "state");
  await fs.mkdir(
    path.join(
      root,
      "01_КЛИЕНТСКИЕ_ПРОЕКТЫ",
      "2026",
      "GART-0111_Иванов",
      "01_ОТ_КЛИЕНТА",
    ),
    { recursive: true },
  );
  storage = new LocalStorageProvider(root, state);
  await storage.initialize();
  const url = "file:" + path.join(state, "media.db").replaceAll("\\", "/");
  db = new PrismaClient({ datasources: { db: { url } } });
  await db.$connect();
  await db.$disconnect();
  const r = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  service = new LibraryService(db, storage);
  await service.scan();
  console.log("Isolated MVP04 data:", base);
});
after(async () => {
  await db?.$disconnect();
});
test("original names, collision suffix (2), independent IDs and unchanged originals", async () => {
  const folder = await service.createFolder(
    (await service.list(null)).rootId!,
    "Images",
  );
  const result = await service.ingest(
    folder.id,
    [
      { name: "photo.jpg", bytes: await photo(101) },
      { name: "photo.jpg", bytes: await photo(102) },
    ],
    "GART",
  );
  assert.equal(result.results.filter((r) => r.status === "imported").length, 2);
  const assets = (await service.list(folder.id)).assets;
  assert.deepEqual(assets.map((a) => a.storedFilename).sort(), [
    "photo (2).jpg",
    "photo.jpg",
  ]);
  assert.ok(assets.every((a) => a.originalFilename === "photo.jpg"));
  assert.notEqual(assets[0].id, assets[1].id);
  for (const a of assets)
    assert.equal(checksum(await storage.read(a.storagePath)), a.checksumSha256);
});
test("scan unique, physical duplicate, repeated scan, keep copies and safe Trash/restore", async () => {
  const folder = await service.createFolder(
    (await service.list(null)).rootId!,
    "Manual",
  );
  await fs.writeFile(
    path.join(root, folder.storagePath, "unique.jpg"),
    await photo(103),
  );
  await fs.writeFile(
    path.join(root, folder.storagePath, "copy.jpg"),
    await photo(101),
  );
  const before = await db.mediaAsset.count();
  const first = await service.scan();
  assert.equal(first.imageCount, 1);
  assert.equal(first.duplicateCount, 1);
  assert.equal(await db.mediaAsset.count(), before + 1);
  const again = await service.scan();
  assert.equal(again.imageCount, 0);
  assert.equal(again.duplicateCount, 1);
  assert.equal(await db.physicalCopy.count(), 1);
  const copy = again.duplicates[0];
  assert.ok(copy.mediaId);
  assert.notEqual(copy.storagePath, copy.existingPath);
  await resolveDuplicate(service, copy.id, "keep");
  assert.equal((await service.scan()).duplicates[0].status, "KEPT");
  await resolveDuplicate(service, copy.id, "trash");
  assert.equal(await storage.exists(copy.storagePath), false);
  assert.equal(
    checksum(await storage.read(copy.existingPath)),
    checksum(await photo(101)),
  );
  const entry = await db.trashEntry.findFirstOrThrow({
    where: { entityId: copy.id },
  });
  await new WorkspaceOperations(service).restore(entry.id);
  assert.equal(
    checksum(await storage.read(copy.storagePath)),
    checksum(await photo(101)),
  );
  assert.equal((await service.scan()).duplicateCount, 1);
});
test("single and bulk rename: preview, counters, unavailable context, conflicts and persistence", async () => {
  const folder = await db.folder.findFirstOrThrow({
    where: { name: "Images" },
  });
  const initial = (await service.list(folder.id)).assets;
  const ids = initial.map((a) => a.id);
  const renamer = new RenameService(service);
  const options: NamingOptions = {
    ...defaultNaming,
    mode: "template",
    template: "Кадр_{counter}",
  };
  const preview = await renamer.preview(ids, options);
  assert.deepEqual(
    preview.rows.map((r) => r.newName),
    ["Кадр_001.jpg", "Кадр_002.jpg"],
  );
  assert.ok(await storage.exists(initial[0].storagePath));
  await renamer.apply(ids, options, preview.token);
  const after = (await service.list(folder.id)).assets;
  for (const a of after) {
    const old = initial.find((x) => x.id === a.id)!;
    assert.equal(a.originalFilename, old.originalFilename);
    assert.equal(a.mediaId, old.mediaId);
    assert.equal(a.checksumSha256, old.checksumSha256);
    assert.equal(
      checksum(await storage.read(a.storagePath)),
      old.checksumSha256,
    );
  }
  const conflict = { ...options, template: "Кадр_001" };
  const bad = await renamer.preview([ids[1]], conflict);
  assert.ok(bad.rows[0].error);
  await assert.rejects(
    renamer.apply([ids[1]], conflict, bad.token),
    /не начато/,
  );
  const unavailable = await renamer.preview(ids, {
    ...options,
    template: "{project}_{counter}",
  });
  assert.ok(unavailable.rows.every((r) => r.error?.includes("недоступна")));
  const collision = await renamer.preview(ids, {
    ...options,
    template: "same",
  });
  assert.ok(collision.rows.some((r) => r.error));
  await db.$disconnect();
  assert.equal(
    (
      await new LibraryService(db, new LocalStorageProvider(root, state)).list(
        folder.id,
      )
    ).assets.length,
    2,
  );
});
test("batch rename failure rolls physical files back; database stays unchanged", async () => {
  const folder = await db.folder.findFirstOrThrow({
      where: { name: "Images" },
    }),
    before = (await service.list(folder.id)).assets;
  const badStorage = new Proxy(storage, {
    get(target, key) {
      if (key === "move")
        return async (a: string, b: string) => {
          if (b.endsWith("Failed_002.jpg"))
            throw new Error("Injected disk failure");
          return target.move(a, b);
        };
      const v = Reflect.get(target, key);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  const renamer = new RenameService(new LibraryService(db, badStorage)),
    options: NamingOptions = {
      ...defaultNaming,
      mode: "template",
      template: "Failed_{counter}",
    };
  const p = await renamer.preview(
    before.map((a) => a.id),
    options,
  );
  await assert.rejects(
    renamer.apply(
      before.map((a) => a.id),
      options,
      p.token,
    ),
    /исходные имена восстановлены/,
  );
  for (const a of before) {
    assert.equal(checksum(await storage.read(a.storagePath)), a.checksumSha256);
    assert.equal(
      (await db.mediaAsset.findUniqueOrThrow({ where: { id: a.id } }))
        .storedFilename,
      a.storedFilename,
    );
  }
  assert.equal(
    await db.auditLog.count({ where: { action: "BATCH_RENAME_PENDING" } }),
    0,
  );
});
test("database failure and interrupted rename recover original paths without changing bytes", async () => {
  const folder = await db.folder.findFirstOrThrow({
    where: { name: "Images" },
  });
  const assets = (await service.list(folder.id)).assets;
  const ids = assets.map((a) => a.id);
  const options: NamingOptions = {
    ...defaultNaming,
    mode: "template",
    template: "Recovery_{counter}",
  };
  const brokenDb = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return async () => {
          throw new Error("Injected database failure");
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const renamer = new RenameService(new LibraryService(brokenDb, storage));
  const preview = await renamer.preview(ids, options);
  await assert.rejects(
    renamer.apply(ids, options, preview.token),
    /исходные имена восстановлены/,
  );
  for (const a of assets)
    assert.equal(checksum(await storage.read(a.storagePath)), a.checksumSha256);
  const pending = await db.auditLog.create({
    data: {
      action: "BATCH_RENAME_PENDING",
      entityType: "RenameBatch",
      entityId: "test-interruption",
      details: JSON.stringify(preview),
    },
  });
  await storage.move(preview.rows[0].source, preview.rows[0].target);
  await db.$disconnect();
  await new LibraryService(db, new LocalStorageProvider(root, state)).list(
    folder.id,
  );
  assert.equal(
    (await db.auditLog.findUniqueOrThrow({ where: { id: pending.id } })).action,
    "BATCH_RENAME_ROLLED_BACK",
  );
  for (const a of assets) {
    assert.equal(checksum(await storage.read(a.storagePath)), a.checksumSha256);
    assert.equal(
      (await db.mediaAsset.findUniqueOrThrow({ where: { id: a.id } }))
        .storagePath,
      a.storagePath,
    );
  }
});

test("naming modes, Windows safety, upload recommendation and template retain imported names", async () => {
  const ctx = {
    date: "2026-09-06",
    project: "GART-0111",
    client: "Иванов",
    source: "CLIENT",
    type: "JPG",
  };
  const template: NamingOptions = {
    ...defaultNaming,
    mode: "template",
    template: "{project}_{client}_{counter}",
  };
  assert.equal(
    makeName("IMG_4831.jpg", "IMG_4831.jpg", template, ctx, 2),
    "GART-0111_Иванов_003.jpg",
  );
  assert.equal(
    makeName(
      "фото.jpg",
      "фото.jpg",
      { ...defaultNaming, mode: "prefix", template: "До_" },
      ctx,
      0,
    ),
    "До_фото.jpg",
  );
  assert.equal(
    makeName(
      "фото.jpg",
      "фото.jpg",
      { ...defaultNaming, mode: "suffix", template: "_после" },
      ctx,
      0,
    ),
    "фото_после.jpg",
  );
  assert.equal(
    makeName(
      "фото.jpg",
      "фото.jpg",
      { ...defaultNaming, mode: "replace", find: "фото", replace: "кадр" },
      ctx,
      0,
    ),
    "кадр.jpg",
  );
  assert.equal(
    makeName("фото.jpg", "фото.jpg", { ...template, template: "CON" }, ctx, 0),
    "_CON.jpg",
  );
  assert.equal(
    makeName(
      "фото.jpg",
      "фото.jpg",
      { ...template, template: "А:Б. " },
      ctx,
      0,
    ),
    "А_Б.jpg",
  );
  assert.throws(() =>
    makeName("a.jpg", "a.jpg", { ...template, template: "" }, ctx, 0),
  );
  const folder = await db.folder.findFirstOrThrow({
    where: { name: "01_ОТ_КЛИЕНТА" },
  });
  const suggestion = await service.locked(() =>
    uploadNames(db, storage, folder.id, ["a.jpg", "b.jpg"], "CLIENT", template),
  );
  assert.equal(suggestion.recommended, "client");
  assert.deepEqual(
    suggestion.rows.map((r) => r.newName),
    ["GART-0111_Иванов_001.jpg", "GART-0111_Иванов_002.jpg"],
  );
  await service.ingest(
    folder.id,
    [
      { name: "a.jpg", bytes: await photo(104) },
      { name: "b.jpg", bytes: await photo(105) },
    ],
    "CLIENT",
    template,
  );
  assert.deepEqual(
    (await service.list(folder.id)).assets.map((a) => a.storedFilename),
    suggestion.rows.map((r) => r.newName),
  );
});
test("file and folder moves reject current/descendant destinations and protect conflicts", async () => {
  const ops = new WorkspaceOperations(service),
    rootId = (await service.list(null)).rootId!;
  const dest = await service.createFolder(rootId, "Destination"),
    child = await service.createFolder(dest.id, "Nested");
  await assert.rejects(ops.moveFolder(dest.id, child.id), /потомка/);
  const images = await db.folder.findFirstOrThrow({
      where: { name: "Images" },
    }),
    assets = (await service.list(images.id)).assets;
  await ops.move(
    assets.map((a) => a.id),
    dest.id,
  );
  assert.equal((await service.list(dest.id)).total, 2);
  await fs.writeFile(
    path.join(root, child.storagePath, assets[0].storedFilename),
    "conflict",
  );
  await assert.rejects(ops.move([assets[0].id], child.id), /Конфликт/);
  assert.equal(
    await fs.readFile(
      path.join(root, child.storagePath, assets[0].storedFilename),
      "utf8",
    ),
    "conflict",
  );
});
