"use client";

// 「巨魔 VS 精灵」HUD：纯展示组件，所有状态由 TveGame 传入。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Castle,
  Coins,
  Crosshair,
  Hammer,
  Heart,
  Maximize,
  Minimize,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Sun,
  Swords,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from "lucide-react";

import { BUILD_SPECS, DIFFICULTIES, TROLL_UPGRADES } from "@/lib/tve/config";
import type { BuildingKind, Difficulty, Faction, GameResult, UpgradeTrack } from "@/lib/tve/types";
import { UI_IMAGES } from "@/lib/tve/assets";
import { cn } from "@/lib/utils";

export interface HudBase {
  id: number;
  name: string;
  alive: boolean;
  hp: number;
  maxHp: number;
  isPlayer: boolean;
}

export interface HudSelected {
  id: number;
  kind: BuildingKind;
  level: number;
  hp: number;
  maxHp: number;
  upgradeCost: number | null;
  refund: number;
}

export interface HudSnapshot {
  faction: Faction;
  difficulty: Difficulty;
  gold: number;
  trollHp: number;
  trollMaxHp: number;
  night: boolean;
  dayTimer: number;
  time: number;
  hint: string | null;
  result: GameResult;
  bases: HudBase[];
  villagers: number;
  selected: HudSelected | null;
  placingKind: BuildingKind | null;
  claw: number;
  swift: number;
  hide: number;
  rushCd: number;
  stats: { kills: number; destroyed: number; goldEarned: number };
}

const KIND_ICON: Record<BuildingKind, typeof Coins> = {
  tree: Castle,
  mine: Coins,
  wall: Shield,
  arrow: Crosshair,
  magic: Sparkles,
};

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function IconButton({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-xl border border-white/15 bg-black/45 text-white/85 backdrop-blur transition-colors active:scale-95 sm:size-10",
        active && "bg-amber-400/25 text-amber-200",
      )}
    >
      {children}
    </button>
  );
}

/** 左上角资源/时间/阵营信息 */
function TopBar({
  hud,
  soundOn,
  fullscreen,
  onPause,
  onSound,
  onFullscreen,
  onExit,
}: {
  hud: HudSnapshot;
  soundOn: boolean;
  fullscreen: boolean;
  onPause: () => void;
  onSound: () => void;
  onFullscreen: () => void;
  onExit: () => void;
}) {
  const isTroll = hud.faction === "troll";
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 px-2"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div className="pointer-events-auto mx-auto flex max-w-3xl items-start gap-2">
        <div className="flex shrink-0 gap-1 sm:gap-1.5">
          <IconButton label="暂停" onClick={onPause}>
            <Pause className="size-4" />
          </IconButton>
          <IconButton label={soundOn ? "关闭音效" : "开启音效"} onClick={onSound}>
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </IconButton>
          <div className="hidden sm:block">
            <IconButton label="全屏" onClick={onFullscreen} active={fullscreen}>
              {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </IconButton>
          </div>
          <IconButton label="返回菜单" onClick={onExit}>
            <ArrowLeft className="size-4" />
          </IconButton>
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <div className="flex items-center gap-1 whitespace-nowrap rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur sm:gap-2 sm:px-3 sm:py-1 sm:text-xs">
            {hud.night ? <Moon className="size-3.5 text-sky-300" /> : <Sun className="size-3.5 text-amber-300" />}
            <span className={hud.night ? "text-sky-200" : "text-amber-100"}>
              {hud.night ? "夜晚" : "白天"} {formatTime(hud.dayTimer)}
            </span>
            <span className="text-white/30">|</span>
            <Swords className="size-3.5 text-rose-300" />
            <span className="text-white/80">{isTroll ? "巨魔" : "精灵"}</span>
          </div>

          <div className="flex w-full max-w-md items-center gap-1.5 sm:gap-2">
            {hud.faction === "elf" ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-black/50 px-1.5 py-1 backdrop-blur sm:px-2">
                <span className="hidden whitespace-nowrap text-[10px] text-white/55 sm:inline">生命之树</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${hud.bases[0] ? (hud.bases[0].hp / hud.bases[0].maxHp) * 100 : 0}%` }}
                  />
                </div>
                <span className="whitespace-nowrap text-[9px] text-white/70 sm:text-[10px]">
                  {hud.bases[0] ? `${Math.ceil(hud.bases[0].hp)}/${hud.bases[0].maxHp}` : "-"}
                </span>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-black/50 px-1.5 py-1 backdrop-blur sm:gap-2 sm:px-2">
                <span className="hidden whitespace-nowrap text-[10px] text-rose-200 sm:inline">巨魔</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-rose-400" style={{ width: `${(hud.trollHp / hud.trollMaxHp) * 100}%` }} />
                </div>
                <span className="whitespace-nowrap text-[9px] text-white/70 sm:text-[10px]">
                  {Math.ceil(hud.trollHp)}/{hud.trollMaxHp}
                </span>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-300/30 bg-black/50 px-1.5 py-1 text-amber-200 backdrop-blur sm:px-2">
              <Coins className="size-3 sm:size-3.5" />
              <span className="text-[11px] font-semibold sm:text-xs">{Math.floor(hud.gold)}</span>
            </div>
          </div>
        </div>

        {hud.faction === "troll" ? (
          <div className="flex w-[3.25rem] shrink-0 flex-col gap-1 sm:w-16">
            {hud.bases.map((base) => (
              <div key={base.id} className="flex min-w-0 items-center gap-1">
                <span className={cn("shrink-0 whitespace-nowrap text-[9px]", base.alive ? "text-emerald-200" : "text-white/30 line-through")}>
                  {base.name.slice(0, 2)}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                  <div
                    className={cn("h-full rounded-full", base.alive ? "bg-emerald-400" : "bg-white/20")}
                    style={{ width: base.alive ? `${(base.hp / base.maxHp) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex w-[3.25rem] shrink-0 flex-col items-end gap-1 rounded-xl border border-white/10 bg-black/40 px-1 py-1 text-[8px] whitespace-nowrap text-white/60 backdrop-blur sm:w-16 sm:px-1.5 sm:text-[9px]">
            <span>盟友 {hud.bases.filter((b) => b.alive && !b.isPlayer).length}/2</span>
            <span>村民 {hud.villagers}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Minimap({ canvasRef, night, size = 92 }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; night: boolean; size?: number }) {
  return (
    <div className="pointer-events-none absolute right-2 top-24 z-20 hidden sm:block">
      <div
        className={cn(
          "overflow-hidden rounded-xl border shadow-lg",
          night ? "border-sky-300/25 bg-slate-950/70" : "border-amber-200/25 bg-emerald-950/70",
        )}
        style={{ width: size, height: size }}
      >
        <canvas ref={canvasRef} style={{ width: size, height: size }} />
      </div>
    </div>
  );
}

function SelectedPanel({
  selected,
  gold,
  onUpgrade,
  onDemolish,
  onClose,
}: {
  selected: HudSelected;
  gold: number;
  onUpgrade: () => void;
  onDemolish: () => void;
  onClose: () => void;
}) {
  const Icon = KIND_ICON[selected.kind];
  const canUpgrade = selected.upgradeCost !== null && gold >= selected.upgradeCost;
  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-28 z-30 mx-auto max-w-sm rounded-2xl border border-white/15 bg-slate-950/85 p-3 text-white shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-200">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {BUILD_SPECS[selected.kind].label} Lv.{selected.level}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(selected.hp / selected.maxHp) * 100}%` }} />
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10" aria-label="关闭">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-white/60">{BUILD_SPECS[selected.kind].desc}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canUpgrade}
          onClick={onUpgrade}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
            canUpgrade ? "bg-emerald-500 text-emerald-950 active:scale-95" : "bg-white/10 text-white/35",
          )}
        >
          <Sparkles className="size-3.5" />
          {selected.upgradeCost === null ? "已满级" : `升级 ${selected.upgradeCost}`}
        </button>
        <button
          type="button"
          onClick={onDemolish}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/75 active:scale-95"
        >
          <RotateCcw className="size-3.5" />
          拆除 +{selected.refund}
        </button>
      </div>
    </div>
  );
}

function BuildBar({
  hud,
  onBuild,
  onCancel,
}: {
  hud: HudSnapshot;
  onBuild: (kind: BuildingKind) => void;
  onCancel: () => void;
}) {
  const kinds: BuildingKind[] = ["mine", "wall", "arrow", "magic"];
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 px-2"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-center gap-2">
        {hud.placingKind && (
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-col items-center justify-center rounded-xl border border-rose-300/40 bg-rose-500/20 px-2 text-rose-100"
          >
            <X className="size-5" />
            <span className="text-[10px]">取消</span>
          </button>
        )}
        {kinds.map((kind, index) => {
          const spec = BUILD_SPECS[kind];
          const Icon = KIND_ICON[kind];
          const affordable = hud.gold >= spec.levels[0].cost;
          const active = hud.placingKind === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onBuild(kind)}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl border px-1 py-2 text-white backdrop-blur transition-all active:scale-95",
                active
                  ? "border-amber-300 bg-amber-400/25 text-amber-100"
                  : affordable
                    ? "border-white/15 bg-slate-950/70"
                    : "border-white/10 bg-slate-950/45 text-white/35",
              )}
            >
              <span className="absolute left-1 top-1 text-[9px] text-white/35">{index + 1}</span>
              <Icon className="size-5" />
              <span className="text-[11px] font-medium">{spec.label}</span>
              <span className="flex items-center gap-0.5 text-[10px] text-amber-200/85">
                <Coins className="size-2.5" />
                {spec.levels[0].cost}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const el = baseRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width / 2 - 16;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      setKnob({ x: dx, y: dy });
      const nx = dx / max;
      const ny = dy / max;
      const dead = 0.14;
      const mag = Math.hypot(nx, ny);
      if (mag < dead) {
        onChange(0, 0);
      } else {
        onChange(nx, ny);
      }
    },
    [onChange],
  );

  const end = useCallback(() => {
    pointerRef.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  }, [onChange]);

  return (
    <div
      ref={baseRef}
      className="pointer-events-auto relative size-28 touch-none select-none rounded-full border border-white/20 bg-black/35 backdrop-blur"
      onPointerDown={(event) => {
        pointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (pointerRef.current !== event.pointerId) return;
        update(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (pointerRef.current === event.pointerId) end();
      }}
      onPointerCancel={end}
    >
      <div className="absolute inset-4 rounded-full border border-white/10" />
      <div
        className="absolute left-1/2 top-1/2 size-12 rounded-full bg-gradient-to-br from-emerald-300/90 to-emerald-600/90 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function TrollUpgradeSheet({
  hud,
  onBuy,
  onClose,
}: {
  hud: HudSnapshot;
  onBuy: (track: UpgradeTrack) => void;
  onClose: () => void;
}) {
  const tracks: UpgradeTrack[] = ["claw", "swift", "hide"];
  const icons = { claw: Zap, swift: Wind, hide: Heart };
  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-24 z-30 mx-auto max-w-sm rounded-2xl border border-white/15 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Zap className="size-4 text-rose-300" />
          巨魔强化
        </p>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10" aria-label="关闭">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {tracks.map((track) => {
          const spec = TROLL_UPGRADES[track];
          const level = hud[track];
          const maxed = level >= spec.costs.length;
          const cost = maxed ? 0 : spec.costs[level];
          const Icon = icons[track];
          const affordable = !maxed && hud.gold >= cost;
          return (
            <div key={track} className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-rose-500/20 text-rose-200">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{spec.label}</p>
                <p className="text-[10px] text-white/55">{spec.desc}</p>
                <div className="mt-1 flex gap-1">
                  {spec.costs.map((_, index) => (
                    <span key={index} className={cn("h-1.5 flex-1 rounded-full", index < level ? "bg-rose-400" : "bg-white/15")} />
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={!affordable}
                onClick={() => onBuy(track)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 text-[11px] font-semibold",
                  affordable ? "bg-rose-500 text-white active:scale-95" : "bg-white/10 text-white/35",
                )}
              >
                {maxed ? (
                  "满级"
                ) : (
                  <>
                    <Coins className="size-3" />
                    {cost}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface TveHudProps {
  hud: HudSnapshot;
  paused: boolean;
  soundOn: boolean;
  fullscreen: boolean;
  upgradeOpen: boolean;
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
  onBuild: (kind: BuildingKind) => void;
  onCancelPlacement: () => void;
  onUpgrade: () => void;
  onDemolish: () => void;
  onBuyUpgrade: (track: UpgradeTrack) => void;
  onRush: () => void;
  onTogglePause: () => void;
  onToggleSound: () => void;
  onToggleFullscreen: () => void;
  onToggleUpgrade: () => void;
  onExit: () => void;
  onCloseSelected: () => void;
  onJoystick: (x: number, y: number) => void;
}

export function TveHud(props: TveHudProps) {
  const { hud } = props;
  const isTroll = hud.faction === "troll";
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      <TopBar
        hud={hud}
        soundOn={props.soundOn}
        fullscreen={props.fullscreen}
        onPause={props.onTogglePause}
        onSound={props.onToggleSound}
        onFullscreen={props.onToggleFullscreen}
        onExit={props.onExit}
      />

      <Minimap canvasRef={props.minimapRef} night={hud.night} />

      {hud.hint && (
        <div className="absolute inset-x-0 top-[7rem] z-20 flex justify-center px-4 sm:top-24">
          <div className="rounded-full border border-white/15 bg-black/65 px-4 py-1.5 text-center text-xs font-medium text-white shadow-lg backdrop-blur">
            {hud.hint}
          </div>
        </div>
      )}

      {hud.selected && hud.faction === "elf" && (
        <SelectedPanel
          selected={hud.selected}
          gold={hud.gold}
          onUpgrade={props.onUpgrade}
          onDemolish={props.onDemolish}
          onClose={props.onCloseSelected}
        />
      )}

      {hud.faction === "elf" && (
        <BuildBar hud={hud} onBuild={props.onBuild} onCancel={props.onCancelPlacement} />
      )}

      {isTroll && (
        <>
          <div
            className="absolute left-3 z-30"
            style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <Joystick onChange={props.onJoystick} />
          </div>
          <div
            className="pointer-events-auto absolute right-3 z-30 flex flex-col items-center gap-2"
            style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              onClick={props.onRush}
              disabled={hud.rushCd > 0}
              className={cn(
                "relative flex size-20 flex-col items-center justify-center rounded-full border-2 text-white shadow-xl backdrop-blur transition-transform active:scale-95",
                hud.rushCd > 0
                  ? "border-white/15 bg-slate-900/60 text-white/40"
                  : "border-amber-300/80 bg-amber-500/30 text-amber-100",
              )}
            >
              <Zap className="size-6" />
              <span className="text-[11px] font-semibold">冲锋</span>
              {hud.rushCd > 0 && <span className="text-[10px]">{Math.ceil(hud.rushCd)}s</span>}
            </button>
            <button
              type="button"
              onClick={props.onToggleUpgrade}
              className="flex size-14 flex-col items-center justify-center rounded-full border border-white/20 bg-slate-950/70 text-white shadow-lg backdrop-blur active:scale-95"
            >
              <Hammer className="size-5" />
              <span className="text-[10px]">强化</span>
            </button>
          </div>
          {props.upgradeOpen && <TrollUpgradeSheet hud={hud} onBuy={props.onBuyUpgrade} onClose={props.onToggleUpgrade} />}
        </>
      )}

      {props.paused && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-slate-950/70 backdrop-blur">
          <p className="text-lg font-semibold text-white">已暂停</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={props.onTogglePause}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 active:scale-95"
            >
              <Play className="size-4" />
              继续
            </button>
            <button
              type="button"
              onClick={props.onExit}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white active:scale-95"
            >
              <ArrowLeft className="size-4" />
              返回菜单
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TveResult({
  hud,
  onRestart,
  onMenu,
}: {
  hud: HudSnapshot;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const win = hud.result === "win";
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur">
      <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-slate-900/90 p-6 text-center text-white shadow-2xl">
        <p className={cn("text-3xl font-black tracking-wide", win ? "text-amber-300" : "text-rose-400")}>
          {win ? "胜 利" : "失 败"}
        </p>
        <p className="mt-1 text-xs text-white/55">
          {hud.faction === "elf" ? "精灵阵营" : "巨魔阵营"} · {DIFFICULTIES[hud.difficulty].label}难度
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/5 p-2">
            <p className="text-[10px] text-white/45">存活</p>
            <p className="text-sm font-semibold">{formatTime(hud.time)}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-2">
            <p className="text-[10px] text-white/45">{hud.faction === "elf" ? "击杀村民" : "摧毁建筑"}</p>
            <p className="text-sm font-semibold">{hud.faction === "elf" ? hud.stats.kills : hud.stats.destroyed}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-2">
            <p className="text-[10px] text-white/45">累计金币</p>
            <p className="text-sm font-semibold">{Math.floor(hud.stats.goldEarned)}</p>
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-emerald-950 active:scale-95"
          >
            <RotateCcw className="size-4" />
            再来一局
          </button>
          <button
            type="button"
            onClick={onMenu}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white active:scale-95"
          >
            <ArrowLeft className="size-4" />
            返回菜单
          </button>
        </div>
      </div>
    </div>
  );
}

export function TveMenu({
  ready,
  progress,
  onStart,
}: {
  ready: boolean;
  progress: number;
  onStart: (faction: Faction, difficulty: Difficulty) => void;
}) {
  const [faction, setFaction] = useState<Faction>("elf");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onerror = () => setCoverFailed(true);
    img.src = UI_IMAGES.cover;
  }, []);

  return (
    <div className="absolute inset-0 z-50 overflow-y-auto bg-slate-950 text-white">
      <div className="relative min-h-full">
        {!coverFailed && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${UI_IMAGES.cover})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-950/70 to-slate-950" />
        <div className="relative mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 py-10">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.35em] text-amber-200/70">Troll vs Elves</p>
            <h1 className="mt-2 text-4xl font-black tracking-wider text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
              巨魔 <span className="text-rose-400">VS</span> 精灵
            </h1>
            <p className="mt-2 text-xs text-white/55">白天发育，夜晚求生 · 非对称单机对抗</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {(
              [
                { key: "elf", title: "精灵", sub: "采金 · 建墙 · 守塔", img: UI_IMAGES.elf },
                { key: "troll", title: "巨魔", sub: "夜袭 · 拆家 · 猎杀", img: UI_IMAGES.troll },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFaction(item.key)}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border-2 text-left transition-all active:scale-[0.98]",
                  faction === item.key
                    ? "border-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.35)]"
                    : "border-white/15 opacity-80",
                )}
              >
                <div className="aspect-[4/5] w-full bg-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.img} alt={item.title} className="size-full object-cover object-top" />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-3">
                  <p className="text-base font-bold">{item.title}</p>
                  <p className="text-[11px] text-white/60">{item.sub}</p>
                </div>
                {faction === item.key && (
                  <span className="absolute right-2 top-2 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                    选择
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs text-white/50">难度</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDifficulty(key)}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-xs font-semibold transition-colors",
                    difficulty === key
                      ? "border-amber-300 bg-amber-400/20 text-amber-100"
                      : "border-white/15 bg-white/5 text-white/65",
                  )}
                >
                  {DIFFICULTIES[key].label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 h-4 text-[10px] text-white/40">{DIFFICULTIES[difficulty].desc}</p>
          </div>

          <button
            type="button"
            disabled={!ready}
            onClick={() => onStart(faction, difficulty)}
            className={cn(
              "mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold transition-all active:scale-[0.98]",
              ready ? "bg-amber-400 text-amber-950 shadow-lg" : "bg-white/10 text-white/40",
            )}
          >
            <Swords className="size-4" />
            {ready ? "开始对战" : `资源加载中 ${Math.round(progress * 100)}%`}
          </button>

          <div className="mt-4 space-y-1 text-center text-[10px] leading-relaxed text-white/35">
            <p>精灵：点击下方建造栏 → 点击地面放置；点选建筑可升级或拆除。</p>
            <p>巨魔：左侧摇杆移动，自动攻击近处目标；夜间自动强化。</p>
            <p>桌面：WASD 移动、1-4 建造、Esc 取消、空格暂停、滚轮缩放。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
