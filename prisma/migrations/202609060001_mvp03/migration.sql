-- AlterTable
ALTER TABLE "Folder" ADD COLUMN "trashId" TEXT;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN "trashId" TEXT;

-- CreateTable
CREATE TABLE "TrashEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "originalParentId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL,
    "folderCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" DATETIME
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "description" TEXT,
    "templateId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MediaSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "projectId" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MediaSet" ("createdAt", "description", "id", "mediaSetId", "name", "projectId", "type", "updatedAt") SELECT "createdAt", "description", "id", "mediaSetId", "name", "projectId", "type", "updatedAt" FROM "MediaSet";
DROP TABLE "MediaSet";
ALTER TABLE "new_MediaSet" RENAME TO "MediaSet";
CREATE UNIQUE INDEX "MediaSet_mediaSetId_key" ON "MediaSet"("mediaSetId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TrashEntry_restoredAt_createdAt_idx" ON "TrashEntry"("restoredAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectId_key" ON "Project"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_folderId_key" ON "Project"("folderId");

-- CreateIndex
CREATE INDEX "Folder_trashId_idx" ON "Folder"("trashId");

-- CreateIndex
CREATE INDEX "MediaAsset_trashId_idx" ON "MediaAsset"("trashId");
