import assert from "node:assert/strict";
import test from "node:test";

import { disposeRenderer } from "../../src/lib/tve4-model-demo/dispose";

test("renderer cleanup failures do not abort the next model load", () => {
  let destroyed = false;
  assert.doesNotThrow(() =>
    disposeRenderer({
      destroy: () => {
        destroyed = true;
        throw new TypeError("Cannot read properties of undefined (reading 'program')");
      },
    }),
  );
  assert.equal(destroyed, true);
});

test("missing renderer is a valid cleanup state", () => {
  assert.doesNotThrow(() => disposeRenderer(null));
});
