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
} from "lucide-react";
import { toast } from "sonner";

import { CLASSES, CLASS_SKILLS, ITEMS, SKILLS } from "@/lib/game/data";
import {
  createSave,
  effectiveStats,
  expToNext,
  gainExp,
  loadSave,
  MAX_LEVEL,
  persistSave,
  removeItem,
} from "@/lib/game/engine";
import type { ClassId, GameSave } from "@/lib/game/types";
import { initAudio, playSfx, startBgm, stopBgm } from "@/lib/world/audio";
import {
  drawWorld,
  type RenderParticle,
  type RenderSnapshot,
  type SkillEffect,
} from "@/lib/world/render";
import { isBlockedAt, TILE, WORLD_H, WORLD_W } from "@/lib/world/terrain";
import type { WorldSnapshot } from "@/lib/world/state";
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
const SKILL_KEYS = ["1", "2", "3", "4"];

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
  const [bgmOn, setBgmOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [isTouch, setIsTouch] = useState(false);
  const [skillCd, setSkillCd] = useState(false);
  const [recallReadyAt, setRecallReadyAt] = useState(0);
  const [potionOpen, setPotionOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [daily, setDaily] = useState<DailyProgress>({
    date: "",
    kills: 0,
    claimed: false,
  });
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const [createName, setCreateName] = useState("");
  const [createClass, setCreateClass] = useState<ClassId>("warrior");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const moveVecRef = useRef({ x: 0, y: 0 });
  const snapshotRef = useRef<WorldSnapshot | null>(null);
  const meRef = useRef({ x: 0, y: 0, dir: 1 as 1 | -1 });
  const keysRef = useRef(new Set<string>());
  const myIdRef = useRef("");
  const lastSeqRef = useRef(0);
  const particlesRef = useRef<RenderParticle[]>([]);
  const saveRef = useRef<GameSave | null>(null);
  const selfRef = useRef<Self | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const rafRef = useRef(0);
  const lastSendRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastHudRef = useRef(0);
  const lastAttackRef = useRef(0);
  const lastSkillRef = useRef(0);
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

  // 卸载时离开世界
  useEffect(() => {
    return () => {
      sseRef.current?.close();
      cancelAnimationFrame(rafRef.current);
      stopBgm();
      if (myIdRef.current) {
        fetch("/api/world/act", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: myIdRef.current,
            type: "leave",
          }),
          keepalive: true,
        }).catch(() => undefined);
      }
    };
  }, []);

  function sfx(kind: Parameters<typeof playSfx>[0]) {
    if (soundRef.current) playSfx(kind);
  }

  function post(payload: Record<string, unknown>) {
    const clientId = myIdRef.current;
    if (!clientId) return;
    fetch("/api/world/act", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ...payload }),
    }).catch(() => undefined);
  }

  function applyReward(exp: number, gold: number) {
    const current = saveRef.current;
    if (!current) return;
    let next: GameSave = { ...current, gold: current.gold + gold };
    const result = gainExp(next, exp);
    next = result.save;
    saveRef.current = next;
    setSave(next);
    persistSave(next);

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
      const stats = effectiveStats(next);
      post({
        type: "sync",
        player: {
          name: next.name,
          classId: next.classId,
          level: next.level,
          maxHp: stats.maxHp,
          maxMp: stats.maxMp,
          atk: stats.atk,
          def: stats.def,
          crit: stats.crit,
          weapon: next.equipment.weapon,
          armor: next.equipment.armor,
          potions: potionStock(next),
        },
        restoreHp: true,
      });
    }
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
            applyReward(event.exp ?? 0, event.gold ?? 0);
            recordKill();
          }
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

  function openStream(clientId: string) {
    sseRef.current?.close();
    const source = new EventSource(`/api/world/stream?clientId=${clientId}`);
    sseRef.current = source;
    source.onopen = () => {
      setStatus("online");
      // 断线重连后服务器可能已移除该玩家，重新加入以恢复可见与操作
      void rejoinWorld();
    };
    source.onerror = () => setStatus("offline");
    source.onmessage = (event) => {
      try {
        handleSnapshot(JSON.parse(event.data) as WorldSnapshot);
      } catch {
        // 忽略非 JSON 帧
      }
    };
  }

  async function rejoinWorld() {
    const current = saveRef.current;
    const clientId = myIdRef.current;
    if (!current || !clientId) return;
    const stats = effectiveStats(current);
    try {
      const response = await fetch("/api/world/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          name: current.name,
          classId: current.classId,
          level: current.level,
          maxHp: stats.maxHp,
          maxMp: stats.maxMp,
          atk: stats.atk,
          def: stats.def,
          crit: stats.crit,
          weapon: current.equipment.weapon,
          armor: current.equipment.armor,
          potions: potionStock(current),
        }),
      });
      if (!response.ok) return;
      const data = await response.json();
      const me = meRef.current;
      // 被服务器移除后重建会回到出生点，差距过大时同步本地位置
      if (
        data?.player &&
        Math.hypot(data.player.x - me.x, data.player.y - me.y) > 220
      ) {
        me.x = data.player.x;
        me.y = data.player.y;
        lastPosRef.current = { x: 0, y: 0, at: 0 };
      }
    } catch {
      // 网络异常时等待下一次自动重连
    }
  }

  async function enterWorld() {
    const current = saveRef.current;
    if (!current) return;
    initAudio();
    startBgm();
    setBgmOn(true);
    setStatus("connecting");

    const clientId = getClientId();
    const stats = effectiveStats(current);

    try {
      const response = await fetch("/api/world/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          name: current.name,
          classId: current.classId,
          level: current.level,
          maxHp: stats.maxHp,
          maxMp: stats.maxMp,
          atk: stats.atk,
          def: stats.def,
          crit: stats.crit,
          weapon: current.equipment.weapon,
          armor: current.equipment.armor,
          potions: potionStock(current),
        }),
      });
      if (!response.ok) throw new Error("join failed");
      const data = await response.json();

      myIdRef.current = clientId;
      lastSeqRef.current = data.eventSeq;
      if (data.info?.spawn) {
        spawnRef.current = data.info.spawn;
      }
      meRef.current = { x: data.player.x, y: data.player.y, dir: 1 };
      lastPosRef.current = { x: 0, y: 0, at: 0 };
      particlesRef.current = [];

      const nextSelf: Self = {
        id: clientId,
        name: current.name,
        level: current.level,
        hp: data.player.hp,
        maxHp: data.player.maxHp,
        mp: data.player.mp,
        maxMp: data.player.maxMp,
        dead: false,
        kills: 0,
      };
      selfRef.current = nextSelf;
      setSelf(nextSelf);
      setPhase("playing");
      openStream(clientId);
    } catch {
      toast.error("连接世界失败，请稍后重试");
      setStatus("offline");
    }
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

      const me = meRef.current;
      const selfNow = selfRef.current;
      if ((ix !== 0 || iy !== 0) && !selfNow?.dead) {
        const length = Math.hypot(ix, iy) || 1;
        const nx = me.x + (ix / length) * SPEED * dt;
        const ny = me.y + (iy / length) * SPEED * dt;
        if (!isBlockedAt(nx, me.y, 9)) me.x = nx;
        if (!isBlockedAt(me.x, ny, 9)) me.y = ny;
        me.x = Math.max(TILE, Math.min(WORLD_W * TILE - TILE, me.x));
        me.y = Math.max(TILE, Math.min(WORLD_H * TILE - TILE, me.y));
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
          post({ type: "move", x: Math.round(me.x), y: Math.round(me.y) });
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
          };
        }

        drawWorld(canvas, {
          width,
          height,
          meId: myIdRef.current,
          meX: me.x,
          meY: me.y,
          meName: selfNow?.name ?? saveRef.current?.name ?? "我",
          meHp: selfNow?.hp ?? 100,
          meMaxHp: selfNow?.maxHp ?? 100,
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

  function doAttack() {
    const now = performance.now();
    if (now - lastAttackRef.current < 420) return;
    lastAttackRef.current = now;
    swingsRef.current[myIdRef.current] = now;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(8);
    }
    sfx("attack");
    post({ type: "attack" });
  }

  function doSkill(index: number) {
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
    if (selfNow.mp < skill.mp) {
      toast.error("魔法不足");
      return;
    }
    const now = performance.now();
    if (now - lastSkillRef.current < 900) return;
    lastSkillRef.current = now;
    swingsRef.current[myIdRef.current] = now;
    setSkillCd(true);
    window.setTimeout(() => setSkillCd(false), 900);
    sfx("skill");
    post({ type: "skill", skillId });
  }

  // 键盘操作
  useEffect(() => {
    if (phase !== "playing") return;
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (MOVE_KEYS.has(key)) {
        keysRef.current.add(key);
        event.preventDefault();
        return;
      }
      if (event.repeat) return;
      if (key === "j" || key === " ") {
        event.preventDefault();
        doAttack();
        return;
      }
      if (key === "r") {
        event.preventDefault();
        doRecall();
        return;
      }
      const index = SKILL_KEYS.indexOf(key);
      if (index >= 0) {
        event.preventDefault();
        doSkill(index);
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
  }, [phase, save]);

  function leaveWorld() {
    post({ type: "leave" });
    myIdRef.current = "";
    sseRef.current?.close();
    sseRef.current = null;
    cancelAnimationFrame(rafRef.current);
    stopBgm();
    setBgmOn(false);
    setPhase("lobby");
    setStatus("idle");
    setSelf(null);
    setParty([]);
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
    post({ type: "recall" });
    meRef.current = {
      x: spawnRef.current.x,
      y: spawnRef.current.y,
      dir: meRef.current.dir,
    };
    lastPosRef.current = { x: 0, y: 0, at: 0 };
    recallReadyRef.current = now + 20_000;
    setRecallReadyAt(now + 20_000);
    window.setTimeout(() => {
      recallReadyRef.current = 0;
      setRecallReadyAt(0);
    }, 20_000);
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
    post({ type: "potion", itemId });
  }

  function toggleBgm() {
    if (bgmOn) {
      stopBgm();
      setBgmOn(false);
    } else {
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
          <Link href="/game" className="text-[10px] text-slate-500 hover:text-slate-300">
            返回单人副本
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
            <h2 className="text-sm font-bold">开放世界 · 实时组队</h2>
            <p className="mt-1 text-[10px] text-slate-500">
              进入同一世界的玩家会自动同屏协作，怪物由服务器统一刷新
            </p>
          </div>
          <Link href="/game" className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300">
            单人副本
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
          <li>· 攻击：J / 空格或右下角按钮；技能：数字键 1-4 或底部技能栏</li>
          <li>· 右上角可开启全屏，HUD 与操作区都叠加在画面上</li>
          <li>· 击杀经验与金币会写回角色存档，并实时显示伤害与音效</li>
        </ul>

        <button type="button" className={btnPrimary} onClick={() => void enterWorld()}>
          {status === "connecting" ? "连接中…" : "进入世界"}
        </button>
      </div>
    );
  }

  const skills = save ? CLASS_SKILLS[save.classId] : [];
  const profileStats = save ? effectiveStats(save) : null;
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
              onClick={() => setProfileOpen(true)}
              title="查看角色属性"
            >
              <span className="text-xl">{save ? CLASSES[save.classId].icon : "🧙"}</span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold">
                  {save?.name ?? "冒险者"}
                  <span className="ml-1.5 text-amber-300">
                    Lv.{self?.level ?? save?.level ?? 1}
                  </span>
                </p>
                <p className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      status === "online" ? "bg-emerald-400" : "bg-amber-400"
                    )}
                  />
                  在线 {online} 人 · 击杀 {self?.kills ?? 0}
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

        {/* 移动端虚拟摇杆，叠加在画面上 */}
        {isTouch && (
          <div
            data-testid="joystick"
            className="absolute bottom-24 left-4 z-20 size-24 touch-none rounded-full border-2 border-white/20 bg-slate-950/40 backdrop-blur-sm"
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

        {/* 移动端攻击按钮 */}
        {isTouch && (
          <button
            type="button"
            data-testid="attack"
            className="absolute bottom-24 right-4 z-20 flex size-16 touch-none items-center justify-center rounded-full border-2 border-amber-400/70 bg-amber-500/20 text-2xl backdrop-blur-sm transition-transform active:scale-95"
            onPointerDown={(event) => {
              event.preventDefault();
              doAttack();
            }}
          >
            ⚔️
          </button>
        )}

        {/* 底部技能栏与队伍，叠加在画面底部 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-10">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1">
            {skills.map((id, index) => {
              const skill = SKILLS[id];
              const locked = (self?.level ?? save?.level ?? 1) < skill.level;
              const noMp = (self?.mp ?? 0) < skill.mp;
              return (
                <button
                  key={id}
                  type="button"
                  className={cn(btn, "bg-slate-900/80")}
                  disabled={locked || noMp || skillCd}
                  onClick={() => doSkill(index)}
                  title={skill.desc}
                >
                  <span className="mr-0.5">{skill.icon}</span>
                  {skill.name}
                  <span className="ml-1 text-[10px] font-normal text-slate-400">
                    {locked ? `Lv.${skill.level}` : `${skill.mp}MP`}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className={cn(btn, "bg-slate-900/80")}
              disabled={recallReadyAt > Date.now()}
              onClick={doRecall}
              title="回城（R），20 秒冷却"
            >
              🏠 回城
            </button>
            <button
              type="button"
              className={cn(
                btn,
                "bg-slate-900/80",
                potionOpen && "border-amber-500 bg-amber-500/20 text-amber-300"
              )}
              disabled={potionItems.length === 0}
              onClick={() => setPotionOpen((open) => !open)}
              title="使用背包药水"
            >
              🎒 药水
              {potionItems.length > 0 && (
                <span className="ml-1 text-[10px] font-normal text-slate-400">
                  {potionItems.reduce((sum, entry) => sum + entry.count, 0)}
                </span>
              )}
            </button>
            <span className="ml-auto hidden text-[10px] text-slate-500 sm:inline">
              J 攻击 · 1-4 技能 · R 回城
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

        {profileOpen && save && profileStats && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4"
            onClick={() => setProfileOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border-2 border-slate-600 bg-slate-950 p-4 text-slate-100 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">
                  {save.name}
                  <span className="ml-1.5 text-amber-300">Lv.{save.level}</span>
                </p>
                <button
                  type="button"
                  className={btn}
                  onClick={() => setProfileOpen(false)}
                >
                  关闭
                </button>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {CLASSES[save.classId].name} · 击杀 {self?.kills ?? 0} · 金币{" "}
                {save.gold}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
                {[
                  { label: "攻击", value: Math.round(profileStats.atk) },
                  { label: "防御", value: Math.round(profileStats.def) },
                  { label: "速度", value: Math.round(profileStats.spd) },
                  { label: "暴击", value: `${Math.round(profileStats.crit)}%` },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded bg-slate-900 px-2 py-1"
                  >
                    <span className="text-slate-500">{row.label}</span>
                    <span className="font-bold">{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-1 text-[11px]">
                {[
                  { label: "武器", id: save.equipment.weapon },
                  { label: "护甲", id: save.equipment.armor },
                  { label: "饰品", id: save.equipment.accessory },
                ].map((slot) => {
                  const item = slot.id ? ITEMS[slot.id] : null;
                  return (
                    <div
                      key={slot.label}
                      className="flex items-center gap-2 rounded bg-slate-900/70 px-2 py-1"
                    >
                      <span className="w-8 shrink-0 text-slate-500">
                        {slot.label}
                      </span>
                      <span>{item?.icon ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {item?.name ?? "未装备"}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-500">
                        {item
                          ? [
                              item.atk ? `攻+${item.atk}` : "",
                              item.def ? `防+${item.def}` : "",
                              item.spd ? `速+${item.spd}` : "",
                              item.crit ? `暴+${item.crit}%` : "",
                            ]
                              .filter(Boolean)
                              .join(" ")
                          : ""}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>经验</span>
                  <span>
                    {save.level >= MAX_LEVEL
                      ? "已满级"
                      : `${save.exp} / ${expToNext(save.level)}`}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full rounded bg-violet-400"
                    style={{ width: `${expPercent}%` }}
                  />
                </div>
              </div>

              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                退出世界后可在「单人副本 → 角色」更换装备；世界内可直接使用药水与回城。
              </p>
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
