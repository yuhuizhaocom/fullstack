import type { RoomId } from "./terrain";
import type { QuestView } from "./quests";
import type { NpcView, PortalView, WorldEvent, WorldSnapshot } from "./state";

export type PlayerView = WorldSnapshot["players"][number];
export type MonsterView = WorldSnapshot["monsters"][number];
export type DropView = WorldSnapshot["drops"][number];

/**
 * 增量快照：只包含本帧变化的实体。
 * - full=1 时客户端清空本地实体缓存后按全量应用
 * - 其余帧按 id 合并，`pd/md/dd/nd/ptd` 为移除列表
 */
export type SnapshotDelta = {
  t: "d";
  /** 每连接单调递增的帧序号，客户端据此判断是否丢帧并请求 resync */
  seq: number;
  full?: 1;
  room: RoomId;
  time: number;
  online?: number;
  players?: PlayerView[];
  pd?: string[];
  monsters?: MonsterView[];
  md?: string[];
  drops?: DropView[];
  dd?: string[];
  npcs?: NpcView[];
  nd?: string[];
  portals?: PortalView[];
  ptd?: string[];
  events?: WorldEvent[];
  self: { room: RoomId; cooldowns: Record<string, number> };
  quests?: QuestView[];
};

/** 服务端为每个连接保存的基线，用于计算下一帧增量 */
export type ServerView = {
  room: RoomId;
  online: number;
  players: Map<string, string>;
  monsters: Map<string, string>;
  drops: Map<string, string>;
  npcs: Map<string, string>;
  portals: Map<string, string>;
  questsSig: string;
  eventSeq: number;
};

type DiffResult<T> = {
  changed: T[];
  removed: string[];
  map: Map<string, string>;
};

function diffEntities<T extends { id: string }>(
  items: T[],
  previous: Map<string, string> | undefined,
  full: boolean
): DiffResult<T> {
  const changed: T[] = [];
  const map = new Map<string, string>();
  for (const item of items) {
    const sig = JSON.stringify(item);
    map.set(item.id, sig);
    if (full || previous?.get(item.id) !== sig) changed.push(item);
  }
  const removed: string[] = [];
  if (previous) {
    for (const id of previous.keys()) {
      if (!map.has(id)) removed.push(id);
    }
  }
  return { changed, removed, map };
}

/**
 * 计算增量帧。传 prev=null 或房间变化时返回全量帧。
 * eventSeq 为该连接已下发到的事件序号，返回新的基线。
 */
export function diffSnapshot(
  prev: ServerView | null,
  snapshot: WorldSnapshot,
  seq: number,
  eventSeq: number
): { delta: SnapshotDelta; view: ServerView; eventSeq: number } {
  const full = !prev || prev.room !== snapshot.room;

  const players = diffEntities(snapshot.players, prev?.players, full);
  const monsters = diffEntities(snapshot.monsters, prev?.monsters, full);
  const drops = diffEntities(snapshot.drops, prev?.drops, full);
  const npcs = diffEntities(snapshot.npcs, prev?.npcs, full);
  const portals = diffEntities(snapshot.portals, prev?.portals, full);

  const events = snapshot.events.filter((event) => event.seq > eventSeq);
  const nextEventSeq =
    events.length > 0 ? events[events.length - 1].seq : eventSeq;

  const questsSig = JSON.stringify(snapshot.self.quests);
  const questsChanged = full || !prev || questsSig !== prev.questsSig;

  const delta: SnapshotDelta = {
    t: "d",
    seq,
    full: full ? 1 : undefined,
    room: snapshot.room,
    time: snapshot.time,
    self: {
      room: snapshot.room,
      cooldowns: snapshot.self.cooldowns,
    },
  };

  if (full || snapshot.online !== prev?.online) {
    delta.online = snapshot.online;
  }
  if (full || players.changed.length > 0) delta.players = players.changed;
  if (!full && players.removed.length > 0) delta.pd = players.removed;
  if (full || monsters.changed.length > 0) delta.monsters = monsters.changed;
  if (!full && monsters.removed.length > 0) delta.md = monsters.removed;
  if (full || drops.changed.length > 0) delta.drops = drops.changed;
  if (!full && drops.removed.length > 0) delta.dd = drops.removed;
  if (full || npcs.changed.length > 0) delta.npcs = npcs.changed;
  if (!full && npcs.removed.length > 0) delta.nd = npcs.removed;
  if (full || portals.changed.length > 0) delta.portals = portals.changed;
  if (!full && portals.removed.length > 0) delta.ptd = portals.removed;
  if (events.length > 0 || full) delta.events = events;
  if (questsChanged) delta.quests = snapshot.self.quests;

  return {
    delta,
    eventSeq: nextEventSeq,
    view: {
      room: snapshot.room,
      online: snapshot.online,
      players: players.map,
      monsters: monsters.map,
      drops: drops.map,
      npcs: npcs.map,
      portals: portals.map,
      questsSig,
      eventSeq: nextEventSeq,
    },
  };
}

/** 客户端维护的实体缓存 */
export type ClientView = {
  room: RoomId;
  online: number;
  players: Map<string, PlayerView>;
  monsters: Map<string, MonsterView>;
  drops: Map<string, DropView>;
  npcs: Map<string, NpcView>;
  portals: Map<string, PortalView>;
  quests: QuestView[];
  cooldowns: Record<string, number>;
};

export function createClientView(): ClientView {
  return {
    room: "world",
    online: 0,
    players: new Map(),
    monsters: new Map(),
    drops: new Map(),
    npcs: new Map(),
    portals: new Map(),
    quests: [],
    cooldowns: {},
  };
}

function mergeEntities<T extends { id: string }>(
  target: Map<string, T>,
  changed: T[] | undefined,
  removed: string[] | undefined
): void {
  if (changed) {
    for (const item of changed) target.set(item.id, item);
  }
  if (removed) {
    for (const id of removed) target.delete(id);
  }
}

/** 应用增量到客户端缓存（原地修改，减少 GC） */
export function applyDelta(view: ClientView, delta: SnapshotDelta): void {
  if (delta.full) {
    view.players.clear();
    view.monsters.clear();
    view.drops.clear();
    view.npcs.clear();
    view.portals.clear();
  }
  view.room = delta.room;
  if (delta.online !== undefined) view.online = delta.online;
  mergeEntities(view.players, delta.players, delta.pd);
  mergeEntities(view.monsters, delta.monsters, delta.md);
  mergeEntities(view.drops, delta.drops, delta.dd);
  mergeEntities(view.npcs, delta.npcs, delta.nd);
  mergeEntities(view.portals, delta.portals, delta.ptd);
  if (delta.quests) view.quests = delta.quests;
  view.cooldowns = delta.self.cooldowns;
}

/** 把增量合并结果还原成现有渲染/交互逻辑可消费的完整快照 */
export function viewToSnapshot(
  view: ClientView,
  events: WorldEvent[],
  time: number
): WorldSnapshot {
  return {
    type: "snapshot",
    time,
    online: view.online,
    room: view.room,
    players: [...view.players.values()],
    monsters: [...view.monsters.values()],
    drops: [...view.drops.values()],
    npcs: [...view.npcs.values()],
    portals: [...view.portals.values()],
    events,
    self: {
      room: view.room,
      quests: view.quests,
      cooldowns: view.cooldowns,
    },
  };
}
