import assert from "node:assert/strict";
import test from "node:test";

import {
  canBuild,
  canRepairBuilding,
  createGame,
  repairBuilding,
  stepGame,
  tryBuild,
} from "../../src/lib/tve4/engine";
import { createPlayerActionController } from "../../src/lib/tve4/player-actions";
import type { GameState } from "../../src/lib/tve4/types";

function openMap(state: GameState): void {
  state.blocked.fill(0);
  state.session.pathing32.fill(0);
}

function controller(state: GameState) {
  return createPlayerActionController({
    canBuild,
    build: tryBuild,
    canRepair: canRepairBuilding,
    repair: repairBuilding,
  });
}

function advance(state: GameState, actions: ReturnType<typeof controller>, seconds: number): void {
  for (let i = 0; i < 30 * seconds && actions.snapshot().phase !== "idle"; i += 1) {
    const direction = actions.direction(state);
    stepGame(state, 1 / 30, direction);
    actions.afterStep(state);
  }
}

test("far build queues without charging and executes once after approach", () => {
  const state = createGame({ mapId: 0, seed: 5, playerFaction: "elf" });
  openMap(state);
  const hero = state.heroes.find((h) => h.isPlayer)!;
  hero.gold = 1000;
  hero.hp = hero.maxHp = 100_000;
  const spawn = state.session.spawns.elf!;
  const spot = { gx: spawn.gx + 12, gy: spawn.gy };
  assert.equal(canBuild(state, "wall", spot.gx, spot.gy, "elf").ok, true);
  const actions = controller(state);
  const gold = hero.gold;

  assert.equal(actions.enqueue(state, { type: "build", kind: "wall", ...spot, source: "manual" }).phase, "moving");
  assert.equal(hero.gold, gold);
  assert.equal(state.buildings.some((b) => b.kind === "wall"), false);
  advance(state, actions, 20);
  assert.equal(actions.snapshot().phase, "idle");
  assert.equal(state.buildings.filter((b) => b.kind === "wall").length, 1);
  assert.equal(hero.gold, gold - 4);
});

test("near build executes immediately and invalid build does not move", () => {
  const state = createGame({ mapId: 0, seed: 6, playerFaction: "elf" });
  openMap(state);
  const hero = state.heroes.find((h) => h.isPlayer)!;
  hero.gold = 1000;
  const spawn = state.session.spawns.elf!;
  const actions = controller(state);
  const spot = { gx: spawn.gx + 3, gy: spawn.gy };
  assert.equal(actions.enqueue(state, { type: "build", kind: "wall", ...spot, source: "manual" }).phase, "executing");
  actions.afterStep(state);
  assert.equal(state.buildings.filter((b) => b.kind === "wall").length, 1);

  const before = { x: hero.x, y: hero.y };
  const blocked = actions.enqueue(state, { type: "build", kind: "wall", gx: -1, gy: -1, source: "manual" });
  assert.equal(blocked.phase, "blocked");
  assert.deepEqual({ x: hero.x, y: hero.y }, before);
});

test("far repair approaches the locked target before starting", () => {
  const state = createGame({ mapId: 0, seed: 7, playerFaction: "elf" });
  openMap(state);
  const hero = state.heroes.find((h) => h.isPlayer)!;
  hero.gold = 1000;
  hero.hp = hero.maxHp = 100_000;
  const spawn = state.session.spawns.elf!;
  assert.equal(tryBuild(state, "wall", spawn.gx + 12, spawn.gy, "elf"), true);
  const wall = state.buildings.find((b) => b.kind === "wall")!;
  wall.buildTimer = 0;
  wall.hp = wall.maxHp / 2;
  const beforeHp = wall.hp;
  const actions = controller(state);

  assert.equal(actions.enqueue(state, { type: "repair", kind: "wall", buildingId: wall.id, source: "manual" }).phase, "moving");
  assert.equal(wall.repairing, false);
  assert.equal(wall.hp, beforeHp);
  advance(state, actions, 20);
  assert.equal(actions.snapshot().phase, "idle");
  assert.equal(wall.repairing, true);
  assert.equal(hero.repairTargetId, wall.id);
  stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.ok(wall.hp > beforeHp);
});

test("manual cancel prevents a queued build from executing late", () => {
  const state = createGame({ mapId: 0, seed: 8, playerFaction: "elf" });
  openMap(state);
  const hero = state.heroes.find((h) => h.isPlayer)!;
  hero.gold = 1000;
  const spawn = state.session.spawns.elf!;
  const actions = controller(state);
  actions.enqueue(state, { type: "build", kind: "wall", gx: spawn.gx + 12, gy: spawn.gy, source: "manual" });
  actions.cancel();
  advance(state, actions, 20);
  assert.equal(state.buildings.some((b) => b.kind === "wall"), false);
  assert.equal(hero.gold, 1000);
});
