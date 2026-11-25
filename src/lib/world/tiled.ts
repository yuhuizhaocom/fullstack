import { ROOMS, terrainAt, type RoomId } from "./terrain";

/** Tiled 图块 ID，与 Tiled 编辑器中导出的 JSON 保持同一套编号 */
export const TILE_ID = {
  ground0: 1,
  ground1: 2,
  ground2: 3,
  water: 10,
  flower: 20,
} as const;

export type TiledTileLayer = {
  id: number;
  name: string;
  type: "tilelayer";
  width: number;
  height: number;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  data: number[];
};

export type TiledMap = {
  type: "map";
  version: string;
  tiledversion: string;
  orientation: "isometric";
  renderorder: "right-down";
  infinite: false;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledTileLayer[];
  tilesets: {
    firstgid: number;
    name: string;
    tilewidth: number;
    tileheight: number;
    tilecount: number;
    columns: number;
    image: string;
  }[];
  properties: { name: string; type: "string" | "int"; value: string | number }[];
};

function tileLayer(
  id: number,
  name: string,
  width: number,
  height: number,
  data: number[]
): TiledTileLayer {
  return {
    id,
    name,
    type: "tilelayer",
    width,
    height,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    data,
  };
}

/**
 * 把程序化地形转换成 Tiled 等距地图 JSON 结构。
 * 若之后用 Tiled 手工绘制地图，只需替换同名 JSON 即可复用渲染管线。
 */
export function buildTiledMap(room: RoomId): TiledMap {
  const cfg = ROOMS[room];
  const ground = new Array<number>(cfg.w * cfg.h);
  const detail = new Array<number>(cfg.w * cfg.h).fill(0);

  for (let ty = 0; ty < cfg.h; ty += 1) {
    for (let tx = 0; tx < cfg.w; tx += 1) {
      const index = ty * cfg.w + tx;
      const terrain = terrainAt(tx, ty, room);
      if (terrain === "water") {
        ground[index] = TILE_ID.water;
      } else {
        ground[index] = TILE_ID.ground0 + ((tx * 7 + ty * 13) % 3);
        if (terrain === "flower") detail[index] = TILE_ID.flower;
      }
    }
  }

  return {
    type: "map",
    version: "1.10",
    tiledversion: "1.10.2",
    orientation: "isometric",
    renderorder: "right-down",
    infinite: false,
    width: cfg.w,
    height: cfg.h,
    tilewidth: 64,
    tileheight: 32,
    layers: [
      tileLayer(1, "ground", cfg.w, cfg.h, ground),
      tileLayer(2, "detail", cfg.w, cfg.h, detail),
    ],
    tilesets: [
      {
        firstgid: 1,
        name: room,
        tilewidth: 64,
        tileheight: 32,
        tilecount: 21,
        columns: 7,
        image: `tilesets/${room}.png`,
      },
    ],
    properties: [
      { name: "room", type: "string", value: room },
      { name: "theme", type: "string", value: cfg.theme },
    ],
  };
}
