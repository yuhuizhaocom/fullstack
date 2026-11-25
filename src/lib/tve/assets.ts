// 贴图加载：从 public 读取 AI 生成的素材，并把纯白背景抠成透明、裁掉空白边。

export interface TveAssets {
  terrain: {
    grass: HTMLImageElement | null;
    dirt: HTMLImageElement | null;
  };
  /** 已抠图并裁剪的精灵，key 见 SPRITE_FILES */
  sprites: Record<string, HTMLCanvasElement>;
  loaded: number;
  total: number;
}

export const SPRITE_FILES: Record<string, string> = {
  troll: "/tve-assets/units/troll.jpg",
  villager: "/tve-assets/units/elf-villager.jpg",
  tree: "/tve-assets/buildings/tree-of-life.jpg",
  mine: "/tve-assets/buildings/gold-mine.jpg",
  wall: "/tve-assets/buildings/wall.jpg",
  arrow: "/tve-assets/buildings/arrow-tower.jpg",
  magic: "/tve-assets/buildings/magic-tower.jpg",
  propTree: "/tve-assets/props/tree.jpg",
  propRock: "/tve-assets/props/rock.jpg",
};

export const UI_IMAGES = {
  cover: "/tve-assets/ui/cover.jpg",
  troll: "/tve-assets/ui/portrait-troll.jpg",
  elf: "/tve-assets/ui/portrait-elf.jpg",
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
    img.src = src;
  });
}

/** 从四角做洪水填充去掉连成一片的白色背景，并裁掉透明边 */
function keyAndTrim(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const px = imageData.data;

  const isWhite = (idx: number) => {
    const o = idx * 4;
    return px[o] > 216 && px[o + 1] > 216 && px[o + 2] > 216;
  };

  const mask = new Uint8Array(w * h);
  const stack: number[] = [0, w - 1, (h - 1) * w, w * h - 1];
  let removed = 0;
  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (idx < 0 || idx >= w * h || mask[idx]) continue;
    mask[idx] = 1;
    if (!isWhite(idx)) continue;
    removed++;
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }

  const ratio = removed / (w * h);
  // 角色类素材主体通常只占很小一块，白底占比可能超过 92%，因此上限放到 98.5%
  const shouldKey = ratio > 0.05 && ratio < 0.985;
  if (shouldKey) {
    const alphaBefore = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alphaBefore[i] = px[i * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      if (mask[i] && isWhite(i)) px[i * 4 + 3] = 0;
    }
    // 边缘羽化：贴着透明区的近白像素按白度快速衰减，消除 JPG 压缩留下的白边
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (alphaBefore[i] < 20) continue;
        const left = x > 0 ? alphaBefore[i - 1] : 0;
        const right = x < w - 1 ? alphaBefore[i + 1] : 0;
        const up = y > 0 ? alphaBefore[i - w] : 0;
        const down = y < h - 1 ? alphaBefore[i + w] : 0;
        if (left !== 0 && right !== 0 && up !== 0 && down !== 0) continue;
        const o = i * 4;
        const whiteness = Math.min(px[o], px[o + 1], px[o + 2]);
        const fade = Math.max(0, Math.min(1, (255 - whiteness) / 70));
        px[o + 3] = Math.round(px[o + 3] * fade);
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  if (!shouldKey) return canvas;

  // 裁剪空白边
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return canvas;

  const pad = 3;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const trimmed = document.createElement("canvas");
  trimmed.width = tw;
  trimmed.height = th;
  const tctx = trimmed.getContext("2d");
  if (tctx) tctx.drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
  return trimmed;
}

export async function loadTveAssets(onProgress?: (loaded: number, total: number) => void): Promise<TveAssets> {
  const spriteKeys = Object.keys(SPRITE_FILES);
  const total = spriteKeys.length + 2;
  let loaded = 0;
  const progress = () => {
    loaded++;
    onProgress?.(loaded, total);
  };

  const grassPromise = loadImage("/tve-assets/terrain/grass.jpg")
    .then((img) => {
      progress();
      return img;
    })
    .catch(() => {
      progress();
      return null;
    });
  const dirtPromise = loadImage("/tve-assets/terrain/dirt.jpg")
    .then((img) => {
      progress();
      return img;
    })
    .catch(() => {
      progress();
      return null;
    });

  const spriteEntries = await Promise.all(
    spriteKeys.map(async (key) => {
      try {
        const img = await loadImage(SPRITE_FILES[key]);
        const canvas = keyAndTrim(img);
        progress();
        return [key, canvas] as const;
      } catch {
        progress();
        return [key, null] as const;
      }
    }),
  );

  const sprites: Record<string, HTMLCanvasElement> = {};
  for (const [key, canvas] of spriteEntries) {
    if (canvas) sprites[key] = canvas;
  }

  const [grass, dirt] = await Promise.all([grassPromise, dirtPromise]);

  return {
    terrain: { grass, dirt },
    sprites,
    loaded,
    total,
  };
}
