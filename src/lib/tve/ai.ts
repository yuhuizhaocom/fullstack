// 单机 AI：精灵建造规划 + 巨魔行动规划。AI 只产出「候选动作」，由引擎校验并执行。

import {
  AI_BUILD_SLOTS,
  BUILD_RADIUS_TILES,
  BUILD_SPECS,
  DIFFICULTIES,
  MAP_CENTER,
  TILE,
  TROLL_BASE,
} from "./config";
import { buildNav, findPath, pathToWorld, type NavGrid } from "./nav";
import type { BuildingKind, GameState, Point } from "./types";

export type ElfAction =
  | { type: "build"; kind: BuildingKind; gx: number; gy: number }
  | { type: "upgrade"; id: number };

const navCache = new WeakMap<GameState, { key: string; nav: NavGrid }>();

function getNav(state: GameState): NavGrid {
  const alive = state.buildings.reduce((sum, b) => sum + (b.alive ? 1 : 0), 0);
  const key = `${state.buildings.length}:${alive}`;
  const cached = navCache.get(state);
  if (cached && cached.key === key) return cached.nav;
  const nav = buildNav(state);
  navCache.set(state, { key, nav });
  return nav;
}

/** 生成精灵 AI 的候选动作列表（按优先级），引擎逐个尝试执行 */
export function planElfActions(state: GameState, baseId: number): ElfAction[] {
  const base = state.bases[baseId];
  if (!base || !base.alive) return [];
  const alive = state.buildings.filter((b) => b.alive && b.baseId === baseId);
  const occupied = new Set(alive.map((b) => `${b.gx},${b.gy}`));
  const actions: ElfAction[] = [];

  const kinds: BuildingKind[] = ["mine", "arrow", "magic", "wall"];
  for (const kind of kinds) {
    let taken = 0;
    if (kind === "wall") {
      const existing = alive.filter((b) => b.kind === "wall").length;
      if (existing >= 6) continue;
    }
    for (const slot of AI_BUILD_SLOTS) {
      if (slot.kind !== kind) continue;
      const gx = base.tx + slot.dx;
      const gy = base.ty + slot.dy;
      if (occupied.has(`${gx},${gy}`)) continue;
      actions.push({ type: "build", kind, gx, gy });
      taken++;
      if (taken >= 2) break;
    }
  }

  const order: BuildingKind[] = ["mine", "arrow", "magic", "wall"];
  for (const kind of order) {
    const list = alive
      .filter((b) => b.kind === kind && b.level < BUILD_SPECS[kind].levels.length)
      .sort((a, b) => a.level - b.level);
    for (const b of list) actions.push({ type: "upgrade", id: b.id });
  }
  return actions;
}

/** 距离基地中心的格数 */
export function isInsideTerritory(state: GameState, baseId: number, gx: number, gy: number): boolean {
  const base = state.bases[baseId];
  if (!base) return false;
  const cx = (base.tx + 0.5) * TILE;
  const cy = (base.ty + 0.5) * TILE;
  const x = (gx + 0.5) * TILE;
  const y = (gy + 0.5) * TILE;
  return Math.hypot(x - cx, y - cy) <= BUILD_RADIUS_TILES * TILE;
}

function baseDefenseScore(state: GameState, baseId: number): number {
  const base = state.bases[baseId];
  if (!base || !base.alive) return Number.POSITIVE_INFINITY;
  let score = 0;
  for (const b of state.buildings) {
    if (!b.alive || b.baseId !== baseId) continue;
    if (b.kind === "arrow") score += 2 + b.level * 0.5;
    if (b.kind === "magic") score += 3 + b.level * 0.6;
    if (b.kind === "wall") score += 0.4;
    if (b.kind === "tree") score += b.hp / b.maxHp;
  }
  const dist = Math.hypot(base.x - state.troll.x, base.y - state.troll.y);
  return score + dist / 6000;
}

export interface TrollMove {
  mx: number;
  my: number;
  rush: boolean;
}

/** 巨魔 AI：白天侦查/避战，夜晚压制最薄弱基地 */
export function planTrollMove(state: GameState, dt: number): TrollMove {
  const ai = state.ai;
  const diff = DIFFICULTIES[state.difficulty];
  const troll = state.troll;
  const speed = state.night ? TROLL_BASE.nightSpeed : TROLL_BASE.daySpeed;

  ai.decisionTimer -= dt;
  if (ai.decisionTimer <= 0) {
    ai.decisionTimer = 0.9 * diff.aiInterval;
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const base of state.bases) {
      if (!base.alive) continue;
      const score = baseDefenseScore(state, base.id);
      if (score < bestScore) {
        bestScore = score;
        best = base.id;
      }
    }
    if (best >= 0) ai.targetBase = best;
  }

  const targetBase = state.bases[ai.targetBase];
  const tree = targetBase ? state.buildings.find((b) => b.id === targetBase.treeId && b.alive) : undefined;
  const goal: Point = tree ? { x: tree.x, y: tree.y } : MAP_CENTER;

  // 白天且血量低：撤回中心区域
  const retreating = !state.night && troll.hp < troll.maxHp * (state.difficulty === "easy" ? 0.7 : 0.55);
  let desired: Point = goal;
  if (retreating) desired = { x: MAP_CENTER.x, y: MAP_CENTER.y + TILE * 3 };

  // 顺路猎杀村民（白天优先）
  let nearestVillager: Point | null = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const v of state.villagers) {
    if (v.dead) continue;
    const d = Math.hypot(v.x - troll.x, v.y - troll.y);
    if (d < nearestDist && d < TILE * 6) {
      nearestDist = d;
      nearestVillager = v;
    }
  }
  if (nearestVillager && (!state.night || nearestDist < TILE * 2.5)) {
    desired = { x: nearestVillager.x, y: nearestVillager.y };
  }

  // 寻路（每 1.4 秒刷新一次）
  ai.pathTimer -= dt;
  if (ai.pathTimer <= 0 || !ai.path) {
    ai.pathTimer = 1.4;
    if (retreating || nearestVillager) {
      ai.path = null;
    } else {
      const nav = getNav(state);
      const raw = findPath(nav, troll.x, troll.y, goal.x, goal.y);
      ai.path = raw ? pathToWorld(raw) : null;
    }
  }

  let aimX = desired.x;
  let aimY = desired.y;
  if (ai.path && ai.path.length > 0) {
    while (ai.path.length > 0) {
      const wp = ai.path[0];
      if (Math.hypot(wp.x - troll.x, wp.y - troll.y) < TILE * 0.75) {
        ai.path.shift();
      } else {
        aimX = wp.x;
        aimY = wp.y;
        break;
      }
    }
    if (ai.path.length === 0) ai.path = null;
  }

  let dx = aimX - troll.x;
  let dy = aimY - troll.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  // 卡住检测：连续 0.9 秒位移过小则改打附近建筑（由公共攻击逻辑处理）
  ai.stuck += dt;
  if (ai.stuck >= 0.9) {
    const moved = Math.hypot(troll.x - ai.lastX, troll.y - ai.lastY);
    if (moved < 14 && !retreating) {
      ai.path = null;
      ai.pathTimer = 0.4;
    }
    ai.lastX = troll.x;
    ai.lastY = troll.y;
    ai.stuck = 0;
  }

  const targetDist = Math.hypot(goal.x - troll.x, goal.y - troll.y);
  const rush = state.night && targetDist > 320 && troll.rushCd <= 0 && speed > 0;
  return { mx: dx, my: dy, rush };
}
