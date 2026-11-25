// 「新巨魔与精灵」数值、地图与模式配置。数值尽量贴近原作（帐篷 1 金/秒起、
// 房屋升级木材门槛 32/96/256、巨魔拆建筑得金、商店装备等），集中在此便于调整。

import type {
  BuildingKind,
  Difficulty,
  ElfSkill,
  GameMode,
  MapData,
  Point,
  RockProp,
  RoomInfo,
  RoomSide,
  RoomTile,
  ShopKey,
  TreeProp,
  TrollRule,
  TrollSkill,
} from "./types";

export const TILE = 64;
export const MAP_TILES = 72;
export const MAP_SIZE = TILE * MAP_TILES;

/** 精灵建造半径（以英雄或生命之树为圆心） */
export const BUILD_RADIUS_TILES = 8;

/** 精灵英雄数值 */
export const ELF_HERO = {
  hp: 640,
  speed: 196,
  attack: 12,
  interval: 1.6,
  range: 110,
  regen: 1.2,
  radius: 16,
};

/** 巨魔基础数值（3.6.0 版本巨魔生命 500，此处取 520 便于手感） */
export const TROLL_BASE = {
  hp: 520,
  speed: 172,
  attack: 26,
  interval: 1.1,
  range: 66,
  regen: 1,
  // 巨魔是 2×2 体积：封住一半的 2 格宽入口后，它挤不过剩下的 1 格缝，而精灵（1×1）可以
  radius: 34,
  /** 每次命中建筑获得的金币系数（原作拆墙得金） */
  lootPerHit: 0.08,
  lootBase: 2,
  destroyBonus: 40,
  /** 击杀单位赏金 */
  unitBounty: 18,
};

/** 幽灵狼（-double 规则下巨魔死亡后的形态） */
export const WOLF = {
  hp: 420,
  speed: 226,
  attack: 18,
  interval: 1,
  radius: 18,
};

/** 小精灵伐木 */
export const WISP = {
  hp: 40,
  speed: 150,
  carry: 6,
  harvestTime: 1.6,
  spawnInterval: 9,
  radius: 9,
  /** 每级生命之树提供的小精灵上限 */
  capByLevel: [3, 5, 7],
};

/** 修理工 */
export const REPAIRER = {
  speed: 150,
  radius: 8,
  range: 46,
  perWorkshop: [2, 3],
};

/** 精灵技能 */
export const ELF_SKILLS: Record<
  ElfSkill,
  { label: string; desc: string; cooldown: number; range?: number; value?: number }
> = {
  night: { label: "黑夜", desc: "制造 12 秒黑夜，巨魔视野受限，便于潜行逃跑", cooldown: 55, value: 12 },
  entangle: { label: "缠绕", desc: "定身最近的巨魔 2.2 秒", cooldown: 22, range: 300, value: 2.2 },
  blink: { label: "闪现", desc: "向移动方向瞬移 6 格", cooldown: 12, range: 6 * TILE },
  reinforce: { label: "加固", desc: "所有己方建筑恢复 35% 生命（墙 50%）", cooldown: 45, value: 0.35 },
};

/** 巨魔技能 */
export const TROLL_SKILLS: Record<
  TrollSkill,
  { label: string; desc: string; cooldown: number; value?: number }
> = {
  windwalk: { label: "疾风步", desc: "隐身 5 秒并提速 35%，塔无法锁定", cooldown: 22, value: 5 },
  recall: { label: "巫医召回", desc: "立刻回到巨魔小屋", cooldown: 70 },
};

/** 木材购买：每次 10 木材，价格递增 */
export const WOOD_PACK = { amount: 10, basePrice: 45, step: 14 };

export interface BuildLevel {
  hp: number;
  cost: number;
  wood: number;
  /** 每秒金币收入 */
  income?: number;
  dmg?: number;
  range?: number;
  interval?: number;
  /** 减速强度（0-1） */
  slow?: number;
  /** 溅射半径 */
  splash?: number;
  /** 毒伤每秒 */
  poison?: number;
  /** 塔研究所提供的伤害加成 */
  towerBonus?: number;
  /** 修理工维修速度（每秒生命） */
  repair?: number;
}

export interface BuildingSpec {
  kind: BuildingKind;
  label: string;
  desc: string;
  size: number;
  team: "elf" | "troll";
  category: "econ" | "wall" | "tower" | "support" | "troll";
  levels: BuildLevel[];
}

export const BUILD_SPECS: Record<BuildingKind, BuildingSpec> = {
  tree: {
    kind: "tree",
    label: "生命之树",
    desc: "精灵核心，持续产生小精灵伐木；可升级提高小精灵上限",
    size: 2,
    team: "elf",
    category: "econ",
    levels: [
      { hp: 2400, cost: 0, wood: 0 },
      { hp: 3200, cost: 260, wood: 40 },
      { hp: 4200, cost: 520, wood: 120 },
    ],
  },
  tent: {
    kind: "tent",
    label: "帐篷",
    desc: "精灵主要经济来源，等级越高金币越多（升级需要木材）",
    size: 1,
    team: "elf",
    category: "econ",
    levels: [
      { hp: 420, cost: 90, wood: 0, income: 1 },
      { hp: 620, cost: 170, wood: 32, income: 2.2 },
      { hp: 880, cost: 320, wood: 96, income: 3.8 },
      { hp: 1200, cost: 620, wood: 256, income: 6 },
    ],
  },
  goldmine: {
    kind: "goldmine",
    label: "金矿",
    desc: "由小精灵化成，持续产出大量金币",
    size: 1,
    team: "elf",
    category: "econ",
    levels: [
      { hp: 600, cost: 240, wood: 60, income: 4 },
      { hp: 900, cost: 420, wood: 120, income: 7 },
    ],
  },
  workshop: {
    kind: "workshop",
    label: "工人雇佣所",
    desc: "自动派出修理工修理附近受损建筑",
    size: 1,
    team: "elf",
    category: "support",
    levels: [
      { hp: 700, cost: 150, wood: 20, repair: 14 },
      { hp: 950, cost: 280, wood: 48, repair: 22 },
    ],
  },
  lab: {
    kind: "lab",
    label: "塔研究所",
    desc: "提升所有防御塔的伤害",
    size: 1,
    team: "elf",
    category: "support",
    levels: [
      { hp: 800, cost: 220, wood: 40, towerBonus: 0.12 },
      { hp: 1050, cost: 360, wood: 80, towerBonus: 0.24 },
      { hp: 1350, cost: 560, wood: 160, towerBonus: 0.4 },
    ],
  },
  woodwall: {
    kind: "woodwall",
    label: "木墙",
    desc: "最便宜的封路墙体，阻挡巨魔并为塔争取时间",
    size: 1,
    team: "elf",
    category: "wall",
    levels: [
      { hp: 650, cost: 20, wood: 0 },
      { hp: 1100, cost: 40, wood: 0 },
      { hp: 1800, cost: 80, wood: 0 },
    ],
  },
  stone: {
    kind: "stone",
    label: "石头",
    desc: "高生命墙体，原作中最常用的堵路口手段",
    size: 1,
    team: "elf",
    category: "wall",
    levels: [
      { hp: 1600, cost: 60, wood: 8 },
      { hp: 2600, cost: 110, wood: 16 },
      { hp: 4000, cost: 200, wood: 32 },
    ],
  },
  icewall: {
    kind: "icewall",
    label: "冰墙",
    desc: "被巨魔攻击时使其减速",
    size: 1,
    team: "elf",
    category: "wall",
    levels: [
      { hp: 1000, cost: 90, wood: 16, slow: 0.22 },
      { hp: 1600, cost: 150, wood: 32, slow: 0.32 },
      { hp: 2400, cost: 260, wood: 64, slow: 0.42 },
    ],
  },
  arrow: {
    kind: "arrow",
    label: "箭塔",
    desc: "单体高射速，性价比最高的前期塔",
    size: 1,
    team: "elf",
    category: "tower",
    levels: [
      { hp: 480, cost: 100, wood: 12, dmg: 18, range: 220, interval: 0.85 },
      { hp: 620, cost: 180, wood: 24, dmg: 30, range: 235, interval: 0.8 },
      { hp: 820, cost: 320, wood: 48, dmg: 48, range: 250, interval: 0.75 },
    ],
  },
  gun: {
    kind: "gun",
    label: "火枪塔",
    desc: "高单发伤害，射速较慢",
    size: 1,
    team: "elf",
    category: "tower",
    levels: [
      { hp: 620, cost: 160, wood: 20, dmg: 52, range: 250, interval: 1.8 },
      { hp: 820, cost: 280, wood: 40, dmg: 85, range: 265, interval: 1.7 },
      { hp: 1080, cost: 480, wood: 80, dmg: 135, range: 280, interval: 1.6 },
    ],
  },
  poison: {
    kind: "poison",
    label: "毒塔",
    desc: "持续毒伤，克制高生命巨魔",
    size: 1,
    team: "elf",
    category: "tower",
    levels: [
      { hp: 560, cost: 180, wood: 24, dmg: 10, range: 200, interval: 1.1, poison: 12 },
      { hp: 760, cost: 300, wood: 48, dmg: 16, range: 210, interval: 1.05, poison: 20 },
      { hp: 1000, cost: 520, wood: 96, dmg: 24, range: 220, interval: 1, poison: 32 },
    ],
  },
  ice: {
    kind: "ice",
    label: "冰塔",
    desc: "命中后减速巨魔",
    size: 1,
    team: "elf",
    category: "tower",
    levels: [
      { hp: 600, cost: 170, wood: 24, dmg: 14, range: 210, interval: 1.3, slow: 0.25 },
      { hp: 800, cost: 290, wood: 48, dmg: 22, range: 220, interval: 1.25, slow: 0.35 },
      { hp: 1060, cost: 500, wood: 96, dmg: 34, range: 235, interval: 1.2, slow: 0.45 },
    ],
  },
  moon: {
    kind: "moon",
    label: "银月塔",
    desc: "昂贵但强力的范围魔法塔",
    size: 1,
    team: "elf",
    category: "tower",
    levels: [
      { hp: 900, cost: 320, wood: 60, dmg: 60, range: 240, interval: 1.5, splash: 80 },
      { hp: 1200, cost: 520, wood: 120, dmg: 95, range: 255, interval: 1.4, splash: 95 },
      { hp: 1600, cost: 860, wood: 220, dmg: 150, range: 270, interval: 1.3, splash: 110 },
    ],
  },
  hut: {
    kind: "hut",
    label: "巨魔小屋",
    desc: "巨魔的被动金币来源，升级提高每秒收入",
    size: 2,
    team: "troll",
    category: "troll",
    levels: [
      { hp: 3600, cost: 0, wood: 0, income: 1.2 },
      { hp: 4200, cost: 260, wood: 0, income: 2.3 },
      { hp: 4800, cost: 520, wood: 0, income: 3.8 },
      { hp: 5600, cost: 900, wood: 0, income: 5.6 },
    ],
  },
};

export const ELF_BUILDABLE: BuildingKind[] = [
  "tent",
  "goldmine",
  "woodwall",
  "stone",
  "icewall",
  "arrow",
  "gun",
  "poison",
  "ice",
  "moon",
  "workshop",
  "lab",
];

export const BUILD_CATEGORIES: { key: string; label: string; kinds: BuildingKind[] }[] = [
  { key: "econ", label: "经济", kinds: ["tent", "goldmine"] },
  { key: "wall", label: "墙体", kinds: ["woodwall", "stone", "icewall"] },
  { key: "tower", label: "防御塔", kinds: ["arrow", "gun", "poison", "ice", "moon"] },
  { key: "support", label: "辅助", kinds: ["workshop", "lab"] },
];

export const TOWER_KINDS: BuildingKind[] = ["arrow", "gun", "poison", "ice", "moon"];

export interface ShopSpec {
  key: ShopKey;
  label: string;
  desc: string;
  costs: number[];
  /** 每级效果值 */
  per: number;
}

/** 巨魔商店：武器、手套、鞋子、护甲、生命、回血 */
export const SHOP_ITEMS: Record<ShopKey, ShopSpec> = {
  weapon: { key: "weapon", label: "武器", desc: "攻击力 +14 / 级", costs: [260, 420, 650, 950, 1400], per: 14 },
  gloves: { key: "gloves", label: "手套", desc: "攻击速度 +15% / 级", costs: [240, 400, 640, 950], per: 0.15 },
  boots: { key: "boots", label: "鞋子", desc: "移动速度 +8% / 级", costs: [200, 340, 520, 800], per: 0.08 },
  armor: { key: "armor", label: "护甲", desc: "受到伤害 -10% / 级", costs: [220, 380, 600, 900], per: 0.1 },
  vitality: { key: "vitality", label: "生命", desc: "生命上限 +180 / 级", costs: [260, 440, 700, 1050], per: 180 },
  regen: { key: "regen", label: "回血", desc: "每秒回复 +3 生命 / 级", costs: [220, 380, 620], per: 3 },
};

/** 生命卷轴（可重复购买） */
export const SCROLL = { cost: 180, heal: 350 };

export interface ModeSpec {
  label: string;
  desc: string;
  elfCount: number;
  goldMult: number;
  /** 生存模式胜利时间（秒） */
  surviveTime: number | null;
}

export const GAME_MODES: Record<GameMode, ModeSpec> = {
  old: { label: "经典", desc: "1 巨魔 vs 3 精灵，自由发育", elfCount: 3, goldMult: 1, surviveTime: null },
  fast: { label: "快攻", desc: "金币翻倍，对局更快", elfCount: 3, goldMult: 2, surviveTime: null },
  solo: { label: "单挑", desc: "1 精灵 vs 1 巨魔", elfCount: 1, goldMult: 1, surviveTime: null },
  team: { label: "团队", desc: "2 精灵协作 vs 1 巨魔", elfCount: 2, goldMult: 1, surviveTime: null },
  run: { label: "生存", desc: "精灵存活 16 分钟即获胜", elfCount: 2, goldMult: 1, surviveTime: 960 },
};

export const TROLL_RULES: Record<TrollRule, { label: string; desc: string }> = {
  single: { label: "单巨魔", desc: "巨魔死亡立即结束" },
  double: { label: "双巨魔", desc: "巨魔死亡后变幽灵狼，全部变狼则巨魔方败" },
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

export const START_GOLD_PLAYER = 220;
export const START_GOLD_AI = 200;
export const START_WOOD = 0;

/** 精灵出生点（玩家使用 0 号） */
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

/** 9×9 的房间，内部 7×7 可建造；围墙由地形构成，只留一个入口 */
function buildRooms(): RoomInfo[] {
  return BASE_SITES.map((site) => {
    const gx0 = site.tx - 3;
    const gy0 = site.ty - 3;
    const gx1 = site.tx + 5;
    const gy1 = site.ty + 5;
    const cx = site.tx + 1;
    const cy = site.ty + 1;
    const dx = MAP_CENTER.x / TILE - (site.tx + 0.5);
    const dy = MAP_CENTER.y / TILE - (site.ty + 0.5);
    let side: RoomSide;
    if (Math.abs(dx) >= Math.abs(dy)) side = dx > 0 ? "east" : "west";
    else side = dy > 0 ? "south" : "north";
    // 入口宽 2 格，放一块墙后剩下的 1 格缝隙精灵能过、巨魔（2×2）过不去
    let gateX = cx;
    let gateY = cy;
    let gate2X = cx;
    let gate2Y = cy;
    if (side === "east" || side === "west") {
      gateX = side === "east" ? gx1 : gx0;
      gate2X = gateX;
      gateY = cy - 1;
      gate2Y = cy;
    } else {
      gateY = side === "south" ? gy1 : gy0;
      gate2Y = gateY;
      gateX = cx - 1;
      gate2X = cx;
    }
    const isGate = (x: number, y: number) =>
      (x === gateX && y === gateY) || (x === gate2X && y === gate2Y);
    const walls: RoomTile[] = [];
    for (let y = gy0; y <= gy1; y += 1) {
      for (let x = gx0; x <= gx1; x += 1) {
        const border = x === gx0 || x === gx1 || y === gy0 || y === gy1;
        if (!border) continue;
        if (isGate(x, y)) continue;
        walls.push({ gx: x, gy: y });
      }
    }
    return { siteId: site.id, gx0, gy0, gx1, gy1, gateX, gateY, gate2X, gate2Y, side, walls };
  });
}

export const BASE_ROOMS: RoomInfo[] = buildRooms();

/** 房间入口正中（两格之间）的世界坐标，用作道路终点 */
export function roomGateWorld(room: RoomInfo): Point {
  return {
    x: ((room.gateX + room.gate2X + 1) / 2) * TILE,
    y: ((room.gateY + room.gate2Y + 1) / 2) * TILE,
  };
}

export function isRoomWallTile(gx: number, gy: number): boolean {
  for (const room of BASE_ROOMS) {
    if (gx < room.gx0 || gx > room.gx1 || gy < room.gy0 || gy > room.gy1) continue;
    const border = gx === room.gx0 || gx === room.gx1 || gy === room.gy0 || gy === room.gy1;
    if (!border) return false;
    return !((gx === room.gateX && gy === room.gateY) || (gx === room.gate2X && gy === room.gate2Y));
  }
  return false;
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
    basePoints.some((p) => Math.hypot(p.x - x, p.y - y) < 9 * TILE);
  const blockedByRoad = (x: number, y: number) =>
    basePoints.some((p) => distToSegment(x, y, MAP_CENTER.x, MAP_CENTER.y, p.x, p.y) < 1.7 * TILE);
  const blockedByCenter = (x: number, y: number) =>
    Math.hypot(x - MAP_CENTER.x, y - MAP_CENTER.y) < 4.5 * TILE;

  let guard = 0;
  while (trees.length < 92 && guard < 6000) {
    guard++;
    const x = (1 + rand() * (MAP_TILES - 2)) * TILE;
    const y = (1 + rand() * (MAP_TILES - 2)) * TILE;
    const r = 22 + rand() * 12;
    if (blockedByBase(x, y) || blockedByRoad(x, y) || blockedByCenter(x, y)) continue;
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
    if (blockedByBase(x, y) || blockedByRoad(x, y) || blockedByCenter(x, y)) continue;
    const nx = (x - POND.x) / (POND.rx + 40);
    const ny = (y - POND.y) / (POND.ry + 40);
    if (nx * nx + ny * ny < 1) continue;
    if (blockedByTree(x, y, 26)) continue;
    if (rocks.some((rock) => Math.hypot(rock.x - x, rock.y - y) < 140)) continue;
    rocks.push({ x, y, r: 20 + rand() * 10, variant: Math.floor(rand() * 2) });
  }

  return { trees, rocks, rooms: BASE_ROOMS };
}

export const MAP_DATA: MapData = generateMap();

/** 判断格子是否被地形（房间墙/水/树/石）阻挡 */
export function isTerrainBlocked(gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= MAP_TILES || gy >= MAP_TILES) return true;
  if (isRoomWallTile(gx, gy)) return true;
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
