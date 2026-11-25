export const TILE = 32;

export type RoomId = "world" | "forest" | "cave" | "ruins" | "volcano";

export type RoomTheme = "overworld" | "forest" | "cave" | "ruins" | "volcano";

export type RoomConfig = {
  id: RoomId;
  name: string;
  icon: string;
  desc: string;
  w: number;
  h: number;
  seed: number;
  theme: RoomTheme;
  dungeon: boolean;
  unlockLevel: number;
  spawnTx: number;
  spawnTy: number;
  portalTx: number;
  portalTy: number;
  monsterCount: number;
  monsterKinds: string[];
  bossKind?: string;
  bossTx?: number;
  bossTy?: number;
};

export type PortalDef = {
  id: string;
  room: RoomId;
  target: RoomId;
  tx: number;
  ty: number;
  label: string;
  icon: string;
};

export type NpcRole = "quest" | "shop" | "equip";

export type NpcDef = {
  id: string;
  room: RoomId;
  tx: number;
  ty: number;
  name: string;
  title: string;
  icon: string;
  color: string;
  role: NpcRole;
  quests: string[];
};

/** 开放世界为原来的 10 倍面积（64x48 -> 202x152） */
export const ROOMS: Record<RoomId, RoomConfig> = {
  world: {
    id: "world",
    name: "翡翠大陆",
    icon: "🌍",
    desc: "广袤的开放世界，村庄、任务与副本入口都在这里",
    w: 202,
    h: 152,
    seed: 0,
    theme: "overworld",
    dungeon: false,
    unlockLevel: 1,
    spawnTx: 101,
    spawnTy: 76,
    portalTx: 101,
    portalTy: 76,
    monsterCount: 200,
    bossKind: "ancient_dragon",
    bossTx: 185,
    bossTy: 24,
    monsterKinds: [
      "slime",
      "wolf",
      "goblin",
      "spider",
      "bat",
      "skeleton",
      "golem",
      "ghost",
      "gargoyle",
      "death_knight",
      "frost_wolf",
      "frost_giant",
      "lavabeast",
      "demon",
      "shadow_lord",
      "void_apostle",
      "lava_tyrant",
      "abyss_dragon",
    ],
  },
  forest: {
    id: "forest",
    name: "迷雾森林",
    icon: "🌲",
    desc: "新手副本，狼群与树精盘踞在林间",
    w: 56,
    h: 42,
    seed: 911,
    theme: "forest",
    dungeon: true,
    unlockLevel: 1,
    spawnTx: 28,
    spawnTy: 37,
    portalTx: 28,
    portalTy: 33,
    monsterCount: 24,
    monsterKinds: ["slime", "wolf", "goblin"],
    bossKind: "wolfking",
    bossTx: 28,
    bossTy: 8,
  },
  cave: {
    id: "cave",
    name: "幽暗洞窟",
    icon: "🕳️",
    desc: "潮湿的地下洞穴，蝙蝠与石魔的巢穴",
    w: 56,
    h: 42,
    seed: 1377,
    theme: "cave",
    dungeon: true,
    unlockLevel: 5,
    spawnTx: 28,
    spawnTy: 37,
    portalTx: 28,
    portalTy: 33,
    monsterCount: 26,
    monsterKinds: ["bat", "spider", "golem"],
    bossKind: "cavegolem",
    bossTx: 28,
    bossTy: 8,
  },
  ruins: {
    id: "ruins",
    name: "失落遗迹",
    icon: "🏛️",
    desc: "被遗忘的古代神殿，亡灵守卫着尘封的宝藏",
    w: 56,
    h: 42,
    seed: 2039,
    theme: "ruins",
    dungeon: true,
    unlockLevel: 10,
    spawnTx: 28,
    spawnTy: 37,
    portalTx: 28,
    portalTy: 33,
    monsterCount: 28,
    monsterKinds: ["skeleton", "ghost", "gargoyle"],
    bossKind: "guardian",
    bossTx: 28,
    bossTy: 8,
  },
  volcano: {
    id: "volcano",
    name: "熔岩火山",
    icon: "🌋",
    desc: "炎龙的领地，烈焰与熔岩吞噬一切",
    w: 56,
    h: 42,
    seed: 3121,
    theme: "volcano",
    dungeon: true,
    unlockLevel: 16,
    spawnTx: 28,
    spawnTy: 37,
    portalTx: 28,
    portalTy: 33,
    monsterCount: 30,
    monsterKinds: ["fire", "demon", "lavabeast"],
    bossKind: "dragon",
    bossTx: 28,
    bossTy: 8,
  },
};

export const WORLD_PORTALS: PortalDef[] = [
  { id: "p_forest", room: "world", target: "forest", tx: 86, ty: 61, label: "迷雾森林", icon: "🌲" },
  { id: "p_cave", room: "world", target: "cave", tx: 116, ty: 60, label: "幽暗洞窟", icon: "🕳️" },
  { id: "p_ruins", room: "world", target: "ruins", tx: 83, ty: 92, label: "失落遗迹", icon: "🏛️" },
  { id: "p_volcano", room: "world", target: "volcano", tx: 119, ty: 93, label: "熔岩火山", icon: "🌋" },
];

/** 村庄 NPC，任务、商店、装备都在游戏内交互 */
export const NPCS: NpcDef[] = [
  {
    id: "npc_elder",
    room: "world",
    tx: 106,
    ty: 74,
    name: "村长·艾琳",
    title: "村庄长者",
    icon: "🧓",
    color: "#facc15",
    role: "quest",
    quests: ["q_slime", "q_wolf"],
  },
  {
    id: "npc_warden",
    room: "world",
    tx: 96,
    ty: 74,
    name: "守望者·卡洛",
    title: "副本守望者",
    icon: "🛡️",
    color: "#38bdf8",
    role: "quest",
    quests: ["q_forest", "q_cave", "q_ruins", "q_dragon"],
  },
  {
    id: "npc_merchant",
    room: "world",
    tx: 105,
    ty: 80,
    name: "商人·米娅",
    title: "杂货商人",
    icon: "🧝",
    color: "#34d399",
    role: "shop",
    quests: [],
  },
  {
    id: "npc_smith",
    room: "world",
    tx: 97,
    ty: 80,
    name: "铁匠·格里芬",
    title: "装备锻造",
    icon: "🧔",
    color: "#fb923c",
    role: "equip",
    quests: [],
  },
];

export function portalsForRoom(room: RoomId): PortalDef[] {
  if (room === "world") return WORLD_PORTALS;
  const cfg = ROOMS[room];
  return [
    {
      id: `p_exit_${room}`,
      room,
      target: "world",
      tx: cfg.portalTx,
      ty: cfg.portalTy,
      label: "返回大陆",
      icon: "🌀",
    },
  ];
}

export function roomConfig(room: RoomId): RoomConfig {
  return ROOMS[room] ?? ROOMS.world;
}

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === "string" && value in ROOMS;
}

export function roomSpawn(room: RoomId = "world"): { x: number; y: number } {
  const cfg = roomConfig(room);
  return {
    x: cfg.spawnTx * TILE + TILE / 2,
    y: cfg.spawnTy * TILE + TILE / 2,
  };
}

/** 兼容旧代码：开放世界尺寸与出生点 */
export const WORLD_W = ROOMS.world.w;
export const WORLD_H = ROOMS.world.h;
export const SPAWN_X = ROOMS.world.spawnTx * TILE + TILE / 2;
export const SPAWN_Y = ROOMS.world.spawnTy * TILE + TILE / 2;

export type Terrain = "grass" | "tree" | "water" | "rock" | "flower";

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 53.37) * 43758.5453;
  return n - Math.floor(n);
}

/** 开放世界湖泊按比例分布，保证每个世界一致（已整体缩小，减少通行阻碍） */
const LAKES = [
  { fx: 0.22, fy: 0.28, r: 7 },
  { fx: 0.7, fy: 0.3, r: 9 },
  { fx: 0.34, fy: 0.72, r: 8 },
  { fx: 0.79, fy: 0.75, r: 6 },
  { fx: 0.5, fy: 0.16, r: 5 },
];

function nearVillage(tx: number, ty: number): boolean {
  return Math.hypot(tx - ROOMS.world.spawnTx, ty - ROOMS.world.spawnTy) <= 7;
}

function nearPoint(tx: number, ty: number, px: number, py: number, radius: number): boolean {
  return Math.hypot(tx - px, ty - py) <= radius;
}

function nearWorldLandmark(tx: number, ty: number, radius: number): boolean {
  for (const portal of WORLD_PORTALS) {
    if (nearPoint(tx, ty, portal.tx, portal.ty, radius)) return true;
  }
  for (const npc of NPCS) {
    if (nearPoint(tx, ty, npc.tx, npc.ty, radius)) return true;
  }
  return false;
}

function computeTerrainAt(tx: number, ty: number, room: RoomId = "world"): Terrain {
  const cfg = roomConfig(room);

  if (tx < 1 || ty < 1 || tx >= cfg.w - 1 || ty >= cfg.h - 1) return "tree";

  if (cfg.dungeon) {
    // 副本入口、BOSS 场地保持开阔
    if (nearPoint(tx, ty, cfg.spawnTx, cfg.spawnTy, 4)) {
      return hash2(tx, ty, cfg.seed) < 0.25 ? "flower" : "grass";
    }
    if (nearPoint(tx, ty, cfg.portalTx, cfg.portalTy, 3)) return "grass";
    if (cfg.bossTx !== undefined && cfg.bossTy !== undefined) {
      if (nearPoint(tx, ty, cfg.bossTx, cfg.bossTy, 5)) return "grass";
    }

    const h = hash2(tx, ty, cfg.seed);
    if (cfg.theme === "forest") {
      if (h < 0.1) return "tree";
      if (h < 0.13) return "rock";
      if (h < 0.26) return "flower";
      return "grass";
    }
    if (cfg.theme === "cave") {
      if (h < 0.09) return "rock";
      if (h < 0.12) return "water";
      return "grass";
    }
    if (cfg.theme === "volcano") {
      if (h < 0.1) return "rock";
      if (h < 0.14) return "water";
      return "grass";
    }
    // ruins
    if (h < 0.09) return "rock";
    if (h < 0.11) return "tree";
    if (h < 0.2) return "flower";
    return "grass";
  }

  // 开放世界村庄安全区
  if (nearVillage(tx, ty)) {
    return hash2(tx, ty, 5) < 0.16 ? "flower" : "grass";
  }
  // 副本入口与 NPC 周围保持开阔
  if (nearWorldLandmark(tx, ty, 3.5)) {
    return hash2(tx, ty, 7) < 0.2 ? "flower" : "grass";
  }

  for (const lake of LAKES) {
    const lx = lake.fx * cfg.w;
    const ly = lake.fy * cfg.h;
    if (Math.hypot(tx - lx, ty - ly) < lake.r) return "water";
  }

  // 障碍整体稀疏化，让大地图更开阔、跑图更顺畅
  const h = hash2(tx, ty, cfg.seed);
  if (h < 0.052) return "tree";
  if (h < 0.082) return "rock";
  if (h < 0.2) return "flower";
  return "grass";
}

const TERRAIN_CODES: Terrain[] = ["grass", "tree", "water", "rock", "flower"];
const TERRAIN_INDEX: Record<Terrain, number> = {
  grass: 0,
  tree: 1,
  water: 2,
  rock: 3,
  flower: 4,
};

/** 地形网格缓存：每个房间只计算一次，避免逐帧/逐次碰撞重复计算噪声 */
const TERRAIN_GRIDS = new Map<RoomId, Uint8Array>();

function terrainGrid(room: RoomId): Uint8Array {
  let grid = TERRAIN_GRIDS.get(room);
  if (grid) return grid;
  const cfg = roomConfig(room);
  grid = new Uint8Array(cfg.w * cfg.h);
  for (let ty = 0; ty < cfg.h; ty += 1) {
    for (let tx = 0; tx < cfg.w; tx += 1) {
      grid[ty * cfg.w + tx] = TERRAIN_INDEX[computeTerrainAt(tx, ty, room)];
    }
  }
  TERRAIN_GRIDS.set(room, grid);
  return grid;
}

export function terrainAt(tx: number, ty: number, room: RoomId = "world"): Terrain {
  const cfg = roomConfig(room);
  if (tx < 0 || ty < 0 || tx >= cfg.w || ty >= cfg.h) return "tree";
  return TERRAIN_CODES[terrainGrid(room)[ty * cfg.w + tx]] ?? "grass";
}

export function isBlockedTile(tx: number, ty: number, room: RoomId = "world"): boolean {
  const terrain = terrainAt(tx, ty, room);
  return terrain === "tree" || terrain === "water" || terrain === "rock";
}

/** 以像素坐标判断碰撞，radius 为角色半宽 */
export function isBlockedAt(
  x: number,
  y: number,
  radius = 9,
  room: RoomId = "world"
): boolean {
  const points: [number, number][] = [
    [x - radius, y - radius],
    [x + radius, y - radius],
    [x - radius, y + radius],
    [x + radius, y + radius],
  ];
  return points.some(([px, py]) =>
    isBlockedTile(Math.floor(px / TILE), Math.floor(py / TILE), room)
  );
}

export function clampToWorld(
  x: number,
  y: number,
  room: RoomId = "world"
): { x: number; y: number } {
  const cfg = roomConfig(room);
  return {
    x: Math.max(TILE, Math.min(cfg.w * TILE - TILE, x)),
    y: Math.max(TILE, Math.min(cfg.h * TILE - TILE, y)),
  };
}

function spawnBlocked(tx: number, ty: number, room: RoomId): boolean {
  if (room !== "world") return false;
  return nearWorldLandmark(tx, ty, 5) || nearVillage(tx, ty);
}

/** 随机取一个可走的格子中心，用于刷怪 */
export function randomOpenPoint(
  room: RoomId = "world",
  minTx = 3,
  maxTx = roomConfig(room).w - 3,
  minTy = 3,
  maxTy = roomConfig(room).h - 3
): { x: number; y: number } {
  for (let i = 0; i < 60; i += 1) {
    const tx = minTx + Math.floor(Math.random() * Math.max(1, maxTx - minTx));
    const ty = minTy + Math.floor(Math.random() * Math.max(1, maxTy - minTy));
    if (!isBlockedTile(tx, ty, room) && !spawnBlocked(tx, ty, room)) {
      return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
    }
  }
  return roomSpawn(room);
}

/** 在指定点附近找一个可走点（用于固定 BOSS 出生点） */
export function nearestOpenPoint(
  tx: number,
  ty: number,
  room: RoomId = "world"
): { x: number; y: number } {
  for (let radius = 0; radius < 10; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (!isBlockedTile(tx + dx, ty + dy, room)) {
          return { x: (tx + dx) * TILE + TILE / 2, y: (ty + dy) * TILE + TILE / 2 };
        }
      }
    }
  }
  return roomSpawn(room);
}

export function roomInfo(room: RoomId = "world") {
  const cfg = roomConfig(room);
  return {
    room,
    name: cfg.name,
    width: cfg.w,
    height: cfg.h,
    tile: TILE,
    spawn: roomSpawn(room),
    dungeon: cfg.dungeon,
    unlockLevel: cfg.unlockLevel,
    theme: cfg.theme,
  };
}
