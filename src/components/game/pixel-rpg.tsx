"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, Gamepad2, RotateCcw, Swords, Trophy } from "lucide-react";
import { toast } from "sonner";

import {
  CLASSES,
  CLASS_SKILLS,
  DUNGEONS,
  DUNGEON_LIST,
  ENEMIES,
  ITEMS,
  PETS,
  SKILLS,
  TILE_INFO,
} from "@/lib/game/data";
import {
  addItem,
  calcDamage,
  createSave,
  effectiveStats,
  gainExp,
  gainPetExp,
  loadSave,
  persistSave,
  petAttack,
  petCrit,
  removeItem,
  rollDrops,
} from "@/lib/game/engine";
import type {
  BattleState,
  ClassId,
  DungeonRun,
  GameSave,
  Tab,
} from "@/lib/game/types";
import { cn } from "@/lib/utils";

import {
  BagPanel,
  CharacterPanel,
  PetPanel,
  pixelButton,
  pixelButtonPrimary,
  ShopPanel,
  SkillsPanel,
} from "./panels";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "adventure", label: "冒险", icon: "🗺️" },
  { key: "character", label: "角色", icon: "🧙" },
  { key: "bag", label: "背包", icon: "🎒" },
  { key: "skills", label: "技能", icon: "✨" },
  { key: "pet", label: "宠物", icon: "🐾" },
  { key: "shop", label: "商店", icon: "🏪" },
];

const TILE_BG: Record<string, string> = {
  ".": "bg-emerald-950/60",
  S: "bg-slate-700/70",
  T: "bg-emerald-950",
  "#": "bg-slate-800",
  "~": "bg-sky-900/70",
  C: "bg-amber-900/50",
  M: "bg-red-950/70",
  B: "bg-purple-950/70",
};

type PlayerAction =
  | { type: "attack" }
  | { type: "skill"; skillId: string }
  | { type: "item"; itemId: string }
  | { type: "flee" };

export function PixelRpg() {
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState<GameSave | null>(null);
  const [tab, setTab] = useState<Tab>("adventure");
  const [dungeon, setDungeon] = useState<DungeonRun | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [skillMenu, setSkillMenu] = useState(false);
  const [itemMenu, setItemMenu] = useState(false);

  const [pick, setPick] = useState<ClassId>("warrior");
  const [name, setName] = useState("");
  const actingRef = useRef(false);

  useEffect(() => {
    setSave(loadSave());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded && save) persistSave(save);
  }, [save, loaded]);

  const notify = (message: string) => toast.success(message);

  function startDungeon(id: string) {
    if (!save) return;
    const def = DUNGEONS[id];
    if (save.level < def.unlockLevel) {
      toast.error(`需要 Lv.${def.unlockLevel} 才能进入`);
      return;
    }
    let start = { x: 0, y: 0 };
    def.map.forEach((row, y) => {
      const x = row.indexOf("S");
      if (x >= 0) start = { x, y };
    });
    setDungeon({ id, x: start.x, y: start.y, tiles: [...def.map] });
    setTab("adventure");
  }

  function randomEnemy(dungeonId: string): string {
    const def = DUNGEONS[dungeonId];
    return def.enemies[Math.floor(Math.random() * def.enemies.length)];
  }

  function startBattle(dungeonId: string, enemyId: string, kind: "normal" | "boss") {
    const enemy = ENEMIES[enemyId];
    setBattle({
      dungeonId,
      enemy,
      enemyHp: enemy.hp,
      enemyMaxHp: enemy.hp,
      kind,
      turn: 1,
      log: [`⚔️ 遭遇了 ${enemy.name}！`],
      buff: null,
      guard: null,
      finished: false,
      victory: false,
      rewards: { exp: 0, gold: 0, items: [] },
    });
    setSkillMenu(false);
    setItemMenu(false);
  }

  function grantChest() {
    if (!save) return;
    const roll = Math.random();
    let next = { ...save };
    let message = "";
    if (roll < 0.5) {
      const gold = 30 + Math.floor(Math.random() * 41);
      next = { ...next, gold: next.gold + gold };
      message = `打开宝箱，获得 ${gold} 金币`;
    } else if (roll < 0.82) {
      const pool = ["potion_small_hp", "potion_small_mp", "potion_mid_hp"];
      const id = pool[Math.floor(Math.random() * pool.length)];
      next = { ...next, inventory: addItem(next.inventory, id) };
      message = `打开宝箱，获得 ${ITEMS[id].name}`;
    } else {
      const pool = ["slime_gel", "wolf_pelt", "bat_wing", "magic_core"];
      const id = pool[Math.floor(Math.random() * pool.length)];
      next = { ...next, inventory: addItem(next.inventory, id) };
      message = `打开宝箱，获得 ${ITEMS[id].name}`;
    }
    setSave(next);
    toast.success(message);
  }

  function moveTo(x: number, y: number) {
    if (!save || !dungeon || battle) return;
    const def = DUNGEONS[dungeon.id];
    if (y < 0 || y >= def.map.length) return;
    if (x < 0 || x >= def.map[y].length) return;

    const tile = dungeon.tiles[y][x];
    const info = TILE_INFO[tile];
    if (!info?.walkable) return;

    const same = x === dungeon.x && y === dungeon.y;
    if (!same && Math.abs(x - dungeon.x) + Math.abs(y - dungeon.y) !== 1) return;
    if (same && tile !== "M" && tile !== "B") return;

    let tiles = dungeon.tiles;
    if (tile === "C") {
      tiles = tiles.map((row, rowIndex) =>
        rowIndex === y ? `${row.slice(0, x)}.${row.slice(x + 1)}` : row
      );
    }
    setDungeon({ id: dungeon.id, x, y, tiles });

    if (tile === "C") {
      grantChest();
    } else if (tile === "M") {
      startBattle(dungeon.id, randomEnemy(dungeon.id), "normal");
    } else if (tile === "B") {
      startBattle(dungeon.id, DUNGEONS[dungeon.id].boss, "boss");
    }
  }

  // 方向键 / WASD 移动
  useEffect(() => {
    if (!dungeon || battle) return;
    const keys: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      w: [0, -1],
      s: [0, 1],
      a: [-1, 0],
      d: [1, 0],
    };
    const onKey = (event: KeyboardEvent) => {
      const delta = keys[event.key];
      if (!delta) return;
      event.preventDefault();
      moveTo(dungeon.x + delta[0], dungeon.y + delta[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dungeon, battle, save]);

  function performAction(action: PlayerAction) {
    if (actingRef.current || !save || !battle || battle.finished) return;
    actingRef.current = true;
    try {
      const stats = effectiveStats(save);
      const buffMult = battle.buff ? 1 + battle.buff.atk / 100 : 1;
      const atk = stats.atk * buffMult;

      let hp = save.hp;
      let mp = save.mp;
      let inventory = { ...save.inventory };
      let enemyHp = battle.enemyHp;
      let buff = battle.buff;
      let guard = battle.guard;
      let turn = battle.turn;
      const lines: string[] = [];
      let fled = false;

      if (action.type === "attack") {
        const hit = calcDamage(atk, 1, battle.enemy.def, stats.crit);
        enemyHp = Math.max(0, enemyHp - hit.damage);
        lines.push(
          `你发动普通攻击，造成 ${hit.damage} 点伤害${hit.crit ? "（暴击）" : ""}`
        );
      } else if (action.type === "skill") {
        const skill = SKILLS[action.skillId];
        if (!skill) return;
        if (save.level < skill.level) {
          toast.error("技能尚未解锁");
          return;
        }
        if (mp < skill.mp) {
          toast.error("魔法不足");
          return;
        }
        mp -= skill.mp;

        if (skill.kind === "damage") {
          const hits = skill.hits ?? 1;
          let total = 0;
          let anyCrit = false;
          for (let i = 0; i < hits && enemyHp > 0; i += 1) {
            const hit = calcDamage(
              atk,
              skill.multiplier ?? 1,
              battle.enemy.def,
              stats.crit,
              skill.alwaysCrit
            );
            enemyHp = Math.max(0, enemyHp - hit.damage);
            total += hit.damage;
            anyCrit = anyCrit || hit.crit;
          }
          lines.push(
            `你施放 ${skill.name}，造成 ${total} 点伤害${anyCrit ? "（暴击）" : ""}`
          );
        } else if (skill.kind === "heal") {
          const before = hp;
          hp = Math.min(stats.maxHp, hp + stats.maxHp * (skill.healRatio ?? 0.3));
          lines.push(`你施放 ${skill.name}，回复 ${Math.round(hp - before)} 点生命`);
        } else if (skill.kind === "buff") {
          buff = { atk: skill.buffAtk ?? 30, turns: skill.buffTurns ?? 3 };
          lines.push(
            `你施放 ${skill.name}，攻击力提升 ${buff.atk}%（${buff.turns} 回合）`
          );
        } else if (skill.kind === "guard") {
          guard = { reduction: skill.reduction ?? 40, turns: skill.buffTurns ?? 3 };
          lines.push(
            `你施放 ${skill.name}，受到伤害降低 ${guard.reduction}%（${guard.turns} 回合）`
          );
        }
      } else if (action.type === "item") {
        const item = ITEMS[action.itemId];
        if (!item || item.kind !== "consumable" || (inventory[item.id] ?? 0) <= 0) {
          return;
        }
        const beforeHp = hp;
        const beforeMp = mp;
        hp = Math.min(stats.maxHp, hp + (item.hp ?? 0));
        mp = Math.min(stats.maxMp, mp + (item.mp ?? 0));
        inventory = removeItem(inventory, item.id);
        lines.push(
          `你使用了 ${item.name}，回复 ${Math.round(hp - beforeHp)} 生命 / ${Math.round(mp - beforeMp)} 魔法`
        );
      } else if (action.type === "flee") {
        const chance = 0.5 + Math.min(0.25, stats.spd * 0.01);
        if (Math.random() < chance) {
          lines.push("你成功逃离了战斗");
          fled = true;
        } else {
          lines.push("逃跑失败！");
        }
      }

      turn += 1;

      // 敌人反击
      if (!fled && enemyHp > 0) {
        const skill = battle.enemy.skills.find(
          (entry) => Math.random() < entry.chance
        );
        const hit = calcDamage(
          battle.enemy.atk,
          skill?.multiplier ?? 1,
          stats.def,
          0
        );
        let damage = hit.damage;
        if (guard) {
          damage = Math.max(1, Math.round(damage * (1 - guard.reduction / 100)));
        }
        hp = Math.max(0, hp - damage);
        lines.push(
          `${battle.enemy.name}${skill ? `使用 ${skill.name}` : "发动攻击"}，造成 ${damage} 点伤害${guard ? "（已减伤）" : ""}`
        );
      }

      // 宠物协助与被动
      const pet = save.activePet
        ? save.pets.find((entry) => entry.id === save.activePet)
        : null;
      if (pet) {
        const petDef = PETS[pet.id];
        if (!fled && enemyHp > 0 && turn % 2 === 0) {
          const hit = calcDamage(petAttack(pet), 1.2, battle.enemy.def, petCrit(pet));
          enemyHp = Math.max(0, enemyHp - hit.damage);
          lines.push(
            `${petDef.name} 协助攻击，造成 ${hit.damage} 点伤害${hit.crit ? "（暴击）" : ""}`
          );
        }
        if (petDef.healRatio && hp > 0) {
          const heal = Math.round(stats.maxHp * petDef.healRatio);
          hp = Math.min(stats.maxHp, hp + heal);
          lines.push(`${petDef.name} 回复了你 ${heal} 点生命`);
        }
      }

      // 回合结束，状态回合数递减
      if (buff) {
        const turns = buff.turns - 1;
        buff = turns > 0 ? { ...buff, turns } : null;
      }
      if (guard) {
        const turns = guard.turns - 1;
        guard = turns > 0 ? { ...guard, turns } : null;
      }

      const nextLog = [...battle.log, ...lines].slice(-14);

      if (fled) {
        setSave({ ...save, hp, mp, inventory });
        setBattle(null);
        setSkillMenu(false);
        setItemMenu(false);
        return;
      }

      if (enemyHp <= 0) {
        const expGain = battle.enemy.exp;
        const goldGain = battle.enemy.gold;
        const drops = rollDrops(battle.enemy, save.classId);
        let inventoryNext = inventory;
        for (const itemId of drops) {
          inventoryNext = addItem(inventoryNext, itemId);
        }

        let nextSave: GameSave = {
          ...save,
          hp,
          mp,
          inventory: inventoryNext,
          gold: save.gold + goldGain,
          wins: save.wins + 1,
        };
        nextSave.pets = gainPetExp(
          nextSave.pets,
          nextSave.activePet,
          Math.floor(expGain * 0.6)
        );

        const { save: leveled, levels } = gainExp(nextSave, expGain);
        nextSave = leveled;
        if (levels > 0) {
          nextLog.push(`⬆️ 升级到 Lv.${nextSave.level}，生命与魔法已回满`);
        }
        if (battle.kind === "boss" && !nextSave.cleared.includes(battle.dungeonId)) {
          nextSave = {
            ...nextSave,
            cleared: [...nextSave.cleared, battle.dungeonId],
          };
          nextLog.push(`🏆 首次通关 ${DUNGEONS[battle.dungeonId].name}！`);
        }

        setSave(nextSave);
        setBattle({
          ...battle,
          enemyHp: 0,
          turn,
          log: nextLog,
          finished: true,
          victory: true,
          buff: null,
          guard: null,
          rewards: { exp: expGain, gold: goldGain, items: drops },
        });
        return;
      }

      if (hp <= 0) {
        const lost = Math.floor(save.gold * 0.1);
        const nextSave: GameSave = {
          ...save,
          hp: Math.max(1, Math.round(stats.maxHp * 0.5)),
          mp,
          inventory,
          gold: save.gold - lost,
        };
        lines.push(`💀 你被击败了，损失 ${lost} 金币`);
        setSave(nextSave);
        setBattle({
          ...battle,
          enemyHp,
          turn,
          log: [...nextLog, `💀 你被击败了，损失 ${lost} 金币`].slice(-14),
          finished: true,
          victory: false,
          buff: null,
          guard: null,
        });
        return;
      }

      setSave({ ...save, hp, mp, inventory });
      setBattle({
        ...battle,
        enemyHp,
        turn,
        log: nextLog,
        buff,
        guard,
      });
    } finally {
      actingRef.current = false;
    }
  }

  function closeBattle() {
    if (!battle) return;
    const failed = battle.finished && !battle.victory;
    const bossCleared = battle.kind === "boss" && battle.finished && battle.victory;
    setBattle(null);
    setSkillMenu(false);
    setItemMenu(false);
    if (failed || bossCleared) {
      setDungeon(null);
      setTab("adventure");
    }
  }

  if (!loaded) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-950 text-xs text-slate-400">
        加载存档中…
      </div>
    );
  }

  if (!save) {
    const cls = CLASSES[pick];
    return (
      <div className="space-y-4 rounded-xl border-2 border-slate-700 bg-slate-950 p-4 text-slate-100 shadow-[6px_6px_0_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-2">
          <Gamepad2 className="size-5 text-amber-400" />
          <div>
            <h2 className="text-sm font-bold tracking-wide">创建你的冒险者</h2>
            <p className="text-[10px] text-slate-500">
              无需登录 · 存档自动保存在本机浏览器
            </p>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">角色名</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 12))}
            placeholder="冒险者"
            className="w-full rounded border-2 border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-500"
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(CLASSES) as ClassId[]).map((id) => {
            const item = CLASSES[id];
            const active = pick === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPick(id)}
                className={cn(
                  "rounded-lg border-2 p-3 text-left transition-colors",
                  active
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                )}
              >
                <p className="flex items-center gap-2 text-sm font-bold">
                  <span className="text-2xl">{item.icon}</span>
                  {item.name}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{item.desc}</p>
                <p className="mt-2 text-[10px] text-slate-500">
                  生命 {item.base.maxHp} · 魔法 {item.base.maxMp} · 攻击 {item.base.atk} ·
                  防御 {item.base.def} · 暴击 {item.base.crit}%
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-slate-500">
            初始职业：{cls.name}，自带一只火狐宠物与少量药水
          </p>
          <button
            type="button"
            className={pixelButtonPrimary}
            onClick={() => {
              const next = createSave(name, pick);
              setSave(next);
              setTab("adventure");
              toast.success("冒险开始！");
            }}
          >
            开始冒险
          </button>
        </div>
      </div>
    );
  }

  const stats = effectiveStats(save);
  const hpPercent = Math.max(0, Math.min(100, (save.hp / stats.maxHp) * 100));
  const mpPercent = Math.max(0, Math.min(100, (save.mp / stats.maxMp) * 100));

  return (
    <div className="space-y-3 rounded-xl border-2 border-slate-700 bg-slate-950 p-3 text-slate-100 shadow-[6px_6px_0_rgba(0,0,0,0.3)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{CLASSES[save.classId].icon}</span>
          <div>
            <p className="text-xs font-bold">
              {save.name}
              <span className="ml-1.5 text-amber-300">Lv.{save.level}</span>
            </p>
            <p className="text-[10px] text-slate-500">
              {CLASSES[save.classId].name} · 胜场 {save.wins}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-300">
            <Coins className="size-3.5" />
            {save.gold}
          </span>
          <button
            type="button"
            className={pixelButton}
            title="重置存档"
            onClick={() => {
              if (!window.confirm("确定重置存档吗？当前角色与进度会全部丢失。")) return;
              window.localStorage.removeItem("tf_rpg_save_v1");
              window.location.reload();
            }}
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>HP</span>
            <span>
              {Math.ceil(save.hp)} / {Math.round(stats.maxHp)}
            </span>
          </div>
          <div className="mt-0.5 h-2 overflow-hidden rounded bg-slate-800">
            <div
              className="h-full rounded bg-gradient-to-r from-red-500 to-rose-400"
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>MP</span>
            <span>
              {Math.ceil(save.mp)} / {Math.round(stats.maxMp)}
            </span>
          </div>
          <div className="mt-0.5 h-2 overflow-hidden rounded bg-slate-800">
            <div
              className="h-full rounded bg-gradient-to-r from-sky-500 to-cyan-400"
              style={{ width: `${mpPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={cn(
              "shrink-0 rounded border-2 px-2 py-1 text-[11px] font-bold transition-colors",
              tab === entry.key
                ? "border-amber-500 bg-amber-500/15 text-amber-300"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
            )}
          >
            <span className="mr-1">{entry.icon}</span>
            {entry.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "adventure" &&
          (dungeon ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-slate-300">
                  {DUNGEONS[dungeon.id].icon} {DUNGEONS[dungeon.id].name}
                  <span className="ml-1.5 font-normal text-slate-500">
                    Lv.{DUNGEONS[dungeon.id].level}
                  </span>
                </p>
                <button
                  type="button"
                  className={pixelButton}
                  onClick={() => setDungeon(null)}
                >
                  退出副本
                </button>
              </div>

              <div
                className="mx-auto grid w-full max-w-md gap-0.5"
                style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))" }}
              >
                {dungeon.tiles.map((row, y) =>
                  row.split("").map((tile, x) => {
                    const isPlayer = dungeon.x === x && dungeon.y === y;
                    const info = TILE_INFO[tile];
                    const same = isPlayer;
                    const adjacent =
                      Math.abs(x - dungeon.x) + Math.abs(y - dungeon.y) === 1;
                    const reachable =
                      !battle &&
                      !!info?.walkable &&
                      (adjacent || (same && (tile === "M" || tile === "B")));
                    return (
                      <button
                        key={`${x}-${y}`}
                        type="button"
                        disabled={!reachable}
                        onClick={() => moveTo(x, y)}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-sm border text-sm transition-colors sm:text-base",
                          TILE_BG[tile] ?? "bg-slate-900",
                          reachable
                            ? "border-slate-600 hover:border-amber-400"
                            : "border-slate-900/70",
                          isPlayer && "ring-2 ring-amber-400"
                        )}
                        aria-label={`${x},${y} ${info?.label ?? ""}`}
                      >
                        {isPlayer ? CLASSES[save.classId].icon : info?.icon}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                <span>🚩 起点</span>
                <span>🎁 宝箱</span>
                <span>👹 怪物</span>
                <span>👑 BOSS</span>
                <span>🌲🪨 障碍</span>
              </div>
              <p className="text-center text-[10px] text-slate-500">
                点击相邻格子或使用方向键 / WASD 移动；踩到怪物触发战斗，再次点击脚下怪物格可再战
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {DUNGEON_LIST.map((def) => {
                const locked = save.level < def.unlockLevel;
                const cleared = save.cleared.includes(def.id);
                return (
                  <div
                    key={def.id}
                    className={cn(
                      "rounded-lg border-2 p-3",
                      locked
                        ? "border-slate-800 bg-slate-950/60 opacity-60"
                        : "border-slate-700 bg-slate-900/70"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-bold">
                        <span className="text-2xl">{def.icon}</span>
                        {def.name}
                        {cleared && <Trophy className="size-3.5 text-amber-400" />}
                      </p>
                      <span className="shrink-0 text-[10px] text-slate-500">
                        Lv.{def.level}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                      {def.desc}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-500">
                        {locked ? `需要 Lv.${def.unlockLevel}` : `BOSS：${ENEMIES[def.boss].icon} ${ENEMIES[def.boss].name}`}
                      </span>
                      <button
                        type="button"
                        className={pixelButtonPrimary}
                        disabled={locked}
                        onClick={() => startDungeon(def.id)}
                      >
                        <Swords className="mr-1 inline size-3" />
                        进入
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        {tab === "character" && (
          <CharacterPanel save={save} onChange={setSave} notify={notify} />
        )}
        {tab === "bag" && (
          <BagPanel save={save} onChange={setSave} notify={notify} />
        )}
        {tab === "skills" && <SkillsPanel save={save} />}
        {tab === "pet" && (
          <PetPanel save={save} onChange={setSave} notify={notify} />
        )}
        {tab === "shop" && (
          <ShopPanel save={save} onChange={setSave} notify={notify} />
        )}
      </div>

      {battle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3">
          <div className="w-full max-w-lg rounded-xl border-2 border-slate-600 bg-slate-950 p-3 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-slate-400">
                {DUNGEONS[battle.dungeonId].name}
                {battle.kind === "boss" && (
                  <span className="ml-1.5 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300">
                    BOSS
                  </span>
                )}
              </p>
              <span className="text-[10px] text-slate-500">回合 {battle.turn}</span>
            </div>

            <div className="mt-2 flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/80 p-2.5">
              <span className="text-4xl">{battle.enemy.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">{battle.enemy.name}</p>
                <div className="mt-1 h-2 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full rounded bg-red-500 transition-all"
                    style={{
                      width: `${Math.max(0, (battle.enemyHp / battle.enemyMaxHp) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  {battle.enemyHp} / {battle.enemyMaxHp}
                </p>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
              <span>
                你的 HP：{Math.ceil(save.hp)} / {Math.round(stats.maxHp)}
              </span>
              <span>
                你的 MP：{Math.ceil(save.mp)} / {Math.round(stats.maxMp)}
              </span>
            </div>

            <div className="mt-2 h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-[11px] leading-relaxed text-slate-300">
              {battle.log.map((line, index) => (
                <p key={`${index}-${line.slice(0, 6)}`}>{line}</p>
              ))}
            </div>

            {battle.finished ? (
              <div className="mt-3 space-y-2">
                {battle.victory ? (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-300">
                    <p className="font-bold">战斗胜利！</p>
                    <p className="mt-1 text-emerald-200/80">
                      经验 +{battle.rewards.exp} · 金币 +{battle.rewards.gold}
                    </p>
                    {battle.rewards.items.length > 0 && (
                      <p className="mt-1 text-amber-200/90">
                        获得：
                        {battle.rewards.items
                          .map((id) => `${ITEMS[id]?.icon ?? "🎁"} ${ITEMS[id]?.name ?? id}`)
                          .join("、")}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-[11px] text-red-300">
                    <p className="font-bold">你被击败了</p>
                    <p className="mt-1 text-red-200/80">
                      已损失部分金币，生命恢复到 50%，下次再来挑战。
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className={pixelButtonPrimary}
                  onClick={closeBattle}
                >
                  继续
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    className={pixelButton}
                    onClick={() => performAction({ type: "attack" })}
                  >
                    ⚔️ 攻击
                  </button>
                  <button
                    type="button"
                    className={pixelButton}
                    onClick={() => {
                      setSkillMenu((prev) => !prev);
                      setItemMenu(false);
                    }}
                  >
                    ✨ 技能
                  </button>
                  <button
                    type="button"
                    className={pixelButton}
                    onClick={() => {
                      setItemMenu((prev) => !prev);
                      setSkillMenu(false);
                    }}
                  >
                    🎒 道具
                  </button>
                  <button
                    type="button"
                    className={pixelButton}
                    onClick={() => performAction({ type: "flee" })}
                  >
                    🏃 逃跑
                  </button>
                </div>

                {skillMenu && (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {CLASS_SKILLS[save.classId].map((id) => {
                      const skill = SKILLS[id];
                      const unlocked = save.level >= skill.level;
                      const enough = save.mp >= skill.mp;
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={!unlocked || !enough}
                          onClick={() => {
                            setSkillMenu(false);
                            performAction({ type: "skill", skillId: id });
                          }}
                          className={cn(pixelButton, "text-left")}
                        >
                          {skill.icon} {skill.name}
                          <span className="ml-1 text-[10px] font-normal text-slate-400">
                            {skill.mp} MP
                            {!unlocked
                              ? ` · Lv.${skill.level} 解锁`
                              : !enough
                                ? " · 魔法不足"
                                : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {itemMenu && (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {Object.entries(save.inventory)
                      .filter(([id, count]) => count > 0 && ITEMS[id]?.kind === "consumable")
                      .map(([id, count]) => {
                        const item = ITEMS[id];
                        return (
                          <button
                            key={id}
                            type="button"
                            className={cn(pixelButton, "text-left")}
                            onClick={() => {
                              setItemMenu(false);
                              performAction({ type: "item", itemId: id });
                            }}
                          >
                            {item.icon} {item.name}
                            <span className="ml-1 text-[10px] font-normal text-slate-400">
                              ×{count}
                            </span>
                          </button>
                        );
                      })}
                    {Object.entries(save.inventory).filter(
                      ([id, count]) => count > 0 && ITEMS[id]?.kind === "consumable"
                    ).length === 0 && (
                      <p className="text-[11px] text-slate-500">没有可用的药水</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
