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
  const grid: RuntimeGrid = Object.freeze({
    width: map.grid[0],
    height: map.grid[1],
    tileUnits: 128,
    world: Object.freeze([map.world[0], map.world[1]]) as unknown as readonly [number, number],
    bounds,
  });
  const troll = anchorSpawn(map, map.anchors.trollHouse ?? map.anchors.trollHouse0);
  if (!troll) throw new Error(`地图 ${map.id} 缺少巨魔出生点锚点`);
  // Map 4 has no lifeTree. Its first preplaced elf is valid only for DEFEND.
  const elfAnchor = map.id === 4 && rule === "DEFEND" ? map.anchors.elf0 : map.anchors.lifeTree;
  const elf = anchorSpawn(map, elfAnchor);
  const spawns = Object.freeze({ elf, troll });
  const pathing32 = buildPathing32(map);
  const pathing = Object.freeze({ ...map.pathing, origin: Object.freeze([...map.pathing.origin]) }) as Readonly<PathingMetadata>;
  const blocked128 = buildBuildGrid128FromPathing(map, pathing32);

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
