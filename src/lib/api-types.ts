export type FolderRecord = {
  id: string;
  name: string;
  parentId: string | null;
  storagePath: string;
  fileCount: number;
  hasContents?: boolean;
};
export type AssetRecord = {
  id: string;
  mediaId: string;
  originalFilename: string;
  storedFilename: string;
  extension: string;
  mimeType: string;
  fileSize: number;
  checksumSha256: string;
  storagePath: string;
  folderId: string;
  sourceType: string;
  fileRole: string;
  width: number;
  height: number;
  createdAt: string;
  thumbnailPath: string;
};
export type LibraryResponse = {
  unindexedFiles?: { name: string; path: string; size: number }[];
  folders: FolderRecord[];
  assets: AssetRecord[];
  total: number;
  page: number;
  rootId: string | null;
  indexed: number;
  capacity: { total: number; available: number };
};
export type UploadResult = {
  filename: string;
  status: "imported" | "duplicate" | "error";
  assetId?: string;
  storagePath?: string;
  message?: string;
};
