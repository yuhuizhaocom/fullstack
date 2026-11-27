import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

import rules from "../../data/tve4/mvp/rules.json";
import source from "../../data/tve4/mvp/source.json";
import rawLegacy from "../../data/game/game-rules.json";
import { MVP_RULES, ruleEvidence, ruleNumber, ruleNumbers } from "../../src/lib/tve4/data/mvp-rules";
import { BUILDINGS, HERO_STATS, REQUIREMENTS, SKILLS } from "../../src/lib/tve4/config";
import { BUILDING_RULES, EQUIPMENT_RULE, RULES } from "../../src/lib/tve4/rules";

const HEROES = ["elf", "troll"];
const BUILDING_KEYS = ["wall", "tower", "mine", "tent", "market", "reveal", "trollHouse"];
const SKILL_IDS: Record<string, string> = {
  blink: "A066", haste: "A067", entangle: "A068", silence: "A069",
  windwalk: "A061", berserk: "A06T", teleport: "A06W", farSight: "A062",
};
const SKILL_KEYS = ["blink", "haste", "entangle", "silence", "windwalk", "berserk", "teleport", "farSight"];
// Literal whitelist: adding/removing shop entries is a deliberate catalog change.
const ITEM_KEYS = "I0A9 I0AA I02N I02O I02A I02B I02C I02D I03K I03L I03M I01P I02P I02Q I02R I02S I02E I02F I02G I02H I01Q I01R I01S I01T I02T I02U I02V I02W I02I I02J I02K I02L I02X I02M I0A8 I040 I039 I03A I03B I03C I02Y I02Z I030 I031 I03P I03Q I03R I01V I03D I03E I03F I03G I032 I033 I034 I035 I03S I03T I03U I03V I03H I03I I03J I01W I036 I037 I038 I03N I0AB I0AC I0AD I0AE I0AF I0AG I023 I0AH I0AI I0AJ I0BU I027 I0AK".split(" ");
const SLK_NAMES = "AbilityBuffData AbilityData ItemData UnitAbilities UnitBalance UnitData UnitUI UnitWeapons UpgradeData".split(" ").map((name) => `${name}.slk`);
const SOURCE_ROOT = String.raw`C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted`;

function records() {
  return [...rules.heroes, ...rules.buildings, ...rules.skills, ...rules.items, ...rules.modeSingle];
}

test("catalog contains exactly the current 2 heroes, 7 buildings, 8 skills and 81 items", () => {
  assert.deepEqual(rules.heroes.map((r) => r.id), HEROES);
  assert.deepEqual(rules.buildings.map((r) => r.id).sort(), [...BUILDING_KEYS].sort());
  assert.deepEqual(rules.skills.map((r) => r.id), SKILL_KEYS);
  assert.deepEqual(rules.items.map((r) => r.id), ITEM_KEYS);
  assert.equal(new Set(records().map((r) => r.id)).size, records().length);
  assert.match(rules.catalogVersion, /^[a-f0-9]{64}$/);
  assert.equal(rules.primarySource, "data/tve4/mvp/source.json");
});

test("every numeric and boolean value has independently sourced per-value evidence", () => {
  for (const record of records()) {
    assert.ok(record.source.file, `${record.id}: primary source`);
    for (const [field, value] of Object.entries(record.values)) {
      if (typeof value !== "number" && typeof value !== "boolean") continue;
      const evidence = record.evidence?.[field];
      assert.ok(evidence, `${record.id}.${field}: missing evidence`);
      for (const item of Array.isArray(evidence) ? evidence : [evidence]) {
        assert.ok(item.file, `${record.id}.${field}: missing source file`);
        assert.ok(["VERIFIED", "INFERRED", "UNKNOWN"].includes(item.confidence), `${record.id}.${field}: confidence`);
        if (item.confidence === "VERIFIED") {
          assert.ok(item.objectId || item.jassLine !== undefined, `${record.id}.${field}: verification lacks a source locator`);
        }
      }
    }
  }
});

test("all nine default SLK manifests contain actual byte sizes and SHA-256", () => {
  for (const name of SLK_NAMES) {
    const manifest = source.coreFiles[name as keyof typeof source.coreFiles];
    const bytes = readFileSync(`${SOURCE_ROOT}/Units/${name}`);
    assert.equal(manifest.size, bytes.byteLength, `${name}: byte size`);
    assert.equal(manifest.sha256, createHash("sha256").update(bytes).digest("hex"), `${name}: SHA-256`);
    assert.equal(manifest.status, "VERIFIED", `${name}: status`);
    assert.equal(statSync(`${SOURCE_ROOT}/Units/${name}`).size, bytes.byteLength);
    assert.notEqual(manifest.size, "UNKNOWN");
    assert.notEqual(manifest.sha256, "UNKNOWN");
  }
});

test("skill IDs and source-default cooldowns are corrected without changing web fallbacks", () => {
  for (const [key, id] of Object.entries(SKILL_IDS)) {
    const record = rules.skills.find((r) => r.id === key)!;
    assert.equal(record.values.id, id);
    assert.equal(record.values.cooldown, key === "entangle" || key === "farSight" ? (key === "entangle" ? 3 : 25) : ({ blink: 25, haste: 30, silence: 60, windwalk: 30, berserk: 120, teleport: 45 } as Record<string, number>)[key]);
  }
  const originalCooldowns = { blink: 25, haste: 30, entangle: 45, silence: 60, windwalk: 30, berserk: 120, teleport: 45, farSight: 40 };
  for (const [key, cooldown] of Object.entries(originalCooldowns)) {
    const record = rules.skills.find((r) => r.id === key)!;
    assert.equal(record.values.originalCooldown, cooldown);
    assert.equal(Array.isArray(record.evidence?.originalCooldown) ? record.evidence.originalCooldown[0].confidence : record.evidence?.originalCooldown.confidence, "VERIFIED");
  }
  assert.equal(ruleEvidence("haste", "originalDuration").confidence, "VERIFIED");
  assert.equal(ruleEvidence("haste", "originalDuration").jassLine, 68965);
  assert.equal(ruleEvidence("haste", "originalDuration").file, "war3map.j");
  assert.equal(ruleEvidence("haste", "duration").confidence, "INFERRED");
  assert.equal(ruleEvidence("farSight", "cooldown").confidence, "INFERRED");
});

test("unknowns explicitly expose unsupported original effects and unproven conversions", () => {
  assert.ok(rules.unknowns.some((u) => u.id === "skill.farSight.cooldown"));
  assert.ok(rules.unknowns.some((u) => u.id === "skill.entangle.cooldown"));
  assert.ok(rules.unknowns.some((u) => u.id === "hero.elf.range"));
  assert.ok(rules.unknowns.some((u) => u.id === "item.I0A9.allStats"));
  assert.ok(rules.unknowns.some((u) => u.id === "building.tower.damage.7"));
  assert.ok(rules.unknowns.every((u) => typeof u.blocking === "boolean"));
  assert.ok(rules.unknowns.some((u) => u.blocking));
});

test("runtime rules preserve current hero, building, skill and shop values through MVP adapters", () => {
  assert.deepEqual(HERO_STATS, rawLegacy.heroes ? {
    elf: { hp: 10, damage: 7, interval: 2.2, range: 32, speed: 125, radius: 14 },
    troll: { hp: 750, damage: 7, interval: 1.5, range: 34, speed: 175, radius: 22 },
  } : {});
  assert.deepEqual(RULES.heroes, rawLegacy.heroes);
  for (const [key, value] of Object.entries(rawLegacy.buildings)) {
    assert.deepEqual(BUILDING_RULES[key as keyof typeof BUILDING_RULES], value, `MVP must preserve ${key}`);
  }
  assert.deepEqual(BUILDING_RULES.market, { gold: [64, 256, 1024], wood: [], hp: [50, 100, 200] });
  assert.deepEqual(EQUIPMENT_RULE.items, rawLegacy.equipmentShop.items);
  assert.deepEqual(SKILLS.elf.map((s) => s.cd), [25, 30, 3, 60]);
  assert.deepEqual(SKILLS.troll.map((s) => s.cd), [30, 120, 45, 25]);
  assert.equal(RULES.skills.berserk.id, "A06T");
  assert.equal(RULES.skills.teleport.id, "A06W");
  assert.equal(RULES.skills.berserk.attackSpeed, 1);
  assert.equal(RULES.skills.teleport.searchRange, 1600);
  assert.equal(rules.items.find((item) => item.id === "I02N")?.values["original.A00E.DataC1"], 3);
  assert.deepEqual(Object.keys(BUILDINGS), BUILDING_KEYS);
  assert.equal(BUILDINGS.wall.levels.length, 10);
  assert.equal(BUILDINGS.tower.levels.length, 8);
  assert.deepEqual(BUILDINGS.market.levels, [{ cost: 64, hp: 50 }, { cost: 256, hp: 100 }, { cost: 1024, hp: 200 }]);
  assert.deepEqual(REQUIREMENTS.tent?.map((entry) => [entry.level, entry.need.kind, entry.need.level]), [[2, "wall", 1], [3, "wall", 4], [4, "market", 1], [5, "wall", 1], [6, "market", 2], [7, "wall", 4], [8, "market", 2], [9, "market", 3], [10, "market", 3]]);
  assert.deepEqual(REQUIREMENTS.reveal, [{ level: 1, need: { kind: "market", level: 2 } }]);
  assert.equal(ruleNumber("troll", "speed"), 175);
  assert.deepEqual(ruleNumbers("tower", "range"), [96, 112, 128, 144, 160, 176, 192, 208]);
  assert.equal(MVP_RULES.items.length, 81);
});

test("extractor --check regenerates byte-identical deterministic output from original evidence", () => {
  const script = "tools/tve4_source/extract_core_rules.py";
  const expected = readFileSync("data/tve4/mvp/rules.json", "utf8");
  const actual = execFileSync("python", [script, "--check"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(actual, expected);
});
