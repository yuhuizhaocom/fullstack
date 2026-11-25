import { MAP_H, MAP_W, TILE } from "./config";
import type { GameMap, Terrain, TilePos, Vec } from "./types";

export const TERRAIN_CODES: Terrain[] = ["grass", "bush", "tree", "rock", "water", "flower"];
export const TERRAIN_INDEX: Record<Terrain, number> = {
  grass: 0,
  bush: 1,
  tree: 2,
  rock: 3,
  water: 4,
  flower: 5,
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 53.37) * 43758.5453;
  return n - Math.floor(n);
}

export function tileCenter(tx: number, ty: number): Vec {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

export function pixelToTile(x: number, y: number): TilePos {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

export function terrainAtTile(map: GameMap, tx: number, ty: number): Terrain {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return "tree";
  return TERRAIN_CODES[map.terrain[ty * map.w + tx]] ?? "grass";
}

export function terrainAtPoint(map: GameMap, x: number, y: number): Terrain {
  const { tx, ty } = pixelToTile(x, y);
  return terrainAtTile(map, tx, ty);
}

export function isStaticBlocked(map: GameMap, tx: number, ty: number): boolean {
  const t = terrainAtTile(map, tx, ty);
  return t === "tree" || t === "rock" || t === "water";
}

/** 是否藏身灌木（可站立、提供隐蔽） */
export function isBushAt(map: GameMap, x: number, y: number): boolean {
  return terrainAtPoint(map, x, y) === "bush";
}

/** 视线被树木与岩石阻挡（灌木不挡视线，便于猎人贴近搜索） */
export function hasLineOfSight(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const a = pixelToTile(x0, y0);
  const b = pixelToTile(x1, y1);
  let tx = a.tx;
  let ty = a.ty;
  const dx = Math.abs(b.tx - a.tx);
  const dy = Math.abs(b.ty - a.ty);
  const sx = a.tx < b.tx ? 1 : -1;
  const sy = a.ty < b.ty ? 1 : -1;
  let err = dx - dy;
  let guard = 0;
  while (guard < 512) {
    guard += 1;
    if (tx === b.tx && ty === b.ty) return true;
    if (!(tx === a.tx && ty === a.ty)) {
      const t = terrainAtTile(map, tx, ty);
      if (t === "tree" || t === "rock") return false;
    }
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      tx += sx;
    }
    if (e2 < dx) {
      err += dx;
      ty += sy;
    }
  }
  return false;
}

type HeapItem = { index: number; f: number };

class MinHeap {
  private items: HeapItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].f <= this.items[i].f) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): HeapItem | null {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const last = this.items.pop() as HeapItem;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let best = i;
        if (left < this.items.length && this.items[left].f < this.items[best].f) best = left;
        if (right < this.items.length && this.items[right].f < this.items[best].f) best = right;
        if (best === i) break;
        [this.items[best], this.items[i]] = [this.items[i], this.items[best]];
        i = best;
      }
    }
    return top;
  }
}

const NEIGHBORS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export type BlockFn = (tx: number, ty: number) => boolean;

/** 目标格不可走时，向外找最近的可走格 */
export function nearestOpenTile(
  map: GameMap,
  tx: number,
  ty: number,
  blocked: BlockFn,
  maxRing = 10
): TilePos | null {
  if (!blocked(tx, ty)) return { tx, ty };
  for (let r = 1; r <= maxRing; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
        if (!blocked(nx, ny)) return { tx: nx, ty: ny };
      }
    }
  }
  return null;
}

/** A* 寻路，返回从起点下一格开始的像素中心路径 */
export function findPath(
  map: GameMap,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  blocked: BlockFn
): Vec[] {
  const start = pixelToTile(sx, sy);
  const goalTile = pixelToTile(gx, gy);
  const solid: BlockFn = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
    return blocked(tx, ty);
  };
  const goal = solid(goalTile.tx, goalTile.ty)
    ? nearestOpenTile(map, goalTile.tx, goalTile.ty, solid)
    : goalTile;
  if (!goal) return [];
  if (goal.tx === start.tx && goal.ty === start.ty) {
    return [{ x: gx, y: gy }];
  }

  const w = map.w;
  const h = map.h;
  const size = w * h;
  const gScore = new Float32Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const startIdx = start.ty * w + start.tx;
  const goalIdx = goal.ty * w + goal.tx;
  const heuristic = (idx: number) => {
    const x = idx % w;
    const y = (idx / w) | 0;
    const dx = Math.abs(x - goal.tx);
    const dy = Math.abs(y - goal.ty);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  const open = new MinHeap();
  gScore[startIdx] = 0;
  open.push({ index: startIdx, f: heuristic(startIdx) });
  let guard = 0;

  while (open.size > 0 && guard < 20000) {
    guard += 1;
    const current = open.pop();
    if (!current) break;
    const idx = current.index;
    if (idx === goalIdx) break;
    if (closed[idx]) continue;
    closed[idx] = 1;
    const cx = idx % w;
    const cy = (idx / w) | 0;

    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (solid(nx, ny)) continue;
      // 斜向不允许穿墙角
      if (dx !== 0 && dy !== 0) {
        if (solid(cx + dx, cy) || solid(cx, cy + dy)) continue;
      }
      const nIdx = ny * w + nx;
      if (closed[nIdx]) continue;
      const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      const next = gScore[idx] + step;
      if (next < gScore[nIdx]) {
        gScore[nIdx] = next;
        cameFrom[nIdx] = idx;
        open.push({ index: nIdx, f: next + heuristic(nIdx) });
      }
    }
  }

  if (cameFrom[goalIdx] === -1 && goalIdx !== startIdx) return [];
  const nodes: number[] = [];
  let cur = goalIdx;
  let hops = 0;
  while (cur !== startIdx && hops < size) {
    nodes.push(cur);
    cur = cameFrom[cur];
    hops += 1;
    if (cur === -1) return [];
  }
  nodes.reverse();

  const path: Vec[] = nodes.map((idx) => tileCenter(idx % w, (idx / w) | 0));
  if (path.length > 0) {
    path[path.length - 1] = { x: gx, y: gy };
  }
  return path;
}

function drawTerrain(map: GameMap, tx: number, ty: number, terrain: Terrain): void {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return;
  const index = ty * map.w + tx;
  map.terrain[index] = TERRAIN_INDEX[terrain];
  map.trees[index] = terrain === "tree" ? 30 : 0;
}

function blob(
  map: GameMap,
  rand: () => number,
  cx: number,
  cy: number,
  radius: number,
  terrain: Terrain,
  density: number,
  fill: Terrain
): void {
  for (let ty = Math.floor(cy - radius); ty <= Math.ceil(cy + radius); ty += 1) {
    for (let tx = Math.floor(cx - radius); tx <= Math.ceil(cx + radius); tx += 1) {
      if (tx < 1 || ty < 1 || tx >= map.w - 1 || ty >= map.h - 1) continue;
      const d = Math.hypot(tx - cx, ty - cy);
      if (d > radius) continue;
      if (rand() > density * (1 - (d / radius) * 0.5)) {
        drawTerrain(map, tx, ty, fill);
      } else {
        drawTerrain(map, tx, ty, terrain);
      }
    }
  }
}

/** 生成一张适合 7 农民 vs 3 猎人的森林地图 */
export function createMap(seed: number): GameMap {
  const rand = mulberry32(seed);
  const map: GameMap = {
    w: MAP_W,
    h: MAP_H,
    seed,
    terrain: new Uint8Array(MAP_W * MAP_H),
    trees: new Uint8Array(MAP_W * MAP_H),
    farmerStarts: [],
    hunterCamp: tileCenter(48, 48),
    groves: [],
    patrol: [],
    merchantSpots: [],
  };

  // 基础草地，随机花草
  for (let ty = 0; ty < MAP_H; ty += 1) {
    for (let tx = 0; tx < MAP_W; tx += 1) {
      const n = hash2(tx, ty, seed);
      drawTerrain(map, tx, ty, n < 0.08 ? "flower" : "grass");
    }
  }

  // 湖水
  blob(map, rand, 30, 30, 7, "water", 0.9, "grass");
  blob(map, rand, 66, 70, 8, "water", 0.9, "grass");

  // 岩石区
  blob(map, rand, 22, 58, 5, "rock", 0.5, "grass");
  blob(map, rand, 76, 44, 6, "rock", 0.45, "grass");
  blob(map, rand, 48, 16, 4, "rock", 0.5, "grass");
  blob(map, rand, 50, 84, 4, "rock", 0.45, "grass");

  // 密林（内部以灌木为主，夹杂树木，形成可藏匿空间）
  const forests: [number, number, number][] = [
    [30, 74, 10],
    [64, 78, 9],
    [26, 36, 9],
    [70, 42, 10],
    [48, 34, 7],
    [44, 62, 7],
    [58, 24, 6],
    [36, 52, 6],
  ];
  for (const [cx, cy, r] of forests) {
    blob(map, rand, cx, cy, r, "tree", 0.34, "bush");
  }

  // 7 个农民起家点：按钟表方位分布，5 点与 7 点是最推荐的两个角落
  const startTiles: [number, number][] = [
    [82, 80],
    [14, 80],
    [80, 16],
    [16, 16],
    [86, 50],
    [10, 46],
    [48, 86],
  ];
  for (const [sx, sy] of startTiles) {
    for (let ty = sy - 7; ty <= sy + 7; ty += 1) {
      for (let tx = sx - 7; tx <= sx + 7; tx += 1) {
        if (Math.hypot(tx - sx, ty - sy) <= 7.2) {
          drawTerrain(map, tx, ty, hash2(tx, ty, seed + 7) < 0.12 ? "flower" : "grass");
        }
      }
    }
    const point = tileCenter(sx, sy);
    map.farmerStarts.push(point);
    map.groves.push(point);
  }

  // 中央猎人营地：清出一块空地放兵营
  const campTile = pixelToTile(map.hunterCamp.x, map.hunterCamp.y);
  for (let ty = campTile.ty - 9; ty <= campTile.ty + 9; ty += 1) {
    for (let tx = campTile.tx - 9; tx <= campTile.tx + 9; tx += 1) {
      if (Math.hypot(tx - campTile.tx, ty - campTile.ty) <= 9.2) {
        drawTerrain(map, tx, ty, hash2(tx, ty, seed + 13) < 0.1 ? "flower" : "grass");
      }
    }
  }

  // 额外藏匿点（树林深处）
  const hideTiles: [number, number][] = [
    [30, 74],
    [64, 78],
    [26, 36],
    [70, 42],
    [48, 34],
    [44, 62],
  ];
  for (const [gx, gy] of hideTiles) {
    for (let ty = gy - 3; ty <= gy + 3; ty += 1) {
      for (let tx = gx - 3; tx <= gx + 3; tx += 1) {
        if (Math.hypot(tx - gx, ty - gy) <= 3.2) drawTerrain(map, tx, ty, "grass");
      }
    }
    map.groves.push(tileCenter(gx, gy));
  }

  // 边界树墙
  for (let ty = 0; ty < MAP_H; ty += 1) {
    for (let tx = 0; tx < MAP_W; tx += 1) {
      if (tx < 2 || ty < 2 || tx >= MAP_W - 2 || ty >= MAP_H - 2) {
        drawTerrain(map, tx, ty, "tree");
      }
    }
  }

  // 巡逻锚点：围绕中央营地与各起家点的路线
  map.patrol = [
    tileCenter(48, 34),
    tileCenter(64, 38),
    tileCenter(70, 58),
    tileCenter(58, 70),
    tileCenter(38, 66),
    tileCenter(28, 50),
    tileCenter(20, 70),
    tileCenter(78, 24),
  ];

  // 移动商人刷新点（中央兵营周围与主要路口）
  map.merchantSpots = [
    tileCenter(48, 58),
    tileCenter(40, 42),
    tileCenter(58, 44),
    tileCenter(60, 60),
    tileCenter(36, 58),
    tileCenter(84, 82),
    tileCenter(12, 82),
    tileCenter(82, 14),
    tileCenter(14, 14),
  ];

  return map;
}

export function mapTerrainCounts(map: GameMap): Record<Terrain, number> {
  const counts: Record<Terrain, number> = {
    grass: 0,
    bush: 0,
    tree: 0,
    rock: 0,
    water: 0,
    flower: 0,
  };
  for (let i = 0; i < map.terrain.length; i += 1) {
    counts[TERRAIN_CODES[map.terrain[i]]] += 1;
  }
  return counts;
}
