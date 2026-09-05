export interface StorageEntry {
  path: string;
  name: string;
  type: "directory" | "file" | "unsupported";
  size: number;
  modified: number;
}
export interface StorageProvider {
  readonly rootName: string;
  initialize(): Promise<void>;
  list(relative: string): Promise<StorageEntry[]>;
  exists(relative: string): Promise<boolean>;
  read(relative: string): Promise<Buffer>;
  createFolder(relative: string): Promise<void>;
  renameFolder(from: string, to: string): Promise<void>;
  saveOriginal(relative: string, bytes: Buffer): Promise<void>;
  saveThumbnail(key: string, bytes: Buffer): Promise<void>;
  readThumbnail(key: string): Promise<Buffer>;
  withLock<T>(work: () => Promise<T>): Promise<T>;
  capacity(): Promise<{ total: number; available: number }>;
}
