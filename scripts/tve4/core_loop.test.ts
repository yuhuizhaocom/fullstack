import assert from "node:assert/strict";
import test from "node:test";

import { BUILDINGS, HERO_STATS, TILE } from "../../src/lib/tve4/config";
import {
  canBuild,
  canUpgradeKind,
  createGame,
  isPathingPositionFree,
  needsWallForTentUpgrade,
  repairWall,
  stateHash,
  stepGame,
  tryBuild,
  tryUpgrade,
} from "../../src/lib/tve4/engine";
import { loadMvpMap, runtimePathingSegmentClear } from "../../src/lib/tve4/map";
import { createRng, nextRandom } from "../../src/lib/tve4/sim/rng";
import { REPAIR_RULE } from "../../src/lib/tve4/rules";
import type { Building, Faction, GameState } from "../../src/lib/tve4/types";

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

function makeUpgradingWall(state: GameState) {
  const spawn = state.session.spawns.elf!;
  const hero = state.heroes.find((h) => h.isPlayer)!;
  hero.gold = 1000;
  assert.equal(tryBuild(state, "wall", spawn.gx + 4, spawn.gy, "elf"), true);
  const wall = state.buildings.at(-1)!;
  wall.buildTimer = 0;
  assert.equal(tryUpgrade(state, wall.id), true);
  assert.ok(wall.buildTimer > 0);
  return wall;
}

function makeDamagedWall(state: GameState) {
  const spawn = state.session.spawns.elf!;
  const hero = state.heroes.find((h) => h.isPlayer)!;
  hero.gold = 1000;
  assert.equal(tryBuild(state, "wall", spawn.gx + 4, spawn.gy, "elf"), true);
  const wall = state.buildings.at(-1)!;
  wall.buildTimer = 0;
  wall.hp = wall.maxHp / 2;
  return wall;
}

function addUpgradeFixture(state: GameState, kind: Building["kind"], level: number, offset: number): Building {
  const spawn = state.session.spawns.elf!;
  const def = BUILDINGS[kind];
  const building: Building = {
    id: state.nextId++, kind, faction: "elf",
    x: (spawn.gx + offset + def.size / 2) * TILE,
    y: (spawn.gy + def.size / 2) * TILE,
    gx0: spawn.gx + offset, gy0: spawn.gy,
    size: def.size, level, hp: def.levels[level - 1].hp, maxHp: def.levels[level - 1].hp,
    alive: true, buildTimer: 0, demolishTimer: 0, eyeMarked: 0, repairing: false,
    flash: 0, cd: 0,
  };
  state.buildings.push(building);
  return building;
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

test("upgrade checks expose the current next-level building prerequisites", () => {
  const state = createGame({ mapId: 0, seed: 8, playerFaction: "elf" });
  const hero = state.heroes.find((h) => h.isPlayer)!;
  const wall = addUpgradeFixture(state, "wall", 1, 2);
  const tent = addUpgradeFixture(state, "tent", 2, 5);
  hero.gold = 0;

  let check = canUpgradeKind(state, "tent");
  assert.equal(check.ok, false);
  assert.deepEqual(check.requirements, [{ kind: "wall", level: 4, label: "石墙", met: false }]);
  assert.equal(needsWallForTentUpgrade(state), true);

  hero.gold = 1_000_000;
  wall.level = 4;
  check = canUpgradeKind(state, "tent");
  assert.equal(check.ok, true);
  assert.deepEqual(check.requirements, [{ kind: "wall", level: 4, label: "石墙", met: true }]);
  assert.equal(needsWallForTentUpgrade(state), false);

  tent.level = 3;
  addUpgradeFixture(state, "market", 1, 8);
  check = canUpgradeKind(state, "tent");
  assert.equal(check.ok, true);
  assert.deepEqual(check.requirements, [{ kind: "market", level: 1, label: "城镇/市场", met: true }]);
});

test("repair starts a continuous source-rate process instead of instant healing", () => {
  const state = createGame({ mapId: 0, seed: 31, playerFaction: "elf" });
  openMap(state);
  const wall = makeDamagedWall(state);
  wall.level = 6;
  const hero = state.heroes.find((h) => h.isPlayer)!;
  hero.x = wall.x + TILE;
  hero.y = wall.y;
  const before = wall.hp;
  const ratio = REPAIR_RULE.timeRatios[0];
  const rate = wall.maxHp / (BUILDINGS.wall.buildTime * ratio);

  assert.equal(repairWall(state, "wall"), true);
  assert.equal(wall.hp, before, "issuing repair must not instantly restore HP");
  run(state, 1);
  assert.ok(Math.abs(wall.hp - (before + rate)) < 1e-6, `repair rate should be ${rate} HP/s`);
  run(state, BUILDINGS.wall.buildTime * ratio);
  assert.equal(wall.hp, wall.maxHp);
});

test("damaged buildings do not repair without a repair order", () => {
  const state = createGame({ mapId: 0, seed: 32, playerFaction: "elf" });
  openMap(state);
  const wall = makeDamagedWall(state);
  const before = wall.hp;

  run(state, 4);

  assert.equal(wall.hp, before, "original repair requires a worker order");
});

test("one elf cannot repair two buildings at the same time", () => {
  const state = createGame({ mapId: 0, seed: 33, playerFaction: "elf" });
  const hero = state.heroes.find((h) => h.isPlayer)!;
  const first = addUpgradeFixture(state, "wall", 1, 2);
  const second = addUpgradeFixture(state, "wall", 1, 5);
  first.hp = first.maxHp * 0.2;
  second.hp = second.maxHp * 0.5;
  hero.x = first.x + TILE;
  hero.y = first.y;

  assert.equal(repairWall(state, "wall"), true);
  assert.equal(first.repairing, true);
  assert.equal(hero.repairTargetId, first.id);
  assert.equal(repairWall(state, "wall"), false);
  assert.equal(second.repairing, false);
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

test("player-built walls block their owner's body and line of sight", () => {
  const state = createGame({ mapId: 0, seed: 12, testMode: true, playerFaction: "elf" });
  openMap(state);
  const elf = state.heroes.find((h) => h.isPlayer)!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  const spawn = state.session.spawns.elf!;
  elf.gold = 1000;
  const wallGx = spawn.gx + 4;
  for (let dy = -2; dy <= 2; dy += 1) {
    assert.equal(tryBuild(state, "wall", wallGx, spawn.gy + dy, "elf"), true);
    state.buildings.at(-1)!.buildTimer = 0;
  }
  elf.x = (wallGx - 2) * TILE;
  elf.y = (spawn.gy + 0.5) * TILE;
  troll.x = elf.x + 500;
  troll.y = elf.y + 500;
  run(state, 2, 1, 0);
  assert.ok(elf.x < wallGx * TILE, "owner must not walk through a player-built wall");

  troll.x = (wallGx + 2) * TILE;
  troll.y = elf.y;
  troll.hp = 750;
  troll.invuln = 0;
  elf.cd = 0;
  const before = troll.hp;
  stepGame(state, FIXED, { mx: 0, my: 0 });
  assert.equal(troll.hp, before, "owner wall must block line of sight");
});

test("upgrading walls still block the owner's movement", () => {
  const state = createGame({ mapId: 0, seed: 13, testMode: true, playerFaction: "elf" });
  openMap(state);
  const elf = state.heroes.find((h) => h.isPlayer)!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  const wall = makeUpgradingWall(state);
  elf.x = (wall.gx0 - 2) * TILE;
  elf.y = wall.y;
  troll.x = elf.x;
  troll.y = elf.y + 800;

  run(state, 0.4, 1, 0);

  assert.ok(wall.buildTimer > 0, "movement check must happen during the upgrade");
  assert.ok(elf.x < wall.gx0 * TILE, "owner must not cross an upgrading wall");
});

test("upgrading walls still block line of sight", () => {
  const state = createGame({ mapId: 0, seed: 14, testMode: true, playerFaction: "elf" });
  openMap(state);
  const elf = state.heroes.find((h) => h.isPlayer)!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  const wall = makeUpgradingWall(state);
  elf.x = wall.x - 3 * TILE / 2;
  elf.y = wall.y;
  elf.cd = 0;
  troll.x = wall.x + 3 * TILE / 2;
  troll.y = wall.y;
  troll.hp = 750;
  troll.invuln = 0;

  stepGame(state, FIXED, { mx: 0, my: 0 });

  assert.ok(wall.buildTimer > 0, "attack check must happen during the upgrade");
  assert.equal(troll.hp, 750, "an upgrading wall must block attacks");
});

test("AI pathfinding routes around an upgrading wall", () => {
  const state = createGame({ mapId: 0, seed: 15, testMode: true, playerFaction: "elf" });
  openMap(state);
  const elf = state.heroes.find((h) => h.faction === "elf")!;
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  const wall = makeUpgradingWall(state);
  elf.x = (wall.gx0 + 3) * TILE;
  elf.y = wall.y;
  troll.x = (wall.gx0 - 3) * TILE;
  troll.y = wall.y;
  state.aiMemory.buildingIds = [wall.id];
  state.aiTimer = 10;
  state.pathTimer = 0;

  stepGame(state, FIXED, { mx: 0, my: 0 });

  assert.ok(wall.buildTimer > 0, "path check must happen during the upgrade");
  assert.ok(state.aiPath.length > 0, "AI should find a route around the wall");
  assert.equal(state.aiPath.some((point) => {
    const gx = Math.floor(point.x / TILE);
    const gy = Math.floor(point.y / TILE);
    return gx >= wall.gx0 - 1 && gx < wall.gx0 + wall.size + 1
      && gy >= wall.gy0 - 1 && gy < wall.gy0 + wall.size + 1;
  }), false, "AI path must not enter the upgrading wall's blocked cells");
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