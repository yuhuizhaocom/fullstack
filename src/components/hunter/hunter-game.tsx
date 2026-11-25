"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { updateAI } from "@/lib/hunter/ai";
import { BUILDINGS, ITEMS, PHASE_LABEL, TILE, UNITS, UPGRADES, phaseAllows } from "@/lib/hunter/config";
import {
  applyCommand,
  buyItem,
  buyUpgrade,
  canPlace,
  createGame,
  deserializeGame,
  isUnitVisibleTo,
  playerHero,
  popCap,
  serializeGame,
  stepGame,
  useItem,
} from "@/lib/hunter/engine";
import { tileCenter } from "@/lib/hunter/map";
import { createHunterStage, type HunterStage } from "@/lib/hunter/stage";
import { DEFAULT_SETTINGS } from "@/lib/hunter/types";
import type {
  BuildingKind,
  Difficulty,
  DurationMin,
  GameResult,
  GameState,
  HunterSettings,
  ItemKind,
  Side,
  SideStats,
  SkillId,
  Stance,
  UnitKind,
  UpgradeKind,
} from "@/lib/hunter/types";
import { initAudio, playSfx, startBgm, stopBgm } from "@/lib/world/audio";

import { HunterHud, type GamePanel, type HudAction, type HudSnapshot } from "./hunter-hud";
import {
  BuildPanel,
  HirePanel,
  MenuScreen,
  PauseMenu,
  ResultPanel,
  SettingsPanel,
  ShopPanel,
  StancePanel,
  type HireOption,
  type SaveMeta,
} from "./hunter-panels";

const SETTINGS_KEY = "tf_hunter_settings_v1";
const SAVE_KEY = "tf_hunter_save_v1";
const SAVE_META_KEY = "tf_hunter_meta_v1";
const FIXED_STEP = 0.05;

type Ghost = { kind: BuildingKind; tx: number; ty: number };

const EMPTY_STATS: SideStats = { kills: 0, goldEarned: 0, goldSpent: 0, built: 0, hired: 0, lost: 0 };

const FARMER_HIRES: UnitKind[] = ["lumberjack", "militia", "archer", "golem"];
const HUNTER_HIRES: UnitKind[] = ["shadowScout", "trollSlinger", "frostShaman"];

function loadSettings(): HunterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<HunterSettings>) };
  } catch {
    // 本地存档损坏时退回默认设置
  }
  return DEFAULT_SETTINGS;
}

function loadMeta(): SaveMeta | null {
  try {
    const raw = localStorage.getItem(SAVE_META_KEY);
    if (!raw || !localStorage.getItem(SAVE_KEY)) return null;
    return JSON.parse(raw) as SaveMeta;
  } catch {
    return null;
  }
}

function hireOptions(state: GameState): HireOption[] {
  const side = state.side;
  const list = side === "farmer" ? FARMER_HIRES : HUNTER_HIRES;
  const hasTavern =
    side !== "farmer" ||
    state.buildings.some((b) => b.side === "farmer" && b.kind === "tavern" && b.hp > 0);
  return list.map((kind) => {
    const spec = UNITS[kind];
    let reason = "";
    if (!phaseAllows(spec.unlock, state.phase)) reason = "本阶段尚未解锁";
    else if (state.gold[side] < spec.costGold || state.wood[side] < spec.costWood) reason = "金币 / 木材不足";
    else if (spec.pop > 0 && state.popUsed[side] + spec.pop > popCap(state, side)) reason = "人口已满";
    else if (!hasTavern && (kind === "militia" || kind === "archer" || kind === "golem")) reason = "需要先建酒馆";
    return { kind, ok: !reason, reason: reason || spec.desc };
  });
}

function hudFrom(state: GameState, speed: number): HudSnapshot {
  const side = state.side;
  const hero = playerHero(state);
  const army = state.units.find((u) => u.side === side && !u.isHero && !u.dead && u.speed > 0);
  return {
    time: state.time,
    remaining: Math.max(0, state.durationMin * 60 - state.time),
    phase: state.phase,
    gold: Math.floor(state.gold[side]),
    wood: Math.floor(state.wood[side]),
    popUsed: state.popUsed[side],
    popCap: popCap(state, side),
    heroHp: hero ? Math.max(0, hero.hp) : 0,
    heroMaxHp: hero?.maxHp ?? 1,
    heroDead: !hero || hero.dead,
    respawnIn: hero && hero.dead ? Math.max(0, hero.respawnAt - state.time) : 0,
    heroLives: side === "hunter" ? Math.max(0, hero?.livesLeft ?? 0) : 0,
    speed,
    skillCd: { ...state.skillCd[side] },
    stance: army?.stance ?? "follow",
    stock: { ...state.stock[side] },
    upgrades: { ...state.upgrades[side] },
    hireOptions: hireOptions(state),
  };
}

function paintMinimap(canvas: HTMLCanvasElement, state: GameState): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width;
  const sx = size / (state.map.w * TILE);
  const sy = size / (state.map.h * TILE);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(6,18,12,0.92)";
  ctx.fillRect(0, 0, size, size);

  for (const building of state.buildings) {
    if (building.hp <= 0) continue;
    const visible =
      building.side === state.side ||
      state.vision[state.side][building.ty * state.map.w + building.tx] === 2;
    if (!visible) continue;
    ctx.fillStyle = building.side === state.side ? "rgba(74,222,128,0.95)" : "rgba(248,113,113,0.95)";
    ctx.fillRect(building.x * sx - 1.5, building.y * sy - 1.5, 3, 3);
  }
  for (const unit of state.units) {
    if (unit.dead) continue;
    if (!(unit.side === state.side || isUnitVisibleTo(state, unit, state.side))) continue;
    ctx.fillStyle = unit.side === state.side ? "rgba(187,247,208,0.85)" : "rgba(252,165,165,0.85)";
    ctx.fillRect(unit.x * sx - 1, unit.y * sy - 1, 2, 2);
  }
  const hero = playerHero(state);
  if (hero && !hero.dead) {
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hero.x * sx, hero.y * sy, 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(251,191,36,0.9)";
  ctx.fillRect(state.map.farmerCamp.x * sx - 2, state.map.farmerCamp.y * sy - 2, 4, 4);
  ctx.fillStyle = "rgba(248,113,113,0.9)";
  ctx.fillRect(state.map.hunterCamp.x * sx - 2, state.map.hunterCamp.y * sy - 2, 4, 4);
}

export function HunterGame() {
  const [screen, setScreen] = useState<"menu" | "playing">("menu");
  const [side, setSide] = useState<Side>("farmer");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [durationMin, setDurationMin] = useState<DurationMin>(40);
  const [settings, setSettings] = useState<HunterSettings>(DEFAULT_SETTINGS);
  const [save, setSave] = useState<SaveMeta | null>(null);
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  const [panel, setPanel] = useState<GamePanel>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [placing, setPlacing] = useState<BuildingKind | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [ghostValid, setGhostValid] = useState(false);
  const [cast, setCast] = useState<SkillId | null>(null);
  const [demolish, setDemolish] = useState(false);
  const [rallyMode, setRallyMode] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [portrait, setPortrait] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const stageRef = useRef<HunterStage | null>(null);
  const settingsRef = useRef(settings);
  const joystickRef = useRef({ x: 0, y: 0 });
  const moveTimer = useRef(0);
  const lastTime = useRef(0);
  const acc = useRef(0);
  const hudAcc = useRef(0);
  const saveAcc = useRef(0);
  const lastEvent = useRef(0);
  const lastPhase = useRef<string>("hide");
  const resultShown = useRef(false);
  const ghostValidRef = useRef(false);
  const toastTimer = useRef(0);
  const uiRef = useRef({
    paused: false,
    speed: 1,
    placing: null as BuildingKind | null,
    ghost: null as Ghost | null,
    cast: null as SkillId | null,
    demolish: false,
    rally: false,
  });

  const showToast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToast({ id, text });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    setSettings(loadSettings());
    setSave(loadMeta());
    try {
      const raw = localStorage.getItem(SAVE_META_KEY);
      if (raw) {
        const meta = JSON.parse(raw) as SaveMeta;
        setSide(meta.side);
        setDifficulty(meta.difficulty);
        setDurationMin(meta.durationMin);
      }
    } catch {
      // 读取失败忽略
    }
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // 隐私模式下不可写，忽略
    }
  }, [settings]);

  useEffect(() => {
    uiRef.current = { paused, speed, placing, ghost, cast, demolish, rally: rallyMode };
  }, [paused, speed, placing, ghost, cast, demolish, rallyMode]);

  useEffect(() => {
    stageRef.current?.setZoom(settings.zoom);
  }, [settings.zoom]);

  useEffect(() => {
    if (screen === "playing" && settings.music) startBgm();
    else stopBgm();
    return () => stopBgm();
  }, [screen, settings.music]);

  useEffect(() => {
    if (screen !== "playing") {
      setPortrait(false);
      return;
    }
    const check = () => setPortrait(window.innerWidth < window.innerHeight * 0.9);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [screen]);

  const begin = useCallback(
    (game: GameState) => {
      gameRef.current = game;
      resultShown.current = false;
      lastEvent.current = 0;
      lastPhase.current = game.phase;
      lastTime.current = 0;
      acc.current = 0;
      hudAcc.current = 0;
      saveAcc.current = 0;
      ghostValidRef.current = false;
      joystickRef.current = { x: 0, y: 0 };
      setSide(game.side);
      setDifficulty(game.difficulty);
      setDurationMin(game.durationMin);
      setResult(null);
      setPaused(false);
      setSpeed(1);
      setPanel(null);
      setPlacing(null);
      setGhost(null);
      setCast(null);
      setDemolish(false);
      setRallyMode(false);
      setSnapshot(hudFrom(game, 1));
      setScreen("playing");
    },
    []
  );

  const startGame = useCallback(
    (opts?: { side?: Side; difficulty?: Difficulty; durationMin?: DurationMin }) => {
      initAudio();
      const nextSide = opts?.side ?? side;
      const game = createGame({
        side: nextSide,
        difficulty: opts?.difficulty ?? difficulty,
        durationMin: opts?.durationMin ?? durationMin,
        seed: Math.floor(Math.random() * 1_000_000),
      });
      begin(game);
    },
    [begin, side, difficulty, durationMin]
  );

  const continueGame = useCallback(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const game = deserializeGame(raw);
      if (!game) return;
      initAudio();
      begin(game);
    } catch {
      showToast("存档读取失败");
    }
  }, [begin, showToast]);

  const exitToMenu = useCallback(() => {
    const state = gameRef.current;
    if (state && !state.result) {
      try {
        localStorage.setItem(SAVE_KEY, serializeGame(state));
        const meta: SaveMeta = {
          side: state.side,
          difficulty: state.difficulty,
          durationMin: state.durationMin,
          elapsed: state.time,
        };
        localStorage.setItem(SAVE_META_KEY, JSON.stringify(meta));
        setSave(meta);
      } catch {
        // 存档失败不影响返回
      }
    }
    gameRef.current = null;
    setScreen("menu");
    setSnapshot(null);
    setPanel(null);
    setPaused(false);
    setResult(null);
    setGhost(null);
    setPlacing(null);
    setCast(null);
    setDemolish(false);
    setRallyMode(false);
    stopBgm();
  }, []);

  /* ------------------------------- 主循环 ------------------------------- */
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    let stage: HunterStage | null = null;

    const onResize = () => stage?.resize(window.innerWidth, window.innerHeight);

    const frame = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const state = gameRef.current;
      const view = stageRef.current;
      if (!state || !view) return;

      const last = lastTime.current > 0 ? lastTime.current : now;
      const realDt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      lastTime.current = now;
      const ui = uiRef.current;

      if (!ui.paused && !state.result) {
        const vec = joystickRef.current;
        if (Math.hypot(vec.x, vec.y) > 0.15) {
          moveTimer.current += realDt;
          const hero = playerHero(state);
          if (hero && !hero.dead && moveTimer.current >= 0.18) {
            moveTimer.current = 0;
            // 屏幕方向转世界方向（等距投影）
            const wx = vec.y + vec.x / 2;
            const wy = vec.y - vec.x / 2;
            const len = Math.hypot(wx, wy) || 1;
            applyCommand(state, { t: "move", x: hero.x + (wx / len) * 210, y: hero.y + (wy / len) * 210 });
          }
        } else {
          moveTimer.current = 0;
        }

        acc.current += realDt * ui.speed;
        let steps = 0;
        while (acc.current >= FIXED_STEP && steps < 16) {
          stepGame(state, FIXED_STEP);
          updateAI(state, FIXED_STEP);
          acc.current -= FIXED_STEP;
          steps += 1;
        }
        if (steps >= 16) acc.current = 0;

        for (const event of state.events) {
          if (event.id <= lastEvent.current) continue;
          lastEvent.current = event.id;
          if (!event.text) continue;
          showToast(event.text);
          if (settingsRef.current.sound) {
            if (event.kind === "death") playSfx("death");
            else if (event.kind === "skill") playSfx("skill");
            else if (event.kind === "build") playSfx("pickup");
            else if (event.kind === "hire") playSfx("levelup");
            else if (event.kind === "phase") playSfx("levelup");
            else if (event.kind === "item") playSfx("heal");
            else if (event.kind === "win") playSfx("quest");
          }
        }

        if (state.phase !== lastPhase.current) {
          lastPhase.current = state.phase;
          if (state.phase !== "over") {
            setBanner(PHASE_LABEL[state.phase]);
            window.setTimeout(() => setBanner(null), 2400);
          }
        }

        if (state.result && !resultShown.current) {
          resultShown.current = true;
          setResult(state.result);
          setSave(null);
          setPanel(null);
          try {
            localStorage.removeItem(SAVE_KEY);
            localStorage.removeItem(SAVE_META_KEY);
          } catch {
            // 忽略
          }
        }
      }

      const g = ui.ghost;
      let valid = false;
      if (g) {
        const spec = BUILDINGS[g.kind];
        valid =
          canPlace(state, state.side, g.kind, g.tx, g.ty) &&
          state.gold[state.side] >= spec.costGold &&
          state.wood[state.side] >= spec.costWood;
        if (valid !== ghostValidRef.current) {
          ghostValidRef.current = valid;
          setGhostValid(valid);
        }
      } else if (ghostValidRef.current) {
        ghostValidRef.current = false;
        setGhostValid(false);
      }
      view.render(state, g ? { kind: g.kind, tx: g.tx, ty: g.ty, valid } : null);

      hudAcc.current += realDt;
      if (hudAcc.current >= 0.12) {
        hudAcc.current = 0;
        setSnapshot(hudFrom(state, ui.speed));
        if (minimapRef.current) paintMinimap(minimapRef.current, state);
      }

      saveAcc.current += realDt;
      if (saveAcc.current >= 6 && !state.result) {
        saveAcc.current = 0;
        try {
          localStorage.setItem(SAVE_KEY, serializeGame(state));
          localStorage.setItem(
            SAVE_META_KEY,
            JSON.stringify({
              side: state.side,
              difficulty: state.difficulty,
              durationMin: state.durationMin,
              elapsed: state.time,
            })
          );
        } catch {
          // 存档失败时继续游戏
        }
      }
    };

    const boot = async () => {
      try {
        stage = await createHunterStage(canvas, {
          width: window.innerWidth,
          height: window.innerHeight,
          isTouch: typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
        });
      } catch {
        return;
      }
      if (disposed) {
        stage.destroy();
        return;
      }
      stageRef.current = stage;
      stage.setZoom(settingsRef.current.zoom);
      window.addEventListener("resize", onResize);
      const state = gameRef.current;
      if (state) {
        stage.render(state, null);
        if (minimapRef.current) paintMinimap(minimapRef.current, state);
      }
      raf = requestAnimationFrame(frame);
    };
    void boot();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      const current = stageRef.current;
      stageRef.current = null;
      if (current) {
        try {
          current.destroy();
        } catch {
          // Pixi 销毁失败不阻塞
        }
      }
      lastTime.current = 0;
    };
  }, [screen, showToast]);

  /* ------------------------------ 交互处理 ------------------------------ */
  const handleMapPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (screen !== "playing" || paused) return;
      const state = gameRef.current;
      const view = stageRef.current;
      if (!state || !view || state.result) return;
      const tile = view.screenToTile(event.clientX, event.clientY);
      if (!tile) return;
      const center = tileCenter(tile.tx, tile.ty);

      if (cast) {
        if (applyCommand(state, { t: "skill", skill: cast, x: center.x, y: center.y })) {
          if (settingsRef.current.sound) playSfx("skill");
          showToast(`施放${cast === "eye" ? "鹰眼" : cast === "slam" ? "裂地" : "哨兵"}`);
          setCast(null);
        } else {
          showToast("技能冷却中");
        }
        return;
      }

      if (placing) {
        setGhost({ kind: placing, tx: tile.tx, ty: tile.ty });
        return;
      }

      if (rallyMode) {
        applyCommand(state, { t: "rally", x: center.x, y: center.y });
        showToast("集结点已设置");
        setRallyMode(false);
        return;
      }

      if (demolish) {
        const building = state.buildings.find(
          (b) => b.tx === tile.tx && b.ty === tile.ty && b.hp > 0
        );
        if (!building) {
          showToast("这里没有建筑");
          return;
        }
        if (building.side !== state.side) {
          showToast("只能拆除自己的建筑");
          return;
        }
        const name = BUILDINGS[building.kind].name;
        if (applyCommand(state, { t: "sell", id: building.id })) {
          showToast(`出售了${name}`);
        }
        return;
      }

      applyCommand(state, { t: "move", x: center.x, y: center.y });
    },
    [screen, paused, cast, placing, rallyMode, demolish, showToast]
  );

  const handleAction = useCallback(
    (action: HudAction) => {
      if (action === "rally") {
        setRallyMode((value) => !value);
        setPanel(null);
        setPlacing(null);
        setCast(null);
        return;
      }
      setPanel((current) => (current === action ? null : action));
      setPlacing(null);
      setCast(null);
      setGhost(null);
      setRallyMode(false);
      if (action !== "build") setDemolish(false);
    },
    []
  );

  const pickBuilding = useCallback(
    (kind: BuildingKind) => {
      setPlacing(kind);
      setPanel(null);
      setDemolish(false);
      setCast(null);
      setGhost(null);
    },
    []
  );

  const confirmGhost = useCallback(() => {
    const state = gameRef.current;
    if (!state || !ghost) return;
    if (applyCommand(state, { t: "build", kind: ghost.kind, tx: ghost.tx, ty: ghost.ty })) {
      showToast(`建造了${BUILDINGS[ghost.kind].name}`);
      if (settingsRef.current.sound) playSfx("pickup");
      setGhost(null);
    } else {
      showToast("资源不足，或该位置不可建造");
    }
  }, [ghost, showToast]);

  const cancelGhost = useCallback(() => {
    setGhost(null);
    setPlacing(null);
  }, []);

  const handleHire = useCallback(
    (kind: UnitKind) => {
      const state = gameRef.current;
      if (!state) return;
      if (applyCommand(state, { t: "hire", unit: kind })) {
        showToast(`招募了${UNITS[kind].name}`);
        if (settingsRef.current.sound) playSfx("levelup");
      } else {
        showToast("资源不足，或条件未满足");
      }
    },
    [showToast]
  );

  const handleStance = useCallback(
    (stance: Stance) => {
      const state = gameRef.current;
      if (!state) return;
      applyCommand(state, { t: "stance", stance });
      showToast(
        stance === "follow" ? "部队跟随英雄" : stance === "guard" ? "部队守卫集结点" : "部队主动进攻"
      );
      setPanel(null);
    },
    [showToast]
  );

  const handleBuy = useCallback(
    (item: ItemKind) => {
      const state = gameRef.current;
      if (!state) return;
      if (buyItem(state, state.side, item)) {
        showToast(`购买${ITEMS[item].name}`);
        if (settingsRef.current.sound) playSfx("pickup");
      } else {
        showToast("金币不足，或库存已满");
      }
    },
    [showToast]
  );

  const handleUse = useCallback(
    (item: ItemKind) => {
      const state = gameRef.current;
      if (!state) return;
      if (useItem(state, state.side, item)) {
        showToast(`使用${ITEMS[item].name}`);
        if (settingsRef.current.sound) playSfx("heal");
      } else {
        showToast("没有库存，或英雄已阵亡");
      }
    },
    [showToast]
  );

  const handleUpgrade = useCallback(
    (kind: UpgradeKind) => {
      const state = gameRef.current;
      if (!state) return;
      if (buyUpgrade(state, state.side, kind)) {
        showToast(`${UPGRADES[kind].name}已解锁`);
      } else {
        showToast("金币不足，或已经解锁");
      }
    },
    [showToast]
  );

  const minimapJump = useCallback((nx: number, ny: number) => {
    const state = gameRef.current;
    const view = stageRef.current;
    if (!state || !view) return;
    const x = Math.min(state.map.w * TILE - 1, Math.max(0, nx * state.map.w * TILE));
    const y = Math.min(state.map.h * TILE - 1, Math.max(0, ny * state.map.h * TILE));
    view.focusAt(x, y);
  }, []);

  const togglePause = useCallback(() => {
    joystickRef.current = { x: 0, y: 0 };
    setPaused(true);
    setPanel(null);
  }, []);

  const stats = useMemo<SideStats>(() => {
    const state = gameRef.current;
    if (!state) return EMPTY_STATS;
    return state.stats[state.side] ?? EMPTY_STATS;
  }, [snapshot, result]);

  /* -------------------------------- 渲染 -------------------------------- */
  if (screen === "menu") {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-[#070f0a]">
        <a
          href="/"
          className="fixed left-3 top-3 z-10 rounded-lg border border-amber-900/60 bg-black/60 px-3 py-1.5 text-xs text-amber-200"
        >
          ← 返回
        </a>
        <MenuScreen
          side={side}
          difficulty={difficulty}
          durationMin={durationMin}
          onSide={setSide}
          onDifficulty={setDifficulty}
          onDuration={setDurationMin}
          onStart={() => startGame()}
          save={save}
          onContinue={continueGame}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-[#070f0a] text-amber-50">
      <div className="absolute inset-0 touch-none" onPointerDown={handleMapPointer}>
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      {snapshot ? (
        <HunterHud
          side={side}
          snapshot={snapshot}
          settings={settings}
          panel={panel}
          rallyMode={rallyMode}
          ghost={ghost ? { kind: ghost.kind, valid: ghostValid } : null}
          cast={cast}
          toast={toast}
          banner={banner}
          minimapRef={minimapRef}
          onPause={togglePause}
          onSpeed={() => setSpeed((value) => (value === 1 ? 2 : 1))}
          onSkill={(skill) => {
            setCast(skill);
            setPlacing(null);
            setGhost(null);
            setPanel(null);
            setRallyMode(false);
          }}
          onAction={handleAction}
          onJoystick={(x, y) => {
            joystickRef.current = { x, y };
          }}
          onMinimap={minimapJump}
          onConfirmGhost={confirmGhost}
          onCancelGhost={cancelGhost}
          onCancelCast={() => setCast(null)}
        />
      ) : null}

      {portrait && !paused && !result ? (
        <div className="pointer-events-auto absolute bottom-[calc(max(env(safe-area-inset-bottom),14px)+150px)] left-1/2 z-30 -translate-x-1/2 rounded-full border border-amber-800/60 bg-black/70 px-3 py-1 text-[10px] text-amber-200/80">
          建议横屏游玩
          <button onClick={() => setPortrait(false)} className="ml-2 text-amber-400">
            ×
          </button>
        </div>
      ) : null}

      {panel && snapshot && !paused && !result ? (
        <div
          className="absolute left-1/2 z-30 w-[min(94vw,460px)] -translate-x-1/2"
          style={{ bottom: "calc(max(env(safe-area-inset-bottom), 14px) + 150px)" }}
        >
          {panel === "build" ? (
            <BuildPanel
              side={side}
              phase={snapshot.phase}
              gold={snapshot.gold}
              wood={snapshot.wood}
              demolish={demolish}
              onPick={pickBuilding}
              onToggleDemolish={() => {
                setDemolish((value) => !value);
                setPlacing(null);
                setGhost(null);
                showToast(demolish ? "已退出拆除模式" : "拆除模式：点击自己的建筑出售");
              }}
              onClose={() => {
                setPanel(null);
                setDemolish(false);
              }}
            />
          ) : null}
          {panel === "hire" ? (
            <HirePanel
              side={side}
              options={snapshot.hireOptions}
              onHire={handleHire}
              onClose={() => setPanel(null)}
            />
          ) : null}
          {panel === "shop" && side === "hunter" ? (
            <ShopPanel
              gold={snapshot.gold}
              stock={snapshot.stock}
              upgrades={snapshot.upgrades}
              onBuy={handleBuy}
              onUse={handleUse}
              onUpgrade={handleUpgrade}
              onClose={() => setPanel(null)}
            />
          ) : null}
          {panel === "stance" ? (
            <StancePanel
              stance={snapshot.stance}
              onStance={handleStance}
              onClose={() => setPanel(null)}
            />
          ) : null}
        </div>
      ) : null}

      {paused && !result ? (
        <>
          <PauseMenu
            onResume={() => setPaused(false)}
            onSettings={() => setPanel("settings")}
            onExit={exitToMenu}
          />
          {panel === "settings" ? (
            <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-5">
              <div className="w-full max-w-sm">
                <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setPanel(null)} />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {result ? (
        <ResultPanel
          result={result}
          side={side}
          stats={stats}
          onReplay={() => startGame({ side, difficulty, durationMin })}
          onMenu={exitToMenu}
        />
      ) : null}
    </div>
  );
}
