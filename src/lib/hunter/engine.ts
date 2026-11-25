import {
  BASE_POP,
  BUILDINGS,
  DIFFICULTY,
  ITEMS,
  MAX_POP,
  PHASE_LABEL,
  PHASE_RATIO,
  RESPAWN_FARMER,
  RESPAWN_HUNTER,
  SKILLS,
  START_GOLD,
  START_WOOD,
  TILE,
  UNITS,
  UPGRADES,
  phaseAllows,
} from "./config";
import {
  createMap,
  findPath,
  isBushAt,
  isStaticBlocked,
  nearestOpenTile,
  pixelToTile,
  terrainAtTile,
  tileCenter,
} from "./map";
import type {
  AIState,
  Building,
  BuildingKind,
  Command,
  Difficulty,
  DurationMin,
  GameEvent,
  GameEventKind,
  GameMap,
  GameResult,
  GameState,
  ItemKind,
  Phase,
  Projectile,
  Side,
  SideStats,
  SkillId,
  Unit,
  UnitKind,
  UpgradeKind,
  Vec,
} from "./types";

const ALL_SKILLS: SkillId[] = ["eye", "slam", "sentinel"];
const ALL_ITEMS: ItemKind[] = ["spray", "cdScroll", "regen", "dust", "bomb"];

function emptyStats(): SideStats {
  return { kills: 0, goldEarned: 0, goldSpent: 0, built: 0, hired: 0, lost: 0 };
}

function emptyAi(): AIState {
  return { think: 0, anchor: 0, base: null, nextEyeAt: 0, pushAt: 0, nextBuyAt: 0 };
}

function nextId(state: GameState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}${state.nextId}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function pushEvent(
  state: GameState,
  kind: GameEventKind,
  text: string,
  x: number,
  y: number,
  side?: Side
): void {
  state.eventSeq += 1;
  const event: GameEvent = { id: state.eventSeq, at: state.time, kind, text, x, y, side };
  state.events.push(event);
  if (state.events.length > 40) state.events.splice(0, state.events.length - 40);
}

export function addGold(state: GameState, side: Side, amount: number): void {
  state.gold[side] += amount;
  if (amount > 0) state.stats[side].goldEarned += amount;
}

export function spawnUnit(
  state: GameState,
  side: Side,
  kind: UnitKind,
  x: number,
  y: number
): Unit {
  const spec = UNITS[kind];
  const unit: Unit = {
    id: nextId(state, "u"),
    side,
    kind,
    x,
    y,
    hp: spec.hp,
    maxHp: spec.hp,
    atk: spec.atk,
    def: spec.def,
    range: spec.range,
    speed: spec.speed,
    attackInterval: spec.attackInterval,
    cooldown: 0,
    aggro: spec.aggro,
    vision: spec.vision,
    targetId: null,
    targetAt: 0,
    path: [],
    dest: null,
    repathAt: 0,
    stance: "follow",
    hidden: kind === "shadowScout",
    hiddenFor: 0,
    lastActionAt: 0,
    slowUntil: 0,
    slowFactor: 1,
    poisonUntil: 0,
    regenUntil: 0,
    hitFlashAt: 0,
    moving: false,
    facing: 1,
    isHero: !!spec.hero,
    livesLeft: spec.lives ?? 0,
    dead: false,
    respawnAt: 0,
    pop: spec.pop,
    produceTimer: 0,
    lumber: 0,
    chopTarget: null,
    chopTimer: 0,
    bounty: spec.bounty,
    homeX: x,
    homeY: y,
    expiresAt: 0,
    canSiege: !!spec.canSiege,
    animSeed: Math.random() * 1000,
  };
  state.units.push(unit);
  return unit;
}

export function unitById(state: GameState, id: string | null): Unit | null {
  if (!id) return null;
  return state.units.find((unit) => unit.id === id) ?? null;
}

export function buildingAt(state: GameState, tx: number, ty: number): Building | null {
  return state.buildings.find((b) => b.tx === tx && b.ty === ty) ?? null;
}

export function playerHero(state: GameState): Unit | null {
  return unitById(state, state.playerHeroId);
}

export function sideHero(state: GameState, side: Side): Unit | null {
  const kind: UnitKind = side === "farmer" ? "farmerHero" : "hunterHero";
  return state.units.find((unit) => unit.kind === kind && !unit.dead) ?? null;
}

export function phaseAt(state: GameState, time: number): Phase {
  const total = state.durationMin * 60;
  if (time >= total) return "over";
  const ratio = time / total;
  if (ratio >= PHASE_RATIO.expandEnd) return "reversal";
  if (ratio >= PHASE_RATIO.hideEnd) return "expand";
  return "hide";
}

export function remainingSeconds(state: GameState): number {
  return Math.max(0, state.durationMin * 60 - state.time);
}

export function createGame(opts: {
  side: Side;
  difficulty: Difficulty;
  durationMin: DurationMin;
  seed: number;
}): GameState {
  const map = createMap(opts.seed);
  const state: GameState = {
    version: 1,
    seed: opts.seed,
    map,
    side: opts.side,
    difficulty: opts.difficulty,
    durationMin: opts.durationMin,
    time: 0,
    phase: "hide",
    result: null,
    gold: { farmer: START_GOLD.farmer, hunter: START_GOLD.hunter },
    wood: { farmer: START_WOOD.farmer, hunter: START_WOOD.hunter },
    vision: {
      farmer: new Uint8Array(map.w * map.h),
      hunter: new Uint8Array(map.w * map.h),
    },
    units: [],
    buildings: [],
    projectiles: [],
    skillCd: {
      farmer: { eye: 0, slam: 0, sentinel: 0 },
      hunter: { eye: 0, slam: 0, sentinel: 0 },
    },
    stock: {
      farmer: { spray: 0, cdScroll: 0, regen: 0, dust: 0, bomb: 0 },
      hunter: { spray: 0, cdScroll: 0, regen: 0, dust: 0, bomb: 0 },
    },
    upgrades: {
      farmer: { bounty: false, atk: false, def: false },
      hunter: { bounty: false, atk: false, def: false },
    },
    reveal: [],
    rally: { farmer: null, hunter: null },
    events: [],
    eventSeq: 0,
    stats: { farmer: emptyStats(), hunter: emptyStats() },
    ai: { farmer: emptyAi(), hunter: emptyAi() },
    hunterReinforced: false,
    playerHeroId: "",
    nextId: 0,
    visionAt: 0,
    popUsed: { farmer: 0, hunter: 0 },
  };

  const farmerHero = spawnUnit(state, "farmer", "farmerHero", map.farmerCamp.x, map.farmerCamp.y);
  if (opts.side === "farmer") state.playerHeroId = farmerHero.id;
  const hunterHero = spawnUnit(state, "hunter", "hunterHero", map.hunterCamp.x, map.hunterCamp.y);
  if (opts.side === "hunter") state.playerHeroId = hunterHero.id;

  // 农民开局自带两名伐木农民，保证经济能起步
  spawnUnit(state, "farmer", "lumberjack", map.farmerCamp.x - 52, map.farmerCamp.y + 12);
  spawnUnit(state, "farmer", "lumberjack", map.farmerCamp.x + 40, map.farmerCamp.y + 30);

  pushEvent(state, "info", "对局开始，猎人正在搜索森林", map.hunterCamp.x, map.hunterCamp.y);
  pushEvent(state, "phase", "匿藏期：藏好并滚起经济", map.farmerCamp.x, map.farmerCamp.y, "farmer");

  updateVision(state);
  return state;
}

/** 综合阻挡判断：静态地形 + 建筑 */
export function blockedFn(state: GameState, ignoreBuildingId?: string) {
  const set = new Set<string>();
  for (const b of state.buildings) {
    if (b.id === ignoreBuildingId) continue;
    if (b.hp <= 0) continue;
    set.add(`${b.tx},${b.ty}`);
  }
  return (tx: number, ty: number): boolean => {
    if (isStaticBlocked(state.map, tx, ty)) return true;
    return set.has(`${tx},${ty}`);
  };
}

export function setUnitDestination(state: GameState, unit: Unit, x: number, y: number): void {
  const nx = clamp(x, TILE, (state.map.w - 1) * TILE);
  const ny = clamp(y, TILE, (state.map.h - 1) * TILE);
  unit.dest = { x: nx, y: ny };
  unit.repathAt = state.time + 0.5;
  unit.path = findPath(state.map, unit.x, unit.y, nx, ny, blockedFn(state));
}

function moveAlongPath(state: GameState, unit: Unit, dt: number): void {
  unit.moving = false;
  if (unit.path.length === 0) return;
  let budget = unit.speed * dt * (unit.slowUntil > state.time ? unit.slowFactor : 1);
  if (budget <= 0) return;
  unit.moving = true;
  for (let guard = 0; guard < 8 && budget > 0 && unit.path.length > 0; guard += 1) {
    const next = unit.path[0];
    const dx = next.x - unit.x;
    const dy = next.y - unit.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) {
      unit.path.shift();
      continue;
    }
    unit.facing = dx >= 0 ? 1 : -1;
    if (d <= budget) {
      unit.x = next.x;
      unit.y = next.y;
      budget -= d;
      unit.path.shift();
    } else {
      unit.x += (dx / d) * budget;
      unit.y += (dy / d) * budget;
      budget = 0;
      unit.moving = true;
    }
  }
}

/** 只渲染/判定视野内的实体，投降标记的单位使用此函数 */
export function isUnitVisibleTo(state: GameState, unit: Unit, viewer: Side): boolean {
  if (unit.dead) return false;
  if (unit.side === viewer) return true;
  if (!unit.hidden) {
    const { tx, ty } = pixelToTile(unit.x, unit.y);
    if (tx < 0 || ty < 0 || tx >= state.map.w || ty >= state.map.h) return false;
    return state.vision[viewer][ty * state.map.w + tx] === 2;
  }
  for (const zone of state.reveal) {
    if (zone.until >= state.time && Math.hypot(zone.x - unit.x, zone.y - unit.y) <= zone.r) {
      return true;
    }
  }
  for (const building of state.buildings) {
    const spec = BUILDINGS[building.kind];
    if (building.side !== viewer || !spec.reveal || building.hp <= 0) continue;
    if (Math.hypot(building.x - unit.x, building.y - unit.y) <= spec.reveal) return true;
  }
  for (const viewer_ of state.units) {
    if (viewer_.side !== viewer || viewer_.dead) continue;
    if (Math.hypot(viewer_.x - unit.x, viewer_.y - unit.y) <= 90) return true;
  }
  return false;
}

export function isBuildingVisibleTo(state: GameState, building: Building, viewer: Side): boolean {
  if (building.side === viewer) return true;
  const tx = building.tx;
  const ty = building.ty;
  if (tx < 0 || ty < 0 || tx >= state.map.w || ty >= state.map.h) return false;
  return state.vision[viewer][ty * state.map.w + tx] === 2;
}

function sourceVisionRadius(state: GameState, side: Side, base: number): number {
  const aiSide: Side = state.side === "farmer" ? "hunter" : "farmer";
  if (side === aiSide) return base * DIFFICULTY[state.difficulty].vision;
  return base;
}

export function updateVision(state: GameState): void {
  for (const side of ["farmer", "hunter"] as Side[]) {
    const w = state.map.w;
    const h = state.map.h;
    const vis = new Uint8Array(w * h);
    const mark = (x: number, y: number, radius: number) => {
      if (radius <= 0) return;
      const c = pixelToTile(x, y);
      const rTiles = Math.ceil(radius / TILE) + 1;
      const minX = Math.max(0, c.tx - rTiles);
      const maxX = Math.min(w - 1, c.tx + rTiles);
      const minY = Math.max(0, c.ty - rTiles);
      const maxY = Math.min(h - 1, c.ty + rTiles);
      for (let ty = minY; ty <= maxY; ty += 1) {
        for (let tx = minX; tx <= maxX; tx += 1) {
          const cx = tx * TILE + TILE / 2;
          const cy = ty * TILE + TILE / 2;
          if (Math.hypot(cx - x, cy - y) <= radius) vis[ty * w + tx] = 1;
        }
      }
    };
    for (const unit of state.units) {
      if (unit.side !== side || unit.dead) continue;
      mark(unit.x, unit.y, sourceVisionRadius(state, side, unit.vision));
    }
    for (const building of state.buildings) {
      if (building.side !== side || building.hp <= 0) continue;
      const spec = BUILDINGS[building.kind];
      const radius = Math.max(200, spec.reveal ?? 0);
      mark(building.x, building.y, sourceVisionRadius(state, side, radius));
    }
    const explored = state.vision[side];
    for (let i = 0; i < vis.length; i += 1) {
      if (vis[i]) explored[i] = 2;
      else if (explored[i] === 2) explored[i] = 1;
    }
  }
  state.visionAt = state.time;
}

function isRevealedTo(state: GameState, viewer: Side, unit: Unit): boolean {
  return isUnitVisibleTo(state, unit, viewer);
}

function findTarget(
  state: GameState,
  unit: Unit
): { unit?: Unit; building?: Building } | null {
  let bestUnit: Unit | null = null;
  let bestDist = Infinity;
  for (const other of state.units) {
    if (other.side === unit.side || other.dead) continue;
    if (other.kind === "owl" || other.kind === "eyeWard") continue;
    if (!isRevealedTo(state, unit.side, other)) continue;
    const d = Math.hypot(other.x - unit.x, other.y - unit.y);
    if (d <= unit.aggro && d < bestDist) {
      bestDist = d;
      bestUnit = other;
    }
  }
  if (bestUnit) return { unit: bestUnit };
  if (unit.canSiege) {
    let bestBuilding: Building | null = null;
    let bestBDist = Infinity;
    for (const b of state.buildings) {
      if (b.side === unit.side || b.hp <= 0) continue;
      if (!isBuildingVisibleTo(state, b, unit.side)) continue;
      const d = Math.hypot(b.x - unit.x, b.y - unit.y);
      if (d <= unit.aggro + 60 && d < bestBDist) {
        bestBDist = d;
        bestBuilding = b;
      }
    }
    if (bestBuilding) return { building: bestBuilding };
  }
  return null;
}

function spawnProjectile(
  state: GameState,
  side: Side,
  fromX: number,
  fromY: number,
  targetUnitId: string,
  targetX: number,
  targetY: number,
  damage: number,
  opts: { aoe?: number; slowFactor?: number; slowUntil?: number; poisonUntil?: number; color?: number } = {}
): void {
  const projectile: Projectile = {
    id: nextId(state, "p"),
    side,
    x: fromX,
    y: fromY,
    targetId: targetUnitId,
    targetBuilding: targetUnitId.startsWith("b"),
    speed: 460,
    damage,
    aoe: opts.aoe ?? 0,
    slowFactor: opts.slowFactor ?? 0,
    slowUntil: opts.slowUntil ?? 0,
    poisonUntil: opts.poisonUntil ?? 0,
    color: opts.color ?? (side === "hunter" ? 0xf87171 : 0x93c5fd),
    ttl: 2.5,
  };
  // 目标点缓存用于目标消失后的落点
  state.projectiles.push({ ...projectile, targetId: `${targetUnitId}|${Math.round(targetX)}|${Math.round(targetY)}` });
}

function splitTarget(ref: string): { id: string; x: number; y: number } {
  const [id, x, y] = ref.split("|");
  return { id, x: Number(x) || 0, y: Number(y) || 0 };
}

function damageUnit(
  state: GameState,
  target: Unit,
  damage: number,
  attackerSide: Side,
  opts: { slowFactor?: number; slowUntil?: number; poisonUntil?: number } = {}
): void {
  if (target.dead) return;
  target.hp -= damage;
  target.hitFlashAt = state.time;
  if (opts.slowUntil && opts.slowUntil > state.time) {
    target.slowUntil = opts.slowUntil;
    target.slowFactor = 1 - (opts.slowFactor ?? 0.3);
  }
  if (opts.poisonUntil && opts.poisonUntil > state.time) {
    target.poisonUntil = opts.poisonUntil;
  }
  if (target.hp <= 0) killUnit(state, target, attackerSide);
}

function damageBuilding(state: GameState, building: Building, damage: number, attackerSide: Side): void {
  if (building.hp <= 0) return;
  building.hp -= damage;
  building.flashAt = state.time;
  if (building.hp <= 0) {
    building.hp = 0;
    state.stats[attackerSide].kills += 1;
    pushEvent(
      state,
      "kill",
      `${BUILDINGS[building.kind].name}被摧毁`,
      building.x,
      building.y,
      building.side
    );
  }
}

function killUnit(state: GameState, unit: Unit, killerSide: Side): void {
  if (unit.dead) return;
  const spec = UNITS[unit.kind];
  state.stats[killerSide].kills += 1;
  state.stats[unit.side].lost += 1;
  if (killerSide !== unit.side) {
    const mult = state.upgrades[killerSide].bounty ? 1.5 : 1;
    const gold = Math.round(unit.bounty * mult);
    if (gold > 0) addGold(state, killerSide, gold);
  }
  pushEvent(state, "death", `${spec.name}阵亡`, unit.x, unit.y, unit.side);

  if (unit.isHero) {
    unit.hp = 0;
    unit.dead = true;
    unit.path = [];
    unit.dest = null;
    if (unit.side === "hunter") {
      unit.livesLeft -= 1;
      unit.respawnAt = state.time + RESPAWN_HUNTER;
    } else {
      const penalty = Math.floor(state.gold.farmer * 0.1);
      state.gold.farmer = Math.max(0, state.gold.farmer - penalty);
      unit.respawnAt = state.time + RESPAWN_FARMER;
    }
  } else {
    unit.hp = 0;
    unit.dead = true;
    unit.respawnAt = Infinity;
  }
}

function respawnHero(state: GameState, unit: Unit): void {
  const camp = unit.side === "farmer" ? state.map.farmerCamp : state.map.hunterCamp;
  unit.dead = false;
  unit.hp = unit.maxHp;
  unit.x = camp.x + (Math.random() * 40 - 20);
  unit.y = camp.y + (Math.random() * 40 - 20);
  unit.path = [];
  unit.dest = null;
  unit.targetId = null;
  unit.hidden = false;
  unit.slowUntil = 0;
  unit.slowFactor = 1;
  unit.poisonUntil = 0;
  unit.cooldown = 0;
  pushEvent(state, "info", `${UNITS[unit.kind].name}已在营地复活`, unit.x, unit.y, unit.side);
}

function performAttack(
  state: GameState,
  unit: Unit,
  target: { unit?: Unit; building?: Building }
): void {
  if (unit.cooldown > 0) return;
  unit.cooldown = unit.attackInterval;
  unit.lastActionAt = state.time;
  unit.hidden = false;
  const atkBuff = state.upgrades[unit.side].atk ? 1.15 : 1;
  const atk = unit.atk * atkBuff;
  if (target.unit) {
    const def = target.unit.def + (state.upgrades[target.unit.side].def ? 3 : 0);
    let damage = Math.max(1, atk - def * 0.6);
    damage *= 1;
    if (unit.range > 80) {
      spawnProjectile(state, unit.side, unit.x, unit.y, target.unit.id, target.unit.x, target.unit.y, damage, {
        slowFactor: unit.kind === "frostShaman" ? 0.3 : 0,
        slowUntil: unit.kind === "frostShaman" ? state.time + 2 : 0,
      });
    } else {
      damageUnit(state, target.unit, damage, unit.side);
    }
  } else if (target.building) {
    let damage = Math.max(1, atk);
    if (unit.canSiege) damage *= 2;
    if (unit.range > 80) {
      spawnProjectile(
        state,
        unit.side,
        unit.x,
        unit.y,
        target.building.id,
        target.building.x,
        target.building.y,
        damage
      );
    } else {
      damageBuilding(state, target.building, damage, unit.side);
    }
  }
}

function followLeader(state: GameState, unit: Unit): void {
  // 英雄的移动由 AI 或玩家指令直接控制，不能被跟随逻辑覆盖
  if (unit.isHero) return;
  const leader = sideHero(state, unit.side);
  if (!leader) return;
  if (unit.stance === "attack") {
    const enemyCamp = unit.side === "farmer" ? state.map.hunterCamp : state.map.farmerCamp;
    setUnitDestination(state, unit, enemyCamp.x, enemyCamp.y);
    return;
  }
  const rally = state.rally[unit.side];
  const anchor = unit.stance === "guard" && rally ? rally : { x: leader.x, y: leader.y };
  const d = Math.hypot(anchor.x - unit.x, anchor.y - unit.y);
  if (d > TILE * 4.5) {
    const jitter = (unit.animSeed % 10) * 6 - 30;
    setUnitDestination(state, unit, anchor.x + jitter, anchor.y + jitter);
  }
}

function updateLumberjack(state: GameState, unit: Unit, dt: number): void {
  // 看到敌人就逃回营地
  const threat = state.units.find(
    (other) =>
      other.side !== unit.side &&
      !other.dead &&
      other.canSiege &&
      isUnitVisibleTo(state, other, unit.side) &&
      Math.hypot(other.x - unit.x, other.y - unit.y) < 170
  );
  if (threat) {
    const camp = state.map.farmerCamp;
    if (Math.hypot(camp.x - unit.x, camp.y - unit.y) > 90) {
      if (unit.repathAt < state.time) setUnitDestination(state, unit, camp.x, camp.y);
      moveAlongPath(state, unit, dt);
      unit.lastActionAt = state.time;
    }
    return;
  }

  const valid =
    unit.chopTarget &&
    terrainAtTile(state.map, unit.chopTarget.tx, unit.chopTarget.ty) === "tree" &&
    state.map.trees[unit.chopTarget.ty * state.map.w + unit.chopTarget.tx] > 0;
  if (!valid) {
    unit.chopTarget = null;
    const here = pixelToTile(unit.x, unit.y);
    let best: { tx: number; ty: number; d: number } | null = null;
    const radius = 12;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const tx = here.tx + dx;
        const ty = here.ty + dy;
        if (tx < 0 || ty < 0 || tx >= state.map.w || ty >= state.map.h) continue;
        if (state.map.trees[ty * state.map.w + tx] <= 0) continue;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { tx, ty, d };
      }
    }
    if (best) unit.chopTarget = { tx: best.tx, ty: best.ty };
  }

  if (unit.chopTarget) {
    const c = tileCenter(unit.chopTarget.tx, unit.chopTarget.ty);
    const d = Math.hypot(c.x - unit.x, c.y - unit.y);
    if (d > TILE * 1.15) {
      if (unit.repathAt < state.time) setUnitDestination(state, unit, c.x, c.y);
      moveAlongPath(state, unit, dt);
      unit.lastActionAt = state.time;
      return;
    }
    unit.path = [];
    unit.moving = false;
    unit.chopTimer += dt;
    const interval = UNITS.lumberjack.lumberInterval ?? 4;
    if (unit.chopTimer >= interval) {
      unit.chopTimer = 0;
      const index = unit.chopTarget.ty * state.map.w + unit.chopTarget.tx;
      if (state.map.trees[index] > 0) {
        state.map.trees[index] -= 1;
        state.wood.farmer += 1;
        unit.lumber += 1;
        unit.lastActionAt = state.time;
        if (state.map.trees[index] <= 0) {
          state.map.terrain[index] = 1; // 变为灌木
          unit.chopTarget = null;
          pushEvent(state, "info", "树木被砍倒", c.x, c.y, "farmer");
        }
      }
    }
  }
}

function updateUnit(state: GameState, unit: Unit, dt: number): void {
  if (unit.dead) return;
  const spec = UNITS[unit.kind];

  if (unit.regenUntil > state.time) unit.hp = Math.min(unit.maxHp, unit.hp + 8 * dt);
  if (unit.poisonUntil > state.time) {
    unit.hp -= 5 * dt;
    if (unit.hp <= 0) {
      killUnit(state, unit, unit.side === "farmer" ? "hunter" : "farmer");
      return;
    }
  }
  if (unit.cooldown > 0) unit.cooldown = Math.max(0, unit.cooldown - dt);
  if (unit.slowUntil <= state.time) unit.slowFactor = 1;

  if (spec.incomeInterval && spec.incomeGold) {
    unit.produceTimer += dt;
    if (unit.produceTimer >= spec.incomeInterval) {
      unit.produceTimer = 0;
      addGold(state, unit.side, spec.incomeGold);
    }
    return;
  }

  if (unit.kind === "eyeWard" || unit.kind === "owl") {
    if (unit.expiresAt > 0 && state.time >= unit.expiresAt) unit.dead = true;
    return;
  }

  if (unit.kind === "lumberjack") {
    updateLumberjack(state, unit, dt);
    return;
  }

  const isPlayerHero = unit.id === state.playerHeroId;
  const hasCombat = unit.atk > 0 && unit.attackInterval > 0;

  if (hasCombat) {
    if (unit.targetAt <= state.time) {
      const target = findTarget(state, unit);
      unit.targetId = target?.unit?.id ?? target?.building?.id ?? null;
      unit.targetAt = state.time + 0.5;
    }
    if (unit.targetId) {
      const targetUnit = state.units.find((u) => u.id === unit.targetId && !u.dead) ?? null;
      const targetBuilding = state.buildings.find((b) => b.id === unit.targetId && b.hp > 0) ?? null;
      const tx = targetUnit?.x ?? targetBuilding?.x;
      const ty = targetUnit?.y ?? targetBuilding?.y;
      if (tx !== undefined && ty !== undefined) {
        const d = Math.hypot(tx - unit.x, ty - unit.y);
        if (d <= unit.range + 10) {
          unit.path = [];
          unit.moving = false;
          unit.facing = tx >= unit.x ? 1 : -1;
          performAttack(state, unit, targetUnit ? { unit: targetUnit } : { building: targetBuilding ?? undefined });
          return;
        }
        if (unit.repathAt < state.time) {
          setUnitDestination(state, unit, tx, ty);
        }
      } else {
        unit.targetId = null;
      }
    }
  }

  if (unit.path.length > 0) {
    if (isPlayerHero) unit.lastActionAt = state.time;
    moveAlongPath(state, unit, dt);
    return;
  }

  if (isPlayerHero) {
    unit.moving = false;
    return;
  }

  if (hasCombat && !unit.isHero) {
    if (unit.repathAt < state.time) {
      followLeader(state, unit);
      unit.repathAt = state.time + 2;
    }
    moveAlongPath(state, unit, dt);
  }
}

function updateBuilding(state: GameState, building: Building, dt: number): void {
  if (building.hp <= 0) return;
  const spec = BUILDINGS[building.kind];

  if (spec.income) {
    building.produceTimer += dt;
    if (building.produceTimer >= spec.income.interval && building.produced < spec.income.max) {
      building.produceTimer = 0;
      building.produced += 1;
      const spot = nearestOpenTile(
        state.map,
        building.tx + ((building.produced % 3) - 1) * 1,
        building.ty + 2,
        blockedFn(state)
      );
      const point = spot ? tileCenter(spot.tx, spot.ty) : { x: building.x, y: building.y + TILE };
      spawnUnit(state, building.side, spec.income.kind, point.x, point.y);
    }
  }

  if (spec.produceWood) {
    building.produceTimer += dt;
    if (building.produceTimer >= spec.produceWood.interval) {
      building.produceTimer = 0;
      state.wood[building.side] += spec.produceWood.amount;
    }
  }

  if (spec.produceUnit) {
    building.produceTimer += dt;
    const alive = state.units.filter(
      (u) => u.side === building.side && u.kind === spec.produceUnit?.kind && !u.dead
    ).length;
    if (building.produceTimer >= spec.produceUnit.interval && alive < spec.produceUnit.max) {
      building.produceTimer = 0;
      spawnUnit(state, building.side, spec.produceUnit.kind, building.x + 20, building.y + 20);
    }
  }

  if (spec.produceBomb) {
    building.produceTimer += dt;
    if (
      building.produceTimer >= spec.produceBomb.interval &&
      state.stock[building.side].bomb < spec.produceBomb.max
    ) {
      building.produceTimer = 0;
      state.stock[building.side].bomb += 1;
    }
  }

  if (spec.auraSlow) {
    for (const unit of state.units) {
      if (unit.side === building.side || unit.dead) continue;
      if (Math.hypot(unit.x - building.x, unit.y - building.y) <= spec.auraSlow.range) {
        unit.slowUntil = Math.max(unit.slowUntil, state.time + 0.6);
        unit.slowFactor = 1 - spec.auraSlow.factor;
      }
    }
  }

  if (spec.tower) {
    building.cooldown = Math.max(0, building.cooldown - dt);
    if (building.cooldown <= 0) {
      let target: Unit | null = null;
      let best = Infinity;
      for (const unit of state.units) {
        if (unit.side === building.side || unit.dead) continue;
        if (unit.kind === "owl" || unit.kind === "eyeWard") continue;
        if (!isRevealedTo(state, building.side, unit)) continue;
        const d = Math.hypot(unit.x - building.x, unit.y - building.y);
        if (d <= spec.tower.range && d < best) {
          best = d;
          target = unit;
        }
      }
      if (target) {
        building.cooldown = spec.tower.interval;
        const buff = state.upgrades[building.side].atk ? 1.15 : 1;
        const damage = Math.max(1, spec.tower.atk * buff - target.def * 0.6);
        spawnProjectile(
          state,
          building.side,
          building.x,
          building.y - 16,
          target.id,
          target.x,
          target.y,
          damage,
          {
            aoe: spec.tower.aoe ?? 0,
            slowFactor: spec.tower.slow ?? 0,
            slowUntil: spec.tower.slow ? state.time + 2 : 0,
            poisonUntil: spec.tower.poison ? state.time + 4 : 0,
            color: spec.tower.poison ? 0x84cc16 : 0xfbbf24,
          }
        );
      }
    }
  }
}

function updateProjectiles(state: GameState, dt: number): void {
  const alive: Projectile[] = [];
  for (const projectile of state.projectiles) {
    const ref = splitTarget(projectile.targetId);
    const targetUnit = state.units.find((u) => u.id === ref.id && !u.dead) ?? null;
    const targetBuilding = state.buildings.find((b) => b.id === ref.id && b.hp > 0) ?? null;
    const tx = targetUnit?.x ?? targetBuilding?.x ?? ref.x;
    const ty = targetUnit?.y ?? targetBuilding?.y ?? ref.y;
    projectile.ttl -= dt;
    if (projectile.ttl <= 0) continue;
    const dx = tx - projectile.x;
    const dy = ty - projectile.y;
    const d = Math.hypot(dx, dy);
    const step = projectile.speed * dt;
    if (d > step + 6) {
      projectile.x += (dx / d) * step;
      projectile.y += (dy / d) * step;
      alive.push(projectile);
      continue;
    }
    // 命中
    if (projectile.aoe > 0) {
      for (const unit of state.units) {
        if (unit.side === projectile.side || unit.dead) continue;
        if (Math.hypot(unit.x - tx, unit.y - ty) <= projectile.aoe) {
          damageUnit(state, unit, projectile.damage, projectile.side);
        }
      }
    } else if (targetUnit) {
      damageUnit(state, targetUnit, projectile.damage, projectile.side, {
        slowFactor: projectile.slowFactor,
        slowUntil: projectile.slowUntil,
        poisonUntil: projectile.poisonUntil,
      });
    } else if (targetBuilding) {
      damageBuilding(state, targetBuilding, projectile.damage, projectile.side);
    }
    pushEvent(state, "hit", "", tx, ty, projectile.side);
  }
  state.projectiles = alive;
}

function separateUnits(state: GameState): void {
  const mobile = state.units.filter((u) => !u.dead && u.speed > 0);
  for (let i = 0; i < mobile.length; i += 1) {
    for (let j = i + 1; j < mobile.length; j += 1) {
      const a = mobile[i];
      const b = mobile[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 13) {
        const push = (13 - d) * 0.35;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

function hunterHeroAlive(state: GameState): boolean {
  return state.units.some((unit) => unit.kind === "hunterHero" && unit.livesLeft > 0);
}

function finish(state: GameState, winner: Side, reason: GameResult["reason"]): void {
  if (state.result) return;
  state.result = { winner, reason };
  state.phase = "over";
  pushEvent(
    state,
    "win",
    winner === "farmer" ? "猎人全部倒下，农民获胜！" : "计时结束，猎人存活获胜！",
    winner === "farmer" ? state.map.hunterCamp.x : state.map.farmerCamp.x,
    winner === "farmer" ? state.map.hunterCamp.y : state.map.farmerCamp.y
  );
}

function refreshPop(state: GameState): void {
  for (const side of ["farmer", "hunter"] as Side[]) {
    let used = 0;
    for (const unit of state.units) {
      if (unit.side === side && !unit.dead) used += unit.pop;
    }
    state.popUsed[side] = used;
  }
}

export function popCap(state: GameState, side: Side): number {
  let bonus = 0;
  for (const building of state.buildings) {
    if (building.side !== side || building.hp <= 0) continue;
    bonus += BUILDINGS[building.kind].popBonus ?? 0;
  }
  return Math.min(MAX_POP, BASE_POP + bonus);
}

export function stepGame(state: GameState, dt: number): void {
  if (state.result) return;
  const clamped = Math.min(0.25, Math.max(0, dt));
  if (clamped <= 0) return;
  state.time += clamped;

  // 阶段推进
  const nextPhase = phaseAt(state, state.time);
  if (nextPhase !== state.phase) {
    state.phase = nextPhase;
    if (nextPhase !== "over") {
      pushEvent(
        state,
        "phase",
        `进入${PHASE_LABEL[nextPhase]}`,
        state.map.farmerCamp.x,
        state.map.farmerCamp.y
      );
    }
    if (nextPhase === "reversal" && !state.hunterReinforced) {
      state.hunterReinforced = true;
      const hunter = spawnUnit(
        state,
        "hunter",
        "hunterHero",
        state.map.hunterCamp.x + 40,
        state.map.hunterCamp.y + 40
      );
      hunter.livesLeft = 3;
      // 玩家玩猎人时，接管增援英雄，避免主英雄三条命耗尽后无事可做
      if (state.side === "hunter") state.playerHeroId = hunter.id;
      pushEvent(
        state,
        "phase",
        "猎人增援抵达！",
        hunter.x,
        hunter.y,
        "hunter"
      );
    }
  }

  // 技能冷却
  for (const side of ["farmer", "hunter"] as Side[]) {
    for (const skill of ALL_SKILLS) {
      state.skillCd[side][skill] = Math.max(0, state.skillCd[side][skill] - clamped);
    }
  }

  // 复活
  for (const unit of state.units) {
    if (!unit.dead || !unit.isHero) continue;
    // 猎人 3 条命耗尽后不再复活；农民英雄无限复活
    if (unit.kind === "hunterHero" && unit.livesLeft <= 0) continue;
    if (unit.respawnAt === Infinity) continue;
    if (state.time >= unit.respawnAt) respawnHero(state, unit);
  }

  // 单位更新
  const snapshot = [...state.units];
  for (const unit of snapshot) {
    if (unit.dead) continue;
    updateUnit(state, unit, clamped);
    // 隐蔽判定
    if (unit.side === "farmer" && !unit.dead) {
      const bush = isBushAt(state.map, unit.x, unit.y);
      if (bush && !unit.moving && state.time - unit.lastActionAt > 2) {
        unit.hidden = true;
      } else if (unit.hidden) {
        unit.hidden = false;
      }
    }
    if (unit.kind === "shadowScout" && !unit.dead) unit.hidden = true;
  }

  // 建筑更新
  for (const building of state.buildings) {
    updateBuilding(state, building, clamped);
  }

  updateProjectiles(state, clamped);
  separateUnits(state);

  // 清理：死亡单位移除，但英雄保留在列表里等待复活（农民英雄无限复活）
  state.units = state.units.filter((unit) => !unit.dead || unit.isHero);
  state.buildings = state.buildings.filter((building) => building.hp > 0);
  state.reveal = state.reveal.filter((zone) => zone.until >= state.time);

  refreshPop(state);

  if (state.time - state.visionAt > 0.2) updateVision(state);

  // 胜负
  if (!hunterHeroAlive(state)) {
    finish(state, "farmer", "wiped");
    return;
  }
  if (state.time >= state.durationMin * 60) {
    finish(state, "hunter", "timeout");
  }
}

/** 距离任意己方单位/建筑不超过该值才能建造 */
function inBuildRange(state: GameState, side: Side, x: number, y: number): boolean {
  for (const unit of state.units) {
    if (unit.side !== side || unit.dead) continue;
    if (Math.hypot(unit.x - x, unit.y - y) <= 520) return true;
  }
  for (const building of state.buildings) {
    if (building.side !== side || building.hp <= 0) continue;
    if (Math.hypot(building.x - x, building.y - y) <= 420) return true;
  }
  return false;
}

export function canPlace(state: GameState, side: Side, kind: BuildingKind, tx: number, ty: number): boolean {
  const spec = BUILDINGS[kind];
  if (spec.side !== side) return false;
  if (!phaseAllows(spec.unlock, state.phase)) return false;
  if (tx < 1 || ty < 1 || tx >= state.map.w - 1 || ty >= state.map.h - 1) return false;
  if (isStaticBlocked(state.map, tx, ty)) return false;
  if (buildingAt(state, tx, ty)) return false;
  const center = tileCenter(tx, ty);
  return inBuildRange(state, side, center.x, center.y);
}

export function tryBuild(
  state: GameState,
  side: Side,
  kind: BuildingKind,
  tx: number,
  ty: number
): boolean {
  const spec = BUILDINGS[kind];
  if (!canPlace(state, side, kind, tx, ty)) return false;
  if (state.gold[side] < spec.costGold || state.wood[side] < spec.costWood) return false;
  state.gold[side] -= spec.costGold;
  state.wood[side] -= spec.costWood;
  state.stats[side].goldSpent += spec.costGold;
  const center = tileCenter(tx, ty);
  const building: Building = {
    id: nextId(state, "b"),
    side,
    kind,
    tx,
    ty,
    x: center.x,
    y: center.y,
    hp: spec.hp,
    maxHp: spec.hp,
    cooldown: 0,
    produceTimer: 0,
    produced: 0,
    flashAt: 0,
    atk: spec.tower?.atk ?? 0,
    range: spec.tower?.range ?? 0,
  };
  state.buildings.push(building);
  state.stats[side].built += 1;
  pushEvent(state, "build", `建造了${spec.name}`, center.x, center.y, side);
  refreshPop(state);
  return true;
}

export function sellBuilding(state: GameState, side: Side, id: string): boolean {
  const building = state.buildings.find((b) => b.id === id && b.side === side);
  if (!building) return false;
  const spec = BUILDINGS[building.kind];
  state.gold[side] += Math.floor(spec.costGold * 0.5);
  state.wood[side] += Math.floor(spec.costWood * 0.5);
  state.buildings = state.buildings.filter((b) => b.id !== id);
  pushEvent(state, "info", `出售了${spec.name}`, building.x, building.y, side);
  refreshPop(state);
  return true;
}

function hasTavern(state: GameState, side: Side): boolean {
  return state.buildings.some((b) => b.side === side && b.kind === "tavern" && b.hp > 0);
}

function findSpawnSpot(state: GameState, side: Side): Vec {
  const hero = sideHero(state, side);
  const anchor = hero ? { x: hero.x, y: hero.y } : side === "farmer" ? state.map.farmerCamp : state.map.hunterCamp;
  const start = pixelToTile(anchor.x, anchor.y);
  for (let r = 1; r <= 8; r += 1) {
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const tx = start.tx + Math.round(Math.cos(angle) * r);
      const ty = start.ty + Math.round(Math.sin(angle) * r);
      if (tx < 1 || ty < 1 || tx >= state.map.w - 1 || ty >= state.map.h - 1) continue;
      if (isStaticBlocked(state.map, tx, ty)) continue;
      if (buildingAt(state, tx, ty)) continue;
      return tileCenter(tx, ty);
    }
  }
  return { x: anchor.x, y: anchor.y };
}

export function tryHire(state: GameState, side: Side, kind: UnitKind): boolean {
  const spec = UNITS[kind];
  if (spec.side !== side) return false;
  if (!phaseAllows(spec.unlock, state.phase)) return false;
  if (state.gold[side] < spec.costGold || state.wood[side] < spec.costWood) return false;
  if (spec.pop > 0 && state.popUsed[side] + spec.pop > popCap(state, side)) return false;
  if (side === "farmer" && (kind === "militia" || kind === "archer" || kind === "golem")) {
    if (!hasTavern(state, side)) return false;
  }
  const aiSide: Side = state.side === "farmer" ? "hunter" : "farmer";
  if (side === aiSide) {
    const military = state.units.filter(
      (u) => u.side === side && !u.dead && !u.isHero && u.kind !== "sheep" && u.kind !== "pig" && u.kind !== "lumberjack"
    ).length;
    if (military >= DIFFICULTY[state.difficulty].unitCap) return false;
  }
  state.gold[side] -= spec.costGold;
  state.wood[side] -= spec.costWood;
  state.stats[side].goldSpent += spec.costGold;
  state.stats[side].hired += 1;
  const spot = findSpawnSpot(state, side);
  spawnUnit(state, side, kind, spot.x, spot.y);
  pushEvent(state, "hire", `招募了${spec.name}`, spot.x, spot.y, side);
  refreshPop(state);
  return true;
}

export function buyItem(state: GameState, side: Side, item: ItemKind): boolean {
  const spec = ITEMS[item];
  if (state.gold[side] < spec.cost) return false;
  if (state.stock[side][item] >= 5) return false;
  state.gold[side] -= spec.cost;
  state.stats[side].goldSpent += spec.cost;
  state.stock[side][item] += 1;
  return true;
}

export function useItem(state: GameState, side: Side, item: ItemKind): boolean {
  if (state.stock[side][item] <= 0) return false;
  const hero = sideHero(state, side);
  if (!hero) return false;
  state.stock[side][item] -= 1;
  switch (item) {
    case "spray":
      hero.hp = Math.min(hero.maxHp, hero.hp + 220);
      break;
    case "cdScroll":
      for (const skill of ALL_SKILLS) state.skillCd[side][skill] *= 0.5;
      break;
    case "regen":
      hero.regenUntil = state.time + 20;
      break;
    case "dust":
      state.reveal.push({ x: hero.x, y: hero.y, r: 300, until: state.time + 6 });
      pushEvent(state, "item", "反隐粉：显形周围敌人", hero.x, hero.y, side);
      break;
    case "bomb": {
      for (const building of state.buildings) {
        if (building.side === side || building.hp <= 0) continue;
        if (Math.hypot(building.x - hero.x, building.y - hero.y) <= 90) {
          damageBuilding(state, building, 300, side);
        }
      }
      pushEvent(state, "item", "炸弹爆炸", hero.x, hero.y, side);
      break;
    }
    default:
      break;
  }
  return true;
}

export function buyUpgrade(state: GameState, side: Side, kind: UpgradeKind): boolean {
  if (state.upgrades[side][kind]) return false;
  const spec = UPGRADES[kind];
  if (state.gold[side] < spec.cost) return false;
  state.gold[side] -= spec.cost;
  state.stats[side].goldSpent += spec.cost;
  state.upgrades[side][kind] = true;
  pushEvent(state, "info", `${spec.name}已解锁`, state.map.hunterCamp.x, state.map.hunterCamp.y, side);
  return true;
}

export function castSkill(state: GameState, side: Side, skill: SkillId, x: number, y: number): boolean {
  if (side !== "hunter") return false;
  const hero = sideHero(state, side);
  if (!hero) return false;
  if (state.skillCd[side][skill] > 0) return false;
  const spec = SKILLS[skill];
  const px = clamp(x, TILE, (state.map.w - 1) * TILE);
  const py = clamp(y, TILE, (state.map.h - 1) * TILE);
  state.skillCd[side][skill] = spec.cd;

  if (skill === "eye") {
    const ward = spawnUnit(state, side, "eyeWard", px, py);
    ward.expiresAt = state.time + (spec.duration ?? 8);
    state.reveal.push({ x: px, y: py, r: spec.radius, until: state.time + (spec.duration ?? 8) });
    pushEvent(state, "skill", "鹰眼开启", px, py, side);
  } else if (skill === "slam") {
    for (const unit of state.units) {
      if (unit.side === side || unit.dead) continue;
      if (Math.hypot(unit.x - px, unit.y - py) <= spec.radius) {
        damageUnit(state, unit, spec.damage ?? 40, side, {
          slowFactor: spec.slowFactor ?? 0.4,
          slowUntil: state.time + (spec.slowSeconds ?? 3),
        });
      }
    }
    pushEvent(state, "skill", "裂地！", px, py, side);
  } else {
    const owl = spawnUnit(state, side, "owl", px, py);
    owl.expiresAt = state.time + (spec.duration ?? 30);
    state.reveal.push({ x: px, y: py, r: 180, until: state.time + (spec.duration ?? 30) });
    pushEvent(state, "skill", "哨兵就位", px, py, side);
  }
  return true;
}

export function applyCommand(state: GameState, command: Command): boolean {
  if (state.result) return false;
  const side = state.side;
  switch (command.t) {
    case "move": {
      const hero = playerHero(state);
      if (!hero) return false;
      setUnitDestination(state, hero, command.x, command.y);
      return true;
    }
    case "stance": {
      for (const unit of state.units) {
        if (unit.side === side && !unit.isHero && !unit.dead) unit.stance = command.stance;
      }
      return true;
    }
    case "rally": {
      state.rally[side] = { x: command.x, y: command.y };
      return true;
    }
    case "build":
      return tryBuild(state, side, command.kind, command.tx, command.ty);
    case "sell":
      return sellBuilding(state, side, command.id);
    case "skill":
      return castSkill(state, side, command.skill, command.x, command.y);
    case "hire":
      return tryHire(state, side, command.unit);
    case "use":
      return useItem(state, side, command.item);
    case "upgrade":
      return buyUpgrade(state, side, command.kind);
    default:
      return false;
  }
}

/** AI 与 UI 共用的个别操作别名 */
export const SKILL_LIST = ALL_SKILLS;
export const ITEM_LIST = ALL_ITEMS;

export function skillReady(state: GameState, side: Side, skill: SkillId): boolean {
  return state.skillCd[side][skill] <= 0;
}

type Serialized = Record<string, unknown>;

export function serializeGame(state: GameState): string {
  const { map, vision, ...rest } = state;
  void vision;
  return JSON.stringify({
    ...rest,
    map: { ...map, terrain: Array.from(map.terrain), trees: Array.from(map.trees) },
  });
}

export function deserializeGame(raw: string): GameState | null {
  try {
    const parsed = JSON.parse(raw) as Serialized;
    if (!parsed || parsed.version !== 1) return null;
    const mapRaw = parsed.map as GameMap & { terrain: number[]; trees: number[] };
    const map: GameMap = {
      w: mapRaw.w,
      h: mapRaw.h,
      seed: mapRaw.seed,
      terrain: Uint8Array.from(mapRaw.terrain),
      trees: Uint8Array.from(mapRaw.trees),
      farmerCamp: mapRaw.farmerCamp,
      hunterCamp: mapRaw.hunterCamp,
      groves: mapRaw.groves,
      patrol: mapRaw.patrol,
    };
    const state = {
      ...(parsed as unknown as GameState),
      map,
      vision: {
        farmer: new Uint8Array(map.w * map.h),
        hunter: new Uint8Array(map.w * map.h),
      },
    } as GameState;
    updateVision(state);
    return state;
  } catch {
    return null;
  }
}

export function describeSide(side: Side): string {
  return side === "farmer" ? "农民" : "猎人";
}

export function buffsOf(state: GameState, unit: Unit): { slow: boolean; poison: boolean; regen: boolean } {
  return {
    slow: unit.slowUntil > state.time,
    poison: unit.poisonUntil > state.time,
    regen: unit.regenUntil > state.time,
  };
}
