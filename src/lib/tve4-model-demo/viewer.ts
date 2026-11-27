import { mat4, quat, vec3 } from "gl-matrix";
import { ModelRenderer, parseMDX, type model } from "war3-model";

import { decodeBlpMipmaps } from "./blp";

import type { ManifestSequence, ModelDemoEntry } from "./manifest";
import { disposeRenderer } from "./dispose";
import { advanceFrame, clampFrame } from "./playback";
import { generateProceduralTexture, type ProceduralPalette } from "./procedural-texture";

export interface ViewerSnapshot {
  ready: boolean;
  modelId: string | null;
  sequenceIndex: number;
  sequenceName: string;
  frame: number;
  duration: number;
  playing: boolean;
  speed: number;
  fps: number;
  loadedTextures: number;
  availableTextures: number;
  missingTextures: number;
  textureEnabled: boolean;
  procedural: boolean;
  wireframe: boolean;
  showSkeleton: boolean;
  error: string;
}

type Listener = (snapshot: ViewerSnapshot) => void;

export class War3ModelViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly onSnapshot: Listener;
  private readonly resizeObserver: ResizeObserver;
  private readonly textureCache = new Map<string, ImageData[]>();
  private renderer: ModelRenderer | null = null;
  private model: model.Model | null = null;
  private entry: ModelDemoEntry | null = null;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private raf = 0;
  private loadToken = 0;
  private lastTimestamp = 0;
  private statsTimestamp = 0;
  private statsFrames = 0;
  private fps = 0;
  private sequenceIndex = 0;
  private frame = 0;
  private playing = true;
  private speed = 1;
  private textureEnabled = true;
  private proceduralPalette: ProceduralPalette | null = null;
  private wireframe = false;
  private showSkeleton = false;
  private loadedTextures = 0;
  private error = "";
  private ready = false;
  private cameraPhi = -Math.PI / 2;
  private cameraTheta = 0.24;
  private cameraDistance = 360;
  private center = vec3.create();
  private modelScale = 1;
  private pointerId: number | null = null;
  private pointerX = 0;
  private pointerY = 0;

  constructor(canvas: HTMLCanvasElement, onSnapshot: Listener) {
    this.canvas = canvas;
    this.onSnapshot = onSnapshot;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.resize();
  }

  async load(entry: ModelDemoEntry): Promise<void> {
    const token = ++this.loadToken;
    this.stopLoop();
    disposeRenderer(this.renderer);
    this.renderer = null;
    this.model = null;
    this.entry = entry;
    this.ready = false;
    this.error = "";
    this.loadedTextures = 0;
    this.textureCache.clear();
    this.emit();

    try {
      const response = await fetch(entry.modelUrl);
      if (!response.ok) throw new Error(`模型请求失败：HTTP ${response.status}`);
      const model = parseMDX(await response.arrayBuffer());
      if (token !== this.loadToken) return;

      this.model = model;
      const gl = this.canvas.getContext("webgl2") ?? this.canvas.getContext("webgl");
      if (!gl) throw new Error("当前浏览器无法创建 WebGL 上下文");
      this.gl = gl;
      gl.clearColor(0.035, 0.05, 0.065, 1);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);

      const renderer = new ModelRenderer(model);
      renderer.initGL(gl);
      this.renderer = renderer;
      this.fitCamera(model);
      await this.preloadTextures(entry, token);
      if (token !== this.loadToken) return;
      this.applyTextures();
      const initial = entry.actions.stand?.index ?? 0;
      this.setSequence(initial);
      this.ready = true;
      this.startLoop();
      this.emit();
    } catch (error) {
      if (token !== this.loadToken) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.emit();
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
    this.emit();
  }

  setFrame(frame: number): void {
    const sequence = this.currentSequence();
    if (!this.renderer || !sequence) return;
    this.frame = clampFrame(frame, sequence);
    this.renderer.setFrame(this.frame);
    this.renderer.update(0);
    this.emit();
  }

  setPlaying(playing: boolean): void {
    if (playing && this.currentSequence()?.nonLooping && this.frame >= this.currentSequence()!.end) {
      this.frame = this.currentSequence()!.start;
    }
    this.playing = playing;
    this.emit();
  }

  togglePlaying(): void {
    this.setPlaying(!this.playing);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.emit();
  }

  setTextureEnabled(enabled: boolean): void {
    this.textureEnabled = enabled;
    this.applyTextures();
    this.emit();
  }

  setProceduralPalette(palette: ProceduralPalette | null): void {
    this.proceduralPalette = palette;
    this.applyTextures();
    this.emit();
  }

  setTeamColor(color: readonly [number, number, number]): void {
    this.renderer?.setTeamColor(vec3.fromValues(color[0], color[1], color[2]));
  }

  setWireframe(enabled: boolean): void {
    this.wireframe = enabled;
    this.emit();
  }

  setShowSkeleton(enabled: boolean): void {
    this.showSkeleton = enabled;
    this.emit();
  }

  resetCamera(): void {
    this.cameraPhi = -Math.PI / 2;
    this.cameraTheta = 0.24;
    this.cameraDistance = 360;
  }

  getSnapshot(): ViewerSnapshot {
    const sequence = this.currentSequence();
    const textures = this.entry?.textures.filter((texture) => texture.status !== "replaceable") ?? [];
    return {
      ready: this.ready,
      modelId: this.entry?.id ?? null,
      sequenceIndex: this.sequenceIndex,
      sequenceName: sequence?.name ?? "",
      frame: this.frame,
      duration: sequence ? sequence.end - sequence.start : 0,
      playing: this.playing,
      speed: this.speed,
      fps: this.fps,
      loadedTextures: this.loadedTextures,
      availableTextures: textures.filter((texture) => texture.status === "available").length,
      missingTextures: textures.filter((texture) => texture.status === "missing").length,
      textureEnabled: this.textureEnabled,
      procedural: this.textureEnabled && this.proceduralPalette !== null,
      wireframe: this.wireframe,
      showSkeleton: this.showSkeleton,
      error: this.error,
    };
  }

  destroy(): void {
    this.loadToken += 1;
    this.stopLoop();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    disposeRenderer(this.renderer);
    this.renderer = null;
    this.model = null;
  }

  private currentSequence(): ManifestSequence | null {
    return this.entry?.sequences[this.sequenceIndex] ?? null;
  }

  private fitCamera(model: model.Model): void {
    const min = model.Info.MinimumExtent;
    const max = model.Info.MaximumExtent;
    vec3.set(this.center, (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
    this.modelScale = 180 / size;
  }

  private async preloadTextures(entry: ModelDemoEntry, token: number): Promise<void> {
    const available = entry.textures.filter((texture) => texture.status === "available" && texture.url);
    const results = await Promise.allSettled(
      available.map(async (texture) => {
        const response = await fetch(texture.url!);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (texture.url!.toLowerCase().endsWith(".png")) {
          const bitmap = await createImageBitmap(await response.blob());
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("无法创建 2D 贴图上下文");
          context.drawImage(bitmap, 0, 0);
          const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
          bitmap.close();
          this.textureCache.set(texture.image, [imageData]);
          return;
        }
        const mips = decodeBlpMipmaps(await response.arrayBuffer()).map((mip) =>
          new ImageData(new Uint8ClampedArray(mip.data), mip.width, mip.height),
        );
        this.textureCache.set(texture.image, mips);
      }),
    );
    if (token !== this.loadToken) return;
    const failures = results.flatMap((result, index) =>
      result.status === "rejected" ? [`${available[index].image}: ${String(result.reason)}`] : [],
    );
    if (failures.length > 0) this.error = failures.join("；");
  }

  private applyTextures(): void {
    if (!this.renderer || !this.model) return;
    const placeholder = new ImageData(new Uint8ClampedArray([190, 190, 190, 255]), 1, 1);
    const baseTexture = this.model.Textures.find((texture) => texture.Image && texture.ReplaceableId === 0);
    const procedural = this.proceduralPalette && baseTexture
      ? generateProceduralTexture(this.proceduralPalette)
      : null;
    const proceduralImage = procedural
      ? new ImageData(new Uint8ClampedArray(procedural.data), procedural.width, procedural.height)
      : null;
    this.loadedTextures = 0;
    for (const texture of this.model.Textures) {
      if (!texture.Image) continue;
      const cached = this.textureEnabled ? this.textureCache.get(texture.Image) : undefined;
      if (cached) {
        this.renderer.setTextureImageData(texture.Image, cached);
        this.loadedTextures += 1;
      } else if (this.textureEnabled && proceduralImage && texture.Image === baseTexture?.Image) {
        this.renderer.setTextureImageData(texture.Image, [proceduralImage]);
      } else {
        this.renderer.setTextureImageData(texture.Image, [placeholder]);
      }
    }
  }

  private startLoop(): void {
    this.lastTimestamp = 0;
    this.statsTimestamp = 0;
    this.statsFrames = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly tick = (timestamp: number): void => {
    const delta = this.lastTimestamp ? Math.min(100, timestamp - this.lastTimestamp) : 0;
    this.lastTimestamp = timestamp;
    const sequence = this.currentSequence();
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

    this.statsFrames += 1;
    if (!this.statsTimestamp) this.statsTimestamp = timestamp;
    if (timestamp - this.statsTimestamp >= 500) {
      this.fps = Math.round((this.statsFrames * 1000) / (timestamp - this.statsTimestamp));
      this.statsFrames = 0;
      this.statsTimestamp = timestamp;
      this.emit();
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(): void {
    if (!this.renderer || !this.gl || !this.model) return;
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
    mat4.scale(view, view, [this.modelScale, this.modelScale, this.modelScale]);

    const cameraQuat = this.cameraQuaternion(eye, this.center);
    this.renderer.setCamera(eye, cameraQuat);
    this.renderer.setLightPosition([this.center[0] + 220, this.center[1] - 160, this.center[2] + 320]);
    this.renderer.setLightColor([1, 1, 1]);
    this.renderer.render(view, projection, {
      wireframe: this.wireframe,
      env: false,
      useEnvironmentMap: false,
    });
    if (this.showSkeleton) this.renderer.renderSkeleton(view, projection, null);
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
    }
  }

  private emit(): void {
    this.onSnapshot(this.getSnapshot());
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerId = event.pointerId;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.cameraPhi -= (event.clientX - this.pointerX) * 0.008;
    this.cameraTheta = Math.max(-1.2, Math.min(1.2, this.cameraTheta + (event.clientY - this.pointerY) * 0.008));
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.cameraDistance = Math.max(180, Math.min(900, this.cameraDistance * (1 + event.deltaY * 0.001)));
  };
}
