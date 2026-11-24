-- CreateTable
CREATE TABLE "shared_files" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" VARCHAR(120),
    "storageKey" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shared_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shared_files_storageKey_key" ON "shared_files"("storageKey");

-- CreateIndex
CREATE INDEX "shared_files_expiresAt_idx" ON "shared_files"("expiresAt");

-- CreateIndex
CREATE INDEX "shared_files_createdAt_idx" ON "shared_files"("createdAt");
