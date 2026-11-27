import { mat4, quat, vec3, vec4 } from "gl-matrix";
import { ModelRenderer, parseMDX, type model } from "war3-model";

import { decodeBlpMipmaps } from "../../tve4-model-demo/blp";
import { disposeRenderer } from "../../tve4-model-demo/dispose";
import type { ModelDemoEntry } from "../../tve4-model-demo/manifest";
import { advanceFrame } from "../../tve4-model-demo/playback";

/** Small transparent MDX renderer used only for the player's hero overlay. */
export class HeroModelViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  private readonly resizeObserver: ResizeObserver;
  private readonly textureCache = new Map<string, ImageData[]>();
  private renderer: ModelRenderer | null = null;
  private model: model.Model | null = null;
  private entry: ModelDemoEntry | null = null;
  private raf = 0;
  private loadToken = 0;
  private lastTimestamp = 0;
  private sequenceIndex = 0;
  private frame = 0;
  private playing = true;
  private speed = 1;
  private center = vec3.create();
  private modelScale = 1;
  private anchorGroundY = 0;
  private anchorTopY = 0;
  private cameraPhi = -Math.PI / 2;
  private cameraTheta = 0.24;
  private cameraDistance = 360;
  private yaw = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: true })
      ?? canvas.getContext("webgl", { alpha: true, antialias: true });
    if (!gl) throw new Error("无法创建英雄模型 WebGL 上下文");
    this.gl = gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  get ready(): boolean {
    return Boolean(this.renderer && this.model);
  }

  getAnchorMetrics(): { groundY: number; topY: number } {
    return { groundY: this.anchorGroundY, topY: this.anchorTopY };
  }

  async load(entry: ModelDemoEntry): Promise<void> {
    const token = ++this.loadToken;
    this.stopLoop();
    disposeRenderer(this.renderer);
    this.renderer = null;
    this.model = null;
    this.entry = entry;
    this.textureCache.clear();
    try {
      const response = await fetch(entry.modelUrl);
      if (!response.ok) throw new Error(`模型请求失败：HTTP ${response.status}`);
      const parsed = parseMDX(await response.arrayBuffer());
      if (token !== this.loadToken) return;
      this.model = parsed;
      const renderer = new ModelRenderer(parsed);
      renderer.initGL(this.gl);
      this.renderer = renderer;
      this.fitCamera(parsed);
      await this.preloadTextures(entry, token);
      if (token !== this.loadToken) return;
      this.applyTextures();
      this.setSequence(entry.actions.stand?.index ?? 0);
      this.startLoop();
    } catch (error) {
      if (token !== this.loadToken) return;
      disposeRenderer(this.renderer);
      this.renderer = null;
      this.model = null;
      throw error;
    }
  }

  setSequence(index: number): void {
    if (!this.renderer || !this.entry) return;
    const sequence = this.entry.sequences[index];
    if (!sequence) return;
    this.sequenceIndex = index;
    this.frame = sequence.start;
    this.renderer.setSequence(index);
    this.renderer.setFrame(this.frame);
    this.renderer.update(0);
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  setTeamColor(color: readonly [number, number, number]): void {
    this.renderer?.setTeamColor(vec3.fromValues(color[0], color[1], color[2]));
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
  }

  destroy(): void {
    this.loadToken += 1;
    this.stopLoop();
    this.resizeObserver.disconnect();
    disposeRenderer(this.renderer);
    this.renderer = null;
    this.model = null;
    this.entry = null;
    this.textureCache.clear();
  }

  private fitCamera(parsed: model.Model): void {
    const min = parsed.Info.MinimumExtent;
    const max = parsed.Info.MaximumExtent;
    vec3.set(this.center, (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
    this.modelScale = 180 / size;
    this.updateAnchorMetrics(parsed);
  }

  private updateAnchorMetrics(parsed: model.Model): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const projection = mat4.create();
    const view = mat4.create();
    mat4.perspective(projection, Math.PI / 4, width / Math.max(1, height), 0.1, 5000);
    const eye = vec3.create();
    vec3.set(
      eye,
      this.center[0] + Math.cos(this.cameraTheta) * Math.cos(this.cameraPhi) * this.cameraDistance,
      this.center[1] + Math.cos(this.cameraTheta) * Math.sin(this.cameraPhi) * this.cameraDistance,
      this.center[2] + Math.sin(this.cameraTheta) * this.cameraDistance,
    );
    mat4.lookAt(view, eye, this.center, [0, 0, 1]);
    mat4.translate(view, view, [-this.center[0], -this.center[1], -this.center[2]]);
    mat4.rotateZ(view, view, this.yaw);
    mat4.scale(view, view, [this.modelScale, this.modelScale, this.modelScale]);
    const min = parsed.Info.MinimumExtent;
    const max = parsed.Info.MaximumExtent;
    const ground = projectPoint(this.center[0], this.center[1], min[2], view, projection, width, height);
    const top = projectPoint(this.center[0], this.center[1], max[2], view, projection, width, height);
    this.anchorGroundY = (ground.y - height / 2) / height;
    this.anchorTopY = (top.y - height / 2) / height;
  }

  private async preloadTextures(entry: ModelDemoEntry, token: number): Promise<void> {
    const available = entry.textures.filter((texture) => texture.status === "available" && texture.url);
    await Promise.allSettled(available.map(async (texture) => {
      const response = await fetch(texture.url!);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (token !== this.loadToken) return;
      if (texture.url!.toLowerCase().endsWith(".png")) {
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建贴图上下文");
        context.drawImage(bitmap, 0, 0);
        this.textureCache.set(texture.image, [context.getImageData(0, 0, bitmap.width, bitmap.height)]);
        bitmap.close();
        return;
      }
      const mips = decodeBlpMipmaps(await response.arrayBuffer()).map((mip) =>
        new ImageData(new Uint8ClampedArray(mip.data), mip.width, mip.height),
      );
      this.textureCache.set(texture.image, mips);
    }));
  }

  private applyTextures(): void {
    if (!this.renderer || !this.model) return;
    const placeholder = new ImageData(new Uint8ClampedArray([190, 190, 190, 255]), 1, 1);
    for (const texture of this.model.Textures) {
      if (!texture.Image) continue;
      this.renderer.setTextureImageData(texture.Image, this.textureCache.get(texture.Image) ?? [placeholder]);
    }
  }

  private startLoop(): void {
    this.lastTimestamp = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly tick = (timestamp: number): void => {
    const delta = this.lastTimestamp ? Math.min(100, timestamp - this.lastTimestamp) : 0;
    this.lastTimestamp = timestamp;
    const sequence = this.entry?.sequences[this.sequenceIndex];
    if (this.renderer && sequence) {
      if (this.playing) {
        const next = advanceFrame(this.frame, delta, this.speed, sequence);
        this.frame = next.frame;
        if (next.ended) this.playing = false;
      }
      this.renderer.setFrame(this.frame);
      this.renderer.update(0);
      this.draw();
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(): void {
    if (!this.renderer || !this.model) return;
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const projection = mat4.create();
    const view = mat4.create();
    mat4.perspective(projection, Math.PI / 4, width / Math.max(1, height), 0.1, 5000);
    const eye = vec3.create();
    vec3.set(
      eye,
      this.center[0] + Math.cos(this.cameraTheta) * Math.cos(this.cameraPhi) * this.cameraDistance,
      this.center[1] + Math.cos(this.cameraTheta) * Math.sin(this.cameraPhi) * this.cameraDistance,
      this.center[2] + Math.sin(this.cameraTheta) * this.cameraDistance,
    );
    mat4.lookAt(view, eye, this.center, [0, 0, 1]);
    mat4.translate(view, view, [-this.center[0], -this.center[1], -this.center[2]]);
    mat4.rotateZ(view, view, this.yaw);
    mat4.scale(view, view, [this.modelScale, this.modelScale, this.modelScale]);
    this.renderer.setCamera(eye, this.cameraQuaternion(eye, this.center));
    this.renderer.setLightPosition([this.center[0] + 220, this.center[1] - 160, this.center[2] + 320]);
    this.renderer.setLightColor([1, 1, 1]);
    this.renderer.render(view, projection, { wireframe: false, env: false, useEnvironmentMap: false });
  }

  private cameraQuaternion(position: vec3, target: vec3): quat {
    const projected = vec3.fromValues(position[0], position[1], 0);
    const direction = vec3.create();
    vec3.subtract(direction, position, target);
    vec3.normalize(projected, projected);
    vec3.normalize(direction, direction);
    const result = quat.create();
    const vertical = quat.create();
    quat.rotationTo(result, [1, 0, 0], projected);
    quat.rotationTo(vertical, projected, direction);
    quat.mul(result, vertical, result);
    return result;
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      if (this.model) this.updateAnchorMetrics(this.model);
    }
  }
}

function projectPoint(
  x: number,
  y: number,
  z: number,
  view: mat4,
  projection: mat4,
  width: number,
  height: number,
): { x: number; y: number } {
  const clip = vec4.create();
  vec4.set(clip, x, y, z, 1);
  vec4.transformMat4(clip, clip, view);
  vec4.transformMat4(clip, clip, projection);
  const inverseW = 1 / clip[3];
  return {
    x: (clip[0] * inverseW * 0.5 + 0.5) * width,
    y: (-clip[1] * inverseW * 0.5 + 0.5) * height,
  };
}