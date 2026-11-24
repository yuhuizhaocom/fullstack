import type { RawData } from "ws";
import { WebSocket, type WebSocketServer } from "ws";

import type { ClassId } from "../lib/game/types";
import { diffSnapshot, type ServerView } from "../lib/world/delta";
import {
  decodeMessage,
  encodeMessage,
  type AckMessage,
  type ClientMessage,
  type HelloMessage,
  type WorldInfoView,
} from "../lib/world/protocol";
import {
  acceptQuest,
  castSkill,
  ensureWorldStarted,
  enterDungeon,
  exitDungeon,
  getSnapshotFor,
  joinWorld,
  leaveWorld,
  movePlayer,
  recallPlayer,
  restorePlayer,
  touchPlayer,
  turnInQuest,
  usePotion,
  world,
  worldInfo,
} from "../lib/world/state";

type Session = {
  clientId: string;
  ws: WebSocket;
  joined: boolean;
  view: ServerView | null;
  frameSeq: number;
  eventSeq: number;
  forceFull: boolean;
  alive: boolean;
};

type ActionResult = {
  ok: boolean;
  message?: string;
  room?: string;
  x?: number;
  y?: number;
  reward?: AckMessage["reward"];
};

const sessions = new Map<WebSocket, Session>();
/** clientId → 连接，避免同一角色多开导致两个会话互相拉扯 */
const clientSockets = new Map<string, WebSocket>();
let timers: { broadcast: ReturnType<typeof setInterval>; heartbeat: ReturnType<typeof setInterval> } | null =
  null;

function send(ws: WebSocket, message: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(encodeMessage(message), { binary: true });
  } catch {
    // 连接已断开，等待 close 事件清理
  }
}

function reply(ws: WebSocket, rid: number | undefined, result: ActionResult): void {
  if (typeof rid !== "number") return;
  const ack: AckMessage = {
    t: "ack",
    rid,
    ok: result.ok,
    message: result.message,
    room: result.room,
    x: result.x,
    y: result.y,
    reward: result.reward,
  };
  send(ws, ack);
}

function rawToBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data as ArrayBuffer);
}

function handleJoin(session: Session, message: Extract<ClientMessage, { t: "join" }>): boolean {
  const clientId = message.clientId;
  if (typeof clientId !== "string" || clientId.length < 8 || clientId.length > 64) {
    send(session.ws, { t: "error", message: "客户端标识不合法" });
    return false;
  }

  const result = joinWorld({
    clientId,
    name: message.name,
    classId: message.classId as ClassId,
    level: message.level,
    maxHp: message.maxHp,
    maxMp: message.maxMp,
    atk: message.atk,
    def: message.def,
    crit: message.crit,
    cdr: message.cdr,
    lifesteal: message.lifesteal,
    weapon: message.weapon,
    armor: message.armor,
    potions: message.potions,
    quests: message.quests,
    room: message.room,
  });

  // 客户端带上已收到的事件序号时只补发缺失事件，避免断线期间丢失奖励
  const lastSeq = Number(message.lastEventSeq);
  session.eventSeq =
    Number.isFinite(lastSeq) && lastSeq > 0
      ? Math.min(lastSeq, result.eventSeq)
      : result.eventSeq;
  session.clientId = clientId;
  session.joined = true;
  session.view = null;
  session.frameSeq = 0;
  session.forceFull = true;

  const previous = clientSockets.get(clientId);
  if (previous && previous !== session.ws) {
    try {
      previous.close();
    } catch {
      // 忽略
    }
  }
  clientSockets.set(clientId, session.ws);

  const hello: HelloMessage = {
    t: "hello",
    info: worldInfo() as WorldInfoView,
    player: result.player,
    eventSeq: session.eventSeq,
  };
  send(session.ws, hello);
  return true;
}

function handleMessage(ws: WebSocket, session: Session, data: RawData): void {
  let message: ClientMessage;
  try {
    message = decodeMessage(rawToBytes(data)) as ClientMessage;
  } catch {
    send(ws, { t: "error", message: "消息格式错误" });
    return;
  }
  if (!message || typeof message.t !== "string") return;

  if (message.t === "join") {
    handleJoin(session, message);
    return;
  }
  if (!session.joined) return;

  touchPlayer(session.clientId);

  switch (message.t) {
    case "move": {
      const x = Number(message.x);
      const y = Number(message.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        movePlayer(session.clientId, x, y);
      }
      break;
    }
    case "attack":
      // 世界内为自动攻击，保留消息用于兼容手动点击
      break;
    case "skill": {
      if (typeof message.skillId !== "string") break;
      const result = castSkill(
        session.clientId,
        message.skillId,
        Number(message.dirX),
        Number(message.dirY),
        typeof message.targetId === "string" ? message.targetId : undefined
      );
      reply(ws, message.rid, result);
      break;
    }
    case "ping":
      break;
    case "recall":
      recallPlayer(session.clientId);
      break;
    case "potion":
      if (typeof message.itemId === "string") {
        usePotion(session.clientId, message.itemId);
      }
      break;
    case "enter":
      if (typeof message.dungeonId === "string") {
        reply(ws, message.rid, enterDungeon(session.clientId, message.dungeonId));
      }
      break;
    case "exit":
      reply(ws, message.rid, exitDungeon(session.clientId));
      break;
    case "acceptQuest":
      if (typeof message.questId === "string") {
        reply(ws, message.rid, acceptQuest(session.clientId, message.questId));
      }
      break;
    case "turnInQuest":
      if (typeof message.questId === "string") {
        reply(ws, message.rid, turnInQuest(session.clientId, message.questId));
      }
      break;
    case "sync": {
      const player = message.player;
      if (player && typeof player === "object") {
        joinWorld({
          clientId: session.clientId,
          name: player.name,
          classId: player.classId as ClassId,
          level: player.level,
          maxHp: player.maxHp,
          maxMp: player.maxMp,
          atk: player.atk,
          def: player.def,
          crit: player.crit,
          cdr: player.cdr,
          lifesteal: player.lifesteal,
          weapon: player.weapon,
          armor: player.armor,
          potions: player.potions,
          quests: player.quests,
          room: player.room,
        });
        if (message.restoreHp === true) restorePlayer(session.clientId);
        session.forceFull = true;
      }
      break;
    }
    case "leave":
      leaveWorld(session.clientId);
      session.joined = false;
      ws.close();
      break;
    case "resync":
      session.forceFull = true;
      break;
    default:
      break;
  }
}

function broadcast(): void {
  for (const [ws, session] of sessions) {
    if (!session.joined || ws.readyState !== WebSocket.OPEN) continue;
    // 弱网背压：积压过多时跳过本帧且不推进基线，下一帧会合并这段时间的变化
    if (ws.bufferedAmount > 256 * 1024) continue;

    if (!world.players.has(session.clientId)) {
      send(ws, { t: "error", message: "会话已过期，正在重新连接" });
      ws.close();
      continue;
    }

    const snapshot = getSnapshotFor(session.clientId);
    const next = diffSnapshot(
      session.forceFull ? null : session.view,
      snapshot,
      session.frameSeq + 1,
      session.eventSeq
    );
    session.view = next.view;
    session.eventSeq = next.eventSeq;
    session.frameSeq += 1;
    session.forceFull = false;
    send(ws, next.delta);
  }
}

/** 把实时世界挂到同一个 HTTP Server 的 WebSocket 上 */
export function attachRealtime(wss: WebSocketServer): void {
  ensureWorldStarted();

  wss.on("connection", (ws: WebSocket) => {
    const session: Session = {
      clientId: "",
      ws,
      joined: false,
      view: null,
      frameSeq: 0,
      eventSeq: 0,
      forceFull: true,
      alive: true,
    };
    sessions.set(ws, session);

    ws.on("message", (data) => {
      session.alive = true;
      handleMessage(ws, session, data as RawData);
    });
    ws.on("pong", () => {
      session.alive = true;
    });
    ws.on("close", () => {
      sessions.delete(ws);
      if (session.clientId && clientSockets.get(session.clientId) === ws) {
        clientSockets.delete(session.clientId);
      }
    });
    ws.on("error", () => {
      sessions.delete(ws);
      ws.terminate();
    });
  });

  if (timers) {
    clearInterval(timers.broadcast);
    clearInterval(timers.heartbeat);
  }
  timers = {
    // 10Hz 增量快照，与原 SSE 广播频率一致
    broadcast: setInterval(broadcast, 100),
    // 20s 心跳：清理半开连接，并保持弱网下的连接活跃
    heartbeat: setInterval(() => {
      for (const [ws, session] of sessions) {
        if (!session.alive) {
          ws.terminate();
          sessions.delete(ws);
          continue;
        }
        session.alive = false;
        if (session.joined) touchPlayer(session.clientId);
        try {
          ws.ping();
        } catch {
          // 忽略
        }
      }
    }, 20_000),
  };
  timers.broadcast.unref?.();
  timers.heartbeat.unref?.();
}

export function detachRealtime(): void {
  if (timers) {
    clearInterval(timers.broadcast);
    clearInterval(timers.heartbeat);
    timers = null;
  }
  for (const ws of sessions.keys()) {
    try {
      ws.close();
    } catch {
      // 忽略
    }
  }
  sessions.clear();
  clientSockets.clear();
}
