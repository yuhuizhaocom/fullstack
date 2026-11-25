import { Texture } from "pixi.js";
import {
  glowTexture,
  rockTexture,
  shadowTexture,
  themeTiles,
  treeTexture,
  type ThemeTiles,
} from "@/lib/world/pixel-art";
import type { BuildingKind, UnitKind } from "./types";

type Ctx = CanvasRenderingContext2D;

function canvasTexture(w: number, h: number, draw: (ctx: Ctx) => void): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
  }
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}

type Palette = {
  skin: string;
  body: string;
  body2: string;
  pants: string;
  accent: string;
  weapon: string;
};

const PALETTES: Record<string, Palette> = {
  farmer: { skin: "#f2c48d", body: "#8b5a2b", body2: "#a9713a", pants: "#4d5f3a", accent: "#e0b552", weapon: "#c9d1d9" },
  hunter: { skin: "#7cb342", body: "#7f1d1d", body2: "#9a2a2a", pants: "#3f3f46", accent: "#f59e0b", weapon: "#d4d4d8" },
  militia: { skin: "#f2c48d", body: "#6b7280", body2: "#8b95a1", pants: "#3f3f46", accent: "#b45309", weapon: "#e5e7eb" },
  archer: { skin: "#f2c48d", body: "#3f6212", body2: "#4d7c0f", pants: "#365314", accent: "#a3e635", weapon: "#a16207" },
  golem: { skin: "#78716c", body: "#57534e", body2: "#8a8580", pants: "#44403c", accent: "#a8a29e", weapon: "#d6d3d1" },
  scout: { skin: "#c4b5fd", body: "#312e81", body2: "#3730a3", pants: "#1e1b4b", accent: "#818cf8", weapon: "#c7d2fe" },
  troll: { skin: "#94a3b8", body: "#334155", body2: "#475569", pants: "#1f2937", accent: "#22d3ee", weapon: "#78716c" },
  shaman: { skin: "#bae6fd", body: "#0e7490", body2: "#0891b2", pants: "#164e63", accent: "#67e8f9", weapon: "#a5f3fc" },
  sheep: { skin: "#f8fafc", body: "#e2e8f0", body2: "#f1f5f9", pants: "#94a3b8", accent: "#fda4af", weapon: "#cbd5e1" },
  pig: { skin: "#f9a8d4", body: "#f472b6", body2: "#fbcfe8", pants: "#be185d", accent: "#fb7185", weapon: "#f9a8d4" },
};

function drawCreature(kind: UnitKind): Texture {
  const spec = {
    farmerHero: { palette: "farmer", w: 18, h: 26, hat: true },
    hunterHero: { palette: "hunter", w: 19, h: 27, hat: false },
    militia: { palette: "militia", w: 17, h: 24, hat: false },
    archer: { palette: "archer", w: 17, h: 24, hat: true },
    golem: { palette: "golem", w: 24, h: 30, hat: false },
    shadowScout: { palette: "scout", w: 16, h: 24, hat: true },
    trollSlinger: { palette: "troll", w: 21, h: 27, hat: false },
    frostShaman: { palette: "shaman", w: 16, h: 25, hat: true },
    sheep: { palette: "sheep", w: 16, h: 14, hat: false },
    pig: { palette: "pig", w: 16, h: 14, hat: false },
    lumberjack: { palette: "farmer", w: 16, h: 23, hat: true },
    owl: { palette: "troll", w: 14, h: 14, hat: false },
    eyeWard: { palette: "hunter", w: 12, h: 16, hat: false },
  }[kind];
  const palette = PALETTES[spec.palette];
  const scale = 2;
  const w = spec.w * scale;
  const h = spec.h * scale;
  const isAnimal = kind === "sheep" || kind === "pig" || kind === "owl";
  const isGolem = kind === "golem";
  const isWard = kind === "eyeWard";

  return canvasTexture(w, h, (ctx) => {
    const px = (x: number, y: number, rw: number, rh: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, rw * scale, rh * scale);
    };
    const dark = "#1f2937";
    const W = spec.w;
    const H = spec.h;

    if (isWard) {
      px(W / 2 - 1, 2, 2, 10, dark);
      px(W / 2 - 3, 1, 6, 6, "#fbbf24");
      px(W / 2 - 1, 3, 2, 2, "#111827");
      px(W / 2 - 4, 12, 8, 2, "#7c2d12");
      return;
    }

    if (isAnimal) {
      // 四足身体 + 头
      px(2, 5, 9, 6, palette.body);
      px(2, 5, 9, 2, palette.body2);
      px(10, 3, 5, 5, palette.skin);
      px(13, 4, 1, 1, dark);
      px(11, 7, 3, 2, palette.accent);
      px(3, 11, 2, 3, palette.pants);
      px(8, 11, 2, 3, palette.pants);
      px(12, 10, 2, 2, palette.skin);
      if (kind === "owl") {
        px(1, 4, 3, 4, palette.accent);
        px(11, 4, 2, 3, palette.accent);
      }
      return;
    }

    // 腿
    px(4, H - 7, 3, 7, palette.pants);
    px(W - 7, H - 7, 3, 7, palette.pants);
    px(4, H - 2, 4, 2, dark);
    px(W - 8, H - 2, 4, 2, dark);
    // 躯干
    px(3, H - 15, W - 6, 9, palette.body);
    px(3, H - 15, W - 6, 2, palette.body2);
    px(W - 5, H - 13, 2, 6, dark);
    // 手臂
    px(1, H - 14, 3, 7, palette.body2);
    px(W - 4, H - 14, 3, 7, palette.body2);
    // 头
    px(W / 2 - 4, 4, 8, 7, palette.skin);
    px(W / 2 - 4, 4, 8, 2, palette.body2);
    px(W / 2 - 2, 7, 1, 1, dark);
    px(W / 2 + 2, 7, 1, 1, dark);
    // 帽子/兜帽
    if (spec.hat) {
      px(W / 2 - 5, 1, 10, 3, palette.accent);
      px(W / 2 - 4, 1, 7, 1, "#fde68a");
    }
    // 武器
    if (isGolem) {
      px(0, H - 20, 4, 10, palette.body2);
      px(W - 4, H - 20, 4, 10, palette.body2);
      px(W / 2 - 2, 0, 4, 4, palette.weapon);
    } else if (kind === "hunterHero" || kind === "lumberjack" || kind === "militia") {
      px(W - 2, H - 18, 2, 9, palette.weapon);
      px(W - 4, H - 18, 4, 2, palette.accent);
    } else if (kind === "archer") {
      px(W + 0, H - 18, 2, 10, palette.weapon);
      px(W - 2, H - 18, 4, 1, palette.accent);
    } else if (kind === "trollSlinger") {
      px(W + 0, H - 16, 3, 3, palette.weapon);
    } else if (kind === "frostShaman") {
      px(W - 2, H - 20, 3, 3, palette.accent);
    } else if (kind === "shadowScout") {
      px(W - 2, H - 16, 2, 6, palette.weapon);
    }
  });
}

const BUILDING_STYLE: Record<BuildingKind, { body: string; roof: string; accent: string; tall: number }> = {
  sheepFarm: { body: "#8b5a2b", roof: "#b45309", accent: "#fcd34d", tall: 12 },
  pigFarm: { body: "#7c4a24", roof: "#92400e", accent: "#f9a8d4", tall: 15 },
  woodWall: { body: "#92400e", roof: "#78350f", accent: "#d97706", tall: 8 },
  stoneWall: { body: "#78716c", roof: "#57534e", accent: "#a8a29e", tall: 9 },
  arrowTower: { body: "#a16207", roof: "#7f1d1d", accent: "#fbbf24", tall: 24 },
  cannonTower: { body: "#57534e", roof: "#374151", accent: "#f97316", tall: 22 },
  mageTower: { body: "#4c1d95", roof: "#6d28d9", accent: "#c4b5fd", tall: 24 },
  watchTower: { body: "#334155", roof: "#0f172a", accent: "#67e8f9", tall: 26 },
  tavern: { body: "#92400e", roof: "#7c2d12", accent: "#fbbf24", tall: 17 },
  warehouse: { body: "#854d0e", roof: "#713f12", accent: "#fde68a", tall: 15 },
  poisonTower: { body: "#3f6212", roof: "#1a2e05", accent: "#84cc16", tall: 22 },
  cheeseShop: { body: "#a16207", roof: "#ca8a04", accent: "#fef08a", tall: 12 },
  shadowNest: { body: "#312e81", roof: "#1e1b4b", accent: "#818cf8", tall: 10 },
  bombHut: { body: "#7f1d1d", roof: "#450a0a", accent: "#f87171", tall: 13 },
};

function drawBuilding(kind: BuildingKind): Texture {
  const style = BUILDING_STYLE[kind];
  const scale = 2;
  const W = 24;
  const H = 30;
  return canvasTexture(W * scale, H * scale, (ctx) => {
    const px = (x: number, y: number, rw: number, rh: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, rw * scale, rh * scale);
    };
    const dark = "#1c1917";
    // 等距底座
    for (let i = 0; i < 6; i += 1) {
      const inset = Math.abs(3 - i);
      px(4 + inset, H - 8 + i, 16 - inset * 2, 1, i < 3 ? "#8d7553" : "#6f5a3f");
    }
    px(7, H - 9, 10, 2, "#5b4630");

    const tall = style.tall;
    const baseY = H - 10;
    const bodyH = Math.max(6, Math.min(tall, 18));
    // 主体
    px(7, baseY - bodyH, 10, bodyH, style.body);
    px(7, baseY - bodyH, 2, bodyH, dark);
    px(17, baseY - bodyH, 1, bodyH, dark);
    // 屋顶
    if (kind === "woodWall" || kind === "stoneWall") {
      for (let i = 0; i < bodyH; i += 3) px(7, baseY - bodyH + i, 10, 1, style.accent);
      return;
    }
    px(5, baseY - bodyH - 5, 14, 5, style.roof);
    px(6, baseY - bodyH - 6, 12, 2, style.roof);
    px(9, baseY - bodyH - 4, 6, 2, style.accent);
    // 门/窗
    px(10, baseY - 6, 4, 6, dark);
    px(9, baseY - bodyH + 4, 2, 2, style.accent);
    px(15, baseY - bodyH + 4, 2, 2, style.accent);
    // 塔尖与旗
    if (tall >= 20) {
      px(11, baseY - bodyH - 12, 2, 7, style.body);
      px(10, baseY - bodyH - 15, 4, 3, style.accent);
      px(13, baseY - bodyH - 14, 4, 2, "#ef4444");
    }
    // 顶部小标记
    if (kind === "tavern") px(19, baseY - 14, 3, 3, "#fbbf24");
    if (kind === "cheeseShop") px(18, baseY - 12, 4, 4, "#fde047");
    if (kind === "bombHut") px(18, baseY - 13, 4, 4, "#ef4444");
    if (kind === "shadowNest") px(10, baseY - 2, 4, 2, "#0f0a1a");
    if (kind === "watchTower") px(18, baseY - 22, 3, 6, "#67e8f9");
  });
}

function drawBushTile(): Texture {
  return canvasTexture(32, 16, (ctx) => {
    const px = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    // 深色菱形
    for (let y = 0; y < 16; y += 1) {
      const half = y <= 8 ? (y + 1) * 2 : (16 - y) * 2;
      px(16 - half, y, half * 2, 1, y % 3 === 0 ? "#274d2b" : "#2f5c33");
    }
    // 灌木点缀
    for (let i = 0; i < 8; i += 1) {
      const x = 5 + ((i * 7) % 22);
      const y = 4 + ((i * 5) % 8);
      px(x, y, 2, 2, i % 2 === 0 ? "#4d7c0f" : "#3f6212");
    }
  });
}

export type HunterArt = {
  tiles: ThemeTiles;
  bush: Texture;
  tree: Texture;
  rock: Texture;
  shadow: Texture;
  campGlow: Texture;
  unit(kind: UnitKind): Texture;
  building(kind: BuildingKind): Texture;
};

let cached: HunterArt | null = null;

export function getHunterArt(): HunterArt {
  if (cached) return cached;
  const unitCache = new Map<UnitKind, Texture>();
  const buildingCache = new Map<BuildingKind, Texture>();
  cached = {
    tiles: themeTiles("forest"),
    bush: drawBushTile(),
    tree: treeTexture("forest"),
    rock: rockTexture("forest"),
    shadow: shadowTexture(),
    campGlow: glowTexture("#fbbf24"),
    unit(kind: UnitKind) {
      let texture = unitCache.get(kind);
      if (!texture) {
        texture = drawCreature(kind);
        unitCache.set(kind, texture);
      }
      return texture;
    },
    building(kind: BuildingKind) {
      let texture = buildingCache.get(kind);
      if (!texture) {
        texture = drawBuilding(kind);
        buildingCache.set(kind, texture);
      }
      return texture;
    },
  };
  return cached;
}
