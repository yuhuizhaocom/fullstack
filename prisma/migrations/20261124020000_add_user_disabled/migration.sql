-- AlterTable
ALTER TABLE "users" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "users_disabled_idx" ON "users"("disabled");
