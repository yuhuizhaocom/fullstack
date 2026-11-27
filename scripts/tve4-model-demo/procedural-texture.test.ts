import assert from "node:assert/strict";
import test from "node:test";

import { generateProceduralTexture, hexToRgb, type ProceduralPalette } from "../../src/lib/tve4-model-demo/procedural-texture";

const palette: ProceduralPalette = {
  id: "test",
  label: "Test",
  colors: ["#2f8f83", "#185b57", "#d9a441", "#f2d58a"],
};

test("converts hex colors into normalized RGB channels", () => {
  assert.deepEqual(hexToRgb("#ff8040"), [1, 128 / 255, 64 / 255]);
  assert.deepEqual(hexToRgb("00ff00"), [0, 1, 0]);
});

test("generates deterministic opaque texture data", () => {
  const a = generateProceduralTexture(palette, 32);
  const b = generateProceduralTexture(palette, 32);
  assert.equal(a.width, 32);
  assert.equal(a.height, 32);
  assert.equal(a.data.length, 32 * 32 * 4);
  assert.deepEqual(a.data, b.data);
  for (let i = 3; i < a.data.length; i += 4) assert.equal(a.data[i], 255);
});

test("different palettes produce different colors", () => {
  const a = generateProceduralTexture(palette, 16);
  const b = generateProceduralTexture({ ...palette, id: "other", colors: ["#552288", "#331144", "#ee6644", "#ffccaa"] }, 16);
  assert.notDeepEqual(a.data, b.data);
});

test("texture generation stays within the requested dimensions", () => {
  const texture = generateProceduralTexture(palette, 8);
  assert.equal(texture.width, 8);
  assert.equal(texture.height, 8);
  assert.equal(texture.data.length, 8 * 8 * 4);
});
