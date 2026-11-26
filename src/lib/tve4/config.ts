// tve4 配置：地图常量 + 从规则文件派生的数值。
// 规则文件已从原版解包文件核对（见 data/game/game-rules.json）。

import { BUILDING_RULES } from "./rules";
import type { Mode, Rule } from "./types";

export const GRID_W = 168;
export const GRID_H = 96;
export const TILE = 16;
export const WORLD_W = GRID_W * TILE;
export const WORLD_H = GRID_H * TILE;

export const GAME_LIMIT = 300;        // 仅用于 300 秒精灵共享视野事件
export const START_GOLD = { elf: 30, troll: 70 };
export const START_WOOD = 0;
export const LIVES = 1;               // 网页模拟用；原版按 force 判定，无生命数
export const RESPAWN = 6;             // PROPOSED 网页模拟复活时间
export const BOUNTY_MAX = 1_000_000;  // VERIFIED 赏金上限

export const ELF_START = { gx: 54, gy: 59 };
export const TROLL_START = { gx: 64, gy: 42 };

// VERIFIED：5 秒精灵生成 + 30 秒等待 = 35 秒；FIX/SURVIVE 45 秒
export const RULE_PREP: Record<Rule, number> = {
  SINGLE: 35, DOUBLE: 35, FIX: 45, RACE: 35, DEFEND: 35,
  SOLO: 35, DUET: 35, SURVIVE: 45, REVIVE: 35,
};

export const RULE_LABEL: Record<Rule, string> = {
  SINGLE: "单魔群战", DOUBLE: "双魔群战", FIX: "定点群战", RACE: "竞赛规则",
  DEFEND: "防守规则", SOLO: "单挑规则", DUET: "2v2规则", SURVIVE: "人机规则", REVIVE: "复活群战",
};

export const MODE_LABEL: Record<Mode, string> = {
  OLD: "普速", BALANCE: "平衡", FAST: "快速", MIDDLE: "中速",
};

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

function arr(value: number | number[] | undefined): number[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function levels(key: string, ranges?: number[]): BuildingLevel[] {
  const gold = arr(BUILDING_RULES[key].gold);
  const wood = arr(BUILDING_RULES[key].wood);
  const hp = arr(BUILDING_RULES[key].hp);
  const income = arr(BUILDING_RULES[key].income);
  const damage = arr(BUILDING_RULES[key].damage);
  return gold.map((cost, i) => ({
    cost,
    hp: hp[i] ?? 10,
    woodCost: wood[i] || undefined,
    income: income[i],
    damage: damage[i],
    range: ranges?.[i],
    interval: key === "tower" ? 1.5 : undefined,
  }));
}

export const BUILDINGS: Record<string, BuildingDef> = {
  wall: {
    label: "石墙", desc: "u01F 石墙链，可升级 10 级", size: 1, texture: "b_wall", buildTime: 0.5,
    levels: levels("wall"),
  },
  tower: {
    label: "基础箭塔", desc: "h000 箭塔链，可升级 7 级", size: 2, texture: "b_tower", buildTime: 1.5,
    levels: levels("tower", [96, 112, 128, 144, 160, 176, 192]),
  },
  mine: {
    label: "闹鬼金矿", desc: "e00H 金矿链，每秒金币", size: 2, texture: "b_mine", buildTime: 2,
    levels: levels("mine"),
  },
  tent: {
    label: "作坊", desc: "u00Y 帐篷起，10 级链，死亡返还全部升级花费", size: 2, texture: "b_tent", buildTime: 1.2,
    levels: levels("tent"),
  },
  market: {
    label: "市场", desc: "u018 城镇，金币与木材交易", size: 2, texture: "b_tent", buildTime: 2,
    levels: [{ cost: 64, hp: 50 }],
  },
  reveal: {
    label: "真视之塔", desc: "u01E 反隐塔", size: 2, texture: "b_tower", buildTime: 2,
    levels: [{
      cost: arr(BUILDING_RULES.reveal.gold)[0] ?? 0,
      hp: arr(BUILDING_RULES.reveal.hp)[0] ?? 10,
      woodCost: arr(BUILDING_RULES.reveal.wood)[0] || undefined,
      range: (BUILDING_RULES.reveal.revealRange ?? 900) * 0.125,
    }],
  },
  trollHouse: {
    label: "巨魔房屋", desc: "u03D 系统建筑，玩家只能升级", size: 3, texture: "b_tent", buildTime: 2,
    levels: levels("trollHouse"),
  },
};

export const ELF_BUILD_KINDS = ["wall", "tower", "mine", "tent", "reveal"] as const;
export const BUILD_KINDS = ELF_BUILD_KINDS;

import type { SkillKey } from "./types";

export const HERO_STATS = {
  elf: { hp: 10, damage: 7, interval: 2.2, range: 112, speed: 125, radius: 14 },
  troll: { hp: 750, damage: 7, interval: 1.5, range: 90, speed: 175, radius: 22 },
} as const;

export interface SkillKeyInfo {
  key: SkillKey;
  label: string;
  cd: number;
  desc: string;
}

export const SKILLS: Record<"elf" | "troll", SkillKeyInfo[]> = {
  elf: [
    { key: "blink", label: "闪烁", cd: 25, desc: "向指针方向瞬移 12 格" },
    { key: "haste", label: "魔法提速", cd: 30, desc: "15 秒移速 +110%" },
    { key: "entangle", label: "纠缠根须", cd: 3, desc: "定身巨魔 3 秒" },
    { key: "silence", label: "沉默", cd: 60, desc: "封锁巨魔技能 5 秒" },
  ],
  troll: [
    { key: "windwalk", label: "疾风步", cd: 30, desc: "隐身 20 秒，移速 +50%" },
    { key: "berserk", label: "狂战士", cd: 120, desc: "10 秒 +100% 攻速、+50% 移速，受伤 +50%" },
    { key: "teleport", label: "传送", cd: 45, desc: "2 秒读条，返回巨魔小屋或商店" },
  ],
};

export const ALL_SKILL_KEYS: SkillKey[] = [
  "blink", "haste", "entangle", "silence", "windwalk", "berserk", "teleport",
];
