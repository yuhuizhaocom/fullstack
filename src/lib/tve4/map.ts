// tve4 显式地图元素。所有房间/入口/窄口均为手工声明，不用随机生成。

import { GRID_H, GRID_W, TILE } from "./config";
import type { Faction } from "./types";

export type GateSide = "top" | "right" | "bottom" | "left";

export interface RoomElement {
  label: number;
  /** 房间外墙矩形（格坐标，含边界） */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 唯一入口：所在边 + 沿边的格坐标 */
  gate: { side: GateSide; at: number };
}

export interface SegmentElement {
  /** 显式墙体线段（格坐标，水平或竖直） */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const TROLL_ROOM = 1;

export const SPAWNS: Record<Faction, { gx: number; gy: number }> = {
  elf: { gx: 54, gy: 59 },   // 25 号房间
  troll: { gx: 64, gy: 42 }, // 1 号房间（无墙）
};

// 房间外墙矩形与入口。1 号为巨魔出生点，故意没有墙。
export const ROOM_ELEMENTS: RoomElement[] = [
  { label: 2, x0: 2, y0: 2, x1: 18, y1: 11, gate: { side: "right", at: 5 } },
  { label: 3, x0: 2, y0: 20, x1: 22, y1: 36, gate: { side: "right", at: 28 } },
  { label: 4, x0: 2, y0: 37, x1: 17, y1: 45, gate: { side: "right", at: 41 } },
  { label: 5, x0: 2, y0: 47, x1: 16, y1: 57, gate: { side: "right", at: 52 } },
  { label: 6, x0: 2, y0: 58, x1: 16, y1: 68, gate: { side: "right", at: 63 } },
  { label: 7, x0: 2, y0: 69, x1: 17, y1: 79, gate: { side: "right", at: 74 } },
  { label: 8, x0: 2, y0: 80, x1: 18, y1: 90, gate: { side: "right", at: 85 } },
  { label: 9, x0: 2, y0: 91, x1: 14, y1: 94, gate: { side: "right", at: 93 } },
  { label: 10, x0: 34, y0: 84, x1: 54, y1: 93, gate: { side: "top", at: 44 } },
  { label: 11, x0: 56, y0: 87, x1: 67, y1: 93, gate: { side: "top", at: 59 } },
  { label: 12, x0: 67, y0: 83, x1: 87, y1: 93, gate: { side: "top", at: 77 } },
  { label: 13, x0: 92, y0: 88, x1: 116, y1: 93, gate: { side: "right", at: 90 } },
  { label: 14, x0: 125, y0: 88, x1: 151, y1: 93, gate: { side: "top", at: 138 } },
  { label: 15, x0: 128, y0: 65, x1: 154, y1: 81, gate: { side: "left", at: 73 } },
  { label: 16, x0: 126, y0: 29, x1: 156, y1: 53, gate: { side: "left", at: 41 } },
  { label: 17, x0: 129, y0: 2, x1: 153, y1: 11, gate: { side: "left", at: 5 } },
  { label: 18, x0: 103, y0: 2, x1: 123, y1: 8, gate: { side: "bottom", at: 113 } },
  { label: 19, x0: 90, y0: 2, x1: 101, y1: 7, gate: { side: "bottom", at: 96 } },
  { label: 20, x0: 62, y0: 2, x1: 82, y1: 7, gate: { side: "bottom", at: 72 } },
  { label: 21, x0: 28, y0: 2, x1: 52, y1: 10, gate: { side: "bottom", at: 40 } },
  { label: 22, x0: 27, y0: 12, x1: 53, y1: 28, gate: { side: "right", at: 20 } },
  { label: 23, x0: 76, y0: 13, x1: 106, y1: 29, gate: { side: "right", at: 21 } },
  { label: 24, x0: 83, y0: 30, x1: 109, y1: 44, gate: { side: "left", at: 37 } },
  { label: 25, x0: 43, y0: 50, x1: 65, y1: 68, gate: { side: "right", at: 59 } },
  { label: 26, x0: 20, y0: 53, x1: 42, y1: 67, gate: { side: "bottom", at: 31 } },
];

// 巨魔到各房间之间的窄口：每条线段是一侧墙，成对线段之间留 3 格通道。
// 巨魔半径 22px 需要 >44px（3 格）净宽才能通过；放 1 格墙即可封死逼它拆墙。
export const CHOKEPOINTS: SegmentElement[] = [
  { x1: 52, y1: 14, x2: 52, y2: 26 }, { x1: 56, y1: 14, x2: 56, y2: 26 },
  { x1: 60, y1: 46, x2: 60, y2: 58 }, { x1: 64, y1: 46, x2: 64, y2: 58 },
  { x1: 70, y1: 32, x2: 70, y2: 44 }, { x1: 74, y1: 32, x2: 74, y2: 44 },
  { x1: 116, y1: 34, x2: 116, y2: 48 }, { x1: 120, y1: 34, x2: 120, y2: 48 },
  { x1: 80, y1: 16, x2: 100, y2: 16 }, { x1: 80, y1: 20, x2: 100, y2: 20 },
  { x1: 30, y1: 78, x2: 68, y2: 78 }, { x1: 30, y1: 82, x2: 68, y2: 82 },
  { x1: 92, y1: 78, x2: 150, y2: 78 }, { x1: 92, y1: 82, x2: 150, y2: 82 },
  { x1: 124, y1: 58, x2: 124, y2: 70 }, { x1: 128, y1: 58, x2: 128, y2: 70 },
];

const GATE_WIDTH = 3;
const HALF_GATE = Math.floor(GATE_WIDTH / 2);

function setCell(grid: Uint8Array, x: number, y: number): void {
  if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) grid[y * GRID_W + x] = 1;
}

export function gateCells(room: RoomElement): Array<[number, number]> {
  const { side, at } = room.gate;
  const cells: Array<[number, number]> = [];
  for (let d = -HALF_GATE; d <= HALF_GATE; d += 1) {
    if (side === "top" || side === "bottom") {
      cells.push([at + d, side === "top" ? room.y0 : room.y1]);
    } else {
      cells.push([side === "left" ? room.x0 : room.x1, at + d]);
    }
  }
  return cells;
}

export function insideAnyRoom(x: number, y: number): boolean {
  return ROOM_ELEMENTS.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
}

/** 由显式地图元素生成碰撞格。 */
export function buildBlocked(): Uint8Array {
  const grid = new Uint8Array(GRID_W * GRID_H);

  // 房间外墙（矩形边框），跳过入口 3 格
  for (const room of ROOM_ELEMENTS) {
    const skip = new Set(gateCells(room).map(([x, y]) => `${x},${y}`));
    for (let x = room.x0; x <= room.x1; x += 1) {
      for (const y of [room.y0, room.y1]) {
        if (!skip.has(`${x},${y}`)) setCell(grid, x, y);
      }
    }
    for (let y = room.y0; y <= room.y1; y += 1) {
      for (const x of [room.x0, room.x1]) {
        if (!skip.has(`${x},${y}`)) setCell(grid, x, y);
      }
    }
  }

  // 显式窄口线段；不切进房间，也不贴出生点
  for (const seg of CHOKEPOINTS) {
    const dx = Math.sign(seg.x2 - seg.x1);
    const dy = Math.sign(seg.y2 - seg.y1);
    const steps = Math.max(Math.abs(seg.x2 - seg.x1), Math.abs(seg.y2 - seg.y1));
    for (let i = 0; i <= steps; i += 1) {
      const x = seg.x1 + dx * i;
      const y = seg.y1 + dy * i;
      if (insideAnyRoom(x, y)) continue;
      setCell(grid, x, y);
    }
  }

  // 出生点空地
  for (const faction of ["elf", "troll"] as Faction[]) {
    const { gx, gy } = SPAWNS[faction];
    const radius = faction === "troll" ? 7 : 3;
    for (let y = gy - radius; y <= gy + radius; y += 1) {
      for (let x = gx - radius; x <= gx + radius; x += 1) {
        if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) grid[y * GRID_W + x] = 0;
      }
    }
  }
  return grid;
}

/** 供渲染使用：房间中心的世界坐标。 */
export function roomCenterWorld(room: RoomElement): { x: number; y: number } {
  return {
    x: ((room.x0 + room.x1) / 2 + 0.5) * TILE,
    y: ((room.y0 + room.y1) / 2 + 0.5) * TILE,
  };
}
