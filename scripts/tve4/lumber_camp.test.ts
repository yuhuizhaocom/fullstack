import assert from "node:assert/strict";
import test from "node:test";

import { BUILDINGS } from "../../src/lib/tve4/config";
import { canBuild, createGame, stepGame, tryBuild, tryUpgrade } from "../../src/lib/tve4/engine";

function openMap(state: ReturnType<typeof createGame>): void {
  state.blocked.fill(0);
  state.session.pathing32.fill(0);
}

test("elf lumber camp uses three cumulative price tiers and upgrade deltas", () => {
  const state = createGame({ mapId: 0, seed: 5, testMode: true, playerFaction: "elf" });
  openMap(state);
  const hero = state.heroes.find((h) => h.isPlayer)!;
  hero.gold = 100_000;
  hero.hp = hero.maxHp = 100_000;
  hero.invuln = 1_000_000;
  const spawn = state.session.spawns.elf!;
  let spot: { gx: number; gy: number } | null = null;
  for (let r = 1; r <= 6 && !spot; r += 1) {
    for (let dy = -r; dy <= r && !spot; dy += 1) {
      for (let dx = -r; dx <= r && !spot; dx += 1) {
        if (canBuild(state, "lumberCamp", spawn.gx + dx, spawn.gy + dy, "elf").ok) {
          spot = { gx: spawn.gx + dx, gy: spawn.gy + dy };
        }
      }
    }
  }
  assert.ok(spot, "a valid lumber camp position should exist near the elf spawn");
  assert.deepEqual(BUILDINGS.lumberCamp.levels, [
    { cost: 2000, hp: 120, woodIncome: 1 },
    { cost: 3600, hp: 240, woodIncome: 2 },
    { cost: 18000, hp: 480, woodIncome: 10 },
  ]);

  const startingGold = hero.gold;
  assert.equal(tryBuild(state, "lumberCamp", spot.gx, spot.gy, "elf"), true);
  assert.equal(hero.gold, startingGold - 2000);
  const camp = state.buildings.find((b) => b.kind === "lumberCamp")!;
  camp.buildTimer = 0;

  let wood = hero.wood;
  for (let i = 0; i < 33; i += 1) stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(hero.wood, wood + 1);

  let gold = hero.gold;
  assert.equal(tryUpgrade(state, camp.id), true);
  assert.equal(camp.level, 2);
  assert.equal(hero.gold, gold - 1600);
  wood = hero.wood;
  for (let i = 0; i < 33; i += 1) stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(hero.wood, wood + 2);

  gold = hero.gold;
  assert.equal(tryUpgrade(state, camp.id), true);
  assert.equal(camp.level, 3);
  assert.equal(hero.gold, gold - 14400);
  wood = hero.wood;
  for (let i = 0; i < 33; i += 1) stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(hero.wood, wood + 10);
});
