// AI perception: current vision plus explored building memory. Never reads the full map.

import { BUILDINGS } from "../config";
import type { Building, Faction, GameState, Hero } from "../types";
import { buildingVisionRadius, heroVisionRadius } from "../vision";

export interface Perception {
  visibleEnemies(): Hero[];
  visibleBuildings(): Building[];
  exploredResources(): Building[];
  canSee(x: number, y: number): boolean;
}

interface VisionSource {
  x: number;
  y: number;
  radius: number;
}

function buildingSight(building: Building): number {
  const def = BUILDINGS[building.kind];
  const spec = def?.levels[building.level - 1];
  return buildingVisionRadius(spec?.range ?? 0, def?.sight?.[building.level - 1] ?? 0);
}

function visionSources(state: GameState, faction: Faction): VisionSource[] {
  const sources: VisionSource[] = [];
  for (const hero of state.heroes) {
    if (hero.faction !== faction || !hero.alive) continue;
    sources.push({ x: hero.x, y: hero.y, radius: heroVisionRadius(hero) });
  }
  for (const building of state.buildings) {
    if (building.faction !== faction || !building.alive) continue;
    sources.push({ x: building.x, y: building.y, radius: buildingSight(building) });
  }
  return sources;
}

function isExposedElf(state: GameState, faction: Faction, hero: Hero): boolean {
  if (faction !== "troll" || hero.faction !== "elf" || !state.elfExposed) return false;
  return !state.buildings.some((building) => building.alive && building.faction === "elf" && building.kind === "tent");
}

function canSourceSee(sources: VisionSource[], x: number, y: number): boolean {
  return sources.some((source) => Math.hypot(x - source.x, y - source.y) <= source.radius);
}

function heroVisible(state: GameState, faction: Faction, hero: Hero, sources: VisionSource[]): boolean {
  if (!hero.alive || hero.faction === faction) return false;
  if (hero.buffs.revealed > 0) return true;
  if (hero.buffs.windwalk > 0) return false;
  if (isExposedElf(state, faction, hero)) return true;
  return canSourceSee(sources, hero.x, hero.y);
}

export function visibleEnemiesForFaction(state: GameState, faction: Faction): Hero[] {
  const sources = visionSources(state, faction);
  return state.heroes.filter((hero) => heroVisible(state, faction, hero, sources));
}

export function visibleBuildingsForFaction(state: GameState, faction: Faction): Building[] {
  const sources = visionSources(state, faction);
  return state.buildings.filter(
    (building) => building.alive && building.faction !== faction && canSourceSee(sources, building.x, building.y),
  );
}

export function createPerception(state: GameState, faction: Faction): Perception {
  const sources = visionSources(state, faction);
  const enemies = visibleEnemiesForFaction(state, faction);
  const buildings = visibleBuildingsForFaction(state, faction);

  const isAiFaction = faction !== state.playerFaction;
  if (isAiFaction && enemies.length) {
    const seen = enemies[0];
    state.aiMemory.lastSeen = { x: seen.x, y: seen.y };
  }
  if (isAiFaction) {
    for (const building of buildings) {
      if (!state.aiMemory.buildingIds.includes(building.id)) state.aiMemory.buildingIds.push(building.id);
    }
  }

  return {
    visibleEnemies: () => enemies,
    visibleBuildings: () => buildings,
    exploredResources: () => state.buildings.filter(
      (building) => building.alive && building.faction !== faction && state.aiMemory.buildingIds.includes(building.id),
    ),
    canSee: (x, y) => canSourceSee(sources, x, y),
  };
}