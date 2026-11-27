import assert from "node:assert/strict";
import test from "node:test";

import {
  buildingVisionRadius,
  fogDisplaySize,
  heroVisionRadius,
  isEntityVisibleToPlayer,
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
  assert.equal(fogDisplaySize(120, 1.15, 844, 390), 1952.4760587520657);
  assert.equal(fogDisplaySize(140, 1.15, 844, 390), 1952.4760587520657);
  assert.ok(fogDisplaySize(1, 0.1, 844, 390) >= 1952);
});

test("fog radius covers the farthest viewport corner when the player is at an edge", () => {
  const diameter = fogDisplaySize(0, 1, 844, 390);
  assert.ok(diameter / 2 >= Math.hypot(844, 390));
});

test("enemy entities outside player vision are not rendered", () => {
  const visible = new Set([7]);
  assert.equal(isEntityVisibleToPlayer("elf", "elf", visible, 1), true);
  assert.equal(isEntityVisibleToPlayer("troll", "elf", visible, 7), true);
  assert.equal(isEntityVisibleToPlayer("troll", "elf", visible, 8), false);
});
