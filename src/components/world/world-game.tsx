"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Coins, LogOut, Music2, Users, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { CLASSES, CLASS_SKILLS, SKILLS } from "@/lib/game/data";
import {
  createSave,
  effectiveStats,
  gainExp,
  loadSave,
  persistSave,
} from "@/lib/game/engine";
import type { ClassId, GameSave } from "@/lib/game/types";
import { initAudio, playSfx, startBgm, stopBgm } from "@/lib/world/audio";
import {
  drawWorld,
  type RenderParticle,
  type RenderSnapshot,
} from "@/lib/world/render";
import { isBlockedAt, TILE, WORLD_H, WORLD_W } from "@/lib/world/terrain";
import type { WorldSnapshot } from "@/lib/world/state";
import { cn } from "@/lib/utils";

const CLIENT_KEY = "tf_world_client";
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

  const [createName, setCreateName] = useState("");
  const [createClass, setCreateClass] = useState<ClassId>("warrior");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
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
  const sizeRef = useRef({ width: 720, height: VIEW_HEIGHT });
  const soundRef = useRef(true);

  useEffect(() => {
    const stored = loadSave();
    saveRef.current = stored;
    setSave(stored);
    setPhase(stored ? "lobby" : "create");
    setCreateName(stored?.name ?? "");
    setCreateClass(stored?.classId ?? "warrior");
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
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
        },
      });
    }
  }

  function handleSnapshot(snapshot: WorldSnapshot) {
    snapshotRef.current = snapshot;
    const now = Date.now();
    const myId = myIdRef.current;

    for (const event of snapshot.events) {
      if (event.seq <= lastSeqRef.current) continue;
      lastSeqRef.current = event.seq;
      if (event.to && event.to !== myId) continue;

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
          life: 900,
          maxLife: 900,
        });
        if (particlesRef.current.length > 40) particlesRef.current.shift();
      }

      switch (event.kind) {
        case "damage":
          sfx("attack");
          break;
        case "hurt":
          sfx("hurt");
          break;
        case "kill":
          sfx("kill");
          break;
        case "skill":
          sfx("skill");
          break;
        case "heal":
          sfx("heal");
          break;
        case "death":
          if (event.to === myId) {
            sfx("death");
            toast.error("你被击败了，3 秒后复活");
          }
          break;
        case "reward":
          if (event.to === myId) {
            applyReward(event.exp ?? 0, event.gold ?? 0);
          }
          break;
        default:
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
    }
  }

  function openStream(clientId: string) {
    sseRef.current?.close();
    const source = new EventSource(`/api/world/stream?clientId=${clientId}`);
    sseRef.current = source;
    source.onopen = () => setStatus("online");
    source.onerror = () => setStatus("offline");
    source.onmessage = (event) => {
      try {
        handleSnapshot(JSON.parse(event.data) as WorldSnapshot);
      } catch {
        // 忽略非 JSON 帧
      }
    };
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
        }),
      });
      if (!response.ok) throw new Error("join failed");
      const data = await response.json();

      myIdRef.current = clientId;
      lastSeqRef.current = data.eventSeq;
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
        if (ix !== 0) me.dir = ix > 0 ? 1 : -1;
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
          particles[i].y -= 0.6;
          if (particles[i].life <= 0) particles.splice(i, 1);
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
          snapshot: snapshotRef.current as RenderSnapshot | null,
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
      const height = isTouch ? 320 : VIEW_HEIGHT;
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
  }, [phase, isTouch]);

  function doAttack() {
    const now = performance.now();
    if (now - lastAttackRef.current < 420) return;
    lastAttackRef.current = now;
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

  function press(key: string) {
    keysRef.current.add(key);
  }

  function release(key: string) {
    keysRef.current.delete(key);
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
          <li>· 移动：WASD / 方向键；攻击：J 或空格；技能：数字键 1-4</li>
          <li>· 移动端提供虚拟方向键与攻击按钮</li>
          <li>· 击杀经验与金币会写回角色存档，并实时显示伤害与音效</li>
          <li>· 背景音乐与音效可在进入后开关</li>
        </ul>

        <button type="button" className={btnPrimary} onClick={() => void enterWorld()}>
          {status === "connecting" ? "连接中…" : "进入世界"}
        </button>
      </div>
    );
  }

  const skills = save ? CLASS_SKILLS[save.classId] : [];
  const hpPercent = self ? Math.max(0, (self.hp / self.maxHp) * 100) : 100;
  const mpPercent = self ? Math.max(0, (self.mp / self.maxMp) * 100) : 100;

  return (
    <div className="overflow-hidden rounded-xl border-2 border-slate-700 bg-slate-950 text-slate-100 shadow-[6px_6px_0_rgba(0,0,0,0.3)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{save ? CLASSES[save.classId].icon : "🧙"}</span>
          <div>
            <p className="text-[11px] font-bold">
              {save?.name ?? "冒险者"}
              <span className="ml-1.5 text-amber-300">Lv.{self?.level ?? save?.level ?? 1}</span>
            </p>
            <p className="text-[10px] text-slate-500">
              在线 {online} 人 · 击杀 {self?.kills ?? 0}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
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
          <button type="button" className={btn} title="离开世界" onClick={leaveWorld}>
            <LogOut className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 py-2">
        <div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>HP</span>
            <span>
              {self?.hp ?? 0} / {self?.maxHp ?? 0}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-slate-800">
            <div className="h-full rounded bg-gradient-to-r from-red-500 to-rose-400" style={{ width: `${hpPercent}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>MP</span>
            <span>
              {self?.mp ?? 0} / {self?.maxMp ?? 0}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-slate-800">
            <div className="h-full rounded bg-gradient-to-r from-sky-500 to-cyan-400" style={{ width: `${mpPercent}%` }} />
          </div>
        </div>
      </div>

      <div ref={wrapRef} className="relative bg-black">
        <canvas ref={canvasRef} className="block w-full" />
        <div className="absolute left-2 top-2 rounded border border-slate-700 bg-slate-950/80 px-2 py-0.5 text-[10px] text-slate-300">
          {status === "online" ? "已连接" : status === "connecting" ? "连接中" : "重连中"}
        </div>
        {self?.dead && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-bold text-red-300">
            你被击败了，3 秒后复活…
          </div>
        )}
      </div>

      {isTouch && (
        <div className="flex items-end justify-between gap-2 border-t border-slate-800 px-3 py-2">
          <div className="grid grid-cols-3 gap-1">
            <span />
            <button
              type="button"
              className={btn}
              onPointerDown={(event) => {
                event.preventDefault();
                press("w");
              }}
              onPointerUp={() => release("w")}
              onPointerLeave={() => release("w")}
              onPointerCancel={() => release("w")}
            >
              ↑
            </button>
            <span />
            <button
              type="button"
              className={btn}
              onPointerDown={(event) => {
                event.preventDefault();
                press("a");
              }}
              onPointerUp={() => release("a")}
              onPointerLeave={() => release("a")}
              onPointerCancel={() => release("a")}
            >
              ←
            </button>
            <button
              type="button"
              className={btn}
              onPointerDown={(event) => {
                event.preventDefault();
                press("s");
              }}
              onPointerUp={() => release("s")}
              onPointerLeave={() => release("s")}
              onPointerCancel={() => release("s")}
            >
              ↓
            </button>
            <button
              type="button"
              className={btn}
              onPointerDown={(event) => {
                event.preventDefault();
                press("d");
              }}
              onPointerUp={() => release("d")}
              onPointerLeave={() => release("d")}
              onPointerCancel={() => release("d")}
            >
              →
            </button>
          </div>
          <button type="button" className={cn(btnPrimary, "size-14 rounded-full text-lg")} onPointerDown={(event) => {
            event.preventDefault();
            doAttack();
          }}>
            ⚔️
          </button>
        </div>
      )}

      <div className="space-y-2 border-t border-slate-800 px-3 py-2">
        <div className="flex flex-wrap gap-1.5">
          {skills.map((id, index) => {
            const skill = SKILLS[id];
            const locked = (self?.level ?? save?.level ?? 1) < skill.level;
            const noMp = (self?.mp ?? 0) < skill.mp;
            return (
              <button
                key={id}
                type="button"
                className={btn}
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
        </div>
        <div className="flex items-center gap-2 overflow-x-auto text-[10px] text-slate-400">
          <Users className="size-3.5 shrink-0" />
          <span className="shrink-0">在线 {online} 人</span>
          {party.map((player) => (
            <span
              key={player.id}
              className="shrink-0 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5"
            >
              {CLASSES[player.classId].icon} {player.name} Lv.{player.level} ·{" "}
              {Math.round(player.hp)}/{player.maxHp}
            </span>
          ))}
          {party.length === 0 && (
            <span className="shrink-0 text-slate-600">暂无其他玩家，邀请好友一起打怪</span>
          )}
        </div>
      </div>
    </div>
  );
}
