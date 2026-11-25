import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";
import { CompositeTilemap, settings as tilemapSettings } from "@pixi/tilemap";
import { GlowFilter } from "pixi-filters";
import gsap from "gsap";

// 开放世界地砖超过 16K，默认 16 位索引会被截断导致地面整片消失
tilemapSettings.use32bitIndex = true;

import type { ClassId } from "@/lib/game/types";

import * as art from "./pixel-art";
import {
  AOE_RADIUS,
  ARMOR_BODY,
  CLASS_BODY,
  DASH_SKILLS,
  EXECUTE_SKILLS,
  FIRE_SKILLS,
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
/**
 * 角色贴图的放大倍数。贴图本体约 16×25 像素，1.06 倍后身高 ≈53px，
 * 正好略高于一格瓦片（32px）而与树、房屋形成正常的人/景比例。
 */
const SPRITE_SCALE = 1.06;
/** 相对旧版 2 倍的体型系数，名牌/光环等以 root 像素计的布局都按它换算 */
const HERO_H = SPRITE_SCALE / 2;
/** NPC 贴图比英雄矮，1.15 倍后约 35px，站在玩家旁边刚好矮一头 */
const NPC_SCALE = 1.15;
/** 职业代表色：脚下光环、面板标签统一使用 */
const CLASS_AURA: Record<string, string> = {
  warrior: "#fbbf24",
  mage: "#a78bfa",
  ranger: "#4ade80",
  priest: "#f5d0fe",
  assassin: "#f87171",
  guardian: "#60a5fa",
};

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

/** 把武器色往白色提亮，避免整把剑被深棕/深红染色后像一块木板 */
function lighten(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

function darken(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (channel: number) => Math.round(channel * (1 - amount));
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

function mixColor(base: number, over: number, amount: number): number {
  const br = (base >> 16) & 0xff;
  const bg = (base >> 8) & 0xff;
  const bb = base & 0xff;
  const or = (over >> 16) & 0xff;
  const og = (over >> 8) & 0xff;
  const ob = over & 0xff;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return (mix(br, or) << 16) | (mix(bg, og) << 8) | mix(bb, ob);
}

/**
 * 用填充多边形拼出圆环/椭圆环：项目里部分设备（swiftshader / 老驱动）下
 * Graphics.stroke() 完全不渲染，所以所有“描边”都走填充带，保证任何环境可见。
 */
function ringPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  width: number,
  from = 0,
  to = Math.PI * 2,
  steps = 30
): number[] {
  const ix = Math.max(0.4, rx - width);
  const iy = Math.max(0.4, ry - width);
  const pts: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = from + ((to - from) * i) / steps;
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const a = from + ((to - from) * i) / steps;
    pts.push(cx + Math.cos(a) * ix, cy + Math.sin(a) * iy);
  }
  return pts;
}

/** 用四边形填充代替直线描边，宽度即线宽 */
function lineQuad(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number
): number[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  return [x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny];
}

/** 由中心点、半径、角度、宽度拼出的放射状短棒（符文刻度/冰刺） */
function tickQuad(
  cx: number,
  cy: number,
  angle: number,
  from: number,
  to: number,
  width: number
): number[] {
  return lineQuad(
    cx + Math.cos(angle) * from,
    cy + Math.sin(angle) * from,
    cx + Math.cos(angle) * to,
    cy + Math.sin(angle) * to,
    width
  );
}

/** 等宽字体下估算文本宽度（中日文按全角计），用于给名牌画底板 */
function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    w += code > 255 ? size : size * 0.62;
  }
  return w;
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
  /** 近战挥砍弧光 / 弓箭飞行闪光 / 法师杖头凝聚 */
  private readonly slashFx = new Graphics();
  private readonly shotFx = new Graphics();
  private readonly castFx = new Graphics();
  /** 自己的职业光环，脚下淡淡一圈，混战时也能一眼找到自己 */
  private readonly classAura = new Graphics();
  /** 守护护盾泡 / 增益金光环 */
  private readonly buffFx = new Graphics();
  private auraColor = 0xfbbf24;
  private weaponKind: WeaponKind = "sword";
  private weaponTint = 0xdbe4ee;
  readonly nameText = new Text({ text: "", style: textStyle(10, "#e2e8f0"), resolution: 2 });
  readonly namePlate = new Graphics();
  readonly hpBar = new Graphics();
  private plateLabel = "";
  private skinKey = "";
  private nameTint = "#e2e8f0";
  private limbTint = 0xffffff;

  constructor() {
    this.root.sortableChildren = false;
    this.shadow.anchor.set(0.5, 0.5);
    this.shadow.scale.set(HERO_H);
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
    // 血条位置每帧按镜头缩放补偿（见 update），这里只放一个初始值
    this.hpBar.position.set(0, -142 * HERO_H + 5);

    // 贴图经过 PixelBuffer 2x 放大，坐标同样按放大后的像素计算
    this.legBack.position.set(-4.5, -20);
    this.legFront.position.set(4.5, -20);
    this.torso.position.set(0, -16);
    this.head.position.set(0, -38);
    // 手臂外移到肩甲外侧，避免袖管压在胸甲正中间
    this.armBack.position.set(-10, -36);
    this.armFront.position.set(10, -36);
    // 挂点落在手心，剑刃朝斜上方外撇，不再斜穿头部
    this.weaponRig.position.set(2, 18);
    this.weapon.scale.set(0.8);
    this.weaponGlow.position.set(0, -28);
    this.weaponGlow.scale.set(0.35);
    this.weaponGlow.visible = false;

    this.weaponRig.addChild(this.weaponGlow, this.weapon);
    // 手在剑柄之上，看起来才是握住而不是托着
    this.armFront.addChild(this.weaponRig, this.armFrontSprite);
    // 后手臂必须画在躯干/头部之后面，之前顺序让后臂盖住了头和胸甲
    this.body.addChild(
      this.armBack,
      this.legBack,
      this.legFront,
      this.torso,
      this.head,
      this.armFront
    );
    // 攻击特效挂在身体上，随朝向自动镜像
    this.slashFx.blendMode = "add";
    this.shotFx.blendMode = "add";
    this.castFx.blendMode = "add";
    this.classAura.blendMode = "add";
    this.buffFx.blendMode = "add";
    this.body.addChild(this.slashFx, this.shotFx, this.castFx);
    this.nameText.anchor.set(0.5, 1);
    this.nameText.position.set(0, -142 * HERO_H);
    this.classAura.visible = false;
    this.root.addChild(
      this.shadow,
      this.classAura,
      this.body,
      this.buffFx,
      this.namePlate,
      this.nameText,
      this.hpBar
    );
  }

  configure(skin: Skin): void {
    this.armorTint = skin.armorTint;
    const key = `${skin.classId}:${skin.weapon}:${skin.armorTint}:${skin.weaponTint}:${skin.glowColor}`;
    if (key === this.skinKey) return;
    this.skinKey = key;
    this.auraColor = hexToNumber(CLASS_AURA[skin.classId] ?? "#fbbf24");
    const parts = art.heroParts(skin.classId, skin.weapon);
    this.head.texture = parts.head;
    this.torso.texture = parts.torso;
    this.legBack.texture = parts.limb;
    this.legFront.texture = parts.limb;
    this.armBack.texture = parts.arm;
    this.armFrontSprite.texture = parts.arm;
    this.weapon.texture = parts.weapon;
    // 四肢压暗一档，同色护甲也能看出体积，不再糊成一整块
    this.limbTint = darken(skin.armorTint, 0.16);
    this.torso.tint = skin.armorTint;
    this.legBack.tint = this.limbTint;
    this.legFront.tint = this.limbTint;
    this.armBack.tint = this.limbTint;
    this.armFrontSprite.tint = this.limbTint;
    // 金属武器只染一点职业色，保留钢质反光，不至于像一根木棍
    this.weaponTint = skin.weaponTint;
    this.weaponKind = skin.weapon;
    this.weapon.tint = mixColor(0xdbe4ee, skin.weaponTint, 0.28);
    if (skin.glowColor) {
      this.weaponGlow.texture = art.glowTexture(skin.glowColor);
      this.weaponGlow.tint = 0xffffff;
      this.weaponGlow.visible = true;
    } else {
      this.weaponGlow.visible = false;
    }
    this.hpBar.clear();
  }

  /** 名牌文字颜色按职业区分，队友是奶是法扫一眼就知道 */
  setNameColor(color: string): void {
    if (this.nameTint === color) return;
    this.nameTint = color;
    this.nameText.style.fill = color;
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
    zoom: number;
    time: number;
    guard?: boolean;
    buff?: boolean;
  }): void {
    this.root.position.set(opts.x, opts.y);
    this.root.zIndex = opts.x + opts.y;
    this.body.scale.set(Math.abs(SPRITE_SCALE) * (opts.dir >= 0 ? 1 : -1), SPRITE_SCALE);
    this.shadow.visible = !opts.dead;

    if (opts.me && !opts.dead) {
      // 自己的职业光环：脚下呼吸光圈，混战时快速定位自己；
      // 血量低于三成时光环变红并加快呼吸，余光也能察觉危险
      const lowHp = opts.hp / Math.max(1, opts.maxHp) <= 0.3;
      const pulse = 0.5 + Math.sin(opts.time / (lowHp ? 220 : 460)) * 0.5;
      const auraTone = lowHp ? 0xef4444 : this.auraColor;
      this.classAura.visible = true;
      this.classAura.clear();
      this.classAura
        .poly(
          ringPoints(
            0,
            0,
            (22 + pulse * 2.5) * HERO_H,
            (11 + pulse * 1.2) * HERO_H,
            2.8 * HERO_H
          )
        )
        .fill({ color: auraTone, alpha: 0.42 + pulse * 0.22 });
      this.classAura
        .ellipse(0, 0, 20 * HERO_H, 10 * HERO_H)
        .fill({ color: auraTone, alpha: 0.1 + pulse * 0.06 });
      if (lowHp) {
        this.classAura
          .poly(
            ringPoints(
              0,
              0,
              (27 + pulse * 3) * HERO_H,
              (13.5 + pulse * 1.5) * HERO_H,
              1.6 * HERO_H
            )
          )
          .fill({ color: 0xfca5a5, alpha: 0.3 + pulse * 0.35 });
      }
    } else {
      this.classAura.visible = false;
    }

    this.buffFx.clear();
    if (!opts.dead && (opts.guard || opts.buff)) {
      const t = opts.time;
      if (opts.guard) {
        // 守护：青蓝护盾泡包裹全身，外圈呼吸 + 顶部高光弧
        const pulse = 0.5 + Math.sin(t / 260) * 0.5;
        this.buffFx
          .ellipse(0, -40 * HERO_H, 22 * HERO_H, 37 * HERO_H)
          .fill({ color: 0x38bdf8, alpha: 0.1 + pulse * 0.07 });
        this.buffFx
          .poly(
            ringPoints(0, -40 * HERO_H, 23 * HERO_H, 38 * HERO_H, 3.2 * HERO_H, 0, Math.PI * 2, 36)
          )
          .fill({ color: 0x7dd3fc, alpha: 0.4 + pulse * 0.22 });
        this.buffFx
          .poly(
            ringPoints(
              0,
              -40 * HERO_H,
              23 * HERO_H,
              38 * HERO_H,
              3.2 * HERO_H,
              -Math.PI * 0.82,
              -Math.PI * 0.18,
              14
            )
          )
          .fill({ color: 0xe0f2fe, alpha: 0.45 + pulse * 0.3 });
        // 脚下扩散的能量涟漪
        this.buffFx
          .poly(ringPoints(0, 0, 24 * HERO_H, 12 * HERO_H, 1.6 * HERO_H))
          .fill({ color: 0x60a5fa, alpha: 0.24 + pulse * 0.16 });
      }
      if (opts.buff) {
        // 增益：金色菱形符环绕胸口缓慢旋转
        const base = t / 900;
        for (let i = 0; i < 3; i += 1) {
          const a = base + (i * Math.PI * 2) / 3;
          const px = Math.cos(a) * 24 * HERO_H;
          const py = (-34 + Math.sin(a) * 7) * HERO_H;
          const s = (3.6 + Math.sin(a) * 0.9) * HERO_H;
          const alpha = 0.62 + Math.sin(a + t / 300) * 0.24;
          this.buffFx
            .poly([px, py - s, px + s * 0.7, py, px, py + s, px - s * 0.7, py])
            .fill({ color: 0xfde68a, alpha: Math.min(0.95, Math.max(0.3, alpha)) });
        }
        this.buffFx
          .poly(ringPoints(0, 0, 17 * HERO_H, 8.5 * HERO_H, 1.8 * HERO_H))
          .fill({ color: 0xfbbf24, alpha: 0.38 + Math.sin(t / 320) * 0.14 });
      }
    }

    const moving = opts.moving && !opts.dead;
    const step = moving ? Math.sin(opts.time / 85) : 0;
    const bob = moving ? Math.abs(Math.sin(opts.time / 85)) * 1.6 : 0;
    const breathe = Math.sin(opts.time / 640) * 0.6;

    this.legBack.rotation = moving ? step * 0.55 : 0;
    this.legFront.rotation = moving ? -step * 0.55 : 0;
    this.armBack.rotation = moving ? -step * 0.45 : 0.06;
    this.legBack.y = -20;
    this.legFront.y = -20;
    this.torso.y = -16 - bob * 0.35;
    this.head.y = -38 - bob * 0.4 + breathe;
    this.armBack.y = -36 - bob * 0.3;

    const swingElapsed = opts.swingAt ? opts.time - opts.swingAt : Number.POSITIVE_INFINITY;
    const swing = swingElapsed >= 0 && swingElapsed < 300 ? swingElapsed / 300 : -1;
    if (opts.swingAt && opts.swingAt !== this.lastSwingAt) {
      this.lastSwingAt = opts.swingAt;
      this.swingCount += 1;
    }
    // 出招前冲/后坐：近战前压半步、弓手后坐、法杖微微上浮
    const atkP = swing > 0 && swing < 0.7 ? Math.sin((swing / 0.7) * Math.PI) : 0;
    const facing = opts.dir >= 0 ? 1 : -1;
    let bodyX = 0;
    let bodyY = 0;
    if (this.weaponKind === "sword") bodyX = facing * atkP * 3.5 * HERO_H * 2;
    else if (this.weaponKind === "bow") bodyX = -facing * atkP * 2.2 * HERO_H * 2;
    else bodyY = -atkP * 2 * HERO_H * 2;
    this.body.position.set(bodyX, bodyY);
    if (swing >= 0) {
      if (this.weaponKind === "bow") {
        // 拉弓：前手前伸压住弓身，后手向后拉弦
        const draw = Math.sin(Math.PI * Math.min(1, swing / 0.75));
        this.armFront.rotation = -0.52 - draw * 0.14;
        this.armFront.y = -36 - bob * 0.3;
        this.armBack.rotation = 0.45 + draw * 0.85;
        this.weaponRig.rotation = 0.12;
      } else if (this.weaponKind === "staff") {
        // 吟唱：法杖前举，杖头凝聚光点
        const lift = Math.sin(Math.PI * Math.min(1, swing / 0.8));
        this.armFront.rotation = -1.1 - lift * 0.36;
        this.armFront.y = -36 - bob * 0.3;
        this.weaponRig.rotation = 0.2;
      } else {
        const angle =
          swing < 0.28
            ? -1.25 * (swing / 0.28)
            : swing < 0.62
              ? -1.25 + 2.7 * ((swing - 0.28) / 0.34)
              : 1.45 - 1.45 * ((swing - 0.62) / 0.38);
        this.armFront.rotation = angle;
        this.armFront.y = -36 - bob * 0.3;
        this.weaponRig.rotation = 0.55 + angle * 0.18;
      }
    } else if (this.weaponKind === "bow") {
      // 游侠待机：弓身竖握在身侧，前手自然垂下
      this.armFront.rotation = moving ? step * 0.42 : -0.22 + breathe * 0.05;
      this.armFront.y = -36 - bob * 0.3;
      this.weaponRig.rotation = 0.16 + (moving ? step * 0.03 : breathe * 0.02);
    } else if (this.weaponKind === "staff") {
      // 法师待机：法杖斜举，杖头光核轻轻起伏
      this.armFront.rotation = moving ? step * 0.4 : -0.18 + breathe * 0.06;
      this.armFront.y = -36 - bob * 0.3;
      this.weaponRig.rotation = 0.74 + (moving ? step * 0.04 : breathe * 0.03);
    } else {
      this.armFront.rotation = moving ? step * 0.5 : -0.06 + breathe * 0.05;
      this.armFront.y = -36 - bob * 0.3;
      this.weaponRig.rotation = 0.55 + (moving ? step * 0.04 : breathe * 0.02);
    }
    this.drawAttackFx(swing);

    const hurtElapsed = opts.hurtAt > 0 ? opts.time - opts.hurtAt : Number.POSITIVE_INFINITY;
    const hurt = hurtElapsed >= 0 && hurtElapsed < 160;

    // 出刀前冲 + 受击后仰：动作和判定时机保持一致，看起来才“打中了”
    let drift = 0;
    if (swing >= 0 && !opts.dead) drift += Math.sin(Math.PI * swing) * 4;
    if (hurt && !opts.dead) drift -= 2.6 * (1 - hurtElapsed / 160);
    this.body.x = opts.dir >= 0 ? drift : -drift;

    if (opts.dead) {
      if (!this.wasDead) {
        this.wasDead = true;
        this.deadSince = opts.time;
      }
      const t = Math.min(1, Math.max(0, (opts.time - this.deadSince) / 320));
      const ease = 1 - Math.pow(1 - t, 3);
      this.body.rotation = (-Math.PI / 2) * ease;
      this.body.y = 6 * ease;
      this.root.alpha = 1 - 0.6 * ease;
    } else {
      this.wasDead = false;
      this.body.rotation = 0;
      this.body.y = 0;
      this.root.alpha = 1;
    }

    const flash = hurt ? 0xff8a8a : 0xffffff;
    this.torso.tint = flash === 0xffffff ? this.skinTint() : flash;
    this.head.tint = flash;
    const limb = flash === 0xffffff ? this.limbTint : flash;
    this.legBack.tint = limb;
    this.legFront.tint = limb;
    this.armBack.tint = limb;
    this.armFrontSprite.tint = limb;

    if (this.nameText.text !== opts.name) this.nameText.text = opts.name;
    if (this.plateLabel !== opts.name) {
      // 名牌底板：深色半透明胶囊，压在草地上也能一眼看清是谁
      this.plateLabel = opts.name;
      const w = textWidth(opts.name, 10) + 9;
      this.namePlate.clear();
      if (opts.name) {
        this.namePlate
          .roundRect(-w / 2, -14, w, 15, 5)
          .fill({ color: 0x050b16, alpha: 1 });
      }
      this.namePlate.visible = !!opts.name;
    }
    this.namePlate.tint = 0xffffff;
    if (this.plateLabel === opts.name && opts.name) {
      // 底板随名字一起抵消镜头缩放，并轻微呼吸提示队友
      const glow = opts.me ? 0.5 + Math.sin(opts.time / 520) * 0.06 : 0.44;
      this.namePlate.alpha = glow;
    }
    // 附魔武器的光晕轻微呼吸，静止时也不像贴图
    if (this.weaponGlow.visible) {
      this.weaponGlow.alpha = 0.45 + Math.sin(opts.time / 380 + this.root.x * 0.01) * 0.12;
    }
    this.nameText.style.fill = opts.me ? "#fde68a" : "#e2e8f0";
    // 名字和血条抵消镜头缩放，缩小视野时依然清晰
    const inv = 1 / Math.max(0.1, opts.zoom);
    this.nameText.scale.set(inv);
    this.namePlate.scale.set(inv);
    this.hpBar.scale.set(inv);
    // 名牌底板与血条都以“名字位置”为锚点，避免不同镜头缩放时互相错位
    this.namePlate.position.y = -142 * HERO_H;
    this.hpBar.position.set(0, -142 * HERO_H + 5);

    // 血条带一段缓慢回落的黄色残影，掉血更有反馈
    const hpRatio = Math.max(0, Math.min(1, opts.hp / Math.max(1, opts.maxHp)));
    if (hpRatio > this.hpShown) this.hpShown = hpRatio;
    else {
      this.hpShown += (hpRatio - this.hpShown) * 0.14;
      if (this.hpShown - hpRatio < 0.004) this.hpShown = hpRatio;
    }
    this.hpBar.clear();
    this.hpBar.roundRect(-20, -2, 40, 4, 2).fill({ color: 0x000000, alpha: 0.72 });
    if (this.hpShown > hpRatio + 0.002) {
      this.hpBar
        .roundRect(-20 + 40 * hpRatio, -2, Math.max(2, 40 * (this.hpShown - hpRatio)), 4, 2)
        .fill({ color: 0xfde68a, alpha: 0.75 });
    }
    if (hpRatio > 0) {
      this.hpBar.roundRect(-20, -2, Math.max(3, 40 * hpRatio), 4, 2).fill(0xef4444);
    }
  }

  private armorTint = 0xffffff;
  private wasDead = false;
  private deadSince = 0;
  private hpShown = 1;
  /** 记录每次挥砍，交替上下刀路，连续攻击不至于像复读 */
  private lastSwingAt = 0;
  private swingCount = 0;

  /** 按武器类型绘制攻击残影：近战弧光、箭矢闪光、法师杖头凝聚 */
  private drawAttackFx(swing: number): void {
    this.slashFx.clear();
    this.shotFx.clear();
    this.castFx.clear();
    if (swing < 0) return;
    // 统一用填充多边形绘制，兼容 WebGL 下 stroke 不稳定渲染
    const band = (
      cx: number,
      cy: number,
      rOut: number,
      rIn: number,
      from: number,
      to: number,
      steps = 14
    ) => {
      const pts: number[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const a = from + ((to - from) * i) / steps;
        pts.push(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut);
      }
      for (let i = steps; i >= 0; i -= 1) {
        const a = from + ((to - from) * i) / steps;
        pts.push(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
      }
      return pts;
    };
    if (this.weaponKind === "bow") {
      // 拉弓蓄力：弓身一亮，随后箭矢带尾焰离弦
      if (swing > 0.04 && swing < 0.34) {
        const q = (swing - 0.04) / 0.3;
        const alpha = (1 - q) * 0.75;
        this.shotFx
          .poly(band(12, -38, 15 + q * 2, 12.6 + q * 2, -1.15, 1.15, 10))
          .fill({ color: 0xffffff, alpha });
      }
      if (swing > 0.06 && swing < 0.62) {
        const p = (swing - 0.06) / 0.56;
        const alpha = (1 - p) * 0.95;
        const x = 10 + p * 36;
        const y = -34;
        // 尾焰拖影
        this.shotFx
          .poly([x - 12, y - 1.4, x + 8, y - 0.5, x + 8, y + 0.5, x - 12, y + 1.4])
          .fill({ color: mixColor(0xffffff, this.weaponTint, 0.5), alpha: alpha * 0.55 });
        // 箭杆
        this.shotFx
          .poly([x, y - 1.2, x + 18, y - 0.7, x + 18, y + 0.7, x, y + 1.2])
          .fill({ color: 0xffffff, alpha });
        // 箭头
        this.shotFx
          .poly([x + 18, y, x + 13.5, y - 3, x + 11, y, x + 13.5, y + 3])
          .fill({ color: mixColor(0xffffff, this.weaponTint, 0.3), alpha });
        // 箭羽
        this.shotFx
          .poly([x, y - 1.8, x + 4.5, y, x, y + 1.8, x - 2.5, y])
          .fill({ color: mixColor(0xffffff, this.weaponTint, 0.6), alpha: alpha * 0.85 });
        // 飞行残影：箭尾三点拖光，射速感更强
        for (let i = 0; i < 3; i += 1) {
          this.shotFx
            .circle(x - 15 - i * 6, y + Math.sin(p * 9 + i * 1.7) * 0.9, 1.4 - i * 0.28)
            .fill({
              color: mixColor(0xbbf7d0, this.weaponTint, 0.4),
              alpha: alpha * (0.5 - i * 0.12),
            });
        }
      }
    } else if (this.weaponKind === "staff") {
      // 吟唱：杖头光核 + 向外扩张的符文环 + 十字星芒
      if (swing < 0.78) {
        const p = swing / 0.78;
        const alpha = 1 - p;
        const cx = 10;
        const cy = -46;
        const core = 2.2 + p * 2.2;
        const radius = 6 + p * 9;
        this.castFx.circle(cx, cy, core).fill({ color: 0xffffff, alpha: alpha * 0.95 });
        this.castFx
          .poly(band(cx, cy, radius, radius - 2, 0, Math.PI * 2, 20))
          .fill({ color: 0xffffff, alpha: alpha * 0.8 });
        this.castFx
          .poly(band(cx, cy, radius - 2.4, radius - 4.4, 0, Math.PI * 2, 20))
          .fill({ color: 0xa855f7, alpha: alpha * 0.75 });
        const spark = 5 + p * 9;
        this.castFx
          .poly([cx - spark, cy, cx, cy - 1, cx + spark, cy, cx, cy + 1])
          .fill({ color: 0xffffff, alpha: alpha * 0.9 });
        this.castFx
          .poly([cx, cy - spark, cx + 1, cy, cx, cy + spark, cx - 1, cy])
          .fill({ color: 0xffffff, alpha: alpha * 0.9 });
        // 环绕符文：三颗光点绕杖头旋转，像在成阵
        for (let i = 0; i < 3; i += 1) {
          const angle = p * 2.8 + (i * Math.PI * 2) / 3;
          this.castFx
            .circle(cx + Math.cos(angle) * radius * 1.2, cy + Math.sin(angle) * radius * 1.2, 1.6)
            .fill({ color: mixColor(0xe9d5ff, this.weaponTint, 0.3), alpha: alpha * 0.85 });
        }
      }
    } else if (swing > 0.1 && swing < 0.86) {
      // 近战：扇形刀光随时间扫过并淡出，奇偶次上下交替
      const p = (swing - 0.1) / 0.76;
      const alpha = (1 - p) * 0.8;
      const dir = this.swingCount % 2 === 0 ? 1 : -1;
      // 每三刀一次重击：刀光更长更亮，附一圈外扩冲击波
      const heavy = this.swingCount % 3 === 0;
      const cy = dir > 0 ? -30 : -24;
      const start = dir > 0 ? -2.1 + p * 2.4 : 1.5 - p * 2.4;
      const end = start + dir * (heavy ? 1.9 : 1.5);
      const radius = (heavy ? 22 : 18) + p * 7;
      this.slashFx
        .poly(band(0, cy, radius + 1.8, radius - 2.2, start, end))
        .fill({ color: 0xffffff, alpha });
      this.slashFx
        .poly(band(0, cy, radius - 3.6, radius - 5, start + dir * 0.16, end - dir * 0.14))
        .fill({ color: mixColor(0xffffff, this.weaponTint, 0.55), alpha: alpha * 0.9 });
      const tipA = end;
      this.slashFx
        .circle(Math.cos(tipA) * radius, cy + Math.sin(tipA) * radius, 1.9)
        .fill({ color: 0xffffff, alpha: Math.min(1, alpha * 1.2) });
      if (heavy) {
        const wave = radius + 4 + p * 10;
        this.slashFx
          .poly(band(0, cy, wave + 1.4, wave - 1.4, start, end))
          .fill({ color: mixColor(0xffffff, this.weaponTint, 0.75), alpha: alpha * 0.55 });
        for (let i = 0; i < 3; i += 1) {
          const a = start + ((end - start) * (0.3 + i * 0.25));
          this.slashFx
            .circle(Math.cos(a) * (radius + 3), cy + Math.sin(a) * (radius + 3), 1.5)
            .fill({ color: 0xffffff, alpha: alpha * 0.9 });
        }
      }
    }
  }

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
  /** 被冰霜减速时脚下的寒气环与碎冰 */
  private readonly chill = new Graphics();
  /** 命中瞬间从身体炸开的白色冲击环 */
  private readonly impact = new Graphics();
  private impactAt = 0;
  private wasFlash = false;
  readonly nameText = new Text({ text: "", style: textStyle(10, "#fca5a5"), resolution: 2 });
  readonly namePlate = new Graphics();
  readonly hpBar = new Graphics();
  private plateLabel = "";
  private kind = "";
  private scale = 1;
  private hpShown = 1;
  private spawnAt = 0;

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
      this.chill,
      this.sprite,
      this.impact,
      this.selection,
      this.namePlate,
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
    zoom: number;
    time: number;
    slow?: boolean;
  }): void {
    if (this.kind !== opts.kind) {
      this.kind = opts.kind;
      this.sprite.texture = art.monsterFrames(opts.kind)[0];
    }
    if (this.spawnAt === 0) this.spawnAt = opts.time;
    // 刷怪时从小弹到正常大小，出现瞬间有存在感
    const appear = Math.min(1, Math.max(0, (opts.time - this.spawnAt) / 240));
    const appearEase = 1 - Math.pow(1 - appear, 3);
    const frames = art.monsterFrames(opts.kind);
    this.sprite.texture = frames[Math.floor(opts.time / 220 + opts.x) % frames.length];
    this.scale = opts.boss ? 1.45 : opts.elite ? 1.18 : 1;
    this.root.position.set(opts.x, opts.y);
    this.root.zIndex = opts.x + opts.y;
    this.root.alpha = 0.35 + 0.65 * appearEase;
    // 待机轻微上下浮动，避免怪物像贴图一样钉在地上
    this.sprite.y = Math.sin(opts.time / 520 + opts.x * 0.06) * (opts.boss ? 1.4 : 0.8);
    this.sprite.scale.set(SPRITE_SCALE * this.scale * (0.7 + 0.3 * appearEase));
    this.sprite.tint = opts.flash ? 0xff9a9a : opts.slow ? 0xa9d4f5 : 0xffffff;

    // 受击后仰抖动：短促的高频横移，让每一刀都像真的砍进了肉里
    const knockAge = opts.time - this.impactAt;
    if (knockAge >= 0 && knockAge < 150) {
      const k = 1 - knockAge / 150;
      this.sprite.x = Math.sin(knockAge / 16) * 2.6 * k;
      this.sprite.y -= 1.4 * k;
    } else {
      this.sprite.x = 0;
    }

    // 命中冲击：受击瞬间炸出一圈白环 + 四根短刺，打上去更有“剁进去”的手感
    if (opts.flash && !this.wasFlash) this.impactAt = opts.time;
    this.wasFlash = opts.flash;
    this.impact.clear();
    const impactAge = opts.time - this.impactAt;
    if (impactAge >= 0 && impactAge < 220) {
      const t = impactAge / 220;
      const r = (12 + t * 18) * this.scale * HERO_H;
      // BOSS/精英的受击环带各自主题色，普通怪保持纯白，混战时也能分清打到了谁
      const tone = opts.boss ? 0xf0abfc : opts.elite ? 0xfde68a : 0xffffff;
      this.impact
        .poly(ringPoints(0, -10, r, r * 0.55, 3.2 * (1 - t) + 0.8))
        .fill({ color: tone, alpha: 0.85 * (1 - t) });
      for (let i = 0; i < 4; i += 1) {
        const a = (i * Math.PI) / 2 + 0.35;
        const inner = r * 0.9;
        const outer = r * 1.5;
        this.impact
          .poly(
            tickQuad(
              0,
              -10,
              a,
              inner,
              outer,
              3 * (1 - t) + 0.6
            )
          )
          .fill({ color: mixColor(0xfff1f2, tone, 0.35), alpha: 0.7 * (1 - t) });
      }
    }

    this.aura.clear();
    if (opts.boss) {
      this.shadow.visible = true;
      this.shadow.scale.set(this.scale * 1.05 * HERO_H);
      const pulse = 0.5 + Math.sin(opts.time / 300) * 0.22;
      this.aura
        .poly(ringPoints(0, 0, 26 * this.scale * HERO_H, 13 * this.scale * HERO_H, 2.4 * HERO_H))
        .fill({ color: 0xe879f9, alpha: 0.25 + pulse * 0.4 });
      this.aura
        .ellipse(0, 0, 22 * this.scale * HERO_H, 11 * this.scale * HERO_H)
        .fill({ color: 0xe879f9, alpha: 0.05 + pulse * 0.05 });
      this.glow.visible = true;
      this.glow.y = -34 * this.scale * HERO_H;
      this.glow.scale.set(1.5 * this.scale * HERO_H);
      this.glow.alpha = 0.18 + pulse * 0.12;
    } else if (opts.elite) {
      this.shadow.visible = true;
      this.shadow.scale.set(this.scale * HERO_H);
      const pulse = 0.5 + Math.sin(opts.time / 260 + opts.x) * 0.3;
      this.aura
        .poly(
          ringPoints(
            0,
            0,
            (20 + pulse * 5) * this.scale * HERO_H,
            (10 + pulse * 2.5) * this.scale * HERO_H,
            2 * HERO_H
          )
        )
        .fill({ color: 0xfacc15, alpha: 0.25 + pulse * 0.35 });
      this.glow.visible = false;
    } else {
      this.shadow.visible = true;
      this.shadow.scale.set(this.scale * HERO_H);
      this.glow.visible = false;
    }

    this.chill.clear();
    if (opts.slow && !opts.selected) {
      // 减速：脚下淡蓝寒气环 + 三块浮冰，配合偏蓝的贴图一眼能看出被控
      const flick = 0.5 + Math.sin(opts.time / 150 + opts.x) * 0.5;
      this.chill
        .poly(ringPoints(0, 0, 20 * this.scale * HERO_H, 10 * this.scale * HERO_H, 2 * HERO_H))
        .fill({ color: 0x7dd3fc, alpha: 0.3 + flick * 0.3 });
      for (let i = 0; i < 3; i += 1) {
        const a = opts.time / 520 + (i * Math.PI * 2) / 3;
        const px = Math.cos(a) * 14 * this.scale * HERO_H;
        const py = Math.sin(a) * 7 * this.scale * HERO_H - 3 * HERO_H;
        const s = 4 * HERO_H;
        this.chill
          .poly([px, py - s, px + s * 0.75, py, px, py + s, px - s * 0.75, py])
          .fill({ color: 0xbae6fd, alpha: 0.5 + flick * 0.3 });
      }
    }

    this.selection.clear();
    if (opts.selected) {
      const pulse = 0.55 + Math.sin(opts.time / 180) * 0.25;
      this.selection
        .poly(ringPoints(0, 0, 24 * HERO_H, 12 * HERO_H, 2.4 * HERO_H))
        .fill({ color: 0xfacc15, alpha: pulse });
      this.selection
        .ellipse(0, 0, 22 * HERO_H, 11 * HERO_H)
        .fill({ color: 0xfacc15, alpha: pulse * 0.08 });
      const arrowY =
        -this.sprite.texture.height * SPRITE_SCALE * this.scale - 14 + Math.sin(opts.time / 200) * 2;
      this.selection
        .poly([0, arrowY + 8, -5, arrowY, 5, arrowY])
        .fill({ color: 0xfde68a, alpha: pulse });
    }

    const label = opts.level ? `Lv.${opts.level} ${opts.name}` : opts.name;
    if (this.nameText.text !== label) this.nameText.text = label;
    if (this.plateLabel !== label) {
      this.plateLabel = label;
      const w = textWidth(label, 10) + 9;
      this.namePlate.clear();
      this.namePlate.roundRect(-w / 2, -13.5, w, 14, 4).fill({ color: 0x0a0507, alpha: 0.55 });
    }
    this.nameText.style.fill = opts.boss ? "#f0abfc" : opts.elite ? "#fde68a" : "#fca5a5";
    const top = -this.sprite.texture.height * SPRITE_SCALE * this.scale - 6;
    this.nameText.y = top;
    this.nameText.visible = opts.showHealth;
    this.hpBar.visible = opts.showHealth;
    this.namePlate.y = top;
    this.namePlate.visible = opts.showHealth;
    this.namePlate.alpha = 0.9;
    // 名字/血条抵消镜头缩放，拉远后依然能看清怪
    const inv = 1 / Math.max(0.1, opts.zoom);
    this.nameText.scale.set(inv);
    this.namePlate.scale.set(inv);
    this.hpBar.scale.set(inv);
    this.hpBar.position.set(0, top + 5.5);
    const barWidth = opts.boss ? 56 : opts.elite ? 46 : 34;
    this.hpBar.clear();
    if (opts.showHealth) {
      const ratio = Math.max(0, Math.min(1, opts.hp / Math.max(1, opts.maxHp)));
      if (ratio > this.hpShown) this.hpShown = ratio;
      else {
        this.hpShown += (ratio - this.hpShown) * 0.12;
        if (this.hpShown - ratio < 0.005) this.hpShown = ratio;
      }
      this.hpBar
        .rect(-barWidth / 2, -1.5, barWidth, 3)
        .fill({ color: 0x000000, alpha: 0.7 });
      // 掉血后黄色残影缓慢回落，读伤害更直观
      if (this.hpShown > ratio + 0.002) {
        this.hpBar
          .rect(
            -barWidth / 2 + barWidth * ratio,
            -1.5,
            Math.max(2, barWidth * (this.hpShown - ratio)),
            3
          )
          .fill({ color: 0xfde68a, alpha: 0.8 });
      }
      this.hpBar
        .rect(-barWidth / 2, -1.5, barWidth * ratio, 3)
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
  setZoom(zoom: number): void;
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
  private readonly ambient = new Graphics();
  private readonly motes: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    phase: number;
    speed: number;
  }[] = [];
  private lastEmberAt = 0;
  private readonly bossBar = new Graphics();
  private readonly bossName = new Text({ text: "", style: textStyle(11, "#f0abfc"), resolution: 2 });
  private bossHpShown = 1;
  private readonly minimapCanvas = document.createElement("canvas");
  private readonly minimapTexture: Texture;
  private readonly minimapSprite: Sprite;
  private readonly minimapBack = new Graphics();
  private readonly minimapBorder = new Graphics();
  private readonly minimapCtx: CanvasRenderingContext2D | null;

  private readonly heroes = new Map<string, HeroView>();
  private readonly monsters = new Map<string, MonsterView>();
  private readonly npcs = new Map<string, { root: Container; sprite: Sprite; name: Text; marker: Text }>();
  private readonly pendingLabels: {
    text: Text;
    root: Container;
    baseY: number;
    priority: number;
    marker?: Text;
    markerBaseY?: number;
    bar?: Graphics;
    barBaseY?: number;
    plate?: Graphics;
    plateBaseY?: number;
  }[] = [];
  private readonly drops = new Map<
    string,
    { root: Container; sprite: Sprite; glow: Sprite; beam: Graphics; label: Text }
  >();
  private readonly portals = new Map<
    string,
    { root: Container; rings: Graphics; icon: Text; label: Text; glow: Sprite; filter: GlowFilter }
  >();
  private readonly propSprites: Sprite[] = [];
  private readonly propShadows: Sprite[] = [];
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
  private campfireGlow: Sprite | null = null;
  private readonly monsterFlash = new Map<string, number>();
  private width: number;
  private height: number;
  private zoom = 1;
  private zoomTarget = 1;
  private camRect = { x: 0, y: 0, w: 0, h: 0 };
  private minimapAt = 0;
  private dustAt = 0;

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
    this.ambient.blendMode = "add";
    this.hud.addChild(this.ambient, this.bossBar, this.bossName);

    this.minimapCanvas.width = 160;
    this.minimapCanvas.height = 160;
    this.minimapCtx = this.minimapCanvas.getContext("2d");
    this.minimapTexture = Texture.from(this.minimapCanvas);
    this.minimapSprite = new Sprite(this.minimapTexture);
    this.minimapSprite.anchor.set(0, 0);
    this.hud.addChild(this.minimapBack, this.minimapSprite, this.minimapBorder);

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

  /** 缩放世界层：数值越小视野越远、角色越小，HUD 不受影响 */
  setZoom(zoom: number): void {
    const next = Math.max(0.6, Math.min(1.3, zoom));
    if (Math.abs(next - this.zoomTarget) < 0.001) return;
    this.zoomTarget = next;
  }

  render(input: WorldRenderInput): void {
    if (input.room !== this.room) this.onRoom(input.room);

    this.pendingLabels.length = 0;
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
    // 缩放档位切换用缓动逼近，画面不会突然跳变
    if (Math.abs(this.zoomTarget - this.zoom) > 0.0005) {
      this.zoom += (this.zoomTarget - this.zoom) * 0.16;
      if (Math.abs(this.zoomTarget - this.zoom) < 0.001) this.zoom = this.zoomTarget;
      this.camera.scale.set(this.zoom);
      this.snapCamera = true;
    }
    // 视野范围随缩放变化，镜头边界与裁剪都按世界坐标计算
    const viewW = this.width / this.zoom;
    const viewH = this.height / this.zoom;
    const camX = Math.max(isoMinX, Math.min(isoMaxX - viewW, meIsoX - viewW / 2));
    const camY = Math.max(isoMinY, Math.min(isoMaxY - viewH, meIsoY - viewH / 2));
    this.camRect = { x: camX, y: camY, w: viewW, h: viewH };
    this.followCamera(camX, camY);

    // 震动强度随 trauma 平方衰减，GSAP 负责回零
    const amp = this.shakeState.trauma * this.shakeState.trauma * 18;
    const shakeX = amp > 0.15 ? (Math.random() - 0.5) * amp : 0;
    const shakeY = amp > 0.15 ? (Math.random() - 0.5) * amp : 0;
    this.camera.position.set(
      -this.camState.x * this.zoom + shakeX,
      -this.camState.y * this.zoom + shakeY
    );

    const toScreen = (wx: number, wy: number) => ({ x: wx - wy, y: (wx + wy) / 2 });
    const visible = (x: number, y: number, margin = 80) =>
      x > camX - margin &&
      y > camY - margin &&
      x < camX + viewW + margin &&
      y < camY + viewH + margin;

    this.renderProps(view, toScreen, visible);
    this.renderPortals(view, toScreen, visible);
    this.renderNpcs(view, toScreen, visible);
    this.renderDrops(view, toScreen, visible);
    this.renderMonsters(view, toScreen, visible);
    this.renderHeroes(view, toScreen, visible);
    this.layoutNameplates();
    this.renderSkillEffects(view, toScreen);
    this.renderMeleeArc(view, toScreen);
    this.renderParticles(view, toScreen);
    this.renderAmbient(view);
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
      if (!this.campfireGlow) {
        this.campfireGlow = new Sprite(art.glowTexture("#fb923c"));
        this.campfireGlow.anchor.set(0.5, 0.5);
        this.campfireGlow.blendMode = "add";
        this.campfireGlow.scale.set(1.1);
        this.entityLayer.addChild(this.campfireGlow);
      }
      const spawn = roomSpawn("world");
      // 篝火挪到出生点左后方并降低排序，避免火焰直接画在角色胸腹上
      const sx = spawn.x - spawn.y;
      const sy = (spawn.x + spawn.y) / 2;
      this.campfire.position.set(sx - 62, sy - 8);
      this.campfire.zIndex = spawn.x + spawn.y - 12;
      this.campfire.visible = true;
      this.campfireGlow.position.set(sx - 62, sy - 18);
      this.campfireGlow.zIndex = spawn.x + spawn.y - 13;
      this.campfireGlow.visible = true;
    } else if (this.campfire) {
      this.campfire.visible = false;
      if (this.campfireGlow) this.campfireGlow.visible = false;
    }
    this.monsterFlash.clear();
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
      zoom: this.zoom,
      time: input.time,
      guard: meSnapshot?.guard ?? false,
      buff: meSnapshot?.buff ?? false,
    });
    seen.add(input.meId);
    this.pendingLabels.push({
      text: me.nameText,
      root: me.root,
      baseY: -142 * HERO_H,
      priority: 0,
      plate: me.namePlate,
      plateBaseY: -142 * HERO_H,
    });

    for (const player of input.snapshot?.players ?? []) {
      if (player.id === input.meId) continue;
      const screen = toScreen(player.x, player.y);
      if (!visible(screen.x, screen.y)) continue;
      const classId = player.classId as ClassId;
      const skin = this.heroSkin(input.snapshot, player.id, classId);
      const view = this.heroView(player.id);
      view.configure(skin);
      view.setNameColor(CLASS_AURA[classId] ?? "#e2e8f0");
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
        zoom: this.zoom,
        time: input.time,
        guard: player.guard ?? false,
        buff: player.buff ?? false,
      });
      // 远一点的队友只保留血条，名字淡出，避免满屏名牌
      const playerDist = Math.hypot(player.x - input.meX, player.y - input.meY);
      const nameAlpha = Math.max(0, Math.min(1, (380 - playerDist) / 100));
      view.nameText.alpha = nameAlpha;
      view.namePlate.alpha = nameAlpha * 0.55;
      if (nameAlpha > 0.05) {
        this.pendingLabels.push({
          text: view.nameText,
          root: view.root,
          baseY: -142 * HERO_H,
          priority: 2,
          plate: view.namePlate,
          plateBaseY: -142 * HERO_H,
        });
      }
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

  /**
   * 名牌防重叠：同屏靠得太近的名字依次向上错开，优先级高的（自己）保持不动。
   * 只处理玩家与 NPC，怪物战斗中数量少，继续贴着血条。
   */
  private layoutNameplates(): void {
    if (this.pendingLabels.length === 0) return;
    const inv = 1 / Math.max(0.1, this.zoom);
    const xGap = 66 * inv;
    const yGap = 14 * inv;
    const placed: { x: number; y: number }[] = [];
    const sorted = [...this.pendingLabels].sort(
      (a, b) => a.priority - b.priority || a.root.y - b.root.y || a.root.x - b.root.x
    );
    for (const item of sorted) {
      const baseY = item.root.y + item.baseY;
      let offset = 0;
      for (let tries = 0; tries < 6; tries += 1) {
        const y = baseY - offset;
        const clash = placed.some(
          (p) => Math.abs(p.x - item.root.x) < xGap && Math.abs(p.y - y) < yGap
        );
        if (!clash) break;
        offset += yGap;
      }
      item.text.y = item.baseY - offset;
      if (item.marker && item.markerBaseY !== undefined) {
        item.marker.y = item.markerBaseY - offset;
      }
      if (item.bar && item.barBaseY !== undefined) {
        item.bar.y = item.barBaseY - offset;
      }
      if (item.plate && item.plateBaseY !== undefined) {
        item.plate.y = item.plateBaseY - offset;
      }
      placed.push({ x: item.root.x, y: baseY - offset });
    }
    this.pendingLabels.length = 0;
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
      // 首次受击溅出几粒白色碎光，打击位置更明确
      const prevFlash = this.monsterFlash.get(monster.id) ?? 0;
      if (flashAt > prevFlash) {
        this.monsterFlash.set(monster.id, flashAt);
        const count = monster.boss ? 8 : 5;
        for (let i = 0; i < count; i += 1) {
          this.sparks.push({
            x: monster.x + (Math.random() - 0.5) * 12,
            y: monster.y - 12 + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 54,
            vy: -18 - Math.random() * 26,
            life: 240,
            maxLife: 240,
            color: 0xfff1c1,
            size: 2,
          });
        }
      }
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
          distance < 260 / Math.max(0.6, this.zoom),
        zoom: this.zoom,
        time: input.time,
        slow: monster.slow ?? false,
      });
      // 战斗中多只怪贴在一起时，整块名牌（名字 + 血条）一起向上错开
      if (view.nameText.visible) {
        this.pendingLabels.push({
          text: view.nameText,
          root: view.root,
          baseY: view.nameText.y,
          priority: 1,
          bar: view.hpBar,
          barBaseY: view.hpBar.y,
          plate: view.namePlate,
          plateBaseY: view.namePlate.y,
        });
      }
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
    const meScreen = toScreen(input.meX, input.meY);
    const meDepth = input.meX + input.meY;
    // 锁定目标同样要能看穿树冠，否则打怪时目标会被树叶吞掉
    const locked = input.snapshot?.monsters.find((monster) => monster.id === input.targetId);
    const lockScreen = locked ? toScreen(locked.x, locked.y) : null;
    const lockDepth = locked ? locked.x + locked.y : 0;
    let index = 0;
    for (const prop of this.props) {
      const screen = toScreen(prop.x, prop.y);
      if (!visible(screen.x, screen.y, 140)) continue;
      const sprite = this.propSprite(index);
      sprite.texture = prop.kind === "tree" ? tree : rock;
      sprite.position.set(screen.x, screen.y);
      sprite.zIndex = prop.x + prop.y;
      // 按坐标生成固定的大小差异，同一棵树每帧不变，整片树林不至于像复制粘贴
      const seed = Math.abs(Math.sin(prop.x * 0.37 + prop.y * 0.73));
      const scale = prop.kind === "tree" ? 2.0 + seed * 0.5 : 1.55 + seed * 0.4;
      sprite.scale.set(scale);
      // 树木绕根部极轻微摇摆，静止画面也有风感
      sprite.rotation =
        prop.kind === "tree" ? Math.sin(input.time / 1100 + prop.x * 0.011) * 0.018 : 0;
      // 站在树后时树冠会盖住角色，靠近的遮挡物淡出，保证角色始终看得见
      const depth = prop.x + prop.y;
      const overMe =
        depth > meDepth + 2 &&
        Math.abs(screen.x - meScreen.x) < 58 &&
        meScreen.y - screen.y > -112 &&
        meScreen.y - screen.y < 16;
      const overLock =
        !!lockScreen &&
        depth > lockDepth + 2 &&
        Math.abs(screen.x - lockScreen.x) < 58 &&
        lockScreen.y - screen.y > -112 &&
        lockScreen.y - screen.y < 16;
      const wantAlpha = overMe || overLock ? 0.4 : 1;
      sprite.alpha += (wantAlpha - sprite.alpha) * 0.22;
      if (Math.abs(sprite.alpha - wantAlpha) < 0.01) sprite.alpha = wantAlpha;
      sprite.visible = true;
      // 树/石头下方的软阴影，把物件“钉”在地面上，不再像贴纸
      if (prop.kind === "tree") {
        const shadow = this.propShadow(index);
        shadow.position.set(screen.x, screen.y + 1);
        shadow.zIndex = depth - 0.5;
        shadow.scale.set(scale * 0.9);
        shadow.alpha = 0.55 * sprite.alpha;
        shadow.visible = true;
      } else {
        const shadow = this.propShadows[index];
        if (shadow) shadow.visible = false;
      }
      index += 1;
    }
    for (let i = index; i < this.propSprites.length; i += 1) {
      this.propSprites[i].visible = false;
    }
    for (let i = index; i < this.propShadows.length; i += 1) {
      this.propShadows[i].visible = false;
    }
  }

  private propShadow(index: number): Sprite {
    let sprite = this.propShadows[index];
    if (!sprite) {
      sprite = new Sprite(art.shadowTexture());
      sprite.anchor.set(0.5, 0.5);
      sprite.tint = 0x0b1a0f;
      this.propShadows.push(sprite);
      this.entityLayer.addChild(sprite);
    }
    return sprite;
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
      // 传送门文字抵消镜头缩放，拉远后依然容易辨认
      const portalInv = 1 / Math.max(0.1, this.zoom);
      view.icon.scale.set(portalInv);
      view.label.scale.set(portalInv);
      view.rings.alpha = locked ? 0.45 : 1;
      view.glow.visible = !locked;
      view.filter.color = locked ? 0x94a3b8 : 0x38bdf8;
      const pulse = 1 + Math.sin(input.time / 260) * 0.08;
      view.rings.clear();
      view.rings
        .poly(ringPoints(0, 0, 26 * pulse, 12 * pulse, 2.6))
        .fill({ color: locked ? 0x94a3b8 : 0x7dd3fc, alpha: 0.95 });
      view.rings
        .poly(ringPoints(0, -8, 18 * pulse, 8 * pulse, 2.2))
        .fill({ color: locked ? 0x94a3b8 : 0x38bdf8, alpha: 0.45 });
      // 门内的能量旋涡，让传送门不只是一圈贴地光环
      view.rings
        .ellipse(0, -8, 15 * pulse, 6.5 * pulse)
        .fill({ color: locked ? 0x64748b : 0x0ea5e9, alpha: 0.16 });
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
      // 呼吸式压缩（脚底不动），站着不动的 NPC 也有活人感
      const breathe = Math.sin(input.time / 620 + npc.x * 0.04) * 0.01;
      view.sprite.scale.set(NPC_SCALE * (1 - breathe), NPC_SCALE * (1 + breathe));
      // NPC 名字与任务标记同样抵消镜头缩放
      const inv = 1 / Math.max(0.1, this.zoom);
      view.name.scale.set(inv);
      view.marker.scale.set(inv);
      const questing = npc.quests.length > 0;
      // 有任务的 NPC 用金色高亮，普通村民用中性灰，村里名牌一眼分出主次
      const nameFill = questing ? "#fde68a" : "#cbd5e1";
      if (view.name.style.fill !== nameFill) view.name.style.fill = nameFill;
      // 走远后淡出 NPC 名字，避免村里多个名牌挤成一团
      const npcDist = Math.hypot(npc.x - input.meX, npc.y - input.meY);
      const farFade = Math.max(0, Math.min(1, (330 - npcDist) / 90));
      // 贴脸时浮动提示已显示名字，名牌适当让位，画面更干净
      const nearFade = Math.max(0.55, Math.min(1, (npcDist - 50) / 80));
      const nameAlpha = farFade * nearFade * (questing ? 1 : 0.82);
      view.name.alpha = nameAlpha;
      if (nameAlpha > 0.05) {
        this.pendingLabels.push({
          text: view.name,
          root: view.root,
          baseY: -46,
          priority: 3,
          marker: view.marker,
          markerBaseY: -60,
        });
      }
      view.marker.visible = questing;
      if (view.marker.visible) {
        view.marker.y = -60 + Math.sin(input.time / 240) * 3;
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
      const shadow = new Sprite(art.shadowTexture());
      shadow.anchor.set(0.5, 0.5);
      shadow.scale.set(0.7);
      shadow.alpha = 0.8;
      const sprite = new Sprite(art.npcTexture(color));
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(NPC_SCALE);
      const name = new Text({ text: "", style: textStyle(10, "#fde68a"), resolution: 2 });
      name.anchor.set(0.5, 1);
      name.y = -46;
      const marker = new Text({ text: "!", style: textStyle(12, "#facc15"), resolution: 2 });
      marker.anchor.set(0.5, 1);
      marker.x = 14;
      root.addChild(shadow, sprite, name, marker);
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
      // 金币显示数量；装备/道具走近时显示名字，恢复品显示回复量
      const dropDist = Math.hypot(drop.x - input.meX, drop.y - input.meY);
      const showGold = drop.kind === "gold" && !!drop.gold;
      const showName = drop.kind === "item" && !!drop.name && dropDist < 160;
      const showHeal = drop.kind === "heal" && drop.heal > 0 && dropDist < 160;
      view.label.visible = showGold || showName || showHeal;
      if (view.label.visible) {
        view.label.text = showGold
          ? `${drop.gold}`
          : showHeal
            ? `+${drop.heal}`
            : (drop.name ?? "");
        view.label.style.fill = showGold ? "#fde68a" : showHeal ? "#86efac" : "#bfdbfe";
        view.label.y = 16 + bob;
        view.label.scale.set(1 / Math.max(0.1, this.zoom));
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

  /** 普通攻击的刀光弧，跟随挥砍进度扫出，出手才有“挥”的感觉 */
  private renderMeleeArc(
    input: WorldRenderInput,
    toScreen: (x: number, y: number) => { x: number; y: number }
  ): void {
    if (!input.meSwingAt) return;
    const age = input.time - input.meSwingAt;
    if (age < 0 || age > 260) return;
    const p = age / 260;
    const pos = toScreen(input.meX, input.meY);
    const cx = pos.x + input.meDir * 8;
    const cy = pos.y - 36;
    const radius = 30 + Math.sin(Math.PI * p) * 8;
    const sweep = Math.min(1, p / 0.62);
    const from = -1.35;
    const to = from + 1.9 * sweep;
    const alpha = (1 - p) * 0.9;
    // 弧形刀光同样用填充带绘制：外圈柔光 + 内圈亮芯
    const a0 = input.meDir >= 0 ? from : Math.PI - to;
    const a1 = input.meDir >= 0 ? to : Math.PI - from;
    this.fx
      .poly(ringPoints(cx, cy, radius + 1.5, radius + 1.5, 5, a0, a1, 16))
      .fill({ color: 0xfef9c3, alpha: alpha * 0.35 });
    this.fx
      .poly(ringPoints(cx, cy, radius, radius, 2, a0, a1, 16))
      .fill({ color: 0xfde68a, alpha });
    const tipX = cx + Math.cos(a1) * radius;
    const tipY = cy + Math.sin(a1) * radius;
    this.fx.circle(tipX, tipY, 2.2).fill({ color: 0xfffbeb, alpha: Math.min(1, alpha * 1.2) });
  }

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
      // 起手 40% 时间内保持高亮，避免刚出现就淡到看不见
      const bold = Math.min(1, alpha * 1.7);
      const skillId = effect.skillId;

      // 远程技能：从施法者胸口画一道飞行轨迹，箭矢/法术弹道更直观
      if (effect.fx !== undefined && effect.fy !== undefined) {
        const origin = toScreen(effect.fx, effect.fy);
        const ox = origin.x;
        const oy = origin.y - 26;
        const tx = sx;
        const ty = screen.y - 18;
        const tone = FROST_SKILLS.has(skillId)
          ? 0x7dd3fc
          : FIRE_SKILLS.has(skillId)
            ? 0xfb923c
            : HEAL_SKILLS.has(skillId)
              ? 0x86efac
              : GOLD_SKILLS.has(skillId)
                ? 0xfde68a
                : 0xc4b5fd;
        this.fx
          .poly(lineQuad(ox, oy, tx, ty, 3.4 * (1 - progress) + 0.6))
          .fill({ color: tone, alpha: alpha * 0.5 });
        const t = Math.min(1, progress * 1.6);
        const bx = ox + (tx - ox) * t;
        const by = oy + (ty - oy) * t;
        this.fx.circle(bx, by, 6).fill({ color: tone, alpha: alpha * 0.32 });
        this.fx.circle(bx, by, 3.2).fill({ color: 0xffffff, alpha: bold });
      }

      if (skillId === "levelup") {
        // 升级：金色光柱 + 三层上升光环 + 顶部星光
        const pillarH = 88 + progress * 26;
        this.fx
          .poly([
            sx - 15,
            screen.y,
            sx + 15,
            screen.y,
            sx + 7,
            screen.y - pillarH,
            sx - 7,
            screen.y - pillarH,
          ])
          .fill({ color: 0xfde68a, alpha: alpha * 0.2 });
        for (let i = 0; i < 3; i += 1) {
          const rx = 16 + i * 7 + progress * 26;
          this.fx
            .poly(
              ringPoints(
                sx,
                screen.y - i * 15 - progress * 46,
                rx,
                rx * 0.45,
                2.6
              )
            )
            .fill({ color: 0xfde68a, alpha: alpha * (0.9 - i * 0.24) });
        }
        const starY = screen.y - pillarH;
        const starR = 7 + progress * 6;
        this.fx
          .poly([sx - starR, starY, sx, starY - 1.4, sx + starR, starY, sx, starY + 1.4])
          .fill({ color: 0xfef3c7, alpha });
        this.fx
          .poly([sx, starY - starR, sx + 1.4, starY, sx, starY + starR, sx - 1.4, starY])
          .fill({ color: 0xfef3c7, alpha });
      } else if (skillId === "boss_aoe") {
        // BOSS 范围预警：红色地面圈 + 外缘尖刺 + 中心十字
        const rx = 16 + progress * 108;
        this.fx.ellipse(sx, screen.y, rx, rx * 0.5).fill({ color: 0xef4444, alpha: alpha * 0.18 });
        this.fx.poly(ringPoints(sx, screen.y, rx, rx * 0.5, 5)).fill({ color: 0xf87171, alpha });
        this.fx
          .poly(ringPoints(sx, screen.y, rx * 0.55, rx * 0.28, 3))
          .fill({ color: 0xfca5a5, alpha: alpha * 0.5 });
        for (let i = 0; i < 12; i += 1) {
          const a = (i / 12) * Math.PI * 2 + progress;
          const px = sx + Math.cos(a) * rx;
          const py = screen.y + Math.sin(a) * rx * 0.5;
          const ox = Math.cos(a) * 9;
          const oy = Math.sin(a) * 5;
          this.fx
            .poly([
              px + ox * 1.6,
              py + oy * 1.6,
              px + Math.cos(a + 1.4) * 5,
              py + Math.sin(a + 1.4) * 3,
              px + Math.cos(a - 1.4) * 5,
              py + Math.sin(a - 1.4) * 3,
            ])
            .fill({ color: 0xf87171, alpha: alpha * 0.85 });
        }
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
        const ry = radius * 0.5;
        this.fx.ellipse(sx, screen.y, radius, ry).fill({ color, alpha: bold * 0.16 });
        // 白芯 + 彩色主环 + 内侧副环，叠出霓虹般的层次
        this.fx
          .poly(ringPoints(sx, screen.y, radius + 1.6, ry + 1.6, 2))
          .fill({ color: 0xffffff, alpha: bold * 0.75 });
        this.fx.poly(ringPoints(sx, screen.y, radius, ry, 5)).fill({ color, alpha: bold });
        this.fx
          .poly(ringPoints(sx, screen.y, radius * 0.62, ry * 0.62, 2.4))
          .fill({ color, alpha: bold * 0.6 });
        for (let i = 0; i < 10; i += 1) {
          const a = (i / 10) * Math.PI * 2 + progress * 1.6;
          this.fx
            .poly(
              tickQuad(
                sx,
                screen.y,
                a,
                radius * 0.78,
                radius + 5,
                i % 2 === 0 ? 3.6 : 2.2
              )
            )
            .fill({ color: i % 2 === 0 ? 0xffffff : color, alpha: bold * 0.95 });
        }
        if (skillId === "incinerate" || skillId === "tibbers") {
          // 火焰技能：圈内翻起几簇火舌
          for (let i = 0; i < 6; i += 1) {
            const fx0 = sx + Math.cos((i / 6) * Math.PI * 2 + progress * 0.8) * radius * 0.6;
            const fy0 = screen.y + Math.sin((i / 6) * Math.PI * 2 + progress * 0.8) * ry * 0.6;
            const h = 10 + Math.sin(progress * Math.PI) * 16 + (i % 2) * 5;
            this.fx
              .poly([fx0 - 4, fy0, fx0, fy0 - h, fx0 + 4, fy0])
              .fill({ color: 0xfbbf24, alpha: alpha * 0.8 });
            this.fx
              .poly([fx0 - 2, fy0, fx0, fy0 - h * 0.6, fx0 + 2, fy0])
              .fill({ color: 0xfef3c7, alpha: alpha * 0.7 });
          }
        } else if (skillId === "volley") {
          // 箭雨：外缘一圈小箭头向外扩散
          for (let i = 0; i < 10; i += 1) {
            const a = (i / 10) * Math.PI * 2 + progress;
            const px = sx + Math.cos(a) * radius;
            const py = screen.y + Math.sin(a) * ry;
            const ux = Math.cos(a) * 6;
            const uy = Math.sin(a) * 3;
            this.fx
              .poly([
                px + ux,
                py + uy,
                px + Math.cos(a + 2.2) * 5,
                py + Math.sin(a + 2.2) * 3,
                px + Math.cos(a - 2.2) * 5,
                py + Math.sin(a - 2.2) * 3,
              ])
              .fill({ color: 0xbbf7d0, alpha });
          }
        }
      } else if (DASH_SKILLS.has(skillId)) {
        // 位移：三道速度残影 + 落脚扬尘，颜色跟技能属性走
        const dashColor = skillId === "shadow_assault" ? 0xf87171 : 0x86efac;
        const dashCore = skillId === "shadow_assault" ? 0xfecaca : 0xd9f99d;
        for (let i = 0; i < 3; i += 1) {
          const off = i * 5 - 5;
          const w = 3 - i * 0.6;
          this.fx
            .poly(
              lineQuad(
                sx - 34 * (1 - progress) + off,
                screen.y + 9 + off * 0.4,
                sx + 16 + off,
                screen.y - 7 + off * 0.4,
                w
              )
            )
            .fill({ color: dashColor, alpha: bold * (0.9 - i * 0.24) });
        }
        this.fx
          .ellipse(sx + 10, screen.y - 4, 22 + progress * 10, 9 + progress * 4)
          .fill({ color: dashColor, alpha: 0.26 * bold });
        this.fx
          .poly(ringPoints(sx + 10, screen.y - 4, 20 + progress * 26, 9 + progress * 12, 2.4))
          .fill({ color: dashCore, alpha: bold * 0.7 });
      } else if (HEAL_SKILLS.has(skillId)) {
        const color = skillId === "wish" ? 0xf0abfc : 0x86efac;
        const soft = skillId === "wish" ? 0xfae8ff : 0xd9f99d;
        // 地面治疗圈
        this.fx
          .poly(ringPoints(sx, screen.y, 14 + progress * 26, 7 + progress * 13, 2.6))
          .fill({ color, alpha: alpha * 0.8 });
        this.fx
          .ellipse(sx, screen.y, 12 + progress * 22, 6 + progress * 11)
          .fill({ color, alpha: alpha * 0.1 });
        // 上升的治疗十字
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2 + progress * 2;
          const px = sx + Math.cos(a) * (10 + progress * 20);
          const py = screen.y - 8 - progress * 34 + Math.sin(a) * 5;
          const s = i % 2 === 0 ? 2.2 : 1.6;
          this.fx.rect(px - s, py - s * 3, s * 2, s * 6).fill({ color: soft, alpha });
          this.fx.rect(px - s * 3, py - s, s * 6, s * 2).fill({ color: soft, alpha });
        }
      } else if (EXECUTE_SKILLS.has(skillId)) {
        // 处决：金色交叉斩 + 冲击弧，抬到胸口高度更醒目
        const ey = screen.y - 26;
        const len = 26 + progress * 46;
        this.fx.circle(sx, ey, 10 + progress * 22).fill({ color: 0xfacc15, alpha: bold * 0.22 });
        for (const sign of [-1, 1]) {
          this.fx
            .poly(lineQuad(sx - len * sign, ey + len * 0.6, sx + len * sign, ey - len * 0.6, 6))
            .fill({ color: 0xfde68a, alpha: bold * 0.6 });
          this.fx
            .poly(lineQuad(sx - len * sign, ey + len * 0.6, sx + len * sign, ey - len * 0.6, 2.4))
            .fill({ color: 0xfffbeb, alpha: bold });
        }
        this.fx
          .poly(ringPoints(sx, ey, 12 + progress * 58, 12 + progress * 58, 4.5, -1.3, 0.9))
          .fill({ color: 0xfde68a, alpha: bold });
        this.fx.circle(sx, ey, 5 + progress * 14).fill({ color: 0xfef9c3, alpha: bold * 0.8 });
      } else if (FROST_SKILLS.has(skillId)) {
        // 冰霜：六根冰棱炸开 + 寒气环
        const fy = screen.y - 16;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + progress * 0.4;
          const r0 = 8 + progress * 14;
          const r1 = 18 + progress * 36;
          const bx = sx + Math.cos(a) * r0;
          const by = fy + Math.sin(a) * r0 * 0.55;
          const tx = sx + Math.cos(a) * r1;
          const ty = fy + Math.sin(a) * r1 * 0.55;
          const wx = Math.cos(a + Math.PI / 2) * 4;
          const wy = Math.sin(a + Math.PI / 2) * 2.2;
          this.fx.poly([tx, ty, bx + wx, by + wy, bx - wx, by - wy]).fill({
            color: 0x7dd3fc,
            alpha: bold * 0.9,
          });
          this.fx.poly([tx, ty, bx + wx * 0.5, by + wy * 0.5, bx - wx * 0.5, by - wy * 0.5]).fill({
            color: 0xe0f2fe,
            alpha: bold,
          });
        }
        this.fx
          .poly(ringPoints(sx, fy, 14 + progress * 30, 8 + progress * 16, 2.6))
          .fill({ color: 0xbae6fd, alpha: bold * 0.75 });
      } else {
        const color = GOLD_SKILLS.has(skillId) ? 0xfde68a : 0xa78bfa;
        const core = GOLD_SKILLS.has(skillId) ? 0xfef3c7 : 0xc4b5fd;
        // 通用法术：扩散法阵 + 旋转菱形符文
        const my = screen.y - 22;
        this.fx.poly(ringPoints(sx, my, 8 + progress * 42, 8 + progress * 42, 2.8)).fill({
          color,
          alpha: bold,
        });
        this.fx
          .circle(sx, my, 5 + progress * 20)
          .fill({ color: core, alpha: bold * 0.3 });
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + progress * 2.4;
          const r = 10 + progress * 34;
          const px = sx + Math.cos(a) * r;
          const py = my + Math.sin(a) * r * 0.6;
          this.fx
            .poly([px, py - 4.5, px + 3, py, px, py + 4.5, px - 3, py])
            .fill({ color: core, alpha: bold * 0.9 });
        }
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

    // 跑动时脚边间断扬起尘土，走路更有重量感（频次固定，不受帧率影响）
    if (input.meMoving && !input.meDead) {
      if (input.time - this.dustAt > 120) {
        this.dustAt = input.time;
        this.sparks.push({
          x: input.meX + (Math.random() - 0.5) * 12,
          y: input.meY - 2,
          vx: (Math.random() - 0.5) * 16,
          vy: -22 - Math.random() * 14,
          size: 2,
          color: 0x9aa387,
          life: 340,
          maxLife: 340,
        });
      }
    } else {
      this.dustAt = input.time;
    }

    for (const particle of input.particles) {
      const lifeRatio = Math.max(0, Math.min(1, particle.life / Math.max(1, particle.maxLife)));
      // 前 45% 生命保持全亮，避免伤害数字一出现就糊进地面
      const alpha = Math.min(1, lifeRatio / 0.55);
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
        // 伤害数字出场时轻微放大再回落，且抵消镜头缩放保持可读
        const pop = 1 + Math.max(0, lifeRatio - 0.72) * 1.8;
        text.scale.set(pop / Math.max(0.1, this.zoom));
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

  /** 屏幕空间的环境粒子：萤火/孢子/余烬，配合夜色调让场景有呼吸感 */
  private renderAmbient(input: WorldRenderInput): void {
    this.ambient.clear();
    const w = this.width;
    const h = this.height;
    if (this.motes.length === 0) {
      for (let i = 0; i < 26; i += 1) {
        this.motes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: 4 + Math.random() * 7,
          vy: -(3 + Math.random() * 6),
          size: Math.random() < 0.22 ? 2 : 1,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 0.8,
        });
      }
    }
    const palette: Record<string, number> = {
      overworld: 0xfde68a,
      forest: 0xbbf7d0,
      cave: 0xcbd5e1,
      volcano: 0xfdba74,
      ruins: 0xc4b5fd,
    };
    const color = palette[this.theme] ?? 0xfde68a;
    for (const mote of this.motes) {
      if (!this.frozenFrame) {
        mote.x += mote.vx * 0.016;
        mote.y += mote.vy * 0.016;
        if (mote.x > w + 10) mote.x = -10;
        if (mote.y < -10) mote.y = h + 10;
      }
      const flicker = 0.5 + 0.5 * Math.sin(input.time / 900 * mote.speed + mote.phase);
      this.ambient
        .circle(mote.x + Math.sin(input.time / 1500 + mote.phase) * 6, mote.y, mote.size)
        .fill({ color, alpha: 0.1 + flicker * 0.28 });
    }

    // 篝火火焰两帧轮播 + 光晕呼吸
    if (this.campfire?.visible) {
      const frames = art.campfireTextures();
      this.campfire.texture = frames[Math.floor(input.time / 150) % frames.length];
      if (this.campfireGlow) {
        this.campfireGlow.alpha =
          0.26 + Math.sin(input.time / 170) * 0.05 + Math.sin(input.time / 73) * 0.03;
      }
    }

    // 篝火余烬：小颗粒向上飘散，熄灭前带一点左右摆动
    if (input.room === "world" && input.time - this.lastEmberAt > 140) {
      this.lastEmberAt = input.time;
      const spawn = roomSpawn("world");
      this.sparks.push({
        x: spawn.x - 39 + (Math.random() - 0.5) * 14,
        y: spawn.y + 23 - 8 + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 12,
        vy: -16 - Math.random() * 12,
        life: 760,
        maxLife: 760,
        color: Math.random() < 0.5 ? 0xfbbf24 : 0xf97316,
        size: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

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
    if (!nearbyBoss) {
      this.bossHpShown = 1;
      return;
    }

    const barWidth = Math.min(280, this.width * 0.5);
    const x = (this.width - barWidth) / 2;
    const y = 104;
    const ratio = Math.max(0, Math.min(1, nearbyBoss.hp / Math.max(1, nearbyBoss.maxHp)));
    if (ratio > this.bossHpShown) this.bossHpShown = ratio;
    else {
      this.bossHpShown += (ratio - this.bossHpShown) * 0.08;
      if (this.bossHpShown - ratio < 0.004) this.bossHpShown = ratio;
    }
    this.bossBar.rect(x - 10, y - 22, barWidth + 20, 36).fill({ color: 0x08160d, alpha: 0.72 });
    this.bossBar.rect(x, y, barWidth, 8).fill({ color: 0x000000, alpha: 0.6 });
    if (this.bossHpShown > ratio + 0.002) {
      this.bossBar
        .rect(x + barWidth * ratio, y, barWidth * (this.bossHpShown - ratio), 8)
        .fill({ color: 0xfde68a, alpha: 0.6 });
    }
    this.bossBar
      .rect(x, y, barWidth * ratio, 8)
      .fill(0xe879f9);
    this.bossBar
      .rect(x, y - 1.5, barWidth, 1.5)
      .fill({ color: 0xe879f9, alpha: 0.5 });
    this.bossBar
      .rect(x, y + 8, barWidth, 1.5)
      .fill({ color: 0xe879f9, alpha: 0.35 });
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
    // 地上的战利品在小地图上留一个小点，回头捡东西不用满地图找
    for (const drop of input.snapshot?.drops ?? []) {
      ctx.fillStyle = drop.kind === "gold" ? "#fbbf24" : drop.kind === "item" ? "#60a5fa" : "#4ade80";
      ctx.fillRect((drop.x / TILE) * sx - 0.8, (drop.y / TILE) * sy - 0.8, 1.6, 1.6);
    }
    for (const monster of input.snapshot?.monsters ?? []) {
      const dx = monster.x - input.meX;
      const dy = monster.y - input.meY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // 只显示附近普通怪，Boss/精英常驻，避免小地图被红点铺满
      if (!monster.boss && !monster.elite && dist > TILE * 18) continue;
      ctx.globalAlpha = dist > TILE * 10 ? 0.45 : 0.9;
      ctx.fillStyle = monster.slow
        ? "#7dd3fc"
        : monster.boss
          ? "#e879f9"
          : monster.elite
            ? "#fbbf24"
            : "#f87171";
      const mx = (monster.x / TILE) * sx;
      const my = (monster.y / TILE) * sy;
      const mr = monster.boss ? 3 : monster.elite ? 2.4 : 1.8;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      // 当前锁定目标在小地图上加白圈，回头找怪更直观
      if (monster.id === input.targetId) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(248,250,252,0.92)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx, my, mr + 2.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const player of input.snapshot?.players ?? []) {
      if (player.id === input.meId) continue;
      // 队友按职业色显示，小地图上也能分清谁是奶谁是法师
      ctx.fillStyle = CLASS_AURA[player.classId] ?? "#60a5fa";
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

    // 视野框按真实镜头范围投影到小地图，缩放/靠近边界时也能对应
    const { x: camX, y: camY, w: camW, h: camH } = this.camRect;
    const toMap = (ix: number, iy: number): [number, number] => [
      ((iy + ix / 2) / TILE) * sx,
      ((iy - ix / 2) / TILE) * sy,
    ];
    const corners = [
      toMap(camX, camY),
      toMap(camX + camW, camY),
      toMap(camX + camW, camY + camH),
      toMap(camX, camY + camH),
    ];
    ctx.strokeStyle = "rgba(226,232,240,0.32)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (let i = 1; i < corners.length; i += 1) ctx.lineTo(corners[i][0], corners[i][1]);
    ctx.closePath();
    ctx.stroke();

    this.minimapTexture.source.update();
    this.minimapSprite.position.set(x, y);
    this.minimapSprite.scale.set(display / size);
    this.minimapSprite.visible = true;
    this.minimapBack.clear();
    this.minimapBack
      .roundRect(x - 5, y - 5, display + 10, display + 10, 7)
      .fill({ color: 0x070d14, alpha: 0.84 });
    this.minimapBorder.clear();
    // 用四条细矩形代替描边，兼容 stroke 不渲染的环境
    this.minimapBorder.rect(x, y - 1, display, 1).fill({ color: 0x94a3b8, alpha: 0.32 });
    this.minimapBorder
      .rect(x, y + display, display, 1)
      .fill({ color: 0x94a3b8, alpha: 0.32 });
    this.minimapBorder.rect(x - 1, y, 1, display).fill({ color: 0x94a3b8, alpha: 0.32 });
    this.minimapBorder
      .rect(x + display, y, 1, display)
      .fill({ color: 0x94a3b8, alpha: 0.32 });
  }
}

function terrainKind(
  tx: number,
  ty: number,
  room: RoomId
): "grass" | "tree" | "water" | "rock" | "flower" {
  return terrainAt(tx, ty, room);
}
