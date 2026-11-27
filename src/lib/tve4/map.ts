// tve4 runtime map data comes from the verified Task 2 artifacts. The large
// source geometry is deliberately excluded; WPM cells decode synchronously.

import { TILE } from "./config";
import {
  DEFAULT_MAP_ID,
  MAP_DEFINITIONS,
  type MvpMap,
  type MapDefinition,
  type PathingMetadata,
} from "./maps.generated";
import { WPM_PACKBITS_BASE64, WPM_PATHING } from "./pathing.generated";

export const BUILD_CELL_UNITS = 128;
export const PATHING_CELL_UNITS = 32;

export type MapBounds = [number, number, number, number];

function decodeBase64(text: string): Uint8Array {
  if (typeof atob !== "function") throw new Error("当前环境不支持同步 Base64 解码");
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Decode standard PackBits: 0..127 literal, 128 no-op, 129..255 repeat. */
function decodePackBits(data: Uint8Array, expectedLength: number): Uint8Array {
  const out = new Uint8Array(expectedLength);
  let input = 0;
  let output = 0;
  while (input < data.length) {
    const control = data[input++];
    if (control === 128) continue;
    if (control <= 127) {
      const count = control + 1;
      if (input + count > data.length || output + count > out.length) {
        throw new Error("WPM PackBits 字面数据损坏");
      }
      out.set(data.subarray(input, input + count), output);
      input += count;
      output += count;
      continue;
    }
    const count = 257 - control;
    if (input >= data.length || output + count > out.length) {
      throw new Error("WPM PackBits 重复数据损坏");
    }
    out.fill(data[input++], output, output + count);
    output += count;
  }
  if (output !== expectedLength) {
    throw new Error(`WPM PackBits 解码尺寸不符: ${output}`);
  }
  return out;
}

export function loadMvpMap(mapId: number): MvpMap {
  const map = MAP_DEFINITIONS[mapId];
  if (!map) throw new Error(`未知地图: ${mapId}`);
  return map;
}

/** Runtime bounds are the bounding union, rounded outward to WPM 128-unit blocks. */
export function runtimeBounds(map: MvpMap): MapBounds {
  const rects = [map.boundRect, ...map.extraRects];
  const minX = Math.min(...rects.map((rect) => rect.minX));
  const minY = Math.min(...rects.map((rect) => rect.minY));
  const maxX = Math.max(...rects.map((rect) => rect.maxX));
  const maxY = Math.max(...rects.map((rect) => rect.maxY));
  return [
    Math.floor(minX / BUILD_CELL_UNITS) * BUILD_CELL_UNITS,
    Math.floor(minY / BUILD_CELL_UNITS) * BUILD_CELL_UNITS,
    Math.ceil(maxX / BUILD_CELL_UNITS) * BUILD_CELL_UNITS,
    Math.ceil(maxY / BUILD_CELL_UNITS) * BUILD_CELL_UNITS,
  ];
}

function validatePathing(map: MvpMap): void {
  const pathing = map.pathing;
  if (
    pathing.width !== WPM_PATHING.width
    || pathing.height !== WPM_PATHING.height
    || pathing.cellUnits !== WPM_PATHING.cellUnits
    || pathing.sha256 !== WPM_PATHING.sha256
    || pathing.origin[0] !== WPM_PATHING.origin[0]
    || pathing.origin[1] !== WPM_PATHING.origin[1]
  ) {
    throw new Error(`地图 ${map.id} WPM 元数据与运行期目录不一致`);
  }
}

/** Full 1536x1152 source WPM cell payload (the 16-byte header is not included). */
export function buildPathing32(map: MvpMap): Uint8Array {
  validatePathing(map);
  return decodePackBits(decodeBase64(WPM_PACKBITS_BASE64), WPM_PATHING.width * WPM_PATHING.height);
}

/** Derive the coarse grid from an already-decoded session WPM. */
export function buildBuildGrid128FromPathing(map: MvpMap, pathing32: Uint8Array): Uint8Array {
  validatePathing(map);
  if (pathing32.length !== WPM_PATHING.width * WPM_PATHING.height) {
    throw new Error(`地图 ${map.id} WPM 数据尺寸不符: ${pathing32.length}`);
  }
  const bounds = runtimeBounds(map);
  const width = (bounds[2] - bounds[0]) / BUILD_CELL_UNITS;
  const height = (bounds[3] - bounds[1]) / BUILD_CELL_UNITS;
  const sourceX = (bounds[0] - map.pathing.origin[0]) / PATHING_CELL_UNITS;
  const sourceY = (bounds[1] - map.pathing.origin[1]) / PATHING_CELL_UNITS;
  if (
    !Number.isInteger(width) || !Number.isInteger(height)
    || !Number.isInteger(sourceX) || !Number.isInteger(sourceY)
    || sourceX < 0 || sourceY < 0
    || sourceX + width * 4 > WPM_PATHING.width
    || sourceY + height * 4 > WPM_PATHING.height
  ) {
    throw new Error(`地图 ${map.id} 运行期边界未对齐 WPM`);
  }

  const grid = new Uint8Array(width * height);
  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      let blocked = 0;
      for (let dy = 0; dy < 4; dy += 1) {
        const row = (sourceY + gy * 4 + dy) * WPM_PATHING.width;
        for (let dx = 0; dx < 4; dx += 1) {
          if ((pathing32[row + sourceX + gx * 4 + dx] & 0x02) !== 0) blocked += 1;
        }
      }
      // Existing engine rule: a 4x4 source block needs at least 9 no-walk cells.
      if (blocked >= 9) grid[gy * width + gx] = 1;
    }
  }
  return grid;
}

/** Coarse 128-world-unit build/navigation grid. Never clears spawns or carves paths. */
export function buildBuildGrid128(map: MvpMap): Uint8Array {
  return buildBuildGrid128FromPathing(map, buildPathing32(map));
}

/** Compatibility helper: accept an explicit map id or a runtime map definition. */
export function buildBlocked(mapOrId: number | MvpMap = DEFAULT_MAP_ID): Uint8Array {
  const map = typeof mapOrId === "number" ? loadMvpMap(mapOrId) : mapOrId;
  const grid = buildBuildGrid128(map);
  const definition = MAP_DEFINITIONS[map.id];
  if (!definition || grid.length !== definition.grid[0] * definition.grid[1]) {
    throw new Error(`地图 ${map.id} 碰撞数据尺寸不符: ${grid.length}`);
  }
  return grid;
}

/** Web-render tile center for a coarse grid cell. */
export function cellCenter(gx: number, gy: number): { x: number; y: number } {
  return { x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE };
}

export type { MapDefinition, MvpMap, PathingMetadata };
