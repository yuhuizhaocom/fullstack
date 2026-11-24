import { NextResponse, type NextRequest } from "next/server";

import { CLASSES } from "@/lib/game/data";
import type { ClassId } from "@/lib/game/types";
import { joinWorld, worldInfo } from "@/lib/world/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  const classId = typeof body?.classId === "string" ? body.classId : "";

  if (!clientId || clientId.length < 8 || clientId.length > 64) {
    return NextResponse.json({ error: "缺少客户端标识" }, { status: 400 });
  }
  if (!(classId in CLASSES)) {
    return NextResponse.json({ error: "职业不合法" }, { status: 400 });
  }

  const result = joinWorld({
    clientId,
    name: typeof body?.name === "string" ? body.name : "冒险者",
    classId: classId as ClassId,
    level: Number(body?.level) || 1,
    maxHp: Number(body?.maxHp) || 100,
    maxMp: Number(body?.maxMp) || 20,
    atk: Number(body?.atk) || 10,
    def: Number(body?.def) || 0,
    crit: Number(body?.crit) || 0,
  });

  return NextResponse.json({
    ...result,
    info: worldInfo(),
  });
}
