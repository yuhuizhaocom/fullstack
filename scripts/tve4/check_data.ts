// 数据自检：npx tsx scripts/tve4/check_data.ts
// 校验规则文件与 8 张原版地图数据没有被改坏，且关键 VERIFIED 数值未被单机缩放。
import assert from "node:assert/strict";

import { DEFAULT_MAP_ID, MAP_DEFINITIONS, MAP_ORDER } from "../../src/lib/tve4/maps.generated";
import { RULES } from "../../src/lib/tve4/rules";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

console.log("tve4 data checks");

check("规则文件版本与来源", () => {
  assert.equal(RULES.version, 4);
  assert.match(RULES.basedOn ?? "", /war3map\.j/i);
});

check("VERIFIED：巨魔出现时间与准备期", () => {
  assert.equal(RULES.trollAppear.withPrepare, 35);
  assert.equal(RULES.trollAppear.fixSurvive, 45);
});

check("VERIFIED：初始金币 OLD 30/70、MIDDLE 10/50", () => {
  assert.deepEqual(RULES.modeStartGold.OLD, { elf: 30, troll: 70 });
  assert.deepEqual(RULES.modeStartGold.MIDDLE, { elf: 10, troll: 50 });
});

check("VERIFIED：视野绝对时间 335/635（巨魔 35 秒出现后再 300 秒）", () => {
  assert.equal(RULES.vision.elfShareAtSeconds, RULES.trollAppear.withPrepare + 300);
  assert.equal(RULES.vision.exposeAtSeconds, RULES.trollAppear.withPrepare + 300 + 300);
});

check("VERIFIED：力量之书 990000 金 / +8000 力量，胜利阈值 16 万", () => {
  assert.equal(RULES.scenarios.troll.strengthWin, 160000);
  for (const book of RULES.scenarios.troll.strengthBooks) {
    assert.equal(book.gold, 990000);
    assert.equal(book.strength, 8000);
  }
});

check("VERIFIED：精灵魔法师 HP 5120000，终极塔 66 座", () => {
  assert.equal(RULES.scenarios.elf.archmage.hp, 5120000);
  assert.equal(RULES.scenarios.elf.ultimateTowerCount, 66);
});

check("VERIFIED：81 件原版商店物品与价格已导入", () => {
  assert.equal(RULES.equipmentShop.items.length, 81);
  const sword = RULES.equipmentShop.items.find((i) => i.key === "I02A");
  assert.equal(sword?.gold, 100);
  assert.equal(sword?.damage, 2);
  assert.equal(RULES.equipmentShop.items.find((i) => i.key === "I0A9")?.gold, 75);
});

check("原版 8 张地图齐全且元数据一致", () => {
  assert.equal(MAP_ORDER.length, 8);
  for (const id of MAP_ORDER) {
    const map = MAP_DEFINITIONS[id];
    assert.equal(map.id, id);
    assert.equal(map.grid[0] * map.grid[1] > 0, true);
    assert.equal(map.world[0], map.grid[0] * RULES.scale * 128);
    assert.equal(map.world[1], map.grid[1] * RULES.scale * 128);
    assert.equal(map.blockedBase64.length > 0, true);
    assert.equal(map.spawns.elf.gx >= 0 && map.spawns.elf.gx < map.grid[0], true);
    assert.equal(map.spawns.troll.gx >= 0 && map.spawns.troll.gx < map.grid[0], true);
    assert.ok(map.elfDistance > 0);
  }
  assert.ok(MAP_DEFINITIONS[DEFAULT_MAP_ID]);
});

console.log(`${passed} checks passed`);
