// tve4 规则自检：npx tsx scripts/tve4/check_rules.ts
import assert from "node:assert/strict";

import {
  GAME_LIMIT,
  GRID_H,
  GRID_W,
  HERO_STATS,
  PREP_SECONDS,
  TILE,
  WOOD_BUY,
  WOOD_SELL,
  WOOD_STEP,
} from "../../src/lib/tve4/config";
import { buildBlocked, gateCells, ROOM_ELEMENTS, SPAWNS } from "../../src/lib/tve4/map";
import { RULES } from "../../src/lib/tve4/rules";
import {
  buyEquipment,
  canBuyEquipment,
  canBuild,
  canDemolish,
  demolishBuilding,
  castSkill,
  createGame,
  getPlayer,
  setBlocked,
  stepGame,
  tradeWood,
  tryBuild,
  tryUpgrade,
} from "../../src/lib/tve4/engine";
import type { GameState } from "../../src/lib/tve4/types";

const FIXED = 1 / 30;
let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function run(state: GameState, seconds: number, mx = 0, my = 0) {
  const steps = Math.round(seconds / FIXED);
  for (let i = 0; i < steps; i += 1) stepGame(state, FIXED, { mx, my });
}

function openMap(state: GameState) {
  state.blocked.fill(0);
}

console.log("tve4 rule checks");

check("初始状态：准备期、无巨魔、玩家资源正确", () => {
  const s = createGame();
  assert.equal(s.phase, "prep");
  assert.equal(s.heroes.length, 1);
  assert.equal(getPlayer(s)?.gold, 30);
  assert.equal(getPlayer(s)?.lives, 1);
});

check(`准备期持续 ${PREP_SECONDS} 秒后才出现巨魔`, () => {
  const s = createGame();
  openMap(s);
  run(s, PREP_SECONDS - 1);
  assert.equal(s.trollSpawned, false);
  assert.equal(s.heroes.length, 1);
  run(s, 1.1);
  assert.equal(s.trollSpawned, true);
  assert.equal(s.phase, "battle");
  assert.equal(s.heroes.length, 2);
});

check("建造：金币扣除、墙体占位、非法位置拒绝", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  assert.equal(canBuild(s, "wall", 50, 50).ok, true);
  assert.equal(tryBuild(s, "wall", 50, 50), true);
  assert.equal(p.gold, 26);
  assert.equal(canBuild(s, "wall", 50, 50).ok, false);
  s.blocked[60 * GRID_W + 60] = 1;
  assert.equal(canBuild(s, "wall", 60, 60).ok, false);
});

check("建造：金币不足时拒绝", () => {
  const s = createGame();
  openMap(s);
  getPlayer(s)!.gold = 0;
  assert.equal(canBuild(s, "tower", 40, 40).ok, false);
  assert.equal(tryBuild(s, "tower", 40, 40), false);
});

check("升级：等级提升、金币扣除、满级拒绝", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  tryBuild(s, "tower", 40, 40);
  const b = s.buildings[0];
  assert.equal(b.level, 1);
  p.gold = 1000;
  assert.equal(tryUpgrade(s, b.id), true);
  assert.equal(b.level, 2);
  assert.equal(p.gold, 984);
  assert.equal(tryUpgrade(s, b.id), true);
  assert.equal(b.level, 3);
  assert.equal(p.gold, 920);
  assert.equal(tryUpgrade(s, b.id), false);
});

check("经济：金矿每秒产出金币", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 1000;
  tryBuild(s, "mine", 40, 40);
  s.buildings[0].buildTimer = 0;
  p.gold = 0;
  run(s, 6);
  assert.ok(p.gold >= 5 && p.gold <= 7, `期望 5~7 金，实际 ${p.gold}`);
});

check("碰撞：墙体阻挡移动", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.x = 30 * TILE + 8;
  p.y = 30 * TILE + 8;
  s.blocked[30 * GRID_W + 31] = 1;
  run(s, 1, 1, 0);
  assert.ok(p.x < 31 * TILE, `不应穿过墙体，x=${p.x}`);
});

check("碰撞：巨魔不能穿过薄墙（半径大于墙厚的回归测试）", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const p = getPlayer(s)!;
  troll.x = 30 * TILE + 8;
  troll.y = 30 * TILE + 8;
  p.x = 60 * TILE;
  p.y = troll.y;
  for (let y = 20; y <= 40; y += 1) s.blocked[y * GRID_W + 31] = 1;
  run(s, 1);
  assert.ok(troll.x < 31 * TILE, `巨魔不应穿墙，x=${troll.x}`);
});

check("战斗：巨魔攻击造成伤害并获得金币（伤害转金币）", () => {
  const s = createGame();
  openMap(s);
  tryBuild(s, "wall", 50, 50);
  const wall = s.buildings[0];
  wall.buildTimer = 0;
  run(s, PREP_SECONDS + 0.2);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.x = wall.x + 26;
  troll.y = wall.y;
  troll.vx = 0;
  troll.vy = 0;
  const beforeHp = wall.hp;
  const beforeGold = troll.gold;
  run(s, 2);
  assert.ok(wall.hp < beforeHp, `墙体应该受伤，hp=${wall.hp}`);
  assert.ok(troll.gold > beforeGold, `巨魔应获得金币，gold=${troll.gold}`);
});

check("技能：闪烁消耗冷却并改变位置", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  const before = { x: p.x, y: p.y };
  assert.equal(castSkill(s, "blink", { x: p.x + 200, y: p.y }), true);
  assert.ok(Math.hypot(p.x - before.x, p.y - before.y) > 40);
  assert.ok(p.cooldowns.blink > 0);
  assert.equal(castSkill(s, "blink", { x: p.x + 200, y: p.y }), false);
});

check("胜负：巨魔 force 清空判定胜利，300 秒不自动胜利", () => {
  const s = createGame();
  openMap(s);
  s.time = GAME_LIMIT + 1;
  run(s, 0.1);
  assert.equal(s.result, null);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.lives = 0;
  troll.alive = false;
  run(s, 0.1);
  assert.equal(s.result, "win");
});

check("胜负：精灵生命耗尽判定失败", () => {
  const s = createGame();
  openMap(s);
  run(s, PREP_SECONDS + 0.2);
  const p = getPlayer(s)!;
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  p.lives = 1;
  p.hp = 1;
  troll.x = p.x + 20;
  troll.y = p.y;
  run(s, 0.3);
  assert.equal(s.result, "lose");
});

check("测试模式：巨魔立即出现，跳过准备期", () => {
  const s = createGame({ testMode: true });
  assert.equal(s.testMode, true);
  assert.equal(s.trollSpawned, true);
  assert.equal(s.phase, "battle");
  assert.equal(s.heroes.length, 2);
});

check("隐身：巨魔攻击后现身", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const p = getPlayer(s)!;
  p.x = troll.x + 20;
  p.y = troll.y;
  p.hp = 10000;
  troll.buffs.windwalk = 5;
  run(s, 0.25);
  assert.equal(troll.buffs.windwalk, 0);
});

check("显式地图：房间入口开放、其余外墙封闭", () => {
  const grid = buildBlocked();
  for (const room of ROOM_ELEMENTS) {
    const skip = new Set(gateCells(room).map(([x, y]) => `${x},${y}`));
    for (const [x, y] of gateCells(room)) {
      assert.equal(grid[y * GRID_W + x], 0, `房间 ${room.label} 入口应开放`);
    }
    for (let x = room.x0; x <= room.x1; x += 1) {
      for (const y of [room.y0, room.y1]) {
        if (!skip.has(`${x},${y}`)) assert.equal(grid[y * GRID_W + x], 1, `房间 ${room.label} 外墙 (${x},${y}) 应封闭`);
      }
    }
    for (let y = room.y0; y <= room.y1; y += 1) {
      for (const x of [room.x0, room.x1]) {
        if (!skip.has(`${x},${y}`)) assert.equal(grid[y * GRID_W + x], 1, `房间 ${room.label} 外墙 (${x},${y}) 应封闭`);
      }
    }
  }
});

check("显式地图：无建筑时全图开放格连通、无死角", () => {
  const grid = buildBlocked();
  const open = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && grid[y * GRID_W + x] === 0;
  let total = 0;
  for (let i = 0; i < grid.length; i += 1) if (grid[i] === 0) total += 1;
  const { gx, gy } = SPAWNS.elf;
  const seen = new Set<string>([`${gx},${gy}`]);
  const queue: Array<[number, number]> = [[gx, gy]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !open(nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  assert.equal(seen.size, total, `开放格 ${total}，可达 ${seen.size}`);
});

check("数据边界：碰撞格尺寸正确", () => {
  const s = createGame();
  assert.equal(s.blocked.length, GRID_W * GRID_H);
  setBlocked(s, new Uint8Array(GRID_W * GRID_H).fill(1));
  assert.equal(s.blocked[0], 1);
});

check("规则：FIX/SURVIVE 准备期 45 秒", () => {
  const s = createGame({ rule: "SURVIVE" });
  openMap(s);
  run(s, 30);
  assert.equal(s.trollSpawned, false);
  run(s, 15.1);
  assert.equal(s.trollSpawned, true);
});

check("规则：SURVIVE 只检查精灵清空，巨魔死亡不判胜", () => {
  const s = createGame({ rule: "SURVIVE", testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.lives = 0;
  troll.alive = false;
  run(s, 0.1);
  assert.equal(s.result, null);
  s.time = GAME_LIMIT;
  run(s, 0.1);
  assert.equal(s.result, "win");
});

check("复活规则：精灵有 3 条命并可复活", () => {
  const s = createGame({ rule: "REVIVE" });
  openMap(s);
  const p = getPlayer(s)!;
  assert.equal(p.lives, 3);
  p.hp = 0;
  p.alive = false;
  p.lives = 2;
  p.deathTimer = 0.1;
  run(s, 0.3);
  assert.equal(p.alive, true);
  assert.equal(p.lives, 2);
});

check("双倍规则：巨魔首次死亡转狼后复活", () => {
  const s = createGame({ rule: "DOUBLE", testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.alive = false;
  troll.hp = 0;
  troll.lives = 1; // killHero 中已扣命并为转狼补回 1 条
  troll.deathTimer = 0.1;
  run(s, 0.3);
  assert.equal(troll.alive, true);
  assert.equal(troll.isWolf, true);
  assert.ok(troll.maxHp < HERO_STATS.troll.hp);
});

check("巨魔小屋：提供每秒 3 金并在附近回血", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.gold = 1000;
  s.buildings.push({
    id: s.nextId++, kind: "trollHouse", faction: "troll",
    x: troll.x + 10, y: troll.y, gx0: 0, gy0: 0, size: 3,
    level: 1, hp: 550, maxHp: 550, alive: true, buildTimer: 0, flash: 0, cd: 0,
  });
  troll.hp = 100;
  troll.gold = 0;
  run(s, 3);
  assert.ok(troll.gold >= 9, `小屋收入应 >=9，实际 ${troll.gold}`);
  assert.ok(troll.hp > 100, `小屋应回血，hp=${troll.hp}`);
});

check("显影之塔：消耗木材建造并让疾风步巨魔现形", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 1000;
  p.wood = 300;
  assert.equal(tryBuild(s, "reveal", 40, 40), true);
  assert.equal(p.wood, 44);
  s.buildings[0].buildTimer = 0;
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.x = s.buildings[0].x + 20;
  troll.y = s.buildings[0].y;
  run(s, 0.1);
  assert.ok(troll.buffs.revealed > 0);
});

check("市场：买卖木材按固定步长结算", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 1000;
  assert.equal(tradeWood(s, true), false);
  s.buildings.push({
    id: s.nextId++, kind: "market", faction: "elf",
    x: p.x, y: p.y, gx0: 0, gy0: 0, size: 2,
    level: 1, hp: 50, maxHp: 50, alive: true, buildTimer: 0, flash: 0, cd: 0,
  });
  assert.equal(tradeWood(s, true), true);
  assert.equal(p.wood, WOOD_STEP);
  assert.equal(p.gold, 1000 - WOOD_BUY);
  assert.equal(tradeWood(s, false), true);
  assert.equal(p.wood, 0);
  assert.equal(p.gold, 1000 - WOOD_BUY + WOOD_SELL);
});

check("拆除：帐篷返还全部升级花费，条件由规则文件控制", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 1000;
  assert.equal(tryBuild(s, "tent", 60, 60), true);
  const tent = s.buildings[0];
  assert.equal(tryUpgrade(s, tent.id), true);
  assert.equal(tryUpgrade(s, tent.id), true);
  assert.equal(p.gold, 800);
  tent.hp = tent.maxHp;
  assert.equal(canDemolish(s, tent.id).ok, true);
  assert.equal(demolishBuilding(s, tent.id), true);
  assert.equal(tent.alive, false);
  assert.equal(p.gold, 1000);
});

check(`拆除：血量 <${Math.round(RULES.elfDemolish.minHpRatio * 100)}% 或巨魔在附近时拒绝`, () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const p = getPlayer(s)!;
  tryBuild(s, "wall", 60, 60);
  const wall = s.buildings[0];
  wall.buildTimer = 0;
  wall.hp = wall.maxHp * 0.5;
  assert.equal(canDemolish(s, wall.id).ok, false);
  wall.hp = wall.maxHp;
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.x = wall.x + 20;
  troll.y = wall.y;
  assert.equal(canDemolish(s, wall.id).ok, false);
  troll.x = wall.x + RULES.elfDemolish.trollAvoidRadius + 50;
  assert.equal(canDemolish(s, wall.id).ok, true);
});

check("装备：巨魔必须回出生点附近购买，属性按规则文件生效", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.gold = 1000;
  const sword = RULES.equipmentShop.items.find((i) => i.key === "sword")!;
  troll.x = 120 * TILE;
  troll.y = 80 * TILE;
  assert.equal(canBuyEquipment(s, sword.key), false);
  const spawn = { x: (64 + 0.5) * TILE, y: (42 + 0.5) * TILE };
  troll.x = spawn.x + 20;
  troll.y = spawn.y;
  const before = troll.damage;
  assert.equal(buyEquipment(s, sword.key), true);
  assert.equal(troll.damage, before + (sword.damage ?? 0));
  assert.equal(troll.gold, 1000 - sword.cost);
  assert.equal(troll.items.includes(sword.key), true);
  assert.equal(buyEquipment(s, sword.key), false);
});

console.log(`\n${passed} checks passed`);
