import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { CompositeTilemap, settings as tilemapSettings } from "@pixi/tilemap";
import { getHunterArt, type HunterArt } from "./art";
import { BUILDINGS, SKILLS, TILE, UNITS } from "./config";
import { isUnitVisibleTo, playerUnit } from "./engine";
import { terrainAtTile, tileCenter } from "./map";
import type { BuildingKind, GameState, Side, TilePos } from "./types";

tilemapSettings.use32bitIndex = true;

const ISO_HALF_W = 32;
const ISO_HALF_H = 16;

export type GhostInfo = { kind: BuildingKind; tx: number; ty: number; valid: boolean };

export type HunterStage = {
  render(state: GameState, ghost: GhostInfo | null): void;
  resize(width: number, height: number): void;
  setZoom(zoom: number): void;
  screenToTile(clientX: number, clientY: number): TilePos | null;
  focusAt(x: number, y: number): void;
  destroy(): void;
};

type FloatText = {
  text: Text;
  born: number;
  x: number;
  y: number;
  life: number;
};

type Burst = {
  x: number;
  y: number;
  radius: number;
  color: number;
  born: number;
  life: number;
};

function isoX(x: number, y: number): number {
  return x - y;
}

function isoY(x: number, y: number): number {
  return (x + y) / 2;
}

export async function createHunterStage(
  canvas: HTMLCanvasElement,
  options: { width: number; height: number; isTouch: boolean }
): Promise<HunterStage> {
  const app = new Application();
  await app.init({
    canvas,
    width: options.width,
    height: options.height,
    background: 0x0a1410,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(options.isTouch ? 1.5 : 2, window.devicePixelRatio || 1),
    preference: "webgl",
    powerPreference: "high-performance",
  });
  app.ticker.stop();
  return new PixiHunterStage(app, options.width, options.height);
}

class PixiHunterStage implements HunterStage {
  private readonly app: Application;
  private readonly art: HunterArt;
  private readonly world = new Container();
  private readonly groundTiles = new CompositeTilemap();
  private readonly detailTiles = new CompositeTilemap();
  private readonly bushTiles = new CompositeTilemap();
  private readonly propLayer = new Container();
  private readonly fog = new Graphics();
  private readonly entityLayer = new Container();
  private readonly bars = new Graphics();
  private readonly fx = new Graphics();
  private readonly textLayer = new Container();
  private readonly ghostLayer = new Container();
  private readonly ghostSprite: Sprite;
  private readonly ghostOutline = new Graphics();
  private readonly heroRing = new Graphics();
  private readonly merchantSprite: Sprite;

  private width: number;
  private height: number;
  private zoom = 0.75;
  private camX = 0;
  private camY = 0;
  private cameraReady = false;
  private lookAt: { x: number; y: number; until: number } | null = null;

  private readonly unitSprites = new Map<string, Sprite>();
  private readonly buildingSprites = new Map<string, Sprite>();
  private readonly treeSprites = new Map<string, Sprite>();
  private readonly floats: FloatText[] = [];
  private readonly bursts: Burst[] = [];
  private lastEventId = 0;
  private lastState: GameState | null = null;
  private fogAt = -1;

  constructor(app: Application, width: number, height: number) {
    this.app = app;
    this.art = getHunterArt();
    this.width = width;
    this.height = height;

    this.world.sortableChildren = false;
    this.entityLayer.sortableChildren = true;
    this.propLayer.sortableChildren = false;
    this.textLayer.sortableChildren = false;

    this.world.addChild(
      this.groundTiles,
      this.detailTiles,
      this.bushTiles,
      this.propLayer,
      this.fog,
      this.entityLayer,
      this.heroRing,
      this.ghostLayer,
      this.bars,
      this.fx,
      this.textLayer
    );
    app.stage.addChild(this.world);

    this.ghostSprite = new Sprite();
    this.ghostSprite.anchor.set(0.5, 0.92);
    this.ghostSprite.alpha = 0.65;
    this.ghostLayer.addChild(this.ghostOutline, this.ghostSprite);
    this.ghostLayer.visible = false;

    this.merchantSprite = new Sprite(this.art.unit("mercenary"));
    this.merchantSprite.anchor.set(0.5, 0.92);
    this.merchantSprite.tint = 0xfbbf24;
    this.entityLayer.addChild(this.merchantSprite);

    this.resize(width, height);
  }

  private buildTilemap(state: GameState): void {
    this.groundTiles.clear();
    this.detailTiles.clear();
    this.bushTiles.clear();
    const tiles = this.art.tiles;
    for (let ty = 0; ty < state.map.h; ty += 1) {
      for (let tx = 0; tx < state.map.w; tx += 1) {
        const center = tileCenter(tx, ty);
        const sx = isoX(center.x, center.y);
        const sy = isoY(center.x, center.y);
        const terrain = terrainAtTile(state.map, tx, ty);
        let ground = tiles.ground[(tx * 7 + ty * 13) % 3];
        if ((tx + ty) % 2 === 0 && tiles.ground.length > 0) ground = tiles.ground[1];
        if (terrain === "water") {
          this.groundTiles.tile(tiles.water, sx - ISO_HALF_W, sy - ISO_HALF_H);
        } else {
          this.groundTiles.tile(ground, sx - ISO_HALF_W, sy - ISO_HALF_H);
        }
        if (terrain === "flower" || (terrain === "grass" && (tx * 11 + ty * 5) % 23 === 0)) {
          this.detailTiles.tile(tiles.flower, sx - ISO_HALF_W, sy - ISO_HALF_H);
        }
        if (terrain === "bush") {
          this.bushTiles.tile(this.art.bush, sx - ISO_HALF_W, sy - ISO_HALF_H);
        }
      }
    }
  }

  private buildProps(state: GameState): void {
    this.propLayer.removeChildren();
    this.treeSprites.clear();
    for (let ty = 0; ty < state.map.h; ty += 1) {
      for (let tx = 0; tx < state.map.w; tx += 1) {
        const terrain = terrainAtTile(state.map, tx, ty);
        const center = tileCenter(tx, ty);
        const sx = isoX(center.x, center.y);
        const sy = isoY(center.x, center.y);
        if (terrain === "tree") {
          const sprite = new Sprite(this.art.tree);
          sprite.anchor.set(0.5, 0.94);
          sprite.position.set(sx, sy - 2);
          sprite.zIndex = center.x + center.y;
          this.propLayer.addChild(sprite);
          this.treeSprites.set(`${tx},${ty}`, sprite);
        } else if (terrain === "rock") {
          const sprite = new Sprite(this.art.rock);
          sprite.anchor.set(0.5, 0.9);
          sprite.position.set(sx, sy);
          sprite.zIndex = center.x + center.y;
          this.propLayer.addChild(sprite);
        }
      }
    }
  }

  private ensureSprite(state: GameState, unitId: string, texture: Texture): Sprite {
    let sprite = this.unitSprites.get(unitId);
    if (!sprite) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.9);
      this.entityLayer.addChild(sprite);
      this.unitSprites.set(unitId, sprite);
    } else {
      // 重开一局时实体 id 会复用，贴图必须跟着种类刷新
      sprite.texture = texture;
    }
    return sprite;
  }

  private ensureBuildingSprite(state: GameState, buildingId: string, texture: Texture): Sprite {
    let sprite = this.buildingSprites.get(buildingId);
    if (!sprite) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.94);
      this.entityLayer.addChild(sprite);
      this.buildingSprites.set(buildingId, sprite);
    } else {
      sprite.texture = texture;
    }
    return sprite;
  }

  private spawnFloat(state: GameState, x: number, y: number, text: string, color: number): void {
    if (this.floats.length > 12) {
      const oldest = this.floats.shift();
      oldest?.text.destroy();
    }
    const label = new Text({
      text,
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 13,
        fontWeight: "700",
        fill: color,
        stroke: { color: "#0b0f14", width: 3 },
      }),
      resolution: 2,
    });
    label.anchor.set(0.5, 1);
    const sx = isoX(x, y);
    const sy = isoY(x, y);
    label.position.set(sx, sy - 26);
    this.textLayer.addChild(label);
    this.floats.push({ text: label, born: state.time, x: sx, y: sy, life: 1.4 });
  }

  private drainEvents(state: GameState): void {
    for (const event of state.events) {
      if (event.id <= this.lastEventId) continue;
      this.lastEventId = event.id;
      if (event.kind === "skill") {
        const radius = event.text.includes("大地")
          ? 180
          : event.text.includes("散弹")
            ? 140
            : event.text.includes("粉碎")
              ? 90
              : 120;
        this.bursts.push({
          x: event.x,
          y: event.y,
          radius,
          color: event.text.includes("大地")
            ? 0xf59e0b
            : event.text.includes("散弹")
              ? 0x22c55e
              : event.text.includes("粉碎")
                ? 0xef4444
                : 0x38bdf8,
          born: state.time,
          life: 0.8,
        });
        if (event.text) this.spawnFloat(state, event.x, event.y, event.text, 0xfbbf24);
      } else if (event.kind === "death") {
        if (event.text) this.spawnFloat(state, event.x, event.y, event.text, 0xf87171);
      } else if (event.kind === "win" || event.kind === "phase") {
        if (event.text) this.spawnFloat(state, event.x, event.y, event.text, 0xfde047);
      } else if (event.kind === "item") {
        if (event.text) this.spawnFloat(state, event.x, event.y, event.text, 0xa78bfa);
      }
    }
  }

  private drawFog(state: GameState): void {
    this.fog.clear();
    const side: Side = state.side;
    const vision = state.vision[side];
    // 视口范围（世界坐标）
    const corners: [number, number][] = [
      [0, 0],
      [this.width, 0],
      [0, this.height],
      [this.width, this.height],
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [lx, ly] of corners) {
      const sx = (lx - this.camX) / this.zoom;
      const sy = (ly - this.camY) / this.zoom;
      const wx = sy + sx / 2;
      const wy = sy - sx / 2;
      minX = Math.min(minX, wx);
      maxX = Math.max(maxX, wx);
      minY = Math.min(minY, wy);
      maxY = Math.max(maxY, wy);
    }
    const tx0 = Math.max(0, Math.floor(minX / TILE) - 2);
    const tx1 = Math.min(state.map.w - 1, Math.ceil(maxX / TILE) + 2);
    const ty0 = Math.max(0, Math.floor(minY / TILE) - 2);
    const ty1 = Math.min(state.map.h - 1, Math.ceil(maxY / TILE) + 2);

    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const v = vision[ty * state.map.w + tx];
        if (v === 2) continue;
        const center = tileCenter(tx, ty);
        const sx = isoX(center.x, center.y);
        const sy = isoY(center.x, center.y);
        this.fog
          .poly([sx, sy - ISO_HALF_H, sx + ISO_HALF_W, sy, sx, sy + ISO_HALF_H, sx - ISO_HALF_W, sy])
          .fill({ color: 0x020617, alpha: v === 1 ? 0.42 : 0.9 });
      }
    }
    this.fogAt = state.time;
  }

  private updateTrees(state: GameState): void {
    for (const [key, sprite] of this.treeSprites) {
      const [tx, ty] = key.split(",").map(Number);
      const index = ty * state.map.w + tx;
      const alive = state.map.trees[index] > 0;
      sprite.visible = alive;
    }
  }

  render(state: GameState, ghost: GhostInfo | null): void {
    if (this.lastState !== state || this.groundTiles.children.length === 0) {
      this.buildTilemap(state);
      this.buildProps(state);
      this.lastState = state;
      this.cameraReady = false;
      this.lastEventId = 0;
    }

    if (this.zoom === 0) this.zoom = 0.75;

    const hero = playerUnit(state);
    let focusX = hero?.x ?? state.map.farmerStarts[0].x;
    let focusY = hero?.y ?? state.map.farmerStarts[0].y;
    if (this.lookAt && this.lookAt.until > state.time) {
      focusX = this.lookAt.x;
      focusY = this.lookAt.y;
    }
    const targetCamX = this.width / 2 - isoX(focusX, focusY) * this.zoom;
    const targetCamY = this.height * 0.6 - isoY(focusX, focusY) * this.zoom;
    if (!this.cameraReady) {
      this.camX = targetCamX;
      this.camY = targetCamY;
      this.cameraReady = true;
    } else {
      this.camX += (targetCamX - this.camX) * 0.18;
      this.camY += (targetCamY - this.camY) * 0.18;
    }
    this.world.scale.set(this.zoom);
    this.world.position.set(this.camX, this.camY);

    this.updateTrees(state);
    this.drainEvents(state);

    // 单位
    const seenUnits = new Set<string>();
    for (const unit of state.units) {
      seenUnits.add(unit.id);
      const sprite = this.ensureSprite(state, unit.id, this.art.unit(unit.kind));
      const visible =
        unit.side === state.side
          ? !unit.dead
          : !unit.dead && isUnitVisibleTo(state, unit, state.side);
      sprite.visible = visible;
      if (!visible) continue;
      const sx = isoX(unit.x, unit.y);
      const sy = isoY(unit.x, unit.y);
      sprite.position.set(sx, sy);
      if (unit.speed > 0) sprite.scale.x = unit.facing;
      sprite.zIndex = unit.x + unit.y + 1;
      sprite.tint = unit.hitFlashAt > state.time - 0.12 ? 0xffb4b4 : 0xffffff;
      if (unit.kind === "eyeWard" || unit.kind === "mine") {
        sprite.alpha = 0.75 + Math.sin(state.time * 4 + unit.animSeed) * 0.2;
      } else {
        sprite.alpha = unit.hidden ? 0.55 : 1;
      }
    }
    for (const [id, sprite] of this.unitSprites) {
      if (!seenUnits.has(id)) {
        sprite.destroy();
        this.unitSprites.delete(id);
      }
    }

    // 建筑
    const seenBuildings = new Set<string>();
    for (const building of state.buildings) {
      if (building.hp <= 0) continue;
      seenBuildings.add(building.id);
      const sprite = this.ensureBuildingSprite(state, building.id, this.art.building(building.kind));
      const visible =
        building.side === state.side ||
        state.vision[state.side][building.ty * state.map.w + building.tx] === 2;
      sprite.visible = visible;
      if (!visible) continue;
      sprite.position.set(isoX(building.x, building.y), isoY(building.x, building.y));
      sprite.zIndex = building.x + building.y;
      sprite.tint = building.flashAt > state.time - 0.12 ? 0xffb4b4 : 0xffffff;
    }
    for (const [id, sprite] of this.buildingSprites) {
      if (!seenBuildings.has(id)) {
        sprite.destroy();
        this.buildingSprites.delete(id);
      }
    }

    // 血条
    this.bars.clear();
    for (const unit of state.units) {
      if (unit.dead) continue;
      const visible = unit.side === state.side || isUnitVisibleTo(state, unit, state.side);
      if (!visible) continue;
      if (unit.hp >= unit.maxHp && !unit.isHero) continue;
      const sx = isoX(unit.x, unit.y);
      const sy = isoY(unit.x, unit.y);
      const width = unit.isHero ? 34 : 20;
      const y = sy - (unit.kind === "golem" ? 62 : unit.kind === "golemClone" ? 50 : unit.speed > 0 ? 46 : 24);
      const ratio = Math.max(0, unit.hp / unit.maxHp);
      this.bars.rect(sx - width / 2 - 1, y - 1, width + 2, 5).fill({ color: 0x0b0f14, alpha: 0.8 });
      this.bars
        .rect(sx - width / 2, y, width * ratio, 3)
        .fill({ color: unit.side === state.side ? 0x4ade80 : 0xf87171, alpha: 0.95 });
      if (unit.isHero && unit.kind === "hunterHero") {
        const livesX = sx - width / 2;
        for (let i = 0; i < Math.max(0, unit.livesLeft); i += 1) {
          this.bars.circle(livesX + i * 7, y + 9, 2.2).fill({ color: 0xfca5a5 });
        }
      }
    }
    for (const building of state.buildings) {
      if (building.hp >= building.maxHp || building.hp <= 0) continue;
      const visible =
        building.side === state.side ||
        state.vision[state.side][building.ty * state.map.w + building.tx] === 2;
      if (!visible) continue;
      const sx = isoX(building.x, building.y);
      const sy = isoY(building.x, building.y);
      const width = 30;
      const ratio = Math.max(0, building.hp / building.maxHp);
      this.bars.rect(sx - width / 2 - 1, sy - 63, width + 2, 4).fill({ color: 0x0b0f14, alpha: 0.8 });
      this.bars
        .rect(sx - width / 2, sy - 62, width * ratio, 2)
        .fill({ color: building.side === state.side ? 0x86efac : 0xfda4af });
    }

    // 英雄指示环
    this.heroRing.clear();
    if (hero && !hero.dead) {
      const sx = isoX(hero.x, hero.y);
      const sy = isoY(hero.x, hero.y);
      const pulse = 1 + Math.sin(state.time * 4) * 0.08;
      this.heroRing.ellipse(sx, sy, 18 * pulse, 9 * pulse).stroke({
        color: state.side === "farmer" ? 0xfbbf24 : 0xf97316,
        width: 2,
        alpha: 0.9,
      });
    }

    // 移动商人
    const merchant = state.merchant;
    this.merchantSprite.position.set(isoX(merchant.x, merchant.y), isoY(merchant.x, merchant.y));
    this.merchantSprite.zIndex = merchant.x + merchant.y;
    this.merchantSprite.alpha = 0.8 + Math.sin(state.time * 3) * 0.2;

    // 投射物
    this.fx.clear();
    this.fx
      .ellipse(isoX(merchant.x, merchant.y), isoY(merchant.x, merchant.y), 18, 9)
      .stroke({ color: 0xfbbf24, width: 1.5, alpha: 0.7 });
    for (const projectile of state.projectiles) {
      const sx = isoX(projectile.x, projectile.y);
      const sy = isoY(projectile.x, projectile.y) - 14;
      this.fx.circle(sx, sy, 3).fill({ color: projectile.color, alpha: 0.95 });
      this.fx.circle(sx, sy, 6).fill({ color: projectile.color, alpha: 0.18 });
    }

    // 技能范围与爆发效果
    const now = state.time;
    for (let i = this.bursts.length - 1; i >= 0; i -= 1) {
      const burst = this.bursts[i];
      const age = now - burst.born;
      if (age > burst.life) {
        this.bursts.splice(i, 1);
        continue;
      }
      const sx = isoX(burst.x, burst.y);
      const sy = isoY(burst.x, burst.y);
      const t = age / burst.life;
      this.fx
        .ellipse(sx, sy, burst.radius * (0.4 + t * 0.6), burst.radius * 0.5 * (0.4 + t * 0.6))
        .stroke({ color: burst.color, width: 2, alpha: 1 - t });
      this.fx.circle(sx, sy, burst.radius * 0.25 * (1 - t)).fill({ color: burst.color, alpha: 0.25 * (1 - t) });
    }

    // 飘字
    for (let i = this.floats.length - 1; i >= 0; i -= 1) {
      const item = this.floats[i];
      const age = now - item.born;
      if (age > item.life) {
        item.text.destroy();
        this.floats.splice(i, 1);
        continue;
      }
      item.text.position.set(item.x, item.y - 26 - age * 20);
      item.text.alpha = 1 - age / item.life;
    }

    // 建造幽灵
    if (ghost) {
      this.ghostLayer.visible = true;
      const center = tileCenter(ghost.tx, ghost.ty);
      const sx = isoX(center.x, center.y);
      const sy = isoY(center.x, center.y);
      this.ghostSprite.texture = this.art.building(ghost.kind);
      this.ghostSprite.position.set(sx, sy);
      this.ghostSprite.tint = ghost.valid ? 0x86efac : 0xf87171;
      this.ghostOutline.clear();
      this.ghostOutline
        .poly([sx, sy - ISO_HALF_H, sx + ISO_HALF_W, sy, sx, sy + ISO_HALF_H, sx - ISO_HALF_W, sy])
        .fill({ color: ghost.valid ? 0x22c55e : 0xef4444, alpha: 0.28 })
        .stroke({ color: ghost.valid ? 0x22c55e : 0xef4444, width: 2, alpha: 0.9 });
    } else {
      this.ghostLayer.visible = false;
    }

    // 迷雾按时间节流重建
    if (this.fogAt < 0 || state.time - this.fogAt > 0.25) this.drawFog(state);

    this.entityLayer.sortChildren();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.cameraReady = false;
    this.fogAt = -1;
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.45, Math.min(1.2, zoom));
    this.fogAt = -1;
  }

  focusAt(x: number, y: number): void {
    const state = this.lastState;
    this.lookAt = { x, y, until: (state?.time ?? 0) + 2.5 };
  }

  screenToTile(clientX: number, clientY: number): TilePos | null {
    const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    const lx = clientX - rect.left;
    const ly = clientY - rect.top;
    const sx = (lx - this.camX) / this.zoom;
    const sy = (ly - this.camY) / this.zoom;
    const wx = sy + sx / 2;
    const wy = sy - sx / 2;
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (!this.lastState) return null;
    if (tx < 0 || ty < 0 || tx >= this.lastState.map.w || ty >= this.lastState.map.h) return null;
    return { tx, ty };
  }

  destroy(): void {
    this.unitSprites.clear();
    this.buildingSprites.clear();
    this.treeSprites.clear();
    for (const item of this.floats) item.text.destroy();
    this.floats.length = 0;
    this.app.destroy(true, { children: true });
  }
}

export function buildingLabel(kind: BuildingKind): string {
  return BUILDINGS[kind].name;
}

export function unitLabel(kind: keyof typeof UNITS): string {
  return UNITS[kind].name;
}

export function skillLabel(kind: keyof typeof SKILLS): string {
  return SKILLS[kind].name;
}
