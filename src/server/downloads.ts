import { PassThrough, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { ZipFile } from "yazl";
import { WorkspaceOperations, type Selection } from "./workspace-operations";

export function download(
  ops: WorkspaceOperations,
  selection: Selection,
  signal?: AbortSignal,
): Promise<{ stream: Readable; filename: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    output.on("error", () => {});
    const opened = new Set<Readable>();
    const cancel = () => {
      output.destroy(new Error("Скачивание отменено"));
      for (const s of opened) s.destroy();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    output.on("close", () => {
      for (const s of opened) s.destroy();
    });
    // Keep the storage lock until consumption/cancellation; moves cannot race a download.
    void ops.base
      .locked(async () => {
        if (signal?.aborted) throw new Error("Скачивание отменено");
        const items: { path: string; name: string; directory?: boolean }[] = [];
        let filename = "GART Media.zip",
          mimeType = "application/zip";
        if (selection.folderId) {
          const folder = await ops.activeFolder(selection.folderId);
          filename = folder.name + ".zip";
          items.push({
            path: folder.storagePath,
            name: folder.name + "/",
            directory: true,
          });
          for (const e of await ops.walk(folder.storagePath))
            items.push({
              path: e.path,
              name:
                folder.name +
                "/" +
                (folder.storagePath
                  ? e.path.slice(folder.storagePath.length + 1)
                  : e.path),
              directory: e.type === "directory",
            });
        } else {
          const assets = await ops.selected(selection.ids || []);
          const names = new Set<string>();
          for (const a of assets) {
            let name = a.originalFilename,
              n = 1;
            while (names.has(name.toLowerCase())) {
              const ext = path.posix.extname(a.originalFilename);
              name =
                a.originalFilename.slice(
                  0,
                  a.originalFilename.length - ext.length,
                ) +
                " (" +
                n++ +
                ")" +
                ext;
            }
            names.add(name.toLowerCase());
            if (!(await ops.storage.exists(a.storagePath)))
              throw new Error("Оригинал отсутствует: " + a.originalFilename);
            items.push({ path: a.storagePath, name });
          }
          if (assets.length === 1) {
            filename = assets[0].originalFilename;
            mimeType = assets[0].mimeType;
          }
        }
        await ops.db.auditLog.create({
          data: {
            action: "DOWNLOAD_STARTED",
            entityType: "Download",
            entityId: "local",
            details: JSON.stringify({ filename, count: items.length }),
          },
        });
        if (!selection.folderId && items.length === 1) {
          const input = await ops.storage.openRead(items[0].path);
          opened.add(input);
          resolve({ stream: output, filename, mimeType });
          await pipeline(input, output);
        } else {
          const zip = new ZipFile();
          zip.on("error", (error) => output.destroy(error));
          for (const item of items) {
            if (item.directory) zip.addEmptyDirectory(item.name);
            else
              zip.addReadStreamLazy(item.name, { compress: false }, (cb) => {
                if (output.destroyed) {
                  cb(new Error("Скачивание отменено"), undefined as never);
                  return;
                }
                void ops.storage.openRead(item.path).then(
                  (input) => {
                    if (output.destroyed) {
                      input.destroy();
                      cb(new Error("Скачивание отменено"), undefined as never);
                      return;
                    }
                    opened.add(input);
                    input.once("close", () => opened.delete(input));
                    cb(null, input);
                  },
                  (error) => cb(error, undefined as never),
                );
              });
          }
          resolve({ stream: output, filename, mimeType });
          const transfer = pipeline(zip.outputStream as Readable, output);
          zip.end();
          await transfer;
        }
      })
      .catch((error) => {
        reject(error);
        output.destroy(error);
      })
      .finally(() => signal?.removeEventListener("abort", cancel));
  });
}
