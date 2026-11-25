"use client";

// 「巨魔 VS 精灵」主组件：资源加载、固定步长循环、相机、输入、HUD 状态桥接。

import { useCallback, useEffect, useRef, useState } from "react";

import { TveHud, TveMenu, TveResult, type HudSnapshot } from "@/components/tve/tve-hud";
import { loadTveAssets, type TveAssets } from "@/lib/tve/assets";
import {
  BASE_SITES,
  BUILD_SPECS,
  MAP_SIZE,
  TILE,
  clamp,
  tileCenter,
} from "@/lib/tve/config";
import {
  buyTrollUpgrade,
  canBuildAt,
  castRush,
  createGame,
  demolishBuilding,
  pushHint,
  stepGame,
  tryBuildForBase,
  tryUpgradeForBase,
} from "@/lib/tve/engine";
import { drawGame, drawMinimap, screenToWorld, type RenderView } from "@/lib/tve/render";
import type {
  BuildingKind,
  Camera,
  Difficulty,
  Faction,
  GameState,
  UpgradeTrack,
} from "@/lib/tve/types";
import { initAudio, playSfx, startBgm, stopBgm } from "@/lib/world/audio";
import { cn } from "@/lib/utils";

type Phase = "menu" | "playing" | "result";

const ALLOWED_SFX = new Set([
  "attack",
  "attack_bow",
  "attack_staff",
  "hurt",
  "kill",
  "skill",
  "skill_fire",
  "skill_frost",
  "heal",
  "levelup",
  "death",
  "pickup",
  "quest",
]);

const ELF_KINDS: BuildingKind[] = ["mine", "wall", "arrow", "magic"];

function buildSnapshot(state: GameState, placingKind: BuildingKind | null, selectedId: number | null): HudSnapshot {
  const gold = state.faction === "elf" ? state.bases[state.playerBase]?.gold ?? 0 : state.troll.gold;
  const bases = state.bases.map((base) => {
    const tree = state.buildings.find((b) => b.id === base.treeId);
    return {
      id: base.id,
      name: base.name,
      alive: base.alive,
      hp: tree?.hp ?? 0,
      maxHp: tree?.maxHp ?? 1,
      isPlayer: base.isPlayer,
    };
  });
  const selectedBuilding = selectedId !== null ? state.buildings.find((b) => b.id === selectedId && b.alive) : undefined;
  const levels = selectedBuilding ? BUILD_SPECS[selectedBuilding.kind].levels : [];
  const upgradeCost = selectedBuilding && selectedBuilding.level < levels.length ? levels[selectedBuilding.level].cost : null;
  const villagers = state.playerBase >= 0
    ? state.villagers.filter((v) => v.baseId === state.playerBase && !v.dead).length
    : 0;

  return {
    faction: state.faction,
    difficulty: state.difficulty,
    gold,
    trollHp: Math.max(0, state.troll.hp),
    trollMaxHp: state.troll.maxHp,
    night: state.night,
    dayTimer: state.dayTimer,
    time: state.time,
    hint: state.hint?.text ?? null,
    result: state.result,
    bases,
    villagers,
    selected: selectedBuilding
      ? {
          id: selectedBuilding.id,
          kind: selectedBuilding.kind,
          level: selectedBuilding.level,
          hp: Math.max(0, selectedBuilding.hp),
          maxHp: selectedBuilding.maxHp,
          upgradeCost,
          refund: Math.floor(selectedBuilding.spent * 0.5),
        }
      : null,
    placingKind,
    claw: state.troll.claw,
    swift: state.troll.swift,
    hide: state.troll.hide,
    rushCd: state.troll.rushCd,
    stats: { ...state.stats },
  };
}

export function TveGame() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  const assetsRef = useRef<TveAssets | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const camRef = useRef<Camera>({ x: MAP_SIZE / 2, y: MAP_SIZE / 2, zoom: 1.1 });
  const sizeRef = useRef({ w: 320, h: 240, dpr: 1 });
  const phaseRef = useRef<Phase>("menu");
  const pausedRef = useRef(false);
  const selectedIdRef = useRef<number | null>(null);
  const placingRef = useRef<BuildingKind | null>(null);
  const joystickRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const ghostRef = useRef({ gx: 0, gy: 0 });
  const freeCamUntilRef = useRef(0);
  const soundOnRef = useRef(true);
  const accumulateRef = useRef(0);

  const [assetsReady, setAssetsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("menu");
  const [paused, setPaused] = useState(false);
  const [placingKind, setPlacingKind] = useState<BuildingKind | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [pseudoFull, setPseudoFull] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [faction, setFaction] = useState<Faction>("elf");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  // 资源加载
  useEffect(() => {
    let cancelled = false;
    loadTveAssets((loaded, total) => {
      if (!cancelled) setProgress(total > 0 ? loaded / total : 0);
    })
      .then((assets) => {
        if (cancelled) return;
        assetsRef.current = assets;
        setAssetsReady(true);
        setProgress(1);
      })
      .catch(() => {
        if (!cancelled) setAssetsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePlacing = useCallback((kind: BuildingKind | null) => {
    placingRef.current = kind;
    setPlacingKind(kind);
  }, []);

  const updateSelected = useCallback((id: number | null) => {
    selectedIdRef.current = id;
    setSelectedId(id);
  }, []);

  const viewFor = useCallback((): RenderView => {
    const state = stateRef.current;
    return {
      cam: camRef.current,
      width: sizeRef.current.w,
      height: sizeRef.current.h,
      selectedId: selectedIdRef.current,
      placing: (() => {
        const kind = placingRef.current;
        if (!kind || !state) return null;
        const { gx, gy } = ghostRef.current;
        const base = state.bases[state.playerBase];
        const check = canBuildAt(state, state.playerBase, kind, gx, gy);
        const cost = BUILD_SPECS[kind].levels[0].cost;
        return { kind, gx, gy, ok: check.ok && !!base && base.gold >= cost };
      })(),
      faction: state?.faction ?? "elf",
    };
  }, []);

  const clampCamera = useCallback(() => {
    const cam = camRef.current;
    const { w, h } = sizeRef.current;
    const halfW = w / (2 * cam.zoom);
    const halfH = h / (2 * cam.zoom);
    cam.x = halfW * 2 >= MAP_SIZE ? MAP_SIZE / 2 : clamp(cam.x, halfW, MAP_SIZE - halfW);
    cam.y = halfH * 2 >= MAP_SIZE ? MAP_SIZE / 2 : clamp(cam.y, halfH, MAP_SIZE - halfH);
  }, []);

  // 画布尺寸与 DPR
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      sizeRef.current = { w, h, dpr };
      clampCamera();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    window.addEventListener("orientationchange", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", resize);
    };
  }, [clampCamera]);

  // 主循环
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    let lastMini = 0;

    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const assets = assetsRef.current;
      const state = stateRef.current;
      if (!canvas || !ctx) return;
      const { dpr, w, h } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!state || !assets) {
        ctx.fillStyle = "#0b1410";
        ctx.fillRect(0, 0, w, h);
        return;
      }
      drawGame(ctx, state, viewFor(), assets, performance.now() / 1000);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const state = stateRef.current;

      if (state && phaseRef.current === "playing" && !pausedRef.current) {
        accumulateRef.current += dt;
        let steps = 0;
        const keys = keysRef.current;
        let kx = 0;
        let ky = 0;
        if (state.faction === "troll") {
          if (keys.has("KeyW") || keys.has("ArrowUp")) ky -= 1;
          if (keys.has("KeyS") || keys.has("ArrowDown")) ky += 1;
          if (keys.has("KeyA") || keys.has("ArrowLeft")) kx -= 1;
          if (keys.has("KeyD") || keys.has("ArrowRight")) kx += 1;
        }
        const joy = joystickRef.current;
        let mx = joy.x + kx;
        let my = joy.y + ky;
        const mag = Math.hypot(mx, my);
        if (mag > 1) {
          mx /= mag;
          my /= mag;
        }
        while (accumulateRef.current >= 1 / 60 && steps < 6) {
          stepGame(state, 1 / 60, { mx, my, rush: false });
          accumulateRef.current -= 1 / 60;
          steps++;
        }
        for (const name of state.sfx) {
          if (ALLOWED_SFX.has(name) && soundOnRef.current) {
            playSfx(name as Parameters<typeof playSfx>[0]);
          }
        }
        state.sfx.length = 0;

        if (state.troll.hp > 0 && state.faction === "troll" && now > freeCamUntilRef.current) {
          const cam = camRef.current;
          const lerp = Math.min(1, dt * 5);
          cam.x += (state.troll.x - cam.x) * lerp;
          cam.y += (state.troll.y - cam.y) * lerp;
        }
        clampCamera();

        if (state.result) {
          phaseRef.current = "result";
          setPhase("result");
          setSnapshot(buildSnapshot(state, placingRef.current, selectedIdRef.current));
          stopBgm();
        }
      }

      render();

      if (state && now - lastHud > 100) {
        lastHud = now;
        setSnapshot(buildSnapshot(state, placingRef.current, selectedIdRef.current));
      }
      if (state && now - lastMini > 260) {
        lastMini = now;
        const mini = minimapRef.current;
        const ctx = mini?.getContext("2d");
        if (mini && ctx) {
          if (mini.width !== 184) {
            mini.width = 184;
            mini.height = 184;
          }
          ctx.setTransform(2, 0, 0, 2, 0, 0);
          drawMinimap(ctx, state, 92);
        }
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clampCamera, viewFor]);

  // 键盘
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (phaseRef.current !== "playing") return;
      const state = stateRef.current;
      if (!state) return;
      keysRef.current.add(event.code);
      if (event.code === "Space") {
        event.preventDefault();
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
      } else if (event.code === "Escape") {
        updatePlacing(null);
        updateSelected(null);
        setUpgradeOpen(false);
      } else if (state.faction === "elf") {
        const index = Number(event.code.replace("Digit", "")) - 1;
        if (index >= 0 && index < ELF_KINDS.length) {
          updatePlacing(ELF_KINDS[index]);
          setUpgradeOpen(false);
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [updatePlacing, updateSelected]);

  // 全屏状态同步
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    return () => {
      stopBgm();
    };
  }, []);

  const startGame = useCallback(
    (nextFaction: Faction, nextDifficulty: Difficulty) => {
      initAudio();
      if (soundOnRef.current) startBgm();
      const state = createGame(nextFaction, nextDifficulty);
      stateRef.current = state;
      accumulateRef.current = 0;
      setFaction(nextFaction);
      setDifficulty(nextDifficulty);
      updatePlacing(null);
      updateSelected(null);
      setUpgradeOpen(false);
      pausedRef.current = false;
      setPaused(false);

      const site = BASE_SITES[0];
      const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      camRef.current = {
        x: nextFaction === "troll" ? state.troll.x : tileCenter(site.tx),
        y: nextFaction === "troll" ? state.troll.y : tileCenter(site.ty),
        zoom: isTouch ? 1 : 1.15,
      };
      ghostRef.current = { gx: site.tx + 3, gy: site.ty };
      freeCamUntilRef.current = 0;
      phaseRef.current = "playing";
      setPhase("playing");
      setSnapshot(buildSnapshot(state, null, null));
    },
    [updatePlacing, updateSelected],
  );

  const exitToMenu = useCallback(() => {
    stopBgm();
    stateRef.current = null;
    phaseRef.current = "menu";
    setPhase("menu");
    updatePlacing(null);
    updateSelected(null);
    pausedRef.current = false;
    setPaused(false);
    setUpgradeOpen(false);
    setPseudoFull(false);
    if (document.fullscreenElement) void document.exitFullscreen();
  }, [updatePlacing, updateSelected]);

  const restart = useCallback(() => {
    startGame(faction, difficulty);
  }, [difficulty, faction, startGame]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const state = stateRef.current;
      if (!state || phaseRef.current !== "playing" || pausedRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(event.pointerId);
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size === 1) {
        dragRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          camX: camRef.current.x,
          camY: camRef.current.y,
          moved: false,
          time: performance.now(),
        };
        const rect = canvas.getBoundingClientRect();
        const world = screenToWorld(viewFor(), event.clientX - rect.left, event.clientY - rect.top);
        ghostRef.current = {
          gx: Math.floor(world.x / TILE),
          gy: Math.floor(world.y / TILE),
        };
      } else if (pointersRef.current.size === 2) {
        pinchRef.current = {
          dist: pointerDistance(pointersRef.current),
          zoom: camRef.current.zoom,
        };
        if (dragRef.current) dragRef.current.moved = true;
      }
    },
    [viewFor],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pointers = pointersRef.current;
      if (!pointers.has(event.pointerId)) {
        if (placingRef.current) {
          const rect = canvas.getBoundingClientRect();
          const world = screenToWorld(viewFor(), event.clientX - rect.left, event.clientY - rect.top);
          ghostRef.current = { gx: Math.floor(world.x / TILE), gy: Math.floor(world.y / TILE) };
        }
        return;
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const cam = camRef.current;

      if (pointers.size === 2 && pinchRef.current) {
        const dist = pointerDistance(pointers);
        const factor = dist / Math.max(1, pinchRef.current.dist);
        cam.zoom = clamp(pinchRef.current.zoom * factor, 0.7, 1.7);
        freeCamUntilRef.current = performance.now() + 2200;
        clampCamera();
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 9) drag.moved = true;
      if (drag.moved) {
        cam.x = drag.camX - dx / cam.zoom;
        cam.y = drag.camY - dy / cam.zoom;
        freeCamUntilRef.current = performance.now() + 2500;
        clampCamera();
      }
    },
    [clampCamera, viewFor],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const pointers = pointersRef.current;
      const drag = dragRef.current;
      const wasSingle = pointers.size === 1;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchRef.current = null;

      const state = stateRef.current;
      const canvas = canvasRef.current;
      if (!state || !canvas || phaseRef.current !== "playing") {
        if (pointers.size === 0) dragRef.current = null;
        return;
      }
      if (pointers.size === 0) {
        dragRef.current = null;
        const isTap = wasSingle && drag && !drag.moved && performance.now() - drag.time < 420;
        if (isTap) {
          const rect = canvas.getBoundingClientRect();
          const world = screenToWorld(viewFor(), event.clientX - rect.left, event.clientY - rect.top);
          const gx = Math.floor(world.x / TILE);
          const gy = Math.floor(world.y / TILE);
          const placing = placingRef.current;
          if (placing) {
            const base = state.bases[state.playerBase];
            const cost = BUILD_SPECS[placing].levels[0].cost;
            const check = canBuildAt(state, state.playerBase, placing, gx, gy);
            if (!check.ok) {
              pushHint(state, check.reason ?? "无法建造", 2);
            } else if (!base || base.gold < cost) {
              pushHint(state, "金币不足", 2);
            } else if (tryBuildForBase(state, state.playerBase, placing, gx, gy)) {
              updatePlacing(null);
              setSnapshot(buildSnapshot(state, null, selectedIdRef.current));
            }
          } else {
            const hit = state.buildings.find((b) => {
              if (!b.alive) return false;
              const size = BUILD_SPECS[b.kind].size;
              return gx >= b.gx && gx < b.gx + size && gy >= b.gy && gy < b.gy + size;
            });
            updateSelected(hit && state.faction === "elf" ? hit.id : null);
          }
        }
      }
    },
    [clampCamera, updatePlacing, updateSelected, viewFor],
  );

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragRef = useRef<{ startX: number; startY: number; camX: number; camY: number; moved: boolean; time: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  // 滚轮缩放
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const cam = camRef.current;
      const view = viewFor();
      const rect = canvas.getBoundingClientRect();
      const before = screenToWorld(view, event.clientX - rect.left, event.clientY - rect.top);
      cam.zoom = clamp(cam.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.7, 1.7);
      const after = screenToWorld(view, event.clientX - rect.left, event.clientY - rect.top);
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
      freeCamUntilRef.current = performance.now() + 2200;
      clampCamera();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [clampCamera, viewFor]);

  const handleBuild = useCallback(
    (kind: BuildingKind) => {
      if (placingRef.current === kind) {
        updatePlacing(null);
        return;
      }
      const state = stateRef.current;
      if (!state) return;
      updatePlacing(kind);
      updateSelected(null);
      setUpgradeOpen(false);
      const base = state.bases[state.playerBase];
      if (base) {
        ghostRef.current = { gx: base.tx + 3, gy: base.ty };
      }
    },
    [updatePlacing, updateSelected],
  );

  const handleUpgrade = useCallback(() => {
    const state = stateRef.current;
    const id = selectedIdRef.current;
    if (!state || id === null) return;
    if (!tryUpgradeForBase(state, state.playerBase, id)) {
      pushHint(state, "金币不足或已满级", 2);
    }
    setSnapshot(buildSnapshot(state, placingRef.current, selectedIdRef.current));
  }, []);

  const handleDemolish = useCallback(() => {
    const state = stateRef.current;
    const id = selectedIdRef.current;
    if (!state || id === null) return;
    demolishBuilding(state, id);
    updateSelected(null);
    setSnapshot(buildSnapshot(state, placingRef.current, null));
  }, [updateSelected]);

  const handleBuyUpgrade = useCallback((track: UpgradeTrack) => {
    const state = stateRef.current;
    if (!state) return;
    buyTrollUpgrade(state, track);
    setSnapshot(buildSnapshot(state, placingRef.current, selectedIdRef.current));
  }, []);

  const handleRush = useCallback(() => {
    const state = stateRef.current;
    if (!state || pausedRef.current) return;
    castRush(state);
    setSnapshot(buildSnapshot(state, placingRef.current, selectedIdRef.current));
  }, []);

  const togglePause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundOnRef.current;
    soundOnRef.current = next;
    setSoundOn(next);
    if (next) {
      initAudio();
      if (phaseRef.current !== "menu") startBgm();
    } else {
      stopBgm();
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    const request = el.requestFullscreen?.bind(el);
    if (request) {
      try {
        await request();
        return;
      } catch {
        // iOS Safari 等场景退回伪全屏
      }
    }
    setPseudoFull((value) => {
      const next = !value;
      setFullscreen(next);
      return next;
    });
  }, []);

  const handleJoystick = useCallback((x: number, y: number) => {
    joystickRef.current = { x, y };
  }, []);

  const hud = snapshot ?? (stateRef.current ? buildSnapshot(stateRef.current, placingKind, selectedId) : null);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative isolate h-[100dvh] w-full touch-none select-none overflow-hidden overscroll-none bg-[#0b1410]",
        pseudoFull && "fixed inset-0 z-[60]",
      )}
      onContextMenu={(event) => {
        event.preventDefault();
        updatePlacing(null);
      }}
    >
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="巨魔 VS 精灵 游戏画面"
        className="absolute inset-0 size-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {hud && phase !== "menu" && (
        <TveHud
          hud={hud}
          paused={paused}
          soundOn={soundOn}
          fullscreen={fullscreen || pseudoFull}
          upgradeOpen={upgradeOpen}
          minimapRef={minimapRef}
          onBuild={handleBuild}
          onCancelPlacement={() => updatePlacing(null)}
          onUpgrade={handleUpgrade}
          onDemolish={handleDemolish}
          onBuyUpgrade={handleBuyUpgrade}
          onRush={handleRush}
          onTogglePause={togglePause}
          onToggleSound={toggleSound}
          onToggleFullscreen={() => void toggleFullscreen()}
          onToggleUpgrade={() => setUpgradeOpen((value) => !value)}
          onExit={exitToMenu}
          onCloseSelected={() => updateSelected(null)}
          onJoystick={handleJoystick}
        />
      )}

      {hud && phase === "result" && <TveResult hud={hud} onRestart={restart} onMenu={exitToMenu} />}

      {phase === "menu" && (
        <TveMenu ready={assetsReady} progress={progress} onStart={startGame} />
      )}
    </div>
  );
}

function pointerDistance(pointers: Map<number, { x: number; y: number }>): number {
  const list = Array.from(pointers.values());
  if (list.length < 2) return 1;
  return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) || 1;
}
