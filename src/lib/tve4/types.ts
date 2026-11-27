// tve4 全新规则层：实体与状态类型。

import type { SessionContext } from "./sim/session";
import type { Rng } from "./sim/rng";

export type Faction = "elf" | "troll";

export type BuildKind =
  | "wall"
  | "tower"
  | "mine"
  | "tent"
  | "market"
  | "reveal"
  | "lumberCamp"
  | "trollHouse";

export type Rule =
  | "SINGLE"
  | "DOUBLE"
  | "FIX"
  | "RACE"
  | "DEFEND"
  | "SOLO"
  | "DUET"
  | "SURVIVE"
  | "REVIVE";

export type Mode = "OLD" | "BALANCE" | "FAST" | "MIDDLE";

export interface GameOptions {
  mode?: Mode;
  rule?: Rule;
  testMode?: boolean;
  playerFaction?: Faction;
  mapId?: number;
  seed?: number;
  catalogVersion?: string;
  heroModelId?: string | null;
}

export type SkillKey =
  | "blink"
  | "haste"
  | "entangle"
  | "silence"
  | "windwalk"
  | "berserk"
  | "teleport"
  | "farSight";

export interface Buffs {
  haste: number;
  windwalk: number;
  berserk: number;
  root: number;
  silence: number;
  revealed: number;
}

export interface Hero {
  id: number;
  faction: Faction;
  isPlayer: boolean;
  isWolf: boolean;
  isAlly: boolean;
  alive: boolean;
  lives: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  flash: number;
  invuln: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  manaRegen: number;
  damage: number;
  interval: number;
  range: number;
  speed: number;
  radius: number;
  cd: number;
  channelTime: number;
  deathTimer: number;
  gold: number;
  wood: number;
  items: string[];
  itemLevels: Record<string, number>;
  bonusIncome: number;
  bonusLifesteal: number;
  cooldowns: Record<SkillKey, number>;
  buffs: Buffs;
}

export interface Building {
  id: number;
  kind: BuildKind;
  faction: Faction;
  x: number;
  y: number;
  gx0: number;
  gy0: number;
  size: number;
  level: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  buildTimer: number;
  demolishTimer: number;
  eyeMarked: number;
  repairing: boolean;
  flash: number;
  cd: number;
  system?: boolean;
}

export interface Projectile {
  id: number;
  faction: Faction;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  damage: number;
  t: number;
}

export interface Effect {
  x: number;
  y: number;
  radius: number;
  color: string;
  t: number;
  dur: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  t: number;
  dur: number;
}

export interface Hint {
  text: string;
  t: number;
}

export interface InputState {
  mx: number;
  my: number;
  aim?: { x: number; y: number } | null;
}

export interface AiMemory {
  lastSeen: { x: number; y: number } | null;
  buildingIds: number[];
}

export interface GameState {
  mode: Mode;
  rule: Rule;
  mapId: number;
  seed: number;
  catalogVersion: string;
  session: SessionContext;
  rng: Rng;
  aiMemory: AiMemory;
  appearance: { heroModelId: string | null };
  playerFaction: Faction;
  testMode: boolean;
  trollStrength: number;
  mobileDev: boolean;
  mageSummoned: boolean;
  /** VERIFIED：OldEndLock 互斥锁，先触发者封印对方的终结条件。 */
  endLock: "elf" | "troll" | null;
  relocateCd: number;
  aiPath: Array<{ x: number; y: number }>;
  aiPathIdx: number;
  pathTimer: number;
  stuckX: number;
  stuckY: number;
  stuckTimer: number;
  elfShared: boolean;
  elfExposed: boolean;
  woodPriceIn: number;
  woodPriceOut: number;
  time: number;
  phase: "prep" | "battle" | "over";
  result: "win" | "lose" | null;
  heroes: Hero[];
  buildings: Building[];
  projectiles: Projectile[];
  effects: Effect[];
  floats: FloatText[];
  hint: Hint | null;
  blocked: Uint8Array;
  trollSpawned: boolean;
  incomeAcc: number;
  aiTimer: number;
  nextId: number;
  stats: { kills: number; destroyed: number; goldEarned: number; damage: number };
}

export interface Interaction {
  placing: BuildKind | null;
  selectedId: number | null;
  hover: { x: number; y: number } | null;
  gx: number;
  gy: number;
  valid: boolean;
}
