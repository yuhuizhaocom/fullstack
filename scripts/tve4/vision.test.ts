import assert from "node:assert/strict";
import test from "node:test";

import {
  buildingVisionRadius,
  fogDisplaySize,
  heroVisionRadius,
} from "../../src/lib/tve4/vision";
import type { Hero } from "../../src/lib/tve4/types";

function hero(faction: Hero["faction"]): Hero {
  return { faction } as Hero;
}

test("both factions use the reduced hero vision radius", () => {
  assert.equal(heroVisionRadius(hero("elf")), 120);
  assert.equal(heroVisionRadius(hero("troll")), 140);
});

test("building vision uses four tiles unless an ability range is larger", () => {
  assert.equal(buildingVisionRadius(), 64);
  assert.equal(buildingVisionRadius(200), 200);
});

test("fog diameter matches the clear vision radius and still covers the viewport", () => {
  assert.equal(fogDisplaySize(120, 1.15, 844, 390), 1380);
  assert.equal(fogDisplaySize(140, 1.15, 844, 390), 1610);
  assert.ok(fogDisplaySize(1, 0.1, 844, 390) >= 975);
});
