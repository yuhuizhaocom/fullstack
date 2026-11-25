"use client";

import { useState } from "react";

import {
  BUILDINGS,
  ITEMS,
  MODES,
  PHASE_LABEL,
  PHASE_TIP,
  RESEARCH,
  UNITS,
  buildingCost,
} from "@/lib/hunter/config";
import type {
  BuildingKind,
  Difficulty,
  GameResult,
  HunterSettings,
  ItemKind,
  Mode,
  Phase,
  ResearchKind,
  Side,
  SideStats,
  UnitKind,
} from "@/lib/hunter/types";

const CARD = "rounded-xl border border-amber-900/40 bg-[#151009]/95";

export type HireOption = { kind: UnitKind; ok: boolean; reason: string };

export type SaveMeta = {
  side: Side;
  mode: Mode;
  difficulty: Difficulty;
  elapsed: number;
};

const MODE_LIST: Mode[] = ["normal", "fast", "expert"];

export function MenuScreen(props: {
  side: Side;
  mode: Mode;
  difficulty: Difficulty;
  onSide: (side: Side) => void;
  onMode: (mode: Mode) => void;
  onDifficulty: (difficulty: Difficulty) => void;
  onStart: () => void;
  save: SaveMeta | null;
  onContinue: () => void;
}) {
  return (
    <div className="min-h-dvh w-full bg-[#070f0a] px-4 py-6 text-amber-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="text-center">
          <p className="text-xs tracking-[0.35em] text-emerald-400/80">新猎人 vs 农民 · 单人对抗 AI</p>
          <h1 className="mt-2 text-3xl font-black tracking-wide text-amber-200 sm:text-4xl">新猎人vs农民</h1>
          <p className="mt-2 text-sm leading-relaxed text-amber-100/70">
            7 名农民对抗 3 名猎人。农民前期藏匿养鸡、角落起家，后期转羊猪、出傀儡反推；
            猎人插眼搜图、买装备与地雷拆家。计时结束时只要还有猎人活着，猎人获胜。
          </p>
        </header>

        <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["hide", "expand", "reversal"] as Phase[]).map((phase, index) => (
            <div key={phase} className={`${CARD} p-3`}>
              <p className="text-[10px] text-amber-500/80">阶段 {index + 1}</p>
              <p className="text-sm font-bold text-amber-200">{PHASE_LABEL[phase]}</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/65">{PHASE_TIP[phase]}</p>
            </div>
          ))}
        </section>

        <section className={`${CARD} p-4`}>
          <p className="text-xs text-amber-500/80">选择阵营</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                { side: "farmer" as Side, title: "农民（7 人）", desc: "你是 1 号农民：鸡窝滚钱、角落起家、出主傀儡" },
                { side: "hunter" as Side, title: "猎人（3 人）", desc: "你是 1 号猎人：插眼、杀人买兵、锤子乌云地雷" },
              ]
            ).map((option) => (
              <button
                key={option.side}
                onClick={() => props.onSide(option.side)}
                className={`rounded-lg border px-3 py-3 text-left transition ${
                  props.side === option.side
                    ? "border-amber-400 bg-amber-500/15 text-amber-100"
                    : "border-amber-900/50 bg-black/30 text-amber-200/70"
                }`}
              >
                <span className="block text-base font-bold">{option.title}</span>
                <span className="mt-1 block text-[11px] leading-snug opacity-80">{option.desc}</span>
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs text-amber-500/80">模式</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {MODE_LIST.map((mode) => (
              <button
                key={mode}
                onClick={() => props.onMode(mode)}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${
                  props.mode === mode
                    ? "border-amber-400 bg-amber-500/15 text-amber-100"
                    : "border-amber-900/50 bg-black/30 text-amber-200/70"
                }`}
              >
                <span className="block text-sm font-bold">{MODES[mode].label}</span>
                <span className="mt-1 block text-[10px] leading-snug opacity-75">{MODES[mode].desc}</span>
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs text-amber-500/80">AI 难度</p>
          <div className="mt-2 flex gap-2">
            {(["easy", "normal", "hard"] as Difficulty[]).map((level) => (
              <button
                key={level}
                onClick={() => props.onDifficulty(level)}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs ${
                  props.difficulty === level
                    ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                    : "border-amber-900/50 bg-black/30 text-amber-200/70"
                }`}
              >
                {level === "easy" ? "简单" : level === "normal" ? "普通" : "困难"}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={props.onStart}
              className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-base font-bold text-black active:scale-[0.99]"
            >
              开始对局
            </button>
            <button
              onClick={props.onContinue}
              disabled={!props.save}
              className="flex-1 rounded-xl border border-emerald-600/60 bg-emerald-900/30 px-4 py-3 text-sm font-semibold text-emerald-200 disabled:opacity-35"
            >
              {props.save
                ? `继续上局 · ${props.save.side === "farmer" ? "农民" : "猎人"} · ${Math.floor(
                    props.save.elapsed / 60
                  )} 分钟`
                : "暂无可继续的对局"}
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-amber-100/45">
            建议横屏游玩。对局每 6 秒自动存档到本机。玩法、数值与装备参考 KK 对战平台《新猎人vs农民》，美术为原创像素风。
          </p>
        </section>
      </div>
    </div>
  );
}

export function BuildPanel(props: {
  side: Side;
  mode: Mode;
  gold: number;
  demolish: boolean;
  onPick: (kind: BuildingKind) => void;
  onToggleDemolish: () => void;
  onClose: () => void;
}) {
  const [group, setGroup] = useState<"economy" | "tower" | "wall" | "tech">("economy");
  const list = (Object.keys(BUILDINGS) as BuildingKind[]).filter(
    (kind) => BUILDINGS[kind].side === props.side && !BUILDINGS[kind].fixed && BUILDINGS[kind].group === group
  );
  const groups: { key: typeof group; label: string }[] = [
    { key: "economy", label: "经济" },
    { key: "tower", label: "防御塔" },
    { key: "wall", label: "墙体" },
    { key: "tech", label: "科技" },
  ];
  return (
    <div className={`${CARD} pointer-events-auto max-h-[52vh] overflow-y-auto p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-amber-200">建造</p>
        <div className="flex items-center gap-2">
          <button
            onClick={props.onToggleDemolish}
            className={`rounded-md border px-2 py-1 text-[11px] ${
              props.demolish
                ? "border-rose-400 bg-rose-500/20 text-rose-200"
                : "border-amber-900/60 text-amber-200/70"
            }`}
          >
            {props.demolish ? "拆除模式·点建筑" : "拆除"}
          </button>
          <button onClick={props.onClose} className="rounded-md border border-amber-900/60 px-2 py-1 text-[11px] text-amber-200/70">
            关闭
          </button>
        </div>
      </div>
      <div className="mb-2 flex gap-1">
        {groups.map((item) => (
          <button
            key={item.key}
            onClick={() => setGroup(item.key)}
            className={`flex-1 rounded-md border px-2 py-1 text-[11px] ${
              group === item.key
                ? "border-amber-400 bg-amber-500/15 text-amber-100"
                : "border-amber-900/50 bg-black/30 text-amber-200/60"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((kind) => {
          const spec = BUILDINGS[kind];
          const cost = buildingCost(kind, props.mode);
          const uniqueBlocked =
            spec.unique &&
            false; // 是否已建由引擎判断，面板只提示
          const poor = props.gold < cost;
          return (
            <button
              key={kind}
              onClick={() => props.onPick(kind)}
              className={`rounded-lg border p-2 text-left ${
                uniqueBlocked || poor
                  ? "border-amber-900/40 bg-black/30 opacity-60"
                  : "border-amber-700/50 bg-amber-950/30 active:scale-[0.98]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg leading-none">{spec.icon}</span>
                <span className="text-[10px] text-amber-300/80">{spec.name}</span>
              </div>
              <p className="mt-1 text-[10px] text-amber-100/60">{cost} 金</p>
              <p className="mt-1 line-clamp-2 text-[9px] leading-tight text-amber-100/40">{spec.desc}</p>
            </button>
          );
        })}
        {list.length === 0 ? (
          <p className="col-span-2 text-[11px] text-amber-100/40">该分类暂无可建造建筑。</p>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] text-amber-100/40">选择建筑后在地图上点按放置，绿色表示可建。</p>
    </div>
  );
}

export function HirePanel(props: {
  side: Side;
  options: HireOption[];
  onHire: (kind: UnitKind) => void;
  onClose: () => void;
}) {
  return (
    <div className={`${CARD} pointer-events-auto max-h-[52vh] overflow-y-auto p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-amber-200">招募</p>
        <button onClick={props.onClose} className="rounded-md border border-amber-900/60 px-2 py-1 text-[11px] text-amber-200/70">
          关闭
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {props.options.map(({ kind, ok, reason }) => {
          const spec = UNITS[kind];
          return (
            <button
              key={kind}
              onClick={() => props.onHire(kind)}
              disabled={!ok}
              className={`rounded-lg border p-2 text-left ${
                ok ? "border-amber-700/50 bg-amber-950/30 active:scale-[0.98]" : "border-neutral-700/50 bg-black/30 opacity-55"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg leading-none">{spec.icon}</span>
                <span className="text-[10px] text-amber-300/80">{spec.name}</span>
              </div>
              <p className="mt-1 text-[10px] text-amber-100/60">{spec.costGold} 金</p>
              <p className="mt-1 text-[9px] leading-tight text-amber-100/40">{ok ? spec.desc : reason}</p>
            </button>
          );
        })}
      </div>
      {props.side === "farmer" ? (
        <p className="mt-2 text-[10px] text-amber-100/40">
          主傀儡需要全队先建成傀儡工厂（2000 金），每人限 1 个，出厂自带分身。
        </p>
      ) : (
        <p className="mt-2 text-[10px] text-amber-100/40">杀死农民后回中间兵营买 40 金巡逻兵，最多 6 个。</p>
      )}
    </div>
  );
}

export function ResearchPanel(props: {
  mode: Mode;
  gold: number;
  levels: Record<ResearchKind, number>;
  hasLab: boolean;
  onBuy: (kind: ResearchKind) => void;
  onClose: () => void;
}) {
  return (
    <div className={`${CARD} pointer-events-auto max-h-[52vh] overflow-y-auto p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-amber-200">研究所科技</p>
        <button onClick={props.onClose} className="rounded-md border border-amber-900/60 px-2 py-1 text-[11px] text-amber-200/70">
          关闭
        </button>
      </div>
      {!props.hasLab ? (
        <p className="mb-2 rounded-md border border-rose-900/60 bg-rose-950/30 px-2 py-1 text-[11px] text-rose-200">
          需要先建造研究所（150 金）
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(Object.keys(RESEARCH) as ResearchKind[]).map((kind) => {
          const spec = RESEARCH[kind];
          const level = props.levels[kind] ?? 0;
          const maxed = level >= spec.max;
          const cost = spec.cost(level + 1, props.mode);
          const ok = props.hasLab && !maxed && props.gold >= cost;
          return (
            <button
              key={kind}
              onClick={() => props.onBuy(kind)}
              disabled={!ok}
              className={`rounded-lg border p-2 text-left ${
                maxed
                  ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-200"
                  : ok
                    ? "border-amber-700/50 bg-amber-950/30 active:scale-[0.98]"
                    : "border-neutral-700/50 bg-black/30 opacity-55"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {spec.icon} {spec.name}
                </span>
                <span className="text-[10px] text-amber-300/80">
                  {level}/{spec.max}
                </span>
              </div>
              <p className="mt-1 text-[9px] leading-tight text-amber-100/50">{spec.desc(level, props.mode)}</p>
              <p className="mt-1 text-[10px] text-amber-200/70">{maxed ? "已满级" : `${cost} 金`}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ShopPanel(props: {
  gold: number;
  mode: Mode;
  time: number;
  canShop: boolean;
  owned: { hammer: boolean; gloves: boolean; poison: boolean };
  stock: { horns: number; mines: number; potions: number };
  onBuy: (item: ItemKind) => void;
  onUse: (item: ItemKind) => void;
  onClose: () => void;
}) {
  return (
    <div className={`${CARD} pointer-events-auto max-h-[52vh] overflow-y-auto p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-amber-200">猎人商店 · 移动商人</p>
        <button onClick={props.onClose} className="rounded-md border border-amber-900/60 px-2 py-1 text-[11px] text-amber-200/70">
          关闭
        </button>
      </div>
      {!props.canShop ? (
        <p className="mb-2 rounded-md border border-rose-900/60 bg-rose-950/30 px-2 py-1 text-[11px] text-rose-200">
          离商人太远了：商人每 10 秒换位，追到 480 距离内再买。
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(Object.keys(ITEMS) as ItemKind[]).map((item) => {
          const spec = ITEMS[item];
          const noMines = item === "mine" && !MODES[props.mode].mines;
          const locked = noMines || (!!spec.unlockAt && props.time < spec.unlockAt);
          const owned =
            (item === "hammer" && props.owned.hammer) ||
            (item === "gloves" && props.owned.gloves) ||
            (item === "poison" && props.owned.poison);
          const count =
            item === "horn" ? props.stock.horns : item === "mine" ? props.stock.mines : item === "potion" ? props.stock.potions : 0;
          const canBuy = props.canShop && !locked && !owned && props.gold >= spec.cost;
          return (
            <div key={item} className="rounded-lg border border-amber-900/50 bg-black/30 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-200">
                  {spec.icon} {spec.name}
                </span>
                <span className="text-[10px] text-amber-400/80">
                  {owned ? "已装备" : spec.permanent ? "永久" : `数量 ${count}`}
                </span>
              </div>
              <p className="mt-1 text-[9px] leading-tight text-amber-100/50">
                {noMines ? "快速模式不提供地雷" : locked ? "20 分钟后开放" : spec.desc}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => props.onBuy(item)}
                  disabled={!canBuy}
                  className="flex-1 rounded-md bg-amber-600/80 px-2 py-1 text-[10px] font-semibold text-black disabled:opacity-40"
                >
                  {owned ? "已拥有" : `购买 ${spec.cost}`}
                </button>
                <button
                  onClick={() => props.onUse(item)}
                  disabled={
                    !!spec.permanent ||
                    (item === "horn" ? props.stock.horns <= 0 : item === "mine" ? props.stock.mines <= 0 : props.stock.potions <= 0)
                  }
                  className="flex-1 rounded-md border border-amber-700/70 px-2 py-1 text-[10px] text-amber-200 disabled:opacity-40"
                >
                  使用
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-amber-100/40">
        涂毒不占装备栏；地雷放置 10 秒后引爆；乌云号角让 420 范围内的农民箭塔失效 8 秒。
      </p>
    </div>
  );
}

export function PauseMenu(props: {
  onResume: () => void;
  onSettings: () => void;
  onExit: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
      <div className={`${CARD} w-full max-w-sm p-5`}>
        <p className="text-center text-lg font-bold text-amber-200">已暂停</p>
        <p className="mt-1 text-center text-xs text-amber-100/50">模拟与计时都已停下，随时可以回来。</p>
        <div className="mt-4 flex flex-col gap-2">
          <button onClick={props.onResume} className="rounded-lg bg-amber-500 px-3 py-3 text-sm font-bold text-black">
            继续对局
          </button>
          <button onClick={props.onSettings} className="rounded-lg border border-amber-800/60 px-3 py-3 text-sm font-semibold text-amber-200">
            设置
          </button>
          <button onClick={props.onExit} className="rounded-lg border border-rose-900/60 px-3 py-3 text-sm text-rose-200">
            保存并返回入口
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel(props: {
  settings: HunterSettings;
  onChange: (settings: HunterSettings) => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<HunterSettings>) => props.onChange({ ...props.settings, ...patch });
  return (
    <div className={`${CARD} pointer-events-auto p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-amber-200">设置</p>
        <button onClick={props.onClose} className="rounded-md border border-amber-900/60 px-2 py-1 text-[11px] text-amber-200/70">
          关闭
        </button>
      </div>
      <div className="space-y-3 text-xs text-amber-100/80">
        <div>
          <p className="mb-1 text-amber-500/80">摇杆位置</p>
          <div className="flex gap-2">
            {(["left", "right"] as const).map((side) => (
              <button
                key={side}
                onClick={() => set({ joystickSide: side })}
                className={`flex-1 rounded-md border px-2 py-2 ${
                  props.settings.joystickSide === side ? "border-amber-400 bg-amber-500/15 text-amber-100" : "border-amber-900/60 text-amber-200/70"
                }`}
              >
                {side === "left" ? "左侧" : "右侧"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-amber-500/80">按钮大小</p>
          <div className="flex gap-2">
            {(["compact", "normal", "large"] as const).map((scale) => (
              <button
                key={scale}
                onClick={() => set({ buttonScale: scale })}
                className={`flex-1 rounded-md border px-2 py-2 ${
                  props.settings.buttonScale === scale ? "border-amber-400 bg-amber-500/15 text-amber-100" : "border-amber-900/60 text-amber-200/70"
                }`}
              >
                {scale === "compact" ? "小" : scale === "normal" ? "中" : "大"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-amber-500/80">视野缩放</p>
          <div className="flex gap-2">
            {[0.6, 0.75, 0.9].map((zoom) => (
              <button
                key={zoom}
                onClick={() => set({ zoom })}
                className={`flex-1 rounded-md border px-2 py-2 ${
                  Math.abs(props.settings.zoom - zoom) < 0.01 ? "border-amber-400 bg-amber-500/15 text-amber-100" : "border-amber-900/60 text-amber-200/70"
                }`}
              >
                {zoom.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={props.settings.sound} onChange={(event) => set({ sound: event.target.checked })} />
            音效
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={props.settings.music} onChange={(event) => set({ music: event.target.checked })} />
            音乐
          </label>
        </div>
      </div>
    </div>
  );
}

export function ResultPanel(props: {
  result: GameResult;
  side: Side;
  stats: SideStats;
  onReplay: () => void;
  onMenu: () => void;
}) {
  const win = props.result.winner === props.side;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-5">
      <div className={`${CARD} w-full max-w-md p-5`}>
        <p className={`text-center text-2xl font-black ${win ? "text-emerald-300" : "text-rose-300"}`}>
          {win ? "胜利" : "失败"}
        </p>
        <p className="mt-2 text-center text-sm text-amber-100/70">
          {props.result.reason === "timeout"
            ? "计时结束，仍有猎人存活。"
            : "三位猎人的命全部耗尽，农民完成反杀。"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-amber-100/70">
          <div className="rounded-lg border border-amber-900/50 bg-black/30 p-2">击杀：{props.stats.kills}</div>
          <div className="rounded-lg border border-amber-900/50 bg-black/30 p-2">总收入：{props.stats.goldEarned}</div>
          <div className="rounded-lg border border-amber-900/50 bg-black/30 p-2">建造：{props.stats.built}</div>
          <div className="rounded-lg border border-amber-900/50 bg-black/30 p-2">招募：{props.stats.hired}</div>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button onClick={props.onReplay} className="rounded-lg bg-amber-500 px-3 py-3 text-sm font-bold text-black">
            再来一局
          </button>
          <button onClick={props.onMenu} className="rounded-lg border border-amber-800/60 px-3 py-3 text-sm text-amber-200">
            返回入口
          </button>
        </div>
      </div>
    </div>
  );
}
