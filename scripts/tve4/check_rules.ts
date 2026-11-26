// tve4 规则自检：npx tsx scripts/tve4/check_rules.ts
import assert from "node:assert/strict";

import { GAME_LIMIT, GRID_H, GRID_W, PREP_SECONDS, TILE } from "../../src/lib/tve4/config";
import {
  canBuild,
  castSkill,
  createGame,
  getPlayer,
  setBlocked,
  stepGame,
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
  assert.equal(getPlayer(s)?.gold, 600);
  assert.equal(getPlayer(s)?.lives, 3);
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
  assert.equal(p.gold, 580);
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
  assert.equal(p.gold, 800);
  assert.equal(tryUpgrade(s, b.id), true);
  assert.equal(b.level, 3);
  assert.equal(tryUpgrade(s, b.id), false);
});

check("经济：金矿每秒产出金币", () => {
  const s = createGame();
  openMap(s);
  const p = getPlayer(s)!;
  tryBuild(s, "mine", 40, 40);
  s.buildings[0].buildTimer = 0;
  p.gold = 0;
  run(s, 6);
  assert.ok(p.gold >= 30 && p.gold <= 37, `期望 30+ 金，实际 ${p.gold}`);
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

check("胜负：到达时间上限判定胜利", () => {
  const s = createGame();
  openMap(s);
  s.time = GAME_LIMIT - 0.1;
  run(s, 0.2);
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

check("数据边界：碰撞格尺寸正确", () => {
  const s = createGame();
  assert.equal(s.blocked.length, GRID_W * GRID_H);
  setBlocked(s, new Uint8Array(GRID_W * GRID_H).fill(1));
  assert.equal(s.blocked[0], 1);
});

console.log(`\n${passed} checks passed`);
