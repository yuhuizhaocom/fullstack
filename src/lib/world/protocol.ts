import { decode, encode } from "@msgpack/msgpack";

import type { SnapshotDelta } from "./delta";

/** 加入世界时同步到服务端的角色数据（与本地存档一致） */
export type PlayerSyncPayload = {
  name: string;
  classId: string;
  level: number;
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  crit: number;
  cdr: number;
  lifesteal: number;
  weapon: string | null;
  armor: string | null;
  potions: Record<string, number>;
  quests?: Record<string, { progress: number; status: string }>;
  room?: string;
};

export type ClientMessage =
  | ({ t: "join"; clientId: string; lastEventSeq?: number } & PlayerSyncPayload)
  | { t: "move"; x: number; y: number }
  | { t: "attack" }
  | { t: "skill"; skillId: string; dirX?: number; dirY?: number; targetId?: string; rid?: number }
  | { t: "ping" }
  | { t: "recall" }
  | { t: "potion"; itemId: string }
  | { t: "enter"; dungeonId: string; rid?: number }
  | { t: "exit"; rid?: number }
  | { t: "acceptQuest"; questId: string; rid?: number }
  | { t: "turnInQuest"; questId: string; rid?: number }
  | { t: "sync"; player: PlayerSyncPayload; restoreHp?: boolean }
  | { t: "leave" }
  | { t: "resync" };

export type WorldInfoView = {
  width: number;
  height: number;
  tile: number;
  spawn: { x: number; y: number };
  rooms: {
    id: string;
    name: string;
    icon: string;
    dungeon: boolean;
    unlockLevel: number;
  }[];
  quests: { id: string; title: string }[];
};

export type HelloMessage = {
  t: "hello";
  info: WorldInfoView;
  player: {
    id: string;
    room: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
  };
  eventSeq: number;
};

export type AckMessage = {
  t: "ack";
  rid: number;
  ok: boolean;
  message?: string;
  room?: string;
  x?: number;
  y?: number;
  reward?: {
    exp: number;
    gold: number;
    items?: { itemId: string; count: number }[];
  };
};

export type ServerMessage =
  | HelloMessage
  | SnapshotDelta
  | AckMessage
  | { t: "error"; message: string };

/** msgpack 二进制编码 */
export function encodeMessage(message: unknown): Uint8Array {
  return encode(message);
}

/** msgpack 二进制解码（浏览器 ArrayBuffer / Node Buffer 均可） */
export function decodeMessage(data: ArrayBuffer | Uint8Array): unknown {
  return decode(data instanceof Uint8Array ? data : new Uint8Array(data));
}
