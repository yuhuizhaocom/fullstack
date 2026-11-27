import assert from "node:assert/strict";
import test from "node:test";

import { buildManifestEntry, type ManifestModel } from "../../src/lib/tve4-model-demo/manifest";

const model: ManifestModel = {
  Version: 800,
  Geosets: [{}, {}],
  Bones: [{}, {}, {}],
  Sequences: [
    { Name: "Stand", Interval: [100, 500], NonLooping: false, MoveSpeed: 0 },
    { Name: "Attack - 1", Interval: [600, 900], NonLooping: true, MoveSpeed: 0 },
  ],
  Textures: [
    { Image: "Textures\\OldElf.blp", ReplaceableId: 0 },
    { Image: "", ReplaceableId: 1 },
    { Image: "Textures\\missing.blp", ReplaceableId: 0 },
  ],
  EventObjects: [{ Name: "Hit", EventTrack: [620, 700] }],
};

test("builds a manifest entry with original timing, action proxies, and texture status", () => {
  const entry = buildManifestEntry({
    id: "oldelf",
    number: 7,
    group: "elf",
    label: "Oldelf",
    sourceFile: "Oldelf.mdx",
    modelFile: "models/07-Oldelf.mdx",
    modelUrl: "/tve4-model-demo/models/07-Oldelf.mdx",
    sha256: "abc123",
    textureFiles: [
      { file: "textures/07/wrong/OldElf.blp", url: "/wrong", sourcePath: "Other\\OldElf.blp" },
      { file: "textures/07/Textures/OldElf.blp", url: "/tve4-model-demo/textures/07/Textures/OldElf.blp", sourcePath: "Textures\\OldElf.blp" },
    ],
    model,
  });

  assert.equal(entry.number, 7);
  assert.equal(entry.group, "elf");
  assert.equal(entry.sourceFile, "Oldelf.mdx");
  assert.equal(entry.version, 800);
  assert.equal(entry.geometryCount, 2);
  assert.equal(entry.boneCount, 3);
  assert.equal(entry.sequences[1].duration, 300);
  assert.deepEqual(entry.actions.stand, { index: 0, proxy: false });
  assert.deepEqual(entry.actions.attack, { index: 1, proxy: true });
  assert.equal(entry.actions.death, undefined);
  assert.equal(entry.textures[0].status, "available");
  assert.equal(entry.textures[0].url, "/tve4-model-demo/textures/07/Textures/OldElf.blp");
  assert.equal(entry.textures[1].status, "replaceable");
  assert.equal(entry.textures[2].status, "missing");
  assert.deepEqual(entry.events[0].times, [620, 700]);
});

test("allows particle-only effect models without geometry or bones", () => {
  const entry = buildManifestEntry({
    id: "effect",
    number: 1,
    group: "effects-ui",
    label: "Effect",
    sourceFile: "Effect.mdx",
    modelFile: "models/001-Effect.mdx",
    modelUrl: "/tve4-model-demo/models/001-Effect.mdx",
    sha256: "abc",
    textureFiles: [],
    allowEmptyGeometry: true,
    model: { ...model, Geosets: [], Bones: [] },
  });
  assert.equal(entry.geometryCount, 0);
  assert.equal(entry.boneCount, 0);
});

test("can skip malformed effect sequences while preserving valid ones", () => {
  const entry = buildManifestEntry({
    id: "effect",
    number: 1,
    group: "effects-ui",
    label: "Effect",
    sourceFile: "Effect.mdx",
    modelFile: "models/001-Effect.mdx",
    modelUrl: "/tve4-model-demo/models/001-Effect.mdx",
    sha256: "abc",
    textureFiles: [],
    allowEmptyGeometry: true,
    allowEmptySequences: true,
    skipInvalidSequences: true,
    model: {
      ...model,
      Sequences: [
        { Name: "Bad", Interval: [500, 100], NonLooping: false, MoveSpeed: 0 },
        { Name: "Stand", Interval: [100, 500], NonLooping: false, MoveSpeed: 0 },
      ],
    },
  });
  assert.deepEqual(entry.sequences.map((sequence) => sequence.name), ["Stand"]);
});

test("rejects unsupported models and invalid sequence ranges", () => {
  const base = {
    id: "bad",
    number: 1,
    group: "other-characters",
    label: "Bad",
    sourceFile: "Bad.mdx",
    modelFile: "models/01-Bad.mdx",
    modelUrl: "/tve4-model-demo/models/Bad.mdx",
    sha256: "abc",
    textureFiles: [],
  };
  assert.throws(() => buildManifestEntry({ ...base, model: { ...model, Version: 999 } }), /unsupported MDX version/);
  assert.throws(() => buildManifestEntry({ ...base, model: { ...model, Geosets: [] } }), /no geosets/);
  assert.throws(
    () =>
      buildManifestEntry({
        ...base,
        model: {
          ...model,
          Sequences: [{ Name: "Stand", Interval: [500, 100], NonLooping: false, MoveSpeed: 0 }],
        },
      }),
    /invalid interval/,
  );
});
