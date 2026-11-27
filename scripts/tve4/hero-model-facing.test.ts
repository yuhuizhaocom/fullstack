import assert from "node:assert/strict";
import test from "node:test";

import { heroModelOrientation, shouldFlipHeroModel } from "../../src/lib/tve4/render/hero-model-facing";

test("hero model mirrors only when facing left", () => {
  assert.equal(shouldFlipHeroModel(0), false);
  assert.equal(shouldFlipHeroModel(Math.PI), true);
  assert.equal(shouldFlipHeroModel(-Math.PI), true);
  assert.equal(shouldFlipHeroModel(Math.PI / 2), false);
  assert.equal(shouldFlipHeroModel(-Math.PI / 2), false);
});

test("hero model turns around for vertical movement", () => {
  assert.deepEqual(heroModelOrientation(0), { flipX: false, yaw: 0 });
  assert.deepEqual(heroModelOrientation(Math.PI), { flipX: true, yaw: 0 });
  assert.deepEqual(heroModelOrientation(-Math.PI / 2), { flipX: false, yaw: -Math.PI / 2 });
  assert.deepEqual(heroModelOrientation(Math.PI / 2), { flipX: false, yaw: Math.PI / 2 });
  assert.deepEqual(heroModelOrientation(Math.PI / 3), { flipX: false, yaw: Math.PI / 3 });
  assert.deepEqual(heroModelOrientation((2 * Math.PI) / 3), { flipX: false, yaw: (2 * Math.PI) / 3 });
});
