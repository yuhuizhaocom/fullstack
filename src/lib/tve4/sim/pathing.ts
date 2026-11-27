// Pure 32-unit WPM queries and coarse A*. Units are web world units unless named source.

export interface PathingGrid {
  data: Uint8Array;
  width: number;
  height: number;
  cellUnits: number;
  origin: readonly [number, number];
  bounds: readonly [number, number, number, number];
  world: readonly [number, number];
  /** Source world units per web world unit (tve4 currently 8). */
  scale: number;
}

export interface GridPoint {
  gx: number;
  gy: number;
}

export interface GridPathOptions {
  width: number;
  height: number;
  start: GridPoint;
  goal: GridPoint;
  isWalkable: (gx: number, gy: number) => boolean;
  maxNodes?: number;
}

export function createPathingGrid(
  data: Uint8Array,
  width: number,
  height: number,
  cellUnits: number,
  origin: readonly [number, number],
  bounds: readonly [number, number, number, number],
  world: readonly [number, number],
  scale: number,
): PathingGrid {
  if (data.length !== width * height) throw new Error(`WPM 数据尺寸不符: ${data.length}`);
  return { data, width, height, cellUnits, origin, bounds, world, scale };
}

export function sourceToPathingCell(grid: PathingGrid, sourceX: number, sourceY: number): GridPoint {
  return {
    gx: Math.floor((sourceX - grid.origin[0]) / grid.cellUnits),
    gy: Math.floor((sourceY - grid.origin[1]) / grid.cellUnits),
  };
}

export function webToPathingCell(grid: PathingGrid, x: number, y: number): GridPoint {
  return sourceToPathingCell(
    grid,
    grid.bounds[0] + x * grid.scale,
    grid.bounds[1] + y * grid.scale,
  );
}

export function isSourceCellBlocked(grid: PathingGrid, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= grid.width || gy >= grid.height) return true;
  return (grid.data[gy * grid.width + gx] & 0x02) !== 0;
}

export function isWorldBlocked(grid: PathingGrid, x: number, y: number): boolean {
  const cell = webToPathingCell(grid, x, y);
  return isSourceCellBlocked(grid, cell.gx, cell.gy);
}

/**
 * WPM pathing is the authority for walkability. Radius only keeps the center
 * inside the rendered world; it is not an unverified body-clearance model.
 */
export function isWorldPositionFree(grid: PathingGrid, x: number, y: number, radius = 0): boolean {
  if (x < radius || y < radius || x > grid.world[0] - radius || y > grid.world[1] - radius) return false;
  return !isWorldBlocked(grid, x, y);
}

export function isWorldSegmentClear(
  grid: PathingGrid,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  const step = Math.max(0.5, grid.cellUnits / grid.scale / 2);
  const samples = Math.max(1, Math.ceil(distance / step));
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    if (isWorldBlocked(grid, x1 + dx * t, y1 + dy * t)) return false;
  }
  return true;
}

export function hasWorldLineOfSight(
  grid: PathingGrid,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  return isWorldSegmentClear(grid, x1, y1, x2, y2);
}

interface HeapEntry {
  index: number;
  g: number;
  f: number;
}

class MinHeap {
  private items: HeapEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: HeapEntry): void {
    const items = this.items;
    items.push(entry);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compare(items[parent], entry) <= 0) break;
      items[i] = items[parent];
      i = parent;
    }
    items[i] = entry;
  }

  pop(): HeapEntry | undefined {
    const items = this.items;
    if (!items.length) return undefined;
    const first = items[0];
    const last = items.pop()!;
    if (items.length) {
      let i = 0;
      while (true) {
        const left = i * 2 + 1;
        if (left >= items.length) break;
        const right = left + 1;
        const child = right < items.length && compare(items[right], items[left]) < 0 ? right : left;
        if (compare(last, items[child]) <= 0) break;
        items[i] = items[child];
        i = child;
      }
      items[i] = last;
    }
    return first;
  }
}

function compare(a: HeapEntry, b: HeapEntry): number {
  return a.f - b.f || a.g - b.g || a.index - b.index;
}

/** Four-directional A* over the coarse build/navigation grid. */
export function findGridPath(options: GridPathOptions): GridPoint[] {
  const { width, height, start, goal, isWalkable } = options;
  const maxNodes = options.maxNodes ?? width * height;
  const inBounds = (p: GridPoint) => p.gx >= 0 && p.gy >= 0 && p.gx < width && p.gy < height;
  if (!inBounds(start) || !inBounds(goal) || !isWalkable(goal.gx, goal.gy)) {
    return [];
  }
  const total = width * height;
  const startIndex = start.gy * width + start.gx;
  const goalIndex = goal.gy * width + goal.gx;
  if (startIndex === goalIndex) return [];
  const gScore = new Int32Array(total).fill(-1);
  const parent = new Int32Array(total).fill(-1);
  const open = new MinHeap();
  gScore[startIndex] = 0;
  open.push({ index: startIndex, g: 0, f: Math.abs(goal.gx - start.gx) + Math.abs(goal.gy - start.gy) });
  let visited = 0;
  while (open.size && visited < maxNodes) {
    const current = open.pop()!;
    if (current.g !== gScore[current.index]) continue;
    visited += 1;
    if (current.index === goalIndex) {
      const cells: GridPoint[] = [];
      let index = goalIndex;
      while (index !== startIndex && cells.length < total) {
        cells.push({ gx: index % width, gy: Math.floor(index / width) });
        index = parent[index];
      }
      return cells.reverse();
    }
    const gx = current.index % width;
    const gy = Math.floor(current.index / width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!isWalkable(nx, ny)) continue;
      const next = ny * width + nx;
      const nextG = current.g + 1;
      if (gScore[next] >= 0 && gScore[next] <= nextG) continue;
      gScore[next] = nextG;
      parent[next] = current.index;
      open.push({
        index: next,
        g: nextG,
        f: nextG + Math.abs(goal.gx - nx) + Math.abs(goal.gy - ny),
      });
    }
  }
  return [];
}