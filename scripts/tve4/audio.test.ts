import assert from "node:assert/strict";
import test from "node:test";

import {
  createTve4Audio,
  loadTve4AudioSettings,
  saveTve4AudioSettings,
  TVE4_AUDIO_STORAGE_KEY,
  type Tve4AudioSettings,
} from "../../src/lib/tve4/audio";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test("audio settings default to music and sfx enabled without stored values", () => {
  assert.deepEqual(loadTve4AudioSettings(memoryStorage()), { music: true, sfx: true });
});

test("audio settings ignore malformed or partial stored values", () => {
  assert.deepEqual(loadTve4AudioSettings(memoryStorage({ [TVE4_AUDIO_STORAGE_KEY]: "{bad" })), { music: true, sfx: true });
  assert.deepEqual(loadTve4AudioSettings(memoryStorage({ [TVE4_AUDIO_STORAGE_KEY]: JSON.stringify({ music: false, sfx: "yes" }) })), { music: false, sfx: true });
});

test("audio settings round-trip through storage", () => {
  const storage = memoryStorage();
  const settings: Tve4AudioSettings = { music: false, sfx: true };
  saveTve4AudioSettings(settings, storage);
  assert.deepEqual(loadTve4AudioSettings(storage), settings);
});

test("audio controller unlocks once and starts bgm only when requested", () => {
  const calls: string[] = [];
  const audio = createTve4Audio({
    init: () => calls.push("init"),
    startBgm: () => calls.push("start"),
    stopBgm: () => calls.push("stop"),
    playSfx: (kind) => calls.push(`sfx:${kind}`),
    storage: memoryStorage(),
  });
  audio.unlock();
  audio.unlock();
  assert.deepEqual(calls, ["init"]);
  audio.start();
  audio.start();
  assert.deepEqual(calls, ["init", "start"]);
});

test("audio controller maps TVE4 events and respects the sfx switch", () => {
  const calls: string[] = [];
  const audio = createTve4Audio({
    init: () => calls.push("init"),
    startBgm: () => calls.push("start"),
    stopBgm: () => calls.push("stop"),
    playSfx: (kind) => calls.push(`sfx:${kind}`),
    storage: memoryStorage(),
  });
  audio.unlock();
  audio.play("ui");
  audio.play("build");
  audio.play("attack");
  audio.play("hit");
  audio.play("destroy");
  audio.play("death");
  audio.play("skill");
  assert.deepEqual(calls, ["init", "sfx:quest", "sfx:levelup", "sfx:attack", "sfx:hurt", "sfx:kill", "sfx:death", "sfx:skill"]);

  audio.setSettings({ music: true, sfx: false });
  const count = calls.length;
  audio.play("build");
  assert.equal(calls.length, count);
});

test("audio controller persists settings and starts or stops bgm on changes", () => {
  const calls: string[] = [];
  const storage = memoryStorage();
  const audio = createTve4Audio({
    init: () => calls.push("init"),
    startBgm: () => calls.push("start"),
    stopBgm: () => calls.push("stop"),
    playSfx: () => {},
    storage,
  });
  audio.unlock();
  audio.start();
  audio.setSettings({ music: false, sfx: true });
  assert.equal(calls.at(-1), "stop");
  assert.deepEqual(loadTve4AudioSettings(storage), { music: false, sfx: true });

  audio.setSettings({ music: true, sfx: true });
  assert.equal(calls.at(-1), "start");
  audio.stop();
  assert.equal(calls.at(-1), "stop");
});
