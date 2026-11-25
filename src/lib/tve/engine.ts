// 「巨魔 VS 精灵」核心模拟：纯前端、固定步长、无 DOM 依赖，便于单独测试。

import { planElfActions, planTrollMove } from "./ai";
import {
  BASE_SITES,
  BUILD_RADIUS_TILES,
  BUILD_SPECS,
  DAY_LENGTH,
  DIFFICULTIES,
  MAP_CENTER,
  MAP_DATA,
  MAP_SIZE,
  MAP_TILES,
  MAX_MINES,
  NIGHT_LENGTH,
  POND,
  RUSH,
  START_GOLD_AI,
  START_GOLD_PLAYER,
  TILE,
  TROLL_BASE,
  TROLL_UPGRADES,
  VILLAGER,
  WARNING_TIME,
  baseWorld,
  clamp,
  isTerrainBlocked,
  tileCenter,
} from "./config";
import type {
  Base,
  BuildCheck,
  Building,
  BuildingKind,
  Difficulty,
  Faction,
  GameState,
  InputState,
  Troll,
  UpgradeTrack,
  Villager,
} from "./types";

function newBuilding(
  id: number,
  kind: BuildingKind,
  baseId: number,
  gx: number,
  gy: number,
  x: number,
  y: number,
  spawn: number,
  spent: number,
): Building {
  const spec = BUILD_SPECS[kind];
  return {
    id,
    kind,
    baseId,
    gx,
    gy,
    x,
    y,
    level: 1,
    hp: spec.levels[0].hp,
    maxHp: spec.levels[0].hp,
    spawn,
    cd: 0,
    flash: 0,
    alive: true,
    spent,
  };
}

export function createGame(faction: Faction, difficulty: Difficulty): GameState {
  let nextId = 1;
  const bases: Base[] = [];
  const buildings: Building[] = [];
  const villagers: Villager[] = [];

  for (const site of BASE_SITES) {
    const p = baseWorld(site);
    const treeId = nextId++;
    buildings.push(newBuilding(treeId, "tree", site.id, site.tx - 1, site.ty - 1, p.x, p.y, 0, 0));
    const isPlayer = faction === "elf" && site.id === 0;
    bases.push({
      id: site.id,
      name: site.name,
      x: p.x,
      y: p.y,
      tx: site.tx,
      ty: site.ty,
      alive: true,
      isPlayer,
      gold: isPlayer ? START_GOLD_PLAYER : START_GOLD_AI,
      incomeTimer: 0,
      treeId,
    });
    const offsets: [number, number][] = [
      [2, 2],
      [-2, 2],
      [2, -2],
    ];
    for (const [dx, dy] of offsets) {
      const x = tileCenter(site.tx + dx);
      const y = tileCenter(site.ty + dy);
      villagers.push({
        id: nextId++,
        baseId: site.id,
        x,
        y,
        hp: VILLAGER.hp,
        maxHp: VILLAGER.hp,
        dead: false,
        respawn: 0,
        wanderTimer: Math.random() * 2,
        tx: x,
        ty: y,
        flash: 0,
      });
    }
  }

  const trollAi = faction === "elf";
  const stat = trollAi ? DIFFICULTIES[difficulty].trollStat : 1;
  const maxHp = Math.round(TROLL_BASE.hp * stat);
  const troll: Troll = {
    x: MAP_CENTER.x + TILE,
    y: MAP_CENTER.y + TILE * 3,
    hp: maxHp,
    maxHp,
    gold: 0,
    cd: 0,
    flash: 0,
    swing: 0,
    rushCd: 0,
    rushTime: 0,
    slowTime: 0,
    slowPower: 0,
    claw: 0,
    swift: 0,
    hide: 0,
    regenAcc: 0,
    lootAcc: 0,
    ai: trollAi,
  };

  return {
    faction,
    difficulty,
    time: 0,
    result: null,
    bases,
    buildings,
    villagers,
    troll,
    night: false,
    dayTimer: DAY_LENGTH,
    cycle: 0,
    effects: [],
    floats: [],
    arrows: [],
    hint: {
      text:
        faction === "troll"
          ? "目标：拆毁三棵生命之树 · 白天潜行，夜幕爆发"
          : "白天准备期：采集金币、修建防御，夜幕将至",
      t: 5,
    },
    shake: 0,
    stats: { kills: 0, destroyed: 0, goldEarned: 0 },
    ai: {
      elfTimer: 0.6,
      trollTimer: 0,
      targetBase: 2,
      waypoint: 0,
      path: null,
      pathTimer: 0,
      stuck: 0,
      lastX: troll.x,
      lastY: troll.y,
      decisionTimer: 0,
    },
    playerBase: faction === "elf" ? 0 : -1,
    sfx: [],
    nextId,
  };
}

export function pushHint(state: GameState, text: string, time = 3) {
  if (state.hint && state.hint.text === text && state.hint.t > time * 0.5) return;
  state.hint = { text, t: time };
}

function addFloat(state: GameState, x: number, y: number, text: string, color: string, size = 16) {
  if (state.floats.length > 40) state.floats.shift();
  state.floats.push({ x, y, t: 0, dur: 0.9, text, color, size });
}

function addFx(
  state: GameState,
  kind: "slash" | "boom" | "heal" | "dust" | "ring" | "spark",
  x: number,
  y: number,
  radius: number,
  color: string,
  angle = 0,
  dur = 0.35,
) {
  if (state.effects.length > 120) state.effects.shift();
  state.effects.push({ kind, x, y, t: 0, dur, radius, angle, color });
}

export function getTrollAttack(state: GameState): number {
  const base = state.night ? TROLL_BASE.nightAtk : TROLL_BASE.dayAtk;
  const stat = state.troll.ai ? DIFFICULTIES[state.difficulty].trollStat : 1;
  return base * (1 + TROLL_UPGRADES.claw.value * state.troll.claw) * stat;
}

export function getTrollSpeed(state: GameState): number {
  const base = state.night ? TROLL_BASE.nightSpeed : TROLL_BASE.daySpeed;
  const slow = state.troll.slowTime > 0 ? 1 - state.troll.slowPower : 1;
  return base * (1 + TROLL_UPGRADES.swift.value * state.troll.swift) * slow;
}

function buildingRadius(b: Building): number {
  return (BUILD_SPECS[b.kind].size * TILE) / 2;
}

function villagerRadius(): number {
  return 12;
}

function trollRadius(): number {
  return 24;
}

function resolveCircle(state: GameState, entity: { x: number; y: number }, radius: number, ignoreBuildings: boolean) {
  const p = entity;
  // 地图边界
  p.x = clamp(p.x, radius, MAP_SIZE - radius);
  p.y = clamp(p.y, radius, MAP_SIZE - radius);

  // 池塘
  const nx = (p.x - POND.x) / POND.rx;
  const ny = (p.y - POND.y) / POND.ry;
  const pondD = Math.hypot(nx, ny);
  if (pondD < 1) {
    const s = 1 / Math.max(0.001, pondD);
    p.x = POND.x + nx * s * POND.rx;
    p.y = POND.y + ny * s * POND.ry;
  }

  // 建筑
  if (!ignoreBuildings) {
    for (const b of state.buildings) {
      if (!b.alive) continue;
      const half = buildingRadius(b);
      const left = b.x - half;
      const top = b.y - half;
      const right = b.x + half;
      const bottom = b.y + half;
      const closestX = clamp(p.x, left, right);
      const closestY = clamp(p.y, top, bottom);
      let dx = p.x - closestX;
      let dy = p.y - closestY;
      let d = Math.hypot(dx, dy);
      if (d >= radius) continue;
      if (d < 0.0001) {
        // 圆心在矩形内：沿最近的边推出
        const dl = p.x - left;
        const dr = right - p.x;
        const dt = p.y - top;
        const db = bottom - p.y;
        const min = Math.min(dl, dr, dt, db);
        if (min === dl) p.x = left - radius;
        else if (min === dr) p.x = right + radius;
        else if (min === dt) p.y = top - radius;
        else p.y = bottom + radius;
      } else {
        const push = radius - d;
        p.x += (dx / d) * push;
        p.y += (dy / d) * push;
      }
    }
  }

  // 树木与岩石
  for (const t of MAP_DATA.trees) {
    const dx = p.x - t.x;
    const dy = p.y - t.y;
    const min = t.r + radius * 0.75;
    const d = Math.hypot(dx, dy);
    if (d < min && d > 0.0001) {
      p.x = t.x + (dx / d) * min;
      p.y = t.y + (dy / d) * min;
    }
  }
  for (const rock of MAP_DATA.rocks) {
    const dx = p.x - rock.x;
    const dy = p.y - rock.y;
    const min = rock.r + radius * 0.75;
    const d = Math.hypot(dx, dy);
    if (d < min && d > 0.0001) {
      p.x = rock.x + (dx / d) * min;
      p.y = rock.y + (dy / d) * min;
    }
  }
}

function moveCircle(
  state: GameState,
  entity: { x: number; y: number },
  radius: number,
  dx: number,
  dy: number,
  ignoreBuildings: boolean,
) {
  if (dx !== 0) {
    entity.x += dx;
    resolveCircle(state, entity, radius, ignoreBuildings);
  }
  if (dy !== 0) {
    entity.y += dy;
    resolveCircle(state, entity, radius, ignoreBuildings);
  }
}

function updateDayNight(state: GameState, dt: number) {
  const before = state.dayTimer;
  state.dayTimer -= dt;
  if (!state.night && before > WARNING_TIME && state.dayTimer <= WARNING_TIME && state.dayTimer > 0) {
    pushHint(state, "夜幕将至，注意防守！", 3);
  }
  if (state.dayTimer <= 0) {
    state.night = !state.night;
    state.cycle++;
    state.dayTimer = state.night ? NIGHT_LENGTH : DAY_LENGTH;
    pushHint(state, state.night ? "夜幕降临：巨魔力量大增" : "黎明到来：抓紧时间发育", 3.5);
  }
}

function updateEconomy(state: GameState, dt: number) {
  for (const base of state.bases) {
    if (!base.alive) continue;
    base.incomeTimer += dt;
    if (base.incomeTimer < 4) continue;
    base.incomeTimer -= 4;
    const incomeFactor = base.isPlayer ? 1 : DIFFICULTIES[state.difficulty].aiIncome;
    let gain = 0;
    for (const b of state.buildings) {
      if (!b.alive || b.baseId !== base.id || b.kind !== "mine") continue;
      gain += BUILD_SPECS.mine.levels[b.level - 1].income ?? 0;
    }
    const aliveVillagers = state.villagers.filter((v) => v.baseId === base.id && !v.dead).length;
    gain += aliveVillagers * 1.6;
    base.gold += gain * incomeFactor;
  }
}

function treeOf(state: GameState, baseId: number): Building | undefined {
  const base = state.bases[baseId];
  return state.buildings.find((b) => b.id === base?.treeId);
}

function updateVillagers(state: GameState, dt: number) {
  for (const v of state.villagers) {
    v.flash = Math.max(0, v.flash - dt);
    const base = state.bases[v.baseId];
    if (v.dead) {
      if (!base?.alive) continue;
      v.respawn -= dt;
      if (v.respawn <= 0) {
        const tree = treeOf(state, v.baseId);
        if (tree) {
          v.dead = false;
          v.hp = v.maxHp;
          v.x = tree.x + (Math.random() - 0.5) * TILE * 2;
          v.y = tree.y + TILE;
          v.tx = v.x;
          v.ty = v.y;
        }
      }
      continue;
    }

    let dx = 0;
    let dy = 0;
    const distTroll = Math.hypot(state.troll.x - v.x, state.troll.y - v.y);
    if (distTroll < VILLAGER.fleeRange && state.troll.hp > 0) {
      const len = distTroll || 1;
      dx = ((v.x - state.troll.x) / len) * VILLAGER.speed * dt;
      dy = ((v.y - state.troll.y) / len) * VILLAGER.speed * dt;
    } else {
      v.wanderTimer -= dt;
      if (v.wanderTimer <= 0) {
        v.wanderTimer = 1.4 + Math.random() * 2.6;
        const tree = treeOf(state, v.baseId);
        if (tree) {
          v.tx = tree.x + (Math.random() - 0.5) * TILE * 4;
          v.ty = tree.y + (Math.random() - 0.5) * TILE * 4;
        }
      }
      const ddx = v.tx - v.x;
      const ddy = v.ty - v.y;
      const len = Math.hypot(ddx, ddy);
      if (len > 12) {
        dx = (ddx / len) * VILLAGER.speed * dt;
        dy = (ddy / len) * VILLAGER.speed * dt;
      }
    }
    moveCircle(state, v, villagerRadius(), dx, dy, true);
  }
}

function updateBuildings(state: GameState, dt: number) {
  for (const b of state.buildings) {
    if (!b.alive) continue;
    b.flash = Math.max(0, b.flash - dt);
    b.cd = Math.max(0, b.cd - dt);
    if (b.spawn > 0) b.spawn = Math.max(0, b.spawn - dt);
  }
}

function updateTowers(state: GameState) {
  const troll = state.troll;
  if (troll.hp <= 0) return;
  for (const b of state.buildings) {
    if (!b.alive || b.spawn > 0 || b.cd > 0) continue;
    if (b.kind !== "arrow" && b.kind !== "magic") continue;
    const spec = BUILD_SPECS[b.kind].levels[b.level - 1];
    const range = spec.range ?? 0;
    const d = Math.hypot(troll.x - b.x, troll.y - b.y);
    if (d > range) continue;

    b.cd = spec.interval ?? 1;
    const shots = spec.multishot ?? 1;
    const dmg = (spec.dmg ?? 0) * shots;
    troll.hp -= dmg;
    troll.flash = 0.14;
    state.shake = Math.min(8, state.shake + 2.5);

    state.arrows.push({
      x: b.x,
      y: b.y - TILE * 0.4,
      tx: troll.x,
      ty: troll.y,
      t: 0,
      dur: b.kind === "arrow" ? 0.16 : 0.24,
      magic: b.kind === "magic",
    });
    addFloat(state, troll.x + (Math.random() - 0.5) * 20, troll.y - 30, `-${Math.round(dmg)}`, "#ff8f6b", 15);

    if (b.kind === "magic") {
      addFx(state, "boom", troll.x, troll.y, spec.radius ?? 90, "#8ec5ff", 0, 0.45);
      troll.slowTime = 1.6;
      troll.slowPower = spec.slow ?? 0.2;
      state.sfx.push("attack_staff");
    } else {
      state.sfx.push("attack_bow");
    }

    if (troll.hp <= 0) {
      troll.hp = 0;
      state.result = state.faction === "elf" ? "win" : "lose";
      addFx(state, "boom", troll.x, troll.y, 120, "#ffd479", 0, 0.8);
      state.sfx.push("death");
      return;
    }
  }
}

function damageBuilding(state: GameState, b: Building, dmg: number) {
  b.hp -= dmg;
  b.flash = 0.16;
  if (b.baseId === state.playerBase) pushHint(state, "基地遭到攻击！", 2);
  if (b.hp <= 0) {
    b.hp = 0;
    b.alive = false;
    const base = state.bases[b.baseId];
    if (b.kind === "tree" && base) {
      base.alive = false;
      for (const v of state.villagers) {
        if (v.baseId === base.id) {
          v.dead = true;
          v.hp = 0;
          v.respawn = 9999;
        }
      }
      pushHint(state, `${base.name}被摧毁！`, 3.5);
      addFx(state, "boom", b.x, b.y, 150, "#ffd479", 0, 0.9);
      state.shake = 12;
    } else {
      const reward = 40 + 25 * b.level + (b.kind === "arrow" || b.kind === "magic" ? 60 : 0);
      state.troll.gold += reward;
      state.stats.destroyed++;
      state.stats.goldEarned += reward;
      addFloat(state, b.x, b.y - 20, `+${reward}`, "#ffd479", 17);
      addFx(state, "dust", b.x, b.y, 60, "#c9a87a", 0, 0.5);
      state.sfx.push("death");
    }
  }
}

function tryTrollAttack(state: GameState) {
  const t = state.troll;
  const atk = getTrollAttack(state);
  const reach = TROLL_BASE.attackRange;

  let bestKind: "villager" | "building" | null = null;
  let bestId = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestX = t.x;
  let bestY = t.y;

  for (const v of state.villagers) {
    if (v.dead) continue;
    const d = Math.hypot(v.x - t.x, v.y - t.y);
    const score = d - 22;
    if (d <= reach + villagerRadius() && score < bestDist) {
      bestDist = score;
      bestKind = "villager";
      bestId = v.id;
      bestX = v.x;
      bestY = v.y;
    }
  }
  for (const b of state.buildings) {
    if (!b.alive) continue;
    const d = Math.hypot(b.x - t.x, b.y - t.y) - buildingRadius(b);
    if (d <= reach + 6 && d < bestDist) {
      bestDist = d;
      bestKind = "building";
      bestId = b.id;
      bestX = b.x;
      bestY = b.y;
    }
  }

  if (!bestKind) return;
  t.cd = TROLL_BASE.attackInterval;
  t.swing = 0.26;
  addFx(
    state,
    "slash",
    t.x,
    t.y,
    reach + 18,
    state.night ? "#c6f2a8" : "#e8e2c8",
    Math.atan2(bestY - t.y, bestX - t.x),
    0.22,
  );
  state.sfx.push("attack");

  if (bestKind === "villager") {
    const v = state.villagers.find((item) => item.id === bestId);
    if (v) {
      v.hp -= atk;
      v.flash = 0.2;
      if (v.hp <= 0) {
        v.hp = 0;
        v.dead = true;
        v.respawn = VILLAGER.respawn;
        t.gold += VILLAGER.bounty;
        state.stats.kills++;
        state.stats.goldEarned += VILLAGER.bounty;
        addFloat(state, v.x, v.y - 16, `+${VILLAGER.bounty}`, "#ffd479", 15);
        addFx(state, "dust", v.x, v.y, 26, "#9adf7a", 0, 0.4);
      }
    }
  } else {
    const b = state.buildings.find((item) => item.id === bestId);
    if (b) damageBuilding(state, b, atk * TROLL_BASE.buildingBonus);
  }
}

function updateTroll(state: GameState, dt: number, input: InputState) {
  const t = state.troll;
  t.flash = Math.max(0, t.flash - dt);
  t.swing = Math.max(0, t.swing - dt);
  t.cd = Math.max(0, t.cd - dt);
  t.rushCd = Math.max(0, t.rushCd - dt);
  t.rushTime = Math.max(0, t.rushTime - dt);
  t.slowTime = Math.max(0, t.slowTime - dt);

  if (input.rush) castRush(state);
  if (t.hp <= 0) return;

  if (state.night) {
    t.hp = Math.min(t.maxHp, t.hp + TROLL_BASE.nightRegen * dt);
  }
  t.lootAcc += dt;
  if (t.lootAcc >= TROLL_BASE.lootInterval) {
    t.lootAcc -= TROLL_BASE.lootInterval;
    t.gold += TROLL_BASE.loot;
    state.stats.goldEarned += TROLL_BASE.loot;
  }

  const mag = Math.hypot(input.mx, input.my);
  if (mag > 0.02) {
    const speed = getTrollSpeed(state) * (t.rushTime > 0 ? RUSH.mult : 1);
    const nx = input.mx / Math.max(1, mag);
    const ny = input.my / Math.max(1, mag);
    moveCircle(state, t, trollRadius(), nx * speed * dt, 0, false);
    moveCircle(state, t, trollRadius(), 0, ny * speed * dt, false);
  }

  if (t.cd <= 0) tryTrollAttack(state);
}

function updateFx(state: GameState, dt: number) {
  for (const f of state.floats) f.t += dt;
  state.floats = state.floats.filter((f) => f.t < f.dur);
  for (const e of state.effects) e.t += dt;
  state.effects = state.effects.filter((e) => e.t < e.dur);
  for (const a of state.arrows) a.t += dt;
  state.arrows = state.arrows.filter((a) => a.t < a.dur);
}

function updateElfAi(state: GameState, dt: number) {
  state.ai.elfTimer -= dt;
  if (state.ai.elfTimer > 0) return;
  state.ai.elfTimer = 0.9 * DIFFICULTIES[state.difficulty].aiInterval;
  for (const base of state.bases) {
    if (base.isPlayer || !base.alive) continue;
    const actions = planElfActions(state, base.id);
    for (const action of actions) {
      if (action.type === "build") {
        if (tryBuildForBase(state, base.id, action.kind, action.gx, action.gy)) break;
      } else if (tryUpgradeForBase(state, base.id, action.id)) {
        break;
      }
    }
  }
}

function checkResult(state: GameState) {
  if (state.result) return;
  const trollDead = state.troll.hp <= 0;
  if (state.faction === "troll") {
    if (state.bases.every((b) => !b.alive)) {
      state.result = "win";
    } else if (trollDead) {
      state.result = "lose";
    }
  } else {
    const playerBase = state.bases[state.playerBase];
    if (trollDead) {
      state.result = "win";
    } else if (!playerBase.alive) {
      state.result = "lose";
    }
  }
}

/** 推进一帧模拟。dt 为秒（建议 1/60 固定步长）。 */
export function stepGame(state: GameState, dt: number, input: InputState) {
  if (state.result) return;
  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 24);
  if (state.hint) {
    state.hint.t -= dt;
    if (state.hint.t <= 0) state.hint = null;
  }

  updateDayNight(state, dt);
  updateEconomy(state, dt);
  updateElfAi(state, dt);
  updateVillagers(state, dt);
  updateBuildings(state, dt);
  updateTowers(state);

  if (state.troll.hp > 0) {
    if (state.troll.ai) {
      const plan = planTrollMove(state, dt);
      updateTroll(state, dt, { mx: plan.mx, my: plan.my, rush: plan.rush });
    } else {
      updateTroll(state, dt, input);
    }
  }

  updateFx(state, dt);
  checkResult(state);
  if (state.sfx.length > 12) state.sfx.splice(0, state.sfx.length - 12);
}

export function canBuildAt(state: GameState, baseId: number, kind: BuildingKind, gx: number, gy: number): BuildCheck {
  if (kind === "tree") return { ok: false, reason: "无法建造" };
  if (gx < 0 || gy < 0 || gx >= MAP_TILES || gy >= MAP_TILES) return { ok: false, reason: "超出地图" };
  const base = state.bases[baseId];
  if (!base || !base.alive) return { ok: false, reason: "基地已被摧毁" };

  const cx = (base.tx + 0.5) * TILE;
  const cy = (base.ty + 0.5) * TILE;
  const px = (gx + 0.5) * TILE;
  const py = (gy + 0.5) * TILE;
  if (Math.hypot(px - cx, py - cy) > BUILD_RADIUS_TILES * TILE) {
    return { ok: false, reason: "超出建造范围" };
  }
  if (isTerrainBlocked(gx, gy)) return { ok: false, reason: "地形不可建造" };
  for (const b of state.buildings) {
    if (!b.alive) continue;
    const size = BUILD_SPECS[b.kind].size;
    if (gx >= b.gx && gx < b.gx + size && gy >= b.gy && gy < b.gy + size) {
      return { ok: false, reason: "位置已被占用" };
    }
  }
  if (kind === "mine") {
    const count = state.buildings.filter((b) => b.alive && b.baseId === baseId && b.kind === "mine").length;
    if (count >= MAX_MINES) return { ok: false, reason: "金矿已达上限" };
  }
  return { ok: true };
}

export function tryBuildForBase(
  state: GameState,
  baseId: number,
  kind: BuildingKind,
  gx: number,
  gy: number,
): boolean {
  if (state.result) return false;
  const check = canBuildAt(state, baseId, kind, gx, gy);
  if (!check.ok) return false;
  const base = state.bases[baseId];
  const spec = BUILD_SPECS[kind];
  const cost = spec.levels[0].cost;
  if (base.gold < cost) return false;
  base.gold -= cost;
  const x = (gx + 0.5) * TILE;
  const y = (gy + 0.5) * TILE;
  const b = newBuilding(state.nextId++, kind, baseId, gx, gy, x, y, 0.6, cost);
  state.buildings.push(b);
  addFx(state, "dust", x, y + 20, 40, "#d8c08a", 0, 0.5);
  if (base.isPlayer) state.sfx.push("pickup");
  return true;
}

export function tryUpgradeForBase(state: GameState, baseId: number, id: number): boolean {
  if (state.result) return false;
  const b = state.buildings.find((item) => item.id === id);
  if (!b || !b.alive || b.baseId !== baseId) return false;
  const levels = BUILD_SPECS[b.kind].levels;
  if (b.level >= levels.length) return false;
  const next = levels[b.level];
  const base = state.bases[baseId];
  if (!base || base.gold < next.cost) return false;
  base.gold -= next.cost;
  const diff = next.hp - b.maxHp;
  b.level++;
  b.maxHp = next.hp;
  b.hp += diff;
  b.spent += next.cost;
  addFx(state, "ring", b.x, b.y, 46, "#ffe9a3", 0, 0.5);
  addFloat(state, b.x, b.y - 30, "升级", "#ffe9a3", 15);
  if (base.isPlayer) state.sfx.push("levelup");
  return true;
}

export function demolishBuilding(state: GameState, id: number): boolean {
  const b = state.buildings.find((item) => item.id === id);
  if (!b || !b.alive || b.kind === "tree") return false;
  const base = state.bases[b.baseId];
  if (!base) return false;
  const refund = Math.floor(b.spent * 0.5);
  base.gold += refund;
  b.alive = false;
  b.hp = 0;
  addFx(state, "dust", b.x, b.y, 36, "#c9a87a", 0, 0.4);
  addFloat(state, b.x, b.y - 20, `+${refund}`, "#ffd479", 15);
  return true;
}

export function buyTrollUpgrade(state: GameState, track: UpgradeTrack): boolean {
  if (state.result) return false;
  const spec = TROLL_UPGRADES[track];
  const level = state.troll[track];
  if (level >= spec.costs.length) return false;
  const cost = spec.costs[level];
  if (state.troll.gold < cost) return false;
  state.troll.gold -= cost;
  state.troll[track] = level + 1;
  if (track === "hide") {
    state.troll.maxHp += spec.value;
    state.troll.hp = state.troll.maxHp;
    addFx(state, "heal", state.troll.x, state.troll.y, 54, "#8bf0a6", 0, 0.6);
  }
  state.sfx.push("levelup");
  addFloat(state, state.troll.x, state.troll.y - 40, spec.label, "#a8f0ff", 16);
  return true;
}

export function castRush(state: GameState): boolean {
  if (state.troll.rushCd > 0 || state.troll.hp <= 0) return false;
  state.troll.rushCd = RUSH.cooldown;
  state.troll.rushTime = RUSH.duration;
  addFx(state, "ring", state.troll.x, state.troll.y, 42, "#ffd479", 0, 0.45);
  state.sfx.push("skill");
  return true;
}
