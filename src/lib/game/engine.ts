import { CLASSES, ITEMS, PETS } from "./data";
import type {
  ClassId,
  EnemyDef,
  GameSave,
  ItemDef,
  PetSave,
  Stats,
} from "./types";

export const MAX_LEVEL = 30;
export const MAX_PET_LEVEL = 20;
export const SAVE_KEY = "tf_rpg_save_v1";

export function expToNext(level: number): number {
  return Math.floor(60 * Math.pow(level, 1.4));
}

export function petExpToNext(level: number): number {
  return Math.floor(40 * Math.pow(level, 1.25));
}

export function createSave(name: string, classId: ClassId): GameSave {
  const cls = CLASSES[classId];
  return {
    version: 1,
    name: name.trim().slice(0, 12) || "冒险者",
    classId,
    level: 1,
    exp: 0,
    gold: 100,
    hp: cls.base.maxHp,
    mp: cls.base.maxMp,
    stats: { ...cls.base },
    equipment: { weapon: cls.weapon, armor: null, boots: null, accessory: null },
    inventory: { potion_small_hp: 3, potion_small_mp: 1 },
    pets: [{ id: "firefox", level: 1, exp: 0 }],
    activePet: "firefox",
    cleared: [],
    wins: 0,
    createdAt: Date.now(),
  };
}

export function loadSave(): GameSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSave;
    if (!parsed || parsed.version !== 1 || !parsed.classId || !parsed.stats) {
      return null;
    }
    if (!CLASSES[parsed.classId]) return null;
    // 兼容旧存档：补齐新增字段
    parsed.stats = {
      ...parsed.stats,
      cdr: Number(parsed.stats.cdr ?? 0),
      lifesteal: Number(parsed.stats.lifesteal ?? 0),
    };
    parsed.equipment = {
      weapon: parsed.equipment?.weapon ?? null,
      armor: parsed.equipment?.armor ?? null,
      boots: parsed.equipment?.boots ?? null,
      accessory: parsed.equipment?.accessory ?? null,
    };
    if (!parsed.inventory) parsed.inventory = {};
    if (!parsed.pets) parsed.pets = [];
    if (!parsed.cleared) parsed.cleared = [];
    return parsed;
  } catch {
    return null;
  }
}

export function persistSave(save: GameSave): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // 存储空间不足或隐私模式，忽略
  }
}

export function clearSave(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SAVE_KEY);
}

/** 基础属性 + 装备加成 */
export function effectiveStats(save: GameSave): Stats {
  const stats = { ...save.stats };
  for (const slot of Object.values(save.equipment)) {
    if (!slot) continue;
    const item = ITEMS[slot];
    if (!item) continue;
    stats.atk += item.atk ?? 0;
    stats.def += item.def ?? 0;
    stats.spd += item.spd ?? 0;
    stats.crit += item.crit ?? 0;
    stats.maxHp += item.maxHp ?? 0;
    stats.maxMp += item.maxMp ?? 0;
    stats.cdr += item.cdr ?? 0;
    stats.lifesteal += item.lifesteal ?? 0;
  }
  stats.cdr = Math.max(0, Math.min(50, stats.cdr));
  stats.lifesteal = Math.max(0, Math.min(60, stats.lifesteal));
  return stats;
}

/** 增加经验并结算升级，返回新存档与升级次数 */
export function gainExp(
  save: GameSave,
  exp: number
): { save: GameSave; levels: number } {
  const next: GameSave = {
    ...save,
    stats: { ...save.stats },
    exp: save.exp + exp,
  };
  const growth = CLASSES[next.classId].growth;
  let levels = 0;

  while (next.level < MAX_LEVEL && next.exp >= expToNext(next.level)) {
    next.exp -= expToNext(next.level);
    next.level += 1;
    levels += 1;
    next.stats.maxHp = Math.round(next.stats.maxHp + growth.maxHp);
    next.stats.maxMp = Math.round(next.stats.maxMp + growth.maxMp);
    next.stats.atk = Math.round((next.stats.atk + growth.atk) * 10) / 10;
    next.stats.def = Math.round((next.stats.def + growth.def) * 10) / 10;
    next.stats.spd = Math.round((next.stats.spd + growth.spd) * 10) / 10;
    next.stats.crit = Math.round((next.stats.crit + growth.crit) * 10) / 10;
    next.stats.cdr = Math.round((next.stats.cdr + growth.cdr) * 10) / 10;
    next.stats.lifesteal = Math.round((next.stats.lifesteal + growth.lifesteal) * 10) / 10;
  }

  if (levels > 0) {
    next.hp = next.stats.maxHp;
    next.mp = next.stats.maxMp;
  }

  return { save: next, levels };
}

/** 只给出战宠物加经验 */
export function gainPetExp(
  pets: PetSave[],
  activePet: string | null,
  exp: number
): PetSave[] {
  return pets.map((pet) => {
    if (pet.id !== activePet) return pet;
    let level = pet.level;
    let current = pet.exp + exp;
    while (level < MAX_PET_LEVEL && current >= petExpToNext(level)) {
      current -= petExpToNext(level);
      level += 1;
    }
    return { ...pet, level, exp: current };
  });
}

export function calcDamage(
  atk: number,
  multiplier: number,
  def: number,
  critChance: number,
  forceCrit = false
): { damage: number; crit: boolean } {
  const crit = forceCrit || Math.random() * 100 < critChance;
  const raw = Math.max(1, atk * multiplier - def * 0.55);
  const variance = 0.9 + Math.random() * 0.2;
  return {
    damage: Math.max(1, Math.round(raw * variance * (crit ? 1.6 : 1))),
    crit,
  };
}

export function sellPrice(item: ItemDef): number {
  return item.kind === "material" ? item.price : Math.floor(item.price * 0.4);
}

export function petAttack(pet: PetSave): number {
  const def = PETS[pet.id];
  if (!def) return 0;
  return def.atk + (pet.level - 1) * 2;
}

export function petCrit(pet: PetSave): number {
  return PETS[pet.id]?.crit ?? 0;
}

export function canEquip(item: ItemDef, save: GameSave): boolean {
  if (item.classId && item.classId !== save.classId) return false;
  if (item.level && item.level > save.level) return false;
  return true;
}

export function addItem(
  inventory: Record<string, number>,
  itemId: string,
  count = 1
): Record<string, number> {
  return { ...inventory, [itemId]: (inventory[itemId] ?? 0) + count };
}

export function removeItem(
  inventory: Record<string, number>,
  itemId: string,
  count = 1
): Record<string, number> {
  const next = { ...inventory };
  const left = (next[itemId] ?? 0) - count;
  if (left > 0) next[itemId] = left;
  else delete next[itemId];
  return next;
}

/** 掉落：武器只掉本职业可用的，避免拿到无法使用的装备 */
export function rollDrops(enemy: EnemyDef, classId: ClassId): string[] {
  const items: string[] = [];
  for (const drop of enemy.drops) {
    if (Math.random() > drop.chance) continue;
    const def = ITEMS[drop.itemId];
    if (def?.kind === "weapon" && def.classId && def.classId !== classId) {
      continue;
    }
    items.push(drop.itemId);
  }
  return items;
}
