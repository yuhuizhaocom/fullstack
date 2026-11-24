import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { publishChat } from "@/lib/chat/bus";
import {
  CHAT_HISTORY_LIMIT,
  CHAT_MAX_LENGTH,
  CHAT_RATE_LIMIT_GUEST,
  CHAT_RATE_LIMIT_USER,
  chatCutoff,
  guestSender,
  type ChatPayload,
} from "@/lib/chat/constants";
import { allowRequest } from "@/lib/clip/rate-limit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function serialize(message: {
  id: string;
  sender: string;
  content: string;
  isGuest: boolean;
  userId: string | null;
  clientId: string | null;
  createdAt: Date;
}): ChatPayload {
  return {
    id: message.id,
    sender: message.sender,
    content: message.content,
    isGuest: message.isGuest,
    userId: message.userId,
    clientId: message.clientId,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { createdAt: { gte: chatCutoff() } },
      orderBy: { createdAt: "desc" },
      take: CHAT_HISTORY_LIMIT,
    });

    return NextResponse.json({ messages: messages.reverse().map(serialize) });
  } catch (error) {
    console.error("[chat] 读取历史失败:", error);
    return NextResponse.json({ error: "读取聊天记录失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const ip = clientIp(request);

  const limit = user ? CHAT_RATE_LIMIT_USER : CHAT_RATE_LIMIT_GUEST;
  if (!allowRequest(`chat:${user?.id ?? ip}`, limit)) {
    return NextResponse.json(
      { error: "发送过于频繁，请稍后再试" },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const rawContent = typeof body?.content === "string" ? body.content : "";
  const content = rawContent.replace(/\r\n/g, "\n").trim();

  if (!content) {
    return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
  }
  if (content.length > CHAT_MAX_LENGTH) {
    return NextResponse.json(
      { error: `消息不能超过 ${CHAT_MAX_LENGTH} 字` },
      { status: 413 }
    );
  }

  const nickname = typeof body?.nickname === "string" ? body.nickname : "";
  const clientId =
    typeof body?.clientId === "string" ? body.clientId.slice(0, 64) : null;

  try {
    const message = await prisma.chatMessage.create({
      data: user
        ? {
            sender: user.name.slice(0, 50),
            content,
            isGuest: false,
            userId: user.id,
          }
        : {
            sender: guestSender(nickname),
            content,
            isGuest: true,
            clientId: clientId || null,
          },
    });

    // 惰性清理过期记录，避免长期堆积
    await prisma.chatMessage.deleteMany({
      where: { createdAt: { lt: chatCutoff() } },
    });

    const payload = serialize(message);
    publishChat(payload);

    return NextResponse.json({ message: payload }, { status: 201 });
  } catch (error) {
    console.error("[chat] 写入失败:", error);
    return NextResponse.json({ error: "发送失败，请稍后重试" }, { status: 500 });
  }
}
