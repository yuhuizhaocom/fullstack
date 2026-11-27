import assert from "node:assert/strict";
import test from "node:test";

import {
  collectTve4AudioEvents,
  type Tve4AudioEventState,
} from "../../src/lib/tve4/audio-events";

function hero(id: number, overrides: Partial<Tve4AudioEventState["heroes"][number]> = {}) {
  return { id, alive: true, hp: 100, cd: 0, interval: 1, ...overrides };
}

function state(overrides: Partial<Tve4AudioEventState> = {}): Tve4AudioEventState {
  return { projectiles: [], heroes: [], buildings: [], ...overrides };
}

test("initial audio snapshot does not emit events", () => {
  assert.deepEqual(collectTve4AudioEvents(null, state({ heroes: [hero(1)], buildings: [{ id: 1, alive: true }] })), []);
});

test("new projectiles emit attack sounds only once", () => {
  const previous = state();
  const next = state({ projectiles: [{ id: 7 }] });
  assert.deepEqual(collectTve4AudioEvents(previous, next), ["attack"]);
  assert.deepEqual(collectTve4AudioEvents(next, next), []);
});

test("heroes entering the attack window emit attack sounds", () => {
  assert.deepEqual(collectTve4AudioEvents(state({ heroes: [hero(1)] }), state({ heroes: [hero(1, { cd: 1 })] })), ["attack"]);
  assert.deepEqual(collectTve4AudioEvents(state({ heroes: [hero(1, { cd: 1 })] }), state({ heroes: [hero(1, { cd: 0.8 })] })), []);
});

test("health loss emits hit sounds", () => {
  assert.deepEqual(collectTve4AudioEvents(state({ heroes: [hero(1, { hp: 100 })] }), state({ heroes: [hero(1, { hp: 82 })] })), ["hit"]);
});

test("destroyed buildings and dead heroes emit their own sounds", () => {
  const previous = state({ heroes: [hero(1)], buildings: [{ id: 4, alive: true }] });
  const next = state({ heroes: [hero(1, { alive: false, hp: 0 })], buildings: [{ id: 4, alive: false }] });
  assert.deepEqual(collectTve4AudioEvents(previous, next), ["destroy", "death"]);
});

test("multiple simultaneous events are returned in stable order", () => {
  const previous = state({
    projectiles: [],
    heroes: [hero(1, { hp: 100 }), hero(2, { hp: 100 })],
    buildings: [{ id: 4, alive: true }],
  });
  const next = state({
    projectiles: [{ id: 7 }],
    heroes: [hero(1, { hp: 90, cd: 1 }), hero(2, { alive: false, hp: 0 })],
    buildings: [{ id: 4, alive: false }],
  });
  assert.deepEqual(collectTve4AudioEvents(previous, next), ["attack", "hit", "destroy", "death"]);
});
