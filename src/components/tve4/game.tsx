"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  BUILDINGS,
  BUILD_KINDS,
  MODE_LABEL,
  RULE_LABEL,
  RULE_PREP,
  SKILLS,
  TILE,
} from "@/lib/tve4/config";
import { DEFAULT_MAP_ID, MAP_DEFINITIONS, MAP_ORDER } from "@/lib/tve4/maps.generated";
import {
  buyEquipment,
  buyStrengthBook,
  canBuild,
  canUpgradeKind,
  canDemolish,
  canSummonMage,
  castSkill,
  createGame,
  demolishBuilding,
  getPlayer,
  relocateElf,
  repairWall,
  stepGame,
  toggleMobileDev,
  upgradeKind,
  tradeWood,
  tryBuild,
  tryUpgrade,
} from "@/lib/tve4/engine";
import { EQUIPMENT_RULE, MARKET_RULE, RULES, SCENARIO_RULE } from "@/lib/tve4/rules";
import { SKILL_ICONS, itemIcon } from "@/lib/tve4/render/icons";
import type { BuildKind, Faction, GameState, Interaction, Mode, Rule, SkillKey } from "@/lib/tve4/types";

import type { Stage4 } from "./stage";
import { HeroModelPicker } from "./hero-model-picker";

const FIXED = 1 / 30;
type Sheet = "build" | "skill" | "shop" | null;
const MAP_SWATCHES = [
  "#d7e2df",
  "#638454",
  "#54734a",
  "#a89768",
  "#777b70",
  "#355f66",
  "#28563d",
  "#9bbbc4",
] as const;

interface Snapshot {
  time: number;
  phase: string;
  mode: Mode;
  rule: Rule;
  mapName: string;
  endLock: "elf" | "troll" | null;
  faction: Faction;
  testMode: boolean;
  canSummon: boolean;
  mobileDev: boolean;
  trollStrength: number;
  relocateCd: number;
  wallUpgrade: { ok: boolean; reason: string; cost: number; wood: number; level: number };
  houseUpgrade: { ok: boolean; reason: string; cost: number; wood: number; level: number };
  hasMarket: boolean;
  woodPriceIn: number;
  woodPriceOut: number;
  result: "win" | "lose" | null;
  hint: string | null;
  gold: number;
  wood: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  lives: number;
  cooldowns: Record<SkillKey, number>;
  selected: { id: number; label: string; level: number; hp: number; maxHp: number; canUpgrade: boolean; cost: number; woodCost: number } | null;
  placing: BuildKind | null;
  pendingSkill: SkillKey | null;
  demolish: { ok: boolean; reason: string } | null;
  trollItems: string[];
  stats: { kills: number; destroyed: number };
}

export function Tve4Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage4 | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef(new Set<string>());
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const joystickActiveRef = useRef(false);
  const touchMoveRef = useRef({ mx: 0, my: 0 });
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const placingRef = useRef<BuildKind | null>(null);
  const moveTargetRef = useRef<{ x: number; y: number } | null>(null);
  const pendingSkillRef = useRef<SkillKey | null>(null);
  const migrateRef = useRef(false);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number } | null>(null);
  const testModeRef = useRef(false);
  const modeRef = useRef<Mode>("OLD");
  const ruleRef = useRef<Rule>("SINGLE");
  const selectedRef = useRef<number | null>(null);
  const sheetRef = useRef<Sheet>(null);
  const toggleSheetRef = useRef<(s: Sheet) => void>(() => {});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [startFaction, setStartFaction] = useState<Faction | null>(null);
  const [pendingFaction, setPendingFaction] = useState<Faction | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [preMode, setPreMode] = useState<Mode>("OLD");
  const [preRule, setPreRule] = useState<Rule>("SINGLE");
  const [preMap, setPreMap] = useState<number>(DEFAULT_MAP_ID);
  const [preTest, setPreTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageAttempt, setStageAttempt] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  const setHintLocal = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const sync = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const hero = getPlayer(s);
    const b = selectedRef.current !== null ? s.buildings.find((x) => x.id === selectedRef.current && x.alive) : null;
    const def = b ? BUILDINGS[b.kind] : null;
    const nextSpec = b && def && b.level < def.levels.length ? def.levels[b.level] : null;
    const nextCost = nextSpec?.cost ?? 0;
    const nextWood = nextSpec?.woodCost ?? 0;
    setSnapshot({
      time: s.time,
      phase: s.phase,
      mode: s.mode,
      rule: s.rule,
      mapName: MAP_DEFINITIONS[s.mapId]?.name ?? "未知地图",
      endLock: s.endLock,
      faction: s.playerFaction,
      testMode: s.testMode,
      canSummon: canSummonMage(s),
      mobileDev: s.mobileDev,
      trollStrength: s.trollStrength,
      relocateCd: s.relocateCd,
      wallUpgrade: canUpgradeKind(s, "wall"),
      houseUpgrade: canUpgradeKind(s, "tent"),
      hasMarket: s.buildings.some((b) => b.alive && b.kind === "market" && b.faction === "elf"),
      woodPriceIn: s.woodPriceIn,
      woodPriceOut: s.woodPriceOut,
      result: s.result,
      hint: s.hint?.text ?? null,
      gold: hero?.gold ?? 0,
      wood: hero?.wood ?? 0,
      hp: hero?.hp ?? 0,
      maxHp: hero?.maxHp ?? 1,
      mana: hero?.mana ?? 0,
      maxMana: hero?.maxMana ?? 1,
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
            woodCost: nextWood,
          }
        : null,
      placing: placingRef.current,
      pendingSkill: pendingSkillRef.current,
      demolish: b ? canDemolish(s, b.id) : null,
      trollItems: s.heroes.find((h) => h.faction === "troll")?.items ?? [],
      stats: { kills: s.stats.kills, destroyed: s.stats.destroyed },
    });
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      stageRef.current?.resize(box.clientWidth, box.clientHeight);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("test") === "1";
    const m = (params.get("mode") as Mode | null) ?? "OLD";
    const r = (params.get("rule") as Rule | null) ?? "SINGLE";
    setPreTest(t);
    setPreMode(m);
    setPreRule(r);
    testModeRef.current = t;
    modeRef.current = m;
    ruleRef.current = r;
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas || !startFaction) return;
    let cancelled = false;
    (async () => {
      try {
        const { createStage4 } = await import("./stage");
        const testMode = testModeRef.current;
        const mode = modeRef.current;
        const rule = ruleRef.current;
        const state = createGame({ mapId: preMap, testMode, mode, rule, playerFaction: startFaction, heroModelId: selectedModelId });
        const stage = await createStage4(canvas, box.clientWidth, box.clientHeight, state);
        if (cancelled) {
          stage.destroy();
          return;
        }
        stageRef.current = stage;
        stateRef.current = state;
        setLoading(false);
        sync();
      } catch (e) {
        if (cancelled) return;
        stateRef.current = null;
        setError(e instanceof Error ? e.message : "初始化失败");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stageRef.current?.destroy();
      stageRef.current = null;
    };
  }, [preMap, startFaction, stageAttempt, selectedModelId, sync]);

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
      mx += touchMoveRef.current.mx;
      my += touchMoveRef.current.my;
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
        const { grid } = state.session;
        const gx = Math.max(0, Math.min(grid.width - size, Math.floor(hover.x / TILE - (size - 1) / 2)));
        const gy = Math.max(0, Math.min(grid.height - size, Math.floor(hover.y / TILE - (size - 1) / 2)));
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

  const updateJoystickXY = useCallback((clientX: number, clientY: number) => {
    const el = joystickRef.current;
    const knob = joystickKnobRef.current;
    if (!el || !knob) return;
    const rect = el.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const max = rect.width * 0.36;
    const mag = Math.hypot(dx, dy);
    const k = mag > max ? max / mag : 1;
    touchMoveRef.current = { mx: (dx * k) / max, my: (dy * k) / max };
    knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
  }, []);

  const startJoystick = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    joystickActiveRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成事件可能无有效 pointerId */ }
    updateJoystickXY(e.clientX, e.clientY);
  }, [updateJoystickXY]);

  const moveJoystick = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (joystickActiveRef.current) updateJoystickXY(e.clientX, e.clientY);
  }, [updateJoystickXY]);

  const endJoystick = useCallback(() => {
    joystickActiveRef.current = false;
    touchMoveRef.current = { mx: 0, my: 0 };
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = "translate(-50%, -50%)";
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
      dragRef.current = null;
      stageRef.current?.setPanning(false);
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    const stage = stageRef.current;
    if (!stage) return;
    hoverRef.current = stage.screenToWorld(e.clientX, e.clientY);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchRef.current && distance > 0) {
        const ratio = distance / pinchRef.current.distance;
        if (Math.abs(ratio - 1) > 0.01) stage.zoomBy(ratio);
        pinchRef.current.distance = distance;
      } else {
        pinchRef.current = { distance };
      }
      return;
    }
    hoverRef.current = stage.screenToWorld(e.clientX, e.clientY);
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    stage.setPanning(true);
    const zoom = Math.max(0.1, stage.getZoom());
    stage.panBy(-dx / zoom, -dy / zoom);
    drag.x = e.clientX;
    drag.y = e.clientY;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasPinching = pinchRef.current !== null || pointersRef.current.size > 1;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (wasPinching) {
      dragRef.current = null;
      stageRef.current?.setPanning(false);
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    stageRef.current?.setPanning(false);
    if (!drag || drag.moved) return;
    const stage = stageRef.current;
    const state = stateRef.current;
    if (!stage || !state) return;
    const world = stage.screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    hoverRef.current = world;
    if (migrateRef.current) {
        const gx = Math.floor(world.x / TILE);
        const gy = Math.floor(world.y / TILE);
        migrateRef.current = false;
        relocateElf(state, gx, gy);
        sync();
        return;
      }
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
    sync();
  }, [sync]);

  const toggleSheet = useCallback((next: Sheet) => {
    const v = sheetRef.current === next ? null : next;
    sheetRef.current = v;
    setSheet(v);
  }, []);
  toggleSheetRef.current = toggleSheet;

  const retryStage = useCallback(() => {
    stateRef.current = null;
    setSnapshot(null);
    setError(null);
    setLoading(true);
    setStageAttempt((attempt) => attempt + 1);
  }, []);

  const returnToSelection = useCallback(() => {
    stateRef.current = null;
    keysRef.current.clear();
    setSnapshot(null);
    setSheet(null);
    setError(null);
    setLoading(false);
    setStartFaction(null);
  }, []);

  const restart = useCallback((testMode = testModeRef.current, mode = modeRef.current, rule = ruleRef.current) => {
    testModeRef.current = testMode;
    modeRef.current = mode;
    ruleRef.current = rule;
    const next = createGame({
      mapId: stateRef.current?.session.mapId ?? preMap,
      testMode,
      mode,
      rule,
      playerFaction: stateRef.current?.playerFaction ?? startFaction ?? "elf",
      heroModelId: stateRef.current?.appearance.heroModelId ?? selectedModelId,
    });
    stageRef.current?.updateSession(next.session);
    stateRef.current = next;
    selectedRef.current = null;
    moveTargetRef.current = null;
    pendingSkillRef.current = null;
    placingRef.current = null;
    sheetRef.current = null;
    setSheet(null);
    sync();
  }, [preMap, startFaction, selectedModelId, sync]);

  return (
    <div ref={boxRef} className="relative h-dvh w-full overflow-hidden bg-[#07100b]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {!startFaction ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-[#07100b] px-6 text-white">
          <div className="text-center">
            <div className="text-3xl font-bold">巨魔 VS 精灵</div>
            <div className="mt-2 text-sm text-white/60">选择阵营开始对局</div>
          </div>
          <div className="flex gap-2 text-xs">
            <select className="rounded-lg bg-white/10 px-3 py-2" value={preMode} onChange={(e) => setPreMode(e.target.value as Mode)}>
              {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
            <select className="rounded-lg bg-white/10 px-3 py-2" value={preRule} onChange={(e) => setPreRule(e.target.value as Rule)}>
              {(Object.keys(RULE_LABEL) as Rule[]).map((r) => <option key={r} value={r}>{RULE_LABEL[r]}</option>)}
            </select>
            <button className={`rounded-lg px-3 py-2 ${preTest ? "bg-amber-700" : "bg-white/10"}`} onClick={() => setPreTest(!preTest)}>
              {preTest ? "测试模式" : "常规模式"}
            </button>
          </div>
          <div className="w-full max-w-2xl">
            <div className="mb-2 text-center text-xs text-white/60">选择地图（原版 8 张竞技场）</div>
            <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4">
              {MAP_ORDER.map((id) => {
                const map = MAP_DEFINITIONS[id];
                return (
                  <button
                    key={id}
                    className={`rounded-lg border p-1 text-left text-xs transition ${
                      preMap === id ? "border-amber-400 bg-amber-500/20 text-amber-100" : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                    onClick={() => setPreMap(id)}
                  >
                    <div
                      aria-hidden="true"
                      className="mb-1 flex h-9 w-full items-center justify-center rounded text-[10px] font-bold text-black/55"
                      style={{ backgroundColor: MAP_SWATCHES[id] }}
                    >
                      MAP {id}
                    </div>
                    <div className="truncate">{map.name}</div>
                    <div className="text-[10px] text-white/40">{map.grid[0]}×{map.grid[1]}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-1 text-center text-[11px] text-white/45">{MAP_DEFINITIONS[preMap].description}</div>
            <div className="mt-1 text-center text-[10px] text-amber-200/60">数值按原版解包文件；单机 1v1 简化，部分模式/单位/物品仍在实现</div>
          </div>
          <div className="flex w-full max-w-md flex-col gap-3">
            <button
              className="rounded-xl border border-emerald-500/50 bg-emerald-900/40 p-4 text-left"
              onClick={() => setPendingFaction("elf")}
            >
              <div className="text-lg font-semibold text-emerald-300">精灵阵营</div>
              <div className="mt-1 text-xs text-white/60">前期全力发育，中期起塔压制，后期 66 座终极塔召唤大法师；可搬家逃跑或游走发育</div>
            </button>
            <button
              className="rounded-xl border border-orange-500/50 bg-orange-900/40 p-4 text-left"
              onClick={() => setPendingFaction("troll")}
            >
              <div className="text-lg font-semibold text-orange-300">巨魔阵营</div>
              <div className="mt-1 text-xs text-white/60">前期快速打钱投入攻击攻速，精灵反抗时补护甲血量；杀光精灵或堆到 16 万力量获胜</div>
            </button>
          </div>
        </div>
      ) : null}
      {pendingFaction ? (
        <HeroModelPicker
          faction={pendingFaction}
          selectedModelId={selectedModelId}
          onBack={() => setPendingFaction(null)}
          onConfirm={(modelId) => {
            modeRef.current = preMode;
            ruleRef.current = preRule;
            testModeRef.current = preTest;
            setSelectedModelId(modelId);
            setStartFaction(pendingFaction);
            setPendingFaction(null);
            setLoading(true);
          }}
        />
      ) : null}
      {startFaction && loading ? <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 text-sm text-white">加载中...</div> : null}
      {toast ? (
        <div className="pointer-events-none absolute left-1/2 top-28 z-30 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-amber-200">
          {toast}
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-sm text-rose-200" role="alert">
          <p>{error}</p>
          <div className="flex gap-3">
            <button className="rounded-lg bg-white/10 px-4 py-2 text-white" onClick={returnToSelection}>返回重选</button>
            <button className="rounded-lg bg-emerald-700 px-4 py-2 text-white" onClick={retryStage}>重试</button>
          </div>
        </div>
      ) : null}

      {snapshot ? (
        <>
          <div
            ref={joystickRef}
            className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-30 h-24 w-24 touch-none select-none rounded-full border border-white/20 bg-black/40 sm:h-28 sm:w-28"
            onPointerDown={startJoystick}
            onPointerMove={moveJoystick}
            onPointerUp={endJoystick}
            onPointerCancel={endJoystick}
            onTouchStart={(e) => {
              e.preventDefault();
              joystickActiveRef.current = true;
              if (e.touches[0]) updateJoystickXY(e.touches[0].clientX, e.touches[0].clientY);
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              if (joystickActiveRef.current && e.touches[0]) updateJoystickXY(e.touches[0].clientX, e.touches[0].clientY);
            }}
            onTouchEnd={endJoystick}
          >
            <div
              ref={joystickKnobRef}
              className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/70"
            />
          </div>
          <div className="pointer-events-none absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-lg bg-black/50 px-2 py-1 text-xs text-white">
            {snapshot.phase === "prep"
              ? `准备 ${Math.max(0, RULE_PREP[snapshot.rule] - snapshot.time).toFixed(0)}s`
              : `${snapshot.time.toFixed(0)}s`}
            <span className="ml-2 text-[10px] text-white/60">
              {snapshot.mapName} · {MODE_LABEL[snapshot.mode]} · {RULE_LABEL[snapshot.rule]}
              {snapshot.endLock ? ` · 封印:${snapshot.endLock === "elf" ? "精灵" : "巨魔"}` : ""}
            </span>
          </div>
          {showMore ? (
            <div className="pointer-events-none absolute right-3 top-[max(11rem,calc(env(safe-area-inset-top)+10rem))] z-30 flex w-56 flex-col gap-2 rounded-xl border border-white/10 bg-neutral-900/95 p-2 text-xs text-white landscape:right-[18rem] landscape:top-[max(0.75rem,env(safe-area-inset-top))]">
              <button className="pointer-events-auto rounded-lg bg-white/10 px-2 py-2" onClick={() => restart(!snapshot.testMode)}>
                {snapshot.testMode ? "测试模式" : "常规模式"}
              </button>
              <select className="pointer-events-auto rounded-lg bg-white/10 px-2 py-2" value={snapshot.mode} onChange={(e) => restart(snapshot.testMode, e.target.value as Mode, snapshot.rule)}>
                {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select>
              <select className="pointer-events-auto rounded-lg bg-white/10 px-2 py-2" value={snapshot.rule} onChange={(e) => restart(snapshot.testMode, snapshot.mode, e.target.value as Rule)}>
                {(Object.keys(RULE_LABEL) as Rule[]).map((r) => <option key={r} value={r}>{RULE_LABEL[r]}</option>)}
              </select>
              <div className="flex gap-2">
                <button className="pointer-events-auto flex-1 rounded-lg bg-white/10 px-2 py-2" onClick={() => stageRef.current?.zoomBy(1.25)}>＋</button>
                <button className="pointer-events-auto flex-1 rounded-lg bg-white/10 px-2 py-2" onClick={() => stageRef.current?.zoomBy(0.8)}>－</button>
                <button className="pointer-events-auto flex-1 rounded-lg bg-white/10 px-2 py-2" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); }}>全屏</button>
              </div>
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-28 right-2 z-30 flex flex-wrap justify-end gap-1.5 sm:left-36 sm:right-3 sm:gap-2">
            <button className="pointer-events-auto rounded-lg bg-black/70 px-3 py-3 text-xs text-white" onClick={() => toggleSheet(snapshot.faction === "elf" ? "build" : "shop")}>
              {snapshot.faction === "elf" ? "建造" : "商店"}
            </button>
            {SKILLS[snapshot.faction].map((spec) => (
              <button
                key={spec.key}
                className="pointer-events-auto rounded-lg bg-black/70 px-2 py-3 text-[11px] text-white disabled:opacity-40"
                disabled={(snapshot.cooldowns[spec.key] ?? 0) > 0 || snapshot.mana < spec.manaCost}
                title={`${spec.label}：${spec.desc}（${spec.manaCost} 法力）`}
                onClick={() => {
                  const s = stateRef.current;
                  if (s) { castSkill(s, spec.key, hoverRef.current); sync(); }
                }}
              >
                <span
                  className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] leading-none"
                  style={{ background: SKILL_ICONS[spec.key].background, color: SKILL_ICONS[spec.key].color }}
                >
                  {SKILL_ICONS[spec.key].glyph}
                </span>
                {spec.label}
                {(snapshot.cooldowns[spec.key] ?? 0) > 0 ? ` ${Math.ceil(snapshot.cooldowns[spec.key])}s` : ""}
              </button>
            ))}
            {snapshot.faction === "elf" ? (
              <>
                <button
                  className="pointer-events-auto rounded-lg bg-amber-800 px-2 py-3 text-[11px] text-white disabled:opacity-40"
                  disabled={!snapshot.wallUpgrade.ok}
                  title={snapshot.wallUpgrade.ok
                    ? `升墙 Lv${snapshot.wallUpgrade.level + 1}：${snapshot.wallUpgrade.cost} 金${snapshot.wallUpgrade.wood ? ` · ${snapshot.wallUpgrade.wood} 木` : ""}`
                    : snapshot.wallUpgrade.reason}
                  onClick={() => { const s = stateRef.current; if (s) { upgradeKind(s, "wall"); sync(); } }}
                >
                  升墙{snapshot.wallUpgrade.ok ? ` ${snapshot.wallUpgrade.cost}` : ""}
                </button>
                <button
                  className="pointer-events-auto rounded-lg bg-amber-800 px-2 py-3 text-[11px] text-white disabled:opacity-40"
                  disabled={!snapshot.houseUpgrade.ok}
                  title={snapshot.houseUpgrade.ok
                    ? `升房 Lv${snapshot.houseUpgrade.level + 1}：${snapshot.houseUpgrade.cost} 金${snapshot.houseUpgrade.wood ? ` · ${snapshot.houseUpgrade.wood} 木` : ""}`
                    : snapshot.houseUpgrade.reason}
                  onClick={() => { const s = stateRef.current; if (s) { upgradeKind(s, "tent"); sync(); } }}
                >
                  升房{snapshot.houseUpgrade.ok ? ` ${snapshot.houseUpgrade.cost}` : ""}
                </button>
                <button
                  className="pointer-events-auto rounded-lg bg-emerald-800 px-2 py-3 text-[11px] text-white"
                  title="免费维修墙/建筑（原版修理不消耗资源）"
                  onClick={() => { const s = stateRef.current; if (s) { repairWall(s, "wall"); sync(); } }}
                >
                  维修
                </button>
                <button
                  className="pointer-events-auto rounded-lg bg-rose-800 px-2 py-3 text-[11px] text-white disabled:opacity-40"
                  disabled={!snapshot.demolish?.ok}
                  onClick={() => {
                    const s = stateRef.current;
                    if (s && selectedRef.current !== null) { demolishBuilding(s, selectedRef.current); selectedRef.current = null; sync(); }
                  }}
                >
                  拆除
                </button>
                <button
                  className="pointer-events-auto rounded-lg bg-black/70 px-2 py-3 text-[11px] text-white"
                  onClick={() => { const s = stateRef.current; if (s) { toggleMobileDev(s); sync(); } }}
                >
                  游走{snapshot.mobileDev ? "开" : "关"}
                </button>
                <button className="pointer-events-auto rounded-lg bg-black/70 px-2 py-3 text-[11px] text-white" onClick={() => { migrateRef.current = true; }}>迁移</button>
              </>
            ) : null}
          </div>
          <button
            className="pointer-events-auto absolute right-3 top-[max(8rem,calc(env(safe-area-inset-top)+7rem))] z-30 rounded-lg bg-black/70 px-3 py-2 text-xs text-white"
            onClick={() => setShowMore(!showMore)}
          >
            更多
          </button>
          <div className="pointer-events-none absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-lg bg-black/60 px-3 py-2 text-right text-xs text-white">
            <div>金币 {Math.floor(snapshot.gold)} · 木材 {Math.floor(snapshot.wood)}</div>
            <div>生命 {Math.max(0, snapshot.hp).toFixed(0)}/{snapshot.maxHp} · 法力 {Math.floor(snapshot.mana)}/{snapshot.maxMana} · 剩余 {snapshot.lives}</div>
            <div className="text-white/60">击杀 {snapshot.stats.kills} · 摧毁 {snapshot.stats.destroyed}</div>
            {snapshot.trollItems.length ? (
              <div className="text-[10px] text-amber-200/70">巨魔装备 {snapshot.trollItems.length}/{RULES.equipmentShop.items.length}</div>
            ) : null}
            {snapshot.faction === "troll" ? (
              <div className="text-[10px] text-orange-200/80">
                力量 {snapshot.trollStrength}/{SCENARIO_RULE.troll.strengthWin}
              </div>
            ) : null}
          </div>
          {snapshot.hasMarket ? (
            <div className="pointer-events-none absolute right-3 top-24 flex gap-2">
              <button
                className="pointer-events-auto rounded-lg bg-black/60 px-2 py-1 text-[11px] text-white"
                onClick={() => {
                  const s = stateRef.current;
                  if (s) { tradeWood(s, true); sync(); }
                }}
              >
                买木 {MARKET_RULE.tradeAmount} · {snapshot.woodPriceIn} 金
              </button>
              <button
                className="pointer-events-auto rounded-lg bg-black/60 px-2 py-1 text-[11px] text-white"
                onClick={() => {
                  const s = stateRef.current;
                  if (s) { tradeWood(s, false); sync(); }
                }}
              >
                卖木 {MARKET_RULE.tradeAmount} · +{snapshot.woodPriceOut} 金
              </button>
            </div>
          ) : null}
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
            <div className="absolute bottom-24 left-1/2 z-20 max-w-[95vw] -translate-x-1/2 overflow-x-auto rounded-xl border border-white/10 bg-neutral-900/95 p-3 text-white">
              {sheet === "build" ? (
                <div className="flex flex-wrap gap-2">
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
                        <div className="text-white/60">
                          {def.levels[0].cost} 金{def.levels[0].woodCost ? ` · ${def.levels[0].woodCost} 木` : ""}
                        </div>
                        <div className="mt-1 text-[10px] text-white/40">{def.desc}</div>
                      </button>
                    );
                  })}
                </div>
              ) : sheet === "shop" ? (
                <div className="max-h-[45vh] max-w-[92vw] overflow-y-auto pr-1">
                  {Array.from(new Set(EQUIPMENT_RULE.items.map((i) => i.shop ?? "其他"))).map((group) => (
                    <div key={group} className="mb-3">
                      <div className="mb-1 text-[11px] font-semibold text-amber-200/80">{group}</div>
                      <div className="flex flex-wrap gap-2">
                        {EQUIPMENT_RULE.items.filter((i) => (i.shop ?? "其他") === group).map((item) => (
                          <button
                            key={item.key}
                            className="min-w-[92px] max-w-[150px] rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-left text-xs"
                            disabled={snapshot.trollItems.includes(item.key)}
                            title={item.note}
                            onClick={() => {
                              const s = stateRef.current;
                              if (s) {
                                const ok = buyEquipment(s, item.key);
                                if (!ok) setHintLocal("需回到巨魔商店附近且资源足够");
                                sync();
                              }
                            }}
                          >
                            <span
                              className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] leading-none"
                              style={{ background: itemIcon(item.key).background, color: itemIcon(item.key).color }}
                            >
                              {itemIcon(item.key).glyph}
                            </span>
                            <span className="font-semibold">{item.label}</span>
                            <div className="text-white/60">{item.gold} 金{item.wood ? ` · ${item.wood} 木` : ""}</div>
                            {item.note ? <div className="mt-1 text-[9px] text-amber-200/60">原版效果未实现</div> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {SCENARIO_RULE.troll.strengthBooks.map((book) => (
                    <button
                      key={book.key}
                      className="min-w-[92px] rounded-lg border border-orange-400/40 bg-orange-900/30 px-2 py-2 text-xs"
                      onClick={() => {
                        const s = stateRef.current;
                        if (s) {
                          const ok = buyStrengthBook(s, book.key);
                          if (!ok) setHintLocal("需回到巨魔商店附近且金币足够");
                          sync();
                        }
                      }}
                    >
                      <div className="font-semibold">{book.label}</div>
                      <div className="text-white/60">{book.gold} 金</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {SKILLS[snapshot.faction].map((spec) => (
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
                      <span
                        className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] leading-none"
                        style={{ background: SKILL_ICONS[spec.key].background, color: SKILL_ICONS[spec.key].color }}
                      >
                        {SKILL_ICONS[spec.key].glyph}
                      </span>
                      <span className="font-semibold">{spec.label}</span>
                      <div className="text-white/60">{(snapshot.cooldowns[spec.key] ?? 0) > 0 ? `${Math.ceil(snapshot.cooldowns[spec.key])}s` : "就绪"} · {spec.manaCost} 法力</div>
                      <div className="mt-1 text-[10px] text-white/40">{spec.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {snapshot.selected ? (
            <div className="absolute bottom-24 right-3 z-20 rounded-xl border border-white/10 bg-neutral-900/95 p-3 text-xs text-white">
              <div className="font-semibold">{snapshot.selected.label} Lv{snapshot.selected.level}</div>
              <div>HP {Math.max(0, snapshot.selected.hp).toFixed(0)}/{snapshot.selected.maxHp}</div>
              <div className="mt-1 text-white/60">
                {snapshot.selected.canUpgrade
                  ? `升级需 ${snapshot.selected.cost} 金${snapshot.selected.woodCost ? ` · ${snapshot.selected.woodCost} 木` : ""}`
                  : "已满级"}
              </div>
              {snapshot.demolish && !snapshot.demolish.ok ? (
                <div className="mt-1 text-[10px] text-rose-300/70">{snapshot.demolish.reason}</div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
