import assert from "node:assert/strict";
import test from "node:test";

import { runAutoActions, type AutoActionOptions } from "../../src/lib/tve4/auto-actions";
import type { SkillKey } from "../../src/lib/tve4/types";

test("runs house upgrade before wall upgrade and then auto skills", () => {
  const calls: string[] = [];
  const options: AutoActionOptions = {
    upgradeTent: true,
    upgradeWall: true,
    skills: ["haste", "blink"],
  };
  runAutoActions(options, {
    upgradeTent: () => { calls.push("tent"); return true; },
    tentNeedsWall: () => true,
    upgradeWall: () => { calls.push("wall"); return true; },
    castSkill: (key: SkillKey) => { calls.push(key); return true; },
  });
  assert.deepEqual(calls, ["tent", "wall", "haste", "blink"]);
});

test("keeps auto flags independent and does not run disabled actions", () => {
  const calls: string[] = [];
  runAutoActions(
    { upgradeTent: false, upgradeWall: true, skills: [] },
    {
      upgradeTent: () => { calls.push("tent"); return true; },
      tentNeedsWall: () => true,
      upgradeWall: () => { calls.push("wall"); return true; },
      castSkill: () => { calls.push("skill"); return true; },
    },
  );
  assert.deepEqual(calls, ["wall"]);
});

test("continues to later actions after an earlier action is unavailable", () => {
  const calls: string[] = [];
  const result = runAutoActions(
    { upgradeTent: true, upgradeWall: true, skills: ["berserk"] },
    {
      upgradeTent: () => { calls.push("tent"); return false; },
      tentNeedsWall: () => true,
      upgradeWall: () => { calls.push("wall"); return true; },
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
    { upgradeTent: true, upgradeWall: true, skills: [] },
    {
      upgradeTent: () => { calls.push("tent"); tentNeedsWall = false; return true; },
      tentNeedsWall: () => tentNeedsWall,
      upgradeWall: () => { calls.push("wall"); return true; },
      castSkill: () => true,
    },
  );
  assert.deepEqual(calls, ["tent"]);
  assert.deepEqual(result.upgrades, ["tent"]);
});
