"use client";

import { useRef, useState, type RefObject } from "react";
import {
  BrickWall,
  Castle,
  Coins,
  Crosshair,
  Eye,
  Flame,
  FlaskConical,
  Flower2,
  Heart,
  Maximize,
  Minimize,
  Moon,
  Pause,
  Pickaxe,
  Play,
  Shield,
  Snowflake,
  Sparkles,
  Sprout,
  Swords,
  Tent,
  Timer,
  TreePine,
  Volume2,
  VolumeX,
  Wind,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  BUILD_CATEGORIES,
  BUILD_SPECS,
  DIFFICULTIES,
  GAME_MODES,
  SHOP_ITEMS,
  TROLL_RULES,
  SCROLL,
  RECALL_SCROLL,
  TOWER_BRANCHES,
  WALL_BRANCHES,
  WOOD_PACK,
} from "@/lib/tve/config";
import type {
  BuildingKind,
  Difficulty,
  ElfSkill,
  Faction,
  GameMode,
  GameResult,
  GameStats,
  ShopKey,
  TrollRule,
  TrollSkill,
} from "@/lib/tve/types";

const KIND_ICON: Record<BuildingKind, LucideIcon> = {
  tree: TreePine,
  tent: Tent,
  goldmine: Pickaxe,
  workshop: Wrench,
  lab: FlaskConical,
  wall: Shield,
  grasswall: Sprout,
  stone: Shield,
  concrete: BrickWall,
  thorn: Flower2,
  icewall: Snowflake,
  watch: Eye,
  arrow: Crosshair,
  goldtower: Coins,
  gun: Flame,
  poison: Zap,
  ice: Snowflake,
  moon: Moon,
  hut: Castle,
};

const ELF_SKILL_META: Record<ElfSkill, { label: string; desc: string; icon: LucideIcon }> = {
  blink: { label: "闪烁", desc: "向移动方向瞬移 6 格", icon: Wind },
  haste: { label: "疾跑", desc: "8 秒内移速 +60%", icon: Zap },
  entangle: { label: "缠绕", desc: "定身最近巨魔并打断回城", icon: Sparkles },
  silence: { label: "沉默", desc: "沉默最近巨魔 6 秒", icon: VolumeX },
  wallguard: { label: "墙之守护", desc: "己方墙体无敌 6 秒", icon: Shield },
};

const TROLL_SKILL_META: Record<TrollSkill, { label: string; desc: string; icon: LucideIcon }> = {
  windwalk: { label: "隐身", desc: "隐身 5 秒并提速；隐身时不会自动攻击，出手即显形", icon: Wind },
  berserk: { label: "狂暴", desc: "8 秒攻击与攻速提升", icon: Swords },
  recall: { label: "回城", desc: "4 秒读条，可被打断", icon: Castle },
};

const SHOP_META: Record<ShopKey, { icon: LucideIcon }> = {
  weapon: { icon: Swords },
  gloves: { icon: Zap },
  boots: { icon: Wind },
  armor: { icon: Shield },
  vitality: { icon: Heart },
  regen: { icon: Sparkles },
};

export interface HudSelected {
  id: number;
  kind: BuildingKind;
  level: number;
  maxLevel: number;
  hp: number;
  maxHp: number;
  upgradeGold: number | null;
  upgradeWood: number;
  repairing: boolean;
  canRepair: boolean;
  /** 施工进度 0~1，1 表示已建成 */
  constructProgress: number;
  /** 下一级升级所需的帐篷等级（null 表示无门槛） */
  requireTentLevel: number | null;
  /** 下一级升级所需的墙体等级（null 表示无门槛） */
  requireWallLevel: number | null;
  /** 己方当前帐篷等级 */
  tentLevel: number;
  /** 己方当前最高墙体等级 */
  wallLevel: number;
  /** 是否已到可选择强化方向的等级 */
  canBranch: boolean;
}

export interface HudSnapshot {
  faction: Faction;
  difficulty: Difficulty;
  mode: GameMode;
  rule: TrollRule;
  paused: boolean;
  muted: boolean;
  gold: number;
  wood: number;
  woodPrice: number;
  woodSellPrice: number;
  elf: { name: string; hp: number; maxHp: number; alive: boolean } | null;
  trolls: { name: string; hp: number; maxHp: number; wolf: boolean; alive: boolean; isPlayer: boolean }[];
  hutLevel: number;
  hutUpgradeGold: number | null;
  night: boolean;
  nightTimer: number;
  time: number;
  surviveTime: number | null;
  hint: string | null;
  selected: HudSelected | null;
  autoRepair: boolean;
  /** 巨魔回城卷轴数量 */
  recallScrolls: number;
  /** 回城读条剩余时间（0 表示未在读条） */
  recallChannel: number;
  placing: BuildingKind | null;
  skills: { elf: Record<ElfSkill, number>; troll: Record<TrollSkill, number> };
  items: Record<ShopKey, number>;
  stats: GameStats;
  towerBonus: number;
  result: GameResult;
  elfCount: number;
  aliveElves: number;
  aliveTrolls: number;
}

interface TveHudProps {
  snapshot: HudSnapshot;
  minimapRef: RefObject<HTMLCanvasElement | null>;
  onJoystickChange: (x: number, y: number) => void;
  onPause: () => void;
  onResume: () => void;
  onMute: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onExit: () => void;
  onBuild: (kind: BuildingKind) => void;
  onCancelPlacing: () => void;
  onUpgrade: (id: number) => void;
  onConvert: (id: number, kind: BuildingKind) => void;
  onRepair: (id: number) => void;
  onToggleAutoRepair: () => void;
  onDemolish: (id: number) => void;
  onCloseSelected: () => void;
  onBuyWood: () => void;
  onSellWood: () => void;
  onShop: (key: ShopKey) => void;
  onScroll: () => void;
  onBuyRecallScroll: () => void;
  onUseScroll: () => void;
  onHutUpgrade: () => void;
  onElfSkill: (skill: ElfSkill) => void;
  onTrollSkill: (skill: TrollSkill) => void;
  /** 手动攻击：隐身时按下会立刻显形并攻击 */
  onAttack: () => void;
}

type Sheet = "build" | "skill" | "shop" | null;

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function coin(value: number): string {
  return Math.floor(value).toLocaleString("zh-CN");
}

export function TveHud(props: TveHudProps) {
  const { snapshot, minimapRef } = props;
  const [sheet, setSheet] = useState<Sheet>(null);
  const troll = snapshot.trolls.find((t) => t.isPlayer) ?? null;
  const tentLocked =
    !!snapshot.selected &&
    snapshot.selected.requireTentLevel !== null &&
    snapshot.selected.tentLevel < snapshot.selected.requireTentLevel;
  const wallLocked =
    !!snapshot.selected &&
    snapshot.selected.requireWallLevel !== null &&
    snapshot.selected.wallLevel < snapshot.selected.requireWallLevel;
  const upgradeLocked = tentLocked || wallLocked;

  const closeSheet = () => setSheet(null);

  const canAfford = (kind: BuildingKind) => {
    const level = BUILD_SPECS[kind].levels[0];
    return snapshot.gold >= level.cost && snapshot.wood >= level.wood;
  };

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
      {/* 顶部状态栏 */}
      <div className="pointer-events-auto flex items-start justify-between gap-2 px-2 pt-[max(6px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={snapshot.paused ? props.onResume : props.onPause}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/45 text-white backdrop-blur"
            aria-label={snapshot.paused ? "继续" : "暂停"}
          >
            {snapshot.paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            type="button"
            onClick={props.onMute}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/45 text-white backdrop-blur"
            aria-label="音效"
          >
            {snapshot.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button
            type="button"
            onClick={props.onToggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/45 text-white backdrop-blur"
            aria-label={props.fullscreen ? "退出全屏" : "全屏"}
          >
            {props.fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>
          <div className="rounded-xl border border-white/10 bg-black/45 px-2.5 py-1.5 text-[11px] leading-tight text-white/80 backdrop-blur">
            <div className="font-semibold text-white">{GAME_MODES[snapshot.mode].label}</div>
            <div className="flex items-center gap-1 text-[10px] text-white/60">
              <Timer size={10} />
              {formatTime(snapshot.time)}
              {snapshot.surviveTime ? <span className="text-amber-200">/{formatTime(snapshot.surviveTime)}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/45 px-2.5 py-1.5 text-white backdrop-blur">
            <span className="flex items-center gap-1 text-sm font-bold text-amber-300">
              <Coins size={14} /> {coin(snapshot.gold)}
            </span>
            {snapshot.faction === "elf" ? (
              <span className="flex items-center gap-1 text-sm font-bold text-lime-300">
                <TreePine size={14} /> {Math.floor(snapshot.wood)}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm font-bold text-orange-300">
                <Castle size={14} /> Lv{snapshot.hutLevel}
              </span>
            )}
          </div>
          {snapshot.faction === "elf" && snapshot.elf ? (
            <div className="w-40 rounded-lg border border-white/10 bg-black/45 px-2 py-1 backdrop-blur">
              <div className="flex items-center justify-between text-[10px] text-white/70">
                <span>精灵 {snapshot.elf.name}</span>
                <span>
                  {Math.ceil(snapshot.elf.hp)}/{Math.round(snapshot.elf.maxHp)}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-300"
                  style={{ width: `${Math.max(0, Math.min(100, (snapshot.elf.hp / snapshot.elf.maxHp) * 100))}%` }}
                />
              </div>
            </div>
          ) : null}
          {snapshot.faction === "troll" && troll ? (
            <div className="w-44 rounded-lg border border-white/10 bg-black/45 px-2 py-1 backdrop-blur">
              <div className="flex items-center justify-between text-[10px] text-white/70">
                <span>{troll.wolf ? "幽灵狼" : "巨魔"} · 存活 {snapshot.aliveTrolls}</span>
                <span>
                  {Math.ceil(troll.hp)}/{Math.round(troll.maxHp)}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-400 to-rose-400"
                  style={{ width: `${Math.max(0, Math.min(100, (troll.hp / troll.maxHp) * 100))}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 夜晚 / 提示 */}
      <div className="pointer-events-none flex flex-1 flex-col items-center justify-start gap-2 px-4 pt-3">
        {snapshot.night ? (
          <div className="rounded-full border border-indigo-300/30 bg-indigo-950/70 px-3 py-1 text-xs font-medium text-indigo-100 backdrop-blur">
            <Moon size={12} className="mr-1 inline" />
            黑夜 {Math.ceil(snapshot.nightTimer)}s
          </div>
        ) : null}
        {snapshot.recallChannel > 0 ? (
          <div className="pointer-events-none mb-2 self-center rounded-full border border-violet-300/40 bg-violet-950/80 px-4 py-1.5 text-xs font-bold text-violet-100 backdrop-blur">
            回城读条 {snapshot.recallChannel.toFixed(1)}s · 可被沉默/缠绕打断
          </div>
        ) : null}
        {snapshot.hint ? (
          <div className="max-w-[85%] rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-center text-xs text-white/90 backdrop-blur">
            {snapshot.hint}
          </div>
        ) : null}
        {snapshot.placing ? (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-950/70 px-3 py-1.5 text-xs text-amber-100 backdrop-blur">
            点击空地放置 {BUILD_SPECS[snapshot.placing].label}
            <button type="button" onClick={props.onCancelPlacing} className="rounded-full bg-white/15 p-1" aria-label="取消建造">
              <X size={15} />
            </button>
          </div>
        ) : null}
      </div>

      {/* 小地图（桌面） */}
      <div className="pointer-events-auto absolute right-3 top-24 hidden md:block">
        <div className="rounded-xl border border-white/15 bg-black/50 p-1.5 backdrop-blur">
          <canvas ref={minimapRef} width={132} height={132} className="block h-[132px] w-[132px] rounded-lg" />
        </div>
      </div>

      {/* 选中建筑面板 */}
      {snapshot.selected ? (
        <div className="pointer-events-auto absolute bottom-40 left-1/2 w-[min(420px,92vw)] -translate-x-1/2 rounded-2xl border border-white/15 bg-slate-950/85 p-3 text-white shadow-2xl backdrop-blur md:bottom-32">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-bold">
                {(() => {
                  const Icon = KIND_ICON[snapshot.selected.kind];
                  return <Icon size={16} />;
                })()}
                {BUILD_SPECS[snapshot.selected.kind].label}
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">
                  Lv{snapshot.selected.level}
                  {snapshot.selected.maxLevel > 1 ? `/${snapshot.selected.maxLevel}` : ""}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300"
                  style={{ width: `${Math.max(0, Math.min(100, (snapshot.selected.hp / snapshot.selected.maxHp) * 100))}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-white/60">
                {Math.ceil(snapshot.selected.hp)} / {Math.round(snapshot.selected.maxHp)}
              </div>
              {snapshot.selected.constructProgress < 1 ? (
                <div className="mt-1 text-[10px] font-semibold text-sky-300">
                  施工中 {Math.round(snapshot.selected.constructProgress * 100)}%
                </div>
              ) : null}
            </div>
            <button type="button" onClick={props.onCloseSelected} className="rounded-lg bg-white/10 p-1.5">
              <X size={14} />
            </button>
          </div>
          {snapshot.selected.canBranch ? (
            <div className="mt-2 rounded-xl border border-amber-300/25 bg-amber-500/10 p-2">
              <div className="mb-1.5 text-[10px] font-semibold text-amber-200">
                选择强化方向（选定后不可更改，除非拆除重建）
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {(snapshot.selected.kind === "wall" ? WALL_BRANCHES : TOWER_BRANCHES).map((option) => (
                  <button
                    key={option.kind}
                    type="button"
                    onClick={() => props.onConvert(snapshot.selected!.id, option.kind)}
                    disabled={snapshot.gold < option.gold || snapshot.wood < option.wood}
                    className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-left disabled:opacity-40"
                  >
                    <div className="text-[11px] font-semibold text-amber-100">{option.label}</div>
                    <div className="text-[9px] leading-tight text-white/50">{option.desc}</div>
                    <div className="mt-0.5 text-[9px] text-amber-200">
                      {option.gold} 金{option.wood > 0 ? ` · ${option.wood} 木` : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {snapshot.selected.upgradeGold !== null && snapshot.selected.level < snapshot.selected.maxLevel && snapshot.selected.constructProgress >= 1 ? (
              <button
                type="button"
                onClick={() => props.onUpgrade(snapshot.selected!.id)}
                disabled={
                  upgradeLocked || snapshot.gold < snapshot.selected.upgradeGold || snapshot.wood < snapshot.selected.upgradeWood
                }
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-amber-500/90 px-3 py-2 text-xs font-bold text-amber-950 disabled:opacity-40"
              >
                {tentLocked ? (
                  `需帐篷 Lv${snapshot.selected.requireTentLevel}`
                ) : wallLocked ? (
                  `需墙体 Lv${snapshot.selected.requireWallLevel}`
                ) : (
                  <>
                    升级
                    <span className="font-semibold">
                      {snapshot.selected.upgradeGold}
                      {snapshot.selected.upgradeWood > 0 ? ` + ${snapshot.selected.upgradeWood}木` : ""}
                    </span>
                  </>
                )}
              </button>
            ) : null}
            {(snapshot.selected.canRepair || snapshot.selected.repairing) && snapshot.selected.constructProgress >= 1 ? (
              <button
                type="button"
                onClick={() => props.onRepair(snapshot.selected!.id)}
                className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-emerald-950 ${
                  snapshot.selected.repairing ? "bg-emerald-300" : "bg-emerald-500/90"
                }`}
              >
                <Wrench size={13} />
                {snapshot.selected.repairing ? "维修中 · 停止" : "前往维修（免费）"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => props.onDemolish(snapshot.selected!.id)}
              className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200"
            >
              拆除
            </button>
          </div>
        </div>
      ) : null}

      {/* 底部动作区 */}
      <div className="pointer-events-auto flex items-end justify-between gap-3 px-3 pb-[max(10px,env(safe-area-inset-bottom))]">
        <Joystick onChange={props.onJoystickChange} />

        <div className="flex flex-col items-end gap-2">
          {snapshot.faction === "elf" ? (
            <>
              <button
                type="button"
                onClick={props.onToggleAutoRepair}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold backdrop-blur ${
                  snapshot.autoRepair
                    ? "border-emerald-300/60 bg-emerald-400/25 text-emerald-100"
                    : "border-white/15 bg-black/45 text-white/70"
                }`}
              >
                <Wrench size={13} />
                自动维修 {snapshot.autoRepair ? "开" : "关"}
              </button>
              <div className="flex items-center gap-2">
                <ActionButton
                  icon={TreePine}
                  label={`买木 ${snapshot.woodPrice}`}
                  disabled={snapshot.gold < snapshot.woodPrice}
                  onClick={props.onBuyWood}
                />
                <ActionButton
                  icon={Sparkles}
                  label="技能"
                  onClick={() => setSheet(sheet === "skill" ? null : "skill")}
                  active={sheet === "skill"}
                  cooldown={Math.min(
                    snapshot.skills.elf.blink,
                    snapshot.skills.elf.haste,
                    snapshot.skills.elf.entangle,
                    snapshot.skills.elf.silence,
                    snapshot.skills.elf.wallguard,
                  )}
                />
                {snapshot.placing ? (
                  <button
                    type="button"
                    onClick={props.onCancelPlacing}
                    className="flex min-h-[44px] items-center gap-1 rounded-xl bg-rose-500/90 px-3 py-2 text-xs font-bold text-white shadow-lg active:scale-95"
                  >
                    <X size={14} /> 取消建造
                  </button>
                ) : (
                  <ActionButton
                    icon={Castle}
                    label="建造"
                    onClick={() => setSheet(sheet === "build" ? null : "build")}
                    active={sheet === "build"}
                    primary
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {snapshot.hutUpgradeGold !== null ? (
                <ActionButton
                  icon={Castle}
                  label={`小屋 ${snapshot.hutUpgradeGold}`}
                  disabled={snapshot.gold < snapshot.hutUpgradeGold}
                  onClick={props.onHutUpgrade}
                />
              ) : null}
              <ActionButton
                icon={Wind}
                label="技能"
                onClick={() => setSheet(sheet === "skill" ? null : "skill")}
                active={sheet === "skill"}
                cooldown={Math.min(snapshot.skills.troll.windwalk, snapshot.skills.troll.berserk, snapshot.skills.troll.recall)}
              />
              <ActionButton
                icon={Coins}
                label="商店"
                onClick={() => setSheet(sheet === "shop" ? null : "shop")}
                active={sheet === "shop"}
                primary
              />
            </div>
          )}
        </div>
      </div>

      {/* 底部抽屉 */}
      {sheet ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-[64vh] overflow-y-auto rounded-t-3xl border-t border-white/15 bg-slate-950/95 px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-2 text-white shadow-2xl backdrop-blur">
          <div className="sticky top-0 z-10 -mx-3 mb-2 flex items-center justify-between bg-slate-950/95 px-3 pb-2 pt-1">
            <div className="text-sm font-bold">
              {sheet === "build" ? "建造" : sheet === "skill" ? "技能" : "巨魔商店"}
            </div>
            <button type="button" onClick={closeSheet} className="rounded-lg bg-white/10 p-1.5">
              <X size={15} />
            </button>
          </div>

          {sheet === "build" ? (
            <div className="space-y-3 pb-2">
              <div className="flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-500/10 p-2">
                <span className="shrink-0 text-[11px] font-semibold text-amber-200">木材市场</span>
                <button
                  type="button"
                  onClick={props.onBuyWood}
                  disabled={snapshot.gold < snapshot.woodPrice}
                  className="flex-1 rounded-lg bg-amber-500/90 px-2 py-1.5 text-[11px] font-bold text-amber-950 disabled:opacity-40"
                >
                  买入 10 木 · {snapshot.woodPrice} 金
                </button>
                <button
                  type="button"
                  onClick={props.onSellWood}
                  disabled={snapshot.wood < 10}
                  className="flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-amber-100 disabled:opacity-40"
                >
                  卖出 10 木 · {snapshot.woodSellPrice} 金
                </button>
              </div>
              {BUILD_CATEGORIES.map((category) => (
                <div key={category.key}>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">{category.label}</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {category.kinds.map((kind) => {
                      const spec = BUILD_SPECS[kind];
                      const level = spec.levels[0];
                      const Icon = KIND_ICON[kind];
                      const affordable = canAfford(kind);
                      return (
                        <button
                          key={kind}
                          type="button"
                          disabled={!affordable}
                          onClick={() => {
                            props.onBuild(kind);
                            closeSheet();
                          }}
                          className="flex flex-col items-start gap-1 rounded-xl border border-white/10 bg-white/5 p-2 text-left transition active:scale-[0.97] disabled:opacity-35"
                        >
                          <span className="flex w-full items-center justify-between">
                            <Icon size={18} className="text-amber-200" />
                            <span className="text-[10px] text-white/50">Lv1</span>
                          </span>
                          <span className="text-xs font-semibold">{spec.label}</span>
                          <span className="text-[10px] text-amber-200">
                            {level.cost} 金{level.wood > 0 ? ` · ${level.wood} 木` : ""}
                          </span>
                          <span className="line-clamp-2 text-[9px] leading-tight text-white/45">{spec.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {sheet === "skill" ? (
            <div className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-4">
              {snapshot.faction === "elf"
                ? (Object.keys(ELF_SKILL_META) as ElfSkill[]).map((skill) => {
                    const meta = ELF_SKILL_META[skill];
                    const Icon = meta.icon;
                    const cd = snapshot.skills.elf[skill];
                    return (
                      <button
                        key={skill}
                        type="button"
                        disabled={cd > 0 || !snapshot.elf?.alive}
                        onClick={() => {
                          props.onElfSkill(skill);
                          closeSheet();
                        }}
                        className="relative flex flex-col items-start gap-1 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2.5 text-left disabled:opacity-45"
                      >
                        <Icon size={20} className="text-sky-200" />
                        <span className="text-xs font-semibold">{meta.label}</span>
                        <span className="text-[10px] leading-tight text-white/50">{meta.desc}</span>
                        {cd > 0 ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-white">
                            {Math.ceil(cd)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                : [
                    ...(Object.keys(TROLL_SKILL_META) as TrollSkill[]).map((skill) => {
                    const meta = TROLL_SKILL_META[skill];
                    const Icon = meta.icon;
                    const cd = snapshot.skills.troll[skill];
                    return (
                      <button
                        key={skill}
                        type="button"
                        disabled={cd > 0 || troll?.wolf}
                        onClick={() => {
                          props.onTrollSkill(skill);
                          closeSheet();
                        }}
                        className="relative flex flex-col items-start gap-1 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2.5 text-left disabled:opacity-45"
                      >
                        <Icon size={20} className="text-orange-200" />
                        <span className="text-xs font-semibold">{meta.label}</span>
                        <span className="text-[10px] leading-tight text-white/50">{meta.desc}</span>
                        {cd > 0 ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-white">
                            {Math.ceil(cd)}
                          </span>
                        ) : null}
                      </button>
                    );
                  }),
                <button
                  key="attack"
                  type="button"
                  disabled={!troll || troll.wolf}
                  onClick={() => {
                    props.onAttack();
                    closeSheet();
                  }}
                  className="relative flex flex-col items-start gap-1 overflow-hidden rounded-xl border border-orange-400/25 bg-orange-500/10 p-2.5 text-left disabled:opacity-45"
                >
                  <Swords size={20} className="text-orange-200" />
                  <span className="text-xs font-semibold">攻击</span>
                  <span className="text-[10px] leading-tight text-white/50">隐身时手动出手会提前显形（快捷键 J）</span>
                </button>
                ]}
            </div>
          ) : null}

          {sheet === "shop" ? (
            <div className="space-y-2 pb-2">
              {(Object.keys(SHOP_ITEMS) as ShopKey[]).map((key) => {
                const spec = SHOP_ITEMS[key];
                const level = snapshot.items[key];
                const maxed = level >= spec.costs.length;
                const cost = maxed ? 0 : spec.costs[level];
                const Icon = SHOP_META[key].icon;
                return (
                  <div key={key} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-400/15 text-orange-200">
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        {spec.label}
                        <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] text-white/60">
                          {level}/{spec.costs.length}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/50">{spec.desc}</div>
                    </div>
                    <button
                      type="button"
                      disabled={maxed || snapshot.gold < cost || troll?.wolf}
                      onClick={() => props.onShop(key)}
                      className="rounded-lg bg-amber-500/90 px-2.5 py-1.5 text-[11px] font-bold text-amber-950 disabled:opacity-35"
                    >
                      {maxed ? "满级" : `${cost} 金`}
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                disabled={snapshot.gold < SCROLL.cost || troll?.wolf}
                onClick={props.onScroll}
                className="flex w-full items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2.5 text-xs font-semibold text-emerald-100 disabled:opacity-35"
              >
                <span className="flex items-center gap-2">
                  <Heart size={16} /> 生命卷轴 · 立即恢复 {SCROLL.heal} 生命
                </span>
                <span>{SCROLL.cost} 金</span>
              </button>
              <button
                type="button"
                disabled={snapshot.gold < RECALL_SCROLL.cost || troll?.wolf}
                onClick={props.onBuyRecallScroll}
                className="flex w-full items-center justify-between rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-2.5 text-xs font-semibold text-violet-100 disabled:opacity-35"
              >
                <span className="flex items-center gap-2">
                  <Castle size={16} /> 回城卷轴 ×{snapshot.recallScrolls} · 瞬间回城不可打断
                </span>
                <span>{RECALL_SCROLL.cost} 金</span>
              </button>
              {snapshot.recallScrolls > 0 ? (
                <button
                  type="button"
                  disabled={!!troll?.wolf}
                  onClick={props.onUseScroll}
                  className="w-full rounded-xl bg-violet-400/90 px-3 py-2.5 text-xs font-bold text-violet-950 disabled:opacity-35"
                >
                  使用回城卷轴（不可打断）
                </button>
              ) : null}
              <div className="pt-1 text-[10px] leading-relaxed text-white/45">
                巨魔拆墙每击获得金币，摧毁建筑另有赏金；小屋提供每秒被动收入。
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 暂停遮罩 */}
      {snapshot.paused && !snapshot.result ? (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[min(320px,86vw)] rounded-3xl border border-white/15 bg-slate-900/95 p-5 text-center text-white shadow-2xl">
            <div className="text-lg font-bold">已暂停</div>
            <div className="mt-1 text-xs text-white/50">
              {GAME_MODES[snapshot.mode].label} · {TROLL_RULES[snapshot.rule].label} · {DIFFICULTIES[snapshot.difficulty].label}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={props.onResume} className="rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-amber-950">
                继续游戏
              </button>
              <button type="button" onClick={props.onExit} className="rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white/80">
                返回菜单
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface JoystickProps {
  onChange: (x: number, y: number) => void;
}

export function Joystick({ onChange }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeRef = useRef(false);

  const update = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
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
    onChange(dx / max, dy / max);
  };

  const end = () => {
    activeRef.current = false;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={(event) => {
        activeRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (!activeRef.current) return;
        update(event.clientX, event.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      className="relative h-28 w-28 touch-none rounded-full border border-white/20 bg-black/35 backdrop-blur"
      style={{ touchAction: "none" }}
    >
      <div className="pointer-events-none absolute inset-4 rounded-full border border-white/10" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 rounded-full border border-white/30 bg-white/25"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

interface ActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  primary?: boolean;
  cooldown?: number;
}

function ActionButton({ icon: Icon, label, onClick, disabled, active, primary, cooldown }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl border text-[10px] font-semibold shadow-lg backdrop-blur transition active:scale-95 disabled:opacity-40 sm:h-16 sm:w-16",
        primary
          ? "border-amber-300/40 bg-amber-500/90 text-amber-950"
          : active
            ? "border-white/40 bg-white/25 text-white"
            : "border-white/15 bg-black/45 text-white/85",
      ].join(" ")}
    >
      <Icon size={20} />
      <span className="max-w-full truncate px-0.5">{label}</span>
      {cooldown && cooldown > 0 ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">
          {Math.ceil(cooldown)}
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 开始菜单                                                            */
/* ------------------------------------------------------------------ */

interface TveMenuProps {
  faction: Faction;
  mode: GameMode;
  rule: TrollRule;
  difficulty: Difficulty;
  onFaction: (value: Faction) => void;
  onMode: (value: GameMode) => void;
  onRule: (value: TrollRule) => void;
  onDifficulty: (value: Difficulty) => void;
  onStart: () => void;
  onBack: () => void;
}

export function TveMenu(props: TveMenuProps) {
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,#243524,#0b120b_70%)] px-4 py-[max(20px,env(safe-area-inset-top))] text-white">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8">
        <div className="flex items-center justify-between">
          <button type="button" onClick={props.onBack} className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70">
            返回
          </button>
          <span className="text-[11px] tracking-[0.3em] text-white/35">TROLL &amp; ELVES</span>
        </div>

        <div>
          <h1 className="text-3xl font-black leading-tight">新巨魔与精灵</h1>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            1 巨魔对抗多名精灵。精灵靠帐篷产金、买木升级、堵路造塔；巨魔拆墙刷金、升级小屋、商店买装备。杀死所有精灵，或让精灵活到终局。
          </p>
        </div>

        <section>
          <h2 className="mb-2 text-xs font-bold text-white/45">选择阵营</h2>
          <div className="grid grid-cols-2 gap-2">
            {(["elf", "troll"] as Faction[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => props.onFaction(value)}
                className={[
                  "rounded-2xl border p-3 text-left transition",
                  props.faction === value
                    ? "border-lime-300/60 bg-lime-400/15"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                ].join(" ")}
              >
                <div className="text-sm font-bold">{value === "elf" ? "精灵" : "巨魔"}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-white/50">
                  {value === "elf" ? "经营经济、堵路造塔、技能逃生" : "拆建筑刷金、买装备、追杀精灵"}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-bold text-white/45">模式</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(GAME_MODES) as GameMode[]).map((key) => {
              const spec = GAME_MODES[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => props.onMode(key)}
                  className={[
                    "rounded-xl border px-2.5 py-2 text-left transition",
                    props.mode === key ? "border-amber-300/60 bg-amber-400/15" : "border-white/10 bg-white/5",
                  ].join(" ")}
                >
                  <div className="text-xs font-bold">{spec.label}</div>
                  <div className="mt-0.5 text-[10px] leading-snug text-white/45">{spec.desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-xs font-bold text-white/45">巨魔规则</h2>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TROLL_RULES) as TrollRule[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => props.onRule(key)}
                  className={[
                    "rounded-xl border px-2.5 py-2 text-left transition",
                    props.rule === key ? "border-orange-300/60 bg-orange-400/15" : "border-white/10 bg-white/5",
                  ].join(" ")}
                >
                  <div className="text-xs font-bold">{TROLL_RULES[key].label}</div>
                  <div className="mt-0.5 text-[10px] leading-snug text-white/45">{TROLL_RULES[key].desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-bold text-white/45">难度</h2>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => props.onDifficulty(key)}
                  className={[
                    "rounded-xl border px-2 py-2 text-center text-xs font-semibold transition",
                    props.difficulty === key ? "border-sky-300/60 bg-sky-400/15" : "border-white/10 bg-white/5",
                  ].join(" ")}
                >
                  {DIFFICULTIES[key].label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={props.onStart}
          className="mt-1 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-lime-400 py-3.5 text-base font-black text-emerald-950 shadow-xl shadow-lime-900/30 active:scale-[0.99]"
        >
          开始对局
        </button>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-[10px] leading-relaxed text-white/45">
          操作：左下摇杆移动英雄；精灵点「建造」选建筑后点空地放置；点选自己的建筑可升级/修理/拆除。巨魔点「商店」购买装备，「技能」使用疾风步与召回。
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 结算                                                                */
/* ------------------------------------------------------------------ */

interface TveResultProps {
  result: GameResult;
  snapshot: HudSnapshot;
  onRestart: () => void;
  onMenu: () => void;
}

export function TveResult({ result, snapshot, onRestart, onMenu }: TveResultProps) {
  const win = result === "win";
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
      <div className="w-[min(360px,92vw)] rounded-3xl border border-white/15 bg-slate-900/95 p-5 text-center text-white shadow-2xl">
        <div className={`text-2xl font-black ${win ? "text-lime-300" : "text-rose-300"}`}>{win ? "胜利" : "失败"}</div>
        <div className="mt-1 text-xs text-white/50">
          {GAME_MODES[snapshot.mode].label} · {TROLL_RULES[snapshot.rule].label} · {DIFFICULTIES[snapshot.difficulty].label}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-left text-xs">
          <Stat label="用时" value={formatTime(snapshot.time)} />
          <Stat label="金币" value={`${coin(snapshot.stats.goldEarned)}`} />
          <Stat label="摧毁建筑" value={`${snapshot.stats.destroyed}`} />
          <Stat label="伐木总量" value={`${Math.floor(snapshot.stats.woodGathered)}`} />
        </div>
        <div className="mt-2 text-[10px] text-white/35">每次购买木材为 {WOOD_PACK.amount} 木</div>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={onRestart} className="rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-amber-950">
            再来一局
          </button>
          <button type="button" onClick={onMenu} className="rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white/80">
            返回菜单
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
      <div className="text-[10px] text-white/40">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
