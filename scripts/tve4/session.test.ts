import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HERO_STATS } from "../../src/lib/tve4/config";
import { createGame, isPathingPositionFree, setBlocked } from "../../src/lib/tve4/engine";
import * as mapRuntime from "../../src/lib/tve4/map";
import * as generated from "../../src/lib/tve4/maps.generated";

interface RuntimeMap {
  id: number;
  name: string;
  boundRect: { minX: number; minY: number; maxX: number; maxY: number };
  extraRects: Array<{ minX: number; minY: number; maxX: number; maxY: number }>;
  bounds: [number, number, number, number];
  sourceRect: [number, number, number, number];
  grid: [number, number];
  angel: { gx: number; gy: number } | null;
  pathing: {
    width: number;
    height: number;
    file: string;
    sha256: string;
    origin: [number, number];
  };
}

const runtime = mapRuntime as typeof mapRuntime & {
  loadMvpMap(mapId: number): RuntimeMap;
  buildPathing32(map: RuntimeMap): Uint8Array;
  buildBuildGrid128(map: RuntimeMap): Uint8Array;
};
const catalog = generated as typeof generated & { MAP_CATALOG_VERSION: string };
const WPM_ORIGIN: [number, number] = [-29_696, -17_920];
const WPM_SHA256 = "0ec395397888d611c1c9a1d4107f16e38482273c69ca3e8c169e3a1b0631e399";

test("shared WPM clearance rejects blocked samples and accepts real spawn centers", () => {
  const state = createGame({ mapId: 0 });
  const isFree = isPathingPositionFree;
  assert.equal(isFree(state, 8, 8, HERO_STATS.troll.radius), false, "source WPM cell (436, 92) is blocked");
  assert.equal(isFree(state, -1, 8, HERO_STATS.elf.radius), false, "world bounds remain enforced");

  const centerBlocked = createGame({ mapId: 0 });
  centerBlocked.session.pathing32.fill(0);
  centerBlocked.session.pathing32[92 * 1_536 + 436] |= 0x02;
  assert.equal(isFree(centerBlocked, 8, 8, HERO_STATS.elf.radius), false, "the center sample is required");

  const perimeterBlocked = createGame({ mapId: 0 });
  perimeterBlocked.session.pathing32.fill(0);
  perimeterBlocked.session.pathing32[117 * 1_536 + 464] |= 0x02;
  assert.equal(isFree(perimeterBlocked, 100, 100, HERO_STATS.elf.radius), true, "unverified body radius does not add WPM clearance");

  for (const id of generated.MAP_ORDER) {
    const realState = createGame({ mapId: id, rule: id === 4 ? "DEFEND" : "SINGLE", playerFaction: "troll" });
    for (const faction of ["elf", "troll"] as const) {
      const spawn = realState.session.spawns[faction];
      if (!spawn) continue;
      const x = (spawn.gx + 0.5) * 16;
      const y = (spawn.gy + 0.5) * 16;
      assert.equal(isFree(realState, x, y, HERO_STATS[faction].radius), true, `地图 ${id} ${faction} 出生点应可用`);
    }
  }
});

test("map 0 and map 1 keep game state isolated", () => {
  const a = createGame({ mapId: 0, seed: 42 });
  const b = createGame({ mapId: 1, seed: 42 });

  assert.equal(a.mapId, 0);
  assert.equal(b.mapId, 1);
  assert.notDeepEqual(a.blocked, b.blocked);
  assert.notStrictEqual(a.session, b.session);
  assert.notStrictEqual(a.blocked, b.blocked);
  assert.notStrictEqual(a.session.pathing32, b.session.pathing32);
  assert.equal(a.seed, 42);
  assert.equal(b.seed, 42);
});

test("all sessions decode the full shared WPM and expose its origin and hash", () => {
  for (const id of generated.MAP_ORDER) {
    const map = runtime.loadMvpMap(id);
    assert.equal(map.id, id);
    assert.deepEqual(map.pathing.origin, WPM_ORIGIN);
    assert.equal(map.pathing.width, 1_536);
    assert.equal(map.pathing.height, 1_152);
    assert.equal(map.pathing.file, `pathing/map-${id}.bin`);
    assert.equal(map.pathing.sha256, WPM_SHA256);
    assert.equal(runtime.buildPathing32(map).length, 1_536 * 1_152);
  }

  const raw = readFileSync(new URL("../../data/tve4/mvp/pathing/map-0.bin", import.meta.url));
  assert.equal(raw.length, 16 + 1_536 * 1_152);
  assert.equal(raw.subarray(0, 4).toString("ascii"), "MP3W");
  assert.equal(raw.readUInt32LE(4), 0);
  assert.equal(raw.readUInt32LE(8), 1_536);
  assert.equal(raw.readUInt32LE(12), 1_152);
  assert.deepEqual(runtime.buildPathing32(runtime.loadMvpMap(0)), new Uint8Array(raw.subarray(16)));
});

test("the coarse grid is derived from 4x4 WPM blocks without clearing spawn cells", () => {
  const map = runtime.loadMvpMap(0);
  const cells = readFileSync(new URL("../../data/tve4/mvp/pathing/map-0.bin", import.meta.url)).subarray(16);
  const expected = new Uint8Array(118 * 105);
  const pathingX = (-15_744 - WPM_ORIGIN[0]) / 32;
  const pathingY = (-14_976 - WPM_ORIGIN[1]) / 32;

  for (let gy = 0; gy < 105; gy += 1) {
    for (let gx = 0; gx < 118; gx += 1) {
      let blocked = 0;
      for (let dy = 0; dy < 4; dy += 1) {
        for (let dx = 0; dx < 4; dx += 1) {
          const x = pathingX + gx * 4 + dx;
          const y = pathingY + gy * 4 + dy;
          if ((cells[y * 1_536 + x] & 0x02) !== 0) blocked += 1;
        }
      }
      expected[gy * 118 + gx] = blocked >= 9 ? 1 : 0;
    }
  }

  assert.deepEqual(runtime.buildBuildGrid128(map), expected);
  const state = createGame({ mapId: 0 });
  assert.deepEqual(state.blocked, expected);
  assert.deepEqual(state.session.spawns.elf, state.session.spawns.troll);
  assert.deepEqual(state.session.trollBase, { gx: 60, gy: 49 });

  setBlocked(state, new Uint8Array(expected.length).fill(1));
  for (const spawn of [state.session.spawns.troll!, state.session.spawns.elf!]) {
    assert.equal(state.blocked[spawn.gy * 118 + spawn.gx], 1, "setBlocked must not clear spawn cells");
  }
});

test("sessions have deterministic defaults and independent mutable game data", () => {
  const a = createGame({ mapId: 0 });
  const b = createGame({ mapId: 0, seed: 1 });
  const c = createGame({ mapId: 0, seed: 2 });

  assert.equal(a.seed, 1);
  assert.equal(a.catalogVersion, catalog.MAP_CATALOG_VERSION);
  assert.equal(a.session.catalogVersion, a.catalogVersion);
  assert.equal(a.session.seed, a.seed);
  assert.equal(Object.isFrozen(a.session), true);
  assert.equal(Object.isFrozen(a.session.grid), true);
  assert.equal(Object.isFrozen(a.session.grid.bounds), true);
  assert.equal(Object.isFrozen(a.session.map), true);
  assert.notStrictEqual(a.session, b.session);
  assert.notStrictEqual(a.session, c.session);
  assert.equal(createGame({ mapId: 0, catalogVersion: "catalog-test" }).catalogVersion, "catalog-test");

  const blockedBefore = b.blocked[0];
  const pathingBefore = b.session.pathing32[0];
  a.blocked[0] = blockedBefore === 0 ? 1 : 0;
  a.session.pathing32[0] = pathingBefore === 0 ? 2 : 0;
  assert.equal(b.blocked[0], blockedBefore);
  assert.equal(c.blocked[0], blockedBefore);
  assert.equal(b.session.pathing32[0], pathingBefore);
  assert.equal(c.session.pathing32[0], pathingBefore);
});

test("map 5 uses the boundRect/extraRects union so the gap angel is representable", () => {
  const map = runtime.loadMvpMap(5);
  assert.deepEqual(map.sourceRect, [-26_688, -14_624, -16_480, -4_320]);
  assert.deepEqual(map.extraRects, [{ minX: -26_688, minY: -3_264, maxX: -16_448, maxY: 6_752 }]);
  assert.deepEqual(map.bounds, [-26_752, -14_720, -16_384, 6_784]);
  assert.deepEqual(map.grid, [81, 168]);

  const angel = map.angel!;
  assert.ok(angel);
  assert.ok(angel.gx >= 0 && angel.gx < map.grid[0]);
  assert.ok(angel.gy >= 0 && angel.gy < map.grid[1]);
  assert.ok(angel.gy * 128 + map.bounds[1] > map.boundRect.maxY);
  assert.ok(angel.gy * 128 + map.bounds[1] < map.extraRects[0].minY);
});

test("both factions share a usable center spawn on every map", () => {
  for (const id of generated.MAP_ORDER) {
    const state = createGame({ mapId: id, playerFaction: "elf" });
    const { elf, troll } = state.session.spawns;
    assert.ok(elf, `地图 ${id} 必须有精灵出生点`);
    assert.ok(troll, `地图 ${id} 必须有巨魔出生点`);
    assert.deepEqual(elf, troll, `地图 ${id} 双方出生点应在同一中心格`);
    const x = (elf.gx + 0.5) * 16;
    const y = (elf.gy + 0.5) * 16;
    assert.equal(isPathingPositionFree(state, x, y, HERO_STATS.elf.radius), true);
    assert.equal(isPathingPositionFree(state, x, y, HERO_STATS.troll.radius), true);
  }
});
