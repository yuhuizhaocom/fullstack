"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { TveHud, TveMenu, TveResult, type HudSelected, type HudSnapshot } from "./tve-hud";
import { drawGame, drawMinimap, screenToWorld, type RenderView } from "@/lib/tve/render";
import { loadTveAssets, type TveAssets } from "@/lib/tve/assets";
import { BUILD_SPECS, GAME_MODES, TILE, WOOD_PACK } from "@/lib/tve/config";
import {
  buyScroll,
  buyRecallScroll,
  useRecallScroll,
  buyShopItem,
  buyWood,
  canBuildAt,
  castElfSkill,
  castTrollSkill,
  convertBuilding,
  createGame,
  demolishBuilding,
  elfTentLevel,
  elfWallLevel,
  sellWood,
  setAutoRepair,
  stepGame,
  toggleRepairBuilding,
  tryBuildForElf,
  tryUpgradeBuilding,
} from "@/lib/tve/engine";
import { initAudio, playSfx, startBgm, stopBgm } from "@/lib/world/audio";
import type {
  BuildingKind,
  Difficulty,
  ElfSkill,
  Faction,
  GameMode,
  GameState,
  ShopKey,
  TrollRule,
  TrollSkill,
} from "@/lib/tve/types";

const EMPTY_ASSETS: TveAssets = {
  terrain: { grass: null, dirt: null },
  sprites: {},
  loaded: 0,
  total: 0,
};

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

// 选中/建造状态放在模块级 ref，供 makeSnapshot 读取，避免把 UI 状态耦合进引擎
const selectedBuildingRef: { current: number | null } = { current: null };
const selectedPlacingRef: { current: BuildingKind | null } = { current: null };

function heroOf(state: GameState): { x: number; y: number } | null {
  if (state.faction === "elf") {
    const elf = state.elves[state.playerElf];
    return elf ? { x: elf.x, y: elf.y } : null;
  }
  const troll = state.trolls[state.playerTroll];
  return troll ? { x: troll.x, y: troll.y } : null;
}

function makeSnapshot(state: GameState, paused: boolean, muted: boolean): HudSnapshot {
  const elf = state.playerElf >= 0 ? state.elves[state.playerElf] : null;
  const troll = state.playerTroll >= 0 ? state.trolls[state.playerTroll] : null;
  const selectedBuilding = selectedBuildingOf(state);
  const selected: HudSelected | null = selectedBuilding
    ? (() => {
        const spec = BUILD_SPECS[selectedBuilding.kind];
        const next = selectedBuilding.level < spec.levels.length ? spec.levels[selectedBuilding.level] : null;
        return {
          id: selectedBuilding.id,
          kind: selectedBuilding.kind,
          level: selectedBuilding.level,
          maxLevel: spec.levels.length,
          hp: selectedBuilding.hp,
          maxHp: selectedBuilding.maxHp,
          upgradeGold: next ? next.cost : null,
          upgradeWood: next ? next.wood : 0,
          repairing: selectedBuilding.repairing,
          canRepair: selectedBuilding.hp < selectedBuilding.maxHp,
          constructProgress:
            selectedBuilding.buildTime > 0
              ? 1 - selectedBuilding.buildTimer / selectedBuilding.buildTime
              : 1,
          requireTentLevel: next?.requireTentLevel ?? null,
          requireWallLevel: next?.requireWallLevel ?? null,
          tentLevel: elf ? elfTentLevel(state, elf.id) : 0,
          wallLevel: elf ? elfWallLevel(state, elf.id) : 0,
          canBranch:
            (selectedBuilding.kind === "wall" || selectedBuilding.kind === "arrow") && selectedBuilding.level >= 4,
        };
      })()
    : null;

  let hutLevel = 0;
  let hutUpgradeGold: number | null = null;
  if (troll && troll.hutId >= 0) {
    const hut = state.buildings.find((b) => b.id === troll.hutId && b.alive);
    if (hut) {
      hutLevel = hut.level;
      const levels = BUILD_SPECS.hut.levels;
      hutUpgradeGold = hut.level < levels.length ? levels[hut.level].cost : null;
    }
  }

  let towerBonus = 0;
  if (state.playerElf >= 0) {
    for (const b of state.buildings) {
      if (!b.alive || b.team !== "elf" || b.owner !== state.playerElf || b.kind !== "lab") continue;
      towerBonus += BUILD_SPECS.lab.levels[b.level - 1].towerBonus ?? 0;
    }
  }

  // 每秒收入：精灵为已完成帐篷/金矿之和，巨魔为小屋被动收入
  let income = 0;
  if (elf) {
    for (const b of state.buildings) {
      if (!b.alive || b.team !== "elf" || b.owner !== elf.id || b.buildTimer > 0) continue;
      if (b.kind !== "tent" && b.kind !== "goldmine") continue;
      income += BUILD_SPECS[b.kind].levels[b.level - 1].income ?? 0;
    }
    income *= GAME_MODES[state.mode].goldMult;
  } else if (troll && hutLevel > 0) {
    income = BUILD_SPECS.hut.levels[hutLevel - 1].income ?? 0;
  }

  return {
    faction: state.faction,
    difficulty: state.difficulty,
    mode: state.mode,
    rule: state.rule,
    paused,
    muted,
    gold: elf ? elf.gold : troll ? troll.gold : 0,
    income,
    wood: elf ? elf.wood : 0,
    woodPrice: state.woodPrice,
    woodSellPrice: Math.max(WOOD_PACK.minSell, Math.round(state.woodPrice * WOOD_PACK.sellRatio)),
    elf: elf ? { name: elf.name, hp: elf.hp, maxHp: elf.maxHp, alive: elf.alive } : null,
    trolls: state.trolls.map((t) => ({
      name: t.name,
      hp: t.hp,
      maxHp: t.maxHp,
      wolf: t.wolf,
      alive: t.alive,
      isPlayer: t.isPlayer,
    })),
    hutLevel,
    hutUpgradeGold,
    night: state.nightTimer > 0,
    nightTimer: state.nightTimer,
    time: state.time,
    surviveTime: state.surviveTime,
    hint: state.hint?.text ?? null,
    selected,
    autoRepair: elf?.autoRepair ?? false,
    placing: selectedPlacingRef.current,
    recallScrolls: troll?.recallScrolls ?? 0,
    recallChannel: troll?.recallChannel ?? 0,
    skills: {
      elf: elf ? elf.cooldowns : { blink: 0, haste: 0, entangle: 0, silence: 0, wallguard: 0 },
      troll: troll
        ? {
            windwalk: Math.max(troll.windwalkCd, troll.windwalk),
            berserk: Math.max(troll.berserkCd, troll.berserkTime),
            recall: Math.max(troll.recallCd, troll.recallChannel),
          }
        : { windwalk: 0, berserk: 0, recall: 0 },
    },
    items: troll ? troll.items : { weapon: 0, gloves: 0, boots: 0, armor: 0, vitality: 0, regen: 0 },
    stats: state.stats,
    towerBonus,
    result: state.result,
    elfCount: state.elves.length,
    aliveElves: state.elves.filter((e) => e.alive).length,
    aliveTrolls: state.trolls.filter((t) => t.alive).length,
  };
}

// 这两个 ref 在组件内赋值，供 makeSnapshot 读取，避免把 UI 状态耦合进引擎
function selectedBuildingOf(state: GameState) {
  const id = selectedBuildingRef.current;
  if (id === null) return null;
  const building = state.buildings.find((b) => b.id === id && b.alive);
  return building ?? null;
}

export function TveGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const gameRef = useRef<GameState | null>(null);
  const assetsRef = useRef<TveAssets>(EMPTY_ASSETS);
  const camRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
  const viewRef = useRef({ width: 1, height: 1, dpr: 1 });
  const inputRef = useRef<{ mx: number; my: number; attack?: boolean }>({ mx: 0, my: 0 });
  const joyRef = useRef({ mx: 0, my: 0 });
  const attackRef = useRef(false);
  const keysRef = useRef<Set<string>>(new Set());
  const pointerWorldRef = useRef({ x: 0, y: 0 });
  const pointerInsideRef = useRef(false);
  const manualCamUntilRef = useRef(0);
  const pausedRef = useRef(false);
  const mutedRef = useRef(false);
  const resultShownRef = useRef(false);
  const lastSnapshotRef = useRef(0);

  const [screen, setScreen] = useState<"menu" | "game">("menu");
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const [faction, setFaction] = useState<Faction>("elf");
  const [mode, setMode] = useState<GameMode>("old");
  const [rule, setRule] = useState<TrollRule>("single");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  const sync = () => {
    const game = gameRef.current;
    if (!game) return;
    setSnapshot(makeSnapshot(game, pausedRef.current, mutedRef.current));
  };

  const setPlacingKind = (kind: BuildingKind | null) => {
    selectedPlacingRef.current = kind;
    sync();
  };

  const selectBuilding = (id: number | null) => {
    selectedBuildingRef.current = id;
    sync();
  };

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadTveAssets((loaded, total) => {
      if (!cancelled) setLoadProgress(Math.round((loaded / total) * 100));
    }).then((assets) => {
      if (cancelled) return;
      assetsRef.current = assets;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const resize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const fallbackW = typeof window !== "undefined" ? window.innerWidth : 360;
      const fallbackH = typeof window !== "undefined" ? window.innerHeight : 640;
      const width = Math.max(1, Math.round(rect.width || fallbackW));
      const height = Math.max(1, Math.round(rect.height || fallbackH));
      const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      viewRef.current = { width, height, dpr };
    };
    resize();
    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(resize);
      observer.observe(container);
    }
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const game = gameRef.current;
      const { width, height, dpr } = viewRef.current;

      if (game) {
        if (!pausedRef.current && !game.result) {
          // 键盘 + 摇杆合成移动输入
          let mx = joyRef.current.mx;
          let my = joyRef.current.my;
          if (Math.hypot(mx, my) < 0.05) {
            const keys = keysRef.current;
            if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
            if (keys.has("d") || keys.has("arrowright")) mx += 1;
            if (keys.has("w") || keys.has("arrowup")) my -= 1;
            if (keys.has("s") || keys.has("arrowdown")) my += 1;
            const len = Math.hypot(mx, my);
            if (len > 1) {
              mx /= len;
              my /= len;
            }
          }
          inputRef.current = { mx, my, attack: attackRef.current };
          attackRef.current = false;

          let acc = dt;
          let guard = 0;
          while (acc > 0 && guard < 5) {
            const step = Math.min(1 / 60, acc);
            stepGame(game, step, inputRef.current);
            acc -= step;
            guard += 1;
            if (game.result) break;
          }

          if (game.sfx.length > 0) {
            if (!mutedRef.current) {
              const kind = game.sfx[game.sfx.length - 1] as Parameters<typeof playSfx>[0];
              playSfx(kind);
            }
            game.sfx.length = 0;
          }

          const hero = heroOf(game);
          if (hero && now > manualCamUntilRef.current) {
            camRef.current.x += (hero.x - camRef.current.x) * Math.min(1, dt * 5);
            camRef.current.y += (hero.y - camRef.current.y) * Math.min(1, dt * 5);
          }

          if (game.result && !resultShownRef.current) {
            resultShownRef.current = true;
            pausedRef.current = false;
            setSnapshot(makeSnapshot(game, false, mutedRef.current));
          }
        }

        const cam = camRef.current;
        const view: RenderView = {
          cam,
          width,
          height,
          selectedId: selectedBuildingRef.current,
          placing: null,
          faction: game.faction,
        };
        if (selectedPlacingRef.current && pointerInsideRef.current && game.faction === "elf") {
          const kind = selectedPlacingRef.current;
          const p = pointerWorldRef.current;
          const size = BUILD_SPECS[kind].size;
          const gx = Math.floor(p.x / TILE - (size - 1) / 2);
          const gy = Math.floor(p.y / TILE - (size - 1) / 2);
          const check = canBuildAt(game, game.playerElf, kind, gx, gy);
          view.placing = { kind, gx, gy, ok: check.ok };
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawGame(ctx, game, view, assetsRef.current, game.time);

        if (minimapRef.current) {
          const mctx = minimapRef.current.getContext("2d");
          if (mctx) drawMinimap(mctx, game, 132);
        }

        if (now - lastSnapshotRef.current > 120) {
          lastSnapshotRef.current = now;
          setSnapshot(makeSnapshot(game, pausedRef.current, mutedRef.current));
        }
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#0b1410";
        ctx.fillRect(0, 0, width, height);
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keysRef.current.add(key);
      if (key === " " || event.code === "Space") {
        event.preventDefault();
        if (gameRef.current && !gameRef.current.result) {
          pausedRef.current = !pausedRef.current;
          sync();
        }
      }
      if (key === "j" || key === "f") {
        // 手动攻击：隐身时按下会立刻显形并攻击
        attackRef.current = true;
      }
      if (key === "escape") {
        setPlacingKind(null);
        selectBuilding(null);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const startGame = () => {
    initAudio();
    if (!mutedRef.current) startBgm();
    const game = createGame(faction, difficulty, mode, rule);
    gameRef.current = game;
    resultShownRef.current = false;
    pausedRef.current = false;
    setPlacingKind(null);
    selectBuilding(null);
    joyRef.current = { mx: 0, my: 0 };
    inputRef.current = { mx: 0, my: 0 };
    keysRef.current.clear();
    const hero = heroOf(game);
    camRef.current = {
      x: hero?.x ?? game.elves[0]?.x ?? 0,
      y: hero?.y ?? game.elves[0]?.y ?? 0,
      zoom: viewRef.current.width < 720 ? 0.5 : 0.85,
    };
    manualCamUntilRef.current = 0;
    setSnapshot(makeSnapshot(game, false, mutedRef.current));
    setScreen("game");
  };

  const exitToMenu = () => {
    stopBgm();
    gameRef.current = null;
    setSnapshot(null);
    pausedRef.current = false;
    setPlacingKind(null);
    selectBuilding(null);
    setScreen("menu");
  };

  const togglePause = () => {
    if (!gameRef.current || gameRef.current.result) return;
    pausedRef.current = !pausedRef.current;
    if (pausedRef.current) stopBgm();
    else if (!mutedRef.current) startBgm();
    sync();
  };

  const toggleMute = () => {
    mutedRef.current = !mutedRef.current;
    if (mutedRef.current) stopBgm();
    else if (screen === "game" && !pausedRef.current) startBgm();
    sync();
  };

  const toggleFullscreen = () => {
    const target = containerRef.current;
    if (!target) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (target.requestFullscreen) {
      void target.requestFullscreen().catch(() => {
        setSnapshot((prev) => (prev ? { ...prev, hint: "当前浏览器不支持全屏" } : prev));
      });
    }
  };

  /* ---------------- 指针交互 ---------------- */

  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    camX: 0,
    camY: 0,
    pinch: 0,
    zoom: 1,
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const world = screenToWorld(
      { cam: camRef.current, width: viewRef.current.width, height: viewRef.current.height, selectedId: null, placing: null, faction: faction },
      sx,
      sy,
    );
    pointerWorldRef.current = world;
    pointerInsideRef.current = true;

    if (pointersRef.current.size === 1) {
      dragRef.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        camX: camRef.current.x,
        camY: camRef.current.y,
        pinch: 0,
        zoom: camRef.current.zoom,
      };
    } else if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      dragRef.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      dragRef.current.zoom = camRef.current.zoom;
      dragRef.current.moved = true;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    pointerWorldRef.current = screenToWorld(
      { cam: camRef.current, width: viewRef.current.width, height: viewRef.current.height, selectedId: null, placing: null, faction: faction },
      sx,
      sy,
    );
    pointerInsideRef.current = true;

    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dragRef.current.pinch > 0) {
        const zoom = Math.max(0.45, Math.min(1.9, (dragRef.current.zoom * dist) / dragRef.current.pinch));
        camRef.current.zoom = zoom;
      }
      dragRef.current.moved = true;
      return;
    }

    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 8) dragRef.current.moved = true;
    if (dragRef.current.moved) {
      camRef.current.x = dragRef.current.camX - dx / camRef.current.zoom;
      camRef.current.y = dragRef.current.camY - dy / camRef.current.zoom;
      manualCamUntilRef.current = performance.now() + 2600;
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    const wasDrag = dragRef.current.moved;
    dragRef.current.active = false;
    if (pointersRef.current.size > 0) return;
    pointerInsideRef.current = false;

    const game = gameRef.current;
    if (!game || wasDrag || game.result) return;
    handleTap(pointerWorldRef.current.x, pointerWorldRef.current.y);
  };

  const handleTap = (wx: number, wy: number) => {
    const game = gameRef.current;
    if (!game) return;
    const gx = Math.floor(wx / TILE);
    const gy = Math.floor(wy / TILE);

    if (selectedPlacingRef.current) {
      if (game.faction !== "elf") return;
      const kind = selectedPlacingRef.current;
      const size = BUILD_SPECS[kind].size;
      const bx = Math.floor(wx / TILE - (size - 1) / 2);
      const by = Math.floor(wy / TILE - (size - 1) / 2);
      const ok = tryBuildForElf(game, game.playerElf, kind, bx, by);
      // 移动端放置成功后退出建造模式，避免一直停留在放置光标
      if (ok && window.matchMedia("(pointer: coarse)").matches) setPlacingKind(null);
      if (!ok) {
        const check = canBuildAt(game, game.playerElf, kind, bx, by);
        if (check.reason) setSnapshot({ ...makeSnapshot(game, pausedRef.current, mutedRef.current), hint: check.reason });
      }
      sync();
      return;
    }

    if (game.faction !== "elf") {
      selectBuilding(null);
      return;
    }

    let hitId: number | null = null;
    for (const b of game.buildings) {
      if (!b.alive || b.team !== "elf") continue;
      if (gx >= b.gx && gx < b.gx + b.size && gy >= b.gy && gy < b.gy + b.size) {
        hitId = b.id;
        break;
      }
    }
    selectBuilding(hitId);
    sync();
  };

  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const next = camRef.current.zoom * (event.deltaY > 0 ? 0.92 : 1.08);
    camRef.current.zoom = Math.max(0.45, Math.min(1.9, next));
  };

  /* ---------------- HUD 回调 ---------------- */

  const handleBuild = (kind: BuildingKind) => {
    selectBuilding(null);
    setPlacingKind(kind);
  };

  const handleUpgrade = (id: number) => {
    const game = gameRef.current;
    if (!game) return;
    tryUpgradeBuilding(game, id);
    sync();
  };

  const handleConvert = (id: number, kind: BuildingKind) => {
    const game = gameRef.current;
    if (!game) return;
    convertBuilding(game, id, kind);
    sync();
  };

  const handleRepair = (id: number) => {
    const game = gameRef.current;
    if (!game) return;
    toggleRepairBuilding(game, id);
    sync();
  };

  const handleToggleAutoRepair = () => {
    const game = gameRef.current;
    if (!game) return;
    const elf = game.playerElf >= 0 ? game.elves[game.playerElf] : null;
    setAutoRepair(game, !elf?.autoRepair);
    sync();
  };

  const handleDemolish = (id: number) => {
    const game = gameRef.current;
    if (!game) return;
    if (demolishBuilding(game, id)) selectBuilding(null);
    sync();
  };

  const handleBuyWood = () => {
    const game = gameRef.current;
    if (!game) return;
    buyWood(game);
    sync();
  };

  const handleSellWood = () => {
    const game = gameRef.current;
    if (!game) return;
    sellWood(game);
    sync();
  };

  const handleShop = (key: ShopKey) => {
    const game = gameRef.current;
    if (!game) return;
    buyShopItem(game, game.playerTroll, key);
    sync();
  };

  const handleScroll = () => {
    const game = gameRef.current;
    if (!game) return;
    buyScroll(game, game.playerTroll);
    sync();
  };

  const handleBuyRecallScroll = () => {
    const game = gameRef.current;
    if (!game) return;
    buyRecallScroll(game, game.playerTroll);
    sync();
  };

  const handleUseScroll = () => {
    const game = gameRef.current;
    if (!game) return;
    useRecallScroll(game, game.playerTroll);
    sync();
  };

  const handleHutUpgrade = () => {
    const game = gameRef.current;
    if (!game) return;
    const troll = game.playerTroll >= 0 ? game.trolls[game.playerTroll] : null;
    if (troll && troll.hutId >= 0) tryUpgradeBuilding(game, troll.hutId);
    sync();
  };

  const handleElfSkill = (skill: ElfSkill) => {
    const game = gameRef.current;
    if (!game) return;
    castElfSkill(game, skill, inputRef.current.mx, inputRef.current.my);
    sync();
  };

  const handleTrollSkill = (skill: TrollSkill) => {
    const game = gameRef.current;
    if (!game) return;
    castTrollSkill(game, game.playerTroll, skill);
    sync();
  };

  const handleAttack = () => {
    attackRef.current = true;
  };

  const handleJoystick = (x: number, y: number) => {
    joyRef.current = { mx: x, my: y };
  };

  const showResult = snapshot?.result && screen === "game";

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-[#0b1410] text-white"
      style={{ height: "100dvh", minHeight: "100dvh" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          pointerInsideRef.current = false;
        }}
        onWheel={onWheel}
        onContextMenu={(event) => event.preventDefault()}
      />

      {screen === "menu" ? (
        <TveMenu
          faction={faction}
          mode={mode}
          rule={rule}
          difficulty={difficulty}
          onFaction={setFaction}
          onMode={setMode}
          onRule={setRule}
          onDifficulty={setDifficulty}
          onStart={startGame}
          onBack={() => {
            window.location.href = "/";
          }}
        />
      ) : null}

      {screen === "game" && snapshot ? (
        <TveHud
          snapshot={snapshot}
          minimapRef={minimapRef}
          onJoystickChange={handleJoystick}
          onPause={togglePause}
          onResume={togglePause}
          onMute={toggleMute}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          onExit={exitToMenu}
          onBuild={handleBuild}
          onCancelPlacing={() => setPlacingKind(null)}
          onUpgrade={handleUpgrade}
          onConvert={handleConvert}
          onRepair={handleRepair}
          onToggleAutoRepair={handleToggleAutoRepair}
          onDemolish={handleDemolish}
          onCloseSelected={() => selectBuilding(null)}
          onBuyWood={handleBuyWood}
          onSellWood={handleSellWood}
          onShop={handleShop}
          onScroll={handleScroll}
          onBuyRecallScroll={handleBuyRecallScroll}
          onUseScroll={handleUseScroll}
          onHutUpgrade={handleHutUpgrade}
          onElfSkill={handleElfSkill}
          onTrollSkill={handleTrollSkill}
          onAttack={handleAttack}
        />
      ) : null}

      {showResult && snapshot ? (
        <TveResult
          result={snapshot.result}
          snapshot={snapshot}
          onRestart={startGame}
          onMenu={exitToMenu}
        />
      ) : null}

      {screen === "menu" ? (
        <div className="pointer-events-auto absolute left-3 top-[max(12px,env(safe-area-inset-top))] z-50">
          <Link
            href="/"
            className="flex items-center gap-1 rounded-xl border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-white/75 backdrop-blur"
          >
            <ArrowLeft size={14} /> 大厅
          </Link>
        </div>
      ) : null}

      {loading ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur">
          <Loader2 size={13} className="animate-spin" />
          素材加载 {loadProgress}%
        </div>
      ) : null}
    </div>
  );
}
