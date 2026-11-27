import type { GameObjects } from "phaser";

import type { Faction } from "../types";

export type PlaceholderUnitState = "idle" | "move" | "attack" | "dead";

interface Painter {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  fill(color: string, alpha?: number): void;
  stroke(color: string, alpha?: number, width?: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  fillCircle(x: number, y: number, radius: number): void;
  strokeCircle(x: number, y: number, radius: number): void;
  fillEllipse(x: number, y: number, width: number, height: number): void;
  strokeEllipse(x: number, y: number, width: number, height: number): void;
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void;
  strokeTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void;
}

class CanvasPainter implements Painter {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  save(): void { this.ctx.save(); }
  restore(): void { this.ctx.restore(); }
  translate(x: number, y: number): void { this.ctx.translate(x, y); }
  rotate(angle: number): void { this.ctx.rotate(angle); }
  scale(x: number, y: number): void { this.ctx.scale(x, y); }
  fill(color: string, alpha = 1): void {
    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = alpha;
  }
  stroke(color: string, alpha = 1, width = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.globalAlpha = alpha;
    this.ctx.lineWidth = width;
  }
  fillRect(x: number, y: number, width: number, height: number): void { this.ctx.fillRect(x, y, width, height); }
  strokeRect(x: number, y: number, width: number, height: number): void { this.ctx.strokeRect(x, y, width, height); }
  fillCircle(x: number, y: number, radius: number): void { this.ctx.beginPath(); this.ctx.arc(x, y, radius, 0, Math.PI * 2); this.ctx.fill(); }
  strokeCircle(x: number, y: number, radius: number): void { this.ctx.beginPath(); this.ctx.arc(x, y, radius, 0, Math.PI * 2); this.ctx.stroke(); }
  fillEllipse(x: number, y: number, width: number, height: number): void {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }
  strokeEllipse(x: number, y: number, width: number, height: number): void {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
    this.ctx.stroke();
  }
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y0);
    this.ctx.lineTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.closePath();
    this.ctx.fill();
  }
  strokeTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y0);
    this.ctx.lineTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.closePath();
    this.ctx.stroke();
  }
}

function colorNumber(color: string): number {
  return Number.parseInt(color.replace("#", ""), 16);
}

class PhaserPainter implements Painter {
  constructor(private readonly graphics: GameObjects.Graphics, private readonly alpha: number) {}

  save(): void { this.graphics.save(); }
  restore(): void { this.graphics.restore(); }
  translate(x: number, y: number): void { this.graphics.translateCanvas(x, y); }
  rotate(angle: number): void { this.graphics.rotateCanvas(angle); }
  scale(x: number, y: number): void { this.graphics.scaleCanvas(x, y); }
  fill(color: string, alpha = 1): void { this.graphics.fillStyle(colorNumber(color), alpha * this.alpha); }
  stroke(color: string, alpha = 1, width = 1): void { this.graphics.lineStyle(width, colorNumber(color), alpha * this.alpha); }
  fillRect(x: number, y: number, width: number, height: number): void { this.graphics.fillRect(x, y, width, height); }
  strokeRect(x: number, y: number, width: number, height: number): void { this.graphics.strokeRect(x, y, width, height); }
  fillCircle(x: number, y: number, radius: number): void { this.graphics.fillCircle(x, y, radius); }
  strokeCircle(x: number, y: number, radius: number): void { this.graphics.strokeCircle(x, y, radius); }
  fillEllipse(x: number, y: number, width: number, height: number): void { this.graphics.fillEllipse(x, y, width, height); }
  strokeEllipse(x: number, y: number, width: number, height: number): void { this.graphics.strokeEllipse(x, y, width, height); }
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
    this.graphics.fillTriangle(x0, y0, x1, y1, x2, y2);
  }
  strokeTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
    this.graphics.strokeTriangle(x0, y0, x1, y1, x2, y2);
  }
}

export const MAP_BACKGROUND_COLOR = "#36413c";

const FACTION_COLORS: Record<Faction, { main: string; light: string; dark: string }> = {
  elf: { main: "#62c77b", light: "#b8f0b5", dark: "#275c43" },
  troll: { main: "#e07a4f", light: "#ffd0a1", dark: "#713b32" },
};

const TERRAIN_PALETTE = [
  "#1b2622", // void
  "#6f6047", // dirt
  "#7d6b4f", // dirt light
  "#54734a", // grass
  "#638454", // grass light
  "#777b70", // rock
  "#a89768", // sand
  "#355f66", // water
  "#d7e2df", // snow/ice
] as const;

/** Finite W3E tile-type palette; no map image or texture is involved. */
export function terrainColor(tileId: number): string {
  if (tileId === 7) return TERRAIN_PALETTE[7];
  if (tileId === 8 || tileId === 9) return TERRAIN_PALETTE[8];
  if (tileId <= 0) return TERRAIN_PALETTE[0];
  if (tileId < 16) return TERRAIN_PALETTE[1];
  if (tileId < 32) return TERRAIN_PALETTE[2];
  if (tileId < 64) return TERRAIN_PALETTE[3];
  if (tileId < 96) return TERRAIN_PALETTE[4];
  if (tileId < 128) return TERRAIN_PALETTE[5];
  if (tileId < 197) return TERRAIN_PALETTE[6];
  return TERRAIN_PALETTE[8];
}

function drawUnit(p: Painter, kind: string, faction: Faction, state: PlaceholderUnitState): void {
  const colors = FACTION_COLORS[faction];
  const troll = faction === "troll";
  const width = troll ? 22 : 15;
  const height = troll ? 30 : 24;
  const dead = state === "dead";

  p.save();
  if (dead) {
    p.rotate(-0.45);
    p.scale(1, 0.55);
  } else if (state === "attack") {
    p.rotate(-0.08);
  }

  p.fill("#04100d", dead ? 0.18 : 0.28);
  p.fillEllipse(1, height * 0.42, width * 1.25, width * 0.34);

  if (kind === "wolf") {
    p.fill(colors.dark);
    p.fillEllipse(0, 0, width * 1.25, height * 0.55);
    p.fillTriangle(width * 0.45, -2, width * 0.95, -height * 0.28, width * 0.5, height * 0.2);
    p.fill(colors.light);
    p.fillTriangle(width * 0.62, -height * 0.2, width * 0.72, -height * 0.48, width * 0.82, -height * 0.16);
  } else {
    const legOffset = state === "move" ? 3 : 0;
    p.fill(colors.dark);
    p.fillRect(-width * 0.32, height * 0.18, width * 0.22, height * 0.3 + legOffset);
    p.fillRect(width * 0.1, height * 0.18, width * 0.22, height * 0.3 - legOffset);
    p.fill(colors.main);
    p.fillRect(-width / 2, -height * 0.18, width, height * 0.52);
    p.fill(colors.light);
    p.fillRect(-width * 0.34, -height * 0.12, width * 0.22, height * 0.3);
    p.fill(colors.main);
    p.fillCircle(0, -height * 0.36, width * 0.34);
    p.fill(colors.dark);
    p.fillRect(-width * 0.36, -height * 0.52, width * 0.72, height * 0.12);

    if (kind === "archmage") {
      p.fill("#6f78b8");
      p.fillTriangle(-width * 0.55, -height * 0.48, 0, -height * 0.95, width * 0.55, -height * 0.48);
      p.fill("#d9e5ff");
      p.fillCircle(width * 0.12, -height * 0.38, 1.6);
    }

    p.stroke("#e9e2c7", 0.95, 2);
    const weaponY = state === "attack" ? -height * 0.05 : height * 0.02;
    p.strokeTriangle(width * 0.35, weaponY, width * 0.95, weaponY - 8, width * 0.45, weaponY + 5);
  }

  if (state === "attack") {
    p.fill("#ffe08a", 0.8);
    p.fillCircle(width * 0.95, -height * 0.12, 3);
  }
  p.restore();
}

/** Required Task 4 interface: draw at the current Canvas origin. */
export function drawPlaceholderUnit(
  ctx: CanvasRenderingContext2D,
  kind: string,
  faction: Faction,
  state: PlaceholderUnitState,
): void {
  drawUnit(new CanvasPainter(ctx), kind, faction, state);
}

function drawBuilding(p: Painter, kind: string, faction: Faction, level: number, size: number): void {
  const colors = FACTION_COLORS[faction];
  const height = kind === "tower" || kind === "reveal" ? size * 1.15 : size * 0.78;
  p.save();
  p.fill("#04100d", 0.3);
  p.fillEllipse(2, size * 0.38, size * 1.05, size * 0.3);

  if (kind === "wall") {
    p.fill("#241b12", 0.55);
    p.fillRect(-size / 2 + 2, -size / 2 + 3, size, size);
    p.fill("#8f7a58");
    p.fillRect(-size / 2, -size / 2 + 2, size, size);
    p.fill("#eadbb8");
    p.fillRect(-size / 2, -size / 2, size, size - 2);
    p.stroke("#2a2118", 1, 2);
    p.strokeRect(-size / 2, -size / 2, size, size);
    p.stroke("#f4e6bd", 0.95, 1);
    p.strokeRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 5);
    p.stroke("#6b5a42", 0.85, 1);
    p.strokeRect(-size / 2 + 2, -1, size - 4, 1);
    p.strokeRect(-1, -size / 2 + 2, 1, size - 5);
  } else if (kind === "tower" || kind === "reveal") {
    p.fill(colors.dark);
    p.fillRect(-size * 0.34, -height * 0.55, size * 0.68, height * 0.82);
    p.fill(colors.main);
    p.fillRect(-size * 0.42, -height * 0.12, size * 0.84, size * 0.22);
    if (kind === "reveal") {
      p.fill("#9be7ff");
      p.fillTriangle(0, -height, size * 0.24, -height * 0.42, -size * 0.24, -height * 0.42);
    } else {
      p.fill(colors.light);
      p.fillTriangle(-size * 0.5, -height * 0.55, 0, -height, size * 0.5, -height * 0.55);
    }
  } else if (kind === "mine") {
    p.fill("#5d625c");
    p.fillEllipse(0, -size * 0.12, size * 0.9, size * 0.65);
    p.fill("#c8a94d");
    p.fillCircle(-size * 0.16, -size * 0.2, size * 0.12);
    p.fillCircle(size * 0.18, -size * 0.08, size * 0.09);
  } else if (kind === "tent") {
    p.fill(colors.dark);
    p.fillTriangle(-size * 0.55, size * 0.3, 0, -height, size * 0.55, size * 0.3);
    p.fill(colors.main);
    p.fillTriangle(-size * 0.4, size * 0.24, 0, -height * 0.78, size * 0.4, size * 0.24);
    p.fill("#201b18");
    p.fillTriangle(-size * 0.12, size * 0.25, 0, -height * 0.2, size * 0.12, size * 0.25);
  } else {
    p.fill(colors.dark);
    p.fillRect(-size * 0.44, -height * 0.48, size * 0.88, height * 0.82);
    p.fill(colors.main);
    p.fillRect(-size * 0.5, -height * 0.62, size, height * 0.28);
    p.fill(colors.light);
    p.fillRect(-size * 0.12, -height * 0.12, size * 0.24, height * 0.46);
  }

  p.fill("#ffd86b", 0.95);
  for (let i = 0; i < Math.min(5, Math.max(0, level - 1)); i += 1) {
    p.fillCircle(-size * 0.28 + i * size * 0.14, -height - 4, 1.8);
  }
  p.restore();
}

export function drawPlaceholderBuilding(
  ctx: CanvasRenderingContext2D,
  kind: string,
  faction: Faction,
  level = 1,
  size = 32,
): void {
  drawBuilding(new CanvasPainter(ctx), kind, faction, level, size);
}

function drawDoodad(p: Painter, typeId: string): void {
  p.save();
  p.fill("#04100d", 0.24);
  p.fillEllipse(2, 7, 20, 7);
  if (typeId === "WTst") {
    p.fill("#5b4634");
    p.fillRect(-2, -2, 4, 12);
    p.fill("#28563d");
    p.fillTriangle(-11, 2, 0, -18, 11, 2);
    p.fill("#36704a");
    p.fillTriangle(-9, -5, 0, -24, 9, -5);
    p.fill("#4b8b58");
    p.fillTriangle(-6, -12, 0, -28, 6, -12);
  } else {
    p.fill("#6f746d");
    p.fillEllipse(0, 0, 18, 13);
    p.fill("#95998d");
    p.fillEllipse(-3, -3, 10, 7);
    p.stroke("#c4c6b8", 0.55, 1);
    p.strokeEllipse(-3, -3, 10, 7);
  }
  p.restore();
}

export function drawPlaceholderDoodad(ctx: CanvasRenderingContext2D, typeId: string): void {
  drawDoodad(new CanvasPainter(ctx), typeId);
}

export interface PhaserPlaceholderOptions {
  alpha?: number;
  scale?: number;
  rotation?: number;
  flipX?: boolean;
}

function withPhaserTransform(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  options: PhaserPlaceholderOptions,
  draw: (painter: Painter) => void,
): void {
  const scale = options.scale ?? 1;
  graphics.save();
  graphics.translateCanvas(x, y);
  graphics.rotateCanvas(options.rotation ?? 0);
  graphics.scaleCanvas(scale * (options.flipX ? -1 : 1), scale);
  draw(new PhaserPainter(graphics, options.alpha ?? 1));
  graphics.restore();
}

export function drawPhaserPlaceholderUnit(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  kind: string,
  faction: Faction,
  state: PlaceholderUnitState,
  options: PhaserPlaceholderOptions = {},
): void {
  withPhaserTransform(graphics, x, y, options, (painter) => drawUnit(painter, kind, faction, state));
}

export function drawPhaserPlaceholderBuilding(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  kind: string,
  faction: Faction,
  level = 1,
  options: PhaserPlaceholderOptions = {},
): void {
  withPhaserTransform(graphics, x, y, options, (painter) => drawBuilding(painter, kind, faction, level, size));
}

export function drawPhaserPlaceholderDoodad(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  typeId: string,
  rotation = 0,
  options: PhaserPlaceholderOptions = {},
): void {
  withPhaserTransform(graphics, x, y, { ...options, rotation }, (painter) => drawDoodad(painter, typeId));
}

export function drawPhaserTerrainTile(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  tileId: number,
  size: number,
): void {
  graphics.fillStyle(colorNumber(terrainColor(tileId)), 1);
  graphics.fillRect(x, y, size, size);
}
