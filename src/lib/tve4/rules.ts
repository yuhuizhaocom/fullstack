// tve4 运行期规则：直接读取原版解包核对后的规则文件，不在引擎里硬编码。

import raw from "../../../data/game/game-rules.json";
import { MVP_RULES, ruleNumber, ruleNumbers, ruleRecord, ruleValue } from "./data/mvp-rules";
import type { CoreRuleRecord, MvpRules } from "./data/mvp-rules";

export type { CoreRuleRecord, MvpRules } from "./data/mvp-rules";
export { MVP_RULES, MVP_UNKNOWNS } from "./data/mvp-rules";

export interface EquipmentItem {
  key: string;
  label: string;
  gold: number;
  wood?: number;
  shop?: string;
  note?: string;
  allStats?: number;
  strength?: number;
  agility?: number;
  damage?: number;
  heroDamage?: number;
  armor?: number;
  speed?: number;
  magicImmune?: boolean;
}

export interface RuleFile {
  version: number;
  confidence?: string;
  basedOn?: string;
  scale: number;
  modes: Record<string, string>;
  rules: Record<string, string>;
  startGold: { elf: number; troll: number };
  modeStartGold: Record<string, { elf: number; troll: number }>;
  startWood: number;
  trollAppear: { withPrepare: number; fixSurvive: number };
  trollInvulnerableSeconds: number;
  heroes: Record<string, { hp: number; speed: number; attack: number; range: number; interval: number; radius: number }>;
  buildings: Record<string, {
    gold: number | number[];
    wood: number | number[];
    hp: number | number[];
    income?: number | number[];
    woodIncome?: number | number[];
    repairTime?: number;
    sight?: number | number[];
    damage?: number | number[];
    revealRange?: number;
    heal?: number;
    auraRange?: number;
  }>;
  elfDemolish: {
    minHpRatio: number;
    enemyHeroRadius: number;
    trollEyeRadius: number;
    delayedDeath: number;
    refundOnAnyDeath: boolean;
  };
  market: {
    buyPrice: number;
    sellPrice: number;
    priceStep: number;
    minPrice: number;
    maxPrice: number;
    tradeAmount: number;
  };
  equipmentShop: {
    purchaseRadius: number;
    shopOffsets: Array<[number, number]>;
    items: EquipmentItem[];
  };
  skills: Record<string, Record<string, number | boolean | string>>;
  combat: {
    lifesteal: number;
    lifestealSkill: string;
    lifestealModes: string[];
    noNegativeDamageFloat: boolean;
  };
  bounty: {
    goldRatio: number;
    woodMultiplier: number;
    middleRatio: number;
    angelStoleGoldPerMinute: number[];
    angelStoleCapIndex: number;
    minMultiplier: number;
    max: number;
  };
  vision: {
    elfShareAtSeconds: number;
    exposeAtSeconds: number;
  };
  repair: {
    timeRatios: number[];
    castRange: number;
  };
  scenarios: {
    elf: {
      ultimateTowerCount: number;
      archmage: { hp: number; damage: number; range: number; interval: number };
      relocateCooldown: number;
      mobileDevGoldPenalty: number;
    };
    troll: {
      strengthWin: number;
      strengthBooks: Array<{ key: string; label: string; gold: number; strength: number }>;
    };
  };
  respawn: {
    elfCleanup: number;
    wolf: number;
    angel: number;
    duetElf: number;
    reviveTrollVote: number[];
  };
}

const legacy = raw as unknown as RuleFile;

function indexedValues(id: string, field: string, fallback: number | number[]): number[] {
  const record = ruleRecord(id);
  const hasField = Object.keys(record.values).some((key) => key === field || key.startsWith(`${field}.`));
  if (!hasField) return Array.isArray(fallback) ? fallback : [fallback];
  return ruleNumbers(id, field);
}

function mvpBuildings(): RuleFile["buildings"] {
  return Object.fromEntries(MVP_RULES.buildings.map((record) => {
    const old = legacy.buildings[record.id]
      ?? (record.id === "lumberCamp" ? { gold: [2000, 3600, 18000], wood: [0, 0, 0], hp: [120, 240, 480], woodIncome: [1, 2, 10] } : undefined);
    if (!old && record.id !== "market") throw new Error(`Missing legacy building metadata: ${record.id}`);
    const gold = indexedValues(record.id, "gold", old?.gold ?? []);
    const wood = indexedValues(record.id, "wood", old?.wood ?? []);
    const hp = indexedValues(record.id, "hp", old?.hp ?? []);
    const income = indexedValues(record.id, "income", old?.income ?? 0);
    const woodIncome = indexedValues(record.id, "woodIncome", old?.woodIncome ?? 0);
    const repairTime = indexedValues(record.id, "repairTime", []);
    const sight = indexedValues(record.id, "sight", []);
    const damage = indexedValues(record.id, "damage", old?.damage ?? 0);
    const value = (field: string) => record.values[field];
    return [record.id, {
      ...old,
      gold: gold.length === 1 ? gold[0] : gold,
      wood: wood.length === 1 ? wood[0] : wood,
      hp: hp.length === 1 ? hp[0] : hp,
      ...(Object.keys(record.values).some((key) => key.startsWith("income")) ? { income: income.length === 1 ? income[0] : income } : {}),
      ...(Object.keys(record.values).some((key) => key.startsWith("woodIncome")) ? { woodIncome: woodIncome.length === 1 ? woodIncome[0] : woodIncome } : {}),
      ...(repairTime.length ? { repairTime: repairTime[0] } : {}),
      ...(sight.length ? { sight: sight.length === 1 ? sight[0] : sight } : {}),
      ...(Object.keys(record.values).some((key) => key.startsWith("damage")) ? { damage: damage.length === 1 ? damage[0] : damage } : {}),
      ...(typeof value("revealRange") === "number" ? { revealRange: Number(value("revealRange")) } : {}),
      ...(typeof value("heal") === "number" ? { heal: Number(value("heal")) } : {}),
      ...(typeof value("auraRange") === "number" ? { auraRange: Number(value("auraRange")) } : {}),
    }];
  }));
}

function mvpHeroes(): RuleFile["heroes"] {
  return Object.fromEntries(MVP_RULES.heroes.map((record) => {
    const old = legacy.heroes[record.id];
    if (!old) throw new Error(`Missing legacy hero metadata: ${record.id}`);
    return [record.id, {
      hp: ruleNumber(record.id, "hp"),
      speed: ruleNumber(record.id, "speed"),
      attack: ruleNumber(record.id, "damage"),
      range: ruleNumber(record.id, "range"),
      interval: ruleNumber(record.id, "interval"),
      radius: ruleNumber(record.id, "radius"),
    }];
  }));
}

function mvpItems(): EquipmentItem[] {
  return MVP_RULES.items.map((record) => {
    const old = legacy.equipmentShop.items.find((item) => item.key === record.id);
    if (!old) throw new Error(`Missing legacy item metadata: ${record.id}`);
    const item: EquipmentItem = {
      ...old,
      label: String(ruleValue(record.id, "label")),
      gold: ruleNumber(record.id, "gold"),
      wood: ruleNumber(record.id, "wood"),
      shop: String(ruleValue(record.id, "shop")),
    };
    // Only effects covered by the MVP replace legacy numeric fields. Unsupported
    // effects remain in the legacy note and are listed in MVP_UNKNOWNS.
    for (const field of ["allStats", "strength", "agility", "damage", "heroDamage", "armor", "speed"] as const) {
      if (typeof record.values[field] === "number") item[field] = ruleNumber(record.id, field);
    }
    if (typeof record.values.magicImmune === "boolean") item.magicImmune = Boolean(record.values.magicImmune);
    return item;
  });
}

export const RULES: RuleFile = {
  ...legacy,
  heroes: mvpHeroes(),
  buildings: mvpBuildings(),
  equipmentShop: { ...legacy.equipmentShop, items: mvpItems() },
  skills: Object.fromEntries(MVP_RULES.skills.map((record) => {
    const effectValues = Object.fromEntries(Object.entries(record.values)
      .filter(([field, value]) => field in (legacy.skills[record.id] ?? {}) && !["id", "cooldown", "duration"].includes(field) && typeof value !== "string"));
    return [record.id, {
      ...legacy.skills[record.id],
      ...effectValues,
      id: String(ruleValue(record.id, "id")),
      cooldown: ruleNumber(record.id, "cooldown"),
      duration: ruleNumber(record.id, "duration"),
      manaCost: ruleNumber(record.id, "manaCost"),
      ...(typeof record.values.originalCastRange === "number" ? { originalCastRange: Number(record.values.originalCastRange) } : {}),
      ...(typeof record.values.originalBlinkDistance === "number" ? { originalBlinkDistance: Number(record.values.originalBlinkDistance) } : {}),
    }];
  })),
  startGold: { elf: ruleNumber("modeSingle", "elfGold"), troll: ruleNumber("modeSingle", "trollGold") },
  startWood: ruleNumber("modeSingle", "startWood"),
};

export const BUILDING_RULES = RULES.buildings;
export const DEMOLISH_RULE = RULES.elfDemolish;
export const MARKET_RULE = RULES.market;
export const EQUIPMENT_RULE = RULES.equipmentShop;
export const BOUNTY_RULE = RULES.bounty;
export const COMBAT_RULE = RULES.combat;
export const VISION_RULE = RULES.vision;
export const RESPAWN_RULE = RULES.respawn;
export const SCENARIO_RULE = RULES.scenarios;
export const REPAIR_RULE = RULES.repair;
