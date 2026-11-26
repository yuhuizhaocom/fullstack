// 俯视 Canvas2D 渲染：贴图精灵 + 程序化建筑/单位 + 黑夜滤镜。

import {
  BASE_ROOMS,
  BUILD_SPECS,
  MAP_CENTER,
  MAP_DATA,
  MAP_SIZE,
  POND,
  TILE,
  roomGateWorld,
} from "./config";
import type { Building, BuildingKind, Camera, Elf, Faction, GameState, Troll } from "./types";
import type { TveAssets } from "./assets";

export interface RenderView {
  cam: Camera;
  width: number;
  height: number;
  selectedId: number | null;
  placing: { kind: BuildingKind; gx: number; gy: number; ok: boolean } | null;
  faction: Faction;
}

const SPRITE_FOR_KIND: Partial<Record<BuildingKind, string>> = {
  tree: "tree",
  goldmine: "mine",
  wall: "wall",
  grasswall: "wall",
  arrow: "arrow",
  moon: "magic",
};

const SPRITE_WIDTH: Record<string, number> = {
  tree: 236,
  mine: 104,
  wall: 84,
  arrow: 110,
  magic: 116,
  propTree: 158,
  propRock: 82,
  troll: 132,
  villager: 40,
  wisp: 22,
  repairer: 18,
};

const SPRITE_ANCHOR: Record<string, number> = {
  tree: 58,
  mine: 28,
  wall: 22,
  arrow: 28,
  magic: 30,
  propTree: 30,
  propRock: 14,
  troll: 8,
  villager: 2,
  wisp: 0,
  repairer: 0,
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
  scale = 1,
): DrawBox {
  const canvas = assets.sprites[key];
  const targetWidth = (SPRITE_WIDTH[key] ?? 80) * scale;
  const anchor = (SPRITE_ANCHOR[key] ?? 0) * scale;
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
  if (flash > 0) ctx.filter = "brightness(1.9) saturate(0.7)";
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
  // 道路终点是各房间唯一的入口，而不是房间中心
  const ends = BASE_ROOMS.map((room) => roomGateWorld(room));
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = patterns.dirt ?? "#7a6244";
  ctx.lineWidth = 92;
  for (const p of ends) {
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.quadraticCurveTo((center.x + p.x) / 2 + (p.y - center.y) * 0.18, (center.y + p.y) / 2, p.x, p.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = "#d9c191";
  ctx.lineWidth = 6;
  for (const p of ends) {
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

function drawRoomWallTile(ctx: CanvasRenderingContext2D, gx: number, gy: number) {
  const x = gx * TILE;
  const y = gy * TILE;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(x + 3, y + 5, TILE - 6, TILE - 6);
  const grad = ctx.createLinearGradient(x, y, x, y + TILE);
  grad.addColorStop(0, "#8892a0");
  grad.addColorStop(0.55, "#5f6875");
  grad.addColorStop(1, "#3f4651");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, TILE - 1, TILE - 1);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x, y, TILE - 1, 5);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(x, y + TILE * 0.5 - 1, TILE - 1, 2);
  ctx.strokeStyle = "rgba(22,26,32,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, TILE - 2, TILE - 2);
}

/** 精灵房间：内部为可建造的石板地面，四周是不可破坏的围墙（每间留 3 个入口） */
function drawRooms(ctx: CanvasRenderingContext2D, patterns: { dirt: CanvasPattern | null }, view: RenderView) {
  const vw = view.width / view.cam.zoom;
  const vh = view.height / view.cam.zoom;
  const left = view.cam.x - vw / 2 - TILE;
  const top = view.cam.y - vh / 2 - TILE;
  const right = left + vw + TILE * 2;
  const bottom = top + vh + TILE * 2;
  for (const room of BASE_ROOMS) {
    const rx0 = room.gx0 * TILE;
    const ry0 = room.gy0 * TILE;
    const rx1 = (room.gx1 + 1) * TILE;
    const ry1 = (room.gy1 + 1) * TILE;
    // 视野裁剪：20 个房间全画会明显掉帧
    if (rx1 < left || rx0 > right || ry1 < top || ry0 > bottom) continue;
    const ix0 = (room.gx0 + 1) * TILE;
    const iy0 = (room.gy0 + 1) * TILE;
    const ix1 = room.gx1 * TILE;
    const iy1 = room.gy1 * TILE;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = patterns.dirt ?? "#6b5a42";
    ctx.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
    ctx.restore();
    for (const wall of room.walls) drawRoomWallTile(ctx, wall.gx, wall.gy);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#c9b48a";
    for (const gate of room.gates) {
      for (const tile of [
        { gx: gate.gx, gy: gate.gy },
        { gx: gate.gx2, gy: gate.gy2 },
      ]) {
        ctx.fillRect(tile.gx * TILE + 6, tile.gy * TILE + 6, TILE - 12, TILE - 12);
      }
    }
    ctx.restore();
  }
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  assets: TveAssets,
  key: string,
  x: number,
  y: number,
  scale: number,
  alpha = 1,
) {
  drawShadow(ctx, x, y + 2, (SPRITE_WIDTH[key] ?? 80) * scale * 0.9, 0.2 * alpha);
  const canvas = assets.sprites[key];
  ctx.save();
  ctx.globalAlpha = alpha;
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
  ctx.restore();
}

/** 程序化建筑：贴图未覆盖的墙体/塔/功能建筑 */
function drawProceduralBuilding(
  ctx: CanvasRenderingContext2D,
  kind: BuildingKind,
  x: number,
  y: number,
  level: number,
  alpha: number,
  flash: number,
): DrawBox {
  const s = (BUILD_SPECS[kind].size * TILE) / 2;
  const h = s * 1.5;
  const top = y - h;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (flash > 0) ctx.filter = "brightness(1.8)";
  drawShadow(ctx, x, y + 4, s * 1.8, 0.22 * alpha);

  const body = (fill: string, stroke: string, width = s * 1.5, height = s * 1.1) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - height, width, height, 5);
    ctx.fill();
    ctx.stroke();
  };

  if (kind === "tent") {
    body("#c9a86a", "#8a6a3c", s * 1.5, s * 0.9);
    ctx.fillStyle = "#e4c98f";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + s * 0.95, y - s * 0.75);
    ctx.lineTo(x - s * 0.95, y - s * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#a07c46";
    ctx.stroke();
    ctx.fillStyle = "#6b4d2a";
    ctx.fillRect(x - s * 0.15, y - s * 0.55, s * 0.3, s * 0.55);
  } else if (kind === "grasswall" || kind === "stone" || kind === "concrete" || kind === "thorn" || kind === "icewall") {
    const fill =
      kind === "grasswall"
        ? "#7f9a4e"
        : kind === "concrete"
          ? "#a9aeb6"
          : kind === "thorn"
            ? "#6d7f3c"
            : kind === "stone"
              ? "#8d9299"
              : "#9fdcff";
    const edge =
      kind === "grasswall"
        ? "#4d6330"
        : kind === "concrete"
          ? "#6d727a"
          : kind === "thorn"
            ? "#3f4d24"
            : kind === "stone"
              ? "#585e66"
              : "#4b8fb8";
    body(fill, edge, s * 1.7, s * 1.15);
    if (kind === "icewall") {
      ctx.strokeStyle = "#e7f9ff";
      ctx.beginPath();
      ctx.moveTo(x - s * 0.3, y - s * 1.1);
      ctx.lineTo(x + s * 0.1, y - s * 1.6);
      ctx.lineTo(x + s * 0.4, y - s * 1.05);
      ctx.stroke();
    } else if (kind === "grasswall") {
      ctx.strokeStyle = "#b6d97a";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i += 1) {
        const bx = x - s * 0.6 + i * s * 0.4;
        ctx.beginPath();
        ctx.moveTo(bx, y - s * 1.1);
        ctx.lineTo(bx, y - s * 1.45);
        ctx.stroke();
      }
    } else if (kind === "thorn") {
      ctx.fillStyle = "#d8f79a";
      for (let i = 0; i < 5; i += 1) {
        const bx = x - s * 0.7 + i * s * 0.35;
        ctx.beginPath();
        ctx.moveTo(bx, y - s * 1.1);
        ctx.lineTo(bx + s * 0.1, y - s * 1.5);
        ctx.lineTo(bx + s * 0.2, y - s * 1.1);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = kind === "concrete" ? "#c9cdd3" : "#b3b8bf";
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(x - s * 0.7 + i * s * 0.5, y - s * 1.05, s * 0.38, s * 0.26);
      }
    }
  } else if (kind === "goldtower") {
    body("#8a6d2f", "#5c451c", s * 1.35, s * 1.5);
    ctx.fillStyle = "rgba(255,215,106,0.35)";
    ctx.beginPath();
    ctx.arc(x, y - s * 1.7, s * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd76a";
    ctx.beginPath();
    ctx.arc(x, y - s * 1.7, s * 0.36, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "workshop") {
    body("#a8743c", "#6f4820", s * 1.55, s * 1.05);
    ctx.fillStyle = "#7d5a34";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + s, y - s * 0.88);
    ctx.lineTo(x - s, y - s * 0.88);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#e6d6a8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.3, y - s * 0.6);
    ctx.lineTo(x + s * 0.35, y - s * 0.35);
    ctx.stroke();
  } else if (kind === "lab") {
    body("#4b3d6b", "#2c2340", s * 1.5, s * 1.2);
    ctx.fillStyle = "#b79cff";
    ctx.beginPath();
    ctx.arc(x, y - s * 1.55, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(183,156,255,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (kind === "gun") {
    body("#4d4a45", "#26241f", s * 1.35, s * 1.35);
    ctx.fillStyle = "#7a746b";
    ctx.fillRect(x - s * 0.16, y - s * 1.85, s * 0.32, s * 0.8);
    ctx.fillStyle = "#2b2926";
    ctx.fillRect(x - s * 0.25, y - s * 1.95, s * 0.5, s * 0.22);
  } else if (kind === "poison") {
    body("#3f5a35", "#20301b", s * 1.35, s * 1.3);
    ctx.fillStyle = "#9bff7a";
    ctx.beginPath();
    ctx.arc(x, y - s * 1.7, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(155,255,122,0.4)";
    ctx.beginPath();
    ctx.arc(x, y - s * 1.7, s * 0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "ice") {
    body("#5a7f95", "#2f4c5e", s * 1.35, s * 1.3);
    ctx.fillStyle = "#c9f4ff";
    ctx.beginPath();
    ctx.moveTo(x, y - s * 2.05);
    ctx.lineTo(x + s * 0.32, y - s * 1.5);
    ctx.lineTo(x, y - s * 1.25);
    ctx.lineTo(x - s * 0.32, y - s * 1.5);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "watch") {
    body("#59626f", "#333a45", s * 1.1, s * 1.7);
    ctx.strokeStyle = "#d9c191";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.7);
    ctx.lineTo(x, y - s * 3.1);
    ctx.stroke();
    ctx.fillStyle = "#ff9b6b";
    ctx.beginPath();
    ctx.moveTo(x, y - s * 3.1);
    ctx.lineTo(x + s * 0.95, y - s * 2.82);
    ctx.lineTo(x, y - s * 2.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffe9a3";
    ctx.beginPath();
    ctx.arc(x, y - s * 1.35, s * 0.26, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "hut") {
    body("#3f5a37", "#23331e", s * 1.9, s * 1.25);
    ctx.fillStyle = "#577a4a";
    ctx.beginPath();
    ctx.moveTo(x, y - s * 2.2);
    ctx.lineTo(x + s * 1.2, y - s * 1.25);
    ctx.lineTo(x - s * 1.2, y - s * 1.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d9b75a";
    ctx.beginPath();
    ctx.arc(x, y - s * 0.55, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < level; i += 1) {
      ctx.fillStyle = "#8bffa0";
      ctx.beginPath();
      ctx.arc(x - s * 0.8 + i * s * 0.35, y - s * 1.05, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    body("#6b7280", "#374151", s * 1.4, s * 1.1);
  }

  ctx.restore();
  return { left: x - s, top: y - h, width: s * 2, height: h };
}

function drawBuilding(ctx: CanvasRenderingContext2D, assets: TveAssets, b: Building, selected: boolean) {
  const building = b.buildTimer > 0 && b.buildTime > 0;
  const buildProgress = building ? 1 - b.buildTimer / b.buildTime : 1;
  const spawnProgress = b.spawn > 0 ? 1 - b.spawn / 0.5 : 1;
  const progress = Math.min(spawnProgress, building ? 0.55 + 0.45 * buildProgress : 1);
  const scale = b.spawn > 0 || building ? 0.55 + 0.45 * progress : 1;
  const alpha = b.spawn > 0 ? 0.55 + 0.45 * spawnProgress : building ? 0.7 : 1;
  drawShadow(ctx, b.x, b.y + 8, (b.size * TILE) * 1.1 * scale, 0.24);
  const spriteKey = SPRITE_FOR_KIND[b.kind];
  let box: DrawBox;
  if (spriteKey) {
    box = drawSprite(ctx, assets, spriteKey, b.x, b.y + (1 - scale) * 30, alpha, b.flash, b.size === 2 ? 1.25 : 1);
  } else {
    box = drawProceduralBuilding(ctx, b.kind, b.x, b.y, b.level, alpha, b.flash);
  }

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,233,163,0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 12, (b.size * TILE) / 2 + 12, 20, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const showBar = b.hp < b.maxHp || selected || b.kind === "tree" || b.kind === "hut";
  if (building) {
    const width = b.size === 2 ? 110 : 54;
    drawBar(ctx, b.x, box.top - 10, width, buildProgress, "#6fc8ff", b.size === 2 ? 6 : 5);
  } else if (showBar) {
    const width = b.size === 2 ? 110 : 54;
    const ratio = b.hp / b.maxHp;
    drawBar(ctx, b.x, box.top - 10, width, ratio, ratio > 0.5 ? "#79d97c" : ratio > 0.25 ? "#f0c46a" : "#ef6b6b", b.size === 2 ? 6 : 5);
  }
  if (b.level > 1 && b.size === 1) {
    ctx.save();
    ctx.fillStyle = "rgba(255,233,163,0.9)";
    ctx.font = '700 10px "PingFang SC", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`Lv${b.level}`, b.x, box.top - 16);
    ctx.restore();
  }
}

function drawWisp(ctx: CanvasRenderingContext2D, x: number, y: number, carry: number, flash: number) {
  ctx.save();
  const glow = ctx.createRadialGradient(x, y - 8, 1, x, y - 8, 20);
  glow.addColorStop(0, "rgba(180,255,230,0.95)");
  glow.addColorStop(1, "rgba(120,255,200,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y - 8, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flash > 0 ? "#ffffff" : "#d8fff0";
  ctx.beginPath();
  ctx.arc(x, y - 8, 5.5, 0, Math.PI * 2);
  ctx.fill();
  if (carry > 0) {
    ctx.fillStyle = "#c9a86a";
    ctx.fillRect(x - 2, y - 20, 4, 6);
  }
  ctx.restore();
}

function drawRepairer(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = "#f0c46a";
  ctx.beginPath();
  ctx.arc(x, y - 6, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6b4d2a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 9);
  ctx.lineTo(x + 3, y - 4);
  ctx.stroke();
  ctx.restore();
}

function drawElfHero(ctx: CanvasRenderingContext2D, assets: TveAssets, elf: Elf, selected: boolean) {
  if (!elf.alive) {
    if (elf.deadTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#9adf7a";
      ctx.beginPath();
      ctx.ellipse(elf.x, elf.y, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return;
  }
  drawShadow(ctx, elf.x, elf.y + 2, 44, 0.25);
  const box = drawSprite(ctx, assets, "villager", elf.x, elf.y, 1, elf.flash, 1.35);
  ctx.save();
  ctx.strokeStyle = elf.isPlayer ? "rgba(255,220,120,0.95)" : "rgba(140,240,170,0.65)";
  ctx.lineWidth = selected ? 3 : 2;
  ctx.beginPath();
  ctx.ellipse(elf.x, elf.y + 4, 22, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  drawBar(ctx, elf.x, box.top - 8, 52, elf.hp / elf.maxHp, elf.isPlayer ? "#a8e86a" : "#79d97c", 5);
  if (elf.isPlayer) {
    ctx.save();
    ctx.fillStyle = "rgba(255,236,170,0.95)";
    ctx.font = '700 11px "PingFang SC", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("精灵", elf.x, box.top - 16);
    ctx.restore();
  }
}

function drawTroll(ctx: CanvasRenderingContext2D, assets: TveAssets, t: Troll) {
  drawShadow(ctx, t.x, t.y + 4, t.wolf ? 70 : 106, 0.3);
  if (t.wolf) {
    ctx.save();
    if (t.windwalk > 0) ctx.globalAlpha = 0.4;
    ctx.fillStyle = t.flash > 0 ? "#ffffff" : "#8d9aa8";
    ctx.beginPath();
    ctx.ellipse(t.x, t.y - 12, 26, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5f6b78";
    ctx.beginPath();
    ctx.moveTo(t.x - 20, t.y - 22);
    ctx.lineTo(t.x - 8, t.y - 30);
    ctx.lineTo(t.x - 4, t.y - 18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(t.x + 20, t.y - 22);
    ctx.lineTo(t.x + 8, t.y - 30);
    ctx.lineTo(t.x + 4, t.y - 18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    drawBar(ctx, t.x, t.y - 44, 70, t.hp / t.maxHp, "#9fb4c7", 6);
    return;
  }
  const alpha = t.windwalk > 0 ? 0.38 : 1;
  const box = drawSprite(ctx, assets, "troll", t.x, t.y, alpha, t.flash);
  drawBar(ctx, t.x, box.top - 10, 100, t.hp / t.maxHp, "#ef6b6b", 7);
}

function drawEntities(ctx: CanvasRenderingContext2D, state: GameState, assets: TveAssets, view: RenderView) {
  type Entry = { y: number; draw: (c: CanvasRenderingContext2D) => void };
  const entries: Entry[] = [];
  const night = state.nightTimer > 0;
  const playerTroll = state.playerTroll >= 0 ? state.trolls[state.playerTroll] : null;

  for (const b of state.buildings) {
    if (!b.alive) continue;
    entries.push({ y: b.y, draw: (c) => drawBuilding(c, assets, b, view.selectedId === b.id) });
  }
  for (const w of state.wisps) {
    entries.push({ y: w.y, draw: (c) => drawWisp(c, w.x, w.y, w.carry, w.flash) });
  }
  for (const r of state.repairers) {
    entries.push({ y: r.y, draw: (c) => drawRepairer(c, r.x, r.y) });
  }
  for (const elf of state.elves) {
    if (night && state.faction === "troll" && playerTroll && !elf.isPlayer) {
      if (Math.hypot(elf.x - playerTroll.x, elf.y - playerTroll.y) > 200) continue;
    }
    entries.push({
      y: elf.y,
      draw: (c) => drawElfHero(c, assets, elf, elf.isPlayer),
    });
  }
  for (const t of state.trolls) {
    if (!t.alive) continue;
    entries.push({ y: t.y, draw: (c) => drawTroll(c, assets, t) });
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

  for (const shot of state.shots) {
    const p = Math.min(1, shot.t / shot.dur);
    const x = shot.x + (shot.tx - shot.x) * p;
    const y = shot.y + (shot.ty - shot.y) * p - Math.sin(p * Math.PI) * 22;
    ctx.save();
    if (shot.kind === "moon" || shot.kind === "ice" || shot.kind === "poison") {
      const color =
        shot.kind === "moon" ? "190,235,255" : shot.kind === "ice" ? "150,230,255" : "160,255,140";
      const g = ctx.createRadialGradient(x, y, 1, x, y, 13);
      g.addColorStop(0, `rgba(${color},1)`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
    } else if (shot.kind === "gun") {
      ctx.fillStyle = "#ffd9a0";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#f1e3b5";
      ctx.lineWidth = 2;
      const t0 = Math.max(0, p - 0.18);
      ctx.beginPath();
      ctx.moveTo(shot.x + (shot.tx - shot.x) * t0, shot.y + (shot.ty - shot.y) * t0 - Math.sin(t0 * Math.PI) * 22);
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
  if (state.nightTimer <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of state.buildings) {
    if (!b.alive) continue;
    if (b.kind !== "tree" && b.kind !== "lab" && b.kind !== "moon") continue;
    const radius = b.kind === "tree" ? 200 : 130;
    const g = ctx.createRadialGradient(b.x, b.y - 20, 8, b.x, b.y - 20, radius);
    g.addColorStop(0, b.kind === "tree" ? "rgba(120,255,180,0.28)" : "rgba(140,190,255,0.3)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y - 20, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const t of state.trolls) {
    if (!t.alive) continue;
    const g = ctx.createRadialGradient(t.x, t.y - 40, 2, t.x, t.y - 40, 70);
    g.addColorStop(0, "rgba(255,90,70,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.x, t.y - 40, 70, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlacement(ctx: CanvasRenderingContext2D, assets: TveAssets, view: RenderView) {
  if (!view.placing) return;
  const { gx, gy, kind, ok } = view.placing;
  const size = BUILD_SPECS[kind].size;
  const x = (gx + size / 2) * TILE;
  const y = (gy + size / 2) * TILE;
  ctx.save();
  ctx.fillStyle = ok ? "rgba(110, 230, 140, 0.28)" : "rgba(240, 90, 90, 0.3)";
  ctx.fillRect(gx * TILE, gy * TILE, TILE * size, TILE * size);
  ctx.strokeStyle = ok ? "rgba(140,255,170,0.9)" : "rgba(255,120,120,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(gx * TILE + 1, gy * TILE + 1, TILE * size - 2, TILE * size - 2);
  ctx.globalAlpha = 0.65;
  const spriteKey = SPRITE_FOR_KIND[kind];
  if (spriteKey) drawSprite(ctx, assets, spriteKey, x, y + 20, 0.65);
  else drawProceduralBuilding(ctx, kind, x, y, 1, 0.65, 0);
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

  if (patterns.grass) {
    ctx.fillStyle = patterns.grass;
    ctx.fillRect(left - 64, top - 64, vw + 128, vh + 128);
    ctx.fillStyle = "rgba(28, 56, 30, 0.18)";
    ctx.fillRect(left - 64, top - 64, vw + 128, vh + 128);
  } else {
    ctx.fillStyle = "#2c4429";
    ctx.fillRect(left - 64, top - 64, vw + 128, vh + 128);
  }

  drawRoads(ctx, patterns);
  drawPond(ctx, time);
  drawRooms(ctx, patterns, view);

  const props: { y: number; draw: () => void }[] = [];
  const margin = 140;
  for (const tree of state.forest) {
    if (tree.x < left - margin || tree.x > left + vw + margin || tree.y < top - margin || tree.y > top + vh + margin) continue;
    const depleted = tree.wood <= 0;
    props.push({
      y: tree.y,
      draw: () => drawProp(ctx, assets, "propTree", tree.x, tree.y, 0.9 + tree.variant * 0.08, depleted ? 0.45 : 1),
    });
  }
  for (const rock of MAP_DATA_ROCKS) {
    if (rock.x < left - margin || rock.x > left + vw + margin || rock.y < top - margin || rock.y > top + vh + margin) continue;
    props.push({ y: rock.y, draw: () => drawProp(ctx, assets, "propRock", rock.x, rock.y, 0.9) });
  }
  props.sort((a, b) => a.y - b.y);
  for (const prop of props) prop.draw();

  // 选中防御塔时显示射程
  const selected = view.selectedId !== null ? state.buildings.find((b) => b.id === view.selectedId && b.alive) : undefined;
  if (selected && selected.kind !== "tree") {
    const spec = BUILD_SPECS[selected.kind].levels[selected.level - 1];
    if (spec.range) {
      ctx.save();
      ctx.strokeStyle = "rgba(160,220,255,0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(selected.x, selected.y, spec.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawEntities(ctx, state, assets, view);
  drawNightGlow(ctx, state);
  drawEffects(ctx, state);
  drawPlacement(ctx, assets, view);

  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

  ctx.restore();

  // 战争迷雾（仅巨魔视角）：巨魔与己方建筑提供视野；某精灵帐篷全毁时暴露其基地直到重建
  if (state.faction === "troll") drawFog(ctx, state, view);

  const night = state.nightTimer > 0;
  const tint = night ? 0.4 : 0.03;
  ctx.save();
  ctx.fillStyle = night ? `rgba(14, 22, 62, ${tint})` : `rgba(255, 220, 150, ${tint})`;
  ctx.fillRect(0, 0, width, height);
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, night ? "rgba(0,0,12,0.62)" : "rgba(0,0,0,0.36)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// 岩石沿用地图静态数据（仅渲染）
const MAP_DATA_ROCKS = MAP_DATA.rocks;

let fogCanvas: HTMLCanvasElement | null = null;

/** 巨魔视角的战争迷雾：用离屏画布挖出视野圆 */
function drawFog(ctx: CanvasRenderingContext2D, state: GameState, view: RenderView) {
  const { width, height, cam } = view;
  if (typeof document === "undefined") return;
  if (!fogCanvas) fogCanvas = document.createElement("canvas");
  if (fogCanvas.width !== Math.ceil(width) || fogCanvas.height !== Math.ceil(height)) {
    fogCanvas.width = Math.max(1, Math.ceil(width));
    fogCanvas.height = Math.max(1, Math.ceil(height));
  }
  const fctx = fogCanvas.getContext("2d");
  if (!fctx) return;

  fctx.globalCompositeOperation = "source-over";
  fctx.clearRect(0, 0, width, height);
  fctx.fillStyle = "rgba(5, 10, 16, 0.88)";
  fctx.fillRect(0, 0, width, height);

  const toScreen = (x: number, y: number) => ({
    sx: (x - cam.x) * cam.zoom + width / 2,
    sy: (y - cam.y) * cam.zoom + height / 2,
  });
  const hole = (x: number, y: number, radius: number) => {
    const { sx, sy } = toScreen(x, y);
    const r = radius * cam.zoom;
    if (sx + r < 0 || sy + r < 0 || sx - r > width || sy - r > height) return;
    const g = fctx.createRadialGradient(sx, sy, r * 0.55, sx, sy, r);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    fctx.fillStyle = g;
    fctx.beginPath();
    fctx.arc(sx, sy, r, 0, Math.PI * 2);
    fctx.fill();
  };

  fctx.globalCompositeOperation = "destination-out";

  // 巨魔视野
  for (const t of state.trolls) {
    if (t.alive) hole(t.x, t.y, t.wolf ? 440 : 560);
  }
  // 巨魔建筑（小屋）视野
  for (const b of state.buildings) {
    if (b.alive && b.team === "troll") hole(b.x, b.y, 420);
  }
  // 精灵暴露视野（某个精灵帐篷全毁时只暴露它自己的位置与建筑；重建后仍持续一段时间）
  for (const elf of state.elves) {
    if (!elf.alive || elf.revealTimer <= 0) continue;
    hole(elf.x, elf.y, 460);
    for (const b of state.buildings) {
      if (b.alive && b.team === "elf" && b.owner === elf.id) hole(b.x, b.y, 300);
    }
  }

  fctx.globalCompositeOperation = "source-over";
  ctx.drawImage(fogCanvas, 0, 0);
}

export function screenToWorld(view: RenderView, sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx - view.width / 2) / view.cam.zoom + view.cam.x,
    y: (sy - view.height / 2) / view.cam.zoom + view.cam.y,
  };
}

export function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState, size: number) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = state.nightTimer > 0 ? "#0e1712" : "#182a17";
  ctx.fillRect(0, 0, size, size);
  const scale = size / MAP_SIZE;

  ctx.fillStyle = "#1d4a5e";
  ctx.beginPath();
  ctx.ellipse(POND.x * scale, POND.y * scale, POND.rx * scale, POND.ry * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(180,190,200,0.5)";
  ctx.lineWidth = 1;
  for (const room of BASE_ROOMS) {
    ctx.strokeRect(
      room.gx0 * TILE * scale,
      room.gy0 * TILE * scale,
      (room.gx1 - room.gx0 + 1) * TILE * scale,
      (room.gy1 - room.gy0 + 1) * TILE * scale,
    );
  }

  for (const b of state.buildings) {
    if (!b.alive) continue;
    if (b.team === "troll") {
      ctx.fillStyle = "#ff9b6b";
      ctx.fillRect(b.x * scale - 3, b.y * scale - 3, 6, 6);
      continue;
    }
    ctx.fillStyle =
      b.kind === "tent" || b.kind === "goldmine" || b.kind === "goldtower"
        ? "#ffd479"
        : b.kind === "tree"
          ? "#6fe08a"
          : BUILD_SPECS[b.kind].category === "wall"
            ? "#b09060"
            : "#cfe8ff";
    const s = b.kind === "tree" ? 3 : 1.8;
    ctx.fillRect(b.x * scale - s / 2, b.y * scale - s / 2, s, s);
  }

  for (const elf of state.elves) {
    if (!elf.alive) continue;
    ctx.save();
    ctx.fillStyle = elf.isPlayer ? "#ffe9a3" : "#8ef2a0";
    if (elf.isPlayer) {
      ctx.shadowColor = "#ffe9a3";
      ctx.shadowBlur = 5;
    }
    ctx.beginPath();
    ctx.arc(elf.x * scale, elf.y * scale, elf.isPlayer ? 3.4 : 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const t of state.trolls) {
    if (!t.alive) continue;
    ctx.save();
    ctx.fillStyle = t.wolf ? "#9fb4c7" : t.isPlayer ? "#ff8f6b" : "#d8574a";
    ctx.shadowColor = "#ff6b5a";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(t.x * scale, t.y * scale, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
}
