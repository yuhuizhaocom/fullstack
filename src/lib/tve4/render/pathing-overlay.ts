import { RENDER_SCALE_DIVISOR } from "./geometry";

export interface PathingOverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PathingOverlay {
  rects: PathingOverlayRect[];
  blockedCells: number;
}

/** Merge horizontally adjacent blocked WPM cells into render-only rectangles. */
export function buildPathingOverlay(
  data: Uint8Array,
  width: number,
  height: number,
  cellUnits: number,
  origin: readonly [number, number],
  bounds: readonly [number, number, number, number],
): PathingOverlay {
  if (data.length !== width * height) throw new Error(`WPM 数据尺寸不符: ${data.length}`);
  const startX = Math.max(0, Math.ceil((bounds[0] - origin[0]) / cellUnits));
  const endX = Math.min(width, Math.ceil((bounds[2] - origin[0]) / cellUnits));
  const startY = Math.max(0, Math.ceil((bounds[1] - origin[1]) / cellUnits));
  const endY = Math.min(height, Math.ceil((bounds[3] - origin[1]) / cellUnits));
  const webCell = cellUnits / RENDER_SCALE_DIVISOR;
  const rects: PathingOverlayRect[] = [];
  let blockedCells = 0;

  for (let gy = startY; gy < endY; gy += 1) {
    let runStart = -1;
    for (let gx = startX; gx <= endX; gx += 1) {
      const blocked = gx < endX && (data[gy * width + gx] & 0x02) !== 0;
      if (blocked && runStart < 0) runStart = gx;
      if (!blocked && runStart >= 0) {
        const sourceX = runStart * cellUnits + origin[0] - bounds[0];
        rects.push({
          x: sourceX / RENDER_SCALE_DIVISOR,
          y: (gy * cellUnits + origin[1] - bounds[1]) / RENDER_SCALE_DIVISOR,
          width: (gx - runStart) * webCell,
          height: webCell,
        });
        blockedCells += gx - runStart;
        runStart = -1;
      }
    }
  }
  return { rects, blockedCells };
}