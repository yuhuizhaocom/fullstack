import { BUILDINGS, DIFFICULTY } from "./config";
import {
  buildingAt,
  buyItem,
  buyUpgrade,
  canPlace,
  castSkill,
  isBuildingVisibleTo,
  isUnitVisibleTo,
  sideHero,
  setUnitDestination,
  tryBuild,
  tryHire,
  useItem,
} from "./engine";
import { pixelToTile, terrainAtTile } from "./map";
import type { Building, BuildingKind, GameState, Side, Unit, UnitKind, Vec } from "./types";

const MILITARY_FARMER: UnitKind[] = ["militia", "archer", "golem"];
const MILITARY_HUNTER: UnitKind[] = ["shadowScout", "trollSlinger", "frostShaman"];

function countUnits(state: GameState, side: Side, kind: UnitKind): number {
  return state.units.filter((u) => u.side === side && u.kind === kind && !u.dead).length;
}

function countBuildings(state: GameState, side: Side, kind: BuildingKind): number {
  return state.buildings.filter((b) => b.side === side && b.kind === kind && b.hp > 0).length;
}

function heroOf(state: GameState, side: Side): Unit | null {
  return sideHero(state, side);
}

/** 在锚点附近寻找合法空地建造 */
function placeNear(state: GameState, side: Side, kind: BuildingKind, anchor: Vec): boolean {
  const base = pixelToTile(anchor.x, anchor.y);
  for (let r = 1; r <= 9; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = base.tx + dx;
        const ty = base.ty + dy;
        if (tx < 1 || ty < 1 || tx >= state.map.w - 1 || ty >= state.map.h - 1) continue;
        if (buildingAt(state, tx, ty)) continue;
        if (!canPlace(state, side, kind, tx, ty)) continue;
        return tryBuild(state, side, kind, tx, ty);
      }
    }
  }
  return false;
}

function findVisibleEnemy(
  state: GameState,
  side: Side,
  from: Vec,
  kinds: UnitKind[],
  maxDist: number
): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const unit of state.units) {
    if (unit.side === side || unit.dead) continue;
    if (kinds.length > 0 && !kinds.includes(unit.kind)) continue;
    if (!isUnitVisibleTo(state, unit, side)) continue;
    const dist = Math.hypot(unit.x - from.x, unit.y - from.y);
    if (dist <= maxDist && dist < bestD) {
      bestD = dist;
      best = unit;
    }
  }
  return best;
}

function nearestEnemyBuilding(
  state: GameState,
  side: Side,
  from: Vec,
  maxDist: number
): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const building of state.buildings) {
    if (building.side === side || building.hp <= 0) continue;
    if (!isBuildingVisibleTo(state, building, side)) continue;
    const d = Math.hypot(building.x - from.x, building.y - from.y);
    if (d <= maxDist && d < bestD) {
      bestD = d;
      best = building;
    }
  }
  return best;
}

function pickBase(state: GameState): Vec {
  let best = state.map.groves[0] ?? state.map.farmerCamp;
  let bestScore = -Infinity;
  for (const grove of state.map.groves) {
    const fromHunter = Math.hypot(grove.x - state.map.hunterCamp.x, grove.y - state.map.hunterCamp.y);
    const c = pixelToTile(grove.x, grove.y);
    let cover = 0;
    for (let dy = -6; dy <= 6; dy += 1) {
      for (let dx = -6; dx <= 6; dx += 1) {
        const t = terrainAtTile(state.map, c.tx + dx, c.ty + dy);
        if (t === "bush") cover += 2;
        else if (t === "tree") cover += 1;
      }
    }
    const score = fromHunter * 0.6 + cover * 6;
    if (score > bestScore) {
      bestScore = score;
      best = grove;
    }
  }
  return best;
}

function farmerAI(state: GameState, side: Side): void {
  const ai = state.ai[side];
  if (!ai.base) ai.base = pickBase(state);
  const base = ai.base;
  const hero = heroOf(state, side);
  const diff = DIFFICULTY[state.difficulty];

  if (hero) {
    const d = Math.hypot(hero.x - base.x, hero.y - base.y);
    if (d > 260 && hero.repathAt < state.time) {
      setUnitDestination(state, hero, base.x, base.y);
    }
  }

  const heroReady = hero ? Math.hypot(hero.x - base.x, hero.y - base.y) < 340 : false;
  const atBase = hero ? Math.hypot(hero.x - base.x, hero.y - base.y) < 200 : false;
  const phase = state.phase;

  // 伐木农民
  if (countUnits(state, side, "lumberjack") < 3 && state.gold.farmer >= 30) {
    tryHire(state, side, "lumberjack");
  }

  const hasTavern = countBuildings(state, side, "tavern") > 0;
  const farmPlan: BuildingKind[] = [];
  if (countBuildings(state, side, "sheepFarm") < 2) farmPlan.push("sheepFarm");
  if (countBuildings(state, side, "pigFarm") < 1) farmPlan.push("pigFarm");
  if (countBuildings(state, side, "sheepFarm") < 3 && phase !== "hide") farmPlan.push("sheepFarm");
  if (countBuildings(state, side, "warehouse") < 1 && phase !== "hide") farmPlan.push("warehouse");
  if (countBuildings(state, side, "arrowTower") < (phase === "hide" ? 1 : 2)) farmPlan.push("arrowTower");
  if (countBuildings(state, side, "tavern") < 1 && phase !== "hide") farmPlan.push("tavern");
  if (countBuildings(state, side, "mageTower") < 1 && phase === "reversal") farmPlan.push("mageTower");
  if (countBuildings(state, side, "watchTower") < 1 && phase !== "hide") farmPlan.push("watchTower");
  if (countBuildings(state, side, "cannonTower") < 1 && phase === "reversal") farmPlan.push("cannonTower");
  if (countBuildings(state, side, "stoneWall") < 2 && phase !== "hide" && state.gold.farmer > 220) {
    farmPlan.push("stoneWall");
  }

  if (heroReady || atBase) {
    for (const kind of farmPlan) {
      const spec = BUILDINGS[kind];
      if (state.gold.farmer < spec.costGold || state.wood.farmer < spec.costWood) continue;
      if (placeNear(state, side, kind, base)) break;
    }
  }

  // 招募部队
  const militaryCount = MILITARY_FARMER.reduce((acc, kind) => acc + countUnits(state, side, kind), 0);
  if (hasTavern && militaryCount < diff.unitCap) {
    const wantGolem = phase === "reversal" && countUnits(state, side, "golem") < 2 && state.gold.farmer > 240;
    const wantArcher = countUnits(state, side, "archer") < Math.ceil(diff.unitCap * 0.5);
    const wantMilitia = countUnits(state, side, "militia") < Math.ceil(diff.unitCap * 0.5);
    if (wantGolem) tryHire(state, side, "golem");
    else if (wantArcher && state.gold.farmer > 90) tryHire(state, side, "archer");
    else if (wantMilitia && state.gold.farmer > 80) tryHire(state, side, "militia");
  }

  if (phase === "reversal") {
    for (const unit of state.units) {
      if (unit.side === side && !unit.isHero && MILITARY_FARMER.includes(unit.kind)) {
        unit.stance = "attack";
      }
    }
    if (hero && hero.repathAt < state.time) {
      const target = { x: state.map.hunterCamp.x, y: state.map.hunterCamp.y };
      if (Math.hypot(hero.x - target.x, hero.y - target.y) > 120) {
        setUnitDestination(state, hero, target.x, target.y);
      }
    }
  } else if (hero && hero.hp < hero.maxHp * 0.4) {
    if (Math.hypot(hero.x - base.x, hero.y - base.y) > 120) {
      setUnitDestination(state, hero, base.x, base.y);
    }
  }

  // 保护性使用道具（农民侧没有猎人道具，这里留空）
}

function hunterAI(state: GameState, side: Side): void {
  const ai = state.ai[side];
  const hero = heroOf(state, side);
  const diff = DIFFICULTY[state.difficulty];
  const camp = state.map.hunterCamp;

  // 购买与升级
  if (ai.nextBuyAt < state.time) {
    ai.nextBuyAt = state.time + 2.5;
    if (state.phase !== "hide" && !state.upgrades[side].bounty && state.gold.hunter >= 140) {
      buyUpgrade(state, side, "bounty");
    } else if (state.phase === "reversal" && !state.upgrades[side].atk && state.gold.hunter >= 150) {
      buyUpgrade(state, side, "atk");
    } else if (state.gold.hunter > 220 && !state.upgrades[side].def) {
      buyUpgrade(state, side, "def");
    }
    if (state.stock[side].spray < 2 && state.gold.hunter > 170) buyItem(state, side, "spray");
    if (state.stock[side].bomb < 2 && state.gold.hunter > 220) buyItem(state, side, "bomb");
  }

  if (!hero) return;

  if (hero.hp < hero.maxHp * 0.5 && state.stock[side].spray > 0) useItem(state, side, "spray");

  // 建筑：猎人营地经济与防守
  const buildAnchor = { x: camp.x, y: camp.y + 40 };
  const nearCamp = Math.hypot(hero.x - camp.x, hero.y - camp.y) < 460;
  if (nearCamp) {
    if (countBuildings(state, side, "cheeseShop") < 1) placeNear(state, side, "cheeseShop", buildAnchor);
    if (countBuildings(state, side, "shadowNest") < 1) placeNear(state, side, "shadowNest", buildAnchor);
    if (state.phase !== "hide" && countBuildings(state, side, "bombHut") < 1) {
      placeNear(state, side, "bombHut", buildAnchor);
    }
    if (state.phase === "reversal" && countBuildings(state, side, "poisonTower") < 2) {
      placeNear(state, side, "poisonTower", buildAnchor);
    }
  }

  // 招募
  const military = MILITARY_HUNTER.reduce((acc, kind) => acc + countUnits(state, side, kind), 0);
  if (military < diff.unitCap && state.gold.hunter > 220) {
    if (countUnits(state, side, "trollSlinger") < 2) tryHire(state, side, "trollSlinger");
    else if (countUnits(state, side, "frostShaman") < 2) tryHire(state, side, "frostShaman");
    else if (countUnits(state, side, "shadowScout") < 2) tryHire(state, side, "shadowScout");
  }

  // 炸弹拆墙
  if (state.stock[side].bomb > 0) {
    const close = nearestEnemyBuilding(state, side, hero, 110);
    if (close) useItem(state, side, "bomb");
  }

  // 技能
  const enemyNear = findVisibleEnemy(state, side, hero, [], 170);
  if (enemyNear && state.skillCd[side].slam <= 0) {
    castSkill(state, side, "slam", enemyNear.x, enemyNear.y);
  }
  if (state.skillCd[side].eye <= 0 && ai.nextEyeAt < state.time) {
    ai.nextEyeAt = state.time + 12;
    const unexplored = state.map.groves
      .map((grove) => {
        const c = pixelToTile(grove.x, grove.y);
        return { grove, seen: state.vision[side][c.ty * state.map.w + c.tx] };
      })
      .filter((item) => item.seen === 0)
      .sort(
        (a, b) =>
          Math.hypot(a.grove.x - hero.x, a.grove.y - hero.y) -
          Math.hypot(b.grove.x - hero.x, b.grove.y - hero.y)
      )[0];
    if (unexplored) castSkill(state, side, "eye", unexplored.grove.x, unexplored.grove.y);
  }

  // 追击目标：优先经济单位，其次建筑
  const economy = findVisibleEnemy(state, side, hero, ["lumberjack", "sheep", "pig"], 700);
  const anyEnemy = economy ?? findVisibleEnemy(state, side, hero, [], 520);
  const buildingTarget = nearestEnemyBuilding(state, side, hero, 620);

  if (state.phase === "reversal") {
    const d = Math.hypot(hero.x - camp.x, hero.y - camp.y);
    if (d > 380 && hero.repathAt < state.time) setUnitDestination(state, hero, camp.x, camp.y);
    if (hero.hp < hero.maxHp * 0.3 && d > 260) setUnitDestination(state, hero, camp.x, camp.y);
    return;
  }

  if (hero.hp < hero.maxHp * 0.32) {
    if (hero.repathAt < state.time) setUnitDestination(state, hero, camp.x, camp.y);
    return;
  }

  if (anyEnemy) {
    if (hero.repathAt < state.time) setUnitDestination(state, hero, anyEnemy.x, anyEnemy.y);
    return;
  }
  if (buildingTarget) {
    if (hero.repathAt < state.time) setUnitDestination(state, hero, buildingTarget.x, buildingTarget.y);
    return;
  }

  // 巡逻：匿藏期只在中央区域搜索，扩张期才开始压向农民营地外围
  const pool =
    state.phase === "hide" ? state.map.patrol.slice(0, Math.max(1, state.map.patrol.length - 2)) : state.map.patrol;
  const anchor = pool[ai.anchor % pool.length];
  if (Math.hypot(hero.x - anchor.x, hero.y - anchor.y) < 90) {
    ai.anchor = (ai.anchor + 1) % pool.length;
  }
  if (hero.repathAt < state.time) {
    const next = pool[ai.anchor % pool.length];
    setUnitDestination(state, hero, next.x, next.y);
  }
}

/** 玩家阵营之外的 AI 侧，每帧调用（内部按反应速度节流） */
export function updateAI(state: GameState, dt: number): void {
  if (state.result) return;
  const aiSide: Side = state.side === "farmer" ? "hunter" : "farmer";
  const ai = state.ai[aiSide];
  ai.think -= dt;
  if (ai.think > 0) return;
  ai.think = DIFFICULTY[state.difficulty].reaction;

  if (aiSide === "farmer") farmerAI(state, aiSide);
  else hunterAI(state, aiSide);

  // 给 AI 部队设定姿态，避免全部挤在英雄脚下
  if (state.phase === "reversal" && aiSide === "hunter") {
    for (const unit of state.units) {
      if (unit.side === aiSide && !unit.isHero) unit.stance = "guard";
    }
  }
}
