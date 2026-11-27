// tve4 配置：地图常量 + 从规则文件派生的数值。
// 规则文件已从原版解包文件核对（见 data/game/game-rules.json）。

import { MAP_DEFINITIONS } from "./maps.generated";
import { ruleNumber, ruleNumbers, ruleRecord } from "./data/mvp-rules";
import { BUILDING_RULES, RULES } from "./rules";
import type { BuildKind, Mode, Rule } from "./types";

export const TILE = 16;

/**
 * UI migration adapter only. Simulation state is created by createSession and
 * must never depend on a process-wide active map.
 */
export function setActiveMap(id: number): void {
  if (!MAP_DEFINITIONS[id]) throw new Error(`未知地图: ${id}`);
}

export const START_GOLD = RULES.startGold;
// VERIFIED：OLD 30/70，MIDDLE 10/50；BALANCE/FAST 沿用 OLD（PROPOSED 回退）。
export const MODE_START_GOLD = RULES.modeStartGold;
export const START_WOOD = RULES.startWood;
export const LIVES = 1;               // 网页模拟用；原版按 force 判定，无生命数
export const RESPAWN = 6;             // PROPOSED 网页模拟复活时间
export const BOUNTY_MAX = 1_000_000;  // VERIFIED 赏金上限

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
  woodIncome?: number;
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
  const woodIncome = arr(BUILDING_RULES[key].woodIncome);
  const damage = arr(BUILDING_RULES[key].damage);
  return gold.map((cost, i) => ({
    cost,
    hp: hp[i] ?? 10,
    woodCost: wood[i] || undefined,
    income: income[i],
    woodIncome: woodIncome[i],
    damage: damage[i],
    range: ranges?.[i],
    interval: key === "tower" ? ruleNumber("tower", "interval") : undefined,
  }));
}

export const BUILDINGS: Record<string, BuildingDef> = {
  wall: {
    label: "石墙", desc: "u01F 石墙链，可升级 10 级", texture: "b_wall",
    size: ruleNumber("wall", "size"), buildTime: ruleNumber("wall", "buildTime"),
    levels: levels("wall"),
  },
  tower: {
    label: "基础箭塔", desc: "h000 箭塔链 7 级 + h096 终极塔", texture: "b_tower",
    size: ruleNumber("tower", "size"), buildTime: ruleNumber("tower", "buildTime"),
    levels: levels("tower", ruleNumbers("tower", "range")),
  },
  mine: {
    label: "闹鬼金矿", desc: "e00H 金矿链，每秒金币", texture: "b_mine",
    size: ruleNumber("mine", "size"), buildTime: ruleNumber("mine", "buildTime"),
    levels: levels("mine"),
  },
  tent: {
    label: "作坊", desc: "u00Y 帐篷起，10 级链，死亡返还全部升级花费", texture: "b_tent",
    size: ruleNumber("tent", "size"), buildTime: ruleNumber("tent", "buildTime"),
    levels: levels("tent"),
  },
  market: {
    label: "城镇/市场", desc: "u018 城镇，交易并解锁高级建筑", texture: "b_tent",
    size: ruleNumber("market", "size"), buildTime: ruleNumber("market", "buildTime"),
    levels: levels("market").map(({ cost, hp }) => ({ cost, hp })),
  },
  reveal: {
    label: "真视之塔", desc: "u01E 反隐塔", texture: "b_tower",
    size: ruleNumber("reveal", "size"), buildTime: ruleNumber("reveal", "buildTime"),
    levels: [{
      cost: arr(BUILDING_RULES.reveal.gold)[0] ?? 0,
      hp: arr(BUILDING_RULES.reveal.hp)[0] ?? 10,
      woodCost: arr(BUILDING_RULES.reveal.wood)[0] || undefined,
      range: (BUILDING_RULES.reveal.revealRange ?? 900) * RULES.scale,
    }],
  },
  lumberCamp: {
    label: "精灵采木场", desc: "2000 金起，每级累计 2000/3600/18000 金，产量 1/2/10 木每秒", texture: "b_tent",
    size: ruleNumber("lumberCamp", "size"), buildTime: ruleNumber("lumberCamp", "buildTime"),
    levels: levels("lumberCamp").map(({ cost, hp, woodIncome }) => ({ cost, hp, woodIncome })),
  },
  trollHouse: {
    label: "巨魔房屋", desc: "u03D 系统建筑，玩家只能升级", texture: "b_tent",
    size: ruleNumber("trollHouse", "size"), buildTime: ruleNumber("trollHouse", "buildTime"),
    levels: levels("trollHouse"),
  },
};

// 原版 Requires/DependencyOr 前置链：用墙等级代表低级/中级墙科技，用市场等级代表城镇 1/2/3。
export interface Requirement {
  kind: BuildKind;
  level: number;
}
function requirements(key: string): Array<{ level: number; need: Requirement }> {
  const values = ruleRecord(key).values;
  return Object.keys(values)
    .map((field) => /^requirement\.(\d+)\.needKind$/.exec(field))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => {
      const level = Number(match[1]);
      return {
        level,
        need: { kind: String(values[`requirement.${level}.needKind`]) as BuildKind, level: ruleNumber(key, `requirement.${level}.needLevel`) },
      };
    })
    .sort((a, b) => a.level - b.level);
}

export const REQUIREMENTS: Partial<Record<BuildKind, Array<{ level: number; need: Requirement }>>> = {
  tent: requirements("tent"),
  tower: requirements("tower"),
  reveal: requirements("reveal"),
};

export const ELF_BUILD_KINDS = ["wall", "tower", "mine", "tent", "market", "reveal", "lumberCamp"] as const;
export const BUILD_KINDS = ELF_BUILD_KINDS;

import type { SkillKey } from "./types";

export const HERO_STATS = {
  elf: {
    hp: ruleNumber("elf", "hp"), damage: ruleNumber("elf", "damage"),
    interval: ruleNumber("elf", "interval"), range: ruleNumber("elf", "range"),
    speed: ruleNumber("elf", "speed"), radius: ruleNumber("elf", "radius"),
    mana: ruleNumber("elf", "mana"), manaRegen: ruleNumber("elf", "manaRegen"),
  },
  troll: {
    hp: ruleNumber("troll", "hp"), damage: ruleNumber("troll", "damage"),
    interval: ruleNumber("troll", "interval"), range: ruleNumber("troll", "range"),
    speed: ruleNumber("troll", "speed"), radius: ruleNumber("troll", "radius"),
    mana: ruleNumber("troll", "mana"), manaRegen: ruleNumber("troll", "manaRegen"),
  },
} as const;

export interface SkillKeyInfo {
  key: SkillKey;
  label: string;
  cd: number;
  manaCost: number;
  duration: number;
  desc: string;
}

export const SKILLS: Record<"elf" | "troll", SkillKeyInfo[]> = {
  elf: [
    { key: "blink", label: "闪烁", cd: ruleNumber("blink", "cooldown"), manaCost: ruleNumber("blink", "manaCost"), duration: ruleNumber("blink", "duration"), desc: "向指针方向瞬移，最多 1500 源单位" },
    { key: "haste", label: "魔法提速", cd: ruleNumber("haste", "cooldown"), manaCost: ruleNumber("haste", "manaCost"), duration: ruleNumber("haste", "duration"), desc: "移速 +110%，持续 15 秒" },
    { key: "entangle", label: "纠缠根须", cd: ruleNumber("entangle", "cooldown"), manaCost: ruleNumber("entangle", "manaCost"), duration: ruleNumber("entangle", "duration"), desc: "定身 400 源单位内的巨魔 3 秒" },
    { key: "silence", label: "沉默", cd: ruleNumber("silence", "cooldown"), manaCost: ruleNumber("silence", "manaCost"), duration: ruleNumber("silence", "duration"), desc: "封锁 600 源单位内巨魔技能 5 秒" },
  ],
  troll: [
    { key: "windwalk", label: "疾风步", cd: ruleNumber("windwalk", "cooldown"), manaCost: ruleNumber("windwalk", "manaCost"), duration: ruleNumber("windwalk", "duration"), desc: "隐身 20 秒，移速 +50%" },
    { key: "berserk", label: "狂战士", cd: ruleNumber("berserk", "cooldown"), manaCost: ruleNumber("berserk", "manaCost"), duration: ruleNumber("berserk", "duration"), desc: "10 秒 +100% 攻速、+50% 移速" },
    { key: "teleport", label: "传送", cd: ruleNumber("teleport", "cooldown"), manaCost: ruleNumber("teleport", "manaCost"), duration: ruleNumber("teleport", "duration"), desc: "2 秒读条，返回巨魔小屋或商店" },
    { key: "farSight", label: "巨魔之眼", cd: ruleNumber("farSight", "cooldown"), manaCost: ruleNumber("farSight", "manaCost"), duration: ruleNumber("farSight", "duration"), desc: "标记一处精灵建筑，期间无法拆除" },
  ],
};

export const ALL_SKILL_KEYS: SkillKey[] = [
  "blink", "haste", "entangle", "silence", "windwalk", "berserk", "teleport", "farSight",
];
