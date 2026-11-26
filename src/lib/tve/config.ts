// 「新巨魔与精灵」数值、地图与模式配置。数值尽量贴近原作（帐篷 1 金/秒起并逐级翻倍、
// 房屋升级木材门槛 32/96/256、巨魔小屋 2/5/10/20 金每秒、巨魔拆建筑得金、商店装备等），
// 集中在此便于调整。

import type {
  BuildingKind,
  Difficulty,
  ElfSkill,
  GameMode,
  MapData,
  Point,
  RockProp,
  RoomGate,
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

/** 精灵英雄数值（默认移速略慢于巨魔，靠闪烁与疾跑拉开距离） */
export const ELF_HERO = {
  hp: 640,
  speed: 148,
  attack: 12,
  interval: 1.6,
  range: 110,
  regen: 1.2,
  radius: 16,
};

/** 巨魔基础数值（原作 3.6.0 巨魔生命 500） */
export const TROLL_BASE = {
  hp: 500,
  speed: 172,
  attack: 26,
  interval: 1.1,
  range: 66,
  regen: 1,
  // 巨魔是 2×2 体积：封住一半的 2 格宽入口后，它挤不过剩下的 1 格缝，而精灵（1×1）可以
  radius: 34,
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

/**
 * 精灵维修：免费且持续，按建筑最大生命的百分比回复，必须走到建筑附近才能修。
 * 手动点选维修与自动维修同速；自动维修只在精灵空闲且存在未满血建筑时触发。
 */
export const REPAIR = {
  /** 每秒回复最大生命的百分比（2.5 表示 2.5%/秒） */
  percentPerSec: 2.5,
  /** 维修距离（建筑边缘到精灵的像素） */
  range: 72,
};

/** 精灵技能 */
export const ELF_SKILLS: Record<
  ElfSkill,
  { label: string; desc: string; cooldown: number; range?: number; value?: number }
> = {
  blink: { label: "闪烁", desc: "向移动方向瞬移 6 格", cooldown: 12, range: 6 * TILE },
  haste: { label: "疾跑", desc: "8 秒内移速 +60%", cooldown: 18, value: 8 },
  entangle: { label: "缠绕", desc: "定身最近巨魔 2.2 秒，并打断回城读条", cooldown: 22, range: 320, value: 2.2 },
  silence: { label: "沉默", desc: "沉默最近巨魔 6 秒，并打断回城读条", cooldown: 32, range: 320, value: 6 },
  wallguard: { label: "墙之守护", desc: "所有己方墙体无敌 6 秒（高冷却）", cooldown: 120, value: 6 },
};

/** 巨魔技能 */
export const TROLL_SKILLS: Record<
  TrollSkill,
  { label: string; desc: string; cooldown: number; value?: number }
> = {
  windwalk: { label: "隐身", desc: "隐身 5 秒并提速 35%；隐身时不会自动攻击，手动出手会立刻显形", cooldown: 22, value: 5 },
  berserk: { label: "狂暴", desc: "8 秒内攻击 +30%、攻速 +40%", cooldown: 45, value: 8 },
  recall: { label: "回城", desc: "4 秒读条后回到小屋，可被沉默/缠绕打断", cooldown: 70, value: 4 },
};

/** 回城卷轴（商店购买，瞬间回城且不可打断） */
export const RECALL_SCROLL = { cost: 150 };

/** 帐篷全毁后的视野暴露：中期才启用，重建后仍保留一段时间 */
export const REVEAL = {
  /** 游戏时间达到该秒数后才启用（5 分钟） */
  startTime: 300,
  /** 帐篷重建后继续暴露的秒数 */
  linger: 45,
};

/** 预警哨：巨魔进入该半径时对精灵玩家发出预警，同一哨点有冷却 */
export const WATCH = { radius: 560, cooldown: 7 };

/** 木材市场：每次买入/卖出 10 木材，买入价格递增，卖出按当前价格折算 */
export const WOOD_PACK = { amount: 10, basePrice: 45, step: 14, sellRatio: 0.5, minSell: 12 };

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
  /** 升级/建造所需的帐篷等级（经济门槛） */
  requireTentLevel?: number;
  /** 升级所需生命之树等级（帐篷门槛） */
  requireTreeLevel?: number;
  /** 升级所需墙体等级（帐篷升级门槛：金币 + 木材 + 墙体等级） */
  requireWallLevel?: number;
  /** 荆棘反伤比例（0-1），受击时反弹给攻击者 */
  thorn?: number;
  /** 每秒自愈（最大生命的比例，0.01 表示 1%/秒） */
  regen?: number;
}

export interface BuildingSpec {
  kind: BuildingKind;
  label: string;
  desc: string;
  size: number;
  team: "elf" | "troll";
  category: "econ" | "wall" | "tower" | "support" | "troll";
  /** 建造耗时（秒），0 表示瞬间完成 */
  buildTime?: number;
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
    desc: "精灵主要经济来源，每级收入翻倍；升级需要金币、木材与墙体等级",
    size: 1,
    team: "elf",
    category: "econ",
    buildTime: 5,
    levels: [
      { hp: 420, cost: 90, wood: 0, income: 1 },
      { hp: 620, cost: 170, wood: 0, income: 2 },
      { hp: 880, cost: 320, wood: 32, income: 4, requireWallLevel: 2 },
      { hp: 1200, cost: 620, wood: 96, income: 8, requireWallLevel: 3 },
    ],
  },
  goldmine: {
    kind: "goldmine",
    label: "金矿",
    desc: "由小精灵化成，持续产出大量金币",
    size: 1,
    team: "elf",
    category: "econ",
    buildTime: 8,
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
    buildTime: 8,
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
    buildTime: 10,
    levels: [
      { hp: 800, cost: 220, wood: 40, towerBonus: 0.12 },
      { hp: 1050, cost: 360, wood: 80, towerBonus: 0.24 },
      { hp: 1350, cost: 560, wood: 160, towerBonus: 0.4 },
    ],
  },
  wall: {
    kind: "wall",
    label: "普通墙",
    desc: "基础墙体，升到 4 级后可选择一次强化方向继续成长",
    size: 1,
    team: "elf",
    category: "wall",
    buildTime: 2.5,
    levels: [
      { hp: 750, cost: 20, wood: 0 },
      { hp: 1200, cost: 45, wood: 0, requireTentLevel: 2 },
      { hp: 1800, cost: 90, wood: 16, requireTentLevel: 3 },
      { hp: 2600, cost: 170, wood: 40, requireTentLevel: 3 },
      { hp: 3600, cost: 320, wood: 80, requireTentLevel: 4 },
    ],
  },
  grasswall: {
    kind: "grasswall",
    label: "草墙",
    desc: "最便宜的封路墙体，生命较低但会缓慢自愈",
    size: 1,
    team: "elf",
    category: "wall",
    buildTime: 2,
    levels: [
      { hp: 480, cost: 15, wood: 0, regen: 0.01 },
      { hp: 850, cost: 30, wood: 0, regen: 0.015, requireTentLevel: 2 },
      { hp: 1400, cost: 65, wood: 12, regen: 0.02, requireTentLevel: 3 },
      { hp: 2100, cost: 130, wood: 28, regen: 0.025, requireTentLevel: 3 },
      { hp: 3000, cost: 260, wood: 64, regen: 0.03, requireTentLevel: 4 },
    ],
  },
  stone: {
    kind: "stone",
    label: "岩石墙",
    desc: "高生命墙体，原作中最常用的堵路口手段",
    size: 1,
    team: "elf",
    category: "wall",
    buildTime: 3.5,
    levels: [
      { hp: 1500, cost: 55, wood: 0 },
      { hp: 2500, cost: 105, wood: 0, requireTentLevel: 2 },
      { hp: 3900, cost: 190, wood: 24, requireTentLevel: 3 },
      { hp: 5400, cost: 340, wood: 56, requireTentLevel: 3 },
      { hp: 7200, cost: 620, wood: 120, requireTentLevel: 4 },
    ],
  },
  concrete: {
    kind: "concrete",
    label: "水泥墙",
    desc: "生命最高的墙体，价格昂贵，适合封死主通道",
    size: 1,
    team: "elf",
    category: "wall",
    buildTime: 4.5,
    levels: [
      { hp: 2400, cost: 120, wood: 16 },
      { hp: 3800, cost: 220, wood: 0, requireTentLevel: 2 },
      { hp: 5600, cost: 400, wood: 40, requireTentLevel: 3 },
      { hp: 7600, cost: 680, wood: 88, requireTentLevel: 3 },
      { hp: 10000, cost: 1200, wood: 180, requireTentLevel: 4 },
    ],
  },
  thorn: {
    kind: "thorn",
    label: "荆棘墙",
    desc: "被巨魔近战攻击时反弹伤害",
    size: 1,
    team: "elf",
    category: "wall",
    buildTime: 3.5,
    levels: [
      { hp: 1100, cost: 85, wood: 12, thorn: 0.15 },
      { hp: 1800, cost: 160, wood: 0, thorn: 0.25, requireTentLevel: 2 },
      { hp: 2800, cost: 300, wood: 32, thorn: 0.35, requireTentLevel: 3 },
      { hp: 4000, cost: 520, wood: 72, thorn: 0.45, requireTentLevel: 3 },
      { hp: 5600, cost: 900, wood: 150, thorn: 0.55, requireTentLevel: 4 },
    ],
  },
  icewall: {
    kind: "icewall",
    label: "冰墙",
    desc: "被巨魔攻击时使其减速",
    size: 1,
    team: "elf",
    category: "wall",
    buildTime: 3.5,
    levels: [
      { hp: 1000, cost: 90, wood: 16, slow: 0.22 },
      { hp: 1600, cost: 150, wood: 0, slow: 0.32, requireTentLevel: 2 },
      { hp: 2400, cost: 270, wood: 48, slow: 0.42, requireTentLevel: 3 },
      { hp: 3400, cost: 460, wood: 96, slow: 0.5, requireTentLevel: 3 },
      { hp: 4600, cost: 800, wood: 200, slow: 0.58, requireTentLevel: 4 },
    ],
  },
  watch: {
    kind: "watch",
    label: "预警哨",
    desc: "放在路口：破隐并预警，巨魔进入范围立刻显形",
    size: 1,
    team: "elf",
    category: "support",
    buildTime: 2,
    levels: [{ hp: 320, cost: 40, wood: 0 }],
  },
  goldtower: {
    kind: "goldtower",
    label: "产金塔",
    desc: "攻击力低于普通塔，但每次攻击命中都会产出金币",
    size: 1,
    team: "elf",
    category: "tower",
    buildTime: 6,
    levels: [
      { hp: 560, cost: 130, wood: 10, income: 1, dmg: 8, range: 200, interval: 1.2 },
      { hp: 760, cost: 240, wood: 0, income: 2, dmg: 12, range: 210, interval: 1.15, requireTentLevel: 2 },
      { hp: 1020, cost: 450, wood: 40, income: 3, dmg: 16, range: 220, interval: 1.1, requireTentLevel: 3 },
      { hp: 1300, cost: 780, wood: 80, income: 4, dmg: 22, range: 230, interval: 1.05, requireTentLevel: 3 },
      { hp: 1650, cost: 1300, wood: 160, income: 6, dmg: 30, range: 240, interval: 1, requireTentLevel: 4 },
    ],
  },
  arrow: {
    kind: "arrow",
    label: "箭塔",
    desc: "单体高射速，性价比最高的前期塔",
    size: 1,
    team: "elf",
    category: "tower",
    buildTime: 5,
    levels: [
      // 原作箭塔基础攻击 16
      { hp: 480, cost: 100, wood: 12, dmg: 16, range: 220, interval: 0.85 },
      { hp: 620, cost: 180, wood: 24, dmg: 30, range: 235, interval: 0.8, requireTentLevel: 2 },
      { hp: 820, cost: 320, wood: 48, dmg: 48, range: 250, interval: 0.75, requireTentLevel: 3 },
      { hp: 1080, cost: 560, wood: 90, dmg: 72, range: 265, interval: 0.7, requireTentLevel: 3 },
      { hp: 1400, cost: 960, wood: 170, dmg: 105, range: 280, interval: 0.65, requireTentLevel: 4 },
    ],
  },
  gun: {
    kind: "gun",
    label: "火枪塔",
    desc: "高单发伤害，射速较慢",
    size: 1,
    team: "elf",
    category: "tower",
    buildTime: 6,
    levels: [
      { hp: 620, cost: 160, wood: 20, dmg: 52, range: 250, interval: 1.8 },
      { hp: 820, cost: 280, wood: 40, dmg: 85, range: 265, interval: 1.7, requireTentLevel: 2 },
      { hp: 1080, cost: 480, wood: 80, dmg: 135, range: 280, interval: 1.6, requireTentLevel: 3 },
      { hp: 1400, cost: 800, wood: 150, dmg: 200, range: 295, interval: 1.5, requireTentLevel: 3 },
      { hp: 1800, cost: 1300, wood: 280, dmg: 290, range: 310, interval: 1.4, requireTentLevel: 4 },
    ],
  },
  poison: {
    kind: "poison",
    label: "毒塔",
    desc: "持续毒伤，克制高生命巨魔",
    size: 1,
    team: "elf",
    category: "tower",
    buildTime: 6,
    levels: [
      { hp: 560, cost: 180, wood: 24, dmg: 10, range: 200, interval: 1.1, poison: 12 },
      { hp: 760, cost: 300, wood: 48, dmg: 16, range: 210, interval: 1.05, poison: 20, requireTentLevel: 2 },
      { hp: 1000, cost: 520, wood: 96, dmg: 24, range: 220, interval: 1, poison: 32, requireTentLevel: 3 },
      { hp: 1300, cost: 820, wood: 160, dmg: 34, range: 235, interval: 0.95, poison: 48, requireTentLevel: 3 },
      { hp: 1650, cost: 1300, wood: 280, dmg: 46, range: 250, interval: 0.9, poison: 68, requireTentLevel: 4 },
    ],
  },
  ice: {
    kind: "ice",
    label: "冰塔",
    desc: "命中后减速巨魔",
    size: 1,
    team: "elf",
    category: "tower",
    buildTime: 6,
    levels: [
      { hp: 600, cost: 170, wood: 24, dmg: 14, range: 210, interval: 1.3, slow: 0.25 },
      { hp: 800, cost: 290, wood: 48, dmg: 22, range: 220, interval: 1.25, slow: 0.35, requireTentLevel: 2 },
      { hp: 1060, cost: 500, wood: 96, dmg: 34, range: 235, interval: 1.2, slow: 0.45, requireTentLevel: 3 },
      { hp: 1360, cost: 800, wood: 160, dmg: 48, range: 250, interval: 1.15, slow: 0.52, requireTentLevel: 3 },
      { hp: 1700, cost: 1260, wood: 280, dmg: 66, range: 265, interval: 1.1, slow: 0.6, requireTentLevel: 4 },
    ],
  },
  moon: {
    kind: "moon",
    label: "银月塔",
    desc: "昂贵但强力的范围魔法塔",
    size: 1,
    team: "elf",
    category: "tower",
    buildTime: 9,
    levels: [
      { hp: 900, cost: 320, wood: 60, dmg: 60, range: 240, interval: 1.5, splash: 80 },
      { hp: 1200, cost: 520, wood: 120, dmg: 95, range: 255, interval: 1.4, splash: 95, requireTentLevel: 2 },
      { hp: 1600, cost: 860, wood: 220, dmg: 150, range: 270, interval: 1.3, splash: 110, requireTentLevel: 3 },
      { hp: 2100, cost: 1300, wood: 380, dmg: 220, range: 285, interval: 1.2, splash: 125, requireTentLevel: 3 },
      { hp: 2700, cost: 2000, wood: 650, dmg: 320, range: 300, interval: 1.1, splash: 140, requireTentLevel: 4 },
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
      // 原作巨魔小屋每秒收入 2 / 5 / 10 / 20
      { hp: 3600, cost: 0, wood: 0, income: 2 },
      { hp: 4200, cost: 400, wood: 0, income: 5 },
      { hp: 4800, cost: 800, wood: 0, income: 10 },
      { hp: 5600, cost: 1400, wood: 0, income: 20 },
    ],
  },
};

// —— 成长曲线：墙体约 12 级、塔约 10 级，选定方向后仍可继续升级 ——
const r5 = (v: number) => Math.max(5, Math.round(v / 5) * 5);

interface LadderConfig {
  hp: number;
  hpG: number;
  cost: number;
  costG: number;
  wood: (i: number) => number;
  extra?: (i: number) => Partial<BuildLevel>;
  /** 自定义帐篷等级门槛，默认 2 级起逐级 +1（上限 4） */
  tent?: (i: number) => number | undefined;
}

function genLevels(count: number, cfg: LadderConfig): BuildLevel[] {
  return Array.from({ length: count }, (_, i) => {
    const tent = cfg.tent ? cfg.tent(i) : i >= 1 ? Math.min(4, i + 1) : undefined;
    return {
      hp: Math.round(cfg.hp * cfg.hpG ** i),
      cost: r5(cfg.cost * cfg.costG ** i),
      wood: cfg.wood(i),
      ...(tent ? { requireTentLevel: tent } : {}),
      ...(cfg.extra ? cfg.extra(i) : {}),
    };
  });
}

const woodFrom = (from: number, base: number, growth = 1.55) => (i: number) =>
  i < from ? 0 : r5(base * growth ** (i - from));

// 基础墙/普通塔止步 4 级，必须选方向才能继续成长
BUILD_SPECS.wall.levels = genLevels(4, {
  hp: 750,
  hpG: 1.35,
  cost: 20,
  costG: 2,
  wood: (i) => (i >= 3 ? 24 : 0),
});
BUILD_SPECS.arrow.levels = genLevels(4, {
  hp: 480,
  hpG: 1.3,
  cost: 100,
  costG: 1.8,
  wood: (i) => (i === 0 ? 12 : 24 * i),
  extra: (i) => ({
    dmg: Math.round(16 * 1.55 ** i),
    range: 220 + i * 15,
    interval: Math.max(0.7, 0.85 - i * 0.05),
  }),
});

BUILD_SPECS.grasswall.levels = genLevels(12, {
  hp: 480,
  hpG: 1.3,
  cost: 15,
  costG: 1.42,
  wood: woodFrom(4, 12),
  extra: (i) => ({ regen: Math.min(0.035, 0.01 + i * 0.002) }),
});
BUILD_SPECS.stone.levels = genLevels(12, {
  hp: 1500,
  hpG: 1.26,
  cost: 55,
  costG: 1.46,
  wood: woodFrom(4, 24),
});
BUILD_SPECS.concrete.levels = genLevels(12, {
  hp: 2400,
  hpG: 1.24,
  cost: 120,
  costG: 1.45,
  wood: (i) => (i === 0 ? 16 : i < 4 ? 0 : r5(40 * 1.55 ** (i - 4))),
});
BUILD_SPECS.thorn.levels = genLevels(12, {
  hp: 1100,
  hpG: 1.26,
  cost: 85,
  costG: 1.46,
  wood: woodFrom(4, 32),
  extra: (i) => ({ thorn: Math.min(0.65, 0.15 + i * 0.042) }),
});
BUILD_SPECS.icewall.levels = genLevels(12, {
  hp: 1000,
  hpG: 1.26,
  cost: 90,
  costG: 1.46,
  wood: woodFrom(4, 40),
  extra: (i) => ({ slow: Math.min(0.65, 0.22 + i * 0.038) }),
});

BUILD_SPECS.goldtower.levels = genLevels(10, {
  hp: 560,
  hpG: 1.22,
  cost: 130,
  costG: 1.5,
  wood: (i) => (i === 0 ? 10 : 0),
  extra: (i) => ({
    dmg: Math.round(8 * 1.3 ** i),
    range: 200 + i * 5,
    interval: Math.max(0.7, 1.2 - i * 0.05),
    income: Math.round(1 + i * 0.65),
  }),
});
BUILD_SPECS.gun.levels = genLevels(10, {
  hp: 620,
  hpG: 1.22,
  cost: 160,
  costG: 1.5,
  wood: (i) => (i === 0 ? 20 : 0),
  extra: (i) => ({
    dmg: Math.round(52 * 1.32 ** i),
    range: 250 + i * 6,
    interval: Math.max(1, 1.8 - i * 0.08),
  }),
});
BUILD_SPECS.poison.levels = genLevels(10, {
  hp: 560,
  hpG: 1.22,
  cost: 180,
  costG: 1.5,
  wood: (i) => (i === 0 ? 24 : 0),
  extra: (i) => ({
    dmg: Math.round(10 * 1.3 ** i),
    poison: Math.round(12 * 1.35 ** i),
    range: 200 + i * 5,
    interval: Math.max(0.8, 1.1 - i * 0.03),
  }),
});
BUILD_SPECS.ice.levels = genLevels(10, {
  hp: 600,
  hpG: 1.22,
  cost: 170,
  costG: 1.5,
  wood: (i) => (i === 0 ? 24 : 0),
  extra: (i) => ({
    dmg: Math.round(14 * 1.3 ** i),
    slow: Math.min(0.65, 0.25 + i * 0.045),
    range: 210 + i * 5,
    interval: Math.max(0.9, 1.3 - i * 0.04),
  }),
});
BUILD_SPECS.moon.levels = genLevels(10, {
  hp: 900,
  hpG: 1.2,
  cost: 320,
  costG: 1.48,
  wood: (i) => (i === 0 ? 60 : 0),
  extra: (i) => ({
    dmg: Math.round(60 * 1.3 ** i),
    splash: 80 + i * 7,
    range: 240 + i * 6,
    interval: Math.max(0.9, 1.5 - i * 0.06),
  }),
});

// 帐篷只能建一座，靠升级提升经济（每级收入翻倍）
BUILD_SPECS.tent.levels = genLevels(10, {
  hp: 420,
  hpG: 1.22,
  cost: 90,
  costG: 1.6,
  wood: (i) => (i < 2 ? 0 : r5(32 * 1.7 ** (i - 2))),
  tent: () => undefined,
  extra: (i) => ({
    income: 2 ** i,
    // 帐篷升级只看金币、木材与墙体等级，与生命之树无关
    ...(i >= 2 ? { requireWallLevel: i } : {}),
  }),
});

export const ELF_BUILDABLE: BuildingKind[] = [
  "tent",
  "goldmine",
  "wall",
  "arrow",
  "watch",
  "workshop",
  "lab",
];

export const BUILD_CATEGORIES: { key: string; label: string; kinds: BuildingKind[] }[] = [
  { key: "econ", label: "经济", kinds: ["tent", "goldmine"] },
  { key: "wall", label: "墙体", kinds: ["wall"] },
  { key: "tower", label: "防御塔", kinds: ["arrow"] },
  { key: "support", label: "辅助", kinds: ["watch", "workshop", "lab"] },
];

export const TOWER_KINDS: BuildingKind[] = ["arrow", "goldtower", "gun", "poison", "ice", "moon"];

export interface BranchOption {
  kind: BuildingKind;
  label: string;
  desc: string;
  gold: number;
  wood: number;
}

/** 普通墙升到该等级后可选择一次强化方向，选定后不可更改 */
export const WALL_BRANCH_LEVEL = 4;
export const WALL_BRANCHES: BranchOption[] = [
  { kind: "grasswall", label: "草墙", desc: "便宜，缓慢自愈", gold: 20, wood: 0 },
  { kind: "stone", label: "岩石墙", desc: "高生命堵口", gold: 60, wood: 0 },
  { kind: "concrete", label: "水泥墙", desc: "生命最高", gold: 120, wood: 16 },
  { kind: "thorn", label: "荆棘墙", desc: "反弹近战伤害", gold: 90, wood: 12 },
  { kind: "icewall", label: "冰墙", desc: "受击减速巨魔", gold: 95, wood: 16 },
];

/** 普通塔升到该等级后可选择一次强化方向，选定后不可更改 */
export const TOWER_BRANCH_LEVEL = 4;
export const TOWER_BRANCHES: BranchOption[] = [
  { kind: "goldtower", label: "产金塔", desc: "攻击较低，每次命中产金", gold: 100, wood: 10 },
  { kind: "gun", label: "火枪塔", desc: "高单发伤害", gold: 120, wood: 16 },
  { kind: "poison", label: "毒塔", desc: "持续毒伤", gold: 140, wood: 20 },
  { kind: "ice", label: "冰塔", desc: "减速巨魔", gold: 140, wood: 20 },
  { kind: "moon", label: "银月塔", desc: "范围魔法伤害", gold: 280, wood: 48 },
];

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
  weapon: { key: "weapon", label: "武器", desc: "攻击力 +14 / 级", costs: [390, 630, 975, 1425, 2100], per: 14 },
  gloves: { key: "gloves", label: "手套", desc: "攻击速度 +15% / 级", costs: [360, 600, 960, 1425], per: 0.15 },
  boots: { key: "boots", label: "鞋子", desc: "移动速度 +8% / 级", costs: [300, 510, 780, 1200], per: 0.08 },
  armor: { key: "armor", label: "护甲", desc: "护甲 +15 / 级；物理减伤 = 护甲 / (护甲 + 100)", costs: [330, 570, 900, 1350], per: 15 },
  vitality: { key: "vitality", label: "生命", desc: "生命上限 +180 / 级", costs: [390, 660, 1050, 1575], per: 180 },
  regen: { key: "regen", label: "回血", desc: "每秒回复 +3 生命 / 级", costs: [330, 570, 930], per: 3 },
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
  double: { label: "双巨魔", desc: "巨魔死亡后化为幽灵狼继续战斗，幽灵狼全部被消灭则巨魔方败" },
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

export const START_GOLD_PLAYER = 260;
export const START_GOLD_AI = 240;
export const START_WOOD = 0;

/** 地图中心 */
export const MAP_CENTER: Point = { x: 36.5 * TILE, y: 36.5 * TILE };

/** 池塘（世界单位椭圆），位于地图中央的空白带 */
export const POND = {
  x: 16 * TILE,
  y: 36.5 * TILE,
  rx: 4.5 * TILE,
  ry: 2.6 * TILE,
};

/** 房间外墙矩形（格，含端点） */
interface RoomRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 20 个大小不一的房间，精灵每局随机出生在其中一个房间。
 * 其余为空房：只提供地形与通道，没有建筑就没有视野。
 * 房间之间至少留 2 格通道，中央带（y 34..39）留空给巨魔小屋与水池。
 */
const ROOM_LAYOUT: RoomRect[] = [
  { x0: 1, y0: 1, x1: 12, y1: 14 }, // 0 西北房（精灵 0）
  { x0: 57, y0: 1, x1: 68, y1: 15 }, // 1 东北房（精灵 1）
  { x0: 29, y0: 57, x1: 40, y1: 70 }, // 2 南方房（精灵 2）
  { x0: 15, y0: 3, x1: 25, y1: 14 },
  { x0: 29, y0: 1, x1: 40, y1: 16 },
  { x0: 43, y0: 2, x1: 53, y1: 13 },
  { x0: 1, y0: 20, x1: 10, y1: 31 },
  { x0: 15, y0: 21, x1: 26, y1: 33 },
  { x0: 29, y0: 20, x1: 38, y1: 30 },
  { x0: 43, y0: 20, x1: 54, y1: 32 },
  { x0: 57, y0: 22, x1: 68, y1: 33 },
  { x0: 1, y0: 40, x1: 11, y1: 52 },
  { x0: 15, y0: 41, x1: 25, y1: 53 },
  { x0: 29, y0: 40, x1: 40, y1: 53 },
  { x0: 43, y0: 41, x1: 53, y1: 52 },
  { x0: 57, y0: 40, x1: 68, y1: 53 },
  { x0: 1, y0: 57, x1: 11, y1: 69 },
  { x0: 15, y0: 58, x1: 26, y1: 70 },
  { x0: 43, y0: 57, x1: 53, y1: 69 },
  { x0: 57, y0: 58, x1: 68, y1: 70 },
];

/** 在房间某一侧开一个 2 格宽的入口 */
function makeGate(rect: RoomRect, side: RoomSide): RoomGate {
  const { x0, y0, x1, y1 } = rect;
  if (side === "east" || side === "west") {
    const gx = side === "east" ? x1 : x0;
    const mid = Math.floor((y0 + y1) / 2);
    return { gx, gy: mid, gx2: gx, gy2: mid + 1, side };
  }
  const gy = side === "south" ? y1 : y0;
  const mid = Math.floor((x0 + x1) / 2);
  return { gx: mid, gy, gx2: mid + 1, gy2: gy, side };
}

/** 房间围墙上开 3 个 2 格宽入口，其余外墙全部堵死 */
function buildRooms(): RoomInfo[] {
  return ROOM_LAYOUT.map((rect, index) => {
    const { x0, y0, x1, y1 } = rect;
    const cx = (x0 + x1 + 1) / 2;
    const cy = (y0 + y1 + 1) / 2;
    const dx = MAP_CENTER.x / TILE - cx;
    const dy = MAP_CENTER.y / TILE - cy;
    // 优先在朝向地图中心的三条边开门，保证每个房间至少有一个出口通向中央
    const facing = [
      { side: "east" as RoomSide, score: dx },
      { side: "west" as RoomSide, score: -dx },
      { side: "south" as RoomSide, score: dy },
      { side: "north" as RoomSide, score: -dy },
    ].sort((a, b) => b.score - a.score);
    const gates: RoomGate[] = facing.slice(0, 3).map((item) => makeGate(rect, item.side));
    const gateTiles = new Set<string>();
    for (const g of gates) {
      gateTiles.add(`${g.gx},${g.gy}`);
      gateTiles.add(`${g.gx2},${g.gy2}`);
    }
    const walls: RoomTile[] = [];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const border = x === x0 || x === x1 || y === y0 || y === y1;
        if (!border) continue;
        if (gateTiles.has(`${x},${y}`)) continue;
        walls.push({ gx: x, gy: y });
      }
    }
    return { siteId: index, gx0: x0, gy0: y0, gx1: x1, gy1: y1, gates, side: gates[0].side, walls };
  });
}

export const BASE_ROOMS: RoomInfo[] = buildRooms();

/** 房间主入口正中（两格之间）的世界坐标，用作道路终点 */
export function roomGateWorld(room: RoomInfo): Point {
  const g = room.gates[0];
  return {
    x: ((g.gx + g.gx2 + 1) / 2) * TILE,
    y: ((g.gy + g.gy2 + 1) / 2) * TILE,
  };
}

export function isGateTile(room: RoomInfo, gx: number, gy: number): boolean {
  return room.gates.some((g) => (gx === g.gx && gy === g.gy) || (gx === g.gx2 && gy === g.gy2));
}

export function isRoomWallTile(gx: number, gy: number): boolean {
  for (const room of BASE_ROOMS) {
    if (gx < room.gx0 || gx > room.gx1 || gy < room.gy0 || gy > room.gy1) continue;
    const border = gx === room.gx0 || gx === room.gx1 || gy === room.gy0 || gy === room.gy1;
    if (!border) return false;
    return !isGateTile(room, gx, gy);
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
  const roomCenters = BASE_ROOMS.map((r) => ({
    x: ((r.gx0 + r.gx1 + 1) / 2) * TILE,
    y: ((r.gy0 + r.gy1 + 1) / 2) * TILE,
  }));

  const blockedByTree = (x: number, y: number, r: number) =>
    trees.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r + 10);
  // 房间外墙外 1 格内不生成树木/岩石，避免堵死门口与窄通道
  const blockedByBase = (x: number, y: number) =>
    BASE_ROOMS.some(
      (r) =>
        x > (r.gx0 - 1) * TILE &&
        x < (r.gx1 + 2) * TILE &&
        y > (r.gy0 - 1) * TILE &&
        y < (r.gy1 + 2) * TILE,
    );
  const blockedByRoad = (x: number, y: number) =>
    roomCenters.some((p) => distToSegment(x, y, MAP_CENTER.x, MAP_CENTER.y, p.x, p.y) < 1.7 * TILE);
  const blockedByCenter = (x: number, y: number) =>
    Math.hypot(x - MAP_CENTER.x, y - MAP_CENTER.y) < 4.5 * TILE;

  let guard = 0;
  while (trees.length < 70 && guard < 12000) {
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
  while (rocks.length < 12 && guard < 3000) {
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
  // 树木只做装饰与伐木点：不参与碰撞，避免 20 个房间之间的大量窄通道被随机树木堵死
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
