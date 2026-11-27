export const RENDER_SOURCE_TILE_UNITS = 128;
export const RENDER_WEB_TILE_UNITS = 16;
export const RENDER_SCALE_DIVISOR = 8;

export type RenderBounds = [number, number, number, number];

export interface RenderTerrainTile {
  x: number;
  y: number;
  tileId: number;
}

export interface RenderDoodad {
  typeId: string;
  x: number;
  y: number;
  rotation: number;
}

export interface RenderGeometry {
  version: 1;
  mapId: number;
  catalogVersion: string;
  geometryHash: string;
  runtimeBounds: RenderBounds;
  coordinateSystem: {
    sourceTileUnits: 128;
    webTileUnits: 16;
    scaleDivisor: 8;
    webOrigin: "runtimeBounds.minX/minY";
  };
  terrain: RenderTerrainTile[];
  doodads: RenderDoodad[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label}必须是对象`);
  return value;
}

export function assertRuntimeBoundsMatch(renderBounds: RenderBounds, sessionBounds: readonly number[]): void {
  if (sessionBounds.length !== 4 || renderBounds.some((value, index) => value !== sessionBounds[index])) {
    throw new Error(
      `地图渲染几何 runtimeBounds 与模拟会话不一致: ${JSON.stringify(renderBounds)} != ${JSON.stringify(sessionBounds)}`,
    );
  }
}

/** Validate lazy-loaded render data before any geometry reaches Phaser. */
export function validateRenderGeometry(value: unknown, sessionBounds?: readonly number[]): RenderGeometry {
  const geometry = requireRecord(value, "地图渲染几何");
  if (geometry.version !== 1) throw new Error("不支持的地图渲染几何版本");
  if (!isInteger(geometry.mapId) || geometry.mapId < 0 || geometry.mapId > 7) {
    throw new Error("地图渲染几何 mapId 无效");
  }
  if (!isHash(geometry.catalogVersion)) throw new Error("地图渲染几何 catalogVersion 无效");
  if (!isHash(geometry.geometryHash)) throw new Error("地图渲染几何 geometryHash 无效");

  const bounds = geometry.runtimeBounds;
  if (
    !Array.isArray(bounds)
    || bounds.length !== 4
    || !bounds.every(isInteger)
    || bounds[0] % RENDER_SOURCE_TILE_UNITS !== 0
    || bounds[1] % RENDER_SOURCE_TILE_UNITS !== 0
    || bounds[2] % RENDER_SOURCE_TILE_UNITS !== 0
    || bounds[3] % RENDER_SOURCE_TILE_UNITS !== 0
    || bounds[2] <= bounds[0]
    || bounds[3] <= bounds[1]
  ) {
    throw new Error("地图渲染几何 runtimeBounds 未按 128 源单位对齐");
  }

  if (sessionBounds) {
    assertRuntimeBoundsMatch([bounds[0], bounds[1], bounds[2], bounds[3]], sessionBounds);
  }

  const coordinateSystem = requireRecord(geometry.coordinateSystem, "coordinateSystem");
  if (
    coordinateSystem.sourceTileUnits !== RENDER_SOURCE_TILE_UNITS
    || coordinateSystem.webTileUnits !== RENDER_WEB_TILE_UNITS
    || coordinateSystem.scaleDivisor !== RENDER_SCALE_DIVISOR
    || coordinateSystem.webOrigin !== "runtimeBounds.minX/minY"
  ) {
    throw new Error("地图渲染几何坐标口径不一致");
  }

  if (!Array.isArray(geometry.terrain) || geometry.terrain.length === 0) {
    throw new Error("地图渲染几何缺少 W3E terrain");
  }
  const terrain: RenderTerrainTile[] = geometry.terrain.map((entry, index) => {
    const tile = requireRecord(entry, `terrain[${index}]`);
    if (!isInteger(tile.x) || !isInteger(tile.y) || !isInteger(tile.tileId) || tile.tileId < 0 || tile.tileId > 255) {
      throw new Error(`terrain[${index}] 含无效 W3E 坐标或 tileId`);
    }
    return { x: tile.x, y: tile.y, tileId: tile.tileId };
  });

  if (!Array.isArray(geometry.doodads)) throw new Error("地图渲染几何缺少 DOO doodads 数组");
  const doodads: RenderDoodad[] = geometry.doodads.map((entry, index) => {
    const doodad = requireRecord(entry, `doodads[${index}]`);
    if (
      typeof doodad.typeId !== "string"
      || !/^[\x20-\x7e]{4}$/.test(doodad.typeId)
      || !isFiniteNumber(doodad.x)
      || !isFiniteNumber(doodad.y)
      || !isFiniteNumber(doodad.rotation)
    ) {
      throw new Error(`doodads[${index}] 含无效 DOO 数据`);
    }
    return {
      typeId: doodad.typeId,
      x: doodad.x,
      y: doodad.y,
      rotation: doodad.rotation,
    };
  });

  return {
    version: 1,
    mapId: geometry.mapId,
    catalogVersion: geometry.catalogVersion,
    geometryHash: geometry.geometryHash,
    runtimeBounds: [bounds[0], bounds[1], bounds[2], bounds[3]],
    coordinateSystem: {
      sourceTileUnits: RENDER_SOURCE_TILE_UNITS,
      webTileUnits: RENDER_WEB_TILE_UNITS,
      scaleDivisor: RENDER_SCALE_DIVISOR,
      webOrigin: "runtimeBounds.minX/minY",
    },
    terrain,
    doodads,
  };
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("地图渲染几何含非有限数值");
  const text = value.toFixed(9).replace(/\.?0+$/, "");
  return text === "-0" || text === "" ? "0" : text;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** SHA-256 fallback for HTTP LAN/mobile contexts where Web Crypto is unavailable. */
function sha256(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const input = new DataView(padded.buffer);
  input.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  input.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) words[i] = input.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotateRight(words[i - 15], 7) ^ rotateRight(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotateRight(words[i - 2], 17) ^ rotateRight(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + SHA256_K[i] + words[i]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const output = new Uint8Array(32);
  const view = new DataView(output.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((value, index) => view.setUint32(index * 4, value, false));
  return output;
}

/** SHA-256 over source W3E/DOO records; matches the Python generator. */
export async function computeGeometryHash(geometry: RenderGeometry): Promise<string> {
  const lines = ["tve4-render-geometry-v1"];
  for (const tile of geometry.terrain) {
    lines.push(`T${formatNumber(tile.x)},${formatNumber(tile.y)},${tile.tileId}`);
  }
  for (const doodad of geometry.doodads) {
    lines.push(
      `D${doodad.typeId},${formatNumber(doodad.x)},${formatNumber(doodad.y)},${formatNumber(doodad.rotation)}`,
    );
  }
  const bytes = new TextEncoder().encode(lines.join("\n"));
  const digest = globalThis.crypto?.subtle
    ? new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))
    : sha256(bytes);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** W3E tile top-left or DOO center -> Web coordinate using runtime bounds origin. */
export function sourceToWebPoint(
  sourceX: number,
  sourceY: number,
  runtimeBounds: RenderBounds,
): { x: number; y: number } {
  return {
    x: (sourceX - runtimeBounds[0]) / RENDER_SCALE_DIVISOR,
    y: (sourceY - runtimeBounds[1]) / RENDER_SCALE_DIVISOR,
  };
}

/** Convert JASS camera bounds with the same origin and /8 scale as terrain. */
export function cameraBoundsToWeb(
  cameraBounds: { minX: number; minY: number; maxX: number; maxY: number },
  runtimeBounds: RenderBounds,
): { x: number; y: number; width: number; height: number } {
  const topLeft = sourceToWebPoint(cameraBounds.minX, cameraBounds.minY, runtimeBounds);
  const bottomRight = sourceToWebPoint(cameraBounds.maxX, cameraBounds.maxY, runtimeBounds);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}
