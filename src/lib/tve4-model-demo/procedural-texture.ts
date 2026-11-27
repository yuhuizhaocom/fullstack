export interface ProceduralPalette {
  id: string;
  label: string;
  colors: [string, string, string, string];
}

export interface GeneratedTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export const PROCEDURAL_PALETTES: Record<string, ProceduralPalette[]> = {
  "dark-troll": [
    { id: "troll-jade", label: "翡翠部落", colors: ["#3f8f7a", "#22564f", "#9b5c35", "#d8b46a"] },
    { id: "troll-ember", label: "赤焰部落", colors: ["#a64b3f", "#632b2a", "#3d7f78", "#e0a45c"] },
    { id: "troll-frost", label: "霜寒部落", colors: ["#6b9aa0", "#3b6570", "#6b4b8a", "#d7e6df"] },
  ],
  "high-elf": [
    { id: "elf-azure", label: "蓝白旅装", colors: ["#e8c9a0", "#b68c69", "#3f6fa8", "#d9e6ef"] },
    { id: "elf-gold", label: "金叶礼服", colors: ["#efd2aa", "#b98e62", "#b8862f", "#f5e6b5"] },
    { id: "elf-moon", label: "月影紫袍", colors: ["#d8c3a5", "#9d7b68", "#5b4a82", "#b9c9e6"] },
  ],
};

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function noise(x: number, y: number, seed: number): number {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function generateProceduralTexture(palette: ProceduralPalette, size = 128): GeneratedTexture {
  const width = Math.max(1, Math.floor(size));
  const height = width;
  const data = new Uint8ClampedArray(width * height * 4);
  const colors = palette.colors.map(hexToRgb);
  const seed = hash(palette.id);
  const phase = (seed % 1000) / 97;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;
      const field =
        Math.sin(u * Math.PI * 3 + phase) * 0.55 +
        Math.cos(v * Math.PI * 4 - phase * 0.7) * 0.45 +
        Math.sin((u + v) * Math.PI * 5 + phase * 1.3) * 0.35;
      const grain = noise(x, y, seed);
      let color = colors[0];
      if (field < -0.72) color = colors[1];
      else if (field > 0.78) color = colors[2];
      else if (field > 0.42 && grain > 0.72) color = colors[3];

      const weave = Math.sin((u * 0.85 + v * 0.15) * Math.PI * 28) * 0.025;
      const shade = 0.92 + grain * 0.12 + weave;
      const offset = (y * width + x) * 4;
      data[offset] = color[0] * 255 * shade;
      data[offset + 1] = color[1] * 255 * shade;
      data[offset + 2] = color[2] * 255 * shade;
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}
