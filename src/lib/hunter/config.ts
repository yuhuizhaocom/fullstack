import type {
  BuildingKind,
  Difficulty,
  ItemKind,
  Mode,
  Phase,
  ResearchKind,
  SkillId,
  UnitKind,
} from "./types";

/** 单格像素尺寸 */
export const TILE = 32;
export const MAP_W = 96;
export const MAP_H = 96;

/** 人数：7 农民 vs 3 猎人 */
export const FARMER_COUNT = 7;
export const HUNTER_COUNT = 3;
/** 每个猎人的命数 */
export const HUNTER_LIVES = 3;

export const START_GOLD = {
  farmer: 300,
  hunter: 200,
};

/** 阶段阈值（占总时长比例）：匿藏 → 起家 → 决战 */
export const PHASE_RATIO = {
  hideEnd: 0.3,
  expandEnd: 0.7,
};

export const PHASE_LABEL: Record<Phase, string> = {
  hide: "匿藏期",
  expand: "起家期",
  reversal: "决战期",
  over: "对局结束",
};

export const PHASE_TIP: Record<Phase, string> = {
  hide: "躲藏攒钱，先摆 3-5 个鸡窝",
  expand: "在角落大点起家，补塔补墙",
  reversal: "转羊窝猪窝，出傀儡反推猎人",
  over: "对局结束",
};

export type ModeSpec = {
  label: string;
  desc: string;
  durationMin: number;
  /** 箭塔造价 */
  arrowTowerCost: number;
  /** 真实视野造价 */
  trueSightCost: number;
  /** 主傀儡分身数量 */
  cloneCount: number;
  /** 傀儡每级升级加成 */
  golemHpUp: number;
  golemAtkUp: number;
  /** 是否开放地雷 */
  mines: boolean;
};

export const MODES: Record<Mode, ModeSpec> = {
  normal: {
    label: "普通",
    desc: "40 分钟 · 箭塔 20 金 · 有地雷 · 12 个傀儡分身",
    durationMin: 40,
    arrowTowerCost: 20,
    trueSightCost: 2500,
    cloneCount: 12,
    golemHpUp: 600,
    golemAtkUp: 10,
    mines: true,
  },
  fast: {
    label: "快速",
    desc: "25 分钟 · 箭塔 25 金 · 无地雷 · 节奏更快",
    durationMin: 25,
    arrowTowerCost: 25,
    trueSightCost: 2500,
    cloneCount: 12,
    golemHpUp: 600,
    golemAtkUp: 10,
    mines: false,
  },
  expert: {
    label: "专家",
    desc: "40 分钟 · 箭塔 25 金 · 有地雷 · 分身更多、升级加成更低",
    durationMin: 40,
    arrowTowerCost: 25,
    trueSightCost: 4000,
    cloneCount: 24,
    golemHpUp: 400,
    golemAtkUp: 5,
    mines: true,
  },
};

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
  costGold: number;
  bounty: number;
  desc: string;
  hero?: boolean;
  lives?: number;
  canSiege?: boolean;
  /** 动物：每 interval 秒产出 gold */
  incomeInterval?: number;
  incomeGold?: number;
  /** 动物是否占碰撞体积 */
  solid?: boolean;
};

export const UNITS: Record<UnitKind, UnitSpec> = {
  farmerHero: {
    name: "农民",
    icon: "🧑‍🌾",
    side: "farmer",
    hp: 700,
    atk: 10,
    def: 2,
    range: 36,
    speed: 165,
    attackInterval: 1.2,
    aggro: 190,
    vision: 300,
    costGold: 0,
    bounty: 0,
    desc: "可建造、可指挥的英雄，阵亡后 60 秒复活并损失 10% 金币。",
    hero: true,
    canSiege: true,
  },
  chicken: {
    name: "鸡",
    icon: "🐔",
    side: "farmer",
    hp: 30,
    atk: 0,
    def: 0,
    range: 0,
    speed: 0,
    attackInterval: 0,
    aggro: 0,
    vision: 80,
    costGold: 0,
    bounty: 8,
    desc: "每 7.5 秒 +1 金。",
    incomeInterval: 7.5,
    incomeGold: 1,
  },
  sheep: {
    name: "羊",
    icon: "🐑",
    side: "farmer",
    hp: 45,
    atk: 0,
    def: 0,
    range: 0,
    speed: 0,
    attackInterval: 0,
    aggro: 0,
    vision: 80,
    costGold: 0,
    bounty: 12,
    desc: "每 7.5 秒 +2 金。",
    incomeInterval: 7.5,
    incomeGold: 2,
  },
  pig: {
    name: "猪",
    icon: "🐖",
    side: "farmer",
    hp: 70,
    atk: 0,
    def: 0,
    range: 0,
    speed: 0,
    attackInterval: 0,
    aggro: 0,
    vision: 80,
    costGold: 0,
    bounty: 18,
    desc: "每 7.5 秒 +3 金。",
    incomeInterval: 7.5,
    incomeGold: 3,
  },
  golem: {
    name: "主傀儡",
    icon: "🗿",
    side: "farmer",
    hp: 1000,
    atk: 45,
    def: 6,
    range: 44,
    speed: 115,
    attackInterval: 1.8,
    aggro: 230,
    vision: 300,
    costGold: 1800,
    bounty: 120,
    desc: "农民唯一的主战单位，占体积、能堵路，Q/E/W 三技能。",
    canSiege: true,
  },
  golemClone: {
    name: "傀儡分身",
    icon: "🪨",
    side: "farmer",
    hp: 320,
    atk: 18,
    def: 3,
    range: 40,
    speed: 120,
    attackInterval: 2,
    aggro: 200,
    vision: 260,
    costGold: 0,
    bounty: 15,
    desc: "随主傀儡一起出厂的廉价分身。",
    canSiege: true,
  },
  hunterHero: {
    name: "猎人",
    icon: "🏹",
    side: "hunter",
    hp: 1200,
    atk: 55,
    def: 8,
    range: 48,
    speed: 190,
    attackInterval: 0.85,
    aggro: 220,
    vision: 380,
    costGold: 0,
    bounty: 0,
    desc: "3 条命。一级先学插眼，靠装备与地雷拆塔断经济。",
    hero: true,
    lives: HUNTER_LIVES,
    canSiege: true,
  },
  mercenary: {
    name: "雇佣兵",
    icon: "🛡️",
    side: "hunter",
    hp: 240,
    atk: 18,
    def: 2,
    range: 40,
    speed: 130,
    attackInterval: 1.1,
    aggro: 200,
    vision: 300,
    costGold: 40,
    bounty: 6,
    desc: "中间兵营 40 金，买来当移动眼位与巡逻兵。",
  },
  eyeWard: {
    name: "侦察之眼",
    icon: "👁️",
    side: "hunter",
    hp: 1,
    atk: 0,
    def: 0,
    range: 0,
    speed: 0,
    attackInterval: 0,
    aggro: 0,
    vision: 620,
    costGold: 0,
    bounty: 0,
    desc: "插在地面的视野守卫。",
  },
  mine: {
    name: "地雷",
    icon: "💣",
    side: "hunter",
    hp: 1,
    atk: 0,
    def: 0,
    range: 0,
    speed: 0,
    attackInterval: 0,
    aggro: 0,
    vision: 60,
    costGold: 0,
    bounty: 0,
    desc: "放置 10 秒后引爆，大范围伤害。",
  },
};

export type TowerSpec = {
  range: number;
  atk: number;
  interval: number;
  aoe?: number;
  slow?: number;
  /** 敌我不分 */
  friendlyFire?: boolean;
  /** 对建筑伤害倍率 */
  vsBuilding?: number;
  color: number;
};

export type BuildingSpec = {
  name: string;
  icon: string;
  side: "farmer" | "hunter";
  hp: number;
  costGold: number;
  desc: string;
  /** 分类，用于建造面板 */
  group: "economy" | "tower" | "wall" | "tech";
  tower?: TowerSpec;
  /** 动物窝产出 */
  income?: { kind: UnitKind; interval: number; max: number };
  /** 升级后的动物种类与产出 */
  upgraded?: { kind: UnitKind; incomeGold: number };
  /** 可通行（门/透明塔） */
  passable?: boolean;
  /** 反隐 / 视野半径 */
  reveal?: number;
  /** 是否可以开关 */
  toggle?: boolean;
  /** 全队唯一 */
  unique?: boolean;
  /** 不可建造（固定建筑） */
  fixed?: boolean;
  /** 泉水：范围内持续恢复 */
  fountain?: "health" | "mana";
  /** 泉水作用半径 */
  fountainRadius?: number;
  /** 不可被破坏 */
  invulnerable?: boolean;
};

export const BUILDINGS: Record<BuildingKind, BuildingSpec> = {
  chickenPen: {
    name: "鸡窝",
    icon: "🐔",
    side: "farmer",
    hp: 400,
    costGold: 38,
    desc: "每 6 秒孵 1 只鸡（上限 12），每只鸡 7.5 秒 +1 金。",
    group: "economy",
    income: { kind: "chicken", interval: 6, max: 12 },
    upgraded: { kind: "chicken", incomeGold: 2 },
  },
  sheepPen: {
    name: "羊窝",
    icon: "🐑",
    side: "farmer",
    hp: 550,
    costGold: 98,
    desc: "每 6 秒生 1 只羊（上限 12），每只羊 7.5 秒 +2 金。",
    group: "economy",
    income: { kind: "sheep", interval: 6, max: 12 },
    upgraded: { kind: "sheep", incomeGold: 3 },
  },
  pigPen: {
    name: "猪窝",
    icon: "🐖",
    side: "farmer",
    hp: 700,
    costGold: 198,
    desc: "每 6 秒生 1 只猪（上限 12），每只猪 7.5 秒 +3 金。",
    group: "economy",
    income: { kind: "pig", interval: 6, max: 12 },
    upgraded: { kind: "pig", incomeGold: 5 },
  },
  woodWall: {
    name: "弱逼墙",
    icon: "🧱",
    side: "farmer",
    hp: 10,
    costGold: 7,
    desc: "最便宜的封路墙，只有 10 血，主要用来升级或补视野。",
    group: "wall",
  },
  barricade: {
    name: "路障",
    icon: "🚧",
    side: "farmer",
    hp: 600,
    costGold: 80,
    desc: "600 血的进阶路障。",
    group: "wall",
  },
  stoneWall: {
    name: "石头墙",
    icon: "🪨",
    side: "farmer",
    hp: 1200,
    costGold: 400,
    desc: "1200 血，起家后的主力墙体。",
    group: "wall",
  },
  ironWall: {
    name: "铁墙",
    icon: "⚙️",
    side: "farmer",
    hp: 3000,
    costGold: 1000,
    desc: "3000 血，猎人很难徒手拆开。",
    group: "wall",
  },
  magicWall: {
    name: "魔法墙",
    icon: "✨",
    side: "farmer",
    hp: 6100,
    costGold: 2500,
    desc: "6100 血，可开关；关门时墙下地雷不会引爆。",
    group: "wall",
    toggle: true,
  },
  arrowTower: {
    name: "箭塔",
    icon: "🏹",
    side: "farmer",
    hp: 500,
    costGold: 20,
    desc: "15 级的核心防御塔，每级 +3 攻击，高地更痛。",
    group: "tower",
    tower: { range: 300, atk: 20, interval: 0.9, color: 0xfbbf24 },
  },
  clearTower: {
    name: "透明塔",
    icon: "🔍",
    side: "farmer",
    hp: 320,
    costGold: 50,
    desc: "升级期间可当门穿人，同时保留箭塔的 20 攻击与 300 反隐视野。",
    group: "tower",
    passable: true,
    reveal: 300,
    tower: { range: 300, atk: 20, interval: 0.9, color: 0x67e8f9 },
  },
  rocketTower: {
    name: "火箭塔",
    icon: "🚀",
    side: "farmer",
    hp: 600,
    costGold: 180,
    desc: "射程 340，对建筑造成双倍伤害。",
    group: "tower",
    tower: { range: 340, atk: 26, interval: 1.6, vsBuilding: 2, color: 0xf97316 },
  },
  boulderTower: {
    name: "巨石塔",
    icon: "🪨",
    side: "farmer",
    hp: 700,
    costGold: 198,
    desc: "45 伤害的范围投石，敌我不分。",
    group: "tower",
    tower: { range: 320, atk: 45, interval: 2, aoe: 90, friendlyFire: true, color: 0xa8a29e },
  },
  flameTower: {
    name: "火焰塔",
    icon: "🔥",
    side: "farmer",
    hp: 600,
    costGold: 220,
    desc: "范围火焰，适合清理猎人的巡逻兵。",
    group: "tower",
    tower: { range: 280, atk: 14, interval: 0.55, aoe: 70, color: 0xef4444 },
  },
  frostTower: {
    name: "寒冰塔",
    icon: "❄️",
    side: "farmer",
    hp: 600,
    costGold: 220,
    desc: "范围减速 50%，把猎人困在塔下。",
    group: "tower",
    tower: { range: 300, atk: 24, interval: 1.2, slow: 0.5, color: 0x67e8f9 },
  },
  researchLab: {
    name: "研究所",
    icon: "📚",
    side: "farmer",
    hp: 800,
    costGold: 150,
    desc: "解锁建筑防御、箭塔攻击、照明与傀儡科技。",
    group: "tech",
  },
  golemFactory: {
    name: "傀儡工厂",
    icon: "🏭",
    side: "farmer",
    hp: 1500,
    costGold: 2000,
    desc: "全队唯一。建成后每人可花 1800 金买自己的主傀儡。",
    group: "tech",
    unique: true,
  },
  hunterBarracks: {
    name: "猎人兵营",
    icon: "🏕️",
    side: "hunter",
    hp: 4000,
    costGold: 0,
    desc: "地图中央的固定兵营，可花 40 金买巡逻兵。",
    group: "tech",
    fixed: true,
  },
  healthFountain: {
    name: "生命之泉",
    icon: "💚",
    side: "hunter",
    hp: 99999,
    costGold: 0,
    desc: "中央营地旁的泉水，猎人站在附近可快速回复生命。",
    group: "tech",
    fixed: true,
    passable: true,
    fountain: "health",
    fountainRadius: 220,
    invulnerable: true,
  },
  manaFountain: {
    name: "魔法之泉",
    icon: "💙",
    side: "hunter",
    hp: 99999,
    costGold: 0,
    desc: "中央营地旁的泉水，猎人站在附近可加速技能冷却恢复。",
    group: "tech",
    fixed: true,
    passable: true,
    fountain: "mana",
    fountainRadius: 220,
    invulnerable: true,
  },
};

export function arrowTowerCost(mode: Mode): number {
  return MODES[mode].arrowTowerCost;
}

export function buildingCost(kind: BuildingKind, mode: Mode): number {
  if (kind === "arrowTower") return arrowTowerCost(mode);
  return BUILDINGS[kind].costGold;
}

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
  /** 只有傀儡能施放 */
  golem?: boolean;
};

export const SKILLS: Record<SkillId, SkillSpec> = {
  eye: {
    name: "侦察之眼",
    short: "插眼",
    icon: "👁️",
    cd: 15,
    radius: 620,
    duration: 6,
    desc: "在目标点插眼 6 秒，提供 620 范围视野并显形。CD 20/15/10 随阶段缩短。",
  },
  golemQ: {
    name: "尖刺散弹",
    short: "散弹",
    icon: "🌵",
    cd: 14,
    radius: 140,
    damage: 180,
    desc: "向周围喷出尖刺，对 140 范围敌人造成伤害。",
    golem: true,
  },
  golemE: {
    name: "大地力量",
    short: "大地",
    icon: "🌍",
    cd: 18,
    radius: 180,
    damage: 120,
    slowFactor: 0.5,
    slowSeconds: 3,
    desc: "震荡大地，180 范围伤害并减速 50%。",
    golem: true,
  },
  golemW: {
    name: "粉碎一击",
    short: "粉碎",
    icon: "👊",
    cd: 12,
    radius: 90,
    damage: 320,
    desc: "对单体与建筑造成 320 点重击。",
    golem: true,
  },
};

export type ItemSpec = {
  name: string;
  icon: string;
  cost: number;
  desc: string;
  /** 永久装备（不占消耗品栏） */
  permanent?: boolean;
  /** 一次购买获得的数量 */
  bundle?: number;
  /** 解锁时间（秒） */
  unlockAt?: number;
};

export const ITEMS: Record<ItemKind, ItemSpec> = {
  hammer: {
    name: "锤子",
    icon: "🔨",
    cost: 65,
    desc: "攻击力 +25%，拆建筑更快（永久）。",
    permanent: true,
  },
  horn: {
    name: "乌云号角",
    icon: "📯",
    cost: 120,
    desc: "让周围 420 范围内的农民箭塔失效 8 秒。",
  },
  gloves: {
    name: "加速手套",
    icon: "🧤",
    cost: 150,
    desc: "攻击速度 +40%（永久）。",
    permanent: true,
  },
  poison: {
    name: "武器涂毒",
    icon: "☠️",
    cost: 60,
    desc: "攻击附带持续掉血（永久，不占装备栏）。",
    permanent: true,
  },
  mine: {
    name: "翻妈地雷",
    icon: "💣",
    cost: 25,
    desc: "获得 3 枚地雷，放置 10 秒后引爆。20 分钟后开放。",
    bundle: 3,
    unlockAt: 20 * 60,
  },
  potion: {
    name: "恢复药水",
    icon: "🧪",
    cost: 80,
    desc: "立即恢复 400 生命。",
  },
};

export type ResearchSpec = {
  name: string;
  icon: string;
  max: number;
  /** 第 level 级（从 1 开始）的价格 */
  cost: (level: number, mode: Mode) => number;
  desc: (level: number, mode: Mode) => string;
  requiresLab?: boolean;
};

export const RESEARCH: Record<ResearchKind, ResearchSpec> = {
  buildDef: {
    name: "建筑防御",
    icon: "🧱",
    max: 15,
    cost: (level) => 500 + (level - 1) * 100,
    desc: (level) => `全部农民建筑减伤 ${Math.min(60, level * 4)}%（下一级 ${Math.min(60, (level + 1) * 4)}%）`,
    requiresLab: true,
  },
  arrowAtk: {
    name: "箭塔攻击",
    icon: "🏹",
    max: 15,
    cost: (level) => 200 + (level - 1) * 100,
    desc: (level) => `全部防御塔 +${level * 3} 攻击（下一级 +${(level + 1) * 3}）`,
    requiresLab: true,
  },
  light: {
    name: "照明",
    icon: "💡",
    max: 1,
    cost: () => 50,
    desc: () => "所有己方建筑获得 220 额外视野。",
    requiresLab: true,
  },
  trueSight: {
    name: "真实视野",
    icon: "🌐",
    max: 1,
    cost: (_level, mode) => MODES[mode].trueSightCost,
    desc: () => "永久点亮全图。",
    requiresLab: true,
  },
  golemHp: {
    name: "傀儡血量",
    icon: "❤️",
    max: 10,
    cost: (level) => 100 + (level - 1) * 100,
    desc: (level, mode) => `傀儡 +${level * MODES[mode].golemHpUp} 生命`,
    requiresLab: true,
  },
  golemAtk: {
    name: "傀儡攻击",
    icon: "⚔️",
    max: 10,
    cost: (level) => 100 + (level - 1) * 100,
    desc: (level, mode) => `傀儡 +${level * MODES[mode].golemAtkUp} 攻击`,
    requiresLab: true,
  },
  golemAspd: {
    name: "傀儡攻速",
    icon: "⚡",
    max: 10,
    cost: (level) => 100 + (level - 1) * 100,
    desc: (level) => `傀儡攻速 +${level * 15}%`,
    requiresLab: true,
  },
  golemSpeed: {
    name: "傀儡移速",
    icon: "👣",
    max: 3,
    cost: (level) => 200 + (level - 1) * 100,
    desc: (level) => `傀儡移速 +${level * 40}`,
    requiresLab: true,
  },
};

export type DifficultySpec = {
  label: string;
  /** AI 思考间隔（秒） */
  think: number;
  /** AI 每分钟额外收入 */
  bonus: number;
};

export const DIFFICULTY: Record<Difficulty, DifficultySpec> = {
  easy: { label: "简单", think: 1.8, bonus: 0 },
  normal: { label: "普通", think: 1.1, bonus: 20 },
  hard: { label: "困难", think: 0.6, bonus: 60 },
};

/** 英雄复活时间（秒） */
export const RESPAWN_HUNTER = 40;
export const RESPAWN_FARMER = 60;
/** 地雷引信（秒） */
export const MINE_FUSE = 10;
/** 乌云号角禁用时长 */
export const HORN_DURATION = 8;
export const HORN_RADIUS = 420;
/** 动物总数达到该值后自动升级 */
export const ANIMAL_UPGRADE_TOTAL = 300;
/** 移动商人换位间隔 */
export const MERCHANT_INTERVAL = 10;

export function costLabel(gold: number): string {
  return `${gold} 金`;
}
