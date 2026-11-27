import assert from "node:assert/strict";
import test from "node:test";

import { shouldFlipHeroModel } from "../../src/lib/tve4/render/hero-model-facing";

test("hero model mirrors only when facing left", () => {
  assert.equal(shouldFlipHeroModel(0), false);
  assert.equal(shouldFlipHeroModel(Math.PI), true);
  assert.equal(shouldFlipHeroModel(-Math.PI), true);
  assert.equal(shouldFlipHeroModel(Math.PI / 2), false);
  assert.equal(shouldFlipHeroModel(-Math.PI / 2), false);
});
