// 单机 AI：精灵建造/升级/技能 + 巨魔打野/购买/技能。AI 只产出候选动作，由引擎校验执行。

import {
  BASE_ROOMS,
  BUILD_SPECS,
  DIFFICULTIES,
  SHOP_ITEMS,
  TILE,
  isTerrainBlocked,
} from "./config";
import { buildNav, findPath, pathToWorld, type NavGrid } from "./nav";
import type { Building, BuildingKind, Elf, ElfSkill, GameState, Point, RoomSide, ShopKey, Troll } from "./types";

export type ElfAction =
  | { type: "build"; kind: BuildingKind; gx: number; gy: number }
  | { type: "upgrade"; id: number }
  | { type: "wood" };

export type TrollAction =
  | { type: "shop"; key: ShopKey }
  | { type: "hut" }
  | { type: "windwalk" }
  | { type: "recall" };

// 房间内部 7×7（相对生命之树中心 dx/dy ∈ [-2,4]），生命之树占据 [-1,0]×[-1,0]
const TENT_SLOTS: [number, number][] = [
  [-2, 2],
  [-2, 3],
  [2, 2],
  [3, 2],
  [2, 3],
  [3, 3],
  [2, -2],
  [3, -2],
];

/** 防御塔贴近入口一侧摆放，才能覆盖唯一的门口 */
function gateTowerSlots(side: RoomSide): [number, number][] {
  if (side === "east") return [[4, 0], [4, -2], [4, 3], [3, 0]];
  if (side === "west") return [[-2, 0], [-2, -2], [-2, 3], [-1, 2]];
  if (side === "south") return [[2, 4], [-2, 4], [4, 4], [2, 3]];
  return [[2, -2], [-2, -2], [4, -2], [2, 3]];
}

const SUPPORT_SLOTS: [number, number][] = [
  [4, 4],
  [-2, 4],
  [4, -2],
];

const GOLD_SLOTS: [number, number][] = [
  [-2, 4],
  [4, 4],
  [4, -2],
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
): { gx: number; gy: number } | null {
  const size = BUILD_SPECS[kind].size;
  for (const [dx, dy] of slots) {
    const gx = baseTx + dx;
    const gy = baseTy + dy;
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

  // 1. 木材不足时优先购买
  if (elf.wood < 40 && elf.gold >= state.woodPrice + 40) {
    actions.push({ type: "wood" });
  }

  // 2. 房间只有一个入口，先放一块石头/木墙堵住（原作开局先堵口）
  const room = BASE_ROOMS[elfId];
  if (room) {
    const gate = state.buildings.find(
      (b) =>
        b.alive &&
        b.team === "elf" &&
        b.owner === elfId &&
        ((b.gx === room.gateX && b.gy === room.gateY) || (b.gx === room.gate2X && b.gy === room.gate2Y)),
    );
    if (!gate) {
      const stone = BUILD_SPECS.stone.levels[0];
      const useStone = elf.gold >= stone.cost + 60 && elf.wood >= stone.wood;
      const kind: BuildingKind = useStone ? "stone" : "woodwall";
      const level = BUILD_SPECS[kind].levels[0];
      if (elf.gold >= level.cost && elf.wood >= level.wood) {
        actions.push({ type: "build", kind, gx: room.gateX, gy: room.gateY });
      }
    } else if (gate.level < BUILD_SPECS[gate.kind].levels.length) {
      const next = BUILD_SPECS[gate.kind].levels[gate.level];
      if (elf.gold >= next.cost + 40 && elf.wood >= next.wood) actions.push({ type: "upgrade", id: gate.id });
    }
  }

  // 3. 帐篷：至少两座
  const tents = mine.filter((b) => b.kind === "tent");
  if (tents.length < 2 && elf.gold >= BUILD_SPECS.tent.levels[0].cost) {
    const slot = trySlot(state, elf, "tent", TENT_SLOTS, baseTx, baseTy);
    if (slot) actions.push({ type: "build", kind: "tent", gx: slot.gx, gy: slot.gy });
  }

  // 4. 防御塔：前期箭塔，后期升级
  const towers = mine.filter((b) => ["arrow", "gun", "poison", "ice", "moon"].includes(b.kind));
  if (towers.length < 3) {
    const order: BuildingKind[] = ["arrow", "arrow", "gun", "ice", "poison", "moon"];
    const kind = order[Math.min(towers.length, order.length - 1)];
    const level = BUILD_SPECS[kind].levels[0];
    if (elf.gold >= level.cost && elf.wood >= level.wood) {
      const slot = trySlot(state, elf, kind, gateTowerSlots(room?.side ?? "south"), baseTx, baseTy);
      if (slot) actions.push({ type: "build", kind, gx: slot.gx, gy: slot.gy });
    }
  }

  // 5. 工人雇佣所与塔研究所
  if (countKind(state.buildings, elfId, ["workshop"]) === 0 && elf.gold >= 200) {
    const slot = trySlot(state, elf, "workshop", SUPPORT_SLOTS, baseTx, baseTy);
    if (slot) actions.push({ type: "build", kind: "workshop", gx: slot.gx, gy: slot.gy });
  }
  if (towers.length >= 3 && countKind(state.buildings, elfId, ["lab"]) === 0 && elf.gold >= 300) {
    const slot = trySlot(state, elf, "lab", SUPPORT_SLOTS, baseTx, baseTy);
    if (slot) actions.push({ type: "build", kind: "lab", gx: slot.gx, gy: slot.gy });
  }

  // 6. 金矿
  if (countKind(state.buildings, elfId, ["goldmine"]) < 2 && elf.gold >= 300 && elf.wood >= 60) {
    const slot = trySlot(state, elf, "goldmine", GOLD_SLOTS, baseTx, baseTy);
    if (slot) actions.push({ type: "build", kind: "goldmine", gx: slot.gx, gy: slot.gy });
  }

  // 7. 升级：帐篷优先（木材门槛），其次塔与生命之树
  for (const tent of tents.sort((a, b) => a.level - b.level)) {
    if (tent.level < BUILD_SPECS.tent.levels.length) {
      const next = BUILD_SPECS.tent.levels[tent.level];
      if (elf.gold >= next.cost && elf.wood >= next.wood) actions.push({ type: "upgrade", id: tent.id });
    }
  }
  const upgradeOrder = ["arrow", "gun", "ice", "poison", "moon"];
  for (const building of towers.sort((a, b) => a.level - b.level)) {
    if (!upgradeOrder.includes(building.kind)) continue;
    if (building.level >= BUILD_SPECS[building.kind].levels.length) continue;
    const next = BUILD_SPECS[building.kind].levels[building.level];
    if (elf.gold >= next.cost + 80 && elf.wood >= next.wood) actions.push({ type: "upgrade", id: building.id });
  }
  if (tree.level < BUILD_SPECS.tree.levels.length) {
    const next = BUILD_SPECS.tree.levels[tree.level];
    if (elf.gold >= next.cost && elf.wood >= next.wood) actions.push({ type: "upgrade", id: tree.id });
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
  if (nearestDist < 150 && elf.cooldowns.blink <= 0) return "blink";
  if (nearestDist < 360 && elf.hp < elf.maxHp * 0.6 && elf.cooldowns.night <= 0) return "night";
  if (elf.hp < elf.maxHp * 0.4 && elf.cooldowns.reinforce <= 0) return "reinforce";
  return null;
}

/** 巨魔 AI 购买与技能 */
export function planTrollActions(state: GameState, troll: Troll): TrollAction[] {
  if (!troll.alive || troll.wolf) return [];
  const actions: TrollAction[] = [];

  if (troll.hutId >= 0) {
    const hut = state.buildings.find((b) => b.id === troll.hutId && b.alive);
    if (hut) {
      const levels = BUILD_SPECS.hut.levels;
      if (hut.level < levels.length) {
        const next = levels[hut.level];
        if (troll.gold >= next.cost + 260) actions.push({ type: "hut" });
      }
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
    const gate = state.buildings.find(
      (b) =>
        b.alive &&
        b.team === "elf" &&
        ((b.gx === room.gateX && b.gy === room.gateY) || (b.gx === room.gate2X && b.gy === room.gate2Y)),
    );
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

  return { mx: dx, my: dy };
}
