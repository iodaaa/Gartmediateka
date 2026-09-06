import path from "node:path";
import { createHash } from "node:crypto";
import type { LibraryService } from "./library";
import { validName, pathKey } from "./storage/local";
import { operationId, performMove } from "./mutations";
import { projectTemplates } from "./project-templates";

export type Selection = { ids?: string[]; folderId?: string };
export class WorkspaceOperations {
  constructor(readonly base: LibraryService) {}
  get db() {
    return this.base.db;
  }
  get storage() {
    return this.base.storage;
  }
  async activeFolder(id: string) {
    return this.db.folder.findUniqueOrThrow({ where: { id, trashId: null } });
  }
  async selected(ids: string[]) {
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 50000 ||
      ids.some((id) => typeof id !== "string" || id.length > 100)
    )
      throw new Error("Выберите от 1 до 50000 файлов");
    const unique = [...new Set(ids)];
    const assets = await this.db.mediaAsset.findMany({
      where: { id: { in: unique }, trashId: null },
    });
    if (assets.length !== unique.length)
      throw new Error(
        "Выделение устарело: часть файлов отсутствует или в корзине",
      );
    return assets;
  }
  async walk(relative: string) {
    const entries: Awaited<ReturnType<typeof this.storage.list>> = [];
    const visit = async (dir: string) => {
      for (const entry of await this.storage.list(dir)) {
        if (entry.type === "unsupported")
          throw new Error(
            "Папка содержит ссылку или специальный файл: " + entry.path,
          );
        entries.push(entry);
        if (entry.type === "directory") await visit(entry.path);
      }
    };
    await visit(relative);
    return entries;
  }
  async ids(folderId: string) {
    return this.base.locked(async () => {
      await this.activeFolder(folderId);
      return (
        await this.db.mediaAsset.findMany({
          where: { folderId, trashId: null },
          select: { id: true },
        })
      ).map((a) => a.id);
    });
  }
  private async deletionPlan(selection: Selection) {
    if (selection.folderId) {
      const folder = await this.activeFolder(selection.folderId);
      if (!folder.parentId || !folder.storagePath)
        throw new Error("Корень нельзя отправить в корзину");
      const entries = await this.walk(folder.storagePath);
      return {
        name: folder.name,
        folder,
        assets: [],
        fileCount: entries.filter((e) => e.type === "file").length,
        folderCount: entries.filter((e) => e.type === "directory").length,
        fingerprint: [
          folder.id,
          folder.storagePath,
          ...entries.map((e) => [e.path, e.type, e.size, e.modified]),
        ],
      };
    }
    const assets = await this.selected(selection.ids || []);
    for (const a of assets)
      if (!(await this.storage.exists(a.storagePath)))
        throw new Error("Файл отсутствует: " + a.originalFilename);
    return {
      name: "Выбранные файлы",
      folder: null,
      assets,
      fileCount: assets.length,
      folderCount: 0,
      fingerprint: assets.map((a) => [a.id, a.storagePath, a.updatedAt]),
    };
  }
  private token(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
  async previewTrash(selection: Selection) {
    return this.base.locked(async () => {
      const p = await this.deletionPlan(selection);
      return {
        name: p.name,
        fileCount: p.fileCount,
        folderCount: p.folderCount,
        token: this.token(p.fingerprint),
      };
    });
  }
  async trash(selection: Selection, token: string) {
    return this.base.locked(async () => {
      const p = await this.deletionPlan(selection);
      if (this.token(p.fingerprint) !== token)
        throw new Error(
          "Содержимое изменилось. Повторите подтверждение удаления.",
        );
      const results: { id: string; ok: boolean; error?: string }[] = [];
      const objects = p.folder
        ? [
            {
              id: p.folder.id,
              name: p.folder.name,
              storagePath: p.folder.storagePath,
              parentId: p.folder.parentId!,
              entityType: "Folder" as const,
            },
          ]
        : p.assets.map((a) => ({
            id: a.id,
            name: a.originalFilename,
            storagePath: a.storagePath,
            parentId: a.folderId,
            entityType: "MediaAsset" as const,
          }));
      for (const obj of objects) {
        const id = operationId(),
          target = "trash:" + id + "/payload";
        try {
          await performMove(this.db, this.storage, {
            kind: "relocate",
            source: obj.storagePath,
            target,
            entityType: obj.entityType,
            entityId: obj.id,
            parentId: obj.parentId,
            trashId: id,
            entry: {
              id,
              entityId: obj.id,
              entityType: obj.entityType,
              name: obj.name,
              originalPath: obj.storagePath,
              originalParentId: obj.parentId,
              storagePath: target,
              fileCount: p.folder ? p.fileCount : 1,
              folderCount: p.folder ? p.folderCount : 0,
            },
          });
          results.push({ id: obj.id, ok: true });
        } catch (e) {
          results.push({ id: obj.id, ok: false, error: (e as Error).message });
          break;
        }
      }
      return { results };
    });
  }
  async trashList() {
    return this.base.locked(() =>
      this.db.trashEntry.findMany({
        where: { restoredAt: null },
        orderBy: { createdAt: "desc" },
      }),
    );
  }
  async restore(id: string) {
    return this.base.locked(async () => {
      const entry = await this.db.trashEntry.findUniqueOrThrow({
        where: { id, restoredAt: null },
      });
      const parent = await this.db.folder.findUnique({
        where: { id: entry.originalParentId, trashId: null },
      });
      if (!parent || !(await this.storage.exists(parent.storagePath)))
        throw new Error(
          "Исходная папка отсутствует или в корзине. Сначала восстановите её.",
        );
      const target = path.posix.join(
        parent.storagePath,
        path.posix.basename(entry.originalPath),
      );
      if (
        (await this.db.folder.findUnique({
          where: { pathKey: pathKey(target) },
        })) ||
        (await this.db.mediaAsset.findUnique({
          where: { pathKey: pathKey(target) },
        }))
      )
        throw new Error("Конфликт: исходный путь занят в каталоге");
      await performMove(this.db, this.storage, {
        kind: "relocate",
        source: entry.storagePath,
        target,
        entityType: entry.entityType as
          "Folder" | "MediaAsset" | "PhysicalCopy",
        entityId: entry.entityId,
        parentId: parent.id,
        trashId: null,
        restoreId: entry.id,
      });
      return {
        folderId: entry.entityType === "Folder" ? entry.entityId : parent.id,
      };
    });
  }
  async move(ids: string[], folderId: string) {
    return this.base.locked(async () => {
      const folder = await this.activeFolder(folderId),
        assets = await this.selected(ids);
      const plans = assets
        .filter((a) => a.folderId !== folder.id)
        .map((a) => ({
          a,
          target: path.posix.join(folder.storagePath, a.storedFilename),
        }));
      for (const p of plans)
        if (
          (await this.storage.exists(p.target)) ||
          (await this.db.mediaAsset.findUnique({
            where: { pathKey: pathKey(p.target) },
          }))
        )
          throw new Error(
            "Конфликт имён в папке назначения: " + p.a.originalFilename,
          );
      const results = [];
      for (const { a, target } of plans) {
        try {
          await performMove(this.db, this.storage, {
            kind: "relocate",
            source: a.storagePath,
            target,
            entityType: "MediaAsset",
            entityId: a.id,
            parentId: folder.id,
            trashId: null,
          });
          results.push({ id: a.id, ok: true });
        } catch (e) {
          results.push({ id: a.id, ok: false, error: (e as Error).message });
          break;
        }
      }
      return { results };
    });
  }
  async moveFolder(id: string, destinationId: string) {
    return this.base.locked(async () => {
      const folder = await this.activeFolder(id),
        destination = await this.activeFolder(destinationId);
      if (!folder.parentId) throw new Error("Корень нельзя перемещать");
      if (
        id === destinationId ||
        destination.storagePath.startsWith(folder.storagePath + "/")
      )
        throw new Error("Нельзя переместить папку в себя или её потомка");
      if (folder.parentId === destinationId)
        throw new Error("Папка уже находится здесь");
      const target = path.posix.join(destination.storagePath, folder.name);
      await this.storage.validateFilePath(target);
      if (
        await this.db.folder.findUnique({ where: { pathKey: pathKey(target) } })
      )
        throw new Error("Конфликт имени папки");
      for (const e of await this.walk(folder.storagePath))
        await this.storage.validateFilePath(
          target + e.path.slice(folder.storagePath.length),
        );
      await performMove(this.db, this.storage, {
        kind: "relocate",
        source: folder.storagePath,
        target,
        entityType: "Folder",
        entityId: id,
        parentId: destinationId,
        trashId: null,
      });
      return { folderId: id };
    });
  }
  async createProject(input: {
    projectId: string;
    name: string;
    year: number;
    description?: string;
    templateId: string;
  }) {
    if (!/^GART-\d{4,8}$/.test(input.projectId))
      throw new Error("Номер проекта: GART-0264 (4–8 цифр)");
    validName(input.name);
    if (
      !Number.isInteger(input.year) ||
      input.year < 1900 ||
      input.year > 2200 ||
      (input.description?.length || 0) > 4000
    )
      throw new Error("Проверьте год и описание");
    const template = projectTemplates.find((t) => t.id === input.templateId);
    if (!template) throw new Error("Неизвестный шаблон");
    const category = "01_КЛИЕНТСКИЕ_ПРОЕКТЫ",
      yearPath = category + "/" + input.year,
      target = yearPath + "/" + input.projectId + "_" + input.name;
    validName(path.posix.basename(target));
    return this.base.locked(async () => {
      if (
        (await this.db.project.findUnique({
          where: { projectId: input.projectId },
        })) ||
        (await this.storage.exists(target))
      )
        throw new Error("Проект или его папка уже существует");
      const root = await this.db.folder.findFirstOrThrow({
        where: { parentId: null, trashId: null },
      });
      const paths = [
        category,
        yearPath,
        target,
        ...template.folders.map((name) => target + "/" + name),
      ];
      const created: string[] = [];
      const log = await this.db.auditLog.create({
        data: {
          action: "PROJECT_PENDING",
          entityType: "Project",
          entityId: operationId(),
          details: JSON.stringify({ input, target, planned: paths }),
        },
      });
      try {
        for (const relative of paths) {
          if (relative === category || relative === yearPath) {
            if (await this.storage.exists(relative)) {
              await this.storage.list(relative);
              continue;
            }
          }
          await this.storage.createFolder(relative);
          created.push(relative);
        }
        return await this.db.$transaction(
          async (tx) => {
            let projectFolderId = "";
            for (const relative of paths) {
              const parentPath =
                path.posix.dirname(relative) === "."
                  ? ""
                  : path.posix.dirname(relative);
              const parent = parentPath
                ? await tx.folder.findUniqueOrThrow({
                    where: { pathKey: pathKey(parentPath) },
                  })
                : root;
              if (parent.trashId)
                throw new Error("Родительская папка находится в корзине");
              const folder = await tx.folder.upsert({
                where: { pathKey: pathKey(relative) },
                create: {
                  name: path.posix.basename(relative),
                  storagePath: relative,
                  pathKey: pathKey(relative),
                  parentId: parent.id,
                },
                update: {},
              });
              if (relative === target) projectFolderId = folder.id;
            }
            const project = await tx.project.create({
              data: { ...input, folderId: projectFolderId },
            });
            await tx.auditLog.update({
              where: { id: log.id },
              data: {
                action: "PROJECT_CREATED",
                entityId: project.id,
                details: JSON.stringify({ input, target, created }),
              },
            });
            return project;
          },
          { timeout: 60000 },
        );
      } catch (e) {
        await this.db.auditLog.update({
          where: { id: log.id },
          data: {
            action: "PROJECT_FAILED",
            details: JSON.stringify({
              input,
              target,
              planned: paths,
              created,
              error: (e as Error).message,
            }),
          },
        });
        throw new Error(
          "Проект не создан в БД. Операция помечена FAILED; созданные папки сохранены для безопасной проверки: " +
            created.join(", ") +
            ". " +
            (e as Error).message,
        );
      }
    });
  }
}
