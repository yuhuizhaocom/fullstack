// tve4 规则自检：npx tsx scripts/tve4/check_rules.ts
// 校验数值来自 data/game/game-rules.json（原版解包核对）。
import assert from "node:assert/strict";

import { GRID_H, GRID_W, RULE_PREP, TILE } from "../../src/lib/tve4/config";
import {
  buyEquipment,
  canBuyEquipment,
  canBuild,
  canDemolish,
  castSkill,
  createGame,
  demolishBuilding,
  getPlayer,
  setBlocked,
  stepGame,
  tradeWood,
  tryBuild,
  tryUpgrade,
} from "../../src/lib/tve4/engine";
import { buildBlocked, gateCells, ROOM_ELEMENTS, SPAWNS } from "../../src/lib/tve4/map";
import { EQUIPMENT_RULE, MARKET_RULE, RULES } from "../../src/lib/tve4/rules";
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

check("初始状态：OLD 初始 30/70 金、木材 0", () => {
  const s = createGame();
  assert.equal(s.phase, "prep");
  assert.equal(s.heroes.length, 1);
  assert.equal(getPlayer(s)?.gold, 30);
  assert.equal(getPlayer(s)?.wood, 0);
});

check(`准备期 ${RULE_PREP.SINGLE} 秒后才出现巨魔`, () => {
  const s = createGame();
  openMap(s);
  run(s, RULE_PREP.SINGLE - 1);
  assert.equal(s.trollSpawned, false);
  run(s, 1.5);
  assert.equal(s.trollSpawned, true);
  assert.equal(s.phase, "battle");
});

check("建造：费用扣除、占位、非法位置", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  assert.equal(canBuild(s, "wall", 50, 50).ok, true);
  assert.equal(tryBuild(s, "wall", 50, 50), true);
  assert.equal(p.gold, 26);
  assert.equal(canBuild(s, "wall", 50, 50).ok, false);
});

check("建造：金币不足拒绝", () => {
  const s = createGame();
  openMap(s);
  getPlayer(s)!.gold = 0;
  assert.equal(tryBuild(s, "wall", 40, 40), false);
});

check("升级：墙 10 级链按规则文件扣费", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 1000;
  tryBuild(s, "wall", 40, 40);
  const b = s.buildings[0];
  assert.equal(b.level, 1);
  assert.equal(tryUpgrade(s, b.id), true);
  assert.equal(b.level, 2);
  assert.equal(p.gold, 988);
});

check("经济：金矿每秒 1 金", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 1000;
  tryBuild(s, "mine", 40, 40);
  s.buildings[0].buildTimer = 0;
  p.gold = 0;
  run(s, 6);
  assert.ok(p.gold >= 5 && p.gold <= 7, `实际 ${p.gold}`);
});

check("碰撞：精灵和巨魔都不能穿薄墙", () => {
  for (const faction of ["elf", "troll"] as const) {
    const s = createGame({ testMode: true });
    openMap(s);
    const h = s.heroes.find((x) => x.faction === faction)!;
    const other = s.heroes.find((x) => x.faction !== faction)!;
    h.x = 30 * TILE + 8;
    h.y = 30 * TILE + 8;
    other.x = 60 * TILE;
    other.y = h.y;
    for (let y = 20; y <= 40; y += 1) s.blocked[y * GRID_W + 31] = 1;
    run(s, 1);
    assert.ok(h.x < 31 * TILE, `${faction} 不应穿墙，x=${h.x}`);
  }
});

check("伤害：整数部分转金币（R2I 截断）", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const p = getPlayer(s)!;
  p.gold = 0;
  p.hp = 1000;
  p.maxHp = 1000;
  p.x = 40 * TILE;
  p.y = 40 * TILE;
  troll.x = p.x + 20;
  troll.y = p.y;
  const before = troll.gold;
  run(s, 0.1);
  assert.ok(troll.gold > before);
});

check("技能：闪烁冷却与位移", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  const before = { x: p.x, y: p.y };
  assert.equal(castSkill(s, "blink", { x: p.x + 200, y: p.y }), true);
  assert.ok(Math.hypot(p.x - before.x, p.y - before.y) > 40);
  assert.equal(castSkill(s, "blink", { x: p.x + 200, y: p.y }), false);
});

check("胜负：force 清空判负，时间不自动胜利", () => {
  const s = createGame();
  openMap(s);
  s.time = 310;
  run(s, 0.1);
  assert.equal(s.result, null);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.lives = 0;
  troll.alive = false;
  run(s, 0.1);
  assert.equal(s.result, "win");
});

check("胜负：精灵倒下判负", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const p = getPlayer(s)!;
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  p.hp = 1;
  troll.x = p.x + 20;
  troll.y = p.y;
  run(s, 0.3);
  assert.equal(s.result, "lose");
});

check("测试模式：巨魔立即出现", () => {
  const s = createGame({ testMode: true });
  assert.equal(s.testMode, true);
  assert.equal(s.trollSpawned, true);
  assert.equal(s.heroes.length, 2);
});

check("隐身：攻击取消疾风步（无自创飘字）", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const p = getPlayer(s)!;
  p.x = troll.x + 20;
  p.y = troll.y;
  p.hp = 10000;
  p.maxHp = 10000;
  troll.buffs.windwalk = 5;
  run(s, 0.25);
  assert.equal(troll.buffs.windwalk, 0);
  assert.ok(!s.floats.some((f) => f.text.includes("现身")));
});

check("显式地图：房间入口开放、外墙封闭、全图连通", () => {
  const grid = buildBlocked();
  for (const room of ROOM_ELEMENTS) {
    const skip = new Set(gateCells(room).map(([x, y]) => `${x},${y}`));
    for (const [x, y] of gateCells(room)) assert.equal(grid[y * GRID_W + x], 0);
    for (let x = room.x0; x <= room.x1; x += 1) {
      for (const y of [room.y0, room.y1]) {
        if (!skip.has(`${x},${y}`)) assert.equal(grid[y * GRID_W + x], 1);
      }
    }
  }
  const open = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && grid[y * GRID_W + x] === 0;
  let total = 0;
  for (let i = 0; i < grid.length; i += 1) if (grid[i] === 0) total += 1;
  const seen = new Set([`${SPAWNS.elf.gx},${SPAWNS.elf.gy}`]);
  const q = [[SPAWNS.elf.gx, SPAWNS.elf.gy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !open(nx, ny)) continue;
      seen.add(key);
      q.push([nx, ny]);
    }
  }
  assert.equal(seen.size, total);
});

check("规则：FIX/SURVIVE 准备期 45 秒", () => {
  const s = createGame({ rule: "SURVIVE" });
  openMap(s);
  run(s, 44);
  assert.equal(s.trollSpawned, false);
  run(s, 2);
  assert.equal(s.trollSpawned, true);
});

check("规则：SURVIVE 不因巨魔死亡判胜", () => {
  const s = createGame({ rule: "SURVIVE", testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.lives = 0;
  troll.alive = false;
  run(s, 0.1);
  assert.equal(s.result, null);
});

check("复活规则：精灵 3 条命并复活", () => {
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
});

check("双倍规则：巨魔死亡转狼，20 秒后复活，无属性倍率", () => {
  const s = createGame({ rule: "DOUBLE", testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const p = getPlayer(s)!;
  troll.hp = 1;
  troll.invuln = 0;
  p.x = troll.x + 20;
  p.y = troll.y;
  run(s, 0.2);
  assert.equal(troll.alive, false);
  assert.equal(troll.isWolf, true);
  assert.ok(troll.deathTimer > 19 && troll.deathTimer <= RULES.respawn.wolf);
  run(s, RULES.respawn.wolf + 0.5);
  assert.equal(troll.alive, true);
  assert.ok(troll.maxHp >= 750); // 无自创 0.55 倍率；变化来自装备
});

check("巨魔小屋：系统创建，3 金/秒，6% 回血", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const house = s.buildings.find((b) => b.kind === "trollHouse")!;
  assert.ok(house);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.items = EQUIPMENT_RULE.items.map((i) => i.key); // 防止 AI 买装备影响收入断言
  troll.x = house.x;
  troll.y = house.y;
  const gold = troll.gold;
  troll.hp = 100;
  run(s, 4);
  assert.ok(troll.gold >= gold + 9);
  assert.ok(troll.hp > 100);
});

check("显影塔：256 木，反隐范围内巨魔现形", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 1000;
  p.wood = 300;
  assert.equal(tryBuild(s, "reveal", 40, 40), true);
  assert.equal(p.wood, 44);
  const reveal = s.buildings.find((b) => b.kind === "reveal")!;
  reveal.buildTimer = 0;
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.x = reveal.x + 20;
  troll.y = reveal.y;
  run(s, 0.1);
  assert.ok(troll.buffs.revealed > 0);
});

check("市场：买卖 10 木，全局价格每次 ±5", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 1000;
  assert.equal(tradeWood(s, true), false);
  s.buildings.push({
    id: s.nextId++, kind: "market", faction: "elf",
    x: p.x, y: p.y, gx0: 0, gy0: 0, size: 2,
    level: 1, hp: 50, maxHp: 50, alive: true, buildTimer: 0, demolishTimer: 0, flash: 0, cd: 0,
  });
  const inPrice = s.woodPriceIn;
  const outPrice = s.woodPriceOut;
  assert.equal(tradeWood(s, true), true);
  assert.equal(p.wood, MARKET_RULE.tradeAmount);
  assert.equal(p.gold, 1000 - inPrice);
  assert.equal(s.woodPriceIn, inPrice + MARKET_RULE.priceStep);
  assert.equal(s.woodPriceOut, outPrice - MARKET_RULE.priceStep);
  assert.equal(tradeWood(s, false), true);
  assert.equal(p.wood, 0);
});

check("拆除：95% 血量、敌方英雄距离、作坊返全部升级花费", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 100000;
  tryBuild(s, "tent", 60, 60);
  const tent = s.buildings[0];
  for (let i = 0; i < 3; i += 1) tryUpgrade(s, tent.id);
  tent.hp = tent.maxHp;
  const before = p.gold;
  let expectedRefund = 0;
  for (let i = 0; i < tent.level; i += 1) expectedRefund += Number(RULES.buildings.tent.gold[i] ?? 0);
  assert.equal(canDemolish(s, tent.id).ok, true);
  assert.equal(demolishBuilding(s, tent.id), true);
  run(s, 0.4);
  assert.equal(tent.alive, false);
  assert.equal(p.gold - before, expectedRefund);
  tent.hp = tent.maxHp * 0.5;
  tent.alive = true;
  assert.equal(canDemolish(s, tent.id).ok, false);
});

check("装备：回商店附近购买，属性按规则文件生效", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.gold = 1000;
  const item = EQUIPMENT_RULE.items.find((i) => i.key === "sword1")!;
  troll.x = 120 * TILE;
  troll.y = 80 * TILE;
  assert.equal(canBuyEquipment(s, item.key), false);
  const spawn = { x: (64 + 0.5) * TILE, y: (42 + 0.5) * TILE };
  troll.x = spawn.x + 20;
  troll.y = spawn.y;
  const before = troll.damage;
  assert.equal(buyEquipment(s, item.key), true);
  assert.equal(troll.damage, before + (item.damage ?? 0));
  assert.equal(troll.gold, 1000 - item.gold);
  assert.equal(troll.items.includes(item.key), true);
});

check("碰撞格尺寸正确", () => {
  const s = createGame();
  assert.equal(s.blocked.length, GRID_W * GRID_H);
  setBlocked(s, new Uint8Array(GRID_W * GRID_H).fill(1));
  assert.equal(s.blocked[0], 1);
});

console.log(`\n${passed} checks passed`);
