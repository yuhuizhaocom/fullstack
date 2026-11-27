import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cameraBoundsToWeb,
  computeGeometryHash,
  sourceToWebPoint,
  validateRenderGeometry,
  type RenderGeometry,
} from "../../src/lib/tve4/render/geometry";

interface SourceMap {
  id: number;
  boundRect: { minX: number; minY: number; maxX: number; maxY: number };
  extraRects: Array<{ minX: number; minY: number; maxX: number; maxY: number }>;
  terrain: Array<{ x: number; y: number; tileId: number }>;
  doodads: Array<{ typeId: string; x: number; y: number; rotation: number }>;
}

const maps = JSON.parse(
  readFileSync(new URL("../../data/tve4/mvp/maps.json", import.meta.url), "utf8"),
) as SourceMap[];

function expectedRuntimeBounds(map: SourceMap): [number, number, number, number] {
  const rects = [map.boundRect, ...map.extraRects];
  return [
    Math.floor(Math.min(...rects.map((rect) => rect.minX)) / 128) * 128,
    Math.floor(Math.min(...rects.map((rect) => rect.minY)) / 128) * 128,
    Math.ceil(Math.max(...rects.map((rect) => rect.maxX)) / 128) * 128,
    Math.ceil(Math.max(...rects.map((rect) => rect.maxY)) / 128) * 128,
  ];
}

test("all eight render-only geometry files preserve W3E/DOO source coordinates and hashes", async () => {
  assert.equal(maps.length, 8);
  for (const map of maps) {
    const geometry = validateRenderGeometry(
      JSON.parse(
        readFileSync(
          new URL(`../../public/tve4/geometry/map-${map.id}.json`, import.meta.url),
          "utf8",
        ),
      ),
    );
    assert.equal(geometry.mapId, map.id);
    assert.deepEqual(geometry.runtimeBounds, expectedRuntimeBounds(map));
    assert.deepEqual(geometry.terrain, map.terrain);
    assert.deepEqual(geometry.doodads, map.doodads);
    assert.equal(await computeGeometryHash(geometry), geometry.geometryHash);
  }
});

test("render geometry rejects any runtimeBounds mismatch with the simulation session", () => {
  const value = JSON.parse(
    readFileSync(new URL("../../public/tve4/geometry/map-4.json", import.meta.url), "utf8"),
  ) as { runtimeBounds: [number, number, number, number] };
  const sessionBounds = value.runtimeBounds;
  for (let index = 0; index < 4; index += 1) {
    const runtimeBounds: [number, number, number, number] = [...sessionBounds];
    runtimeBounds[index] += 128;
    assert.throws(
      () => validateRenderGeometry({ ...value, runtimeBounds }, sessionBounds),
      /runtimeBounds 与模拟会话不一致/,
      `runtimeBounds[${index}] must match the session`,
    );
  }
});

test("render geometry hash works in insecure HTTP contexts without crypto.subtle", async () => {
  const geometry = validateRenderGeometry(
    JSON.parse(
      readFileSync(new URL("../../public/tve4/geometry/map-0.json", import.meta.url), "utf8"),
    ),
  );
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
  try {
    assert.equal(await computeGeometryHash(geometry), geometry.geometryHash);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});

test("render geometry rejects a tampered payload instead of trusting its hash", async () => {
  const geometry = validateRenderGeometry(
    JSON.parse(
      readFileSync(new URL("../../public/tve4/geometry/map-0.json", import.meta.url), "utf8"),
    ),
  );
  const tampered: RenderGeometry = {
    ...geometry,
    terrain: [{ ...geometry.terrain[0], tileId: (geometry.terrain[0].tileId + 1) % 256 }, ...geometry.terrain.slice(1)],
  };
  assert.notEqual(await computeGeometryHash(tampered), tampered.geometryHash);
});

test("source W3E/DOO coordinates and camera bounds use the runtime bounds origin divided by eight", () => {
  const map = maps[0];
  const bounds = expectedRuntimeBounds(map);
  assert.deepEqual(sourceToWebPoint(map.terrain[0].x, map.terrain[0].y, bounds), { x: -8, y: 8 });
  assert.deepEqual(sourceToWebPoint(map.doodads[0].x, map.doodads[0].y, bounds), {
    x: (map.doodads[0].x - bounds[0]) / 8,
    y: (map.doodads[0].y - bounds[1]) / 8,
  });
  assert.deepEqual(
    cameraBoundsToWeb({ minX: -17664, minY: -15360, maxX: 1280, maxY: -512 }, bounds),
    { x: -240, y: -48, width: 2368, height: 1856 },
  );
});

test("the simulation catalog does not embed terrain or doodad geometry", () => {
  const catalog = readFileSync(
    new URL("../../src/lib/tve4/maps.generated.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(catalog, /"terrain"\s*:/);
  assert.doesNotMatch(catalog, /"doodads"\s*:/);
});
