// 「新巨魔与精灵」核心模拟：纯前端、固定步长、无 DOM 依赖。
// 还原要点：
// - 精灵是可移动、可被击杀的英雄，死亡 3 秒后其单位消失
// - 精灵靠帐篷产金、小精灵伐木，升级房屋需要木材（32/96/256）
// - 精灵可用石头/木墙/冰墙堵路，建造箭塔/火枪/毒/冰/银月塔并在塔研究所升级
// - 巨魔攻击精灵建筑获得金币，升级巨魔小屋获得被动收入，在商店购买装备
// - 巨魔可疾风步隐身、巫医召回；-double 下死亡化为幽灵狼

import { planElfActions, planElfSkill, planTrollActions, planTrollMove } from "./ai";
import {
  BASE_ROOMS,
  BASE_SITES,
  BUILD_SPECS,
  DIFFICULTIES,
  ELF_HERO,
  ELF_SKILLS,
  GAME_MODES,
  MAP_DATA,
  MAP_SIZE,
  MAP_TILES,
  POND,
  REPAIRER,
  SCROLL,
  SHOP_ITEMS,
  START_GOLD_AI,
  START_GOLD_PLAYER,
  START_WOOD,
  TILE,
  TOWER_KINDS,
  TROLL_BASE,
  TROLL_SKILLS,
  WISP,
  WOLF,
  WOOD_PACK,
  clamp,
  isTerrainBlocked,
  tileCenter,
} from "./config";
import type {
  BuildCheck,
  Building,
  BuildingKind,
  Difficulty,
  Elf,
  ElfSkill,
  Faction,
  GameMode,
  GameState,
  InputState,
  Point,
  ShopKey,
  Troll,
  TrollRule,
  TrollSkill,
  Wisp,
} from "./types";

const TWO = TILE * 2;

function newBuilding(
  id: number,
  kind: BuildingKind,
  owner: number,
  team: Faction,
  gx: number,
  gy: number,
  spawned: boolean,
): Building {
  const spec = BUILD_SPECS[kind];
  const level = spec.levels[0];
  return {
    id,
    kind,
    owner,
    team,
    gx,
    gy,
    size: spec.size,
    x: (gx + spec.size / 2) * TILE,
    y: (gy + spec.size / 2) * TILE,
    level: 1,
    hp: level.hp,
    maxHp: level.hp,
    spawn: spawned ? 0 : 0.5,
    cd: 0,
    timer: 0,
    flash: 0,
    alive: true,
    spentGold: level.cost,
    spentWood: level.wood,
  };
}

function createElf(index: number, siteIndex: number, isPlayer: boolean, gold: number): Elf {
  const site = BASE_SITES[siteIndex] ?? BASE_SITES[0];
  return {
    id: index,
    name: site.name,
    x: tileCenter(site.tx + 3),
    y: tileCenter(site.ty + 2),
    hp: ELF_HERO.hp,
    maxHp: ELF_HERO.hp,
    gold,
    wood: START_WOOD,
    alive: true,
    isPlayer,
    treeId: -1,
    flash: 0,
    deadTimer: 0,
    woodBuys: 0,
    cooldowns: { night: 0, entangle: 0, blink: 0, reinforce: 0 },
  };
}

function createTroll(index: number, x: number, y: number, isPlayer: boolean, stat: number): Troll {
  const maxHp = Math.round(TROLL_BASE.hp * stat);
  return {
    id: index,
    name: index === 0 ? "巨魔" : "巨魔二号",
    x,
    y,
    hp: maxHp,
    maxHp,
    gold: 0,
    alive: true,
    isPlayer,
    wolf: false,
    reviveTimer: 0,
    cd: 0,
    flash: 0,
    swing: 0,
    slowTime: 0,
    slowPower: 0,
    stunTime: 0,
    poisonTime: 0,
    poisonDps: 0,
    windwalk: 0,
    windwalkCd: 0,
    recallCd: 0,
    items: { weapon: 0, gloves: 0, boots: 0, armor: 0, vitality: 0, regen: 0 },
    hutId: -1,
    regenAcc: 0,
    targetBuilding: -1,
    targetElf: -1,
    decideTimer: 0,
    path: null,
    pathTimer: 0,
    lastX: x,
    lastY: y,
    stuck: 0,
  };
}

export function createGame(
  faction: Faction,
  difficulty: Difficulty,
  mode: GameMode,
  rule: TrollRule,
): GameState {
  let nextId = 1;
  const modeSpec = GAME_MODES[mode];
  const goldMult = modeSpec.goldMult;

  const elves: Elf[] = [];
  const buildings: Building[] = [];
  const wisps: Wisp[] = [];
  const trolls: Troll[] = [];

  const elfCount = modeSpec.elfCount;
  for (let i = 0; i < elfCount; i += 1) {
    const isPlayer = faction === "elf" && i === 0;
    const site = BASE_SITES[i] ?? BASE_SITES[0];
    const elf = createElf(i, i, isPlayer, Math.round((isPlayer ? START_GOLD_PLAYER : START_GOLD_AI) * goldMult));
    const tree = newBuilding(nextId++, "tree", i, "elf", site.tx - 1, site.ty - 1, true);
    elf.treeId = tree.id;
    buildings.push(tree);
    elves.push(elf);
    for (let k = 0; k < 2; k += 1) {
      wisps.push({
        id: nextId++,
        owner: i,
        x: tree.x + (k === 0 ? -26 : 26),
        y: tree.y + 30,
        hp: WISP.hp,
        maxHp: WISP.hp,
        phase: "seek",
        forest: -1,
        timer: 0,
        carry: 0,
        flash: 0,
      });
    }
  }

  const trollCount = rule === "double" ? 2 : 1;
  const stat = faction === "elf" ? DIFFICULTIES[difficulty].trollStat : 1;
  for (let i = 0; i < trollCount; i += 1) {
    const gx = 34 + i * 4;
    const gy = 34;
    const isPlayer = faction === "troll" && i === 0;
    const hut = newBuilding(nextId++, "hut", i, "troll", gx, gy, true);
    buildings.push(hut);
    const troll = createTroll(i, tileCenter(gx + 1), tileCenter(gy + 3), isPlayer, stat);
    troll.gold = Math.round((isPlayer ? START_GOLD_PLAYER : START_GOLD_AI) * goldMult);
    troll.hutId = hut.id;
    trolls.push(troll);
  }

  const forest = MAP_DATA.trees.map((tree) => ({
    ...tree,
    wood: 110 + Math.round((tree.variant + 1) * 30),
  }));

  return {
    faction,
    difficulty,
    mode,
    rule,
    time: 0,
    result: null,
    elves,
    trolls,
    buildings,
    wisps,
    repairers: [],
    forest,
    effects: [],
    floats: [],
    shots: [],
    hint: {
      text:
        faction === "troll"
          ? "拆墙得金 · 升级小屋 · 商店买装备 · 杀死所有精灵即获胜"
          : "在房间唯一入口放一块石头堵住 · 买木材升级帐篷 · 造塔防守",
      t: 6,
    },
    shake: 0,
    stats: { kills: 0, destroyed: 0, goldEarned: 0, woodGathered: 0 },
    nightTimer: 0,
    playerElf: faction === "elf" ? 0 : -1,
    playerTroll: faction === "troll" ? 0 : -1,
    woodPrice: WOOD_PACK.basePrice,
    surviveTime: modeSpec.surviveTime,
    sfx: [],
    nextId,
    ai: { elfTimer: 0.8, trollTimer: 0.6 },
  };
}

export function pushHint(state: GameState, text: string, time = 3) {
  if (state.hint && state.hint.text === text && state.hint.t > time * 0.5) return;
  state.hint = { text, t: time };
}

function addFloat(state: GameState, x: number, y: number, text: string, color: string, size = 16) {
  if (state.floats.length > 46) state.floats.shift();
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
  if (state.effects.length > 140) state.effects.shift();
  state.effects.push({ kind, x, y, t: 0, dur, radius, angle, color });
}

function playerElfOf(state: GameState): Elf | null {
  return state.playerElf >= 0 ? state.elves[state.playerElf] ?? null : null;
}

function playerTrollOf(state: GameState): Troll | null {
  return state.playerTroll >= 0 ? state.trolls[state.playerTroll] ?? null : null;
}

function buildingOf(state: GameState, id: number): Building | undefined {
  return state.buildings.find((b) => b.id === id && b.alive);
}

function trollRadius(t: Troll): number {
  return t.wolf ? WOLF.radius : TROLL_BASE.radius;
}

function trollAttackPower(state: GameState, t: Troll): number {
  const base = t.wolf ? WOLF.attack : TROLL_BASE.attack + SHOP_ITEMS.weapon.per * t.items.weapon;
  const stat = !t.isPlayer ? DIFFICULTIES[state.difficulty].trollStat : 1;
  return base * stat;
}

function trollAttackInterval(t: Troll): number {
  const base = t.wolf ? WOLF.interval : TROLL_BASE.interval;
  const haste = t.wolf ? 0 : SHOP_ITEMS.gloves.per * t.items.gloves;
  return Math.max(0.42, base * (1 - haste));
}

function trollSpeed(t: Troll): number {
  const base = t.wolf ? WOLF.speed : TROLL_BASE.speed;
  const boots = t.wolf ? 1 : 1 + SHOP_ITEMS.boots.per * t.items.boots;
  const slow = t.slowTime > 0 ? 1 - t.slowPower : 1;
  const ww = t.windwalk > 0 ? 1.35 : 1;
  return base * boots * slow * ww;
}

function trollArmor(t: Troll): number {
  return t.wolf ? 0 : clamp(SHOP_ITEMS.armor.per * t.items.armor, 0, 0.5);
}

function trollRegen(t: Troll): number {
  return TROLL_BASE.regen + (t.wolf ? 1 : SHOP_ITEMS.regen.per * t.items.regen);
}

function trollLabBonus(state: GameState, owner: number): number {
  let bonus = 0;
  for (const b of state.buildings) {
    if (!b.alive || b.team !== "elf" || b.owner !== owner || b.kind !== "lab") continue;
    bonus += BUILD_SPECS.lab.levels[b.level - 1].towerBonus ?? 0;
  }
  return bonus;
}

function nearestTroll(state: GameState, x: number, y: number, maxDist: number): Troll | null {
  let best: Troll | null = null;
  let bestDist = maxDist;
  for (const t of state.trolls) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function resolveCircle(state: GameState, entity: { x: number; y: number }, radius: number, ignoreBuildings: boolean) {
  const p = entity;
  p.x = clamp(p.x, radius, MAP_SIZE - radius);
  p.y = clamp(p.y, radius, MAP_SIZE - radius);

  const nx = (p.x - POND.x) / POND.rx;
  const ny = (p.y - POND.y) / POND.ry;
  const pondD = Math.hypot(nx, ny);
  if (pondD < 1) {
    const s = 1 / Math.max(0.001, pondD);
    p.x = POND.x + nx * s * POND.rx;
    p.y = POND.y + ny * s * POND.ry;
  }

  if (!ignoreBuildings) {
    for (const b of state.buildings) {
      if (!b.alive) continue;
      const half = (BUILD_SPECS[b.kind].size * TILE) / 2;
      const left = b.x - half;
      const top = b.y - half;
      const right = b.x + half;
      const bottom = b.y + half;
      const closestX = clamp(p.x, left, right);
      const closestY = clamp(p.y, top, bottom);
      const dx = p.x - closestX;
      const dy = p.y - closestY;
      const d = Math.hypot(dx, dy);
      if (d >= radius) continue;
      if (d < 0.0001) {
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

  // 精灵房间的不可破坏围墙（小精灵/修理工可穿过，英雄与巨魔会被挡住）
  if (!ignoreBuildings) {
    const resolveBox = (left: number, top: number, right: number, bottom: number) => {
      const closestX = clamp(p.x, left, right);
      const closestY = clamp(p.y, top, bottom);
      const dx = p.x - closestX;
      const dy = p.y - closestY;
      const d = Math.hypot(dx, dy);
      if (d >= radius) return;
      if (d < 0.0001) {
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
    };
    // 2×2 体积的单位（巨魔）挤不过 1 格宽的缝
    const bulky = radius > TILE * 0.4;
    for (const room of BASE_ROOMS) {
      const bx0 = room.gx0 * TILE;
      const by0 = room.gy0 * TILE;
      const bx1 = (room.gx1 + 1) * TILE;
      const by1 = (room.gy1 + 1) * TILE;
      if (p.x < bx0 - radius || p.x > bx1 + radius || p.y < by0 - radius || p.y > by1 + radius) continue;
      for (const wall of room.walls) {
        resolveBox(wall.gx * TILE, wall.gy * TILE, (wall.gx + 1) * TILE, (wall.gy + 1) * TILE);
      }
      if (bulky) {
        // 门口只要堵了一块墙，巨魔就把整个入口视为封死；精灵仍可从剩下的缝穿过
        const sealed = state.buildings.some(
          (b) =>
            b.alive &&
            ((b.gx === room.gateX && b.gy === room.gateY) || (b.gx === room.gate2X && b.gy === room.gate2Y)),
        );
        if (sealed) {
          resolveBox(room.gateX * TILE, room.gateY * TILE, (room.gateX + 1) * TILE, (room.gateY + 1) * TILE);
          resolveBox(room.gate2X * TILE, room.gate2Y * TILE, (room.gate2X + 1) * TILE, (room.gate2Y + 1) * TILE);
        }
      }
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

function damageTroll(state: GameState, t: Troll, raw: number) {
  if (!t.alive || state.result) return;
  const dmg = Math.max(1, raw * (1 - trollArmor(t)));
  t.hp -= dmg;
  t.flash = 0.14;
  if (t.hp <= 0) {
    t.hp = 0;
    killTroll(state, t);
  }
}

function killTroll(state: GameState, t: Troll) {
  if (state.rule === "double" && !t.wolf) {
    t.alive = false;
    t.wolf = true;
    t.reviveTimer = 3;
    t.windwalk = 0;
    t.stunTime = 0;
    t.poisonTime = 0;
    pushHint(state, `${t.name}倒下，3 秒后化为幽灵狼`, 3.5);
  } else {
    t.alive = false;
    pushHint(state, t.wolf ? "幽灵狼被消灭" : `${t.name}被击败`, 3.5);
  }
  addFx(state, "boom", t.x, t.y, 130, "#ffd479", 0, 0.9);
  addFx(state, "dust", t.x, t.y, 70, "#c9a87a", 0, 0.6);
  state.shake = 12;
  state.sfx.push("death");
}

function reviveTroll(t: Troll) {
  t.alive = true;
  t.wolf = true;
  t.hp = WOLF.hp;
  t.maxHp = WOLF.hp;
  t.windwalk = 0;
  t.windwalkCd = 0;
  t.recallCd = 0;
  t.stunTime = 0;
  t.poisonTime = 0;
  t.slowTime = 0;
}

function killElf(state: GameState, elf: Elf) {
  if (!elf.alive) return;
  elf.alive = false;
  elf.hp = 0;
  elf.deadTimer = 3;
  elf.flash = 0.3;
  pushHint(state, `${elf.name}的精灵倒下了！`, 3.5);
  addFx(state, "boom", elf.x, elf.y, 90, "#8bf0a6", 0, 0.8);
  if (elf.isPlayer) state.sfx.push("death");
  if (elf.isPlayer) state.result = "lose";
}

function purgeElf(state: GameState, elf: Elf) {
  for (const b of state.buildings) {
    if (b.alive && b.team === "elf" && b.owner === elf.id) {
      b.alive = false;
      b.hp = 0;
    }
  }
  for (const w of state.wisps) {
    if (w.owner === elf.id) w.hp = 0;
  }
  state.wisps = state.wisps.filter((w) => w.owner !== elf.id);
  state.repairers = state.repairers.filter((r) => r.owner !== elf.id);
}

function damageBuilding(state: GameState, t: Troll, b: Building, dmg: number) {
  if (!b.alive) return;
  b.hp -= dmg;
  b.flash = 0.16;
  if (b.team === "elf" && b.kind === "icewall") {
    const slow = BUILD_SPECS.icewall.levels[b.level - 1].slow ?? 0.25;
    t.slowTime = Math.max(t.slowTime, 1.4);
    t.slowPower = Math.max(t.slowPower, slow);
  }
  if (b.team === "elf" && b.owner === state.playerElf && b.kind !== "tree") {
    // 基地遭袭提示节流交给 hint 自身
    if (Math.random() < 0.2) pushHint(state, "建筑遭到攻击！", 1.6);
  }
  const gain = Math.round(TROLL_BASE.lootBase + dmg * TROLL_BASE.lootPerHit);
  if (gain > 0) {
    t.gold += gain;
    state.stats.goldEarned += gain;
    addFloat(state, b.x + (Math.random() - 0.5) * 24, b.y - 24, `+${gain}`, "#ffd479", 14);
  }
  if (b.hp <= 0) {
    b.hp = 0;
    b.alive = false;
    if (b.team === "elf") {
      state.stats.destroyed += 1;
      const bonus = TROLL_BASE.destroyBonus + b.level * 20;
      t.gold += bonus;
      state.stats.goldEarned += bonus;
      addFloat(state, b.x, b.y - 34, `+${bonus}`, "#ffd479", 18);
      addFx(state, "dust", b.x, b.y, 60, "#c9a87a", 0, 0.5);
      if (b.kind === "tree") {
        pushHint(state, `${state.elves[b.owner]?.name ?? ""}的生命之树被摧毁`, 3);
      }
    } else if (b.kind === "hut") {
      pushHint(state, "巨魔小屋被摧毁！巨魔失去被动收入", 4);
    }
    state.sfx.push("death");
  }
}

/** 巨魔攻击：优先攻击附近的精灵英雄，其次建筑与小精灵 */
function trollCombat(state: GameState, t: Troll) {
  if (!t.alive || t.cd > 0 || t.stunTime > 0) return;
  const reach = (t.wolf ? 50 : TROLL_BASE.range) + trollRadius(t);
  let bestType: "elf" | "wisp" | "building" | null = null;
  let bestId = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestX = t.x;
  let bestY = t.y;

  for (const elf of state.elves) {
    if (!elf.alive) continue;
    const d = Math.hypot(elf.x - t.x, elf.y - t.y) - ELF_HERO.radius - 26;
    if (d < bestDist) {
      bestDist = d;
      bestType = "elf";
      bestId = elf.id;
      bestX = elf.x;
      bestY = elf.y;
    }
  }
  for (const w of state.wisps) {
    const d = Math.hypot(w.x - t.x, w.y - t.y) - WISP.radius;
    if (d < bestDist) {
      bestDist = d;
      bestType = "wisp";
      bestId = w.id;
      bestX = w.x;
      bestY = w.y;
    }
  }
  for (const b of state.buildings) {
    if (!b.alive || b.team !== "elf") continue;
    const d = Math.hypot(b.x - t.x, b.y - t.y) - (b.size * TILE) / 2;
    if (d < bestDist) {
      bestDist = d;
      bestType = "building";
      bestId = b.id;
      bestX = b.x;
      bestY = b.y;
    }
  }

  if (!bestType || bestDist > reach) return;

  t.cd = trollAttackInterval(t);
  t.swing = 0.26;
  const atk = trollAttackPower(state, t);
  addFx(state, "slash", t.x, t.y, reach + 18, t.wolf ? "#cfd8e3" : "#e8e2c8", Math.atan2(bestY - t.y, bestX - t.x), 0.22);
  state.sfx.push("attack");

  if (bestType === "elf") {
    const elf = state.elves.find((item) => item.id === bestId && item.alive);
    if (!elf) return;
    elf.hp -= atk;
    elf.flash = 0.2;
    addFloat(state, elf.x, elf.y - 30, `-${Math.round(atk)}`, "#ff8f6b", 16);
    if (elf.hp <= 0) killElf(state, elf);
  } else if (bestType === "wisp") {
    const wisp = state.wisps.find((item) => item.id === bestId);
    if (!wisp) return;
    wisp.hp -= atk;
    wisp.flash = 0.2;
    if (wisp.hp <= 0) {
      state.wisps = state.wisps.filter((item) => item.id !== wisp.id);
      t.gold += TROLL_BASE.unitBounty;
      state.stats.kills += 1;
      state.stats.goldEarned += TROLL_BASE.unitBounty;
      addFloat(state, wisp.x, wisp.y - 16, `+${TROLL_BASE.unitBounty}`, "#ffd479", 14);
      addFx(state, "dust", wisp.x, wisp.y, 24, "#9adf7a", 0, 0.4);
    }
  } else {
    const b = buildingOf(state, bestId);
    if (b) damageBuilding(state, t, b, atk);
  }
}

function updateBuildingTimers(state: GameState, dt: number) {
  for (const b of state.buildings) {
    if (!b.alive) continue;
    b.flash = Math.max(0, b.flash - dt);
    b.cd = Math.max(0, b.cd - dt);
    if (b.spawn > 0) b.spawn = Math.max(0, b.spawn - dt);
  }
}

function updateTowers(state: GameState, dt: number) {
  for (const b of state.buildings) {
    if (!b.alive || b.spawn > 0 || b.cd > 0) continue;
    if (!TOWER_KINDS.includes(b.kind)) continue;
    const spec = BUILD_SPECS[b.kind].levels[b.level - 1];
    const range = spec.range ?? 0;
    let target: Troll | null = null;
    let bestDist = range;
    for (const t of state.trolls) {
      if (!t.alive || t.windwalk > 0) continue;
      const d = Math.hypot(t.x - b.x, t.y - b.y);
      if (d < bestDist) {
        bestDist = d;
        target = t;
      }
    }
    if (!target) continue;

    b.cd = spec.interval ?? 1;
    const bonus = 1 + trollLabBonus(state, b.owner);
    const dmg = (spec.dmg ?? 0) * bonus;
    target.flash = 0.14;
    state.shake = Math.min(8, state.shake + 2.2);
    addFloat(state, target.x + (Math.random() - 0.5) * 20, target.y - 30, `-${Math.round(dmg)}`, "#ff8f6b", 14);
    state.shots.push({
      x: b.x,
      y: b.y - TILE * 0.4,
      tx: target.x,
      ty: target.y,
      t: 0,
      dur: b.kind === "arrow" ? 0.16 : 0.24,
      kind: b.kind as "arrow" | "gun" | "poison" | "ice" | "moon",
    });

    if (spec.slow) {
      target.slowTime = Math.max(target.slowTime, 1.4);
      target.slowPower = Math.max(target.slowPower, spec.slow);
    }
    if (spec.poison) {
      target.poisonTime = Math.max(target.poisonTime, 3);
      target.poisonDps = Math.max(target.poisonDps, spec.poison);
    }
    if (b.kind === "moon") {
      addFx(state, "boom", target.x, target.y, spec.splash ?? 80, "#bfe3ff", 0, 0.45);
      state.sfx.push("attack_staff");
      for (const other of state.trolls) {
        if (other === target || !other.alive) continue;
        if (Math.hypot(other.x - target.x, other.y - target.y) <= (spec.splash ?? 80)) {
          damageTroll(state, other, dmg * 0.6);
        }
      }
    } else if (b.kind === "gun") {
      state.sfx.push("attack");
    } else {
      state.sfx.push("attack_bow");
    }
    damageTroll(state, target, dmg);
    if (state.result) return;
  }
}

function updateEconomy(state: GameState, dt: number) {
  const diffFactor = (elf: Elf) => (elf.isPlayer ? 1 : DIFFICULTIES[state.difficulty].aiIncome) * GAME_MODES[state.mode].goldMult;
  for (const elf of state.elves) {
    if (!elf.alive) continue;
    let income = 0;
    for (const b of state.buildings) {
      if (!b.alive || b.team !== "elf" || b.owner !== elf.id) continue;
      if (b.kind === "tent" || b.kind === "goldmine") {
        income += BUILD_SPECS[b.kind].levels[b.level - 1].income ?? 0;
      }
    }
    elf.gold += income * diffFactor(elf) * dt;
  }
  for (const t of state.trolls) {
    if (!t.alive || t.wolf) continue;
    const hut = t.hutId >= 0 ? buildingOf(state, t.hutId) : undefined;
    if (!hut) continue;
    const income = BUILD_SPECS.hut.levels[hut.level - 1].income ?? 0;
    t.gold += income * dt;
    state.stats.goldEarned += income * dt;
  }
}

function spawnWisps(state: GameState, dt: number) {
  for (const elf of state.elves) {
    if (!elf.alive) continue;
    const tree = elf.treeId >= 0 ? buildingOf(state, elf.treeId) : undefined;
    if (!tree) continue;
    tree.timer -= dt;
    if (tree.timer > 0) continue;
    const cap = WISP.capByLevel[Math.min(tree.level - 1, WISP.capByLevel.length - 1)];
    const count = state.wisps.filter((w) => w.owner === elf.id).length;
    if (count >= cap) continue;
    tree.timer = WISP.spawnInterval;
    state.wisps.push({
      id: state.nextId++,
      owner: elf.id,
      x: tree.x + (Math.random() - 0.5) * 40,
      y: tree.y + 30 + (Math.random() - 0.5) * 30,
      hp: WISP.hp,
      maxHp: WISP.hp,
      phase: "seek",
      forest: -1,
      timer: 0,
      carry: 0,
      flash: 0,
    });
  }
}

function findForest(state: GameState, x: number, y: number): number {
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < state.forest.length; i += 1) {
    const tree = state.forest[i];
    if (tree.wood <= 0) continue;
    const d = Math.hypot(tree.x - x, tree.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function updateWisps(state: GameState, dt: number) {
  for (const w of state.wisps) {
    w.flash = Math.max(0, w.flash - dt);
    const elf = state.elves[w.owner];
    if (!elf || !elf.alive) continue;
    const tree = elf.treeId >= 0 ? buildingOf(state, elf.treeId) : undefined;

    if (w.phase === "return" && !tree) {
      w.phase = "seek";
      w.carry = 0;
      continue;
    }

    if (w.phase === "return") {
      const dx = tree!.x - w.x;
      const dy = tree!.y - w.y;
      const len = Math.hypot(dx, dy);
      if (len > 46) {
        moveCircle(state, w, WISP.radius, (dx / len) * WISP.speed * dt, (dy / len) * WISP.speed * dt, true);
      } else {
        elf.wood += w.carry;
        state.stats.woodGathered += w.carry;
        w.carry = 0;
        w.phase = "seek";
        w.forest = -1;
      }
      continue;
    }

    if (w.forest < 0) {
      w.forest = findForest(state, w.x, w.y);
      if (w.forest < 0) continue;
    }
    const forest = state.forest[w.forest];
    if (!forest || forest.wood <= 0) {
      w.forest = -1;
      w.phase = "seek";
      continue;
    }
    if (w.phase === "harvest") {
      w.timer -= dt;
      if (w.timer <= 0) {
        const take = Math.min(WISP.carry, forest.wood);
        forest.wood -= take;
        w.carry = take;
        w.phase = "return";
      }
      continue;
    }
    const dx = forest.x - w.x;
    const dy = forest.y - w.y;
    const len = Math.hypot(dx, dy);
    if (len > 28) {
      moveCircle(state, w, WISP.radius, (dx / len) * WISP.speed * dt, (dy / len) * WISP.speed * dt, true);
    } else {
      w.phase = "harvest";
      w.timer = WISP.harvestTime;
    }
  }
}

function updateRepairers(state: GameState, dt: number) {
  for (const elf of state.elves) {
    if (!elf.alive) continue;
    const workshops = state.buildings.filter((b) => b.alive && b.team === "elf" && b.owner === elf.id && b.kind === "workshop");
    let cap = 0;
    let rate = 0;
    for (const w of workshops) {
      cap += REPAIRER.perWorkshop[Math.min(w.level - 1, REPAIRER.perWorkshop.length - 1)];
      rate = Math.max(rate, BUILD_SPECS.workshop.levels[w.level - 1].repair ?? 14);
    }
    const owned = state.repairers.filter((r) => r.owner === elf.id);
    if (workshops.length > 0 && owned.length < cap) {
      const shelter = workshops[0];
      state.repairers.push({
        id: state.nextId++,
        owner: elf.id,
        x: shelter.x + (Math.random() - 0.5) * 30,
        y: shelter.y + 24,
        targetId: -1,
        timer: 0,
      });
    }
    for (const r of state.repairers) {
      if (r.owner !== elf.id) continue;
      let target = r.targetId >= 0 ? buildingOf(state, r.targetId) : undefined;
      if (!target || target.hp >= target.maxHp) {
        target = undefined;
        let bestDist = 700;
        for (const b of state.buildings) {
          if (!b.alive || b.team !== "elf" || b.owner !== elf.id || b.hp >= b.maxHp) continue;
          const d = Math.hypot(b.x - r.x, b.y - r.y);
          if (d < bestDist) {
            bestDist = d;
            target = b;
          }
        }
        r.targetId = target ? target.id : -1;
      }
      if (target) {
        const dx = target.x - r.x;
        const dy = target.y - r.y;
        const len = Math.hypot(dx, dy);
        if (len > (target.size * TILE) / 2 + REPAIRER.range) {
          moveCircle(state, r, REPAIRER.radius, (dx / len) * REPAIRER.speed * dt, (dy / len) * REPAIRER.speed * dt, true);
        } else {
          const heal = (rate || 14) * dt;
          target.hp = Math.min(target.maxHp, target.hp + heal);
        }
      } else {
        const shelter = workshops[0];
        if (shelter) {
          const dx = shelter.x - r.x;
          const dy = shelter.y + 26 - r.y;
          const len = Math.hypot(dx, dy);
          if (len > 18) {
            moveCircle(state, r, REPAIRER.radius, (dx / len) * REPAIRER.speed * dt, (dy / len) * REPAIRER.speed * dt, true);
          }
        }
      }
    }
  }
}

function updateElfHero(state: GameState, elf: Elf, dt: number, input: InputState) {
  elf.flash = Math.max(0, elf.flash - dt);
  if (!elf.alive) {
    if (elf.deadTimer > 0) {
      elf.deadTimer -= dt;
      if (elf.deadTimer <= 0) {
        elf.deadTimer = -1;
        purgeElf(state, elf);
        pushHint(state, `${elf.name}的单位已消失`, 3);
      }
    }
    return;
  }
  elf.hp = Math.min(elf.maxHp, elf.hp + ELF_HERO.regen * dt);
  for (const key of Object.keys(elf.cooldowns) as ElfSkill[]) {
    elf.cooldowns[key] = Math.max(0, elf.cooldowns[key] - dt);
  }

  const tree = elf.treeId >= 0 ? buildingOf(state, elf.treeId) : undefined;

  if (elf.isPlayer) {
    const mag = Math.hypot(input.mx, input.my);
    if (mag > 0.04) {
      const nx = input.mx / Math.max(1, mag);
      const ny = input.my / Math.max(1, mag);
      moveCircle(state, elf, ELF_HERO.radius, nx * ELF_HERO.speed * dt, 0, false);
      moveCircle(state, elf, ELF_HERO.radius, 0, ny * ELF_HERO.speed * dt, false);
    }
    return;
  }

  if (!tree) return;
  const threat = nearestTroll(state, elf.x, elf.y, 240);
  let aimX = tree.x + 50;
  let aimY = tree.y + 70;
  if (threat) {
    aimX = elf.x + (elf.x - threat.x) * 0.4;
    aimY = elf.y + (elf.y - threat.y) * 0.4;
    const dx = aimX - tree.x;
    const dy = aimY - tree.y;
    const len = Math.hypot(dx, dy);
    if (len > 4 * TILE) {
      aimX = tree.x + (dx / len) * 4 * TILE;
      aimY = tree.y + (dy / len) * 4 * TILE;
    }
  }
  const dx = aimX - elf.x;
  const dy = aimY - elf.y;
  const len = Math.hypot(dx, dy);
  if (len > 26) {
    moveCircle(state, elf, ELF_HERO.radius, (dx / len) * ELF_HERO.speed * 0.7 * dt, (dy / len) * ELF_HERO.speed * 0.7 * dt, false);
  }
}

function updateTroll(state: GameState, t: Troll, dt: number, input: InputState) {
  t.flash = Math.max(0, t.flash - dt);
  t.swing = Math.max(0, t.swing - dt);
  t.cd = Math.max(0, t.cd - dt);
  t.stunTime = Math.max(0, t.stunTime - dt);
  t.slowTime = Math.max(0, t.slowTime - dt);
  t.windwalk = Math.max(0, t.windwalk - dt);
  t.windwalkCd = Math.max(0, t.windwalkCd - dt);
  t.recallCd = Math.max(0, t.recallCd - dt);

  if (!t.alive) {
    if (t.reviveTimer > 0) {
      t.reviveTimer -= dt;
      if (t.reviveTimer <= 0) {
        t.reviveTimer = 0;
        reviveTroll(t);
        pushHint(state, "幽灵狼加入了战斗", 3);
      }
    }
    return;
  }

  t.hp = Math.min(t.maxHp, t.hp + trollRegen(t) * dt);
  if (t.poisonTime > 0) {
    t.poisonTime -= dt;
    t.hp -= t.poisonDps * dt;
    if (t.hp <= 0) {
      t.hp = 0;
      killTroll(state, t);
      return;
    }
  }

  if (t.stunTime <= 0) {
    const mag = Math.hypot(input.mx, input.my);
    if (mag > 0.04) {
      const nx = input.mx / Math.max(1, mag);
      const ny = input.my / Math.max(1, mag);
      const speed = trollSpeed(t);
      moveCircle(state, t, trollRadius(t), nx * speed * dt, 0, false);
      moveCircle(state, t, trollRadius(t), 0, ny * speed * dt, false);
    }
  }

  trollCombat(state, t);
}

function updateEffects(state: GameState, dt: number) {
  for (const f of state.floats) f.t += dt;
  state.floats = state.floats.filter((f) => f.t < f.dur);
  for (const e of state.effects) e.t += dt;
  state.effects = state.effects.filter((e) => e.t < e.dur);
  for (const s of state.shots) s.t += dt;
  state.shots = state.shots.filter((s) => s.t < s.dur);
}

function updateElfAi(state: GameState, dt: number) {
  state.ai.elfTimer -= dt;
  if (state.ai.elfTimer > 0) return;
  state.ai.elfTimer = 1 * DIFFICULTIES[state.difficulty].aiInterval;
  for (const elf of state.elves) {
    if (elf.isPlayer || !elf.alive) continue;
    const skill = planElfSkill(state, elf);
    if (skill) castElfSkillForElf(state, elf, skill, 0, 0);
    const actions = planElfActions(state, elf.id);
    let done = 0;
    for (const action of actions) {
      if (done >= 2) break;
      if (action.type === "build") {
        if (tryBuildForElf(state, elf.id, action.kind, action.gx, action.gy)) done += 1;
      } else if (action.type === "upgrade") {
        if (tryUpgradeBuilding(state, action.id)) done += 1;
      } else if (action.type === "wood") {
        if (buyWoodForElf(state, elf.id)) done += 1;
      }
    }
  }
}

function updateTrollAi(state: GameState, dt: number) {
  state.ai.trollTimer -= dt;
  if (state.ai.trollTimer > 0) return;
  state.ai.trollTimer = 0.7 * DIFFICULTIES[state.difficulty].aiInterval;
  for (const t of state.trolls) {
    if (t.isPlayer || !t.alive) continue;
    const actions = planTrollActions(state, t);
    for (const action of actions) {
      if (action.type === "shop") buyShopItem(state, t.id, action.key);
      else if (action.type === "hut" && t.hutId >= 0) tryUpgradeBuilding(state, t.hutId);
      else if (action.type === "windwalk") castTrollSkill(state, t.id, "windwalk");
      else if (action.type === "recall") castTrollSkill(state, t.id, "recall");
    }
  }
}

function checkResult(state: GameState) {
  if (state.result) return;
  const trollsGone = state.trolls.every((t) => !t.alive || t.wolf);
  if (trollsGone) {
    state.result = state.faction === "elf" ? "win" : "lose";
    return;
  }
  const elvesGone = state.elves.every((elf) => !elf.alive);
  if (elvesGone) {
    state.result = state.faction === "troll" ? "win" : "lose";
    return;
  }
  if (state.surviveTime !== null && state.time >= state.surviveTime) {
    state.result = state.faction === "elf" ? "win" : "lose";
  }
}

/** 推进一帧模拟。dt 为秒（建议 1/60 固定步长）。 */
export function stepGame(state: GameState, dt: number, input: InputState) {
  if (state.result) return;
  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 24);
  state.nightTimer = Math.max(0, state.nightTimer - dt);
  if (state.hint) {
    state.hint.t -= dt;
    if (state.hint.t <= 0) state.hint = null;
  }

  updateBuildingTimers(state, dt);
  updateEconomy(state, dt);
  spawnWisps(state, dt);
  updateWisps(state, dt);
  updateRepairers(state, dt);
  updateTowers(state, dt);
  if (state.result) return;

  updateElfAi(state, dt);
  updateTrollAi(state, dt);

  for (const elf of state.elves) {
    const player = elf.id === state.playerElf;
    updateElfHero(state, elf, dt, player ? input : { mx: 0, my: 0 });
  }

  for (const t of state.trolls) {
    if (t.isPlayer) {
      updateTroll(state, t, dt, input);
    } else {
      const plan = t.alive ? planTrollMove(state, t, dt) : { mx: 0, my: 0 };
      updateTroll(state, t, dt, plan);
    }
  }

  updateEffects(state, dt);
  checkResult(state);
  if (state.sfx.length > 14) state.sfx.splice(0, state.sfx.length - 14);
}

/* ------------------------------------------------------------------ */
/* 建造 / 升级 / 修理 / 经济                                           */
/* ------------------------------------------------------------------ */

function tileRangeFree(state: GameState, kind: BuildingKind, gx: number, gy: number, elf: Elf): { ok: boolean; reason?: string } {
  const size = BUILD_SPECS[kind].size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tx = gx + x;
      const ty = gy + y;
      if (tx < 0 || ty < 0 || tx >= MAP_TILES || ty >= MAP_TILES) return { ok: false, reason: "超出地图" };
      if (isTerrainBlocked(tx, ty)) return { ok: false, reason: "地形不可建造" };
      for (const b of state.buildings) {
        if (!b.alive) continue;
        if (tx >= b.gx && tx < b.gx + b.size && ty >= b.gy && ty < b.gy + b.size) {
          return { ok: false, reason: "位置已被占用" };
        }
      }
      const cx = tileCenter(tx);
      const cy = tileCenter(ty);
      if (Math.hypot(elf.x - cx, elf.y - cy) < ELF_HERO.radius + TILE / 2) {
        return { ok: false, reason: "精灵站在此处" };
      }
    }
  }
  return { ok: true };
}

export function canBuildAt(state: GameState, elfIndex: number, kind: BuildingKind, gx: number, gy: number): BuildCheck {
  const elf = state.elves[elfIndex];
  if (!elf || !elf.alive) return { ok: false, reason: "精灵已阵亡" };
  const spec = BUILD_SPECS[kind];
  if (!spec || spec.team !== "elf" || kind === "tree") return { ok: false, reason: "无法建造" };
  // 原作允许精灵在地图任意位置建造（例如开局在巨魔基地旁偷放帐篷）
  const free = tileRangeFree(state, kind, gx, gy, elf);
  if (!free.ok) return free;
  const level = spec.levels[0];
  if (elf.gold < level.cost) return { ok: false, reason: "金币不足" };
  if (elf.wood < level.wood) return { ok: false, reason: "木材不足" };
  return { ok: true };
}

export function tryBuildForElf(
  state: GameState,
  elfIndex: number,
  kind: BuildingKind,
  gx: number,
  gy: number,
): boolean {
  if (state.result) return false;
  const check = canBuildAt(state, elfIndex, kind, gx, gy);
  if (!check.ok) return false;
  const elf = state.elves[elfIndex];
  const level = BUILD_SPECS[kind].levels[0];
  elf.gold -= level.cost;
  elf.wood -= level.wood;
  const b = newBuilding(state.nextId++, kind, elf.id, "elf", gx, gy, false);
  state.buildings.push(b);
  addFx(state, "dust", b.x, b.y + 20, 40, "#d8c08a", 0, 0.5);
  if (elf.isPlayer) state.sfx.push("pickup");
  return true;
}

export function upgradeCost(state: GameState, id: number): { gold: number; wood: number } | null {
  const b = buildingOf(state, id);
  if (!b) return null;
  const levels = BUILD_SPECS[b.kind].levels;
  if (b.level >= levels.length) return null;
  const next = levels[b.level];
  return { gold: next.cost, wood: next.wood };
}

export function tryUpgradeBuilding(state: GameState, id: number): boolean {
  if (state.result) return false;
  const b = buildingOf(state, id);
  if (!b) return false;
  const levels = BUILD_SPECS[b.kind].levels;
  if (b.level >= levels.length) return false;
  const next = levels[b.level];
  if (b.team === "elf") {
    const elf = state.elves[b.owner];
    if (!elf || !elf.alive || elf.gold < next.cost || elf.wood < next.wood) return false;
    elf.gold -= next.cost;
    elf.wood -= next.wood;
    b.spentGold += next.cost;
    b.spentWood += next.wood;
  } else {
    const t = state.trolls[b.owner];
    if (!t || !t.alive || t.wolf || t.gold < next.cost) return false;
    t.gold -= next.cost;
    b.spentGold += next.cost;
  }
  const diff = next.hp - b.maxHp;
  b.level += 1;
  b.maxHp = next.hp;
  b.hp += diff;
  addFx(state, "ring", b.x, b.y, 46, "#ffe9a3", 0, 0.5);
  addFloat(state, b.x, b.y - 30, "升级", "#ffe9a3", 15);
  if (b.team === "elf" ? state.elves[b.owner]?.isPlayer : state.trolls[b.owner]?.isPlayer) {
    state.sfx.push("levelup");
  }
  return true;
}

export function repairBuilding(state: GameState, id: number): boolean {
  const b = buildingOf(state, id);
  if (!b || b.team !== "elf" || b.hp >= b.maxHp) return false;
  const elf = state.elves[b.owner];
  if (!elf || !elf.alive) return false;
  const missing = b.maxHp - b.hp;
  const cost = Math.max(5, Math.ceil(missing * 0.25));
  if (elf.gold < cost) {
    if (elf.isPlayer) pushHint(state, "金币不足，无法修理", 2);
    return false;
  }
  elf.gold -= cost;
  b.hp = b.maxHp;
  addFx(state, "heal", b.x, b.y, 46, "#8bf0a6", 0, 0.5);
  addFloat(state, b.x, b.y - 28, `修理 -${cost}`, "#8bf0a6", 14);
  if (elf.isPlayer) state.sfx.push("heal");
  return true;
}

export function repairCost(b: Building | undefined): number {
  if (!b || b.hp >= b.maxHp) return 0;
  return Math.max(5, Math.ceil((b.maxHp - b.hp) * 0.25));
}

export function demolishBuilding(state: GameState, id: number): boolean {
  const b = buildingOf(state, id);
  if (!b || b.kind === "tree" || b.kind === "hut") return false;
  const refundGold = Math.floor(b.spentGold * 0.5);
  const refundWood = Math.floor(b.spentWood * 0.5);
  if (b.team === "elf") {
    const elf = state.elves[b.owner];
    if (!elf) return false;
    elf.gold += refundGold;
    elf.wood += refundWood;
  }
  b.alive = false;
  b.hp = 0;
  addFx(state, "dust", b.x, b.y, 36, "#c9a87a", 0, 0.4);
  addFloat(state, b.x, b.y - 20, `+${refundGold}`, "#ffd479", 15);
  return true;
}

export function buyWood(state: GameState): boolean {
  const elf = playerElfOf(state);
  if (!elf || !elf.alive) return false;
  return buyWoodForElf(state, elf.id);
}

function buyWoodForElf(state: GameState, elfIndex: number): boolean {
  const elf = state.elves[elfIndex];
  if (!elf || !elf.alive) return false;
  const totalBuys = state.elves.reduce((sum, item) => sum + item.woodBuys, 0);
  const price = WOOD_PACK.basePrice + WOOD_PACK.step * totalBuys;
  if (elf.gold < price) return false;
  elf.gold -= price;
  elf.wood += WOOD_PACK.amount;
  elf.woodBuys += 1;
  state.woodPrice = price + WOOD_PACK.step;
  if (elf.isPlayer) {
    addFloat(state, elf.x, elf.y - 34, `+${WOOD_PACK.amount} 木材`, "#c7e3a0", 16);
    state.sfx.push("pickup");
  }
  return true;
}

export function currentWoodPrice(state: GameState): number {
  return state.woodPrice;
}

/* ------------------------------------------------------------------ */
/* 巨魔商店与技能                                                      */
/* ------------------------------------------------------------------ */

export function buyShopItem(state: GameState, trollIndex: number, key: ShopKey): boolean {
  if (state.result) return false;
  const t = state.trolls[trollIndex];
  if (!t || !t.alive || t.wolf) return false;
  const spec = SHOP_ITEMS[key];
  const level = t.items[key];
  if (level >= spec.costs.length) return false;
  const cost = spec.costs[level];
  if (t.gold < cost) {
    if (t.isPlayer) pushHint(state, "金币不足", 2);
    return false;
  }
  t.gold -= cost;
  t.items[key] = level + 1;
  if (key === "vitality") {
    t.maxHp += spec.per;
    t.hp += spec.per;
    addFx(state, "heal", t.x, t.y, 54, "#8bf0a6", 0, 0.6);
  }
  if (t.isPlayer) state.sfx.push("levelup");
  addFloat(state, t.x, t.y - 40, `${spec.label}`, "#a8f0ff", 16);
  return true;
}

export function buyScroll(state: GameState, trollIndex: number): boolean {
  const t = state.trolls[trollIndex];
  if (!t || !t.alive || t.gold < SCROLL.cost) return false;
  t.gold -= SCROLL.cost;
  t.hp = Math.min(t.maxHp, t.hp + SCROLL.heal);
  addFx(state, "heal", t.x, t.y, 54, "#8bf0a6", 0, 0.6);
  addFloat(state, t.x, t.y - 40, `+${SCROLL.heal}`, "#8bf0a6", 16);
  if (t.isPlayer) state.sfx.push("heal");
  return true;
}

export function castElfSkill(state: GameState, skill: ElfSkill, mx: number, my: number): boolean {
  const elf = playerElfOf(state);
  if (!elf) return false;
  return castElfSkillForElf(state, elf, skill, mx, my);
}

function castElfSkillForElf(state: GameState, elf: Elf, skill: ElfSkill, mx: number, my: number): boolean {
  if (!elf.alive || state.result) return false;
  const spec = ELF_SKILLS[skill];
  if (elf.cooldowns[skill] > 0) return false;

  if (skill === "night") {
    state.nightTimer = Math.max(state.nightTimer, spec.value ?? 12);
    elf.cooldowns[skill] = spec.cooldown;
    addFx(state, "ring", elf.x, elf.y, 260, "#7fb2ff", 0, 1.2);
    pushHint(state, "黑夜降临：精灵可以潜行了", 3);
    state.sfx.push("skill_frost");
    return true;
  }

  if (skill === "entangle") {
    const troll = nearestTroll(state, elf.x, elf.y, spec.range ?? 300);
    if (!troll) {
      if (elf.isPlayer) pushHint(state, "范围内没有巨魔", 1.6);
      return false;
    }
    troll.stunTime = Math.max(troll.stunTime, spec.value ?? 2.2);
    elf.cooldowns[skill] = spec.cooldown;
    addFx(state, "ring", troll.x, troll.y, 46, "#9adf7a", 0, 0.6);
    addFloat(state, troll.x, troll.y - 36, "缠绕", "#9adf7a", 15);
    if (elf.isPlayer) state.sfx.push("skill");
    return true;
  }

  if (skill === "blink") {
    let dx = mx;
    let dy = my;
    if (Math.hypot(dx, dy) < 0.05) {
      const threat = nearestTroll(state, elf.x, elf.y, 480);
      if (threat) {
        dx = elf.x - threat.x;
        dy = elf.y - threat.y;
      } else {
        dx = 1;
        dy = 0;
      }
    }
    const len = Math.hypot(dx, dy) || 1;
    const dist = spec.range ?? 6 * TILE;
    elf.x = clamp(elf.x + (dx / len) * dist, ELF_HERO.radius, MAP_SIZE - ELF_HERO.radius);
    elf.y = clamp(elf.y + (dy / len) * dist, ELF_HERO.radius, MAP_SIZE - ELF_HERO.radius);
    resolveCircle(state, elf, ELF_HERO.radius, false);
    elf.cooldowns[skill] = spec.cooldown;
    addFx(state, "ring", elf.x, elf.y, 36, "#bfe3ff", 0, 0.5);
    addFx(state, "dust", elf.x, elf.y, 30, "#bfe3ff", 0, 0.4);
    if (elf.isPlayer) state.sfx.push("skill");
    return true;
  }

  // reinforce
  let count = 0;
  for (const b of state.buildings) {
    if (!b.alive || b.team !== "elf" || b.owner !== elf.id || b.kind === "tree") continue;
    const ratio = b.kind === "woodwall" || b.kind === "stone" || b.kind === "icewall" ? 0.5 : 0.35;
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * ratio);
    addFx(state, "heal", b.x, b.y, 30, "#8bf0a6", 0, 0.4);
    count += 1;
  }
  if (count === 0) return false;
  elf.cooldowns[skill] = spec.cooldown;
  pushHint(state, "建筑已加固", 2);
  if (elf.isPlayer) state.sfx.push("heal");
  return true;
}

export function castTrollSkill(state: GameState, trollIndex: number, skill: TrollSkill): boolean {
  const t = state.trolls[trollIndex];
  if (!t || !t.alive || state.result) return false;
  const spec = TROLL_SKILLS[skill];
  if (skill === "windwalk") {
    if (t.windwalkCd > 0 || t.wolf) return false;
    t.windwalk = spec.value ?? 5;
    t.windwalkCd = spec.cooldown;
    addFx(state, "ring", t.x, t.y, 40, "#cfe8ff", 0, 0.5);
    addFloat(state, t.x, t.y - 38, "疾风步", "#cfe8ff", 15);
    if (t.isPlayer) state.sfx.push("skill");
    return true;
  }
  if (t.recallCd > 0) return false;
  const hut = t.hutId >= 0 ? buildingOf(state, t.hutId) : undefined;
  if (!hut) return false;
  t.recallCd = spec.cooldown;
  t.x = hut.x;
  t.y = hut.y + TWO * 0.75;
  resolveCircle(state, t, trollRadius(t), false);
  addFx(state, "ring", t.x, t.y, 50, "#d9b8ff", 0, 0.6);
  pushHint(state, "巫医将巨魔拉回小屋", 2);
  if (t.isPlayer) state.sfx.push("skill");
  return true;
}

export function getNight(state: GameState): boolean {
  return state.nightTimer > 0;
}

export function nearestTrollTo(state: GameState, x: number, y: number): Point | null {
  const t = nearestTroll(state, x, y, Number.POSITIVE_INFINITY);
  return t ? { x: t.x, y: t.y } : null;
}

/** 供 HUD 使用：玩家在建造预览时需要的成本 */
export function buildCost(kind: BuildingKind): { gold: number; wood: number } {
  const level = BUILD_SPECS[kind].levels[0];
  return { gold: level.cost, wood: level.wood };
}
