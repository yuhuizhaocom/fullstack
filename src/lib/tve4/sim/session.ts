import {
  DEFAULT_MAP_ID,
  MAP_CATALOG_VERSION,
  MAP_DEFINITIONS,
  type Anchor,
  type GridPoint,
  type MapDefinition,
  type PathingMetadata,
} from "../maps.generated";
import {
  buildBuildGrid128FromPathing,
  buildPathing32,
  loadMvpMap,
  runtimeBounds,
  type MapBounds,
} from "../map";
import type { Faction, GameOptions, Mode, Rule } from "../types";

export {
  buildBlocked,
  buildBuildGrid128,
  buildPathing32,
  loadMvpMap,
} from "../map";

export interface RuntimeGrid {
  readonly width: number;
  readonly height: number;
  readonly tileUnits: 128;
  readonly world: readonly [number, number];
  readonly bounds: MapBounds;
}

export interface SessionContext {
  readonly mapId: number;
  readonly catalogVersion: string;
  readonly seed: number;
  readonly mode: Mode;
  readonly rule: Rule;
  readonly playerFaction: Faction;
  readonly map: MapDefinition;
  readonly grid: RuntimeGrid;
  readonly spawns: Readonly<Record<Faction, Readonly<GridPoint> | null>>;
  readonly trollBase: Readonly<GridPoint>;
  readonly pathing: Readonly<PathingMetadata>;
  readonly pathing32: Uint8Array;
  /** Immutable-by-convention source derivation; GameState receives a copy. */
  readonly blocked128: Uint8Array;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function anchorSpawn(map: MapDefinition, anchor: Anchor | undefined): Readonly<GridPoint> | null {
  if (!anchor) return null;
  const gx = Math.floor((anchor.x - map.bounds[0]) / map.tileUnits);
  const gy = Math.floor((anchor.y - map.bounds[1]) / map.tileUnits);
  if (gx < 0 || gy < 0 || gx >= map.grid[0] || gy >= map.grid[1]) {
    throw new Error(`地图 ${map.id} 出生点锚点超出运行期边界`);
  }
  return Object.freeze({ gx, gy });
}

function centerSpawn(
  map: MapDefinition,
  pathing32: Uint8Array,
  blocked128: Uint8Array,
  bounds: MapBounds,
): Readonly<GridPoint> {
  const sourceX = (map.boundRect.minX + map.boundRect.maxX) / 2;
  const sourceY = (map.boundRect.minY + map.boundRect.maxY) / 2;
  const baseX = Math.floor((sourceX - bounds[0]) / map.tileUnits);
  const baseY = Math.floor((sourceY - bounds[1]) / map.tileUnits);
  const free = (gx: number, gy: number): boolean => {
    if (gx < 0 || gy < 0 || gx >= map.grid[0] || gy >= map.grid[1]) return false;
    if (blocked128[gy * map.grid[0] + gx] !== 0) return false;
    const worldX = bounds[0] + (gx + 0.5) * map.tileUnits;
    const worldY = bounds[1] + (gy + 0.5) * map.tileUnits;
    const px = Math.floor((worldX - map.pathing.origin[0]) / map.pathing.cellUnits);
    const py = Math.floor((worldY - map.pathing.origin[1]) / map.pathing.cellUnits);
    return px >= 0 && py >= 0 && px < map.pathing.width && py < map.pathing.height
      && (pathing32[py * map.pathing.width + px] & 0x02) === 0;
  };
  const maxRing = Math.max(map.grid[0], map.grid[1]);
  for (let ring = 0; ring <= maxRing; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const gx = baseX + dx;
        const gy = baseY + dy;
        if (free(gx, gy)) return Object.freeze({ gx, gy });
      }
    }
  }
  throw new Error(`地图 ${map.id} 中心附近没有可用出生格`);
}

export function createSession(options: GameOptions = {}): SessionContext {
  const mapId = options.mapId ?? DEFAULT_MAP_ID;
  loadMvpMap(mapId); // Validate before reading the generated definition.
  const map = deepFreeze(MAP_DEFINITIONS[mapId]);
  const mode = options.mode ?? "OLD";
  const rule = options.rule ?? "SINGLE";
  const playerFaction = options.playerFaction ?? "elf";
  const seed = options.seed ?? 1;
  const catalogVersion = options.catalogVersion ?? MAP_CATALOG_VERSION;
  const bounds = runtimeBounds(map);
  Object.freeze(bounds);
  const grid: RuntimeGrid = Object.freeze({
    width: map.grid[0],
    height: map.grid[1],
    tileUnits: 128,
    world: Object.freeze([map.world[0], map.world[1]]) as unknown as readonly [number, number],
    bounds,
  });
  const pathing32 = buildPathing32(map);
  const pathing = Object.freeze({ ...map.pathing, origin: Object.freeze([...map.pathing.origin]) }) as Readonly<PathingMetadata>;
  const blocked128 = buildBuildGrid128FromPathing(map, pathing32);
  const trollBase = anchorSpawn(map, map.anchors.trollHouse ?? map.anchors.trollHouse0);
  if (!trollBase) throw new Error(`地图 ${map.id} 缺少巨魔小屋锚点`);
  const center = centerSpawn(map, pathing32, blocked128, bounds);
  const spawns = Object.freeze({ elf: center, troll: center });

  return Object.freeze({
    mapId,
    catalogVersion,
    seed,
    mode,
    rule,
    playerFaction,
    map,
    grid,
    spawns,
    trollBase,
    pathing,
    pathing32,
    blocked128,
  });
}

export function requireSpawn(session: SessionContext, faction: Faction): Readonly<GridPoint> {
  const spawn = session.spawns[faction];
  if (!spawn) {
    throw new Error(`地图 ${session.mapId} 缺少可用的${faction === "elf" ? "精灵" : "巨魔"}出生点锚点`);
  }
  return spawn;
}
