import type { SkillKey } from "./types";

export interface AutoActionOptions {
  upgradeTent: boolean;
  upgradeWall: boolean;
  skills: readonly SkillKey[];
}

export interface AutoActionCallbacks {
  upgradeTent: () => boolean;
  tentNeedsWall: () => boolean;
  upgradeWall: () => boolean;
  castSkill: (key: SkillKey) => boolean;
}

export interface AutoActionResult {
  upgrades: ("tent" | "wall")[];
  skills: SkillKey[];
}

export function runAutoActions(options: AutoActionOptions, callbacks: AutoActionCallbacks): AutoActionResult {
  const upgrades: AutoActionResult["upgrades"] = [];
  const skills: SkillKey[] = [];
  if (options.upgradeTent && callbacks.upgradeTent()) upgrades.push("tent");
  if (options.upgradeWall && (!options.upgradeTent || callbacks.tentNeedsWall()) && callbacks.upgradeWall()) upgrades.push("wall");
  for (const key of options.skills) {
    if (callbacks.castSkill(key)) skills.push(key);
  }
  return { upgrades, skills };
}
