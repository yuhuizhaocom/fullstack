"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import { BUILDINGS, PHASE_LABEL, SKILLS, buildingCost, costLabel } from "@/lib/hunter/config";
import type {
  BuildingKind,
  HunterSettings,
  Mode,
  Phase,
  ResearchKind,
  Side,
  SkillId,
  UnitKind,
} from "@/lib/hunter/types";

import type { HireOption } from "./hunter-panels";

export type GamePanel = "build" | "hire" | "research" | "shop" | "settings" | null;
export type HudAction = Exclude<GamePanel, null> | "control";

export type HudSnapshot = {
  side: Side;
  mode: Mode;
  time: number;
  remaining: number;
  phase: Phase;
  gold: number;
  animalTotal: number;
  hunterLives: number;
  unitName: string;
  unitKind: UnitKind;
  unitHp: number;
  unitMaxHp: number;
  unitDead: boolean;
  respawnIn: number;
  heroLives: number;
  speed: number;
  skills: SkillId[];
  skillCd: Record<SkillId, number>;
  canControlGolem: boolean;
  controllingGolem: boolean;
  hireOptions: HireOption[];
  merchantNear: boolean;
  owned: { hammer: boolean; gloves: boolean; poison: boolean };
  stock: { horns: number; mines: number; potions: number };
  research: Record<ResearchKind, number>;
  hasLab: boolean;
};

const PHASE_STYLE: Record<Phase, string> = {
  hide: "border-emerald-500/60 bg-emerald-950/70 text-emerald-200",
  expand: "border-amber-500/60 bg-amber-950/70 text-amber-200",
  reversal: "border-rose-500/60 bg-rose-950/70 text-rose-200",
  over: "border-neutral-500/60 bg-neutral-900/70 text-neutral-200",
};

const SCALE: Record<HunterSettings["buttonScale"], { action: number; skill: number; joy: number }> = {
  compact: { action: 44, skill: 54, joy: 98 },
  normal: { action: 50, skill: 62, joy: 116 },
  large: { action: 58, skill: 72, joy: 134 },
};

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

function Chip(props: { icon: string; value: string | number; tone?: string }) {
  return (
    <span
      className={`flex items-center gap-0.5 rounded-md border border-amber-900/50 bg-black/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
        props.tone ?? "text-amber-100"
      }`}
    >
      <span className="text-[10px] leading-none">{props.icon}</span>
      {props.value}
    </span>
  );
}

function Joystick(props: {
  size: number;
  side: "left" | "right";
  onVector: (x: number, y: number) => void;
}) {
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const activeRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const maxR = props.size / 2 - props.size * 0.2;

  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeRef.current !== event.pointerId || !originRef.current) return;
    let dx = event.clientX - originRef.current.x;
    let dy = event.clientY - originRef.current.y;
    const d = Math.hypot(dx, dy);
    if (d > maxR && d > 0) {
      dx = (dx / d) * maxR;
      dy = (dy / d) * maxR;
    }
    setThumb({ x: dx, y: dy });
    props.onVector(dx / maxR, dy / maxR);
  };

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    activeRef.current = event.pointerId;
    update(event);
  };

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeRef.current !== event.pointerId) return;
    activeRef.current = null;
    originRef.current = null;
    setThumb({ x: 0, y: 0 });
    props.onVector(0, 0);
  };

  return (
    <div
      className="pointer-events-auto relative touch-none rounded-full border-2 border-amber-500/35 bg-black/35"
      style={{ width: props.size, height: props.size }}
      onPointerDown={begin}
      onPointerMove={update}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="absolute inset-[18%] rounded-full border border-amber-400/20" />
      <div
        className="absolute left-1/2 top-1/2 rounded-full border border-amber-300/60 bg-amber-500/50 shadow-lg"
        style={{
          width: props.size * 0.4,
          height: props.size * 0.4,
          transform: `translate(calc(-50% + ${thumb.x}px), calc(-50% + ${thumb.y}px))`,
        }}
      />
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] tracking-widest text-amber-200/50">
        移动
      </span>
    </div>
  );
}

export function HunterHud(props: {
  side: Side;
  snapshot: HudSnapshot;
  settings: HunterSettings;
  panel: GamePanel;
  ghost: { kind: BuildingKind; valid: boolean } | null;
  cast: SkillId | null;
  toast: { id: number; text: string } | null;
  banner: string | null;
  minimapRef: RefObject<HTMLCanvasElement | null>;
  onPause: () => void;
  onSpeed: () => void;
  onSkill: (skill: SkillId) => void;
  onAction: (action: HudAction) => void;
  onJoystick: (x: number, y: number) => void;
  onMinimap: (nx: number, ny: number) => void;
  onConfirmGhost: () => void;
  onCancelGhost: () => void;
  onCancelCast: () => void;
}) {
  const sizes = SCALE[props.settings.buttonScale];
  const snapshot = props.snapshot;
  const joystickRight = props.settings.joystickSide === "right";
  const hpRatio = snapshot.unitMaxHp > 0 ? Math.max(0, snapshot.unitHp / snapshot.unitMaxHp) : 0;
  const joystickStyle = joystickRight
    ? { right: "max(env(safe-area-inset-right), 12px)", bottom: "max(env(safe-area-inset-bottom), 14px)" }
    : { left: "max(env(safe-area-inset-left), 12px)", bottom: "max(env(safe-area-inset-bottom), 14px)" };
  const clusterStyle = joystickRight
    ? { left: "max(env(safe-area-inset-left), 12px)", bottom: "max(env(safe-area-inset-bottom), 14px)" }
    : { right: "max(env(safe-area-inset-right), 12px)", bottom: "max(env(safe-area-inset-bottom), 14px)" };

  const actions: { key: HudAction; label: string; icon: string; active: boolean; disabled?: boolean }[] =
    props.side === "hunter"
      ? [
          { key: "shop", label: "商店", icon: "🛒", active: props.panel === "shop" },
          { key: "hire", label: "雇佣", icon: "🛡️", active: props.panel === "hire" },
        ]
      : [
          { key: "build", label: "建造", icon: "🏗️", active: props.panel === "build" },
          { key: "hire", label: "招募", icon: "🛡️", active: props.panel === "hire" },
          { key: "research", label: "科技", icon: "📚", active: props.panel === "research" },
          {
            key: "control",
            label: snapshot.controllingGolem ? "回英雄" : "傀儡",
            icon: snapshot.controllingGolem ? "🧑‍🌾" : "🗿",
            active: snapshot.controllingGolem,
            disabled: !snapshot.canControlGolem,
          },
        ];

  const ghostCost = props.ghost ? buildingCost(props.ghost.kind, snapshot.mode) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* 顶部：暂停 / 计时 / 资源 */}
      <div
        className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-2"
        style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}
      >
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-amber-900/60 bg-black/75 px-1 py-1 backdrop-blur">
          <button
            onClick={props.onPause}
            aria-label="暂停"
            className="flex size-9 items-center justify-center rounded-md text-base text-amber-200 active:bg-amber-500/20"
          >
            ⏸
          </button>
          <span className="font-mono text-sm font-bold tabular-nums text-amber-100">
            {formatTime(snapshot.remaining)}
          </span>
          <button
            onClick={props.onSpeed}
            className="flex h-9 min-w-9 items-center justify-center rounded-md border border-amber-800/60 px-1 font-mono text-[11px] font-bold text-amber-200 active:bg-amber-500/20"
          >
            {snapshot.speed}x
          </button>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="pointer-events-auto flex flex-wrap justify-end gap-1">
            <Chip icon="🪙" value={snapshot.gold} />
            <Chip icon="🐔" value={`${snapshot.animalTotal}/300`} tone="text-amber-200/90" />
            <Chip icon="❤️" value={snapshot.hunterLives} tone="text-rose-200" />
            {props.side === "hunter" ? (
              <Chip
                icon="🛒"
                value={snapshot.merchantNear ? "可买" : "远处"}
                tone={snapshot.merchantNear ? "text-emerald-200" : "text-amber-200/50"}
              />
            ) : null}
          </div>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${PHASE_STYLE[snapshot.phase]}`}>
            {PHASE_LABEL[snapshot.phase]}
          </span>
        </div>
      </div>

      {/* 当前操控单位 */}
      <div
        className="absolute w-32"
        style={{
          left: "max(env(safe-area-inset-left), 10px)",
          top: "calc(max(env(safe-area-inset-top), 8px) + 48px)",
        }}
      >
        <div className="h-2 overflow-hidden rounded-full border border-black/60 bg-black/70">
          <div
            className={`h-full ${hpRatio > 0.4 ? "bg-emerald-500" : "bg-rose-500"}`}
            style={{ width: `${hpRatio * 100}%` }}
          />
        </div>
        <p className="mt-0.5 font-mono text-[10px] text-amber-100/80">
          {snapshot.unitDead
            ? `复活 ${Math.ceil(snapshot.respawnIn)}s`
            : `${snapshot.unitName} ${Math.ceil(snapshot.unitHp)}/${snapshot.unitMaxHp}`}
          {props.side === "hunter" ? ` · 命 ${snapshot.heroLives}` : ""}
        </p>
        {props.side === "hunter" ? (
          <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-amber-100/70">
            {snapshot.owned.hammer ? <span>🔨</span> : null}
            {snapshot.owned.gloves ? <span>🧤</span> : null}
            {snapshot.owned.poison ? <span>☠️</span> : null}
            {snapshot.stock.horns > 0 ? <span>📯{snapshot.stock.horns}</span> : null}
            {snapshot.stock.mines > 0 ? <span>💣{snapshot.stock.mines}</span> : null}
            {snapshot.stock.potions > 0 ? <span>🧪{snapshot.stock.potions}</span> : null}
          </div>
        ) : null}
      </div>

      {/* 小地图 */}
      <canvas
        ref={props.minimapRef}
        width={192}
        height={192}
        className="pointer-events-auto absolute size-24 touch-none rounded-md border border-amber-600/50 bg-black/70"
        style={{
          right: "max(env(safe-area-inset-right), 8px)",
          top: "calc(max(env(safe-area-inset-top), 8px) + 62px)",
        }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          props.onMinimap(
            (event.clientX - rect.left) / rect.width,
            (event.clientY - rect.top) / rect.height
          );
        }}
      />

      {/* 阶段横幅 */}
      {props.banner ? (
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 rounded-xl border border-amber-400/60 bg-black/80 px-6 py-3 text-center">
          <p className="text-lg font-black tracking-wider text-amber-200">{props.banner}</p>
        </div>
      ) : null}

      {props.toast ? (
        <div className="absolute left-1/2 top-[96px] -translate-x-1/2 rounded-full border border-amber-800/60 bg-black/80 px-3 py-1 text-[11px] text-amber-100">
          {props.toast.text}
        </div>
      ) : null}

      {/* 摇杆 */}
      <div className="absolute" style={joystickStyle}>
        <Joystick size={sizes.joy} side={props.settings.joystickSide} onVector={props.onJoystick} />
      </div>

      {/* 动作与技能 */}
      <div className="absolute flex flex-col items-end gap-2" style={clusterStyle}>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <button
              key={action.key}
              onClick={() => props.onAction(action.key)}
              disabled={action.disabled}
              className={`pointer-events-auto flex flex-col items-center justify-center rounded-lg border text-[9px] leading-none backdrop-blur disabled:opacity-35 ${
                action.active
                  ? "border-amber-300 bg-amber-500/30 text-amber-100"
                  : "border-amber-900/60 bg-black/65 text-amber-200/85"
              }`}
              style={{ width: sizes.action, height: sizes.action }}
            >
              <span className="text-base leading-none">{action.icon}</span>
              <span className="mt-1">{action.label}</span>
            </button>
          ))}
        </div>
        {snapshot.skills.length > 0 ? (
          <div className="flex items-end gap-2">
            {snapshot.skills.map((skill) => {
              const spec = SKILLS[skill];
              const cd = Math.ceil(snapshot.skillCd[skill] ?? 0);
              return (
                <button
                  key={skill}
                  disabled={cd > 0}
                  onClick={() => props.onSkill(skill)}
                  className={`pointer-events-auto relative flex items-center justify-center rounded-full border-2 backdrop-blur ${
                    cd > 0
                      ? "border-neutral-600/70 bg-black/70"
                      : "border-amber-400/80 bg-amber-600/35 active:scale-95"
                  }`}
                  style={{ width: sizes.skill, height: sizes.skill }}
                >
                  <span className={`text-xl leading-none ${cd > 0 ? "opacity-40" : ""}`}>{spec.icon}</span>
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/80 px-1 text-[9px] text-amber-200/80">
                    {spec.short}
                  </span>
                  {cd > 0 ? (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 font-mono text-sm font-bold text-amber-100">
                      {cd}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* 建造幽灵确认条 */}
      {props.ghost ? (
        <div
          className="pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-700/70 bg-black/85 px-2.5 py-1.5 text-[11px] text-amber-100"
          style={{ bottom: "calc(max(env(safe-area-inset-bottom), 14px) + 96px)" }}
        >
          <span className="font-semibold">{BUILDINGS[props.ghost.kind].name}</span>
          <span className="text-amber-300/70">{costLabel(ghostCost)}</span>
          <button
            disabled={!props.ghost.valid}
            onClick={props.onConfirmGhost}
            className="rounded-md bg-emerald-600 px-2 py-1 font-bold text-black disabled:opacity-40"
          >
            确认
          </button>
          <button
            onClick={props.onCancelGhost}
            className="rounded-md border border-rose-600/70 px-2 py-1 text-rose-200"
          >
            取消
          </button>
        </div>
      ) : null}

      {props.cast ? (
        <div
          className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-600/70 bg-black/85 px-4 py-1.5 text-[11px] text-amber-100"
          style={{ bottom: "calc(max(env(safe-area-inset-bottom), 14px) + 96px)" }}
        >
          点按地图释放「{SKILLS[props.cast].name}」
          <button
            onClick={props.onCancelCast}
            className="rounded-full border border-rose-500/70 px-2 py-0.5 text-rose-200"
          >
            取消
          </button>
        </div>
      ) : null}
    </div>
  );
}
