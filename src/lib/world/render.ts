import { SPAWN_X, SPAWN_Y, terrainAt, TILE, WORLD_H, WORLD_W } from "./terrain";

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
    x: number;
    y: number;
    hp: number;
    maxHp: number;
  }[];
  drops: { id: string; x: number; y: number; heal: number }[];
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
};

type WeaponKind = "sword" | "staff" | "bow" | "mace";
type WeaponStyle = { kind: WeaponKind; color: string; glow?: string };

const WEAPON_STYLES: Record<string, WeaponStyle> = {
  wooden_sword: { kind: "sword", color: "#b45309" },
  iron_sword: { kind: "sword", color: "#cbd5e1" },
  flame_sword: { kind: "sword", color: "#fb923c", glow: "#f97316" },
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

function drawGroundTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  terrain: string,
  tx: number,
  ty: number,
  time: number
): void {
  const shade = (tx * 7 + ty * 13) % 3;
  const grass = ["#1b4227", "#1d472b", "#1a3d24"][shade];

  diamondPath(ctx, x, y, ISO_HALF_W, ISO_HALF_H);
  ctx.fillStyle = terrain === "water" ? "#1b4a72" : grass;
  ctx.fill();

  if (terrain === "flower") {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(x - 7, y - 3, 2, 2);
    ctx.fillRect(x + 6, y + 3, 2, 2);
  } else if (terrain === "water") {
    const wave = Math.sin(time / 600 + tx * 0.7 + ty * 0.4) * 4;
    ctx.strokeStyle = "rgba(125,211,252,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 16, y + wave);
    ctx.lineTo(x + 16, y + wave);
    ctx.stroke();
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 17, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5b3a1e";
  ctx.fillRect(x - 3, y - 30, 6, 30);

  ctx.fillStyle = "#256b38";
  ctx.beginPath();
  ctx.moveTo(x, y - 68);
  ctx.lineTo(x - 22, y - 36);
  ctx.lineTo(x + 22, y - 36);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#2f7a3f";
  ctx.beginPath();
  ctx.moveTo(x, y - 55);
  ctx.lineTo(x - 26, y - 24);
  ctx.lineTo(x + 26, y - 24);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#3c9350";
  ctx.beginPath();
  ctx.moveTo(x, y - 43);
  ctx.lineTo(x - 20, y - 15);
  ctx.lineTo(x + 20, y - 15);
  ctx.closePath();
  ctx.fill();
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#4b5563";
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6b7280";
  ctx.beginPath();
  ctx.ellipse(x - 3, y - 13, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#9ca3af";
  ctx.beginPath();
  ctx.ellipse(x - 6, y - 17, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.fillStyle = "rgba(254,240,138,0.9)";
  ctx.beginPath();
  ctx.ellipse(x, y - 18, 1.8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

const MINIMAP_SIZE = 88;
let minimapCache: HTMLCanvasElement | null = null;

function getMinimapCache(): HTMLCanvasElement {
  if (minimapCache) return minimapCache;
  const canvas = document.createElement("canvas");
  canvas.width = MINIMAP_SIZE;
  canvas.height = MINIMAP_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(8,22,13,0.9)";
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    const sx = MINIMAP_SIZE / WORLD_W;
    const sy = MINIMAP_SIZE / WORLD_H;
    for (let ty = 0; ty < WORLD_H; ty += 1) {
      for (let tx = 0; tx < WORLD_W; tx += 1) {
        const terrain = terrainAt(tx, ty);
        if (terrain === "tree") ctx.fillStyle = "rgba(34,90,50,0.9)";
        else if (terrain === "rock") ctx.fillStyle = "rgba(100,116,139,0.85)";
        else if (terrain === "water") ctx.fillStyle = "rgba(30,90,140,0.9)";
        else continue;
        ctx.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
  }
  minimapCache = canvas;
  return canvas;
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  width: number,
  meId: string,
  meX: number,
  meY: number,
  snapshot: RenderSnapshot | null,
  time: number
): void {
  const size = MINIMAP_SIZE;
  const x = width - size - 8;
  const y = 92;
  const sx = size / WORLD_W;
  const sy = size / WORLD_H;

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(getMinimapCache(), x, y);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(148,163,184,0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  ctx.strokeStyle = "rgba(134,239,172,0.55)";
  ctx.beginPath();
  ctx.arc(
    x + (SPAWN_X / TILE) * sx,
    y + (SPAWN_Y / TILE) * sy,
    (220 / TILE) * sx,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  for (const monster of snapshot?.monsters ?? []) {
    ctx.fillStyle = monster.boss ? "#e879f9" : "#f87171";
    ctx.beginPath();
    ctx.arc(
      x + (monster.x / TILE) * sx,
      y + (monster.y / TILE) * sy,
      monster.boss ? 3 : 1.8,
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
  const swingProgress =
    swingElapsed >= 0 && swingElapsed < 300 ? swingElapsed / 300 : -1;
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
    case "fire": {
      const flicker = Math.sin(time / 90) * 2;
      ctx.fillStyle = "rgba(249,115,22,0.92)";
      ctx.beginPath();
      ctx.ellipse(0, -14, 13, 15 + flicker, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(251,191,36,0.92)";
      ctx.beginPath();
      ctx.ellipse(0, -16, 8, 10 + flicker * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(254,240,138,0.95)";
      ctx.beginPath();
      ctx.ellipse(0, -18, 4, 5, 0, 0, Math.PI * 2);
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
    hp: number;
    maxHp: number;
  },
  flash: boolean,
  time: number
): void {
  const scale = monster.boss ? 1.45 : 1;

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 15 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = monster.boss
    ? "rgba(232,121,249,0.2)"
    : "rgba(248,113,113,0.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 19 * scale, 9.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (flash) ctx.filter = "brightness(1.85)";
  drawMonsterBody(ctx, monster.kind, time);
  ctx.filter = "none";
  ctx.restore();

  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = monster.boss ? "#f0abfc" : "#fca5a5";
  ctx.fillText(monster.name, x, y - (monster.boss ? 58 : 42));

  const barWidth = monster.boss ? 56 : 34;
  const barY = y - (monster.boss ? 53 : 37);
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(x - barWidth / 2, barY, barWidth, 3);
  ctx.fillStyle = monster.boss ? "#e879f9" : "#ef4444";
  ctx.fillRect(
    x - barWidth / 2,
    barY,
    barWidth * Math.max(0, monster.hp / monster.maxHp),
    3
  );
}

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

  if (
    skillId === "fireball" ||
    skillId === "thunderstorm" ||
    skillId === "arcane_flow"
  ) {
    const color =
      skillId === "arcane_flow"
        ? "#c084fc"
        : skillId === "thunderstorm"
          ? "#fde047"
          : "#fb923c";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y - 12, 10 + progress * 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - 12, 8 + progress * 26, 0, Math.PI * 2);
    ctx.fill();
  } else if (skillId === "earth_split") {
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(x, y, 12 + progress * 62, 6 + progress * 26, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#92400e";
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      const distance = 8 + progress * 52;
      ctx.fillRect(
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance * 0.45 - progress * 18,
        3,
        3
      );
    }
  } else if (
    skillId === "heal" ||
    skillId === "sanctuary" ||
    skillId === "judgment"
  ) {
    ctx.fillStyle = skillId === "judgment" ? "#fef9c3" : "#86efac";
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2 + progress * 2;
      const radius = 8 + progress * 20;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(angle) * radius,
        y - 8 - progress * 26 + Math.sin(angle) * 5,
        2.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 12, 8 + progress * 36, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawWorld(
  canvas: HTMLCanvasElement,
  input: {
    width: number;
    height: number;
    meId: string;
    meX: number;
    meY: number;
    meName: string;
    meHp: number;
    meMaxHp: number;
    meDir: number;
    meDead: boolean;
    meMoving: boolean;
    meSwingAt: number;
    meHurtAt: number;
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
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const scale = canvas.width / width;
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);

  const meIsoX = input.meX - input.meY;
  const meIsoY = (input.meX + input.meY) / 2;
  const isoMinX = -WORLD_H * TILE;
  const isoMaxX = WORLD_W * TILE;
  const isoMinY = 0;
  const isoMaxY = ((WORLD_W + WORLD_H) * TILE) / 2;
  const camX = Math.max(isoMinX, Math.min(isoMaxX - width, meIsoX - width / 2));
  const camY = Math.max(isoMinY, Math.min(isoMaxY - height, meIsoY - height / 2));

  ctx.fillStyle = "#08160d";
  ctx.fillRect(0, 0, width, height);

  const unproject = (sx: number, sy: number) => {
    const isoX = sx + camX;
    const isoY = sy + camY;
    return { x: isoY + isoX / 2, y: isoY - isoX / 2 };
  };
  const corners = [
    unproject(0, 0),
    unproject(width, 0),
    unproject(0, height),
    unproject(width, height),
  ];
  const minTx = Math.max(
    0,
    Math.floor(Math.min(...corners.map((corner) => corner.x)) / TILE) - 2
  );
  const maxTx = Math.min(
    WORLD_W - 1,
    Math.ceil(Math.max(...corners.map((corner) => corner.x)) / TILE) + 2
  );
  const minTy = Math.max(
    0,
    Math.floor(Math.min(...corners.map((corner) => corner.y)) / TILE) - 2
  );
  const maxTy = Math.min(
    WORLD_H - 1,
    Math.ceil(Math.max(...corners.map((corner) => corner.y)) / TILE) + 2
  );

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

      const terrain = terrainAt(tx, ty);
      drawGroundTile(ctx, screen.x, screen.y, terrain, tx, ty, input.time);

      if (terrain === "tree" || terrain === "rock") {
        entities.push({
          depth: wx + wy,
          draw: () => {
            if (terrain === "tree") drawTree(ctx, screen.x, screen.y);
            else drawRock(ctx, screen.x, screen.y);
          },
        });
      }
    }
  }

  const snapshot = input.snapshot;

  if (snapshot) {
    for (const drop of snapshot.drops) {
      const screen = toScreen(drop.x, drop.y, camX, camY);
      if (
        screen.x < -40 ||
        screen.y < -40 ||
        screen.x > width + 40 ||
        screen.y > height + 40
      ) {
        continue;
      }
      entities.push({
        depth: drop.x + drop.y,
        draw: () => {
          const bob = Math.sin(input.time / 300 + drop.x) * 3;
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.beginPath();
          ctx.ellipse(screen.x, screen.y + 2, 10, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(250,204,21,0.18)";
          ctx.beginPath();
          ctx.ellipse(screen.x, screen.y + 1, 13, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = "18px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.fillText("🧪", screen.x, screen.y + bob);
        },
      });
    }

    for (const monster of snapshot.monsters) {
      const screen = toScreen(monster.x, monster.y, camX, camY);
      if (
        screen.x < -60 ||
        screen.y < -60 ||
        screen.x > width + 60 ||
        screen.y > height + 60
      ) {
        continue;
      }
      const flashAt = input.flashes[monster.id];
      entities.push({
        depth: monster.x + monster.y,
        draw: () =>
          drawMonster(
            ctx,
            screen.x,
            screen.y,
            monster,
            !!flashAt && input.time - flashAt < 140,
            input.time
          ),
      });
    }

    for (const player of snapshot.players) {
      if (player.id === input.meId) continue;
      const screen = toScreen(player.x, player.y, camX, camY);
      if (
        screen.x < -60 ||
        screen.y < -60 ||
        screen.x > width + 60 ||
        screen.y > height + 60
      ) {
        continue;
      }
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

  const fireScreen = toScreen(SPAWN_X, SPAWN_Y, camX, camY);
  if (
    fireScreen.x > -60 &&
    fireScreen.x < width + 60 &&
    fireScreen.y > -60 &&
    fireScreen.y < height + 60
  ) {
    entities.push({
      depth: SPAWN_X + SPAWN_Y,
      draw: () => drawCampfire(ctx, fireScreen.x, fireScreen.y, input.time),
    });
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

  drawMinimap(ctx, width, input.meId, input.meX, input.meY, snapshot, input.time);
}
