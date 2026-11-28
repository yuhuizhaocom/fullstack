import assert from "node:assert/strict";
import test from "node:test";

import { runAutoActions, type AutoActionOptions } from "../../src/lib/tve4/auto-actions";
import type { SkillKey } from "../../src/lib/tve4/types";

test("runs house upgrade before wall upgrade and then auto skills", () => {
  const calls: string[] = [];
  const options: AutoActionOptions = {
    upgradeTent: true,
    upgradeWall: true,
    repair: false,
    skills: ["haste", "blink"],
  };
  runAutoActions(options, {
    upgradeTent: () => { calls.push("tent"); return true; },
    tentNeedsWall: () => true,
    upgradeWall: () => { calls.push("wall"); return true; },
    repair: () => false,
    castSkill: (key: SkillKey) => { calls.push(key); return true; },
  });
  assert.deepEqual(calls, ["tent", "wall", "haste", "blink"]);
});

test("keeps auto flags independent and does not run disabled actions", () => {
  const calls: string[] = [];
  runAutoActions(
    { upgradeTent: false, upgradeWall: true, repair: false, skills: [] },
    {
      upgradeTent: () => { calls.push("tent"); return true; },
      tentNeedsWall: () => true,
      upgradeWall: () => { calls.push("wall"); return true; },
      repair: () => "unavailable",
      castSkill: () => { calls.push("skill"); return true; },
    },
  );
  assert.deepEqual(calls, ["wall"]);
});

test("continues to later actions after an earlier action is unavailable", () => {
  const calls: string[] = [];
  const result = runAutoActions(
    { upgradeTent: true, upgradeWall: true, repair: false, skills: ["berserk"] },
    {
      upgradeTent: () => { calls.push("tent"); return false; },
      tentNeedsWall: () => true,
      upgradeWall: () => { calls.push("wall"); return true; },
      repair: () => "unavailable",
      castSkill: (key) => { calls.push(key); return true; },
    },
  );
  assert.deepEqual(calls, ["tent", "wall", "berserk"]);
  assert.deepEqual(result.upgrades, ["wall"]);
  assert.deepEqual(result.skills, ["berserk"]);
});

test("skips auto wall immediately after a house upgrade removes the wall dependency", () => {
  const calls: string[] = [];
  let tentNeedsWall = true;
  const result = runAutoActions(
    { upgradeTent: true, upgradeWall: true, repair: false, skills: [] },
    {
      upgradeTent: () => { calls.push("tent"); tentNeedsWall = false; return true; },
      tentNeedsWall: () => tentNeedsWall,
      upgradeWall: () => { calls.push("wall"); return true; },
      repair: () => "unavailable",
      castSkill: () => true,
    },
  );
  assert.deepEqual(calls, ["tent"]);
  assert.deepEqual(result.upgrades, ["tent"]);
});

test("checks house wall dependency even when only auto wall is enabled", () => {
  const calls: string[] = [];
  const result = runAutoActions(
    { upgradeTent: false, upgradeWall: true, repair: false, skills: [] },
    {
      upgradeTent: () => { calls.push("tent"); return true; },
      tentNeedsWall: () => false,
      upgradeWall: () => { calls.push("wall"); return true; },
      repair: () => "unavailable",
      castSkill: () => true,
    },
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(result.upgrades, []);
});

test("runs auto repair after upgrades and before auto skills", () => {
  const calls: string[] = [];
  const result = runAutoActions(
    { upgradeTent: false, upgradeWall: false, repair: true, skills: ["haste"] },
    {
      upgradeTent: () => false,
      tentNeedsWall: () => false,
      upgradeWall: () => false,
      repair: () => "started",
      castSkill: (key) => { calls.push(key); return true; },
    },
  );
  assert.deepEqual(calls, ["haste"]);
  assert.equal(result.repaired, true);
  assert.equal(result.repairStatus, "started");
});

test("distinguishes queued auto repair from a started repair", () => {
  const result = runAutoActions(
    { upgradeTent: false, upgradeWall: false, repair: true, skills: [] },
    {
      upgradeTent: () => false,
      tentNeedsWall: () => false,
      upgradeWall: () => false,
      repair: () => "queued",
      castSkill: () => false,
    },
  );
  assert.equal(result.repaired, false);
  assert.equal(result.repairStatus, "queued");
});
