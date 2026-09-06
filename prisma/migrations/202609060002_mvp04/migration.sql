-- CreateTable
CREATE TABLE "PhysicalCopy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "pathKey" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trashId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PhysicalCopy_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalCopy_storagePath_key" ON "PhysicalCopy"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalCopy_pathKey_key" ON "PhysicalCopy"("pathKey");

-- CreateIndex
CREATE INDEX "PhysicalCopy_assetId_idx" ON "PhysicalCopy"("assetId");

-- CreateIndex
CREATE INDEX "PhysicalCopy_folderId_trashId_idx" ON "PhysicalCopy"("folderId", "trashId");
