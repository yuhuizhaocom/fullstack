import { BUILDINGS, TILE } from "./config";
import { distanceToFootprint, REPAIR_RANGE } from "./engine";
import { RULES } from "./rules";
import { createPathingGrid, findGridPath, isWorldPositionFree, isWorldSegmentClear, type PathingGrid } from "./sim/pathing";
import type { BuildKind, Building, GameState, Hero } from "./types";

const BUILD_APPROACH_RANGE = 3 * TILE;

export type PlayerActionSource = "manual" | "auto";

export type PlayerActionIntent =
  | { type: "build"; kind: BuildKind; gx: number; gy: number; source: PlayerActionSource }
  | { type: "repair"; kind: BuildKind; buildingId: number; source: PlayerActionSource };

export type PlayerActionPhase = "idle" | "moving" | "executing" | "blocked" | "cancelled";

export interface PlayerActionSnapshot {
  phase: PlayerActionPhase;
  label: string;
  reason?: string;
  intent: PlayerActionIntent | null;
  lastResult: "started" | "unavailable" | null;
}

export interface PlayerActionCallbacks {
  canBuild: (state: GameState, kind: BuildKind, gx: number, gy: number) => { ok: boolean; reason: string };
  build: (state: GameState, kind: BuildKind, gx: number, gy: number) => boolean;
  canRepair: (state: GameState, buildingId: number) => { ok: boolean; reason: string };
  repair: (state: GameState, buildingId: number) => boolean;
}

export interface PlayerActionController {
  enqueue(state: GameState, intent: PlayerActionIntent): PlayerActionSnapshot;
  direction(state: GameState): { mx: number; my: number };
  afterStep(state: GameState): PlayerActionSnapshot;
  cancel(reason?: string): PlayerActionSnapshot;
  cancelAuto(): PlayerActionSnapshot;
  snapshot(): PlayerActionSnapshot;
}

function playerOf(state: GameState): Hero | null {
  return state.heroes.find((hero) => hero.isPlayer && hero.alive) ?? null;
}

function pathingGrid(state: GameState): PathingGrid {
  const { pathing, grid } = state.session;
  return createPathingGrid(
    state.session.pathing32,
    pathing.width,
    pathing.height,
    pathing.cellUnits,
    pathing.origin,
    grid.bounds,
    grid.world,
    RULES.scale,
  );
}

function underConstruction(building: Building): boolean {
  return building.level === 1 && building.buildTimer > 0;
}

function cellWalkable(state: GameState, gx: number, gy: number, faction: Hero["faction"]): boolean {
  const { width, height } = state.session.grid;
  if (gx < 0 || gy < 0 || gx >= width || gy >= height) return false;
  if (state.blocked[gy * width + gx] !== 0) return false;
  for (const building of state.buildings) {
    if (!building.alive || underConstruction(building) || (building.system && building.faction === faction)) continue;
    if (gx >= building.gx0 && gx < building.gx0 + building.size && gy >= building.gy0 && gy < building.gy0 + building.size) return false;
  }
  return true;
}

function actionTarget(state: GameState, intent: PlayerActionIntent): { x: number; y: number; size: number; range: number; gx0: number; gy0: number } | null {
  if (intent.type === "build") {
    const size = BUILDINGS[intent.kind].size;
    return {
      x: (intent.gx + size / 2) * TILE,
      y: (intent.gy + size / 2) * TILE,
      size,
      range: BUILD_APPROACH_RANGE,
      gx0: intent.gx,
      gy0: intent.gy,
    };
  }
  const building = state.buildings.find((entry) => entry.id === intent.buildingId && entry.alive);
  return building
    ? { x: building.x, y: building.y, size: building.size, range: REPAIR_RANGE, gx0: building.gx0, gy0: building.gy0 }
    : null;
}

function clearSegment(grid: PathingGrid, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return isWorldSegmentClear(grid, from.x, from.y, to.x, to.y);
}

function findApproachPath(state: GameState, hero: Hero, intent: PlayerActionIntent): Array<{ x: number; y: number }> | null {
  const target = actionTarget(state, intent);
  if (!target) return null;
  if (distanceToFootprint(hero, target) <= target.range) return [];
  const grid = pathingGrid(state);
  const start = { gx: Math.floor(hero.x / TILE), gy: Math.floor(hero.y / TILE) };
  for (let ring = 0; ring <= 8; ring += 1) {
    for (let dy = -ring; dy <= target.size + ring; dy += 1) {
      for (let dx = -ring; dx <= target.size + ring; dx += 1) {
        if (ring > 0 && dx !== -ring && dx !== target.size + ring - 1 && dy !== -ring && dy !== target.size + ring - 1) continue;
        const gx = target.gx0 + dx;
        const gy = target.gy0 + dy;
        if (gx >= target.gx0 && gx < target.gx0 + target.size && gy >= target.gy0 && gy < target.gy0 + target.size) continue;
        if (!cellWalkable(state, gx, gy, hero.faction)) continue;
        const point = { x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE };
        if (!isWorldPositionFree(grid, point.x, point.y, hero.radius)) continue;
        if (distanceToFootprint({ ...hero, x: point.x, y: point.y }, target) > target.range) continue;
        const cells = findGridPath({
          width: state.session.grid.width,
          height: state.session.grid.height,
          start,
          goal: { gx, gy },
          isWalkable: (x, y) => cellWalkable(state, x, y, hero.faction),
        });
        if (start.gx === gx && start.gy === gy) {
          return clearSegment(grid, hero, point) ? [] : null;
        }
        if (!cells.length) continue;
        const path = cells.map((cell) => ({ x: (cell.gx + 0.5) * TILE, y: (cell.gy + 0.5) * TILE }));
        let from: { x: number; y: number } = hero;
        let valid = true;
        for (const waypoint of path) {
          if (!clearSegment(grid, from, waypoint)) {
            valid = false;
            break;
          }
          from = waypoint;
        }
        if (valid) return path;
      }
    }
  }
  return null;
}

export function createPlayerActionController(callbacks: PlayerActionCallbacks): PlayerActionController {
  let phase: PlayerActionPhase = "idle";
  let intent: PlayerActionIntent | null = null;
  let path: Array<{ x: number; y: number }> = [];
  let pathIndex = 0;
  let reason: string | undefined;
  let lastResult: PlayerActionSnapshot["lastResult"] = null;

  const snapshot = (): PlayerActionSnapshot => ({
    phase,
    label: intent?.type === "build" ? `建造${BUILDINGS[intent.kind].label}` : intent ? "维修建筑" : "玩家操作",
    reason,
    intent,
    lastResult,
  });

  const enqueue = (state: GameState, next: PlayerActionIntent): PlayerActionSnapshot => {
    const hero = playerOf(state);
    lastResult = null;
    reason = undefined;
    if (!hero) {
      phase = "blocked";
      intent = null;
      reason = "英雄不可行动";
      return snapshot();
    }
    if (next.type === "build") {
      const check = callbacks.canBuild(state, next.kind, next.gx, next.gy);
      if (!check.ok) {
        phase = "blocked";
        intent = null;
        reason = check.reason;
        return snapshot();
      }
    } else {
      const building = state.buildings.find((entry) => entry.id === next.buildingId && entry.alive);
      const check = callbacks.canRepair(state, next.buildingId);
      if (!building || (!check.ok && check.reason !== "需要靠近目标")) {
        phase = "blocked";
        intent = null;
        reason = building ? check.reason : "目标不存在";
        return snapshot();
      }
    }
    intent = next;
    const approach = findApproachPath(state, hero, next);
    if (approach === null) {
      phase = "blocked";
      intent = null;
      reason = "无法到达目标";
      return snapshot();
    }
    path = approach;
    pathIndex = 0;
    phase = path.length ? "moving" : "executing";
    return snapshot();
  };

  const direction = (state: GameState): { mx: number; my: number } => {
    const hero = playerOf(state);
    if (phase !== "moving" || !hero || !intent) return { mx: 0, my: 0 };
    while (pathIndex < path.length && Math.hypot(path[pathIndex].x - hero.x, path[pathIndex].y - hero.y) < TILE * 0.35) pathIndex += 1;
    const waypoint = path[pathIndex];
    if (!waypoint) return { mx: 0, my: 0 };
    const dx = waypoint.x - hero.x;
    const dy = waypoint.y - hero.y;
    const distance = Math.hypot(dx, dy) || 1;
    return { mx: dx / distance, my: dy / distance };
  };

  const afterStep = (state: GameState): PlayerActionSnapshot => {
    if (phase === "moving" && intent) {
      const hero = playerOf(state);
      const target = actionTarget(state, intent);
      if (!hero || !target) {
        phase = "blocked";
        intent = null;
        reason = "目标失效";
        lastResult = "unavailable";
        return snapshot();
      }
      if (distanceToFootprint(hero, target) <= target.range) phase = "executing";
      else if (pathIndex >= path.length) {
        phase = "blocked";
        intent = null;
        reason = "无法到达目标";
        lastResult = "unavailable";
        return snapshot();
      }
    }
    if (phase !== "executing" || !intent) return snapshot();
    const current = intent;
    let ok = false;
    if (current.type === "build") {
      const check = callbacks.canBuild(state, current.kind, current.gx, current.gy);
      if (!check.ok) {
        phase = "blocked";
        reason = check.reason;
      } else {
        ok = callbacks.build(state, current.kind, current.gx, current.gy);
      }
    } else {
      const check = callbacks.canRepair(state, current.buildingId);
      if (!check.ok) {
        phase = "blocked";
        reason = check.reason;
      } else {
        ok = callbacks.repair(state, current.buildingId);
      }
    }
    lastResult = ok ? "started" : "unavailable";
    if (ok) phase = "idle";
    else if (phase === "executing") phase = "blocked";
    intent = null;
    path = [];
    pathIndex = 0;
    return snapshot();
  };

  const cancel = (cancelReason = "已取消"): PlayerActionSnapshot => {
    phase = "cancelled";
    reason = cancelReason;
    intent = null;
    path = [];
    pathIndex = 0;
    return snapshot();
  };

  const cancelAuto = (): PlayerActionSnapshot => intent?.source === "auto" ? cancel("自动任务已取消") : snapshot();

  return { enqueue, direction, afterStep, cancel, cancelAuto, snapshot };
}
