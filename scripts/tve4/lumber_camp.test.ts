import assert from "node:assert/strict";
import test from "node:test";

import { BUILDINGS } from "../../src/lib/tve4/config";
import { canBuild, createGame, stepGame, tryBuild } from "../../src/lib/tve4/engine";

function openMap(state: ReturnType<typeof createGame>): void {
  state.blocked.fill(0);
  state.session.pathing32.fill(0);
}

test("elf lumber camp matches wisp price and harvest yield", () => {
  const state = createGame({ mapId: 0, seed: 5, testMode: true, playerFaction: "elf" });
  openMap(state);
  const hero = state.heroes.find((h) => h.isPlayer)!;
  hero.gold = 1000;
  hero.hp = 100_000;
  hero.maxHp = 100_000;
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
  assert.ok(BUILDINGS.lumberCamp, "lumber camp definition should exist");
  assert.equal(BUILDINGS.lumberCamp.levels[0].cost, 60);
  assert.equal(BUILDINGS.lumberCamp.levels[0].hp, 120);
  assert.equal(BUILDINGS.lumberCamp.levels[0].woodIncome, 0.625);
  assert.equal(tryBuild(state, "lumberCamp", spot.gx, spot.gy, "elf"), true);
  const camp = state.buildings.find((b) => b.kind === "lumberCamp")!;
  camp.buildTimer = 0;
  const before = hero.wood;
  for (let i = 0; i < 30 * 9; i += 1) stepGame(state, 1 / 30, { mx: 0, my: 0 });
  assert.equal(hero.wood, before + 5);
});
