"use client";

import * as Phaser from "phaser";

import { BUILDINGS, TILE } from "@/lib/tve4/config";
import { cellCenter } from "@/lib/tve4/map";
import {
  assertRuntimeBoundsMatch,
  cameraBoundsToWeb,
  computeGeometryHash,
  validateRenderGeometry,
  type RenderBounds,
  type RenderGeometry,
} from "@/lib/tve4/render/geometry";
import {
  drawPhaserPlaceholderBuilding,
  drawPhaserPlaceholderUnit,
  MAP_BACKGROUND_COLOR,
  type PlaceholderUnitState,
} from "@/lib/tve4/render/placeholder";
import { HeroModelViewer } from "@/lib/tve4/render/hero-model-viewer";
import { buildPathingBoundarySegments } from "@/lib/tve4/render/pathing-boundary";
import { actionSequenceIndex, loadHeroModelManifest, modelActionFor } from "@/lib/tve4/model-catalog";
import type { ModelDemoEntry } from "@/lib/tve4-model-demo/manifest";
import type { ActionKey } from "@/lib/tve4-model-demo/sequences";
import type { GameState, Interaction } from "@/lib/tve4/types";

export interface Stage4 {
  updateSession(session: GameState["session"]): void;
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

class Tve4Scene extends Phaser.Scene {
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  readonly readyPromise: Promise<void>;

  private interaction: Interaction = { placing: null, selectedId: null, hover: null, gx: 0, gy: 0, valid: false };
  private terrain!: Phaser.GameObjects.Graphics;
  private pathingBoundary!: Phaser.GameObjects.Graphics;
  private markers!: Phaser.GameObjects.Graphics;
  private shadows!: Phaser.GameObjects.Graphics;
  private entities!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private overlays!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.Image;
  private bars!: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private geometry!: RenderGeometry;

  private readonly map: GameState["session"]["map"];
  private spawns: GameState["session"]["spawns"];
  private spawnLabels: Phaser.GameObjects.Text[] = [];
  private readonly catalogVersion: string;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly runtimeBounds: RenderBounds;
  private readonly cameraRect: { x: number; y: number; width: number; height: number };
  private readonly pathing32: Uint8Array;
  private readonly heroModelId: string | null;
  private heroModelViewer: HeroModelViewer | null = null;
  private heroModelCanvas: HTMLCanvasElement | null = null;
  private heroModelEntry: ModelDemoEntry | null = null;
  private heroModelAction: ActionKey | null = null;
  private modelDisposed = false;

  private camX: number;
  private camY: number;
  private zoom = 1.15;
  private zoomTarget = 1.15;
  private fullMap = false;
  private forceAttack = false;
  private panning = false;

  constructor(initialState: GameState) {
    super("tve4");
    this.map = initialState.session.map;
    this.spawns = initialState.session.spawns;
    this.catalogVersion = initialState.catalogVersion;
    this.worldWidth = initialState.session.grid.world[0];
    this.worldHeight = initialState.session.grid.world[1];
    this.runtimeBounds = [...initialState.session.grid.bounds];
    this.cameraRect = cameraBoundsToWeb(this.map.cameraBounds, this.runtimeBounds);
    this.pathing32 = initialState.session.pathing32;
    this.heroModelId = initialState.appearance.heroModelId;
    this.camX = this.cameraRect.x + this.cameraRect.width / 2;
    this.camY = this.cameraRect.y + this.cameraRect.height / 2;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  preload(): void {
    const url = `/tve4/geometry/map-${this.map.id}.json?v=${encodeURIComponent(this.catalogVersion)}`;
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      this.readyReject(new Error(`地图渲染几何加载失败: ${file.url}`));
    });
    this.load.json("render-geometry", url);
  }

  create(): void {
    void this.initialize().catch((error: unknown) => {
      this.readyReject(error instanceof Error ? error : new Error("地图渲染几何初始化失败"));
    });
  }

  private async initialize(): Promise<void> {
    const geometry = validateRenderGeometry(this.cache.json.get("render-geometry"), this.runtimeBounds);
    if (geometry.mapId !== this.map.id) {
      throw new Error(`地图渲染几何 mapId 不符: ${geometry.mapId} != ${this.map.id}`);
    }
    if (geometry.catalogVersion !== this.catalogVersion) {
      throw new Error("地图渲染几何 catalogVersion 与模拟目录不一致");
    }
    const geometryHash = await computeGeometryHash(geometry);
    if (geometryHash !== geometry.geometryHash) {
      throw new Error("地图渲染几何 hash 校验失败");
    }
    this.geometry = geometry;

    this.terrain = this.add.graphics().setDepth(0);
    this.pathingBoundary = this.add.graphics().setDepth(1);
    this.markers = this.add.graphics().setDepth(3);
    this.shadows = this.add.graphics().setDepth(4);
    this.entities = this.add.graphics().setDepth(10);
    this.effects = this.add.graphics().setDepth(32);
    this.overlays = this.add.graphics().setDepth(36);
    const fogTexture = this.textures.createCanvas("tve4-fog", 512, 512);
    if (!fogTexture) throw new Error("无法创建迷雾渐变纹理");
    const fogContext = fogTexture.getContext();
    const gradient = fogContext.createRadialGradient(256, 256, 0, 256, 256, 256);
    gradient.addColorStop(0, "rgba(2,6,10,0)");
    gradient.addColorStop(0.28, "rgba(2,6,10,0)");
    gradient.addColorStop(0.52, "rgba(2,6,10,0.58)");
    gradient.addColorStop(0.76, "rgba(2,6,10,0.72)");
    gradient.addColorStop(1, "rgba(2,6,10,0.82)");
    fogContext.fillStyle = gradient;
    fogContext.fillRect(0, 0, 512, 512);
    fogTexture.refresh();
    this.fog = this.add.image(0, 0, "tve4-fog").setOrigin(0.5).setScrollFactor(0).setDepth(38);
    this.bars = this.add.graphics().setDepth(42);

    this.drawTerrain();
    this.drawPathingBoundary();
    this.drawSpawnMarkers();

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
    camera.setBounds(this.cameraRect.x, this.cameraRect.y, this.cameraRect.width, this.cameraRect.height);
    camera.setZoom(this.zoom);
    camera.centerOn(this.camX, this.camY);

    const keyboard = this.input.keyboard;
    keyboard?.on("keydown-M", () => {
      this.fullMap = !this.fullMap;
      this.zoomTarget = this.fullMap
        ? Math.min(this.scale.width / this.cameraRect.width, this.scale.height / this.cameraRect.height) * 0.95
        : 1.15;
      if (this.fullMap) {
        this.camX = this.cameraRect.x + this.cameraRect.width / 2;
        this.camY = this.cameraRect.y + this.cameraRect.height / 2;
      }
    });
    keyboard?.on("keydown-K", () => (this.forceAttack = true));
    keyboard?.on("keyup-K", () => (this.forceAttack = false));

    const canvas = this.game.canvas;
    canvas.dataset.tve4Ready = "true";
    canvas.dataset.mapId = String(this.map.id);
    canvas.dataset.catalogVersion = geometry.catalogVersion;
    canvas.dataset.geometryHash = geometry.geometryHash;
    canvas.dataset.runtimeBounds = JSON.stringify(this.runtimeBounds);
    canvas.dataset.cameraBounds = JSON.stringify(this.cameraRect);
    canvas.dataset.terrainTiles = String(geometry.terrain.length);
    canvas.dataset.doodads = String(geometry.doodads.length);
    canvas.dataset.doodadsVisible = "false";
    canvas.dataset.mapStyle = "flat";
    canvas.dataset.fogEnabled = "true";
    this.readyResolve();
    void this.initializeHeroModel();
  }

  private drawTerrain(): void {
    this.terrain.fillStyle(Phaser.Display.Color.HexStringToColor(MAP_BACKGROUND_COLOR).color, 1);
    this.terrain.fillRect(0, 0, this.worldWidth, this.worldHeight);
  }

  private drawPathingBoundary(): void {
    const { pathing } = this.map;
    const segments = buildPathingBoundarySegments(
      this.pathing32,
      pathing.width,
      pathing.height,
      pathing.cellUnits,
      pathing.origin,
      this.runtimeBounds,
    );
    this.pathingBoundary.lineStyle(3, 0x0b120f, 0.95);
    for (const segment of segments) {
      this.pathingBoundary.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
    }
    this.pathingBoundary.lineStyle(1, 0xd8c79f, 0.95);
    for (const segment of segments) {
      this.pathingBoundary.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
    }
    this.game.canvas.dataset.pathingBoundaries = String(segments.length);
  }

  private async initializeHeroModel(): Promise<void> {
    if (!this.heroModelId || this.modelDisposed) return;
    try {
      const models = await loadHeroModelManifest();
      const entry = models.find((candidate) => candidate.id === this.heroModelId);
      if (!entry || this.modelDisposed) return;
      const canvas = document.createElement("canvas");
      canvas.style.position = "absolute";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "5";
      canvas.style.width = "96px";
      canvas.style.height = "96px";
      canvas.style.display = "none";
      canvas.dataset.heroModelId = entry.id;
      this.game.canvas.parentElement?.appendChild(canvas);
      const viewer = new HeroModelViewer(canvas);
      this.heroModelCanvas = canvas;
      this.heroModelViewer = viewer;
      await viewer.load(entry);
      if (this.modelDisposed) return;
      const color = entry.group === "elf" ? [0.384, 0.780, 0.482] : [0.878, 0.478, 0.310];
      viewer.setTeamColor(color as [number, number, number]);
      this.heroModelEntry = entry;
      canvas.dataset.heroModelReady = "true";
      this.game.canvas.dataset.heroModelId = entry.id;
      this.game.canvas.dataset.heroModelReady = "true";
    } catch (error) {
      this.disposeHeroModel();
      this.game.canvas.dataset.heroModelError = error instanceof Error ? error.message : String(error);
    }
  }

  private syncHeroModel(player: GameState["heroes"][number] | undefined): void {
    const canvas = this.heroModelCanvas;
    const viewer = this.heroModelViewer;
    const entry = this.heroModelEntry;
    if (!canvas || !viewer || !entry || !player) {
      if (canvas) canvas.style.display = "none";
      return;
    }
    const camera = this.cameras.main;
    const screenPoint = camera.getViewMatrix(true).transformPoint(player.x, player.y);
    const baseSize = player.faction === "troll" ? 120 : 96;
    const size = Phaser.Math.Clamp(baseSize * this.zoom, 72, 180);
    canvas.style.display = "block";
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.left = `${screenPoint.x - size / 2}px`;
    canvas.style.top = `${screenPoint.y - size / 2}px`;
    const action = modelActionFor(entry, {
      alive: player.alive,
      moving: player.vx !== 0 || player.vy !== 0,
      attacking: this.forceAttack || player.cd > player.interval * 0.45,
    });
    if (action !== this.heroModelAction) {
      const index = actionSequenceIndex(entry, action);
      if (index !== null) {
        viewer.setSequence(index);
        viewer.setPlaying(true);
        this.heroModelAction = action;
        this.game.canvas.dataset.heroModelAction = action;
      }
    }
  }

  disposeHeroModel(): void {
    this.modelDisposed = true;
    this.heroModelViewer?.destroy();
    this.heroModelViewer = null;
    this.heroModelCanvas?.remove();
    this.heroModelCanvas = null;
    this.heroModelEntry = null;
    this.heroModelAction = null;
    delete this.game.canvas.dataset.heroModelId;
    delete this.game.canvas.dataset.heroModelReady;
    delete this.game.canvas.dataset.heroModelAction;
    delete this.game.canvas.dataset.heroModelError;
  }

  private drawSpawnMarkers(): void {
    this.markers.clear();
    for (const label of this.spawnLabels) label.destroy();
    this.spawnLabels = [];
    const marker = (gx: number, gy: number, color: number, label: string, radius: number): void => {
      const point = cellCenter(gx, gy);
      this.markers.lineStyle(2, color, 0.95);
      this.markers.strokeCircle(point.x, point.y, radius);
      this.spawnLabels.push(
        this.add
          .text(point.x, point.y - radius - 10, label, {
            fontFamily: "system-ui, sans-serif",
            fontSize: "13px",
            color: `#${color.toString(16).padStart(6, "0")}`,
            stroke: "#050d0a",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(3),
      );
    };

    if (this.spawns.troll) marker(this.spawns.troll.gx, this.spawns.troll.gy, 0xff7a5c, "巨魔出生点", 20);
    if (this.spawns.elf) marker(this.spawns.elf.gx, this.spawns.elf.gy, 0x7ee08a, "精灵出生点", 16);
    this.game.canvas.dataset.spawns = JSON.stringify(this.spawns);
    this.game.canvas.dataset.spawnMarkers = String(this.spawnLabels.length);
  }

  updateSession(session: GameState["session"]): void {
    if (session.map !== this.map || session.mapId !== this.map.id || session.catalogVersion !== this.catalogVersion) {
      throw new Error("Stage4 会话更新仅允许相同地图与 catalogVersion");
    }
    assertRuntimeBoundsMatch(this.runtimeBounds, session.grid.bounds);
    this.spawns = session.spawns;
    this.drawSpawnMarkers();
  }

  setInteractionInfo(info: Interaction): void {
    this.interaction = info;
  }

  setZoomBy(factor: number): void {
    this.zoomTarget = Phaser.Math.Clamp(this.zoomTarget * factor, 0.08, 2.5);
    this.fullMap = false;
  }

  panBy(dx: number, dy: number): void {
    this.camX = Phaser.Math.Clamp(this.camX + dx, this.cameraRect.x, this.cameraRect.x + this.cameraRect.width);
    this.camY = Phaser.Math.Clamp(this.camY + dy, this.cameraRect.y, this.cameraRect.y + this.cameraRect.height);
    this.fullMap = false;
  }

  setPanning(value: boolean): void {
    this.panning = value;
  }

  getZoomValue(): number {
    return this.zoom;
  }

  apply(state: GameState): void {
    const camera = this.cameras.main;
    const player = state.heroes.find((hero) => hero.isPlayer && hero.alive);
    if (player) {
      this.game.canvas.dataset.playerX = player.x.toFixed(3);
      this.game.canvas.dataset.playerY = player.y.toFixed(3);
    } else {
      delete this.game.canvas.dataset.playerX;
      delete this.game.canvas.dataset.playerY;
    }
    this.game.canvas.dataset.buildingCount = String(state.buildings.filter((building) => building.alive).length);
    if (!this.fullMap && !this.panning && player) {
      this.camX += (player.x - this.camX) * 0.1;
      this.camY += (player.y - this.camY) * 0.1;
    }
    this.zoom += (this.zoomTarget - this.zoom) * 0.12;
    camera.setZoom(this.zoom);
    camera.centerOn(this.camX, this.camY);
    camera.preRender();
    this.game.canvas.dataset.zoom = this.zoom.toFixed(3);
    if (player) {
      const screenPoint = camera.getViewMatrix(true).transformPoint(player.x, player.y);
      this.game.canvas.dataset.playerScreenX = screenPoint.x.toFixed(2);
      this.game.canvas.dataset.playerScreenY = screenPoint.y.toFixed(2);
    } else {
      delete this.game.canvas.dataset.playerScreenX;
      delete this.game.canvas.dataset.playerScreenY;
    }
    this.syncHeroModel(player);

    this.shadows.clear();
    this.entities.clear();
    this.effects.clear();
    this.overlays.clear();
    this.bars.clear();

    for (const building of state.buildings) {
      if (!building.alive) continue;
      const pixels = building.size * TILE;
      const definition = BUILDINGS[building.kind];
      const alpha = building.buildTimer > 0 && building.kind !== "wall" ? 0.55 : 1;
      this.shadows.fillStyle(0x04100d, 0.28);
      this.shadows.fillEllipse(building.x + 3, building.y + pixels * 0.1, pixels * 0.8, pixels * 0.3);
      drawPhaserPlaceholderBuilding(
        this.entities,
        building.x,
        building.y,
        pixels,
        building.kind,
        building.faction,
        building.level,
        { alpha },
      );
      if (building.kind === "wall") {
        this.overlays.lineStyle(8, 0xffd86b, 0.25);
        this.overlays.strokeRect(building.x - pixels / 2 - 4, building.y - pixels / 2 - 4, pixels + 8, pixels + 8);
        this.overlays.lineStyle(4, 0x1a1410, 1);
        this.overlays.strokeRect(building.x - pixels / 2 - 1, building.y - pixels / 2 - 1, pixels + 2, pixels + 2);
        this.overlays.lineStyle(2, 0xffe6ad, 1);
        this.overlays.strokeRect(building.x - pixels / 2, building.y - pixels / 2, pixels, pixels);
      }
      if (building.flash > 0) {
        this.overlays.lineStyle(2, 0xffc0c0, 0.8);
        this.overlays.strokeCircle(building.x, building.y, pixels * 0.65);
      }
      if (building.hp < building.maxHp || building.id === this.interaction.selectedId) {
        this.drawBar(
          building.x,
          building.y - pixels * 0.55,
          Math.max(28, pixels * 0.85),
          building.hp / building.maxHp,
          building.faction === "elf" ? 0x7ee08a : 0xff7a5c,
        );
      }
      if (building.level > 1) {
        for (let i = 0; i < building.level - 1; i += 1) {
          this.bars.fillStyle(0xffd86b, 0.95);
          this.bars.fillCircle(building.x - 6 + i * 8, building.y - pixels * 0.68, 2.5);
        }
      }
      if (building.buildTimer > 0) {
        const total = definition.buildTime || 1;
        const progress = Phaser.Math.Clamp(1 - building.buildTimer / total, 0, 1);
        this.bars.fillStyle(0x0b1a17, 0.85);
        this.bars.fillRect(building.x - 22, building.y - pixels * 0.42, 44, 4);
        this.bars.fillStyle(0x8be3ff, 0.95);
        this.bars.fillRect(building.x - 22, building.y - pixels * 0.42, 44 * progress, 4);
      }
      if (building.id === this.interaction.selectedId) {
        this.overlays.lineStyle(2, 0xffd86b, 0.9);
        this.overlays.strokeRect(building.x - pixels / 2 - 3, building.y - pixels / 2 - 3, pixels + 6, pixels + 6);
      }
      if (building.eyeMarked > 0) {
        this.overlays.lineStyle(2, 0xff7a5c, 0.9);
        this.overlays.strokeCircle(building.x, building.y, pixels * 0.7);
      }
    }

    for (const projectile of state.projectiles) {
      this.effects.fillStyle(0xffe08a, 1);
      this.effects.fillCircle(projectile.x, projectile.y, 4);
    }

    for (const hero of state.heroes) {
      if (!hero.alive && hero.deathTimer <= 0) continue;
      const moved = hero.vx !== 0 || hero.vy !== 0;
      const heroState: PlaceholderUnitState = !hero.alive
        ? "dead"
        : this.forceAttack || hero.cd > hero.interval * 0.45
          ? "attack"
          : moved
            ? "move"
            : "idle";
      const kind = hero.isWolf ? "wolf" : hero.isAlly ? "archmage" : hero.faction;
      const alpha = !hero.alive
        ? Phaser.Math.Clamp(hero.deathTimer / 1.5, 0, 1)
        : hero.buffs.windwalk > 0 && hero.buffs.revealed <= 0
          ? 0.38
          : 1;
      const shadowWidth = hero.faction === "troll" ? 50 : 32;
      this.shadows.fillStyle(0x04100d, 0.26);
      this.shadows.fillEllipse(hero.x + 2, hero.y + 5, shadowWidth, shadowWidth * 0.32);
      const playerModelActive = hero.isPlayer && Boolean(this.heroModelViewer?.ready && this.heroModelEntry);
      if (!playerModelActive) {
        drawPhaserPlaceholderUnit(this.entities, hero.x, hero.y, kind, hero.faction, heroState, {
          alpha,
          flipX: Math.cos(hero.facing) < -0.08,
          scale: hero.faction === "troll" ? 1 : 0.9,
        });
      }
      if (hero.alive && (hero.isPlayer || hero.hp < hero.maxHp)) {
        const height = hero.faction === "troll" ? 30 : 24;
        const barWidth = hero.faction === "troll" ? 68 : 46;
        this.drawBar(hero.x, hero.y - height - 8, barWidth, hero.hp / hero.maxHp, hero.faction === "elf" ? 0x7ee08a : 0xff7a5c);
      }
      if (hero.isPlayer && hero.alive) {
        const exposed = state.elfExposed && !state.buildings.some(
          (building) => building.alive && building.faction === "elf" && building.kind === "tent" && building.level >= 5,
        );
        this.overlays.lineStyle(2, exposed ? 0xff6b6b : 0x7ee08a, 0.8);
        this.overlays.strokeEllipse(hero.x, hero.y + 5, shadowWidth + 10, shadowWidth * 0.38);
      }
      if (hero.buffs.root > 0) {
        this.overlays.lineStyle(2, 0x9be7ff, 0.9);
        this.overlays.strokeCircle(hero.x, hero.y - 14, hero.radius + 8);
      }
    }

    for (const effect of state.effects) {
      const progress = Phaser.Math.Clamp(effect.t / effect.dur, 0, 1);
      const color = effect.color.startsWith("#") ? Phaser.Display.Color.HexStringToColor(effect.color).color : 0xffffff;
      this.effects.lineStyle(2.5, color, 1 - progress);
      this.effects.strokeCircle(effect.x, effect.y, effect.radius * (0.35 + progress * 0.75));
    }

    let textIndex = 0;
    for (const float of state.floats) {
      if (textIndex >= this.texts.length) break;
      const text = this.texts[textIndex++];
      text.setVisible(true)
        .setText(float.text)
        .setFontSize(float.size)
        .setColor(float.color)
        .setPosition(float.x, float.y - float.t * 28)
        .setAlpha(1 - Phaser.Math.Clamp(float.t / float.dur, 0, 1));
    }
    for (; textIndex < this.texts.length; textIndex += 1) this.texts[textIndex].setVisible(false);

    const placing = this.interaction.placing;
    if (placing && this.interaction.hover) {
      const definition = BUILDINGS[placing];
      const centerX = (this.interaction.gx + definition.size / 2) * TILE;
      const centerY = (this.interaction.gy + definition.size / 2) * TILE;
      const color = this.interaction.valid ? 0x7bffa0 : 0xff5a5a;
      drawPhaserPlaceholderBuilding(
        this.overlays,
        centerX,
        centerY,
        definition.size * TILE,
        placing,
        state.playerFaction,
        1,
        { alpha: 0.55 },
      );
      this.overlays.lineStyle(2, color, 0.9);
      this.overlays.strokeRect(this.interaction.gx * TILE, this.interaction.gy * TILE, definition.size * TILE, definition.size * TILE);
    }

    this.syncFog(player);
  }

  private syncFog(player: GameState["heroes"][number] | undefined): void {
    if (this.fullMap) {
      this.fog.setVisible(false);
      return;
    }
    this.fog.setVisible(true);
    const camera = this.cameras.main;
    if (!player) {
      this.fog.setPosition(camera.width / 2, camera.height / 2);
      this.fog.setDisplaySize(Math.max(camera.width, camera.height) * 2.2, Math.max(camera.width, camera.height) * 2.2);
      return;
    }
    const screenPoint = camera.getViewMatrix(true).transformPoint(player.x, player.y);
    const size = Math.max(camera.width, camera.height) * 2.2;
    this.fog.setPosition(screenPoint.x, screenPoint.y);
    this.fog.setDisplaySize(size, size);
  }

  private drawBar(x: number, y: number, width: number, ratio: number, color: number): void {
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    this.bars.fillStyle(0x06100f, 0.9);
    this.bars.fillRect(x - width / 2 - 1, y - 1, width + 2, 7);
    this.bars.fillStyle(0x1b2b2a, 1);
    this.bars.fillRect(x - width / 2, y, width, 5);
    this.bars.fillStyle(color, 1);
    this.bars.fillRect(x - width / 2, y, width * clamped, 5);
  }
}

export async function createStage4(canvas: HTMLCanvasElement, width: number, height: number, initialState: GameState): Promise<Stage4> {
  const scene = new Tve4Scene(initialState);
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
  let timeoutId: number | undefined;
  try {
    await Promise.race([
      scene.readyPromise,
      new Promise<void>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("渲染器初始化超时，请检查浏览器 WebGL 支持")), 15000);
      }),
    ]);
  } catch (error) {
    delete canvas.dataset.tve4Ready;
    game.destroy(false);
    throw error;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
  return {
    updateSession: (session) => scene.updateSession(session),
    render: (state) => scene.apply(state),
    setInteraction: (info) => scene.setInteractionInfo(info),
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
      const point = camera.getWorldPoint(px, py);
      return { x: point.x, y: point.y };
    },
    destroy: () => {
      scene.disposeHeroModel();
      delete canvas.dataset.tve4Ready;
      game.destroy(false);
    },
  };
}
