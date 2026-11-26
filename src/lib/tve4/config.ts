// tve4 全新数值配置。全部为本版本原创设计，不继承旧版数据。

export const GRID_W = 128;
export const GRID_H = 96;
export const TILE = 16;
export const WORLD_W = GRID_W * TILE;
export const WORLD_H = GRID_H * TILE;

export const PREP_SECONDS = 30;
export const GAME_LIMIT = 300;
export const START_GOLD = 600;
export const START_WOOD = 200;
export const LIVES = 3;
export const RESPAWN = 6;

export const ELF_START = { gx: 55, gy: 55 };
export const TROLL_START = { gx: 73, gy: 73 };

export interface BuildingLevel {
  cost: number;
  hp: number;
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

export const BUILDINGS: Record<string, BuildingDef> = {
  wall: {
    label: "石墙",
    desc: "阻挡巨魔，保护你的阵地",
    size: 1,
    texture: "b_wall",
    buildTime: 0.6,
    levels: [
      { cost: 20, hp: 240 },
      { cost: 35, hp: 420 },
      { cost: 55, hp: 700 },
    ],
  },
  tower: {
    label: "箭塔",
    desc: "自动攻击靠近的巨魔",
    size: 2,
    texture: "b_tower",
    buildTime: 2.5,
    levels: [
      { cost: 140, hp: 280, damage: 14, range: 112, interval: 1 },
      { cost: 200, hp: 400, damage: 23, range: 144, interval: 0.85 },
      { cost: 280, hp: 560, damage: 36, range: 176, interval: 0.7 },
    ],
  },
  mine: {
    label: "金矿",
    desc: "每秒产出金币",
    size: 2,
    texture: "b_mine",
    buildTime: 2,
    levels: [
      { cost: 120, hp: 260, income: 6 },
      { cost: 180, hp: 360, income: 11 },
      { cost: 260, hp: 480, income: 18 },
    ],
  },
  tent: {
    label: "营地",
    desc: "复活点，并提供少量收入",
    size: 2,
    texture: "b_tent",
    buildTime: 1.5,
    levels: [
      { cost: 100, hp: 300, income: 2 },
      { cost: 150, hp: 430, income: 4 },
      { cost: 220, hp: 600, income: 7 },
    ],
  },
};

export const BUILD_KINDS = ["wall", "tower", "mine", "tent"] as const;

export const HERO_STATS = {
  elf: { hp: 320, damage: 20, interval: 0.7, range: 28, speed: 150, radius: 11 },
  troll: { hp: 900, damage: 55, interval: 1, range: 34, speed: 132, radius: 19 },
} as const;

export const SKILLS: Record<"elf" | "troll", SkillKeyInfo[]> = {
  elf: [
    { key: "blink", label: "闪烁", cd: 8, desc: "向指针方向瞬移" },
    { key: "haste", label: "疾行", cd: 18, desc: "6 秒移速提升" },
    { key: "entangle", label: "缠绕", cd: 16, desc: "定身巨魔 3 秒" },
    { key: "silence", label: "沉默", cd: 22, desc: "封锁巨魔技能 4 秒" },
  ],
  troll: [
    { key: "windwalk", label: "疾风步", cd: 12, desc: "隐身并加速 5 秒" },
    { key: "berserk", label: "狂暴", cd: 20, desc: "6 秒伤害提升" },
    { key: "teleport", label: "传送", cd: 10, desc: "向目标瞬移" },
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
