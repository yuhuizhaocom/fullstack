import assert from "node:assert/strict";
import test from "node:test";

import { buildCatalog, type ModelGroup } from "../../src/lib/tve4-model-demo/catalog";

test("numbers all models in stable six-group order", () => {
  const groups: Record<ModelGroup, string[]> = {
    troll: ["TrollA.mdx", "TrollB.mdx"],
    elf: ["ElfA.mdx"],
    "other-characters": ["OtherA.mdx"],
    buildings: ["BuildingA.mdx"],
    environment: ["RockA.mdx"],
    "effects-ui": ["EffectA.mdx", "PortraitA.mdx"],
  };
  const catalog = buildCatalog(groups);
  assert.deepEqual(catalog.map((item) => item.number), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(catalog.map((item) => item.id), ["m001", "m002", "m003", "m004", "m005", "m006", "m007", "m008"]);
  assert.equal(catalog[0].group, "troll");
  assert.equal(catalog[2].group, "elf");
  assert.equal(catalog[7].group, "effects-ui");
  assert.equal(catalog[0].label, "TrollA");
});

test("rejects duplicate model paths across groups", () => {
  const groups: Record<ModelGroup, string[]> = {
    troll: ["Same.mdx"],
    elf: ["Same.mdx"],
    "other-characters": [],
    buildings: [],
    environment: [],
    "effects-ui": [],
  };
  assert.throws(() => buildCatalog(groups), /duplicate model/);
});
