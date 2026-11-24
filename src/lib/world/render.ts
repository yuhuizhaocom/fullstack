import {
  roomConfig,
  roomSpawn,
  terrainAt,
  TILE,
  type RoomId,
  type RoomTheme,
} from "./terrain";

export type RenderParticle = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size?: number;
  vx?: number;
  vy?: number;
};

export type SkillEffect = {
  id: number;
  x: number;
  y: number;
  skillId: string;
  at: number;
  radius?: number;
};

export type RenderSnapshot = {
  players: {
    id: string;
    name: string;
    classId: string;
    level: number;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    dir: number;
    dead: boolean;
    weapon: string | null;
    armor: string | null;
  }[];
  monsters: {
    id: string;
    name: string;
    kind: string;
    icon: string;
    boss: boolean;
    level?: number;
    elite?: boolean;
    affix?: string | null;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
  }[];
  drops: {
    id: string;
    kind?: string;
    x: number;
    y: number;
    heal: number;
    gold?: number;
    itemId?: string;
    name?: string;
    icon?: string;
  }[];
  npcs?: {
    id: string;
    name: string;
    title: string;
    icon: string;
    color: string;
    role: string;
    x: number;
    y: number;
    quests: string[];
  }[];
  portals?: {
    id: string;
    target: string;
    label: string;
    icon: string;
    x: number;
    y: number;
    unlockLevel: number;
  }[];
};

const ISO_HALF_W = 32;
const ISO_HALF_H = 16;

const CLASS_BODY: Record<string, string> = {
  warrior: "#f59e0b",
  mage: "#6366f1",
  ranger: "#10b981",
  priest: "#f472b6",
};

const ARMOR_BODY: Record<string, string> = {
  cloth_robe: "#94a3b8",
  leather_armor: "#a16207",
  chain_mail: "#8494a8",
  plate_armor: "#64748b",
  dragon_armor: "#b91c1c",
  randuin: "#38bdf8",
  guardian_angel: "#fbbf24",
  thornmail: "#4ade80",
  warmog: "#f87171",
};

type WeaponKind = "sword" | "staff" | "bow" | "mace";
type WeaponStyle = { kind: WeaponKind; color: string; glow?: string };

const WEAPON_STYLES: Record<string, WeaponStyle> = {
  wooden_sword: { kind: "sword", color: "#b45309" },
  iron_sword: { kind: "sword", color: "#cbd5e1" },
  flame_sword: { kind: "sword", color: "#fb923c", glow: "#f97316" },
  doran_blade: { kind: "sword", color: "#fbbf24", glow: "#f59e0b" },
  infinity_edge: { kind: "sword", color: "#fef3c7", glow: "#facc15" },
  bloodthirster: { kind: "sword", color: "#f87171", glow: "#dc2626" },
  oak_staff: { kind: "staff", color: "#a78bfa" },
  crystal_staff: { kind: "staff", color: "#38bdf8", glow: "#0ea5e9" },
  arcane_staff: { kind: "staff", color: "#c084fc", glow: "#a855f7" },
  short_bow: { kind: "bow", color: "#a3e635" },
  hunter_bow: { kind: "bow", color: "#84cc16" },
  storm_bow: { kind: "bow", color: "#22d3ee", glow: "#06b6d4" },
  holy_mace: { kind: "mace", color: "#fde68a" },
  blessed_mace: { kind: "mace", color: "#fbbf24" },
  divine_mace: { kind: "mace", color: "#fef3c7", glow: "#facc15" },
};

function weaponStyle(weapon: string | null, classId: string): WeaponStyle {
  if (weapon && WEAPON_STYLES[weapon]) return WEAPON_STYLES[weapon];
  if (classId === "mage") return { kind: "staff", color: "#a78bfa" };
  if (classId === "ranger") return { kind: "bow", color: "#a3e635" };
  if (classId === "priest") return { kind: "mace", color: "#fde68a" };
  return { kind: "sword", color: "#cbd5e1" };
}

function toScreen(wx: number, wy: number, camX: number, camY: number) {
  return { x: wx - wy - camX, y: (wx + wy) / 2 - camY };
}

function diamondPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx + halfW, cy);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx - halfW, cy);
  ctx.closePath();
}

const GROUND_PALETTES: Record<RoomTheme, string[]> = {
  overworld: ["#1b4227", "#1d472b", "#1a3d24"],
  forest: ["#163a22", "#183f25", "#14341f"],
  cave: ["#20252d", "#242a33", "#1d222a"],
  ruins: ["#262a30", "#2a2e35", "#22262c"],
  volcano: ["#2a1510", "#301812", "#24110d"],
};

const GROUND_BG: Record<RoomTheme, string> = {
  overworld: "#08160d",
  forest: "#07130c",
  cave: "#090d13",
  ruins: "#0c0e12",
  volcano: "#170906",
};

function drawGroundTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  terrain: string,
  tx: number,
  ty: number,
  time: number,
  theme: RoomTheme
): void {
  const shade = (tx * 7 + ty * 13) % 3;
  const palette = GROUND_PALETTES[theme];
  const water =
    theme === "volcano" ? "#7c2d12" : theme === "cave" ? "#13384d" : "#1b4a72";

  diamondPath(ctx, x, y, ISO_HALF_W, ISO_HALF_H);
  ctx.fillStyle = terrain === "water" ? water : palette[shade];
  ctx.fill();

  if (terrain === "flower") {
    ctx.fillStyle = theme === "volcano" ? "#fb923c" : theme === "cave" ? "#67e8f9" : "#facc15";
    ctx.fillRect(x - 7, y - 3, 2, 2);
    ctx.fillRect(x + 6, y + 3, 2, 2);
  } else if (terrain === "water") {
    const wave = Math.sin(time / 600 + tx * 0.7 + ty * 0.4) * 4;
    ctx.strokeStyle =
      theme === "volcano" ? "rgba(251,146,60,0.5)" : "rgba(125,211,252,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 16, y + wave);
    ctx.lineTo(x + 16, y + wave);
    ctx.stroke();
  }
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: RoomTheme
): void {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 17, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5b3a1e";
  ctx.fillRect(x - 3, y - 30, 6, 30);

  const layers =
    theme === "ruins"
      ? ["#57616e", "#6b7280", "#7c8794"]
      : theme === "cave"
        ? ["#1f3b33", "#294a40", "#335a4d"]
        : ["#256b38", "#2f7a3f", "#3c9350"];

  const offsets: [number, number, number][] = [
    [-68, -36, 22],
    [-55, -24, 26],
    [-43, -15, 20],
  ];
  layers.forEach((color, index) => {
    const [top, bottom, half] = offsets[index];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + top);
    ctx.lineTo(x - half, y + bottom);
    ctx.lineTo(x + half, y + bottom);
    ctx.closePath();
    ctx.fill();
  });
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: RoomTheme
): void {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = theme === "volcano" ? "#4a2118" : "#4b5563";
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = theme === "volcano" ? "#6b2f1f" : "#6b7280";
  ctx.beginPath();
  ctx.ellipse(x - 3, y - 13, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  if (theme === "volcano") {
    ctx.fillStyle = "rgba(251,146,60,0.35)";
    ctx.beginPath();
    ctx.ellipse(x - 6, y - 17, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCampfire(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number
): void {
  const glow = ctx.createRadialGradient(x, y - 12, 2, x, y - 12, 44);
  glow.addColorStop(0, "rgba(251,146,60,0.3)");
  glow.addColorStop(1, "rgba(251,146,60,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - 44, y - 56, 88, 88);

  ctx.fillStyle = "#57534e";
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(angle) * 14,
      y + Math.sin(angle) * 7,
      4,
      3,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  ctx.strokeStyle = "#78350f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 2);
  ctx.lineTo(x + 8, y - 10);
  ctx.moveTo(x + 8, y - 2);
  ctx.lineTo(x - 8, y - 10);
  ctx.stroke();

  const flicker = Math.sin(time / 120) * 2;
  ctx.fillStyle = "rgba(249,115,22,0.9)";
  ctx.beginPath();
  ctx.ellipse(x, y - 14, 7, 12 + flicker, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(251,191,36,0.95)";
  ctx.beginPath();
  ctx.ellipse(x, y - 16, 4, 7 + flicker * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPortal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  portal: { label: string; icon: string; unlockLevel: number },
  meLevel: number,
  time: number
): void {
  const locked = portal.unlockLevel > meLevel;
  const pulse = 1 + Math.sin(time / 260) * 0.08;
  ctx.save();
  ctx.globalAlpha = locked ? 0.45 : 1;

  const glow = ctx.createRadialGradient(x, y - 14, 2, x, y - 14, 46);
  glow.addColorStop(0, locked ? "rgba(148,163,184,0.35)" : "rgba(56,189,248,0.4)");
  glow.addColorStop(1, "rgba(56,189,248,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(x, y - 12, 44, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = locked ? "rgba(148,163,184,0.8)" : "rgba(125,211,252,0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, 26 * pulse, 12 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = locked ? "rgba(148,163,184,0.35)" : "rgba(56,189,248,0.45)";
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 18 * pulse, 8 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = "22px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(portal.icon, x, y - 18 + Math.sin(time / 320) * 2);

  ctx.font = "bold 10px ui-monospace, Menlo, monospace";
  ctx.fillStyle = locked ? "#94a3b8" : "#7dd3fc";
  ctx.fillText(locked ? `${portal.label} Lv.${portal.unlockLevel}` : portal.label, x, y - 46);
  ctx.restore();
}

function drawNpc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  npc: {
    name: string;
    title: string;
    icon: string;
    color: string;
    quests: string[];
  },
  time: number
): void {
  const bob = Math.sin(time / 420 + x) * 1.5;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(x - 6, y - 11, 4, 11);
  ctx.fillRect(x + 2, y - 11, 4, 11);

  ctx.fillStyle = npc.color;
  ctx.fillRect(x - 9, y - 28 + bob, 18, 19);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(x - 8, y - 26 + bob, 16, 3);

  ctx.fillStyle = "#f0c39b";
  ctx.fillRect(x - 6, y - 40 + bob, 12, 12);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x - 3, y - 35 + bob, 2, 2);
  ctx.fillRect(x + 1, y - 35 + bob, 2, 2);

  ctx.font = "13px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(npc.icon, x, y - 44 + bob);

  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "#fde68a";
  ctx.fillText(npc.name, x, y - 51 + bob);

  if (npc.quests.length > 0) {
    const markerY = y - 64 + Math.sin(time / 240) * 3;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.arc(x + 14, markerY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#facc15";
    ctx.font = "bold 12px ui-monospace, Menlo, monospace";
    ctx.fillText("!", x + 14, markerY + 4);
  }
}

const MINIMAP_CACHE_SIZE = 128;
const minimapCaches = new Map<RoomId, HTMLCanvasElement>();

function getMinimapCache(room: RoomId): HTMLCanvasElement {
  const cached = minimapCaches.get(room);
  if (cached) return cached;
  const cfg = roomConfig(room);
  const canvas = document.createElement("canvas");
  canvas.width = MINIMAP_CACHE_SIZE;
  canvas.height = MINIMAP_CACHE_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(8,22,13,0.92)";
    ctx.fillRect(0, 0, MINIMAP_CACHE_SIZE, MINIMAP_CACHE_SIZE);
    const sx = MINIMAP_CACHE_SIZE / cfg.w;
    const sy = MINIMAP_CACHE_SIZE / cfg.h;
    for (let ty = 0; ty < cfg.h; ty += 1) {
      for (let tx = 0; tx < cfg.w; tx += 1) {
        const terrain = terrainAt(tx, ty, room);
        if (terrain === "tree") ctx.fillStyle = "rgba(34,90,50,0.9)";
        else if (terrain === "rock") ctx.fillStyle = "rgba(100,116,139,0.85)";
        else if (terrain === "water")
          ctx.fillStyle = cfg.theme === "volcano" ? "rgba(194,65,12,0.9)" : "rgba(30,90,140,0.9)";
        else continue;
        ctx.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
  }
  minimapCaches.set(room, canvas);
  return canvas;
}

function drawBossBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  boss: { name: string; hp: number; maxHp: number }
): void {
  const barWidth = Math.min(280, width * 0.5);
  const x = (width - barWidth) / 2;
  const y = 104;

  ctx.save();
  ctx.fillStyle = "rgba(8,22,13,0.72)";
  ctx.fillRect(x - 10, y - 22, barWidth + 20, 36);

  ctx.font = "bold 11px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f0abfc";
  ctx.fillText(`${boss.name}  ${Math.ceil(boss.hp)} / ${boss.maxHp}`, width / 2, y - 7);

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x, y, barWidth, 8);
  ctx.fillStyle = "#e879f9";
  ctx.fillRect(x, y, barWidth * Math.max(0, boss.hp / boss.maxHp), 8);
  ctx.strokeStyle = "rgba(232,121,249,0.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, barWidth - 1, 7);
  ctx.restore();
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  room: RoomId,
  meId: string,
  meX: number,
  meY: number,
  snapshot: RenderSnapshot | null,
  time: number
): void {
  const cfg = roomConfig(room);
  const size = Math.round(Math.min(132, Math.max(88, width * 0.2)));
  const x = width - size - 8;
  const y = 92;
  const sx = size / cfg.w;
  const sy = size / cfg.h;
  const spawn = roomSpawn(room);

  ctx.save();
  ctx.globalAlpha = 0.94;
  ctx.drawImage(getMinimapCache(room), x, y, size, size);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(148,163,184,0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  ctx.strokeStyle = "rgba(134,239,172,0.55)";
  ctx.beginPath();
  ctx.arc(
    x + (spawn.x / TILE) * sx,
    y + (spawn.y / TILE) * sy,
    (240 / TILE) * sx,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  for (const portal of snapshot?.portals ?? []) {
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(x + (portal.x / TILE) * sx, y + (portal.y / TILE) * sy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const npc of snapshot?.npcs ?? []) {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(x + (npc.x / TILE) * sx - 1, y + (npc.y / TILE) * sy - 1, 2.4, 2.4);
  }

  for (const monster of snapshot?.monsters ?? []) {
    ctx.fillStyle = monster.boss ? "#e879f9" : monster.elite ? "#fbbf24" : "#f87171";
    ctx.beginPath();
    ctx.arc(
      x + (monster.x / TILE) * sx,
      y + (monster.y / TILE) * sy,
      monster.boss ? 3 : monster.elite ? 2.4 : 1.8,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  for (const player of snapshot?.players ?? []) {
    if (player.id === meId) continue;
    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.arc(x + (player.x / TILE) * sx, y + (player.y / TILE) * sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const selfX = x + (meX / TILE) * sx;
  const selfY = y + (meY / TILE) * sy;
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(selfX, selfY, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(253,230,138,0.7)";
  ctx.beginPath();
  ctx.arc(selfX, selfY, 4 + Math.sin(time / 300) * 1.2, 0, Math.PI * 2);
  ctx.stroke();

  const viewW = Math.min(size, (width / TILE) * sx * 1.4);
  const viewH = Math.min(size, ((height * 2) / TILE) * sy * 1.2);
  ctx.strokeStyle = "rgba(226,232,240,0.32)";
  ctx.lineWidth = 1;
  ctx.strokeRect(selfX - viewW / 2, selfY - viewH / 2, viewW, viewH);

  ctx.restore();
}

function drawWeapon(ctx: CanvasRenderingContext2D, style: WeaponStyle): void {
  if (style.kind === "sword") {
    ctx.fillStyle = "#78350f";
    ctx.fillRect(-1.5, -3, 3, 7);
    ctx.fillStyle = "#eab308";
    ctx.fillRect(-4.5, -4, 9, 2);
    if (style.glow) {
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = style.glow;
      ctx.beginPath();
      ctx.ellipse(0, -15, 5.5, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(-2, -5);
    ctx.lineTo(2, -5);
    ctx.lineTo(1.4, -22);
    ctx.lineTo(0, -25);
    ctx.lineTo(-1.4, -22);
    ctx.closePath();
    ctx.fill();
  } else if (style.kind === "staff") {
    ctx.fillStyle = "#8b5e34";
    ctx.fillRect(-1.5, -26, 3, 26);
    if (style.glow) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = style.glow;
      ctx.beginPath();
      ctx.arc(0, -28, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(0, -28, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (style.kind === "bow") {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(3, -10, 12, -1.25, 1.25);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3 + Math.cos(-1.25) * 12, -10 + Math.sin(-1.25) * 12);
    ctx.lineTo(3 + Math.cos(1.25) * 12, -10 + Math.sin(1.25) * 12);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#8b5e34";
    ctx.fillRect(-1.5, -7, 3, 8);
    ctx.fillStyle = style.color;
    ctx.fillRect(-5, -16, 10, 10);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(-3, -14, 3, 3);
  }
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  look: {
    classId: string;
    weapon: string | null;
    armor: string | null;
    dir: number;
    dead: boolean;
    me: boolean;
    swingAt?: number;
    hurtAt?: number;
    moving: boolean;
    time: number;
  },
  name: string,
  hp: number,
  maxHp: number
): void {
  const now = look.time;
  const swingElapsed = look.swingAt ? now - look.swingAt : Number.POSITIVE_INFINITY;
  const swingProgress = swingElapsed >= 0 && swingElapsed < 300 ? swingElapsed / 300 : -1;
  const swinging = swingProgress >= 0;
  const swingAngle = swinging
    ? swingProgress < 0.32
      ? -0.9 * (swingProgress / 0.32)
      : swingProgress < 0.66
        ? -0.9 + ((swingProgress - 0.32) / 0.34) * 2.5
        : 1.6 - ((swingProgress - 0.66) / 0.34) * 1.6
    : 0;
  const hurt = look.hurtAt ? now - look.hurtAt < 180 : false;
  const step = look.moving ? Math.sin(now / 85) : 0;
  const bob = look.moving ? Math.abs(Math.sin(now / 85)) * 1.8 : 0;
  const dir = look.dir >= 0 ? 1 : -1;
  const bodyColor = hurt
    ? "#fecaca"
    : (ARMOR_BODY[look.armor ?? ""] ?? CLASS_BODY[look.classId] ?? "#fbbf24");

  ctx.save();
  if (look.dead) ctx.globalAlpha = 0.35;

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 14, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(x - 7 + step * 2, y - 11, 5, 11);
  ctx.fillRect(x + 2 - step * 2, y - 11, 5, 11);

  if (look.classId === "mage" || look.classId === "priest") {
    ctx.fillStyle = look.classId === "mage" ? "#4c1d95" : "#e7e5e4";
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 30 + bob);
    ctx.lineTo(x + 10, y - 30 + bob);
    ctx.lineTo(x + 12, y - 5);
    ctx.lineTo(x - 12, y - 5);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = bodyColor;
  ctx.fillRect(x - 9, y - 30 + bob, 18, 20);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x - 8, y - 28 + bob, 16, 3);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x - 9, y - 12 + bob, 18, 2.5);

  ctx.fillStyle = bodyColor;
  ctx.fillRect(x - 12, y - 28 + bob, 4, 11);
  ctx.fillRect(x + 8, y - (swinging ? 31 : 28) + bob, 4, 11);

  ctx.fillStyle = "#f0c39b";
  ctx.fillRect(x - 7, y - 43 + bob, 14, 13);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x + (dir > 0 ? 3 : -5.5), y - 38 + bob, 2.5, 2.5);

  if (look.classId === "warrior") {
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(x - 7, y - 45 + bob, 14, 5);
    ctx.fillRect(x - 9, y - 41 + bob, 3, 6);
    ctx.fillRect(x + 6, y - 41 + bob, 3, 6);
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(x - 1, y - 50 + bob, 2.5, 6);
  } else if (look.classId === "mage") {
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath();
    ctx.moveTo(x, y - 60 + bob);
    ctx.lineTo(x - 12, y - 42 + bob);
    ctx.lineTo(x + 12, y - 42 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#a78bfa";
    ctx.fillRect(x - 13, y - 45 + bob, 26, 3);
  } else if (look.classId === "ranger") {
    ctx.fillStyle = "#166534";
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 43 + bob);
    ctx.lineTo(x, y - 53 + bob);
    ctx.lineTo(x + 9, y - 43 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 9, y - 44 + bob, 18, 4);
  } else {
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - 51 + bob, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const style = weaponStyle(look.weapon, look.classId);
  ctx.save();
  ctx.translate(x + dir * 10, y - 26 + bob);
  ctx.scale(dir, 1);
  ctx.rotate(swingAngle);
  drawWeapon(ctx, style);
  ctx.restore();

  if (swinging && swingProgress > 0.3 && swingProgress < 0.8) {
    const alpha = 1 - Math.abs((swingProgress - 0.55) / 0.25);
    ctx.save();
    ctx.translate(x + dir * 8, y - 26 + bob);
    ctx.scale(dir, 1);
    ctx.globalAlpha = Math.max(0, alpha) * 0.9;
    ctx.strokeStyle = "#fef3c7";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26, -1.35, 0.7);
    ctx.stroke();
    ctx.restore();
  }

  if (look.me) {
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 11, y - 45, 22, 46);
  }

  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = look.me ? "#fde68a" : "#e2e8f0";
  ctx.fillText(name, x, y - 54);

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(x - 14, y - 51, 28, 3);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(x - 14, y - 51, 28 * Math.max(0, hp / maxHp), 3);

  ctx.restore();
}

function drawMonsterBody(
  ctx: CanvasRenderingContext2D,
  kind: string,
  time: number
): void {
  switch (kind) {
    case "slime": {
      const squash = 1 + Math.sin(time / 260) * 0.06;
      ctx.fillStyle = "#4ade80";
      ctx.beginPath();
      ctx.ellipse(0, -11, 15, 12 * squash, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(-5, -15, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-6, -12, 3, 3);
      ctx.fillRect(3, -12, 3, 3);
      ctx.fillStyle = "#065f46";
      ctx.fillRect(-3, -6, 6, 2);
      break;
    }
    case "wolf":
    case "wolfking": {
      const king = kind === "wolfking";
      ctx.strokeStyle = king ? "#7f1d1d" : "#6b7280";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-12, -14);
      ctx.quadraticCurveTo(-22, -18, -20, -26);
      ctx.stroke();

      ctx.fillStyle = king ? "#7f1d1d" : "#6b7280";
      ctx.beginPath();
      ctx.ellipse(0, -12, 15, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = king ? "#991b1b" : "#4b5563";
      ctx.fillRect(-8, -7, 4, 7);
      ctx.fillRect(4, -7, 4, 7);

      ctx.fillStyle = king ? "#991b1b" : "#9ca3af";
      ctx.beginPath();
      ctx.ellipse(11, -19, 8, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6, -24);
      ctx.lineTo(9, -31);
      ctx.lineTo(12, -24);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(13, -24);
      ctx.lineTo(16, -30);
      ctx.lineTo(18, -23);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#f87171";
      ctx.fillRect(9, -21, 2.5, 2.5);
      ctx.fillRect(15, -21, 2.5, 2.5);

      if (king) {
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.moveTo(5, -28);
        ctx.lineTo(7, -34);
        ctx.lineTo(10, -29);
        ctx.lineTo(13, -35);
        ctx.lineTo(15, -29);
        ctx.lineTo(18, -33);
        ctx.lineTo(19, -27);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "goblin": {
      ctx.fillStyle = "#4d7c0f";
      ctx.fillRect(-8, -20, 16, 16);
      ctx.fillStyle = "#65a30d";
      ctx.beginPath();
      ctx.ellipse(0, -26, 8, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, -28);
      ctx.lineTo(-15, -31);
      ctx.lineTo(-8, -24);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, -28);
      ctx.lineTo(15, -31);
      ctx.lineTo(8, -24);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.fillRect(-4, -27, 2.5, 2.5);
      ctx.fillRect(2, -27, 2.5, 2.5);
      ctx.strokeStyle = "#78350f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, -18);
      ctx.lineTo(18, -26);
      ctx.stroke();
      break;
    }
    case "skeleton": {
      ctx.fillStyle = "#e5e7eb";
      ctx.beginPath();
      ctx.ellipse(0, -30, 7, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111827";
      ctx.fillRect(-4, -31, 3, 3);
      ctx.fillRect(2, -31, 3, 3);
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-6, -21 + i * 4);
        ctx.lineTo(6, -21 + i * 4);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-4, -9);
      ctx.lineTo(-4, 0);
      ctx.moveTo(4, -9);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.strokeStyle = "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(9, -14);
      ctx.lineTo(16, -24);
      ctx.stroke();
      break;
    }
    case "fire":
    case "lavabeast": {
      const flicker = Math.sin(time / 90) * 2;
      const big = kind === "lavabeast";
      ctx.fillStyle = "rgba(249,115,22,0.92)";
      ctx.beginPath();
      ctx.ellipse(0, -14, big ? 18 : 13, (big ? 17 : 15) + flicker, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(251,191,36,0.92)";
      ctx.beginPath();
      ctx.ellipse(0, -16, big ? 11 : 8, (big ? 12 : 10) + flicker * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(254,240,138,0.95)";
      ctx.beginPath();
      ctx.ellipse(0, -18, big ? 6 : 4, big ? 7 : 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111827";
      ctx.fillRect(-5, -17, 2.5, 2.5);
      ctx.fillRect(3, -17, 2.5, 2.5);
      break;
    }
    case "demon": {
      ctx.fillStyle = "#4c1d95";
      ctx.beginPath();
      ctx.moveTo(-6, -22);
      ctx.lineTo(-22, -32);
      ctx.lineTo(-11, -12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6, -22);
      ctx.lineTo(22, -32);
      ctx.lineTo(11, -12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#7f1d1d";
      ctx.beginPath();
      ctx.ellipse(0, -16, 11, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#fca5a5";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-5, -27);
      ctx.lineTo(-8, -34);
      ctx.moveTo(5, -27);
      ctx.lineTo(8, -34);
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(-5, -20, 3, 3);
      ctx.fillRect(2, -20, 3, 3);
      break;
    }
    case "bat":
    case "ghost": {
      const ghost = kind === "ghost";
      ctx.fillStyle = ghost ? "rgba(226,232,240,0.75)" : "#7c3aed";
      ctx.beginPath();
      ctx.moveTo(-4, -22);
      ctx.lineTo(-24, -34);
      ctx.lineTo(-12, -8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, -22);
      ctx.lineTo(24, -34);
      ctx.lineTo(12, -8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -14, ghost ? 11 : 8, ghost ? 14 : 10, 0, 0, Math.PI * 2);
      ctx.fill();
      if (ghost) {
        ctx.fillStyle = "rgba(226,232,240,0.5)";
        ctx.beginPath();
        ctx.ellipse(0, -2, 9, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#f87171";
      ctx.fillRect(-5, -19, 3, 3);
      ctx.fillRect(2, -19, 3, 3);
      break;
    }
    case "spider": {
      ctx.strokeStyle = "#4c1d95";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i += 1) {
        const offset = -12 + i * 8;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(offset - 10, -2);
        ctx.moveTo(0, -12);
        ctx.lineTo(offset + 10, -2);
        ctx.stroke();
      }
      ctx.fillStyle = "#7c3aed";
      ctx.beginPath();
      ctx.ellipse(0, -14, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f87171";
      ctx.fillRect(-6, -17, 2.5, 2.5);
      ctx.fillRect(3, -17, 2.5, 2.5);
      break;
    }
    case "golem":
    case "gargoyle":
    case "cavegolem":
    case "guardian": {
      const boss = kind === "cavegolem" || kind === "guardian";
      const color = boss ? "#475569" : "#6b7280";
      ctx.fillStyle = color;
      ctx.fillRect(-13, -26, 26, 22);
      ctx.fillStyle = boss ? "#94a3b8" : "#9ca3af";
      ctx.fillRect(-10, -36, 20, 12);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(-13, -24, 26, 3);
      ctx.fillStyle = boss ? "#38bdf8" : "#fbbf24";
      ctx.fillRect(-6, -31, 4, 4);
      ctx.fillRect(2, -31, 4, 4);
      if (kind === "gargoyle") {
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-10, -22);
        ctx.lineTo(-24, -34);
        ctx.moveTo(10, -22);
        ctx.lineTo(24, -34);
        ctx.stroke();
      }
      break;
    }
    case "dragon": {
      ctx.fillStyle = "#7f1d1d";
      ctx.beginPath();
      ctx.moveTo(-4, -26);
      ctx.lineTo(-26, -38);
      ctx.lineTo(-14, -10);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, -26);
      ctx.lineTo(26, -38);
      ctx.lineTo(14, -10);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#991b1b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-10, -12);
      ctx.quadraticCurveTo(-24, -6, -26, -2);
      ctx.stroke();

      ctx.fillStyle = "#b91c1c";
      ctx.beginPath();
      ctx.ellipse(0, -14, 15, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(10, -30, 7, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#fde68a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, -37);
      ctx.lineTo(6, -44);
      ctx.moveTo(13, -37);
      ctx.lineTo(15, -43);
      ctx.stroke();

      ctx.fillStyle = "#facc15";
      ctx.fillRect(11, -32, 3, 3);
      break;
    }
    default: {
      ctx.font = "30px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("👾", 0, 0);
    }
  }
}

function drawMonster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  monster: {
    kind: string;
    name: string;
    boss: boolean;
    level?: number;
    elite?: boolean;
    hp: number;
    maxHp: number;
  },
  flash: boolean,
  time: number,
  showHealth: boolean
): void {
  const scale = monster.boss ? 1.45 : monster.elite ? 1.18 : 1;

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 15 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = monster.boss
    ? "rgba(232,121,249,0.2)"
    : monster.elite
      ? "rgba(250,204,21,0.2)"
      : "rgba(248,113,113,0.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 19 * scale, 9.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  if (monster.elite) {
    // 精英光环 + 环绕光点
    const pulse = 0.5 + Math.sin(time / 260 + x) * 0.3;
    ctx.strokeStyle = `rgba(250,204,21,${0.25 + pulse * 0.35})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 1, (20 + pulse * 5) * scale, (10 + pulse * 2.5) * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(253,230,138,0.9)";
    for (let i = 0; i < 3; i += 1) {
      const angle = time / 900 + i * 2.09;
      const rx = Math.cos(angle) * 22 * scale;
      const ry = Math.sin(angle) * 10 * scale;
      ctx.beginPath();
      ctx.arc(x + rx, y - 10 + ry, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (flash) ctx.filter = "brightness(1.85)";
  drawMonsterBody(ctx, monster.kind, time);
  ctx.filter = "none";
  ctx.restore();

  if (!showHealth) return;

  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = monster.boss ? "#f0abfc" : monster.elite ? "#fde68a" : "#fca5a5";
  ctx.fillText(
    monster.level ? `Lv.${monster.level} ${monster.name}` : monster.name,
    x,
    y - (monster.boss ? 58 : monster.elite ? 50 : 42)
  );

  const barWidth = monster.boss ? 56 : monster.elite ? 46 : 34;
  const barY = y - (monster.boss ? 53 : monster.elite ? 45 : 37);
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(x - barWidth / 2, barY, barWidth, 3);
  ctx.fillStyle = monster.boss ? "#e879f9" : monster.elite ? "#fbbf24" : "#ef4444";
  ctx.fillRect(x - barWidth / 2, barY, barWidth * Math.max(0, monster.hp / monster.maxHp), 3);
}

const AOE_RADIUS: Record<string, number> = {
  judgment: 115,
  tibbers: 150,
  incinerate: 125,
  volley: 135,
  equinox: 130,
};

const HEAL_SKILLS = new Set(["astral_infusion", "wish", "heal"]);
const EXECUTE_SKILLS = new Set(["demacia_justice", "crystal_arrow"]);
const DASH_SKILLS = new Set(["tumble"]);
const GOLD_SKILLS = new Set(["decisive_strike", "judgment", "demacia_justice", "crystal_arrow"]);
const FROST_SKILLS = new Set(["frost_shot", "equinox"]);

function drawSkillEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  skillId: string,
  progress: number
): void {
  const alpha = Math.max(0, 1 - progress);
  ctx.save();
  ctx.globalAlpha = alpha;

  if (skillId === "levelup") {
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, 14 + progress * 46, 7 + progress * 23, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fef3c7";
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + progress * 1.5;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * (12 + progress * 26), y - progress * 40 + Math.sin(angle) * 4, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (skillId === "boss_aoe") {
    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(x, y, 16 + progress * 108, 8 + progress * 54, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.ellipse(x, y, 16 + progress * 108, 8 + progress * 54, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (AOE_RADIUS[skillId]) {
    const radius = AOE_RADIUS[skillId] * (0.25 + progress * 0.9);
    const color =
      skillId === "tibbers"
        ? "#fb923c"
        : skillId === "equinox"
          ? "#f0abfc"
          : skillId === "incinerate"
            ? "#f97316"
            : skillId === "volley"
              ? "#86efac"
              : "#fbbf24";
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2 + progress;
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.5 - progress * 18, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (DASH_SKILLS.has(skillId)) {
    ctx.strokeStyle = "#86efac";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 30 * (1 - progress), y + 8);
    ctx.lineTo(x + 18, y - 8);
    ctx.stroke();
    ctx.fillStyle = "rgba(134,239,172,0.3)";
    ctx.beginPath();
    ctx.ellipse(x + 10, y - 6, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (HEAL_SKILLS.has(skillId)) {
    ctx.fillStyle = skillId === "wish" ? "#f0abfc" : "#86efac";
    for (let i = 0; i < 11; i += 1) {
      const angle = (i / 11) * Math.PI * 2 + progress * 2;
      const radius = 8 + progress * 24;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(angle) * radius,
        y - 8 - progress * 32 + Math.sin(angle) * 5,
        skillId === "wish" ? 3 : 2.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  } else if (EXECUTE_SKILLS.has(skillId)) {
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y - 10, 10 + progress * 54, -1.3, 0.9);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(x, y - 10, 6 + progress * 30, 0, Math.PI * 2);
    ctx.fill();
  } else if (FROST_SKILLS.has(skillId)) {
    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x + Math.cos(angle) * (18 + progress * 34), y - 10 + Math.sin(angle) * (9 + progress * 17));
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = GOLD_SKILLS.has(skillId) ? "#fde68a" : "#a78bfa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 12, 8 + progress * 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = GOLD_SKILLS.has(skillId) ? "#fef3c7" : "#c4b5fd";
    ctx.beginPath();
    ctx.arc(x, y - 12, 5 + progress * 20, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawWorld(
  canvas: HTMLCanvasElement,
  input: {
    width: number;
    height: number;
    room: RoomId;
    meId: string;
    meX: number;
    meY: number;
    meName: string;
    meHp: number;
    meMaxHp: number;
    meLevel: number;
    meDir: number;
    meDead: boolean;
    meMoving: boolean;
    meSwingAt: number;
    meHurtAt: number;
    shake: boolean;
    targetId?: string | null;
    snapshot: RenderSnapshot | null;
    swings: Record<string, number>;
    flashes: Record<string, number>;
    moving: Record<string, number>;
    effects: SkillEffect[];
    particles: RenderParticle[];
    time: number;
  }
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = input;
  const cfg = roomConfig(input.room);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const scale = canvas.width / width;
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);

  const meIsoX = input.meX - input.meY;
  const meIsoY = (input.meX + input.meY) / 2;
  const isoMinX = -cfg.h * TILE;
  const isoMaxX = cfg.w * TILE;
  const isoMinY = 0;
  const isoMaxY = ((cfg.w + cfg.h) * TILE) / 2;
  const shakeX = input.shake ? (Math.random() - 0.5) * 8 : 0;
  const shakeY = input.shake ? (Math.random() - 0.5) * 8 : 0;
  const camX = Math.max(isoMinX, Math.min(isoMaxX - width, meIsoX - width / 2)) + shakeX;
  const camY = Math.max(isoMinY, Math.min(isoMaxY - height, meIsoY - height / 2)) + shakeY;

  ctx.fillStyle = GROUND_BG[cfg.theme];
  ctx.fillRect(0, 0, width, height);

  const unproject = (sx: number, sy: number) => {
    const isoX = sx + camX;
    const isoY = sy + camY;
    return { x: isoY + isoX / 2, y: isoY - isoX / 2 };
  };
  const corners = [unproject(0, 0), unproject(width, 0), unproject(0, height), unproject(width, height)];
  const minTx = Math.max(0, Math.floor(Math.min(...corners.map((corner) => corner.x)) / TILE) - 2);
  const maxTx = Math.min(cfg.w - 1, Math.ceil(Math.max(...corners.map((corner) => corner.x)) / TILE) + 2);
  const minTy = Math.max(0, Math.floor(Math.min(...corners.map((corner) => corner.y)) / TILE) - 2);
  const maxTy = Math.min(cfg.h - 1, Math.ceil(Math.max(...corners.map((corner) => corner.y)) / TILE) + 2);

  type Entity = { depth: number; draw: () => void };
  const entities: Entity[] = [];

  for (let ty = minTy; ty <= maxTy; ty += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      const wx = tx * TILE + TILE / 2;
      const wy = ty * TILE + TILE / 2;
      const screen = toScreen(wx, wy, camX, camY);
      if (
        screen.x < -ISO_HALF_W * 2 ||
        screen.x > width + ISO_HALF_W * 2 ||
        screen.y < -ISO_HALF_H * 3 ||
        screen.y > height + ISO_HALF_H * 4
      ) {
        continue;
      }

      const terrain = terrainAt(tx, ty, input.room);
      drawGroundTile(ctx, screen.x, screen.y, terrain, tx, ty, input.time, cfg.theme);

      if (terrain === "tree" || terrain === "rock") {
        entities.push({
          depth: wx + wy,
          draw: () => {
            if (terrain === "tree") drawTree(ctx, screen.x, screen.y, cfg.theme);
            else drawRock(ctx, screen.x, screen.y, cfg.theme);
          },
        });
      }
    }
  }

  const snapshot = input.snapshot;

  if (snapshot) {
    for (const portal of snapshot.portals ?? []) {
      const screen = toScreen(portal.x, portal.y, camX, camY);
      if (screen.x < -80 || screen.y < -80 || screen.x > width + 80 || screen.y > height + 80) continue;
      entities.push({
        depth: portal.x + portal.y - 6,
        draw: () => drawPortal(ctx, screen.x, screen.y, portal, input.meLevel, input.time),
      });
    }

    for (const npc of snapshot.npcs ?? []) {
      const screen = toScreen(npc.x, npc.y, camX, camY);
      if (screen.x < -80 || screen.y < -80 || screen.x > width + 80 || screen.y > height + 80) continue;
      entities.push({
        depth: npc.x + npc.y,
        draw: () => drawNpc(ctx, screen.x, screen.y, npc, input.time),
      });
    }

    for (const drop of snapshot.drops) {
      const screen = toScreen(drop.x, drop.y, camX, camY);
      if (screen.x < -40 || screen.y < -40 || screen.x > width + 40 || screen.y > height + 40) continue;
      const icon = drop.kind === "gold" ? "💰" : drop.kind === "item" ? (drop.icon ?? "🎁") : "🧪";
      const glow =
        drop.kind === "gold"
          ? "rgba(250,204,21,0.26)"
          : drop.kind === "item"
            ? "rgba(96,165,250,0.26)"
            : "rgba(250,204,21,0.18)";
      entities.push({
        depth: drop.x + drop.y,
        draw: () => {
          const bob = Math.sin(input.time / 300 + drop.x) * 3;
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.beginPath();
          ctx.ellipse(screen.x, screen.y + 2, 10, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.ellipse(screen.x, screen.y + 1, 13, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = "18px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(icon, screen.x, screen.y + bob);
          if (drop.kind === "gold" && drop.gold) {
            ctx.font = "9px ui-monospace, Menlo, monospace";
            ctx.fillStyle = "#fde68a";
            ctx.fillText(`${drop.gold}`, screen.x, screen.y + 15 + bob);
          }
        },
      });
    }

    for (const monster of snapshot.monsters) {
      const screen = toScreen(monster.x, monster.y, camX, camY);
      if (screen.x < -60 || screen.y < -60 || screen.x > width + 60 || screen.y > height + 60) continue;
      const flashAt = input.flashes[monster.id];
      const distanceToMe = Math.hypot(monster.x - input.meX, monster.y - input.meY);
      const selected = input.targetId === monster.id;
      entities.push({
        depth: monster.x + monster.y,
        draw: () => {
          drawMonster(
            ctx,
            screen.x,
            screen.y,
            monster,
            !!flashAt && input.time - flashAt < 140,
            input.time,
            monster.boss ||
              monster.elite ||
              monster.hp < monster.maxHp ||
              distanceToMe < 260
          );
          if (selected) {
            const pulse = 0.55 + Math.sin(input.time / 180) * 0.25;
            ctx.strokeStyle = `rgba(250,204,21,${pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(screen.x, screen.y + 1, 24, 12, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "#fde68a";
            const arrowY =
              screen.y - (monster.boss ? 72 : monster.elite ? 62 : 54) + Math.sin(input.time / 200) * 2;
            ctx.beginPath();
            ctx.moveTo(screen.x, arrowY + 8);
            ctx.lineTo(screen.x - 5, arrowY);
            ctx.lineTo(screen.x + 5, arrowY);
            ctx.closePath();
            ctx.fill();
          }
        },
      });
    }

    for (const player of snapshot.players) {
      if (player.id === input.meId) continue;
      const screen = toScreen(player.x, player.y, camX, camY);
      if (screen.x < -60 || screen.y < -60 || screen.x > width + 60 || screen.y > height + 60) continue;
      entities.push({
        depth: player.x + player.y,
        draw: () =>
          drawHero(
            ctx,
            screen.x,
            screen.y,
            {
              classId: player.classId,
              weapon: player.weapon,
              armor: player.armor,
              dir: player.dir,
              dead: player.dead,
              me: false,
              swingAt: input.swings[player.id],
              hurtAt: input.flashes[player.id],
              moving: (input.moving[player.id] ?? 0) > input.time - 300,
              time: input.time,
            },
            `${player.name} Lv.${player.level}`,
            player.hp,
            player.maxHp
          ),
      });
    }
  }

  const meSnapshot = snapshot?.players.find((player) => player.id === input.meId);
  const meScreen = toScreen(input.meX, input.meY, camX, camY);

  const worldSpawn = roomSpawn("world");
  if (input.room === "world") {
    const fireScreen = toScreen(worldSpawn.x, worldSpawn.y, camX, camY);
    if (
      fireScreen.x > -60 &&
      fireScreen.x < width + 60 &&
      fireScreen.y > -60 &&
      fireScreen.y < height + 60
    ) {
      entities.push({
        depth: worldSpawn.x + worldSpawn.y,
        draw: () => drawCampfire(ctx, fireScreen.x, fireScreen.y, input.time),
      });
    }
  }

  entities.push({
    depth: input.meX + input.meY,
    draw: () =>
      drawHero(
        ctx,
        meScreen.x,
        meScreen.y,
        {
          classId: meSnapshot?.classId ?? "warrior",
          weapon: meSnapshot?.weapon ?? null,
          armor: meSnapshot?.armor ?? null,
          dir: input.meDir,
          dead: input.meDead,
          me: true,
          swingAt: input.meSwingAt,
          hurtAt: input.meHurtAt,
          moving: input.meMoving,
          time: input.time,
        },
        input.meName,
        input.meHp,
        input.meMaxHp
      ),
  });

  entities.sort((a, b) => a.depth - b.depth);
  for (const entity of entities) entity.draw();

  for (const effect of input.effects) {
    const age = input.time - effect.at;
    if (age < 0 || age > 750) continue;
    const screen = toScreen(effect.x, effect.y, camX, camY);
    drawSkillEffect(ctx, screen.x, screen.y, effect.skillId, age / 750);
  }

  for (const particle of input.particles) {
    const screen = toScreen(particle.x, particle.y, camX, camY);
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    const fontSize = particle.size ?? 13;
    ctx.font = `bold ${fontSize}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(particle.text, screen.x, screen.y);
    ctx.fillStyle = particle.color;
    ctx.fillText(particle.text, screen.x, screen.y);
    ctx.globalAlpha = 1;
  }

  const nearbyBoss = snapshot?.monsters
    .filter(
      (monster) => monster.boss && Math.hypot(monster.x - input.meX, monster.y - input.meY) < 460
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - input.meX, a.y - input.meY) -
        Math.hypot(b.x - input.meX, b.y - input.meY)
    )[0];
  if (nearbyBoss) {
    drawBossBar(ctx, width, nearbyBoss);
  }

  drawMinimap(
    ctx,
    width,
    height,
    input.room,
    input.meId,
    input.meX,
    input.meY,
    snapshot,
    input.time
  );
}
