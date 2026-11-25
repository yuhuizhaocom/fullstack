/** 新猎人vs农民：共享类型定义（客户端模拟，全部可序列化） */

export type Side = "farmer" | "hunter";
/** 普通 / 快速 / 专家 */
export type Mode = "normal" | "fast" | "expert";
export type Difficulty = "easy" | "normal" | "hard";
export type Phase = "hide" | "expand" | "reversal" | "over";
export type Stance = "follow" | "guard" | "attack";
export type Terrain = "grass" | "bush" | "tree" | "rock" | "water" | "flower";

export type UnitKind =
  | "farmerHero"
  | "chicken"
  | "sheep"
  | "pig"
  | "golem"
  | "golemClone"
  | "hunterHero"
  | "mercenary"
  | "eyeWard"
  | "mine";

export type BuildingKind =
  | "chickenPen"
  | "sheepPen"
  | "pigPen"
  | "woodWall"
  | "barricade"
  | "stoneWall"
  | "ironWall"
  | "magicWall"
  | "arrowTower"
  | "clearTower"
  | "rocketTower"
  | "boulderTower"
  | "flameTower"
  | "frostTower"
  | "researchLab"
  | "golemFactory"
  | "hunterBarracks"
  | "healthFountain"
  | "manaFountain";

export type SkillId = "eye" | "golemQ" | "golemE" | "golemW";
export type ItemKind = "hammer" | "horn" | "gloves" | "poison" | "mine" | "potion";
export type ResearchKind =
  | "buildDef"
  | "arrowAtk"
  | "light"
  | "trueSight"
  | "golemHp"
  | "golemAtk"
  | "golemAspd"
  | "golemSpeed";

export type Vec = { x: number; y: number };
export type TilePos = { tx: number; ty: number };

export type GameMap = {
  w: number;
  h: number;
  seed: number;
  /** 地形编码，见 map.ts 的 TERRAIN_INDEX */
  terrain: Uint8Array;
  /** 树木剩余木材，0 表示不是树 */
  trees: Uint8Array;
  /** 7 个农民起家点（像素坐标，按 5 点/7 点等方位分布） */
  farmerStarts: Vec[];
  /** 地图中央猎人营地与兵营 */
  hunterCamp: Vec;
  /** 候选藏匿空地（像素坐标） */
  groves: Vec[];
  /** 猎人巡逻锚点 */
  patrol: Vec[];
  /** 移动商人的候选刷新点 */
  merchantSpots: Vec[];
};

/** 单个玩家的进度，农民与猎人各有一套 */
export type FarmerSlot = {
  gold: number;
  heroId: string;
  /** 起家点 */
  base: Vec;
  thinkAt: number;
  /** 0=未起家 1=建窝中 2=转高级窝 3=出傀儡 */
  stage: number;
};

export type HunterSlot = {
  gold: number;
  heroId: string;
  thinkAt: number;
  anchor: number;
  eyeAt: number;
  /** 永久装备 */
  hammer: boolean;
  gloves: boolean;
  poison: boolean;
  /** 消耗品 */
  horns: number;
  mines: number;
  potions: number;
  kills: number;
};

export type Unit = {
  id: string;
  side: Side;
  /** 所属玩家序号（农民 0-6 / 猎人 0-2） */
  owner: number;
  kind: UnitKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  range: number;
  speed: number;
  attackInterval: number;
  cooldown: number;
  aggro: number;
  vision: number;
  targetId: string | null;
  targetAt: number;
  path: Vec[];
  dest: Vec | null;
  repathAt: number;
  stance: Stance;
  hidden: boolean;
  hiddenFor: number;
  lastActionAt: number;
  slowUntil: number;
  slowFactor: number;
  poisonUntil: number;
  regenUntil: number;
  hitFlashAt: number;
  moving: boolean;
  facing: 1 | -1;
  isHero: boolean;
  livesLeft: number;
  dead: boolean;
  respawnAt: number;
  produceTimer: number;
  bounty: number;
  homeX: number;
  homeY: number;
  expiresAt: number;
  canSiege: boolean;
  /** 地雷引爆时间 */
  armedAt: number;
  /** 动物升级后的额外收入 */
  incomeBonus: number;
  animSeed: number;
  /** 砍树目标格（-1 表示没有砍树指令） */
  chopTx: number;
  chopTy: number;
  /** 砍倒这棵树的时刻 */
  chopUntil: number;
};

export type Building = {
  id: string;
  side: Side;
  owner: number;
  kind: BuildingKind;
  tx: number;
  ty: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  produceTimer: number;
  produced: number;
  flashAt: number;
  atk: number;
  range: number;
  /** 被乌云号角禁用到的时刻 */
  disabledUntil: number;
  /** 魔法墙开合状态（true 表示开门可通行） */
  open: boolean;
  /** 动物窝升级层级（0 基础 / 1 黄鸡黑羊红猪） */
  tier: number;
};

export type Projectile = {
  id: string;
  side: Side;
  owner: number;
  x: number;
  y: number;
  targetId: string;
  speed: number;
  damage: number;
  aoe: number;
  friendlyFire: boolean;
  vsBuilding: number;
  slowFactor: number;
  slowUntil: number;
  poisonUntil: number;
  color: number;
  ttl: number;
};

export type GameEventKind = "info" | "phase" | "kill" | "build" | "hire" | "skill" | "item" | "hit" | "death" | "win";

export type GameEvent = {
  id: number;
  at: number;
  kind: GameEventKind;
  text: string;
  x: number;
  y: number;
  side?: Side;
};

export type GameResult = {
  winner: Side;
  reason: "wiped" | "timeout";
};

export type SideStats = {
  kills: number;
  goldEarned: number;
  goldSpent: number;
  built: number;
  hired: number;
  lost: number;
};

export type VisionState = {
  farmer: Uint8Array;
  hunter: Uint8Array;
};

export type Merchant = {
  x: number;
  y: number;
  nextAt: number;
};

export type GameState = {
  version: 2;
  seed: number;
  map: GameMap;
  side: Side;
  mode: Mode;
  difficulty: Difficulty;
  /** 本局总时长（分钟） */
  durationMin: number;
  /** 已模拟的秒数 */
  time: number;
  phase: Phase;
  result: GameResult | null;
  farmerSlots: FarmerSlot[];
  hunterSlots: HunterSlot[];
  /** 玩家控制的阵营序号 */
  playerOwner: number;
  /** 玩家当前操控的单位（英雄或自己的主傀儡） */
  playerUnitId: string;
  vision: VisionState;
  units: Unit[];
  buildings: Building[];
  projectiles: Projectile[];
  research: Record<Side, Record<ResearchKind, number>>;
  /** 单位技能冷却（单位 id → 技能） */
  cooldowns: Record<string, Record<SkillId, number>>;
  reveal: { x: number; y: number; r: number; until: number }[];
  merchant: Merchant;
  events: GameEvent[];
  eventSeq: number;
  stats: Record<Side, SideStats>;
  nextId: number;
  visionAt: number;
};

export type Command =
  | { t: "move"; x: number; y: number }
  | { t: "chop"; tx: number; ty: number }
  | { t: "build"; kind: BuildingKind; tx: number; ty: number }
  | { t: "sell"; id: string }
  | { t: "research"; kind: ResearchKind }
  | { t: "hire"; unit: UnitKind; heroId?: string }
  | { t: "skill"; skill: SkillId; x: number; y: number }
  | { t: "buy"; item: ItemKind }
  | { t: "use"; item: ItemKind }
  | { t: "detonate"; id: string }
  | { t: "toggleWall"; id: string }
  | { t: "control"; unitId: string }
  | { t: "stance"; stance: Stance };

export type HunterSettings = {
  joystickSide: "left" | "right";
  buttonScale: "compact" | "normal" | "large";
  zoom: number;
  sound: boolean;
  music: boolean;
};

export const DEFAULT_SETTINGS: HunterSettings = {
  joystickSide: "left",
  buttonScale: "normal",
  zoom: 0.75,
  sound: true,
  music: false,
};
