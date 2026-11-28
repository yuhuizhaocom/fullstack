import type { SkillKey } from "./types";

export interface AutoActionOptions {
  upgradeTent: boolean;
  upgradeWall: boolean;
  repair: boolean;
  skills: readonly SkillKey[];
}

export type AutoRepairStatus = "unavailable" | "queued" | "started";

export interface AutoActionCallbacks {
  upgradeTent: () => boolean;
  tentNeedsWall: () => boolean;
  upgradeWall: () => boolean;
  repair: () => AutoRepairStatus;
  castSkill: (key: SkillKey) => boolean;
}

export interface AutoActionResult {
  upgrades: ("tent" | "wall")[];
  repaired: boolean;
  repairStatus: AutoRepairStatus;
  skills: SkillKey[];
}

export function runAutoActions(options: AutoActionOptions, callbacks: AutoActionCallbacks): AutoActionResult {
  const upgrades: AutoActionResult["upgrades"] = [];
  const skills: SkillKey[] = [];
  if (options.upgradeTent && callbacks.upgradeTent()) upgrades.push("tent");
  if (options.upgradeWall && callbacks.tentNeedsWall() && callbacks.upgradeWall()) upgrades.push("wall");
  const repairStatus = options.repair ? callbacks.repair() : "unavailable";
  for (const key of options.skills) {
    if (callbacks.castSkill(key)) skills.push(key);
  }
  return { upgrades, repaired: repairStatus === "started", repairStatus, skills };
}
