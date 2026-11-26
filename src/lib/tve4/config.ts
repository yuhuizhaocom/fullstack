// tve4 数值配置。
// 数值来源：docs/research/**（VERIFIED / INFERRED）与 data/game/game-rules.json（PROPOSED 网页镜像）。
// 每条关键数值在注释中标注来源，UNKNOWN 不写入实现。

export const GRID_W = 168;
export const GRID_H = 96;
export const TILE = 16;
export const WORLD_W = GRID_W * TILE;
export const WORLD_H = GRID_H * TILE;

export const PREP_SECONDS = 30;       // VERIFIED：SINGLE/DOUBLE/RACE/SOLO/DUET/DEFEND/REVIVE
export const GAME_LIMIT = 300;        // VERIFIED：共享/暴露视野开启时间，不是胜利条件
export const START_GOLD = { elf: 30, troll: 70 };  // VERIFIED：OLD/SINGLE 初始资源
export const START_WOOD = 0;          // VERIFIED
export const LIVES = 1;               // VERIFIED：force 清空即判负（原版无 3 条命）
export const RESPAWN = 6;             // PROPOSED：仅预留给 REVIVE 规则
export const BOUNTY_MAX = 1_000_000;  // VERIFIED：赏金上限
export const LIFESTEAL = 0.22;        // VERIFIED：OLD 巨魔偷血技能 0.22 * damage

export const ELF_START = { gx: 54, gy: 59 };
export const TROLL_START = { gx: 64, gy: 42 };

// VERIFIED：FIX/SURVIVE 为 45 秒，其余规则 30 秒
export const RULE_PREP: Record<import("./types").Rule, number> = {
  SINGLE: 30, DOUBLE: 30, FIX: 45, RACE: 30, DEFEND: 30,
  SOLO: 30, DUET: 30, SURVIVE: 45, REVIVE: 30,
};

export const RULE_LABEL: Record<import("./types").Rule, string> = {
  SINGLE: "单挑", DOUBLE: "双巨魔", FIX: "固定", RACE: "竞速",
  DEFEND: "守护", SOLO: "单人", DUET: "双人", SURVIVE: "生存", REVIVE: "复活",
};

export const MODE_LABEL: Record<import("./types").Mode, string> = {
  OLD: "经典", BALANCE: "平衡", FAST: "快速", MIDDLE: "中级",
};

// 木材市场（PROPOSED 固定步长，文档记录 5/155/150/495）
export const WOOD_STEP = 5;
export const WOOD_BUY = 155;
export const WOOD_SELL = 150;
export const WOOD_MAX = 495;

export const HOUSE_HEAL = 0.12;       // PROPOSED：巨魔小屋 12%/秒回血
export const HOUSE_RANGE = 40;        // 2.5 格
export const REVEAL_RANGE = 192;      // 显影塔反隐范围（PROPOSED）

export interface BuildingLevel {
  cost: number;
  hp: number;
  woodCost?: number;
  income?: number;
  damage?: number;
  range?: number;
  interval?: number;
}

export interface BuildingDef {
  label: string;
  desc: string;
  size: number;
  texture: string;
  buildTime: number;
  levels: BuildingLevel[];
}

// 建筑 L1 数值 VERIFIED（buildings.md / units.md）；后续等级为 INFERRED/PROPOSED。
export const BUILDINGS: Record<string, BuildingDef> = {
  wall: {
    label: "基础墙",
    desc: "u01F 石墙起，升级为岩石墙/精灵墙/水泥墙",
    size: 1,
    texture: "b_wall",
    buildTime: 0.5,
    levels: [
      { cost: 4, hp: 50 },    // u01F VERIFIED
      { cost: 120, hp: 300 }, // u01X 岩石墙 VERIFIED
      { cost: 128, hp: 320 }, // u04B 精灵墙 VERIFIED
      { cost: 144, hp: 360 }, // u030 水泥墙 VERIFIED
    ],
  },
  tower: {
    label: "基础箭塔",
    desc: "h000 箭塔，自动攻击靠近的巨魔",
    size: 2,
    texture: "b_tower",
    buildTime: 1.5,
    levels: [
      { cost: 4, hp: 10, damage: 7, range: 112, interval: 1.5 },   // h000 VERIFIED 费用/HP
      { cost: 16, hp: 30, damage: 12, range: 144, interval: 1.2 },  // INFERRED
      { cost: 64, hp: 80, damage: 20, range: 176, interval: 0.9 },  // INFERRED
    ],
  },
  mine: {
    label: "金矿",
    desc: "e00H 闹鬼金矿起，升级为精灵农场/高等农场/蓝宝石矿脉",
    size: 2,
    texture: "b_mine",
    buildTime: 1.5,
    levels: [
      { cost: 90, hp: 50, income: 1 },   // e00H VERIFIED
      { cost: 100, hp: 40, income: 4 },  // u010 精灵农场 VERIFIED
      { cost: 200, hp: 80, income: 8 },  // u011 高等精灵农场 VERIFIED
      { cost: 800, hp: 50, income: 32 }, // e020 蓝宝石矿脉 VERIFIED（原版 800 木，网页以金代替 PROPOSED）
    ],
  },
  tent: {
    label: "帐篷",
    desc: "u00Y 帐篷，每个精灵限一座，每秒 1 金",
    size: 2,
    texture: "b_tent",
    buildTime: 1.2,
    levels: [
      { cost: 0, hp: 10, income: 1 },    // u00Y VERIFIED（免费自带）
      { cost: 50, hp: 30, income: 2 },   // INFERRED
      { cost: 150, hp: 80, income: 4 },  // INFERRED
    ],
  },
  farm: {
    label: "精灵农场",
    desc: "u010 农场，每秒 4 金；可升级为高等农场",
    size: 2,
    texture: "b_mine",
    buildTime: 2,
    levels: [
      { cost: 100, hp: 40, income: 4 },  // u010 VERIFIED
      { cost: 200, hp: 80, income: 8 },  // u011 VERIFIED
    ],
  },
  market: {
    label: "市场",
    desc: "u018 市场，金币与木材交易",
    size: 2,
    texture: "b_tent",
    buildTime: 2,
    levels: [
      { cost: 64, hp: 50 },  // u018 VERIFIED
    ],
  },
  reveal: {
    label: "显影之塔",
    desc: "u01E 反隐塔，让疾风步巨魔现形",
    size: 2,
    texture: "b_tower",
    buildTime: 2,
    levels: [
      { cost: 0, hp: 10, woodCost: 256 },  // u01E VERIFIED（256 木）
    ],
  },
  trollHouse: {
    label: "巨魔小屋",
    desc: "u03D 巨魔房屋，每秒 3 金并回血回蓝",
    size: 3,
    texture: "b_tent",
    buildTime: 2,
    levels: [
      { cost: 200, hp: 550, income: 3 },  // u03D VERIFIED
      { cost: 300, hp: 700, income: 5 },  // INFERRED
      { cost: 450, hp: 900, income: 9 },  // INFERRED
    ],
  },
};

export const ELF_BUILD_KINDS = ["wall", "tower", "mine", "tent", "farm", "market", "reveal"] as const;

export const BUILD_KINDS = ELF_BUILD_KINDS;

// H010/H020 VERIFIED（units.md / UnitWeapons.slk / data/game/game-rules.json）。
// 半径按当前 TILE=16 调整，使 3 格入口可通行、1 格墙可封堵（PROPOSED 碰撞调校）。
export const HERO_STATS = {
  elf: { hp: 10, damage: 7, interval: 2.2, range: 112, speed: 125, radius: 14 },
  troll: { hp: 750, damage: 7, interval: 1.5, range: 90, speed: 175, radius: 22 },
} as const;

// 技能冷却/持续按 w3a VERIFIED 与 data/game/game-rules.json PROPOSED 对齐。
export const SKILLS: Record<"elf" | "troll", SkillKeyInfo[]> = {
  elf: [
    { key: "blink", label: "闪烁", cd: 25, desc: "向指针方向瞬移 12 格" },
    { key: "haste", label: "魔法提速", cd: 30, desc: "15 秒移速 +110%" },
    { key: "entangle", label: "纠缠根须", cd: 3, desc: "定身巨魔 3 秒" },
    { key: "silence", label: "沉默", cd: 60, desc: "封锁巨魔技能 5 秒" },
  ],
  troll: [
    { key: "windwalk", label: "疾风步", cd: 30, desc: "隐身并加速 20 秒" },
    { key: "berserk", label: "狂战士", cd: 120, desc: "10 秒 +50% 攻速，受伤 +50%" },
    { key: "teleport", label: "传送", cd: 45, desc: "2 秒读条后返回出生点" },
  ],
};

export interface SkillKeyInfo {
  key: import("./types").SkillKey;
  label: string;
  cd: number;
  desc: string;
}

export const ALL_SKILL_KEYS: import("./types").SkillKey[] = [
  "blink", "haste", "entangle", "silence", "windwalk", "berserk", "teleport",
];
