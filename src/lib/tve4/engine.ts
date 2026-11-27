// tve4 规则引擎：数值与机制来自 data/game/game-rules.json（已从原版解包文件核对）。

import {
  ALL_SKILL_KEYS,
  BUILDINGS,
  HERO_STATS,
  LIVES,
  MODE_START_GOLD,
  REQUIREMENTS,
  RULE_PREP,
  SKILLS,
  START_GOLD,
  START_WOOD,
  TILE,
} from "./config";
import {
  BOUNTY_RULE,
  BUILDING_RULES,
  COMBAT_RULE,
  DEMOLISH_RULE,
  EQUIPMENT_RULE,
  MARKET_RULE,
  REPAIR_RULE,
  RESPAWN_RULE,
  RULES,
  SCENARIO_RULE,
  VISION_RULE,
} from "./rules";
import { createSession, requireSpawn } from "./sim/session";
import { createRng, randomRange } from "./sim/rng";
import { findGridPath, hasWorldLineOfSight, isWorldPositionFree, isWorldSegmentClear, type PathingGrid } from "./sim/pathing";
import { createRuntimePathing } from "./map";
import { createPerception } from "./ai/perception";
import type {
  Buffs,
  BuildKind,
  Building,
  Faction,
  FloatText,
  GameOptions,
  GameState,
  Hero,
  InputState,
  Mode,
  Rule,
  SkillKey,
} from "./types";

const SCALE = RULES.scale;
const PATHING_VIEWS = new WeakMap<GameState, PathingGrid>();

function pathingView(state: GameState): PathingGrid {
  let view = PATHING_VIEWS.get(state);
  if (!view) {
    view = createRuntimePathing(state.session.map, state.session.pathing32);
    PATHING_VIEWS.set(state, view);
  }
  return view;
}

// ---------------------------------------------------------------- 工具

function emptyBuffs(): Buffs {
  return { haste: 0, windwalk: 0, berserk: 0, root: 0, silence: 0, revealed: 0 };
}

function emptyCooldowns(): Record<SkillKey, number> {
  const out = {} as Record<SkillKey, number>;
  for (const k of ALL_SKILL_KEYS) out[k] = 0;
  return out;
}

function gridToWorld(gx: number, gy: number) {
  return { x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE };
}

function cellBlocked(state: GameState, gx: number, gy: number): boolean {
  const grid = state.session.grid;
  if (gx < 0 || gy < 0 || gx >= grid.width || gy >= grid.height) return true;
  return state.blocked[gy * grid.width + gx] === 1;
}

export function setBlocked(state: GameState, data: Uint8Array): void {
  for (let i = 0; i < Math.min(state.blocked.length, data.length); i += 1) {
    state.blocked[i] = data[i] > 0 ? 1 : 0;
  }
}

function addFloat(state: GameState, x: number, y: number, text: string, color: string, size = 13): void {
  state.floats.push({ x, y, text, color, size, t: 0, dur: 0.85 });
  if (state.floats.length > 80) state.floats.shift();
}

function addEffect(state: GameState, x: number, y: number, radius: number, color: string): void {
  state.effects.push({ x, y, radius, color, t: 0, dur: 0.42 });
  if (state.effects.length > 60) state.effects.shift();
}

function setHint(state: GameState, text: string): void {
  state.hint = { text, t: 2.6 };
}

// ---------------------------------------------------------------- 创建 / 死亡

export function createGame(options: GameOptions = {}): GameState {
  const session = createSession(options);
  const mode: Mode = session.mode;
  const rule: Rule = session.rule;
  const testMode = options.testMode ?? false;
  const playerFaction: Faction = session.playerFaction;
  const playerSpawn = session.spawns[playerFaction];
  const lastSeen = playerSpawn ? gridToWorld(playerSpawn.gx, playerSpawn.gy) : null;
  const state: GameState = {
    mode,
    rule,
    mapId: session.mapId,
    seed: session.seed,
    catalogVersion: session.catalogVersion,
    session,
    rng: createRng(session.seed),
    aiMemory: { lastSeen, buildingIds: [] },
    appearance: { heroModelId: options.heroModelId ?? null },
    playerFaction,
    testMode,
    trollStrength: 0,
    mobileDev: false,
    mageSummoned: false,
    endLock: null,
    relocateCd: 0,
    aiPath: [],
    aiPathIdx: 0,
    pathTimer: 0,
    stuckX: 0,
    stuckY: 0,
    stuckTimer: 0,
    elfShared: false,
    elfExposed: false,
    woodPriceIn: MARKET_RULE.buyPrice,
    woodPriceOut: MARKET_RULE.sellPrice,
    time: 0,
    phase: "prep",
    result: null,
    heroes: [],
    buildings: [],
    projectiles: [],
    effects: [],
    floats: [],
    hint: null,
    blocked: new Uint8Array(session.blocked128),
    trollSpawned: false,
    incomeAcc: 0,
    aiTimer: 2,
    nextId: 1,
    stats: { kills: 0, destroyed: 0, goldEarned: 0, damage: 0 },
  };
  const playerPoint = requireSpawn(session, playerFaction);
  const pp = gridToWorld(playerPoint.gx, playerPoint.gy);
  state.heroes.push(makeHero(state, playerFaction, true, pp.x, pp.y));
  if (playerFaction === "troll") createTrollInfrastructure(state);
  if (testMode) {
    spawnTroll(state);
    setHint(state, "测试模式：对手已出现");
  } else {
    setHint(state, "准备阶段：发育期");
  }
  return state;
}

function makeHero(state: GameState, faction: Faction, isPlayer: boolean, x: number, y: number): Hero {
  const s = HERO_STATS[faction];
  return {
    id: state.nextId++,
    faction,
    isPlayer,
    isWolf: false,
    isAlly: false,
    alive: true,
    lives: faction === "elf" && state.rule === "REVIVE" ? 3 : LIVES,
    x, y, vx: 0, vy: 0, facing: 0,
    flash: 0,
    invuln: 0,
    hp: s.hp, maxHp: s.hp, mana: s.mana, maxMana: s.mana, manaRegen: s.manaRegen,
    damage: s.damage, interval: s.interval, range: s.range,
    speed: s.speed, radius: s.radius,
    cd: 0, channelTime: 0, deathTimer: 0,
    gold: (MODE_START_GOLD[state.mode] ?? START_GOLD)[faction], wood: START_WOOD,
    items: [], bonusIncome: 0, bonusLifesteal: 0,
    cooldowns: emptyCooldowns(), buffs: emptyBuffs(),
  };
}

function createTrollInfrastructure(state: GameState): void {
  // u03D 原版由系统创建，玩家不能自建
  const base = state.session.trollBase;
  state.buildings.push(makeBuilding(state, "trollHouse", "troll", base.gx - 1, base.gy - 1, 0, true));
  for (const [ox, oy] of EQUIPMENT_RULE.shopOffsets) {
    state.buildings.push(makeBuilding(
      state, "market", "troll",
      base.gx + Math.round(ox * 0.5), base.gy + Math.round(oy * 0.5), 0, true,
    ));
  }
}

function spawnTroll(state: GameState): void {
  let p: { x: number; y: number };
  if (state.playerFaction === "troll") {
    // 玩家是巨魔：此时出现的是 AI 精灵
    const elfSpawn = requireSpawn(state.session, "elf");
    p = gridToWorld(elfSpawn.gx, elfSpawn.gy);
    state.heroes.push(makeHero(state, "elf", false, p.x, p.y));
    setHint(state, "精灵对手已出现");
  } else {
    const trollSpawn = requireSpawn(state.session, "troll");
    p = gridToWorld(trollSpawn.gx, trollSpawn.gy);
    const troll = makeHero(state, "troll", false, p.x, p.y);
    troll.invuln = RULES.trollInvulnerableSeconds;
    state.heroes.push(troll);
    createTrollInfrastructure(state);
    setHint(state, "巨魔出现了！守住你的阵地");
  }
  state.trollSpawned = true;
  state.phase = "battle";
  addEffect(state, p.x, p.y, 90, "#ff8a5c");
}

function makeBuilding(state: GameState, kind: BuildKind, faction: Faction, gx: number, gy: number, buildTimer: number, system = false): Building {
  const def = BUILDINGS[kind];
  return {
    id: state.nextId++, kind, faction,
    x: (gx + def.size / 2) * TILE, y: (gy + def.size / 2) * TILE,
    gx0: gx, gy0: gy, size: def.size, level: 1,
    hp: def.levels[0].hp, maxHp: def.levels[0].hp,
    alive: true, buildTimer, demolishTimer: 0, eyeMarked: 0, noHitTimer: 0, flash: 0, cd: 0,
    system,
  };
}

function respawnHero(state: GameState, h: Hero): void {
  const s = HERO_STATS[h.faction];
  const point = requireSpawn(state.session, h.faction);
  const p = gridToWorld(point.gx, point.gy);
  h.alive = true;
  h.hp = h.maxHp;
  h.mana = h.maxMana;
  h.x = p.x;
  h.y = p.y;
  h.cd = 0;
  h.invuln = 1;
  h.buffs = emptyBuffs();
  h.deathTimer = 0;
  addEffect(state, p.x, p.y, 70, h.faction === "elf" ? "#7ee08a" : "#ff8a5c");
  setHint(state, h.isPlayer ? "你已复活" : (h.isWolf ? "狼已复活" : "巨魔复活了"));
  void s;
}

export function getPlayer(state: GameState): Hero | undefined {
  return state.heroes.find((h) => h.isPlayer);
}

// ---------------------------------------------------------------- 碰撞 / 建造

function occupiedByBuilding(state: GameState, x: number, y: number, r: number, faction?: Faction): boolean {
  for (const b of state.buildings) {
    if (!b.alive || b.buildTimer > 0) continue;
    // 系统建筑不阻挡同阵营英雄，避免出生点商店/小屋把巨魔围死；玩家建筑正常碰撞。
    if (faction && b.faction === faction && b.system) continue;
    const half = (b.size * TILE) / 2;
    if (Math.abs(x - b.x) < half + r * 0.5 && Math.abs(y - b.y) < half + r * 0.5) return true;
  }
  return false;
}

/** Shared world/WPM clearance used by movement and real-map reachability checks. */
export function isPathingPositionFree(state: GameState, x: number, y: number, radius: number): boolean {
  // WPM is the pathing authority. Radius is only an INFERRED display/combat value
  // and must not invent body-clearance that falsely blocks official map paths.
  return isWorldPositionFree(pathingView(state), x, y, radius);
}

function positionFree(state: GameState, x: number, y: number, r: number, faction?: Faction): boolean {
  return isPathingPositionFree(state, x, y, r) && !occupiedByBuilding(state, x, y, r, faction);
}

function canMoveTo(state: GameState, h: Hero, nx: number, ny: number): boolean {
  return isWorldSegmentClear(pathingView(state), h.x, h.y, nx, ny)
    && positionFree(state, nx, ny, h.radius, h.faction);
}

function moveWithCollision(state: GameState, h: Hero, dx: number, dy: number): void {
  const nx = h.x + dx;
  const ny = h.y + dy;
  if (canMoveTo(state, h, nx, ny)) {
    h.x = nx;
    h.y = ny;
    return;
  }
  if (canMoveTo(state, h, nx, h.y)) h.x = nx;
  if (canMoveTo(state, h, h.x, ny)) h.y = ny;
}

function cellsFreeForBuilding(state: GameState, gx: number, gy: number, size: number): boolean {
  for (let y = gy; y < gy + size; y += 1) {
    for (let x = gx; x < gx + size; x += 1) {
      if (cellBlocked(state, x, y)) return false;
      for (const b of state.buildings) {
        if (!b.alive) continue;
        if (x >= b.gx0 && x < b.gx0 + b.size && y >= b.gy0 && y < b.gy0 + b.size) return false;
      }
    }
  }
  return true;
}

function requirementReason(state: GameState, kind: BuildKind, level: number, faction: Faction): string | null {
  const req = REQUIREMENTS[kind]?.find((r) => r.level === level);
  if (!req) return null;
  const met = state.buildings.some(
    (b) => b.alive && b.faction === faction && b.kind === req.need.kind
      && b.level >= req.need.level && b.buildTimer <= 0,
  );
  return met ? null : `需要先建造 ${BUILDINGS[req.need.kind].label} Lv${req.need.level}`;
}

export function canBuild(
  state: GameState,
  kind: BuildKind,
  gx: number,
  gy: number,
  faction: Faction = "elf",
): { ok: boolean; reason: string } {
  const def = BUILDINGS[kind];
  if (!def) return { ok: false, reason: "未知建筑" };
  const size = def.size;
  if (gx < 0 || gy < 0 || gx + size > state.session.grid.width || gy + size > state.session.grid.height) return { ok: false, reason: "超出地图" };
  if (!cellsFreeForBuilding(state, gx, gy, size)) return { ok: false, reason: "地块不可用" };
  // 原版「同时只能有一座作坊」，死亡时解除（通过存活计数自然实现）
  if (kind === "tent" && state.buildings.some((b) => b.alive && b.kind === "tent" && b.faction === faction)) {
    return { ok: false, reason: "每个精灵只能有一座作坊" };
  }
  const hero = faction === "elf" ? getPlayer(state) : state.heroes.find((h) => h.faction === "troll");
  const level = def.levels[0];
  if (hero && hero.gold < level.cost) return { ok: false, reason: "金币不足" };
  if (hero && hero.wood < (level.woodCost ?? 0)) return { ok: false, reason: "木材不足" };
  const missing = requirementReason(state, kind, 1, faction);
  if (missing) return { ok: false, reason: missing };
  return { ok: true, reason: "" };
}

export function tryBuild(state: GameState, kind: BuildKind, gx: number, gy: number, faction: Faction = "elf"): boolean {
  const check = canBuild(state, kind, gx, gy, faction);
  if (!check.ok) {
    setHint(state, check.reason);
    return false;
  }
  const def = BUILDINGS[kind];
  const hero = faction === "elf" ? getPlayer(state) : state.heroes.find((h) => h.faction === "troll");
  if (!hero) return false;
  hero.gold -= def.levels[0].cost;
  hero.wood -= def.levels[0].woodCost ?? 0;
  state.buildings.push(makeBuilding(state, kind, faction, gx, gy, def.buildTime));
  setHint(state, `正在建造${def.label}`);
  return true;
}

export function tryUpgrade(state: GameState, id: number): boolean {
  const b = state.buildings.find((x) => x.id === id && x.alive);
  if (!b) return false;
  const def = BUILDINGS[b.kind];
  if (b.level >= def.levels.length) {
    setHint(state, "已达最高等级");
    return false;
  }
  const spec = def.levels[b.level];
  const hero = b.faction === "elf" ? getPlayer(state) : state.heroes.find((h) => h.faction === b.faction);
  if (!hero || hero.gold < spec.cost) {
    setHint(state, "金币不足");
    return false;
  }
  if (hero.wood < (spec.woodCost ?? 0)) {
    setHint(state, "木材不足");
    return false;
  }
  const missing = requirementReason(state, b.kind, b.level + 1, b.faction);
  if (missing) {
    setHint(state, missing);
    return false;
  }
  hero.gold -= spec.cost;
  hero.wood -= spec.woodCost ?? 0;
  b.level += 1;
  b.maxHp = def.levels[b.level - 1].hp;
  b.hp = b.maxHp;
  b.buildTimer = 0.5;
  b.flash = 0.25;
  addEffect(state, b.x, b.y, b.size * TILE, "#ffd86b");
  setHint(state, `${def.label}升级到 Lv${b.level}`);
  return true;
}

// ---------------------------------------------------------------- 拆除 / 返还

export function canDemolish(state: GameState, id: number): { ok: boolean; reason: string } {
  const b = state.buildings.find((x) => x.id === id && x.alive);
  if (!b || b.faction !== "elf") return { ok: false, reason: "只能拆除自己的建筑" };
  if (b.hp / b.maxHp < DEMOLISH_RULE.minHpRatio) {
    return { ok: false, reason: `血量需 ≥ ${Math.round(DEMOLISH_RULE.minHpRatio * 100)}%` };
  }
  const heroRadius = DEMOLISH_RULE.enemyHeroRadius * SCALE;
  const troll = state.heroes.find((h) => h.faction === "troll" && h.alive);
  if (troll) {
    if (Math.hypot(troll.x - b.x, troll.y - b.y) <= heroRadius) {
      return { ok: false, reason: "附近有敌方英雄，暂时无法拆除" };
    }
    if (b.kind !== "tent" && b.eyeMarked > 0) {
      return { ok: false, reason: "被巨魔之眼照到的非作坊无法拆除" };
    }
  }
  return { ok: true, reason: "" };
}

export function demolishBuilding(state: GameState, id: number): boolean {
  const check = canDemolish(state, id);
  if (!check.ok) {
    setHint(state, check.reason);
    return false;
  }
  const b = state.buildings.find((x) => x.id === id)!;
  b.demolishTimer = DEMOLISH_RULE.delayedDeath; // 0.25 秒后走正常死亡链
  setHint(state, `正在拆除${BUILDINGS[b.kind].label}`);
  return true;
}

function refundTent(state: GameState, b: Building): void {
  if (b.kind !== "tent") return;
  const r = BUILDING_RULES.tent;
  const goldTable = Array.isArray(r.gold) ? r.gold : [r.gold];
  const woodTable = Array.isArray(r.wood) ? r.wood : [r.wood];
  let gold = 0;
  let wood = 0;
  for (let i = 0; i < b.level; i += 1) {
    gold += goldTable[i] ?? 0;
    wood += woodTable[i] ?? 0;
  }
  const hero = state.heroes.find((h) => h.faction === b.faction && h.isPlayer);
  if (hero) {
    hero.gold += gold;
    hero.wood += wood;
  }
  addFloat(state, b.x, b.y - 20, `+${gold} 金 +${wood} 木`, "#ffd86b", 13);
}

/** 免费维修墙/建筑（原版修理不消耗资源）。 */
export function repairWall(state: GameState, kind: BuildKind = "wall"): boolean {
  const list = state.buildings.filter(
    (b) => b.alive && b.faction === "elf" && b.kind === kind && b.buildTimer <= 0 && b.hp < b.maxHp,
  );
  if (!list.length) {
    setHint(state, `没有需要维修的${BUILDINGS[kind].label}`);
    return false;
  }
  const b = list.sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
  const ratio = REPAIR_RULE.timeRatios[Math.min(b.level - 1, REPAIR_RULE.timeRatios.length - 1)];
  b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * 0.4 * 4) / ratio);
  b.noHitTimer = REPAIR_RULE.delayAfterHit;
  addEffect(state, b.x, b.y, b.size * TILE, "#7ee08a");
  addFloat(state, b.x, b.y - 18, "已维修", "#7ee08a", 12);
  return true;
}

export function canUpgradeKind(state: GameState, kind: BuildKind): { ok: boolean; reason: string; cost: number; wood: number; level: number } {
  const def = BUILDINGS[kind];
  const b = state.buildings
    .filter((x) => x.alive && x.faction === "elf" && x.kind === kind)
    .sort((a, c) => a.level - c.level)[0];
  if (!b) return { ok: false, reason: `需要先建造${def.label}`, cost: 0, wood: 0, level: 0 };
  if (b.level >= def.levels.length) return { ok: false, reason: "已满级", cost: 0, wood: 0, level: b.level };
  const spec = def.levels[b.level];
  const hero = getPlayer(state);
  if (!hero || hero.gold < spec.cost) return { ok: false, reason: `需 ${spec.cost} 金`, cost: spec.cost, wood: spec.woodCost ?? 0, level: b.level };
  const missing = requirementReason(state, kind, b.level + 1, "elf");
  if (missing) return { ok: false, reason: missing, cost: spec.cost, wood: spec.woodCost ?? 0, level: b.level };
  return { ok: true, reason: "", cost: spec.cost, wood: spec.woodCost ?? 0, level: b.level };
}

export function upgradeKind(state: GameState, kind: BuildKind): boolean {
  const check = canUpgradeKind(state, kind);
  if (!check.ok) {
    setHint(state, check.reason);
    return false;
  }
  const b = state.buildings
    .filter((x) => x.alive && x.faction === "elf" && x.kind === kind)
    .sort((a, c) => a.level - c.level)[0];
  return b ? tryUpgrade(state, b.id) : false;
}

// ---------------------------------------------------------------- 战斗

interface DamageTarget {
  x: number;
  y: number;
  radius: number;
  hp: number;
  kind: "hero" | "building";
  ref: Hero | Building;
}

function hasLineOfSight(
  state: GameState,
  x1: number, y1: number, x2: number, y2: number,
  ignoreId?: number, faction?: Faction, buildings: Building[] = state.buildings,
): boolean {
  if (!hasWorldLineOfSight(pathingView(state), x1, y1, x2, y2)) return false;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const sampleUnits = state.session.pathing.cellUnits * SCALE;
  const steps = Math.max(1, Math.ceil(dist / (sampleUnits / 2)));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    const gx = Math.floor(px / TILE);
    const gy = Math.floor(py / TILE);
    // 建筑同样阻挡视线（原版墙体是实体）
    for (const b of buildings) {
      if (!b.alive || b.buildTimer > 0 || b.id === ignoreId || (faction && b.faction === faction && b.system)) continue;
      if (gx >= b.gx0 && gx < b.gx0 + b.size && gy >= b.gy0 && gy < b.gy0 + b.size) return false;
    }
  }
  return true;
}

function cellWalkable(state: GameState, gx: number, gy: number, faction: Faction, buildings: Building[] = state.buildings): boolean {
  if (cellBlocked(state, gx, gy)) return false;
  // Buildings still need a one-cell buffer; terrain is handled by the 32-unit
  // WPM movement checks, so adding a terrain margin here falsely closes real paths.
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = gx + dx;
      const ny = gy + dy;
      for (const b of buildings) {
        if (!b.alive || b.buildTimer > 0 || (b.faction === faction && b.system)) continue;
        if (nx >= b.gx0 && nx < b.gx0 + b.size && ny >= b.gy0 && ny < b.gy0 + b.size) return false;
      }
    }
  }
  return true;
}

/** 简易 BFS 寻路：绕开墙体与敌对建筑，返回世界坐标路点。 */
function findPath(
  state: GameState,
  sx: number, sy: number,
  gx: number, gy: number,
  faction: Faction,
  buildings: Building[] = state.buildings,
): Array<{ x: number; y: number }> {
  const startX = Math.floor(sx / TILE);
  const startY = Math.floor(sy / TILE);
  let goalX = Math.max(0, Math.min(state.session.grid.width - 1, Math.floor(gx / TILE)));
  let goalY = Math.max(0, Math.min(state.session.grid.height - 1, Math.floor(gy / TILE)));
  if (!cellWalkable(state, goalX, goalY, faction, buildings)) {
    let found = false;
    for (let r = 1; r <= 6 && !found; r += 1) {
      for (let dy = -r; dy <= r && !found; dy += 1) {
        for (let dx = -r; dx <= r && !found; dx += 1) {
          const nx = goalX + dx;
          const ny = goalY + dy;
          if (cellWalkable(state, nx, ny, faction, buildings)) {
            goalX = nx;
            goalY = ny;
            found = true;
          }
        }
      }
    }
    if (!found) return [];
  }
  const cells = findGridPath({
    width: state.session.grid.width,
    height: state.session.grid.height,
    start: { gx: startX, gy: startY },
    goal: { gx: goalX, gy: goalY },
    isWalkable: (x, y) => cellWalkable(state, x, y, faction, buildings),
  });
  return cells.map((cell) => ({
    x: (cell.gx + 0.5) * TILE,
    y: (cell.gy + 0.5) * TILE,
  }));
}

function heroTarget(state: GameState, h: Hero, maxRange: number): DamageTarget | null {
  let best: DamageTarget | null = null;
  let bestD = Infinity;
  for (const other of state.heroes) {
    if (!other.alive || other.faction === h.faction || other.invuln > 0) continue;
    if (other.buffs.windwalk > 0 && other.buffs.revealed <= 0) continue;
    if (!hasLineOfSight(state, h.x, h.y, other.x, other.y, undefined, h.faction)) continue;
    const d = Math.hypot(other.x - h.x, other.y - h.y) - other.radius;
    if (d <= maxRange && d < bestD) {
      bestD = d;
      best = { x: other.x, y: other.y, radius: other.radius, hp: other.hp, kind: "hero", ref: other };
    }
  }
  if (best) return best;
  if (h.faction === "troll") {
    for (const b of state.buildings) {
      if (!b.alive || b.buildTimer > 0 || b.faction === h.faction) continue;
      if (!hasLineOfSight(state, h.x, h.y, b.x, b.y, b.id, h.faction)) continue;
      const r = (b.size * TILE) / 2;
      const d = Math.hypot(b.x - h.x, b.y - h.y) - r;
      if (d <= maxRange && d < bestD) {
        bestD = d;
        best = { x: b.x, y: b.y, radius: r, hp: b.hp, kind: "building", ref: b };
      }
    }
  }
  return best;
}

function dealDamage(state: GameState, attacker: Hero, target: DamageTarget, raw: number): void {
  if (target.hp <= 0) return;
  if (target.kind === "hero" && (target.ref as Hero).invuln > 0) return;
  // 原版 Wind Walk：攻击即破隐，无自创飘字
  if (attacker.buffs.windwalk > 0) attacker.buffs.windwalk = 0;
  const amount = Math.floor(raw); // R2I 截断
  target.ref.hp -= amount;
  state.stats.damage += amount;
  // VERIFIED：伤害整数部分转金币，飘字只在攻击者处
  let goldGain = amount;
  const victim = target.kind === "hero" ? (target.ref as Hero) : null;
  if (
    state.mobileDev && victim?.faction === "elf"
    && !state.buildings.some((b) => b.alive && b.faction === "elf" && b.kind === "tent")
  ) {
    goldGain = Math.floor(goldGain * SCENARIO_RULE.elf.mobileDevGoldPenalty);
  }
  attacker.gold += goldGain;
  state.stats.goldEarned += goldGain;
  addFloat(state, attacker.x, attacker.y - 20, `+ ${goldGain}`, "#ffd86b", 12);
  if (attacker.faction === "troll" && COMBAT_RULE.lifestealModes.includes(state.mode)) {
    const heal = COMBAT_RULE.lifesteal * raw; // 0.22 × 真实伤害
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    addEffect(state, attacker.x, attacker.y, 22, "#7ee08a");
  }
  target.ref.flash = 0.16;
  if (target.kind === "building") (target.ref as Building).noHitTimer = 0;
  if (target.ref.hp <= 0) {
    if (target.kind === "building") destroyBuilding(state, target.ref as Building);
    else killHero(state, target.ref as Hero, attacker);
  }
}

function destroyBuilding(state: GameState, b: Building): void {
  b.alive = false;
  b.hp = 0;
  state.stats.destroyed += 1;
  refundTent(state, b); // VERIFIED：任何死亡都返还（含被巨魔拆）
  addEffect(state, b.x, b.y, b.size * TILE * 0.9, "#ffb26b");
}

function bountyMin(state: GameState): number {
  const table = BOUNTY_RULE.angelStoleGoldPerMinute;
  const minute = Math.floor(state.time / 60);
  const idx = Math.min(minute, BOUNTY_RULE.angelStoleCapIndex);
  const value = table[Math.min(idx, table.length - 1)] ?? 1;
  return value * BOUNTY_RULE.minMultiplier;
}

function killHero(state: GameState, h: Hero, attacker: Hero): void {
  h.alive = false;
  h.hp = 0;
  h.deathTimer = RESPAWN_RULE.elfCleanup;
  h.lives -= 1;
  state.stats.kills += 1;
  addEffect(state, h.x, h.y, h.faction === "troll" ? 120 : 70, "#ff6b6b");
  addFloat(state, h.x, h.y - 24, "倒下", "#ff8a8a", 16);
  // VERIFIED：floor(gold*0.5) + wood*8 → MIDDLE 折半 → 偷金下限 → 上限
  let bounty = Math.floor(h.gold * BOUNTY_RULE.goldRatio) + h.wood * BOUNTY_RULE.woodMultiplier;
  if (state.mode === "MIDDLE") bounty = Math.floor(bounty * BOUNTY_RULE.middleRatio);
  bounty = Math.max(bounty, bountyMin(state));
  bounty = Math.min(bounty, BOUNTY_RULE.max);
  attacker.gold += bounty;
  state.stats.goldEarned += bounty;
  addFloat(state, h.x, h.y - 42, `+ ${bounty}`, "#ffd86b", 14);
  // DOUBLE：巨魔死亡转狼（原版是角色切换，不用属性倍率/加命）
  if (h.faction === "troll" && state.rule === "DOUBLE" && !h.isWolf) {
    h.isWolf = true;
    h.deathTimer = RESPAWN_RULE.wolf;
    h.lives = 1;
    setHint(state, "巨魔转为幽灵狼，20 秒后复活");
  } else {
    setHint(state, h.isPlayer ? "你被击败" : "巨魔被击败");
  }
}

// ---------------------------------------------------------------- 更新

function updateTimers(state: GameState, dt: number): void {
  for (const h of state.heroes) {
    if (!h.alive) {
      if (h.deathTimer > 0) {
        h.deathTimer -= dt;
        if (h.deathTimer <= 0 && h.lives > 0) respawnHero(state, h);
      }
      continue;
    }
    h.invuln = Math.max(0, h.invuln - dt);
    const nearHouse = h.faction === "troll" && state.buildings.some(
      (b) => b.alive && b.kind === "trollHouse" && b.buildTimer <= 0
        && Math.hypot(h.x - b.x, h.y - b.y) <= (BUILDING_RULES.trollHouse.auraRange ?? 500) * SCALE,
    );
    h.cd = Math.max(0, h.cd - dt);
    h.mana = Math.min(h.maxMana, h.mana + h.manaRegen * dt);
    for (const k of ALL_SKILL_KEYS) h.cooldowns[k] = Math.max(0, h.cooldowns[k] - dt);
    if (nearHouse) {
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * (BUILDING_RULES.trollHouse.heal ?? 0.06) * dt);
      for (const k of ALL_SKILL_KEYS) h.cooldowns[k] = Math.max(0, h.cooldowns[k] - dt * 0.5);
    }
    for (const k of Object.keys(h.buffs) as (keyof Buffs)[]) h.buffs[k] = Math.max(0, h.buffs[k] - dt);
    if (h.channelTime > 0) {
      h.channelTime -= dt;
      if (h.channelTime <= 0) {
        h.channelTime = 0;
        const base = state.session.trollBase;
        const p = gridToWorld(base.gx, base.gy);
        h.x = p.x;
        h.y = p.y;
        h.invuln = 1;
        h.buffs.windwalk = 0;
      }
    }
    h.flash = Math.max(0, h.flash - dt);
  }
  for (const b of state.buildings) {
    b.flash = Math.max(0, b.flash - dt);
    b.noHitTimer += dt;
    // VERIFIED：修理不消耗资源，比率按等级 4/2.5/1.5/1/0.5/0.25
    if (
      b.alive && b.buildTimer <= 0 && b.hp < b.maxHp
      && b.noHitTimer >= REPAIR_RULE.delayAfterHit
    ) {
      const ratio = REPAIR_RULE.timeRatios[Math.min(b.level - 1, REPAIR_RULE.timeRatios.length - 1)];
      b.hp = Math.min(b.maxHp, b.hp + (REPAIR_RULE.baseHpPerSecond / ratio) * dt);
    }
    if (b.alive && b.buildTimer > 0) b.buildTimer = Math.max(0, b.buildTimer - dt);
    if (b.alive && b.eyeMarked > 0) b.eyeMarked = Math.max(0, b.eyeMarked - dt);
    if (b.alive && b.demolishTimer > 0) {
      b.demolishTimer -= dt;
      if (b.demolishTimer <= 0) {
        b.demolishTimer = 0;
        destroyBuilding(state, b);
      }
    }
  }
  state.relocateCd = Math.max(0, state.relocateCd - dt);
  state.effects = state.effects.filter((e) => (e.t += dt) < e.dur);
  state.floats = state.floats.filter((f) => (f.t += dt) < f.dur);
  if (state.hint && (state.hint.t -= dt) <= 0) state.hint = null;
}

function updateIncome(state: GameState, dt: number): void {
  state.incomeAcc += dt;
  while (state.incomeAcc >= 1) {
    state.incomeAcc -= 1;
    let elfIncome = 0;
    let trollIncome = 0;
    for (const b of state.buildings) {
      if (!b.alive || b.buildTimer > 0) continue;
      const income = BUILDINGS[b.kind].levels[b.level - 1].income ?? 0;
      if (b.faction === "elf") elfIncome += income;
      else trollIncome += income;
    }
    for (const h of state.heroes) {
      if (!h.alive) continue;
      const gain = (h.faction === "elf" ? elfIncome : trollIncome) + h.bonusIncome;
      if (gain > 0) {
        h.gold += gain;
        state.stats.goldEarned += gain;
      }
      // 跳字显示在产出建筑（小屋/作坊/矿）上，而不是英雄身上
      for (const b of state.buildings) {
        if (!b.alive || b.buildTimer > 0 || b.faction !== h.faction) continue;
        const income = BUILDINGS[b.kind].levels[b.level - 1].income ?? 0;
        if (income > 0) {
          addFloat(state, b.x, b.y - b.size * TILE * 0.5, `+${income} 金`, "#ffd86b", 11);
        }
      }
    }
  }
}

function updateHeroes(state: GameState, dt: number, input: InputState): void {
  for (const h of state.heroes) {
    if (!h.alive) continue;
    if (h.isPlayer) {
      let mx = input.mx || 0;
      let my = input.my || 0;
      const mag = Math.hypot(mx, my);
      if (mag > 0) {
        mx /= Math.max(1, mag);
        my /= Math.max(1, mag);
      }
      let speed = h.speed;
      if (h.buffs.haste > 0) speed *= 2.1;
      if (h.buffs.windwalk > 0) speed *= 1.5;
      if (h.buffs.berserk > 0) speed *= 1.5;
      if (h.buffs.root > 0) speed = 0;
      h.vx = mx * speed;
      h.vy = my * speed;
    }
    if (h.buffs.root > 0 || h.channelTime > 0) {
      h.vx = 0;
      h.vy = 0;
    }
    if (h.vx || h.vy) {
      moveWithCollision(state, h, h.vx * dt, h.vy * dt);
      h.facing = Math.atan2(h.vy, h.vx);
    }
    if (h.cd <= 0) {
      const target = heroTarget(state, h, h.range);
      if (target) {
        dealDamage(state, h, target, h.damage);
        h.facing = Math.atan2(target.y - h.y, target.x - h.x);
        h.cd = h.buffs.berserk > 0 ? h.interval * 0.5 : h.interval;
        addEffect(state, target.x, target.y, 18, h.faction === "elf" ? "#ffe08a" : "#ff8a5c");
      }
    }
  }
}

function updateBuildings(state: GameState, dt: number): void {
  for (const b of state.buildings) {
    if (!b.alive) continue;
    b.cd = Math.max(0, b.cd - dt);
    if (b.kind === "reveal" && b.buildTimer <= 0) {
      const r = BUILDINGS.reveal.levels[0].range ?? 112;
      for (const h of state.heroes) {
        if (h.alive && h.faction === "troll" && Math.hypot(h.x - b.x, h.y - b.y) <= r) {
          h.buffs.revealed = 1;
        }
      }
    }
    if (b.kind !== "tower" || b.buildTimer > 0 || b.cd > 0) continue;
    const spec = BUILDINGS[b.kind].levels[b.level - 1];
    const r = spec.range ?? 100;
    let target: Hero | null = null;
    let best = Infinity;
    for (const h of state.heroes) {
      if (!h.alive || h.faction === b.faction || h.invuln > 0) continue;
      const d = Math.hypot(h.x - b.x, h.y - b.y);
      if (d <= r && d < best) {
        best = d;
        target = h;
      }
    }
    if (target) {
      state.projectiles.push({
        id: state.nextId++, faction: b.faction,
        x: b.x, y: b.y - b.size * TILE * 0.4,
        tx: target.x, ty: target.y, speed: 420,
        damage: spec.damage ?? 4, t: 0,
      });
      b.cd = spec.interval ?? 1.5;
    }
  }
}

function updateProjectiles(state: GameState, dt: number): void {
  const keep: typeof state.projectiles = [];
  for (const p of state.projectiles) {
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const dist = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (dist <= step || dist < 6) {
      const attacker = state.heroes.find((h) => h.faction === p.faction && h.alive);
      for (const h of state.heroes) {
        if (!h.alive || h.faction === p.faction || h.invuln > 0) continue;
        if (Math.hypot(h.x - p.tx, h.y - p.ty) < h.radius + 14) {
          if (attacker) dealDamage(state, attacker, { x: h.x, y: h.y, radius: h.radius, hp: h.hp, kind: "hero", ref: h }, p.damage);
          else h.hp -= p.damage;
          for (const b of state.buildings) {
            if (b.alive && b.faction === p.faction) b.noHitTimer = 0;
          }
          break;
        }
      }
      addEffect(state, p.tx, p.ty, 20, "#ffe08a");
    } else {
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      p.t += dt;
      keep.push(p);
    }
  }
  state.projectiles = keep;
}

function nearShop(state: GameState, troll: Hero): boolean {
  const base = state.session.trollBase;
  const point = gridToWorld(base.gx, base.gy);
  return Math.hypot(troll.x - point.x, troll.y - point.y) <= EQUIPMENT_RULE.purchaseRadius;
}

function updateElfAI(state: GameState, dt: number, elf: Hero): void {
  const troll = createPerception(state, "elf").visibleEnemies().find((h) => h.faction === "troll");
  const danger = !!troll && Math.hypot(troll.x - elf.x, troll.y - elf.y) < 260;
  if (danger) {
    // 巨魔前期来袭：向远处房间转移，不硬拼
    const fx = 150 * TILE;
    const fy = 80 * TILE;
    const dx = fx - elf.x;
    const dy = fy - elf.y;
    const d = Math.hypot(dx, dy) || 1;
    elf.vx = (dx / d) * elf.speed;
    elf.vy = (dy / d) * elf.speed;
  } else {
    elf.vx = 0;
    elf.vy = 0;
  }
  state.aiTimer -= dt;
  if (state.aiTimer > 0) return;
  state.aiTimer = randomRange(state.rng, 4, 7);
  const elfSpawn = requireSpawn(state.session, "elf");
  const have = (kind: BuildKind) => state.buildings.some((b) => b.alive && b.faction === "elf" && b.kind === kind);
  const tryPlace = (kind: BuildKind): boolean => {
    for (let r = 2; r <= 9; r += 1) {
      for (let a = 0; a < 12; a += 1) {
        const ang = (a / 12) * Math.PI * 2;
        const gx = Math.round(elfSpawn.gx + Math.cos(ang) * r);
        const gy = Math.round(elfSpawn.gy + Math.sin(ang) * r);
        if (canBuild(state, kind, gx, gy, "elf").ok) return tryBuild(state, kind, gx, gy, "elf");
      }
    }
    return false;
  };
  if (!have("tent")) tryPlace("tent");
  if (!have("mine") || (have("mine") && elf.gold > 200)) tryPlace("mine");
  if (danger && (!have("tower") || elf.gold > 100)) tryPlace("tower");
}

function updateTrollAI(state: GameState, dt: number, troll: Hero): void {
  const perception = createPerception(state, "troll");
  const visibleBuildings = perception.visibleBuildings();
  const nextItem = EQUIPMENT_RULE.items.find((i) => !troll.items.includes(i.key));
  if (nextItem && nearShop(state, troll)) buyEquipment(state, nextItem.key);
  if (nearShop(state, troll) && troll.gold > 0) {
    const book = [...SCENARIO_RULE.troll.strengthBooks].reverse().find((b) => troll.gold >= b.gold);
    if (book) buyStrengthBook(state, book.key);
  }
  state.aiTimer -= dt;
  if (state.aiTimer <= 0) {
    state.aiTimer = randomRange(state.rng, 3, 5);
    if (troll.cooldowns.berserk <= 0 && troll.hp < troll.maxHp * 0.7) castSkillFor(state, troll, "berserk");
    else if (troll.cooldowns.windwalk <= 0) castSkillFor(state, troll, "windwalk");
    else if (troll.cooldowns.farSight <= 0 && visibleBuildings[0]) {
      castSkillFor(state, troll, "farSight", { x: visibleBuildings[0].x, y: visibleBuildings[0].y });
    }
    const house = state.buildings.find((b) => b.alive && b.kind === "trollHouse");
    if (house && troll.gold > BUILDINGS.trollHouse.levels[house.level]?.cost) tryUpgrade(state, house.id);
  }
  const elf = perception.visibleEnemies().find((h) => h.faction === "elf");
  const knownBuildings = perception.exploredResources();
  if (visibleBuildings.length) {
    state.aiMemory.lastSeen = { x: visibleBuildings[0].x, y: visibleBuildings[0].y };
  }
  const house = state.buildings.find((b) => b.alive && b.kind === "trollHouse");
  let tx: number;
  let ty: number;
  if (nextItem && troll.gold >= nextItem.gold && troll.hp > troll.maxHp * 0.5) {
    const base = state.session.trollBase;
    const point = gridToWorld(base.gx, base.gy);
    tx = point.x;
    ty = point.y;
  } else if (house && troll.hp < troll.maxHp * 0.35) {
    tx = house.x;
    ty = house.y;
  } else if (elf) {
    // 有墙先拆墙：只看当前视野与已探索建筑
    const blocker = knownBuildings
      .filter((b) => b.buildTimer <= 0)
      .sort((a, b) => {
        const ak = a.kind === "wall" ? 0 : 1;
        const bk = b.kind === "wall" ? 0 : 1;
        return ak - bk || Math.hypot(a.x - troll.x, a.y - troll.y) - Math.hypot(b.x - troll.x, b.y - troll.y);
      })[0];
    const elfDist = Math.hypot(elf.x - troll.x, elf.y - troll.y);
    const losBlocked = !hasLineOfSight(state, troll.x, troll.y, elf.x, elf.y, undefined, "troll", knownBuildings);
    if (blocker && (losBlocked || Math.hypot(blocker.x - troll.x, blocker.y - troll.y) < elfDist)) {
      tx = blocker.x;
      ty = blocker.y;
    } else {
      tx = elf.x;
      ty = elf.y;
    }
  } else if (knownBuildings.length) {
    const nearest = [...knownBuildings]
      .sort((a, b) => Math.hypot(a.x - troll.x, a.y - troll.y) - Math.hypot(b.x - troll.x, b.y - troll.y))[0];
    tx = nearest.x;
    ty = nearest.y;
  } else if (state.aiMemory.lastSeen) {
    tx = state.aiMemory.lastSeen.x;
    ty = state.aiMemory.lastSeen.y;
  } else {
    troll.vx = 0;
    troll.vy = 0;
    return;
  }
  const dx = tx - troll.x;
  const dy = ty - troll.y;
  const dist = Math.hypot(dx, dy);
  if (dist > troll.range + 6) {
    // BFS 寻路：绕开墙体与精灵建筑，沿路点前进
    state.pathTimer -= dt;
    if (Math.hypot(troll.x - state.stuckX, troll.y - state.stuckY) < 6) {
      state.stuckTimer += dt;
    } else {
      state.stuckTimer = 0;
      state.stuckX = troll.x;
      state.stuckY = troll.y;
    }
    if (state.stuckTimer > 1.2) {
      state.stuckTimer = 0;
      state.pathTimer = 0;
      // 贴墙时先尝试拆掉最近的已探索精灵建筑
      const wall = [...knownBuildings]
        .filter((b) => b.buildTimer <= 0)
        .sort((a, b) => Math.hypot(a.x - troll.x, a.y - troll.y) - Math.hypot(b.x - troll.x, b.y - troll.y))[0];
      if (wall) {
        tx = wall.x;
        ty = wall.y;
      }
    }
    if (state.pathTimer <= 0 || state.aiPath.length === 0) {
      state.pathTimer = 0.6;
      state.aiPath = findPath(state, troll.x, troll.y, tx, ty, "troll", knownBuildings);
      state.aiPathIdx = 0;
    }
    while (
      state.aiPathIdx < state.aiPath.length
      && Math.hypot(state.aiPath[state.aiPathIdx].x - troll.x, state.aiPath[state.aiPathIdx].y - troll.y) < TILE
    ) {
      state.aiPathIdx += 1;
    }
    const waypoint = state.aiPath[state.aiPathIdx] ?? { x: tx, y: ty };
    const mx = waypoint.x - troll.x;
    const my = waypoint.y - troll.y;
    const md = Math.hypot(mx, my) || 1;
    let speed = troll.speed;
    if (troll.buffs.haste > 0) speed *= 2.1;
    if (troll.buffs.windwalk > 0) speed *= 1.5;
    if (troll.buffs.berserk > 0) speed *= 1.5;
    if (troll.buffs.root > 0) speed = 0;
    troll.vx = (mx / md) * speed;
    troll.vy = (my / md) * speed;
  } else {
    state.aiPath = [];
    state.aiPathIdx = 0;
    troll.vx = 0;
    troll.vy = 0;
  }
}

function updateAI(state: GameState, dt: number): void {
  // 召唤的大法师自动追杀当前可见巨魔
  const mage = state.heroes.find((h) => h.isAlly && h.alive);
  const troll = mage
    ? createPerception(state, "elf").visibleEnemies().find((h) => h.faction === "troll")
    : undefined;
  if (mage && troll) {
    const dx = troll.x - mage.x;
    const dy = troll.y - mage.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > mage.range) {
      mage.vx = (dx / d) * mage.speed;
      mage.vy = (dy / d) * mage.speed;
    } else {
      mage.vx = 0;
      mage.vy = 0;
    }
  }
  const enemy = state.heroes.find((h) => !h.isPlayer && !h.isAlly);
  if (!enemy || !enemy.alive) return;
  if (enemy.faction === "troll") updateTrollAI(state, dt, enemy);
  else updateElfAI(state, dt, enemy);
}

function checkResult(state: GameState): void {
  if (state.result) return;
  // VERIFIED：300 秒仅精灵互享视野；600 秒让没作坊的精灵暴露给巨魔
  if (!state.elfShared && state.time >= VISION_RULE.elfShareAtSeconds) {
    state.elfShared = true;
    setHint(state, "精灵共享视野已开启");
  }
  if (!state.elfExposed && state.time >= VISION_RULE.exposeAtSeconds) {
    state.elfExposed = true;
    setHint(state, "没有作坊的精灵已暴露视野");
  }
  const elf = state.heroes.find((h) => h.faction === "elf" && !h.isAlly);
  const troll = state.heroes.find((h) => h.faction === "troll" && !h.isAlly);
  const trollOut = !!troll && troll.lives <= 0 && !troll.alive;
  const elfOut = !!elf && elf.lives <= 0 && !elf.alive;
  const elfWins = (): void => {
    state.result = state.playerFaction === "elf" ? "win" : "lose";
    state.phase = "over";
    setHint(state, state.playerFaction === "elf" ? "巨魔已被消灭，胜利！" : "精灵获胜，你失败了");
  };
  const trollWins = (reason: string): void => {
    state.result = state.playerFaction === "troll" ? "win" : "lose";
    state.phase = "over";
    setHint(state, state.playerFaction === "troll" ? `${reason}，胜利！` : `${reason}，失败`);
  };
  // VERIFIED：16 万力量胜利与 66 座 h096 召唤大法师由 OldEndLock 互斥，先触发者封印对方。
  if (
    state.endLock !== "elf" &&
    state.trollStrength >= SCENARIO_RULE.troll.strengthWin
  ) {
    state.endLock = "troll";
    const h = troll;
    if (h) {
      h.maxHp *= 10;
      h.damage *= 10;
      h.hp = h.maxHp;
    }
    trollWins("巨魔力量达到 16 万");
    return;
  }
  if (state.rule === "SURVIVE") {
    if (elfOut) trollWins("精灵倒下");
    return;
  }
  if (trollOut) elfWins();
  else if (elfOut) trollWins("所有精灵被消灭");
}

/** Stable 64-bit FNV-style hash, independent of visual-only arrays. */
export function stateHash(state: GameState): string {
  const payload = {
    version: 1,
    identity: {
      mode: state.mode,
      rule: state.rule,
      mapId: state.mapId,
      seed: state.seed,
      catalogVersion: state.catalogVersion,
      playerFaction: state.playerFaction,
      testMode: state.testMode,
    },
    rng: state.rng.state,
    aiMemory: state.aiMemory,
    trollStrength: state.trollStrength,
    mobileDev: state.mobileDev,
    mageSummoned: state.mageSummoned,
    endLock: state.endLock,
    relocateCd: state.relocateCd,
    aiPath: state.aiPath,
    aiPathIdx: state.aiPathIdx,
    pathTimer: state.pathTimer,
    stuckX: state.stuckX,
    stuckY: state.stuckY,
    stuckTimer: state.stuckTimer,
    elfShared: state.elfShared,
    elfExposed: state.elfExposed,
    woodPriceIn: state.woodPriceIn,
    woodPriceOut: state.woodPriceOut,
    time: state.time,
    phase: state.phase,
    result: state.result,
    trollSpawned: state.trollSpawned,
    incomeAcc: state.incomeAcc,
    aiTimer: state.aiTimer,
    nextId: state.nextId,
    stats: state.stats,
    blocked: hashBytes(state.blocked),
    heroes: state.heroes.map((h) => ({
      id: h.id, faction: h.faction, isPlayer: h.isPlayer, isWolf: h.isWolf,
      isAlly: h.isAlly, alive: h.alive, lives: h.lives, x: h.x, y: h.y,
      vx: h.vx, vy: h.vy, facing: h.facing, invuln: h.invuln, hp: h.hp,
      maxHp: h.maxHp, mana: h.mana, maxMana: h.maxMana, manaRegen: h.manaRegen,
      damage: h.damage, interval: h.interval, range: h.range,
      speed: h.speed, radius: h.radius, cd: h.cd, channelTime: h.channelTime,
      deathTimer: h.deathTimer, gold: h.gold, wood: h.wood, items: h.items,
      bonusIncome: h.bonusIncome, bonusLifesteal: h.bonusLifesteal,
      cooldowns: h.cooldowns, buffs: h.buffs,
    })),
    buildings: state.buildings.map((b) => ({
      id: b.id, kind: b.kind, faction: b.faction, x: b.x, y: b.y,
      gx0: b.gx0, gy0: b.gy0, size: b.size, level: b.level, hp: b.hp,
      maxHp: b.maxHp, alive: b.alive, buildTimer: b.buildTimer,
      demolishTimer: b.demolishTimer, eyeMarked: b.eyeMarked,
      noHitTimer: b.noHitTimer, cd: b.cd, system: b.system ?? false,
    })),
    projectiles: state.projectiles.map((p) => ({
      id: p.id, faction: p.faction, x: p.x, y: p.y, tx: p.tx, ty: p.ty,
      speed: p.speed, damage: p.damage, t: p.t,
    })),
  };
  return hashText(canonical(payload));
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  return JSON.stringify(value);
}

function hashText(text: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function hashBytes(bytes: Uint8Array): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i += 1) {
    first = Math.imul(first ^ bytes[i], 0x01000193);
    second = Math.imul(second ^ bytes[i], 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function stepGame(state: GameState, dt: number, input: InputState): void {
  if (state.result) return;
  state.time += dt;
  if (!state.trollSpawned && state.time >= RULE_PREP[state.rule]) spawnTroll(state);
  updateTimers(state, dt);
  updateIncome(state, dt);
  updateHeroes(state, dt, input);
  updateBuildings(state, dt);
  // 66 座塔后自动召唤大法师，无需按钮
  if (canSummonMage(state)) summonArchmage(state);
  updateProjectiles(state, dt);
  if (state.trollSpawned) updateAI(state, dt);
  checkResult(state);
}

// ---------------------------------------------------------------- 市场 / 装备

function hasMarket(state: GameState, faction: Faction): boolean {
  return state.buildings.some(
    (b) => b.alive && b.kind === "market" && b.faction === faction && b.buildTimer <= 0,
  );
}

/** VERIFIED：全局动态价格，买卖各 ±5，每次交易 10 木。 */
export function tradeWood(state: GameState, buy: boolean): boolean {
  const hero = getPlayer(state);
  if (!hero || !hasMarket(state, "elf")) {
    setHint(state, "需要先建造市场");
    return false;
  }
  const amount = MARKET_RULE.tradeAmount;
  if (buy) {
    if (hero.gold < state.woodPriceIn) {
      setHint(state, "金币不足");
      return false;
    }
    hero.gold -= state.woodPriceIn;
    hero.wood += amount;
  } else {
    if (hero.wood < amount) {
      setHint(state, "木材不足");
      return false;
    }
    hero.wood -= amount;
    hero.gold += state.woodPriceOut;
  }
  state.woodPriceIn = Math.min(MARKET_RULE.maxPrice, state.woodPriceIn + MARKET_RULE.priceStep);
  state.woodPriceOut = Math.max(MARKET_RULE.minPrice, state.woodPriceOut - MARKET_RULE.priceStep);
  addFloat(state, hero.x, hero.y - 30, `${buy ? "+" : "-"}${amount} 木`, "#bfe9ff", 12);
  return true;
}

export function canBuyEquipment(state: GameState, key: string): boolean {
  const troll = state.heroes.find((h) => h.faction === "troll" && h.alive);
  const item = EQUIPMENT_RULE.items.find((i) => i.key === key);
  if (!troll || !item || troll.items.includes(key)) return false;
  if (!nearShop(state, troll)) return false;
  return troll.gold >= item.gold && troll.wood >= (item.wood ?? 0);
}

export function buyEquipment(state: GameState, key: string): boolean {
  if (!canBuyEquipment(state, key)) return false;
  const item = EQUIPMENT_RULE.items.find((i) => i.key === key)!;
  const troll = state.heroes.find((h) => h.faction === "troll" && h.alive)!;
  troll.gold -= item.gold;
  troll.wood -= item.wood ?? 0;
  troll.items.push(key);
  if (item.damage) troll.damage += item.damage;
  if (item.allStats || item.strength) troll.maxHp += (item.strength ?? 0) * 10 + (item.allStats ?? 0) * 10;
  if (item.agility) troll.speed += item.agility;
  if (item.heroDamage) troll.damage += item.heroDamage;
  if (item.armor) troll.maxHp += item.armor * 5;
  if (item.speed) troll.speed += item.speed;
  if (item.magicImmune) troll.invuln = Math.max(troll.invuln, 5);
  addEffect(state, troll.x, troll.y, 48, "#ffd86b");
  addFloat(state, troll.x, troll.y - 30, item.label, "#ffd86b", 13);
  setHint(state, `巨魔购买 ${item.label}`);
  return true;
}

// ---------------------------------------------------------------- 核心玩法线

/** 精灵后期：66 座终极塔后召唤精灵大法师协助击杀巨魔。 */
export function canSummonMage(state: GameState): boolean {
  if (state.mageSummoned || state.endLock === "troll") return false;
  // VERIFIED：只有 h096 终极塔（tower Lv8）计入 OldFinalTowerManager 的 66 座统计。
  const towers = state.buildings.filter(
    (b) => b.alive && b.faction === "elf" && b.kind === "tower" && b.level >= 8 && b.buildTimer <= 0,
  ).length;
  return towers >= SCENARIO_RULE.elf.ultimateTowerCount;
}

export function summonArchmage(state: GameState): boolean {
  if (!canSummonMage(state)) {
    setHint(state, `需要 ${SCENARIO_RULE.elf.ultimateTowerCount} 座 h096 终极塔才能召唤大法师`);
    return false;
  }
  const spec = SCENARIO_RULE.elf.archmage;
  const mage = makeHero(state, "elf", false, getPlayer(state)?.x ?? 0, getPlayer(state)?.y ?? 0);
  mage.isAlly = true;
  mage.hp = spec.hp;
  mage.maxHp = spec.hp;
  mage.damage = spec.damage;
  mage.range = spec.range;
  mage.interval = spec.interval;
  state.heroes.push(mage);
  state.mageSummoned = true;
  state.endLock = "elf";
  addEffect(state, mage.x, mage.y, 120, "#bfe9ff");
  setHint(state, "精灵大法师已召唤！");
  return true;
}

/** 巨魔前期来找：精灵搬家到目标房间（保留作坊等级）。 */
export function relocateElf(state: GameState, gx: number, gy: number): boolean {
  if (state.relocateCd > 0) {
    setHint(state, `迁移冷却中 ${Math.ceil(state.relocateCd)}s`);
    return false;
  }
  const hero = getPlayer(state);
  const tent = state.buildings.find((b) => b.alive && b.faction === "elf" && b.kind === "tent");
  if (!hero || hero.faction !== "elf" || !tent) {
    setHint(state, "需要先拥有作坊");
    return false;
  }
  const level = tent.level;
  tent.alive = false;
  const fresh = makeBuilding(state, "tent", "elf", gx, gy, 0);
  fresh.level = level;
  fresh.maxHp = BUILDINGS.tent.levels[level - 1].hp;
  fresh.hp = fresh.maxHp;
  state.buildings.push(fresh);
  hero.x = fresh.x;
  hero.y = fresh.y;
  state.relocateCd = SCENARIO_RULE.elf.relocateCooldown;
  addEffect(state, hero.x, hero.y, 100, "#7ee08a");
  setHint(state, "已迁移到新家园");
  return true;
}

/** 游走发育：无作坊时降低巨魔打钱速度，避免变成提款机。 */
export function toggleMobileDev(state: GameState): boolean {
  state.mobileDev = !state.mobileDev;
  setHint(state, state.mobileDev ? "游走发育：巨魔打钱速度减半" : "固定发育");
  return state.mobileDev;
}

/** 巨魔购买力量之书，达到 16 万力量即获胜。 */
export function buyStrengthBook(state: GameState, key: string): boolean {
  const troll = state.heroes.find((h) => h.faction === "troll" && !h.isAlly);
  const book = SCENARIO_RULE.troll.strengthBooks.find((b) => b.key === key);
  if (!troll || !book || !nearShop(state, troll) || troll.gold < book.gold) return false;
  troll.gold -= book.gold;
  state.trollStrength += book.strength;
  addEffect(state, troll.x, troll.y, 60, "#ffd86b");
  addFloat(state, troll.x, troll.y - 36, book.label, "#ffd86b", 14);
  return true;
}

// ---------------------------------------------------------------- 技能

function findOpenNear(state: GameState, x: number, y: number): { x: number; y: number } {
  const clampedX = Math.max(TILE, Math.min(state.session.grid.world[0] - TILE, x));
  const clampedY = Math.max(TILE, Math.min(state.session.grid.world[1] - TILE, y));
  if (positionFree(state, clampedX, clampedY, 14)) return { x: clampedX, y: clampedY };
  for (let ring = 1; ring <= 8; ring += 1) {
    for (let a = 0; a < 16; a += 1) {
      const ang = (a / 16) * Math.PI * 2;
      const px = clampedX + Math.cos(ang) * ring * TILE;
      const py = clampedY + Math.sin(ang) * ring * TILE;
      if (positionFree(state, px, py, 14)) return { x: px, y: py };
    }
  }
  return { x: clampedX, y: clampedY };
}

function skillNumber(key: SkillKey, field: string, fallback: number): number {
  const value = RULES.skills[key]?.[field];
  return typeof value === "number" ? value : fallback;
}

function castSkillFor(state: GameState, hero: Hero, key: SkillKey, aim?: { x: number; y: number } | null): boolean {
  if (!hero.alive || hero.cooldowns[key] > 0) return false;
  if (hero.faction === "troll" && hero.buffs.silence > 0) return false;
  const spec = SKILLS[hero.faction].find((s) => s.key === key);
  if (!spec || hero.mana < spec.manaCost) return false;

  if (key === "blink") {
    const maxDist = skillNumber(key, "originalBlinkDistance", TILE * 12 / SCALE) * SCALE;
    let dx = Math.cos(hero.facing);
    let dy = Math.sin(hero.facing);
    let dist = maxDist;
    if (aim) {
      const ax = aim.x - hero.x;
      const ay = aim.y - hero.y;
      const mag = Math.hypot(ax, ay);
      if (mag > 1) {
        dx = ax / mag;
        dy = ay / mag;
        dist = Math.min(maxDist, mag);
      }
    }
    const to = findOpenNear(state, hero.x + dx * dist, hero.y + dy * dist);
    addEffect(state, hero.x, hero.y, 40, "#bfe9ff");
    hero.x = to.x;
    hero.y = to.y;
    addEffect(state, hero.x, hero.y, 50, "#bfe9ff");
  }
  if (key === "haste") hero.buffs.haste = spec.duration;
  if (key === "windwalk") hero.buffs.windwalk = spec.duration;
  if (key === "berserk") hero.buffs.berserk = spec.duration;
  if (key === "teleport") {
    hero.channelTime = skillNumber(key, "channel", 2);
    hero.vx = 0;
    hero.vy = 0;
  }
  if (key === "farSight") {
    const range = DEMOLISH_RULE.trollEyeRadius * SCALE;
    const point = aim ?? { x: hero.x, y: hero.y };
    const target = state.buildings
      .filter((b) => b.alive && b.faction === "elf" && Math.hypot(b.x - point.x, b.y - point.y) <= range)
      .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
    if (!target) return false;
    target.eyeMarked = spec.duration;
    addEffect(state, target.x, target.y, 40, "#ff9c7a");
    addFloat(state, target.x, target.y - 26, "巨魔之眼", "#ff9c7a", 12);
  }
  if (key === "entangle" || key === "silence") {
    const troll = state.heroes.find((h) => h.faction === "troll" && h.alive);
    const range = skillNumber(key, "originalCastRange", 0) * SCALE;
    if (
      !troll || range <= 0
      || Math.hypot(troll.x - hero.x, troll.y - hero.y) > range
      || !hasLineOfSight(state, hero.x, hero.y, troll.x, troll.y, undefined, hero.faction)
    ) {
      return false;
    }
    if (key === "entangle") troll.buffs.root = spec.duration;
    else troll.buffs.silence = spec.duration;
    addEffect(state, troll.x, troll.y, 34, "#9be7ff");
  }
  hero.mana -= spec.manaCost;
  hero.cooldowns[key] = skillNumber(key, "cooldown", spec.cd);
  addFloat(state, hero.x, hero.y - 26, spec.label, "#bfe9ff", 12);
  return true;
}

export function castSkill(state: GameState, key: SkillKey, aim?: { x: number; y: number } | null): boolean {
  const hero = getPlayer(state);
  if (!hero) return false;
  const ok = castSkillFor(state, hero, key, aim);
  if (!ok) {
    const spec = SKILLS[hero.faction].find((s) => s.key === key);
    if (!spec) setHint(state, "技能不可用");
    else if (hero.cooldowns[key] > 0) setHint(state, `${spec.label}冷却中`);
    else if (hero.mana < spec.manaCost) setHint(state, `法力不足（需要 ${spec.manaCost}）`);
    else setHint(state, `${spec.label}目标无效或超出范围`);
  }
  return ok;
}
