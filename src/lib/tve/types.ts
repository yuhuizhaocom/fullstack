// 「巨魔 VS 精灵」独立小游戏的核心类型定义。

export type Faction = "elf" | "troll";
export type Difficulty = "easy" | "normal" | "hard";
export type GameResult = "win" | "lose" | null;

export type BuildingKind = "tree" | "mine" | "wall" | "arrow" | "magic";
export type UpgradeTrack = "claw" | "swift" | "hide";

export interface Point {
  x: number;
  y: number;
}

/** 地图上的静态树木（圆形碰撞体，坐标是世界单位） */
export interface TreeProp {
  x: number;
  y: number;
  r: number;
  variant: number;
}

/** 地图上的静态岩石 */
export interface RockProp {
  x: number;
  y: number;
  r: number;
  variant: number;
}

export interface MapData {
  trees: TreeProp[];
  rocks: RockProp[];
}

export interface Base {
  id: number;
  name: string;
  /** 基地中心（世界单位） */
  x: number;
  y: number;
  /** 基地中心（格子坐标） */
  tx: number;
  ty: number;
  alive: boolean;
  isPlayer: boolean;
  gold: number;
  /** 金矿收入计时器 */
  incomeTimer: number;
  treeId: number;
}

export interface Building {
  id: number;
  kind: BuildingKind;
  baseId: number;
  /** 左上角格子 */
  gx: number;
  gy: number;
  /** 中心（世界单位） */
  x: number;
  y: number;
  level: number;
  hp: number;
  maxHp: number;
  /** 建造动画剩余时间（秒），大于 0 时尚未生效 */
  spawn: number;
  /** 攻击冷却 */
  cd: number;
  /** 受击闪白时间 */
  flash: number;
  alive: boolean;
  /** 累计投入金币，用于拆除返还 */
  spent: number;
}

export interface Villager {
  id: number;
  baseId: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  respawn: number;
  wanderTimer: number;
  tx: number;
  ty: number;
  flash: number;
}

export interface Troll {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  gold: number;
  /** 攻击冷却 */
  cd: number;
  /** 受击闪白 */
  flash: number;
  /** 挥击动画计时 */
  swing: number;
  rushCd: number;
  rushTime: number;
  /** 被魔法塔减速的剩余时间 */
  slowTime: number;
  /** 减速强度（0-1） */
  slowPower: number;
  claw: number;
  swift: number;
  hide: number;
  regenAcc: number;
  lootAcc: number;
  /** 为 true 时是 AI 控制 */
  ai: boolean;
}

export interface FloatText {
  x: number;
  y: number;
  t: number;
  dur: number;
  text: string;
  color: string;
  size: number;
}

export type FxKind = "slash" | "boom" | "heal" | "dust" | "ring" | "spark";

export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  t: number;
  dur: number;
  radius: number;
  angle: number;
  color: string;
}

export interface Arrow {
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  magic: boolean;
}

export interface Hint {
  text: string;
  t: number;
}

export interface GameStats {
  kills: number;
  destroyed: number;
  goldEarned: number;
}

export interface AiState {
  elfTimer: number;
  trollTimer: number;
  targetBase: number;
  waypoint: number;
  path: Point[] | null;
  pathTimer: number;
  stuck: number;
  lastX: number;
  lastY: number;
  decisionTimer: number;
}

export interface GameState {
  faction: Faction;
  difficulty: Difficulty;
  time: number;
  result: GameResult;
  bases: Base[];
  buildings: Building[];
  villagers: Villager[];
  troll: Troll;
  /** 白天/夜晚 */
  night: boolean;
  /** 当前阶段剩余秒数 */
  dayTimer: number;
  cycle: number;
  effects: Fx[];
  floats: FloatText[];
  arrows: Arrow[];
  hint: Hint | null;
  shake: number;
  stats: GameStats;
  ai: AiState;
  /** 玩家控制的精灵基地；玩家为巨魔时为 -1 */
  playerBase: number;
  /** 本帧产生的音效，由组件读取后清空 */
  sfx: string[];
  nextId: number;
}

export interface InputState {
  /** 归一化后的移动方向 */
  mx: number;
  my: number;
  rush: boolean;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface BuildCheck {
  ok: boolean;
  reason?: string;
}
