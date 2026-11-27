import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySequence,
  eventTimesMs,
  findActionSequence,
  sequenceDurationMs,
  toDemoSequences,
  type DemoSequence,
} from "../../src/lib/tve4-model-demo/sequences";

const sequences: DemoSequence[] = [
  { name: "Stand", start: 100, end: 500, nonLooping: false, moveSpeed: 0 },
  { name: "Stand - 2", start: 600, end: 900, nonLooping: false, moveSpeed: 0 },
  { name: "Attack - 1", start: 1000, end: 1600, nonLooping: true, moveSpeed: 0 },
  { name: "Walk", start: 1700, end: 1900, nonLooping: false, moveSpeed: 270 },
  { name: "Death", start: 2000, end: 2600, nonLooping: true, moveSpeed: 0 },
  { name: "Decay Flesh", start: 2700, end: 5000, nonLooping: true, moveSpeed: 0 },
];

test("classifies War3 sequence names without treating variants as new actions", () => {
  assert.equal(classifySequence("Stand - 2"), "stand");
  assert.equal(classifySequence("  stand ready  "), "stand");
  assert.equal(classifySequence("Walk Gold"), "walk");
  assert.equal(classifySequence("Attack -1"), "attack");
  assert.equal(classifySequence("Spell Attack"), "attack");
  assert.equal(classifySequence("Decay Bone"), "decay");
  assert.equal(classifySequence("oldSpell -Berserk"), "spell");
  assert.equal(classifySequence("Portrait"), null);
});

test("prefers the exact base action and marks variants as proxies", () => {
  const stand = findActionSequence(sequences, "stand");
  const attack = findActionSequence(sequences, "attack");
  const walk = findActionSequence(sequences, "walk");
  const death = findActionSequence(sequences, "death");
  assert.equal(stand?.index, 0);
  assert.equal(stand?.proxy, false);
  assert.equal(attack?.index, 2);
  assert.equal(attack?.proxy, true);
  assert.equal(walk?.index, 3);
  assert.equal(walk?.proxy, false);
  assert.equal(death?.index, 4);
  assert.equal(death?.proxy, false);
});

test("does not substitute another action when the requested animation is missing", () => {
  assert.equal(findActionSequence(sequences.filter((s) => s.name !== "Death"), "death"), null);
  assert.equal(findActionSequence(sequences, "spell"), null);
});

test("preserves original sequence timing and converts events to sequence-relative milliseconds", () => {
  assert.equal(sequenceDurationMs(sequences[2]), 600);
  assert.deepEqual(eventTimesMs([950, 1000, 1300, 1700, 1300], 1000, 1600), [0, 300]);
  assert.deepEqual(eventTimesMs([500, 600], 1000, 1600), []);
});

test("maps parser sequences into the UI model without retiming them", () => {
  assert.deepEqual(
    toDemoSequences([
      { Name: "Walk", Interval: [10, 40], NonLooping: false, MoveSpeed: 150 },
      { Name: "Death", Interval: [50, 90], NonLooping: true, MoveSpeed: 0 },
    ]),
    [
      { name: "Walk", start: 10, end: 40, nonLooping: false, moveSpeed: 150 },
      { name: "Death", start: 50, end: 90, nonLooping: true, moveSpeed: 0 },
    ],
  );
});
