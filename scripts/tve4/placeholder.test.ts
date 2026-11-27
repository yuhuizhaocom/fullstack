import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  drawPlaceholderBuilding,
  drawPlaceholderDoodad,
  drawPlaceholderUnit,
  terrainColor,
} from "../../src/lib/tve4/render/placeholder";
import type { Faction } from "../../src/lib/tve4/types";

const maps = JSON.parse(
  readFileSync(new URL("../../data/tve4/mvp/maps.json", import.meta.url), "utf8"),
) as Array<{ terrain: Array<{ tileId: number }> }>;

function recordingContext() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const target: Record<string, unknown> = {
    canvas: { width: 64, height: 64 },
    globalAlpha: 1,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
  };
  const ctx = new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      return (...args: unknown[]) => {
        calls.push({ op: String(property), args });
      };
    },
    set(object, property, value) {
      calls.push({ op: `set:${String(property)}`, args: [value] });
      object[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

test("placeholder units use faction geometry and expose all four animation states", () => {
  for (const faction of ["elf", "troll"] as Faction[]) {
    for (const state of ["idle", "move", "attack", "dead"] as const) {
      const { ctx, calls } = recordingContext();
      drawPlaceholderUnit(ctx, faction, faction, state);
      assert.ok(calls.some((call) => call.op === "fillRect" || call.op === "fillCircle" || call.op === "fillTriangle"));
      assert.ok(calls.some((call) => call.op === "save"));
      assert.ok(calls.some((call) => call.op === "restore"));
    }
  }

  const elf = recordingContext();
  const troll = recordingContext();
  drawPlaceholderUnit(elf.ctx, "elf", "elf", "idle");
  drawPlaceholderUnit(troll.ctx, "troll", "troll", "idle");
  assert.notDeepEqual(elf.calls, troll.calls);
});

test("placeholder buildings and DOO doodads draw without image assets", () => {
  const building = recordingContext();
  drawPlaceholderBuilding(building.ctx, "tower", "elf", 3);
  assert.ok(building.calls.some((call) => call.op === "fillRect"));

  const doodad = recordingContext();
  drawPlaceholderDoodad(doodad.ctx, "WTst");
  assert.ok(doodad.calls.some((call) => call.op === "fill"));
  assert.ok(doodad.calls.some((call) => call.op === "moveTo"));
});

test("terrain tile types use a small deterministic palette", () => {
  const colors = new Set(Array.from({ length: 256 }, (_, tileId) => terrainColor(tileId)));
  assert.ok(colors.size <= 12, `expected a limited palette, got ${colors.size}`);
  assert.equal(terrainColor(34), terrainColor(34));
  assert.notEqual(terrainColor(0), terrainColor(197));
  assert.equal(terrainColor(7), "#355f66");
  assert.equal(terrainColor(8), "#d7e2df");
  assert.equal(terrainColor(9), "#d7e2df");
  assert.ok(maps.some((map) => map.terrain.some((tile) => tile.tileId === 7)));
});
