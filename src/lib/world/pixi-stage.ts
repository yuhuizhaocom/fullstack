import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";
import { CompositeTilemap } from "@pixi/tilemap";
import { GlowFilter } from "pixi-filters";
import gsap from "gsap";

import type { ClassId } from "@/lib/game/types";

import * as art from "./pixel-art";
import {
  AOE_RADIUS,
  ARMOR_BODY,
  CLASS_BODY,
  DASH_SKILLS,
  EXECUTE_SKILLS,
  FROST_SKILLS,
  GOLD_SKILLS,
  HEAL_SKILLS,
  getMinimapCache,
  weaponStyle,
  type WeaponKind,
  type WorldRenderInput,
} from "./render";
import { buildTiledMap, TILE_ID } from "./tiled";
import {
  roomConfig,
  roomSpawn,
  terrainAt,
  TILE,
  type RoomId,
  type RoomTheme,
} from "./terrain";

const ISO_HALF_W = 32;
const ISO_HALF_H = 16;
const SPRITE_SCALE = 2;

function hexToNumber(color: string): number {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return parseInt(hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2], 16);
    }
    return parseInt(hex.slice(0, 6), 16) || 0xffffff;
  }
  return 0xffffff;
}

function textStyle(size: number, fill: string, bold = true): TextStyle {
  return new TextStyle({
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: size,
    fontWeight: bold ? "bold" : "normal",
    fill,
    stroke: { color: "#000000", width: 3 },
    align: "center",
  });
}

type Skin = {
  classId: ClassId;
  weapon: WeaponKind;
  armorTint: number;
  weaponTint: number;
  glowColor: string | null;
};

class HeroView {
  readonly root = new Container();
  private readonly body = new Container();
  private readonly shadow = new Sprite(art.shadowTexture());
  private readonly legBack = new Sprite();
  private readonly legFront = new Sprite();
  private readonly armBack = new Sprite();
  private readonly armFront = new Container();
  private readonly armFrontSprite = new Sprite();
  private readonly torso = new Sprite();
  private readonly head = new Sprite();
  private readonly weaponRig = new Container();
  private readonly weapon = new Sprite();
  private readonly weaponGlow = new Sprite();
  readonly nameText = new Text({ text: "", style: textStyle(10, "#e2e8f0"), resolution: 2 });
  readonly hpBar = new Graphics();
  private skinKey = "";

  constructor() {
    this.root.sortableChildren = false;
    this.shadow.anchor.set(0.5, 0.5);
    this.body.scale.set(SPRITE_SCALE);
    this.legBack.anchor.set(0.5, 0);
    this.legFront.anchor.set(0.5, 0);
    this.armBack.anchor.set(0.5, 0);
    this.armFrontSprite.anchor.set(0.5, 0);
    this.torso.anchor.set(0.5, 1);
    this.head.anchor.set(0.5, 1);
    this.weapon.anchor.set(0.5, 1);
    this.weaponGlow.anchor.set(0.5, 0.5);
    this.weaponGlow.blendMode = "add";
    this.weaponGlow.alpha = 0.55;

    this.legBack.position.set(-3, -10);
    this.legFront.position.set(3, -10);
    this.torso.position.set(0, -10);
    this.head.position.set(0, -23);
    this.armBack.position.set(-6, -21);
    this.armFront.position.set(6, -21);
    this.weaponRig.position.set(2.5, 8);
    this.weapon.scale.set(0.82);
    this.weaponGlow.position.set(0, -12);
    this.weaponGlow.scale.set(0.38);
    this.weaponGlow.visible = false;

    this.weaponRig.addChild(this.weaponGlow, this.weapon);
    this.armFront.addChild(this.armFrontSprite, this.weaponRig);
    this.body.addChild(
      this.legBack,
      this.legFront,
      this.torso,
      this.head,
      this.armBack,
      this.armFront
    );
    this.nameText.anchor.set(0.5, 1);
    this.nameText.position.set(0, -82);
    this.root.addChild(this.shadow, this.body, this.nameText, this.hpBar);
  }

  configure(skin: Skin): void {
    this.armorTint = skin.armorTint;
    const key = `${skin.classId}:${skin.weapon}:${skin.armorTint}:${skin.weaponTint}:${skin.glowColor}`;
    if (key === this.skinKey) return;
    this.skinKey = key;
    const parts = art.heroParts(skin.classId, skin.weapon);
    this.head.texture = parts.head;
    this.torso.texture = parts.torso;
    this.legBack.texture = parts.limb;
    this.legFront.texture = parts.limb;
    this.armBack.texture = parts.limb;
    this.armFrontSprite.texture = parts.limb;
    this.weapon.texture = parts.weapon;
    this.torso.tint = skin.armorTint;
    this.legBack.tint = skin.armorTint;
    this.legFront.tint = skin.armorTint;
    this.armBack.tint = skin.armorTint;
    this.armFrontSprite.tint = skin.armorTint;
    this.weapon.tint = skin.weaponTint;
    if (skin.glowColor) {
      this.weaponGlow.texture = art.glowTexture(skin.glowColor);
      this.weaponGlow.tint = 0xffffff;
      this.weaponGlow.visible = true;
    } else {
      this.weaponGlow.visible = false;
    }
    this.hpBar.clear();
  }

  update(opts: {
    x: number;
    y: number;
    dir: number;
    moving: boolean;
    dead: boolean;
    swingAt: number;
    hurtAt: number;
    me: boolean;
    name: string;
    hp: number;
    maxHp: number;
    time: number;
  }): void {
    this.root.position.set(opts.x, opts.y);
    this.root.zIndex = opts.x + opts.y;
    this.body.scale.set(Math.abs(SPRITE_SCALE) * (opts.dir >= 0 ? 1 : -1), SPRITE_SCALE);
    this.shadow.visible = !opts.dead;
    this.root.alpha = opts.dead ? 0.4 : 1;

    const moving = opts.moving && !opts.dead;
    const step = moving ? Math.sin(opts.time / 85) : 0;
    const bob = moving ? Math.abs(Math.sin(opts.time / 85)) * 1.6 : 0;
    const breathe = Math.sin(opts.time / 640) * 0.6;

    this.legBack.rotation = moving ? step * 0.55 : 0;
    this.legFront.rotation = moving ? -step * 0.55 : 0;
    this.armBack.rotation = moving ? -step * 0.45 : 0.06;
    this.legBack.y = -10;
    this.legFront.y = -10;
    this.torso.y = -10 - bob * 0.35;
    this.head.y = -23 - bob * 0.4 + breathe;
    this.armBack.y = -21 - bob * 0.3;

    const swingElapsed = opts.swingAt ? opts.time - opts.swingAt : Number.POSITIVE_INFINITY;
    const swing = swingElapsed >= 0 && swingElapsed < 300 ? swingElapsed / 300 : -1;
    if (swing >= 0) {
      const angle =
        swing < 0.28
          ? -1.25 * (swing / 0.28)
          : swing < 0.62
            ? -1.25 + 2.7 * ((swing - 0.28) / 0.34)
            : 1.45 - 1.45 * ((swing - 0.62) / 0.38);
      this.armFront.rotation = angle;
      this.armFront.y = -21 - bob * 0.3;
      this.weaponRig.rotation = -0.5 + angle * 0.3;
    } else {
      this.armFront.rotation = moving ? step * 0.5 : -0.06 + breathe * 0.05;
      this.armFront.y = -21 - bob * 0.3;
      this.weaponRig.rotation = -0.5 + (moving ? step * 0.05 : breathe * 0.02);
    }

    if (opts.dead) {
      this.body.rotation = -Math.PI / 2;
      this.body.y = 6;
    } else {
      this.body.rotation = 0;
      this.body.y = 0;
    }

    const hurt = opts.hurtAt > 0 && opts.time - opts.hurtAt < 160;
    const flash = hurt ? 0xff8a8a : 0xffffff;
    this.torso.tint = flash === 0xffffff ? this.skinTint() : flash;
    this.legBack.tint = this.torso.tint;
    this.legFront.tint = this.torso.tint;
    this.armBack.tint = this.torso.tint;
    this.armFrontSprite.tint = this.torso.tint;

    if (this.nameText.text !== opts.name) this.nameText.text = opts.name;
    this.nameText.style.fill = opts.me ? "#fde68a" : "#e2e8f0";

    this.hpBar.clear();
    this.hpBar.rect(-14, -79, 28, 3).fill({ color: 0x000000, alpha: 0.72 });
    this.hpBar
      .rect(-14, -79, 28 * Math.max(0, Math.min(1, opts.hp / opts.maxHp)), 3)
      .fill(0xef4444);
  }

  private armorTint = 0xffffff;

  private skinTint(): number {
    return this.armorTint;
  }
}

class MonsterView {
  readonly root = new Container();
  private readonly shadow = new Sprite(art.shadowTexture());
  private readonly aura = new Graphics();
  private readonly selection = new Graphics();
  private readonly sprite = new Sprite();
  private readonly glow = new Sprite(art.glowTexture("#e879f9"));
  readonly nameText = new Text({ text: "", style: textStyle(10, "#fca5a5"), resolution: 2 });
  readonly hpBar = new Graphics();
  private kind = "";
  private scale = 1;

  constructor() {
    this.shadow.anchor.set(0.5, 0.5);
    this.sprite.anchor.set(0.5, 1);
    this.glow.anchor.set(0.5, 0.5);
    this.glow.blendMode = "add";
    this.glow.visible = false;
    this.nameText.anchor.set(0.5, 1);
    this.root.addChild(
      this.shadow,
      this.aura,
      this.glow,
      this.sprite,
      this.selection,
      this.nameText,
      this.hpBar
    );
  }

  update(opts: {
    x: number;
    y: number;
    kind: string;
    name: string;
    level?: number;
    boss: boolean;
    elite: boolean;
    hp: number;
    maxHp: number;
    flash: boolean;
    selected: boolean;
    showHealth: boolean;
    time: number;
  }): void {
    if (this.kind !== opts.kind) {
      this.kind = opts.kind;
      this.sprite.texture = art.monsterFrames(opts.kind)[0];
    }
    const frames = art.monsterFrames(opts.kind);
    this.sprite.texture = frames[Math.floor(opts.time / 220 + opts.x) % frames.length];
    this.scale = opts.boss ? 1.45 : opts.elite ? 1.18 : 1;
    this.root.position.set(opts.x, opts.y);
    this.root.zIndex = opts.x + opts.y;
    this.sprite.scale.set(SPRITE_SCALE * this.scale);
    this.sprite.tint = opts.flash ? 0xff9a9a : 0xffffff;

    this.aura.clear();
    if (opts.boss) {
      this.shadow.visible = true;
      this.shadow.scale.set(this.scale * 1.05);
      const pulse = 0.5 + Math.sin(opts.time / 300) * 0.22;
      this.aura
        .ellipse(0, 0, 26 * this.scale, 13 * this.scale)
        .stroke({ width: 2, color: 0xe879f9, alpha: 0.25 + pulse * 0.4 });
      this.glow.visible = true;
      this.glow.y = -34 * this.scale;
      this.glow.scale.set(1.5 * this.scale);
      this.glow.alpha = 0.18 + pulse * 0.12;
    } else if (opts.elite) {
      this.shadow.visible = true;
      this.shadow.scale.set(this.scale);
      const pulse = 0.5 + Math.sin(opts.time / 260 + opts.x) * 0.3;
      this.aura
        .ellipse(0, 0, (20 + pulse * 5) * this.scale, (10 + pulse * 2.5) * this.scale)
        .stroke({ width: 1.5, color: 0xfacc15, alpha: 0.25 + pulse * 0.35 });
      this.glow.visible = false;
    } else {
      this.shadow.visible = true;
      this.shadow.scale.set(this.scale);
      this.glow.visible = false;
    }

    this.selection.clear();
    if (opts.selected) {
      const pulse = 0.55 + Math.sin(opts.time / 180) * 0.25;
      this.selection
        .ellipse(0, 0, 24, 12)
        .stroke({ width: 2, color: 0xfacc15, alpha: pulse });
      const arrowY = -this.sprite.texture.height * this.scale - 14 + Math.sin(opts.time / 200) * 2;
      this.selection
        .poly([0, arrowY + 8, -5, arrowY, 5, arrowY])
        .fill({ color: 0xfde68a, alpha: pulse });
    }

    const label = opts.level ? `Lv.${opts.level} ${opts.name}` : opts.name;
    if (this.nameText.text !== label) this.nameText.text = label;
    this.nameText.style.fill = opts.boss ? "#f0abfc" : opts.elite ? "#fde68a" : "#fca5a5";
    const top = -this.sprite.texture.height * this.scale - 6;
    this.nameText.y = top;
    this.nameText.visible = opts.showHealth;
    this.hpBar.visible = opts.showHealth;
    const barWidth = opts.boss ? 56 : opts.elite ? 46 : 34;
    this.hpBar.clear();
    if (opts.showHealth) {
      this.hpBar
        .rect(-barWidth / 2, top + 4, barWidth, 3)
        .fill({ color: 0x000000, alpha: 0.7 });
      this.hpBar
        .rect(
          -barWidth / 2,
          top + 4,
          barWidth * Math.max(0, Math.min(1, opts.hp / opts.maxHp)),
          3
        )
        .fill(opts.boss ? 0xe879f9 : opts.elite ? 0xfbbf24 : 0xef4444);
    }
  }
}

type Prop = { x: number; y: number; kind: "tree" | "rock" };

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
};

export type WorldStage = {
  render(input: WorldRenderInput): void;
  resize(width: number, height: number): void;
  destroy(): void;
};

export async function createWorldStage(
  canvas: HTMLCanvasElement,
  options: { width: number; height: number; room: RoomId; isTouch: boolean }
): Promise<WorldStage> {
  const app = new Application();
  await app.init({
    canvas,
    width: options.width,
    height: options.height,
    background: 0x08160d,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(options.isTouch ? 1.5 : 2, window.devicePixelRatio || 1),
    preference: "webgl",
    powerPreference: "high-performance",
  });
  app.ticker.stop();
  return new PixiWorldStage(app, options);
}

class PixiWorldStage implements WorldStage {
  private readonly app: Application;
  private readonly bg = new Graphics();
  private readonly camera = new Container();
  private readonly groundTiles = new CompositeTilemap();
  private readonly flowerTiles = new CompositeTilemap();
  private readonly entityLayer = new Container();
  private readonly fx = new Graphics();
  private readonly particleLayer = new Container();
  private readonly hud = new Container();
  private readonly bossBar = new Graphics();
  private readonly bossName = new Text({ text: "", style: textStyle(11, "#f0abfc"), resolution: 2 });
  private readonly minimapCanvas = document.createElement("canvas");
  private readonly minimapTexture: Texture;
  private readonly minimapSprite: Sprite;
  private readonly minimapBorder = new Graphics();
  private readonly minimapCtx: CanvasRenderingContext2D | null;

  private readonly heroes = new Map<string, HeroView>();
  private readonly monsters = new Map<string, MonsterView>();
  private readonly npcs = new Map<string, { root: Container; sprite: Sprite; name: Text; marker: Text }>();
  private readonly drops = new Map<
    string,
    { root: Container; sprite: Sprite; glow: Sprite; beam: Graphics; label: Text }
  >();
  private readonly portals = new Map<
    string,
    { root: Container; rings: Graphics; icon: Text; label: Text; glow: Sprite; filter: GlowFilter }
  >();
  private readonly propSprites: Sprite[] = [];
  private readonly sparkPool: Sprite[] = [];
  private readonly textPool: Text[] = [];
  private readonly sparks: Spark[] = [];
  private readonly seenEffects = new Set<number>();

  /* 镜头跟随 / 震动（GSAP 驱动） */
  private readonly camState = { x: 0, y: 0 };
  private readonly camTarget = { x: 0, y: 0 };
  private readonly shakeState = { trauma: 0 };
  private camXTo: ((value: number) => void) | null = null;
  private camYTo: ((value: number) => void) | null = null;
  private snapCamera = true;

  /* 命中顿帧 */
  private hitStopUntil = 0;
  private lastHitStopAt = 0;
  private lastFrameAt = 0;
  private pausedTotal = 0;
  private frozenFrame = false;

  /* 战斗反馈去重 */
  private lastSwingAt = 0;
  private lastHurtAt = 0;
  private lastEffectId = 0;
  private wasShaking = false;

  private room: RoomId | null = null;
  private theme: RoomTheme = "overworld";
  private props: Prop[] = [];
  private campfire: Sprite | null = null;
  private width: number;
  private height: number;
  private minimapAt = 0;

  constructor(app: Application, options: { width: number; height: number; room: RoomId }) {
    this.app = app;
    this.width = options.width;
    this.height = options.height;

    this.entityLayer.sortableChildren = true;
    this.camXTo = gsap.quickTo(this.camState, "x", { duration: 0.22, ease: "power2.out" });
    this.camYTo = gsap.quickTo(this.camState, "y", { duration: 0.22, ease: "power2.out" });
    this.camera.addChild(
      this.groundTiles,
      this.flowerTiles,
      this.entityLayer,
      this.fx,
      this.particleLayer
    );
    this.app.stage.addChild(this.bg, this.camera, this.hud);

    this.bossName.anchor.set(0.5, 1);
    this.bossName.position.set(this.width / 2, 100);
    this.hud.addChild(this.bossBar, this.bossName);

    this.minimapCanvas.width = 160;
    this.minimapCanvas.height = 160;
    this.minimapCtx = this.minimapCanvas.getContext("2d");
    this.minimapTexture = Texture.from(this.minimapCanvas);
    this.minimapSprite = new Sprite(this.minimapTexture);
    this.minimapSprite.anchor.set(0, 0);
    this.hud.addChild(this.minimapSprite, this.minimapBorder);

    this.redrawBackground();
    this.minimapSprite.visible = false;

    this.onRoom(options.room);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.redrawBackground();
    this.minimapSprite.visible = false;
    this.minimapAt = 0;
  }

  render(input: WorldRenderInput): void {
    if (input.room !== this.room) this.onRoom(input.room);

    const now = input.time;
    this.handleCombatFeedback(input, now);
    this.frozenFrame = now < this.hitStopUntil;
    const time = this.advanceTime(now);
    const view: WorldRenderInput = time === now ? input : { ...input, time };

    const cfg = roomConfig(input.room);
    const meIsoX = input.meX - input.meY;
    const meIsoY = (input.meX + input.meY) / 2;
    const isoMinX = -cfg.h * TILE;
    const isoMaxX = cfg.w * TILE;
    const isoMinY = 0;
    const isoMaxY = ((cfg.w + cfg.h) * TILE) / 2;
    const camX = Math.max(isoMinX, Math.min(isoMaxX - this.width, meIsoX - this.width / 2));
    const camY = Math.max(isoMinY, Math.min(isoMaxY - this.height, meIsoY - this.height / 2));
    this.followCamera(camX, camY);

    // 震动强度随 trauma 平方衰减，GSAP 负责回零
    const amp = this.shakeState.trauma * this.shakeState.trauma * 18;
    const shakeX = amp > 0.15 ? (Math.random() - 0.5) * amp : 0;
    const shakeY = amp > 0.15 ? (Math.random() - 0.5) * amp : 0;
    this.camera.position.set(-(this.camState.x + shakeX), -(this.camState.y + shakeY));

    const toScreen = (wx: number, wy: number) => ({ x: wx - wy, y: (wx + wy) / 2 });
    const visible = (x: number, y: number, margin = 80) =>
      x > -margin && y > -margin && x < this.width + margin && y < this.height + margin;

    this.renderProps(view, toScreen, visible);
    this.renderPortals(view, toScreen, visible);
    this.renderNpcs(view, toScreen, visible);
    this.renderDrops(view, toScreen, visible);
    this.renderMonsters(view, toScreen, visible);
    this.renderHeroes(view, toScreen, visible);
    this.renderSkillEffects(view, toScreen);
    this.renderParticles(view, toScreen);
    this.renderHud(view);
    this.renderMinimap(view);

    this.app.render();
  }

  /* ---------------------------- 镜头与战斗反馈 ---------------------------- */

  /** 相机平滑跟随：GSAP quickTo 只在目标明显变化时重定向 */
  private followCamera(x: number, y: number): void {
    if (this.snapCamera) {
      this.camState.x = x;
      this.camState.y = y;
      this.camTarget.x = x;
      this.camTarget.y = y;
      this.camXTo?.(x);
      this.camYTo?.(y);
      this.snapCamera = false;
      return;
    }
    if (Math.abs(x - this.camTarget.x) < 0.5 && Math.abs(y - this.camTarget.y) < 0.5) return;
    this.camTarget.x = x;
    this.camTarget.y = y;
    this.camXTo?.(x);
    this.camYTo?.(y);
  }

  private addShake(amount: number): void {
    this.shakeState.trauma = Math.min(1, this.shakeState.trauma + amount);
    gsap.to(this.shakeState, {
      trauma: 0,
      duration: 0.25 + this.shakeState.trauma * 0.3,
      ease: "power2.out",
      overwrite: true,
    });
  }

  private hitStop(now: number, ms: number, gap = 0): void {
    if (gap > 0 && now - this.lastHitStopAt < gap) return;
    this.lastHitStopAt = now;
    this.hitStopUntil = Math.max(this.hitStopUntil, now + ms);
  }

  /** 顿帧期间时间轴暂停，画面动画/技能特效一起冻结 */
  private advanceTime(now: number): number {
    if (this.lastFrameAt > 0 && now > this.lastFrameAt && this.lastFrameAt < this.hitStopUntil) {
      this.pausedTotal += Math.min(now, this.hitStopUntil) - this.lastFrameAt;
    }
    this.lastFrameAt = now;
    return now - this.pausedTotal;
  }

  private handleCombatFeedback(input: WorldRenderInput, now: number): void {
    const hurtNow = input.meHurtAt > this.lastHurtAt;
    if (hurtNow) {
      this.lastHurtAt = input.meHurtAt;
      this.addShake(0.5);
      this.hitStop(now, 55);
    } else if (input.shake && !this.wasShaking) {
      this.addShake(0.4);
      this.hitStop(now, 45);
    }
    this.wasShaking = input.shake;

    if (input.meSwingAt > this.lastSwingAt) {
      this.lastSwingAt = input.meSwingAt;
      this.addShake(0.08);
      this.hitStop(now, 40, 200);
    }

    for (const effect of input.effects) {
      if (effect.id <= this.lastEffectId) continue;
      this.lastEffectId = effect.id;
      if (Math.hypot(effect.x - input.meX, effect.y - input.meY) > 380) continue;
      const skillId = effect.skillId;
      if (skillId === "boss_aoe") {
        this.addShake(1);
        this.hitStop(now, 95);
      } else if (EXECUTE_SKILLS.has(skillId)) {
        this.addShake(0.68);
        this.hitStop(now, 85);
      } else if (AOE_RADIUS[skillId]) {
        this.addShake(0.36);
        this.hitStop(now, 50);
      } else if (DASH_SKILLS.has(skillId)) {
        this.addShake(0.16);
      } else if (skillId === "levelup") {
        this.addShake(0.2);
      }
    }
  }

  destroy(): void {
    gsap.killTweensOf(this.camState);
    gsap.killTweensOf(this.shakeState);
    this.app.destroy({ removeView: false }, { children: true, texture: false });
  }

  /* ------------------------------- 房间与地块 ------------------------------ */

  private onRoom(room: RoomId): void {
    const cfg = roomConfig(room);
    this.room = room;
    this.theme = cfg.theme;
    this.snapCamera = true;
    const tiles = art.themeTiles(cfg.theme);
    this.groundTiles.clear();
    this.flowerTiles.clear();

    const map = buildTiledMap(room);
    const ground = map.layers[0];
    const detail = map.layers[1];
    for (let ty = 0; ty < cfg.h; ty += 1) {
      for (let tx = 0; tx < cfg.w; tx += 1) {
        const index = ty * cfg.w + tx;
        const id = ground.data[index];
        if (!id) continue;
        const wx = tx * TILE + TILE / 2;
        const wy = ty * TILE + TILE / 2;
        const sx = wx - wy;
        const sy = (wx + wy) / 2;
        const texture =
          id === TILE_ID.water
            ? tiles.water
            : tiles.ground[Math.max(0, Math.min(2, id - TILE_ID.ground0))];
        this.groundTiles.tile(texture, sx - ISO_HALF_W, sy - ISO_HALF_H);
        if (detail.data[index] === TILE_ID.flower) {
          this.flowerTiles.tile(tiles.flower, sx - ISO_HALF_W, sy - ISO_HALF_H);
        }
      }
    }

    this.props = [];
    for (let ty = 0; ty < cfg.h; ty += 1) {
      for (let tx = 0; tx < cfg.w; tx += 1) {
        const index = ty * cfg.w + tx;
        if (ground.data[index] === TILE_ID.water) continue;
        // 与 Canvas2D 版本一致：树/岩石由地形碰撞数据决定
        const terrain = terrainKind(tx, ty, room);
        if (terrain === "tree" || terrain === "rock") {
          this.props.push({
            x: tx * TILE + TILE / 2,
            y: ty * TILE + TILE / 2,
            kind: terrain,
          });
        }
      }
    }

    this.bg.clear();
    this.redrawBackground();

    for (const view of this.portals.values()) view.root.destroy({ children: true });
    this.portals.clear();
    for (const view of this.npcs.values()) view.root.destroy({ children: true });
    this.npcs.clear();
    for (const view of this.drops.values()) view.root.destroy({ children: true });
    this.drops.clear();
    for (const view of this.monsters.values()) view.root.destroy({ children: true });
    this.monsters.clear();
    this.seenEffects.clear();
    this.sparks.length = 0;
    for (const sprite of this.sparkPool) sprite.visible = false;
    for (const text of this.textPool) text.visible = false;
    this.minimapAt = 0;

    if (room === "world") {
      if (!this.campfire) {
        this.campfire = new Sprite(art.campfireTextures()[0]);
        this.campfire.anchor.set(0.5, 1);
        this.entityLayer.addChild(this.campfire);
      }
      const spawn = roomSpawn("world");
      const sx = spawn.x - spawn.y;
      const sy = (spawn.x + spawn.y) / 2;
      this.campfire.position.set(sx, sy);
      this.campfire.zIndex = spawn.x + spawn.y;
      this.campfire.visible = true;
    } else if (this.campfire) {
      this.campfire.visible = false;
    }
  }

  private redrawBackground(): void {
    this.bg.clear();
    this.bg.rect(0, 0, this.width, this.height).fill(art.themeBackground(this.theme));
    this.bg.zIndex = -1000;
  }

  /* --------------------------------- 实体 --------------------------------- */

  private heroSkin(snapshot: WorldRenderInput["snapshot"], id: string, classId: ClassId): Skin {
    const player = snapshot?.players.find((entry) => entry.id === id);
    const weaponId = player?.weapon ?? null;
    const style = weaponStyle(weaponId, classId);
    const armor = player?.armor ?? null;
    return {
      classId,
      weapon: style.kind,
      armorTint: hexToNumber(ARMOR_BODY[armor ?? ""] ?? CLASS_BODY[classId] ?? "#fbbf24"),
      weaponTint: hexToNumber(style.color),
      glowColor: style.glow ?? null,
    };
  }

  private renderHeroes(
    input: WorldRenderInput,
    toScreen: (x: number, y: number) => { x: number; y: number },
    visible: (x: number, y: number, margin?: number) => boolean
  ): void {
    const seen = new Set<string>();
    const meSnapshot = input.snapshot?.players.find((player) => player.id === input.meId);
    const meClass = (meSnapshot?.classId ?? "warrior") as ClassId;
    const meSkin = this.heroSkin(input.snapshot, input.meId, meClass);
    const me = this.heroView(input.meId);
    me.configure(meSkin);
    const meScreen = toScreen(input.meX, input.meY);
    me.update({
      x: meScreen.x,
      y: meScreen.y,
      dir: input.meDir,
      moving: input.meMoving,
      dead: input.meDead,
      swingAt: input.meSwingAt,
      hurtAt: input.meHurtAt,
      me: true,
      name: `${input.meName} Lv.${input.meLevel}`,
      hp: input.meHp,
      maxHp: input.meMaxHp,
      time: input.time,
    });
    seen.add(input.meId);

    for (const player of input.snapshot?.players ?? []) {
      if (player.id === input.meId) continue;
      const screen = toScreen(player.x, player.y);
      if (!visible(screen.x, screen.y)) continue;
      const classId = player.classId as ClassId;
      const skin = this.heroSkin(input.snapshot, player.id, classId);
      const view = this.heroView(player.id);
      view.configure(skin);
      view.update({
        x: screen.x,
        y: screen.y,
        dir: player.dir,
        moving: (input.moving[player.id] ?? 0) > input.time - 300,
        dead: player.dead,
        swingAt: input.swings[player.id] ?? 0,
        hurtAt: input.flashes[player.id] ?? 0,
        me: false,
        name: `${player.name} Lv.${player.level}`,
        hp: player.hp,
        maxHp: player.maxHp,
        time: input.time,
      });
      seen.add(player.id);
    }

    for (const [id, view] of this.heroes) {
      if (seen.has(id)) continue;
      view.root.visible = false;
    }
  }

  private heroView(id: string): HeroView {
    let view = this.heroes.get(id);
    if (!view) {
      view = new HeroView();
      this.heroes.set(id, view);
      this.entityLayer.addChild(view.root);
    }
    view.root.visible = true;
    return view;
  }

  private renderMonsters(
    input: WorldRenderInput,
    toScreen: (x: number, y: number) => { x: number; y: number },
    visible: (x: number, y: number, margin?: number) => boolean
  ): void {
    const seen = new Set<string>();
    for (const monster of input.snapshot?.monsters ?? []) {
      const screen = toScreen(monster.x, monster.y);
      if (!visible(screen.x, screen.y, 120)) continue;
      const view = this.monsterView(monster.id);
      const distance = Math.hypot(monster.x - input.meX, monster.y - input.meY);
      const flashAt = input.flashes[monster.id] ?? 0;
      view.update({
        x: screen.x,
        y: screen.y,
        kind: monster.kind,
        name: monster.name,
        level: monster.level,
        boss: monster.boss,
        elite: !!monster.elite,
        hp: monster.hp,
        maxHp: monster.maxHp,
        flash: flashAt > 0 && input.time - flashAt < 140,
        selected: input.targetId === monster.id,
        showHealth:
          monster.boss ||
          !!monster.elite ||
          monster.hp < monster.maxHp ||
          distance < 260,
        time: input.time,
      });
      seen.add(monster.id);
    }
    for (const [id, view] of this.monsters) {
      if (!seen.has(id)) view.root.visible = false;
    }
  }

  private monsterView(id: string): MonsterView {
    let view = this.monsters.get(id);
    if (!view) {
      view = new MonsterView();
      this.monsters.set(id, view);
      this.entityLayer.addChild(view.root);
    }
    view.root.visible = true;
    return view;
  }

  private renderProps(
    input: WorldRenderInput,
    toScreen: (x: number, y: number) => { x: number; y: number },
    visible: (x: number, y: number, margin?: number) => boolean
  ): void {
    const cfg = roomConfig(input.room);
    const tree = art.treeTexture(cfg.theme);
    const rock = art.rockTexture(cfg.theme);
    let index = 0;
    for (const prop of this.props) {
      const screen = toScreen(prop.x, prop.y);
      if (!visible(screen.x, screen.y, 140)) continue;
      const sprite = this.propSprite(index);
      sprite.texture = prop.kind === "tree" ? tree : rock;
      sprite.position.set(screen.x, screen.y);
      sprite.zIndex = prop.x + prop.y;
      sprite.visible = true;
      index += 1;
    }
    for (let i = index; i < this.propSprites.length; i += 1) {
      this.propSprites[i].visible = false;
    }
  }

  private propSprite(index: number): Sprite {
    let sprite = this.propSprites[index];
    if (!sprite) {
      sprite = new Sprite();
      sprite.anchor.set(0.5, 1);
      this.propSprites.push(sprite);
      this.entityLayer.addChild(sprite);
    }
    return sprite;
  }

  private renderPortals(
    input: WorldRenderInput,
    toScreen: (x: number, y: number) => { x: number; y: number },
    visible: (x: number, y: number, margin?: number) => boolean
  ): void {
    const seen = new Set<string>();
    for (const portal of input.snapshot?.portals ?? []) {
      const screen = toScreen(portal.x, portal.y);
      if (!visible(screen.x, screen.y)) continue;
      const view = this.portalView(portal.id);
      const locked = portal.unlockLevel > input.meLevel;
      view.root.position.set(screen.x, screen.y);
      view.root.zIndex = portal.x + portal.y - 6;
      view.root.visible = true;
      view.icon.text = portal.icon;
      view.label.text = locked ? `${portal.label} Lv.${portal.unlockLevel}` : portal.label;
      view.label.style.fill = locked ? "#94a3b8" : "#7dd3fc";
      view.icon.alpha = locked ? 0.45 : 1;
      view.rings.alpha = locked ? 0.45 : 1;
      view.glow.visible = !locked;
      view.filter.color = locked ? 0x94a3b8 : 0x38bdf8;
      const pulse = 1 + Math.sin(input.time / 260) * 0.08;
      view.rings.clear();
      view.rings
        .ellipse(0, 0, 26 * pulse, 12 * pulse)
        .stroke({ width: 2, color: locked ? 0x94a3b8 : 0x7dd3fc, alpha: 0.95 });
      view.rings
        .ellipse(0, -8, 18 * pulse, 8 * pulse)
        .stroke({ width: 2, color: locked ? 0x94a3b8 : 0x38bdf8, alpha: 0.45 });
      view.icon.y = -18 + Math.sin(input.time / 320) * 2;
      seen.add(portal.id);
    }
    for (const [id, view] of this.portals) {
      if (!seen.has(id)) view.root.visible = false;
    }
  }

  private portalView(id: string) {
    let view = this.portals.get(id);
    if (!view) {
      const root = new Container();
      const rings = new Graphics();
      const icon = new Text({ text: "", style: textStyle(20, "#f8fafc"), resolution: 2 });
      const label = new Text({ text: "", style: textStyle(10, "#7dd3fc"), resolution: 2 });
      const glow = new Sprite(art.glowTexture("#38bdf8"));
      glow.anchor.set(0.5, 0.5);
      glow.y = -14;
      glow.scale.set(1.1);
      glow.blendMode = "add";
      glow.alpha = 0.5;
      icon.anchor.set(0.5, 1);
      label.anchor.set(0.5, 1);
      label.y = -44;
      const filter = new GlowFilter({
        distance: 14,
        outerStrength: 1.6,
        color: 0x38bdf8,
        quality: 0.2,
      });
      rings.filters = [filter];
      root.addChild(glow, rings, icon, label);
      this.entityLayer.addChild(root);
      view = { root, rings, icon, label, glow, filter };
      this.portals.set(id, view);
    }
    return view;
  }

  private renderNpcs(
    input: WorldRenderInput,
    toScreen: (x: number, y: number) => { x: number; y: number },
    visible: (x: number, y: number, margin?: number) => boolean
  ): void {
    const seen = new Set<string>();
    for (const npc of input.snapshot?.npcs ?? []) {
      const screen = toScreen(npc.x, npc.y);
      if (!visible(screen.x, screen.y)) continue;
      const view = this.npcView(npc.id, npc.color);
      view.root.position.set(screen.x, screen.y);
      view.root.zIndex = npc.x + npc.y;
      view.root.visible = true;
      if (view.name.text !== npc.name) view.name.text = npc.name;
      view.marker.visible = npc.quests.length > 0;
      if (view.marker.visible) {
        view.marker.y = -66 + Math.sin(input.time / 240) * 3;
      }
      seen.add(npc.id);
    }
    for (const [id, view] of this.npcs) {
      if (!seen.has(id)) view.root.visible = false;
    }
  }

  private npcView(id: string, color: string) {
    let view = this.npcs.get(id);
    if (!view) {
      const root = new Container();
      const sprite = new Sprite(art.npcTexture(color));
      sprite.anchor.set(0.5, 1);
      const name = new Text({ text: "", style: textStyle(10, "#fde68a"), resolution: 2 });
      name.anchor.set(0.5, 1);
      name.y = -52;
      const marker = new Text({ text: "!", style: textStyle(12, "#facc15"), resolution: 2 });
      marker.anchor.set(0.5, 1);
      marker.x = 14;
      root.addChild(sprite, name, marker);
      this.entityLayer.addChild(root);
      view = { root, sprite, name, marker };
      this.npcs.set(id, view);
    }
    return view;
  }

  private renderDrops(
    input: WorldRenderInput,
    toScreen: (x: number, y: number) => { x: number; y: number },
    visible: (x: number, y: number, margin?: number) => boolean
  ): void {
    const seen = new Set<string>();
    for (const drop of input.snapshot?.drops ?? []) {
      const screen = toScreen(drop.x, drop.y);
      if (!visible(screen.x, screen.y, 60)) continue;
      const view = this.dropView(drop.id);
      const bob = Math.sin(input.time / 300 + drop.x) * 3;
      view.root.position.set(screen.x, screen.y);
      view.root.zIndex = drop.x + drop.y;
      view.root.visible = true;
      view.sprite.texture = art.dropTexture(drop.kind ?? "heal");
      view.sprite.y = bob;
      view.glow.y = bob + 1;
      view.glow.tint = drop.kind === "item" ? 0x60a5fa : 0xfacc15;
      view.beam.clear();
      if (drop.kind === "item") {
        const alpha = 0.14 + Math.sin(input.time / 240 + drop.x) * 0.05;
        view.beam.rect(-9, -74, 18, 74).fill({ color: 0x60a5fa, alpha });
        view.beam.rect(-3, -74, 6, 74).fill({ color: 0xbfdbfe, alpha: alpha + 0.08 });
      }
      view.label.visible = drop.kind === "gold" && !!drop.gold;
      if (view.label.visible) {
        view.label.text = `${drop.gold}`;
        view.label.y = 16 + bob;
      }
      seen.add(drop.id);
    }
    for (const [id, view] of this.drops) {
      if (!seen.has(id)) view.root.visible = false;
    }
  }

  private dropView(id: string) {
    let view = this.drops.get(id);
    if (!view) {
      const root = new Container();
      const beam = new Graphics();
      const glow = new Sprite(art.glowTexture("#ffffff"));
      glow.anchor.set(0.5, 0.5);
      glow.scale.set(0.55);
      glow.blendMode = "add";
      glow.alpha = 0.5;
      const sprite = new Sprite(art.dropTexture("heal"));
      sprite.anchor.set(0.5, 0.5);
      const label = new Text({ text: "", style: textStyle(9, "#fde68a"), resolution: 2 });
      label.anchor.set(0.5, 1);
      root.addChild(beam, glow, sprite, label);
      this.entityLayer.addChild(root);
      view = { root, sprite, glow, beam, label };
      this.drops.set(id, view);
    }
    return view;
  }

  /* -------------------------------- 特效与粒子 ------------------------------ */

  private renderSkillEffects(
    input: WorldRenderInput,
    toScreen: (x: number, y: number) => { x: number; y: number }
  ): void {
    this.fx.clear();
    for (const effect of input.effects) {
      const age = input.time - effect.at;
      if (age < 0 || age > 750) continue;
      const screen = toScreen(effect.x, effect.y);
      const progress = age / 750;
      const alpha = Math.max(0, 1 - progress);
      const sx = screen.x;
      const sy = screen.y - 10;
      const skillId = effect.skillId;

      if (skillId === "levelup") {
        this.fx
          .ellipse(sx, screen.y, 14 + progress * 46, 7 + progress * 23)
          .stroke({ width: 3, color: 0xfde68a, alpha });
        for (let i = 0; i < 8; i += 1) {
          const angle = (i / 8) * Math.PI * 2 + progress * 1.5;
          this.fx
            .circle(
              sx + Math.cos(angle) * (12 + progress * 26),
              screen.y - progress * 40 + Math.sin(angle) * 4,
              2
            )
            .fill({ color: 0xfef3c7, alpha });
        }
      } else if (skillId === "boss_aoe") {
        this.fx
          .ellipse(sx, screen.y, 16 + progress * 108, 8 + progress * 54)
          .stroke({ width: 4, color: 0xf87171, alpha });
        this.fx
          .ellipse(sx, screen.y, 16 + progress * 108, 8 + progress * 54)
          .fill({ color: 0xef4444, alpha: alpha * 0.22 });
      } else if (AOE_RADIUS[skillId]) {
        const radius = AOE_RADIUS[skillId] * (0.25 + progress * 0.9);
        const color =
          skillId === "tibbers"
            ? 0xfb923c
            : skillId === "equinox"
              ? 0xf0abfc
              : skillId === "incinerate"
                ? 0xf97316
                : skillId === "volley"
                  ? 0x86efac
                  : 0xfbbf24;
        this.fx
          .ellipse(sx, screen.y, radius, radius * 0.5)
          .stroke({ width: 4, color, alpha });
        this.fx
          .ellipse(sx, screen.y, radius, radius * 0.5)
          .fill({ color, alpha: alpha * 0.2 });
        for (let i = 0; i < 10; i += 1) {
          const angle = (i / 10) * Math.PI * 2 + progress;
          this.fx
            .circle(
              sx + Math.cos(angle) * radius,
              screen.y + Math.sin(angle) * radius * 0.5 - progress * 18,
              3
            )
            .fill({ color, alpha: alpha * 0.85 });
        }
      } else if (DASH_SKILLS.has(skillId)) {
        this.fx
          .moveTo(sx - 30 * (1 - progress), screen.y + 8)
          .lineTo(sx + 18, screen.y - 8)
          .stroke({ width: 3, color: 0x86efac, alpha });
        this.fx
          .ellipse(sx + 10, screen.y - 6, 22, 10)
          .fill({ color: 0x86efac, alpha: 0.3 * alpha });
      } else if (HEAL_SKILLS.has(skillId)) {
        const color = skillId === "wish" ? 0xf0abfc : 0x86efac;
        for (let i = 0; i < 11; i += 1) {
          const angle = (i / 11) * Math.PI * 2 + progress * 2;
          const radius = 8 + progress * 24;
          this.fx
            .circle(
              sx + Math.cos(angle) * radius,
              screen.y - 8 - progress * 32 + Math.sin(angle) * 5,
              skillId === "wish" ? 3 : 2.5
            )
            .fill({ color, alpha });
        }
      } else if (EXECUTE_SKILLS.has(skillId)) {
        this.fx
          .arc(sx, sy, 10 + progress * 54, -1.3, 0.9)
          .stroke({ width: 4, color: 0xfde68a, alpha });
        this.fx
          .circle(sx, sy, 6 + progress * 30)
          .fill({ color: 0xfacc15, alpha: alpha * 0.4 });
      } else if (FROST_SKILLS.has(skillId)) {
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * Math.PI * 2;
          this.fx
            .moveTo(sx, sy)
            .lineTo(
              sx + Math.cos(angle) * (18 + progress * 34),
              sy + Math.sin(angle) * (9 + progress * 17)
            )
            .stroke({ width: 3, color: 0x7dd3fc, alpha });
        }
      } else {
        const color = GOLD_SKILLS.has(skillId) ? 0xfde68a : 0xa78bfa;
        this.fx.circle(sx, sy, 8 + progress * 42).stroke({ width: 2, color, alpha });
        this.fx
          .circle(sx, sy, 5 + progress * 20)
          .fill({ color: GOLD_SKILLS.has(skillId) ? 0xfef3c7 : 0xc4b5fd, alpha: alpha * 0.35 });
      }

      if (!this.seenEffects.has(effect.id)) {
        this.seenEffects.add(effect.id);
        const color = HEAL_SKILLS.has(skillId)
          ? 0x86efac
          : EXECUTE_SKILLS.has(skillId)
            ? 0xfde68a
            : FROST_SKILLS.has(skillId)
              ? 0x7dd3fc
              : AOE_RADIUS[skillId]
                ? 0xfbbf24
                : 0xc4b5fd;
        for (let i = 0; i < 10; i += 1) {
          const angle = (i / 10) * Math.PI * 2 + Math.random();
          this.sparks.push({
            x: effect.x,
            y: effect.y,
            vx: Math.cos(angle) * (10 + Math.random() * 18),
            vy: Math.sin(angle) * (8 + Math.random() * 12) - 18,
            life: 420,
            maxLife: 420,
            color,
            size: i % 3 === 0 ? 3 : 2,
          });
        }
      }
    }
    if (this.seenEffects.size > 200) {
      const ids = new Set(input.effects.map((effect) => effect.id));
      for (const id of this.seenEffects) if (!ids.has(id)) this.seenEffects.delete(id);
    }
  }

  private renderParticles(
    input: WorldRenderInput,
    toScreen: (x: number, y: number) => { x: number; y: number }
  ): void {
    let sparkIndex = 0;
    let textIndex = 0;

    const drawSpark = (wx: number, wy: number, width: number, height: number, color: number, alpha: number) => {
      const screen = toScreen(wx, wy);
      const sprite = this.sparkSprite(sparkIndex);
      sparkIndex += 1;
      sprite.position.set(screen.x, screen.y);
      sprite.tint = color;
      sprite.alpha = alpha;
      sprite.width = width;
      sprite.height = height;
      sprite.visible = true;
    };

    for (const particle of input.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      if (particle.kind === "spark") {
        drawSpark(
          particle.x,
          particle.y,
          particle.size ?? 3,
          particle.size ?? 3,
          hexToNumber(particle.color),
          alpha
        );
      } else {
        const text = this.particleText(textIndex);
        textIndex += 1;
        const screen = toScreen(particle.x, particle.y);
        text.text = particle.text;
        text.style.fontSize = particle.size ?? 13;
        text.style.fill = particle.color;
        text.position.set(screen.x, screen.y);
        text.alpha = alpha;
        text.visible = true;
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i];
      if (!this.frozenFrame) {
        spark.life -= 16;
        spark.x += spark.vx * 0.016;
        spark.y += spark.vy * 0.016;
        spark.vy += 60 * 0.016;
      }
      if (spark.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      drawSpark(
        spark.x,
        spark.y,
        spark.size,
        spark.size,
        spark.color,
        spark.life / spark.maxLife
      );
    }

    for (let i = sparkIndex; i < this.sparkPool.length; i += 1) {
      this.sparkPool[i].visible = false;
    }
    for (let i = textIndex; i < this.textPool.length; i += 1) {
      this.textPool[i].visible = false;
    }
    if (this.sparks.length > 140) this.sparks.splice(0, this.sparks.length - 140);
  }

  private sparkSprite(index: number): Sprite {
    let sprite = this.sparkPool[index];
    if (!sprite) {
      sprite = new Sprite(art.pixelTexture());
      sprite.anchor.set(0.5, 0.5);
      this.sparkPool.push(sprite);
      this.particleLayer.addChild(sprite);
    }
    return sprite;
  }

  private particleText(index: number): Text {
    let text = this.textPool[index];
    if (!text) {
      text = new Text({ text: "", style: textStyle(13, "#ffffff"), resolution: 2 });
      text.anchor.set(0.5, 0.5);
      this.textPool.push(text);
      this.particleLayer.addChild(text);
    }
    return text;
  }

  /* ---------------------------------- HUD --------------------------------- */

  private renderHud(input: WorldRenderInput): void {
    const nearbyBoss = input.snapshot?.monsters
      .filter(
        (monster) =>
          monster.boss && Math.hypot(monster.x - input.meX, monster.y - input.meY) < 460
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - input.meX, a.y - input.meY) -
          Math.hypot(b.x - input.meX, b.y - input.meY)
      )[0];

    this.bossBar.clear();
    this.bossName.visible = !!nearbyBoss;
    if (!nearbyBoss) return;

    const barWidth = Math.min(280, this.width * 0.5);
    const x = (this.width - barWidth) / 2;
    const y = 104;
    this.bossBar.rect(x - 10, y - 22, barWidth + 20, 36).fill({ color: 0x08160d, alpha: 0.72 });
    this.bossBar.rect(x, y, barWidth, 8).fill({ color: 0x000000, alpha: 0.6 });
    this.bossBar
      .rect(x, y, barWidth * Math.max(0, nearbyBoss.hp / nearbyBoss.maxHp), 8)
      .fill(0xe879f9);
    this.bossBar
      .rect(x + 0.5, y + 0.5, barWidth - 1, 7)
      .stroke({ width: 1, color: 0xe879f9, alpha: 0.45 });
    this.bossName.text = `${nearbyBoss.name}  ${Math.ceil(nearbyBoss.hp)} / ${nearbyBoss.maxHp}`;
    this.bossName.y = y - 7;
    this.bossName.visible = true;
  }

  private renderMinimap(input: WorldRenderInput): void {
    if (input.time - this.minimapAt < 250) return;
    this.minimapAt = input.time;
    const cfg = roomConfig(input.room);
    const display = Math.round(Math.min(132, Math.max(88, this.width * 0.2)));
    const size = 160;
    const x = this.width - display - 8;
    const y = 92;

    const ctx = this.minimapCtx;
    if (!ctx) return;
    const cache = getMinimapCache(input.room);
    const sx = size / cfg.w;
    const sy = size / cfg.h;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(cache, 0, 0, size, size);
    const spawn = roomSpawn(input.room);

    ctx.strokeStyle = "rgba(134,239,172,0.55)";
    ctx.beginPath();
    ctx.arc(
      (spawn.x / TILE) * sx,
      (spawn.y / TILE) * sy,
      (240 / TILE) * sx,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    for (const portal of input.snapshot?.portals ?? []) {
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc((portal.x / TILE) * sx, (portal.y / TILE) * sy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const npc of input.snapshot?.npcs ?? []) {
      ctx.fillStyle = "#facc15";
      ctx.fillRect((npc.x / TILE) * sx - 1, (npc.y / TILE) * sy - 1, 2.4, 2.4);
    }
    for (const monster of input.snapshot?.monsters ?? []) {
      ctx.fillStyle = monster.boss ? "#e879f9" : monster.elite ? "#fbbf24" : "#f87171";
      ctx.beginPath();
      ctx.arc(
        (monster.x / TILE) * sx,
        (monster.y / TILE) * sy,
        monster.boss ? 3 : monster.elite ? 2.4 : 1.8,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    for (const player of input.snapshot?.players ?? []) {
      if (player.id === input.meId) continue;
      ctx.fillStyle = "#60a5fa";
      ctx.beginPath();
      ctx.arc((player.x / TILE) * sx, (player.y / TILE) * sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const selfX = (input.meX / TILE) * sx;
    const selfY = (input.meY / TILE) * sy;
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.arc(selfX, selfY, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(253,230,138,0.7)";
    ctx.beginPath();
    ctx.arc(selfX, selfY, 4 + Math.sin(input.time / 300) * 1.2, 0, Math.PI * 2);
    ctx.stroke();

    const viewW = Math.min(size, (this.width / TILE) * sx * 1.4);
    const viewH = Math.min(size, ((this.height * 2) / TILE) * sy * 1.2);
    ctx.strokeStyle = "rgba(226,232,240,0.32)";
    ctx.lineWidth = 1;
    ctx.strokeRect(selfX - viewW / 2, selfY - viewH / 2, viewW, viewH);

    this.minimapTexture.source.update();
    this.minimapSprite.position.set(x, y);
    this.minimapSprite.scale.set(display / size);
    this.minimapSprite.visible = true;
    this.minimapBorder.clear();
    this.minimapBorder
      .rect(x + 0.5, y + 0.5, display - 1, display - 1)
      .stroke({ width: 1, color: 0x94a3b8, alpha: 0.5 });
  }
}

function terrainKind(
  tx: number,
  ty: number,
  room: RoomId
): "grass" | "tree" | "water" | "rock" | "flower" {
  return terrainAt(tx, ty, room);
}
