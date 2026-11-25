"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { updateAI } from "@/lib/hunter/ai";
import { BUILDINGS, ITEMS, PHASE_LABEL, TILE, UNITS, buildingCost } from "@/lib/hunter/config";
import {
  animalTotal,
  applyCommand,
  canPlace,
  createGame,
  deserializeGame,
  golemForOwner,
  hunterLives,
  isUnitVisibleTo,
  merchantNear,
  playerGold,
  playerHero,
  playerHunterSlot,
  playerUnit,
  serializeGame,
  stepGame,
} from "@/lib/hunter/engine";
import { terrainAtTile, tileCenter } from "@/lib/hunter/map";
import { createHunterStage, type HunterStage } from "@/lib/hunter/stage";
import { DEFAULT_SETTINGS } from "@/lib/hunter/types";
import type {
  BuildingKind,
  Difficulty,
  GameResult,
  GameState,
  HunterSettings,
  ItemKind,
  Mode,
  ResearchKind,
  Side,
  SideStats,
  SkillId,
  UnitKind,
} from "@/lib/hunter/types";
import { initAudio, playSfx, startBgm, stopBgm } from "@/lib/world/audio";

import { HunterHud, type GamePanel, type HudAction, type HudSnapshot } from "./hunter-hud";
import {
  BuildPanel,
  HirePanel,
  MenuScreen,
  PauseMenu,
  ResearchPanel,
  ResultPanel,
  SettingsPanel,
  ShopPanel,
  type HireOption,
  type SaveMeta,
} from "./hunter-panels";

const SETTINGS_KEY = "tf_hunter_settings_v1";
const SAVE_KEY = "tf_hunter_save_v1";
const SAVE_META_KEY = "tf_hunter_meta_v1";
const FIXED_STEP = 0.05;

type Ghost = { kind: BuildingKind; tx: number; ty: number };

const EMPTY_STATS: SideStats = { kills: 0, goldEarned: 0, goldSpent: 0, built: 0, hired: 0, lost: 0 };

const NO_CD: Record<SkillId, number> = { eye: 0, golemQ: 0, golemE: 0, golemW: 0 };

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
    const meta = JSON.parse(raw) as Partial<SaveMeta>;
    if (!meta || (meta.side !== "farmer" && meta.side !== "hunter")) return null;
    if (meta.mode !== "normal" && meta.mode !== "fast" && meta.mode !== "expert") return null;
    if (meta.difficulty !== "easy" && meta.difficulty !== "normal" && meta.difficulty !== "hard") return null;
    return {
      side: meta.side,
      mode: meta.mode,
      difficulty: meta.difficulty,
      elapsed: typeof meta.elapsed === "number" ? meta.elapsed : 0,
    };
  } catch {
    return null;
  }
}

function hireOptions(state: GameState): HireOption[] {
  if (state.side === "farmer") {
    const spec = UNITS.golem;
    const factory = state.buildings.some(
      (b) => b.side === "farmer" && b.kind === "golemFactory" && b.hp > 0
    );
    const own = golemForOwner(state, state.playerOwner);
    let reason = "";
    if (!factory) reason = "需要全队先建傀儡工厂（2000 金）";
    else if (own) reason = "你已经有主傀儡了";
    else if (playerGold(state) < spec.costGold) reason = "金币不足 1800";
    return [{ kind: "golem", ok: !reason, reason: reason || spec.desc }];
  }
  const spec = UNITS.mercenary;
  const slot = playerHunterSlot(state);
  const owned = state.units.filter(
    (u) => u.side === "hunter" && u.owner === state.playerOwner && u.kind === "mercenary" && !u.dead
  ).length;
  let reason = "";
  if ((slot?.kills ?? 0) < 1) reason = "先击杀一名农民，再回中间兵营";
  else if (owned >= 6) reason = "雇佣兵已达上限 6";
  else if (playerGold(state) < spec.costGold) reason = "金币不足 40";
  return [{ kind: "mercenary", ok: !reason, reason: reason || spec.desc }];
}

function hudFrom(state: GameState, speed: number): HudSnapshot {
  const unit = playerUnit(state);
  const side = state.side;
  const golem = golemForOwner(state, state.playerOwner);
  const hero = playerHero(state);
  const hunterSlot = playerHunterSlot(state);
  const skills: SkillId[] = [];
  if (unit && !unit.dead) {
    if (unit.kind === "hunterHero") skills.push("eye");
    else if (unit.kind === "golem") skills.push("golemQ", "golemE", "golemW");
  }
  return {
    side,
    mode: state.mode,
    time: state.time,
    remaining: Math.max(0, state.durationMin * 60 - state.time),
    phase: state.phase,
    gold: playerGold(state),
    animalTotal: animalTotal(state),
    hunterLives: hunterLives(state),
    unitName: unit ? UNITS[unit.kind].name : "—",
    unitKind: unit?.kind ?? (side === "hunter" ? "hunterHero" : "farmerHero"),
    unitHp: unit ? Math.max(0, unit.hp) : 0,
    unitMaxHp: unit?.maxHp ?? 1,
    unitDead: !unit || unit.dead,
    respawnIn:
      unit && unit.dead && Number.isFinite(unit.respawnAt)
        ? Math.max(0, unit.respawnAt - state.time)
        : 0,
    heroLives: side === "hunter" ? Math.max(0, hero?.livesLeft ?? 0) : 0,
    speed,
    skills,
    skillCd: unit ? { ...NO_CD, ...(state.cooldowns[unit.id] ?? {}) } : { ...NO_CD },
    canControlGolem: side === "farmer" && !!golem && !golem.dead,
    controllingGolem: unit?.kind === "golem",
    hireOptions: hireOptions(state),
    merchantNear: merchantNear(state),
    owned: {
      hammer: hunterSlot?.hammer ?? false,
      gloves: hunterSlot?.gloves ?? false,
      poison: hunterSlot?.poison ?? false,
    },
    stock: {
      horns: hunterSlot?.horns ?? 0,
      mines: hunterSlot?.mines ?? 0,
      potions: hunterSlot?.potions ?? 0,
    },
    research: { ...state.research[side] },
    hasLab: state.buildings.some((b) => b.side === "farmer" && b.kind === "researchLab" && b.hp > 0),
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

  for (const start of state.map.farmerStarts) {
    ctx.fillStyle = "rgba(163,230,53,0.55)";
    ctx.fillRect(start.x * sx - 1.5, start.y * sy - 1.5, 3, 3);
  }
  ctx.fillStyle = "rgba(248,113,113,0.9)";
  ctx.fillRect(state.map.hunterCamp.x * sx - 2, state.map.hunterCamp.y * sy - 2, 4, 4);
  ctx.fillStyle = "rgba(251,191,36,0.95)";
  ctx.fillRect(state.merchant.x * sx - 2, state.merchant.y * sy - 2, 4, 4);

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
  const control = playerUnit(state);
  if (control && !control.dead) {
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(control.x * sx, control.y * sy, 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function HunterGame() {
  const [screen, setScreen] = useState<"menu" | "playing">("menu");
  const [side, setSide] = useState<Side>("farmer");
  const [mode, setMode] = useState<Mode>("normal");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
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
        setMode(meta.mode);
        setDifficulty(meta.difficulty);
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
    uiRef.current = { paused, speed, placing, ghost, cast, demolish };
  }, [paused, speed, placing, ghost, cast, demolish]);

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

  const begin = useCallback((game: GameState) => {
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
    setMode(game.mode);
    setDifficulty(game.difficulty);
    setResult(null);
    setPaused(false);
    setSpeed(1);
    setPanel(null);
    setPlacing(null);
    setGhost(null);
    setCast(null);
    setDemolish(false);
    setSnapshot(hudFrom(game, 1));
    setScreen("playing");
  }, []);

  const startGame = useCallback(
    (opts?: { side?: Side; mode?: Mode; difficulty?: Difficulty }) => {
      initAudio();
      const game = createGame({
        side: opts?.side ?? side,
        mode: opts?.mode ?? mode,
        difficulty: opts?.difficulty ?? difficulty,
        seed: Math.floor(Math.random() * 1_000_000),
      });
      begin(game);
    },
    [begin, side, mode, difficulty]
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
          mode: state.mode,
          difficulty: state.difficulty,
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
          const unit = playerUnit(state);
          if (unit && !unit.dead && moveTimer.current >= 0.18) {
            moveTimer.current = 0;
            // 屏幕方向转世界方向（等距投影）
            const wx = vec.y + vec.x / 2;
            const wy = vec.y - vec.x / 2;
            const len = Math.hypot(wx, wy) || 1;
            applyCommand(state, { t: "move", x: unit.x + (wx / len) * 210, y: unit.y + (wy / len) * 210 });
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
          // 只播报战况，建造/购物/技能由玩家操作时单独提示，避免刷屏
          const relevant =
            event.kind === "death" ||
            event.kind === "kill" ||
            event.kind === "phase" ||
            event.kind === "win";
          if (!relevant) continue;
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
        valid =
          canPlace(state, state.side, g.kind, g.tx, g.ty) &&
          playerGold(state) >= buildingCost(g.kind, state.mode);
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
              mode: state.mode,
              difficulty: state.difficulty,
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
          setCast(null);
        } else {
          showToast("技能冷却中，或该技能不属于当前单位");
        }
        return;
      }

      if (placing) {
        setGhost({ kind: placing, tx: tile.tx, ty: tile.ty });
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
        if (building.side !== state.side || building.owner !== state.playerOwner) {
          showToast("只能拆除自己的建筑");
          return;
        }
        if (building.kind === "hunterBarracks") {
          showToast("中央兵营无法拆除");
          return;
        }
        const name = BUILDINGS[building.kind].name;
        if (applyCommand(state, { t: "sell", id: building.id })) {
          showToast(`出售了${name}`);
        }
        return;
      }

      const wall = state.buildings.find(
        (b) =>
          b.tx === tile.tx &&
          b.ty === tile.ty &&
          b.hp > 0 &&
          b.side === state.side &&
          b.owner === state.playerOwner &&
          b.kind === "magicWall"
      );
      if (wall) {
        applyCommand(state, { t: "toggleWall", id: wall.id });
        showToast(wall.open ? "魔法墙已关闭" : "魔法墙已打开");
        return;
      }

      // 农民点树即砍树开路（透明塔/魔法墙等仍走上面的建筑逻辑）
      if (state.side === "farmer" && terrainAtTile(state.map, tile.tx, tile.ty) === "tree") {
        if (applyCommand(state, { t: "chop", tx: tile.tx, ty: tile.ty })) {
          showToast("前往砍树");
        } else {
          showToast("够不到这棵树");
        }
        return;
      }

      applyCommand(state, { t: "move", x: center.x, y: center.y });
    },
    [screen, paused, cast, placing, demolish, showToast]
  );

  const handleAction = useCallback((action: HudAction) => {
    if (action === "control") {
      const state = gameRef.current;
      if (!state) return;
      const unit = playerUnit(state);
      const golem = golemForOwner(state, state.playerOwner);
      if (unit?.kind === "golem") {
        const hero = playerHero(state);
        if (hero) {
          applyCommand(state, { t: "control", unitId: hero.id });
          showToast("已切回英雄");
        }
      } else if (golem && !golem.dead) {
        applyCommand(state, { t: "control", unitId: golem.id });
        showToast("正在操控主傀儡");
      } else {
        showToast("还没有主傀儡：先建傀儡工厂并招募");
      }
      setPanel(null);
      setPlacing(null);
      setCast(null);
      setGhost(null);
      return;
    }
    setPanel((current) => (current === action ? null : action));
    setPlacing(null);
    setCast(null);
    setGhost(null);
    if (action !== "build") setDemolish(false);
  }, [showToast]);

  const pickBuilding = useCallback((kind: BuildingKind) => {
    setPlacing(kind);
    setPanel(null);
    setDemolish(false);
    setCast(null);
    setGhost(null);
  }, []);

  const confirmGhost = useCallback(() => {
    const state = gameRef.current;
    if (!state || !ghost) return;
    if (applyCommand(state, { t: "build", kind: ghost.kind, tx: ghost.tx, ty: ghost.ty })) {
      showToast(`建造了${BUILDINGS[ghost.kind].name}`);
      if (settingsRef.current.sound) playSfx("pickup");
      setGhost(null);
    } else {
      showToast("金币不足，或该位置不可建造");
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
      const option = hireOptions(state).find((item) => item.kind === kind);
      if (!option?.ok) {
        showToast(option?.reason ?? "条件未满足");
        return;
      }
      if (applyCommand(state, { t: "hire", unit: kind })) {
        showToast(`招募了${UNITS[kind].name}`);
        if (settingsRef.current.sound) playSfx("levelup");
      } else {
        showToast("金币不足，或条件未满足");
      }
    },
    [showToast]
  );

  const handleResearch = useCallback(
    (kind: ResearchKind) => {
      const state = gameRef.current;
      if (!state) return;
      if (applyCommand(state, { t: "research", kind })) {
        showToast("科技已升级");
        if (settingsRef.current.sound) playSfx("levelup");
      } else {
        showToast("金币不足，或需要研究所");
      }
    },
    [showToast]
  );

  const handleBuy = useCallback(
    (item: ItemKind) => {
      const state = gameRef.current;
      if (!state) return;
      if (!merchantNear(state)) {
        showToast("离商人太远：商人每 10 秒换位");
        return;
      }
      if (applyCommand(state, { t: "buy", item })) {
        showToast(`购买了${ITEMS[item].name}`);
        if (settingsRef.current.sound) playSfx("pickup");
      } else {
        showToast("金币不足，或已达上限");
      }
    },
    [showToast]
  );

  const handleUse = useCallback(
    (item: ItemKind) => {
      const state = gameRef.current;
      if (!state) return;
      if (applyCommand(state, { t: "use", item })) {
        showToast(`使用${ITEMS[item].name}`);
        if (settingsRef.current.sound) playSfx("heal");
      } else {
        showToast("没有库存，或英雄已阵亡");
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
          mode={mode}
          difficulty={difficulty}
          onSide={setSide}
          onMode={setMode}
          onDifficulty={setDifficulty}
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
          side={snapshot.side}
          snapshot={snapshot}
          settings={settings}
          panel={panel}
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
              side={snapshot.side}
              mode={snapshot.mode}
              gold={snapshot.gold}
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
          {panel === "research" && side === "farmer" ? (
            <ResearchPanel
              mode={snapshot.mode}
              gold={snapshot.gold}
              levels={snapshot.research}
              hasLab={snapshot.hasLab}
              onBuy={handleResearch}
              onClose={() => setPanel(null)}
            />
          ) : null}
          {panel === "shop" && side === "hunter" ? (
            <ShopPanel
              gold={snapshot.gold}
              mode={snapshot.mode}
              time={snapshot.time}
              canShop={snapshot.merchantNear}
              owned={snapshot.owned}
              stock={snapshot.stock}
              onBuy={handleBuy}
              onUse={handleUse}
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
          onReplay={() => startGame({ side, mode, difficulty })}
          onMenu={exitToMenu}
        />
      ) : null}
    </div>
  );
}
