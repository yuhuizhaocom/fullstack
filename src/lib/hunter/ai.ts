import { BUILDINGS, DIFFICULTY, MODES, RESEARCH } from "./config";
import {
  addGold,
  buildingAt,
  buyItemFor,
  buyResearchFor,
  castSkillFor,
  golemForOwner,
  isBuildingVisibleTo,
  isUnitVisibleTo,
  ownerHero,
  playerUnit,
  setUnitDestination,
  skillCooldown,
  tryBuildFor,
  tryHireFor,
  useItemFor,
} from "./engine";
import { pixelToTile } from "./map";
import type {
  Building,
  BuildingKind,
  GameState,
  ResearchKind,
  Side,
  Unit,
  UnitKind,
  Vec,
} from "./types";

function countBuildings(state: GameState, side: Side, owner: number, kind: BuildingKind): number {
  return state.buildings.filter((b) => b.side === side && b.owner === owner && b.kind === kind && b.hp > 0)
    .length;
}

function countTeamBuilding(state: GameState, side: Side, kind: BuildingKind): number {
  return state.buildings.filter((b) => b.side === side && b.kind === kind && b.hp > 0).length;
}

function countUnits(state: GameState, side: Side, owner: number, kind: UnitKind): number {
  return state.units.filter((u) => u.side === side && u.owner === owner && u.kind === kind && !u.dead).length;
}

function placeNear(state: GameState, side: Side, owner: number, kind: BuildingKind, anchor: Vec): boolean {
  const base = pixelToTile(anchor.x, anchor.y);
  for (let r = 1; r <= 10; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = base.tx + dx;
        const ty = base.ty + dy;
        if (tx < 1 || ty < 1 || tx >= state.map.w - 1 || ty >= state.map.h - 1) continue;
        if (buildingAt(state, tx, ty)) continue;
        if (tryBuildFor(state, side, owner, kind, tx, ty)) return true;
      }
    }
  }
  return false;
}

function nearestVisibleUnit(
  state: GameState,
  side: Side,
  from: Vec,
  maxDist: number,
  filter?: (unit: Unit) => boolean
): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const unit of state.units) {
    if (unit.side === side || unit.dead) continue;
    if (unit.kind === "mine" || unit.kind === "eyeWard") continue;
    if (filter && !filter(unit)) continue;
    if (!isUnitVisibleTo(state, unit, side)) continue;
    const d = Math.hypot(unit.x - from.x, unit.y - from.y);
    if (d <= maxDist && d < bestD) {
      bestD = d;
      best = unit;
    }
  }
  return best;
}

function nearestVisibleBuilding(
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

function farmPlan(state: GameState, owner: number, hero: Unit): (BuildingKind | null)[] {
  const gold = state.farmerSlots[owner].gold;
  const plan: (BuildingKind | null)[] = [];
  const phase = state.phase;
  const pens = countBuildings(state, "farmer", owner, "chickenPen");
  const sheep = countBuildings(state, "farmer", owner, "sheepPen");
  const pigs = countBuildings(state, "farmer", owner, "pigPen");
  const towers = countBuildings(state, "farmer", owner, "arrowTower");
  const frost = countBuildings(state, "farmer", owner, "frostTower");
  const lab = countTeamBuilding(state, "farmer", "researchLab");
  const walls =
    countBuildings(state, "farmer", owner, "barricade") +
    countBuildings(state, "farmer", owner, "stoneWall");

  // 全队唯一傀儡工厂优先级最高
  if (countTeamBuilding(state, "farmer", "golemFactory") === 0 && gold >= 2000) {
    plan.push("golemFactory");
  }

  if (phase === "hide") {
    // 前期只养鸡，藏好并补两座箭塔
    if (pens < 4) plan.push("chickenPen");
    if (towers < 2) plan.push("arrowTower");
    if (lab < 1 && gold > 260) plan.push("researchLab");
  } else if (phase === "expand") {
    // 起家期开始转羊、补猪，逐渐扩张
    if (pens < 4) plan.push("chickenPen");
    if (sheep < 2 && gold > 120) plan.push("sheepPen");
    if (pigs < 2 && gold > 300) plan.push("pigPen");
    if (towers < 4) plan.push("arrowTower");
    if (frost < 2 && gold > 500) plan.push("frostTower");
    if (walls < 3 && gold > 500) plan.push("barricade");
    if (lab < 1 && gold > 260) plan.push("researchLab");
  } else {
    // 决战期补满羊猪与防御，配合傀儡反推
    if (pens < 4) plan.push("chickenPen");
    if (sheep < 3) plan.push("sheepPen");
    if (pigs < 3) plan.push("pigPen");
    if (towers < 6) plan.push("arrowTower");
    if (walls < 8 && gold > 450) plan.push("barricade");
    if (frost < 3 && gold > 500) plan.push("frostTower");
  }
  if (!hero) plan.length = 0;
  return plan;
}

function farmerAI(state: GameState, owner: number): void {
  const slot = state.farmerSlots[owner];
  const hero = ownerHero(state, "farmer", owner);
  const base = slot.base;
  const phase = state.phase;

  const lab = countTeamBuilding(state, "farmer", "researchLab");
  let factoryBuilt = countTeamBuilding(state, "farmer", "golemFactory") > 0;
  // 全队工厂优先，避免被科技花光金币
  if (!factoryBuilt && slot.gold >= 2000) {
    if (placeNear(state, "farmer", owner, "golemFactory", base)) factoryBuilt = true;
  }
  if (factoryBuilt && phase === "reversal" && !golemForOwner(state, owner) && slot.gold >= 1800) {
    tryHireFor(state, "farmer", owner, "golem");
  }

  // 先攒工厂，反攻期再攒主傀儡，其余时间投入科技
  const hasGolem = !!golemForOwner(state, owner);
  const reserve = !factoryBuilt
    ? 2100
    : phase !== "reversal"
      ? 700
      : !hasGolem
        ? 1900
        : 600;
  if (lab > 0 && slot.gold >= reserve) {
    const researchPriority: ResearchKind[] =
      state.research.farmer.buildDef <= state.research.farmer.arrowAtk
        ? ["buildDef", "arrowAtk"]
        : ["arrowAtk", "buildDef"];
    for (const kind of researchPriority) {
      if (state.research.farmer[kind] < RESEARCH[kind].max) {
        buyResearchFor(state, "farmer", owner, kind);
        break;
      }
    }
    if (hasGolem) {
      for (const kind of ["golemHp", "golemAtk", "golemAspd", "golemSpeed"] as ResearchKind[]) {
        if (state.research.farmer[kind] < RESEARCH[kind].max) {
          buyResearchFor(state, "farmer", owner, kind);
          break;
        }
      }
    }
  }

  if (!hero || hero.dead) return;

  const distBase = Math.hypot(hero.x - base.x, hero.y - base.y);
  if (distBase > 320) {
    setUnitDestination(state, hero, base.x, base.y);
  }

  if (distBase < 460) {
    let built = 0;
    for (const kind of farmPlan(state, owner, hero)) {
      if (!kind) continue;
      if (built >= 2) break;
      if (placeNear(state, "farmer", owner, kind, base)) built += 1;
    }
  }

  const golem = golemForOwner(state, owner);
  if (phase === "reversal" && golem) {
    golem.stance = "attack";
    const target = state.map.hunterCamp;
    if (Math.hypot(golem.x - target.x, golem.y - target.y) > 90) {
      setUnitDestination(state, golem, target.x, target.y);
    }
    if (hero.repathAt < state.time) {
      setUnitDestination(state, hero, golem.x, golem.y + 40);
    }
    if (skillCooldown(state, golem.id, "golemQ") <= 0) {
      const enemy = nearestVisibleUnit(state, "farmer", golem, 260);
      if (enemy) castSkillFor(state, golem, "golemQ", enemy.x, enemy.y);
    }
    if (skillCooldown(state, golem.id, "golemE") <= 0) {
      const enemy = nearestVisibleUnit(state, "farmer", golem, 320);
      if (enemy) castSkillFor(state, golem, "golemE", enemy.x, enemy.y);
    }
    if (skillCooldown(state, golem.id, "golemW") <= 0) {
      const enemy = nearestVisibleUnit(state, "farmer", golem, 150);
      if (enemy) castSkillFor(state, golem, "golemW", enemy.x, enemy.y);
    }
  } else if (golem) {
    golem.stance = "guard";
    if (golem.repathAt < state.time) {
      setUnitDestination(state, golem, base.x, base.y);
      golem.repathAt = state.time + 3;
    }
  }
}

function hunterItems(state: GameState, owner: number): void {
  const slot = state.hunterSlots[owner];
  const hero = ownerHero(state, "hunter", owner);
  if (!hero || hero.dead) return;
  const mode = MODES[state.mode];

  // 先补消耗品，再补永久装备
  if (state.time >= 20 * 60 && mode.mines && slot.mines <= 0 && slot.gold >= 25) {
    buyItemFor(state, "hunter", owner, "mine");
  }
  if (slot.horns <= 0 && slot.gold >= 120) buyItemFor(state, "hunter", owner, "horn");
  if (!slot.potions && slot.gold >= 50 && hero.hp < hero.maxHp * 0.65) {
    buyItemFor(state, "hunter", owner, "potion");
  }
  if (!slot.hammer && slot.gold >= 65) buyItemFor(state, "hunter", owner, "hammer");
  if (!slot.gloves && slot.gold >= 150) buyItemFor(state, "hunter", owner, "gloves");
  if (!slot.poison && slot.gold >= 60) buyItemFor(state, "hunter", owner, "poison");
  if (countUnits(state, "hunter", owner, "mercenary") < 1 && slot.kills >= 1 && slot.gold >= 40) {
    tryHireFor(state, "hunter", owner, "mercenary");
  }
  if (slot.potions > 0 && hero.hp < hero.maxHp * 0.5) useItemFor(state, "hunter", owner, "potion");
}

function hunterMines(state: GameState, owner: number, hero: Unit): void {
  const slot = state.hunterSlots[owner];
  if (!MODES[state.mode].mines || slot.mines <= 0) return;
  const tower = state.buildings.find(
    (b) =>
      b.side === "farmer" &&
      b.hp > 0 &&
      Math.hypot(b.x - hero.x, b.y - hero.y) <= 220 &&
      (BUILDINGS[b.kind].tower || b.kind === "chickenPen" || b.kind === "sheepPen" || b.kind === "pigPen")
  );
  if (tower) useItemFor(state, "hunter", owner, "mine");
}

function hunterHorn(state: GameState, owner: number, hero: Unit): void {
  const slot = state.hunterSlots[owner];
  if (slot.horns <= 0) return;
  let towers = 0;
  for (const building of state.buildings) {
    if (building.side !== "farmer" || building.hp <= 0) continue;
    if (!BUILDINGS[building.kind].tower) continue;
    if (Math.hypot(building.x - hero.x, building.y - hero.y) <= 420) towers += 1;
  }
  if (towers >= 1) useItemFor(state, "hunter", owner, "horn");
}

function towerPressure(state: GameState, x: number, y: number, range = 320): number {
  let count = 0;
  for (const building of state.buildings) {
    if (building.side !== "farmer" || building.hp <= 0) continue;
    if (!BUILDINGS[building.kind].tower) continue;
    if (building.disabledUntil > state.time) continue;
    if (Math.hypot(building.x - x, building.y - y) <= range) count += 1;
  }
  return count;
}

function farmerFightersNear(state: GameState, x: number, y: number, range = 240): number {
  let count = 0;
  for (const unit of state.units) {
    if (unit.dead || unit.side !== "farmer") continue;
    if (!unit.isHero && unit.kind !== "golem" && unit.kind !== "golemClone") continue;
    if (Math.hypot(unit.x - x, unit.y - y) <= range) count += 1;
  }
  return count;
}

function hunterAI(state: GameState, owner: number): void {
  const slot = state.hunterSlots[owner];
  const hero = ownerHero(state, "hunter", owner);
  if (!hero || hero.dead) return;

  hunterItems(state, owner);

  // 插眼：优先未被点亮的起家点
  if (slot.eyeAt <= state.time && skillCooldown(state, hero.id, "eye") <= 0) {
    slot.eyeAt = state.time + 12;
    const points = [...state.map.farmerStarts, ...state.map.groves];
    let best: Vec | null = null;
    let bestScore = -Infinity;
    for (const point of points) {
      const c = pixelToTile(point.x, point.y);
      const explored = state.vision.hunter[c.ty * state.map.w + c.tx] === 2;
      const dist = Math.hypot(point.x - hero.x, point.y - hero.y);
      const score = (explored ? 0 : 800) - dist * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = point;
      }
    }
    if (best) castSkillFor(state, hero, "eye", best.x, best.y);
  }

  hunterHorn(state, owner, hero);
  hunterMines(state, owner, hero);

  const hpRatio = hero.hp / hero.maxHp;
  const swarm = farmerFightersNear(state, hero.x, hero.y, 220);

  // 塔火覆盖下先撤；号角生效（塔失效）时 towerPressure 会归零，可继续输出
  if (
    hpRatio < 0.45 ||
    towerPressure(state, hero.x, hero.y) > 0 ||
    (swarm >= 3 && hpRatio < 0.8)
  ) {
    const camp = state.map.hunterCamp;
    setUnitDestination(state, hero, camp.x, camp.y);
    return;
  }

  // 优先猎杀塔火覆盖外、守卫不多的动物
  const animal = nearestVisibleUnit(state, "hunter", hero, 460, (u) =>
    u.kind === "chicken" || u.kind === "sheep" || u.kind === "pig"
  );
  if (
    animal &&
    towerPressure(state, animal.x, animal.y) === 0 &&
    farmerFightersNear(state, animal.x, animal.y, 180) <= 1
  ) {
    setUnitDestination(state, hero, animal.x, animal.y);
    return;
  }

  // 只拆没有塔火保护、守卫不多的建筑；号角生效后塔火会自动消失
  const enemyBuilding = nearestVisibleBuilding(state, "hunter", hero, 520);
  if (enemyBuilding) {
    const covered = towerPressure(state, enemyBuilding.x, enemyBuilding.y) > 0;
    const guards = farmerFightersNear(state, enemyBuilding.x, enemyBuilding.y, 200);
    if (!covered && guards <= 1) {
      setUnitDestination(state, hero, enemyBuilding.x, enemyBuilding.y);
      return;
    }
  }

  // 没有号角压制时，不主动进入塔火覆盖区偷动物


  // 只在明显优势、且身边没有成群农民时交战
  const enemyUnit = nearestVisibleUnit(state, "hunter", hero, 380);
  if (
    enemyUnit &&
    hpRatio > 0.75 &&
    towerPressure(state, enemyUnit.x, enemyUnit.y) === 0 &&
    farmerFightersNear(state, enemyUnit.x, enemyUnit.y, 200) <= 1
  ) {
    setUnitDestination(state, hero, enemyUnit.x, enemyUnit.y);
    return;
  }

  // 巡逻：走地图中部的锚点，避免一头撞进农民基地
  const anchors = state.map.patrol;
  const target = anchors[slot.anchor % anchors.length];
  if (Math.hypot(hero.x - target.x, hero.y - target.y) < 140) {
    slot.anchor += 1;
  }
  if (hero.repathAt < state.time) {
    setUnitDestination(state, hero, target.x, target.y);
    hero.repathAt = state.time + 4;
  }
}

/** 每帧调用：驱动所有 AI 玩家（不含玩家本人） */
export function updateAI(state: GameState, dt: number): void {
  if (state.result) return;
  const diff = DIFFICULTY[state.difficulty];

  for (const side of ["farmer", "hunter"] as Side[]) {
    const slots = side === "farmer" ? state.farmerSlots : state.hunterSlots;
    for (let owner = 0; owner < slots.length; owner += 1) {
      if (side === state.side && owner === state.playerOwner) continue;
      const slot = slots[owner];
      if (slot.thinkAt > state.time) continue;
      slot.thinkAt = state.time + diff.think * (0.8 + Math.random() * 0.4);
      if (diff.bonus > 0) addGold(state, side, owner, (diff.bonus * diff.think) / 60);
      void dt;
      if (side === "farmer") farmerAI(state, owner);
      else hunterAI(state, owner);
    }
  }
}

/** 供 UI 使用：玩家当前是否在商人附近 */
export function playerNearMerchant(state: GameState): boolean {
  const unit = playerUnit(state);
  if (!unit) return false;
  if (Math.hypot(unit.x - state.merchant.x, unit.y - state.merchant.y) <= 480) return true;
  return state.buildings.some(
    (b) => b.kind === "hunterBarracks" && Math.hypot(b.x - unit.x, b.y - unit.y) <= 480
  );
}
