import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

import { removeStored, storagePath } from "@/lib/files/storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 仅这些位图类型允许内联展示，SVG 等可执行脚本的格式一律强制下载 */
const INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(request: NextRequest, { params }: Params) {
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
  const asInline =
    request.nextUrl.searchParams.get("inline") === "1" &&
    !!file.mimeType &&
    INLINE_IMAGE_TYPES.has(file.mimeType);

  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      // 默认按附件下载；安全位图可通过 ?inline=1 内联展示（剪贴板图片预览）
      "Content-Type": asInline
        ? (file.mimeType as string)
        : "application/octet-stream",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": asInline
        ? `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`
        : contentDisposition(file.name),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
