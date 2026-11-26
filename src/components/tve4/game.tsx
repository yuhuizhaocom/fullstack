"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BUILDINGS, BUILD_KINDS, GRID_H, GRID_W, PREP_SECONDS, SKILLS, TILE } from "@/lib/tve4/config";
import { canBuild, castSkill, createGame, getPlayer, setBlocked, stepGame, tryBuild, tryUpgrade } from "@/lib/tve4/engine";
import { buildBlocked } from "@/lib/tve4/map";
import type { BuildKind, GameState, Interaction, SkillKey } from "@/lib/tve4/types";

import type { Stage4 } from "./stage";

const FIXED = 1 / 30;
type Sheet = "build" | "skill" | null;

interface Snapshot {
  time: number;
  phase: string;
  testMode: boolean;
  result: "win" | "lose" | null;
  hint: string | null;
  gold: number;
  wood: number;
  hp: number;
  maxHp: number;
  lives: number;
  cooldowns: Record<SkillKey, number>;
  selected: { id: number; label: string; level: number; hp: number; maxHp: number; canUpgrade: boolean; cost: number } | null;
  placing: BuildKind | null;
  pendingSkill: SkillKey | null;
  stats: { kills: number; destroyed: number };
}

export function Tve4Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage4 | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef(new Set<string>());
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const placingRef = useRef<BuildKind | null>(null);
  const moveTargetRef = useRef<{ x: number; y: number } | null>(null);
  const pendingSkillRef = useRef<SkillKey | null>(null);
  const testModeRef = useRef(false);
  const selectedRef = useRef<number | null>(null);
  const sheetRef = useRef<Sheet>(null);
  const toggleSheetRef = useRef<(s: Sheet) => void>(() => {});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const hero = getPlayer(s);
    const b = selectedRef.current !== null ? s.buildings.find((x) => x.id === selectedRef.current && x.alive) : null;
    const def = b ? BUILDINGS[b.kind] : null;
    const nextCost = b && def && b.level < def.levels.length ? def.levels[b.level].cost : 0;
    setSnapshot({
      time: s.time,
      phase: s.phase,
      testMode: s.testMode,
      result: s.result,
      hint: s.hint?.text ?? null,
      gold: hero?.gold ?? 0,
      wood: hero?.wood ?? 0,
      hp: hero?.hp ?? 0,
      maxHp: hero?.maxHp ?? 1,
      lives: hero?.lives ?? 0,
      cooldowns: hero ? { ...hero.cooldowns } : ({} as Record<SkillKey, number>),
      selected: b && def
        ? {
            id: b.id,
            label: def.label,
            level: b.level,
            hp: b.hp,
            maxHp: b.maxHp,
            canUpgrade: b.level < def.levels.length,
            cost: nextCost,
          }
        : null,
      placing: placingRef.current,
      pendingSkill: pendingSkillRef.current,
      stats: { kills: s.stats.kills, destroyed: s.stats.destroyed },
    });
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    let cancelled = false;
    (async () => {
      try {
        const { createStage4 } = await import("./stage");
        const stage = await createStage4(canvas, box.clientWidth, box.clientHeight);
        if (cancelled) {
          stage.destroy();
          return;
        }
        stageRef.current = stage;
        const testMode = new URLSearchParams(window.location.search).get("test") === "1";
        testModeRef.current = testMode;
        const state = createGame(testMode);
        setBlocked(state, buildBlocked());
        stateRef.current = state;
        setLoading(false);
        sync();
      } catch (e) {
        setError(e instanceof Error ? e.message : "初始化失败");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stageRef.current?.destroy();
      stageRef.current = null;
    };
  }, [sync]);

  useEffect(() => {
    let last = performance.now();
    let acc = 0;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const state = stateRef.current;
      const stage = stageRef.current;
      if (!state || !stage) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const keys = keysRef.current;
      let mx = 0;
      let my = 0;
      if (keys.has("w") || keys.has("arrowup")) my -= 1;
      if (keys.has("s") || keys.has("arrowdown")) my += 1;
      if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
      if (keys.has("d") || keys.has("arrowright")) mx += 1;
      const mag = Math.hypot(mx, my);
      if (mag > 0) {
        mx /= mag;
        my /= mag;
        moveTargetRef.current = null;
      } else {
        const target = moveTargetRef.current;
        const player = getPlayer(state);
        if (target && player) {
          const dx = target.x - player.x;
          const dy = target.y - player.y;
          const d = Math.hypot(dx, dy);
          if (d > 10) {
            mx = dx / d;
            my = dy / d;
          } else {
            moveTargetRef.current = null;
          }
        }
      }
      if (!state.result) {
        acc += dt;
        let guard = 0;
        while (acc >= FIXED && guard < 5) {
          stepGame(state, FIXED, { mx, my, aim: hoverRef.current });
          acc -= FIXED;
          guard += 1;
        }
      }
      const placing = placingRef.current;
      const hover = hoverRef.current;
      const interaction: Interaction = { placing, selectedId: selectedRef.current, hover, gx: 0, gy: 0, valid: false };
      if (placing && hover) {
        const size = BUILDINGS[placing].size;
        const gx = Math.max(0, Math.min(GRID_W - size, Math.floor(hover.x / TILE - (size - 1) / 2)));
        const gy = Math.max(0, Math.min(GRID_H - size, Math.floor(hover.y / TILE - (size - 1) / 2)));
        interaction.gx = gx;
        interaction.gy = gy;
        interaction.valid = canBuild(state, placing, gx, gy).ok;
      }
      stage.setInteraction(interaction);
      stage.render(state);
      sync();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sync]);

  useEffect(() => {
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        if (down) keysRef.current.add(k);
        else keysRef.current.delete(k);
      }
      if (down && e.key === "Escape") {
        placingRef.current = null;
        pendingSkillRef.current = null;
        sheetRef.current = null;
        setSheet(null);
      }
      if (down && e.key.toLowerCase() === "b") toggleSheetRef.current?.("build");
    };
    const down = onKey(true);
    const up = onKey(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const onPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>, click: boolean) => {
      const stage = stageRef.current;
      const state = stateRef.current;
      if (!stage || !state) return;
      const world = stage.screenToWorld(e.clientX, e.clientY);
      if (!world) return;
      hoverRef.current = world;
      if (!click) return;
      if (pendingSkillRef.current) {
        castSkill(state, pendingSkillRef.current, world);
        pendingSkillRef.current = null;
        sync();
        return;
      }
      if (placingRef.current) {
        const size = BUILDINGS[placingRef.current].size;
        const gx = Math.floor(world.x / TILE - (size - 1) / 2);
        const gy = Math.floor(world.y / TILE - (size - 1) / 2);
        if (tryBuild(state, placingRef.current, gx, gy)) {
          placingRef.current = null;
          sheetRef.current = null;
          setSheet(null);
        }
        sync();
        return;
      }
      const b = state.buildings.find(
        (x) =>
          x.alive &&
          x.faction === "elf" &&
          Math.abs(world.x - x.x) <= (x.size * TILE) / 2 &&
          Math.abs(world.y - x.y) <= (x.size * TILE) / 2,
      );
      selectedRef.current = b?.id ?? null;
      if (!b) moveTargetRef.current = world;
      sync();
    },
    [sync],
  );

  const toggleSheet = useCallback((next: Sheet) => {
    const v = sheetRef.current === next ? null : next;
    sheetRef.current = v;
    setSheet(v);
  }, []);
  toggleSheetRef.current = toggleSheet;

  const restart = useCallback((testMode = testModeRef.current) => {
    testModeRef.current = testMode;
    stateRef.current = createGame(testMode);
    selectedRef.current = null;
    moveTargetRef.current = null;
    pendingSkillRef.current = null;
    placingRef.current = null;
    sheetRef.current = null;
    setSheet(null);
    sync();
  }, [sync]);

  return (
    <div ref={boxRef} className="relative h-dvh w-full overflow-hidden bg-[#07100b]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerMove={(e) => onPointer(e, false)}
        onPointerDown={(e) => onPointer(e, true)}
      />
      {loading ? <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">加载中...</div> : null}
      {error ? <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 text-sm text-rose-200">{error}</div> : null}

      {snapshot ? (
        <>
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
            <button className="pointer-events-auto rounded-lg bg-black/60 px-3 py-2 text-xs text-white" onClick={() => toggleSheet("build")}>建造</button>
            <button className="pointer-events-auto rounded-lg bg-black/60 px-3 py-2 text-xs text-white" onClick={() => toggleSheet("skill")}>技能</button>
            <button
              className={`pointer-events-auto rounded-lg px-3 py-2 text-xs ${snapshot.testMode ? "bg-amber-700 text-white" : "bg-black/60 text-white"}`}
              onClick={() => restart(!snapshot.testMode)}
              title="测试模式跳过 30 秒准备期"
            >
              {snapshot.testMode ? "测试模式" : "常规模式"}
            </button>
            <button className="pointer-events-auto rounded-lg bg-black/60 px-3 py-2 text-xs text-white" onClick={() => stageRef.current?.zoomBy(1.25)}>＋</button>
            <button className="pointer-events-auto rounded-lg bg-black/60 px-3 py-2 text-xs text-white" onClick={() => stageRef.current?.zoomBy(0.8)}>－</button>
            <div className="rounded-lg bg-black/60 px-3 py-2 text-xs text-white">
              {snapshot.phase === "prep" ? `准备 ${Math.max(0, PREP_SECONDS - snapshot.time).toFixed(0)}s` : `${snapshot.time.toFixed(0)}s`}
            </div>
          </div>
          <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/60 px-3 py-2 text-right text-xs text-white">
            <div>金币 {Math.floor(snapshot.gold)} · 木材 {Math.floor(snapshot.wood)}</div>
            <div>生命 {Math.max(0, snapshot.hp).toFixed(0)}/{snapshot.maxHp} · 剩余 {snapshot.lives}</div>
            <div className="text-white/60">击杀 {snapshot.stats.kills} · 摧毁 {snapshot.stats.destroyed}</div>
          </div>
          {snapshot.hint ? (
            <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              {snapshot.hint}
            </div>
          ) : null}
          {snapshot.result ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
              <div className="text-3xl font-bold">{snapshot.result === "win" ? "胜利" : "失败"}</div>
              <div className="text-sm text-white/70">坚守 {snapshot.time.toFixed(0)} 秒 · 击杀 {snapshot.stats.kills} · 摧毁 {snapshot.stats.destroyed}</div>
              <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm" onClick={() => restart()}>再来一局</button>
            </div>
          ) : null}
          {sheet ? (
            <div className="absolute bottom-16 left-1/2 z-20 max-w-[95vw] -translate-x-1/2 overflow-x-auto rounded-xl border border-white/10 bg-neutral-900/95 p-3 text-white">
              {sheet === "build" ? (
                <div className="flex gap-2">
                  {BUILD_KINDS.map((kind) => {
                    const def = BUILDINGS[kind];
                    return (
                      <button
                        key={kind}
                        className={`min-w-[84px] rounded-lg border px-3 py-2 text-xs ${snapshot.placing === kind ? "border-emerald-400 bg-emerald-900" : "border-white/10 bg-white/5"}`}
                        onClick={() => {
                          placingRef.current = placingRef.current === kind ? null : kind;
                          sync();
                        }}
                      >
                        <div className="font-semibold">{def.label}</div>
                        <div className="text-white/60">{def.levels[0].cost} 金</div>
                        <div className="mt-1 text-[10px] text-white/40">{def.desc}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex gap-2">
                  {SKILLS.elf.map((spec) => (
                    <button
                      key={spec.key}
                      className={`min-w-[84px] rounded-lg border px-3 py-2 text-xs ${snapshot.pendingSkill === spec.key ? "border-sky-400 bg-sky-900" : "border-white/10 bg-white/5"}`}
                      onClick={() => {
                        const s = stateRef.current;
                        if (!s) return;
                        if (pendingSkillRef.current === spec.key) {
                          pendingSkillRef.current = null;
                        } else {
                          castSkill(s, spec.key, hoverRef.current);
                          pendingSkillRef.current = hoverRef.current ? null : spec.key;
                        }
                        sync();
                      }}
                    >
                      <div className="font-semibold">{spec.label}</div>
                      <div className="text-white/60">{(snapshot.cooldowns[spec.key] ?? 0) > 0 ? `${Math.ceil(snapshot.cooldowns[spec.key])}s` : "就绪"}</div>
                      <div className="mt-1 text-[10px] text-white/40">{spec.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {snapshot.selected ? (
            <div className="absolute bottom-16 right-3 z-20 rounded-xl border border-white/10 bg-neutral-900/95 p-3 text-xs text-white">
              <div className="font-semibold">{snapshot.selected.label} Lv{snapshot.selected.level}</div>
              <div>HP {Math.max(0, snapshot.selected.hp).toFixed(0)}/{snapshot.selected.maxHp}</div>
              {snapshot.selected.canUpgrade ? (
                <button
                  className="mt-2 rounded-lg bg-amber-700 px-3 py-1 text-xs"
                  onClick={() => {
                    const s = stateRef.current;
                    if (s && selectedRef.current !== null) {
                      tryUpgrade(s, selectedRef.current);
                      sync();
                    }
                  }}
                >
                  升级 · {snapshot.selected.cost} 金
                </button>
              ) : (
                <div className="mt-2 text-white/50">已满级</div>
              )}
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[10px] text-white/50">
            WASD / 点击地面移动 · 点击建造或选中建筑 · M 全图 · K 攻击 · B 建造 · Esc 取消
          </div>
        </>
      ) : null}
    </div>
  );
}
