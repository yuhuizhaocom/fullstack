import { TILE } from "./config";
import { ruleNumber } from "./data/mvp-rules";
import { RULES } from "./rules";
import type { Faction, Hero } from "./types";

export const HERO_VISION_SCALE = 0.8;
export const BUILDING_VISION_TILES = 4;
export const FOG_CLEAR_RATIO = 0.2;

export function heroVisionRadius(hero: Hero): number {
  return ruleNumber(hero.faction, "originalSight") * RULES.scale * HERO_VISION_SCALE;
}

export function buildingVisionRadius(range = 0): number {
  return Math.max(BUILDING_VISION_TILES * TILE, range);
}

export function fogDisplaySize(
  visionRadius: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const clearRadius = Math.max(1, visionRadius * zoom);
  const visionSize = (clearRadius * 2) / FOG_CLEAR_RATIO;
  const coverSize = Math.hypot(viewportWidth, viewportHeight) * 2.1;
  return Math.max(visionSize, coverSize);
}

export function isEntityVisibleToPlayer(
  faction: Faction,
  playerFaction: Faction,
  visibleIds: ReadonlySet<number>,
  id: number,
): boolean {
  return faction === playerFaction || visibleIds.has(id);
}
