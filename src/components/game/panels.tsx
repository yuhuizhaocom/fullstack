"use client";

import { useState } from "react";
import { Backpack, Coins } from "lucide-react";

import { CLASSES, CLASS_SKILLS, ITEMS, PETS, SHOP_ITEMS, SKILLS } from "@/lib/game/data";
import {
  addItem,
  canEquip,
  effectiveStats,
  expToNext,
  MAX_LEVEL,
  MAX_PET_LEVEL,
  petAttack,
  petExpToNext,
  removeItem,
  sellPrice,
} from "@/lib/game/engine";
import type { GameSave, ItemDef, ItemKind } from "@/lib/game/types";
import { cn } from "@/lib/utils";

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
  if (item.maxMp) parts.push(`法力 +${item.maxMp}`);
  if (item.crit) parts.push(`暴击 +${item.crit}%`);
  if (item.cdr) parts.push(`冷却缩减 +${item.cdr}%`);
  if (item.lifesteal) parts.push(`吸血 +${item.lifesteal}%`);
  if (item.hp) parts.push(`回复 ${item.hp} 生命`);
  if (item.mp) parts.push(`回复 ${item.mp} 魔法`);
  return parts.join(" · ");
}

type EquipSlot = "weapon" | "armor" | "boots" | "accessory";

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
    if (!window.confirm("确定重置存档吗？当前角色与进度会全部丢失。")) return;
    window.localStorage.removeItem("tf_rpg_save_v1");
    window.location.reload();
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
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">{cls.desc}</p>
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
            { label: "魔法", value: `${Math.ceil(save.mp)} / ${Math.round(stats.maxMp)}` },
            { label: "攻击", value: Math.round(stats.atk) },
            { label: "防御", value: Math.round(stats.def) },
            { label: "速度", value: Math.round(stats.spd) },
            { label: "暴击", value: `${Math.round(stats.crit)}%` },
            { label: "冷却缩减", value: `${Math.round(stats.cdr)}%` },
            { label: "吸血", value: `${Math.round(stats.lifesteal)}%` },
            { label: "生命上限", value: Math.round(stats.maxHp) },
            { label: "法力上限", value: Math.round(stats.maxMp) },
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
        <p className="mb-2 text-[11px] font-bold text-slate-300">装备</p>
        <div className="space-y-1.5">
          {EQUIP_SLOTS.map((slot) => {
            const id = save.equipment[slot.key];
            const item = id ? ITEMS[id] : null;
            return (
              <div
                key={slot.key}
                className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5"
              >
                <span className="w-9 text-[10px] text-slate-500">{slot.label}</span>
                <span className="text-lg">{item?.icon ?? slot.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold text-slate-200">
                    {item?.name ?? "空"}
                  </p>
                  <p className="truncate text-[10px] text-slate-500">
                    {item ? itemStats(item) : "未装备"}
                  </p>
                </div>
                {item && (
                  <button type="button" className={pixelButton} onClick={() => unequip(slot.key)}>
                    卸下
                  </button>
                )}
              </div>
            );
          })}
        </div>
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
    .filter((row) => row.item && (filter === "all" || row.item.kind === filter));

  function usePotion(item: ItemDef) {
    const stats = effectiveStats(save);
    const hp = Math.min(stats.maxHp, save.hp + (item.hp ?? 0));
    const mp = Math.min(stats.maxMp, save.mp + (item.mp ?? 0));
    if (hp === save.hp && mp === save.mp) {
      notify("生命与魔法已满");
      return;
    }
    onChange({ ...save, hp, mp, inventory: removeItem(save.inventory, item.id) });
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
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5"
                >
                  <span className="text-lg">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-[11px] font-bold text-slate-200">
                      {item.name}
                      <span className="text-[10px] font-normal text-slate-500">×{count}</span>
                      {item.level ? (
                        <span className="text-[10px] font-normal text-slate-500">
                          Lv.{item.level}
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
                      <button type="button" className={pixelButtonPrimary} onClick={() => equip(item)}>
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

export function SkillsPanel({ save }: { save: GameSave }) {
  const skillIds = CLASS_SKILLS[save.classId];

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        技能随等级自动解锁，战斗中消耗魔法释放，冷却时间受冷却缩减影响。
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {skillIds.map((id, index) => {
          const skill = SKILLS[id];
          const unlocked = save.level >= skill.level;
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
                  <p className="text-[12px] font-bold text-slate-100">{skill.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {unlocked ? "已解锁" : `Lv.${skill.level} 解锁`} · {skill.mp} 魔法
                    {skill.cooldown ? ` · CD ${skill.cooldown}s` : ""}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{skill.desc}</p>
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
  });

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
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5"
                >
                  <span className="text-lg">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-slate-200">
                      {item.name}
                      {item.level && item.level > 1 ? (
                        <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                          Lv.{item.level}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {itemStats(item) || item.desc}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={pixelButtonPrimary}
                    disabled={save.gold < item.price}
                    onClick={() => buy(item)}
                  >
                    {item.price} 金币
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
