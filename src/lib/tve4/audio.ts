import {
  initAudio,
  playSfx as playWorldSfx,
  startBgm as startWorldBgm,
  stopBgm as stopWorldBgm,
} from "../world/audio";

export type Tve4SfxKind =
  | "ui"
  | "build"
  | "upgrade"
  | "demolish"
  | "attack"
  | "hit"
  | "destroy"
  | "death"
  | "skill"
  | "error"
  | "heal"
  | "pickup";

export interface Tve4AudioSettings {
  music: boolean;
  sfx: boolean;
}

export const TVE4_AUDIO_STORAGE_KEY = "tve4-audio-settings-v1";

type WorldSfxKind = Parameters<typeof playWorldSfx>[0];
type AudioStorage = Pick<Storage, "getItem" | "setItem">;

const SFX_MAP: Record<Tve4SfxKind, WorldSfxKind> = {
  ui: "quest",
  build: "levelup",
  upgrade: "levelup",
  demolish: "death",
  attack: "attack",
  hit: "hurt",
  destroy: "kill",
  death: "death",
  skill: "skill",
  error: "hurt",
  heal: "heal",
  pickup: "pickup",
};

const DEFAULT_SETTINGS: Tve4AudioSettings = { music: true, sfx: true };

function browserStorage(): AudioStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function normalizeSettings(value: unknown): Tve4AudioSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
  const candidate = value as Record<string, unknown>;
  return {
    music: typeof candidate.music === "boolean" ? candidate.music : DEFAULT_SETTINGS.music,
    sfx: typeof candidate.sfx === "boolean" ? candidate.sfx : DEFAULT_SETTINGS.sfx,
  };
}

export function loadTve4AudioSettings(storage: AudioStorage | undefined = browserStorage()): Tve4AudioSettings {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    return normalizeSettings(JSON.parse(storage.getItem(TVE4_AUDIO_STORAGE_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveTve4AudioSettings(
  settings: Tve4AudioSettings,
  storage: AudioStorage | undefined = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(TVE4_AUDIO_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    // 存储不可用时不影响当前对局。
  }
}

export interface Tve4AudioDeps {
  init: () => unknown;
  startBgm: () => void;
  stopBgm: () => void;
  playSfx: (kind: WorldSfxKind) => void;
  storage?: AudioStorage;
}

export interface Tve4AudioController {
  unlock(): void;
  start(): void;
  stop(): void;
  play(kind: Tve4SfxKind): void;
  setSettings(settings: Tve4AudioSettings): void;
  getSettings(): Tve4AudioSettings;
}

export function createTve4Audio(
  deps: Tve4AudioDeps,
  initialSettings: Tve4AudioSettings = loadTve4AudioSettings(deps.storage),
): Tve4AudioController {
  let settings = normalizeSettings(initialSettings);
  let unlocked = false;
  let playing = false;

  const unlock = (): void => {
    if (unlocked) return;
    unlocked = true;
    deps.init();
  };
  const start = (): void => {
    unlock();
    if (!settings.music || playing) return;
    playing = true;
    deps.startBgm();
  };
  const stop = (): void => {
    if (!playing) return;
    playing = false;
    deps.stopBgm();
  };

  return {
    unlock,
    start,
    stop,
    play(kind) {
      if (!settings.sfx) return;
      deps.playSfx(SFX_MAP[kind]);
    },
    setSettings(next) {
      settings = normalizeSettings(next);
      saveTve4AudioSettings(settings, deps.storage);
      if (settings.music) start();
      else stop();
    },
    getSettings() {
      return { ...settings };
    },
  };
}

let controller: Tve4AudioController | null = null;

function getController(): Tve4AudioController {
  if (!controller) {
    controller = createTve4Audio({
      init: initAudio,
      startBgm: startWorldBgm,
      stopBgm: stopWorldBgm,
      playSfx: playWorldSfx,
      storage: browserStorage(),
    });
  }
  return controller;
}

export function unlockTve4Audio(): void {
  getController().unlock();
}

export function startTve4Bgm(): void {
  const audio = getController();
  audio.unlock();
  audio.start();
}

export function stopTve4Bgm(): void {
  getController().stop();
}

export function playTve4Sfx(kind: Tve4SfxKind): void {
  getController().play(kind);
}

export function setTve4AudioSettings(settings: Tve4AudioSettings): void {
  getController().setSettings(settings);
}

export function getTve4AudioSettings(): Tve4AudioSettings {
  return getController().getSettings();
}
