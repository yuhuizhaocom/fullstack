import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { decodeBlpMipmaps } from "../../src/lib/tve4-model-demo/blp";
import { buildCatalog } from "../../src/lib/tve4-model-demo/catalog";

test("drops fractional or zero-sized BLP mipmaps before creating ImageData", () => {
  const groups = JSON.parse(readFileSync("scripts/tve4-model-demo/groups.json", "utf8"));
  const candidate = buildCatalog(groups).find((item) => item.source === "zsglvbu.mdx");
  assert.ok(candidate);
  const prefix = String(candidate.number).padStart(3, "0");
  const bytes = readFileSync(`public/tve4-model-demo/textures/${prefix}/zsglvbudaoguang.blp`);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const mips = decodeBlpMipmaps(buffer);
  assert.equal(mips.length, 6);
  for (const mip of mips) {
    assert.ok(Number.isInteger(mip.width) && mip.width > 0);
    assert.ok(Number.isInteger(mip.height) && mip.height > 0);
    assert.equal(mip.data.length, mip.width * mip.height * 4);
  }
});
