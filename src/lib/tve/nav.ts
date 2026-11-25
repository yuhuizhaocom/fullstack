// 巨魔 AI 使用的网格寻路（A*），建筑变化后由调用方按需重建。

import { MAP_TILES, TILE, isTerrainBlocked } from "./config";
import type { GameState, Point } from "./types";

export interface NavGrid {
  blocked: Uint8Array;
}

export function buildNav(state: GameState): NavGrid {
  const blocked = new Uint8Array(MAP_TILES * MAP_TILES);
  for (let gy = 0; gy < MAP_TILES; gy++) {
    for (let gx = 0; gx < MAP_TILES; gx++) {
      if (isTerrainBlocked(gx, gy)) blocked[gy * MAP_TILES + gx] = 1;
    }
  }
  for (const b of state.buildings) {
    if (!b.alive) continue;
    const size = b.kind === "tree" ? 2 : 1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = b.gx + x;
        const gy = b.gy + y;
        if (gx < 0 || gy < 0 || gx >= MAP_TILES || gy >= MAP_TILES) continue;
        blocked[gy * MAP_TILES + gx] = 1;
      }
    }
  }
  return { blocked };
}

export function isNavBlocked(nav: NavGrid, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= MAP_TILES || gy >= MAP_TILES) return true;
  return nav.blocked[gy * MAP_TILES + gx] === 1;
}

export function worldToCell(x: number, y: number): { gx: number; gy: number } {
  return {
    gx: Math.max(0, Math.min(MAP_TILES - 1, Math.floor(x / TILE))),
    gy: Math.max(0, Math.min(MAP_TILES - 1, Math.floor(y / TILE))),
  };
}

export function findNearestFree(nav: NavGrid, gx: number, gy: number, maxRadius = 6): { gx: number; gy: number } | null {
  if (!isNavBlocked(nav, gx, gy)) return { gx, gy };
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = gx + dx;
        const ny = gy + dy;
        if (!isNavBlocked(nav, nx, ny)) return { gx: nx, gy: ny };
      }
    }
  }
  return null;
}

interface Node {
  gx: number;
  gy: number;
  g: number;
  f: number;
  parent: number;
}

class MinHeap {
  private items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node) {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].f <= this.items[i].f) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }

  pop(): Node | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < this.items.length && this.items[l].f < this.items[best].f) best = l;
        if (r < this.items.length && this.items[r].f < this.items[best].f) best = r;
        if (best === i) break;
        [this.items[best], this.items[i]] = [this.items[i], this.items[best]];
        i = best;
      }
    }
    return top;
  }
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** 返回从起点到终点的格子路径（含终点，不含起点），失败返回 null */
export function findPath(
  nav: NavGrid,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
): { gx: number; gy: number }[] | null {
  const s = worldToCell(startX, startY);
  const rawGoal = worldToCell(goalX, goalY);
  const start = findNearestFree(nav, s.gx, s.gy, 3);
  const goal = findNearestFree(nav, rawGoal.gx, rawGoal.gy, 7);
  if (!start || !goal) return null;

  const total = MAP_TILES * MAP_TILES;
  const gScore = new Float32Array(total).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const startIdx = start.gy * MAP_TILES + start.gx;
  const goalIdx = goal.gy * MAP_TILES + goal.gx;

  const heuristic = (gx: number, gy: number) => {
    const dx = Math.abs(gx - goal.gx);
    const dy = Math.abs(gy - goal.gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  gScore[startIdx] = 0;
  const open = new MinHeap();
  open.push({ gx: start.gx, gy: start.gy, g: 0, f: heuristic(start.gx, start.gy), parent: -1 });

  let expanded = 0;
  while (open.size > 0 && expanded < 6000) {
    const current = open.pop()!;
    const idx = current.gy * MAP_TILES + current.gx;
    if (closed[idx]) continue;
    closed[idx] = 1;
    expanded++;
    if (idx === goalIdx) {
      const path: { gx: number; gy: number }[] = [];
      let cursor = idx;
      while (cursor !== startIdx) {
        path.push({ gx: cursor % MAP_TILES, gy: Math.floor(cursor / MAP_TILES) });
        cursor = parent[cursor];
        if (cursor < 0) return null;
      }
      path.reverse();
      return path;
    }
    for (const [dx, dy] of DIRS) {
      const nx = current.gx + dx;
      const ny = current.gy + dy;
      if (isNavBlocked(nav, nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (isNavBlocked(nav, current.gx + dx, current.gy) || isNavBlocked(nav, current.gx, current.gy + dy)) continue;
      }
      const nIdx = ny * MAP_TILES + nx;
      if (closed[nIdx]) continue;
      const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      const tentative = gScore[idx] + step;
      if (tentative >= gScore[nIdx]) continue;
      gScore[nIdx] = tentative;
      parent[nIdx] = idx;
      open.push({ gx: nx, gy: ny, g: tentative, f: tentative + heuristic(nx, ny), parent: idx });
    }
  }
  return null;
}

export function pathToWorld(path: { gx: number; gy: number }[]): Point[] {
  return path.map((cell) => ({ x: (cell.gx + 0.5) * TILE, y: (cell.gy + 0.5) * TILE }));
}
