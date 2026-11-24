"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Coins,
  LogOut,
  Maximize2,
  Minimize2,
  Music2,
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
  createSave,
  effectiveStats,
  expToNext,
  gainExp,
  loadSave,
  MAX_LEVEL,
  persistSave,
  removeItem,
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
  type RenderParticle,
  type RenderSnapshot,
  type SkillEffect,
} from "@/lib/world/render";
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

const btn =
  "rounded border-2 border-slate-600 bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-100 transition-colors hover:bg-slate-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";
const btnPrimary =
  "rounded border-2 border-amber-500 bg-amber-500/20 px-3 py-1.5 text-[11px] font-bold text-amber-300 transition-colors hover:bg-amber-500/30 active:translate-y-px";

type Self = {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  dead: boolean;
  kills: number;
};

type PanelKind = "character" | "bag" | "skills" | "shop";

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

  const [createName, setCreateName] = useState("");
  const [createClass, setCreateClass] = useState<ClassId>("warrior");

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

  const fullscreen = nativeFullscreen || pseudoFullscreen;

  useEffect(() => {
    const stored = loadSave();
    saveRef.current = stored;
    setSave(stored);
    setPhase(stored ? "lobby" : "create");
    setCreateName(stored?.name ?? "");
    setCreateClass(stored?.classId ?? "warrior");
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
    const progress = loadDaily();
    dailyRef.current = progress;
    setDaily(progress);
  }, []);

  // 全屏状态同步
  useEffect(() => {
    const onChange = () => setNativeFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // 面板/对话打开时屏蔽快捷键
  useEffect(() => {
    uiOpenRef.current = !!(panel || npcDialog || questOpen);
  }, [panel, npcDialog, questOpen]);

  // 冷却与倒计时刷新
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [phase]);

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
      quests: current.quests,
      room: roomRef.current,
    };
  }

  /** 本地存档变更（装备/背包/商店）后持久化并同步到服务器 */
  function applySave(next: GameSave) {
    saveRef.current = next;
    setSave(next);
    persistSave(next);
    post({ t: "sync", player: joinPayload(next) });
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
    persistSave(next);

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
    persistSave(next);
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
        effectsRef.current.push({
          id: effectSeqRef.current,
          x: event.x,
          y: event.y,
          skillId: event.skillId ?? "",
          at: now,
        });
        if (effectsRef.current.length > 24) effectsRef.current.shift();
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
        particlesRef.current.push({
          x: event.x,
          y: event.y,
          text: event.kind === "heal" ? `+${event.value}` : `-${event.value}`,
          color:
            event.kind === "heal"
              ? "#4ade80"
              : event.kind === "hurt"
                ? "#f87171"
                : event.crit
                  ? "#facc15"
                  : "#fda4af",
          size: event.kind === "damage" && event.crit ? 18 : 13,
          life: 900,
          maxLife: 900,
        });
        if (particlesRef.current.length > 40) particlesRef.current.shift();
      }

      switch (event.kind) {
        case "damage":
          // 只播放自己造成的攻击音效，避免多人混战噪音
          if (event.from === myId) sfx("attack");
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
            sfx("skill");
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
          mp: me.mp,
          maxMp: me.maxMp,
          dead: me.dead,
          kills: me.kills,
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
      mp: message.player.mp,
      maxMp: message.player.maxMp,
      dead: false,
      kills: selfRef.current?.kills ?? 0,
    };
    selfRef.current = nextSelf;
    setSelf(nextSelf);
    setStatus("online");
    setPhase("playing");
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

        drawWorld(canvas, {
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
          snapshot: visual,
          swings: swingsRef.current,
          flashes: flashesRef.current,
          moving: movingRef.current,
          effects: effectsRef.current,
          particles,
          time: now,
        });
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
      const dpr = Math.min(2, window.devicePixelRatio || 1);
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

  async function doSkill(index: number) {
    const current = saveRef.current;
    const selfNow = selfRef.current;
    if (!current || !selfNow) return;
    const skillId = CLASS_SKILLS[current.classId][index];
    if (!skillId) return;
    const skill = SKILLS[skillId];
    if (current.level < skill.level) {
      toast.error(`Lv.${skill.level} 解锁该技能`);
      return;
    }
    if (selfNow.dead) return;
    if (selfNow.mp < skill.mp) {
      toast.error("法力不足");
      return;
    }
    const now = Date.now();
    if (now < (cdReadyRef.current[skillId] ?? 0)) return;

    // 乐观冷却，服务端返回失败时回滚
    cdReadyRef.current[skillId] = now + (skill.cooldown ?? 5) * 1000;
    setNowTick(now);
    swingsRef.current[myIdRef.current] = performance.now();
    sfx("skill");

    const input = inputRef.current;
    const result = await postAction({
      t: "skill",
      skillId,
      dirX: input.x,
      dirY: input.y,
    });
    if (!result) return;
    if (result.ok === false) {
      cdReadyRef.current[skillId] = 0;
      setNowTick(Date.now());
      if (result.message) toast.error(result.message);
    }
  }

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
        mp: Math.round(selfNow.mp),
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
    if (item.hp && !item.mp && selfNow.hp >= selfNow.maxHp) {
      toast.error("生命已满");
      return;
    }
    if (item.mp && !item.hp && selfNow.mp >= selfNow.maxMp) {
      toast.error("魔法已满");
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
            共享像素冒险存档 · 无需登录 · 与同服玩家实时组队
          </p>
        </div>
        <input
          value={createName}
          onChange={(event) => setCreateName(event.target.value.slice(0, 12))}
          placeholder="冒险者"
          className="w-full rounded border-2 border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-500"
        />
        <div className="grid gap-2 sm:grid-cols-2">
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
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{item.desc}</p>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="text-[10px] text-slate-500 hover:text-slate-300">
            返回首页
          </Link>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              const next = createSave(createName, createClass);
              saveRef.current = next;
              setSave(next);
              persistSave(next);
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
              开放世界与副本共用同一套实时战斗，副本从世界中的传送门进入
            </p>
          </div>
          <Link href="/" className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300">
            首页
          </Link>
        </div>

        {current && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
            <span className="text-3xl">{CLASSES[current.classId].icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold">
                {current.name}
                <span className="ml-1.5 text-amber-300">Lv.{current.level}</span>
                <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                  {CLASSES[current.classId].name}
                </span>
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                已通关 {current.cleared.length} 个副本 · 胜场 {current.wins}
              </p>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-300">
              <Coins className="size-3.5" />
              {current.gold}
            </span>
          </div>
        )}

        <ul className="space-y-1 text-[11px] leading-relaxed text-slate-400">
          <li>· 移动：WASD / 方向键，移动端使用左下角虚拟摇杆</li>
          <li>· 战斗：靠近怪物自动攻击，QWER 技能栏（键盘 1-4 / Q E R）</li>
          <li>· 交互：靠近 NPC 或传送门后按 F，进入副本、接取任务、买卖装备</li>
          <li>· 背包、装备、技能、商店都可在游戏内直接打开，无需切换页面</li>
          <li>· 弱网环境下会自动断线重连，关键操作会重试以避免丢失</li>
        </ul>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={() => void enterWorld()}>
            {status === "connecting" ? "连接中…" : "进入世界"}
          </button>
          {current && (
            <button
              type="button"
              className={btn}
              onClick={() => {
                const next = createSave(createName || current.name, createClass);
                saveRef.current = next;
                setSave(next);
                persistSave(next);
                toast.success("已创建新角色");
              }}
            >
              新建角色
            </button>
          )}
        </div>
      </div>
    );
  }

  const skills = save ? CLASS_SKILLS[save.classId] : [];
  const potionItems = save
    ? Object.entries(save.inventory)
        .filter(([id, count]) => count > 0 && ITEMS[id]?.kind === "consumable")
        .map(([id, count]) => ({ id, count, item: ITEMS[id] }))
    : [];
  const hpPercent = self ? Math.max(0, (self.hp / self.maxHp) * 100) : 100;
  const mpPercent = self ? Math.max(0, (self.mp / self.maxMp) * 100) : 100;
  const expNeed = save ? expToNext(save.level) : 1;
  const expPercent = save
    ? save.level >= MAX_LEVEL
      ? 100
      : Math.min(100, (save.exp / expNeed) * 100)
    : 0;
  const roomName = ROOMS[room].name;
  const myLevel = self?.level ?? save?.level ?? 1;

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
        style={{ height: fullscreen ? "100dvh" : isTouch ? 420 : 480 }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />

        {/* 低血量红色边缘警示 */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-[5] transition-opacity duration-500",
            self && self.hp > 0 && self.hp / self.maxHp < 0.3
              ? "opacity-100"
              : "opacity-0"
          )}
          style={{ boxShadow: "inset 0 0 60px 18px rgba(239,68,68,0.45)" }}
        />

        {/* 顶部 HUD 浮层 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-slate-950/90 via-slate-950/60 to-transparent px-2 pb-10 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-center justify-between gap-2">
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-left"
              onClick={() => setPanel("character")}
              title="查看角色与装备"
            >
              <span className="text-xl">{save ? CLASSES[save.classId].icon : "🧙"}</span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold">
                  {save?.name ?? "冒险者"}
                  <span className="ml-1.5 text-amber-300">Lv.{myLevel}</span>
                </p>
                <p className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      status === "online" ? "bg-emerald-400" : "bg-amber-400"
                    )}
                  />
                  {roomName} · 在线 {online} 人 · 击杀 {self?.kills ?? 0}
                </p>
              </div>
            </button>
            <div className="flex items-center gap-1">
              <span className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300">
                <Coins className="size-3" />
                {save?.gold ?? 0}
              </span>
              <button type="button" className={btn} title="背景音乐" onClick={toggleBgm}>
                <Music2 className={cn("size-3.5", bgmOn ? "text-emerald-400" : "text-slate-500")} />
              </button>
              <button type="button" className={btn} title="音效" onClick={toggleSound}>
                {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5 text-slate-500" />}
              </button>
              <button
                type="button"
                className={btn}
                title={fullscreen ? "退出全屏" : "全屏"}
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </button>
              <button type="button" className={btn} title="离开世界" onClick={leaveWorld}>
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-300">
                <span>HP</span>
                <span>
                  {self?.hp ?? 0} / {self?.maxHp ?? 0}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-slate-800/80">
                <div
                  className="h-full rounded bg-gradient-to-r from-red-500 to-rose-400"
                  style={{ width: `${hpPercent}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-300">
                <span>MP</span>
                <span>
                  {self?.mp ?? 0} / {self?.maxMp ?? 0}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-slate-800/80">
                <div
                  className="h-full rounded bg-gradient-to-r from-sky-500 to-cyan-400"
                  style={{ width: `${mpPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-1.5 h-1 overflow-hidden rounded bg-slate-800/70">
            <div
              className="h-full rounded bg-violet-400"
              style={{ width: `${expPercent}%` }}
            />
          </div>
        </div>

        {/* 弱网提示 */}
        {status !== "online" && (
          <div className="pointer-events-none absolute left-1/2 top-28 z-20 -translate-x-1/2 rounded-full border border-amber-500/50 bg-slate-950/90 px-3 py-1 text-[10px] font-bold text-amber-300">
            网络不稳定，正在自动重连…
          </div>
        )}

        {/* 移动端虚拟摇杆，叠加在画面上 */}
        {isTouch && (
          <div
            data-testid="joystick"
            className="absolute bottom-32 left-4 z-20 size-24 touch-none rounded-full border-2 border-white/20 bg-slate-950/40 backdrop-blur-sm"
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
            <span className="pointer-events-none absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 size-10 rounded-full border-2 border-amber-300/70 bg-amber-300/30"
              style={{
                transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
              }}
            />
          </div>
        )}

        {/* 底部技能栏与队伍，叠加在画面底部 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-10">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1">
            {skills.map((id, index) => {
              const skill = SKILLS[id];
              const locked = myLevel < skill.level;
              const noMp = (self?.mp ?? 0) < skill.mp;
              const remaining = Math.max(0, (cdReadyRef.current[id] ?? 0) - nowTick);
              const cooling = remaining > 0;
              return (
                <button
                  key={id}
                  type="button"
                  className={cn(btn, "relative overflow-hidden bg-slate-900/85")}
                  disabled={locked || noMp || cooling || !!self?.dead}
                  onClick={() => void doSkill(index)}
                  title={skill.desc}
                >
                  <span className="mr-1 inline-flex size-4 items-center justify-center rounded border border-slate-500 text-[9px] font-black text-amber-300">
                    {skill.key ?? SKILL_KEYS[index]}
                  </span>
                  <span className="mr-0.5">{skill.icon}</span>
                  <span className="hidden sm:inline">{skill.name}</span>
                  <span className="ml-1 text-[10px] font-normal text-slate-400">
                    {locked
                      ? `Lv.${skill.level}`
                      : cooling
                        ? `${Math.ceil(remaining / 1000)}s`
                        : `${skill.mp}MP`}
                  </span>
                  {cooling && (
                    <span
                      className="pointer-events-none absolute inset-0 bg-slate-950/60"
                      style={{
                        opacity: Math.min(
                          0.25,
                          0.25 * (remaining / ((skill.cooldown ?? 5) * 1000))
                        ),
                      }}
                    />
                  )}
                </button>
              );
            })}

            {/* 交互按钮 */}
            {nearPortal && (
              <button
                type="button"
                className={cn(btn, "border-sky-500/70 bg-sky-500/15 text-sky-200")}
                onClick={() => void enterPortal(nearPortal)}
              >
                {nearPortal.target === "world"
                  ? "🚪 离开副本"
                  : `🌀 进入${nearPortal.label}`}
              </button>
            )}
            {nearNpc && (
              <button
                type="button"
                className={cn(btn, "border-amber-500/70 bg-amber-500/15 text-amber-200")}
                onClick={() => openNpc(nearNpc)}
              >
                💬 {nearNpc.name}
              </button>
            )}
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

          <div className="pointer-events-auto mt-1 flex flex-wrap items-center gap-1">
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
            <span className="ml-auto hidden text-[10px] text-slate-500 sm:inline">
              自动攻击 · QWER 技能 · F 交互 · B 回城
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
            <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
              🎯 每日击杀 {Math.min(daily.kills, DAILY_GOAL)}/{DAILY_GOAL}
              {daily.claimed ? " ✓" : ""}
            </span>
            {party.map((player) => (
              <span
                key={player.id}
                className="flex shrink-0 items-center gap-1 rounded border border-slate-700 bg-slate-900/80 px-1.5 py-0.5"
              >
                {CLASSES[player.classId].icon} {player.name} Lv.{player.level}
                <span className="h-1 w-10 overflow-hidden rounded bg-slate-700">
                  <span
                    className="block h-full rounded bg-red-500"
                    style={{
                      width: `${Math.max(0, (player.hp / player.maxHp) * 100)}%`,
                    }}
                  />
                </span>
              </span>
            ))}
            {party.length === 0 && (
              <span className="shrink-0 text-slate-600">暂无其他玩家，邀请好友一起打怪</span>
            )}
          </div>
        </div>

        {/* NPC 对话 / 任务 */}
        {npcDialog && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4"
            onClick={() => setNpcDialog(null)}
          >
            <div
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
              className="max-h-[88%] w-full max-w-lg overflow-y-auto rounded-xl border-2 border-slate-600 bg-slate-950 p-3 text-slate-100 shadow-2xl"
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
              {panel === "skills" && <SkillsPanel save={save} />}
              {panel === "shop" && (
                <ShopPanel save={save} onChange={applySave} notify={toastNotify} />
              )}
            </div>
          </div>
        )}

        {self?.dead && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 text-sm font-bold text-red-300">
            你被击败了，3 秒后复活…
          </div>
        )}
      </div>
    </div>
  );
}

function toastNotify(message: string) {
  toast(message);
}
