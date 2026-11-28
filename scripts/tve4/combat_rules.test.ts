import assert from "node:assert/strict";
import test from "node:test";

import { BUILDINGS, HERO_STATS, TILE } from "../../src/lib/tve4/config";
import {
  castSkill,
  castWallInvuln,
  createGame,
  repairWall,
  stepGame,
  tryBuild,
} from "../../src/lib/tve4/engine";
import type { Building, Faction, GameState } from "../../src/lib/tve4/types";

function fresh(faction: Faction = "elf"): GameState {
  const state = createGame({ mapId: 0, seed: 41, testMode: true, playerFaction: faction });
  state.blocked.fill(0);
  state.session.pathing32.fill(0);
  for (const hero of state.heroes) {
    hero.hp = hero.maxHp = 100_000;
    hero.invuln = 0;
    hero.cd = 0;
  }
  return state;
}

function wallAt(state: GameState, x: number, y: number): Building {
  const gx0 = Math.floor(x / TILE);
  const gy0 = Math.floor(y / TILE);
  const wall: Building = {
    id: state.nextId++, kind: "wall", faction: "elf",
    x: (gx0 + 0.5) * TILE, y: (gy0 + 0.5) * TILE,
    gx0, gy0, size: 1, level: 1, hp: 100, maxHp: 100,
    alive: true, buildTimer: 0, demolishTimer: 0, eyeMarked: 0,
    repairing: false, flash: 0, cd: 0,
  };
  state.buildings.push(wall);
  return wall;
}

test("troll uses the original 80 source-unit attack range", () => {
  const state = fresh();
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  assert.equal(HERO_STATS.troll.range, 10);
  troll.x = elf.x + 11;
  troll.y = elf.y;
  const before = elf.hp;
  stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(elf.hp, before);
  troll.x = elf.x + 10;
  stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.ok(elf.hp < before);
});

test("entangle targets a visible AoE point without requiring hero-to-troll LOS", () => {
  const state = fresh();
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  elf.x = 130;
  elf.y = 100;
  troll.x = 180;
  troll.y = 100;
  wallAt(state, 155, 100);
  const mana = elf.mana;

  assert.equal(castSkill(state, "entangle", { x: troll.x, y: troll.y }), true);
  assert.equal(elf.mana, mana - 40);
  assert.equal(elf.cooldowns.entangle, 45);
  assert.equal(troll.buffs.root, 3);
});

test("root prevents the troll from making normal attacks", () => {
  const state = fresh();
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  troll.x = elf.x + 8;
  troll.y = elf.y;
  troll.buffs.root = 3;
  const before = elf.hp;
  for (let i = 0; i < 30; i += 1) stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(elf.hp, before);
});

test("wall invulnerability applies to all current elf walls for ten seconds", () => {
  const state = fresh();
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  elf.mana = 100;
  const first = wallAt(state, elf.x + 40, elf.y);
  const second = wallAt(state, elf.x + 80, elf.y);

  assert.equal(castWallInvuln(state), true);
  assert.equal(first.invuln, 10);
  assert.equal(second.invuln, 10);
  assert.equal(elf.mana, 90);
  assert.equal(elf.cooldowns.wallInvuln, 180);
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  troll.x = first.x + TILE;
  troll.y = first.y;
  troll.invuln = 0;
  const wallHp = first.hp;
  stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(first.hp, wallHp);
  for (let i = 0; i < 30 * 10 + 1; i += 1) stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(first.invuln, 0);
  assert.equal(second.invuln, 0);
});

test("wall repair uses the original fifty-second repair time", () => {
  const state = fresh();
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  const wall = wallAt(state, elf.x + 40, elf.y);
  wall.hp = wall.maxHp / 2;
  elf.x = wall.x + TILE;
  elf.y = wall.y;
  assert.equal(BUILDINGS.wall.repairTime, 50);
  assert.equal(repairWall(state, "wall"), true);
  const before = wall.hp;
  stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.ok(Math.abs(wall.hp - (before + wall.maxHp / 50 / 30)) < 1e-6);
});

test("towers do not fire at windwalk or blocked targets", () => {
  const state = fresh();
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  elf.x = 2000;
  elf.y = 2000;
  assert.equal(tryBuild(state, "tower", 30, 30, "elf"), true);
  const tower = state.buildings.find((b) => b.kind === "tower")!;
  tower.buildTimer = 0;
  troll.x = tower.x + 50;
  troll.y = tower.y;
  troll.buffs.windwalk = 10;
  stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(state.projectiles.length, 0);
  troll.buffs.revealed = 1;
  stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.ok(state.projectiles.length > 0);
  state.projectiles = [];
  wallAt(state, tower.x + 25, tower.y);
  stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(state.projectiles.length, 0);
});

test("tower projectiles miss a target that becomes hidden before impact", () => {
  const state = fresh();
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  elf.x = 2000;
  elf.y = 2000;
  assert.equal(tryBuild(state, "tower", 30, 30, "elf"), true);
  const tower = state.buildings.find((b) => b.kind === "tower")!;
  tower.buildTimer = 0;
  troll.x = tower.x + 50;
  troll.y = tower.y;
  stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.ok(state.projectiles.length > 0);
  troll.buffs.windwalk = 10;
  const before = troll.hp;
  for (let i = 0; i < 10; i += 1) stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(troll.hp, before);
});
