import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

import { removeStored, storagePath } from "@/lib/files/storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const file = await prisma.sharedFile.findUnique({ where: { id } });
  if (!file) {
    return new Response("文件不存在或已过期", { status: 404 });
  }

  if (file.expiresAt.getTime() <= Date.now()) {
    await removeStored(file.storageKey);
    await prisma.sharedFile.delete({ where: { id } }).catch(() => undefined);
    return new Response("文件已过期", { status: 410 });
  }

  const path = storagePath(file.storageKey);
  const fileStat = await stat(path).catch(() => null);
  if (!fileStat) {
    await prisma.sharedFile.delete({ where: { id } }).catch(() => undefined);
    return new Response("文件已不存在", { status: 404 });
  }

  const stream = createReadStream(path);

  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      // 统一按附件下载，避免浏览器内联执行 HTML/SVG
      "Content-Type": "application/octet-stream",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": contentDisposition(file.name),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
