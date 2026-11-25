import { CLASSES, ITEMS, PETS, SKILLS, CLASS_SKILL_IDS } from "./data";
import type {
  ClassId,
  EnemyDef,
  EquipSlot,
  GameSave,
  ItemDef,
  PetSave,
  Stats,
} from "./types";

export const MAX_LEVEL = 60;
export const MAX_PET_LEVEL = 20;
export const MAX_ENHANCE = 15;
export const MAX_SKILL_RANK = 15;
/** 每级获得的技能点数 */
export const SKILL_POINTS_PER_LEVEL = 1;
/** 强化每级提升装备属性的比例 */
export const ENHANCE_STAT_RATE = 0.06;

/** 旧版单存档 key（用于迁移） */
export const SAVE_KEY = "tf_rpg_save_v1";
export const SAVES_KEY = "tf_rpg_saves_v2";
export const ACTIVE_KEY = "tf_rpg_active_v2";

export function expToNext(level: number): number {
  return Math.floor(90 * Math.pow(level, 1.65));
}

export function petExpToNext(level: number): number {
  return Math.floor(40 * Math.pow(level, 1.25));
}

function newId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createSave(name: string, classId: ClassId): GameSave {
  const cls = CLASSES[classId];
  return {
    version: 1,
    id: newId(),
    name: name.trim().slice(0, 12) || "冒险者",
    classId,
    level: 1,
    exp: 0,
    gold: 100,
    hp: cls.base.maxHp,
    mp: cls.base.maxMp,
    stats: { ...cls.base },
    equipment: { weapon: cls.weapon, armor: null, boots: null, accessory: null },
    inventory: { potion_small_hp: 3 },
    pets: [{ id: "firefox", level: 1, exp: 0 }],
    activePet: "firefox",
    cleared: [],
    wins: 0,
    createdAt: Date.now(),
    enhancements: { weapon: 0, armor: 0, boots: 0, accessory: 0 },
    skillRanks: {},
  };
}

/** 兼容旧存档：补齐新增字段 */
function normalizeSave(parsed: GameSave): GameSave | null {
  if (!parsed || parsed.version !== 1 || !parsed.classId || !parsed.stats) {
    return null;
  }
  if (!CLASSES[parsed.classId]) return null;
  parsed.id = parsed.id || newId();
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
  parsed.enhancements = {
    weapon: 0,
    armor: 0,
    boots: 0,
    accessory: 0,
    ...(parsed.enhancements ?? {}),
  };
  if (!parsed.skillRanks) parsed.skillRanks = {};
  return parsed;
}

/** 读取全部角色存档（含旧版单存档迁移） */
export function loadSaves(): GameSave[] {
  if (typeof window === "undefined") return [];
  const list: GameSave[] = [];
  try {
    const raw = window.localStorage.getItem(SAVES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const save = normalizeSave(entry as GameSave);
          if (save) list.push(save);
        }
      }
    }
  } catch {
    // 忽略损坏的存档
  }
  if (list.length === 0) {
    try {
      const legacy = window.localStorage.getItem(SAVE_KEY);
      if (legacy) {
        const save = normalizeSave(JSON.parse(legacy) as GameSave);
        if (save) {
          list.push(save);
          persistSaves(list);
          window.localStorage.setItem(ACTIVE_KEY, save.id!);
          window.localStorage.removeItem(SAVE_KEY);
        }
      }
    } catch {
      // 忽略迁移失败
    }
  }
  return list;
}

function persistSaves(list: GameSave[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVES_KEY, JSON.stringify(list));
  } catch {
    // 存储空间不足或隐私模式，忽略
  }
}

function readActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/** 读取当前选中角色 */
export function loadSave(): GameSave | null {
  const list = loadSaves();
  if (list.length === 0) return null;
  const activeId = readActiveId();
  return list.find((item) => item.id === activeId) ?? list[0];
}

/** 写入（或新增）一个角色存档，并设为当前角色 */
export function persistSave(save: GameSave): void {
  if (typeof window === "undefined") return;
  const list = loadSaves();
  const id = save.id || newId();
  const next = { ...save, id };
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) list[index] = next;
  else list.push(next);
  persistSaves(list);
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // 忽略
  }
}

/** 切换当前角色 */
export function setActiveSave(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // 忽略
  }
}

/** 删除角色存档 */
export function deleteSave(id: string): void {
  if (typeof window === "undefined") return;
  const list = loadSaves().filter((item) => item.id !== id);
  persistSaves(list);
  if (readActiveId() === id) {
    try {
      if (list[0]?.id) window.localStorage.setItem(ACTIVE_KEY, list[0].id);
      else window.localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // 忽略
    }
  }
}

/** 清空当前角色（用于重新开始） */
export function clearSave(): void {
  if (typeof window === "undefined") return;
  const current = loadSave();
  if (current?.id) deleteSave(current.id);
  else window.localStorage.removeItem(SAVE_KEY);
}

/** 基础属性 + 装备加成（含锻造强化） */
export function effectiveStats(save: GameSave): Stats {
  const stats = { ...save.stats };
  for (const [slotKey, itemId] of Object.entries(save.equipment)) {
    if (!itemId) continue;
    const item = ITEMS[itemId];
    if (!item) continue;
    const enhance = save.enhancements?.[slotKey as EquipSlot] ?? 0;
    const scale = 1 + enhance * ENHANCE_STAT_RATE;
    stats.atk += Math.round((item.atk ?? 0) * scale * 10) / 10;
    stats.def += Math.round((item.def ?? 0) * scale * 10) / 10;
    stats.spd += item.spd ?? 0;
    stats.crit += item.crit ?? 0;
    stats.maxHp += Math.round((item.maxHp ?? 0) * scale);
    stats.maxMp += Math.round((item.maxMp ?? 0) * scale);
    stats.cdr += item.cdr ?? 0;
    stats.lifesteal += item.lifesteal ?? 0;
  }
  // 职业被动：攻击/防御为百分比乘算，暴击/冷却/吸血为固定点数
  const passive = CLASSES[save.classId]?.passive;
  if (passive) {
    if (passive.atk) {
      stats.atk = Math.round(stats.atk * (1 + passive.atk / 100) * 10) / 10;
    }
    if (passive.def) {
      stats.def = Math.round(stats.def * (1 + passive.def / 100) * 10) / 10;
    }
    stats.crit += passive.crit ?? 0;
    stats.cdr += passive.cdr ?? 0;
    stats.lifesteal += passive.lifesteal ?? 0;
  }
  stats.cdr = Math.max(0, Math.min(50, stats.cdr));
  stats.lifesteal = Math.max(0, Math.min(60, stats.lifesteal));
  return stats;
}

/** 当前部位允许的强化上限（随角色等级解锁） */
export function enhanceCap(save: GameSave): number {
  return Math.max(0, Math.min(MAX_ENHANCE, Math.ceil(save.level / 4)));
}

/** 强化消耗：金币 + 强化石数量 */
export function enhanceCost(slot: EquipSlot, save: GameSave): { gold: number; stone: number } {
  const current = save.enhancements?.[slot] ?? 0;
  const item = save.equipment[slot] ? ITEMS[save.equipment[slot]!] : null;
  const tier = item?.level ?? 1;
  return {
    gold: Math.round((current + 1) * (current + 1) * 260 + tier * 120),
    stone: 1 + Math.floor(current / 3),
  };
}

/** 技能加点：已分配点数 */
export function spentSkillPoints(save: GameSave): number {
  return Object.entries(save.skillRanks ?? {}).reduce((sum, [id, rank]) => {
    if (!SKILLS[id]) return sum;
    return sum + Math.max(0, Math.min(MAX_SKILL_RANK, rank) - 1);
  }, 0);
}

/** 可用技能点（每级 1 点，1 级技能自带 1 级） */
export function availableSkillPoints(save: GameSave): number {
  const total = (save.level - 1) * SKILL_POINTS_PER_LEVEL;
  return Math.max(0, total - spentSkillPoints(save));
}

/** 某技能当前等级（0 表示未学习/未解锁） */
export function skillRank(save: GameSave, skillId: string): number {
  const def = SKILLS[skillId];
  if (!def) return 0;
  const base = save.level >= def.level ? 1 : 0;
  if (base === 0) return 0;
  const invested = save.skillRanks?.[skillId] ?? 0;
  return Math.max(1, Math.min(MAX_SKILL_RANK, invested));
}

/** 角色的全部技能 ID */
export function classSkills(classId: ClassId): string[] {
  return CLASS_SKILL_IDS[classId];
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
