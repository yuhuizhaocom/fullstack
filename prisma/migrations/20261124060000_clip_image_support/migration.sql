-- AlterTable
ALTER TABLE "shared_files" ADD COLUMN "scope" VARCHAR(16) NOT NULL DEFAULT 'share';

-- AlterTable
ALTER TABLE "clip_entries" ADD COLUMN "kind" VARCHAR(10) NOT NULL DEFAULT 'TEXT';

-- CreateIndex
CREATE INDEX "shared_files_scope_createdAt_idx" ON "shared_files"("scope", "createdAt");
