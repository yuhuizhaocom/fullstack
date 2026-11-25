import {
  ANIMAL_UPGRADE_TOTAL,
  BUILDINGS,
  FARMER_COUNT,
  HORN_DURATION,
  HORN_RADIUS,
  HUNTER_COUNT,
  ITEMS,
  MERCHANT_INTERVAL,
  MINE_FUSE,
  MODES,
  PHASE_LABEL,
  PHASE_RATIO,
  RESEARCH,
  RESPAWN_FARMER,
  RESPAWN_HUNTER,
  SKILLS,
  START_GOLD,
  TILE,
  UNITS,
  buildingCost,
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
  Building,
  BuildingKind,
  Command,
  Difficulty,
  FarmerSlot,
  GameEvent,
  GameEventKind,
  GameMap,
  GameResult,
  GameState,
  HunterSlot,
  ItemKind,
  Mode,
  Phase,
  Projectile,
  ResearchKind,
  Side,
  SideStats,
  SkillId,
  Unit,
  UnitKind,
} from "./types";

const ALL_SKILLS: SkillId[] = ["eye", "golemQ", "golemE", "golemW"];
const ALL_ITEMS: ItemKind[] = ["hammer", "horn", "gloves", "poison", "mine", "potion"];

function emptyStats(): SideStats {
  return { kills: 0, goldEarned: 0, goldSpent: 0, built: 0, hired: 0, lost: 0 };
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
  if (state.events.length > 60) state.events.splice(0, state.events.length - 60);
}

export function addGold(state: GameState, side: Side, owner: number, amount: number): void {
  const slot = side === "farmer" ? state.farmerSlots[owner] : state.hunterSlots[owner];
  if (!slot) return;
  slot.gold += amount;
  if (amount > 0) state.stats[side].goldEarned += amount;
}

export function playerGold(state: GameState): number {
  const slot = state.side === "farmer" ? state.farmerSlots[state.playerOwner] : state.hunterSlots[state.playerOwner];
  return Math.floor(slot?.gold ?? 0);
}

export function playerHunterSlot(state: GameState): HunterSlot | null {
  if (state.side !== "hunter") return null;
  return state.hunterSlots[state.playerOwner] ?? null;
}

export function playerFarmerSlot(state: GameState): FarmerSlot | null {
  if (state.side !== "farmer") return null;
  return state.farmerSlots[state.playerOwner] ?? null;
}

export function spawnUnit(
  state: GameState,
  side: Side,
  owner: number,
  kind: UnitKind,
  x: number,
  y: number
): Unit {
  const spec = UNITS[kind];
  const unit: Unit = {
    id: nextId(state, "u"),
    side,
    owner,
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
    hidden: false,
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
    produceTimer: 0,
    bounty: spec.bounty,
    homeX: x,
    homeY: y,
    expiresAt: 0,
    canSiege: !!spec.canSiege,
    armedAt: 0,
    incomeBonus: 0,
    animSeed: Math.random() * 1000,
  };
  state.units.push(unit);
  if (kind === "golem") applyGolemBuffs(state, unit);
  return unit;
}

export function unitById(state: GameState, id: string | null): Unit | null {
  if (!id) return null;
  return state.units.find((unit) => unit.id === id) ?? null;
}

export function playerUnit(state: GameState): Unit | null {
  return unitById(state, state.playerUnitId);
}

export function playerHero(state: GameState): Unit | null {
  const slot =
    state.side === "farmer"
      ? state.farmerSlots[state.playerOwner]
      : state.hunterSlots[state.playerOwner];
  if (!slot) return null;
  return unitById(state, slot.heroId);
}

export function ownerHero(state: GameState, side: Side, owner: number): Unit | null {
  const slot = side === "farmer" ? state.farmerSlots[owner] : state.hunterSlots[owner];
  if (!slot) return null;
  return unitById(state, slot.heroId);
}

export function sideHeroes(state: GameState, side: Side): Unit[] {
  return state.units.filter((unit) => unit.side === side && unit.isHero && !unit.dead);
}

export function golemForOwner(state: GameState, owner: number): Unit | null {
  return state.units.find((unit) => unit.kind === "golem" && unit.owner === owner && !unit.dead) ?? null;
}

export function buildingAt(state: GameState, tx: number, ty: number): Building | null {
  return state.buildings.find((b) => b.tx === tx && b.ty === ty && b.hp > 0) ?? null;
}

export function animalTotal(state: GameState): number {
  let count = 0;
  for (const unit of state.units) {
    if (unit.dead || unit.side !== "farmer") continue;
    if (unit.kind === "chicken" || unit.kind === "sheep" || unit.kind === "pig") count += 1;
  }
  return count;
}

export function animalCountOf(state: GameState, owner: number): number {
  let count = 0;
  for (const unit of state.units) {
    if (unit.dead || unit.side !== "farmer" || unit.owner !== owner) continue;
    if (unit.kind === "chicken" || unit.kind === "sheep" || unit.kind === "pig") count += 1;
  }
  return count;
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

function emptyResearch(): Record<Side, Record<ResearchKind, number>> {
  const make = (): Record<ResearchKind, number> => ({
    buildDef: 0,
    arrowAtk: 0,
    light: 0,
    trueSight: 0,
    golemHp: 0,
    golemAtk: 0,
    golemAspd: 0,
    golemSpeed: 0,
  });
  return { farmer: make(), hunter: make() };
}

function makeFarmerSlots(map: GameMap): FarmerSlot[] {
  const slots: FarmerSlot[] = [];
  for (let i = 0; i < FARMER_COUNT; i += 1) {
    const base = map.farmerStarts[i % map.farmerStarts.length] ?? map.farmerStarts[0];
    slots.push({ gold: START_GOLD.farmer, heroId: "", base, thinkAt: 0, stage: 0 });
  }
  return slots;
}

function makeHunterSlots(): HunterSlot[] {
  const slots: HunterSlot[] = [];
  for (let i = 0; i < HUNTER_COUNT; i += 1) {
    slots.push({
      gold: START_GOLD.hunter,
      heroId: "",
      thinkAt: 0,
      anchor: i,
      eyeAt: 0,
      hammer: false,
      gloves: false,
      poison: false,
      horns: 0,
      mines: 0,
      potions: 0,
      kills: 0,
    });
  }
  return slots;
}

export function createGame(opts: {
  side: Side;
  mode: Mode;
  difficulty: Difficulty;
  seed: number;
}): GameState {
  const map = createMap(opts.seed);
  const modeSpec = MODES[opts.mode];
  const state: GameState = {
    version: 2,
    seed: opts.seed,
    map,
    side: opts.side,
    mode: opts.mode,
    difficulty: opts.difficulty,
    durationMin: modeSpec.durationMin,
    time: 0,
    phase: "hide",
    result: null,
    farmerSlots: makeFarmerSlots(map),
    hunterSlots: makeHunterSlots(),
    playerOwner: 0,
    playerUnitId: "",
    vision: {
      farmer: new Uint8Array(map.w * map.h),
      hunter: new Uint8Array(map.w * map.h),
    },
    units: [],
    buildings: [],
    projectiles: [],
    research: emptyResearch(),
    cooldowns: {},
    reveal: [],
    merchant: { x: map.merchantSpots[0].x, y: map.merchantSpots[0].y, nextAt: MERCHANT_INTERVAL },
    events: [],
    eventSeq: 0,
    stats: { farmer: emptyStats(), hunter: emptyStats() },
    nextId: 0,
    visionAt: 0,
  };

  // 7 名农民：各自出生在自己的起家点附近
  for (let i = 0; i < state.farmerSlots.length; i += 1) {
    const base = state.farmerSlots[i].base;
    const jitter = (i % 3) * 26 - 26;
    const hero = spawnUnit(state, "farmer", i, "farmerHero", base.x + jitter, base.y + jitter);
    state.farmerSlots[i].heroId = hero.id;
  }

  // 3 名猎人：中间营地
  for (let i = 0; i < state.hunterSlots.length; i += 1) {
    const hero = spawnUnit(
      state,
      "hunter",
      i,
      "hunterHero",
      map.hunterCamp.x + (i - 1) * 46,
      map.hunterCamp.y + 30
    );
    state.hunterSlots[i].heroId = hero.id;
  }

  // 中间固定兵营
  const campTile = pixelToTile(map.hunterCamp.x, map.hunterCamp.y);
  const barracksCenter = tileCenter(campTile.tx, campTile.ty);
  const barracksSpec = BUILDINGS.hunterBarracks;
  state.buildings.push({
    id: nextId(state, "b"),
    side: "hunter",
    owner: 0,
    kind: "hunterBarracks",
    tx: campTile.tx,
    ty: campTile.ty,
    x: barracksCenter.x,
    y: barracksCenter.y,
    hp: barracksSpec.hp,
    maxHp: barracksSpec.hp,
    cooldown: 0,
    produceTimer: 0,
    produced: 0,
    flashAt: 0,
    atk: 0,
    range: 0,
    disabledUntil: 0,
    open: false,
    tier: 0,
  });

  if (opts.side === "farmer") {
    state.playerOwner = 0;
    state.playerUnitId = state.farmerSlots[0].heroId;
  } else {
    state.playerOwner = 0;
    state.playerUnitId = state.hunterSlots[0].heroId;
  }

  pushEvent(state, "info", "对局开始：7 农民 vs 3 猎人", map.hunterCamp.x, map.hunterCamp.y);
  pushEvent(state, "phase", "匿藏期：先摆鸡窝、藏好", state.farmerSlots[0].base.x, state.farmerSlots[0].base.y, "farmer");
  updateVision(state);
  return state;
}

/** 综合阻挡判断：静态地形 + 建筑（透明塔与开门的魔法墙可通行） */
export function blockedFn(state: GameState, ignoreBuildingId?: string) {
  const set = new Set<string>();
  for (const b of state.buildings) {
    if (b.id === ignoreBuildingId) continue;
    if (b.hp <= 0) continue;
    const spec = BUILDINGS[b.kind];
    if (spec.passable) continue;
    if (b.kind === "magicWall" && b.open) continue;
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

export function isUnitVisibleTo(state: GameState, unit: Unit, viewer: Side): boolean {
  if (unit.dead) return false;
  if (unit.side === viewer) return true;
  // 地雷永远不被农民看到
  if (unit.kind === "mine") return false;
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
  for (const other of state.units) {
    if (other.side !== viewer || other.dead) continue;
    if (Math.hypot(other.x - unit.x, other.y - unit.y) <= 90) return true;
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
          if (Math.hypot(tileCenter(tx, ty).x - x, tileCenter(tx, ty).y - y) <= radius) {
            vis[ty * w + tx] = 2;
          }
        }
      }
    };

    for (const unit of state.units) {
      if (unit.dead || unit.side !== side) continue;
      if (unit.kind === "mine") continue;
      mark(unit.x, unit.y, unit.vision);
    }
    const lightBonus = side === "farmer" ? state.research.farmer.light * 220 : 0;
    for (const building of state.buildings) {
      if (building.hp <= 0 || building.side !== side) continue;
      const spec = BUILDINGS[building.kind];
      mark(building.x, building.y, 180 + (spec.reveal ?? 0) + lightBonus);
    }
    if (side === "farmer" && state.research.farmer.trueSight > 0) {
      vis.fill(2);
    }
    state.vision[side] = vis;
  }
  state.visionAt = state.time;
}

function researchLevel(state: GameState, side: Side, kind: ResearchKind): number {
  return state.research[side][kind] ?? 0;
}

export function towerAttackBonus(state: GameState, building: Building): number {
  if (building.kind !== "arrowTower") return 0;
  return researchLevel(state, "farmer", "arrowAtk") * 3;
}

export function merchantNear(state: GameState): boolean {
  const unit = playerUnit(state);
  if (!unit) return false;
  return Math.hypot(unit.x - state.merchant.x, unit.y - state.merchant.y) <= 480;
}

function applyGolemBuffs(state: GameState, unit: Unit): void {
  if (unit.kind !== "golem" && unit.kind !== "golemClone") return;
  const hpLv = researchLevel(state, "farmer", "golemHp");
  const atkLv = researchLevel(state, "farmer", "golemAtk");
  const aspdLv = researchLevel(state, "farmer", "golemAspd");
  const speedLv = researchLevel(state, "farmer", "golemSpeed");
  const mode = MODES[state.mode];
  const cloneScale = unit.kind === "golemClone" ? 0.32 : 1;
  unit.maxHp = Math.round((UNITS[unit.kind].hp + hpLv * mode.golemHpUp) * cloneScale);
  unit.hp = Math.min(unit.hp, unit.maxHp);
  if (unit.kind === "golem") unit.hp = unit.maxHp;
  unit.atk = Math.round((UNITS[unit.kind].atk + atkLv * mode.golemAtkUp) * (unit.kind === "golem" ? 1 : 0.55));
  unit.attackInterval = UNITS[unit.kind].attackInterval / (1 + aspdLv * 0.15);
  unit.speed = UNITS[unit.kind].speed + speedLv * 40;
}

function refreshGolems(state: GameState): void {
  for (const unit of state.units) {
    if (unit.kind === "golem" || unit.kind === "golemClone") applyGolemBuffs(state, unit);
  }
}

function reviveCostPenalty(state: GameState, owner: number): void {
  const slot = state.farmerSlots[owner];
  if (!slot) return;
  slot.gold = Math.max(0, slot.gold - Math.floor(slot.gold * 0.1));
}

function finish(state: GameState, winner: Side, reason: GameResult["reason"]): void {
  if (state.result) return;
  state.result = { winner, reason };
  state.phase = "over";
  const point = winner === "farmer" ? state.map.hunterCamp : state.map.farmerStarts[0];
  pushEvent(
    state,
    "win",
    winner === "farmer" ? "三位猎人全部倒下，农民获胜！" : "计时结束，猎人存活获胜！",
    point.x,
    point.y,
    winner
  );
}

export function hunterAlive(state: GameState): boolean {
  return state.units.some(
    (unit) => unit.side === "hunter" && unit.isHero && (unit.livesLeft > 0 || !unit.dead)
  );
}

function transferPlayerHunter(state: GameState): void {
  if (state.side !== "hunter") return;
  const current = playerHero(state);
  if (current && !current.dead) return;
  for (let i = 0; i < state.hunterSlots.length; i += 1) {
    const hero = ownerHero(state, "hunter", i);
    if (hero && !hero.dead && hero.livesLeft > 0) {
      state.playerOwner = i;
      if (state.playerUnitId === current?.id) state.playerUnitId = hero.id;
      pushEvent(state, "info", "接管了另一名猎人", hero.x, hero.y, "hunter");
      return;
    }
  }
}

function killUnit(state: GameState, unit: Unit, killerSide: Side, killerOwner: number): void {
  if (unit.dead) return;
  const spec = UNITS[unit.kind];
  state.stats[killerSide].kills += 1;
  state.stats[unit.side].lost += 1;
  if (killerSide === "hunter" && unit.side === "farmer") {
    const slot = state.hunterSlots[killerOwner];
    if (slot && unit.kind !== "chicken" && unit.kind !== "sheep" && unit.kind !== "pig") {
      slot.kills += 1;
    }
  }
  if (killerSide !== unit.side && unit.bounty > 0) {
    addGold(state, killerSide, killerOwner, unit.bounty);
  }
  if (unit.kind === "chicken" || unit.kind === "sheep" || unit.kind === "pig") {
    // 动物死亡不刷屏
  } else {
    pushEvent(state, "death", `${spec.name}阵亡`, unit.x, unit.y, unit.side);
  }
  unit.hp = 0;
  unit.path = [];
  unit.dest = null;
  if (!unit.isHero) {
    unit.dead = true;
    unit.respawnAt = Infinity;
    // 玩家正在操控的傀儡阵亡后，自动把视角交还给农民英雄
    if (unit.id === state.playerUnitId && unit.side === "farmer") {
      const heroId = state.farmerSlots[unit.owner]?.heroId;
      if (heroId) state.playerUnitId = heroId;
    }
    return;
  }
  unit.dead = true;
  if (unit.side === "hunter") {
    unit.livesLeft -= 1;
    if (unit.livesLeft <= 0) {
      unit.respawnAt = Infinity;
      pushEvent(state, "death", "一名猎人彻底倒下", unit.x, unit.y, "hunter");
      transferPlayerHunter(state);
    } else {
      unit.respawnAt = state.time + RESPAWN_HUNTER;
    }
  } else {
    reviveCostPenalty(state, unit.owner);
    unit.respawnAt = state.time + RESPAWN_FARMER;
  }
}

function respawnHero(state: GameState, unit: Unit): void {
  const camp =
    unit.side === "farmer"
      ? state.farmerSlots[unit.owner]?.base ?? state.map.farmerStarts[0]
      : state.map.hunterCamp;
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

function damageUnit(
  state: GameState,
  target: Unit,
  damage: number,
  attackerSide: Side,
  attackerOwner: number,
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
  if (target.hp <= 0) killUnit(state, target, attackerSide, attackerOwner);
}

function damageBuilding(
  state: GameState,
  building: Building,
  damage: number,
  attackerSide: Side,
  attackerOwner: number
): void {
  if (building.hp <= 0) return;
  let final = damage;
  if (building.side === "farmer") {
    const defLv = researchLevel(state, "farmer", "buildDef");
    final = damage * (1 - Math.min(0.6, defLv * 0.04));
  }
  building.hp -= final;
  building.flashAt = state.time;
  if (building.hp <= 0) {
    building.hp = 0;
    state.stats[attackerSide].kills += 1;
    pushEvent(state, "kill", `${BUILDINGS[building.kind].name}被摧毁`, building.x, building.y, building.side);
    if (building.kind === "golemFactory") {
      pushEvent(state, "info", "傀儡工厂被摧毁", building.x, building.y, "farmer");
    }
    void attackerOwner;
  }
}

function findTarget(state: GameState, unit: Unit): { unit?: Unit; building?: Building } | null {
  let bestUnit: Unit | null = null;
  let bestDist = Infinity;
  for (const other of state.units) {
    if (other.side === unit.side || other.dead) continue;
    if (other.kind === "eyeWard" || other.kind === "mine") continue;
    if (!isUnitVisibleTo(state, other, unit.side)) continue;
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
  owner: number,
  fromX: number,
  fromY: number,
  targetId: string,
  targetX: number,
  targetY: number,
  damage: number,
  opts: {
    aoe?: number;
    friendlyFire?: boolean;
    vsBuilding?: number;
    slowFactor?: number;
    slowUntil?: number;
    poisonUntil?: number;
    color?: number;
  } = {}
): void {
  const projectile: Projectile = {
    id: nextId(state, "p"),
    side,
    owner,
    x: fromX,
    y: fromY,
    targetId: `${targetId}|${Math.round(targetX)}|${Math.round(targetY)}`,
    speed: 460,
    damage,
    aoe: opts.aoe ?? 0,
    friendlyFire: !!opts.friendlyFire,
    vsBuilding: opts.vsBuilding ?? 1,
    slowFactor: opts.slowFactor ?? 0,
    slowUntil: opts.slowUntil ?? 0,
    poisonUntil: opts.poisonUntil ?? 0,
    color: opts.color ?? (side === "hunter" ? 0xf87171 : 0x93c5fd),
    ttl: 2.5,
  };
  state.projectiles.push(projectile);
}

function splitTarget(ref: string): { id: string; x: number; y: number } {
  const [id, x, y] = ref.split("|");
  return { id, x: Number(x) || 0, y: Number(y) || 0 };
}

function hunterAtkMultiplier(state: GameState, unit: Unit): number {
  if (unit.side !== "hunter") return 1;
  const slot = state.hunterSlots[unit.owner];
  return slot?.hammer ? 1.25 : 1;
}

function unitAttackInterval(state: GameState, unit: Unit): number {
  if (unit.side === "hunter" && state.hunterSlots[unit.owner]?.gloves) {
    return unit.attackInterval * 0.6;
  }
  return unit.attackInterval;
}

function performAttack(state: GameState, unit: Unit, target: { unit?: Unit; building?: Building }): void {
  if (unit.cooldown > 0) return;
  unit.cooldown = unitAttackInterval(state, unit);
  unit.lastActionAt = state.time;
  unit.hidden = false;
  const atk = unit.atk * hunterAtkMultiplier(state, unit);
  const poisonSlot = unit.side === "hunter" ? state.hunterSlots[unit.owner] : null;
  if (target.unit) {
    const def = target.unit.def;
    const damage = Math.max(1, atk - def * 0.5);
    if (unit.range > 80) {
      spawnProjectile(state, unit.side, unit.owner, unit.x, unit.y, target.unit.id, target.unit.x, target.unit.y, damage, {
        poisonUntil: poisonSlot?.poison ? state.time + 4 : 0,
      });
    } else {
      damageUnit(state, target.unit, damage, unit.side, unit.owner, {
        poisonUntil: poisonSlot?.poison ? state.time + 4 : 0,
      });
    }
  } else if (target.building) {
    let damage = Math.max(1, atk);
    if (unit.canSiege) damage *= 2;
    if (unit.range > 80) {
      spawnProjectile(
        state,
        unit.side,
        unit.owner,
        unit.x,
        unit.y,
        target.building.id,
        target.building.x,
        target.building.y,
        damage
      );
    } else {
      damageBuilding(state, target.building, damage, unit.side, unit.owner);
    }
  }
}

function followLeader(state: GameState, unit: Unit): void {
  if (unit.isHero) return;
  if (unit.stance === "attack") {
    const target =
      unit.side === "farmer"
        ? state.map.hunterCamp
        : state.map.farmerStarts[unit.owner % state.map.farmerStarts.length];
    setUnitDestination(state, unit, target.x, target.y);
    return;
  }
  const leader =
    unit.side === "farmer"
      ? golemForOwner(state, unit.owner) ?? ownerHero(state, "farmer", unit.owner)
      : ownerHero(state, "hunter", unit.owner);
  if (!leader) return;
  const d = Math.hypot(leader.x - unit.x, leader.y - unit.y);
  if (d > TILE * 4.5) {
    const jitter = (unit.animSeed % 10) * 6 - 30;
    setUnitDestination(state, unit, leader.x + jitter, leader.y + jitter);
  }
}

export function explodeMine(state: GameState, mine: Unit): void {
  if (mine.dead) return;
  const radius = 150;
  const damage = 420;
  for (const unit of state.units) {
    if (unit.side !== "farmer" || unit.dead) continue;
    if (Math.hypot(unit.x - mine.x, unit.y - mine.y) <= radius) {
      damageUnit(state, unit, damage, "hunter", mine.owner);
    }
  }
  for (const building of state.buildings) {
    if (building.side !== "farmer" || building.hp <= 0) continue;
    if (Math.hypot(building.x - mine.x, building.y - mine.y) <= radius) {
      damageBuilding(state, building, damage, "hunter", mine.owner);
    }
  }
  mine.dead = true;
  mine.respawnAt = Infinity;
  pushEvent(state, "item", "地雷爆炸", mine.x, mine.y, "hunter");
}

function updateMine(state: GameState): void {
  for (const unit of state.units) {
    if (unit.dead || unit.kind !== "mine") continue;
    if (state.time < unit.armedAt) continue;
    let triggered = false;
    for (const other of state.units) {
      if (other.side !== "farmer" || other.dead) continue;
      if (Math.hypot(other.x - unit.x, other.y - unit.y) <= 80) {
        triggered = true;
        break;
      }
    }
    if (!triggered) {
      for (const building of state.buildings) {
        if (building.side !== "farmer" || building.hp <= 0) continue;
        if (Math.hypot(building.x - unit.x, building.y - unit.y) <= 80) {
          triggered = true;
          break;
        }
      }
    }
    if (triggered) explodeMine(state, unit);
  }
}

function updateUnit(state: GameState, unit: Unit, dt: number): void {
  if (unit.dead) return;
  const spec = UNITS[unit.kind];

  if (unit.regenUntil > state.time) unit.hp = Math.min(unit.maxHp, unit.hp + 8 * dt);
  if (unit.poisonUntil > state.time) {
    unit.hp -= 10 * dt;
    if (unit.hp <= 0) {
      killUnit(state, unit, unit.side === "farmer" ? "hunter" : "farmer", 0);
      return;
    }
  }
  if (unit.cooldown > 0) unit.cooldown = Math.max(0, unit.cooldown - dt);
  if (unit.slowUntil <= state.time) unit.slowFactor = 1;

  if (spec.incomeInterval && spec.incomeGold) {
    unit.produceTimer += dt;
    if (unit.produceTimer >= spec.incomeInterval) {
      unit.produceTimer = 0;
      addGold(state, unit.side, unit.owner, spec.incomeGold + unit.incomeBonus);
    }
    return;
  }

  if (unit.kind === "eyeWard") {
    if (unit.expiresAt > 0 && state.time >= unit.expiresAt) unit.dead = true;
    return;
  }

  if (unit.kind === "mine") {
    if (unit.armedAt > 0 && state.time >= unit.armedAt && unit.armedAt + 30 < state.time) {
      // 保险：长时间未触发也不会永久堆积
    }
    return;
  }

  const isPlayer = unit.id === state.playerUnitId;
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
        if (!isPlayer && unit.repathAt < state.time) {
          setUnitDestination(state, unit, tx, ty);
        }
      } else {
        unit.targetId = null;
      }
    }
  }

  if (unit.path.length > 0) {
    if (isPlayer) unit.lastActionAt = state.time;
    moveAlongPath(state, unit, dt);
    return;
  }

  if (isPlayer) {
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

function countAnimalsNear(state: GameState, building: Building, kind: UnitKind): number {
  let count = 0;
  for (const unit of state.units) {
    if (unit.dead || unit.owner !== building.owner || unit.kind !== kind) continue;
    // 只统计本窝孵出的动物，避免相邻窝互相占用上限
    if (Math.hypot(unit.homeX - building.x, unit.homeY - building.y) < 1) count += 1;
  }
  return count;
}

function spawnAnimal(state: GameState, building: Building, kind: UnitKind): void {
  const spot =
    nearestOpenTile(
      state.map,
      building.tx + Math.floor(Math.random() * 5) - 2,
      building.ty + 2 + Math.floor(Math.random() * 2),
      blockedFn(state)
    ) ?? { tx: building.tx, ty: building.ty + 2 };
  const point = tileCenter(spot.tx, spot.ty);
  const animal = spawnUnit(state, "farmer", building.owner, kind, point.x, point.y);
  animal.homeX = building.x;
  animal.homeY = building.y;
  if (building.tier > 0) {
    animal.incomeBonus = kind === "pig" ? 2 : 1;
    animal.maxHp += 20;
    animal.hp = animal.maxHp;
  }
}

const TOWER_COLOR: Record<string, number> = {
  arrowTower: 0xfbbf24,
  rocketTower: 0xf97316,
  boulderTower: 0xa8a29e,
  flameTower: 0xef4444,
  frostTower: 0x67e8f9,
};

function updateTower(state: GameState, building: Building, dt: number): void {
  const spec = BUILDINGS[building.kind];
  if (!spec.tower) return;
  building.cooldown = Math.max(0, building.cooldown - dt);
  if (state.time < building.disabledUntil) return;
  if (building.cooldown > 0) return;

  let targetUnit: Unit | null = null;
  let targetBuilding: Building | null = null;
  let best = Infinity;
  for (const unit of state.units) {
    if (unit.side === building.side || unit.dead) continue;
    if (unit.kind === "eyeWard" || unit.kind === "mine") continue;
    if (!isUnitVisibleTo(state, unit, building.side)) continue;
    const d = Math.hypot(unit.x - building.x, unit.y - building.y);
    if (d <= spec.tower.range && d < best) {
      best = d;
      targetUnit = unit;
    }
  }
  if (!targetUnit && spec.tower.vsBuilding) {
    for (const other of state.buildings) {
      if (other.side === building.side || other.hp <= 0) continue;
      if (!isBuildingVisibleTo(state, other, building.side)) continue;
      const d = Math.hypot(other.x - building.x, other.y - building.y);
      if (d <= spec.tower.range && d < best) {
        best = d;
        targetBuilding = other;
      }
    }
  }
  if (!targetUnit && !targetBuilding) return;

  building.cooldown = spec.tower.interval;
  const atk = spec.tower.atk + towerAttackBonus(state, building);
  const damage = Math.max(1, atk);
  spawnProjectile(
    state,
    building.side,
    building.owner,
    building.x,
    building.y - 16,
    targetUnit?.id ?? targetBuilding?.id ?? "",
    targetUnit?.x ?? targetBuilding?.x ?? building.x,
    targetUnit?.y ?? targetBuilding?.y ?? building.y,
    damage,
    {
      aoe: spec.tower.aoe ?? 0,
      friendlyFire: spec.tower.friendlyFire,
      vsBuilding: spec.tower.vsBuilding ?? 1,
      slowFactor: spec.tower.slow ?? 0,
      slowUntil: spec.tower.slow ? state.time + 2 : 0,
      color: TOWER_COLOR[building.kind] ?? 0xfbbf24,
    }
  );
}

function updateBuilding(state: GameState, building: Building, dt: number): void {
  if (building.hp <= 0) return;
  const spec = BUILDINGS[building.kind];

  if (spec.income && building.kind !== "hunterBarracks") {
    building.produceTimer += dt;
    if (building.produceTimer >= spec.income.interval) {
      building.produceTimer = 0;
      if (animalTotal(state) < ANIMAL_UPGRADE_TOTAL) {
        if (countAnimalsNear(state, building, spec.income.kind) < spec.income.max) {
          spawnAnimal(state, building, spec.income.kind);
        }
      }
    }
  }

  updateTower(state, building, dt);
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
    if (projectile.aoe > 0) {
      for (const unit of state.units) {
        if (unit.dead) continue;
        if (!projectile.friendlyFire && unit.side === projectile.side) continue;
        if (unit.kind === "eyeWard" || unit.kind === "mine") continue;
        if (Math.hypot(unit.x - tx, unit.y - ty) <= projectile.aoe) {
          damageUnit(state, unit, projectile.damage, projectile.side, projectile.owner, {
            slowFactor: projectile.slowFactor,
            slowUntil: projectile.slowUntil,
          });
        }
      }
      if (projectile.friendlyFire) {
        for (const building of state.buildings) {
          if (building.side === projectile.side || building.hp <= 0) continue;
          if (Math.hypot(building.x - tx, building.y - ty) <= projectile.aoe) {
            damageBuilding(state, building, projectile.damage * 0.5, projectile.side, projectile.owner);
          }
        }
      }
    } else if (targetUnit) {
      damageUnit(state, targetUnit, projectile.damage, projectile.side, projectile.owner, {
        slowFactor: projectile.slowFactor,
        slowUntil: projectile.slowUntil,
        poisonUntil: projectile.poisonUntil,
      });
    } else if (targetBuilding) {
      damageBuilding(state, targetBuilding, projectile.damage * projectile.vsBuilding, projectile.side, projectile.owner);
    }
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

function upgradeAnimals(state: GameState): void {
  const total = animalTotal(state);
  if (total < ANIMAL_UPGRADE_TOTAL) return;
  let upgraded = false;
  for (const building of state.buildings) {
    if (building.side !== "farmer" || building.tier > 0 || !BUILDINGS[building.kind].income) continue;
    building.tier = 1;
    upgraded = true;
  }
  if (!upgraded) return;
  for (const unit of state.units) {
    if (unit.dead || unit.side !== "farmer") continue;
    if (unit.kind === "chicken" || unit.kind === "sheep") unit.incomeBonus = 1;
    else if (unit.kind === "pig") unit.incomeBonus = 2;
  }
  pushEvent(state, "phase", "动物总数达到 300，全部动物升级！", state.map.hunterCamp.x, state.map.hunterCamp.y, "farmer");
}

function moveMerchant(state: GameState): void {
  if (state.time < state.merchant.nextAt) return;
  state.merchant.nextAt = state.time + MERCHANT_INTERVAL;
  const spots = state.map.merchantSpots;
  const next = spots[Math.floor(Math.random() * spots.length)];
  state.merchant.x = next.x;
  state.merchant.y = next.y;
}

export function stepGame(state: GameState, dt: number): void {
  if (state.result) return;
  const clamped = Math.min(0.25, Math.max(0, dt));
  if (clamped <= 0) return;
  state.time += clamped;

  const nextPhase = phaseAt(state, state.time);
  if (nextPhase !== state.phase) {
    state.phase = nextPhase;
    if (nextPhase !== "over") {
      pushEvent(state, "phase", `进入${PHASE_LABEL[nextPhase]}`, state.map.hunterCamp.x, state.map.hunterCamp.y);
    }
  }

  for (const unitId of Object.keys(state.cooldowns)) {
    const map = state.cooldowns[unitId];
    for (const skill of ALL_SKILLS) {
      if (map[skill] > 0) map[skill] = Math.max(0, map[skill] - clamped);
    }
  }

  for (const unit of state.units) {
    if (!unit.dead || !unit.isHero) continue;
    if (unit.side === "hunter" && unit.livesLeft <= 0) continue;
    if (unit.respawnAt === Infinity) continue;
    if (state.time >= unit.respawnAt) respawnHero(state, unit);
  }

  const snapshot = [...state.units];
  for (const unit of snapshot) {
    if (unit.dead) continue;
    updateUnit(state, unit, clamped);
    if (unit.side === "farmer" && !unit.dead) {
      const bush = isBushAt(state.map, unit.x, unit.y);
      if (bush && !unit.moving && state.time - unit.lastActionAt > 2) {
        unit.hidden = true;
      } else if (unit.hidden) {
        unit.hidden = false;
      }
    }
  }

  updateMine(state);

  for (const building of state.buildings) updateBuilding(state, building, clamped);
  updateProjectiles(state, clamped);
  separateUnits(state);
  upgradeAnimals(state);
  moveMerchant(state);

  state.units = state.units.filter((unit) => !unit.dead || unit.isHero);
  state.buildings = state.buildings.filter((building) => building.hp > 0);
  state.reveal = state.reveal.filter((zone) => zone.until >= state.time);

  for (const key of Object.keys(state.cooldowns)) {
    if (!state.units.some((unit) => unit.id === key)) delete state.cooldowns[key];
  }

  if (state.time - state.visionAt > 0.2) updateVision(state);

  if (!hunterAlive(state)) {
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

function hasTeamBuilding(state: GameState, side: Side, kind: BuildingKind): boolean {
  return state.buildings.some((b) => b.side === side && b.kind === kind && b.hp > 0);
}

export function canPlace(state: GameState, side: Side, kind: BuildingKind, tx: number, ty: number): boolean {
  const spec = BUILDINGS[kind];
  if (spec.side !== side) return false;
  if (spec.fixed) return false;
  if (kind === "hunterBarracks") return false;
  if (tx < 1 || ty < 1 || tx >= state.map.w - 1 || ty >= state.map.h - 1) return false;
  if (isStaticBlocked(state.map, tx, ty)) return false;
  if (buildingAt(state, tx, ty)) return false;
  if (spec.unique && hasTeamBuilding(state, side, kind)) return false;
  const center = tileCenter(tx, ty);
  return inBuildRange(state, side, center.x, center.y);
}

export function tryBuildFor(
  state: GameState,
  side: Side,
  owner: number,
  kind: BuildingKind,
  tx: number,
  ty: number
): boolean {
  const spec = BUILDINGS[kind];
  if (!canPlace(state, side, kind, tx, ty)) return false;
  const slot = side === "farmer" ? state.farmerSlots[owner] : state.hunterSlots[owner];
  const cost = buildingCost(kind, state.mode);
  if (!slot || slot.gold < cost) return false;
  slot.gold -= cost;
  state.stats[side].goldSpent += cost;
  const center = tileCenter(tx, ty);
  const building: Building = {
    id: nextId(state, "b"),
    side,
    owner,
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
    disabledUntil: 0,
    open: false,
    tier: animalTotal(state) >= ANIMAL_UPGRADE_TOTAL && spec.income ? 1 : 0,
  };
  state.buildings.push(building);
  state.stats[side].built += 1;
  pushEvent(state, "build", `建造了${spec.name}`, center.x, center.y, side);
  return true;
}

export function sellBuilding(state: GameState, id: string): boolean {
  const side = state.side;
  const building = state.buildings.find((b) => b.id === id && b.side === side && b.owner === state.playerOwner);
  if (!building) return false;
  const spec = BUILDINGS[building.kind];
  const refund = Math.floor(buildingCost(building.kind, state.mode) * 0.5);
  const slot = side === "farmer" ? state.farmerSlots[state.playerOwner] : state.hunterSlots[state.playerOwner];
  if (slot) slot.gold += refund;
  state.buildings = state.buildings.filter((b) => b.id !== id);
  pushEvent(state, "info", `出售了${spec.name}，返还 ${refund} 金`, building.x, building.y, side);
  return true;
}

export function tryHireFor(state: GameState, side: Side, owner: number, kind: UnitKind): boolean {
  const spec = UNITS[kind];
  if (spec.side !== side) return false;
  const slot = side === "farmer" ? state.farmerSlots[owner] : state.hunterSlots[owner];
  if (!slot || slot.gold < spec.costGold) return false;

  if (kind === "golem") {
    if (!hasTeamBuilding(state, "farmer", "golemFactory")) return false;
    if (golemForOwner(state, owner)) return false;
    slot.gold -= spec.costGold;
    state.stats.farmer.goldSpent += spec.costGold;
    const factory = state.buildings.find((b) => b.side === "farmer" && b.kind === "golemFactory" && b.hp > 0);
    const at = factory ? { x: factory.x, y: factory.y + 40 } : state.farmerSlots[owner].base;
    const golem = spawnUnit(state, "farmer", owner, "golem", at.x, at.y);
    const clones = MODES[state.mode].cloneCount;
    for (let i = 0; i < clones; i += 1) {
      const angle = (i / clones) * Math.PI * 2;
      const clone = spawnUnit(
        state,
        "farmer",
        owner,
        "golemClone",
        at.x + Math.cos(angle) * 44,
        at.y + Math.sin(angle) * 44
      );
      clone.atk = Math.max(8, Math.round(clone.atk * 0.55));
    }
    state.stats.farmer.hired += 1;
    pushEvent(state, "hire", "主傀儡出厂！", golem.x, golem.y, "farmer");
    return true;
  }

  if (kind === "mercenary") {
    if (!hasTeamBuilding(state, "hunter", "hunterBarracks")) return false;
    // 原作规则：先击杀农民，再回中间兵营购买
    const hunterSlot = state.hunterSlots[owner];
    if (!hunterSlot || hunterSlot.kills < 1) return false;
    const owned = state.units.filter(
      (u) => u.side === "hunter" && u.owner === owner && u.kind === "mercenary" && !u.dead
    ).length;
    if (owned >= 6) return false;
    const buyer = ownerHero(state, "hunter", owner);
    const barracksSpot = state.buildings.find((b) => b.kind === "hunterBarracks" && b.hp > 0);
    if (!buyer || !barracksSpot) return false;
    if (Math.hypot(buyer.x - barracksSpot.x, buyer.y - barracksSpot.y) > 480) return false;
    hunterSlot.gold -= spec.costGold;
    state.stats.hunter.goldSpent += spec.costGold;
    const barracks = state.buildings.find((b) => b.kind === "hunterBarracks" && b.hp > 0);
    const at = barracks ?? { x: state.map.hunterCamp.x, y: state.map.hunterCamp.y };
    const spot = nearestOpenTile(state.map, pixelToTile(at.x, at.y).tx + 2, pixelToTile(at.x, at.y).ty + 2, blockedFn(state));
    const point = spot ? tileCenter(spot.tx, spot.ty) : at;
    spawnUnit(state, "hunter", owner, "mercenary", point.x, point.y);
    state.stats.hunter.hired += 1;
    pushEvent(state, "hire", "雇佣兵加入巡逻", point.x, point.y, "hunter");
    return true;
  }

  return false;
}

export function buyItemFor(state: GameState, side: Side, owner: number, item: ItemKind): boolean {
  if (side !== "hunter") return false;
  const spec = ITEMS[item];
  const slot = state.hunterSlots[owner];
  if (!slot || slot.gold < spec.cost) return false;
  if (spec.unlockAt && state.time < spec.unlockAt) return false;
  if (item === "mine" && !MODES[state.mode].mines) return false;
  if (item === "hammer" && slot.hammer) return false;
  if (item === "gloves" && slot.gloves) return false;
  if (item === "poison" && slot.poison) return false;
  if (item === "horn" && slot.horns >= 5) return false;
  if (item === "mine" && slot.mines >= 9) return false;
  if (item === "potion" && slot.potions >= 5) return false;
  slot.gold -= spec.cost;
  state.stats.hunter.goldSpent += spec.cost;
  if (item === "hammer") slot.hammer = true;
  else if (item === "gloves") slot.gloves = true;
  else if (item === "poison") slot.poison = true;
  else if (item === "horn") slot.horns += 1;
  else if (item === "mine") slot.mines += spec.bundle ?? 3;
  else if (item === "potion") slot.potions += 1;
  pushEvent(state, "item", `购买了${spec.name}`, state.map.hunterCamp.x, state.map.hunterCamp.y, "hunter");
  return true;
}

export function useItemFor(state: GameState, side: Side, owner: number, item: ItemKind): boolean {
  if (side !== "hunter") return false;
  const slot = state.hunterSlots[owner];
  const hero = ownerHero(state, "hunter", owner);
  if (!slot || !hero || hero.dead) return false;
  if (item === "horn") {
    if (slot.horns <= 0) return false;
    slot.horns -= 1;
    for (const building of state.buildings) {
      if (building.side !== "farmer" || building.hp <= 0) continue;
      if (!BUILDINGS[building.kind].tower) continue;
      if (Math.hypot(building.x - hero.x, building.y - hero.y) <= HORN_RADIUS) {
        building.disabledUntil = state.time + HORN_DURATION;
      }
    }
    pushEvent(state, "item", "乌云号角：周围箭塔失效", hero.x, hero.y, "hunter");
    return true;
  }
  if (item === "mine") {
    if (slot.mines <= 0) return false;
    slot.mines -= 1;
    const mine = spawnUnit(state, "hunter", owner, "mine", hero.x, hero.y);
    mine.armedAt = state.time + MINE_FUSE;
    mine.hidden = true;
    pushEvent(state, "item", "放置地雷", hero.x, hero.y, "hunter");
    return true;
  }
  if (item === "potion") {
    if (slot.potions <= 0) return false;
    slot.potions -= 1;
    hero.hp = Math.min(hero.maxHp, hero.hp + 400);
    pushEvent(state, "item", "饮用药水恢复生命", hero.x, hero.y, "hunter");
    return true;
  }
  return false;
}

export function buyResearchFor(state: GameState, side: Side, owner: number, kind: ResearchKind): boolean {
  const spec = RESEARCH[kind];
  const level = researchLevel(state, side, kind);
  if (level >= spec.max) return false;
  if (spec.requiresLab && !hasTeamBuilding(state, side, "researchLab")) return false;
  const slot = side === "farmer" ? state.farmerSlots[owner] : state.hunterSlots[owner];
  const cost = spec.cost(level + 1, state.mode);
  if (!slot || slot.gold < cost) return false;
  slot.gold -= cost;
  state.stats[side].goldSpent += cost;
  state.research[side][kind] = level + 1;
  refreshGolems(state);
  pushEvent(
    state,
    "info",
    `${spec.name}升到 ${level + 1} 级`,
    state.map.hunterCamp.x,
    state.map.hunterCamp.y,
    side
  );
  return true;
}

function setCooldown(state: GameState, unitId: string, skill: SkillId, seconds: number): void {
  if (!state.cooldowns[unitId]) {
    state.cooldowns[unitId] = { eye: 0, golemQ: 0, golemE: 0, golemW: 0 };
  }
  state.cooldowns[unitId][skill] = seconds;
}

export function skillCooldown(state: GameState, unitId: string, skill: SkillId): number {
  return state.cooldowns[unitId]?.[skill] ?? 0;
}

export function castSkillFor(state: GameState, unit: Unit, skill: SkillId, x: number, y: number): boolean {
  const spec = SKILLS[skill];
  if (spec.golem && unit.kind !== "golem") return false;
  if (skill === "eye" && unit.kind !== "hunterHero") return false;
  if (skillCooldown(state, unit.id, skill) > 0) return false;
  const px = clamp(x, TILE, (state.map.w - 1) * TILE);
  const py = clamp(y, TILE, (state.map.h - 1) * TILE);
  let cd = spec.cd;
  if (skill === "eye") {
    cd = state.phase === "hide" ? 20 : state.phase === "expand" ? 15 : 10;
    const ward = spawnUnit(state, unit.side, unit.owner, "eyeWard", px, py);
    ward.expiresAt = state.time + (spec.duration ?? 6);
    state.reveal.push({ x: px, y: py, r: spec.radius, until: state.time + (spec.duration ?? 6) });
    pushEvent(state, "skill", "侦察之眼", px, py, unit.side);
  } else if (skill === "golemQ" || skill === "golemE") {
    const slow = skill === "golemE";
    for (const other of state.units) {
      if (other.side === unit.side || other.dead) continue;
      if (other.kind === "mine") continue;
      if (Math.hypot(other.x - px, other.y - py) <= spec.radius) {
        damageUnit(state, other, (spec.damage ?? 120) + unit.atk, unit.side, unit.owner, {
          slowFactor: slow ? spec.slowFactor ?? 0.5 : 0,
          slowUntil: slow ? state.time + (spec.slowSeconds ?? 3) : 0,
        });
      }
    }
    pushEvent(state, "skill", spec.name, px, py, unit.side);
  } else if (skill === "golemW") {
    const target = state.units.find(
      (u) => u.side !== unit.side && !u.dead && Math.hypot(u.x - px, u.y - py) <= spec.radius
    );
    if (target) {
      damageUnit(state, target, (spec.damage ?? 320) + unit.atk * 2, unit.side, unit.owner);
    } else {
      const building = state.buildings.find(
        (b) => b.side !== unit.side && b.hp > 0 && Math.hypot(b.x - px, b.y - py) <= spec.radius
      );
      if (building) damageBuilding(state, building, (spec.damage ?? 320) + unit.atk * 2, unit.side, unit.owner);
    }
    pushEvent(state, "skill", spec.name, px, py, unit.side);
  }
  setCooldown(state, unit.id, skill, cd);
  return true;
}

export function castSkill(state: GameState, skill: SkillId, x: number, y: number): boolean {
  const unit = playerUnit(state);
  if (!unit || unit.dead) return false;
  return castSkillFor(state, unit, skill, x, y);
}

export function detonateMine(state: GameState, id: string): boolean {
  const mine = state.units.find(
    (u) => u.id === id && u.kind === "mine" && u.side === "hunter" && u.owner === state.playerOwner && !u.dead
  );
  if (!mine) return false;
  explodeMine(state, mine);
  return true;
}

export function toggleWall(state: GameState, id: string): boolean {
  const building = state.buildings.find(
    (b) => b.id === id && b.side === state.side && b.owner === state.playerOwner && b.kind === "magicWall"
  );
  if (!building) return false;
  building.open = !building.open;
  pushEvent(state, "info", building.open ? "魔法墙已开门" : "魔法墙已关闭", building.x, building.y, state.side);
  return true;
}

export function controlUnit(state: GameState, unitId: string): boolean {
  const unit = state.units.find((u) => u.id === unitId && !u.dead);
  if (!unit || unit.side !== state.side) return false;
  if (unit.owner !== state.playerOwner) return false;
  if (!unit.isHero && unit.kind !== "golem") return false;
  state.playerUnitId = unit.id;
  return true;
}

export function applyCommand(state: GameState, command: Command): boolean {
  if (state.result) return false;
  const side = state.side;
  const owner = state.playerOwner;
  switch (command.t) {
    case "move": {
      const unit = playerUnit(state);
      if (!unit || unit.dead) return false;
      setUnitDestination(state, unit, command.x, command.y);
      return true;
    }
    case "build":
      return tryBuildFor(state, side, owner, command.kind, command.tx, command.ty);
    case "sell":
      return sellBuilding(state, command.id);
    case "research":
      return buyResearchFor(state, side, owner, command.kind);
    case "hire":
      return tryHireFor(state, side, owner, command.unit);
    case "skill":
      return castSkill(state, command.skill, command.x, command.y);
    case "buy":
      return buyItemFor(state, side, owner, command.item);
    case "use":
      return useItemFor(state, side, owner, command.item);
    case "detonate":
      return detonateMine(state, command.id);
    case "toggleWall":
      return toggleWall(state, command.id);
    case "control":
      return controlUnit(state, command.unitId);
    case "stance": {
      for (const unit of state.units) {
        if (unit.side === side && unit.owner === owner && !unit.isHero && !unit.dead) unit.stance = command.stance;
      }
      return true;
    }
    default:
      return false;
  }
}

export const SKILL_LIST = ALL_SKILLS;
export const ITEM_LIST = ALL_ITEMS;

export function skillReady(state: GameState, unitId: string, skill: SkillId): boolean {
  return skillCooldown(state, unitId, skill) <= 0;
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
    if (!parsed || parsed.version !== 2) return null;
    const mapRaw = parsed.map as GameMap & { terrain: number[]; trees: number[] };
    const map: GameMap = {
      w: mapRaw.w,
      h: mapRaw.h,
      seed: mapRaw.seed,
      terrain: Uint8Array.from(mapRaw.terrain),
      trees: Uint8Array.from(mapRaw.trees),
      farmerStarts: mapRaw.farmerStarts,
      hunterCamp: mapRaw.hunterCamp,
      groves: mapRaw.groves,
      patrol: mapRaw.patrol,
      merchantSpots: mapRaw.merchantSpots,
    };
    const state = {
      ...(parsed as unknown as GameState),
      map,
      vision: {
        farmer: new Uint8Array(map.w * map.h),
        hunter: new Uint8Array(map.w * map.h),
      },
      cooldowns: (parsed.cooldowns as GameState["cooldowns"]) ?? {},
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

export function playerSkillCooldown(state: GameState, skill: SkillId): number {
  return skillCooldown(state, state.playerUnitId, skill);
}

export function terrainBlocked(state: GameState, tx: number, ty: number): boolean {
  return isStaticBlocked(state.map, tx, ty) || terrainAtTile(state.map, tx, ty) === "water";
}

export function hunterLives(state: GameState): number {
  let lives = 0;
  for (const unit of state.units) {
    if (unit.side !== "hunter" || !unit.isHero) continue;
    lives += Math.max(0, unit.livesLeft);
  }
  return lives;
}

export function sideUnitCount(state: GameState, side: Side): number {
  return state.units.filter((u) => u.side === side && !u.dead && !u.isHero).length;
}

export { ALL_ITEMS, ALL_SKILLS };
export type { BuildingKind };
