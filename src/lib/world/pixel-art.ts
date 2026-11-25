import { Rectangle, Texture } from "pixi.js";

import type { ClassId } from "@/lib/game/types";

import type { RoomTheme } from "./terrain";
import type { WeaponKind } from "./render";

type RGBA = [number, number, number, number];

const COLOR_CACHE = new Map<string, RGBA>();

function parseColor(color: string): RGBA {
  const cached = COLOR_CACHE.get(color);
  if (cached) return cached;
  let result: RGBA = [255, 255, 255, 255];
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      result = [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        255,
      ];
    } else if (hex.length >= 6) {
      result = [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        255,
      ];
    }
  } else {
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(",").map((part) => part.trim());
      result = [
        Number(parts[0]) || 0,
        Number(parts[1]) || 0,
        Number(parts[2]) || 0,
        parts[3] === undefined ? 255 : Math.round((Number(parts[3]) || 0) * 255),
      ];
    }
  }
  COLOR_CACHE.set(color, result);
  return result;
}

/**
 * 一个最小像素画布：所有图形都按整数像素栅格化，再由 Pixi 以 nearest 采样放大，
 * 得到真正的像素美术而不是平滑矢量。
 */
class PixelBuffer {
  readonly w: number;
  readonly h: number;
  private readonly pixels: (string | null)[];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.pixels = new Array(w * h).fill(null);
  }

  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.pixels[y * this.w + x] = color;
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    for (let py = y; py < y + h; py += 1) {
      for (let px = x; px < x + w; px += 1) this.set(px, py, color);
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, color);
      }
    }
  }

  polygon(points: [number, number][], color: string): void {
    if (points.length < 3) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y += 1) {
      for (let x = Math.floor(minX); x <= Math.ceil(maxX); x += 1) {
        if (this.contains(points, x + 0.5, y + 0.5)) this.set(x, y, color);
      }
    }
  }

  private contains(points: [number, number][], x: number, y: number): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const tx = Math.round(x1);
    const ty = Math.round(y1);
    const dx = Math.abs(tx - x);
    const dy = Math.abs(ty - y);
    const sx = x < tx ? 1 : -1;
    const sy = y < ty ? 1 : -1;
    let err = dx - dy;
    for (let guard = 0; guard < 512; guard += 1) {
      this.set(x, y, color);
      if (x === tx && y === ty) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** 给所有实心像素加 1px 外描边，像素美术的灵魂 */
  outline(color: string): void {
    const targets: [number, number][] = [];
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        if (this.pixels[y * this.w + x]) continue;
        const near =
          (x > 0 && this.pixels[y * this.w + x - 1]) ||
          (x < this.w - 1 && this.pixels[y * this.w + x + 1]) ||
          (y > 0 && this.pixels[(y - 1) * this.w + x]) ||
          (y < this.h - 1 && this.pixels[(y + 1) * this.w + x]);
        if (near) targets.push([x, y]);
      }
    }
    for (const [x, y] of targets) this.set(x, y, color);
  }

  toCanvas(scale: number): HTMLCanvasElement {
    const source = document.createElement("canvas");
    source.width = this.w;
    source.height = this.h;
    const ctx = source.getContext("2d");
    if (ctx) {
      const image = ctx.createImageData(this.w, this.h);
      for (let i = 0; i < this.pixels.length; i += 1) {
        const color = this.pixels[i];
        if (!color) continue;
        const [r, g, b, a] = parseColor(color);
        image.data[i * 4] = r;
        image.data[i * 4 + 1] = g;
        image.data[i * 4 + 2] = b;
        image.data[i * 4 + 3] = a;
      }
      ctx.putImageData(image, 0, 0);
    }
    if (scale === 1) return source;
    const out = document.createElement("canvas");
    out.width = this.w * scale;
    out.height = this.h * scale;
    const outCtx = out.getContext("2d");
    if (outCtx) {
      outCtx.imageSmoothingEnabled = false;
      outCtx.drawImage(source, 0, 0, out.width, out.height);
    }
    return out;
  }
}

function bufferTexture(buffer: PixelBuffer, scale = 2): Texture {
  const texture = Texture.from(buffer.toCanvas(scale));
  texture.source.scaleMode = "nearest";
  return texture;
}

/** 把多帧打包成一张 spritesheet，返回子纹理 */
function spritesheet(frames: PixelBuffer[], scale = 2): Texture[] {
  if (frames.length === 0) return [];
  const frameW = frames[0].w * scale;
  const frameH = frames[0].h * scale;
  const canvas = document.createElement("canvas");
  canvas.width = frameW * frames.length;
  canvas.height = frameH;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    frames.forEach((frame, index) => {
      ctx.drawImage(frame.toCanvas(scale), index * frameW, 0);
    });
  }
  const base = Texture.from(canvas);
  base.source.scaleMode = "nearest";
  return frames.map(
    (_, index) =>
      new Texture({
        source: base.source,
        frame: new Rectangle(index * frameW, 0, frameW, frameH),
      })
  );
}

/* ---------------------------------- 英雄 ---------------------------------- */

export type HeroParts = {
  head: Texture;
  torso: Texture;
  limb: Texture;
  weapon: Texture;
  glow: Texture;
};

const OUTLINE = "#0f172a";
const SKIN = "#f0c39b";
const SKIN_SHADOW = "#c98f66";
const STEEL = "#cbd5e1";
const STEEL_DARK = "#64748b";

function heroHead(classId: ClassId): Texture {
  const b = new PixelBuffer(14, 14);
  b.rect(4, 6, 6, 6, SKIN);
  b.rect(4, 10, 6, 2, SKIN_SHADOW);
  b.rect(5, 8, 2, 1, "#1f2937");
  b.rect(9, 8, 2, 1, "#1f2937");

  if (classId === "warrior") {
    b.rect(3, 2, 8, 5, STEEL);
    b.rect(3, 3, 8, 1, "#f1f5f9");
    b.rect(4, 7, 6, 3, SKIN);
    b.rect(3, 7, 1, 5, STEEL_DARK);
    b.rect(10, 7, 1, 5, STEEL_DARK);
    b.rect(6, 0, 2, 3, "#dc2626");
  } else if (classId === "mage") {
    b.polygon(
      [
        [7, 0],
        [2, 6],
        [12, 6],
      ],
      "#7c3aed"
    );
    b.rect(2, 6, 10, 2, "#a78bfa");
    b.rect(5, 8, 1, 2, "#c4b5fd");
  } else if (classId === "ranger") {
    b.polygon(
      [
        [7, 1],
        [2, 7],
        [12, 7],
      ],
      "#166534"
    );
    b.rect(2, 7, 10, 2, "#22c55e");
    b.rect(5, 9, 1, 1, "#4ade80");
  } else if (classId === "priest") {
    b.rect(3, 3, 8, 5, "#e7e5e4");
    b.rect(4, 0, 6, 1, "#facc15");
    b.rect(4, 8, 6, 2, "#f5f5f4");
    b.rect(5, 6, 1, 1, SKIN);
  } else if (classId === "assassin") {
    b.polygon(
      [
        [7, 0],
        [2, 7],
        [12, 7],
      ],
      "#312e81"
    );
    b.rect(3, 7, 8, 3, "#1e1b4b");
    b.rect(5, 8, 2, 1, "#a855f7");
    b.rect(9, 8, 1, 1, "#a855f7");
  } else {
    b.rect(3, 2, 8, 9, STEEL);
    b.rect(6, 1, 2, 10, "#0ea5e9");
    b.rect(4, 9, 6, 2, "#0f172a");
    b.rect(4, 10, 1, 1, "#22d3ee");
    b.rect(9, 10, 1, 1, "#22d3ee");
  }

  b.outline(OUTLINE);
  return bufferTexture(b);
}

function heroTorso(classId: ClassId): Texture {
  const b = new PixelBuffer(14, 14);
  const base = "#e2e8f0";
  const light = "#f8fafc";
  const shadow = "#94a3b8";

  if (classId === "mage" || classId === "priest") {
    b.polygon(
      [
        [6, 0],
        [8, 0],
        [12, 13],
        [2, 13],
      ],
      base
    );
    b.polygon(
      [
        [2, 10],
        [4, 10],
        [5, 13],
        [2, 13],
      ],
      shadow
    );
    b.rect(4, 1, 6, 2, light);
    b.rect(3, 9, 8, 1, "#475569");
  } else if (classId === "assassin") {
    b.rect(3, 2, 8, 9, base);
    b.rect(2, 2, 2, 4, shadow);
    b.rect(10, 2, 2, 4, shadow);
    b.rect(3, 10, 8, 2, "#334155");
    b.rect(4, 1, 6, 2, "#cbd5e1");
  } else if (classId === "guardian") {
    b.rect(2, 1, 10, 10, base);
    b.rect(1, 1, 3, 4, light);
    b.rect(10, 1, 3, 4, light);
    b.rect(3, 10, 8, 2, "#334155");
    b.rect(6, 2, 2, 8, "#cbd5e1");
  } else if (classId === "ranger") {
    b.rect(4, 2, 6, 9, base);
    b.rect(2, 1, 3, 3, shadow);
    b.rect(9, 1, 3, 3, shadow);
    b.rect(4, 10, 6, 2, "#334155");
    b.rect(5, 3, 4, 2, light);
  } else {
    b.rect(3, 1, 8, 10, base);
    b.rect(1, 1, 3, 4, light);
    b.rect(10, 1, 3, 4, light);
    b.rect(3, 10, 8, 2, "#334155");
    b.rect(5, 2, 4, 1, "#dc2626");
  }

  b.outline(OUTLINE);
  return bufferTexture(b);
}

function heroLimb(): Texture {
  const b = new PixelBuffer(4, 10);
  b.rect(1, 0, 2, 7, "#e2e8f0");
  b.rect(1, 0, 1, 4, "#f8fafc");
  b.rect(0, 7, 4, 3, "#334155");
  b.outline(OUTLINE);
  return bufferTexture(b);
}

function weaponArt(kind: WeaponKind): Texture {
  const b = new PixelBuffer(12, 26);
  if (kind === "sword") {
    b.polygon(
      [
        [6, 0],
        [8, 3],
        [8, 16],
        [6, 19],
        [4, 16],
        [4, 3],
      ],
      "#f1f5f9"
    );
    b.rect(5, 3, 1, 13, "#e2e8f0");
    b.rect(3, 16, 6, 2, "#cbd5e1");
    b.rect(5, 18, 2, 5, "#475569");
    b.rect(4, 23, 4, 2, "#cbd5e1");
  } else if (kind === "staff") {
    b.rect(5, 7, 2, 18, "#94a3b8");
    b.ellipse(6, 4, 3.5, 3.5, "#f8fafc");
    b.rect(4, 3, 1, 1, "#ffffff");
    b.rect(6, 22, 3, 1, "#64748b");
  } else if (kind === "bow") {
    b.line(4, 3, 8, 8, "#cbd5e1");
    b.line(8, 8, 8, 18, "#cbd5e1");
    b.line(8, 18, 4, 23, "#cbd5e1");
    b.line(4, 4, 7, 13, "#94a3b8");
    b.line(7, 13, 4, 22, "#94a3b8");
    b.rect(6, 12, 3, 1, "#f8fafc");
  } else {
    b.rect(5, 9, 2, 16, "#94a3b8");
    b.rect(2, 1, 8, 8, "#f1f5f9");
    b.rect(3, 2, 6, 6, "#cbd5e1");
    b.rect(1, 3, 1, 2, "#94a3b8");
    b.rect(10, 3, 1, 2, "#94a3b8");
    b.rect(4, 23, 4, 2, "#64748b");
  }
  b.outline(OUTLINE);
  return bufferTexture(b);
}

const heroPartCache = new Map<string, HeroParts>();

export function heroParts(classId: ClassId, weapon: WeaponKind): HeroParts {
  const key = `${classId}:${weapon}`;
  const cached = heroPartCache.get(key);
  if (cached) return cached;
  const parts: HeroParts = {
    head: heroHead(classId),
    torso: heroTorso(classId),
    limb: heroLimb(),
    weapon: weaponArt(weapon),
    glow: glowTexture(),
  };
  heroPartCache.set(key, parts);
  return parts;
}

/* --------------------------------- 怪物 --------------------------------- */

type MonsterPalette = {
  archetype:
    | "slime"
    | "wolf"
    | "goblin"
    | "skeleton"
    | "flame"
    | "demon"
    | "ghost"
    | "spider"
    | "golem"
    | "dragon";
  body: string;
  dark: string;
  light: string;
  eye: string;
  wings?: boolean;
};

const MONSTER_PALETTES: Record<string, MonsterPalette> = {
  slime: { archetype: "slime", body: "#4ade80", dark: "#15803d", light: "#bbf7d0", eye: "#0f172a" },
  wolf: { archetype: "wolf", body: "#6b7280", dark: "#374151", light: "#9ca3af", eye: "#f87171" },
  wolfking: { archetype: "wolf", body: "#7f1d1d", dark: "#450a0a", light: "#b91c1c", eye: "#fbbf24" },
  frost_wolf: { archetype: "wolf", body: "#7dd3fc", dark: "#0369a1", light: "#e0f2fe", eye: "#f0abfc" },
  goblin: { archetype: "goblin", body: "#65a30d", dark: "#3f6212", light: "#a3e635", eye: "#facc15" },
  spider: { archetype: "spider", body: "#7c3aed", dark: "#4c1d95", light: "#c4b5fd", eye: "#f87171" },
  bat: { archetype: "ghost", body: "#6d28d9", dark: "#3b0764", light: "#a78bfa", eye: "#f87171" },
  skeleton: { archetype: "skeleton", body: "#e5e7eb", dark: "#9ca3af", light: "#f8fafc", eye: "#111827" },
  death_knight: { archetype: "skeleton", body: "#94a3b8", dark: "#334155", light: "#e2e8f0", eye: "#ef4444" },
  golem: { archetype: "golem", body: "#6b7280", dark: "#374151", light: "#9ca3af", eye: "#fbbf24" },
  gargoyle: { archetype: "golem", body: "#64748b", dark: "#1e293b", light: "#94a3b8", eye: "#f87171", wings: true },
  cavegolem: { archetype: "golem", body: "#475569", dark: "#0f172a", light: "#64748b", eye: "#38bdf8" },
  guardian: { archetype: "golem", body: "#334155", dark: "#0f172a", light: "#64748b", eye: "#38bdf8" },
  frost_giant: { archetype: "golem", body: "#a5f3fc", dark: "#0e7490", light: "#ecfeff", eye: "#0ea5e9" },
  ghost: { archetype: "ghost", body: "rgba(226,232,240,0.78)", dark: "rgba(148,163,184,0.8)", light: "#f8fafc", eye: "#f87171" },
  shadow_lord: { archetype: "ghost", body: "rgba(76,29,149,0.85)", dark: "rgba(46,16,101,0.9)", light: "#a78bfa", eye: "#f87171" },
  void_apostle: { archetype: "ghost", body: "rgba(30,64,175,0.85)", dark: "rgba(15,23,42,0.9)", light: "#67e8f9", eye: "#f0abfc" },
  fire: { archetype: "flame", body: "#f97316", dark: "#c2410c", light: "#fde047", eye: "#111827" },
  lavabeast: { archetype: "flame", body: "#ea580c", dark: "#7c2d12", light: "#fbbf24", eye: "#fef3c7" },
  lava_tyrant: { archetype: "flame", body: "#dc2626", dark: "#7f1d1d", light: "#fb923c", eye: "#fef08a" },
  demon: { archetype: "demon", body: "#7f1d1d", dark: "#450a0a", light: "#b91c1c", eye: "#fbbf24" },
  dragon: { archetype: "dragon", body: "#b91c1c", dark: "#7f1d1d", light: "#f87171", eye: "#facc15" },
  abyss_dragon: { archetype: "dragon", body: "#1e40af", dark: "#172554", light: "#60a5fa", eye: "#67e8f9" },
  ancient_dragon: { archetype: "dragon", body: "#d97706", dark: "#78350f", light: "#fde68a", eye: "#fff7ed" },
};

function drawMonsterFrame(p: MonsterPalette, frame: number): PixelBuffer {
  const b = new PixelBuffer(32, 32);
  const step = frame === 0 ? 0 : 1;

  switch (p.archetype) {
    case "slime": {
      const squash = frame === 0 ? 0 : 1;
      b.ellipse(16, 22, 10 + squash, 6 - squash, p.body);
      b.ellipse(16, 22, 10 + squash, 6 - squash, p.body);
      b.ellipse(12, 18, 3, 2, p.light);
      b.rect(11, 21, 2, 2, p.eye);
      b.rect(19, 21, 2, 2, p.eye);
      b.rect(15, 25, 3, 1, p.dark);
      break;
    }
    case "wolf": {
      b.line(6, 19, 1, 14, p.dark);
      b.line(1, 14, 0, 16, p.dark);
      b.ellipse(15, 21, 9, 5, p.body);
      b.rect(10, 24, 3, 5 - step, p.dark);
      b.rect(18, 24, 3, 4 + step, p.dark);
      b.ellipse(23, 16, 5, 4.5, p.light);
      b.polygon(
        [
          [19, 13],
          [20, 9],
          [22, 13],
        ],
        p.light
      );
      b.polygon(
        [
          [24, 12],
          [26, 8],
          [27, 13],
        ],
        p.light
      );
      b.rect(25, 16, 2, 2, p.eye);
      b.rect(20, 5, 2, 8, p.dark);
      b.rect(8, 17, 8, 2, p.light);
      break;
    }
    case "goblin": {
      b.rect(11, 22, 3, 6 - step, p.dark);
      b.rect(18, 22, 3, 5 + step, p.dark);
      b.rect(10, 15, 12, 8, p.body);
      b.rect(11, 16, 3, 6, p.light);
      b.ellipse(16, 10, 6, 5, p.light);
      b.polygon(
        [
          [10, 9],
          [4, 6],
          [9, 13],
        ],
        p.body
      );
      b.polygon(
        [
          [22, 9],
          [28, 6],
          [23, 13],
        ],
        p.body
      );
      b.rect(13, 9, 2, 2, p.eye);
      b.rect(18, 9, 2, 2, p.eye);
      b.rect(24, 14, 2, 10, "#78350f");
      b.rect(23, 12, 4, 3, "#a16207");
      break;
    }
    case "skeleton": {
      b.ellipse(16, 8, 5, 5, p.body);
      b.rect(12, 12, 8, 2, p.dark);
      b.rect(13, 7, 2, 3, p.eye);
      b.rect(18, 7, 2, 3, p.eye);
      b.rect(15, 22, 2, 8 - step, p.body);
      b.rect(15, 15, 2, 7, p.body);
      for (let i = 0; i < 3; i += 1) b.rect(11, 16 + i * 3, 10, 1, p.body);
      b.rect(19, 18, 2, 8 - step, p.body);
      b.line(22, 19, 27, 12, p.light);
      b.line(27, 12, 29, 14, p.light);
      break;
    }
    case "flame": {
      const flicker = frame === 0 ? 0 : 1;
      b.ellipse(16, 21, 9, 9 + flicker, p.body);
      b.ellipse(16, 19, 6, 7 + flicker, p.light);
      b.ellipse(16, 17, 3, 4, "#fefce8");
      b.rect(13, 20, 2, 2, p.eye);
      b.rect(18, 20, 2, 2, p.eye);
      break;
    }
    case "demon": {
      b.polygon(
        [
          [8, 18],
          [0, 10],
          [5, 24],
        ],
        p.dark
      );
      b.polygon(
        [
          [24, 18],
          [32, 10],
          [27, 24],
        ],
        p.dark
      );
      b.ellipse(16, 19, 7, 9, p.body);
      b.line(13, 10, 11, 5, p.light);
      b.line(19, 10, 21, 5, p.light);
      b.rect(13, 17, 2, 2, p.eye);
      b.rect(18, 17, 2, 2, p.eye);
      b.rect(11, 27, 3, 4 - step, p.dark);
      b.rect(19, 27, 3, 3 + step, p.dark);
      break;
    }
    case "ghost": {
      const bob = frame === 0 ? 0 : -1;
      b.polygon(
        [
          [10, 17 + bob],
          [0, 11 + bob],
          [4, 26 + bob],
        ],
        p.dark
      );
      b.polygon(
        [
          [22, 17 + bob],
          [32, 11 + bob],
          [28, 26 + bob],
        ],
        p.dark
      );
      b.ellipse(16, 18 + bob, 7, 9, p.body);
      b.ellipse(16, 27 + bob, 6, 3, p.body);
      b.rect(13, 16 + bob, 2, 2, p.eye);
      b.rect(18, 16 + bob, 2, 2, p.eye);
      break;
    }
    case "spider": {
      for (let i = 0; i < 4; i += 1) {
        const dx = -10 + i * 7;
        b.line(16, 21, 16 + dx, 12 + (i % 2) * 2, p.dark);
        b.line(16, 21, 16 + dx, 29, p.dark);
      }
      b.ellipse(16, 22, 8, 6, p.body);
      b.ellipse(16, 15, 4, 3, p.light);
      b.rect(13, 14, 2, 2, p.eye);
      b.rect(18, 14, 2, 2, p.eye);
      b.rect(10, 25, 2, 5 - step, p.dark);
      b.rect(21, 25, 2, 4 + step, p.dark);
      break;
    }
    case "golem": {
      b.rect(8, 15, 16, 11, p.body);
      b.rect(11, 7, 10, 7, p.light);
      b.rect(5, 16, 3, 10 - step, p.dark);
      b.rect(24, 16, 3, 9 + step, p.dark);
      b.rect(11, 24, 4, 6, p.dark);
      b.rect(18, 24, 4, 6, p.dark);
      b.rect(9, 17, 14, 2, p.light);
      b.rect(13, 10, 2, 2, p.eye);
      b.rect(18, 10, 2, 2, p.eye);
      if (p.wings) {
        b.polygon(
          [
            [8, 16],
            [0, 9],
            [4, 21],
          ],
          p.dark
        );
        b.polygon(
          [
            [24, 16],
            [32, 9],
            [28, 21],
          ],
          p.dark
        );
      }
      break;
    }
    case "dragon": {
      const flap = frame === 0 ? 0 : 2;
      b.polygon(
        [
          [12, 18],
          [1, 8 - flap],
          [6, 23],
        ],
        p.dark
      );
      b.polygon(
        [
          [20, 18],
          [31, 8 - flap],
          [26, 23],
        ],
        p.dark
      );
      b.line(8, 23, 2, 27, p.dark);
      b.ellipse(15, 21, 9, 6, p.body);
      b.ellipse(22, 13, 5, 5, p.light);
      b.rect(19, 9, 2, 1, p.eye);
      b.line(21, 8, 20, 4, p.light);
      b.line(25, 8, 26, 4, p.light);
      b.rect(10, 25, 4, 4, p.dark);
      b.rect(18, 25, 4, 4, p.dark);
      break;
    }
  }

  b.outline(OUTLINE);
  return b;
}

const monsterCache = new Map<string, Texture[]>();

export function monsterFrames(kind: string): Texture[] {
  const cached = monsterCache.get(kind);
  if (cached) return cached;
  const palette = MONSTER_PALETTES[kind] ?? {
    archetype: "slime" as const,
    body: "#94a3b8",
    dark: "#475569",
    light: "#e2e8f0",
    eye: "#f87171",
  };
  const frames = spritesheet([drawMonsterFrame(palette, 0), drawMonsterFrame(palette, 1)]);
  monsterCache.set(kind, frames);
  return frames;
}

/* --------------------------------- 场景道具 -------------------------------- */

type ThemePalette = {
  ground: [string, string, string];
  groundEdge: string;
  water: string;
  waterLine: string;
  flower: string;
  tree: [string, string, string];
  trunk: string;
  rock: [string, string];
  bg: string;
};

const THEMES: Record<RoomTheme, ThemePalette> = {
  overworld: {
    ground: ["#1b4227", "#1d472b", "#1a3d24"],
    groundEdge: "#245133",
    water: "#1b4a72",
    waterLine: "#7dd3fc",
    flower: "#facc15",
    tree: ["#256b38", "#2f7a3f", "#3c9350"],
    trunk: "#5b3a1e",
    rock: ["#4b5563", "#6b7280"],
    bg: "#08160d",
  },
  forest: {
    ground: ["#163a22", "#183f25", "#14341f"],
    groundEdge: "#1f472c",
    water: "#1b4a72",
    waterLine: "#7dd3fc",
    flower: "#fde047",
    tree: ["#1f5c30", "#286b38", "#348045"],
    trunk: "#4a2f19",
    rock: ["#3f4650", "#5b6470"],
    bg: "#07130c",
  },
  cave: {
    ground: ["#20252d", "#242a33", "#1d222a"],
    groundEdge: "#2b333d",
    water: "#13384d",
    waterLine: "#67e8f9",
    flower: "#67e8f9",
    tree: ["#1f3b33", "#294a40", "#335a4d"],
    trunk: "#3f2a1d",
    rock: ["#4b5563", "#6b7280"],
    bg: "#090d13",
  },
  ruins: {
    ground: ["#262a30", "#2a2e35", "#22262c"],
    groundEdge: "#333941",
    water: "#1b4a72",
    waterLine: "#94a3b8",
    flower: "#facc15",
    tree: ["#57616e", "#6b7280", "#7c8794"],
    trunk: "#4b3728",
    rock: ["#4b5563", "#7c8794"],
    bg: "#0c0e12",
  },
  volcano: {
    ground: ["#2a1510", "#301812", "#24110d"],
    groundEdge: "#3d1c14",
    water: "#7c2d12",
    waterLine: "#fb923c",
    flower: "#fb923c",
    tree: ["#5c2c1b", "#6b3320", "#7c3d24"],
    trunk: "#3f2214",
    rock: ["#4a2118", "#6b2f1f"],
    bg: "#170906",
  },
};

export function themeBackground(theme: RoomTheme): string {
  return THEMES[theme].bg;
}

function treeArt(theme: RoomTheme): Texture {
  const palette = THEMES[theme];
  const b = new PixelBuffer(30, 40);
  b.rect(13, 22, 4, 18, palette.trunk);
  b.rect(13, 22, 1, 18, "#7c4a24");
  b.polygon(
    [
      [15, 0],
      [3, 16],
      [27, 16],
    ],
    palette.tree[2]
  );
  b.polygon(
    [
      [15, 6],
      [4, 22],
      [26, 22],
    ],
    palette.tree[1]
  );
  b.polygon(
    [
      [15, 12],
      [5, 28],
      [25, 28],
    ],
    palette.tree[0]
  );
  b.rect(11, 18, 3, 2, palette.tree[2]);
  b.rect(17, 24, 3, 2, palette.tree[2]);
  b.outline(OUTLINE);
  b.ellipse(15, 38, 10, 2, "rgba(0,0,0,0.28)");
  return bufferTexture(b);
}

function rockArt(theme: RoomTheme): Texture {
  const palette = THEMES[theme];
  const b = new PixelBuffer(24, 16);
  b.ellipse(12, 10, 10, 6, palette.rock[0]);
  b.ellipse(11, 8, 7, 5, palette.rock[1]);
  b.rect(7, 5, 3, 2, palette.rock[1]);
  if (theme === "volcano") b.rect(6, 4, 2, 2, "#fb923c");
  b.outline(OUTLINE);
  b.ellipse(12, 14, 10, 2, "rgba(0,0,0,0.26)");
  return bufferTexture(b);
}

const treeCache = new Map<RoomTheme, Texture>();
const rockCache = new Map<RoomTheme, Texture>();

export function treeTexture(theme: RoomTheme): Texture {
  let texture = treeCache.get(theme);
  if (!texture) {
    texture = treeArt(theme);
    treeCache.set(theme, texture);
  }
  return texture;
}

export function rockTexture(theme: RoomTheme): Texture {
  let texture = rockCache.get(theme);
  if (!texture) {
    texture = rockArt(theme);
    rockCache.set(theme, texture);
  }
  return texture;
}

function campfireFrames(): Texture[] {
  const frames: PixelBuffer[] = [];
  for (let frame = 0; frame < 2; frame += 1) {
    const b = new PixelBuffer(18, 20);
    b.rect(3, 14, 12, 2, "#78350f");
    b.rect(5, 12, 2, 6, "#92400e");
    b.rect(11, 12, 2, 6, "#92400e");
    b.ellipse(9, 11 - frame, 5, 7 + frame, "#f97316");
    b.ellipse(9, 11 - frame, 3, 5, "#fbbf24");
    b.ellipse(9, 12 - frame, 1.5, 3, "#fef3c7");
    b.outline(OUTLINE);
    frames.push(b);
  }
  return spritesheet(frames);
}

function npcArt(color: string): Texture {
  const b = new PixelBuffer(16, 30);
  b.rect(5, 22, 3, 7, "#1e293b");
  b.rect(9, 22, 3, 7, "#1e293b");
  b.rect(4, 12, 8, 11, color);
  b.rect(4, 13, 8, 2, "#f8fafc");
  b.rect(5, 4, 6, 6, SKIN);
  b.rect(5, 8, 1, 1, "#1f2937");
  b.rect(10, 8, 1, 1, "#1f2937");
  b.rect(4, 2, 8, 3, "#1e293b");
  b.rect(3, 5, 1, 2, "#1e293b");
  b.rect(12, 5, 1, 2, "#1e293b");
  b.outline(OUTLINE);
  return bufferTexture(b);
}

const npcCache = new Map<string, Texture>();

export function npcTexture(color: string): Texture {
  let texture = npcCache.get(color);
  if (!texture) {
    texture = npcArt(color);
    npcCache.set(color, texture);
  }
  return texture;
}

const campfire = { frames: null as Texture[] | null };

export function campfireTextures(): Texture[] {
  if (!campfire.frames) campfire.frames = campfireFrames();
  return campfire.frames;
}

export function dropTexture(kind: string): Texture {
  const key = `drop:${kind}`;
  const cached = dropCache.get(key);
  if (cached) return cached;
  const b = new PixelBuffer(14, 14);
  if (kind === "gold") {
    b.ellipse(7, 8, 5, 4.5, "#facc15");
    b.ellipse(7, 8, 3.5, 3, "#fde68a");
    b.rect(6, 5, 2, 1, "#fff7ed");
  } else if (kind === "item") {
    b.polygon(
      [
        [7, 1],
        [12, 7],
        [7, 13],
        [2, 7],
      ],
      "#60a5fa"
    );
    b.polygon(
      [
        [7, 3],
        [10, 7],
        [7, 11],
        [4, 7],
      ],
      "#bfdbfe"
    );
  } else {
    b.rect(4, 2, 6, 2, "#94a3b8");
    b.rect(4, 4, 6, 8, "#ef4444");
    b.rect(5, 6, 4, 4, "#f87171");
    b.rect(6, 7, 2, 2, "#fecaca");
  }
  b.outline(OUTLINE);
  const texture = bufferTexture(b);
  dropCache.set(key, texture);
  return texture;
}

const dropCache = new Map<string, Texture>();
const shadowTextureCache = { texture: null as Texture | null };
const pixelTextureCache = { texture: null as Texture | null };
const glowTextureCache = new Map<string, Texture>();

export function shadowTexture(): Texture {
  if (!shadowTextureCache.texture) {
    const b = new PixelBuffer(28, 12);
    b.ellipse(14, 6, 12, 5, "rgba(0,0,0,0.3)");
    b.ellipse(14, 6, 8, 3, "rgba(0,0,0,0.22)");
    shadowTextureCache.texture = bufferTexture(b);
  }
  return shadowTextureCache.texture;
}

export function pixelTexture(): Texture {
  if (!pixelTextureCache.texture) {
    const b = new PixelBuffer(4, 4);
    b.rect(0, 0, 4, 4, "#ffffff");
    pixelTextureCache.texture = bufferTexture(b, 1);
  }
  return pixelTextureCache.texture;
}

/** Canvas2D 径向渐变，用于叠加光晕（add 混合） */
export function glowTexture(color = "#ffffff"): Texture {
  const cached = glowTextureCache.get(color);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.35, `${color}66`);
    gradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = Texture.from(canvas);
  glowTextureCache.set(color, texture);
  return texture;
}

/* --------------------------------- 地块 --------------------------------- */

export type ThemeTiles = {
  ground: Texture[];
  water: Texture;
  flower: Texture;
};

function groundTile(theme: RoomTheme, shade: number): Texture {
  const palette = THEMES[theme];
  const b = new PixelBuffer(32, 16);
  const color = palette.ground[shade];
  for (let y = 0; y < 16; y += 1) {
    const half = y <= 8 ? (y + 1) * 2 : (16 - y) * 2;
    b.rect(16 - half, y, half * 2, 1, color);
  }
  // 顶部高光与底部阴影，形成清晰的等距格子
  for (let x = 0; x < 32; x += 1) {
    const topY = Math.abs(x - 15.5) / 2;
    b.set(x, Math.floor(topY), palette.groundEdge);
  }
  for (let i = 0; i < 10; i += 1) {
    const x = (shade * 7 + i * 11) % 28;
    const y = 3 + ((shade * 5 + i * 7) % 9);
    b.set(x + 2, y, shade === 1 ? palette.ground[0] : palette.ground[2]);
  }
  return bufferTexture(b);
}

function waterTile(theme: RoomTheme): Texture {
  const palette = THEMES[theme];
  const b = new PixelBuffer(32, 16);
  for (let y = 0; y < 16; y += 1) {
    const half = y <= 8 ? (y + 1) * 2 : (16 - y) * 2;
    b.rect(16 - half, y, half * 2, 1, palette.water);
  }
  b.rect(11, 7, 10, 1, palette.waterLine);
  b.rect(14, 10, 7, 1, palette.waterLine);
  b.rect(9, 5, 4, 1, palette.waterLine);
  return bufferTexture(b);
}

function flowerTile(theme: RoomTheme): Texture {
  const palette = THEMES[theme];
  const b = new PixelBuffer(32, 16);
  b.set(11, 8, palette.flower);
  b.set(12, 8, palette.flower);
  b.set(11, 9, palette.flower);
  b.set(20, 10, palette.flower);
  b.set(21, 10, palette.flower);
  b.set(20, 11, palette.flower);
  b.set(16, 6, palette.groundEdge);
  return bufferTexture(b);
}

const tileCache = new Map<RoomTheme, ThemeTiles>();

export function themeTiles(theme: RoomTheme): ThemeTiles {
  let tiles = tileCache.get(theme);
  if (!tiles) {
    tiles = {
      ground: [groundTile(theme, 0), groundTile(theme, 1), groundTile(theme, 2)],
      water: waterTile(theme),
      flower: flowerTile(theme),
    };
    tileCache.set(theme, tiles);
  }
  return tiles;
}
