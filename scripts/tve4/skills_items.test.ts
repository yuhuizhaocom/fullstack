import assert from "node:assert/strict";
import test from "node:test";

import { HERO_STATS, SKILLS, TILE } from "../../src/lib/tve4/config";
import { buyEquipment, castSkill, createGame, stepGame } from "../../src/lib/tve4/engine";
import { itemIcon, SKILL_ICONS } from "../../src/lib/tve4/render/icons";
import { EQUIPMENT_RULE, MVP_RULES } from "../../src/lib/tve4/rules";
import type { Building, Faction, GameState } from "../../src/lib/tve4/types";

const FIXED = 1 / 30;

function fresh(faction: Faction = "elf"): GameState {
  const state = createGame({ mapId: 0, seed: 21, testMode: true, playerFaction: faction });
  state.blocked.fill(0);
  state.session.pathing32.fill(0);
  // Isolate skill/equipment behavior from incidental combat deaths.
  for (const hero of state.heroes) {
    hero.hp = 100_000;
    hero.maxHp = 100_000;
    hero.damage = 0;
  }
  return state;
}

function run(state: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / FIXED); i += 1) stepGame(state, FIXED, { mx: 0, my: 0 });
}

function trollOf(state: GameState) {
  const troll = state.heroes.find((h) => h.faction === "troll")!;
  return troll;
}

function placeTroll(state: GameState, x: number, y: number) {
  const troll = trollOf(state);
  troll.x = x;
  troll.y = y;
  troll.invuln = 0;
  return troll;
}

function elfWallNearTroll(state: GameState): Building {
  const troll = trollOf(state);
  const gx0 = Math.floor((troll.x + 20) / TILE);
  const gy0 = Math.floor((troll.y + 20) / TILE);
  const wall: Building = {
    id: state.nextId++, kind: "wall", faction: "elf",
    x: (gx0 + 0.5) * TILE, y: (gy0 + 0.5) * TILE,
    gx0, gy0, size: 1, level: 1, hp: 100_000, maxHp: 100_000,
    alive: true, buildTimer: 0, demolishTimer: 0, eyeMarked: 0,
    noHitTimer: 0, flash: 0, cd: 0,
  };
  state.buildings.push(wall);
  return wall;
}

test("all eight skills are mapped to the corrected MVP object IDs", () => {
  const expected: Record<string, string> = {
    blink: "A066", haste: "A067", entangle: "A068", silence: "A069",
    windwalk: "A061", berserk: "A06T", teleport: "A06W", farSight: "A062",
  };
  for (const record of MVP_RULES.skills) assert.equal(record.values.id, expected[record.id]);
  assert.deepEqual(SKILLS.elf.map((s) => s.key), ["blink", "haste", "entangle", "silence"]);
  assert.deepEqual(SKILLS.troll.map((s) => s.key), ["windwalk", "berserk", "teleport", "farSight"]);
  for (const spec of [...SKILLS.elf, ...SKILLS.troll]) {
    assert.ok(spec.manaCost > 0, `${spec.key}: mana cost`);
    assert.ok(spec.duration > 0, `${spec.key}: duration`);
  }
  assert.equal(Object.keys(SKILL_ICONS).length, 8);
});

test("each skill consumes its MVP mana cost and starts its cooldown", () => {
  const fixtures: Array<{ key: Parameters<typeof castSkill>[1]; faction: Faction; aim?: { x: number; y: number } }> = [
    { key: "blink", faction: "elf" },
    { key: "haste", faction: "elf" },
    { key: "entangle", faction: "elf" },
    { key: "silence", faction: "elf" },
    { key: "windwalk", faction: "troll" },
    { key: "berserk", faction: "troll" },
    { key: "teleport", faction: "troll" },
    { key: "farSight", faction: "troll" },
  ];
  for (const fixture of fixtures) {
    const state = fresh(fixture.faction);
    const hero = state.heroes.find((h) => h.isPlayer)!;
    let aim = fixture.aim;
    if (fixture.key === "entangle" || fixture.key === "silence") {
      const troll = placeTroll(state, hero.x + 30, hero.y);
      aim = { x: troll.x, y: troll.y };
    }
    if (fixture.key === "farSight") {
      const wall = elfWallNearTroll(state);
      aim = { x: wall.x, y: wall.y };
    }
    const spec = SKILLS[fixture.faction].find((entry) => entry.key === fixture.key)!;
    const before = hero.mana;
    assert.equal(castSkill(state, fixture.key, aim), true, `${fixture.key}: legal cast`);
    assert.equal(hero.mana, before - spec.manaCost, `${fixture.key}: mana cost`);
    assert.ok(hero.cooldowns[fixture.key] > 0, `${fixture.key}: cooldown`);
    assert.equal(castSkill(state, fixture.key, aim), false, `${fixture.key}: cooldown blocks recast`);
    assert.equal(hero.mana, before - spec.manaCost, `${fixture.key}: failed cast costs no mana`);
  }
});

test("elf skills apply legal casts, mana costs, cooldowns, target rules and expiry", () => {
  const blink = fresh();
  const elf = blink.heroes.find((h) => h.isPlayer)!;
  const start = { x: elf.x, y: elf.y };
  assert.equal(castSkill(blink, "blink", { x: elf.x + 200, y: elf.y }), true);
  assert.ok(Math.hypot(elf.x - start.x, elf.y - start.y) > 40);
  assert.equal(elf.cooldowns.blink, 25);
  assert.equal(elf.mana, HERO_STATS.elf.mana - 20);
  const afterMana = elf.mana;
  assert.equal(castSkill(blink, "blink", { x: elf.x + 200, y: elf.y }), false);
  assert.equal(elf.mana, afterMana);

  const haste = fresh();
  const hasted = haste.heroes.find((h) => h.isPlayer)!;
  assert.equal(castSkill(haste, "haste"), true);
  assert.equal(hasted.buffs.haste, 15);
  run(haste, 15.1);
  assert.equal(hasted.buffs.haste, 0);

  const root = fresh();
  const rooted = root.heroes.find((h) => h.isPlayer)!;
  const near = placeTroll(root, rooted.x + 40, rooted.y);
  assert.equal(castSkill(root, "entangle", { x: near.x, y: near.y }), true);
  assert.equal(near.buffs.root, 3);
  run(root, 3.1);
  assert.equal(near.buffs.root, 0);

  const silence = fresh();
  const silencer = silence.heroes.find((h) => h.isPlayer)!;
  const target = placeTroll(silence, silencer.x + 100, silencer.y);
  assert.equal(castSkill(silence, "silence", { x: target.x, y: target.y }), false);
  assert.equal(target.buffs.silence, 0);
  placeTroll(silence, silencer.x + 70, silencer.y);
  assert.equal(castSkill(silence, "silence", { x: target.x, y: target.y }), true);
  assert.equal(target.buffs.silence, 5);
  run(silence, 5.1);
  assert.equal(target.buffs.silence, 0);

  const poor = fresh();
  const poorElf = poor.heroes.find((h) => h.isPlayer)!;
  poorElf.mana = 0;
  assert.equal(castSkill(poor, "haste"), false);
  assert.match(poor.hint?.text ?? "", /法力不足/);
});

test("troll skills apply legal casts, channeling, mana and expiry", () => {
  const walk = fresh("troll");
  const walker = walk.heroes.find((h) => h.isPlayer)!;
  assert.equal(castSkill(walk, "windwalk"), true);
  assert.equal(walker.buffs.windwalk, 20);
  assert.equal(walker.mana, HERO_STATS.troll.mana - 10);
  run(walk, 20.1);
  assert.equal(walker.buffs.windwalk, 0);

  const berserk = fresh("troll");
  const raging = berserk.heroes.find((h) => h.isPlayer)!;
  assert.equal(castSkill(berserk, "berserk"), true);
  assert.equal(raging.buffs.berserk, 10);
  run(berserk, 10.1);
  assert.equal(raging.buffs.berserk, 0);

  const teleport = fresh("troll");
  const caster = teleport.heroes.find((h) => h.isPlayer)!;
  const spawn = teleport.session.trollBase;
  caster.x += TILE * 4;
  assert.equal(castSkill(teleport, "teleport"), true);
  assert.equal(caster.channelTime, 2);
  run(teleport, 2.1);
  assert.equal(caster.channelTime, 0);
  assert.equal(caster.x, (spawn.gx + 0.5) * TILE);
  assert.ok(caster.invuln > 0);

  const sight = fresh("troll");
  const seer = sight.heroes.find((h) => h.isPlayer)!;
  assert.equal(castSkill(sight, "farSight", { x: seer.x + 1000, y: seer.y }), false);
  assert.equal(seer.mana, HERO_STATS.troll.mana);
  const wall = elfWallNearTroll(sight);
  assert.equal(castSkill(sight, "farSight", { x: wall.x, y: wall.y }), true);
  assert.equal(wall.eyeMarked, 15);
  run(sight, 15.1);
  assert.equal(wall.eyeMarked, 0);
  const expectedMana = Math.min(HERO_STATS.troll.mana, HERO_STATS.troll.mana - 60 + HERO_STATS.troll.manaRegen * 15.1);
  assert.ok(Math.abs(seer.mana - expectedMana) < 1e-6);
});

test("mana regenerates from the source hero values", () => {
  const state = fresh();
  const hero = state.heroes.find((h) => h.isPlayer)!;
  hero.mana = 10;
  run(state, 2);
  assert.ok(Math.abs(hero.mana - (10 + HERO_STATS.elf.manaRegen * 2)) < 1e-6);
});

test("all 81 equipment items are purchasable and supported stat effects apply", () => {
  assert.equal(EQUIPMENT_RULE.items.length, 81);
  const state = fresh("troll");
  const troll = trollOf(state);
  const spawn = state.session.spawns.troll!;
  troll.x = (spawn.gx + 0.5) * TILE;
  troll.y = (spawn.gy + 0.5) * TILE;
  troll.gold = 1_000_000_000;
  troll.wood = 1_000_000_000;
  for (const item of EQUIPMENT_RULE.items) {
    assert.equal(buyEquipment(state, item.key), true, `purchase ${item.key}`);
  }
  assert.equal(troll.items.length, 81);
  assert.deepEqual([...troll.items].sort(), EQUIPMENT_RULE.items.map((item) => item.key).sort());
});

test("all-stats, strength, agility, damage, armor and speed effects are applied", () => {
  const samples = ["I0A9", "I0AA", "I02A", "I02O", "I03K"];
  const state = fresh("troll");
  const troll = trollOf(state);
  const spawn = state.session.spawns.troll!;
  troll.x = (spawn.gx + 0.5) * TILE;
  troll.y = (spawn.gy + 0.5) * TILE;
  troll.gold = 1_000_000;
  troll.wood = 1_000_000;
  const before = { maxHp: troll.maxHp, damage: troll.damage, speed: troll.speed };
  for (const key of samples) {
    const item = EQUIPMENT_RULE.items.find((entry) => entry.key === key);
    assert.ok(item, `sample item ${key}`);
    assert.equal(buyEquipment(state, key), true, `purchase ${key}`);
  }
  assert.ok(troll.maxHp > before.maxHp);
  assert.ok(troll.damage > before.damage);
  assert.ok(troll.speed > before.speed);
});

test("temporary icons are deterministic and never reference original assets", () => {
  assert.equal(itemIcon("I0A9").glyph, itemIcon("I0A9").glyph);
  assert.deepEqual(itemIcon("I0A9"), itemIcon("I0A9"));
  for (const icon of Object.values(SKILL_ICONS)) {
    assert.ok(icon.glyph.length > 0);
    assert.match(icon.color, /^#[0-9a-f]{6}$/i);
    assert.match(icon.background, /^#[0-9a-f]{6}$/i);
  }
});