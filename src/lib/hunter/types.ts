/** 猎人与农民：共享类型定义（客户端模拟，全部可序列化） */

export type Side = "farmer" | "hunter";
export type Difficulty = "easy" | "normal" | "hard";
export type DurationMin = 30 | 40 | 50;
export type Phase = "hide" | "expand" | "reversal" | "over";
export type Stance = "follow" | "guard" | "attack";
export type Terrain = "grass" | "bush" | "tree" | "rock" | "water" | "flower";

export type UnitKind =
  | "farmerHero"
  | "lumberjack"
  | "militia"
  | "archer"
  | "golem"
  | "hunterHero"
  | "shadowScout"
  | "trollSlinger"
  | "frostShaman"
  | "sheep"
  | "pig"
  | "owl"
  | "eyeWard";

export type BuildingKind =
  | "sheepFarm"
  | "pigFarm"
  | "woodWall"
  | "stoneWall"
  | "arrowTower"
  | "cannonTower"
  | "mageTower"
  | "watchTower"
  | "tavern"
  | "warehouse"
  | "poisonTower"
  | "cheeseShop"
  | "shadowNest"
  | "bombHut";

export type SkillId = "eye" | "slam" | "sentinel";
export type ItemKind = "spray" | "cdScroll" | "regen" | "dust" | "bomb";
export type UpgradeKind = "bounty" | "atk" | "def";

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
  farmerCamp: Vec;
  hunterCamp: Vec;
  /** 候选藏匿空地（像素坐标） */
  groves: Vec[];
  patrol: Vec[];
};

export type Unit = {
  id: string;
  side: Side;
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
  pop: number;
  produceTimer: number;
  lumber: number;
  chopTarget: TilePos | null;
  chopTimer: number;
  bounty: number;
  homeX: number;
  homeY: number;
  expiresAt: number;
  canSiege: boolean;
  animSeed: number;
};

export type Building = {
  id: string;
  side: Side;
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
};

export type Projectile = {
  id: string;
  side: Side;
  x: number;
  y: number;
  targetId: string;
  targetBuilding: boolean;
  speed: number;
  damage: number;
  aoe: number;
  slowFactor: number;
  slowUntil: number;
  poisonUntil: number;
  color: number;
  ttl: number;
};

export type GameEventKind =
  | "info"
  | "phase"
  | "kill"
  | "build"
  | "hire"
  | "skill"
  | "item"
  | "hit"
  | "death"
  | "win";

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

export type AIState = {
  think: number;
  anchor: number;
  base: Vec | null;
  nextEyeAt: number;
  pushAt: number;
  nextBuyAt: number;
};

export type VisionState = {
  farmer: Uint8Array;
  hunter: Uint8Array;
};

export type GameState = {
  version: 1;
  seed: number;
  map: GameMap;
  side: Side;
  difficulty: Difficulty;
  durationMin: DurationMin;
  /** 已模拟的秒数 */
  time: number;
  phase: Phase;
  result: GameResult | null;
  gold: Record<Side, number>;
  wood: Record<Side, number>;
  vision: VisionState;
  units: Unit[];
  buildings: Building[];
  projectiles: Projectile[];
  skillCd: Record<Side, Record<SkillId, number>>;
  stock: Record<Side, Record<ItemKind, number>>;
  upgrades: Record<Side, Record<UpgradeKind, boolean>>;
  reveal: { x: number; y: number; r: number; until: number }[];
  rally: Record<Side, Vec | null>;
  events: GameEvent[];
  eventSeq: number;
  stats: Record<Side, SideStats>;
  ai: Record<Side, AIState>;
  hunterReinforced: boolean;
  playerHeroId: string;
  nextId: number;
  visionAt: number;
  popUsed: Record<Side, number>;
};

export type Command =
  | { t: "move"; x: number; y: number }
  | { t: "stance"; stance: Stance }
  | { t: "rally"; x: number; y: number }
  | { t: "build"; kind: BuildingKind; tx: number; ty: number }
  | { t: "sell"; id: string }
  | { t: "skill"; skill: SkillId; x: number; y: number }
  | { t: "hire"; unit: UnitKind }
  | { t: "use"; item: ItemKind }
  | { t: "upgrade"; kind: UpgradeKind };

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
