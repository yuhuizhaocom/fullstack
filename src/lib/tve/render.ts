// 俯视 Canvas2D 渲染：贴图精灵 + 程序化地形/特效 + 昼夜滤镜。

import {
  BUILD_RADIUS_TILES,
  BUILD_SPECS,
  MAP_CENTER,
  MAP_DATA,
  MAP_SIZE,
  POND,
  TILE,
  baseWorld,
  BASE_SITES,
} from "./config";
import type { Building, BuildingKind, Camera, Faction, GameState } from "./types";
import type { TveAssets } from "./assets";

export interface RenderView {
  cam: Camera;
  width: number;
  height: number;
  selectedId: number | null;
  placing: { kind: BuildingKind; gx: number; gy: number; ok: boolean } | null;
  faction: Faction;
}

const SPRITE_WIDTH: Record<string, number> = {
  tree: 264,
  mine: 132,
  wall: 84,
  arrow: 110,
  magic: 116,
  propTree: 158,
  propRock: 82,
  troll: 132,
  villager: 40,
};

const SPRITE_ANCHOR: Record<string, number> = {
  tree: 62,
  mine: 30,
  wall: 22,
  arrow: 28,
  magic: 30,
  propTree: 30,
  propRock: 14,
  troll: 8,
  villager: 2,
};

const FALLBACK_COLOR: Record<string, string> = {
  tree: "#2f6b3a",
  mine: "#9b7b3f",
  wall: "#8a6a44",
  arrow: "#7a5c3a",
  magic: "#8ec5ff",
  propTree: "#2c5a33",
  propRock: "#7d7f76",
  troll: "#5f8f3f",
  villager: "#cfe8a0",
};

const patternCache = new WeakMap<TveAssets, { grass: CanvasPattern | null; dirt: CanvasPattern | null }>();

function getPatterns(ctx: CanvasRenderingContext2D, assets: TveAssets) {
  let cached = patternCache.get(assets);
  if (!cached) {
    const grass = assets.terrain.grass ? ctx.createPattern(assets.terrain.grass, "repeat") : null;
    const dirt = assets.terrain.dirt ? ctx.createPattern(assets.terrain.dirt, "repeat") : null;
    // 原图 512px，直接平铺会让草叶大到失真，等比缩小到约 4 格重复一次
    if (typeof DOMMatrix !== "undefined") {
      grass?.setTransform(new DOMMatrix([0.42, 0, 0, 0.42, 0, 0]));
      dirt?.setTransform(new DOMMatrix([0.55, 0, 0, 0.55, 0, 0]));
    }
    cached = { grass, dirt };
    patternCache.set(assets, cached);
  }
  return cached;
}

interface DrawBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  assets: TveAssets,
  key: string,
  x: number,
  y: number,
  alpha = 1,
  flash = 0,
): DrawBox {
  const canvas = assets.sprites[key];
  const targetWidth = SPRITE_WIDTH[key] ?? 80;
  const anchor = SPRITE_ANCHOR[key] ?? 0;
  if (!canvas) {
    const size = targetWidth * 0.7;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = FALLBACK_COLOR[key] ?? "#6b7280";
    ctx.beginPath();
    ctx.ellipse(x, y - size * 0.3, size * 0.5, size * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return { left: x - size / 2, top: y - size * 0.9, width: size, height: size * 0.9 };
  }
  const height = (targetWidth * canvas.height) / canvas.width;
  const left = x - targetWidth / 2;
  const top = y + anchor - height;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (flash > 0) {
    ctx.filter = "brightness(1.9) saturate(0.7)";
  }
  ctx.drawImage(canvas, left, top, targetWidth, height);
  ctx.restore();
  return { left, top, width: targetWidth, height };
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, alpha = 0.24) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.42, w * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  ratio: number,
  color: string,
  height = 5,
) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, height + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x - width / 2, y, width * Math.max(0, Math.min(1, ratio)), height);
  ctx.restore();
}

function drawRoads(ctx: CanvasRenderingContext2D, patterns: { dirt: CanvasPattern | null }) {
  const center = MAP_CENTER;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = patterns.dirt ?? "#7a6244";
  ctx.lineWidth = 92;
  for (const site of BASE_SITES) {
    const p = baseWorld(site);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.quadraticCurveTo((center.x + p.x) / 2 + (p.y - center.y) * 0.18, (center.y + p.y) / 2, p.x, p.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#d9c191";
  ctx.lineWidth = 6;
  for (const site of BASE_SITES) {
    const p = baseWorld(site);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.quadraticCurveTo((center.x + p.x) / 2 + (p.y - center.y) * 0.18, (center.y + p.y) / 2, p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPond(ctx: CanvasRenderingContext2D, time: number) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(POND.x, POND.y, POND.rx, POND.ry, 0, 0, Math.PI * 2);
  const gradient = ctx.createRadialGradient(POND.x, POND.y, POND.ry * 0.2, POND.x, POND.y, POND.rx);
  gradient.addColorStop(0, "#1f5f75");
  gradient.addColorStop(0.7, "#174a5e");
  gradient.addColorStop(1, "#123b4a");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = "rgba(180, 235, 255, 0.22)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const t = (time * 0.25 + i * 0.25) % 1;
    ctx.beginPath();
    ctx.ellipse(POND.x - POND.rx * 0.2 + i * 22, POND.y - POND.ry * 0.15 + i * 14, POND.rx * (0.2 + t * 0.6), POND.ry * (0.16 + t * 0.5), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  assets: TveAssets,
  key: string,
  x: number,
  y: number,
  scale: number,
) {
  drawShadow(ctx, x, y + 2, (SPRITE_WIDTH[key] ?? 80) * scale * 0.9, 0.2);
  const canvas = assets.sprites[key];
  if (canvas) {
    const w = (SPRITE_WIDTH[key] ?? 80) * scale;
    const h = (w * canvas.height) / canvas.width;
    const anchor = (SPRITE_ANCHOR[key] ?? 0) * scale;
    ctx.drawImage(canvas, x - w / 2, y + anchor - h, w, h);
  } else {
    ctx.fillStyle = FALLBACK_COLOR[key] ?? "#3f5a3a";
    ctx.beginPath();
    ctx.arc(x, y - 22 * scale, 26 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, assets: TveAssets, b: Building, selected: boolean) {
  const progress = b.spawn > 0 ? 1 - b.spawn / 0.6 : 1;
  const scale = b.spawn > 0 ? 0.55 + 0.45 * progress : 1;
  const alpha = b.spawn > 0 ? 0.55 + 0.45 * progress : 1;
  drawShadow(ctx, b.x, b.y + 8, 92 * scale, 0.24);
  const box = drawSprite(ctx, assets, b.kind, b.x, b.y + (1 - scale) * 30, alpha, b.flash);
  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,233,163,0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 14, (BUILD_SPECS[b.kind].size * TILE) / 2 + 12, 20, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const showBar = b.hp < b.maxHp || selected || b.kind === "tree";
  if (showBar) {
    const w = b.kind === "tree" ? 120 : 56;
    const ratio = b.hp / b.maxHp;
    drawBar(ctx, b.x, box.top - 10, w, ratio, ratio > 0.5 ? "#79d97c" : ratio > 0.25 ? "#f0c46a" : "#ef6b6b", b.kind === "tree" ? 6 : 5);
  }
}

function drawEntities(ctx: CanvasRenderingContext2D, state: GameState, assets: TveAssets, view: RenderView) {
  type Entry = { y: number; draw: (c: CanvasRenderingContext2D) => void };
  const entries: Entry[] = [];

  for (const b of state.buildings) {
    if (!b.alive) continue;
    entries.push({ y: b.y, draw: (c) => drawBuilding(c, assets, b, view.selectedId === b.id) });
  }
  for (const v of state.villagers) {
    if (v.dead) continue;
    entries.push({
      y: v.y,
      draw: (c) => {
        drawShadow(c, v.x, v.y + 2, 34, 0.22);
        const box = drawSprite(c, assets, "villager", v.x, v.y, 1, v.flash);
        if (v.hp < v.maxHp) drawBar(c, v.x, box.top - 6, 24, v.hp / v.maxHp, "#79d97c", 3);
      },
    });
  }
  if (state.troll.hp > 0) {
    entries.push({
      y: state.troll.y,
      draw: (c) => {
        drawShadow(c, state.troll.x, state.troll.y + 4, 106, 0.3);
        const box = drawSprite(c, assets, "troll", state.troll.x, state.troll.y, 1, state.troll.flash);
        const ratio = state.troll.hp / state.troll.maxHp;
        drawBar(c, state.troll.x, box.top - 10, 100, ratio, "#ef6b6b", 7);
        if (state.troll.rushTime > 0) {
          c.save();
          c.strokeStyle = "rgba(255,212,121,0.65)";
          c.lineWidth = 3;
          c.beginPath();
          c.ellipse(state.troll.x, state.troll.y + 6, 34, 12, 0, 0, Math.PI * 2);
          c.stroke();
          c.restore();
        }
      },
    });
  }

  entries.sort((a, b) => a.y - b.y);
  for (const entry of entries) entry.draw(ctx);
}

function drawEffects(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const e of state.effects) {
    const p = Math.min(1, e.t / e.dur);
    ctx.save();
    if (e.kind === "slash") {
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = 0.85 * (1 - p);
      ctx.lineWidth = 9 * (1 - p * 0.5);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.75, -0.6, 0.7);
      ctx.stroke();
    } else if (e.kind === "boom") {
      const r = e.radius * (0.45 + p * 0.75);
      const g = ctx.createRadialGradient(e.x, e.y, r * 0.1, e.x, e.y, r);
      g.addColorStop(0, e.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.65 * (1 - p);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === "ring") {
      ctx.globalAlpha = 0.9 * (1 - p);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * (0.4 + p), 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.kind === "dust") {
      ctx.globalAlpha = 0.7 * (1 - p);
      ctx.fillStyle = e.color;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + e.angle;
        const r = e.radius * (0.3 + p * 0.9);
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.5 - p * 14, 3 + p * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (e.kind === "heal") {
      ctx.globalAlpha = 0.85 * (1 - p);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const r = e.radius * (0.4 + p * 0.7);
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.6, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  for (const a of state.arrows) {
    const p = Math.min(1, a.t / a.dur);
    const x = a.x + (a.tx - a.x) * p;
    const y = a.y + (a.ty - a.y) * p - Math.sin(p * Math.PI) * 26;
    ctx.save();
    if (a.magic) {
      const g = ctx.createRadialGradient(x, y, 1, x, y, 14);
      g.addColorStop(0, "rgba(190,235,255,1)");
      g.addColorStop(1, "rgba(90,160,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#f1e3b5";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x + (a.tx - a.x) * Math.max(0, p - 0.18), a.y + (a.ty - a.y) * Math.max(0, p - 0.18) - Math.sin(Math.max(0, p - 0.18) * Math.PI) * 26);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const f of state.floats) {
    const p = f.t / f.dur;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.font = `700 ${f.size}px "PingFang SC", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(f.text, f.x, f.y - p * 34);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - p * 34);
    ctx.restore();
  }
}

function drawNightGlow(ctx: CanvasRenderingContext2D, state: GameState) {
  if (!state.night) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of state.buildings) {
    if (!b.alive) continue;
    if (b.kind !== "tree" && b.kind !== "magic") continue;
    const radius = b.kind === "tree" ? 190 : 120;
    const g = ctx.createRadialGradient(b.x, b.y - 20, 8, b.x, b.y - 20, radius);
    g.addColorStop(0, b.kind === "tree" ? "rgba(120,255,180,0.3)" : "rgba(120,190,255,0.32)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y - 20, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.troll.hp > 0) {
    const g = ctx.createRadialGradient(state.troll.x, state.troll.y - 40, 2, state.troll.x, state.troll.y - 40, 60);
    g.addColorStop(0, "rgba(255,90,70,0.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(state.troll.x, state.troll.y - 40, 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlacement(ctx: CanvasRenderingContext2D, state: GameState, assets: TveAssets, view: RenderView) {
  if (!view.placing) return;
  const { gx, gy, kind, ok } = view.placing;
  const x = (gx + 0.5) * TILE;
  const y = (gy + 0.5) * TILE;
  ctx.save();
  ctx.fillStyle = ok ? "rgba(110, 230, 140, 0.28)" : "rgba(240, 90, 90, 0.3)";
  ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
  ctx.strokeStyle = ok ? "rgba(140,255,170,0.9)" : "rgba(255,120,120,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(gx * TILE + 1, gy * TILE + 1, TILE - 2, TILE - 2);
  ctx.globalAlpha = 0.6;
  drawSprite(ctx, assets, kind, x, y + 20);
  ctx.restore();
}

export function drawGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  view: RenderView,
  assets: TveAssets,
  time: number,
) {
  const { width, height, cam } = view;
  ctx.fillStyle = "#101b10";
  ctx.fillRect(0, 0, width, height);

  const patterns = getPatterns(ctx, assets);
  const shakeX = (Math.random() - 0.5) * state.shake * 2;
  const shakeY = (Math.random() - 0.5) * state.shake * 2;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + shakeX / cam.zoom, -cam.y + shakeY / cam.zoom);

  const vw = width / cam.zoom;
  const vh = height / cam.zoom;
  const left = cam.x - vw / 2;
  const top = cam.y - vh / 2;

  // 草地
  if (patterns.grass) {
    ctx.fillStyle = patterns.grass;
    ctx.fillRect(left - 64, top - 64, vw + 128, vh + 128);
    ctx.fillStyle = "rgba(28, 56, 30, 0.18)";
    ctx.fillRect(left - 64, top - 64, vw + 128, vh + 128);
  } else {
    ctx.fillStyle = "#2c4429";
    ctx.fillRect(left - 64, top - 64, vw + 128, vh + 128);
  }

  drawPlacementGround(ctx, state, view);
  drawRoads(ctx, patterns);
  drawPond(ctx, time);

  // 静态树木与岩石
  const props: { y: number; draw: () => void }[] = [];
  for (const tree of MAP_DATA.trees) {
    props.push({
      y: tree.y,
      draw: () => drawProp(ctx, assets, "propTree", tree.x, tree.y, 0.9 + tree.variant * 0.08),
    });
  }
  for (const rock of MAP_DATA.rocks) {
    props.push({ y: rock.y, draw: () => drawProp(ctx, assets, "propRock", rock.x, rock.y, 0.9) });
  }
  props.sort((a, b) => a.y - b.y);
  for (const prop of props) prop.draw();

  drawEntities(ctx, state, assets, view);
  drawNightGlow(ctx, state);
  drawEffects(ctx, state);
  drawPlacement(ctx, state, assets, view);

  // 地图边界
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

  ctx.restore();

  // 昼夜滤镜
  const nightTint = state.night ? 0.34 : 0.03;
  ctx.save();
  ctx.fillStyle = state.night ? `rgba(18, 28, 70, ${nightTint})` : `rgba(255, 220, 150, ${nightTint})`;
  ctx.fillRect(0, 0, width, height);
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, state.night ? "rgba(0,0,10,0.55)" : "rgba(0,0,0,0.38)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawPlacementGround(ctx: CanvasRenderingContext2D, state: GameState, view: RenderView) {
  if (!view.placing) return;
  const playerBase = state.bases[state.playerBase];
  if (!playerBase) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255,233,163,0.3)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.arc(playerBase.x, playerBase.y, BUILD_RADIUS_TILES * TILE, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function screenToWorld(view: RenderView, sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx - view.width / 2) / view.cam.zoom + view.cam.x,
    y: (sy - view.height / 2) / view.cam.zoom + view.cam.y,
  };
}

export function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState, size: number) {  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = state.night ? "#0e1712" : "#182a17";
  ctx.fillRect(0, 0, size, size);
  const scale = size / MAP_SIZE;

  ctx.fillStyle = "#1d4a5e";
  ctx.beginPath();
  ctx.ellipse(POND.x * scale, POND.y * scale, POND.rx * scale, POND.ry * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  for (const base of state.bases) {
    ctx.fillStyle = base.alive ? (base.isPlayer ? "#8ef2a0" : "#6fbf7a") : "#5a2a2a";
    ctx.beginPath();
    ctx.arc(base.x * scale, base.y * scale, base.isPlayer ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const b of state.buildings) {
    if (!b.alive || b.kind === "tree") continue;
    ctx.fillStyle = b.kind === "wall" ? "#b09060" : b.kind === "mine" ? "#ffd479" : "#cfe8ff";
    const s = b.kind === "mine" ? 2 : 1.6;
    ctx.fillRect(b.x * scale - s / 2, b.y * scale - s / 2, s, s);
  }

  if (state.troll.hp > 0) {
    ctx.save();
    ctx.fillStyle = state.night ? "#ff6b5a" : "#d8574a";
    ctx.shadowColor = "#ff6b5a";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(state.troll.x * scale, state.troll.y * scale, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
}
