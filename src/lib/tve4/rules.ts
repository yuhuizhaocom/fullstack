// tve4 运行期规则：直接读取原版解包核对后的规则文件，不在引擎里硬编码。

import raw from "../../../data/game/game-rules.json";

export interface EquipmentItem {
  key: string;
  label: string;
  gold: number;
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
  scale: number;
  modes: Record<string, string>;
  rules: Record<string, string>;
  startGold: { elf: number; troll: number };
  startWood: number;
  trollAppear: { withPrepare: number; fixSurvive: number };
  trollInvulnerableSeconds: number;
  heroes: Record<string, { hp: number; speed: number; attack: number; range: number; interval: number; radius: number }>;
  buildings: Record<string, {
    gold: number | number[];
    wood: number | number[];
    hp: number | number[];
    income?: number | number[];
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
  skills: Record<string, Record<string, number | boolean>>;
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
    baseHpPerSecond: number;
    delayAfterHit: number;
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

export const RULES = raw as unknown as RuleFile;

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
