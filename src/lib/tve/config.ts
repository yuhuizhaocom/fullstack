// 「巨魔 VS 精灵」的数值、地图与平衡配置。所有可调参数集中在这里。

import type { BuildingKind, Difficulty, MapData, Point, TreeProp, RockProp, UpgradeTrack } from "./types";

export const TILE = 64;
export const MAP_TILES = 72;
export const MAP_SIZE = TILE * MAP_TILES;

/** 精灵建造范围（格） */
export const BUILD_RADIUS_TILES = 7;

export const DAY_LENGTH = 85;
export const NIGHT_LENGTH = 55;
export const WARNING_TIME = 5;

export const START_GOLD_PLAYER = 180;
export const START_GOLD_AI = 170;

// 单棵树血量按「一局 8-12 分钟」反推：巨魔拆完 3 棵树约 7-9 分钟
export const TREE_OF_LIFE_HP = 4800;
export const MAX_MINES = 3;

export const VILLAGER = {
  hp: 55,
  speed: 70,
  bounty: 12,
  income: 2,
  incomeInterval: 5,
  respawn: 12,
  fleeRange: 5 * TILE,
  max: 3,
};

export const TROLL_BASE = {
  hp: 900,
  daySpeed: 105,
  nightSpeed: 195,
  dayAtk: 18,
  nightAtk: 38,
  attackInterval: 0.9,
  attackRange: 52,
  nightRegen: 8,
  buildingBonus: 1.25,
  loot: 3,
  lootInterval: 6,
};

export const RUSH = { duration: 2, mult: 1.8, cooldown: 9 };

export interface LevelSpec {
  hp: number;
  cost: number;
  income?: number;
  dmg?: number;
  range?: number;
  interval?: number;
  radius?: number;
  slow?: number;
  multishot?: number;
}

export interface BuildingSpec {
  kind: BuildingKind;
  label: string;
  desc: string;
  size: number;
  levels: LevelSpec[];
}

export const BUILD_SPECS: Record<BuildingKind, BuildingSpec> = {
  tree: {
    kind: "tree",
    label: "生命之树",
    desc: "精灵基地核心，被摧毁则该精灵战败",
    size: 2,
    levels: [{ hp: TREE_OF_LIFE_HP, cost: 0 }],
  },
  mine: {
    kind: "mine",
    label: "金矿",
    desc: "持续产出金币，每个基地最多 3 座",
    size: 1,
    levels: [
      { hp: 400, cost: 100, income: 5 },
      { hp: 560, cost: 120, income: 9 },
      { hp: 760, cost: 240, income: 15 },
    ],
  },
  wall: {
    kind: "wall",
    label: "木墙",
    desc: "阻挡巨魔前进，为防御塔争取时间",
    size: 1,
    levels: [
      { hp: 700, cost: 30 },
      { hp: 1200, cost: 40 },
      { hp: 1900, cost: 70 },
    ],
  },
  arrow: {
    kind: "arrow",
    label: "箭塔",
    desc: "单体高射速，射程远",
    size: 1,
    levels: [
      { hp: 420, cost: 90, dmg: 16, range: 190, interval: 1.1 },
      { hp: 560, cost: 120, dmg: 26, range: 210, interval: 1.05 },
      { hp: 720, cost: 220, dmg: 40, range: 230, interval: 1, multishot: 2 },
    ],
  },
  magic: {
    kind: "magic",
    label: "魔法塔",
    desc: "范围伤害并减速巨魔",
    size: 1,
    levels: [
      { hp: 380, cost: 130, dmg: 60, range: 180, interval: 1.8, radius: 90 },
      { hp: 500, cost: 200, dmg: 90, range: 195, interval: 1.7, radius: 100, slow: 0.3 },
      { hp: 660, cost: 320, dmg: 130, range: 210, interval: 1.6, radius: 115, slow: 0.4 },
    ],
  },
};

export const ELF_BUILDABLE: BuildingKind[] = ["mine", "wall", "arrow", "magic"];

export interface TrollUpgradeSpec {
  label: string;
  desc: string;
  costs: number[];
  /** 每级加成：攻击倍率 / 移速倍率 / 生命值 */
  value: number;
}

export const TROLL_UPGRADES: Record<UpgradeTrack, TrollUpgradeSpec> = {
  claw: {
    label: "利爪",
    desc: "攻击力 +30% / 级",
    costs: [120, 220, 380],
    value: 0.3,
  },
  swift: {
    label: "疾行",
    desc: "移动速度 +12% / 级",
    costs: [100, 180, 300],
    value: 0.12,
  },
  hide: {
    label: "厚皮",
    desc: "最大生命 +250 并回满 / 级",
    costs: [140, 240, 400],
    value: 250,
  },
};

export interface DifficultySpec {
  label: string;
  desc: string;
  /** AI 决策间隔倍率（越大越迟钝） */
  aiInterval: number;
  /** AI 巨魔的攻防系数 */
  trollStat: number;
  /** AI 精灵收入系数 */
  aiIncome: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultySpec> = {
  easy: { label: "简单", desc: "AI 反应慢，巨魔较弱", aiInterval: 1.25, trollStat: 0.9, aiIncome: 0.95 },
  normal: { label: "普通", desc: "标准对抗节奏", aiInterval: 1, trollStat: 1, aiIncome: 1 },
  hard: { label: "困难", desc: "AI 建设快，巨魔凶猛", aiInterval: 0.8, trollStat: 1.15, aiIncome: 1.05 },
};

/** 三个精灵基地；玩家扮演精灵时使用 0 号基地 */
export interface BaseSite {
  id: number;
  name: string;
  /** 中心格子 */
  tx: number;
  ty: number;
}

export const BASE_SITES: BaseSite[] = [
  { id: 0, name: "西北谷地", tx: 14, ty: 14 },
  { id: 1, name: "东北林间", tx: 57, ty: 14 },
  { id: 2, name: "南方河湾", tx: 36, ty: 56 },
];

export const MAP_CENTER: Point = { x: 36.5 * TILE, y: 36.5 * TILE };

/** 池塘（世界单位椭圆） */
export const POND = {
  x: 18.5 * TILE,
  y: 40.5 * TILE,
  rx: 5.4 * TILE,
  ry: 3.8 * TILE,
};

export function baseWorld(site: BaseSite): Point {
  return { x: (site.tx + 0.5) * TILE, y: (site.ty + 0.5) * TILE };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function isPondTile(gx: number, gy: number): boolean {
  const x = (gx + 0.5) * TILE;
  const y = (gy + 0.5) * TILE;
  const nx = (x - POND.x) / POND.rx;
  const ny = (y - POND.y) / POND.ry;
  return nx * nx + ny * ny <= 1;
}

function generateMap(): MapData {
  const rand = mulberry32(20261125);
  const trees: TreeProp[] = [];
  const rocks: RockProp[] = [];
  const basePoints = BASE_SITES.map((s) => ({ x: (s.tx + 0.5) * TILE, y: (s.ty + 0.5) * TILE }));

  const blockedByTree = (x: number, y: number, r: number) =>
    trees.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r + 10);
  const blockedByBase = (x: number, y: number) =>
    basePoints.some((p) => Math.hypot(p.x - x, p.y - y) < 7.5 * TILE);
  const blockedByRoad = (x: number, y: number) =>
    basePoints.some((p) => distToSegment(x, y, MAP_CENTER.x, MAP_CENTER.y, p.x, p.y) < 1.7 * TILE);

  let guard = 0;
  while (trees.length < 92 && guard < 6000) {
    guard++;
    const x = (1 + rand() * (MAP_TILES - 2)) * TILE;
    const y = (1 + rand() * (MAP_TILES - 2)) * TILE;
    const r = 22 + rand() * 12;
    if (blockedByBase(x, y) || blockedByRoad(x, y)) continue;
    const nx = (x - POND.x) / (POND.rx + 50);
    const ny = (y - POND.y) / (POND.ry + 50);
    if (nx * nx + ny * ny < 1) continue;
    if (blockedByTree(x, y, r)) continue;
    if (rocks.some((rock) => Math.hypot(rock.x - x, rock.y - y) < 90)) continue;
    trees.push({ x, y, r, variant: Math.floor(rand() * 3) });
  }

  guard = 0;
  while (rocks.length < 16 && guard < 3000) {
    guard++;
    const x = (2 + rand() * (MAP_TILES - 4)) * TILE;
    const y = (2 + rand() * (MAP_TILES - 4)) * TILE;
    if (blockedByBase(x, y) || blockedByRoad(x, y)) continue;
    const nx = (x - POND.x) / (POND.rx + 40);
    const ny = (y - POND.y) / (POND.ry + 40);
    if (nx * nx + ny * ny < 1) continue;
    if (blockedByTree(x, y, 26)) continue;
    if (rocks.some((rock) => Math.hypot(rock.x - x, rock.y - y) < 140)) continue;
    rocks.push({ x, y, r: 20 + rand() * 10, variant: Math.floor(rand() * 2) });
  }

  return { trees, rocks };
}

export const MAP_DATA: MapData = generateMap();

/** 判断格子是否被地形（水/树/石）阻挡 */
export function isTerrainBlocked(gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= MAP_TILES || gy >= MAP_TILES) return true;
  if (isPondTile(gx, gy)) return true;
  const x = (gx + 0.5) * TILE;
  const y = (gy + 0.5) * TILE;
  for (const t of MAP_DATA.trees) {
    if (Math.hypot(t.x - x, t.y - y) < t.r + TILE * 0.32) return true;
  }
  for (const r of MAP_DATA.rocks) {
    if (Math.hypot(r.x - x, r.y - y) < r.r + TILE * 0.3) return true;
  }
  return false;
}

/** 格子是否可通行（地形 + 建筑由调用方补充） */
export function isWalkableTerrain(gx: number, gy: number): boolean {
  return !isTerrainBlocked(gx, gy);
}

export function tileCenter(g: number): number {
  return (g + 0.5) * TILE;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** 精灵建造槽位（相对基地中心格），按 AI 建造优先级排序 */
export const AI_BUILD_SLOTS: { kind: BuildingKind; dx: number; dy: number; level: number }[] = [
  { kind: "mine", dx: -3, dy: -2, level: 0 },
  { kind: "mine", dx: 2, dy: -3, level: 0 },
  { kind: "arrow", dx: -3, dy: 2, level: 0 },
  { kind: "arrow", dx: 2, dy: 2, level: 0 },
  { kind: "wall", dx: -4, dy: -1, level: 0 },
  { kind: "wall", dx: 3, dy: -1, level: 0 },
  { kind: "wall", dx: -1, dy: -4, level: 0 },
  { kind: "wall", dx: 2, dy: -4, level: 0 },
  { kind: "mine", dx: -3, dy: 3, level: 0 },
  { kind: "magic", dx: 3, dy: 3, level: 0 },
  { kind: "wall", dx: -4, dy: 2, level: 0 },
  { kind: "wall", dx: 3, dy: 2, level: 0 },
  { kind: "arrow", dx: -4, dy: 0, level: 0 },
  { kind: "wall", dx: -1, dy: 3, level: 0 },
  { kind: "wall", dx: 2, dy: 3, level: 0 },
];
