import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { allowRequest } from "@/lib/clip/rate-limit";
import { purgeExpiredFiles } from "@/lib/files/cleanup";
import {
  FILE_LIST_LIMIT,
  FILE_MAX_SIZE,
  FILE_RATE_LIMIT_GUEST,
  FILE_RATE_LIMIT_USER,
  FILE_TTL_HOURS,
  fileExpiry,
  sanitizeFileName,
  type SharedFilePayload,
} from "@/lib/files/constants";
import {
  ensureStorageDir,
  finalizeUpload,
  removeStored,
  storagePath,
} from "@/lib/files/storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT_LABEL = `${FILE_MAX_SIZE / 1024 / 1024}MB`;

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function serialize(file: {
  id: string;
  name: string;
  size: number;
  mimeType: string | null;
  createdAt: Date;
  expiresAt: Date;
}): SharedFilePayload {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    createdAt: file.createdAt.toISOString(),
    expiresAt: file.expiresAt.toISOString(),
    downloadUrl: `/api/files/${file.id}`,
  };
}

export async function GET() {
  try {
    const [files] = await Promise.all([
      prisma.sharedFile.findMany({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: FILE_LIST_LIMIT,
      }),
      // 惰性清理，配合进程内定时任务双保险
      purgeExpiredFiles().catch(() => undefined),
    ]);

    return NextResponse.json({
      files: files.map(serialize),
      maxSize: FILE_MAX_SIZE,
      ttlHours: FILE_TTL_HOURS,
    });
  } catch (error) {
    console.error("[files] 读取列表失败:", error);
    return NextResponse.json({ error: "读取附件列表失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  const limit = user ? FILE_RATE_LIMIT_USER : FILE_RATE_LIMIT_GUEST;

  if (
    !allowRequest(`files:${user?.id ?? clientIp(request)}`, limit, 60 * 60 * 1000)
  ) {
    return NextResponse.json(
      { error: "上传过于频繁，请稍后再试" },
      { status: 429 }
    );
  }

  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > FILE_MAX_SIZE) {
    return NextResponse.json(
      { error: `单个附件不能超过 ${LIMIT_LABEL}` },
      { status: 413 }
    );
  }
  if (!request.body) {
    return NextResponse.json({ error: "缺少文件内容" }, { status: 400 });
  }

  const nameHeader = request.headers.get("x-file-name") ?? "";
  let rawName = nameHeader;
  try {
    rawName = decodeURIComponent(nameHeader);
  } catch {
    rawName = nameHeader;
  }
  const name = sanitizeFileName(rawName);
  if (!name) {
    return NextResponse.json({ error: "缺少文件名" }, { status: 400 });
  }

  const mimeType = (
    request.headers.get("x-file-type") || "application/octet-stream"
  ).slice(0, 120);

  const key = `${randomUUID()}.bin`;
  const tempKey = `${key}.part`;

  await ensureStorageDir();

  // 流式写盘并累计大小，超限立即中断，避免 100MB 缓冲进内存
  let total = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > FILE_MAX_SIZE) {
        callback(new Error("TOO_LARGE"));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(
        request.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>
      ),
      limiter,
      createWriteStream(storagePath(tempKey))
    );
  } catch (error) {
    await removeStored(tempKey);
    if (error instanceof Error && error.message === "TOO_LARGE") {
      return NextResponse.json(
        { error: `单个附件不能超过 ${LIMIT_LABEL}` },
        { status: 413 }
      );
    }
    console.error("[files] 上传写入失败:", error);
    return NextResponse.json({ error: "上传失败，请稍后重试" }, { status: 500 });
  }

  if (total === 0) {
    await removeStored(tempKey);
    return NextResponse.json({ error: "文件内容为空" }, { status: 400 });
  }

  try {
    await finalizeUpload(tempKey, key);
    const record = await prisma.sharedFile.create({
      data: { name, size: total, mimeType, storageKey: key, expiresAt: fileExpiry() },
    });
    return NextResponse.json({ file: serialize(record) }, { status: 201 });
  } catch (error) {
    await removeStored(tempKey);
    await removeStored(key);
    console.error("[files] 保存失败:", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
