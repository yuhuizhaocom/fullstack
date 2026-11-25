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
  mercenary: { skin: "#f2c48d", body: "#475569", body2: "#64748b", pants: "#1e293b", accent: "#f59e0b", weapon: "#e5e7eb" },
  golem: { skin: "#78716c", body: "#57534e", body2: "#8a8580", pants: "#44403c", accent: "#a8a29e", weapon: "#d6d3d1" },
  clone: { skin: "#6b7280", body: "#4b5563", body2: "#6b7280", pants: "#374151", accent: "#9ca3af", weapon: "#9ca3af" },
  chicken: { skin: "#f8fafc", body: "#fef3c7", body2: "#fde68a", pants: "#f59e0b", accent: "#ef4444", weapon: "#facc15" },
  sheep: { skin: "#f8fafc", body: "#e2e8f0", body2: "#f1f5f9", pants: "#94a3b8", accent: "#fda4af", weapon: "#cbd5e1" },
  pig: { skin: "#f9a8d4", body: "#f472b6", body2: "#fbcfe8", pants: "#be185d", accent: "#fb7185", weapon: "#f9a8d4" },
};

const CREATURE_SPEC: Record<
  UnitKind,
  { palette: string; w: number; h: number; hat: boolean; animal?: boolean; golem?: boolean }
> = {
  farmerHero: { palette: "farmer", w: 18, h: 26, hat: true },
  hunterHero: { palette: "hunter", w: 19, h: 27, hat: false },
  mercenary: { palette: "mercenary", w: 17, h: 25, hat: true },
  golem: { palette: "golem", w: 26, h: 32, hat: false, golem: true },
  golemClone: { palette: "clone", w: 20, h: 25, hat: false, golem: true },
  chicken: { palette: "chicken", w: 13, h: 12, hat: false, animal: true },
  sheep: { palette: "sheep", w: 16, h: 14, hat: false, animal: true },
  pig: { palette: "pig", w: 16, h: 14, hat: false, animal: true },
  eyeWard: { palette: "hunter", w: 12, h: 16, hat: false },
  mine: { palette: "clone", w: 12, h: 12, hat: false },
};

function drawCreature(kind: UnitKind): Texture {
  const spec = CREATURE_SPEC[kind];
  const palette = PALETTES[spec.palette];
  const scale = 2;
  const w = spec.w * scale;
  const h = spec.h * scale;

  return canvasTexture(w, h, (ctx) => {
    const px = (x: number, y: number, rw: number, rh: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, rw * scale, rh * scale);
    };
    const dark = "#1f2937";
    const W = spec.w;
    const H = spec.h;

    if (kind === "eyeWard") {
      px(W / 2 - 1, 2, 2, 10, dark);
      px(W / 2 - 3, 1, 6, 6, "#fbbf24");
      px(W / 2 - 1, 3, 2, 2, "#111827");
      px(W / 2 - 4, 12, 8, 2, "#7c2d12");
      return;
    }

    if (kind === "mine") {
      px(2, 7, 8, 4, "#374151");
      px(3, 6, 6, 1, "#6b7280");
      px(4, 4, 2, 3, "#111827");
      px(5, 2, 1, 2, "#f59e0b");
      px(6, 1, 1, 1, "#ef4444");
      return;
    }

    if (spec.animal) {
      // 四足身体 + 头（鸡、羊、猪的外形差异靠配色与细节）
      px(2, 5, 9, 6, palette.body);
      px(2, 5, 9, 2, palette.body2);
      px(10, 3, 5, 5, palette.skin);
      px(13, 4, 1, 1, dark);
      px(11, 7, 3, 2, palette.accent);
      px(3, 11, 2, 3, palette.pants);
      px(8, 11, 2, 3, palette.pants);
      px(12, 10, 2, 2, palette.skin);
      if (kind === "chicken") {
        // 鸡冠与尾羽
        px(13, 2, 2, 2, palette.accent);
        px(0, 3, 2, 3, palette.weapon);
        px(9, 6, 1, 1, dark);
      }
      if (kind === "sheep") {
        px(1, 4, 3, 4, palette.body2);
        px(14, 2, 2, 2, palette.skin);
      }
      if (kind === "pig") {
        px(11, 6, 4, 3, palette.accent);
        px(12, 7, 1, 1, dark);
        px(13, 7, 1, 1, dark);
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

    if (spec.hat) {
      px(W / 2 - 5, 1, 10, 3, palette.accent);
      px(W / 2 - 4, 1, 7, 1, "#fde68a");
    }

    if (spec.golem) {
      px(0, H - 20, 4, 10, palette.body2);
      px(W - 4, H - 20, 4, 10, palette.body2);
      px(W / 2 - 2, 0, 4, 4, palette.weapon);
      px(W / 2 - 1, 2, 2, 2, "#22d3ee");
    } else if (kind === "hunterHero") {
      px(W - 2, H - 18, 2, 9, palette.weapon);
      px(W - 4, H - 18, 4, 2, palette.accent);
      px(W / 2 - 5, 3, 10, 2, "#7f1d1d");
    } else if (kind === "farmerHero") {
      px(W - 2, H - 17, 2, 8, palette.weapon);
      px(W - 3, H - 18, 4, 2, palette.accent);
    } else if (kind === "mercenary") {
      px(W - 2, H - 19, 2, 10, palette.weapon);
      px(W - 4, H - 20, 5, 2, palette.accent);
      px(1, H - 16, 3, 4, "#94a3b8");
    }
  });
}

const BUILDING_STYLE: Record<BuildingKind, { body: string; roof: string; accent: string; tall: number; kind?: string }> = {
  chickenPen: { body: "#b45309", roof: "#92400e", accent: "#fde68a", tall: 8, kind: "pen" },
  sheepPen: { body: "#a16207", roof: "#854d0e", accent: "#f8fafc", tall: 9, kind: "pen" },
  pigPen: { body: "#9a3412", roof: "#7c2d12", accent: "#f9a8d4", tall: 10, kind: "pen" },
  woodWall: { body: "#92400e", roof: "#78350f", accent: "#d97706", tall: 10, kind: "wall" },
  barricade: { body: "#a16207", roof: "#78350f", accent: "#fbbf24", tall: 9, kind: "wall" },
  stoneWall: { body: "#78716c", roof: "#57534e", accent: "#a8a29e", tall: 10, kind: "wall" },
  ironWall: { body: "#4b5563", roof: "#374151", accent: "#cbd5e1", tall: 11, kind: "wall" },
  magicWall: { body: "#4338ca", roof: "#312e81", accent: "#a5b4fc", tall: 12, kind: "wall" },
  arrowTower: { body: "#a16207", roof: "#7f1d1d", accent: "#fbbf24", tall: 22, kind: "tower" },
  clearTower: { body: "#0e7490", roof: "#164e63", accent: "#a5f3fc", tall: 16, kind: "tower" },
  rocketTower: { body: "#7c2d12", roof: "#431407", accent: "#fb923c", tall: 20, kind: "tower" },
  boulderTower: { body: "#57534e", roof: "#292524", accent: "#d6d3d1", tall: 19, kind: "tower" },
  flameTower: { body: "#7f1d1d", roof: "#450a0a", accent: "#f87171", tall: 21, kind: "tower" },
  frostTower: { body: "#155e75", roof: "#083344", accent: "#67e8f9", tall: 21, kind: "tower" },
  researchLab: { body: "#3f3f46", roof: "#18181b", accent: "#a78bfa", tall: 15, kind: "lab" },
  golemFactory: { body: "#44403c", roof: "#292524", accent: "#f59e0b", tall: 17, kind: "factory" },
  hunterBarracks: { body: "#7c2d12", roof: "#431407", accent: "#fbbf24", tall: 16, kind: "tent" },
};

function drawBuilding(kind: BuildingKind): Texture {
  const style = BUILDING_STYLE[kind];
  const scale = 2;
  const W = 26;
  const H = 34;
  return canvasTexture(W * scale, H * scale, (ctx) => {
    const px = (x: number, y: number, rw: number, rh: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, rw * scale, rh * scale);
    };
    const dark = "#1c1917";

    if (style.kind === "wall") {
      // 墙：一堵带垛口的矮墙
      const wallH = 12;
      const baseY = H - 4;
      px(4, baseY - wallH, 18, wallH, style.body);
      px(4, baseY - wallH, 18, 2, style.roof);
      for (let i = 0; i < 5; i += 1) px(4 + i * 4, baseY - wallH - 3, 2, 4, style.body);
      px(5, baseY - wallH + 4, 16, 1, style.accent);
      px(5, baseY - wallH + 8, 16, 1, style.accent);
      if (kind === "magicWall") {
        px(6, baseY - wallH + 3, 14, 6, "#6366f1");
        px(8, baseY - wallH + 4, 3, 2, "#e0e7ff");
        px(15, baseY - wallH + 6, 3, 2, "#e0e7ff");
      }
      return;
    }

    if (style.kind === "pen") {
      // 动物窝：围栏 + 小棚
      const baseY = H - 5;
      px(4, baseY - 8, 18, 3, style.body);
      for (let i = 0; i < 6; i += 1) px(4 + i * 3, baseY - 14, 1, 7, style.accent);
      px(4, baseY - 14, 18, 1, style.accent);
      px(9, baseY - 12, 8, 8, style.body);
      px(8, baseY - 15, 10, 3, style.roof);
      px(11, baseY - 8, 4, 4, dark);
      return;
    }

    if (style.kind === "tent") {
      // 猎人兵营：大帐篷
      const baseY = H - 4;
      for (let i = 0; i < 10; i += 1) {
        px(3 + i, baseY - 20 + i, 20 - i * 2, 2, i % 2 === 0 ? style.body : style.roof);
      }
      px(11, baseY - 16, 4, 8, dark);
      px(12, baseY - 30, 2, 8, style.accent);
      px(14, baseY - 30, 5, 3, "#ef4444");
      return;
    }

    // 底座
    for (let i = 0; i < 6; i += 1) {
      const inset = Math.abs(3 - i);
      px(4 + inset, H - 8 + i, 18 - inset * 2, 1, i < 3 ? "#8d7553" : "#6f5a3f");
    }
    px(8, H - 9, 10, 2, "#5b4630");

    const tall = style.tall;
    const baseY = H - 10;
    const bodyH = Math.max(6, Math.min(tall, 18));
    px(7, baseY - bodyH, 12, bodyH, style.body);
    px(7, baseY - bodyH, 2, bodyH, dark);
    px(18, baseY - bodyH, 1, bodyH, dark);
    px(5, baseY - bodyH - 5, 16, 5, style.roof);
    px(6, baseY - bodyH - 7, 14, 2, style.roof);
    px(9, baseY - bodyH - 5, 8, 2, style.accent);
    px(11, baseY - 6, 4, 6, dark);
    px(9, baseY - bodyH + 4, 2, 2, style.accent);
    px(16, baseY - bodyH + 4, 2, 2, style.accent);

    if (style.kind === "tower") {
      px(12, baseY - bodyH - 14, 2, 9, style.body);
      px(11, baseY - bodyH - 17, 4, 3, style.accent);
      px(14, baseY - bodyH - 16, 5, 2, "#ef4444");
      if (kind === "rocketTower") px(18, baseY - bodyH + 2, 3, 5, "#fb923c");
      if (kind === "frostTower") px(18, baseY - bodyH + 2, 3, 5, "#a5f3fc");
      if (kind === "flameTower") px(18, baseY - bodyH + 2, 3, 5, "#f87171");
      if (kind === "boulderTower") px(9, baseY - bodyH - 2, 4, 4, "#78716c");
      if (kind === "clearTower") px(8, baseY - bodyH + 1, 3, 4, "#e0f2fe");
    }

    if (style.kind === "lab") {
      px(9, baseY - bodyH - 9, 8, 4, style.accent);
      px(11, baseY - bodyH - 12, 4, 3, "#c4b5fd");
    }

    if (style.kind === "factory") {
      px(18, baseY - bodyH - 12, 3, 12, "#57534e");
      px(19, baseY - bodyH - 15, 2, 3, "#a8a29e");
      px(10, baseY - bodyH - 3, 6, 3, style.accent);
      px(19, baseY - 10, 5, 6, "#292524");
    }
  });
}

function drawBushTile(): Texture {
  return canvasTexture(32, 16, (ctx) => {
    const px = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    for (let y = 0; y < 16; y += 1) {
      const half = y <= 8 ? (y + 1) * 2 : (16 - y) * 2;
      px(16 - half, y, half * 2, 1, y % 3 === 0 ? "#274d2b" : "#2f5c33");
    }
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
