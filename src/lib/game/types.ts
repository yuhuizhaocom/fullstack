export type ClassId = "warrior" | "mage" | "ranger" | "priest";

export type Stats = {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  /** 暴击率百分比 */
  crit: number;
  /** 冷却缩减百分比（英雄联盟风格） */
  cdr: number;
  /** 吸血百分比 */
  lifesteal: number;
};

export type ClassDef = {
  id: ClassId;
  name: string;
  icon: string;
  desc: string;
  base: Stats;
  growth: Stats;
  /** 初始武器 */
  weapon: string;
};

export type SkillKey = "Q" | "W" | "E" | "R";

export type SkillKind =
  | "damage"
  | "heal"
  | "buff"
  | "guard"
  | "aoe"
  | "execute"
  | "dash"
  | "slow";

export type SkillDef = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  mp: number;
  /** 解锁等级 */
  level: number;
  kind: SkillKind;
  /** 英雄联盟风格的 Q/W/E/R 键位 */
  key?: SkillKey;
  /** 冷却时间（秒） */
  cooldown?: number;
  /** 施法距离（像素） */
  range?: number;
  /** 影响半径（像素） */
  radius?: number;
  /** 位移距离（像素） */
  dashDistance?: number;
  /** 减速持续时间（毫秒） */
  slowMs?: number;
  /** 伤害倍率（damage） */
  multiplier?: number;
  /** 段数（damage） */
  hits?: number;
  alwaysCrit?: boolean;
  /** 回复最大生命比例（heal） */
  healRatio?: number;
  /** 攻击提升百分比（buff） */
  buffAtk?: number;
  buffTurns?: number;
  /** 减伤百分比（guard） */
  reduction?: number;
};

export type ItemKind =
  | "consumable"
  | "material"
  | "weapon"
  | "armor"
  | "boots"
  | "accessory";

export type ItemDef = {
  id: string;
  name: string;
  icon: string;
  kind: ItemKind;
  desc: string;
  /** 商店买价；材料为出售价 */
  price: number;
  hp?: number;
  mp?: number;
  atk?: number;
  def?: number;
  spd?: number;
  crit?: number;
  maxHp?: number;
  maxMp?: number;
  cdr?: number;
  lifesteal?: number;
  classId?: ClassId;
  level?: number;
};

export type PetDef = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  price: number;
  atk: number;
  crit: number;
  /** 每回合为玩家回复最大生命比例（水灵） */
  healRatio?: number;
};

export type PetSave = {
  id: string;
  level: number;
  exp: number;
};

export type EnemySkill = {
  name: string;
  multiplier: number;
  /** 使用概率 0-1 */
  chance: number;
};

export type EnemyDef = {
  id: string;
  name: string;
  icon: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  exp: number;
  gold: number;
  skills: EnemySkill[];
  drops: { itemId: string; chance: number }[];
};

export type DungeonDef = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  level: number;
  unlockLevel: number;
  map: string[];
  enemies: string[];
  boss: string;
};

export type Equipment = {
  weapon: string | null;
  armor: string | null;
  boots: string | null;
  accessory: string | null;
};

export type QuestSaveEntry = {
  progress: number;
  status: "active" | "complete" | "turnedIn";
};

export type GameSave = {
  version: 1;
  name: string;
  classId: ClassId;
  level: number;
  exp: number;
  gold: number;
  hp: number;
  mp: number;
  /** 已含升级成长的基础属性，不含装备 */
  stats: Stats;
  equipment: Equipment;
  inventory: Record<string, number>;
  pets: PetSave[];
  activePet: string | null;
  /** 已击败 BOSS 的副本 */
  cleared: string[];
  wins: number;
  createdAt: number;
  /** 任务进度（可选，兼容旧存档） */
  quests?: Record<string, QuestSaveEntry>;
};

export type BattleState = {
  dungeonId: string;
  enemy: EnemyDef;
  enemyHp: number;
  enemyMaxHp: number;
  kind: "normal" | "boss";
  turn: number;
  log: string[];
  buff: { atk: number; turns: number } | null;
  guard: { reduction: number; turns: number } | null;
  finished: boolean;
  victory: boolean;
  rewards: { exp: number; gold: number; items: string[] };
};

export type DungeonRun = {
  id: string;
  x: number;
  y: number;
  /** 当前探索中的地图（宝箱拾取后会变化） */
  tiles: string[];
};

export type Tab = "adventure" | "character" | "bag" | "skills" | "pet" | "shop";
