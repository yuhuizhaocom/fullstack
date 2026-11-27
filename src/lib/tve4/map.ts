// tve4 地图数据：8 张原版可选地图由 tools/map-parser/generate_tve4_maps.py 生成。
// 碰撞格来自 war3map.wpm 的 128 世界单位采样，所有开放区域已在生成时连通。

import { ACTIVE_MAP, GRID_H, GRID_W, SPAWNS, TILE } from "./config";

function decodeBase64(text: string): Uint8Array {
  if (typeof atob === "function") {
    const raw = atob(text);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }
  // Node fallback for scripts / tests.
  const buffer = (globalThis as { Buffer?: { from(value: string, encoding: string): Uint8Array } }).Buffer;
  if (!buffer) throw new Error("无法解码地图碰撞数据");
  return new Uint8Array(buffer.from(text, "base64"));
}

function clearSpawn(grid: Uint8Array, gx: number, gy: number, radius: number): void {
  for (let y = gy - radius; y <= gy + radius; y += 1) {
    for (let x = gx - radius; x <= gx + radius; x += 1) {
      if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) grid[y * GRID_W + x] = 0;
    }
  }
}

/** 当前地图的碰撞格，1 = 不可通行。 */
export function buildBlocked(): Uint8Array {
  const grid = decodeBase64(ACTIVE_MAP.blockedBase64);
  if (grid.length !== GRID_W * GRID_H) {
    throw new Error(`地图 ${ACTIVE_MAP.id} 碰撞数据尺寸不符: ${grid.length}`);
  }
  // 生成器已清出出生点；这里再清一次，兼容以后手工改图。
  clearSpawn(grid, SPAWNS.troll.gx, SPAWNS.troll.gy, 3);
  clearSpawn(grid, SPAWNS.elf.gx, SPAWNS.elf.gy, 2);
  return grid;
}

/** 地图像素坐标（用于渲染出生点标记）。 */
export function cellCenter(gx: number, gy: number): { x: number; y: number } {
  return { x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE };
}
