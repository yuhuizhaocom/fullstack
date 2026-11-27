// tve4 规则自检：npx tsx scripts/tve4/check_rules.ts
// 校验数值来自 data/game/game-rules.json（原版解包核对）。
import assert from "node:assert/strict";

import { GRID_H, GRID_W, RULE_PREP, SPAWNS, TILE, setActiveMap } from "../../src/lib/tve4/config";
import { DEFAULT_MAP_ID, MAP_DEFINITIONS, MAP_ORDER } from "../../src/lib/tve4/maps.generated";
import {
  buyEquipment,
  buyStrengthBook,
  canBuyEquipment,
  canBuild,
  canSummonMage,
  canDemolish,
  castSkill,
  createGame,
  demolishBuilding,
  getPlayer,
  relocateElf,
  setBlocked,
  stepGame,
  summonArchmage,
  toggleMobileDev,
  tradeWood,
  tryBuild,
  tryUpgrade,
} from "../../src/lib/tve4/engine";
import { buildBlocked } from "../../src/lib/tve4/map";
import { EQUIPMENT_RULE, MARKET_RULE, RULES, SCENARIO_RULE, VISION_RULE } from "../../src/lib/tve4/rules";
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

function upgradeNow(state: GameState, id: number) {
  const b = state.buildings.find((x) => x.id === id);
  if (b) b.buildTimer = 0;
  const ok = tryUpgrade(state, id);
  if (b) b.buildTimer = 0;
  return ok;
}

console.log("tve4 rule checks");

check("初始状态：OLD 初始 30/70 金、木材 0", () => {
  const s = createGame();
  assert.equal(s.phase, "prep");
  assert.equal(s.heroes.length, 1);
  assert.equal(getPlayer(s)?.gold, 30);
  assert.equal(getPlayer(s)?.wood, 0);
});

check("VERIFIED：MIDDLE 初始 10/50，OLD 30/70", () => {
  assert.equal(getPlayer(createGame({ mode: "OLD" }))?.gold, 30);
  assert.equal(getPlayer(createGame({ mode: "MIDDLE" }))?.gold, 10);
  const oldTroll = createGame({ mode: "OLD", playerFaction: "troll" });
  const midTroll = createGame({ mode: "MIDDLE", playerFaction: "troll" });
  assert.equal(getPlayer(oldTroll)?.gold, 70);
  assert.equal(getPlayer(midTroll)?.gold, 50);
});

check("VERIFIED：视野绝对时间 335 / 635 秒", () => {
  assert.equal(VISION_RULE.elfShareAtSeconds, 335);
  assert.equal(VISION_RULE.exposeAtSeconds, 635);
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
  assert.equal(upgradeNow(s, b.id), true);
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

check("原版地图：8 张竞技场全部开放格连通，双方出生点可达", () => {
  for (const id of MAP_ORDER) {
    setActiveMap(id);
    const def = MAP_DEFINITIONS[id];
    const grid = buildBlocked();
    assert.equal(grid.length, def.grid[0] * def.grid[1]);
    assert.equal(GRID_W, def.grid[0]);
    assert.equal(GRID_H, def.grid[1]);
    let total = 0;
    for (const cell of grid) if (cell === 0) total += 1;
    const seen = new Set([SPAWNS.troll.gy * GRID_W + SPAWNS.troll.gx]);
    const q = [SPAWNS.troll.gy * GRID_W + SPAWNS.troll.gx];
    while (q.length) {
      const cur = q.shift()!;
      const x = cur % GRID_W;
      const y = Math.floor(cur / GRID_W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const next = ny * GRID_W + nx;
        if (seen.has(next) || grid[next] !== 0) continue;
        seen.add(next);
        q.push(next);
      }
    }
    assert.equal(seen.size, total, `地图 ${id} ${def.name} 存在不连通区域`);
    assert.ok(seen.has(SPAWNS.elf.gy * GRID_W + SPAWNS.elf.gx), `地图 ${id} 精灵出生点不可达`);
  }
  setActiveMap(DEFAULT_MAP_ID);
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
  s.buildings = []; // 移除商店，避免挡住近战视线
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
  p.gold = 2000;
  p.wood = 300;
  assert.equal(tryBuild(s, "market", 55, 55), true);
  upgradeNow(s, s.buildings.find((b) => b.kind === "market" && b.faction === "elf")!.id);
  assert.equal(tryBuild(s, "reveal", 40, 40), true, canBuild(s, "reveal", 40, 40).reason);
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
  assert.equal(tryBuild(s, "market", 40, 40), true);
  const market = s.buildings.find((b) => b.kind === "market")!;
  market.buildTimer = 0;
  const inPrice = s.woodPriceIn;
  const outPrice = s.woodPriceOut;
  assert.equal(tradeWood(s, true), true);
  assert.equal(p.wood, MARKET_RULE.tradeAmount);
  assert.equal(p.gold, 1000 - 64 - inPrice);
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
  tryBuild(s, "wall", 45, 45);
  const wall = s.buildings[0];
  for (let i = 0; i < 3; i += 1) upgradeNow(s, wall.id); // 提供墙 L4 前置
  tryBuild(s, "tent", 60, 60);
  const tent = s.buildings.find((b) => b.kind === "tent")!;
  for (let i = 0; i < 3; i += 1) upgradeNow(s, tent.id);
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
  const item = EQUIPMENT_RULE.items.find((i) => i.key === "I02A")!;
  troll.x = (GRID_W - 2) * TILE;
  troll.y = (GRID_H - 2) * TILE;
  assert.equal(canBuyEquipment(s, item.key), false);
  const spawn = { x: (SPAWNS.troll.gx + 0.5) * TILE, y: (SPAWNS.troll.gy + 0.5) * TILE };
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

check("巨魔之眼：标记建筑后禁止拆除，反隐塔不会误标记", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 1000;
  tryBuild(s, "wall", 50, 50);
  const wall = s.buildings.find((b) => b.kind === "wall")!;
  wall.buildTimer = 0;
  wall.hp = wall.maxHp;
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  troll.x = wall.x + 30;
  troll.y = wall.y;
  troll.cooldowns.farSight = 0;
  troll.cooldowns.windwalk = 30;
  s.aiTimer = 0;
  run(s, 0.1);
  assert.ok(wall.eyeMarked > 0);
  troll.x = wall.x + 1000;
  assert.equal(canDemolish(s, wall.id).ok, false);
  assert.ok(wall.eyeMarked > 0);
});

check("前置链：作坊 Lv2 需基础墙（不是商店），显影塔需城镇 Lv2", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 5000;
  p.wood = 500;
  tryBuild(s, "tent", 60, 60);
  const tent = s.buildings.find((b) => b.kind === "tent")!;
  assert.equal(upgradeNow(s, tent.id), false);
  tryBuild(s, "wall", 45, 45);
  s.buildings.find((b) => b.kind === "wall")!.buildTimer = 0;
  assert.equal(upgradeNow(s, tent.id), true);
  assert.equal(canBuild(s, "reveal", 40, 40).ok, false); // 缺城镇 Lv2
  tryBuild(s, "market", 55, 55);
  upgradeNow(s, s.buildings.find((b) => b.kind === "market")!.id);
  assert.equal(canBuild(s, "reveal", 40, 40).ok, true);
});

check("阵营选择：玩家可选巨魔，AI 控制精灵", () => {
  const s = createGame({ playerFaction: "troll", testMode: true });
  const player = getPlayer(s)!;
  assert.equal(player.faction, "troll");
  assert.equal(s.heroes.find((h) => h.faction === "elf" && !h.isPlayer)?.alive, true);
  assert.ok(s.buildings.some((b) => b.kind === "trollHouse"));
});

check("巨魔玩法：力量达 16 万即获胜", () => {
  const s = createGame({ playerFaction: "troll", testMode: true });
  s.trollStrength = SCENARIO_RULE.troll.strengthWin;
  run(s, 0.1);
  assert.equal(s.result, "win");
  const e = createGame({ testMode: true });
  e.trollStrength = SCENARIO_RULE.troll.strengthWin;
  run(e, 0.1);
  assert.equal(e.result, "lose");
});

check("巨魔玩法：力量之书按规则文件增加力量", () => {
  const s = createGame({ playerFaction: "troll", testMode: true });
  const troll = getPlayer(s)!;
  const book = SCENARIO_RULE.troll.strengthBooks[0];
  troll.gold = book.gold;
  assert.equal(buyStrengthBook(s, book.key), true);
  assert.equal(s.trollStrength, book.strength);
  assert.equal(troll.gold, 0);
});

check("精灵玩法：66 座塔召唤大法师", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  for (let i = 0; i < SCENARIO_RULE.elf.ultimateTowerCount; i += 1) {
    const gx = 5 + (i % 20) * 8;
    const gy = 5 + Math.floor(i / 20) * 8;
    s.buildings.push({
      id: s.nextId++, kind: "tower", faction: "elf",
      x: gx * TILE, y: gy * TILE, gx0: gx, gy0: gy, size: 2,
      level: 8, hp: 250000, maxHp: 250000, alive: true, buildTimer: 0,
      demolishTimer: 0, eyeMarked: 0, flash: 0, cd: 0,
    });
  }
  assert.equal(summonArchmage(s), true);
  assert.equal(s.heroes.filter((h) => h.isAlly).length, 1);
  assert.equal(s.endLock, "elf");
  assert.equal(summonArchmage(s), false);
});

check("终极塔：普通箭塔 Lv7 不算 h096，66 座才触发", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  for (let i = 0; i < SCENARIO_RULE.elf.ultimateTowerCount; i += 1) {
    s.buildings.push({
      id: s.nextId++, kind: "tower", faction: "elf",
      x: (5 + (i % 20) * 8) * TILE, y: (5 + Math.floor(i / 20) * 8) * TILE,
      gx0: 5 + (i % 20) * 8, gy0: 5 + Math.floor(i / 20) * 8, size: 2,
      level: 7, hp: 200, maxHp: 200, alive: true, buildTimer: 0,
      demolishTimer: 0, eyeMarked: 0, noHitTimer: 0, flash: 0, cd: 0,
    });
  }
  assert.equal(canSummonMage(s), false);
});

check("OldEndLock：大法师封印巨魔力量胜利", () => {
  const s = createGame({ testMode: true, playerFaction: "troll" });
  openMap(s);
  s.trollStrength = SCENARIO_RULE.troll.strengthWin;
  s.endLock = "elf";
  run(s, 0.1);
  assert.equal(s.result, null);
  assert.equal(s.phase !== "over", true);
});

check("精灵玩法：迁移保留作坊等级并有冷却", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 100000;
  tryBuild(s, "wall", 45, 45);
  s.buildings.find((b) => b.kind === "wall")!.buildTimer = 0;
  tryBuild(s, "tent", 60, 60);
  const tent = s.buildings.find((b) => b.kind === "tent")!;
  upgradeNow(s, tent.id);
  const level = tent.level;
  assert.equal(relocateElf(s, 100, 70), true);
  const moved = s.buildings.find((b) => b.alive && b.kind === "tent")!;
  assert.equal(moved.level, level);
  assert.equal(relocateElf(s, 110, 70), false);
});

check("精灵玩法：游走发育降低巨魔打钱", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  toggleMobileDev(s);
  assert.equal(s.mobileDev, true);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const p = getPlayer(s)!;
  p.hp = 1000;
  p.maxHp = 1000;
  p.x = troll.x + 20;
  p.y = troll.y;
  troll.invuln = 0;
  troll.gold = 0;
  run(s, 1.6); // 巨魔间隔 1.5 秒，约命中 1 次（7 伤害）
  assert.ok(troll.gold < 12, `游走发育应减半打钱，实际 ${troll.gold}`);
});

check("人机巨魔会移动进攻（不会被商店围死）", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const start = { x: troll.x, y: troll.y };
  troll.invuln = 0;
  run(s, 4);
  assert.ok(Math.hypot(troll.x - start.x, troll.y - start.y) > 40, "巨魔应离开出生点进攻");
});

check("房屋收入有跳字", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 200;
  tryBuild(s, "tent", 60, 60);
  s.buildings.find((b) => b.kind === "tent")!.buildTimer = 0;
  run(s, 2.2);
  assert.ok(s.floats.some((f) => f.text.includes("金")), "收入应产生跳字");
});

check("巨魔是近战：隔墙不能攻击", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const p = getPlayer(s)!;
  troll.invuln = 0;
  troll.x = 30 * TILE + 8;
  troll.y = 30 * TILE + 8;
  p.x = 33 * TILE + 8;
  p.y = troll.y;
  p.hp = 1000;
  p.maxHp = 1000;
  for (let y = 10; y <= 70; y += 1) s.blocked[y * GRID_W + 31] = 1;
  const before = p.hp;
  run(s, 0.2);
  assert.equal(p.hp, before, "巨魔不能隔着墙打到精灵");
});

check("巨魔寻路：隔墙时绕行而非卡住", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const p = getPlayer(s)!;
  troll.invuln = 0;
  troll.x = 20 * TILE + 8;
  troll.y = 40 * TILE + 8;
  p.x = 26 * TILE + 8;
  p.y = troll.y;
  p.hp = 100000;
  p.maxHp = 100000;
  // 竖直墙，只有底部 y>44 有缺口
  for (let y = 20; y <= 44; y += 1) s.blocked[y * GRID_W + 23] = 1;
  run(s, 12);
  assert.ok(troll.x > 23 * TILE, `巨魔应绕过墙到另一侧，x=${troll.x}`);
});

check("巨魔优先拆墙：有墙挡路时先攻击墙", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const p = getPlayer(s)!;
  p.gold = 1000;
  troll.invuln = 0;
  troll.x = 20 * TILE + 8;
  troll.y = 40 * TILE + 8;
  p.x = 26 * TILE + 8;
  p.y = troll.y;
  p.hp = 100000;
  p.maxHp = 100000;
  // 紧挨巨魔放一面墙，先挡住视线
  tryBuild(s, "wall", 22, 40);
  const wall = s.buildings.find((b) => b.kind === "wall")!;
  wall.buildTimer = 0;
  const beforeHp = wall.hp;
  run(s, 4);
  assert.ok(wall.hp < beforeHp, `巨魔应先拆墙，墙 HP ${wall.hp}/${beforeHp}`);
});

check("维修：墙被攻击后随时间免费回血", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  p.gold = 1000;
  tryBuild(s, "wall", 40, 40);
  const wall = s.buildings.find((b) => b.kind === "wall")!;
  wall.buildTimer = 0;
  wall.hp = 20;
  wall.noHitTimer = 0;
  run(s, 4);
  assert.ok(wall.hp > 20, `墙应免费修复，hp=${wall.hp}`);
});

check("大法师：66 座塔后自动召唤，无需按钮", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  for (let i = 0; i < SCENARIO_RULE.elf.ultimateTowerCount; i += 1) {
    s.buildings.push({
      id: s.nextId++, kind: "tower", faction: "elf",
      x: (5 + (i % 20) * 8) * TILE, y: (5 + Math.floor(i / 20) * 8) * TILE,
      gx0: 5 + (i % 20) * 8, gy0: 5 + Math.floor(i / 20) * 8, size: 2,
      level: 8, hp: 250000, maxHp: 250000, alive: true, buildTimer: 0,
      demolishTimer: 0, eyeMarked: 0, noHitTimer: 0, flash: 0, cd: 0,
    });
  }
  assert.equal(s.mageSummoned, false);
  run(s, 0.1);
  assert.equal(s.mageSummoned, true);
  assert.equal(s.heroes.filter((h) => h.isAlly).length, 1);
});

check("视线：建筑同样阻挡近战，不能隔房攻击", () => {
  const s = createGame({ testMode: true });
  openMap(s);
  const troll = s.heroes.find((h) => h.faction === "troll")!;
  const p = getPlayer(s)!;
  p.gold = 1000;
  troll.invuln = 0;
  troll.x = 20 * TILE + 8;
  troll.y = 40 * TILE + 8;
  p.x = 24 * TILE + 8;
  p.y = troll.y;
  p.hp = 100000;
  p.maxHp = 100000;
  s.blocked.fill(0);
  tryBuild(s, "wall", 22, 39);
  const wall = s.buildings.find((b) => b.kind === "wall")!;
  wall.buildTimer = 0;
  const before = p.hp;
  run(s, 0.2);
  assert.equal(p.hp, before, "墙体应阻挡视线");
});

console.log(`\n${passed} checks passed`);
