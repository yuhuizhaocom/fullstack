import { NextResponse, type NextRequest } from "next/server";

import {
  attack,
  castSkill,
  joinWorld,
  leaveWorld,
  movePlayer,
  recallPlayer,
  touchPlayer,
} from "@/lib/world/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  if (!clientId) {
    return NextResponse.json({ error: "缺少客户端标识" }, { status: 400 });
  }

  const type = body?.type;

  switch (type) {
    case "move": {
      const x = Number(body?.x);
      const y = Number(body?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        movePlayer(clientId, x, y);
      }
      break;
    }
    case "attack":
      attack(clientId);
      break;
    case "skill":
      if (typeof body?.skillId === "string") {
        castSkill(clientId, body.skillId);
      }
      break;
    case "ping":
      touchPlayer(clientId);
      break;
    case "recall":
      recallPlayer(clientId);
      break;
    case "sync": {
      const player = body?.player;
      if (player && typeof player === "object") {
        joinWorld({
          clientId,
          name: typeof player.name === "string" ? player.name : "冒险者",
          classId: player.classId,
          level: Number(player.level) || 1,
          maxHp: Number(player.maxHp) || 100,
          maxMp: Number(player.maxMp) || 0,
          atk: Number(player.atk) || 10,
          def: Number(player.def) || 0,
          crit: Number(player.crit) || 0,
          weapon: typeof player.weapon === "string" ? player.weapon : null,
          armor: typeof player.armor === "string" ? player.armor : null,
        });
      }
      break;
    }
    case "leave":
      leaveWorld(clientId);
      break;
    default:
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
