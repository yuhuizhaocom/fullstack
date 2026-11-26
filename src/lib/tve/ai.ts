// 单机 AI：精灵建造/升级/技能 + 巨魔打野/购买/技能。AI 只产出候选动作，由引擎校验执行。

import {
  BASE_ROOMS,
  BUILD_SPECS,
  DIFFICULTIES,
  RECALL_SCROLL,
  SHOP_ITEMS,
  TILE,
  TOWER_BRANCH_LEVEL,
  TOWER_BRANCHES,
  TROLL_BASE,
  WALL_BRANCH_LEVEL,
  WALL_BRANCHES,
  isTerrainBlocked,
} from "./config";
import { buildNav, findPath, pathToWorld, type NavGrid } from "./nav";
import type { Building, BuildingKind, Elf, ElfSkill, GameState, Point, RoomInfo, RoomSide, ShopKey, Troll } from "./types";

export type ElfAction =
  | { type: "build"; kind: BuildingKind; gx: number; gy: number }
  | { type: "upgrade"; id: number }
  | { type: "convert"; id: number; kind: BuildingKind }
  | { type: "wood" };

export type TrollAction =
  | { type: "shop"; key: ShopKey }
  | { type: "hut" }
  | { type: "windwalk" }
  | { type: "berserk" }
  | { type: "recall" }
  | { type: "buyRecall" }
  | { type: "useRecall" };

// 房间内部 11×11（相对生命之树中心 dx/dy ∈ [-4,6]），生命之树占据 [-1,0]×[-1,0]
const TENT_SLOTS: [number, number][] = [
  [-3, 2],
  [-3, 3],
  [-2, 2],
  [-2, 3],
  [2, 2],
  [3, 2],
  [2, 3],
  [3, 3],
  [2, -3],
  [3, -3],
  [-3, -3],
  [-2, -3],
];

/** 防御塔贴近入口一侧摆放，才能覆盖唯一的门口 */
function gateTowerSlots(side: RoomSide): [number, number][] {
  if (side === "east") return [[6, 0], [6, -2], [6, 3], [5, 0], [4, 0]];
  if (side === "west") return [[-4, 0], [-4, -2], [-4, 3], [-3, 0], [-2, 0]];
  if (side === "south") return [[0, 6], [-2, 6], [4, 6], [0, 5], [0, 4]];
  return [[0, -4], [-2, -4], [4, -4], [0, -3], [0, -2]];
}

const SUPPORT_SLOTS: [number, number][] = [
  [4, 4],
  [5, 4],
  [4, 5],
  [-3, 4],
  [4, -3],
];

const GOLD_SLOTS: [number, number][] = [
  [-3, 5],
  [5, 5],
  [5, -3],
  [-4, -3],
];

const navCache = new WeakMap<GameState, { key: string; nav: NavGrid }>();

function getNav(state: GameState): NavGrid {
  const alive = state.buildings.reduce((sum, b) => sum + (b.alive ? 1 : 0), 0);
  const key = `${state.buildings.length}:${alive}`;
  const cached = navCache.get(state);
  if (cached && cached.key === key) return cached.nav;
  const nav = buildNav(state);
  navCache.set(state, { key, nav });
  return nav;
}

function treeOf(state: GameState, elf: Elf): Building | undefined {
  return elf.treeId >= 0 ? state.buildings.find((b) => b.id === elf.treeId && b.alive) : undefined;
}

/** 生命之树所在的房间（精灵可能出生在任意房间，也可能去别的房间发展） */
function roomOf(tree: Building): RoomInfo | undefined {
  const gx = tree.gx + 1;
  const gy = tree.gy + 1;
  return BASE_ROOMS.find((r) => gx > r.gx0 && gx < r.gx1 && gy > r.gy0 && gy < r.gy1);
}

function occupied(state: GameState, gx: number, gy: number, size: number): boolean {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (isTerrainBlocked(gx + x, gy + y)) return true;
      for (const b of state.buildings) {
        if (!b.alive) continue;
        if (gx + x >= b.gx && gx + x < b.gx + b.size && gy + y >= b.gy && gy + y < b.gy + b.size) return true;
      }
    }
  }
  return false;
}

function trySlot(
  state: GameState,
  elf: Elf,
  kind: BuildingKind,
  slots: [number, number][],
  baseTx: number,
  baseTy: number,
  room?: RoomInfo,
): { gx: number; gy: number } | null {
  const size = BUILD_SPECS[kind].size;
  for (const [dx, dy] of slots) {
    let gx = baseTx + dx;
    let gy = baseTy + dy;
    // 房间大小不一：把候选点位夹回房间内部，避免摆到外墙上
    if (room) {
      gx = Math.max(room.gx0 + 1, Math.min(room.gx1 - size, gx));
      gy = Math.max(room.gy0 + 1, Math.min(room.gy1 - size, gy));
    }
    if (occupied(state, gx, gy, size)) continue;
    return { gx, gy };
  }
  return null;
}

function countKind(buildings: Building[], owner: number, kinds: BuildingKind[]): number {
  return buildings.filter((b) => b.alive && b.team === "elf" && b.owner === owner && kinds.includes(b.kind)).length;
}

/** 生成精灵 AI 的候选动作（按优先级），引擎逐条尝试执行 */
export function planElfActions(state: GameState, elfId: number): ElfAction[] {
  const elf = state.elves[elfId];
  if (!elf || !elf.alive) return [];
  const tree = treeOf(state, elf);
  if (!tree) return [];
  const baseTx = tree.gx + 1;
  const baseTy = tree.gy + 1;
  const actions: ElfAction[] = [];
  const mine = state.buildings.filter((b) => b.alive && b.team === "elf" && b.owner === elfId);
  const room = roomOf(tree);

  // 1. 前期靠小精灵伐木即可；木材真的见底且经济已经起来时才从市场补货，
  //    否则会把开局金币全换成木材，导致造不出帐篷、永远没有收入
  if (elf.wood < 20 && state.time > 90 && elf.gold >= state.woodPrice + 300) {
    actions.push({ type: "wood" });
  }

  // 2. 房间有 3 个入口，先用普通墙全部堵住（原作开局先堵口），再逐步升级
  if (room) {
    const wallLevel = BUILD_SPECS.wall.levels[0];
    for (const gate of room.gates) {
      const wall = mine.find(
        (b) => (b.gx === gate.gx && b.gy === gate.gy) || (b.gx === gate.gx2 && b.gy === gate.gy2),
      );
      if (!wall) {
        if (elf.gold >= wallLevel.cost && elf.wood >= wallLevel.wood) {
          actions.push({ type: "build", kind: "wall", gx: gate.gx, gy: gate.gy });
        }
      } else if (wall.level < BUILD_SPECS[wall.kind].levels.length) {
        const next = BUILD_SPECS[wall.kind].levels[wall.level];
        if (elf.gold >= next.cost + 40 && elf.wood >= next.wood) actions.push({ type: "upgrade", id: wall.id });
      }
    }
  }

  // 2.5 预警哨：放在入口内侧，破隐并提前预警（前期一座，中期补到两座）
  const watchCap = state.time > 180 ? 2 : 1;
  if (room && countKind(state.buildings, elfId, ["watch"]) < watchCap && elf.gold >= BUILD_SPECS.watch.levels[0].cost + 60) {
    const inward: Record<RoomSide, [number, number]> = {
      east: [-1, 0],
      west: [1, 0],
      south: [0, -1],
      north: [0, 1],
    };
    for (const gate of room.gates) {
      const [dx, dy] = inward[gate.side];
      const slot = !occupied(state, gate.gx + dx, gate.gy + dy, 1)
        ? { gx: gate.gx + dx, gy: gate.gy + dy }
        : !occupied(state, gate.gx2 + dx, gate.gy2 + dy, 1)
          ? { gx: gate.gx2 + dx, gy: gate.gy2 + dy }
          : null;
      if (slot) {
        actions.push({ type: "build", kind: "watch", gx: slot.gx, gy: slot.gy });
        break;
      }
    }
  }

  // 3. 帐篷：每位精灵只有一座，靠升级提升收入
  const tents = mine.filter((b) => b.kind === "tent");
  if (tents.length === 0 && elf.gold >= BUILD_SPECS.tent.levels[0].cost) {
    const slot = trySlot(state, elf, "tent", TENT_SLOTS, baseTx, baseTy, room);
    if (slot) actions.push({ type: "build", kind: "tent", gx: slot.gx, gy: slot.gy });
  }

  // 3.5 经济优先：先升帐篷（收入翻倍），再升生命之树解锁更高的帐篷等级
  for (const tent of tents.sort((a, b) => a.level - b.level)) {
    if (tent.level >= BUILD_SPECS.tent.levels.length) continue;
    const next = BUILD_SPECS.tent.levels[tent.level];
    if (elf.gold >= next.cost + 30 && elf.wood >= next.wood) {
      actions.push({ type: "upgrade", id: tent.id });
      break;
    }
  }
  if (tree.level < BUILD_SPECS.tree.levels.length) {
    const next = BUILD_SPECS.tree.levels[tree.level];
    if (elf.gold >= next.cost && elf.wood >= next.wood) actions.push({ type: "upgrade", id: tree.id });
  }

  // 4. 防御塔：先造普通塔，之后可在面板里选择方向
  const towers = mine.filter((b) => ["arrow", "goldtower", "gun", "poison", "ice", "moon"].includes(b.kind));
  if (towers.length < 3) {
    const order: BuildingKind[] = ["arrow", "arrow", "arrow"];
    const kind = order[Math.min(towers.length, order.length - 1)];
    const level = BUILD_SPECS[kind].levels[0];
    if (elf.gold >= level.cost && elf.wood >= level.wood) {
      const slot = trySlot(state, elf, kind, gateTowerSlots(room?.side ?? "south"), baseTx, baseTy, room);
      if (slot) actions.push({ type: "build", kind, gx: slot.gx, gy: slot.gy });
    }
  }

  // 5. 工人雇佣所与塔研究所
  if (countKind(state.buildings, elfId, ["workshop"]) === 0 && elf.gold >= 200) {
    const slot = trySlot(state, elf, "workshop", SUPPORT_SLOTS, baseTx, baseTy, room);
    if (slot) actions.push({ type: "build", kind: "workshop", gx: slot.gx, gy: slot.gy });
  }
  if (towers.length >= 3 && countKind(state.buildings, elfId, ["lab"]) === 0 && elf.gold >= 300) {
    const slot = trySlot(state, elf, "lab", SUPPORT_SLOTS, baseTx, baseTy, room);
    if (slot) actions.push({ type: "build", kind: "lab", gx: slot.gx, gy: slot.gy });
  }

  // 6. 金矿：由一只小精灵化成，因此至少保留两只（一只继续伐木）
  const wispCount = state.wisps.filter((w) => w.owner === elfId).length;
  if (countKind(state.buildings, elfId, ["goldmine"]) < 2 && wispCount >= 2 && elf.gold >= 300 && elf.wood >= 60) {
    const slot = trySlot(state, elf, "goldmine", GOLD_SLOTS, baseTx, baseTy, room);
    if (slot) actions.push({ type: "build", kind: "goldmine", gx: slot.gx, gy: slot.gy });
  }

  // 7. 塔升级
  const upgradeOrder = ["arrow", "goldtower", "gun", "ice", "poison", "moon"];
  for (const building of towers.sort((a, b) => a.level - b.level)) {
    if (!upgradeOrder.includes(building.kind)) continue;
    if (building.level >= BUILD_SPECS[building.kind].levels.length) continue;
    const next = BUILD_SPECS[building.kind].levels[building.level];
    if (elf.gold >= next.cost + 80 && elf.wood >= next.wood) actions.push({ type: "upgrade", id: building.id });
  }

  // 8. 普通墙 / 普通塔到达分叉等级后选择强化方向；选定后沿分支继续升级
  const convertedWalls = mine.filter((b) => WALL_BRANCHES.some((o) => o.kind === b.kind)).length;
  const branchWall = mine.find((b) => b.kind === "wall" && b.level >= WALL_BRANCH_LEVEL && b.buildTimer <= 0);
  if (branchWall) {
    const prefer: BuildingKind =
      elf.gold >= 900 && elf.wood >= 180
        ? "concrete"
        : convertedWalls % 3 === 1
          ? "thorn"
          : convertedWalls % 3 === 2
            ? "icewall"
            : "stone";
    const option = WALL_BRANCHES.find((o) => o.kind === prefer);
    if (option && elf.gold >= option.gold && elf.wood >= option.wood) {
      actions.push({ type: "convert", id: branchWall.id, kind: prefer });
    }
  }

  const convertedTowers = mine.filter((b) => TOWER_BRANCHES.some((o) => o.kind === b.kind)).length;
  const branchTower = mine.find((b) => b.kind === "arrow" && b.level >= TOWER_BRANCH_LEVEL && b.buildTimer <= 0);
  if (branchTower) {
    const prefer: BuildingKind =
      elf.gold >= 1100 && elf.wood >= 240
        ? "moon"
        : convertedTowers % 3 === 1
          ? "poison"
          : convertedTowers % 3 === 2
            ? "ice"
            : "gun";
    const option = TOWER_BRANCHES.find((o) => o.kind === prefer);
    if (option && elf.gold >= option.gold && elf.wood >= option.wood) {
      actions.push({ type: "convert", id: branchTower.id, kind: prefer });
    }
  }

  return actions;
}

/** 精灵 AI 技能：被逼近时缠绕，血量低时闪现，准备逃跑时开黑夜 */
export function planElfSkill(state: GameState, elf: Elf): ElfSkill | null {
  let nearest: Troll | null = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const t of state.trolls) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - elf.x, t.y - elf.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = t;
    }
  }
  if (!nearest) return null;
  if (nearestDist < 300 && elf.cooldowns.entangle <= 0) return "entangle";
  if (nearestDist < 260 && elf.cooldowns.silence <= 0) return "silence";
  if (nearestDist < 150 && elf.cooldowns.blink <= 0) return "blink";
  if (nearestDist < 420 && elf.cooldowns.haste <= 0) return "haste";
  const wallsHurt = state.buildings.some(
    (b) =>
      b.alive &&
      b.team === "elf" &&
      b.owner === elf.id &&
      BUILD_SPECS[b.kind].category === "wall" &&
      b.hp < b.maxHp * 0.5,
  );
  if (wallsHurt && elf.cooldowns.wallguard <= 0) return "wallguard";
  return null;
}

/** 巨魔 AI 购买与技能 */
export function planTrollActions(state: GameState, troll: Troll): TrollAction[] {
  if (!troll.alive || troll.wolf) return [];
  const actions: TrollAction[] = [];
  const hut = troll.hutId >= 0 ? state.buildings.find((b) => b.id === troll.hutId && b.alive) : undefined;
  const hutDist = hut ? Math.hypot(hut.x - troll.x, hut.y - troll.y) : 0;
  const inDanger = troll.hp < troll.maxHp * 0.35;
  const farFromHome = !!hut && hutDist > 900;

  // 危急且远离小屋：有卷轴立刻瞬移，没有就买；钱不够则读条回城（可能被打断）
  if (inDanger && farFromHome) {
    if (troll.recallScrolls > 0) actions.push({ type: "useRecall" });
    else if (troll.gold >= RECALL_SCROLL.cost + 100) actions.push({ type: "buyRecall" });
    else if (troll.recallCd <= 0 && troll.recallChannel <= 0 && troll.silenceTime <= 0) actions.push({ type: "recall" });
  }

  // 贴近建筑准备拆迁时开狂暴，提高拆墙速度
  if (!inDanger && troll.berserkCd <= 0 && troll.berserkTime <= 0) {
    const nearBuilding = state.buildings.some(
      (b) => b.alive && b.team === "elf" && Math.hypot(b.x - troll.x, b.y - troll.y) < 520,
    );
    if (nearBuilding) actions.push({ type: "berserk" });
  }

  if (hut) {
    const levels = BUILD_SPECS.hut.levels;
    if (hut.level < levels.length) {
      const next = levels[hut.level];
      if (troll.gold >= next.cost + 260) actions.push({ type: "hut" });
    }
  }

  if (troll.hp < troll.maxHp * 0.35 && troll.windwalkCd <= 0 && troll.windwalk <= 0) {
    actions.push({ type: "windwalk" });
  }

  const priorities: ShopKey[] = ["weapon", "boots", "armor", "gloves", "vitality", "regen"];
  let bought = 0;
  for (const key of priorities) {
    if (bought >= 2) break;
    const level = troll.items[key];
    const spec = SHOP_ITEMS[key];
    if (level >= spec.costs.length) continue;
    const cost = spec.costs[level];
    if (troll.gold >= cost + 120) {
      actions.push({ type: "shop", key });
      bought += 1;
    }
  }
  return actions;
}

export interface TrollMove {
  mx: number;
  my: number;
  /** 隐身贴到目标时手动出手（会提前显形） */
  attack?: boolean;
}

/** 巨魔 AI：白天拆最薄弱建筑刷金，残血回小屋，被围时开疾风步 */
export function planTrollMove(state: GameState, troll: Troll, dt: number): TrollMove {
  const diff = DIFFICULTIES[state.difficulty];
  troll.decideTimer -= dt;
  const hut = troll.hutId >= 0 ? state.buildings.find((b) => b.id === troll.hutId && b.alive) : undefined;

  if (troll.decideTimer <= 0) {
    troll.decideTimer = 0.8 * diff.aiInterval;
    const retreating = troll.hp < troll.maxHp * 0.32 && !!hut;
    if (retreating) {
      troll.targetBuilding = hut!.id;
      troll.targetElf = -1;
    } else {
      let bestBuilding = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const b of state.buildings) {
        if (!b.alive || b.team !== "elf") continue;
        const d = Math.hypot(b.x - troll.x, b.y - troll.y);
        if (d < bestDist) {
          bestDist = d;
          bestBuilding = b.id;
        }
      }
      if (bestBuilding >= 0 && bestDist < 4200) {
        troll.targetBuilding = bestBuilding;
        troll.targetElf = -1;
      } else {
        troll.targetBuilding = -1;
        let bestElf = -1;
        let elfDist = Number.POSITIVE_INFINITY;
        for (const elf of state.elves) {
          if (!elf.alive) continue;
          const d = Math.hypot(elf.x - troll.x, elf.y - troll.y);
          if (d < elfDist) {
            elfDist = d;
            bestElf = elf.id;
          }
        }
        troll.targetElf = bestElf;
      }
    }
  }

  let goal: Point | null = null;
  if (troll.targetBuilding >= 0) {
    const b = state.buildings.find((item) => item.id === troll.targetBuilding && item.alive);
    if (b) goal = { x: b.x, y: b.y };
  }
  if (!goal && troll.targetElf >= 0) {
    const elf = state.elves[troll.targetElf];
    if (elf && elf.alive) goal = { x: elf.x, y: elf.y };
  }
  if (!goal && hut) goal = { x: hut.x, y: hut.y + TILE };
  if (!goal) return { mx: 0, my: 0 };

  // 目标在已封口的房间内时，先拆掉堵住入口的那块墙，否则会贴着外墙干瞪眼
  for (const room of BASE_ROOMS) {
    const inside =
      goal.x > (room.gx0 + 1) * TILE &&
      goal.x < room.gx1 * TILE &&
      goal.y > (room.gy0 + 1) * TILE &&
      goal.y < room.gy1 * TILE;
    if (!inside) continue;
    // 房间有 3 个入口：找距离巨魔最近的、已被堵住的入口墙
    let gate: Building | undefined;
    let gateDist = Number.POSITIVE_INFINITY;
    for (const g of room.gates) {
      const wall = state.buildings.find(
        (b) =>
          b.alive &&
          b.team === "elf" &&
          ((b.gx === g.gx && b.gy === g.gy) || (b.gx === g.gx2 && b.gy === g.gy2)),
      );
      if (!wall) continue;
      const d = Math.hypot(wall.x - troll.x, wall.y - troll.y);
      if (d < gateDist) {
        gateDist = d;
        gate = wall;
      }
    }
    if (gate) {
      goal = { x: gate.x, y: gate.y };
      troll.targetBuilding = gate.id;
      troll.targetElf = -1;
    }
    break;
  }

  troll.pathTimer -= dt;
  if (troll.pathTimer <= 0 || !troll.path) {
    troll.pathTimer = 1.4;
    const nav = getNav(state);
    const raw = findPath(nav, troll.x, troll.y, goal.x, goal.y);
    troll.path = raw ? pathToWorld(raw) : null;
  }

  let aim = goal;
  if (troll.path && troll.path.length > 0) {
    while (troll.path.length > 0) {
      const waypoint = troll.path[0];
      if (Math.hypot(waypoint.x - troll.x, waypoint.y - troll.y) < TILE * 0.75) {
        troll.path.shift();
      } else {
        aim = waypoint;
        break;
      }
    }
    if (troll.path.length === 0) {
      troll.path = null;
      aim = goal;
    }
  }

  let dx = aim.x - troll.x;
  let dy = aim.y - troll.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  troll.stuck += dt;
  if (troll.stuck >= 0.9) {
    const moved = Math.hypot(troll.x - troll.lastX, troll.y - troll.lastY);
    if (moved < 12) {
      troll.path = null;
      troll.pathTimer = 0.35;
    }
    troll.lastX = troll.x;
    troll.lastY = troll.y;
    troll.stuck = 0;
  }

  // 隐身状态不会自动攻击：目标进入攻击距离时手动出手（提前显形）
  const reach = (troll.wolf ? 50 : TROLL_BASE.range) + (troll.wolf ? 18 : TROLL_BASE.radius);
  const attack = troll.windwalk > 0 && Math.hypot(goal.x - troll.x, goal.y - troll.y) <= reach + 12;
  return { mx: dx, my: dy, attack };
}
