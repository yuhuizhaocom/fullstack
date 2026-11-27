"""Generate the eight selectable tve4 maps from the original Warcraft III map data.

The original map is one Warcraft III map containing eight separate arenas
(`GG_rct_MAP_0_AREA` ... `MAP_7_AREA`, see `war3map.j` GameMap_load).  This
script crops each arena, samples war3map.wpm at 128 world units per web tile,
connects every open pocket with a minimal one-tile corridor, picks spawns and
paints a self-made background from the terrain / tree data.

It does NOT copy any original art.

Outputs:
  public/tve4/maps/map-<id>.png        playable background
  public/tve4/maps/map-<id>-thumb.png  selection thumbnail
  public/tve4/maps/map-<id>.bin        collision grid (1 = blocked)
  data/game/maps.json                  metadata
  src/lib/tve4/maps.generated.ts       metadata + collision for the engine
  docs/research/local-map-restore.md   report
"""

import base64
import json
import math
import struct
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
EXTRACTED = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")
OUT_PUBLIC = ROOT / "public" / "tve4" / "maps"
OUT_DATA = ROOT / "data" / "game"
OUT_DOC = ROOT / "docs" / "research"
OUT_SRC = ROOT / "src" / "lib" / "tve4"

TILE = 16
TILE_UNITS = 128
S = TILE_UNITS // 32
ORIGIN_X = -24640.0
ORIGIN_Y = -18496.0
WPM_W, WPM_H = 1536, 1152

GROUND = {
    0: (126, 108, 86),    # Wdrt dirt
    1: (112, 96, 78),     # Wdro rough dirt
    2: (205, 218, 222),   # Wsng snow grass
    3: (99, 111, 117),    # Wrok rock
    4: (152, 176, 145),   # Wgrs grass
    5: (238, 244, 246),   # Wsnw snow
    6: (190, 202, 209),   # Nice
}
WALL = (52, 66, 74)
WALL_TOP = (126, 146, 155)
WALL_SNOW = (222, 232, 237)

# id, JASS constant, Chinese name, bound rect, troll-house world point,
# angel world point (or None), stone world points, description, tags
MAPS = [
    (0, "MAP_BIG_SNOW_LAND", "大型雪地", (-15744, -14880, -736, -1536), (-8064, -8704),
     (-8323.4, -2099.4), [(-8640, -9280), (-7488, -8256)],
     "开阔雪原与密集松林，路口多、绕行距离长，适合正面推进。", ["SINGLE", "DOUBLE", "SURVIVE"]),
    (1, "MAP_BIG_FOREST", "大型草地", (-736, -896, 15392, 15424), (7680, 6400),
     (10106.9, -357), [(7104, 5824), (8256, 6976)],
     "原版经典大地图，林区被天然树墙分成数片，通路四通八达。", ["SINGLE", "DOUBLE", "FIX"]),
    (2, "MAP_SMALL_FOREST", "小型森林", (0, -11872, 10144, -1920), (4480, -6016),
     (8477.3, -10503.2), [(3904, -6464), (5056, -5568)],
     "紧凑的小型森林，发育空间有限，遭遇战来得更快。", ["SINGLE", "SOLO", "DUET"]),
    (3, "MAP_SOLO_AREA", "单挑地形", (9760, -15008, 15712, -7296), (14464, -9856),
     (10541.8, -7914.8), [(14016, -10304), (14912, -9408)],
     "原版单挑场，面积小、路径直接，适合一对一。", ["SOLO"]),
    (4, "MAP_DEFEND_AREA", "防守地形", (-24544, 7104, -16448, 15456), (-20480, 11008),
     None, [],
     "四座巨魔小屋围住中央防守区，精灵营地分散在四周。", ["DEFEND", "SURVIVE"]),
    (5, "MAP_MIDDLE_FOREST", "中型森林", (-26688, -14624, -16480, -4320), (-21504, -9728),
     (-21507.5, -3956.7), [(-22080, -10368), (-20928, -9088)],
     "中型林地，资源点集中，适合快节奏攻防。", ["SINGLE", "DOUBLE", "RACE"]),
    (6, "MAP_RACE_FOREST", "竞赛森林", (-26688, -14720, -16448, 6752), (-21504, 1664),
     (-21507.5, -3956.7), [(-22080, -10368), (-20928, -9088)],
     "南北狭长的双巨魔竞赛地图，从北到南贯穿整片森林。", ["RACE", "DUET"]),
    (7, "MAP_BIG_SNOW_FIELD", "冰天雪地", (-15968, -768, -992, 15552), (-8320, 6272),
     (-6909.7, 550.5), [(-8896, 5696), (-7744, 6848)],
     "冰天雪地大型地图，雪原与岩壁交错，视野和绕后空间都很大。", ["SINGLE", "DOUBLE", "SURVIVE"]),
]


def load_wpm():
    d = (EXTRACTED / "war3map.wpm").read_bytes()
    w, h = struct.unpack_from("<II", d, 8)
    assert (w, h) == (WPM_W, WPM_H)
    return d[16:16 + w * h]


def load_terrain():
    d = (EXTRACTED / "war3map.w3e").read_bytes()
    cells = 385 * 289
    return d[65 + cells * 4:65 + cells * 5]


def load_trees():
    d = (EXTRACTED / "war3map.doo").read_bytes()
    _ver, _sub, count = struct.unpack_from("<III", d, 4)
    trees = []
    for i in range(count):
        off = 16 + i * 50
        if off + 30 > len(d):
            break
        if d[off:off + 4] != b"WTst":
            continue
        x, y, _z = struct.unpack_from("<3f", d, off + 8)
        trees.append((x, y))
    return trees


def build_grid(cells, bounds):
    x0, y0, x1, y1 = bounds
    gw, gh = (x1 - x0) // TILE_UNITS, (y1 - y0) // TILE_UNITS
    cx0, cy0 = int((x0 - ORIGIN_X) // 32), int((y0 - ORIGIN_Y) // 32)
    grid = bytearray(gw * gh)
    for gy in range(gh):
        for gx in range(gw):
            blocked = 0
            for yy in range(cy0 + gy * S, cy0 + gy * S + S):
                row = yy * WPM_W
                for xx in range(cx0 + gx * S, cx0 + gx * S + S):
                    if cells[row + xx] & 0x02:
                        blocked += 1
            # strict majority of the 4x4 source cells -> wall
            if blocked >= 9:
                grid[gy * gw + gx] = 1
    return grid, gw, gh


def clear_rect(grid, gw, gh, gx, gy, radius):
    for y in range(gy - radius, gy + radius + 1):
        for x in range(gx - radius, gx + radius + 1):
            if 0 <= x < gw and 0 <= y < gh:
                grid[y * gw + x] = 0


def components(grid, gw, gh):
    seen = bytearray(gw * gh)
    comps = []
    for sy in range(gh):
        for sx in range(gw):
            i = sy * gw + sx
            if seen[i] or grid[i]:
                continue
            q = deque([i])
            seen[i] = 1
            comp = []
            while q:
                j = q.popleft()
                comp.append(j)
                x, y = j % gw, j // gw
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < gw and 0 <= ny < gh:
                        k = ny * gw + nx
                        if not seen[k] and not grid[k]:
                            seen[k] = 1
                            q.append(k)
            comps.append(comp)
    comps.sort(key=len, reverse=True)
    return comps


def bfs(grid, gw, gh, start):
    dist = [[-1] * gw for _ in range(gh)]
    sx, sy = start
    q = deque([(sx, sy)])
    dist[sy][sx] = 0
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < gw and 0 <= ny < gh and dist[ny][nx] < 0 and not grid[ny * gw + nx]:
                dist[ny][nx] = dist[y][x] + 1
                q.append((nx, ny))
    return dist


def carve_to_main(grid, gw, gh, start):
    """Connect every open pocket to the start component with minimal corridors."""
    carved = []
    while True:
        comps = components(grid, gw, gh)
        if len(comps) <= 1:
            break
        main = next((c for c in comps if start[1] * gw + start[0] in c), comps[0])
        main_set = set(main)
        dist = [[-1] * gw for _ in range(gh)]
        prev = [[None] * gw for _ in range(gh)]
        q = deque()
        for i in main:
            x, y = i % gw, i // gw
            dist[y][x] = 0
            q.append((x, y))
        target = None
        while q and target is None:
            x, y = q.popleft()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if not (0 <= nx < gw and 0 <= ny < gh) or dist[ny][nx] >= 0:
                    continue
                dist[ny][nx] = dist[y][x] + 1
                prev[ny][nx] = (x, y)
                if not grid[ny * gw + nx] and (ny * gw + nx) not in main_set:
                    target = (nx, ny)
                    break
                q.append((nx, ny))
        if target is None:
            break
        path = []
        cur = target
        while cur is not None and dist[cur[1]][cur[0]] > 0:
            path.append(cur)
            cur = prev[cur[1]][cur[0]]
        for x, y in path:
            if grid[y * gw + x]:
                carved.append((x, y))
            grid[y * gw + x] = 0
    return carved


def choose_elf_spawn(grid, gw, gh, troll):
    dist = bfs(grid, gw, gh, troll)
    best = None
    best_score = -1
    for y in range(2, gh - 2):
        for x in range(2, gw - 2):
            d = dist[y][x]
            if d < 1:
                continue
            clear = all(
                not grid[yy * gw + xx]
                for yy in range(y - 1, y + 2)
                for xx in range(x - 1, x + 2)
            )
            if not clear:
                continue
            # far away, and prefer some elbow room around the spawn
            room = sum(
                1
                for yy in range(y - 3, y + 4)
                for xx in range(x - 3, x + 4)
                if 0 <= xx < gw and 0 <= yy < gh and not grid[yy * gw + xx]
            )
            score = d * 100 + room
            if score > best_score:
                best_score = score
                best = (x, y, d)
    return best


def ground_at(ground, gx, gy):
    tx = min(384, max(0, gx))
    ty = min(288, max(0, gy))
    return ground[ty * 385 + tx] >> 5


def paint(grid, gw, gh, ground, trees, bounds, troll, elf, out_path):
    width, height = gw * TILE, gh * TILE
    img = Image.new("RGB", (width, height), (22, 30, 34))
    draw = ImageDraw.Draw(img)
    x0, y0, _x1, _y1 = bounds
    base_gx = int((x0 - ORIGIN_X) // TILE_UNITS)
    base_gy = int((y0 - ORIGIN_Y) // TILE_UNITS)
    for gy in range(gh):
        for gx in range(gw):
            px, py = gx * TILE, gy * TILE
            gid = ground_at(ground, base_gx + gx, base_gy + gy)
            base = GROUND.get(gid, GROUND[2])
            n = (gx * 73856093 ^ gy * 19349663) & 15
            if grid[gy * gw + gx]:
                shade = 0.82 + (n % 4) * 0.04
                draw.rectangle([px, py, px + TILE - 1, py + TILE - 1],
                               fill=tuple(max(0, min(255, int(c * shade))) for c in WALL))
                # 只给朝向开放地的边画岩壁高光，避免满屏砖纹
                if gy > 0 and not grid[(gy - 1) * gw + gx]:
                    draw.rectangle([px, py, px + TILE - 1, py + 2], fill=WALL_TOP)
                if gy + 1 < gh and not grid[(gy + 1) * gw + gx]:
                    draw.rectangle([px, py + TILE - 3, px + TILE - 1, py + TILE - 1], fill=(30, 40, 45))
                if gx > 0 and not grid[gy * gw + gx - 1]:
                    draw.rectangle([px, py, px + 2, py + TILE - 1], fill=WALL_TOP)
                if gx + 1 < gw and not grid[gy * gw + gx + 1]:
                    draw.rectangle([px + TILE - 3, py, px + TILE - 1, py + TILE - 1], fill=(30, 40, 45))
                if (gx * 3 + gy * 5) % 11 == 0:
                    draw.rectangle([px + 3, py + 3, px + 6, py + 4], fill=WALL_SNOW)
            else:
                color = tuple(max(0, min(255, c + (n - 7))) for c in base)
                draw.rectangle([px, py, px + TILE - 1, py + TILE - 1], fill=color)
                if gid in (2, 5) and (gx * 7 + gy * 11) % 11 == 0:
                    draw.rectangle([px + 3, py + 5, px + TILE - 4, py + 6], fill=(246, 251, 253))
                if (gx + gy) % 13 == 0:
                    draw.point([px + 2, py + 2], fill=(245, 250, 252))

    # self-made pine silhouettes where the original map had winter trees
    for wx, wy in trees:
        gx = int((wx - x0) // TILE_UNITS)
        gy = int((wy - y0) // TILE_UNITS)
        if not (2 <= gx < gw - 2 and 2 <= gy < gh - 2):
            continue
        on_wall = bool(grid[gy * gw + gx])
        cx, cy = gx * TILE + TILE // 2, gy * TILE + TILE // 2
        size = (10 if on_wall else 7) + ((gx * 13 + gy * 7) % 5)
        foliage = (28, 52, 47) if on_wall else (40, 78, 68)
        draw.rectangle([cx - 1, cy + 1, cx + 1, cy + size // 2], fill=(78, 60, 46))
        draw.polygon([(cx, cy - size), (cx - size // 2, cy + size // 3), (cx + size // 2, cy + size // 3)],
                     fill=foliage)
        if not on_wall:
            draw.polygon([(cx, cy - size), (cx - size // 3, cy + size // 5), (cx + size // 3, cy + size // 5)],
                         fill=(214, 232, 235))

    # spawn rings are drawn by the game; only faint map markers are painted
    for (sx, sy), col in ((troll, (196, 92, 70)), (elf, (86, 166, 108))):
        cx, cy = (sx + 0.5) * TILE, (sy + 0.5) * TILE
        draw.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], outline=col, width=2)

    img.save(out_path, optimize=True)
    thumb = img.copy()
    thumb.thumbnail((320, 320), Image.Resampling.LANCZOS)
    thumb.save(out_path.with_name(out_path.stem + "-thumb.png"), optimize=True)
    return sum(1 for v in grid if v == 0)


def main():
    OUT_PUBLIC.mkdir(parents=True, exist_ok=True)
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    OUT_DOC.mkdir(parents=True, exist_ok=True)
    OUT_SRC.mkdir(parents=True, exist_ok=True)
    cells = load_wpm()
    ground = load_terrain()
    trees = load_trees()

    meta_maps = []
    ts_entries = []
    report = [
        "# 原版地图还原（tve4，8 张可选地图）",
        "",
        "来源：`war3map.j` 的 `GameMap_load`（8 个 `MAP_n_AREA`）、`war3map.wpm`、`war3map.w3e`、`war3map.doo`。",
        "生成工具：`tools/map-parser/generate_tve4_maps.py`。",
        "",
        "每张地图按 128 世界单位 = 1 个网页格采样 WPM（4×4 原格，严格多数判墙），",
        "再清除出生点、用最小 1 格走廊把所有开放区域接到巨魔出生区，最后用 BFS 断言全图连通。",
        "背景是按地表类型、墙体与树木位置重绘的自制图，不含原版贴图。",
        "",
        "| 编号 | 名称 | 逻辑格 | 世界尺寸 | 开放格 | 打通格 | 巨魔出生 | 精灵出生 | BFS 距离 |",
        "| ---: | --- | --- | --- | ---: | ---: | --- | --- | ---: |",
    ]

    for mid, key, name, bounds, troll_world, angel_world, stones_world, desc, tags in MAPS:
        grid, gw, gh = build_grid(cells, bounds)
        x0, y0, _x1, _y1 = bounds
        troll = (int((troll_world[0] - x0) // TILE_UNITS), int((troll_world[1] - y0) // TILE_UNITS))
        clear_rect(grid, gw, gh, troll[0], troll[1], 3)
        carved = carve_to_main(grid, gw, gh, troll)
        elf = choose_elf_spawn(grid, gw, gh, troll)
        assert elf is not None, f"map {mid}: no elf spawn"
        ex, ey, edist = elf
        clear_rect(grid, gw, gh, ex, ey, 1)
        # clearing may not disconnect anything; verify every open tile is reachable
        comps = components(grid, gw, gh)
        assert len(comps) == 1, f"map {mid}: {len(comps)} components after carving"
        dist = bfs(grid, gw, gh, troll)
        assert dist[ey][ex] >= 0
        open_tiles = sum(1 for v in grid if v == 0)

        bg_path = OUT_PUBLIC / f"map-{mid}.png"
        open_after = paint(grid, gw, gh, ground, trees, bounds, troll, (ex, ey), bg_path)
        assert open_after == open_tiles

        (OUT_PUBLIC / f"map-{mid}.bin").write_bytes(bytes(grid))
        b64 = base64.b64encode(bytes(grid)).decode("ascii")
        angel = None
        if angel_world:
            ax, ay = int((angel_world[0] - x0) // TILE_UNITS), int((angel_world[1] - y0) // TILE_UNITS)
            if 0 <= ax < gw and 0 <= ay < gh:
                angel = {"gx": ax, "gy": ay}
        stones = []
        for sx, sy in stones_world:
            tx, ty = int((sx - x0) // TILE_UNITS), int((sy - y0) // TILE_UNITS)
            if 0 <= tx < gw and 0 <= ty < gh:
                stones.append({"gx": tx, "gy": ty})
        troll_house = {
            "x": round(troll_world[0] - x0, 1),
            "y": round(troll_world[1] - y0, 1),
        }
        entry = {
            "id": mid,
            "key": key,
            "name": name,
            "description": desc,
            "tags": tags,
            "grid": [gw, gh],
            "world": [gw * TILE, gh * TILE],
            "tileUnits": TILE_UNITS,
            "sourceRect": list(bounds),
            "spawns": {"troll": {"gx": troll[0], "gy": troll[1]}, "elf": {"gx": ex, "gy": ey}},
            "trollHouse": troll_house,
            "angel": angel,
            "stones": stones,
            "openTiles": open_after,
            "carvedTiles": len(carved),
            "elfDistance": edist,
            "background": f"/tve4/maps/map-{mid}.png",
            "thumb": f"/tve4/maps/map-{mid}-thumb.png",
            "blockedBase64": b64,
        }
        meta_maps.append({k: v for k, v in entry.items() if k != "blockedBase64"})
        ts_entries.append(entry)
        report.append(
            f"| {mid} | {name} | {gw}×{gh} | {gw * TILE}×{gh * TILE} | {open_after} | {len(carved)} | "
            f"({troll[0]},{troll[1]}) | ({ex},{ey}) | {edist} |"
        )
        print(f"map {mid} {name}: {gw}x{gh} open {open_after} carved {len(carved)} "
              f"troll {troll} elf {(ex, ey)} dist {edist} angel {angel} stones {stones}")

    meta = {
        "source": "war3map.j GameMap_load + war3map.wpm + war3map.w3e + war3map.doo",
        "tile": TILE,
        "tileUnits": TILE_UNITS,
        "blockedRule": "4x4 WPM cells, >=9 no-walk cells => wall; spawn yards cleared; all open pockets connected with 1-tile corridors",
        "maps": meta_maps,
    }
    OUT_DATA.joinpath("maps.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    ts = [
        "// AUTO-GENERATED by tools/map-parser/generate_tve4_maps.py. Do not edit by hand.",
        "// Source: war3map.j GameMap_load + war3map.wpm/w3e/doo (local extraction).",
        "",
        "export interface MapDefinition {",
        "  id: number;",
        "  key: string;",
        "  name: string;",
        "  description: string;",
        "  tags: string[];",
        "  grid: [number, number];",
        "  world: [number, number];",
        "  tileUnits: number;",
        "  sourceRect: [number, number, number, number];",
        "  spawns: { troll: { gx: number; gy: number }; elf: { gx: number; gy: number } };",
        "  trollHouse: { x: number; y: number };",
        "  angel: { gx: number; gy: number } | null;",
        "  stones: Array<{ gx: number; gy: number }>;",
        "  openTiles: number;",
        "  carvedTiles: number;",
        "  elfDistance: number;",
        "  background: string;",
        "  thumb: string;",
        "  /** base64 encoded Uint8Array, 1 = blocked */",
        "  blockedBase64: string;",
        "}",
        "",
        "export const MAP_ORDER = [" + ", ".join(str(m[0]) for m in MAPS) + "];",
        "",
        "export const MAP_DEFINITIONS: Record<number, MapDefinition> = {",
    ]
    for e in ts_entries:
        ts.append(f"  {e['id']}: {{")
        ts.append(f"    id: {e['id']},")
        ts.append(f"    key: {json.dumps(e['key'])},")
        ts.append(f"    name: {json.dumps(e['name'], ensure_ascii=False)},")
        ts.append(f"    description: {json.dumps(e['description'], ensure_ascii=False)},")
        ts.append(f"    tags: {json.dumps(e['tags'], ensure_ascii=False)},")
        ts.append(f"    grid: [{e['grid'][0]}, {e['grid'][1]}],")
        ts.append(f"    world: [{e['world'][0]}, {e['world'][1]}],")
        ts.append(f"    tileUnits: {e['tileUnits']},")
        ts.append(f"    sourceRect: [{e['sourceRect'][0]}, {e['sourceRect'][1]}, {e['sourceRect'][2]}, {e['sourceRect'][3]}],")
        ts.append(f"    spawns: {json.dumps(e['spawns'])},")
        ts.append(f"    trollHouse: {json.dumps(e['trollHouse'])},")
        ts.append(f"    angel: {json.dumps(e['angel'])},")
        ts.append(f"    stones: {json.dumps(e['stones'])},")
        ts.append(f"    openTiles: {e['openTiles']},")
        ts.append(f"    carvedTiles: {e['carvedTiles']},")
        ts.append(f"    elfDistance: {e['elfDistance']},")
        ts.append(f"    background: {json.dumps(e['background'])!s},")
        ts.append(f"    thumb: {json.dumps(e['thumb'])!s},")
        ts.append(f"    blockedBase64: {json.dumps(e['blockedBase64'])!s},")
        ts.append("  },")
    ts.append("};")
    ts.append("")
    ts.append("export const DEFAULT_MAP_ID = 1;")
    ts.append("")
    OUT_SRC.joinpath("maps.generated.ts").write_text("\n".join(ts), encoding="utf-8")

    report.append("")
    report.append("## 结论")
    report.append("")
    report.append("- 8 张地图均来自原版 `GameMap_load` 的真实区域，不是自绘示意图。")
    report.append("- 每张地图生成后都用 BFS 断言只有一个连通分量，且精灵出生点可达。")
    report.append("- 原版 WPM 中天然存在多个开放块，生成器只在块与块之间打 1 格宽通道，不改动原有走廊。")
    report.append("- 单机 1v1 使用每张图的巨魔小屋作为巨魔出生点，精灵出生点取距巨魔最远的可建造点。")
    report.append("- 地图选择：`/tve4` 开始页可选择 8 张地图；原版特殊模式（防守/竞赛/单挑）只作为标签提示。")
    OUT_DOC.joinpath("local-map-restore.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("wrote maps.json / maps.generated.ts / local-map-restore.md")


if __name__ == "__main__":
    main()
