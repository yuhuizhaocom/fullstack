import assert from "node:assert/strict";
import test from "node:test";

import { BUILDINGS, HERO_STATS, TILE } from "../../src/lib/tve4/config";
import {
  canBuild,
  createGame,
  isPathingPositionFree,
  stateHash,
  stepGame,
  tryBuild,
} from "../../src/lib/tve4/engine";
import { loadMvpMap, runtimePathingSegmentClear } from "../../src/lib/tve4/map";
import { createRng, nextRandom } from "../../src/lib/tve4/sim/rng";
import type { Faction, GameState } from "../../src/lib/tve4/types";

const FIXED = 1 / 30;

function run(state: GameState, seconds: number, mx = 0, my = 0): void {
  for (let i = 0; i < Math.round(seconds / FIXED); i += 1) stepGame(state, FIXED, { mx, my });
}

function openMap(state: GameState): void {
  state.blocked.fill(0);
  state.session.pathing32.fill(0);
}

function spawnCenter(state: GameState, faction: Faction): { x: number; y: number } {
  const spawn = state.session.spawns[faction];
  assert.ok(spawn, `${state.mapId}: missing ${faction} spawn`);
  return { x: (spawn.gx + 0.5) * TILE, y: (spawn.gy + 0.5) * TILE };
}

function hasWpmPath(state: GameState, from: Faction, to: Faction, radius: number): boolean {
  const [worldWidth, worldHeight] = state.session.grid.world;
  const spacing = TILE / 4; // one source WPM cell at scale 8
  const width = Math.floor(worldWidth / spacing);
  const height = Math.floor(worldHeight / spacing);
  const a = spawnCenter(state, from);
  const b = spawnCenter(state, to);
  const start = Math.floor(a.y / spacing) * width + Math.floor(a.x / spacing);
  const goal = Math.floor(b.y / spacing) * width + Math.floor(b.x / spacing);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  visited[start] = 1;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  while (head < tail) {
    const current = queue[head++];
    if (current === goal) return true;
    const x = current % width;
    const y = Math.floor(current / width);
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (visited[next]) continue;
      if (!isPathingPositionFree(state, (nx + 0.5) * spacing, (ny + 0.5) * spacing, radius)) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }
  return false;
}

test("deterministic RNG produces repeatable sequences from the seed", () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const left = Array.from({ length: 8 }, () => nextRandom(a));
  const right = Array.from({ length: 8 }, () => nextRandom(b));
  const other = Array.from({ length: 8 }, () => nextRandom(c));
  assert.deepEqual(left, right);
  assert.notDeepEqual(left, other);
  for (const value of left) assert.ok(value >= 0 && value < 1);
});

test("same seed and input produce the same state hash", () => {
  const simulate = (seed: number) => {
    const state = createGame({ mapId: 0, seed, mode: "OLD", rule: "SINGLE", testMode: true });
    run(state, 30);
    return stateHash(state);
  };
  assert.equal(simulate(42), simulate(42));
  assert.notEqual(simulate(42), simulate(43));
});

test("economy and construction consume MVP rule costs on valid ground", () => {
  const state = createGame({ mapId: 0, seed: 7, testMode: true, playerFaction: "elf" });
  openMap(state);
  const hero = state.heroes.find((h) => h.isPlayer)!;
  const spawn = state.session.spawns.elf!;
  let spot: { gx: number; gy: number } | null = null;
  for (let r = 1; r <= 4 && !spot; r += 1) {
    for (let dy = -r; dy <= r && !spot; dy += 1) {
      for (let dx = -r; dx <= r && !spot; dx += 1) {
        if (canBuild(state, "wall", spawn.gx + dx, spawn.gy + dy, "elf").ok) {
          spot = { gx: spawn.gx + dx, gy: spawn.gy + dy };
        }
      }
    }
  }
  assert.ok(spot, "no valid wall position near elf spawn");
  const beforeGold = hero.gold;
  assert.equal(tryBuild(state, "wall", spot.gx, spot.gy, "elf"), true);
  assert.equal(hero.gold, beforeGold - BUILDINGS.wall.levels[0].cost);
  assert.ok(state.buildings.some((b) => b.kind === "wall" && b.faction === "elf"));
});

test("combat uses LOS, damage, and bounty on an isolated fixture", () => {
  const state = createGame({ mapId: 0, seed: 9, testMode: true, playerFaction: "elf" });
  openMap(state);
  const elf = state.heroes.find((h) => h.isPlayer)!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  const elfCenter = spawnCenter(state, "elf");
  elf.x = elfCenter.x;
  elf.y = elfCenter.y;
  troll.x = elf.x + elf.range - 2;
  troll.y = elf.y;
  troll.invuln = 0;
  troll.hp = 750;
  const goldBefore = elf.gold;
  stepGame(state, FIXED, { mx: 0, my: 0 });
  assert.ok(troll.hp < 750, "elf attack should damage adjacent troll");
  assert.ok(elf.gold > goldBefore, "damage should convert to gold");
});

test("continuous 32-unit WPM checks reject thin walls and blocked segments", () => {
  const state = createGame({ mapId: 0, seed: 10, testMode: true, playerFaction: "elf" });
  openMap(state);
  const map = loadMvpMap(state.mapId);
  const { grid, pathing } = state.session;
  const wallX = Math.floor(grid.width / 2);
  for (let gy = 0; gy < grid.height; gy += 1) {
    state.blocked[gy * grid.width + wallX] = 1;
    const sourceX = (grid.bounds[0] - pathing.origin[0]) / pathing.cellUnits + wallX * 4;
    const sourceY = (grid.bounds[1] - pathing.origin[1]) / pathing.cellUnits + gy * 4;
    for (let dy = 0; dy < 4; dy += 1) {
      for (let dx = 0; dx < 4; dx += 1) {
        state.session.pathing32[(sourceY + dy) * pathing.width + sourceX + dx] |= 0x02;
      }
    }
  }
  const left = (wallX * TILE) - 4;
  const right = ((wallX + 1) * TILE) + 4;
  const y = (Math.floor(grid.height / 2) + 0.5) * TILE;
  assert.equal(isPathingPositionFree(state, left, y, HERO_STATS.troll.radius), true);
  assert.equal(isPathingPositionFree(state, wallX * TILE + TILE / 2, y, HERO_STATS.troll.radius), false);
  assert.equal(runtimePathingSegmentClear(map, state.session.pathing32, left, y, right, y), false);
});

test("real WPM paths remain traversable for both hero radii, including troll radius 22", () => {
  for (const mapId of [0, 1, 2, 3, 5, 7]) {
    const state = createGame({ mapId, seed: 3, playerFaction: "elf" });
    assert.equal(hasWpmPath(state, "elf", "troll", HERO_STATS.elf.radius), true, `map ${mapId}: elf path`);
    assert.equal(hasWpmPath(state, "troll", "elf", HERO_STATS.troll.radius), true, `map ${mapId}: troll radius 22 path`);
  }
});

test("OLD + SINGLE terminal conditions cover both force outcomes and troll strength", () => {
  const state = createGame({ mapId: 0, seed: 4, testMode: true, playerFaction: "elf" });
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  elf.alive = false;
  elf.lives = 0;
  stepGame(state, FIXED, { mx: 0, my: 0 });
  assert.equal(state.phase, "over");
  assert.equal(state.result, "lose");

  const win = createGame({ mapId: 0, seed: 4, testMode: true, playerFaction: "elf" });
  const winTroll = win.heroes.find((h) => h.faction === "troll")!;
  winTroll.alive = false;
  winTroll.lives = 0;
  stepGame(win, FIXED, { mx: 0, my: 0 });
  assert.equal(win.phase, "over");
  assert.equal(win.result, "win");

  const strength = createGame({ mapId: 0, seed: 4, testMode: true, playerFaction: "elf" });
  strength.trollStrength = 160000;
  stepGame(strength, FIXED, { mx: 0, my: 0 });
  assert.equal(strength.endLock, "troll");
  assert.equal(strength.result, "lose");
});