import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { CLASSES } from "@/lib/game/data";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_PAYLOAD = 200 * 1024;

function isValidSave(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const save = value as Record<string, unknown>;
  if (save.version !== 1) return false;
  if (typeof save.classId !== "string" || !(save.classId in CLASSES)) return false;
  if (typeof save.level !== "number" || save.level < 1 || save.level > 30) {
    return false;
  }
  if (typeof save.name !== "string" || save.name.length > 20) return false;
  return true;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录后可使用云存档" }, { status: 401 });
  }

  try {
    const record = await prisma.gameSave.findUnique({
      where: { userId: user.id },
    });
    return NextResponse.json({
      save: record?.data ?? null,
      updatedAt: record?.updatedAt.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[game-save] 读取失败:", error);
    return NextResponse.json({ error: "读取云存档失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录后可使用云存档" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const save = body?.save;
  if (!isValidSave(save)) {
    return NextResponse.json({ error: "存档数据不合法" }, { status: 400 });
  }
  if (JSON.stringify(save).length > MAX_PAYLOAD) {
    return NextResponse.json({ error: "存档过大" }, { status: 413 });
  }

  try {
    const record = await prisma.gameSave.upsert({
      where: { userId: user.id },
      update: { data: save as Prisma.InputJsonValue },
      create: { userId: user.id, data: save as Prisma.InputJsonValue },
    });
    return NextResponse.json({ updatedAt: record.updatedAt.toISOString() });
  } catch (error) {
    console.error("[game-save] 保存失败:", error);
    return NextResponse.json({ error: "保存云存档失败" }, { status: 500 });
  }
}
