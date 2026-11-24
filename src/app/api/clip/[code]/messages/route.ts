import { NextResponse, type NextRequest } from "next/server";

import { publish } from "@/lib/clip/bus";
import {
  CLIP_HISTORY_LIMIT,
  CLIP_IMAGE_URL_PATTERN,
  CLIP_KIND_IMAGE,
  CLIP_KIND_TEXT,
  CLIP_MAX_LENGTH,
  CLIP_RATE_LIMIT,
  clipCutoff,
  isValidChannel,
  normalizeChannel,
  type ClipKind,
} from "@/lib/clip/constants";
import { allowRequest } from "@/lib/clip/rate-limit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { code } = await params;
  const channel = normalizeChannel(code);
  if (!isValidChannel(channel)) {
    return NextResponse.json({ error: "频道码格式不正确" }, { status: 400 });
  }

  try {
    const entries = await prisma.clipEntry.findMany({
      where: { channel, createdAt: { gte: clipCutoff() } },
      orderBy: { createdAt: "desc" },
      take: CLIP_HISTORY_LIMIT,
    });

    return NextResponse.json({
      channel,
      entries: entries.reverse().map((entry) => ({
        ...entry,
        kind: (entry.kind === CLIP_KIND_IMAGE ? CLIP_KIND_IMAGE : CLIP_KIND_TEXT) as ClipKind,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[clip] 读取历史失败:", error);
    return NextResponse.json({ error: "读取历史失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { code } = await params;
  const channel = normalizeChannel(code);
  if (!isValidChannel(channel)) {
    return NextResponse.json({ error: "频道码格式不正确" }, { status: 400 });
  }

  if (!allowRequest(`${clientIp(request)}:${channel}`, CLIP_RATE_LIMIT)) {
    return NextResponse.json(
      { error: "发送过于频繁，请稍后再试" },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : "";
  const clientId =
    typeof body?.clientId === "string" ? body.clientId.slice(0, 64) : "";

  if (!content.trim()) {
    return NextResponse.json({ error: "内容不能为空" }, { status: 400 });
  }
  if (content.length > CLIP_MAX_LENGTH) {
    return NextResponse.json(
      { error: `内容不能超过 ${CLIP_MAX_LENGTH / 1024}KB` },
      { status: 413 }
    );
  }
  if (!clientId) {
    return NextResponse.json({ error: "缺少客户端标识" }, { status: 400 });
  }

  const kind: ClipKind =
    body?.kind === CLIP_KIND_IMAGE ? CLIP_KIND_IMAGE : CLIP_KIND_TEXT;
  if (kind === CLIP_KIND_IMAGE && !CLIP_IMAGE_URL_PATTERN.test(content)) {
    return NextResponse.json({ error: "图片地址无效" }, { status: 400 });
  }

  try {
    const entry = await prisma.clipEntry.create({
      data: { channel, content, clientId, kind },
    });

    // 惰性清理过期记录，避免频道长期堆积
    await prisma.clipEntry.deleteMany({
      where: { channel, createdAt: { lt: clipCutoff() } },
    });

    const payload = {
      id: entry.id,
      channel: entry.channel,
      content: entry.content,
      clientId: entry.clientId,
      kind: (entry.kind === CLIP_KIND_IMAGE ? CLIP_KIND_IMAGE : CLIP_KIND_TEXT) as ClipKind,
      createdAt: entry.createdAt.toISOString(),
    };
    publish(channel, payload);

    return NextResponse.json({ entry: payload }, { status: 201 });
  } catch (error) {
    console.error("[clip] 写入失败:", error);
    return NextResponse.json({ error: "发送失败，请稍后重试" }, { status: 500 });
  }
}
