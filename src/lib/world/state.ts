import { CLASS_SKILLS, ITEMS, SKILLS } from "@/lib/game/data";
import type { ClassId } from "@/lib/game/types";

import { QUEST_LIST, QUESTS, questGoal, type QuestStatus, type QuestView } from "./quests";
import {
  clampToWorld,
  isBlockedAt,
  isRoomId,
  nearestOpenPoint,
  NPCS,
  portalsForRoom,
  randomOpenPoint,
  roomSpawn,
  ROOMS,
  TILE,
  WORLD_H,
  WORLD_W,
  type NpcRole,
  type RoomId,
} from "./terrain";

export type WorldPlayer = {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  room: RoomId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  crit: number;
  cdr: number;
  lifesteal: number;
  dir: 1 | -1;
  kills: number;
  deadUntil: number;
  lastSeen: number;
  lastMoveAt: number;
  lastAttack: number;
  lastSkill: number;
  buffUntil: number;
  guardUntil: number;
  skillReady: Record<string, number>;
  quests: Record<string, { progress: number; status: QuestStatus }>;
  lastMpRegen: number;
  invulnerableUntil: number;
  lastSafeRegen: number;
  lastRecall: number;
  lastPotion: number;
  potions: Record<string, number>;
  weapon: string | null;
  armor: string | null;
};

export type WorldMonster = {
  id: string;
  kind: string;
  name: string;
  icon: string;
  room: RoomId;
  boss: boolean;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  exp: number;
  gold: number;
  speed: number;
  aggro: number;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  respawnAt: number;
  respawnDelay: number;
  loot?: string[];
  slowUntil: number;
  lastAttack: number;
  lastAoe: number;
  damage: Map<string, number>;
};

export type WorldDrop = {
  id: string;
  room: RoomId;
  x: number;
  y: number;
  heal: number;
  expiresAt: number;
};

export type WorldEvent = {
  seq: number;
  at: number;
  room: RoomId;
  kind:
    | "damage"
    | "hurt"
    | "kill"
    | "reward"
    | "heal"
    | "skill"
    | "swing"
    | "boss-aoe"
    | "join"
    | "leave"
    | "death"
    | "room"
    | "quest";
  x: number;
  y: number;
  value?: number;
  crit?: boolean;
  text?: string;
  to?: string;
  from?: string;
  monsterId?: string;
  skillId?: string;
  boss?: boolean;
  byName?: string;
  exp?: number;
  gold?: number;
  items?: string[];
  questId?: string;
};

export type NpcView = {
  id: string;
  name: string;
  title: string;
  icon: string;
  color: string;
  role: NpcRole;
  x: number;
  y: number;
  quests: string[];
};

export type PortalView = {
  id: string;
  target: RoomId;
  label: string;
  icon: string;
  x: number;
  y: number;
  unlockLevel: number;
};

export type SelfView = {
  room: RoomId;
  quests: QuestView[];
  cooldowns: Record<string, number>;
};

export type WorldSnapshot = {
  type: "snapshot";
  time: number;
  online: number;
  room: RoomId;
  players: {
    id: string;
    name: string;
    classId: ClassId;
    level: number;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    dir: 1 | -1;
    dead: boolean;
    kills: number;
    weapon: string | null;
    armor: string | null;
  }[];
  monsters: {
    id: string;
    name: string;
    kind: string;
    icon: string;
    boss: boolean;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
  }[];
  drops: { id: string; x: number; y: number; heal: number }[];
  npcs: NpcView[];
  portals: PortalView[];
  events: WorldEvent[];
  self: SelfView;
};

type MonsterDef = {
  kind: string;
  name: string;
  icon: string;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  gold: number;
  speed: number;
  aggro: number;
  boss?: boolean;
  loot?: string[];
};

const MONSTER_DEFS: Record<string, MonsterDef> = {
  slime: { kind: "slime", name: "史莱姆", icon: "🟢", hp: 70, atk: 8, def: 2, exp: 12, gold: 6, speed: 30, aggro: 170 },
  wolf: { kind: "wolf", name: "野狼", icon: "🐺", hp: 120, atk: 12, def: 4, exp: 22, gold: 11, speed: 58, aggro: 230 },
  goblin: { kind: "goblin", name: "哥布林", icon: "👺", hp: 180, atk: 18, def: 7, exp: 34, gold: 16, speed: 50, aggro: 220 },
  skeleton: { kind: "skeleton", name: "骷髅战士", icon: "💀", hp: 260, atk: 26, def: 11, exp: 56, gold: 26, speed: 46, aggro: 240 },
  fire: { kind: "fire", name: "火焰元素", icon: "🔥", hp: 340, atk: 36, def: 14, exp: 82, gold: 38, speed: 62, aggro: 250 },
  demon: { kind: "demon", name: "炎魔", icon: "😈", hp: 460, atk: 46, def: 18, exp: 120, gold: 60, speed: 70, aggro: 270 },
  bat: { kind: "bat", name: "吸血蝠", icon: "🦇", hp: 150, atk: 20, def: 5, exp: 40, gold: 22, speed: 92, aggro: 240 },
  spider: { kind: "spider", name: "毒蛛", icon: "🕷️", hp: 200, atk: 24, def: 8, exp: 48, gold: 26, speed: 60, aggro: 230 },
  golem: { kind: "golem", name: "石魔", icon: "🗿", hp: 320, atk: 30, def: 16, exp: 72, gold: 40, speed: 32, aggro: 210 },
  ghost: { kind: "ghost", name: "幽魂", icon: "👻", hp: 220, atk: 32, def: 8, exp: 60, gold: 34, speed: 55, aggro: 250 },
  gargoyle: { kind: "gargoyle", name: "石像鬼", icon: "🗿", hp: 300, atk: 34, def: 20, exp: 80, gold: 46, speed: 40, aggro: 220 },
  lavabeast: { kind: "lavabeast", name: "熔岩兽", icon: "🌋", hp: 420, atk: 44, def: 22, exp: 110, gold: 60, speed: 45, aggro: 230 },

  wolfking: {
    kind: "wolfking", name: "森林巨狼王", icon: "👑", hp: 2800, atk: 34, def: 16, exp: 800, gold: 500,
    speed: 58, aggro: 380, boss: true, loot: ["doran_blade", "mercury_treads"],
  },
  cavegolem: {
    kind: "cavegolem", name: "洞穴魔像", icon: "👹", hp: 4200, atk: 44, def: 24, exp: 1400, gold: 900,
    speed: 40, aggro: 380, boss: true, loot: ["randuin", "sorc_shoes"],
  },
  guardian: {
    kind: "guardian", name: "遗迹守卫", icon: "🛡️", hp: 6500, atk: 56, def: 30, exp: 2600, gold: 1800,
    speed: 50, aggro: 400, boss: true, loot: ["guardian_angel", "ludens"],
  },
  dragon: {
    kind: "dragon", name: "炎龙", icon: "🐉", hp: 12000, atk: 72, def: 38, exp: 6000, gold: 4000,
    speed: 60, aggro: 440, boss: true, loot: ["deathcap", "infinity_edge", "warmog"],
  },
};

type World = {
  players: Map<string, WorldPlayer>;
  monsters: Map<string, WorldMonster>;
  drops: Map<string, WorldDrop>;
  events: WorldEvent[];
  seq: number;
  started: boolean;
  lastTick: number;
  lastBroadcast: number;
  monsterSeq: number;
  dropSeq: number;
};

const ROOM_IDS: RoomId[] = ["world", "forest", "cave", "ruins", "volcano"];

function createMonster(
  world: World,
  def: MonsterDef,
  room: RoomId,
  point: { x: number; y: number },
  boss = false
): WorldMonster {
  world.monsterSeq += 1;
  return {
    id: `${boss ? "b" : "m"}${world.monsterSeq}`,
    kind: def.kind,
    name: def.name,
    icon: def.icon,
    room,
    boss: !!def.boss || boss,
    hp: def.hp,
    maxHp: def.hp,
    atk: def.atk,
    def: def.def,
    exp: def.exp,
    gold: def.gold,
    speed: def.speed,
    aggro: def.aggro,
    x: point.x,
    y: point.y,
    homeX: point.x,
    homeY: point.y,
    respawnAt: 0,
    respawnDelay: def.boss ? 180_000 : 18_000,
    loot: def.loot,
    slowUntil: 0,
    lastAttack: 0,
    lastAoe: 0,
    damage: new Map(),
  };
}

function chooseKind(cfg: (typeof ROOMS)[RoomId], point: { x: number; y: number }): string {
  const kinds = cfg.monsterKinds;
  if (cfg.id !== "world") {
    return kinds[Math.floor(Math.random() * kinds.length)] ?? kinds[0];
  }
  const spawn = roomSpawn("world");
  const distance = Math.hypot(point.x - spawn.x, point.y - spawn.y);
  const ratio = Math.min(0.999, distance / 4200);
  const index = Math.min(
    kinds.length - 1,
    Math.floor((ratio + Math.random() * 0.3) * kinds.length)
  );
  return kinds[index];
}

function createWorld(): World {
  const world: World = {
    players: new Map(),
    monsters: new Map(),
    drops: new Map(),
    events: [],
    seq: 0,
    started: false,
    lastTick: Date.now(),
    lastBroadcast: 0,
    monsterSeq: 0,
    dropSeq: 0,
  };

  for (const room of ROOM_IDS) {
    const cfg = ROOMS[room];
    const worldSpawn = cfg.dungeon ? roomSpawn(room) : roomSpawn("world");
    for (let i = 0; i < cfg.monsterCount; i += 1) {
      let point = randomOpenPoint(room);
      let guard = 0;
      while (
        room === "world" &&
        Math.hypot(point.x - worldSpawn.x, point.y - worldSpawn.y) < 340 &&
        guard < 25
      ) {
        point = randomOpenPoint(room);
        guard += 1;
      }
      const def = MONSTER_DEFS[chooseKind(cfg, point)] ?? MONSTER_DEFS.slime;
      const monster = createMonster(world, def, room, point);
      world.monsters.set(monster.id, monster);
    }

    if (cfg.bossKind) {
      const def = MONSTER_DEFS[cfg.bossKind];
      if (def) {
        const point = nearestOpenPoint(cfg.bossTx ?? 8, cfg.bossTy ?? 8, room);
        const boss = createMonster(world, def, room, point, true);
        world.monsters.set(boss.id, boss);
      }
    }
  }

  return world;
}

const globalForWorld = globalThis as unknown as { __taskflowWorld?: World };

export const world: World = globalForWorld.__taskflowWorld ?? createWorld();
globalForWorld.__taskflowWorld = world;

function pushEvent(event: Omit<WorldEvent, "seq" | "at">): void {
  world.seq += 1;
  world.events.push({ ...event, seq: world.seq, at: Date.now() });
  if (world.events.length > 160) world.events.shift();
}

export function ensureWorldStarted(): void {
  if (world.started) return;
  world.started = true;
  world.lastTick = Date.now();
  const timer = setInterval(() => {
    try {
      step(Date.now());
    } catch (error) {
      console.error("[world] tick 失败:", error);
    }
  }, 50);
  timer.unref?.();
}

export type JoinQuestInput = Record<string, { progress: number; status: string }>;

export type JoinInput = {
  clientId: string;
  name: string;
  classId: ClassId;
  level: number;
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  crit: number;
  cdr?: number;
  lifesteal?: number;
  weapon?: string | null;
  armor?: string | null;
  potions?: Record<string, number>;
  quests?: JoinQuestInput;
  room?: string;
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeQuests(input?: JoinQuestInput): Record<string, { progress: number; status: QuestStatus }> {
  const result: Record<string, { progress: number; status: QuestStatus }> = {};
  if (!input || typeof input !== "object") return result;
  for (const [id, entry] of Object.entries(input)) {
    const def = QUESTS[id];
    if (!def || !entry) continue;
    const goal = questGoal(def);
    const progress = Math.round(clampNumber(Number(entry.progress), 0, goal));
    let status: QuestStatus = "active";
    if (entry.status === "turnedIn") status = "turnedIn";
    else if (entry.status === "complete" || progress >= goal) status = "complete";
    result[id] = { progress, status };
  }
  return result;
}

export function joinWorld(input: JoinInput) {
  ensureWorldStarted();
  const now = Date.now();

  const name = String(input.name || "冒险者").slice(0, 16);
  const classId: ClassId = input.classId in CLASS_SKILLS ? input.classId : "warrior";
  const level = Math.round(clampNumber(input.level, 1, 30));
  const maxHp = Math.round(clampNumber(input.maxHp, 1, 200000));
  const maxMp = Math.round(clampNumber(input.maxMp, 0, 100000));
  const atk = Math.round(clampNumber(input.atk, 1, 100000));
  const def = Math.round(clampNumber(input.def, 0, 100000));
  const crit = Math.round(clampNumber(input.crit, 0, 100));
  const cdr = Math.round(clampNumber(input.cdr ?? 0, 0, 50));
  const lifesteal = Math.round(clampNumber(input.lifesteal ?? 0, 0, 60));
  const weapon = typeof input.weapon === "string" ? input.weapon.slice(0, 40) : null;
  const armor = typeof input.armor === "string" ? input.armor.slice(0, 40) : null;

  const potions: Record<string, number> = {};
  if (input.potions && typeof input.potions === "object") {
    for (const [id, count] of Object.entries(input.potions)) {
      const item = ITEMS[id];
      if (!item || item.kind !== "consumable") continue;
      const amount = Math.floor(Number(count));
      if (Number.isFinite(amount) && amount > 0 && amount <= 99) {
        potions[id] = amount;
      }
    }
  }

  let player = world.players.get(input.clientId);
  if (!player) {
    const requestedRoom = isRoomId(input.room) ? (input.room as RoomId) : "world";
    const room: RoomId =
      requestedRoom !== "world" &&
      level >= ROOMS[requestedRoom].unlockLevel
        ? requestedRoom
        : "world";
    const spawn = roomSpawn(room);
    const offset = () => (Math.random() - 0.5) * 120;
    player = {
      id: input.clientId,
      name,
      classId,
      level,
      room,
      x: spawn.x + offset(),
      y: spawn.y + offset(),
      hp: maxHp,
      maxHp,
      mp: maxMp,
      maxMp,
      atk,
      def,
      crit,
      cdr,
      lifesteal,
      dir: 1,
      kills: 0,
      deadUntil: 0,
      lastSeen: now,
      lastMoveAt: now,
      lastAttack: 0,
      lastSkill: 0,
      buffUntil: 0,
      guardUntil: 0,
      skillReady: {},
      quests: normalizeQuests(input.quests),
      lastMpRegen: now,
      invulnerableUntil: now + 2000,
      lastSafeRegen: 0,
      lastRecall: 0,
      lastPotion: 0,
      potions,
      weapon,
      armor,
    };
    world.players.set(player.id, player);
    pushEvent({ kind: "join", room: player.room, x: player.x, y: player.y, text: player.name });
  } else {
    Object.assign(player, {
      name,
      classId,
      level,
      maxHp,
      maxMp,
      atk,
      def,
      crit,
      cdr,
      lifesteal,
      weapon,
      armor,
      potions,
      lastSeen: now,
    });
    // 服务器已有任务进度时以服务器为准，否则从存档恢复
    if (Object.keys(player.quests).length === 0 && input.quests) {
      player.quests = normalizeQuests(input.quests);
    }
    player.hp = Math.min(player.hp, player.maxHp);
    player.mp = Math.min(player.mp, player.maxMp);
  }

  return {
    player: {
      id: player.id,
      room: player.room,
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      mp: player.mp,
      maxMp: player.maxMp,
    },
    eventSeq: world.seq,
  };
}

export function leaveWorld(clientId: string): void {
  const player = world.players.get(clientId);
  if (!player) return;
  world.players.delete(clientId);
  pushEvent({ kind: "leave", room: player.room, x: player.x, y: player.y, text: player.name });
}

export function touchPlayer(clientId: string): void {
  const player = world.players.get(clientId);
  if (player) player.lastSeen = Date.now();
}

/** 回城：离开副本并回到开放世界出生点，20 秒冷却 */
export function recallPlayer(clientId: string): void {
  const player = world.players.get(clientId);
  if (!player || player.deadUntil) return;
  const now = Date.now();
  if (now - player.lastRecall < 20_000) return;
  player.lastRecall = now;
  player.room = "world";
  const spawn = roomSpawn("world");
  player.x = spawn.x;
  player.y = spawn.y;
  player.lastMoveAt = now;
  player.lastSeen = now;
  player.invulnerableUntil = Math.max(player.invulnerableUntil, now + 1500);
  pushEvent({ kind: "room", to: player.id, room: "world", x: player.x, y: player.y, text: "已返回翡翠大陆" });
}

/** 世界内使用背包药水：服务器按物品定义回血/回蓝 */
export function usePotion(clientId: string, itemId: string): void {
  const player = world.players.get(clientId);
  if (!player || player.deadUntil) return;
  const count = player.potions[itemId] ?? 0;
  if (count <= 0) return;
  const now = Date.now();
  if (now - player.lastPotion < 800) return;
  player.lastPotion = now;
  player.potions[itemId] = count - 1;

  const hpBefore = player.hp;
  const mpBefore = player.mp;
  // 药水数值由客户端传入的标准物品表决定，这里使用统一的恢复规则
  const hpGain = itemId.includes("hp") ? (itemId.includes("big") ? 300 : itemId.includes("mid") ? 120 : 40) : 0;
  const mpGain = itemId.includes("mp") ? (itemId.includes("mid") ? 70 : 25) : 0;
  player.hp = Math.min(player.maxHp, player.hp + hpGain);
  player.mp = Math.min(player.maxMp, player.mp + mpGain);
  const healed = Math.round(player.hp - hpBefore);
  const restored = Math.round(player.mp - mpBefore);
  if (healed > 0 || restored > 0) {
    pushEvent({
      kind: "heal",
      to: player.id,
      room: player.room,
      x: player.x,
      y: player.y,
      value: healed > 0 ? healed : restored,
      text: itemId,
    });
  }
}

/** 升级等场景下把生命与魔法回满 */
export function restorePlayer(clientId: string): void {
  const player = world.players.get(clientId);
  if (!player || player.deadUntil) return;
  player.hp = player.maxHp;
  player.mp = player.maxMp;
}

export function movePlayer(clientId: string, x: number, y: number): void {
  const player = world.players.get(clientId);
  if (!player || player.deadUntil > Date.now()) return;
  const now = Date.now();
  const dt = Math.max(0.05, (now - player.lastMoveAt) / 1000);
  const maxDistance = 300 * dt + 50;
  let nextX = x;
  let nextY = y;
  const distance = Math.hypot(nextX - player.x, nextY - player.y);
  if (distance > maxDistance && distance > 0) {
    const ratio = maxDistance / distance;
    nextX = player.x + (nextX - player.x) * ratio;
    nextY = player.y + (nextY - player.y) * ratio;
  }
  const clamped = clampToWorld(nextX, nextY, player.room);
  if (isBlockedAt(clamped.x, clamped.y, 9, player.room)) return;
  const beforeScreenX = player.x - player.y;
  player.x = clamped.x;
  player.y = clamped.y;
  const afterScreenX = player.x - player.y;
  if (Math.abs(afterScreenX - beforeScreenX) > 1) {
    player.dir = afterScreenX > beforeScreenX ? 1 : -1;
  }
  player.lastMoveAt = now;
  player.lastSeen = now;
}

function rollDamage(
  atk: number,
  def: number,
  critChance: number,
  multiplier = 1
): { damage: number; crit: boolean } {
  const crit = Math.random() * 100 < critChance;
  const raw = Math.max(1, atk * multiplier - def * 0.5);
  return {
    damage: Math.max(
      1,
      Math.round(raw * (0.9 + Math.random() * 0.2) * (crit ? 1.6 : 1))
    ),
    crit,
  };
}

function aliveMonstersInRoom(room: RoomId): WorldMonster[] {
  return [...world.monsters.values()].filter(
    (monster) => monster.hp > 0 && monster.room === room
  );
}

function updateQuestProgress(player: WorldPlayer, monster: WorldMonster): void {
  for (const [questId, state] of Object.entries(player.quests)) {
    if (state.status !== "active") continue;
    const def = QUESTS[questId];
    if (!def) continue;
    let increment = 0;
    for (const objective of def.objectives) {
      if (objective.kind === "kill") {
        if (monster.boss) continue;
        if (objective.monsterKind && objective.monsterKind !== monster.kind) continue;
        increment += 1;
      } else if (
        objective.kind === "boss" &&
        monster.boss &&
        monster.room === objective.dungeon
      ) {
        increment += 1;
      }
    }
    if (increment <= 0) continue;
    const goal = questGoal(def);
    state.progress = Math.min(goal, state.progress + increment);
    if (state.progress >= goal) {
      state.status = "complete";
      pushEvent({
        kind: "quest",
        to: player.id,
        room: player.room,
        x: player.x,
        y: player.y,
        text: `任务可交付：${def.title}`,
        questId,
      });
    }
  }
}

function damageMonster(
  monster: WorldMonster,
  player: WorldPlayer,
  damage: number,
  crit: boolean,
  now: number
): void {
  monster.hp = Math.max(0, monster.hp - damage);
  monster.damage.set(player.id, (monster.damage.get(player.id) ?? 0) + damage);
  pushEvent({
    kind: "damage",
    room: monster.room,
    x: monster.x,
    y: monster.y - 20,
    value: damage,
    crit,
    monsterId: monster.id,
    from: player.id,
  });

  if (player.lifesteal > 0) {
    const heal = Math.round((damage * player.lifesteal) / 100);
    if (heal > 0) player.hp = Math.min(player.maxHp, player.hp + heal);
  }

  if (monster.hp > 0) return;

  monster.respawnAt = now + monster.respawnDelay;
  player.kills += 1;
  pushEvent({
    kind: "kill",
    room: monster.room,
    x: monster.x,
    y: monster.y,
    text: monster.name,
    boss: monster.boss,
    byName: player.name,
  });
  pushEvent({
    kind: "reward",
    to: player.id,
    room: monster.room,
    x: monster.x,
    y: monster.y,
    exp: monster.exp,
    gold: monster.gold,
    items: monster.boss ? monster.loot : undefined,
  });

  updateQuestProgress(player, monster);

  for (const [playerId, dealt] of monster.damage) {
    if (playerId === player.id) continue;
    if (dealt < monster.maxHp * 0.05) continue;
    pushEvent({
      kind: "reward",
      to: playerId,
      room: monster.room,
      x: monster.x,
      y: monster.y,
      exp: Math.floor(monster.exp * 0.3),
      gold: 0,
    });
  }
  monster.damage.clear();

  if (Math.random() < 0.18) {
    world.dropSeq += 1;
    const drop: WorldDrop = {
      id: `d${world.dropSeq}`,
      room: monster.room,
      x: monster.x,
      y: monster.y,
      heal: monster.boss ? 300 : 60,
      expiresAt: now + 30_000,
    };
    world.drops.set(drop.id, drop);
  }
}

/** 自动/手动共用的普通攻击：有目标才挥砍，并自动转向目标 */
function performAttack(player: WorldPlayer, now: number): void {
  if (player.deadUntil > now) return;
  if (now - player.lastAttack < 420) return;

  const range = 96;
  const inRange = aliveMonstersInRoom(player.room).filter(
    (monster) =>
      Math.hypot(monster.x - player.x, monster.y - player.y) <=
      range + (monster.boss ? 20 : 0)
  );
  if (inRange.length === 0) return;

  player.lastAttack = now;
  const facing = player.dir >= 0 ? 1 : -1;
  const inFront = inRange.filter(
    (monster) =>
      (monster.x - player.x - (monster.y - player.y)) * facing >= -24
  );
  const target = (inFront.length > 0 ? inFront : inRange).sort(
    (a, b) =>
      Math.hypot(a.x - player.x, a.y - player.y) -
      Math.hypot(b.x - player.x, b.y - player.y)
  )[0];

  if (!target) return;

  const screenDx = target.x - target.y - (player.x - player.y);
  if (Math.abs(screenDx) > 1) player.dir = screenDx > 0 ? 1 : -1;

  pushEvent({ kind: "swing", room: player.room, from: player.id, x: player.x, y: player.y });

  const buff = player.buffUntil > now ? 1.3 : 1;
  const hit = rollDamage(player.atk * buff, target.def, player.crit);
  damageMonster(target, player, hit.damage, hit.crit, now);
}

export function attack(clientId: string): void {
  const player = world.players.get(clientId);
  if (!player) return;
  const now = Date.now();
  player.lastSeen = now;
  performAttack(player, now);
}

export type SkillResult = { ok: boolean; message?: string };

export function castSkill(
  clientId: string,
  skillId: string,
  dirX?: number,
  dirY?: number
): SkillResult {
  const player = world.players.get(clientId);
  if (!player) return { ok: false, message: "未加入世界" };
  const now = Date.now();
  if (player.deadUntil > now) return { ok: false, message: "你已阵亡" };
  if (!CLASS_SKILLS[player.classId].includes(skillId)) {
    return { ok: false, message: "无法使用该技能" };
  }
  const skill = SKILLS[skillId];
  if (!skill) return { ok: false, message: "技能不存在" };
  if (player.level < skill.level) return { ok: false, message: `需要 ${skill.level} 级` };
  if (player.mp < skill.mp) return { ok: false, message: "法力不足" };

  const readyAt = player.skillReady[skillId] ?? 0;
  if (now < readyAt) {
    return { ok: false, message: `冷却中 ${Math.ceil((readyAt - now) / 1000)}s` };
  }
  if (now - player.lastSkill < 450) return { ok: false, message: "施法过快" };

  const cooldown = (skill.cooldown ?? 5) * (1 - player.cdr / 100);
  player.mp -= skill.mp;
  player.lastSkill = now;
  player.lastSeen = now;
  player.skillReady[skillId] = now + cooldown * 1000;

  const buff = player.buffUntil > now ? 1.3 : 1;
  const roomMonsters = aliveMonstersInRoom(player.room);

  const announce = (extra?: Partial<WorldEvent>) => {
    pushEvent({
      kind: "skill",
      room: player.room,
      from: player.id,
      skillId: skill.id,
      x: player.x,
      y: player.y,
      text: skill.name,
      ...extra,
    });
  };

  if (skill.kind === "heal") {
    const heal = Math.round(player.maxHp * (skill.healRatio ?? 0.3));
    player.hp = Math.min(player.maxHp, player.hp + heal);
    pushEvent({
      kind: "heal",
      to: player.id,
      room: player.room,
      x: player.x,
      y: player.y,
      value: heal,
    });
    announce();
    return { ok: true };
  }

  if (skill.kind === "guard") {
    player.guardUntil = now + (skill.buffTurns ?? 4) * 1000;
    announce();
    return { ok: true };
  }

  if (skill.kind === "buff") {
    player.buffUntil = now + (skill.buffTurns ?? 3) * 1000;
    announce();
    return { ok: true };
  }

  if (skill.kind === "dash") {
    let dx = Number(dirX);
    let dy = Number(dirY);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) {
      dx = player.dir;
      dy = -player.dir;
    }
    const length = Math.hypot(dx, dy) || 1;
    const distance = skill.dashDistance ?? 140;
    const stepSize = 8;
    let traveled = 0;
    while (traveled < distance) {
      const nx = player.x + (dx / length) * stepSize;
      const ny = player.y + (dy / length) * stepSize;
      const clamped = clampToWorld(nx, ny, player.room);
      if (isBlockedAt(clamped.x, clamped.y, 9, player.room)) break;
      player.x = clamped.x;
      player.y = clamped.y;
      traveled += stepSize;
    }
    player.lastMoveAt = now;
    announce();
    return { ok: true };
  }

  if (skill.kind === "aoe") {
    const radius = skill.radius ?? 120;
    const targets = roomMonsters.filter(
      (monster) => Math.hypot(monster.x - player.x, monster.y - player.y) <= radius
    );
    for (const monster of targets) {
      const hit = rollDamage(
        player.atk * buff,
        monster.def,
        player.crit,
        skill.multiplier ?? 1
      );
      damageMonster(monster, player, hit.damage, hit.crit, now);
    }
    announce({ value: Math.round(radius) });
    return { ok: true };
  }

  // damage / execute / slow 均需要目标
  const range = skill.range ?? skill.radius ?? 150;
  const candidates = roomMonsters
    .filter(
      (monster) => Math.hypot(monster.x - player.x, monster.y - player.y) <= range
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - player.x, a.y - player.y) -
        Math.hypot(b.x - player.x, b.y - player.y)
    );

  if (candidates.length === 0) {
    return { ok: false, message: "范围内没有目标" };
  }

  if (skill.kind === "slow" && !skill.range) {
    for (const monster of candidates) {
      const hit = rollDamage(
        player.atk * buff,
        monster.def,
        player.crit,
        skill.multiplier ?? 1
      );
      monster.slowUntil = now + (skill.slowMs ?? 2000);
      damageMonster(monster, player, hit.damage, hit.crit, now);
    }
    announce();
    return { ok: true };
  }

  const target = candidates[0];
  let multiplier = skill.multiplier ?? 1;
  if (skill.kind === "execute") {
    const missing = 1 - target.hp / target.maxHp;
    multiplier *= 1 + Math.max(0, missing) * 0.8;
  }
  const hits = skill.hits ?? 1;
  for (let i = 0; i < hits; i += 1) {
    if (target.hp <= 0) break;
    const hit = rollDamage(
      player.atk * buff,
      target.def,
      skill.alwaysCrit ? 100 : player.crit,
      multiplier
    );
    if (skill.slowMs) target.slowUntil = now + skill.slowMs;
    damageMonster(target, player, hit.damage, hit.crit, now);
  }
  announce();
  return { ok: true };
}

function distanceToPortal(player: WorldPlayer, tx: number, ty: number): number {
  return Math.hypot(player.x - (tx * TILE + TILE / 2), player.y - (ty * TILE + TILE / 2));
}

export type TravelResult = {
  ok: boolean;
  message: string;
  room?: RoomId;
  x?: number;
  y?: number;
};

export function enterDungeon(clientId: string, dungeonId: string): TravelResult {
  const player = world.players.get(clientId);
  if (!player) return { ok: false, message: "未加入世界" };
  if (!isRoomId(dungeonId) || !ROOMS[dungeonId].dungeon) {
    return { ok: false, message: "副本不存在" };
  }
  const target = dungeonId as RoomId;
  const cfg = ROOMS[target];
  if (player.level < cfg.unlockLevel) {
    return { ok: false, message: `需要 ${cfg.unlockLevel} 级才能进入` };
  }
  if (player.room !== "world") {
    return { ok: false, message: "请先离开当前副本" };
  }
  const portal = portalsForRoom("world").find((item) => item.target === target);
  if (!portal || distanceToPortal(player, portal.tx, portal.ty) > 110) {
    return { ok: false, message: "需要靠近副本传送门" };
  }
  const spawn = roomSpawn(target);
  player.room = target;
  player.x = spawn.x;
  player.y = spawn.y;
  player.lastMoveAt = Date.now();
  player.lastSeen = Date.now();
  player.invulnerableUntil = Date.now() + 1800;
  player.skillReady = {};
  pushEvent({ kind: "room", to: player.id, room: target, x: player.x, y: player.y, text: `进入 ${cfg.name}` });
  return { ok: true, message: `进入 ${cfg.name}`, room: target, x: player.x, y: player.y };
}

export function exitDungeon(clientId: string): TravelResult {
  const player = world.players.get(clientId);
  if (!player) return { ok: false, message: "未加入世界" };
  if (player.room === "world") return { ok: false, message: "你已在开放世界" };
  const from = player.room;
  const portal = portalsForRoom("world").find((item) => item.target === from);
  const spawn = roomSpawn("world");
  player.room = "world";
  player.x = portal ? portal.tx * TILE + TILE / 2 : spawn.x;
  player.y = portal ? portal.ty * TILE + TILE / 2 + 80 : spawn.y;
  player.lastMoveAt = Date.now();
  player.lastSeen = Date.now();
  player.invulnerableUntil = Date.now() + 1800;
  player.skillReady = {};
  pushEvent({ kind: "room", to: player.id, room: "world", x: player.x, y: player.y, text: "离开副本" });
  return { ok: true, message: "已返回翡翠大陆", room: "world", x: player.x, y: player.y };
}

export type QuestActionResult = {
  ok: boolean;
  message: string;
  reward?: { exp: number; gold: number; items?: { itemId: string; count: number }[] };
};

export function acceptQuest(clientId: string, questId: string): QuestActionResult {
  const player = world.players.get(clientId);
  if (!player) return { ok: false, message: "未加入世界" };
  const def = QUESTS[questId];
  if (!def) return { ok: false, message: "任务不存在" };
  if (player.level < (def.requireLevel ?? 1)) {
    return { ok: false, message: `需要 ${def.requireLevel} 级` };
  }
  const existing = player.quests[questId];
  if (existing) {
    if (existing.status === "turnedIn") return { ok: false, message: "该任务已完成" };
    return { ok: false, message: "已接取该任务" };
  }
  player.quests[questId] = { progress: 0, status: "active" };
  return { ok: true, message: `接受任务：${def.title}` };
}

export function turnInQuest(clientId: string, questId: string): QuestActionResult {
  const player = world.players.get(clientId);
  if (!player) return { ok: false, message: "未加入世界" };
  const def = QUESTS[questId];
  if (!def) return { ok: false, message: "任务不存在" };
  const state = player.quests[questId];
  if (!state) return { ok: false, message: "尚未接取该任务" };
  if (state.status === "turnedIn") return { ok: false, message: "该任务已完成" };
  if (state.status !== "complete") return { ok: false, message: "任务目标尚未完成" };
  state.status = "turnedIn";
  return {
    ok: true,
    message: `完成任务：${def.title}`,
    reward: {
      exp: def.reward.exp,
      gold: def.reward.gold,
      items: def.reward.items,
    },
  };
}

function step(now: number): void {
  const dt = Math.min(0.1, (now - world.lastTick) / 1000);
  world.lastTick = now;

  for (const player of world.players.values()) {
    if (now - player.lastSeen > 15_000) {
      world.players.delete(player.id);
      continue;
    }
    const respawn = roomSpawn(player.room);
    if (player.deadUntil && now > player.deadUntil) {
      player.deadUntil = 0;
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      player.x = respawn.x;
      player.y = respawn.y;
      player.invulnerableUntil = now + 2000;
    }
    if (!player.deadUntil && now - player.lastMpRegen > 2000) {
      player.lastMpRegen = now;
      player.mp = Math.min(
        player.maxMp,
        player.mp + Math.max(1, Math.round(player.maxMp * 0.02))
      );
    }
    // 开放世界村庄安全区缓慢回血
    if (
      player.room === "world" &&
      !player.deadUntil &&
      player.hp < player.maxHp &&
      now - player.lastSafeRegen > 1000 &&
      Math.hypot(player.x - spawnWorld.x, player.y - spawnWorld.y) < 240
    ) {
      player.lastSafeRegen = now;
      player.hp = Math.min(
        player.maxHp,
        player.hp + Math.max(1, Math.round(player.maxHp * 0.03))
      );
    }
    if (!player.deadUntil && now - player.lastSeen < 5000) {
      performAttack(player, now);
    }
  }

  for (const monster of world.monsters.values()) {
    if (monster.hp <= 0) {
      if (monster.respawnAt && now > monster.respawnAt) {
        monster.hp = monster.maxHp;
        monster.x = monster.homeX;
        monster.y = monster.homeY;
        monster.respawnAt = 0;
        monster.slowUntil = 0;
        monster.damage.clear();
      }
      continue;
    }

    let nearest: WorldPlayer | null = null;
    let nearestDistance = Infinity;
    for (const player of world.players.values()) {
      if (player.deadUntil || player.room !== monster.room) continue;
      const distance = Math.hypot(player.x - monster.x, player.y - monster.y);
      if (distance < nearestDistance) {
        nearest = player;
        nearestDistance = distance;
      }
    }
    if (!nearest || nearestDistance > monster.aggro) continue;

    if (
      monster.room === "world" &&
      Math.hypot(nearest.x - spawnWorld.x, nearest.y - spawnWorld.y) < 240
    ) {
      continue;
    }

    const slowed = monster.slowUntil > now ? 0.45 : 1;

    if (nearestDistance > 44) {
      const speed = monster.speed * slowed * dt;
      const dx = nearest.x - monster.x;
      const dy = nearest.y - monster.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = monster.x + (dx / length) * speed;
      const ny = monster.y + (dy / length) * speed;
      if (!isBlockedAt(nx, monster.y, 8, monster.room)) monster.x = nx;
      if (!isBlockedAt(monster.x, ny, 8, monster.room)) monster.y = ny;
    } else if (now - monster.lastAttack > 1100 && now >= nearest.invulnerableUntil) {
      monster.lastAttack = now;
      const hit = rollDamage(monster.atk, nearest.def, 5);
      let damage = hit.damage;
      if (nearest.guardUntil > now) {
        damage = Math.max(1, Math.round(damage * 0.55));
      }
      nearest.hp = Math.max(0, nearest.hp - damage);
      nearest.invulnerableUntil = now + 500;
      pushEvent({
        kind: "hurt",
        to: nearest.id,
        room: monster.room,
        x: nearest.x,
        y: nearest.y - 20,
        value: damage,
      });
      if (nearest.hp <= 0) {
        nearest.deadUntil = now + 3000;
        pushEvent({ kind: "death", to: nearest.id, room: monster.room, x: nearest.x, y: nearest.y });
      }
    }

    // BOSS 范围技能：6 秒一次，对 120px 内所有玩家造成 140% 伤害
    if (monster.boss && now - monster.lastAoe > 6000) {
      const inRange = [...world.players.values()].filter(
        (player) =>
          !player.deadUntil &&
          player.room === monster.room &&
          Math.hypot(player.x - monster.x, player.y - monster.y) <= 120
      );
      if (inRange.length > 0) {
        monster.lastAoe = now;
        pushEvent({
          kind: "boss-aoe",
          room: monster.room,
          x: monster.x,
          y: monster.y,
          text: monster.name,
        });
        for (const target of inRange) {
          if (now < target.invulnerableUntil) continue;
          const hit = rollDamage(monster.atk, target.def, 5, 1.4);
          let damage = hit.damage;
          if (target.guardUntil > now) {
            damage = Math.max(1, Math.round(damage * 0.55));
          }
          target.hp = Math.max(0, target.hp - damage);
          target.invulnerableUntil = now + 500;
          pushEvent({
            kind: "hurt",
            to: target.id,
            room: monster.room,
            x: target.x,
            y: target.y - 20,
            value: damage,
          });
          if (target.hp <= 0) {
            target.deadUntil = now + 3000;
            pushEvent({ kind: "death", to: target.id, room: monster.room, x: target.x, y: target.y });
          }
        }
      }
    }
  }

  for (const drop of world.drops.values()) {
    if (now > drop.expiresAt) {
      world.drops.delete(drop.id);
      continue;
    }
    for (const player of world.players.values()) {
      if (player.deadUntil || player.room !== drop.room) continue;
      if (Math.hypot(player.x - drop.x, player.y - drop.y) > 64) continue;
      player.hp = Math.min(player.maxHp, player.hp + drop.heal);
      pushEvent({
        kind: "heal",
        to: player.id,
        room: drop.room,
        x: player.x,
        y: player.y,
        value: drop.heal,
      });
      world.drops.delete(drop.id);
      break;
    }
  }

  if (now - world.lastBroadcast >= 100) {
    world.lastBroadcast = now;
    pruneEvents(now);
  }
}

const spawnWorld = roomSpawn("world");

function pruneEvents(now: number): void {
  while (world.events.length > 0 && now - world.events[0].at > 4000) {
    world.events.shift();
  }
}

function makeSnapshot(now: number, player: WorldPlayer | null): WorldSnapshot {
  const room: RoomId = player?.room ?? "world";
  const originX = player?.x ?? spawnWorld.x;
  const originY = player?.y ?? spawnWorld.y;
  const near = (x: number, y: number, radius: number) =>
    Math.hypot(x - originX, y - originY) <= radius;

  const players = [...world.players.values()].filter(
    (item) => item.room === room && (item.id === player?.id || near(item.x, item.y, 2200))
  );

  const monsters = aliveMonstersInRoom(room).filter((monster) =>
    near(monster.x, monster.y, 1600)
  );

  const drops = [...world.drops.values()].filter(
    (drop) => drop.room === room && near(drop.x, drop.y, 1300)
  );

  const npcs = NPCS.filter((npc) => npc.room === room && near(npc.tx * TILE, npc.ty * TILE, 1600)).map(
    (npc) => ({
      id: npc.id,
      name: npc.name,
      title: npc.title,
      icon: npc.icon,
      color: npc.color,
      role: npc.role,
      x: npc.tx * TILE + TILE / 2,
      y: npc.ty * TILE + TILE / 2,
      quests: npc.quests,
    })
  );

  const portals = portalsForRoom(room)
    .filter((portal) => near(portal.tx * TILE, portal.ty * TILE, 1700))
    .map((portal) => ({
      id: portal.id,
      target: portal.target,
      label: portal.label,
      icon: portal.icon,
      x: portal.tx * TILE + TILE / 2,
      y: portal.ty * TILE + TILE / 2,
      unlockLevel: ROOMS[portal.target].unlockLevel,
    }));

  const events = world.events.filter((event) => {
    if (event.to) return event.to === player?.id;
    if (event.room !== room) return false;
    return near(event.x, event.y, 1700);
  });

  const cooldowns: Record<string, number> = {};
  if (player) {
    for (const id of CLASS_SKILLS[player.classId]) {
      cooldowns[id] = Math.max(0, Math.round((player.skillReady[id] ?? 0) - now));
    }
  }

  const quests: QuestView[] = player
    ? Object.entries(player.quests)
        .filter(([id]) => QUESTS[id])
        .map(([id, state]) => ({
          id,
          status: state.status,
          progress: state.progress,
          goal: questGoal(QUESTS[id]),
        }))
    : [];

  return {
    type: "snapshot",
    time: now,
    online: players.length,
    room,
    players: players.map((entry) => ({
      id: entry.id,
      name: entry.name,
      classId: entry.classId,
      level: entry.level,
      x: Math.round(entry.x),
      y: Math.round(entry.y),
      hp: Math.round(entry.hp),
      maxHp: entry.maxHp,
      mp: Math.round(entry.mp),
      maxMp: entry.maxMp,
      dir: entry.dir,
      dead: entry.deadUntil > now,
      kills: entry.kills,
      weapon: entry.weapon,
      armor: entry.armor,
    })),
    monsters: monsters.map((monster) => ({
      id: monster.id,
      name: monster.name,
      kind: monster.kind,
      icon: monster.icon,
      boss: monster.boss,
      x: Math.round(monster.x),
      y: Math.round(monster.y),
      hp: Math.round(monster.hp),
      maxHp: monster.maxHp,
    })),
    drops: drops.map((drop) => ({
      id: drop.id,
      x: Math.round(drop.x),
      y: Math.round(drop.y),
      heal: drop.heal,
    })),
    npcs,
    portals,
    events,
    self: { room, quests, cooldowns },
  };
}

export function getSnapshotFor(clientId: string): WorldSnapshot {
  const player = world.players.get(clientId) ?? null;
  return makeSnapshot(Date.now(), player);
}

export function worldInfo() {
  return {
    width: WORLD_W,
    height: WORLD_H,
    tile: TILE,
    spawn: roomSpawn("world"),
    rooms: (Object.keys(ROOMS) as RoomId[]).map((id) => ({
      id,
      name: ROOMS[id].name,
      icon: ROOMS[id].icon,
      dungeon: ROOMS[id].dungeon,
      unlockLevel: ROOMS[id].unlockLevel,
    })),
    quests: QUEST_LIST.map((quest) => ({ id: quest.id, title: quest.title })),
  };
}
