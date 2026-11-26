// 「新巨魔与精灵」的核心类型定义。参照 WC3 原作：精灵为英雄单位，靠帐篷产金、
// 小精灵伐木；巨魔靠拆建筑得金、小屋被动收入，并在商店购买装备。

export type Faction = "elf" | "troll";
export type Difficulty = "easy" | "normal" | "hard";
/** 原作模式：经典 / 快攻 / 单挑 / 团队 / 生存 */
export type GameMode = "old" | "fast" | "solo" | "team" | "run";
/** 原作规则：单巨魔 / 双巨魔（死亡后变幽灵狼） */
export type TrollRule = "single" | "double";
export type GameResult = "win" | "lose" | null;

export type BuildingKind =
  // 精灵
  | "tree" // 生命之树
  | "tent" // 帐篷（产金）
  | "goldmine" // 金矿（小精灵所化）
  | "workshop" // 工人雇佣所
  | "lab" // 塔研究所
  | "wall" // 普通墙（升级后选择方向）
  | "grasswall" // 草墙
  | "stone" // 岩石墙
  | "concrete" // 水泥墙
  | "thorn" // 荆棘墙
  | "icewall" // 冰墙
  | "watch" // 预警哨
  | "arrow" // 箭塔（普通塔）
  | "goldtower" // 产金塔
  | "gun" // 火枪塔
  | "poison" // 毒塔
  | "ice" // 冰塔
  | "moon" // 银月塔
  // 巨魔
  | "hut"; // 巨魔小屋

/** 巨魔商店条目 */
export type ShopKey = "weapon" | "gloves" | "boots" | "armor" | "vitality" | "regen";
/** 精灵技能 */
export type ElfSkill = "blink" | "haste" | "entangle" | "silence" | "wallguard";
/** 巨魔技能 */
export type TrollSkill = "windwalk" | "berserk" | "recall";

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

/** 本局可采集的树木（带木材存量） */
export interface ForestTree extends TreeProp {
  wood: number;
}

export type RoomSide = "north" | "south" | "east" | "west";

export interface RoomTile {
  gx: number;
  gy: number;
}

/** 房间入口：2 格宽，放一块墙即留出精灵能过、巨魔过不去的缝 */
export interface RoomGate {
  gx: number;
  gy: number;
  gx2: number;
  gy2: number;
  side: RoomSide;
}

/** 精灵房间：四周由不可建造的地形围墙包围，留 3 个 2 格宽入口需要玩家用墙堵住 */
export interface RoomInfo {
  siteId: number;
  /** 外墙包围盒（格，含端点） */
  gx0: number;
  gy0: number;
  gx1: number;
  gy1: number;
  /** 3 个入口，gates[0] 为朝地图中心的主入口 */
  gates: RoomGate[];
  /** 主入口朝向 */
  side: RoomSide;
  /** 所有不可通行的外围墙体格（不含入口） */
  walls: RoomTile[];
}

export interface MapData {
  trees: TreeProp[];
  rocks: RockProp[];
  rooms: RoomInfo[];
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

export interface InputState {
  mx: number;
  my: number;
  /** 手动攻击：隐身状态下会立刻显形并打出一次普通攻击 */
  attack?: boolean;
}

export interface GameStats {
  /** 巨魔击杀单位数 */
  kills: number;
  /** 巨魔摧毁建筑数 */
  destroyed: number;
  goldEarned: number;
  woodGathered: number;
}

export interface Building {
  id: number;
  kind: BuildingKind;
  /** 所属精灵 id；巨魔建筑为巨魔 id */
  owner: number;
  team: Faction;
  /** 左上角格子 */
  gx: number;
  gy: number;
  size: number;
  /** 中心（世界单位） */
  x: number;
  y: number;
  level: number;
  hp: number;
  maxHp: number;
  /** 建造动画剩余时间（秒），大于 0 时尚未生效 */
  spawn: number;
  /** 施工总时长与剩余时间（秒），buildTimer 大于 0 时建筑尚未建成 */
  buildTime: number;
  buildTimer: number;
  /** 攻击冷却 */
  cd: number;
  /** 通用计时器（生命之树产小精灵等） */
  timer: number;
  /** 受击闪白时间 */
  flash: number;
  alive: boolean;
  /** 玩家手动持续维修中（免费） */
  repairing: boolean;
  /** 累计投入，用于拆除返还 */
  spentGold: number;
  spentWood: number;
  /** 收入累计与弹字计时（帐篷/金矿） */
  incomeAcc: number;
  incomeTimer: number;
  /** 无敌剩余时间（精灵“墙无敌”技能） */
  invuln: number;
}

export interface Elf {
  id: number;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  gold: number;
  wood: number;
  alive: boolean;
  isPlayer: boolean;
  treeId: number;
  flash: number;
  /** 死亡后单位消失倒计时 */
  deadTimer: number;
  /** 已购买木材次数（价格递增） */
  woodBuys: number;
  /** 是否开启自动维修（空闲时自动前往最近的受损建筑） */
  autoRepair: boolean;
  /** 移动加速剩余时间 */
  hasteTime: number;
  /** 当前正在维修/前往维修的建筑 id，-1 表示没有 */
  repairTarget: number;
  /** 当前维修目标是否由自动维修选出（关闭自动维修时清除） */
  repairAuto: boolean;
  cooldowns: Record<ElfSkill, number>;
}

export interface Troll {
  id: number;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  gold: number;
  alive: boolean;
  isPlayer: boolean;
  /** 是否已变成幽灵狼（双巨魔规则） */
  wolf: boolean;
  /** 复活/变狼倒计时 */
  reviveTimer: number;
  cd: number;
  flash: number;
  swing: number;
  slowTime: number;
  slowPower: number;
  /** 被缠绕/眩晕剩余时间 */
  stunTime: number;
  /** 中毒剩余时间与每秒伤害 */
  poisonTime: number;
  poisonDps: number;
  /** 疾风步剩余时间 */
  windwalk: number;
  windwalkCd: number;
  recallCd: number;
  /** 被沉默剩余时间（无法施法） */
  silenceTime: number;
  /** 狂暴剩余时间（攻速与攻击力提升） */
  berserkTime: number;
  /** 狂暴冷却 */
  berserkCd: number;
  /** 回城读条剩余时间，大于 0 表示正在读条（可被打断） */
  recallChannel: number;
  /** 回城卷轴数量（不可打断） */
  recallScrolls: number;
  items: Record<ShopKey, number>;
  hutId: number;
  regenAcc: number;
  /** AI 目标 */
  targetBuilding: number;
  targetElf: number;
  decideTimer: number;
  path: Point[] | null;
  pathTimer: number;
  lastX: number;
  lastY: number;
  stuck: number;
}

export interface Wisp {
  id: number;
  owner: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  phase: "seek" | "harvest" | "return";
  forest: number;
  timer: number;
  carry: number;
  flash: number;
}

export interface Repairer {
  id: number;
  owner: number;
  x: number;
  y: number;
  targetId: number;
  timer: number;
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

export interface Projectile {
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  kind: "arrow" | "goldtower" | "gun" | "poison" | "ice" | "moon";
}

export interface Hint {
  text: string;
  t: number;
}

export interface AiState {
  elfTimer: number;
  trollTimer: number;
}

export interface GameState {
  faction: Faction;
  difficulty: Difficulty;
  mode: GameMode;
  rule: TrollRule;
  time: number;
  result: GameResult;
  elves: Elf[];
  trolls: Troll[];
  buildings: Building[];
  wisps: Wisp[];
  repairers: Repairer[];
  /** 本局森林（木材可被采集） */
  forest: ForestTree[];
  effects: Fx[];
  floats: FloatText[];
  shots: Projectile[];
  hint: Hint | null;
  shake: number;
  stats: GameStats;
  /** 黑夜剩余时间（精灵技能制造） */
  nightTimer: number;
  /** 精灵暴露视野剩余时间（帐篷全毁触发，重建后仍持续一段时间） */
  revealTimer: number;
  /** 玩家控制的精灵下标；玩家为巨魔时为 -1 */
  playerElf: number;
  /** 玩家控制的巨魔下标；玩家为精灵时为 -1 */
  playerTroll: number;
  /** 木材购买价格 */
  woodPrice: number;
  /** 生存模式胜利时间（秒），其它模式为 null */
  surviveTime: number | null;
  sfx: string[];
  nextId: number;
  ai: AiState;
}
