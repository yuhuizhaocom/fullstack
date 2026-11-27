import assert from "node:assert/strict";
import source from "../../data/tve4/mvp/source.json";

assert.equal(source.w3xSha256, "d8d3df747520529ee530a87754d568278f51378dfa30e419a64fe208165bb9d7");
for (const name of ["war3map.j", "war3map.wpm", "war3map.w3e", "war3map.doo", "war3map.w3i"]) {
  assert.ok(source.coreFiles[name]?.sha256, name);
}
