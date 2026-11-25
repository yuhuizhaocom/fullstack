"use client";

import { useState } from "react";
import { Backpack, Coins } from "lucide-react";

import { CLASSES, CLASS_SKILLS, ITEMS, PETS, RARITY_COLOR, RARITY_LABEL, SHOP_ITEMS, SKILLS } from "@/lib/game/data";
import {
  addItem,
  availableSkillPoints,
  canEquip,
  clearSave,
  effectiveStats,
  enhanceCap,
  enhanceCost,
  expToNext,
  MAX_ENHANCE,
  MAX_LEVEL,
  MAX_PET_LEVEL,
  MAX_SKILL_RANK,
  petAttack,
  petExpToNext,
  removeItem,
  sellPrice,
  skillRank,
} from "@/lib/game/engine";
import type { ClassId, EquipSlot, GameSave, ItemDef, ItemKind } from "@/lib/game/types";
import { cn } from "@/lib/utils";

/** 职业定位：面板上一眼看出这个角色该站前排还是后排 */
const CLASS_ROLE: Record<ClassId, string> = {
  warrior: "近战 · 坦克",
  mage: "远程 · 法术",
  ranger: "远程 · 物理",
  priest: "辅助 · 治疗",
  assassin: "近战 · 爆发",
  guardian: "近战 · 守护",
};

export const pixelPanel =
  "rounded-lg border-2 border-slate-700 bg-slate-900/80 p-3";
export const pixelButton =
  "rounded border-2 border-slate-600 bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-100 transition-colors hover:bg-slate-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";
export const pixelButtonPrimary =
  "rounded border-2 border-amber-500 bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-300 transition-colors hover:bg-amber-500/30 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";

type PanelProps = {
  save: GameSave;
  onChange: (save: GameSave) => void;
  notify: (message: string) => void;
};

export function itemStats(item: ItemDef): string {
  const parts: string[] = [];
  if (item.atk) parts.push(`攻击 +${item.atk}`);
  if (item.def) parts.push(`防御 +${item.def}`);
  if (item.spd) parts.push(`移速 +${item.spd}`);
  if (item.maxHp) parts.push(`生命 +${item.maxHp}`);
  if (item.crit) parts.push(`暴击 +${item.crit}%`);
  if (item.cdr) parts.push(`冷却缩减 +${item.cdr}%`);
  if (item.lifesteal) parts.push(`吸血 +${item.lifesteal}%`);
  if (item.hp) parts.push(`回复 ${item.hp} 生命`);
  return parts.join(" · ");
}

export function itemNameColor(item: ItemDef): string | undefined {
  return item.rarity ? RARITY_COLOR[item.rarity] : undefined;
}

const EQUIP_SLOTS: { key: EquipSlot; label: string; icon: string }[] = [
  { key: "weapon", label: "武器", icon: "🗡️" },
  { key: "armor", label: "护甲", icon: "🛡️" },
  { key: "boots", label: "鞋子", icon: "👟" },
  { key: "accessory", label: "饰品", icon: "💍" },
];

export function CharacterPanel({ save, onChange, notify }: PanelProps) {
  const stats = effectiveStats(save);
  const cls = CLASSES[save.classId];
  const need = expToNext(save.level);

  function unequip(slot: EquipSlot) {
    const id = save.equipment[slot];
    if (!id) return;
    onChange({
      ...save,
      equipment: { ...save.equipment, [slot]: null },
      inventory: addItem(save.inventory, id),
    });
    notify(`已卸下 ${ITEMS[id]?.name ?? "装备"}`);
  }

  function reset() {
    if (!window.confirm("确定删除当前角色吗？该角色与进度会全部丢失。")) return;
    clearSave();
    window.location.reload();
  }

  function enhance(slot: EquipSlot) {
    const id = save.equipment[slot];
    if (!id) return;
    const current = save.enhancements?.[slot] ?? 0;
    if (current >= MAX_ENHANCE) {
      notify("该部位已强化至上限 +15");
      return;
    }
    const cap = enhanceCap(save);
    if (current >= cap) {
      notify(`角色等级不足，Lv.${save.level} 最多强化到 +${cap}`);
      return;
    }
    const cost = enhanceCost(slot, save);
    if (save.gold < cost.gold) {
      notify(`金币不足，需要 ${cost.gold} 金币`);
      return;
    }
    if ((save.inventory.enhance_stone ?? 0) < cost.stone) {
      notify(`强化石不足，需要 ${cost.stone} 个`);
      return;
    }
    onChange({
      ...save,
      gold: save.gold - cost.gold,
      inventory: removeItem(save.inventory, "enhance_stone", cost.stone),
      enhancements: { ...save.enhancements, [slot]: current + 1 },
    });
    notify(`强化成功！${ITEMS[id]?.name ?? "装备"} +${current + 1}`);
  }

  return (
    <div className="space-y-3">
      <div className={pixelPanel}>
        <div className="flex items-center gap-3">
          <span className="text-4xl">{cls.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-100">
              {save.name}
              <span className="ml-2 text-[11px] font-normal text-amber-300">
                Lv.{save.level} {cls.name}
              </span>
              <span className="ml-1.5 rounded bg-slate-700/60 px-1 py-0.5 align-middle text-[9px] font-normal text-slate-300">
                {CLASS_ROLE[save.classId]}
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">{cls.desc}</p>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-sky-300">
              <span className="rounded bg-sky-500/15 px-1 py-0.5 font-bold">
                被动 · {cls.passive.name}
              </span>
              <span className="truncate text-slate-500">{cls.passive.desc}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-xs font-bold text-amber-300">
              <Coins className="size-3.5" />
              {save.gold}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">胜场 {save.wins}</p>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>经验</span>
            <span>
              {save.level >= MAX_LEVEL ? "已满级" : `${save.exp} / ${need}`}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800">
            <div
              className="h-full rounded bg-sky-400"
              style={{
                width:
                  save.level >= MAX_LEVEL
                    ? "100%"
                    : `${Math.min(100, (save.exp / need) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className={pixelPanel}>
        <p className="mb-2 text-[11px] font-bold text-slate-300">属性</p>
        <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-3">
          {[
            { label: "生命", value: `${Math.ceil(save.hp)} / ${Math.round(stats.maxHp)}` },
            { label: "攻击", value: Math.round(stats.atk) },
            { label: "防御", value: Math.round(stats.def) },
            { label: "速度", value: Math.round(stats.spd) },
            { label: "暴击", value: `${Math.round(stats.crit)}%` },
            { label: "冷却缩减", value: `${Math.round(stats.cdr)}%` },
            { label: "吸血", value: `${Math.round(stats.lifesteal)}%` },
            { label: "技能点", value: availableSkillPoints(save) },
            { label: "强化上限", value: `+${enhanceCap(save)}` },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded bg-slate-950/60 px-2 py-1"
            >
              <span className="text-slate-500">{row.label}</span>
              <span className="font-bold text-slate-200">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={pixelPanel}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-300">装备与锻造</p>
          <span className="text-[10px] text-slate-500">
            强化石 ×{save.inventory.enhance_stone ?? 0}
          </span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {EQUIP_SLOTS.map((slot) => {
            const id = save.equipment[slot.key];
            const item = id ? ITEMS[id] : null;
            const level = save.enhancements?.[slot.key] ?? 0;
            const cost = item ? enhanceCost(slot.key, save) : null;
            const cap = enhanceCap(save);
            return (
              <div
                key={slot.key}
                className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5"
              >
                <span className="w-9 text-[10px] text-slate-500">{slot.label}</span>
                <span className="text-lg">{item?.icon ?? slot.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-[11px] font-bold">
                    <span style={{ color: item ? itemNameColor(item) : undefined }}>
                      {item?.name ?? "空"}
                    </span>
                    {item && level > 0 && (
                      <span className="text-amber-300">+{level}</span>
                    )}
                    {item?.rarity && (
                      <span
                        className="rounded px-1 text-[9px] font-normal"
                        style={{
                          color: RARITY_COLOR[item.rarity],
                          background: `${RARITY_COLOR[item.rarity]}22`,
                        }}
                      >
                        {RARITY_LABEL[item.rarity]}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[10px] text-slate-500">
                    {item ? itemStats(item) : "未装备"}
                    {item
                      ? ` · 强化 +${level}/${Math.min(MAX_ENHANCE, cap)}`
                      : ""}
                  </p>
                </div>
                {item && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" className={pixelButton} onClick={() => unequip(slot.key)}>
                      卸下
                    </button>
                    <button
                      type="button"
                      className={pixelButtonPrimary}
                      disabled={level >= MAX_ENHANCE || level >= cap}
                      onClick={() => enhance(slot.key)}
                      title={
                        level >= cap
                          ? `角色 Lv.${save.level} 最高 +${cap}`
                          : `消耗 ${cost?.gold} 金币 · ${cost?.stone} 强化石`
                      }
                    >
                      强化 {cost?.gold ?? 0}G
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          强化每级提升该部位装备 6% 属性，上限 +{MAX_ENHANCE}，且受角色等级限制（每 4 级解锁 1 级强化）。强化石可通过怪物掉落与商店获取。
        </p>
      </div>

      <button type="button" className={pixelButton} onClick={reset}>
        重置存档
      </button>
    </div>
  );
}

const BAG_FILTERS: { key: ItemKind | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "consumable", label: "药水" },
  { key: "weapon", label: "武器" },
  { key: "armor", label: "护甲" },
  { key: "boots", label: "鞋子" },
  { key: "accessory", label: "饰品" },
  { key: "material", label: "材料" },
];

export function BagPanel({ save, onChange, notify }: PanelProps) {
  const [filter, setFilter] = useState<ItemKind | "all">("all");
  const entries = Object.entries(save.inventory)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ item: ITEMS[id], count }))
    .filter((row) => row.item && (filter === "all" || row.item.kind === filter))
    // 旧存档遗留的蓝药已无用途，不再展示
    .filter((row) => !(row.item.kind === "consumable" && row.item.mp && !row.item.hp));

  function usePotion(item: ItemDef) {
    const stats = effectiveStats(save);
    const hp = Math.min(stats.maxHp, save.hp + (item.hp ?? 0));
    if (hp === save.hp) {
      notify("生命已满");
      return;
    }
    onChange({ ...save, hp, inventory: removeItem(save.inventory, item.id) });
    notify(`使用了 ${item.name}`);
  }

  function equip(item: ItemDef) {
    if (!canEquip(item, save)) {
      notify(!item.classId || item.classId === save.classId ? "等级不足" : "职业不符");
      return;
    }
    const slot: EquipSlot =
      item.kind === "weapon"
        ? "weapon"
        : item.kind === "armor"
          ? "armor"
          : item.kind === "boots"
            ? "boots"
            : "accessory";
    const prev = save.equipment[slot];
    let inventory = removeItem(save.inventory, item.id);
    if (prev) inventory = addItem(inventory, prev);
    onChange({
      ...save,
      equipment: { ...save.equipment, [slot]: item.id },
      inventory,
    });
    notify(`装备了 ${item.name}`);
  }

  function sell(item: ItemDef) {
    const price = sellPrice(item);
    onChange({
      ...save,
      gold: save.gold + price,
      inventory: removeItem(save.inventory, item.id),
    });
    notify(`出售 ${item.name}，获得 ${price} 金币`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {BAG_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={cn(
              pixelButton,
              filter === item.key && "border-amber-500 bg-amber-500/20 text-amber-300"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={pixelPanel}>
        {entries.length === 0 ? (
          <p className="flex flex-col items-center gap-2 py-8 text-[11px] text-slate-500">
            <Backpack className="size-6" />
            背包空空如也
          </p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map(({ item, count }) => {
              const equippable = ["weapon", "armor", "boots", "accessory"].includes(item.kind);
              const legal = equippable && canEquip(item, save);
              const blockReason =
                equippable && !legal
                  ? !item.classId || item.classId === save.classId
                    ? "等级不足"
                    : "职业不符"
                  : "";
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5",
                    equippable && !legal && "opacity-70"
                  )}
                >
                  <span className="text-lg">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-[11px] font-bold">
                      <span style={{ color: itemNameColor(item) }}>{item.name}</span>
                      <span className="text-[10px] font-normal text-slate-500">×{count}</span>
                      {item.level ? (
                        <span className="text-[10px] font-normal text-slate-500">
                          Lv.{item.level}
                        </span>
                      ) : null}
                      {item.classId ? (
                        <span className="rounded bg-slate-700/50 px-1 text-[9px] font-normal text-slate-300">
                          {CLASSES[item.classId].icon} {CLASSES[item.classId].name}专属
                        </span>
                      ) : null}
                      {blockReason ? (
                        <span className="rounded bg-rose-500/10 px-1 text-[9px] font-normal text-rose-300">
                          {blockReason}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {itemStats(item) || item.desc}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {item.kind === "consumable" && (
                      <button type="button" className={pixelButton} onClick={() => usePotion(item)}>
                        使用
                      </button>
                    )}
                    {equippable && (
                      <button
                        type="button"
                        className={pixelButtonPrimary}
                        disabled={!legal}
                        onClick={() => equip(item)}
                      >
                        装备
                      </button>
                    )}
                    <button type="button" className={pixelButton} onClick={() => sell(item)}>
                      卖 {sellPrice(item)}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

const ELEMENT_STYLE: Record<string, { label: string; className: string }> = {
  fire: { label: "火焰", className: "bg-orange-500/15 text-orange-300" },
  frost: { label: "冰霜", className: "bg-sky-500/15 text-sky-300" },
  holy: { label: "圣光", className: "bg-amber-400/15 text-amber-300" },
  shadow: { label: "暗影", className: "bg-rose-500/15 text-rose-300" },
  physical: { label: "物理", className: "bg-slate-500/20 text-slate-300" },
};
const SKILL_ELEMENT: Record<string, keyof typeof ELEMENT_STYLE> = {
  disintegrate: "fire",
  incinerate: "fire",
  tibbers: "fire",
  molten_shield: "fire",
  frost_shot: "frost",
  crystal_arrow: "frost",
  crystal_rain: "frost",
  starlight: "holy",
  astral_infusion: "holy",
  equinox: "holy",
  wish: "holy",
  demacia_justice: "holy",
  courage: "holy",
  shadow_assault: "shadow",
  venom_blade: "shadow",
  smoke_screen: "shadow",
  soul_reap: "shadow",
};

export function SkillsPanel({ save, onChange, notify }: PanelProps) {
  const skillIds = CLASS_SKILLS[save.classId];
  const points = availableSkillPoints(save);

  function levelUp(skillId: string) {
    const current = skillRank(save, skillId);
    if (current === 0) {
      notify("技能尚未解锁");
      return;
    }
    if (current >= MAX_SKILL_RANK) {
      notify(`该技能已满级（${MAX_SKILL_RANK}）`);
      return;
    }
    if (points <= 0) {
      notify("技能点不足，升级角色可获得技能点");
      return;
    }
    onChange({
      ...save,
      skillRanks: {
        ...save.skillRanks,
        [skillId]: current + 1,
      },
    });
    notify(`${SKILLS[skillId].name} 提升至 ${current + 1} 级`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400">
          技能每级 +10% 效果并降低冷却，每升 1 级角色获得 1 点技能点。
        </p>
        <span className="shrink-0 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">
          技能点 {points}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {skillIds.map((id, index) => {
          const skill = SKILLS[id];
          const unlocked = save.level >= skill.level;
          const rank = skillRank(save, id);
          const key = skill.key ?? ["Q", "W", "E", "R"][index] ?? "Q";
          return (
            <div
              key={id}
              className={cn(
                "rounded-lg border-2 p-3",
                unlocked
                  ? "border-amber-500/60 bg-slate-900/80"
                  : "border-slate-800 bg-slate-950/60 opacity-60"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded border-2 border-slate-600 bg-slate-800 text-[11px] font-black text-amber-300">
                  {key}
                </span>
                <span className="text-xl">{skill.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-slate-100">
                    {skill.name}
                    <span className="ml-1.5 text-[10px] font-normal text-amber-300">
                      {rank > 0 ? `${rank}/${MAX_SKILL_RANK} 级` : ""}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    <span
                      className={cn(
                        "mr-1 rounded px-1 py-0.5 text-[9px] font-bold",
                        ELEMENT_STYLE[SKILL_ELEMENT[id] ?? "physical"].className
                      )}
                    >
                      {ELEMENT_STYLE[SKILL_ELEMENT[id] ?? "physical"].label}
                    </span>
                    {unlocked ? "已解锁" : `Lv.${skill.level} 解锁`}
                    {skill.cooldown ? ` · CD ${skill.cooldown}s` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className={pixelButtonPrimary}
                  disabled={!unlocked || rank >= MAX_SKILL_RANK || points <= 0}
                  onClick={() => levelUp(id)}
                >
                  +
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{skill.desc}</p>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-slate-500">
                <span>耗蓝 {skill.mp}</span>
                {skill.range ? <span>射程 {skill.range}</span> : null}
                {skill.radius ? <span>半径 {skill.radius}</span> : null}
                {skill.dashDistance ? <span>位移 {skill.dashDistance}</span> : null}
                {skill.slowMs ? <span>减速 {(skill.slowMs / 1000).toFixed(1)}s</span> : null}
                {skill.multiplier ? <span>倍率 {Math.round(skill.multiplier * 100)}%</span> : null}
                {skill.hits && skill.hits > 1 ? <span>{skill.hits} 段</span> : null}
                {skill.healRatio ? <span>治疗 {Math.round(skill.healRatio * 100)}%</span> : null}
                {skill.buffAtk ? <span>攻击 +{skill.buffAtk}%</span> : null}
                {skill.buffTurns ? <span>持续 {skill.buffTurns}s</span> : null}
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full rounded bg-amber-400"
                  style={{ width: `${Math.min(100, (rank / MAX_SKILL_RANK) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PetPanel({ save, onChange, notify }: PanelProps) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        出战的宠物会在战斗中协助攻击，并在每回合提供被动效果。
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {save.pets.map((pet) => {
          const def = PETS[pet.id];
          if (!def) return null;
          const active = save.activePet === pet.id;
          const need = petExpToNext(pet.level);
          return (
            <div
              key={pet.id}
              className={cn(
                "rounded-lg border-2 p-3",
                active ? "border-amber-500/70 bg-slate-900/80" : "border-slate-800 bg-slate-950/60"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{def.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-slate-100">
                    {def.name}
                    <span className="ml-1.5 text-[10px] font-normal text-sky-300">
                      Lv.{pet.level}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    攻击 {petAttack(pet)} · 暴击 {def.crit}%
                  </p>
                </div>
                <button
                  type="button"
                  className={active ? pixelButton : pixelButtonPrimary}
                  onClick={() => {
                    onChange({ ...save, activePet: active ? null : pet.id });
                    notify(active ? `${def.name} 已休息` : `${def.name} 出战`);
                  }}
                >
                  {active ? "休息" : "出战"}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">{def.desc}</p>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                <span>经验</span>
                <span>
                  {pet.level >= MAX_PET_LEVEL ? "MAX" : `${pet.exp} / ${need}`}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full rounded bg-emerald-400"
                  style={{
                    width:
                      pet.level >= MAX_PET_LEVEL
                        ? "100%"
                        : `${Math.min(100, (pet.exp / need) * 100)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ShopPanel({ save, onChange, notify }: PanelProps) {
  const [tab, setTab] = useState<"item" | "pet">("item");

  function buy(item: ItemDef) {
    if (item.level && item.level > save.level) {
      notify(`需要 Lv.${item.level} 才能购买`);
      return;
    }
    if (save.gold < item.price) {
      notify("金币不足");
      return;
    }
    onChange({
      ...save,
      gold: save.gold - item.price,
      inventory: addItem(save.inventory, item.id),
    });
    notify(`购买了 ${item.name}`);
  }

  function buyPet(id: string) {
    const def = PETS[id];
    if (save.gold < def.price) {
      notify("金币不足");
      return;
    }
    if (save.pets.some((pet) => pet.id === id)) {
      notify("已经拥有这只宠物");
      return;
    }
    onChange({
      ...save,
      gold: save.gold - def.price,
      pets: [...save.pets, { id, level: 1, exp: 0 }],
      activePet: save.activePet ?? id,
    });
    notify(`获得了宠物 ${def.name}`);
  }

  const shopIds = SHOP_ITEMS.filter((id) => {
    const item = ITEMS[id];
    if (!item) return false;
    if (item.kind === "weapon" || item.kind === "accessory") {
      return !item.classId || item.classId === save.classId;
    }
    return true;
  }).sort(
    (a, b) =>
      (ITEMS[a].level ?? 1) - (ITEMS[b].level ?? 1) ||
      ITEMS[a].price - ITEMS[b].price
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {[
            { key: "item" as const, label: "道具与装备" },
            { key: "pet" as const, label: "宠物" },
          ].map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={cn(
                pixelButton,
                tab === entry.key && "border-amber-500 bg-amber-500/20 text-amber-300"
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-1 text-xs font-bold text-amber-300">
          <Coins className="size-3.5" />
          {save.gold}
        </span>
      </div>

      {tab === "item" ? (
        <div className={pixelPanel}>
          <ul className="space-y-1.5">
            {shopIds.map((id) => {
              const item = ITEMS[id];
              const levelLocked = !!item.level && item.level > save.level;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5"
                >
                  <span className="text-lg">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold">
                      <span style={{ color: itemNameColor(item) }}>{item.name}</span>
                      {item.level && item.level > 1 ? (
                        <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                          Lv.{item.level}
                        </span>
                      ) : null}
                      {item.rarity && (
                        <span
                          className="ml-1 rounded px-1 text-[9px] font-normal"
                          style={{
                            color: RARITY_COLOR[item.rarity],
                            background: `${RARITY_COLOR[item.rarity]}22`,
                          }}
                        >
                          {RARITY_LABEL[item.rarity]}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {itemStats(item) || item.desc}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={pixelButtonPrimary}
                    disabled={save.gold < item.price || levelLocked}
                    onClick={() => buy(item)}
                  >
                    {levelLocked ? `Lv.${item.level} 解锁` : `${item.price} 金币`}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(PETS).map((pet) => {
            const owned = save.pets.some((entry) => entry.id === pet.id);
            return (
              <div key={pet.id} className={pixelPanel}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{pet.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-slate-100">{pet.name}</p>
                    <p className="text-[10px] text-slate-500">
                      攻击 {pet.atk} · 暴击 {pet.crit}%
                    </p>
                  </div>
                  <button
                    type="button"
                    className={pixelButtonPrimary}
                    disabled={owned || save.gold < pet.price}
                    onClick={() => buyPet(pet.id)}
                  >
                    {owned ? "已拥有" : `${pet.price} 金币`}
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{pet.desc}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
