// MVP 地图自检：npx tsx scripts/tve4/check_maps.ts
// 校验 8 图元数据、JASS 锚点、W3E/DOO 几何和逐字节原始 WPM。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MvpMap {
  id: number;
  name: string;
  boundRect: Rect;
  checkRect: Rect;
  extraRects: Rect[];
  cameraBounds: Rect;
  minimap: string;
  anchors: Record<string, { unitId: string; x: number; y: number; facing?: number }>;
  pathing: { width: number; height: number; file: string; sha256: string };
  terrain: Array<{ x: number; y: number; tileId: number }>;
  doodads: Array<{ typeId: string; x: number; y: number; rotation: number }>;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MVP_DATA = path.join(ROOT, "data", "tve4", "mvp");
const WPM_SHA256 = "0ec395397888d611c1c9a1d4107f16e38482273c69ca3e8c169e3a1b0631e399";
const WPM_SIZE = 1_769_488;
const TILE_UNITS = 128;
const TERRAIN_WIDTH = 385;
const TERRAIN_HEIGHT = 289;
// W3I playable area is 372x276 cells with center (-5120, 256). W3E is
// centered on it; this map is not centered on world coordinate (0, 0).
const TERRAIN_ORIGIN_X = -29_760;
const TERRAIN_ORIGIN_Y = -18_240;
const MAP_5_EXTRA: Rect = { minX: -26_688, minY: -3_264, maxX: -16_448, maxY: 6_752 };

const rect = (minX: number, minY: number, maxX: number, maxY: number): Rect => ({
  minX, minY, maxX, maxY,
});

interface ExpectedMetadata {
  name: string;
  boundRect: Rect;
  checkRect: Rect;
  cameraBounds: Rect;
  minimap: string;
}

const EXPECTED_METADATA: ExpectedMetadata[] = [
  {
    name: "大型雪地",
    boundRect: rect(-15_744, -14_880, -736, -1_536),
    checkRect: rect(-9_280, -9_696, -6_816, -7_488),
    cameraBounds: rect(-17_664, -15_360, 1_280, -512),
    minimap: "miniMaps\\mapId0.blp",
  },
  {
    name: "大型草地",
    boundRect: rect(-736, -896, 15_392, 15_424),
    checkRect: rect(6_016, 5_440, 9_152, 7_648),
    cameraBounds: rect(-2_304, -3_072, 16_640, 15_872),
    minimap: "miniMaps\\mapId1.blp",
  },
  {
    name: "小型森林",
    boundRect: rect(0, -11_872, 10_144, -1_920),
    checkRect: rect(3_520, -6_848, 5_440, -5_184),
    cameraBounds: rect(-1_280, -11_776, 9_472, -1_024),
    minimap: "miniMaps\\mapId2.blp",
  },
  {
    name: "单挑地形",
    boundRect: rect(9_760, -15_008, 15_712, -7_296),
    checkRect: rect(14_080, -10_208, 14_848, -9_504),
    cameraBounds: rect(9_472, -14_848, 16_128, -7_168),
    minimap: "miniMaps\\mapId3.blp",
  },
  {
    name: "防守地形",
    boundRect: rect(-24_544, 7_104, -16_448, 15_456),
    checkRect: rect(-20_640, 10_848, -20_320, 11_168),
    cameraBounds: rect(-26_368, 5_120, -15_616, 15_872),
    minimap: "miniMaps\\mapId4.blp",
  },
  {
    name: "中型森林",
    boundRect: rect(-26_688, -14_624, -16_480, -4_320),
    checkRect: rect(-22_592, -10_976, -20_416, -8_480),
    cameraBounds: rect(-26_880, -14_848, -16_128, -3_456),
    minimap: "miniMaps\\mapId5.blp",
  },
  {
    name: "竞赛森林",
    boundRect: rect(-26_688, -14_720, -16_448, 6_752),
    checkRect: rect(-22_112, -4_256, -20_960, -3_616),
    cameraBounds: rect(-26_880, -15_360, -16_128, 7_680),
    minimap: "miniMaps\\mapId6.blp",
  },
  {
    name: "冰天雪地",
    boundRect: rect(-15_968, -768, -992, 15_552),
    checkRect: rect(-9_696, 5_184, -7_072, 7_424),
    cameraBounds: rect(-18_176, -4_608, 768, 14_336),
    minimap: "miniMaps\\mapId7.blp",
  },
];

type ExpectedAnchor = readonly [unitId: string, x: number, y: number, facing?: number];
const EXPECTED_ANCHORS: Record<number, Record<string, ExpectedAnchor>> = {
  0: {
    trollHouse: ["u03R", -8_064, -8_704, 270],
    stone0: ["u03O", -8_640, -9_280, 270],
    stone1: ["u03O", -7_488, -8_256, 270],
    angel: ["e00Z", -8_323.4, -2_099.4, 165.712],
    lifeTree: ["MODE_LIFE_TREE", -2_304, -14_080, 270],
    previewCenter: ["u03R", -8_064, -8_704, 270],
    chooseRole: ["e014", 3_586.1, -12_377, 254.748],
    chooseDieRole: ["e014", -699.3, -1_295, 181.445],
  },
  1: {
    trollHouse: ["u03R", 7_680, 6_400, 270],
    stone0: ["u03O", 7_104, 5_824, 270],
    stone1: ["u03O", 8_256, 6_976, 270],
    angel: ["e00Z", 10_106.9, -357, 71.029],
    lifeTree: ["MODE_LIFE_TREE", 3_968, 14_080, 270],
    previewCenter: ["u03R", 7_680, 6_400, 270],
    chooseRole: ["e014", 3_586.1, -12_377, 254.748],
    chooseDieRole: ["e014", -699.3, -1_295, 181.445],
  },
  2: {
    trollHouse: ["u03R", 4_480, -6_016, 270],
    stone0: ["u03O", 3_904, -6_464, 270],
    stone1: ["u03O", 5_056, -5_568, 270],
    angel: ["e00Z", 8_477.3, -10_503.2, 19.35],
    lifeTree: ["MODE_LIFE_TREE", 2_432, -10_496, 270],
    previewCenter: ["u03R", 4_480, -6_016, 270],
    chooseRole: ["e014", 3_586.1, -12_377, 254.748],
    chooseDieRole: ["e014", -699.3, -1_295, 181.445],
  },
  3: {
    trollHouse: ["u03R", 14_464, -9_856, 270],
    stone0: ["u03O", 14_016, -10_304, 270],
    stone1: ["u03O", 14_912, -9_408, 270],
    angel: ["e00Z", 10_541.8, -7_914.8, 165.712],
    lifeTree: ["u03P", 11_904, -14_336, 270],
    previewCenter: ["u03R", 14_464, -9_856, 270],
    chooseRole: ["e014", 3_713.6, -13_956.7, 271.162],
    chooseDieRole: ["e014", -699.3, -1_295, 181.445],
  },
  4: {
    trollHouse0: ["u03R", -17_408, 14_080, 270],
    trollHouse1: ["u03R", -17_408, 7_936, 270],
    trollHouse2: ["u03R", -23_552, 7_936, 270],
    trollHouse3: ["u03R", -23_552, 14_080, 270],
    banRoad0: ["u06L", -22_336, 11_008, 270],
    banRoad1: ["u06L", -20_480, 9_152, 270],
    banRoad2: ["u06L", -18_624, 11_008, 270],
    banRoad3: ["u06L", -20_480, 12_864, 270],
    elf0: ["e036", -20_860.7, 12_423, 52.497],
    elf1: ["e036", -20_103, 12_417.8, 127.424],
    elf2: ["e036", -19_067, 11_393.8, 323.007],
    elf3: ["e036", -19_071.3, 10_627.6, 39.293],
    elf4: ["e036", -20_108.9, 9_593.9, 231.514],
    elf5: ["e036", -20_874.2, 9_599.7, 310.39],
    elf6: ["e036", -21_893.7, 10_637, 138.697],
    elf7: ["e036", -21_894, 11_389.9, 217.256],
    previewCenter: ["n008", -20_480, 11_008, 270],
    chooseRole: ["e014", 3_586.1, -12_377, 254.748],
    chooseDieRole: ["e014", -25_592.9, 11_123.2, 0.505],
  },
  5: {
    trollHouse: ["u03R", -21_504, -9_728, 270],
    stone0: ["u03O", -22_080, -10_368, 270],
    stone1: ["u03O", -20_928, -9_088, 270],
    angel: ["e00Z", -21_507.5, -3_956.7, 188.509],
    lifeTree: ["MODE_LIFE_TREE", -24_576, -12_800, 270],
    previewCenter: ["u03R", -21_504, -9_728, 270],
    chooseRole: ["e014", 3_586.1, -12_377, 254.748],
    chooseDieRole: ["e014", -21_507.2, -3_981.3, 39.98],
  },
  6: {
    trollHouse0: ["u03R", -21_504, 1_664, 270],
    trollHouse1: ["u03R", -21_504, -9_728, 270],
    angel: ["e00Z", -21_507.5, -3_956.7, 188.509],
    previewCenter: ["u03R", -21_504, 1_664, 270],
    chooseRole: ["e014", 3_586.1, -12_377, 254.748],
    chooseDieRole: ["e014", -21_507.2, -3_981.3, 39.98],
  },
  7: {
    trollHouse: ["u03R", -8_320, 6_272, 270],
    stone0: ["u03O", -8_896, 5_696, 270],
    stone1: ["u03O", -7_744, 6_848, 270],
    angel: ["e00Z", -6_909.7, 550.5, 10.635],
    lifeTree: ["MODE_LIFE_TREE", -8_832, 640, 270],
    previewCenter: ["u03R", -8_320, 6_272, 270],
    chooseRole: ["e014", 3_586.1, -12_377, 254.748],
    chooseDieRole: ["e014", -699.3, -1_295, 181.445],
  },
};

const EXPECTED_TERRAIN_COUNTS = [12_390, 16_256, 6_320, 2_928, 4_224, 12_800, 13_520, 15_104];
const EXPECTED_DOODAD_COUNTS = [913, 1_339, 337, 188, 160, 600, 600, 746];
const maps = JSON.parse(readFileSync(path.join(MVP_DATA, "maps.json"), "utf8")) as MvpMap[];
const source = JSON.parse(readFileSync(path.join(MVP_DATA, "source.json"), "utf8")) as {
  coreFiles: Record<string, { sha256: string; size: number; status: string }>;
};
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const inside = (x: number, y: number, area: Rect) =>
  area.minX <= x && x <= area.maxX && area.minY <= y && y <= area.maxY;
const intersects = (x: number, y: number, area: Rect) =>
  x < area.maxX && x + TILE_UNITS > area.minX
  && y < area.maxY && y + TILE_UNITS > area.minY;

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

console.log("tve4 MVP map checks");

check("8 张地图 ID、名称、区域、相机与小地图路径", () => {
  assert.ok(Array.isArray(maps));
  assert.equal(maps.length, 8);
  assert.deepEqual(maps.map((map) => map.id), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const map of maps) {
    const expected = EXPECTED_METADATA[map.id];
    assert.equal(map.name, expected.name);
    assert.deepEqual(map.boundRect, expected.boundRect);
    assert.deepEqual(map.checkRect, expected.checkRect);
    assert.deepEqual(map.cameraBounds, expected.cameraBounds);
    assert.equal(map.minimap, expected.minimap);
  }
});

check("地图 5 官方扩展区与区间外天使锚点", () => {
  assert.deepEqual(maps[5].extraRects, [MAP_5_EXTRA]);
  for (const id of [0, 1, 2, 3, 4, 6, 7]) assert.deepEqual(maps[id].extraRects, []);
  const angel = maps[5].anchors.angel;
  assert.ok(angel.y > maps[5].boundRect.maxY);
  assert.ok(angel.y < MAP_5_EXTRA.minY);
});

check("全部 JASS 锚点对象、单位 ID、坐标与朝向", () => {
  for (const map of maps) {
    const expected = EXPECTED_ANCHORS[map.id];
    assert.deepEqual(Object.keys(map.anchors).sort(), Object.keys(expected).sort());
    for (const [key, [unitId, x, y, facing]] of Object.entries(expected)) {
      const anchor = map.anchors[key];
      assert.equal(anchor.unitId, unitId, `map ${map.id} ${key} unitId`);
      assert.equal(anchor.x, x, `map ${map.id} ${key} x`);
      assert.equal(anchor.y, y, `map ${map.id} ${key} y`);
      if (facing !== undefined) assert.equal(anchor.facing, facing, `map ${map.id} ${key} facing`);
    }
  }
  assert.equal(maps[0].anchors.trollHouse.x, -8_064);
  assert.equal(maps[0].anchors.trollHouse.y, -8_704);
  assert.equal(maps[0].anchors.angel.x, -8_323.4);
  assert.equal(maps[0].anchors.angel.y, -2_099.4);
});

check("8 份 WPM 头部、尺寸、元数据哈希与 Task 1 基准", () => {
  const baseline = source.coreFiles["war3map.wpm"];
  assert.equal(baseline.status, "VERIFIED");
  assert.equal(baseline.sha256, WPM_SHA256);
  assert.equal(baseline.size, WPM_SIZE);
  for (const map of maps) {
    assert.deepEqual(map.pathing, {
      width: 1_536,
      height: 1_152,
      file: `pathing/map-${map.id}.bin`,
      sha256: WPM_SHA256,
    });
    const raw = readFileSync(path.join(MVP_DATA, map.pathing.file));
    assert.equal(raw.length, WPM_SIZE);
    assert.equal(raw.subarray(0, 4).toString("ascii"), "MP3W");
    assert.equal(raw.readUInt32LE(4), 0);
    assert.equal(raw.readUInt32LE(8), 1_536);
    assert.equal(raw.readUInt32LE(12), 1_152);
    assert.equal(sha256(raw), map.pathing.sha256);
  }
});

check("本地提取源存在时逐字节比对 WPM", () => {
  const extracted = process.env.TVE4_EXTRACTED_DIR
    ?? "C:\\Users\\肥胖的粽子\\AppData\\Local\\Temp\\tve_w3x\\extracted";
  const sourceWpm = path.join(extracted, "war3map.wpm");
  if (!existsSync(sourceWpm)) {
    console.log("    note: extracted source unavailable; Task 1 hash identity checked instead");
    return;
  }
  const original = readFileSync(sourceWpm);
  assert.equal(sha256(original), WPM_SHA256);
  for (const map of maps) {
    assert.deepEqual(readFileSync(path.join(MVP_DATA, map.pathing.file)), original, `map ${map.id}`);
  }
});

check("W3E 地表坐标对齐、裁剪完整性、数量与 tile ID", () => {
  for (const map of maps) {
    assert.equal(map.terrain.length, EXPECTED_TERRAIN_COUNTS[map.id]);
    const areas = [map.boundRect, ...map.extraRects];
    for (const tile of map.terrain) {
      assert.ok(Number.isInteger(tile.x) && Number.isInteger(tile.y));
      assert.equal((tile.x - TERRAIN_ORIGIN_X) % TILE_UNITS, 0);
      assert.equal((tile.y - TERRAIN_ORIGIN_Y) % TILE_UNITS, 0);
      const tx = (tile.x - TERRAIN_ORIGIN_X) / TILE_UNITS;
      const ty = (tile.y - TERRAIN_ORIGIN_Y) / TILE_UNITS;
      assert.ok(tx >= 0 && tx < TERRAIN_WIDTH && ty >= 0 && ty < TERRAIN_HEIGHT);
      assert.ok(Number.isInteger(tile.tileId) && tile.tileId >= 0 && tile.tileId <= 255);
      assert.ok(areas.some((area) => intersects(tile.x, tile.y, area)));
    }
    for (const area of areas) {
      assert.ok(map.terrain.some((tile) => tile.x <= area.minX && tile.x + TILE_UNITS > area.minX));
      assert.ok(map.terrain.some((tile) => tile.x < area.maxX && tile.x + TILE_UNITS >= area.maxX));
      assert.ok(map.terrain.some((tile) => tile.y <= area.minY && tile.y + TILE_UNITS > area.minY));
      assert.ok(map.terrain.some((tile) => tile.y < area.maxY && tile.y + TILE_UNITS >= area.maxY));
    }
  }
});

check("DOO 装饰坐标、区域归属、数量与首条来源值", () => {
  assert.equal(maps[4].doodads[0].typeId, "WTst");
  assert.equal(maps[4].doodads[0].x, -19_776);
  assert.equal(maps[4].doodads[0].y, 11_840);
  assert.equal(maps[4].doodads[0].rotation, 4.7123894691467285);
  for (const map of maps) {
    assert.equal(map.doodads.length, EXPECTED_DOODAD_COUNTS[map.id]);
    const areas = [map.boundRect, ...map.extraRects];
    for (const doodad of map.doodads) {
      assert.match(doodad.typeId, /^[A-Za-z0-9_]{4}$/);
      assert.ok(Number.isFinite(doodad.x) && Number.isFinite(doodad.y));
      assert.ok(Number.isFinite(doodad.rotation));
      assert.ok(areas.some((area) => inside(doodad.x, doodad.y, area)));
    }
  }
});

console.log(`${passed} checks passed`);
