import { PrismaClient, type MediaAsset, type Prisma } from "@prisma/client";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { configuration } from "./config";
import { LocalStorageProvider, pathKey, validName } from "./storage/local";
import type { StorageProvider } from "./storage/provider";
import { extensions, inspectImage, checksum } from "./image";
import type { UploadResult } from "../lib/api-types";

type AssetInput = Omit<Prisma.MediaAssetUncheckedCreateInput, "fileSize"> & {
  fileSize: number;
};
type Journal =
  | { kind: "mkdir"; target: string; parentId: string; name: string }
  | {
      kind: "rename";
      source: string;
      target: string;
      folderId: string;
      name: string;
    }
  | { kind: "ingest"; asset: AssetInput };
export const assetDto = (asset: MediaAsset) => ({
  ...asset,
  fileSize: Number(asset.fileSize),
});
const detail = (value: unknown) => JSON.stringify(value);
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Неизвестная ошибка";

export class LibraryService {
  constructor(
    readonly db: PrismaClient,
    readonly storage: StorageProvider,
  ) {}
  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ) {
    return this.db.auditLog.create({
      data: { action, entityType, entityId, details: detail(details) },
    });
  }
  private async plan(operation: Journal) {
    return this.audit(
      "OPERATION_PENDING",
      "Operation",
      randomUUID(),
      operation,
    );
  }
  private async finishRename(
    tx: Prisma.TransactionClient,
    op: Extract<Journal, { kind: "rename" }>,
  ) {
    const descendants = (await tx.folder.findMany()).filter(
      (f) =>
        f.storagePath === op.source ||
        f.storagePath.startsWith(op.source + "/"),
    );
    const ids = descendants.map((f) => f.id);
    const assets = await tx.mediaAsset.findMany({
      where: { folderId: { in: ids } },
    });
    for (const asset of assets) {
      const target = op.target + asset.storagePath.slice(op.source.length);
      await tx.mediaAsset.update({
        where: { id: asset.id },
        data: { storagePath: target, pathKey: pathKey(target) },
      });
    }
    for (const folder of descendants) {
      const target = op.target + folder.storagePath.slice(op.source.length);
      await tx.folder.update({
        where: { id: folder.id },
        data: {
          storagePath: target,
          pathKey: pathKey(target),
          ...(folder.id === op.folderId ? { name: op.name } : {}),
        },
      });
    }
  }
  private async commitOperation(journalId: string, op: Journal) {
    await this.db.$transaction(
      async (tx) => {
        if (op.kind === "mkdir") {
          await tx.folder.upsert({
            where: { pathKey: pathKey(op.target) },
            create: {
              name: op.name,
              parentId: op.parentId,
              storagePath: op.target,
              pathKey: pathKey(op.target),
            },
            update: {},
          });
        } else if (op.kind === "rename") await this.finishRename(tx, op);
        else
          await tx.mediaAsset.upsert({
            where: { pathKey: pathKey(op.asset.storagePath) },
            create: { ...op.asset, fileSize: BigInt(op.asset.fileSize) },
            update: {},
          });
        await tx.auditLog.update({
          where: { id: journalId },
          data: {
            action:
              op.kind === "mkdir"
                ? "FOLDER_CREATED"
                : op.kind === "rename"
                  ? "FOLDER_RENAMED"
                  : "IMAGE_IMPORTED",
          },
        });
      },
      { timeout: 60000 },
    );
  }
  // Called under an interprocess lock before reads and writes. Never guesses or deletes.
  private async recover() {
    const pending = await this.db.auditLog.findMany({
      where: { action: "OPERATION_PENDING" },
      orderBy: { createdAt: "asc" },
    });
    for (const entry of pending) {
      const op = JSON.parse(entry.details) as Journal;
      const target = op.kind === "ingest" ? op.asset.storagePath : op.target;
      const exists = await this.storage.exists(target);
      if (op.kind === "rename") {
        const sourceExists = await this.storage.exists(op.source);
        if ((sourceExists && exists) || (!sourceExists && !exists))
          throw new Error(
            "Незавершённое переименование: состояние папок неоднозначно. Файлы сохранены; требуется проверка путей в журнале",
          );
        if (sourceExists) {
          await this.db.auditLog.update({
            where: { id: entry.id },
            data: { action: "OPERATION_ABORTED" },
          });
          continue;
        }
      }
      if (!exists) {
        await this.db.auditLog.update({
          where: { id: entry.id },
          data: { action: "OPERATION_ABORTED" },
        });
        continue;
      }
      if (
        op.kind === "ingest" &&
        checksum(await this.storage.read(target)) !== op.asset.checksumSha256
      )
        throw new Error(
          "Файл незавершённой загрузки изменился. Автоматическое восстановление остановлено",
        );
      await this.commitOperation(entry.id, op);
    }
    await this.db.ingestBatch.updateMany({
      where: { status: "PROCESSING" },
      data: { status: "INTERRUPTED" },
    });
  }
  private async locked<T>(work: () => Promise<T>) {
    await this.storage.initialize();
    return this.storage.withLock(async () => {
      await this.recover();
      return work();
    });
  }
  async scan() {
    return this.locked(async () => {
      let folderCount = 0,
        imageCount = 0,
        skipped = 0;
      const warnings: string[] = [];
      const warn = (text: string) => {
        skipped++;
        if (warnings.length < 100) warnings.push(text);
      };
      const visit = async (
        relative: string,
        name: string,
        parentId: string | null,
      ) => {
        const folder = await this.db.folder.upsert({
          where: { pathKey: pathKey(relative) },
          create: {
            storagePath: relative,
            pathKey: pathKey(relative),
            name,
            parentId,
          },
          update: {},
        });
        folderCount++;
        let entries;
        try {
          entries = await this.storage.list(relative);
        } catch (error) {
          warn(relative + ": " + message(error));
          return;
        }
        for (const item of entries) {
          if (item.type === "unsupported") {
            warn(item.path + ": ссылка или специальный файл пропущены");
            continue;
          }
          if (item.type === "directory") {
            await visit(item.path, item.name, folder.id);
            continue;
          }
          if (!extensions.has(path.extname(item.name).toLowerCase())) continue;
          if (
            await this.db.mediaAsset.findUnique({
              where: { pathKey: pathKey(item.path) },
            })
          )
            continue;
          try {
            const info = await inspectImage(
              await this.storage.read(item.path),
              item.name,
            );
            const id = randomUUID();
            const thumbnailPath = id + ".webp";
            await this.storage.saveThumbnail(thumbnailPath, info.thumbnail);
            const { thumbnail: _thumbnail, ...fields } = info;
            void _thumbnail;
            await this.db.$transaction(async (tx) => {
              await tx.mediaAsset.create({
                data: {
                  ...fields,
                  id,
                  mediaId: "GART-" + id,
                  originalFilename: item.name,
                  storedFilename: item.name,
                  storagePath: item.path,
                  pathKey: pathKey(item.path),
                  folderId: folder.id,
                  thumbnailPath,
                  sourceType: "UNKNOWN",
                  fileRole: "ORIGINAL",
                },
              });
              await tx.auditLog.create({
                data: {
                  action: "EXISTING_IMAGE_INDEXED",
                  entityType: "MediaAsset",
                  entityId: id,
                  details: detail({ storagePath: item.path }),
                },
              });
            });
            imageCount++;
          } catch (error) {
            warn(item.path + ": " + message(error));
          }
        }
      };
      await visit("", this.storage.rootName, null);
      const result = { folderCount, imageCount, skipped, warnings };
      await this.audit("SCAN_COMPLETED", "Storage", "root", result);
      return result;
    });
  }
  async list(folderId: string | null, query = "", page = 1, sort = "name") {
    return this.locked(async () => {
      const folders = await this.db.folder.findMany({
        include: { _count: { select: { assets: true } } },
        orderBy: { name: "asc" },
      });
      const root = folders.find((f) => f.parentId === null);
      const target = folderId || root?.id;
      if (target && !folders.some((f) => f.id === target))
        throw new Error("Папка не найдена");
      const where = {
        folderId: target || "__unscanned__",
        ...(query ? { originalFilename: { contains: query } } : {}),
      };
      const [assets, total, indexed, capacity] = await Promise.all([
        this.db.mediaAsset.findMany({
          where,
          take: 60,
          skip: (page - 1) * 60,
          orderBy:
            sort === "date"
              ? [{ createdAt: "desc" }, { id: "asc" }]
              : [{ originalFilename: "asc" }, { id: "asc" }],
        }),
        this.db.mediaAsset.count({ where }),
        this.db.mediaAsset.count(),
        this.storage.capacity(),
      ]);
      return {
        folders: folders.map(({ _count, ...folder }) => ({
          ...folder,
          fileCount: _count.assets,
        })),
        assets: assets.map(assetDto),
        total,
        page,
        rootId: root?.id || null,
        indexed,
        capacity,
      };
    });
  }
  async createFolder(parentId: string, name: string) {
    validName(name);
    return this.locked(async () => {
      const parent = await this.db.folder.findUniqueOrThrow({
        where: { id: parentId },
      });
      const target = parent.storagePath
        ? parent.storagePath + "/" + name
        : name;
      if (
        (await this.storage.exists(target)) ||
        (await this.db.folder.findUnique({
          where: { pathKey: pathKey(target) },
        }))
      )
        throw new Error("Папка с таким именем уже существует");
      const op: Journal = { kind: "mkdir", target, parentId, name };
      const journal = await this.plan(op);
      try {
        await this.storage.createFolder(target);
      } catch (error) {
        await this.db.auditLog.update({
          where: { id: journal.id },
          data: {
            action: "OPERATION_FAILED",
            details: detail({ ...op, error: message(error) }),
          },
        });
        throw error;
      }
      await this.commitOperation(journal.id, op);
      return this.db.folder.findUniqueOrThrow({
        where: { pathKey: pathKey(target) },
      });
    });
  }
  async renameFolder(folderId: string, name: string) {
    validName(name);
    return this.locked(async () => {
      const folder = await this.db.folder.findUniqueOrThrow({
        where: { id: folderId },
      });
      if (!folder.parentId || !folder.storagePath)
        throw new Error("Нельзя переименовать корень хранилища");
      const parent = await this.db.folder.findUniqueOrThrow({
        where: { id: folder.parentId },
      });
      const target = parent.storagePath
        ? parent.storagePath + "/" + name
        : name;
      if (pathKey(target) === pathKey(folder.storagePath))
        throw new Error(
          "Укажите другое имя (изменение только регистра пока не поддерживается)",
        );
      if (
        (await this.storage.exists(target)) ||
        (await this.db.folder.findUnique({
          where: { pathKey: pathKey(target) },
        }))
      )
        throw new Error("Папка с таким именем уже существует");
      const op: Journal = {
        kind: "rename",
        source: folder.storagePath,
        target,
        folderId,
        name,
      };
      const journal = await this.plan(op);
      try {
        await this.storage.renameFolder(op.source, op.target);
      } catch (error) {
        await this.db.auditLog.update({
          where: { id: journal.id },
          data: {
            action: "OPERATION_FAILED",
            details: detail({ ...op, error: message(error) }),
          },
        });
        throw error;
      }
      await this.commitOperation(journal.id, op);
      return this.db.folder.findUniqueOrThrow({ where: { id: folderId } });
    });
  }
  async ingest(
    folderId: string,
    files: { name: string; bytes: Buffer }[],
    sourceType: string,
  ) {
    if (
      !["GART", "CLIENT", "CONTRACTOR", "AI", "EXTERNAL", "UNKNOWN"].includes(
        sourceType,
      )
    )
      throw new Error("Некорректный источник");
    return this.locked(async () => {
      const folder = await this.db.folder.findUniqueOrThrow({
        where: { id: folderId },
      });
      if (!(await this.storage.exists(folder.storagePath)))
        throw new Error("Физическая папка отсутствует");
      const batch = await this.db.ingestBatch.create({
        data: { status: "PROCESSING", fileCount: files.length },
      });
      const results: UploadResult[] = [];
      await this.audit("INGEST_STARTED", "IngestBatch", batch.id, {
        folderId,
        fileCount: files.length,
      });
      for (const file of files) {
        let journalId: string | undefined;
        try {
          validName(file.name);
          const info = await inspectImage(file.bytes, file.name);
          const duplicate = await this.db.mediaAsset.findFirst({
            where: { checksumSha256: info.checksumSha256 },
          });
          if (duplicate) {
            results.push({
              filename: file.name,
              status: "duplicate",
              assetId: duplicate.id,
              storagePath: duplicate.storagePath,
            });
            await this.audit("DUPLICATE_SKIPPED", "IngestBatch", batch.id, {
              filename: file.name,
              existingId: duplicate.id,
              storagePath: duplicate.storagePath,
            });
            continue;
          }
          const id = randomUUID(),
            storedFilename = id + "." + info.extension,
            thumbnailPath = id + ".webp";
          const storagePath = folder.storagePath
            ? folder.storagePath + "/" + storedFilename
            : storedFilename;
          const { thumbnail: _thumbnail, ...fields } = info;
          void _thumbnail;
          const input: AssetInput = {
            ...fields,
            id,
            mediaId: "GART-" + id,
            originalFilename: file.name,
            storedFilename,
            storagePath,
            pathKey: pathKey(storagePath),
            folderId,
            sourceType,
            fileRole: "ORIGINAL",
            ingestBatchId: batch.id,
            thumbnailPath,
          };
          const op: Journal = { kind: "ingest", asset: input };
          const journal = await this.plan(op);
          journalId = journal.id;
          await this.storage.saveThumbnail(thumbnailPath, info.thumbnail);
          await this.storage.saveOriginal(storagePath, file.bytes);
          await this.commitOperation(journal.id, op);
          results.push({
            filename: file.name,
            status: "imported",
            assetId: id,
            storagePath,
          });
        } catch (error) {
          // Resolve a publication/DB boundary before continuing with the next file.
          if (journalId) {
            try {
              await this.recover();
              const saved = await this.db.mediaAsset.findFirst({
                where: {
                  ingestBatchId: batch.id,
                  originalFilename: file.name,
                  checksumSha256: checksum(file.bytes),
                },
              });
              if (saved) {
                results.push({
                  filename: file.name,
                  status: "imported",
                  assetId: saved.id,
                  storagePath: saved.storagePath,
                });
                continue;
              }
            } catch (recoveryError) {
              throw new Error(
                "Операция сохранена в журнале; восстановление требует проверки: " +
                  message(recoveryError),
              );
            }
          }
          results.push({
            filename: file.name,
            status: "error",
            message: message(error),
          });
          await this.audit("INGEST_FILE_FAILED", "IngestBatch", batch.id, {
            filename: file.name,
            error: message(error),
          });
        }
      }
      const imported = results.filter((r) => r.status === "imported").length;
      const errors = results.filter((r) => r.status === "error").length;
      const status = errors ? (imported ? "PARTIAL" : "FAILED") : "COMPLETED";
      await this.db.$transaction([
        this.db.ingestBatch.update({
          where: { id: batch.id },
          data: { status },
        }),
        this.db.auditLog.create({
          data: {
            action: "INGEST_COMPLETED",
            entityType: "IngestBatch",
            entityId: batch.id,
            details: detail({ imported, errors, results }),
          },
        }),
      ]);
      return { batchId: batch.id, status, results };
    });
  }
  async content(id: string, thumbnail: boolean) {
    return this.locked(async () => {
      const asset = await this.db.mediaAsset.findUniqueOrThrow({
        where: { id },
      });
      const bytes = thumbnail
        ? await this.storage.readThumbnail(asset.thumbnailPath)
        : await this.storage.read(asset.storagePath);
      return { bytes, mimeType: thumbnail ? "image/webp" : asset.mimeType };
    });
  }
}

const runtime = globalThis as unknown as { gartLibrary?: LibraryService };
export function library() {
  if (!runtime.gartLibrary) {
    const config = configuration();
    runtime.gartLibrary = new LibraryService(
      new PrismaClient({ datasources: { db: { url: config.databaseUrl } } }),
      new LocalStorageProvider(config.mediaRoot, config.stateRoot),
    );
  }
  return runtime.gartLibrary;
}
