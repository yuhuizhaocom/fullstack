"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import {
  Coins,
  LogOut,
  Maximize2,
  Minimize2,
  Music2,
  Settings2,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  BagPanel,
  CharacterPanel,
  ShopPanel,
  SkillsPanel,
} from "@/components/game/panels";
import { CLASSES, CLASS_SKILLS, ITEMS, SKILLS } from "@/lib/game/data";
import {
  addItem,
  availableSkillPoints,
  createSave,
  deleteSave,
  effectiveStats,
  enhanceCap,
  expToNext,
  gainExp,
  loadSave,
  loadSaves,
  MAX_LEVEL,
  persistSave,
  removeItem,
  setActiveSave,
} from "@/lib/game/engine";
import type { ClassId, GameSave, QuestSaveEntry } from "@/lib/game/types";
import { initAudio, playSfx, startBgm, stopBgm } from "@/lib/world/audio";
import {
  applyDelta,
  createClientView,
  viewToSnapshot,
  type ClientView,
} from "@/lib/world/delta";
import {
  decodeMessage,
  encodeMessage,
  type AckMessage,
  type HelloMessage,
  type ServerMessage,
} from "@/lib/world/protocol";
import { QUESTS, questGoal, questStatusLabel, type QuestView } from "@/lib/world/quests";
import {
  drawWorld,
  FROST_SKILLS,
  GOLD_SKILLS,
  HEAL_SKILLS,
  type RenderParticle,
  type RenderSnapshot,
  type SkillEffect,
} from "@/lib/world/render";
import type { WorldStage } from "@/lib/world/pixi-stage";
import type { NpcView, PortalView, WorldSnapshot } from "@/lib/world/state";
import {
  isBlockedAt,
  roomConfig,
  ROOMS,
  TILE,
  type RoomId,
} from "@/lib/world/terrain";
import { cn } from "@/lib/utils";

const CLIENT_KEY = "tf_world_client";
const DAILY_KEY = "tf_world_daily";
const DAILY_GOAL = 10;
const DAILY_REWARD = 200;
const SPEED = 210;
const VIEW_HEIGHT = 420;
const MOVE_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
]);
/** 键盘 1-4，同时支持 Q/E/R 快捷键（W 留给移动） */
const SKILL_KEY_MAP: Record<string, number> = {
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
  q: 0,
  e: 2,
  r: 3,
};
const SKILL_KEYS = ["Q", "W", "E", "R"];
/** 火焰系技能：施法音效走低沉的爆裂声 */
const FIRE_SKILLS = new Set(["disintegrate", "incinerate", "tibbers"]);
/** 暗影系技能：刺客一系的紫红刀光 */
const SHADOW_SKILLS = new Set(["shadow_assault", "venom_blade", "smoke_screen", "soul_reap"]);
/** 技能键帽颜色 = 元素色，扫一眼就知道这套技能是什么流派 */
function skillTone(skillId: string): string {
  if (FROST_SKILLS.has(skillId)) return "#7dd3fc";
  if (FIRE_SKILLS.has(skillId)) return "#fb923c";
  if (HEAL_SKILLS.has(skillId)) return "#86efac";
  if (SHADOW_SKILLS.has(skillId)) return "#fb7185";
  if (GOLD_SKILLS.has(skillId)) return "#fde68a";
  return "#cbd5e1";
}
/** 职业主题色，与场景里的脚下光环保持一致 */
const CLASS_ACCENT: Record<ClassId, string> = {
  warrior: "#fbbf24",
  mage: "#a78bfa",
  ranger: "#4ade80",
  priest: "#f5d0fe",
  assassin: "#f87171",
  guardian: "#60a5fa",
};
/** 职业定位，创建角色时帮助玩家判断前后排 */
const CLASS_ROLE: Record<ClassId, string> = {
  warrior: "近战 · 坦克",
  mage: "远程 · 法术",
  ranger: "远程 · 物理",
  priest: "辅助 · 治疗",
  assassin: "近战 · 爆发",
  guardian: "近战 · 守护",
};
const UI_KEY = "tf_world_ui_v1";
const MAX_CHARACTERS = 4;

type UiSettings = {
  joystickSide: "left" | "right";
  scale: "compact" | "normal" | "large";
  zoom: number;
  autoCastAll: boolean;
  autoSkills: Record<string, boolean>;
};

const DEFAULT_UI: UiSettings = {
  joystickSide: "right",
  scale: "normal",
  // 角色按新比例缩小后镜头略微拉远，一屏能看到更多场景
  zoom: 0.68,
  autoCastAll: false,
  autoSkills: {},
};

function loadUi(): UiSettings {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UiSettings>;
      return {
        ...DEFAULT_UI,
        ...parsed,
        // 旧默认 0.75 是配旧体型用的，体型缩小后统一迁到新的默认视野
        zoom: parsed.zoom === 0.75 ? DEFAULT_UI.zoom : parsed.zoom ?? DEFAULT_UI.zoom,
        autoSkills: { ...(parsed.autoSkills ?? {}) },
      };
    }
  } catch {
    // 忽略损坏数据
  }
  return { ...DEFAULT_UI, autoSkills: {} };
}

function saveUi(settings: UiSettings): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式忽略
  }
}

const btn =
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md border border-slate-600/70 bg-slate-900/80 px-2.5 py-1 text-[11px] font-bold text-slate-200 shadow-[0_2px_0_rgba(2,6,23,0.55)] transition-[color,background-color,border-color,box-shadow,transform] duration-150 hover:border-amber-500/50 hover:bg-slate-800/90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";
const btnPrimary =
  "rounded border-2 border-amber-500 bg-amber-500/20 px-3 py-1.5 text-[11px] font-bold text-amber-300 transition-colors hover:bg-amber-500/30 active:translate-y-px";

type Self = {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  kills: number;
  guard: boolean;
  buff: boolean;
};

type PanelKind = "character" | "bag" | "skills" | "shop";

type MonsterView = WorldSnapshot["monsters"][number];

type ActResponse = Omit<AckMessage, "t" | "rid">;

function getClientId(): string {
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `w${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

/** 只同步消耗品库存到服务器，装备等由本地存档管理 */
function potionStock(save: GameSave): Record<string, number> {
  const stock: Record<string, number> = {};
  for (const [id, count] of Object.entries(save.inventory)) {
    if (count > 0 && ITEMS[id]?.kind === "consumable") stock[id] = count;
  }
  return stock;
}

type DailyProgress = { date: string; kills: number; claimed: boolean };

function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

function loadDaily(): DailyProgress {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyProgress;
      if (parsed.date === todayKey()) return parsed;
    }
  } catch {
    // 忽略损坏数据
  }
  return { date: todayKey(), kills: 0, claimed: false };
}

function saveDaily(progress: DailyProgress): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(progress));
  } catch {
    // 隐私模式忽略
  }
}

export function WorldGame() {
  const [save, setSave] = useState<GameSave | null>(null);
  const [phase, setPhase] = useState<"loading" | "create" | "lobby" | "playing">(
    "loading"
  );
  const [status, setStatus] = useState<"idle" | "connecting" | "online" | "offline">(
    "idle"
  );
  const [self, setSelf] = useState<Self | null>(null);
  const [party, setParty] = useState<WorldSnapshot["players"]>([]);
  const [online, setOnline] = useState(0);
  const [room, setRoom] = useState<RoomId>("world");
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [nearNpc, setNearNpc] = useState<NpcView | null>(null);
  const [nearPortal, setNearPortal] = useState<PortalView | null>(null);
  const [npcDialog, setNpcDialog] = useState<NpcView | null>(null);
  const [questOpen, setQuestOpen] = useState(false);
  const [panel, setPanel] = useState<PanelKind | null>(null);
  const [bgmOn, setBgmOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [isTouch, setIsTouch] = useState(false);
  const [recallReadyAt, setRecallReadyAt] = useState(0);
  const [potionOpen, setPotionOpen] = useState(false);
  const [daily, setDaily] = useState<DailyProgress>({
    date: "",
    kills: 0,
    claimed: false,
  });
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [targetView, setTargetView] = useState<MonsterView | null>(null);
  const [streak, setStreak] = useState(0);

  const [createName, setCreateName] = useState("");
  const [createClass, setCreateClass] = useState<ClassId>("warrior");
  const [saves, setSaves] = useState<GameSave[]>([]);
  const [ui, setUi] = useState<UiSettings>(DEFAULT_UI);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const panelRef = usePopIn<HTMLDivElement>(panel);
  const settingsRef = usePopIn<HTMLDivElement>(settingsOpen);
  const npcRef = usePopIn<HTMLDivElement>(npcDialog);
  const questRef = usePopIn<HTMLDivElement>(questOpen);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const moveVecRef = useRef({ x: 0, y: 0 });
  const snapshotRef = useRef<WorldSnapshot | null>(null);
  const meRef = useRef({ x: 0, y: 0, dir: 1 as 1 | -1 });
  const inputRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef(new Set<string>());
  const myIdRef = useRef("");
  const lastSeqRef = useRef(0);
  const particlesRef = useRef<RenderParticle[]>([]);
  const saveRef = useRef<GameSave | null>(null);
  const selfRef = useRef<Self | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const viewRef = useRef<ClientView | null>(null);
  const frameSeqRef = useRef(0);
  const pendingRef = useRef(
    new Map<number, { resolve: (value: ActResponse | null) => void; timer: number }>()
  );
  const ridSeqRef = useRef(0);
  const wantConnectedRef = useRef(false);
  const joinedRef = useRef(false);
  const introShownRef = useRef(false);
  const reconnectRef = useRef<number | null>(null);
  const retryRef = useRef(0);
  const rafRef = useRef(0);
  const lastSendRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastHudRef = useRef(0);
  const lastPosRef = useRef({ x: 0, y: 0, at: 0 });
  const swingsRef = useRef<Record<string, number>>({});
  const flashesRef = useRef<Record<string, number>>({});
  const movingRef = useRef<Record<string, number>>({});
  const effectsRef = useRef<SkillEffect[]>([]);
  const effectSeqRef = useRef(0);
  const prevPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const targetPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const prevTargetPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const snapAtRef = useRef(0);
  const meMovingRef = useRef(0);
  const spawnRef = useRef({ x: 0, y: 0 });
  const recallReadyRef = useRef(0);
  const shakeUntilRef = useRef(0);
  const dailyRef = useRef<DailyProgress>({ date: "", kills: 0, claimed: false });
  const sizeRef = useRef({ width: 720, height: VIEW_HEIGHT });
  const soundRef = useRef(true);
  const roomRef = useRef<RoomId>("world");
  const cdReadyRef = useRef<Record<string, number>>({});
  const nearNpcRef = useRef<NpcView | null>(null);
  const nearPortalRef = useRef<PortalView | null>(null);
  const uiOpenRef = useRef(false);
  const targetIdRef = useRef<string | null>(null);
  const streakRef = useRef(0);
  const lastKillAtRef = useRef(0);
  const streakUntilRef = useRef(0);
  const uiRef = useRef<UiSettings>(DEFAULT_UI);
  const longPressRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const autoCursorRef = useRef(0);
  const lastDustRef = useRef(0);
  const skillPrevCdRef = useRef<Record<string, boolean>>({});
  const skillReadyRef = useRef<Record<string, number>>({});
  const persistTimerRef = useRef<number | null>(null);
  const stageRef = useRef<WorldStage | null>(null);
  const stageFailedRef = useRef(false);
  const zoomRef = useRef(ui.zoom);

  useEffect(() => {
    zoomRef.current = ui.zoom;
    stageRef.current?.setZoom(ui.zoom);
  }, [ui.zoom]);

  const fullscreen = nativeFullscreen || pseudoFullscreen;

  useEffect(() => {
    const stored = loadSave();
    const list = loadSaves();
    saveRef.current = stored;
    setSave(stored);
    setSaves(list);
    setPhase(stored ? "lobby" : "create");
    setCreateName("");
    setCreateClass(stored?.classId ?? "warrior");
    const settings = loadUi();
    uiRef.current = settings;
    setUi(settings);
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
    const progress = loadDaily();
    dailyRef.current = progress;
    setDaily(progress);
  }, []);

  // 界面设置持久化
  useEffect(() => {
    uiRef.current = ui;
    saveUi(ui);
  }, [ui]);

  // 卸载时把合并中的存档立即落盘
  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
        if (saveRef.current) persistSave(saveRef.current);
      }
    };
  }, []);

  // 全屏状态同步
  useEffect(() => {
    const onChange = () => setNativeFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // 面板/对话打开时屏蔽快捷键
  useEffect(() => {
    uiOpenRef.current = !!(panel || npcDialog || questOpen || settingsOpen);
  }, [panel, npcDialog, questOpen, settingsOpen]);

  // 冷却与倒计时刷新
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [phase]);

  // 冷却结束的瞬间记一次时间戳，让技能键闪一下，避免“突然就能按了”
  useEffect(() => {
    if (phase !== "playing" || !save) return;
    const now = Date.now();
    for (const id of CLASS_SKILLS[save.classId]) {
      const cooling = (cdReadyRef.current[id] ?? 0) > now;
      const wasCooling = skillPrevCdRef.current[id] ?? false;
      if (wasCooling && !cooling) skillReadyRef.current[id] = now;
      skillPrevCdRef.current[id] = cooling;
    }
  }, [nowTick, phase, save]);

  // 应用层心跳：刷新服务端活跃时间，配合连接层 ping 探测半开连接
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      post({ t: "ping" });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // 卸载时离开世界
  useEffect(() => {
    return () => {
      wantConnectedRef.current = false;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(encodeMessage({ t: "leave" }));
        } catch {
          // 忽略
        }
      }
      ws?.close();
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      cancelAnimationFrame(rafRef.current);
      stopBgm();
    };
  }, []);

  function sfx(kind: Parameters<typeof playSfx>[0]) {
    if (soundRef.current) playSfx(kind);
  }

  /** 拾取装备时的蓝色光点 */
  function lootBurst(x: number, y: number) {
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      particlesRef.current.push({
        x,
        y: y - 8,
        text: "✦",
        color: "#93c5fd",
        size: 13,
        vx: Math.cos(angle) * 1.4,
        vy: Math.sin(angle) * 0.9 - 0.6,
        life: 800,
        maxLife: 800,
      });
    }
  }

  /** 技能元素爆点：火焰/冰霜/圣光/奥术各自一簇火花 */
  function sparkBurst(x: number, y: number, color: string, count = 10) {
    if (particlesRef.current.length > 140) return;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 0.8 + Math.random() * 1.3;
      particlesRef.current.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y - 12 + (Math.random() - 0.5) * 10,
        text: i % 3 === 0 ? "✦" : "·",
        color,
        size: i % 3 === 0 ? 13 : 9,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6 - 0.55,
        life: 760,
        maxLife: 760,
      });
    }
  }

  /** 直接通过双工连接发送，不等待回执（移动/心跳等可丢弃操作） */
  function post(payload: Record<string, unknown>) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(encodeMessage(payload));
    } catch {
      // 连接刚断开，等待自动重连
    }
  }

  function rejectPending() {
    for (const pending of pendingRef.current.values()) {
      window.clearTimeout(pending.timer);
      pending.resolve(null);
    }
    pendingRef.current.clear();
  }

  /** 关键操作带请求号，服务端通过同一条连接回执，弱网下不会走两次 HTTP */
  function postAction(payload: Record<string, unknown>): Promise<ActResponse | null> {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve(null);
    }
    ridSeqRef.current += 1;
    const rid = ridSeqRef.current;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pendingRef.current.delete(rid);
        resolve(null);
      }, 5000);
      pendingRef.current.set(rid, { resolve, timer });
      try {
        ws.send(encodeMessage({ ...payload, rid }));
      } catch {
        window.clearTimeout(timer);
        pendingRef.current.delete(rid);
        resolve(null);
      }
    });
  }

  function wsUrl(): string {
    const configured = process.env.NEXT_PUBLIC_REALTIME_URL;
    if (configured) return configured;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }

  function joinPayload(current: GameSave) {
    const stats = effectiveStats(current);
    return {
      name: current.name,
      classId: current.classId,
      level: current.level,
      maxHp: stats.maxHp,
      maxMp: stats.maxMp,
      atk: stats.atk,
      def: stats.def,
      crit: stats.crit,
      cdr: stats.cdr,
      lifesteal: stats.lifesteal,
      weapon: current.equipment.weapon,
      armor: current.equipment.armor,
      potions: potionStock(current),
      skills: current.skillRanks ?? {},
      quests: current.quests,
      room: roomRef.current,
    };
  }

  /** 本地存档变更（装备/背包/商店）后持久化并同步到服务器 */
  /** 高频奖励写入做 800ms 合并，避免连续击杀时 localStorage 同步写造成卡顿 */
  function persistSoon() {
    if (persistTimerRef.current !== null) return;
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      const current = saveRef.current;
      if (!current) return;
      persistSave(current);
      setSaves(loadSaves());
    }, 800);
  }

  function applySave(next: GameSave) {
    saveRef.current = next;
    setSave(next);
    persistSave(next);
    setSaves(loadSaves());
    post({ t: "sync", player: joinPayload(next) });
  }

  /** 切换当前角色（仅在未进入世界时使用） */
  function switchSave(id: string) {
    if (id === saveRef.current?.id) return;
    setActiveSave(id);
    const next = loadSave();
    saveRef.current = next;
    setSave(next);
    setCreateName("");
    setCreateClass(next?.classId ?? "warrior");
    if (next) toast.success(`已切换到 ${next.name}`);
  }

  function removeSave(id: string) {
    deleteSave(id);
    const list = loadSaves();
    setSaves(list);
    if (saveRef.current?.id === id) {
      const next = loadSave();
      saveRef.current = next;
      setSave(next);
      if (!next) setPhase("create");
    }
    setDeleteTarget(null);
  }

  function updateUi(patch: Partial<UiSettings>) {
    setUi((prev) => ({ ...prev, ...patch }));
  }

  function toggleAutoSkill(skillId: string) {
    setUi((prev) => {
      const active = !prev.autoSkills[skillId];
      toast.success(
        active ? `已开启 ${SKILLS[skillId]?.name ?? "技能"} 自动施放` : `已关闭自动施放`
      );
      return {
        ...prev,
        autoSkills: { ...prev.autoSkills, [skillId]: active },
      };
    });
  }

  function applyReward(
    exp: number,
    gold: number,
    items?: { itemId: string; count: number }[]
  ) {
    const current = saveRef.current;
    if (!current) return;

    let inventory = current.inventory;
    const gained: string[] = [];
    if (items) {
      for (const entry of items) {
        const def = ITEMS[entry.itemId];
        if (!def) continue;
        for (let i = 0; i < Math.max(1, entry.count); i += 1) {
          inventory = addItem(inventory, entry.itemId);
        }
        gained.push(def.name);
      }
    }

    let next: GameSave = {
      ...current,
      gold: current.gold + gold,
      inventory,
    };
    const result = gainExp(next, exp);
    next = result.save;
    saveRef.current = next;
    setSave(next);
    persistSoon();

    if (gained.length > 0) {
      toast.success(`🎁 获得 ${gained.join("、")}`);
    }

    if (result.levels > 0) {
      sfx("levelup");
      toast.success(`升级到 Lv.${next.level}！`);
      effectSeqRef.current += 1;
      effectsRef.current.push({
        id: effectSeqRef.current,
        x: meRef.current.x,
        y: meRef.current.y,
        skillId: "levelup",
        at: performance.now(),
      });
      spawnSparks(meRef.current.x, meRef.current.y, "#fde68a", 18, 1.5);
      post({
        t: "sync",
        player: joinPayload(next),
        restoreHp: true,
      });
    }
  }

  /** 把服务端任务进度合并进本地存档，避免刷新后丢失 */
  function mergeQuests(view: QuestView[]) {
    setQuests(view);
    const current = saveRef.current;
    if (!current) return;
    const map: Record<string, QuestSaveEntry> = {};
    for (const quest of view) {
      map[quest.id] = { progress: quest.progress, status: quest.status };
    }
    const prev = current.quests ?? {};
    let changed = Object.keys(map).length !== Object.keys(prev).length;
    if (!changed) {
      for (const [id, entry] of Object.entries(map)) {
        const old = prev[id];
        if (!old || old.progress !== entry.progress || old.status !== entry.status) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
    const next: GameSave = { ...current, quests: map };
    saveRef.current = next;
    setSave(next);
    persistSoon();
  }

  function recordKill() {
    let progress = dailyRef.current;
    if (progress.date !== todayKey()) {
      progress = { date: todayKey(), kills: 0, claimed: false };
    }
    const next: DailyProgress = { ...progress, kills: progress.kills + 1 };

    if (next.kills >= DAILY_GOAL && !next.claimed) {
      next.claimed = true;
      const current = saveRef.current;
      if (current) {
        const updated: GameSave = {
          ...current,
          gold: current.gold + DAILY_REWARD,
        };
        saveRef.current = updated;
        setSave(updated);
        persistSave(updated);
      }
      toast.success(`🎯 每日目标完成！获得 ${DAILY_REWARD} 金币`);
      sfx("levelup");
    }

    dailyRef.current = next;
    setDaily(next);
    saveDaily(next);
  }

  /** Pixel FX：像素碎片飞散 */
  function spawnSparks(
    x: number,
    y: number,
    color: string,
    count = 5,
    power = 1
  ) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.8 + Math.random() * 1.6) * power;
      particlesRef.current.push({
        kind: "spark",
        x,
        y,
        text: "",
        color,
        size: 2 + Math.random() * 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.55 - 0.4,
        life: 320 + Math.random() * 220,
        maxLife: 540,
      });
    }
    if (particlesRef.current.length > 110) {
      particlesRef.current.splice(0, particlesRef.current.length - 110);
    }
  }

  function handleSnapshot(snapshot: WorldSnapshot) {
    snapshotRef.current = snapshot;
    const now = performance.now();
    const myId = myIdRef.current;

    // 房间切换（进入/离开副本）：以服务器为准重置本地预测位置
    if (snapshot.room !== roomRef.current) {
      roomRef.current = snapshot.room;
      setRoom(snapshot.room);
      const me = snapshot.players.find((player) => player.id === myId);
      if (me) meRef.current = { x: me.x, y: me.y, dir: me.dir as 1 | -1 };
      prevTargetPosRef.current = {};
      targetPosRef.current = {};
      snapAtRef.current = now;
      lastPosRef.current = { x: 0, y: 0, at: 0 };
      cdReadyRef.current = {};
      setNearNpc(null);
      setNearPortal(null);
      nearNpcRef.current = null;
      nearPortalRef.current = null;
      setLockedTarget(null);
      setTargetView(null);
      setPotionOpen(false);
    }

    // 记录上一帧坐标，用于渲染插值（10Hz 快照平滑到 60fps）
    const nextTargets: Record<string, { x: number; y: number }> = {};
    for (const player of snapshot.players) {
      nextTargets[player.id] = { x: player.x, y: player.y };
    }
    for (const monster of snapshot.monsters) {
      nextTargets[monster.id] = { x: monster.x, y: monster.y };
    }
    prevTargetPosRef.current = targetPosRef.current;
    targetPosRef.current = nextTargets;
    snapAtRef.current = now;

    for (const event of snapshot.events) {
      if (event.seq <= lastSeqRef.current) continue;
      lastSeqRef.current = event.seq;
      // 奖励只处理自己的，其余视觉事件对所有人可见
      if (event.kind === "reward" && event.to !== myId) continue;

      if (event.from) swingsRef.current[event.from] = now;
      if (event.kind === "damage" && event.monsterId) {
        flashesRef.current[event.monsterId] = now;
      }
      if (event.kind === "hurt" && event.to) {
        flashesRef.current[event.to] = now;
      }
      if (event.kind === "skill") {
        effectSeqRef.current += 1;
        // 若是远程技能，记录施法起点，画一条飞向落点的施法轨迹
        const casterPos =
          event.from === myId
            ? { x: meRef.current.x, y: meRef.current.y }
            : event.from
              ? snapshotRef.current?.players.find((p) => p.id === event.from)
              : null;
        const farCast =
          casterPos && Math.hypot(casterPos.x - event.x, casterPos.y - event.y) > 40;
        effectsRef.current.push({
          id: effectSeqRef.current,
          x: event.x,
          y: event.y,
          skillId: event.skillId ?? "",
          at: now,
          fx: farCast ? casterPos.x : undefined,
          fy: farCast ? casterPos.y : undefined,
        });
        if (effectsRef.current.length > 24) effectsRef.current.shift();
        // 元素爆点：让技能落点有对应的火花颜色
        if (
          Math.hypot(event.x - meRef.current.x, event.y - meRef.current.y) < 520
        ) {
          const id = event.skillId ?? "";
          const tone = FROST_SKILLS.has(id)
            ? "#a5f3fc"
            : FIRE_SKILLS.has(id)
              ? "#fdba74"
              : HEAL_SKILLS.has(id)
                ? id === "wish"
                  ? "#f9a8d4"
                  : "#86efac"
                : "#c4b5fd";
          sparkBurst(event.x, event.y, tone, id === "tibbers" ? 16 : 10);
        }
      }
      if (event.kind === "boss-aoe") {
        effectSeqRef.current += 1;
        effectsRef.current.push({
          id: effectSeqRef.current,
          x: event.x,
          y: event.y,
          skillId: "boss_aoe",
          at: now,
        });
        if (effectsRef.current.length > 24) effectsRef.current.shift();
        if (
          Math.hypot(event.x - meRef.current.x, event.y - meRef.current.y) < 420
        ) {
          sfx("skill");
        }
      }

      if (
        event.value &&
        (event.kind === "damage" ||
          event.kind === "hurt" ||
          event.kind === "heal")
      ) {
        const skillColor = event.skillId ? skillTone(event.skillId) : null;
        // 普通攻击火花按出手者职业着色，一眼分得清是谁在打
        const attacker =
          event.from && event.from !== myId
            ? snapshotRef.current?.players.find((p) => p.id === event.from)
            : null;
        const classColor = skillColor
          ? null
          : event.from === myId
            ? saveRef.current
              ? CLASS_ACCENT[saveRef.current.classId]
              : null
            : attacker
              ? CLASS_ACCENT[attacker.classId] ?? null
              : null;
        particlesRef.current.push({
          x: event.x + (event.kind === "damage" ? (Math.random() - 0.5) * 14 : 0),
          y: event.y,
          text: event.kind === "heal" ? `+${event.value}` : `-${event.value}`,
          color:
            event.kind === "heal"
              ? "#4ade80"
              : event.kind === "hurt"
                ? "#f87171"
                : event.crit
                  ? "#facc15"
                  : (skillColor ?? classColor ?? "#ffe4e6"),
          size:
            event.kind === "damage" && event.crit
              ? 18
              : skillColor
                ? 16
                : 14,
          life: 900,
          maxLife: 900,
        });
        if (particlesRef.current.length > 40) particlesRef.current.shift();
        if (event.kind === "damage" || event.kind === "hurt") {
          spawnSparks(
            event.x,
            event.y,
            event.crit
              ? "#fde68a"
              : event.kind === "hurt"
                ? "#f87171"
                : (skillColor ?? classColor ?? "#fda4af"),
            event.crit ? 8 : 4,
            event.crit ? 1.35 : 1
          );
        } else if (event.kind === "heal") {
          spawnSparks(event.x, event.y, "#86efac", 3, 0.7);
        }
      }

      switch (event.kind) {
        case "damage":
          // 只播放自己造成的攻击音效，避免多人混战噪音；武器不同音色不同
          if (event.from === myId) {
            const classId = saveRef.current?.classId;
            sfx(
              classId === "ranger"
                ? "attack_bow"
                : classId === "mage" || classId === "priest"
                  ? "attack_staff"
                  : "attack"
            );
          }
          break;
        case "hurt":
          if (event.to === myId) {
            sfx("hurt");
            shakeUntilRef.current = performance.now() + 180;
          }
          break;
        case "kill": {
          const distance = Math.hypot(
            event.x - meRef.current.x,
            event.y - meRef.current.y
          );
          if (distance < 340) sfx("kill");
          if (event.boss) {
            toast.success(
              `🏆 ${event.text} 被 ${event.byName ?? "冒险者"} 击败！`
            );
          } else if (event.elite) {
            toast(`⚔️ 精英 ${event.text} 被击败`, { duration: 1600 });
          }
          for (let i = 0; i < 6; i += 1) {
            const angle = (i / 6) * Math.PI * 2;
            particlesRef.current.push({
              x: event.x,
              y: event.y,
              text: "✦",
              color: "#fde68a",
              size: 14,
              vx: Math.cos(angle) * 1.5,
              vy: Math.sin(angle) * 0.9 - 0.5,
              life: 650,
              maxLife: 650,
            });
          }
          spawnSparks(
            event.x,
            event.y,
            event.boss ? "#f0abfc" : event.elite ? "#fde68a" : "#94a3b8",
            event.boss ? 16 : event.elite ? 10 : 7,
            event.boss ? 1.6 : 1.1
          );
          break;
        }
        case "skill":
          if (
            event.from === myId ||
            Math.hypot(
              event.x - meRef.current.x,
              event.y - meRef.current.y
            ) < 280
          ) {
            const id = event.skillId ?? "";
            sfx(
              FROST_SKILLS.has(id)
                ? "skill_frost"
                : FIRE_SKILLS.has(id)
                  ? "skill_fire"
                  : HEAL_SKILLS.has(id)
                    ? "heal"
                    : "skill"
            );
          }
          break;
        case "heal":
          if (event.to === myId) sfx("heal");
          break;
        case "death":
          if (event.to === myId) {
            sfx("death");
            const current = saveRef.current;
            if (current && current.gold > 0) {
              const lost = Math.max(1, Math.floor(current.gold * 0.05));
              const next: GameSave = { ...current, gold: current.gold - lost };
              saveRef.current = next;
              setSave(next);
              persistSave(next);
              toast.error(`你被击败了，损失 ${lost} 金币，3 秒后复活`);
            } else {
              toast.error("你被击败了，3 秒后复活");
            }
          }
          break;
        case "reward":
          if (event.to === myId) {
            const loot = event.items?.map((id) => ({ itemId: id, count: 1 }));
            applyReward(event.exp ?? 0, event.gold ?? 0, loot);
            recordKill();
            if ((event.gold ?? 0) > 0) {
              const nowMs = Date.now();
              const nextStreak =
                nowMs - lastKillAtRef.current < 4000 ? streakRef.current + 1 : 1;
              streakRef.current = nextStreak;
              lastKillAtRef.current = nowMs;
              streakUntilRef.current = nowMs + 4000;
              setStreak(nextStreak);
            }
          }
          break;
        case "pickup":
          if (event.to === myId) {
            if (event.gold) {
              applyReward(0, event.gold);
              particlesRef.current.push({
                x: event.x,
                y: event.y - 12,
                text: `+${event.gold} 金币`,
                color: "#fde68a",
                size: 13,
                life: 1000,
                maxLife: 1000,
              });
            }
            if (event.items?.length) {
              applyReward(
                0,
                0,
                event.items.map((id) => ({ itemId: id, count: 1 }))
              );
              lootBurst(event.x, event.y);
            }
            sfx("pickup");
          }
          break;
        case "quest":
          if (event.text) toast.success(`📜 ${event.text}`);
          break;
        case "room":
          if (event.text) toast(event.text, { duration: 1600 });
          break;
        case "join":
          if (event.text) {
            toast(`👋 ${event.text} 加入了世界`, { duration: 1600 });
          }
          break;
        case "leave":
          if (event.text) {
            toast(`${event.text} 离开了世界`, { duration: 1600 });
          }
          break;
      }
    }

    if (now - lastHudRef.current > 200) {
      lastHudRef.current = now;
      const me = snapshot.players.find((player) => player.id === myId);
      if (me) {
        const nextSelf: Self = {
          id: me.id,
          name: me.name,
          level: me.level,
          hp: me.hp,
          maxHp: me.maxHp,
          dead: me.dead,
          kills: me.kills,
          guard: !!me.guard,
          buff: !!me.buff,
        };
        selfRef.current = nextSelf;
        setSelf(nextSelf);
        meRef.current.dir = me.dir as 1 | -1;
      }
      setOnline(snapshot.online);
      setParty(snapshot.players.filter((player) => player.id !== myId));
      mergeQuests(snapshot.self.quests);

      // 冷却以服务端为准
      for (const id of snapshot.self.cooldowns ? Object.keys(snapshot.self.cooldowns) : []) {
        const remain = snapshot.self.cooldowns[id] ?? 0;
        if (remain > 0) cdReadyRef.current[id] = Date.now() + remain;
      }

      // 靠近 NPC / 传送门时提供交互
      const pos = meRef.current;
      const npc =
        snapshot.npcs.find(
          (entry) => Math.hypot(entry.x - pos.x, entry.y - pos.y) < 96
        ) ?? null;
      if ((nearNpcRef.current?.id ?? null) !== (npc?.id ?? null)) {
        nearNpcRef.current = npc;
        setNearNpc(npc);
      }
      const portal =
        snapshot.portals.find(
          (entry) => Math.hypot(entry.x - pos.x, entry.y - pos.y) < 110
        ) ?? null;
      if ((nearPortalRef.current?.id ?? null) !== (portal?.id ?? null)) {
        nearPortalRef.current = portal;
        setNearPortal(portal);
      }

      // 目标锁定：当前目标失效时自动选择最近的怪物
      let target =
        snapshot.monsters.find((monster) => monster.id === targetIdRef.current) ?? null;
      if (!target) {
        target =
          snapshot.monsters
            .filter(
              (monster) => Math.hypot(monster.x - pos.x, monster.y - pos.y) <= 360
            )
            .sort(
              (a, b) =>
                Math.hypot(a.x - pos.x, a.y - pos.y) -
                Math.hypot(b.x - pos.x, b.y - pos.y)
            )[0] ?? null;
        if ((target?.id ?? null) !== targetIdRef.current) {
          setLockedTarget(target?.id ?? null);
        }
      }
      setTargetView(target);

      const prev = prevPositionsRef.current;
      for (const player of snapshot.players) {
        const last = prev[player.id];
        if (
          last &&
          (Math.abs(last.x - player.x) > 2 || Math.abs(last.y - player.y) > 2)
        ) {
          movingRef.current[player.id] = now;
        }
        prev[player.id] = { x: player.x, y: player.y };
      }
    }
  }

  function scheduleReconnect() {
    if (!wantConnectedRef.current) return;
    if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
    // 指数退避，避免弱网下疯狂重连
    const delay = Math.min(15_000, 800 * Math.pow(1.7, retryRef.current));
    retryRef.current += 1;
    reconnectRef.current = window.setTimeout(() => {
      reconnectRef.current = null;
      connectRealtime();
    }, delay);
  }

  /** 单条 WebSocket 双工连接：上行操作 + 下行增量快照都走这里 */
  function connectRealtime() {
    if (!wantConnectedRef.current) return;
    const current = saveRef.current;
    if (!current) return;
    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      const latest = saveRef.current;
      if (!latest) return;
      frameSeqRef.current = 0;
      ws.send(
        encodeMessage({
          t: "join",
          clientId: getClientId(),
          ...joinPayload(latest),
          // 重连时补发断线期间遗漏的事件（奖励/任务进度）
          lastEventSeq: joinedRef.current ? lastSeqRef.current : undefined,
        })
      );
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      let message: ServerMessage;
      try {
        message = decodeMessage(event.data as ArrayBuffer) as ServerMessage;
      } catch {
        return;
      }
      handleServerMessage(message);
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setStatus("offline");
      rejectPending();
      scheduleReconnect();
    };

    ws.onerror = () => {
      // 交由 onclose 统一处理重连
    };
  }

  function handleHello(message: HelloMessage) {
    spawnRef.current = message.info.spawn;
    const nextRoom = message.player.room as RoomId;
    const roomChanged = nextRoom !== roomRef.current;
    roomRef.current = nextRoom;
    setRoom(nextRoom);

    if (!joinedRef.current) {
      lastSeqRef.current = message.eventSeq;
      meRef.current = { x: message.player.x, y: message.player.y, dir: 1 };
      lastPosRef.current = { x: 0, y: 0, at: 0 };
      prevTargetPosRef.current = {};
      targetPosRef.current = {};
      snapAtRef.current = performance.now();
      particlesRef.current = [];
      cdReadyRef.current = {};
    } else {
      // 重连补发事件时不要跳过，保留更大的事件序号
      lastSeqRef.current = Math.max(lastSeqRef.current, message.eventSeq);
      const me = meRef.current;
      if (
        roomChanged ||
        Math.hypot(message.player.x - me.x, message.player.y - me.y) > 260
      ) {
        meRef.current = { x: message.player.x, y: message.player.y, dir: 1 };
        lastPosRef.current = { x: 0, y: 0, at: 0 };
        prevTargetPosRef.current = {};
        targetPosRef.current = {};
        snapAtRef.current = performance.now();
        cdReadyRef.current = {};
      }
    }

    joinedRef.current = true;
    retryRef.current = 0;

    const current = saveRef.current;
    const nextSelf: Self = {
      id: getClientId(),
      name: current?.name ?? "冒险者",
      level: current?.level ?? 1,
      hp: message.player.hp,
      maxHp: message.player.maxHp,
      dead: false,
      kills: selfRef.current?.kills ?? 0,
      guard: false,
      buff: false,
    };
    selfRef.current = nextSelf;
    setSelf(nextSelf);
    setStatus("online");
    setPhase("playing");
    // 首次进入世界时提示本职业被动，新玩家不用翻面板也知道自己擅长什么
    if (!introShownRef.current && current) {
      introShownRef.current = true;
      const clsDef = CLASSES[current.classId];
      if (clsDef) {
        toast(
          `${clsDef.icon} ${clsDef.name} · ${clsDef.passive.name}：${clsDef.passive.desc}`,
          { duration: 3600 }
        );
      }
    }
  }

  function handleServerMessage(message: ServerMessage) {
    switch (message.t) {
      case "hello":
        handleHello(message);
        break;
      case "d": {
        // seq 不连续说明丢帧，请求服务端重发全量基线
        if (!message.full && message.seq !== frameSeqRef.current + 1) {
          post({ t: "resync" });
          return;
        }
        frameSeqRef.current = message.seq;
        const view = viewRef.current ?? (viewRef.current = createClientView());
        applyDelta(view, message);
        handleSnapshot(viewToSnapshot(view, message.events ?? [], message.time));
        break;
      }
      case "ack": {
        const pending = pendingRef.current.get(message.rid);
        if (!pending) break;
        window.clearTimeout(pending.timer);
        pendingRef.current.delete(message.rid);
        pending.resolve(message);
        break;
      }
      case "error":
        toast.error(message.message);
        break;
    }
  }

  function enterWorld() {
    const current = saveRef.current;
    if (!current) return;
    initAudio();
    startBgm();
    setBgmOn(true);
    myIdRef.current = getClientId();
    wantConnectedRef.current = true;
    retryRef.current = 0;
    setStatus("connecting");
    connectRealtime();
  }

  // 渲染循环
  useEffect(() => {
    if (phase !== "playing") return;

    lastFrameRef.current = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      const keys = keysRef.current;
      // 屏幕方向映射到等距世界坐标：W 往屏幕上方走
      let ix = 0;
      let iy = 0;
      if (keys.has("w") || keys.has("arrowup")) {
        ix -= 1;
        iy -= 1;
      }
      if (keys.has("s") || keys.has("arrowdown")) {
        ix += 1;
        iy += 1;
      }
      if (keys.has("a") || keys.has("arrowleft")) {
        ix -= 1;
        iy += 1;
      }
      if (keys.has("d") || keys.has("arrowright")) {
        ix += 1;
        iy -= 1;
      }
      // 虚拟摇杆：屏幕向量 → 等距世界向量
      const joy = moveVecRef.current;
      if (joy.x !== 0 || joy.y !== 0) {
        ix = joy.x + joy.y;
        iy = -joy.x + joy.y;
      }
      inputRef.current = { x: ix, y: iy };

      const me = meRef.current;
      const selfNow = selfRef.current;
      const currentRoom = roomRef.current;
      if ((ix !== 0 || iy !== 0) && !selfNow?.dead) {
        const length = Math.hypot(ix, iy) || 1;
        const nx = me.x + (ix / length) * SPEED * dt;
        const ny = me.y + (iy / length) * SPEED * dt;
        if (!isBlockedAt(nx, me.y, 9, currentRoom)) me.x = nx;
        if (!isBlockedAt(me.x, ny, 9, currentRoom)) me.y = ny;
        const cfg = roomConfig(currentRoom);
        me.x = Math.max(TILE, Math.min(cfg.w * TILE - TILE, me.x));
        me.y = Math.max(TILE, Math.min(cfg.h * TILE - TILE, me.y));
        // 朝向按屏幕水平位移判断，与服务端攻击方向保持一致
        const screenDx = ix - iy;
        if (Math.abs(screenDx) > 0.01) me.dir = screenDx > 0 ? 1 : -1;
        meMovingRef.current = now;
        // Pixel FX：跑动扬尘（法系扬奥术微光，重甲职业脚步更沉）
        if (now - lastDustRef.current > 170) {
          lastDustRef.current = now;
          const clsId = saveRef.current?.classId;
          const heavy = clsId === "warrior" || clsId === "guardian";
          const dustColor =
            clsId === "mage"
              ? "#a78bfa"
              : clsId === "priest"
                ? "#f5d0fe"
                : clsId === "ranger"
                  ? "#86efac"
                  : cfg.theme === "volcano"
                    ? "#7c2d12"
                    : cfg.theme === "cave"
                      ? "#475569"
                      : "#4b7355";
          spawnSparks(
            me.x - me.dir * 5,
            me.y - 1,
            dustColor,
            heavy ? 2 : 1,
            heavy ? 0.55 : 0.4
          );
        }
      }

      if (now - lastSendRef.current > 90) {
        lastSendRef.current = now;
        const last = lastPosRef.current;
        if (
          Math.abs(me.x - last.x) > 1 ||
          Math.abs(me.y - last.y) > 1 ||
          now - last.at > 1500
        ) {
          lastPosRef.current = { x: me.x, y: me.y, at: now };
          post({ t: "move", x: Math.round(me.x), y: Math.round(me.y) });
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const { width, height } = sizeRef.current;

        const particles = particlesRef.current;
        for (let i = particles.length - 1; i >= 0; i -= 1) {
          particles[i].life -= 16;
          particles[i].x += particles[i].vx ?? 0;
          particles[i].y += particles[i].vy ?? -0.6;
          if (particles[i].life <= 0) particles.splice(i, 1);
        }

        // 清理过期的动作与特效状态
        const swings = swingsRef.current;
        const flashes = flashesRef.current;
        const movingAnim = movingRef.current;
        for (const key of Object.keys(swings)) {
          if (now - swings[key] > 600) delete swings[key];
        }
        for (const key of Object.keys(flashes)) {
          if (now - flashes[key] > 600) delete flashes[key];
        }
        for (const key of Object.keys(movingAnim)) {
          if (now - movingAnim[key] > 600) delete movingAnim[key];
        }
        effectsRef.current = effectsRef.current.filter(
          (effect) => now - effect.at < 800
        );

        // 10Hz 快照插值到 60fps，减少远程玩家与怪物跳帧
        const rawSnapshot = snapshotRef.current;
        let visual: RenderSnapshot | null = null;
        if (rawSnapshot) {
          const alpha = Math.min(
            1,
            Math.max(0, (now - snapAtRef.current) / 100)
          );
          const previous = prevTargetPosRef.current;
          visual = {
            players: rawSnapshot.players.map((player) => {
              const old = previous[player.id];
              return old
                ? {
                    ...player,
                    x: old.x + (player.x - old.x) * alpha,
                    y: old.y + (player.y - old.y) * alpha,
                  }
                : player;
            }),
            monsters: rawSnapshot.monsters.map((monster) => {
              const old = previous[monster.id];
              return old
                ? {
                    ...monster,
                    x: old.x + (monster.x - old.x) * alpha,
                    y: old.y + (monster.y - old.y) * alpha,
                  }
                : monster;
            }),
            drops: rawSnapshot.drops,
            npcs: rawSnapshot.npcs,
            portals: rawSnapshot.portals,
          };
        }

        const frameInput = {
          width,
          height,
          room: currentRoom,
          meId: myIdRef.current,
          meX: me.x,
          meY: me.y,
          meName: selfNow?.name ?? saveRef.current?.name ?? "我",
          meHp: selfNow?.hp ?? 100,
          meMaxHp: selfNow?.maxHp ?? 100,
          meLevel: selfNow?.level ?? saveRef.current?.level ?? 1,
          meDir: me.dir,
          meDead: selfNow?.dead ?? false,
          meMoving: now - meMovingRef.current < 200,
          meSwingAt: swingsRef.current[myIdRef.current] ?? 0,
          meHurtAt: flashesRef.current[myIdRef.current] ?? 0,
          shake: now < shakeUntilRef.current,
          targetId: targetIdRef.current,
          snapshot: visual,
          swings: swingsRef.current,
          flashes: flashesRef.current,
          moving: movingRef.current,
          effects: effectsRef.current,
          particles,
          time: now,
        };

        if (stageRef.current) {
          stageRef.current.render(frameInput);
        } else if (stageFailedRef.current) {
          drawWorld(canvas, frameInput);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // Canvas 尺寸自适应
  useEffect(() => {
    if (phase !== "playing") return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const apply = () => {
      const width = Math.max(320, wrap.clientWidth);
      const height = Math.max(240, wrap.clientHeight);
      sizeRef.current = { width, height };
      if (stageRef.current) {
        stageRef.current.resize(width, height);
        return;
      }
      if (!stageFailedRef.current) return;
      const dpr = Math.min(isTouch ? 1.5 : 2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [phase, fullscreen, isTouch]);

  // PixiJS 渲染层（动态加载，避免 SSR 与首屏体积）
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    stageFailedRef.current = false;

    void (async () => {
      try {
        const mod = await import("@/lib/world/pixi-stage");
        if (cancelled) return;
        const stage = await mod.createWorldStage(canvas, {
          width: sizeRef.current.width,
          height: sizeRef.current.height,
          room: roomRef.current,
          isTouch,
        });
        if (cancelled) {
          stage.destroy();
          return;
        }
        stageRef.current = stage;
        stage.setZoom(zoomRef.current);
        stage.resize(sizeRef.current.width, sizeRef.current.height);
      } catch (error) {
        console.error("PixiJS 初始化失败，回退到 Canvas 2D 渲染", error);
        stageFailedRef.current = true;
        const { width, height } = sizeRef.current;
        const dpr = Math.min(isTouch ? 1.5 : 2, window.devicePixelRatio || 1);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    })();

    return () => {
      cancelled = true;
      stageRef.current?.destroy();
      stageRef.current = null;
    };
  }, [phase, isTouch]);

  async function doSkill(index: number, silent = false) {
    const current = saveRef.current;
    const selfNow = selfRef.current;
    if (!current || !selfNow) return;
    const skillId = CLASS_SKILLS[current.classId][index];
    if (!skillId) return;
    const skill = SKILLS[skillId];
    if (current.level < skill.level) {
      if (!silent) toast.error(`Lv.${skill.level} 解锁该技能`);
      return;
    }
    if (selfNow.dead) return;
    if (silent && skill.kind === "heal" && selfNow.hp / selfNow.maxHp > 0.85) return;
    const now = Date.now();
    if (now < (cdReadyRef.current[skillId] ?? 0)) return;

    const stats = effectiveStats(current);
    const rank = Math.max(1, Math.min(15, current.skillRanks?.[skillId] ?? 1));
    const cooldown =
      (skill.cooldown ?? 5) *
      (1 - stats.cdr / 100) *
      Math.max(0.55, 1 - (rank - 1) * 0.015);

    // 乐观冷却，服务端返回失败时回滚
    cdReadyRef.current[skillId] = now + cooldown * 1000;
    setNowTick(now);
    swingsRef.current[myIdRef.current] = performance.now();
    sfx("skill");

    const input = inputRef.current;
    const lockedId = targetIdRef.current;
    const locked = lockedId
      ? snapshotRef.current?.monsters.find((monster) => monster.id === lockedId) ?? null
      : null;
    if (locked) {
      const screenDx = locked.x - locked.y - (meRef.current.x - meRef.current.y);
      if (Math.abs(screenDx) > 1) meRef.current.dir = screenDx > 0 ? 1 : -1;
    }
    const result = await postAction({
      t: "skill",
      skillId,
      dirX: input.x,
      dirY: input.y,
      targetId: lockedId ?? undefined,
    });
    if (!result) return;
    if (result.ok === false) {
      cdReadyRef.current[skillId] = 0;
      setNowTick(Date.now());
      if (result.message && !silent) toast.error(result.message);
    }
  }

  // 自动施放：战斗中按技能顺序轮流释放已开启自动的技能
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      const current = saveRef.current;
      const selfNow = selfRef.current;
      if (!current || !selfNow || selfNow.dead || uiOpenRef.current) return;
      const settings = uiRef.current;
      const snapshot = snapshotRef.current;
      if (!snapshot) return;
      const me = meRef.current;
      const inCombat = snapshot.monsters.some(
        (monster) => Math.hypot(monster.x - me.x, monster.y - me.y) < 420
      );
      if (!inCombat) return;
      const ids = CLASS_SKILLS[current.classId];
      const now = Date.now();
      for (let offset = 0; offset < ids.length; offset += 1) {
        const index = (autoCursorRef.current + offset) % ids.length;
        const skillId = ids[index];
        if (!settings.autoCastAll && !settings.autoSkills[skillId]) continue;
        const skill = SKILLS[skillId];
        if (current.level < skill.level) continue;
        if (now < (cdReadyRef.current[skillId] ?? 0)) continue;
        if (skill.kind === "heal" && selfNow.hp / selfNow.maxHp > 0.85) continue;
        autoCursorRef.current = (index + 1) % ids.length;
        void doSkill(index, true);
        break;
      }
    }, 280);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function applyTravel(result: ActResponse | null) {
    if (!result) {
      toast.error("网络异常，请重试");
      return;
    }
    if (result.ok === false) {
      if (result.message) toast.error(result.message);
      return;
    }
    if (result.room) {
      roomRef.current = result.room as RoomId;
      setRoom(result.room as RoomId);
    }
    if (typeof result.x === "number" && typeof result.y === "number") {
      meRef.current.x = result.x;
      meRef.current.y = result.y;
    }
    prevTargetPosRef.current = {};
    targetPosRef.current = {};
    snapAtRef.current = performance.now();
    lastPosRef.current = { x: 0, y: 0, at: 0 };
    if (result.message) toast.success(result.message);
  }

  async function enterPortal(portal: PortalView) {
    // 副本内的传送门用于返回开放世界
    if (portal.target === "world") {
      await leaveDungeon();
      return;
    }
    const level = selfRef.current?.level ?? saveRef.current?.level ?? 1;
    if (level < portal.unlockLevel) {
      toast.error(`需要 ${portal.unlockLevel} 级才能进入`);
      return;
    }
    const result = await postAction({ t: "enter", dungeonId: portal.target });
    applyTravel(result);
    nearPortalRef.current = null;
    setNearPortal(null);
  }

  async function leaveDungeon() {
    const result = await postAction({ t: "exit" });
    applyTravel(result);
    nearPortalRef.current = null;
    setNearPortal(null);
  }

  function openNpc(npc: NpcView) {
    setNpcDialog(npc);
  }

  function interact() {
    if (uiOpenRef.current) return;
    const portal = nearPortalRef.current;
    if (portal) {
      void enterPortal(portal);
      return;
    }
    const npc = nearNpcRef.current;
    if (npc) openNpc(npc);
  }

  function setLockedTarget(id: string | null) {
    targetIdRef.current = id;
  }

  /** 在附近怪物间循环切换锁定目标 */
  function cycleTarget() {
    const monsters = snapshotRef.current?.monsters ?? [];
    const pos = meRef.current;
    const nearby = monsters
      .filter((monster) => Math.hypot(monster.x - pos.x, monster.y - pos.y) <= 640)
      .sort(
        (a, b) =>
          Math.hypot(a.x - pos.x, a.y - pos.y) -
          Math.hypot(b.x - pos.x, b.y - pos.y)
      );
    if (nearby.length === 0) {
      setLockedTarget(null);
      setTargetView(null);
      return;
    }
    const index = nearby.findIndex((monster) => monster.id === targetIdRef.current);
    const next = nearby[(index + 1) % nearby.length];
    setLockedTarget(next.id);
    setTargetView(next);
  }

  // 键盘操作
  useEffect(() => {
    if (phase !== "playing") return;
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "escape") {
        setPanel(null);
        setNpcDialog(null);
        setQuestOpen(false);
        return;
      }
      if (uiOpenRef.current) return;
      if (MOVE_KEYS.has(key)) {
        keysRef.current.add(key);
        event.preventDefault();
        return;
      }
      if (event.repeat) return;
      if (key === "tab") {
        event.preventDefault();
        cycleTarget();
        return;
      }
      if (key === "b") {
        event.preventDefault();
        doRecall();
        return;
      }
      if (key === "f") {
        event.preventDefault();
        interact();
        return;
      }
      const index = SKILL_KEY_MAP[key];
      if (index !== undefined) {
        event.preventDefault();
        void doSkill(index);
      }
    };
    const up = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keysRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function leaveWorld() {
    const current = saveRef.current;
    const selfNow = selfRef.current;
    if (current && selfNow) {
      const next: GameSave = {
        ...current,
        hp: Math.round(selfNow.hp),
      };
      saveRef.current = next;
      setSave(next);
      persistSave(next);
    }
    wantConnectedRef.current = false;
    post({ t: "leave" });
    myIdRef.current = "";
    // 下次进入统一从开放世界村庄出生
    roomRef.current = "world";
    setRoom("world");
    joinedRef.current = false;
    frameSeqRef.current = 0;
    viewRef.current = createClientView();
    rejectPending();
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
    if (reconnectRef.current) {
      window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    retryRef.current = 0;
    cancelAnimationFrame(rafRef.current);
    stopBgm();
    setBgmOn(false);
    setPhase("lobby");
    setStatus("idle");
    setSelf(null);
    setParty([]);
    setQuests([]);
    setLockedTarget(null);
    setTargetView(null);
    setStreak(0);
    streakRef.current = 0;
    lastKillAtRef.current = 0;
    setPanel(null);
    setNpcDialog(null);
    setQuestOpen(false);
    setPseudoFullscreen(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      setPseudoFullscreen(false);
      return;
    }
    if (pseudoFullscreen) {
      setPseudoFullscreen(false);
      return;
    }
    const element = gameRef.current;
    if (!element) return;
    try {
      await element.requestFullscreen();
    } catch {
      // iOS 等不支持元素全屏时用固定定位兜底
      setPseudoFullscreen(true);
    }
  }

  function updateJoystick(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const max = rect.width / 2 - 16;
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > max && length > 0) {
      dx = (dx / length) * max;
      dy = (dy / length) * max;
    }
    const nx = max > 0 ? dx / max : 0;
    const ny = max > 0 ? dy / max : 0;
    moveVecRef.current =
      Math.hypot(nx, ny) < 0.18 ? { x: 0, y: 0 } : { x: nx, y: ny };
    setKnob({ x: dx, y: dy });
  }

  function endJoystick() {
    moveVecRef.current = { x: 0, y: 0 };
    setKnob({ x: 0, y: 0 });
  }

  /** 长按技能 500ms 切换自动施放 */
  function startSkillLongPress(skillId: string) {
    cancelSkillLongPress();
    suppressClickRef.current = false;
    longPressRef.current = window.setTimeout(() => {
      longPressRef.current = null;
      suppressClickRef.current = true;
      toggleAutoSkill(skillId);
    }, 500);
  }

  function cancelSkillLongPress() {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  function doRecall() {
    const now = Date.now();
    if (now < recallReadyRef.current) {
      toast.error("回城冷却中");
      return;
    }
    recallReadyRef.current = now + 20_000;
    setRecallReadyAt(now + 20_000);
    window.setTimeout(() => {
      recallReadyRef.current = 0;
      setRecallReadyAt(0);
    }, 20_000);
    roomRef.current = "world";
    setRoom("world");
    meRef.current = {
      x: spawnRef.current.x,
      y: spawnRef.current.y,
      dir: meRef.current.dir,
    };
    lastPosRef.current = { x: 0, y: 0, at: 0 };
    prevTargetPosRef.current = {};
    targetPosRef.current = {};
    void postAction({ t: "recall" });
    toast.success("已回城");
  }

  function drinkPotion(itemId: string) {
    const current = saveRef.current;
    const item = ITEMS[itemId];
    const selfNow = selfRef.current;
    if (!current || !item || !selfNow) return;
    if ((current.inventory[itemId] ?? 0) <= 0) return;
    if (item.hp && selfNow.hp >= selfNow.maxHp) {
      toast.error("生命已满");
      return;
    }
    const next: GameSave = {
      ...current,
      inventory: removeItem(current.inventory, itemId),
    };
    saveRef.current = next;
    setSave(next);
    persistSave(next);
    post({ t: "potion", itemId });
  }

  async function acceptQuestById(questId: string) {
    const result = await postAction({ t: "acceptQuest", questId });
    if (!result) {
      toast.error("网络异常，请重试");
      return;
    }
    if (result.ok === false) {
      toast.error(result.message ?? "无法接取任务");
      return;
    }
    toast.success(result.message ?? "已接取任务");
    setQuests((prev) =>
      prev.some((quest) => quest.id === questId)
        ? prev
        : [
            ...prev,
            {
              id: questId,
              status: "active",
              progress: 0,
              goal: questGoal(QUESTS[questId]),
            },
          ]
    );
  }

  async function turnInQuestById(questId: string) {
    const result = await postAction({ t: "turnInQuest", questId });
    if (!result) {
      toast.error("网络异常，请重试");
      return;
    }
    if (result.ok === false) {
      toast.error(result.message ?? "无法交付任务");
      return;
    }
    toast.success(result.message ?? "任务完成");
    if (result.reward) {
      applyReward(result.reward.exp, result.reward.gold, result.reward.items);
    }
    setQuests((prev) =>
      prev.map((quest) =>
        quest.id === questId ? { ...quest, status: "turnedIn" } : quest
      )
    );
  }

  function toggleBgm() {
    if (bgmOn) {
      stopBgm();
      setBgmOn(false);
    } else {
      initAudio();
      startBgm();
      setBgmOn(true);
    }
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    soundRef.current = next;
  }

  if (phase === "loading") {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-950 text-xs text-slate-400">
        加载中…
      </div>
    );
  }

  if (phase === "create") {
    return (
      <div className="space-y-4 rounded-xl border-2 border-slate-700 bg-slate-950 p-4 text-slate-100 shadow-[6px_6px_0_rgba(0,0,0,0.3)]">
        <div>
          <h2 className="text-sm font-bold">创建角色进入开放世界</h2>
          <p className="mt-1 text-[10px] text-slate-500">
            同一账号最多拥有 {MAX_CHARACTERS} 个角色 · 无需登录 · 与同服玩家实时组队
          </p>
        </div>
        <input
          value={createName}
          onChange={(event) => setCreateName(event.target.value.slice(0, 12))}
          placeholder={`冒险者${saves.length + 1}`}
          className="w-full rounded border-2 border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-500"
        />
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(CLASSES) as ClassId[]).map((id) => {
            const item = CLASSES[id];
            const active = createClass === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCreateClass(id)}
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
                  <span className="rounded bg-slate-800 px-1 py-0.5 text-[9px] font-normal text-slate-300">
                    {CLASS_ROLE[id]}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{item.desc}</p>
                <p className="mt-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">
                  被动 · {item.passive.name}：{item.passive.desc}
                </p>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          {saves.length > 0 ? (
            <button
              type="button"
              className={btn}
              onClick={() => {
                setCreateName("");
                setPhase("lobby");
              }}
            >
              返回角色列表
            </button>
          ) : (
            <Link href="/" className="text-[10px] text-slate-500 hover:text-slate-300">
              返回首页
            </Link>
          )}
          <button
            type="button"
            className={btnPrimary}
            disabled={saves.length >= MAX_CHARACTERS}
            onClick={() => {
              if (saves.length >= MAX_CHARACTERS) {
                toast.error(`最多只能创建 ${MAX_CHARACTERS} 个角色`);
                return;
              }
              const next = createSave(createName, createClass);
              saveRef.current = next;
              setSave(next);
              persistSave(next);
              setSaves(loadSaves());
              setCreateName("");
              toast.success(`已创建角色 ${next.name}`);
              setPhase("lobby");
            }}
          >
            创建角色
          </button>
        </div>
      </div>
    );
  }

  if (phase === "lobby") {
    const current = save;
    return (
      <div className="space-y-4 rounded-xl border-2 border-slate-700 bg-slate-950 p-4 text-slate-100 shadow-[6px_6px_0_rgba(0,0,0,0.3)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">翡翠大陆 · 实时开放世界</h2>
            <p className="mt-1 text-[10px] text-slate-500">
              选择角色进入世界 · 开放世界与副本共用同一套实时战斗
            </p>
          </div>
          <Link href="/" className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300">
            首页
          </Link>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {saves.map((entry) => {
            const active = entry.id === saveRef.current?.id;
            const cls = CLASSES[entry.classId];
            return (
              <div
                key={entry.id}
                className={cn(
                  "rounded-lg border-2 p-2.5 transition-colors",
                  active
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-3xl">{cls.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">
                      {entry.name}
                      <span className="ml-1.5 text-amber-300">Lv.{entry.level}</span>
                      <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                        {cls.name}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="flex items-center gap-0.5 text-amber-300">
                        <Coins className="size-3" />
                        {entry.gold}
                      </span>
                      <span>通关 {entry.cleared.length}</span>
                      <span>胜场 {entry.wins}</span>
                    </p>
                  </div>
                  {active && (
                    <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                      当前
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-1">
                  <button
                    type="button"
                    className={cn(btn, "flex-1", !active && "border-amber-500/60 text-amber-300")}
                    disabled={active}
                    onClick={() => switchSave(entry.id!)}
                  >
                    {active ? "已选择" : "选择该角色"}
                  </button>
                  <button
                    type="button"
                    className={cn(btn, "text-rose-300 hover:bg-rose-500/15")}
                    title="删除角色"
                    onClick={() => setDeleteTarget(entry.id!)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {saves.length < MAX_CHARACTERS && (
            <button
              type="button"
              className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-700 bg-slate-900/40 text-[11px] text-slate-400 transition-colors hover:border-amber-500/60 hover:text-amber-300"
              onClick={() => {
                setCreateName("");
                setCreateClass(current?.classId ?? "warrior");
                setPhase("create");
              }}
            >
              <UserPlus className="size-5" />
              新建角色（{saves.length}/{MAX_CHARACTERS}）
            </button>
          )}
        </div>

        {current && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
            <span className="text-3xl">{CLASSES[current.classId].icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold">
                即将使用 {current.name}
                <span className="ml-1.5 text-amber-300">Lv.{current.level}</span>
                <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                  {CLASSES[current.classId].name}
                </span>
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                技能点 {availableSkillPoints(current)} · 装备强化上限 +{enhanceCap(current)}
              </p>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-300">
              <Coins className="size-3.5" />
              {current.gold}
            </span>
          </div>
        )}

        <ul className="space-y-1 text-[11px] leading-relaxed text-slate-400">
          <li>· 移动：WASD / 方向键，移动端使用右下角虚拟摇杆（可在设置中改到左侧）</li>
          <li>· 战斗：靠近怪物自动攻击，QWER 技能栏（键盘 1-4 / Q E R）</li>
          <li>· 自动施放：长按技能按钮切换自动，战斗中有敌人时自动释放</li>
          <li>· 交互：靠近 NPC 或传送门后按 F，进入副本、接取任务、买卖装备</li>
          <li>· 成长：60 级上限、装备强化 +15、技能 15 级加点，支持同账号多角色</li>
        </ul>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnPrimary}
            disabled={!current}
            onClick={() => void enterWorld()}
          >
            {status === "connecting" ? "连接中…" : "进入世界"}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              setCreateName("");
              setCreateClass(current?.classId ?? "warrior");
              setPhase("create");
            }}
            disabled={saves.length >= MAX_CHARACTERS}
          >
            新建角色
          </button>
        </div>

        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setDeleteTarget(null)}
          >
            <div
              className="w-full max-w-xs rounded-xl border-2 border-rose-500/60 bg-slate-950 p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-sm font-bold text-rose-300">删除角色</p>
              <p className="mt-1 text-[11px] text-slate-400">
                确定删除「{saves.find((entry) => entry.id === deleteTarget)?.name ?? "该角色"}」吗？
                该角色的等级、装备与进度会永久丢失。
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className={btn} onClick={() => setDeleteTarget(null)}>
                  取消
                </button>
                <button
                  type="button"
                  className={cn(btn, "border-rose-500 bg-rose-500/20 text-rose-200")}
                  onClick={() => removeSave(deleteTarget)}
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const skills = save ? CLASS_SKILLS[save.classId] : [];
  const potionItems = save
    ? Object.entries(save.inventory)
        .filter(([id, count]) => count > 0 && ITEMS[id]?.kind === "consumable")
        .map(([id, count]) => ({ id, count, item: ITEMS[id] }))
        .filter((entry) => !(entry.item.mp && !entry.item.hp))
    : [];
  const hpPercent = self ? Math.max(0, (self.hp / self.maxHp) * 100) : 100;
  const expNeed = save ? expToNext(save.level) : 1;
  const expPercent = save
    ? save.level >= MAX_LEVEL
      ? 100
      : Math.min(100, (save.exp / expNeed) * 100)
    : 0;
  const roomName = ROOMS[room].name;
  const myLevel = self?.level ?? save?.level ?? 1;
  const joystickPosition = ui.joystickSide === "right" ? "right-4" : "left-4";
  const joystickSize =
    ui.scale === "compact" ? "size-20" : ui.scale === "large" ? "size-28" : "size-24";
  const skillButtonSize =
    ui.scale === "compact"
      ? "px-1.5 py-0.5 text-[10px]"
      : ui.scale === "large"
        ? "px-3 py-1.5 text-[12px]"
        : "";

  return (
    <div
      ref={gameRef}
      className={cn(
        "relative overflow-hidden border-2 border-slate-700 bg-slate-950 text-slate-100",
        fullscreen
          ? "fixed inset-0 z-50 h-[100dvh] w-screen rounded-none border-0"
          : "rounded-xl shadow-[6px_6px_0_rgba(0,0,0,0.3)]"
      )}
    >
      <div
        ref={wrapRef}
        className="relative w-full touch-none select-none bg-black"
        style={{ height: fullscreen ? "100dvh" : isTouch ? 420 : 520 }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />

        {/* 常驻暗角 + 顶部天光，把视线收拢到战场中心 */}
        <div
          className="pointer-events-none absolute inset-0 z-[4]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0) 54%, rgba(3,10,6,0.4) 100%), linear-gradient(180deg, rgba(125,211,252,0.10) 0%, rgba(2,6,23,0) 26%, rgba(2,6,23,0.22) 100%)",
          }}
        />

        {/* 低血量红色边缘警示，随心跳脉冲 */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-[5]",
            self && self.hp > 0 && self.hp / self.maxHp < 0.35
              ? "animate-[hp-danger_1.5s_ease-in-out_infinite]"
              : "opacity-0 transition-opacity duration-700"
          )}
          style={{ boxShadow: "inset 0 0 64px 20px rgba(239,68,68,0.5)" }}
        />

        {/* 顶部 HUD 浮层 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 animate-[hud-drop_360ms_cubic-bezier(0.22,1,0.36,1)_both] bg-gradient-to-b from-slate-950/90 via-slate-950/60 to-transparent px-2 pb-10 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-center justify-between gap-2">
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-950/55 px-2 py-1 text-left backdrop-blur-sm"
              style={{
                borderColor: save ? `${CLASS_ACCENT[save.classId]}88` : undefined,
                boxShadow: save
                  ? `inset 0 0 12px ${CLASS_ACCENT[save.classId]}22`
                  : undefined,
              }}
              onClick={() => setPanel("character")}
              title="查看角色与装备"
            >
              <span className="text-xl">{save ? CLASSES[save.classId].icon : "🧙"}</span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold">
                  {save?.name ?? "冒险者"}
                  <span className="ml-1.5 text-amber-300">Lv.{myLevel}</span>
                  {save ? (
                    <span
                      className="ml-1.5 text-[10px] font-normal"
                      style={{ color: CLASS_ACCENT[save.classId] }}
                    >
                      {CLASSES[save.classId].name}
                    </span>
                  ) : null}
                </p>
                <p className="flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-400">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      status === "online" ? "bg-emerald-400" : "bg-amber-400"
                    )}
                  />
                  <span className="truncate">{roomName} · 在线 {online} 人</span>
                  <span className="hidden shrink-0 sm:inline">· 击杀 {self?.kills ?? 0}</span>
                </p>
              </div>
            </button>
            <div className="flex items-center gap-1">
              <span className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300">
                <Coins className="size-3" />
                {save?.gold ?? 0}
              </span>
              <button
                type="button"
                className={cn(btn, "size-7 px-0")}
                title="界面与操作设置"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="size-3.5" />
              </button>
              <button type="button" className={cn(btn, "size-7 px-0")} title="背景音乐" onClick={toggleBgm}>
                <Music2 className={cn("size-3.5", bgmOn ? "text-emerald-400" : "text-slate-500")} />
              </button>
              <button type="button" className={cn(btn, "size-7 px-0")} title="音效" onClick={toggleSound}>
                {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5 text-slate-500" />}
              </button>
              <button
                type="button"
                className={cn(btn, "size-7 px-0")}
                title={fullscreen ? "退出全屏" : "全屏"}
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </button>
              <button type="button" className={cn(btn, "size-7 px-0")} title="离开世界" onClick={leaveWorld}>
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-1.5 w-[min(280px,72%)]">
            <div className="flex items-center justify-between text-[9px] font-bold tracking-wide text-slate-400">
              <span className={hpPercent < 35 ? "text-rose-300" : "text-red-300/90"}>HP</span>
              <span
                className={cn(
                  "tabular-nums transition-colors",
                  hpPercent < 35 ? "text-rose-300" : "text-slate-300"
                )}
              >
                {self?.hp ?? 0} / {self?.maxHp ?? 0}
              </span>
            </div>
            <div
              className={cn(
                "relative mt-0.5 h-2 overflow-hidden rounded-full bg-slate-900/80 ring-1 ring-slate-700/60",
                hpPercent < 35 && "animate-pulse ring-2 ring-rose-500/70"
              )}
            >
              {/* 掉血残影：慢速回落，读伤害更直观 */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-amber-300/70 transition-[width] duration-700 ease-out"
                style={{ width: `${hpPercent}%` }}
              />
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-red-600 via-red-500 to-rose-400 shadow-[0_0_6px_rgba(248,113,113,0.55)] transition-[width] duration-200 ease-out"
                style={{ width: `${hpPercent}%` }}
              >
                <span className="absolute inset-x-0 top-0 h-[2px] rounded-full bg-white/25" />
              </div>
            </div>
            <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-slate-900/70" title="经验">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-[width] duration-300 ease-out"
                style={{ width: `${expPercent}%` }}
              />
            </div>
            {self && (self.guard || self.buff) ? (
              <div className="mt-1 flex items-center gap-1 text-[9px] font-bold">
                {self.guard ? (
                  <span className="rounded bg-sky-500/20 px-1.5 py-px text-sky-300 ring-1 ring-sky-400/40">
                    🛡 护盾
                  </span>
                ) : null}
                {self.buff ? (
                  <span className="rounded bg-amber-500/20 px-1.5 py-px text-amber-300 ring-1 ring-amber-400/40">
                    ⚔ 强化
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {targetView && (
            <div
              key={targetView.id}
              className="pointer-events-auto mt-1.5 flex w-[min(300px,78%)] animate-[target-slide_220ms_cubic-bezier(0.22,1,0.36,1)_both] items-center gap-2 rounded-md border border-slate-700/70 bg-slate-950/80 px-2 py-1 backdrop-blur-sm"
            >
              <span className="text-base">{targetView.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[10px] font-bold">
                  <span
                    className={
                      targetView.boss
                        ? "text-fuchsia-300"
                        : targetView.elite
                          ? "text-amber-300"
                          : "text-slate-200"
                    }
                  >
                    Lv.{targetView.level} {targetView.name}
                  </span>
                  {targetView.elite && (
                    <span className="rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">
                      精英
                    </span>
                  )}
                  {targetView.slow && (
                    <span className="rounded bg-sky-500/20 px-1 text-[9px] text-sky-300">
                      ❄ 减速
                    </span>
                  )}
                  {targetView.boss && (
                    <span className="rounded bg-fuchsia-500/20 px-1 text-[9px] text-fuchsia-300">
                      BOSS
                    </span>
                  )}
                  <span className="ml-auto text-[9px] font-normal text-slate-500">
                    {Math.max(
                      1,
                      Math.round(
                        Math.hypot(
                          targetView.x - meRef.current.x,
                          targetView.y - meRef.current.y
                        ) / 32
                      )
                    )}
                    格
                  </span>
                </p>
                <div className="mt-0.5 h-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className={
                      targetView.elite
                        ? "h-full rounded bg-amber-400 transition-[width] duration-200 ease-out"
                        : targetView.boss
                          ? "h-full rounded bg-fuchsia-400 transition-[width] duration-200 ease-out"
                          : "h-full rounded bg-red-500 transition-[width] duration-200 ease-out"
                    }
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, (targetView.hp / targetView.maxHp) * 100)
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-0.5 flex justify-between text-[9px] text-slate-500">
                  <span>
                    HP {Math.max(0, Math.round(targetView.hp))}/{targetView.maxHp}
                  </span>
                  <span>
                    {Math.round((Math.max(0, targetView.hp) / Math.max(1, targetView.maxHp)) * 100)}
                    %
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 弱网提示 */}
        {status !== "online" && (
          <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full border border-amber-500/50 bg-slate-950/90 px-3 py-1 text-[10px] font-bold text-amber-300">
            网络不稳定，正在自动重连…
          </div>
        )}

        {/* 移动端虚拟摇杆，位置与大小可在设置中自定义 */}
        {isTouch && (
          <div
            data-testid="joystick"
            className={cn(
              "absolute bottom-32 z-20 touch-none rounded-full border-2 border-white/20 bg-slate-950/40 backdrop-blur-sm",
              joystickPosition,
              joystickSize
            )}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              updateJoystick(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                updateJoystick(event);
              }
            }}
            onPointerUp={endJoystick}
            onPointerCancel={endJoystick}
          >
            <span className="pointer-events-none absolute left-1/2 top-1/2 size-[66%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 size-[40%] rounded-full border-2 border-amber-300/70 bg-amber-300/30"
              style={{
                transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
              }}
            />
          </div>
        )}

        {/* 靠近可交互对象时的浮动提示 */}
        {(nearNpc || nearPortal) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[178px] z-20 flex justify-center px-3 sm:bottom-[146px]">
            <button
              type="button"
              className="pointer-events-auto flex animate-[prompt-breathe_1.5s_ease-in-out_infinite] items-center gap-2 rounded-full border-2 border-amber-400/70 bg-slate-950/90 px-3 py-1.5 text-[11px] font-bold text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.28)] active:scale-95"
              onClick={() => {
                if (nearNpc) openNpc(nearNpc);
                else if (nearPortal) void enterPortal(nearPortal);
              }}
            >
              <span className="flex size-5 items-center justify-center rounded border border-amber-300/80 bg-amber-400/20 text-[10px] font-black text-amber-200">
                {isTouch ? "点" : "F"}
              </span>
              {nearNpc
                ? `与 ${nearNpc.name} 对话`
                : nearPortal?.target === "world"
                  ? "离开副本"
                  : `进入 ${nearPortal?.label ?? "副本"}`}
            </button>
          </div>
        )}

        {/* 底部技能栏与队伍，叠加在画面底部 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 animate-[hud-rise_420ms_cubic-bezier(0.22,1,0.36,1)_both] bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-10">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1">
            {skills.map((id, index) => {
              const skill = SKILLS[id];
              const locked = myLevel < skill.level;
              const remaining = Math.max(0, (cdReadyRef.current[id] ?? 0) - nowTick);
              const cooling = remaining > 0;
              const autoOn = ui.autoCastAll || !!ui.autoSkills[id];
              const readyFlashing =
                !cooling && !locked && nowTick - (skillReadyRef.current[id] ?? 0) < 650;
              return (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    btn,
                    "relative w-[78px] select-none justify-center overflow-hidden bg-slate-900/85 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400/60 sm:w-[124px]",
                    skillButtonSize,
                    autoOn &&
                      "border-amber-400 bg-amber-500/20 text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.45)]",
                    (locked || cooling) && "opacity-60",
                    readyFlashing && "animate-[skill-ready_650ms_ease-out] border-sky-400/90",
                    !locked && !cooling && "hover:border-sky-400/60 active:scale-[0.96]"
                  )}
                  onPointerDown={() => startSkillLongPress(id)}
                  onPointerUp={cancelSkillLongPress}
                  onPointerLeave={cancelSkillLongPress}
                  onPointerCancel={cancelSkillLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    if (self?.dead) return;
                    void doSkill(index);
                  }}
                  title={`${skill.desc}（长按切换自动施放）`}
                >
                  <span
                    className="inline-flex size-4 shrink-0 items-center justify-center rounded border text-[9px] font-black"
                    style={{
                      color: skillTone(id),
                      borderColor: `${skillTone(id)}99`,
                      backgroundColor: `${skillTone(id)}18`,
                    }}
                  >
                    {skill.key ?? SKILL_KEYS[index]}
                  </span>
                  <span>{skill.icon}</span>
                  {locked ? (
                    <span className="hidden text-[10px] font-normal text-slate-400 sm:inline">
                      Lv.{skill.level}
                    </span>
                  ) : (
                    <span className="hidden min-w-0 truncate sm:inline">{skill.name}</span>
                  )}
                  {autoOn && (
                    <span className="absolute right-0 top-0 rounded-bl bg-amber-400 px-1 text-[8px] font-black text-slate-950">
                      A
                    </span>
                  )}
                  {cooling && (
                    <>
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/55 text-[11px] font-black tabular-nums text-sky-200">
                        {Math.ceil(remaining / 1000)}
                      </span>
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-slate-950/60">
                        <span
                          className="block h-full bg-sky-400/80 transition-[width] duration-100 ease-linear"
                          style={{
                            width: `${Math.max(
                              0,
                              100 - (remaining / ((skill.cooldown ?? 5) * 1000)) * 100
                            )}%`,
                          }}
                        />
                      </span>
                    </>
                  )}
                </button>
              );
            })}

            {room !== "world" && (
              <button
                type="button"
                className={cn(btn, "border-emerald-500/60 bg-emerald-500/10 text-emerald-200")}
                onClick={() => void leaveDungeon()}
              >
                🚪 离开副本
              </button>
            )}
          </div>

          <div className="pointer-events-auto mt-1 grid grid-cols-5 gap-1 sm:flex sm:flex-wrap sm:items-center">
            <button
              type="button"
              className={cn(btn, "bg-slate-900/85")}
              onClick={() => setPanel("character")}
            >
              🧙 角色
            </button>
            <button
              type="button"
              className={cn(btn, "bg-slate-900/85")}
              onClick={() => setPanel("bag")}
            >
              🎒 背包
            </button>
            <button
              type="button"
              className={cn(btn, "bg-slate-900/85")}
              onClick={() => setPanel("skills")}
            >
              ⚡ 技能
            </button>
            <button
              type="button"
              className={cn(btn, "bg-slate-900/85")}
              onClick={() => setPanel("shop")}
            >
              🛒 商店
            </button>
            <button
              type="button"
              className={cn(btn, "bg-slate-900/85")}
              onClick={cycleTarget}
              title="切换锁定目标（Tab）"
            >
              🎯 目标
            </button>
            <button
              type="button"
              className={cn(
                btn,
                "bg-slate-900/85",
                quests.length > 0 && "border-amber-500/60 text-amber-300"
              )}
              onClick={() => setQuestOpen((open) => !open)}
            >
              📜 任务
            </button>
            <button
              type="button"
              className={cn(btn, "bg-slate-900/85")}
              disabled={recallReadyAt > Date.now()}
              onClick={doRecall}
              title="回城（B），20 秒冷却"
            >
              🏠 回城
            </button>
            <button
              type="button"
              className={cn(
                btn,
                "bg-slate-900/85",
                potionOpen && "border-amber-500 bg-amber-500/20 text-amber-300"
              )}
              disabled={potionItems.length === 0}
              onClick={() => setPotionOpen((open) => !open)}
              title="使用背包药水"
            >
              🧪 药水
              {potionItems.length > 0 && (
                <span className="ml-1 text-[10px] font-normal text-slate-400">
                  {potionItems.reduce((sum, entry) => sum + entry.count, 0)}
                </span>
              )}
            </button>
            <button
              type="button"
              className={cn(btn, "bg-slate-900/85")}
              onClick={() => {
                leaveWorld();
                toast.success("已退出世界，可在角色列表切换角色");
              }}
              title="退出世界并切换角色"
            >
              👥 换角色
            </button>
            <span className="ml-auto hidden text-[10px] text-slate-500 sm:inline">
              自动攻击 · 长按技能开启自动施放 · Tab 目标 · F 交互 · B 回城
            </span>
          </div>

          {potionOpen && potionItems.length > 0 && (
            <div className="pointer-events-auto mt-1 flex flex-wrap items-center gap-1">
              {potionItems.map(({ id, count, item }) => (
                <button
                  key={id}
                  type="button"
                  className={cn(btn, "bg-slate-900/85")}
                  onClick={() => drinkPotion(id)}
                  title={item.desc}
                >
                  {item.icon} {item.name}
                  <span className="ml-1 text-[10px] font-normal text-slate-400">
                    ×{count}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="pointer-events-auto mt-1 flex items-center gap-1 overflow-x-auto text-[10px] text-slate-400">
            <Users className="size-3.5 shrink-0" />
            <span className="shrink-0">在线 {online} 人</span>
            <span
              className={cn(
                "shrink-0 rounded border px-1.5 py-0.5",
                daily.claimed
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              )}
            >
              🎯 每日击杀 {Math.min(daily.kills, DAILY_GOAL)}/{DAILY_GOAL}
              {daily.claimed ? " ✓" : ""}
            </span>
            {streak >= 2 && nowTick < streakUntilRef.current && (
              <span className="shrink-0 rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 font-bold text-orange-300">
                🔥 连杀 x{streak}
              </span>
            )}
            {party.map((player) => (
              <span
                key={player.id}
                className="flex shrink-0 items-center gap-1 rounded border border-slate-700 bg-slate-900/80 px-1.5 py-0.5"
              >
                {CLASSES[player.classId].icon} {player.name} Lv.{player.level}
                <span className="h-1 w-10 overflow-hidden rounded bg-slate-700">
                  <span
                    className={cn(
                      "block h-full rounded transition-[width] duration-300 ease-out",
                      player.hp / player.maxHp < 0.35
                        ? "bg-rose-500"
                        : player.hp / player.maxHp < 0.65
                          ? "bg-amber-400"
                          : "bg-emerald-500"
                    )}
                    style={{
                      width: `${Math.max(0, (player.hp / player.maxHp) * 100)}%`,
                    }}
                  />
                </span>
              </span>
            ))}
            {party.length === 0 && (
              <span className="hidden shrink-0 text-slate-600 sm:inline">暂无其他玩家，邀请好友一起打怪</span>
            )}
          </div>
        </div>

        {/* 界面与操作设置 */}
        {settingsOpen && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-3"
            onClick={() => setSettingsOpen(false)}
          >
            <div
              ref={settingsRef}
              className="max-h-[85%] w-full max-w-sm overflow-y-auto rounded-xl border-2 border-slate-600 bg-slate-950 p-3 text-slate-100 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">界面与操作设置</p>
                <button type="button" className={btn} onClick={() => setSettingsOpen(false)}>
                  <X className="size-3.5" />
                </button>
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-[11px] font-bold text-slate-300">移动摇杆位置</p>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    {(
                      [
                        { key: "left" as const, label: "左侧" },
                        { key: "right" as const, label: "右侧" },
                      ]
                    ).map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        className={cn(
                          btn,
                          ui.joystickSide === entry.key &&
                            "border-amber-500 bg-amber-500/20 text-amber-300"
                        )}
                        onClick={() => updateUi({ joystickSide: entry.key })}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-slate-300">按钮大小</p>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    {(
                      [
                        { key: "compact" as const, label: "紧凑" },
                        { key: "normal" as const, label: "标准" },
                        { key: "large" as const, label: "大" },
                      ]
                    ).map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        className={cn(
                          btn,
                          ui.scale === entry.key &&
                            "border-amber-500 bg-amber-500/20 text-amber-300"
                        )}
                        onClick={() => updateUi({ scale: entry.key })}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-slate-300">视野缩放</p>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    {(
                      [
                        { key: 0.82, label: "近" },
                        { key: 0.68, label: "标准" },
                        { key: 0.6, label: "远" },
                      ]
                    ).map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        className={cn(
                          btn,
                          Math.abs(ui.zoom - entry.key) < 0.01 &&
                            "border-amber-500 bg-amber-500/20 text-amber-300"
                        )}
                        onClick={() => updateUi({ zoom: entry.key })}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-300">技能自动施放</p>
                    <button
                      type="button"
                      className={cn(
                        btn,
                        ui.autoCastAll && "border-amber-500 bg-amber-500/20 text-amber-300"
                      )}
                      onClick={() => updateUi({ autoCastAll: !ui.autoCastAll })}
                    >
                      {ui.autoCastAll ? "全部自动：开" : "全部自动：关"}
                    </button>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    {skills.map((id, index) => {
                      const skill = SKILLS[id];
                      const on = !!ui.autoSkills[id];
                      return (
                        <button
                          key={id}
                          type="button"
                          className={cn(
                            btn,
                            on && "border-amber-500 bg-amber-500/20 text-amber-300"
                          )}
                          onClick={() => toggleAutoSkill(id)}
                        >
                          {skill.icon} {skill.key ?? SKILL_KEYS[index]} · {on ? "自动" : "手动"}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    自动施放只在附近有敌人时生效；也可以长按战斗界面的技能按钮快速切换。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NPC 对话 / 任务 */}
        {npcDialog && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4"
            onClick={() => setNpcDialog(null)}
          >
            <div
              ref={npcRef}
              className="max-h-[80%] w-full max-w-sm overflow-y-auto rounded-xl border-2 border-slate-600 bg-slate-950 p-4 text-slate-100 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{npcDialog.icon}</span>
                  <div>
                    <p className="text-sm font-bold">
                      {npcDialog.name}
                      <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                        {npcDialog.title}
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {npcDialog.role === "shop"
                        ? "商人"
                        : npcDialog.role === "equip"
                          ? "铁匠"
                          : "任务发布者"}
                    </p>
                  </div>
                </div>
                <button type="button" className={btn} onClick={() => setNpcDialog(null)}>
                  <X className="size-3.5" />
                </button>
              </div>

              {npcDialog.role === "shop" && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-slate-400">
                    药水、洛式装备都在这里，购买后可立即在背包中装备。
                  </p>
                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={() => {
                      setPanel("shop");
                      setNpcDialog(null);
                    }}
                  >
                    打开商店
                  </button>
                </div>
              )}

              {npcDialog.role === "equip" && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-slate-400">
                    打完副本的战利品可以直接在游戏内装备，无需离开世界。
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={() => {
                        setPanel("character");
                        setNpcDialog(null);
                      }}
                    >
                      角色与装备
                    </button>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => {
                        setPanel("bag");
                        setNpcDialog(null);
                      }}
                    >
                      打开背包
                    </button>
                  </div>
                </div>
              )}

              {npcDialog.role === "quest" && (
                <div className="mt-3 space-y-2">
                  {Object.values(QUESTS)
                    .filter((quest) => quest.npcId === npcDialog.id)
                    .map((quest) => {
                      const state = quests.find((entry) => entry.id === quest.id);
                      const active = state?.status === "active";
                      const complete = state?.status === "complete";
                      const done = state?.status === "turnedIn";
                      const locked = myLevel < (quest.requireLevel ?? 1);
                      return (
                        <div
                          key={quest.id}
                          className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5"
                        >
                          <p className="flex items-center justify-between text-[11px] font-bold text-slate-100">
                            {quest.title}
                            <span className="text-[10px] font-normal text-amber-300">
                              {state ? questStatusLabel(state.status) : `${quest.reward.gold} 金币`}
                            </span>
                          </p>
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                            {quest.desc}
                          </p>
                          {state && (
                            <div className="mt-1.5">
                              <div className="flex items-center justify-between text-[10px] text-slate-500">
                                <span>进度</span>
                                <span>
                                  {state.progress} / {state.goal}
                                </span>
                              </div>
                              <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-slate-800">
                                <div
                                  className="h-full rounded bg-amber-400"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      (state.progress / Math.max(1, state.goal)) * 100
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          <div className="mt-2">
                            {done ? (
                              <span className="text-[10px] text-emerald-400">✓ 已完成</span>
                            ) : complete ? (
                              <button
                                type="button"
                                className={btnPrimary}
                                onClick={() => void turnInQuestById(quest.id)}
                              >
                                交付任务
                              </button>
                            ) : active ? (
                              <span className="text-[10px] text-slate-500">任务进行中</span>
                            ) : (
                              <button
                                type="button"
                                className={btnPrimary}
                                disabled={locked}
                                onClick={() => void acceptQuestById(quest.id)}
                              >
                                {locked ? `需 Lv.${quest.requireLevel}` : "接取任务"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {Object.values(QUESTS).filter((quest) => quest.npcId === npcDialog.id)
                    .length === 0 && (
                    <p className="text-[11px] text-slate-500">暂时没有可接的任务。</p>
                  )}
                </div>
              )}
              <div className="pointer-events-none sticky inset-x-0 -bottom-4 -mx-4 -mb-4 h-7 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
            </div>
          </div>
        )}

        {/* 任务日志 */}
        {questOpen && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4"
            onClick={() => setQuestOpen(false)}
          >
            <div
              ref={questRef}
              className="max-h-[80%] w-full max-w-sm overflow-y-auto rounded-xl border-2 border-slate-600 bg-slate-950 p-4 text-slate-100 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">任务日志</p>
                <button type="button" className={btn} onClick={() => setQuestOpen(false)}>
                  <X className="size-3.5" />
                </button>
              </div>
              {quests.length === 0 ? (
                <p className="mt-3 text-[11px] text-slate-500">
                  还没有任务，去村庄找头顶「!」的 NPC 接取吧。
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {quests.map((state) => {
                    const def = QUESTS[state.id];
                    if (!def) return null;
                    return (
                      <li
                        key={state.id}
                        className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5"
                      >
                        <p className="flex items-center justify-between text-[11px] font-bold">
                          {def.title}
                          <span
                            className={cn(
                              "text-[10px] font-normal",
                              state.status === "turnedIn"
                                ? "text-emerald-400"
                                : state.status === "complete"
                                  ? "text-amber-300"
                                  : "text-slate-500"
                            )}
                          >
                            {questStatusLabel(state.status)}
                          </span>
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">{def.desc}</p>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                          <span>进度</span>
                          <span>
                            {state.progress} / {state.goal}
                          </span>
                        </div>
                        <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-slate-800">
                          <div
                            className="h-full rounded bg-amber-400"
                            style={{
                              width: `${Math.min(
                                100,
                                (state.progress / Math.max(1, state.goal)) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="pointer-events-none sticky inset-x-0 -bottom-4 -mx-4 -mb-4 h-7 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
            </div>
          </div>
        )}

        {/* 游戏内面板：角色 / 背包 / 技能 / 商店 */}
        {panel && save && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-3"
            onClick={() => setPanel(null)}
          >
            <div
              ref={panelRef}
              className="max-h-[88%] w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl border-2 border-slate-600 bg-slate-950 p-3 text-slate-100 shadow-2xl sm:max-w-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-1">
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { key: "character" as const, label: "角色" },
                      { key: "bag" as const, label: "背包" },
                      { key: "skills" as const, label: "技能" },
                      { key: "shop" as const, label: "商店" },
                    ] as const
                  ).map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => setPanel(entry.key)}
                      className={cn(
                        btn,
                        panel === entry.key &&
                          "border-amber-500 bg-amber-500/20 text-amber-300"
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                <button type="button" className={btn} onClick={() => setPanel(null)}>
                  <X className="size-3.5" />
                </button>
              </div>
              {panel === "character" && (
                <CharacterPanel save={save} onChange={applySave} notify={toastNotify} />
              )}
              {panel === "bag" && (
                <BagPanel save={save} onChange={applySave} notify={toastNotify} />
              )}
              {panel === "skills" && (
                <SkillsPanel save={save} onChange={applySave} notify={toastNotify} />
              )}
              {panel === "shop" && (
                <ShopPanel save={save} onChange={applySave} notify={toastNotify} />
              )}
              <div className="pointer-events-none sticky inset-x-0 -bottom-3 -mx-3 -mb-3 h-6 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
            </div>
          </div>
        )}

        {self?.dead && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/60">
            <span className="text-2xl">💀</span>
            <span className="animate-pulse text-sm font-bold text-red-300">
              你被击败了，3 秒后复活…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function toastNotify(message: string) {
  toast(message);
}

/** 弹窗打开（或切换页签）时的缩放 + 透明度缓动 */
function usePopIn<T extends HTMLElement>(trigger: unknown) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.94, y: 12 },
      { opacity: 1, scale: 1, y: 0, duration: 0.26, ease: "back.out(1.6)" }
    );
  }, [trigger]);
  return ref;
}
