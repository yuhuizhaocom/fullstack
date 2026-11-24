export const TILE = 32;
export const WORLD_W = 64;
export const WORLD_H = 48;
export const SPAWN_X = 32 * TILE + TILE / 2;
export const SPAWN_Y = 24 * TILE + TILE / 2;

export type Terrain = "grass" | "tree" | "water" | "rock" | "flower";

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** 三个固定湖泊，服务端与客户端使用同一函数保证地形一致 */
const LAKES = [
  { x: 16, y: 12, r: 4.5 },
  { x: 48, y: 36, r: 5.5 },
  { x: 53, y: 13, r: 3.8 },
];

export function terrainAt(tx: number, ty: number): Terrain {
  if (tx < 1 || ty < 1 || tx >= WORLD_W - 1 || ty >= WORLD_H - 1) return "tree";

  // 村庄安全区：出生点周围没有障碍
  if (Math.abs(tx - 32) <= 5 && Math.abs(ty - 24) <= 4) {
    return hash2(tx, ty) < 0.12 ? "flower" : "grass";
  }

  for (const lake of LAKES) {
    if (Math.hypot(tx - lake.x, ty - lake.y) < lake.r) return "water";
  }

  const h = hash2(tx, ty);
  if (h < 0.07) return "tree";
  if (h < 0.1) return "rock";
  if (h < 0.18) return "flower";
  return "grass";
}

export function isBlockedTile(tx: number, ty: number): boolean {
  const terrain = terrainAt(tx, ty);
  return terrain === "tree" || terrain === "water" || terrain === "rock";
}

/** 以像素坐标判断碰撞，radius 为角色半宽 */
export function isBlockedAt(x: number, y: number, radius = 9): boolean {
  const points: [number, number][] = [
    [x - radius, y - radius],
    [x + radius, y - radius],
    [x - radius, y + radius],
    [x + radius, y + radius],
  ];
  return points.some(([px, py]) =>
    isBlockedTile(Math.floor(px / TILE), Math.floor(py / TILE))
  );
}

export function clampToWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(TILE, Math.min(WORLD_W * TILE - TILE, x)),
    y: Math.max(TILE, Math.min(WORLD_H * TILE - TILE, y)),
  };
}

/** 随机取一个可走的格子中心，用于刷怪 */
export function randomOpenPoint(
  minTx = 3,
  maxTx = WORLD_W - 3,
  minTy = 3,
  maxTy = WORLD_H - 3
): { x: number; y: number } {
  for (let i = 0; i < 40; i += 1) {
    const tx = minTx + Math.floor(Math.random() * Math.max(1, maxTx - minTx));
    const ty = minTy + Math.floor(Math.random() * Math.max(1, maxTy - minTy));
    if (!isBlockedTile(tx, ty)) {
      return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
    }
  }
  return { x: SPAWN_X, y: SPAWN_Y };
}

/** 在指定点附近找一个可走点（用于固定 BOSS 出生点） */
export function nearestOpenPoint(tx: number, ty: number): { x: number; y: number } {
  for (let radius = 0; radius < 8; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (!isBlockedTile(tx + dx, ty + dy)) {
          return { x: (tx + dx) * TILE + TILE / 2, y: (ty + dy) * TILE + TILE / 2 };
        }
      }
    }
  }
  return { x: SPAWN_X, y: SPAWN_Y };
}
