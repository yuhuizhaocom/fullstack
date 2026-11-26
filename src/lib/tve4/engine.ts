// tve4 规则引擎：数值与机制来自 data/game/game-rules.json（已从原版解包文件核对）。

import {
  ALL_SKILL_KEYS,
  BUILDINGS,
  ELF_START,
  GRID_H,
  GRID_W,
  HERO_STATS,
  LIVES,
  RULE_PREP,
  SKILLS,
  START_GOLD,
  START_WOOD,
  TILE,
  TROLL_START,
  WORLD_H,
  WORLD_W,
} from "./config";
import {
  BOUNTY_RULE,
  BUILDING_RULES,
  COMBAT_RULE,
  DEMOLISH_RULE,
  EQUIPMENT_RULE,
  MARKET_RULE,
  RESPAWN_RULE,
  RULES,
  VISION_RULE,
} from "./rules";
import type {
  Buffs,
  BuildKind,
  Building,
  Faction,
  FloatText,
  GameOptions,
  GameState,
  Hero,
  InputState,
  Mode,
  Rule,
  SkillKey,
} from "./types";

const SCALE = RULES.scale;

// ---------------------------------------------------------------- 工具

function emptyBuffs(): Buffs {
  return { haste: 0, windwalk: 0, berserk: 0, root: 0, silence: 0, revealed: 0 };
}

function emptyCooldowns(): Record<SkillKey, number> {
  const out = {} as Record<SkillKey, number>;
  for (const k of ALL_SKILL_KEYS) out[k] = 0;
  return out;
}

function gridToWorld(gx: number, gy: number) {
  return { x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE };
}

function cellBlocked(state: GameState, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return true;
  return state.blocked[gy * GRID_W + gx] === 1;
}

export function setBlocked(state: GameState, data: Uint8Array): void {
  for (let i = 0; i < Math.min(state.blocked.length, data.length); i += 1) {
    state.blocked[i] = data[i] > 0 ? 1 : 0;
  }
  clearSpawn(state, ELF_START.gx, ELF_START.gy);
  clearSpawn(state, TROLL_START.gx, TROLL_START.gy);
}

function clearSpawn(state: GameState, gx: number, gy: number): void {
  for (let y = gy - 2; y <= gy + 2; y += 1) {
    for (let x = gx - 2; x <= gx + 2; x += 1) {
      if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) state.blocked[y * GRID_W + x] = 0;
    }
  }
}

function addFloat(state: GameState, x: number, y: number, text: string, color: string, size = 13): void {
  state.floats.push({ x, y, text, color, size, t: 0, dur: 0.85 });
  if (state.floats.length > 80) state.floats.shift();
}

function addEffect(state: GameState, x: number, y: number, radius: number, color: string): void {
  state.effects.push({ x, y, radius, color, t: 0, dur: 0.42 });
  if (state.effects.length > 60) state.effects.shift();
}

function setHint(state: GameState, text: string): void {
  state.hint = { text, t: 2.6 };
}

// ---------------------------------------------------------------- 创建 / 死亡

export function createGame(options: GameOptions = {}): GameState {
  const mode: Mode = options.mode ?? "OLD";
  const rule: Rule = options.rule ?? "SINGLE";
  const testMode = options.testMode ?? false;
  const state: GameState = {
    mode,
    rule,
    testMode,
    elfShared: false,
    elfExposed: false,
    woodPriceIn: MARKET_RULE.buyPrice,
    woodPriceOut: MARKET_RULE.sellPrice,
    time: 0,
    phase: "prep",
    result: null,
    heroes: [],
    buildings: [],
    projectiles: [],
    effects: [],
    floats: [],
    hint: null,
    blocked: new Uint8Array(GRID_W * GRID_H),
    trollSpawned: false,
    incomeAcc: 0,
    aiTimer: 2,
    nextId: 1,
    stats: { kills: 0, destroyed: 0, goldEarned: 0, damage: 0 },
  };
  const p = gridToWorld(ELF_START.gx, ELF_START.gy);
  state.heroes.push(makeHero(state, "elf", true, p.x, p.y));
  if (testMode) {
    spawnTroll(state);
    setHint(state, "测试模式：巨魔已出现");
  } else {
    setHint(state, "准备阶段：建造防线，巨魔即将出现");
  }
  return state;
}

function makeHero(state: GameState, faction: Faction, isPlayer: boolean, x: number, y: number): Hero {
  const s = HERO_STATS[faction];
  return {
    id: state.nextId++,
    faction,
    isPlayer,
    isWolf: false,
    alive: true,
    lives: faction === "elf" && state.rule === "REVIVE" ? 3 : LIVES,
    x, y, vx: 0, vy: 0, facing: 0,
    flash: 0,
    invuln: 0,
    hp: s.hp, maxHp: s.hp, damage: s.damage, interval: s.interval, range: s.range,
    speed: s.speed, radius: s.radius,
    cd: 0, channelTime: 0, deathTimer: 0,
    gold: START_GOLD[faction], wood: START_WOOD,
    items: [], bonusIncome: 0, bonusLifesteal: 0,
    cooldowns: emptyCooldowns(), buffs: emptyBuffs(),
  };
}

function spawnTroll(state: GameState): void {
  const p = gridToWorld(TROLL_START.gx, TROLL_START.gy);
  const troll = makeHero(state, "troll", false, p.x, p.y);
  troll.invuln = RULES.trollInvulnerableSeconds;
  state.heroes.push(troll);
  // u03D 原版由系统创建，玩家不能自建
  state.buildings.push(makeBuilding(state, "trollHouse", "troll", TROLL_START.gx - 1, TROLL_START.gy - 1, 0));
  for (const [ox, oy] of EQUIPMENT_RULE.shopOffsets) {
    state.buildings.push(makeBuilding(
      state, "market", "troll",
      TROLL_START.gx + Math.round(ox / 16), TROLL_START.gy + Math.round(oy / 16), 0,
    ));
  }
  state.trollSpawned = true;
  state.phase = "battle";
  setHint(state, "巨魔出现了！守住你的阵地");
  addEffect(state, p.x, p.y, 90, "#ff8a5c");
}

function makeBuilding(state: GameState, kind: BuildKind, faction: Faction, gx: number, gy: number, buildTimer: number): Building {
  const def = BUILDINGS[kind];
  return {
    id: state.nextId++, kind, faction,
    x: (gx + def.size / 2) * TILE, y: (gy + def.size / 2) * TILE,
    gx0: gx, gy0: gy, size: def.size, level: 1,
    hp: def.levels[0].hp, maxHp: def.levels[0].hp,
    alive: true, buildTimer, demolishTimer: 0, flash: 0, cd: 0,
  };
}

function respawnHero(state: GameState, h: Hero): void {
  const s = HERO_STATS[h.faction];
  const point = h.faction === "elf" ? ELF_START : TROLL_START;
  const p = gridToWorld(point.gx, point.gy);
  h.alive = true;
  h.hp = h.maxHp;
  h.x = p.x;
  h.y = p.y;
  h.cd = 0;
  h.invuln = 1;
  h.buffs = emptyBuffs();
  h.deathTimer = 0;
  addEffect(state, p.x, p.y, 70, h.faction === "elf" ? "#7ee08a" : "#ff8a5c");
  setHint(state, h.isPlayer ? "你已复活" : (h.isWolf ? "狼已复活" : "巨魔复活了"));
  void s;
}

export function getPlayer(state: GameState): Hero | undefined {
  return state.heroes.find((h) => h.isPlayer);
}

// ---------------------------------------------------------------- 碰撞 / 建造

function occupiedByBuilding(state: GameState, x: number, y: number, r: number): boolean {
  for (const b of state.buildings) {
    if (!b.alive || b.buildTimer > 0) continue;
    const half = (b.size * TILE) / 2;
    if (Math.abs(x - b.x) < half + r * 0.5 && Math.abs(y - b.y) < half + r * 0.5) return true;
  }
  return false;
}

function positionFree(state: GameState, x: number, y: number, r: number): boolean {
  if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return false;
  const minGX = Math.floor((x - r) / TILE);
  const maxGX = Math.floor((x + r) / TILE);
  const minGY = Math.floor((y - r) / TILE);
  const maxGY = Math.floor((y + r) / TILE);
  for (let gy = minGY; gy <= maxGY; gy += 1) {
    for (let gx = minGX; gx <= maxGX; gx += 1) {
      if (cellBlocked(state, gx, gy)) return false;
    }
  }
  return !occupiedByBuilding(state, x, y, r);
}

function moveWithCollision(state: GameState, h: Hero, dx: number, dy: number): void {
  const nx = h.x + dx;
  const ny = h.y + dy;
  if (positionFree(state, nx, ny, h.radius)) {
    h.x = nx;
    h.y = ny;
    return;
  }
  if (positionFree(state, nx, h.y, h.radius)) h.x = nx;
  if (positionFree(state, h.x, ny, h.radius)) h.y = ny;
}

function cellsFreeForBuilding(state: GameState, gx: number, gy: number, size: number): boolean {
  for (let y = gy; y < gy + size; y += 1) {
    for (let x = gx; x < gx + size; x += 1) {
      if (cellBlocked(state, x, y)) return false;
      for (const b of state.buildings) {
        if (!b.alive) continue;
        if (x >= b.gx0 && x < b.gx0 + b.size && y >= b.gy0 && y < b.gy0 + b.size) return false;
      }
    }
  }
  return true;
}

export function canBuild(
  state: GameState,
  kind: BuildKind,
  gx: number,
  gy: number,
  faction: Faction = "elf",
): { ok: boolean; reason: string } {
  const def = BUILDINGS[kind];
  if (!def) return { ok: false, reason: "未知建筑" };
  const size = def.size;
  if (gx < 0 || gy < 0 || gx + size > GRID_W || gy + size > GRID_H) return { ok: false, reason: "超出地图" };
  if (!cellsFreeForBuilding(state, gx, gy, size)) return { ok: false, reason: "地块不可用" };
  // 原版「同时只能有一座作坊」，死亡时解除（通过存活计数自然实现）
  if (kind === "tent" && state.buildings.some((b) => b.alive && b.kind === "tent" && b.faction === faction)) {
    return { ok: false, reason: "每个精灵只能有一座作坊" };
  }
  const hero = faction === "elf" ? getPlayer(state) : state.heroes.find((h) => h.faction === "troll");
  const level = def.levels[0];
  if (hero && hero.gold < level.cost) return { ok: false, reason: "金币不足" };
  if (hero && hero.wood < (level.woodCost ?? 0)) return { ok: false, reason: "木材不足" };
  return { ok: true, reason: "" };
}

export function tryBuild(state: GameState, kind: BuildKind, gx: number, gy: number, faction: Faction = "elf"): boolean {
  const check = canBuild(state, kind, gx, gy, faction);
  if (!check.ok) {
    setHint(state, check.reason);
    return false;
  }
  const def = BUILDINGS[kind];
  const hero = faction === "elf" ? getPlayer(state) : state.heroes.find((h) => h.faction === "troll");
  if (!hero) return false;
  hero.gold -= def.levels[0].cost;
  hero.wood -= def.levels[0].woodCost ?? 0;
  state.buildings.push(makeBuilding(state, kind, faction, gx, gy, def.buildTime));
  setHint(state, `正在建造${def.label}`);
  return true;
}

export function tryUpgrade(state: GameState, id: number): boolean {
  const b = state.buildings.find((x) => x.id === id && x.alive);
  if (!b) return false;
  const def = BUILDINGS[b.kind];
  if (b.level >= def.levels.length) {
    setHint(state, "已达最高等级");
    return false;
  }
  const spec = def.levels[b.level];
  const hero = b.faction === "elf" ? getPlayer(state) : state.heroes.find((h) => h.faction === b.faction);
  if (!hero || hero.gold < spec.cost) {
    setHint(state, "金币不足");
    return false;
  }
  if (hero.wood < (spec.woodCost ?? 0)) {
    setHint(state, "木材不足");
    return false;
  }
  hero.gold -= spec.cost;
  hero.wood -= spec.woodCost ?? 0;
  b.level += 1;
  b.maxHp = def.levels[b.level - 1].hp;
  b.hp = b.maxHp;
  b.buildTimer = 0.5;
  b.flash = 0.25;
  addEffect(state, b.x, b.y, b.size * TILE, "#ffd86b");
  setHint(state, `${def.label}升级到 Lv${b.level}`);
  return true;
}

// ---------------------------------------------------------------- 拆除 / 返还

export function canDemolish(state: GameState, id: number): { ok: boolean; reason: string } {
  const b = state.buildings.find((x) => x.id === id && x.alive);
  if (!b || b.faction !== "elf") return { ok: false, reason: "只能拆除自己的建筑" };
  if (b.hp / b.maxHp < DEMOLISH_RULE.minHpRatio) {
    return { ok: false, reason: `血量需 ≥ ${Math.round(DEMOLISH_RULE.minHpRatio * 100)}%` };
  }
  const heroRadius = DEMOLISH_RULE.enemyHeroRadius * SCALE;
  const eyeRadius = DEMOLISH_RULE.trollEyeRadius * SCALE;
  const troll = state.heroes.find((h) => h.faction === "troll" && h.alive);
  if (troll) {
    if (Math.hypot(troll.x - b.x, troll.y - b.y) <= heroRadius) {
      return { ok: false, reason: "附近有敌方英雄，暂时无法拆除" };
    }
    if (b.kind !== "tent" && troll.buffs.revealed <= 0 && Math.hypot(troll.x - b.x, troll.y - b.y) <= eyeRadius) {
      return { ok: false, reason: "被巨魔之眼照到的非作坊无法拆除" };
    }
  }
  return { ok: true, reason: "" };
}

export function demolishBuilding(state: GameState, id: number): boolean {
  const check = canDemolish(state, id);
  if (!check.ok) {
    setHint(state, check.reason);
    return false;
  }
  const b = state.buildings.find((x) => x.id === id)!;
  b.demolishTimer = DEMOLISH_RULE.delayedDeath; // 0.25 秒后走正常死亡链
  setHint(state, `正在拆除${BUILDINGS[b.kind].label}`);
  return true;
}

function refundTent(state: GameState, b: Building): void {
  if (b.kind !== "tent") return;
  const r = BUILDING_RULES.tent;
  const goldTable = Array.isArray(r.gold) ? r.gold : [r.gold];
  const woodTable = Array.isArray(r.wood) ? r.wood : [r.wood];
  let gold = 0;
  let wood = 0;
  for (let i = 0; i < b.level; i += 1) {
    gold += goldTable[i] ?? 0;
    wood += woodTable[i] ?? 0;
  }
  const hero = state.heroes.find((h) => h.faction === b.faction && h.isPlayer);
  if (hero) {
    hero.gold += gold;
    hero.wood += wood;
  }
  addFloat(state, b.x, b.y - 20, `+${gold} 金 +${wood} 木`, "#ffd86b", 13);
}

// ---------------------------------------------------------------- 战斗

interface DamageTarget {
  x: number;
  y: number;
  radius: number;
  hp: number;
  kind: "hero" | "building";
  ref: Hero | Building;
}

function heroTarget(state: GameState, h: Hero, maxRange: number): DamageTarget | null {
  let best: DamageTarget | null = null;
  let bestD = Infinity;
  for (const other of state.heroes) {
    if (!other.alive || other.faction === h.faction || other.invuln > 0) continue;
    const d = Math.hypot(other.x - h.x, other.y - h.y) - other.radius;
    if (d <= maxRange && d < bestD) {
      bestD = d;
      best = { x: other.x, y: other.y, radius: other.radius, hp: other.hp, kind: "hero", ref: other };
    }
  }
  if (best) return best;
  if (h.faction === "troll") {
    for (const b of state.buildings) {
      if (!b.alive || b.buildTimer > 0 || b.faction === h.faction) continue;
      const r = (b.size * TILE) / 2;
      const d = Math.hypot(b.x - h.x, b.y - h.y) - r;
      if (d <= maxRange && d < bestD) {
        bestD = d;
        best = { x: b.x, y: b.y, radius: r, hp: b.hp, kind: "building", ref: b };
      }
    }
  }
  return best;
}

function dealDamage(state: GameState, attacker: Hero, target: DamageTarget, raw: number): void {
  if (target.hp <= 0) return;
  if (target.kind === "hero" && (target.ref as Hero).invuln > 0) return;
  // 原版 Wind Walk：攻击即破隐，无自创飘字
  if (attacker.buffs.windwalk > 0) attacker.buffs.windwalk = 0;
  const amount = Math.floor(raw); // R2I 截断
  target.ref.hp -= amount;
  state.stats.damage += amount;
  // VERIFIED：伤害整数部分转金币，飘字只在攻击者处
  attacker.gold += amount;
  state.stats.goldEarned += amount;
  addFloat(state, attacker.x, attacker.y - 20, `+ ${amount}`, "#ffd86b", 12);
  if (attacker.faction === "troll" && COMBAT_RULE.lifestealModes.includes(state.mode)) {
    const heal = COMBAT_RULE.lifesteal * raw; // 0.22 × 真实伤害
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    addEffect(state, attacker.x, attacker.y, 22, "#7ee08a");
  }
  target.ref.flash = 0.16;
  if (target.ref.hp <= 0) {
    if (target.kind === "building") destroyBuilding(state, target.ref as Building);
    else killHero(state, target.ref as Hero, attacker);
  }
}

function destroyBuilding(state: GameState, b: Building): void {
  b.alive = false;
  b.hp = 0;
  state.stats.destroyed += 1;
  refundTent(state, b); // VERIFIED：任何死亡都返还（含被巨魔拆）
  addEffect(state, b.x, b.y, b.size * TILE * 0.9, "#ffb26b");
}

function bountyMin(state: GameState): number {
  const table = BOUNTY_RULE.angelStoleGoldPerMinute;
  const minute = Math.floor(state.time / 60);
  const idx = Math.min(minute, BOUNTY_RULE.angelStoleCapIndex);
  const value = table[Math.min(idx, table.length - 1)] ?? 1;
  return value * BOUNTY_RULE.minMultiplier;
}

function killHero(state: GameState, h: Hero, attacker: Hero): void {
  h.alive = false;
  h.hp = 0;
  h.deathTimer = RESPAWN_RULE.elfCleanup;
  h.lives -= 1;
  state.stats.kills += 1;
  addEffect(state, h.x, h.y, h.faction === "troll" ? 120 : 70, "#ff6b6b");
  addFloat(state, h.x, h.y - 24, "倒下", "#ff8a8a", 16);
  // VERIFIED：floor(gold*0.5) + wood*8 → MIDDLE 折半 → 偷金下限 → 上限
  let bounty = Math.floor(h.gold * BOUNTY_RULE.goldRatio) + h.wood * BOUNTY_RULE.woodMultiplier;
  if (state.mode === "MIDDLE") bounty = Math.floor(bounty * BOUNTY_RULE.middleRatio);
  bounty = Math.max(bounty, bountyMin(state));
  bounty = Math.min(bounty, BOUNTY_RULE.max);
  attacker.gold += bounty;
  state.stats.goldEarned += bounty;
  addFloat(state, h.x, h.y - 42, `+ ${bounty}`, "#ffd86b", 14);
  // DOUBLE：巨魔死亡转狼（原版是角色切换，不用属性倍率/加命）
  if (h.faction === "troll" && state.rule === "DOUBLE" && !h.isWolf) {
    h.isWolf = true;
    h.deathTimer = RESPAWN_RULE.wolf;
    h.lives = 1;
    setHint(state, "巨魔转为幽灵狼，20 秒后复活");
  } else {
    setHint(state, h.isPlayer ? "你被击败" : "巨魔被击败");
  }
}

// ---------------------------------------------------------------- 更新

function updateTimers(state: GameState, dt: number): void {
  for (const h of state.heroes) {
    if (!h.alive) {
      if (h.deathTimer > 0) {
        h.deathTimer -= dt;
        if (h.deathTimer <= 0 && h.lives > 0) respawnHero(state, h);
      }
      continue;
    }
    h.invuln = Math.max(0, h.invuln - dt);
    const nearHouse = h.faction === "troll" && state.buildings.some(
      (b) => b.alive && b.kind === "trollHouse" && b.buildTimer <= 0
        && Math.hypot(h.x - b.x, h.y - b.y) <= (BUILDING_RULES.trollHouse.auraRange ?? 500) * SCALE,
    );
    h.cd = Math.max(0, h.cd - dt);
    for (const k of ALL_SKILL_KEYS) h.cooldowns[k] = Math.max(0, h.cooldowns[k] - dt);
    if (nearHouse) {
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * (BUILDING_RULES.trollHouse.heal ?? 0.06) * dt);
      for (const k of ALL_SKILL_KEYS) h.cooldowns[k] = Math.max(0, h.cooldowns[k] - dt * 0.5);
    }
    for (const k of Object.keys(h.buffs) as (keyof Buffs)[]) h.buffs[k] = Math.max(0, h.buffs[k] - dt);
    if (h.channelTime > 0) {
      h.channelTime -= dt;
      if (h.channelTime <= 0) {
        h.channelTime = 0;
        const p = gridToWorld(TROLL_START.gx, TROLL_START.gy);
        h.x = p.x;
        h.y = p.y;
        h.invuln = 1;
        h.buffs.windwalk = 0;
      }
    }
    h.flash = Math.max(0, h.flash - dt);
  }
  for (const b of state.buildings) {
    b.flash = Math.max(0, b.flash - dt);
    if (b.alive && b.buildTimer > 0) b.buildTimer = Math.max(0, b.buildTimer - dt);
    if (b.alive && b.demolishTimer > 0) {
      b.demolishTimer -= dt;
      if (b.demolishTimer <= 0) {
        b.demolishTimer = 0;
        destroyBuilding(state, b);
      }
    }
  }
  state.effects = state.effects.filter((e) => (e.t += dt) < e.dur);
  state.floats = state.floats.filter((f) => (f.t += dt) < f.dur);
  if (state.hint && (state.hint.t -= dt) <= 0) state.hint = null;
}

function updateIncome(state: GameState, dt: number): void {
  state.incomeAcc += dt;
  while (state.incomeAcc >= 1) {
    state.incomeAcc -= 1;
    let elfIncome = 0;
    let trollIncome = 0;
    for (const b of state.buildings) {
      if (!b.alive || b.buildTimer > 0) continue;
      const income = BUILDINGS[b.kind].levels[b.level - 1].income ?? 0;
      if (b.faction === "elf") elfIncome += income;
      else trollIncome += income;
    }
    for (const h of state.heroes) {
      if (!h.alive) continue;
      const gain = (h.faction === "elf" ? elfIncome : trollIncome) + h.bonusIncome;
      if (gain > 0) {
        h.gold += gain;
        state.stats.goldEarned += gain;
      }
    }
  }
}

function updateHeroes(state: GameState, dt: number, input: InputState): void {
  for (const h of state.heroes) {
    if (!h.alive) continue;
    if (h.isPlayer) {
      let mx = input.mx || 0;
      let my = input.my || 0;
      const mag = Math.hypot(mx, my);
      if (mag > 0) {
        mx /= Math.max(1, mag);
        my /= Math.max(1, mag);
      }
      let speed = h.speed;
      if (h.buffs.haste > 0) speed *= 2.1;
      if (h.buffs.windwalk > 0) speed *= 1.5;
      if (h.buffs.berserk > 0) speed *= 1.5;
      if (h.buffs.root > 0) speed = 0;
      h.vx = mx * speed;
      h.vy = my * speed;
    }
    if (h.buffs.root > 0 || h.channelTime > 0) {
      h.vx = 0;
      h.vy = 0;
    }
    if (h.vx || h.vy) {
      moveWithCollision(state, h, h.vx * dt, h.vy * dt);
      h.facing = Math.atan2(h.vy, h.vx);
    }
    if (h.cd <= 0) {
      const target = heroTarget(state, h, h.range);
      if (target) {
        dealDamage(state, h, target, h.damage);
        h.facing = Math.atan2(target.y - h.y, target.x - h.x);
        h.cd = h.buffs.berserk > 0 ? h.interval * 0.5 : h.interval;
        addEffect(state, target.x, target.y, 18, h.faction === "elf" ? "#ffe08a" : "#ff8a5c");
      }
    }
  }
}

function updateBuildings(state: GameState, dt: number): void {
  for (const b of state.buildings) {
    if (!b.alive) continue;
    b.cd = Math.max(0, b.cd - dt);
    if (b.kind === "reveal" && b.buildTimer <= 0) {
      const r = BUILDINGS.reveal.levels[0].range ?? 112;
      for (const h of state.heroes) {
        if (h.alive && h.faction === "troll" && Math.hypot(h.x - b.x, h.y - b.y) <= r) {
          h.buffs.revealed = 1;
        }
      }
    }
    if (b.kind !== "tower" || b.buildTimer > 0 || b.cd > 0) continue;
    const spec = BUILDINGS[b.kind].levels[b.level - 1];
    const r = spec.range ?? 100;
    let target: Hero | null = null;
    let best = Infinity;
    for (const h of state.heroes) {
      if (!h.alive || h.faction === b.faction || h.invuln > 0) continue;
      const d = Math.hypot(h.x - b.x, h.y - b.y);
      if (d <= r && d < best) {
        best = d;
        target = h;
      }
    }
    if (target) {
      state.projectiles.push({
        id: state.nextId++, faction: b.faction,
        x: b.x, y: b.y - b.size * TILE * 0.4,
        tx: target.x, ty: target.y, speed: 420,
        damage: spec.damage ?? 4, t: 0,
      });
      b.cd = spec.interval ?? 1.5;
    }
  }
}

function updateProjectiles(state: GameState, dt: number): void {
  const keep: typeof state.projectiles = [];
  for (const p of state.projectiles) {
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const dist = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (dist <= step || dist < 6) {
      const attacker = state.heroes.find((h) => h.faction === p.faction && h.alive);
      for (const h of state.heroes) {
        if (!h.alive || h.faction === p.faction || h.invuln > 0) continue;
        if (Math.hypot(h.x - p.tx, h.y - p.ty) < h.radius + 14) {
          if (attacker) dealDamage(state, attacker, { x: h.x, y: h.y, radius: h.radius, hp: h.hp, kind: "hero", ref: h }, p.damage);
          else h.hp -= p.damage;
          break;
        }
      }
      addEffect(state, p.tx, p.ty, 20, "#ffe08a");
    } else {
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      p.t += dt;
      keep.push(p);
    }
  }
  state.projectiles = keep;
}

function nearShop(state: GameState, troll: Hero): boolean {
  const spawn = gridToWorld(TROLL_START.gx, TROLL_START.gy);
  return Math.hypot(troll.x - spawn.x, troll.y - spawn.y) <= EQUIPMENT_RULE.purchaseRadius;
}

function updateAI(state: GameState, dt: number): void {
  const troll = state.heroes.find((h) => h.faction === "troll");
  if (!troll || !troll.alive) return;
  const nextItem = EQUIPMENT_RULE.items.find((i) => !troll.items.includes(i.key));
  if (nextItem && nearShop(state, troll)) buyEquipment(state, nextItem.key);
  state.aiTimer -= dt;
  if (state.aiTimer <= 0) {
    state.aiTimer = 3 + Math.random() * 2;
    if (troll.cooldowns.berserk <= 0 && troll.hp < troll.maxHp * 0.7) castSkillFor(state, troll, "berserk");
    else if (troll.cooldowns.windwalk <= 0) castSkillFor(state, troll, "windwalk");
    const house = state.buildings.find((b) => b.alive && b.kind === "trollHouse");
    if (house && troll.gold > BUILDINGS.trollHouse.levels[house.level]?.cost) tryUpgrade(state, house.id);
  }
  const elf = state.heroes.find((h) => h.faction === "elf" && h.alive);
  const house = state.buildings.find((b) => b.alive && b.kind === "trollHouse");
  let tx: number;
  let ty: number;
  if (nextItem && troll.gold >= nextItem.gold && troll.hp > troll.maxHp * 0.5) {
    const spawn = gridToWorld(TROLL_START.gx, TROLL_START.gy);
    tx = spawn.x;
    ty = spawn.y;
  } else if (house && troll.hp < troll.maxHp * 0.35) {
    tx = house.x;
    ty = house.y;
  } else if (elf) {
    tx = elf.x;
    ty = elf.y;
  } else {
    const b = state.buildings.find((x) => x.alive && x.faction === "elf");
    if (!b) {
      troll.vx = 0;
      troll.vy = 0;
      return;
    }
    tx = b.x;
    ty = b.y;
  }
  const dx = tx - troll.x;
  const dy = ty - troll.y;
  const dist = Math.hypot(dx, dy);
  if (dist > troll.range + 6) {
    let speed = troll.speed;
    if (troll.buffs.haste > 0) speed *= 2.1;
    if (troll.buffs.windwalk > 0) speed *= 1.5;
    if (troll.buffs.berserk > 0) speed *= 1.5;
    if (troll.buffs.root > 0) speed = 0;
    troll.vx = (dx / dist) * speed;
    troll.vy = (dy / dist) * speed;
  } else {
    troll.vx = 0;
    troll.vy = 0;
  }
}

function checkResult(state: GameState): void {
  if (state.result) return;
  // VERIFIED：300 秒仅精灵互享视野；600 秒让没作坊的精灵暴露给巨魔
  if (!state.elfShared && state.time >= VISION_RULE.elfShareAtSeconds) {
    state.elfShared = true;
    setHint(state, "精灵共享视野已开启");
  }
  if (!state.elfExposed && state.time >= VISION_RULE.exposeAtSeconds) {
    state.elfExposed = true;
    setHint(state, "没有作坊的精灵已暴露视野");
  }
  const elf = getPlayer(state);
  const troll = state.heroes.find((h) => h.faction === "troll");
  const trollOut = !!troll && troll.lives <= 0 && !troll.alive;
  const elfOut = !!elf && elf.lives <= 0 && !elf.alive;
  if (state.rule === "SURVIVE") {
    if (elfOut) {
      state.result = "lose";
      state.phase = "over";
      setHint(state, "精灵倒下了，失败");
    }
    return;
  }
  if (trollOut) {
    state.result = "win";
    state.phase = "over";
    setHint(state, "巨魔已被消灭，胜利！");
  } else if (elfOut) {
    state.result = "lose";
    state.phase = "over";
    setHint(state, "精灵倒下了，失败");
  }
}

export function stepGame(state: GameState, dt: number, input: InputState): void {
  if (state.result) return;
  state.time += dt;
  if (!state.trollSpawned && state.time >= RULE_PREP[state.rule]) spawnTroll(state);
  updateTimers(state, dt);
  updateIncome(state, dt);
  updateHeroes(state, dt, input);
  updateBuildings(state, dt);
  updateProjectiles(state, dt);
  if (state.trollSpawned) updateAI(state, dt);
  checkResult(state);
}

// ---------------------------------------------------------------- 市场 / 装备

function hasMarket(state: GameState, faction: Faction): boolean {
  return state.buildings.some(
    (b) => b.alive && b.kind === "market" && b.faction === faction && b.buildTimer <= 0,
  );
}

/** VERIFIED：全局动态价格，买卖各 ±5，每次交易 10 木。 */
export function tradeWood(state: GameState, buy: boolean): boolean {
  const hero = getPlayer(state);
  if (!hero || !hasMarket(state, "elf")) {
    setHint(state, "需要先建造市场");
    return false;
  }
  const amount = MARKET_RULE.tradeAmount;
  if (buy) {
    if (hero.gold < state.woodPriceIn) {
      setHint(state, "金币不足");
      return false;
    }
    hero.gold -= state.woodPriceIn;
    hero.wood += amount;
  } else {
    if (hero.wood < amount) {
      setHint(state, "木材不足");
      return false;
    }
    hero.wood -= amount;
    hero.gold += state.woodPriceOut;
  }
  state.woodPriceIn = Math.min(MARKET_RULE.maxPrice, state.woodPriceIn + MARKET_RULE.priceStep);
  state.woodPriceOut = Math.max(MARKET_RULE.minPrice, state.woodPriceOut - MARKET_RULE.priceStep);
  addFloat(state, hero.x, hero.y - 30, `${buy ? "+" : "-"}${amount} 木`, "#bfe9ff", 12);
  return true;
}

export function canBuyEquipment(state: GameState, key: string): boolean {
  const troll = state.heroes.find((h) => h.faction === "troll" && h.alive);
  const item = EQUIPMENT_RULE.items.find((i) => i.key === key);
  if (!troll || !item || troll.items.includes(key)) return false;
  if (!nearShop(state, troll)) return false;
  return troll.gold >= item.gold;
}

export function buyEquipment(state: GameState, key: string): boolean {
  if (!canBuyEquipment(state, key)) {
    setHint(state, "需回到商店附近且金币足够");
    return false;
  }
  const item = EQUIPMENT_RULE.items.find((i) => i.key === key)!;
  const troll = state.heroes.find((h) => h.faction === "troll" && h.alive)!;
  troll.gold -= item.gold;
  troll.items.push(key);
  if (item.damage) troll.damage += item.damage;
  if (item.allStats || item.strength) troll.maxHp += (item.strength ?? 0) * 10 + (item.allStats ?? 0) * 10;
  if (item.agility) troll.speed += item.agility;
  if (item.heroDamage) troll.damage += item.heroDamage;
  if (item.armor) troll.maxHp += item.armor * 5;
  if (item.speed) troll.speed += item.speed;
  if (item.magicImmune) troll.invuln = Math.max(troll.invuln, 5);
  addEffect(state, troll.x, troll.y, 48, "#ffd86b");
  addFloat(state, troll.x, troll.y - 30, item.label, "#ffd86b", 13);
  setHint(state, `巨魔购买 ${item.label}`);
  return true;
}

// ---------------------------------------------------------------- 技能

function findOpenNear(state: GameState, x: number, y: number): { x: number; y: number } {
  const clampedX = Math.max(TILE, Math.min(WORLD_W - TILE, x));
  const clampedY = Math.max(TILE, Math.min(WORLD_H - TILE, y));
  if (positionFree(state, clampedX, clampedY, 14)) return { x: clampedX, y: clampedY };
  for (let ring = 1; ring <= 8; ring += 1) {
    for (let a = 0; a < 16; a += 1) {
      const ang = (a / 16) * Math.PI * 2;
      const px = clampedX + Math.cos(ang) * ring * TILE;
      const py = clampedY + Math.sin(ang) * ring * TILE;
      if (positionFree(state, px, py, 14)) return { x: px, y: py };
    }
  }
  return { x: clampedX, y: clampedY };
}

function skillDistance(key: SkillKey): number {
  if (key === "blink") return TILE * 12;
  return 0;
}

function castSkillFor(state: GameState, hero: Hero, key: SkillKey, aim?: { x: number; y: number } | null): boolean {
  if (!hero.alive || hero.cooldowns[key] > 0) return false;
  if (hero.faction === "troll" && hero.buffs.silence > 0) return false;
  const spec = SKILLS[hero.faction].find((s) => s.key === key);
  if (!spec) return false;
  const dist = skillDistance(key);
  if (dist > 0) {
    let dx = aim ? aim.x - hero.x : Math.cos(hero.facing);
    let dy = aim ? aim.y - hero.y : Math.sin(hero.facing);
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    const to = findOpenNear(state, hero.x + dx * dist, hero.y + dy * dist);
    addEffect(state, hero.x, hero.y, 40, "#bfe9ff");
    hero.x = to.x;
    hero.y = to.y;
    addEffect(state, hero.x, hero.y, 50, "#bfe9ff");
  }
  if (key === "haste") hero.buffs.haste = 15;
  if (key === "windwalk") hero.buffs.windwalk = 20;
  if (key === "berserk") hero.buffs.berserk = 10;
  if (key === "teleport") {
    hero.channelTime = 2;
    hero.vx = 0;
    hero.vy = 0;
  }
  if (key === "entangle" || key === "silence") {
    const troll = state.heroes.find((h) => h.faction === "troll" && h.alive);
    if (troll) {
      if (key === "entangle") troll.buffs.root = 3;
      else troll.buffs.silence = 5;
      addEffect(state, troll.x, troll.y, 34, "#9be7ff");
    }
  }
  hero.cooldowns[key] = spec.cd;
  addFloat(state, hero.x, hero.y - 26, spec.label, "#bfe9ff", 12);
  return true;
}

export function castSkill(state: GameState, key: SkillKey, aim?: { x: number; y: number } | null): boolean {
  const hero = getPlayer(state);
  if (!hero) return false;
  const ok = castSkillFor(state, hero, key, aim);
  if (!ok) {
    const spec = SKILLS[hero.faction].find((s) => s.key === key);
    setHint(state, spec ? `${spec.label}尚未就绪` : "技能不可用");
  }
  return ok;
}
