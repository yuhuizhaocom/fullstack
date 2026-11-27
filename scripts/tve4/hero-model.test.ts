import assert from "node:assert/strict";
import test from "node:test";

import {
  actionSequenceIndex,
  defaultHeroModel,
  hasAvailableTexture,
  hasCompleteActions,
  heroModelsForFaction,
  modelActionFor,
} from "../../src/lib/tve4/model-catalog";
import { filterHeroModelGeosets, visibleModelBounds } from "../../src/lib/tve4/render/hero-model-geosets";
import { createGame, stateHash } from "../../src/lib/tve4/engine";
import type { ModelDemoEntry } from "../../src/lib/tve4-model-demo/manifest";
import type { ActionKey } from "../../src/lib/tve4-model-demo/sequences";
import type { ModelGroup } from "../../src/lib/tve4-model-demo/catalog";

function model(
  id: string,
  number: number,
  group: ModelGroup,
  actions: ActionKey[] = ["stand", "walk", "attack", "death"],
  textured = true,
): ModelDemoEntry {
  return {
    id,
    number,
    group,
    label: id,
    sourceFile: `${id}.mdx`,
    modelFile: `${id}.mdx`,
    modelUrl: `/models/${id}.mdx`,
    sha256: "0".repeat(64),
    version: 800,
    geometryCount: 1,
    boneCount: 1,
    sequences: actions.map((action, index) => ({
      name: action,
      start: index * 10,
      end: index * 10 + 10,
      nonLooping: action === "death",
      moveSpeed: 0,
      kind: action,
      duration: 10,
    })),
    actions: Object.fromEntries(actions.map((action, index) => [action, { index, proxy: false }])),
    textures: textured
      ? [{ image: "base.blp", replaceableId: 0, status: "available", url: "/textures/base.png", file: "base.png" }]
      : [{ image: "base.blp", replaceableId: 0, status: "missing", url: null, file: null }],
    events: [],
  };
}

test("hero model catalog filters by faction and keeps only textured non-m020 elves", () => {
  const models = [
    model("m001", 1, "elf"),
    model("m002", 2, "elf"),
    model("m004", 4, "elf", ["stand", "walk", "attack", "death"], false),
    model("m020", 20, "elf"),
    model("m005", 5, "elf"),
    model("m030", 30, "troll"),
    model("m001", 1, "troll"),
    model("m004", 4, "troll"),
    model("m005", 5, "troll"),
    model("m015", 15, "troll"),
    model("m016", 16, "troll"),
    model("m017", 17, "troll"),
  ];
  assert.deepEqual(heroModelsForFaction(models, "elf").map((entry) => entry.id), ["m001", "m002", "m005"]);
  assert.deepEqual(heroModelsForFaction(models, "troll").map((entry) => entry.id), ["m004", "m005", "m015", "m016", "m017"]);
  assert.deepEqual(heroModelsForFaction(models, "elf").map((entry) => entry.number), [1, 2, 5]);
});

test("default hero model prefers complete actions and original textures", () => {
  const incompleteTextured = model("m001", 1, "elf", ["stand", "walk"], true);
  const completeGray = model("m002", 2, "elf", ["stand", "walk", "attack", "death"], false);
  const completeTextured = model("m003", 3, "elf", ["stand", "walk", "attack", "death"], true);
  assert.equal(hasCompleteActions(incompleteTextured), false);
  assert.equal(hasAvailableTexture(completeGray), false);
  assert.equal(defaultHeroModel([incompleteTextured, completeGray, completeTextured], "elf")?.id, "m003");
  assert.equal(defaultHeroModel([completeGray], "elf"), null);
  assert.equal(defaultHeroModel([model("m030", 30, "troll", ["stand", "walk", "attack", "death"], false)], "troll"), null);
  assert.equal(defaultHeroModel([model("m004", 4, "troll", ["stand", "walk", "attack", "death"], false)], "troll")?.id, "m004");
  assert.equal(defaultHeroModel([], "elf"), null);
});

test("model action selection falls back when an animation is missing", () => {
  const complete = model("m001", 1, "elf");
  assert.equal(modelActionFor(complete, { alive: true, moving: false, attacking: false }), "stand");
  assert.equal(modelActionFor(complete, { alive: true, moving: true, attacking: false }), "walk");
  assert.equal(modelActionFor(complete, { alive: true, moving: false, attacking: true }), "attack");
  assert.equal(modelActionFor(complete, { alive: false, moving: false, attacking: false }), "death");
  const standOnly = model("m002", 2, "elf", ["stand"]);
  assert.equal(modelActionFor(standOnly, { alive: true, moving: true, attacking: false }), "stand");
  assert.equal(modelActionFor(standOnly, { alive: false, moving: false, attacking: false }), "stand");
  assert.equal(actionSequenceIndex(complete, "attack"), 2);
  assert.equal(actionSequenceIndex(standOnly, "attack"), null);
});

test("model floor geosets are removed per model before anchor calibration", () => {
  const source = {
    Geosets: [
      { MinimumExtent: [-120, -120, 0], MaximumExtent: [120, 120, 10] },
      { MinimumExtent: [-10, -10, 20], MaximumExtent: [10, 10, 100] },
      { MinimumExtent: [-5, -5, 30], MaximumExtent: [5, 5, 90] },
    ],
  };
  const filtered = filterHeroModelGeosets(source, "m025");
  assert.equal(filtered.Geosets.length, 2);
  assert.deepEqual(filtered.Geosets[0], source.Geosets[1]);
  assert.deepEqual(visibleModelBounds(filtered), { min: [-10, -10, 20], max: [10, 10, 100] });
  assert.deepEqual(filterHeroModelGeosets(source, "m022").Geosets, source.Geosets);
  assert.deepEqual(filterHeroModelGeosets(source, "m015").Geosets, source.Geosets.slice(1));
  assert.deepEqual(filterHeroModelGeosets(source, "m016").Geosets, source.Geosets.slice(1));
  const manyGeosets = { Geosets: Array.from({ length: 14 }, (_, index) => ({ MinimumExtent: [0, 0, index], MaximumExtent: [1, 1, index + 1] })) };
  assert.equal(filterHeroModelGeosets(manyGeosets, "m017").Geosets.length, 13);
  assert.equal(filterHeroModelGeosets(manyGeosets, "m017").Geosets.at(-1)?.MinimumExtent[2], 12);
});

test("hero appearance is render-only and does not change deterministic state hash", () => {
  const plain = createGame({ mapId: 0, seed: 77, testMode: true, playerFaction: "elf" });
  const modeled = createGame({ mapId: 0, seed: 77, testMode: true, playerFaction: "elf", heroModelId: "m022" });
  assert.equal(plain.appearance.heroModelId, null);
  assert.equal(modeled.appearance.heroModelId, "m022");
  assert.equal(stateHash(plain), stateHash(modeled));
});