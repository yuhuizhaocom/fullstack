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

/** Validate lazy-loaded render data before any geometry reaches Phaser. */
export function validateRenderGeometry(value: unknown): RenderGeometry {
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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lines.join("\n")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
