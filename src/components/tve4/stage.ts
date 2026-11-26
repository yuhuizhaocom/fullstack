"use client";

import * as Phaser from "phaser";

import { BUILDINGS, GRID_H, GRID_W, TILE, WORLD_H, WORLD_W } from "@/lib/tve4/config";
import { CHOKEPOINTS, insideAnyRoom, ROOM_ELEMENTS, roomCenterWorld, gateCells } from "@/lib/tve4/map";
import type { GameState, Interaction } from "@/lib/tve4/types";

export interface Stage4 {
  render(state: GameState): void;
  setInteraction(info: Interaction): void;
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
  setPanning(value: boolean): void;
  getZoom(): number;
  resize(width: number, height: number): void;
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } | null;
  destroy(): void;
}

const FRAME_W = 96;
const FRAME_H = 128;
const ROWS = { idle: 0, walk: 1, attack: 2, death: 3 } as const;

interface HeroAnim {
  animT: number;
  row: number;
  x: number;
  y: number;
}

class Tve4Scene extends Phaser.Scene {
  private readyResolve!: () => void;
  readonly readyPromise: Promise<void>;

  private interaction: Interaction = { placing: null, selectedId: null, hover: null, gx: 0, gy: 0, valid: false };
  private buildingSprites = new Map<number, Phaser.GameObjects.Image>();
  private heroSprites = new Map<number, Phaser.GameObjects.Image>();
  private heroAnim = new Map<number, HeroAnim>();
  private projectileSprites: Phaser.GameObjects.Image[] = [];
  private walls!: Phaser.GameObjects.Graphics;
  private ground!: Phaser.GameObjects.Graphics;
  private shadows!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private overlays!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private texts: Phaser.GameObjects.Text[] = [];

  private camX = WORLD_W / 2;
  private camY = WORLD_H / 2;
  private zoom = 1.15;
  private zoomTarget = 1.15;
  private fullMap = false;
  private forceAttack = false;
  private panning = false;

  constructor() {
    super("tve4");
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
  }

  preload(): void {
    this.load.image("snow", "/tve4/snow.png");
    this.load.image("b_wall", "/tve4/b_wall.png");
    this.load.image("b_tower", "/tve4/b_tower.png");
    this.load.image("b_mine", "/tve4/b_mine.png");
    this.load.image("b_tent", "/tve4/b_tent.png");
    this.load.image("bolt", "/tve4/b_tower.png");
    this.load.spritesheet("elf", "/tve4/hero_elf.png", { frameWidth: FRAME_W, frameHeight: FRAME_H });
    this.load.spritesheet("troll", "/tve4/hero_troll.png", { frameWidth: FRAME_W, frameHeight: FRAME_H });
  }

  create(): void {
    this.add.image(0, 0, "snow").setOrigin(0).setDisplaySize(WORLD_W, WORLD_H).setDepth(0);
    this.drawMapElements();

    this.ground = this.add.graphics().setDepth(2);
    this.shadows = this.add.graphics().setDepth(4);
    this.effects = this.add.graphics().setDepth(32);
    this.overlays = this.add.graphics().setDepth(36);
    this.bars = this.add.graphics().setDepth(42);
    this.ghost = this.add.image(0, 0, "b_wall").setOrigin(0.5).setDepth(30).setAlpha(0.55).setVisible(false);

    for (let i = 0; i < 70; i += 1) {
      this.texts.push(
        this.add
          .text(0, 0, "", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "13px",
            color: "#ffffff",
            stroke: "#050d0a",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(46)
          .setVisible(false),
      );
    }

    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_W, WORLD_H);
    camera.setZoom(this.zoom);
    camera.centerOn(this.camX, this.camY);

    const keyboard = this.input.keyboard;
    keyboard?.on("keydown-M", () => {
      this.fullMap = !this.fullMap;
      this.zoomTarget = this.fullMap
        ? Math.min(this.scale.width / WORLD_W, this.scale.height / WORLD_H) * 0.95
        : 1.15;
      if (this.fullMap) {
        this.camX = WORLD_W / 2;
        this.camY = WORLD_H / 2;
      }
    });
    keyboard?.on("keydown-K", () => (this.forceAttack = true));
    keyboard?.on("keyup-K", () => (this.forceAttack = false));

    this.readyResolve();
  }

  setInteractionInfo(info: Interaction): void {
    this.interaction = info;
  }

  setZoomBy(factor: number): void {
    this.zoomTarget = Phaser.Math.Clamp(this.zoomTarget * factor, 0.08, 2.5);
    this.fullMap = false;
  }

  panBy(dx: number, dy: number): void {
    this.camX = Phaser.Math.Clamp(this.camX + dx, 0, WORLD_W);
    this.camY = Phaser.Math.Clamp(this.camY + dy, 0, WORLD_H);
    this.fullMap = false;
  }

  setPanning(value: boolean): void {
    this.panning = value;
  }

  getZoomValue(): number {
    return this.zoom;
  }

  private drawMapElements(): void {
    const g = this.add.graphics().setDepth(1);
    const paint = (gx: number, gy: number): void => {
      const x = gx * TILE;
      const y = gy * TILE;
      g.fillStyle(0x46545e, 1);
      g.fillRect(x, y, TILE, TILE);
      g.fillStyle(0x788894, 1);
      g.fillRect(x + 1, y + 1, TILE - 2, TILE * 0.42);
      g.fillStyle(0xeaf4f8, 0.85);
      g.fillRect(x, y, TILE, 3);
    };

    for (const room of ROOM_ELEMENTS) {
      const skip = new Set(gateCells(room).map(([x, y]) => `${x},${y}`));
      for (let x = room.x0; x <= room.x1; x += 1) {
        for (const y of [room.y0, room.y1]) {
          if (!skip.has(`${x},${y}`)) paint(x, y);
        }
      }
      for (let y = room.y0; y <= room.y1; y += 1) {
        for (const x of [room.x0, room.x1]) {
          if (!skip.has(`${x},${y}`)) paint(x, y);
        }
      }
    }

    for (const seg of CHOKEPOINTS) {
      const dx = Math.sign(seg.x2 - seg.x1);
      const dy = Math.sign(seg.y2 - seg.y1);
      const steps = Math.max(Math.abs(seg.x2 - seg.x1), Math.abs(seg.y2 - seg.y1));
      for (let i = 0; i <= steps; i += 1) {
        const x = seg.x1 + dx * i;
        const y = seg.y1 + dy * i;
        if (!insideAnyRoom(x, y)) paint(x, y);
      }
    }

    for (const room of ROOM_ELEMENTS) {
      const p = roomCenterWorld(room);
      g.lineStyle(2, 0xde3838, 0.9);
      g.strokeCircle(p.x, p.y, 16);
      this.add
        .text(p.x, p.y, String(room.label), {
          fontFamily: "system-ui, sans-serif",
          fontSize: "15px",
          color: "#de3838",
        })
        .setOrigin(0.5)
        .setDepth(3);
    }
    // 巨魔出生点：无墙标记
    const tx = (64 + 0.5) * TILE;
    const ty = (42 + 0.5) * TILE;
    g.lineStyle(2, 0xff7a5c, 0.95);
    g.strokeCircle(tx, ty, 18);
    this.add
      .text(tx, ty - 26, "巨魔出生点", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        color: "#ff7a5c",
        stroke: "#050d0a",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(3);
  }

  apply(state: GameState): void {
    const camera = this.cameras.main;
    const player = state.heroes.find((h) => h.isPlayer && h.alive);
    if (!this.fullMap && !this.panning && player) {
      this.camX += (player.x - this.camX) * 0.1;
      this.camY += (player.y - this.camY) * 0.1;
    }
    this.zoom += (this.zoomTarget - this.zoom) * 0.12;
    camera.setZoom(this.zoom);
    camera.centerOn(this.camX, this.camY);

    this.ground.clear();
    this.shadows.clear();
    this.effects.clear();
    this.overlays.clear();
    this.bars.clear();

    // 网格（只画房间附近的可通行格，弱化显示）
    this.ground.lineStyle(1, 0xffffff, 0.035);
    for (let gy = 0; gy < GRID_H; gy += 2) {
      this.ground.lineBetween(0, gy * TILE, WORLD_W, gy * TILE);
    }
    for (let gx = 0; gx < GRID_W; gx += 2) {
      this.ground.lineBetween(gx * TILE, 0, gx * TILE, WORLD_H);
    }

    // 建筑
    const aliveBuildings = new Set<number>();
    for (const b of state.buildings) {
      if (!b.alive) continue;
      aliveBuildings.add(b.id);
      let sprite = this.buildingSprites.get(b.id);
      if (!sprite) {
        sprite = this.add.image(0, 0, BUILDINGS[b.kind].texture).setOrigin(0.5, 0.85).setDepth(10);
        this.buildingSprites.set(b.id, sprite);
      }
      const px = b.size * TILE;
      const building = BUILDINGS[b.kind];
      sprite
        .setVisible(true)
        .setTexture(building.texture)
        .setDisplaySize(px * 1.15, px * 1.25)
        .setPosition(b.x, b.y)
        .setDepth(10 + Math.floor(b.y / 200))
        .setAlpha(b.buildTimer > 0 ? 0.55 : 1)
        .clearTint();
      if (b.flash > 0) sprite.setTint(0xffc0c0);
      else if (b.level > 1) sprite.setTint(0xfff0c0);
      this.shadows.fillStyle(0x04100d, 0.28);
      this.shadows.fillEllipse(b.x + 3, b.y + px * 0.1, px * 0.8, px * 0.3);
      if (b.hp < b.maxHp || b.id === this.interaction.selectedId) {
        this.drawBar(b.x, b.y - px * 0.55, Math.max(28, px * 0.85), b.hp / b.maxHp, b.faction === "elf" ? 0x7ee08a : 0xff7a5c);
      }
      if (b.level > 1) {
        for (let i = 0; i < b.level - 1; i += 1) {
          this.bars.fillStyle(0xffd86b, 0.95);
          this.bars.fillCircle(b.x - 6 + i * 8, b.y - px * 0.68, 2.5);
        }
      }
      if (b.buildTimer > 0) {
        const total = building.buildTime || 1;
        const p = Phaser.Math.Clamp(1 - b.buildTimer / total, 0, 1);
        this.bars.fillStyle(0x0b1a17, 0.85);
        this.bars.fillRect(b.x - 22, b.y - px * 0.42, 44, 4);
        this.bars.fillStyle(0x8be3ff, 0.95);
        this.bars.fillRect(b.x - 22, b.y - px * 0.42, 44 * p, 4);
      }
      if (b.id === this.interaction.selectedId) {
        this.overlays.lineStyle(2, 0xffd86b, 0.9);
        this.overlays.strokeRect(b.x - px / 2 - 3, b.y - px / 2 - 3, px + 6, px + 6);
      }
      if (b.eyeMarked > 0) {
        this.overlays.lineStyle(2, 0xff7a5c, 0.9);
        this.overlays.strokeCircle(b.x, b.y, px * 0.7);
      }
    }
    for (const [id, sprite] of this.buildingSprites) if (!aliveBuildings.has(id)) sprite.setVisible(false);

    // 投射物
    while (this.projectileSprites.length < state.projectiles.length) {
      this.projectileSprites.push(this.add.image(0, 0, "bolt").setOrigin(0.5).setDepth(28).setDisplaySize(8, 8).setTint(0xffe08a));
    }
    for (let i = 0; i < this.projectileSprites.length; i += 1) {
      const sprite = this.projectileSprites[i];
      const p = state.projectiles[i];
      if (p) sprite.setVisible(true).setPosition(p.x, p.y);
      else sprite.setVisible(false);
    }

    // 英雄
    const aliveHeroes = new Set<number>();
    for (const h of state.heroes) {
      if (!h.alive && h.deathTimer <= 0) continue;
      aliveHeroes.add(h.id);
      let sprite = this.heroSprites.get(h.id);
      if (!sprite) {
        sprite = this.add.image(0, 0, h.faction === "elf" ? "elf" : "troll").setOrigin(0.5, 0.92).setDepth(20);
        this.heroSprites.set(h.id, sprite);
      }
      const prev = this.heroAnim.get(h.id);
      const moved = prev ? Math.hypot(h.x - prev.x, h.y - prev.y) > 0.12 : false;
      const dt = prev ? 1 / 60 : 0;
      const row = !h.alive
        ? ROWS.death
        : this.forceAttack || h.cd > h.interval * 0.45
          ? ROWS.attack
          : moved
            ? ROWS.walk
            : ROWS.idle;
      const animT = prev && prev.row === row ? prev.animT + dt : 0;
      this.heroAnim.set(h.id, { animT, row, x: h.x, y: h.y });
      const fps = row === ROWS.walk ? 9 : row === ROWS.attack ? 14 : row === ROWS.death ? 7 : 3;
      const frame = row * 6 + Math.floor(animT * fps) % 6;
      const height = h.faction === "troll" ? 104 : 72;
      const width = height * (FRAME_W / FRAME_H);
      const alpha = !h.alive
        ? Phaser.Math.Clamp(h.deathTimer / 1.5, 0, 1)
        : h.buffs.windwalk > 0 && h.buffs.revealed <= 0
          ? 0.38
          : 1;
      sprite
        .setVisible(true)
        .setTexture(h.faction === "elf" ? "elf" : "troll", frame)
        .setDisplaySize(width, height)
        .setPosition(h.x, h.y)
        .setDepth(10.5 + Math.floor(h.y / 200))
        .setAlpha(alpha)
        .setFlipX(Math.cos(h.facing) < -0.08)
        .clearTint();
      if (h.flash > 0) sprite.setTint(0xff9c9c);
      else if (h.isWolf) sprite.setTint(0xc9c2b0);
      else if (h.buffs.windwalk > 0) sprite.setTint(0xbfe9ff);
      else if (h.buffs.berserk > 0) sprite.setTint(0xffb0a0);
      const sw = h.faction === "troll" ? 50 : 32;
      this.shadows.fillStyle(0x04100d, 0.26);
      this.shadows.fillEllipse(h.x + 2, h.y + 5, sw, sw * 0.32);
      if (h.alive && (h.isPlayer || h.hp < h.maxHp)) {
        const barW = h.faction === "troll" ? 68 : 46;
        this.drawBar(h.x, h.y - height * 0.92, barW, h.hp / h.maxHp, h.faction === "elf" ? 0x7ee08a : 0xff7a5c);
      }
      if (h.isPlayer && h.alive) {
        const exposed = state.elfExposed && !state.buildings.some(
          (b) => b.alive && b.faction === "elf" && b.kind === "tent" && b.level >= 5,
        );
        this.overlays.lineStyle(2, exposed ? 0xff6b6b : 0x7ee08a, 0.8);
        this.overlays.strokeEllipse(h.x, h.y + 5, sw + 10, sw * 0.38);
      }
      if (h.buffs.root > 0) {
        this.overlays.lineStyle(2, 0x9be7ff, 0.9);
        this.overlays.strokeCircle(h.x, h.y - 14, h.radius + 8);
      }
    }
    for (const [id, sprite] of this.heroSprites) if (!aliveHeroes.has(id)) sprite.setVisible(false);
    for (const [id] of this.heroAnim) if (!aliveHeroes.has(id)) this.heroAnim.delete(id);

    // 特效
    for (const e of state.effects) {
      const p = Phaser.Math.Clamp(e.t / e.dur, 0, 1);
      const color = e.color.startsWith("#") ? Phaser.Display.Color.HexStringToColor(e.color).color : 0xffffff;
      this.effects.lineStyle(2.5, color, 1 - p);
      this.effects.strokeCircle(e.x, e.y, e.radius * (0.35 + p * 0.75));
    }

    // 飘字
    let ti = 0;
    for (const f of state.floats) {
      if (ti >= this.texts.length) break;
      const t = this.texts[ti++];
      t.setVisible(true)
        .setText(f.text)
        .setFontSize(f.size)
        .setColor(f.color)
        .setPosition(f.x, f.y - f.t * 28)
        .setAlpha(1 - Phaser.Math.Clamp(f.t / f.dur, 0, 1));
    }
    for (; ti < this.texts.length; ti += 1) this.texts[ti].setVisible(false);

    // 建造预览
    const placing = this.interaction.placing;
    if (placing && this.interaction.hover) {
      const def = BUILDINGS[placing];
      const cx = (this.interaction.gx + def.size / 2) * TILE;
      const cy = (this.interaction.gy + def.size / 2) * TILE;
      const color = this.interaction.valid ? 0x7bffa0 : 0xff5a5a;
      this.ghost
        .setVisible(true)
        .setTexture(def.texture)
        .setDisplaySize(def.size * TILE * 1.15, def.size * TILE * 1.25)
        .setPosition(cx, cy)
        .setTint(color);
      this.overlays.lineStyle(2, color, 0.9);
      this.overlays.strokeRect(this.interaction.gx * TILE, this.interaction.gy * TILE, def.size * TILE, def.size * TILE);
    } else {
      this.ghost.setVisible(false);
    }
  }

  private drawBar(x: number, y: number, width: number, ratio: number, color: number): void {
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    this.bars.fillStyle(0x06100f, 0.9);
    this.bars.fillRect(x - width / 2 - 1, y - 1, width + 2, 7);
    this.bars.fillStyle(0x1b2b2a, 1);
    this.bars.fillRect(x - width / 2, y, width, 5);
    this.bars.fillStyle(color, 1);
    this.bars.fillRect(x - width / 2, y, width * r, 5);
  }
}

export async function createStage4(canvas: HTMLCanvasElement, width: number, height: number): Promise<Stage4> {
  const scene = new Tve4Scene();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    canvas,
    width,
    height,
    parent: canvas.parentElement ?? undefined,
    backgroundColor: "#cbdde6",
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER, width, height },
    render: { antialias: true },
    scene: [scene],
  } as Phaser.Types.Core.GameConfig);
  await Promise.race([
    scene.readyPromise,
    new Promise<void>((_, reject) => {
      window.setTimeout(() => reject(new Error("渲染器初始化超时，请检查浏览器 WebGL 支持")), 8000);
    }),
  ]);
  return {
    render: (state) => scene.apply(state),
    setInteraction: (info) => {
      scene.setInteractionInfo(info);
    },
    zoomBy: (factor) => scene.setZoomBy(factor),
    panBy: (dx, dy) => scene.panBy(dx, dy),
    setPanning: (value) => scene.setPanning(value),
    getZoom: () => scene.getZoomValue(),
    resize: (w, h) => {
      game.scale.resize(w, h);
      scene.cameras.main.setSize(w, h);
    },
    screenToWorld: (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const camera = scene.cameras.main;
      const px = ((clientX - rect.left) / Math.max(1, rect.width)) * camera.width;
      const py = ((clientY - rect.top) / Math.max(1, rect.height)) * camera.height;
      const p = camera.getWorldPoint(px, py);
      return { x: p.x, y: p.y };
    },
    destroy: () => game.destroy(false),
  };
}
