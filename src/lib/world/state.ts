import { CLASS_SKILLS, ITEMS, SKILLS } from "@/lib/game/data";
import type { ClassId } from "@/lib/game/types";

import {
  clampToWorld,
  isBlockedAt,
  nearestOpenPoint,
  randomOpenPoint,
  SPAWN_X,
  SPAWN_Y,
  TILE,
  WORLD_H,
  WORLD_W,
} from "./terrain";

export type WorldPlayer = {
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
  atk: number;
  def: number;
  crit: number;
  dir: 1 | -1;
  kills: number;
  deadUntil: number;
  lastSeen: number;
  lastMoveAt: number;
  lastAttack: number;
  lastSkill: number;
  buffUntil: number;
  guardUntil: number;
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
  lastAttack: number;
  damage: Map<string, number>;
};

export type WorldDrop = {
  id: string;
  x: number;
  y: number;
  heal: number;
  expiresAt: number;
};

export type WorldEvent = {
  seq: number;
  at: number;
  kind:
    | "damage"
    | "hurt"
    | "kill"
    | "reward"
    | "heal"
    | "skill"
    | "swing"
    | "join"
    | "leave"
    | "death";
  x: number;
  y: number;
  value?: number;
  crit?: boolean;
  text?: string;
  to?: string;
  from?: string;
  monsterId?: string;
  skillId?: string;
  exp?: number;
  gold?: number;
};

export type WorldSnapshot = {
  type: "snapshot";
  time: number;
  online: number;
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
  events: WorldEvent[];
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
  tx?: number;
  ty?: number;
};

const MONSTER_DEFS: MonsterDef[] = [
  { kind: "slime", name: "史莱姆", icon: "🟢", hp: 70, atk: 6, def: 2, exp: 12, gold: 6, speed: 30, aggro: 170 },
  { kind: "wolf", name: "野狼", icon: "🐺", hp: 120, atk: 12, def: 4, exp: 22, gold: 11, speed: 58, aggro: 230 },
  { kind: "goblin", name: "哥布林", icon: "👺", hp: 180, atk: 18, def: 7, exp: 34, gold: 16, speed: 50, aggro: 220 },
  { kind: "skeleton", name: "骷髅战士", icon: "💀", hp: 260, atk: 26, def: 11, exp: 56, gold: 26, speed: 46, aggro: 240 },
  { kind: "fire", name: "火焰元素", icon: "🔥", hp: 340, atk: 36, def: 14, exp: 82, gold: 38, speed: 62, aggro: 250 },
  { kind: "demon", name: "炎魔", icon: "😈", hp: 460, atk: 46, def: 18, exp: 120, gold: 60, speed: 70, aggro: 270 },
];

const BOSS_DEFS: MonsterDef[] = [
  { kind: "wolfking", name: "狼王", icon: "👑", hp: 2400, atk: 30, def: 12, exp: 700, gold: 300, speed: 55, aggro: 340, boss: true, tx: 12, ty: 12 },
  { kind: "dragon", name: "炎龙", icon: "🐉", hp: 7000, atk: 58, def: 24, exp: 2400, gold: 1200, speed: 62, aggro: 380, boss: true, tx: 52, ty: 36 },
];

type World = {
  players: Map<string, WorldPlayer>;
  monsters: Map<string, WorldMonster>;
  drops: Map<string, WorldDrop>;
  listeners: Set<(snapshot: WorldSnapshot) => void>;
  events: WorldEvent[];
  seq: number;
  started: boolean;
  lastTick: number;
  lastBroadcast: number;
  monsterSeq: number;
  dropSeq: number;
};

function createMonster(def: MonsterDef, point: { x: number; y: number }): WorldMonster {
  return {
    id: `m${Math.random().toString(36).slice(2, 8)}`,
    kind: def.kind,
    name: def.name,
    icon: def.icon,
    boss: !!def.boss,
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
    lastAttack: 0,
    damage: new Map(),
  };
}

function createWorld(): World {
  const world: World = {
    players: new Map(),
    monsters: new Map(),
    drops: new Map(),
    listeners: new Set(),
    events: [],
    seq: 0,
    started: false,
    lastTick: Date.now(),
    lastBroadcast: 0,
    monsterSeq: 0,
    dropSeq: 0,
  };

  for (let i = 0; i < 24; i += 1) {
    let point = randomOpenPoint();
    let guard = 0;
    // 出生点附近 300px 内不生成怪物
    while (
      Math.hypot(point.x - SPAWN_X, point.y - SPAWN_Y) < 300 &&
      guard < 25
    ) {
      point = randomOpenPoint();
      guard += 1;
    }
    // 离出生点越远，怪物越强
    const distance = Math.hypot(point.x - SPAWN_X, point.y - SPAWN_Y);
    const tier = distance < 520 ? 0 : distance < 960 ? 2 : 4;
    const index = tier + (Math.random() < 0.5 ? 0 : 1);
    const monster = createMonster(MONSTER_DEFS[index], point);
    world.monsterSeq += 1;
    monster.id = `m${world.monsterSeq}`;
    world.monsters.set(monster.id, monster);
  }

  for (const def of BOSS_DEFS) {
    const point = nearestOpenPoint(def.tx ?? 8, def.ty ?? 8);
    const monster = createMonster(def, point);
    world.monsterSeq += 1;
    monster.id = `b${world.monsterSeq}`;
    world.monsters.set(monster.id, monster);
  }

  return world;
}

const globalForWorld = globalThis as unknown as { __taskflowWorld?: World };

export const world: World = globalForWorld.__taskflowWorld ?? createWorld();
globalForWorld.__taskflowWorld = world;

function pushEvent(event: Omit<WorldEvent, "seq" | "at">): void {
  world.seq += 1;
  world.events.push({ ...event, seq: world.seq, at: Date.now() });
  if (world.events.length > 80) world.events.shift();
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
  weapon?: string | null;
  armor?: string | null;
  potions?: Record<string, number>;
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function joinWorld(input: JoinInput) {
  ensureWorldStarted();
  const now = Date.now();

  const name = String(input.name || "冒险者").slice(0, 16);
  const classId: ClassId = input.classId in CLASS_SKILLS ? input.classId : "warrior";
  const level = Math.round(clampNumber(input.level, 1, 30));
  const maxHp = Math.round(clampNumber(input.maxHp, 1, 5000));
  const maxMp = Math.round(clampNumber(input.maxMp, 0, 3000));
  const atk = Math.round(clampNumber(input.atk, 1, 800));
  const def = Math.round(clampNumber(input.def, 0, 500));
  const crit = Math.round(clampNumber(input.crit, 0, 60));
  const weapon =
    typeof input.weapon === "string" ? input.weapon.slice(0, 40) : null;
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
    const offset = () => (Math.random() - 0.5) * 120;
    player = {
      id: input.clientId,
      name,
      classId,
      level,
      x: SPAWN_X + offset(),
      y: SPAWN_Y + offset(),
      hp: maxHp,
      maxHp,
      mp: maxMp,
      maxMp,
      atk,
      def,
      crit,
      dir: 1,
      kills: 0,
      deadUntil: 0,
      lastSeen: now,
      lastMoveAt: now,
      lastAttack: 0,
      lastSkill: 0,
      buffUntil: 0,
      guardUntil: 0,
      lastMpRegen: now,
      invulnerableUntil: 0,
      lastSafeRegen: 0,
      lastRecall: 0,
      lastPotion: 0,
      potions,
      weapon,
      armor,
    };
    world.players.set(player.id, player);
    pushEvent({ kind: "join", x: player.x, y: player.y, text: player.name });
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
      weapon,
      armor,
      potions,
      lastSeen: now,
    });
    player.hp = Math.min(player.hp, player.maxHp);
    player.mp = Math.min(player.mp, player.maxMp);
  }

  return {
    player: {
      id: player.id,
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
  pushEvent({ kind: "leave", x: player.x, y: player.y, text: player.name });
}

export function touchPlayer(clientId: string): void {
  const player = world.players.get(clientId);
  if (player) player.lastSeen = Date.now();
}

/** 回城：传送到出生点并给短暂保护，20 秒冷却 */
export function recallPlayer(clientId: string): void {
  const player = world.players.get(clientId);
  if (!player || player.deadUntil) return;
  const now = Date.now();
  if (now - player.lastRecall < 20_000) return;
  player.lastRecall = now;
  player.x = SPAWN_X;
  player.y = SPAWN_Y;
  player.lastMoveAt = now;
  player.lastSeen = now;
  player.invulnerableUntil = Math.max(player.invulnerableUntil, now + 1500);
}

/** 世界内使用背包药水：服务器按物品定义回血/回蓝 */
export function usePotion(clientId: string, itemId: string): void {
  const player = world.players.get(clientId);
  if (!player || player.deadUntil) return;
  const item = ITEMS[itemId];
  if (!item || item.kind !== "consumable") return;
  const count = player.potions[itemId] ?? 0;
  if (count <= 0) return;
  const now = Date.now();
  if (now - player.lastPotion < 800) return;
  player.lastPotion = now;
  player.potions[itemId] = count - 1;

  const hpBefore = player.hp;
  const mpBefore = player.mp;
  player.hp = Math.min(player.maxHp, player.hp + (item.hp ?? 0));
  player.mp = Math.min(player.maxMp, player.mp + (item.mp ?? 0));
  const healed = Math.round(player.hp - hpBefore);
  const restored = Math.round(player.mp - mpBefore);
  if (healed > 0 || restored > 0) {
    pushEvent({
      kind: "heal",
      to: player.id,
      x: player.x,
      y: player.y,
      value: healed > 0 ? healed : restored,
      text: item.name,
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
  const maxDistance = 260 * dt + 40;
  let nextX = x;
  let nextY = y;
  const distance = Math.hypot(nextX - player.x, nextY - player.y);
  if (distance > maxDistance && distance > 0) {
    const ratio = maxDistance / distance;
    nextX = player.x + (nextX - player.x) * ratio;
    nextY = player.y + (nextY - player.y) * ratio;
  }
  const clamped = clampToWorld(nextX, nextY);
  if (isBlockedAt(clamped.x, clamped.y, 9)) return;
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

function aliveMonsters(): WorldMonster[] {
  return [...world.monsters.values()].filter((monster) => monster.hp > 0);
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
    x: monster.x,
    y: monster.y - 20,
    value: damage,
    crit,
    monsterId: monster.id,
    from: player.id,
  });

  if (monster.hp > 0) return;

  monster.respawnAt = now + (monster.boss ? 60_000 : 15_000);
  player.kills += 1;
  pushEvent({ kind: "kill", x: monster.x, y: monster.y, text: monster.name });
  pushEvent({
    kind: "reward",
    to: player.id,
    x: monster.x,
    y: monster.y,
    exp: monster.exp,
    gold: monster.gold,
  });

  for (const [playerId, dealt] of monster.damage) {
    if (playerId === player.id) continue;
    if (dealt < monster.maxHp * 0.05) continue;
    pushEvent({
      kind: "reward",
      to: playerId,
      x: monster.x,
      y: monster.y,
      exp: Math.floor(monster.exp * 0.3),
      gold: 0,
    });
  }
  monster.damage.clear();

  if (Math.random() < 0.15) {
    world.dropSeq += 1;
    const drop: WorldDrop = {
      id: `d${world.dropSeq}`,
      x: monster.x,
      y: monster.y,
      heal: monster.boss ? 300 : 60,
      expiresAt: now + 30_000,
    };
    world.drops.set(drop.id, drop);
  }
}

export function attack(clientId: string): void {
  const player = world.players.get(clientId);
  if (!player || player.deadUntil > Date.now()) return;
  const now = Date.now();
  if (now - player.lastAttack < 420) return;
  player.lastAttack = now;
  player.lastSeen = now;
  pushEvent({ kind: "swing", from: player.id, x: player.x, y: player.y });

  const range = 96;
  const inRange = aliveMonsters().filter(
    (monster) =>
      Math.hypot(monster.x - player.x, monster.y - player.y) <=
      range + (monster.boss ? 20 : 0)
  );
  // 优先攻击面朝方向（屏幕左右）的怪物，没有目标时回退到最近
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

  const buff = player.buffUntil > now ? 1.3 : 1;
  const hit = rollDamage(player.atk * buff, target.def, player.crit);
  damageMonster(target, player, hit.damage, hit.crit, now);
}

export function castSkill(clientId: string, skillId: string): void {
  const player = world.players.get(clientId);
  if (!player || player.deadUntil > Date.now()) return;
  if (!CLASS_SKILLS[player.classId].includes(skillId)) return;
  const skill = SKILLS[skillId];
  if (!skill || player.level < skill.level) return;

  const now = Date.now();
  if (player.mp < skill.mp) return;
  if (now - player.lastSkill < 900) return;

  player.mp -= skill.mp;
  player.lastSkill = now;
  player.lastSeen = now;

  if (skill.kind === "damage") {
    const range = 140;
    const targets = aliveMonsters()
      .filter(
        (monster) =>
          Math.hypot(monster.x - player.x, monster.y - player.y) <= range
      )
      .slice(0, 4);
    const hits = skill.hits ?? 1;
    const buff = player.buffUntil > now ? 1.3 : 1;
    for (const monster of targets) {
      for (let i = 0; i < hits; i += 1) {
        if (monster.hp <= 0) break;
        const hit = rollDamage(
          player.atk * buff,
          monster.def,
          player.crit,
          skill.multiplier ?? 1
        );
        damageMonster(monster, player, hit.damage, hit.crit, now);
      }
    }
    pushEvent({
      kind: "skill",
      from: player.id,
      skillId: skill.id,
      x: player.x,
      y: player.y,
      text: skill.name,
    });
    return;
  }

  if (skill.kind === "heal") {
    const heal = Math.round(player.maxHp * (skill.healRatio ?? 0.3));
    player.hp = Math.min(player.maxHp, player.hp + heal);
    pushEvent({ kind: "heal", to: player.id, x: player.x, y: player.y, value: heal });
    return;
  }

  if (skill.kind === "buff") {
    player.buffUntil = now + (skill.buffTurns ?? 3) * 3000;
    pushEvent({
      kind: "skill",
      from: player.id,
      skillId: skill.id,
      x: player.x,
      y: player.y,
      text: skill.name,
    });
    return;
  }

  if (skill.kind === "guard") {
    player.guardUntil = now + (skill.buffTurns ?? 3) * 3000;
    pushEvent({
      kind: "skill",
      from: player.id,
      skillId: skill.id,
      x: player.x,
      y: player.y,
      text: skill.name,
    });
  }
}

function step(now: number): void {
  const dt = Math.min(0.1, (now - world.lastTick) / 1000);
  world.lastTick = now;

  for (const player of world.players.values()) {
    if (now - player.lastSeen > 15_000) {
      world.players.delete(player.id);
      continue;
    }
    if (player.deadUntil && now > player.deadUntil) {
      player.deadUntil = 0;
      player.hp = player.maxHp;
      player.mp = player.maxMp;
      player.x = SPAWN_X;
      player.y = SPAWN_Y;
      player.invulnerableUntil = now + 2000;
    }
    if (!player.deadUntil && now - player.lastMpRegen > 2000) {
      player.lastMpRegen = now;
      player.mp = Math.min(
        player.maxMp,
        player.mp + Math.max(1, Math.round(player.maxMp * 0.02))
      );
    }
    // 安全区内缓慢回血，提供残血恢复手段
    if (
      !player.deadUntil &&
      player.hp < player.maxHp &&
      now - player.lastSafeRegen > 1000 &&
      Math.hypot(player.x - SPAWN_X, player.y - SPAWN_Y) < 220
    ) {
      player.lastSafeRegen = now;
      player.hp = Math.min(
        player.maxHp,
        player.hp + Math.max(1, Math.round(player.maxHp * 0.03))
      );
    }
  }

  for (const monster of world.monsters.values()) {
    if (monster.hp <= 0) {
      if (monster.respawnAt && now > monster.respawnAt) {
        monster.hp = monster.maxHp;
        monster.x = monster.homeX;
        monster.y = monster.homeY;
        monster.respawnAt = 0;
        monster.damage.clear();
      }
      continue;
    }

    let nearest: WorldPlayer | null = null;
    let nearestDistance = Infinity;
    for (const player of world.players.values()) {
      if (player.deadUntil) continue;
      const distance = Math.hypot(player.x - monster.x, player.y - monster.y);
      if (distance < nearestDistance) {
        nearest = player;
        nearestDistance = distance;
      }
    }
    if (!nearest || nearestDistance > monster.aggro) continue;

    // 村庄安全区：玩家在出生点附近时怪物不主动攻击
    if (
      Math.hypot(nearest.x - SPAWN_X, nearest.y - SPAWN_Y) < 220
    ) {
      continue;
    }

    if (nearestDistance > 44) {
      const speed = monster.speed * dt;
      const dx = nearest.x - monster.x;
      const dy = nearest.y - monster.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = monster.x + (dx / length) * speed;
      const ny = monster.y + (dy / length) * speed;
      if (!isBlockedAt(nx, monster.y, 8)) monster.x = nx;
      if (!isBlockedAt(monster.x, ny, 8)) monster.y = ny;
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
        x: nearest.x,
        y: nearest.y - 20,
        value: damage,
      });
      if (nearest.hp <= 0) {
        nearest.deadUntil = now + 3000;
        pushEvent({ kind: "death", to: nearest.id, x: nearest.x, y: nearest.y });
      }
    }
  }

  for (const drop of world.drops.values()) {
    if (now > drop.expiresAt) {
      world.drops.delete(drop.id);
      continue;
    }
    for (const player of world.players.values()) {
      if (player.deadUntil) continue;
      if (Math.hypot(player.x - drop.x, player.y - drop.y) > 40) continue;
      player.hp = Math.min(player.maxHp, player.hp + drop.heal);
      pushEvent({
        kind: "heal",
        to: player.id,
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
    const snapshot = makeSnapshot(now);
    for (const listener of world.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[world] 广播失败:", error);
      }
    }
  }
}

function makeSnapshot(now: number): WorldSnapshot {
  while (world.events.length > 0 && now - world.events[0].at > 2500) {
    world.events.shift();
  }

  return {
    type: "snapshot",
    time: now,
    online: world.players.size,
    players: [...world.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      classId: player.classId,
      level: player.level,
      x: Math.round(player.x),
      y: Math.round(player.y),
      hp: Math.round(player.hp),
      maxHp: player.maxHp,
      mp: Math.round(player.mp),
      maxMp: player.maxMp,
      dir: player.dir,
      dead: player.deadUntil > now,
      kills: player.kills,
      weapon: player.weapon,
      armor: player.armor,
    })),
    monsters: aliveMonsters().map((monster) => ({
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
    drops: [...world.drops.values()].map((drop) => ({
      id: drop.id,
      x: Math.round(drop.x),
      y: Math.round(drop.y),
      heal: drop.heal,
    })),
    events: [...world.events],
  };
}

export function subscribeWorld(listener: (snapshot: WorldSnapshot) => void): () => void {
  ensureWorldStarted();
  world.listeners.add(listener);
  return () => {
    world.listeners.delete(listener);
  };
}

export function getWorldSnapshot(): WorldSnapshot {
  return makeSnapshot(Date.now());
}

export function worldInfo() {
  return {
    width: WORLD_W,
    height: WORLD_H,
    tile: TILE,
    spawn: { x: SPAWN_X, y: SPAWN_Y },
  };
}
