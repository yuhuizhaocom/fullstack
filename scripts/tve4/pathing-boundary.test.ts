import assert from "node:assert/strict";
import test from "node:test";

import { buildPathingBoundarySegments } from "../../src/lib/tve4/render/pathing-boundary";

test("pathing boundary draws only edges between blocked and walkable cells", () => {
  const segments = buildPathingBoundarySegments(
    new Uint8Array([
      0, 0, 0,
      0, 0x02, 0,
      0, 0, 0,
    ]),
    3,
    3,
    32,
    [0, 0],
    [0, 0, 96, 96],
  );
  assert.deepEqual(segments, [
    { x1: 4, y1: 4, x2: 8, y2: 4 },
    { x1: 4, y1: 8, x2: 8, y2: 8 },
    { x1: 4, y1: 4, x2: 4, y2: 8 },
    { x1: 8, y1: 4, x2: 8, y2: 8 },
  ]);
});

test("real map boundaries stay inside runtime bounds and are non-empty", () => {
  const data = new Uint8Array(4 * 4);
  data[5] = 0x02;
  data[10] = 0x02;
  const segments = buildPathingBoundarySegments(data, 4, 4, 32, [-64, -32], [-64, -32, 64, 64]);
  assert.ok(segments.length >= 6);
  for (const segment of segments) {
    assert.ok(segment.x1 >= 0 && segment.x1 <= 16);
    assert.ok(segment.x2 >= 0 && segment.x2 <= 16);
    assert.ok(segment.y1 >= 0 && segment.y1 <= 12);
    assert.ok(segment.y2 >= 0 && segment.y2 <= 12);
  }
});