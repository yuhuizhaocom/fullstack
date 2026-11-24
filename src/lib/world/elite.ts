export type EliteAffix = "frenzy" | "tough" | "swift";

export const ELITE_AFFIX_LABEL: Record<EliteAffix, string> = {
  frenzy: "狂暴",
  tough: "坚甲",
  swift: "迅捷",
};

export const ELITE_AFFIX_DESC: Record<EliteAffix, string> = {
  frenzy: "攻击力大幅提高",
  tough: "生命与护甲大幅提高",
  swift: "移动速度大幅提高",
};

export const ELITE_AFFIXES: EliteAffix[] = ["frenzy", "tough", "swift"];

/** 精英出现概率（普通怪） */
export const ELITE_CHANCE = 0.12;

/** 精英相对普通怪的成长倍率 */
export const ELITE_SCALE = {
  hp: 1.8,
  atk: 1.25,
  def: 1.3,
  speed: 1.05,
  exp: 1.8,
  gold: 2,
} as const;
