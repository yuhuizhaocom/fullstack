// tve4 全新规则层：实体与状态类型。

export type Faction = "elf" | "troll";

export type BuildKind = "wall" | "tower" | "mine" | "tent";

export type SkillKey =
  | "blink"
  | "haste"
  | "entangle"
  | "silence"
  | "windwalk"
  | "berserk"
  | "teleport";

export interface Buffs {
  haste: number;
  windwalk: number;
  berserk: number;
  root: number;
  silence: number;
}

export interface Hero {
  id: number;
  faction: Faction;
  isPlayer: boolean;
  alive: boolean;
  lives: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  flash: number;
  hp: number;
  maxHp: number;
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
  flash: number;
  cd: number;
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

export interface GameState {
  testMode: boolean;
  sharedVision: boolean;
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
