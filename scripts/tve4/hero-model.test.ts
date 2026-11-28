import assert from "node:assert/strict";
import test from "node:test";
import { mat4, vec3, vec4 } from "gl-matrix";

import {
  actionSequenceIndex,
  defaultHeroModel,
  hasAvailableTexture,
  hasCompleteActions,
  heroModelsForFaction,
  modelActionFor,
  pickHeroModel,
} from "../../src/lib/tve4/model-catalog";
import { createHeroModelView, type HeroModelCamera } from "../../src/lib/tve4/render/hero-model-viewer";
import { calibrateHeroModelAnchor, filterHeroModelGeosets, visibleModelBounds } from "../../src/lib/tve4/render/hero-model-geosets";
import { createGame, stateHash, stepGame } from "../../src/lib/tve4/engine";
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

test("hero model catalog uses exact faction whitelists including neutral models", () => {
  const models = [
    model("m001", 1, "elf"),
    model("m002", 2, "elf"),
    model("m004", 4, "elf", ["stand", "walk", "attack", "death"], false),
    model("m020", 20, "elf"),
    model("m022", 22, "elf"),
    model("m024", 24, "elf"),
    model("m025", 25, "elf"),
    model("m027", 27, "elf"),
    model("m028", 28, "elf"),
    model("m029", 29, "elf"),
    model("m005", 5, "elf"),
    model("m030", 30, "troll"),
    model("m001", 1, "troll"),
    model("m004", 4, "troll"),
    model("m005", 5, "troll"),
    model("m015", 15, "troll"),
    model("m016", 16, "troll"),
    model("m017", 17, "troll"),
    model("m036", 36, "other-characters"),
    model("m040", 40, "other-characters"),
    model("m041", 41, "other-characters"),
    model("m042", 42, "other-characters"),
    model("m044", 44, "other-characters"),
    model("m045", 45, "other-characters"),
    model("m047", 47, "other-characters"),
    model("m048", 48, "other-characters"),
    model("m049", 49, "other-characters"),
    model("m050", 50, "other-characters"),
    model("m051", 51, "other-characters"),
    model("m054", 54, "other-characters"),
    model("m055", 55, "other-characters"),
    model("m056", 56, "other-characters"),
  ];
  assert.deepEqual(heroModelsForFaction(models, "elf").map((entry) => entry.id), ["m022", "m024", "m025", "m027", "m028", "m029", "m042", "m044", "m045", "m047", "m048", "m049", "m050", "m051", "m054", "m055", "m056"]);
  assert.deepEqual(heroModelsForFaction(models, "troll").map((entry) => entry.id), ["m004", "m005", "m015", "m016", "m017", "m036", "m040"]);
  assert.deepEqual(heroModelsForFaction(models, "elf").map((entry) => entry.number), [22, 24, 25, 27, 28, 29, 42, 44, 45, 47, 48, 49, 50, 51, 54, 55, 56]);
});

test("default hero model prefers complete actions and original textures", () => {
  const incompleteTextured = model("m022", 22, "elf", ["stand", "walk"], true);
  const completeGray = model("m024", 24, "elf", ["stand", "walk", "attack", "death"], false);
  const completeTextured = model("m025", 25, "elf", ["stand", "walk", "attack", "death"], true);
  assert.equal(hasCompleteActions(incompleteTextured), false);
  assert.equal(hasAvailableTexture(completeGray), false);
  assert.equal(defaultHeroModel([incompleteTextured, completeGray, completeTextured], "elf")?.id, "m025");
  assert.equal(defaultHeroModel([completeGray], "elf"), null);
  assert.equal(defaultHeroModel([model("m030", 30, "troll", ["stand", "walk", "attack", "death"], false)], "troll"), null);
  assert.equal(defaultHeroModel([model("m004", 4, "troll", ["stand", "walk", "attack", "death"], false)], "troll")?.id, "m004");
  assert.equal(defaultHeroModel([], "elf"), null);
});

test("AI skin picker uses only the faction whitelist and clamps random boundaries", () => {
  const models = [
    model("m001", 1, "elf"),
    model("m004", 4, "troll"),
    model("m005", 5, "troll"),
    model("m015", 15, "troll"),
    model("m030", 30, "troll"),
  ];
  assert.equal(pickHeroModel(models, "troll", () => 0)?.id, "m004");
  assert.equal(pickHeroModel(models, "troll", () => 0.999)?.id, "m015");
  assert.equal(pickHeroModel(models, "troll", () => 1)?.id, "m015");
  assert.equal(pickHeroModel(models, "elf", () => 0), null);
  assert.equal(pickHeroModel([], "troll", () => 0), null);
});

test("AI appearance does not consume simulation RNG or change the state hash", () => {
  const first = createGame({ mapId: 0, seed: 77, testMode: true, playerFaction: "elf", aiHeroModelId: "m004" });
  const second = createGame({ mapId: 0, seed: 77, testMode: true, playerFaction: "elf", aiHeroModelId: "m015" });
  assert.equal(first.appearance.aiHeroModelId, "m004");
  assert.equal(second.appearance.aiHeroModelId, "m015");
  for (let i = 0; i < 30 * 10; i++) {
    stepGame(first, 1 / 30, { mx: 0, my: 0 });
    stepGame(second, 1 / 30, { mx: 0, my: 0 });
  }
  assert.equal(first.rng.state, second.rng.state);
  assert.equal(stateHash(first), stateHash(second));
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
  const geosets = (count: number) => ({ Geosets: Array.from({ length: count }, (_, index) => ({ MinimumExtent: [0, 0, index], MaximumExtent: [1, 1, index + 1] })) });
  assert.deepEqual(filterHeroModelGeosets(geosets(10), "m050").Geosets.map((geoset) => geoset.MinimumExtent[2]), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(filterHeroModelGeosets(geosets(24), "m051").Geosets.map((geoset) => geoset.MinimumExtent[2]), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22]);
  assert.deepEqual(filterHeroModelGeosets(geosets(6), "m054").Geosets.map((geoset) => geoset.MinimumExtent[2]), [0, 1, 2]);
  assert.deepEqual(filterHeroModelGeosets(geosets(9), "m055").Geosets.map((geoset) => geoset.MinimumExtent[2]), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(filterHeroModelGeosets(geosets(8), "m056").Geosets.map((geoset) => geoset.MinimumExtent[2]), [1, 2, 3, 4, 5, 6, 7]);
});

test("hero model camera keeps the model center at the viewport center", () => {
  const camera: HeroModelCamera = {
    center: [23.4957, 11.0524, 113.9145],
    modelScale: 0.2611,
    yaw: 0,
    cameraPhi: -Math.PI / 2,
    cameraTheta: 0.24,
    cameraDistance: 360,
  };
  const view = createHeroModelView(camera);
  const projection = mat4.create();
  mat4.perspective(projection, Math.PI / 4, 1, 0.1, 5000);
  const clip = vec4.create();
  vec4.transformMat4(clip, vec4.fromValues(...camera.center, 1), view);
  vec4.transformMat4(clip, clip, projection);
  assert.ok(Math.abs(clip[0] / clip[3]) < 1e-6);
  assert.ok(Math.abs(clip[1] / clip[3]) < 1e-6);
});

test("m022 uses rendered pixel bounds for its health bar and ground anchor", () => {
  assert.deepEqual(calibrateHeroModelAnchor("m022", 0.427, -1.4686), { groundY: 0.3273, topY: -0.0545 });
  assert.deepEqual(calibrateHeroModelAnchor("m024", 0.427, -1.4686), { groundY: 0.427, topY: -1.4686 });
});

test("hero appearance is render-only and does not change deterministic state hash", () => {
  const plain = createGame({ mapId: 0, seed: 77, testMode: true, playerFaction: "elf" });
  const modeled = createGame({ mapId: 0, seed: 77, testMode: true, playerFaction: "elf", heroModelId: "m022" });
  assert.equal(plain.appearance.heroModelId, null);
  assert.equal(modeled.appearance.heroModelId, "m022");
  assert.equal(stateHash(plain), stateHash(modeled));
});