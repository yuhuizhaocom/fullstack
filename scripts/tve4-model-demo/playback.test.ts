import assert from "node:assert/strict";
import test from "node:test";

import { advanceFrame, clampFrame } from "../../src/lib/tve4-model-demo/playback";
import type { DemoSequence } from "../../src/lib/tve4-model-demo/sequences";

const loop: DemoSequence = { name: "Walk", start: 100, end: 200, nonLooping: false, moveSpeed: 270 };
const once: DemoSequence = { name: "Attack", start: 300, end: 450, nonLooping: true, moveSpeed: 0 };

test("looping sequences wrap without changing their original duration", () => {
  assert.deepEqual(advanceFrame(180, 40, 1, loop), { frame: 120, ended: false });
  assert.deepEqual(advanceFrame(100, 100, 1, loop), { frame: 100, ended: false });
});

test("non-looping sequences clamp at the final frame and stop", () => {
  assert.deepEqual(advanceFrame(420, 20, 1, once), { frame: 440, ended: false });
  assert.deepEqual(advanceFrame(440, 20, 1, once), { frame: 450, ended: true });
  assert.deepEqual(advanceFrame(300, 1000, 1, once), { frame: 450, ended: true });
});

test("playback speed scales elapsed time without retiming the clip", () => {
  assert.deepEqual(advanceFrame(100, 40, 0.25, loop), { frame: 110, ended: false });
  assert.deepEqual(advanceFrame(100, 40, 2, loop), { frame: 180, ended: false });
});

test("scrubbing is clamped to the selected sequence interval", () => {
  assert.equal(clampFrame(50, loop), 100);
  assert.equal(clampFrame(150, loop), 150);
  assert.equal(clampFrame(250, loop), 200);
});
