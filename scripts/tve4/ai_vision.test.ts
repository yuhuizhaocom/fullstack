import assert from "node:assert/strict";
import test from "node:test";

import { createPerception } from "../../src/lib/tve4/ai/perception";
import { TILE } from "../../src/lib/tve4/config";
import { createGame, isTrollVisibleToPlayer, stepGame } from "../../src/lib/tve4/engine";
import { EQUIPMENT_RULE } from "../../src/lib/tve4/rules";
import type { Building, GameState } from "../../src/lib/tve4/types";

function testState(): GameState {
  return createGame({ mapId: 0, seed: 11, testMode: true, playerFaction: "elf" });
}

function placeTrollAtElf(state: GameState, distance: number) {
  const elf = state.heroes.find((h) => h.isPlayer)!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  troll.x = elf.x + distance;
  troll.y = elf.y;
  troll.invuln = 0;
  return { elf, troll };
}

function wallNear(state: GameState, x: number, y: number): Building {
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

test("AI does not see an enemy outside its own vision", () => {
  const state = testState();
  const elf = state.heroes.find((h) => h.isPlayer)!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  elf.x = 50;
  elf.y = 50;
  troll.x = 936;
  troll.y = 840;
  const trollPerception = createPerception(state, "troll");
  assert.deepEqual(trollPerception.visibleEnemies().filter((h) => h.faction === "elf"), []);
  assert.equal(trollPerception.canSee(elf.x, elf.y), false);
});

test("troll focus availability follows player vision", () => {
  const state = testState();
  const elf = state.heroes.find((h) => h.isPlayer)!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  elf.x = 50;
  elf.y = 50;
  troll.x = 936;
  troll.y = 840;
  assert.equal(isTrollVisibleToPlayer(state), false);
  troll.x = elf.x + 30;
  troll.y = elf.y;
  assert.equal(isTrollVisibleToPlayer(state), true);
});

test("vision follows current positions and remembers explored buildings", () => {
  const state = testState();
  const elf = state.heroes.find((h) => h.isPlayer)!;
  elf.x = 200;
  elf.y = 200;
  const { troll } = placeTrollAtElf(state, 40);
  const near = createPerception(state, "troll");
  assert.equal(near.canSee(elf.x, elf.y), true);
  assert.deepEqual(near.visibleEnemies().filter((h) => h.faction === "elf"), [elf]);

  const wall = wallNear(state, elf.x + 20, elf.y + 20);
  troll.x = elf.x + 40;
  troll.y = elf.y;
  const seesWall = createPerception(state, "troll");
  assert.ok(seesWall.visibleBuildings().some((b) => b.id === wall.id));

  troll.x = 1200;
  troll.y = 900;
  elf.x = 50;
  elf.y = 50;
  const far = createPerception(state, "troll");
  assert.equal(far.canSee(elf.x, elf.y), false);
  assert.equal(far.visibleBuildings().some((b) => b.id === wall.id), false);
  assert.equal(far.exploredResources().some((b) => b.id === wall.id), true);
});

test("windwalk hides a hero until revealed, and the expose rule overrides distance", () => {
  const state = testState();
  const { elf, troll } = placeTrollAtElf(state, 30);
  troll.buffs.windwalk = 5;
  troll.buffs.revealed = 0;
  const elfPerception = createPerception(state, "elf");
  assert.equal(elfPerception.visibleEnemies().includes(troll), false);
  troll.buffs.revealed = 1;
  assert.equal(createPerception(state, "elf").visibleEnemies().includes(troll), true);

  troll.buffs.revealed = 0;
  troll.x = 1200;
  troll.y = 900;
  elf.x = 50;
  elf.y = 50;
  const beforeExpose = createPerception(state, "troll");
  assert.equal(beforeExpose.visibleEnemies().includes(elf), false);
  state.elfExposed = true;
  assert.equal(createPerception(state, "troll").visibleEnemies().includes(elf), true);
});

test("vision sources use source hero sight and do not expose the full map", () => {
  const state = testState();
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  const ai = createPerception(state, "troll");
  const sight = 140;
  assert.equal(ai.canSee(troll.x + sight - 2, troll.y), true);
  assert.equal(ai.canSee(troll.x + sight + 20, troll.y), false);
});

test("player-side perception never overwrites AI memory", () => {
  const state = testState();
  state.aiMemory = { lastSeen: { x: 1, y: 2 }, buildingIds: [999] };
  createPerception(state, "elf");
  assert.deepEqual(state.aiMemory, { lastSeen: { x: 1, y: 2 }, buildingIds: [999] });
});

test("troll AI patrols the last-seen area instead of standing still outside vision", () => {
  const state = createGame({ mapId: 1, seed: 11, testMode: true, playerFaction: "elf" });
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  elf.x = 200;
  elf.y = 200;
  const start = { x: troll.x, y: troll.y };
  for (let i = 0; i < 30 * 12; i += 1) stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.ok(Math.hypot(troll.x - start.x, troll.y - start.y) > 40, "troll should patrol when no enemy is visible");
});

test("visible elf pursuit outranks troll shopping", () => {
  const state = testState();
  state.blocked.fill(0);
  state.session.pathing32.fill(0);
  state.buildings = state.buildings.filter((b) => b.kind !== "market" && b.kind !== "trollHouse");
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  const base = state.session.trollBase;
  troll.x = (base.gx + 0.5) * TILE;
  troll.y = (base.gy + 0.5) * TILE;
  elf.x = troll.x + 100;
  elf.y = troll.y;
  elf.hp = elf.maxHp = 1_000_000;
  elf.invuln = 1_000_000;
  troll.invuln = 0;
  troll.gold = 1_000_000;
  troll.wood = 0;
  troll.items = EQUIPMENT_RULE.items.filter((item) => !item.wood).map((item) => item.key);
  assert.ok(createPerception(state, "troll").visibleEnemies().includes(elf));
  const startX = troll.x;
  for (let i = 0; i < 30; i += 1) stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.ok(troll.x > startX + 20, `troll should chase the visible elf, x=${troll.x}`);
});

test("visible buildings do not overwrite the last seen elf position", () => {
  const state = testState();
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  elf.x = 50;
  elf.y = 50;
  wallNear(state, troll.x + 20, troll.y);
  const lastSeen = { x: elf.x, y: elf.y };
  state.aiMemory.lastSeen = lastSeen;
  stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.deepEqual(state.aiMemory.lastSeen, lastSeen);
});

test("vision-constrained AI navigates real WPM and finishes a stationary map-3 game", () => {
  const state = createGame({ mapId: 3, seed: 11, testMode: true, playerFaction: "elf" });
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  elf.x = 280;
  elf.y = 104;
  state.aiMemory.lastSeen = { x: elf.x, y: elf.y };
  for (let i = 0; i < 30 * 30 && !state.result; i += 1) stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(state.result, "lose");
  assert.equal(state.heroes.find((h) => h.faction === "elf")!.alive, false);
});