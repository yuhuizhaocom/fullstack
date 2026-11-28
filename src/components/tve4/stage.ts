"use client";

import * as Phaser from "phaser";

import { createPerception } from "@/lib/tve4/ai/perception";
import { playTve4Sfx } from "@/lib/tve4/audio";
import { collectTve4AudioEvents, type Tve4AudioEventState } from "@/lib/tve4/audio-events";
import { fogDisplaySize, heroVisionRadius, isEntityVisibleToPlayer } from "@/lib/tve4/vision";
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
import { heroModelOrientation } from "@/lib/tve4/render/hero-model-facing";
import { buildPathingBoundarySegments } from "@/lib/tve4/render/pathing-boundary";
import { actionSequenceIndex, heroModelsForFaction, loadHeroModelManifest, modelActionFor, pickHeroModel } from "@/lib/tve4/model-catalog";
import type { ModelDemoEntry } from "@/lib/tve4-model-demo/manifest";
import type { ActionKey } from "@/lib/tve4-model-demo/sequences";
import type { Faction, GameState, Interaction } from "@/lib/tve4/types";

export interface Stage4 {
  updateSession(session: GameState["session"], appearance?: GameState["appearance"]): void;
  render(state: GameState): void;
  setInteraction(info: Interaction): void;
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
  setPanning(value: boolean): void;
  focusPlayer(): void;
  focusTroll(): void;
  getZoom(): number;
  resize(width: number, height: number): void;
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } | null;
  destroy(): void;
}

interface HeroModelOverlay {
  viewer: HeroModelViewer;
  canvas: HTMLCanvasElement;
  entry: ModelDemoEntry;
  action: ActionKey | null;
}

function visualRandomUnit(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    try {
      return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
    } catch {
      return Math.random();
    }
  }
  return Math.random();
}

function teamColor(faction: Faction): [number, number, number] {
  const hex = faction === "elf" ? 0x62c77b : 0xe07a4f;
  return [(hex >> 16) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
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
  private wallOutlines!: Phaser.GameObjects.Graphics;
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
  private readonly playerFaction: Faction;
  private appearance: GameState["appearance"];
  private playerModel: HeroModelOverlay | null = null;
  private aiModel: HeroModelOverlay | null = null;
  private modelDisposed = false;
  private modelGeneration = 0;
  private audioEventState: Tve4AudioEventState | null = null;

  private camX: number;
  private camY: number;
  private zoom = 1.15;
  private zoomTarget = 1.15;
  private fullMap = false;
  private followPlayer = true;
  private lastPlayer: { x: number; y: number } | null = null;
  private lastVisibleTroll: { x: number; y: number } | null = null;
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
    this.playerFaction = initialState.playerFaction;
    this.appearance = initialState.appearance;
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
    gradient.addColorStop(0.2, "rgba(2,6,10,0)");
    gradient.addColorStop(0.42, "rgba(2,6,10,0.78)");
    gradient.addColorStop(0.7, "rgba(2,6,10,0.94)");
    gradient.addColorStop(1, "rgba(2,6,10,1)");
    fogContext.fillStyle = gradient;
    fogContext.fillRect(0, 0, 512, 512);
    fogTexture.refresh();
    this.fog = this.add.image(0, 0, "tve4-fog").setOrigin(0.5).setScrollFactor(0).setDepth(38);
    this.wallOutlines = this.add.graphics().setDepth(40);
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
    await this.initializeHeroModels();
    this.readyResolve();
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

  private async initializeHeroModels(): Promise<void> {
    const generation = this.modelGeneration;
    const appearance = this.appearance;
    const models = await loadHeroModelManifest();
    if (this.modelDisposed || generation !== this.modelGeneration || appearance !== this.appearance) return;
    const playerEntry = appearance.heroModelId
      ? heroModelsForFaction(models, this.playerFaction).find((entry) => entry.id === appearance.heroModelId)
      : null;
    if (appearance.heroModelId && !playerEntry) throw new Error("玩家英雄模型不在阵营白名单内");
    const aiFaction: Faction = this.playerFaction === "elf" ? "troll" : "elf";
    const aiCandidates = heroModelsForFaction(models, aiFaction);
    const aiEntry = appearance.aiHeroModelId
      ? aiCandidates.find((entry) => entry.id === appearance.aiHeroModelId)
      : pickHeroModel(models, aiFaction, visualRandomUnit);
    if (!aiEntry) throw new Error("AI 英雄没有可用模型");
    appearance.aiHeroModelId = aiEntry.id;
    await Promise.all([
      playerEntry ? this.loadHeroModelOverlay("player", playerEntry, this.playerFaction) : Promise.resolve(),
      this.loadHeroModelOverlay("ai", aiEntry, aiFaction),
    ]);
  }

  private async loadHeroModelOverlay(
    role: "player" | "ai",
    entry: ModelDemoEntry,
    faction: Faction,
  ): Promise<void> {
    const generation = this.modelGeneration;
    const canvas = document.createElement("canvas");
    canvas.dataset[role === "player" ? "heroModelId" : "aiHeroModelId"] = entry.id;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "5";
    canvas.style.width = "96px";
    canvas.style.height = "96px";
    canvas.style.display = "none";
    this.game.canvas.parentElement?.appendChild(canvas);
    let viewer: HeroModelViewer | null = null;
    try {
      viewer = new HeroModelViewer(canvas);
      const overlay: HeroModelOverlay = { viewer, canvas, entry, action: null };
      if (role === "player") this.playerModel = overlay;
      else this.aiModel = overlay;
      await viewer.load(entry);
      if (this.modelDisposed || generation !== this.modelGeneration) return;
      viewer.setTeamColor(teamColor(faction));
      viewer.setPlaying(false);
      const prefix = role === "player" ? "heroModel" : "aiHeroModel";
      canvas.dataset[`${prefix}Ready`] = "true";
      canvas.dataset[`${prefix}TeamColor`] = faction === "elf" ? "#62c77b" : "#e07a4f";
      this.game.canvas.dataset[`${prefix}Id`] = entry.id;
      this.game.canvas.dataset[`${prefix}Ready`] = "true";
      this.game.canvas.dataset[`${prefix}TeamColor`] = canvas.dataset[`${prefix}TeamColor`];
    } catch (error) {
      viewer?.destroy();
      canvas.remove();
      if (this.modelDisposed || generation !== this.modelGeneration) return;
      if (role === "player") this.playerModel = null;
      else this.aiModel = null;
      throw error;
    }
  }

  private syncHeroModel(
    overlay: HeroModelOverlay | null,
    hero: GameState["heroes"][number] | undefined,
    visible: boolean,
    role: "player" | "ai",
  ): void {
    const prefix = role === "player" ? "heroModel" : "aiHeroModel";
    const canvas = overlay?.canvas;
    const viewer = overlay?.viewer;
    const entry = overlay?.entry;
    this.game.canvas.dataset[`${prefix}Visible`] = String(Boolean(visible && overlay?.viewer.ready));
    if (!canvas || !viewer || !entry || !viewer.ready || !hero || !visible) {
      if (canvas) {
        canvas.style.display = "none";
        canvas.style.left = "0px";
        canvas.style.top = "0px";
        delete canvas.dataset.modelGroundY;
        delete canvas.dataset.modelTopY;
        delete canvas.dataset.modelGroundScreenY;
        delete canvas.dataset.modelTopScreenY;
      }
      viewer?.setPlaying(false);
      return;
    }
    const camera = this.cameras.main;
    const screenPoint = camera.getViewMatrix(true).transformPoint(hero.x, hero.y);
    const metrics = viewer.getAnchorMetrics();
    const baseSize = hero.faction === "troll" ? 120 : 96;
    const size = Phaser.Math.Clamp(baseSize * this.zoom, 72, 180);
    canvas.style.display = "block";
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.left = `${screenPoint.x - size / 2}px`;
    canvas.style.top = `${screenPoint.y - metrics.groundY * size - size / 2}px`;
    const orientation = heroModelOrientation(hero.facing);
    viewer.setYaw(orientation.yaw);
    canvas.style.transform = orientation.flipX ? "scaleX(-1)" : "scaleX(1)";
    canvas.dataset[`${prefix}FlipX`] = String(orientation.flipX);
    canvas.dataset[`${prefix}Yaw`] = orientation.yaw.toFixed(4);
    canvas.dataset.modelGroundY = metrics.groundY.toFixed(4);
    canvas.dataset.modelTopY = metrics.topY.toFixed(4);
    canvas.dataset.modelGroundScreenY = screenPoint.y.toFixed(2);
    canvas.dataset.modelTopScreenY = (screenPoint.y + (metrics.topY - metrics.groundY) * size).toFixed(2);
    const action = modelActionFor(entry, {
      alive: hero.alive,
      moving: hero.vx !== 0 || hero.vy !== 0,
      attacking: this.forceAttack || hero.cd > hero.interval * 0.45,
    });
    if (action !== overlay.action) {
      const index = actionSequenceIndex(entry, action);
      if (index !== null) {
        viewer.setSequence(index);
        viewer.setPlaying(true);
        overlay.action = action;
        this.game.canvas.dataset[`${prefix}Action`] = action;
      }
    } else if (hero.alive) {
      viewer.setPlaying(true);
    }
  }

  private resetHeroModels(appearance: GameState["appearance"]): void {
    this.disposeHeroModels();
    this.appearance = appearance;
    this.modelDisposed = false;
    delete this.game.canvas.dataset.heroModelError;
    delete this.game.canvas.dataset.aiHeroModelError;
    void this.initializeHeroModels().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.game.canvas.dataset.aiHeroModelError = message;
    });
  }

  disposeHeroModels(): void {
    this.modelDisposed = true;
    this.modelGeneration += 1;
    for (const [role, overlay] of [["player", this.playerModel], ["ai", this.aiModel]] as const) {
      overlay?.viewer.destroy();
      overlay?.canvas.remove();
      const prefix = role === "player" ? "heroModel" : "aiHeroModel";
      delete this.game.canvas.dataset[`${prefix}Id`];
      delete this.game.canvas.dataset[`${prefix}Ready`];
      delete this.game.canvas.dataset[`${prefix}TeamColor`];
      delete this.game.canvas.dataset[`${prefix}Action`];
      delete this.game.canvas.dataset[`${prefix}Visible`];
      delete this.game.canvas.dataset[`${prefix}FlipX`];
      delete this.game.canvas.dataset[`${prefix}Yaw`];
      delete this.game.canvas.dataset[`${prefix}Error`];
    }
    this.playerModel = null;
    this.aiModel = null;
    delete this.game.canvas.dataset.heroModelError;
    delete this.game.canvas.dataset.aiHeroModelError;
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

    if (this.spawns.troll) marker(this.spawns.troll.gx, this.spawns.troll.gy, 0xff7a5c, "出生点", 20);
    this.game.canvas.dataset.spawns = JSON.stringify(this.spawns);
    this.game.canvas.dataset.spawnMarkers = String(this.spawnLabels.length);
  }

  updateSession(session: GameState["session"], appearance?: GameState["appearance"]): void {
    if (session.map !== this.map || session.mapId !== this.map.id || session.catalogVersion !== this.catalogVersion) {
      throw new Error("Stage4 会话更新仅允许相同地图与 catalogVersion");
    }
    assertRuntimeBoundsMatch(this.runtimeBounds, session.grid.bounds);
    this.spawns = session.spawns;
    if (appearance) this.resetHeroModels(appearance);
    this.audioEventState = null;
    this.followPlayer = true;
    this.lastPlayer = null;
    this.lastVisibleTroll = null;
    this.drawSpawnMarkers();
  }

  setInteractionInfo(info: Interaction): void {
    this.interaction = info;
  }

  setZoomBy(factor: number): void {
    this.zoomTarget = Phaser.Math.Clamp(this.zoomTarget * factor, 0.08, 2.5);
    this.fullMap = false;
    if (this.followPlayer && this.lastPlayer) {
      this.camX = this.lastPlayer.x;
      this.camY = this.lastPlayer.y;
    }
  }

  panBy(dx: number, dy: number): void {
    this.followPlayer = false;
    this.camX = Phaser.Math.Clamp(this.camX + dx, this.cameraRect.x, this.cameraRect.x + this.cameraRect.width);
    this.camY = Phaser.Math.Clamp(this.camY + dy, this.cameraRect.y, this.cameraRect.y + this.cameraRect.height);
    this.fullMap = false;
  }

  focusPlayer(): void {
    if (!this.lastPlayer) return;
    this.followPlayer = true;
    this.fullMap = false;
    this.camX = this.lastPlayer.x;
    this.camY = this.lastPlayer.y;
  }

  focusTroll(): void {
    if (!this.lastVisibleTroll) return;
    this.followPlayer = false;
    this.fullMap = false;
    this.camX = this.lastVisibleTroll.x;
    this.camY = this.lastVisibleTroll.y;
  }

  setPanning(value: boolean): void {
    this.panning = value;
  }

  getZoomValue(): number {
    return this.zoom;
  }

  apply(state: GameState): void {
    const audioState: Tve4AudioEventState = {
      projectiles: state.projectiles.map((projectile) => ({ id: projectile.id })),
      heroes: state.heroes.map((hero) => ({
        id: hero.id,
        alive: hero.alive,
        hp: hero.hp,
        cd: hero.cd,
        interval: hero.interval,
      })),
      buildings: state.buildings.map((building) => ({ id: building.id, alive: building.alive })),
    };
    for (const event of collectTve4AudioEvents(this.audioEventState, audioState)) playTve4Sfx(event);
    this.audioEventState = audioState;

    const perception = createPerception(state, state.playerFaction);
    const visibleEnemyHeroIds = new Set(perception.visibleEnemies().map((hero) => hero.id));
    const visibleEnemyBuildingIds = new Set(perception.visibleBuildings().map((building) => building.id));

    const camera = this.cameras.main;
    const player = state.heroes.find((hero) => hero.isPlayer && hero.alive);
    const playerHero = state.heroes.find((hero) => hero.isPlayer);
    const aiHero = state.heroes.find((hero) =>
      !hero.isPlayer && !hero.isAlly && !hero.isWolf && hero.alive && visibleEnemyHeroIds.has(hero.id));
    this.lastPlayer = player ? { x: player.x, y: player.y } : null;
    const visibleTroll = state.heroes.find((hero) => hero.faction === "troll" && hero.alive && visibleEnemyHeroIds.has(hero.id));
    this.lastVisibleTroll = visibleTroll ? { x: visibleTroll.x, y: visibleTroll.y } : null;
    if (player) {
      this.game.canvas.dataset.playerX = player.x.toFixed(3);
      this.game.canvas.dataset.playerY = player.y.toFixed(3);
    } else {
      delete this.game.canvas.dataset.playerX;
      delete this.game.canvas.dataset.playerY;
    }
    this.game.canvas.dataset.trollVisible = String(Boolean(visibleTroll));
    this.game.canvas.dataset.cameraFollow = String(this.followPlayer);
    this.game.canvas.dataset.buildingCount = String(state.buildings.filter((building) => building.alive).length);
    if (!this.fullMap && this.followPlayer && player) {
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
    if (visibleTroll) {
      const trollScreen = camera.getViewMatrix(true).transformPoint(visibleTroll.x, visibleTroll.y);
      this.game.canvas.dataset.trollScreenX = trollScreen.x.toFixed(2);
      this.game.canvas.dataset.trollScreenY = trollScreen.y.toFixed(2);
    } else {
      delete this.game.canvas.dataset.trollScreenX;
      delete this.game.canvas.dataset.trollScreenY;
    }
    this.syncHeroModel(this.playerModel, playerHero, Boolean(playerHero && (playerHero.alive || playerHero.deathTimer > 0)), "player");
    this.syncHeroModel(this.aiModel, aiHero, Boolean(aiHero), "ai");

    this.shadows.clear();
    this.entities.clear();
    this.effects.clear();
    this.overlays.clear();
    this.wallOutlines.clear();
    this.bars.clear();

    for (const building of state.buildings) {
      if (!building.alive) continue;
      if (!isEntityVisibleToPlayer(building.faction, state.playerFaction, visibleEnemyBuildingIds, building.id)) continue;
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
        const outlines = building.faction === state.playerFaction ? this.wallOutlines : this.overlays;
        outlines.lineStyle(8, 0xffd86b, 0.25);
        outlines.strokeRect(building.x - pixels / 2 - 4, building.y - pixels / 2 - 4, pixels + 8, pixels + 8);
        outlines.lineStyle(4, 0x1a1410, 1);
        outlines.strokeRect(building.x - pixels / 2 - 1, building.y - pixels / 2 - 1, pixels + 2, pixels + 2);
        outlines.lineStyle(2, 0xffe6ad, 1);
        outlines.strokeRect(building.x - pixels / 2, building.y - pixels / 2, pixels, pixels);
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
        const selection = building.kind === "wall" && building.faction === state.playerFaction
          ? this.wallOutlines
          : this.overlays;
        selection.lineStyle(2, 0xffd86b, 0.9);
        selection.strokeRect(building.x - pixels / 2 - 3, building.y - pixels / 2 - 3, pixels + 6, pixels + 6);
      }
      if (building.eyeMarked > 0) {
        this.overlays.lineStyle(2, 0xff7a5c, 0.9);
        this.overlays.strokeCircle(building.x, building.y, pixels * 0.7);
      }
    }

    for (const projectile of state.projectiles) {
      if (projectile.faction !== state.playerFaction && !perception.canSee(projectile.x, projectile.y)) continue;
      this.effects.fillStyle(0xffe08a, 1);
      this.effects.fillCircle(projectile.x, projectile.y, 4);
    }

    for (const hero of state.heroes) {
      if (!hero.alive && hero.deathTimer <= 0) continue;
      if (!isEntityVisibleToPlayer(hero.faction, state.playerFaction, visibleEnemyHeroIds, hero.id)) continue;
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
      const modelOverlay = hero.isPlayer
        ? this.playerModel
        : !hero.isAlly && !hero.isWolf ? this.aiModel : null;
      const modelActive = Boolean(modelOverlay?.viewer.ready && modelOverlay.entry
        && (hero.isPlayer || visibleEnemyHeroIds.has(hero.id)));
      if (!modelActive) {
        drawPhaserPlaceholderUnit(this.entities, hero.x, hero.y, kind, hero.faction, heroState, {
          alpha,
          flipX: Math.cos(hero.facing) < -0.08,
          scale: hero.faction === "troll" ? 1 : 0.9,
        });
      }
      if (hero.alive && (hero.isPlayer || hero.hp < hero.maxHp)) {
        const height = hero.faction === "troll" ? 30 : 24;
        const barWidth = hero.faction === "troll" ? 68 : 46;
        const barY = this.heroBarY(hero, height);
        this.drawBar(hero.x, barY, barWidth, hero.hp / hero.maxHp, hero.faction === "elf" ? 0x7ee08a : 0xff7a5c);
        if (hero.isPlayer) {
          const barScreen = this.cameras.main.getViewMatrix(true).transformPoint(hero.x, barY);
          this.game.canvas.dataset.heroBarScreenY = barScreen.y.toFixed(2);
        }
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
    const screenPoint = player
      ? camera.getViewMatrix(true).transformPoint(player.x, player.y)
      : { x: camera.width / 2, y: camera.height / 2 };
    const size = player
      ? fogDisplaySize(heroVisionRadius(player), camera.zoom, camera.width, camera.height)
      : fogDisplaySize(0, camera.zoom, camera.width, camera.height);
    this.fog.setPosition(screenPoint.x, screenPoint.y);
    this.fog.setDisplaySize(size, size);
    this.game.canvas.dataset.fogDiameter = size.toFixed(1);
  }

  private heroBarY(hero: GameState["heroes"][number], height: number): number {
    const fallback = hero.y - height - 14;
    const overlay = hero.isPlayer
      ? this.playerModel
      : !hero.isAlly && !hero.isWolf ? this.aiModel : null;
    if (!overlay?.viewer.ready || !overlay.entry) return fallback;
    const camera = this.cameras.main;
    const screenPoint = camera.getViewMatrix(true).transformPoint(hero.x, hero.y);
    const baseSize = hero.faction === "troll" ? 120 : 96;
    const size = Phaser.Math.Clamp(baseSize * this.zoom, 72, 180);
    const metrics = overlay.viewer.getAnchorMetrics();
    const modelTopScreenY = screenPoint.y + (metrics.topY - metrics.groundY) * size;
    const desiredBarScreenY = modelTopScreenY - 10;
    return hero.y - (screenPoint.y - desiredBarScreenY) / this.zoom;
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
    scene.disposeHeroModels();
    game.destroy(false);
    throw error;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
  return {
    updateSession: (session, appearance) => scene.updateSession(session, appearance),
    render: (state) => scene.apply(state),
    setInteraction: (info) => scene.setInteractionInfo(info),
    zoomBy: (factor) => scene.setZoomBy(factor),
    panBy: (dx, dy) => scene.panBy(dx, dy),
    setPanning: (value) => scene.setPanning(value),
    focusPlayer: () => scene.focusPlayer(),
    focusTroll: () => scene.focusTroll(),
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
      scene.disposeHeroModels();
      delete canvas.dataset.tve4Ready;
      game.destroy(false);
    },
  };
}
