-- CreateTable
CREATE TABLE "clip_entries" (
    "id" TEXT NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "content" TEXT NOT NULL,
    "clientId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clip_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clip_entries_channel_createdAt_idx" ON "clip_entries"("channel", "createdAt");
