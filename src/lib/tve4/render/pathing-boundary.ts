import { RENDER_SCALE_DIVISOR } from "./geometry";

export interface PathingBoundarySegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Outline only the edges where source WPM changes between blocked and walkable. */
export function buildPathingBoundarySegments(
  data: Uint8Array,
  width: number,
  height: number,
  cellUnits: number,
  origin: readonly [number, number],
  bounds: readonly [number, number, number, number],
): PathingBoundarySegment[] {
  if (data.length !== width * height) throw new Error(`WPM 数据尺寸不符: ${data.length}`);
  const startX = Math.max(0, Math.ceil((bounds[0] - origin[0]) / cellUnits));
  const endX = Math.min(width, Math.floor((bounds[2] - origin[0]) / cellUnits));
  const startY = Math.max(0, Math.ceil((bounds[1] - origin[1]) / cellUnits));
  const endY = Math.min(height, Math.floor((bounds[3] - origin[1]) / cellUnits));
  const segments: PathingBoundarySegment[] = [];
  const blocked = (gx: number, gy: number) => (data[gy * width + gx] & 0x02) !== 0;
  const inside = (gx: number, gy: number) => gx >= startX && gx < endX && gy >= startY && gy < endY;
  const push = (sx1: number, sy1: number, sx2: number, sy2: number) => {
    segments.push({
      x1: (sx1 - bounds[0]) / RENDER_SCALE_DIVISOR,
      y1: (sy1 - bounds[1]) / RENDER_SCALE_DIVISOR,
      x2: (sx2 - bounds[0]) / RENDER_SCALE_DIVISOR,
      y2: (sy2 - bounds[1]) / RENDER_SCALE_DIVISOR,
    });
  };

  for (let gy = startY; gy < endY; gy += 1) {
    for (let gx = startX; gx < endX; gx += 1) {
      if (!blocked(gx, gy)) continue;
      const x = gx * cellUnits + origin[0];
      const y = gy * cellUnits + origin[1];
      if (inside(gx, gy - 1) && !blocked(gx, gy - 1)) push(x, y, x + cellUnits, y);
      if (inside(gx, gy + 1) && !blocked(gx, gy + 1)) push(x, y + cellUnits, x + cellUnits, y + cellUnits);
      if (inside(gx - 1, gy) && !blocked(gx - 1, gy)) push(x, y, x, y + cellUnits);
      if (inside(gx + 1, gy) && !blocked(gx + 1, gy)) push(x + cellUnits, y, x + cellUnits, y + cellUnits);
    }
  }
  return segments;
}