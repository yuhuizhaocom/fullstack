"use client";

import { BUILDINGS, ITEMS, PHASE_LABEL, PHASE_TIP, SKILLS, UNITS, UPGRADES, phaseAllows } from "@/lib/hunter/config";
import type {
  BuildingKind,
  Difficulty,
  DurationMin,
  GameResult,
  ItemKind,
  Phase,
  Side,
  SideStats,
  SkillId,
  Stance,
  UnitKind,
  UpgradeKind,
} from "@/lib/hunter/types";
import type { HunterSettings } from "@/lib/hunter/types";

const CARD = "rounded-xl border border-amber-900/40 bg-[#151009]/95";

export type HireOption = { kind: UnitKind; ok: boolean; reason: string };

export type SaveMeta = {
  side: Side;
  difficulty: Difficulty;
  durationMin: DurationMin;
  elapsed: number;
};

export function MenuScreen(props: {
  side: Side;
  difficulty: Difficulty;
  durationMin: DurationMin;
  onSide: (side: Side) => void;
  onDifficulty: (difficulty: Difficulty) => void;
  onDuration: (duration: DurationMin) => void;
  onStart: () => void;
  save: SaveMeta | null;
  onContinue: () => void;
}) {
  return (
    <div className="min-h-dvh w-full bg-[#070f0a] px-4 py-6 text-amber-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="text-center">
          <p className="text-xs tracking-[0.35em] text-emerald-400/80">WARCRAFT 风格 · 单人对抗 AI</p>
          <h1 className="mt-2 text-3xl font-black tracking-wide text-amber-200 sm:text-4xl">猎人与农民</h1>
          <p className="mt-2 text-sm text-amber-100/70">
            前期藏匿发育，中期被猎人压制，后期攻守反转。撑到计时结束是猎人的胜利，杀光猎人是农民的胜利。
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
                { side: "farmer" as Side, title: "农民", desc: "建造、滚经济、后期反杀" },
                { side: "hunter" as Side, title: "猎人", desc: "鹰眼、裂地、猎杀与守家" },
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

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-amber-500/80">AI 难度</p>
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
            </div>
            <div>
              <p className="text-xs text-amber-500/80">单局总时长</p>
              <div className="mt-2 flex gap-2">
                {([30, 40, 50] as DurationMin[]).map((duration) => (
                  <button
                    key={duration}
                    onClick={() => props.onDuration(duration)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs ${
                      props.durationMin === duration
                        ? "border-amber-400 bg-amber-500/15 text-amber-100"
                        : "border-amber-900/50 bg-black/30 text-amber-200/70"
                    }`}
                  >
                    {duration} 分钟
                  </button>
                ))}
              </div>
            </div>
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
                ? `继续上局 · ${props.save.side === "farmer" ? "农民" : "猎人"} · ${Math.floor(props.save.elapsed / 60)} 分钟`
                : "暂无可继续的对局"}
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-amber-100/45">
            建议横屏游玩。对局会自动存档到本机，随时可以暂停回来继续。原作 Hunters vs Farmers 的玩法还原，美术为原创像素风。
          </p>
        </section>
      </div>
    </div>
  );
}

export function BuildPanel(props: {
  side: Side;
  phase: Phase;
  gold: number;
  wood: number;
  demolish: boolean;
  onPick: (kind: BuildingKind) => void;
  onToggleDemolish: () => void;
  onClose: () => void;
}) {
  const list = (Object.keys(BUILDINGS) as BuildingKind[]).filter(
    (kind) => BUILDINGS[kind].side === props.side
  );
  return (
    <div className={`${CARD} pointer-events-auto max-h-[46vh] overflow-y-auto p-3`}>
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((kind) => {
          const spec = BUILDINGS[kind];
          const locked = !phaseAllows(spec.unlock, props.phase);
          const poor = props.gold < spec.costGold || props.wood < spec.costWood;
          return (
            <button
              key={kind}
              disabled={locked}
              onClick={() => props.onPick(kind)}
              className={`rounded-lg border p-2 text-left ${
                locked
                  ? "border-neutral-700/50 bg-black/40 opacity-40"
                  : poor
                    ? "border-amber-900/40 bg-black/30 opacity-60"
                    : "border-amber-700/50 bg-amber-950/30 active:scale-[0.98]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg leading-none">{spec.icon}</span>
                <span className="text-[10px] text-amber-300/80">{spec.name}</span>
              </div>
              <p className="mt-1 text-[10px] text-amber-100/60">
                {spec.costGold} 金{spec.costWood > 0 ? ` · ${spec.costWood} 木` : ""}
              </p>
              <p className="mt-1 line-clamp-2 text-[9px] leading-tight text-amber-100/40">{spec.desc}</p>
            </button>
          );
        })}
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
  const list = props.options;
  return (
    <div className={`${CARD} pointer-events-auto max-h-[46vh] overflow-y-auto p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-amber-200">招募</p>
        <button onClick={props.onClose} className="rounded-md border border-amber-900/60 px-2 py-1 text-[11px] text-amber-200/70">
          关闭
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {list.map(({ kind, ok, reason }) => {
          const spec = UNITS[kind];
          return (
            <button
              key={kind}
              onClick={() => props.onHire(kind)}
              className={`rounded-lg border p-2 text-left ${
                ok ? "border-amber-700/50 bg-amber-950/30 active:scale-[0.98]" : "border-neutral-700/50 bg-black/30 opacity-55"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg leading-none">{spec.icon}</span>
                <span className="text-[10px] text-amber-300/80">{spec.name}</span>
              </div>
              <p className="mt-1 text-[10px] text-amber-100/60">
                {spec.costGold} 金{spec.costWood > 0 ? ` · ${spec.costWood} 木` : ""}
                {spec.pop > 0 ? ` · ${spec.pop} 人口` : ""}
              </p>
              <p className="mt-1 line-clamp-2 text-[9px] leading-tight text-amber-100/40">
                {ok ? spec.desc : reason}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ShopPanel(props: {
  gold: number;
  stock: Record<ItemKind, number>;
  upgrades: Record<UpgradeKind, boolean>;
  onBuy: (item: ItemKind) => void;
  onUse: (item: ItemKind) => void;
  onUpgrade: (kind: UpgradeKind) => void;
  onClose: () => void;
}) {
  return (
    <div className={`${CARD} pointer-events-auto max-h-[46vh] overflow-y-auto p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-amber-200">猎人商店</p>
        <button onClick={props.onClose} className="rounded-md border border-amber-900/60 px-2 py-1 text-[11px] text-amber-200/70">
          关闭
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(Object.keys(ITEMS) as ItemKind[]).map((item) => {
          const spec = ITEMS[item];
          const stock = props.stock[item];
          return (
            <div key={item} className="rounded-lg border border-amber-900/50 bg-black/30 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-200">
                  {spec.icon} {spec.name}
                </span>
                <span className="text-[10px] text-amber-400/80">库存 {stock}</span>
              </div>
              <p className="mt-1 text-[9px] leading-tight text-amber-100/50">{spec.desc}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => props.onBuy(item)}
                  disabled={props.gold < spec.cost || stock >= 5}
                  className="flex-1 rounded-md bg-amber-600/80 px-2 py-1 text-[10px] font-semibold text-black disabled:opacity-40"
                >
                  购买 {spec.cost}
                </button>
                <button
                  onClick={() => props.onUse(item)}
                  disabled={stock <= 0}
                  className="flex-1 rounded-md border border-amber-700/70 px-2 py-1 text-[10px] text-amber-200 disabled:opacity-40"
                >
                  使用
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-amber-500/80">战争磨坊升级</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(Object.keys(UPGRADES) as UpgradeKind[]).map((kind) => {
          const spec = UPGRADES[kind];
          const owned = props.upgrades[kind];
          return (
            <button
              key={kind}
              onClick={() => props.onUpgrade(kind)}
              disabled={owned || props.gold < spec.cost}
              className={`rounded-lg border p-2 text-left ${
                owned ? "border-emerald-600/60 bg-emerald-900/30 text-emerald-200" : "border-amber-900/50 bg-black/30 text-amber-200 disabled:opacity-40"
              }`}
            >
              <p className="text-xs font-semibold">
                {spec.icon} {spec.name}
              </p>
              <p className="mt-1 text-[9px] leading-tight opacity-70">{owned ? "已解锁" : `${spec.cost} 金 · ${spec.desc}`}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StancePanel(props: {
  stance: Stance;
  onStance: (stance: Stance) => void;
  onClose: () => void;
}) {
  const options: { stance: Stance; label: string; desc: string }[] = [
    { stance: "follow", label: "跟随", desc: "部队跟随英雄移动" },
    { stance: "guard", label: "守卫", desc: "驻守集结点，不主动出击" },
    { stance: "attack", label: "进攻", desc: "主动推进敌方营地" },
  ];
  return (
    <div className={`${CARD} pointer-events-auto p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-amber-200">部队姿态</p>
        <button onClick={props.onClose} className="rounded-md border border-amber-900/60 px-2 py-1 text-[11px] text-amber-200/70">
          关闭
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.stance}
            onClick={() => props.onStance(option.stance)}
            className={`rounded-lg border p-2 text-left ${
              props.stance === option.stance
                ? "border-amber-400 bg-amber-500/15 text-amber-100"
                : "border-amber-900/50 bg-black/30 text-amber-200/70"
            }`}
          >
            <p className="text-xs font-bold">{option.label}</p>
            <p className="mt-1 text-[9px] leading-tight opacity-70">{option.desc}</p>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-amber-100/40">点右下角「集结」按钮后点地图即可设置集结点（对守卫姿态生效）。</p>
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
          {props.result.reason === "timeout" ? "计时结束，猎人存活到最后。" : "猎人全部倒下，农民完成反杀。"}
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

export function SkillHint(props: { skill: SkillId | null; onCancel: () => void }) {
  if (!props.skill) return null;
  return (
    <div className="pointer-events-auto absolute bottom-[38vh] left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-600/70 bg-black/80 px-4 py-2 text-xs text-amber-100">
      点按地图释放「{SKILLS[props.skill].name}」
      <button onClick={props.onCancel} className="rounded-full border border-rose-500/70 px-2 py-0.5 text-rose-200">
        取消
      </button>
    </div>
  );
}
