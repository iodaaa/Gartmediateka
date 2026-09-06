import { fromBuffer } from "yauzl";
export function unzip(bytes: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) =>
    fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error);
        return;
      }
      const files = new Map<string, Buffer>();
      zip.on("error", reject);
      zip.on("end", () => resolve(files));
      zip.on("entry", (entry) => {
        if (entry.fileName.endsWith("/")) {
          files.set(entry.fileName, Buffer.alloc(0));
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            reject(error);
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("error", reject);
          stream.on("end", () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    }),
  );
}
