import type {
  BuildingKind,
  Difficulty,
  DurationMin,
  ItemKind,
  Phase,
  SkillId,
  UnitKind,
  UpgradeKind,
} from "./types";

/** 单格像素尺寸 */
export const TILE = 32;
export const MAP_W = 96;
export const MAP_H = 96;

export const START_GOLD: Record<"farmer" | "hunter", number> = {
  farmer: 300,
  hunter: 250,
};

export const START_WOOD: Record<"farmer" | "hunter", number> = {
  farmer: 100,
  hunter: 60,
};

/** 阶段阈值（占总时长比例） */
export const PHASE_RATIO = {
  hideEnd: 0.3,
  expandEnd: 0.55,
};

export const PHASE_LABEL: Record<Phase, string> = {
  hide: "匿藏期",
  expand: "扩张期",
  reversal: "反转期",
  over: "对局结束",
};

export const PHASE_TIP: Record<Phase, string> = {
  hide: "藏好、伐木、滚起羊猪经济",
  expand: "上墙造塔，猎人开始拿赏金",
  reversal: "农民军队出击，猎人转为守家",
  over: "对局结束",
};

export const DURATION_OPTIONS: DurationMin[] = [30, 40, 50];

export type UnitSpec = {
  name: string;
  icon: string;
  side: "farmer" | "hunter";
  hp: number;
  atk: number;
  def: number;
  range: number;
  speed: number;
  attackInterval: number;
  aggro: number;
  vision: number;
  pop: number;
  costGold: number;
  costWood: number;
  bounty: number;
  desc: string;
  hero?: boolean;
  lives?: number;
  canSiege?: boolean;
  unlock?: Phase;
  /** 伐木工砍树间隔 */
  lumberInterval?: number;
  /** 羊/猪产金间隔与金额 */
  incomeInterval?: number;
  incomeGold?: number;
};

export const UNITS: Record<UnitKind, UnitSpec> = {
  farmerHero: {
    name: "农民",
    icon: "🧑‍🌾",
    side: "farmer",
    hp: 700,
    atk: 14,
    def: 3,
    range: 34,
    speed: 150,
    attackInterval: 1.2,
    aggro: 170,
    vision: 260,
    pop: 0,
    costGold: 0,
    costWood: 0,
    bounty: 0,
    desc: "可建造、可伐木的英雄。阵亡后 60 秒在营地复活。",
    hero: true,
    canSiege: true,
  },
  lumberjack: {
    name: "伐木农民",
    icon: "🪓",
    side: "farmer",
    hp: 60,
    atk: 0,
    def: 0,
    range: 0,
    speed: 130,
    attackInterval: 1,
    aggro: 0,
    vision: 180,
    pop: 1,
    costGold: 20,
    costWood: 0,
    bounty: 4,
    desc: "自动砍最近树木，每次 +1 木材。被猎人猎杀会断经济。",
    lumberInterval: 4,
  },
  militia: {
    name: "民兵",
    icon: "⚔️",
    side: "farmer",
    hp: 160,
    atk: 16,
    def: 2,
    range: 34,
    speed: 130,
    attackInterval: 1.1,
    aggro: 190,
    vision: 220,
    pop: 1,
    costGold: 40,
    costWood: 20,
    bounty: 8,
    desc: "近战前排，需要酒馆。",
  },
  archer: {
    name: "弓箭手",
    icon: "🏹",
    side: "farmer",
    hp: 110,
    atk: 14,
    def: 1,
    range: 260,
    speed: 125,
    attackInterval: 1.4,
    aggro: 260,
    vision: 260,
    pop: 1,
    costGold: 45,
    costWood: 25,
    bounty: 8,
    desc: "远程后排，需要酒馆。",
  },
  golem: {
    name: "岩石魔像",
    icon: "🗿",
    side: "farmer",
    hp: 900,
    atk: 40,
    def: 8,
    range: 40,
    speed: 95,
    attackInterval: 2,
    aggro: 200,
    vision: 240,
    pop: 4,
    costGold: 150,
    costWood: 120,
    bounty: 20,
    desc: "反转期解锁的重型单位，拆塔极快。",
    canSiege: true,
    unlock: "reversal",
  },
  hunterHero: {
    name: "猎人",
    icon: "🪓",
    side: "hunter",
    hp: 850,
    atk: 26,
    def: 5,
    range: 40,
    speed: 170,
    attackInterval: 1,
    aggro: 200,
    vision: 320,
    pop: 0,
    costGold: 0,
    costWood: 0,
    bounty: 0,
    desc: "三技能猎手，负责搜杀与拆经济。3 条命，阵亡 45 秒后复活。",
    hero: true,
    lives: 3,
    canSiege: true,
  },
  shadowScout: {
    name: "暗影斥候",
    icon: "👤",
    side: "hunter",
    hp: 90,
    atk: 8,
    def: 0,
    range: 34,
    speed: 145,
    attackInterval: 1.2,
    aggro: 150,
    vision: 300,
    pop: 1,
    costGold: 70,
    costWood: 0,
    bounty: 6,
    desc: "隐形侦察单位，提供大范围视野。",
  },
  trollSlinger: {
    name: "投石巨魔",
    icon: "🪨",
    side: "hunter",
    hp: 260,
    atk: 30,
    def: 2,
    range: 300,
    speed: 110,
    attackInterval: 2.2,
    aggro: 300,
    vision: 260,
    pop: 2,
    costGold: 110,
    costWood: 0,
    bounty: 12,
    desc: "攻城远程，对建筑伤害翻倍。",
    canSiege: true,
  },
  frostShaman: {
    name: "冰霜萨满",
    icon: "❄️",
    side: "hunter",
    hp: 120,
    atk: 10,
    def: 0,
    range: 220,
    speed: 130,
    attackInterval: 1.6,
    aggro: 220,
    vision: 260,
    pop: 1,
    costGold: 90,
    costWood: 0,
    bounty: 10,
    desc: "攻击附带 30% 减速，克制农民部队。",
  },
  sheep: {
    name: "羊",
    icon: "🐑",
    side: "farmer",
    hp: 40,
    atk: 0,
    def: 0,
    range: 0,
    speed: 55,
    attackInterval: 1,
    aggro: 0,
    vision: 120,
    pop: 0,
    costGold: 0,
    costWood: 0,
    bounty: 10,
    desc: "每 30 秒产出 2 金币。",
    incomeInterval: 30,
    incomeGold: 2,
  },
  pig: {
    name: "猪",
    icon: "🐖",
    side: "farmer",
    hp: 80,
    atk: 0,
    def: 0,
    range: 0,
    speed: 50,
    attackInterval: 1,
    aggro: 0,
    vision: 120,
    pop: 0,
    costGold: 0,
    costWood: 0,
    bounty: 16,
    desc: "每 30 秒产出 4 金币。",
    incomeInterval: 30,
    incomeGold: 4,
  },
  owl: {
    name: "哨兵猫头鹰",
    icon: "🦉",
    side: "hunter",
    hp: 1,
    atk: 0,
    def: 0,
    range: 0,
    speed: 0,
    attackInterval: 1,
    aggro: 0,
    vision: 320,
    pop: 0,
    costGold: 0,
    costWood: 0,
    bounty: 0,
    desc: "驻守 30 秒的侦察之眼。",
  },
  eyeWard: {
    name: "鹰眼",
    icon: "👁️",
    side: "hunter",
    hp: 1,
    atk: 0,
    def: 0,
    range: 0,
    speed: 0,
    attackInterval: 1,
    aggro: 0,
    vision: 420,
    pop: 0,
    costGold: 0,
    costWood: 0,
    bounty: 0,
    desc: "插在地面上的侦察守卫，8 秒后消失。",
  },
};

export type TowerSpec = {
  range: number;
  atk: number;
  interval: number;
  aoe?: number;
  poison?: number;
  slow?: number;
};

export type BuildingSpec = {
  name: string;
  icon: string;
  side: "farmer" | "hunter";
  hp: number;
  costGold: number;
  costWood: number;
  desc: string;
  unlock?: Phase;
  tower?: TowerSpec;
  income?: { kind: "sheep" | "pig"; interval: number; max: number };
  produceWood?: { interval: number; amount: number };
  produceUnit?: { kind: UnitKind; interval: number; max: number };
  produceBomb?: { interval: number; max: number };
  popBonus?: number;
  auraSlow?: { range: number; factor: number };
  reveal?: number;
};

export const BUILDINGS: Record<BuildingKind, BuildingSpec> = {
  sheepFarm: {
    name: "羊圈",
    icon: "🐑",
    side: "farmer",
    hp: 400,
    costGold: 70,
    costWood: 15,
    desc: "每 30 秒产 1 只羊（最多 4 只），羊每 30 秒 +2 金。",
    income: { kind: "sheep", interval: 30, max: 4 },
  },
  pigFarm: {
    name: "猪圈",
    icon: "🐖",
    side: "farmer",
    hp: 600,
    costGold: 110,
    costWood: 30,
    desc: "每 45 秒产 1 只猪（最多 3 只），猪每 30 秒 +4 金。",
    income: { kind: "pig", interval: 45, max: 3 },
  },
  woodWall: {
    name: "木墙",
    icon: "🧱",
    side: "farmer",
    hp: 250,
    costGold: 8,
    costWood: 8,
    desc: "廉价路障，阻挡寻路。",
  },
  stoneWall: {
    name: "石墙",
    icon: "🪨",
    side: "farmer",
    hp: 700,
    costGold: 20,
    costWood: 20,
    desc: "坚固路障。",
  },
  arrowTower: {
    name: "箭塔",
    icon: "🏹",
    side: "farmer",
    hp: 500,
    costGold: 90,
    costWood: 60,
    desc: "单体防御塔，射程 280。",
    tower: { range: 280, atk: 20, interval: 1 },
  },
  cannonTower: {
    name: "炮塔",
    icon: "💣",
    side: "farmer",
    hp: 700,
    costGold: 150,
    costWood: 110,
    desc: "范围炮击，扩张期解锁。",
    tower: { range: 320, atk: 30, interval: 2.5, aoe: 90 },
    unlock: "expand",
  },
  mageTower: {
    name: "法师塔",
    icon: "🔮",
    side: "farmer",
    hp: 550,
    costGold: 130,
    costWood: 90,
    desc: "光环减速 30%，范围 180。",
    auraSlow: { range: 180, factor: 0.3 },
  },
  watchTower: {
    name: "哨塔",
    icon: "🔭",
    side: "farmer",
    hp: 450,
    costGold: 100,
    costWood: 70,
    desc: "反隐视野 260，能看破树丛里的猎人。",
    reveal: 260,
  },
  tavern: {
    name: "酒馆",
    icon: "🍺",
    side: "farmer",
    hp: 800,
    costGold: 160,
    costWood: 110,
    desc: "招募民兵、弓箭手与岩石魔像。",
    unlock: "expand",
  },
  warehouse: {
    name: "仓库",
    icon: "📦",
    side: "farmer",
    hp: 350,
    costGold: 60,
    costWood: 20,
    desc: "人口上限 +20。",
    popBonus: 20,
  },
  poisonTower: {
    name: "毒塔",
    icon: "☠️",
    side: "hunter",
    hp: 500,
    costGold: 90,
    costWood: 0,
    desc: "低伤害但附带中毒，适合守家。",
    tower: { range: 280, atk: 10, interval: 1.2, poison: 4 },
  },
  cheeseShop: {
    name: "奶酪坊",
    icon: "🧀",
    side: "hunter",
    hp: 450,
    costGold: 70,
    costWood: 0,
    desc: "每 8 秒 +1 奶酪（木材）。",
    produceWood: { interval: 8, amount: 1 },
  },
  shadowNest: {
    name: "暗影巢",
    icon: "🕳️",
    side: "hunter",
    hp: 500,
    costGold: 100,
    costWood: 0,
    desc: "每 20 秒免费产 1 名暗影斥候（最多 3 名）。",
    produceUnit: { kind: "shadowScout", interval: 20, max: 3 },
  },
  bombHut: {
    name: "炸弹屋",
    icon: "🧨",
    side: "hunter",
    hp: 600,
    costGold: 120,
    costWood: 0,
    desc: "每 25 秒产出 1 枚炸弹（最多 3 枚）。",
    produceBomb: { interval: 25, max: 3 },
  },
};

export type SkillSpec = {
  name: string;
  short: string;
  icon: string;
  cd: number;
  radius: number;
  damage?: number;
  slowFactor?: number;
  slowSeconds?: number;
  duration?: number;
  desc: string;
};

export const SKILLS: Record<SkillId, SkillSpec> = {
  eye: {
    name: "鹰眼",
    short: "插眼",
    icon: "👁️",
    cd: 12,
    radius: 200,
    duration: 8,
    desc: "在目标点插眼 8 秒，视野 420，范围内敌人显形。",
  },
  slam: {
    name: "裂地",
    short: "裂地",
    icon: "💥",
    cd: 14,
    radius: 140,
    damage: 40,
    slowFactor: 0.4,
    slowSeconds: 3,
    desc: "范围 140 造成 40 伤害并减速 40%，持续 3 秒。",
  },
  sentinel: {
    name: "哨兵",
    short: "哨兵",
    icon: "🦉",
    cd: 25,
    radius: 320,
    duration: 30,
    desc: "召唤猫头鹰驻守 30 秒，提供 320 范围视野。",
  },
};

export type ItemSpec = {
  name: string;
  icon: string;
  cost: number;
  desc: string;
};

export const ITEMS: Record<ItemKind, ItemSpec> = {
  spray: {
    name: "治疗喷雾",
    icon: "🧪",
    cost: 60,
    desc: "英雄立即恢复 220 生命。",
  },
  cdScroll: {
    name: "冷却卷轴",
    icon: "📜",
    cost: 50,
    desc: "所有技能冷却立即减半。",
  },
  regen: {
    name: "回春杖",
    icon: "🌿",
    cost: 90,
    desc: "英雄 20 秒内每秒恢复 8 生命。",
  },
  dust: {
    name: "反隐粉",
    icon: "✨",
    cost: 40,
    desc: "以英雄为中心，300 范围显形 6 秒。",
  },
  bomb: {
    name: "炸弹",
    icon: "💣",
    cost: 70,
    desc: "对英雄附近 90 范围内的建筑造成 300 伤害。",
  },
};

export const UPGRADES: Record<UpgradeKind, { name: string; icon: string; cost: number; desc: string }> = {
  bounty: { name: "赏金强化", icon: "💰", cost: 120, desc: "击杀获得的金币 +50%。" },
  atk: { name: "攻击强化", icon: "🗡️", cost: 120, desc: "全体单位攻击力 +15%。" },
  def: { name: "护甲强化", icon: "🛡️", cost: 120, desc: "全体单位护甲 +3。" },
};

export type DifficultySpec = {
  label: string;
  income: number;
  reaction: number;
  vision: number;
  unitCap: number;
};

export const DIFFICULTY: Record<Difficulty, DifficultySpec> = {
  easy: { label: "简单", income: 0.85, reaction: 1.5, vision: 0.85, unitCap: 20 },
  normal: { label: "普通", income: 1, reaction: 0.8, vision: 1, unitCap: 30 },
  hard: { label: "困难", income: 1.15, reaction: 0.4, vision: 1.15, unitCap: 40 },
};

/** 英雄复活时间（秒） */
export const RESPAWN_HUNTER = 45;
export const RESPAWN_FARMER = 60;
/** 基础人口与上限 */
export const BASE_POP = 20;
export const MAX_POP = 100;
/** 扩展之外的可建造阶段顺序 */
export const PHASE_ORDER: Phase[] = ["hide", "expand", "reversal", "over"];

export function phaseAllows(unlock: Phase | undefined, phase: Phase): boolean {
  if (!unlock) return true;
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(unlock);
}

/** 建筑/单位造价文案 */
export function costLabel(gold: number, wood: number): string {
  if (wood > 0) return `${gold} 金 · ${wood} 木`;
  return `${gold} 金`;
}
