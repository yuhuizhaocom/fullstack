"""Probe the 8 original GameMap regions for connectivity at web-tile resolution.

Reads war3map.wpm and reports, per original map, the largest walkable
component and whether troll house / angel / stone mines / solo tree are
inside it.  This proves the "each map is internally connected" claim and
picks the sampling rule used by the tve4 map importer.
"""

import struct
from collections import deque
from pathlib import Path

E = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")
ORIGIN_X = -24640.0
ORIGIN_Y = -18496.0
UNIT = 32.0

MAPS = [
    # id, name, bound rect, points (label, x, y)
    (0, "大型雪地", (-15744, -14880, -736, -1536), [
        ("troll", -8064, -8704), ("angel", -8323.4, -2099.4),
        ("stone1", -8640, -9280), ("stone2", -7488, -8256),
    ]),
    (1, "大型草地", (-736, -896, 15392, 15424), [
        ("troll", 7680, 6400), ("angel", 10106.9, -357),
        ("stone1", 7104, 5824), ("stone2", 8256, 6976),
    ]),
    (2, "小型森林", (0, -11872, 10144, -1920), [
        ("troll", 4480, -6016), ("angel", 8477.3, -10503.2),
        ("stone1", 3904, -6464), ("stone2", 5056, -5568),
    ]),
    (3, "单挑地形", (9760, -15008, 15712, -7296), [
        ("troll", 14464, -9856), ("angel", 10541.8, -7914.8),
        ("stone1", 14016, -10304), ("stone2", 14912, -9408),
        ("lifeTree", 11904, -14336),
    ]),
    (4, "防守地形", (-24544, 7104, -16448, 15456), [
        ("house", -20480, 11008), ("troll1", -23552, 14080),
        ("troll2", -17408, 14080), ("troll3", -17408, 7936),
        ("troll4", -23552, 7936), ("elve1", -20860.7, 12423),
    ]),
    (5, "中型森林", (-26688, -14624, -16480, -4320), [
        ("troll", -21504, -9728), ("angel", -21507.5, -3956.7),
        ("stone1", -22080, -10368), ("stone2", -20928, -9088),
    ]),
    (6, "竞赛森林", (-26688, -14720, -16448, 6752), [
        ("troll1", -21504, 1664), ("troll2", -21504, -9728),
        ("angel", -21507.5, -3956.7),
        ("stone1", -22080, -10368), ("stone2", -20928, -9088),
    ]),
    (7, "冰天雪地", (-15968, -768, -992, 15552), [
        ("troll", -8320, 6272), ("angel", -6909.7, 550.5),
        ("stone1", -8896, 5696), ("stone2", -7744, 6848),
    ]),
]


def load_wpm():
    d = (E / "war3map.wpm").read_bytes()
    w, h = struct.unpack_from("<II", d, 8)
    return w, h, d[16:16 + w * h]


def cell_of(x, y):
    return int((x - ORIGIN_X) // UNIT), int((y - ORIGIN_Y) // UNIT)


def build(bounds, tile_units, threshold):
    x0, y0, x1, y1 = bounds
    gw = int((x1 - x0) // tile_units)
    gh = int((y1 - y0) // tile_units)
    s = int(tile_units // UNIT)
    w, h, cells = W, H, CELLS
    grid = bytearray(gw * gh)
    cx0 = int((x0 - ORIGIN_X) // UNIT)
    cy0 = int((y0 - ORIGIN_Y) // UNIT)
    total = s * s
    for gy in range(gh):
        for gx in range(gw):
            blocked = 0
            for yy in range(cy0 + gy * s, cy0 + (gy + 1) * s):
                row = yy * w
                for xx in range(cx0 + gx * s, cx0 + (gx + 1) * s):
                    if cells[row + xx] & 0x02:
                        blocked += 1
            if blocked > threshold * total:
                grid[gy * gw + gx] = 1
    return grid, gw, gh, cx0, cy0, s


def comps(grid, gw, gh):
    seen = bytearray(gw * gh)
    out = []
    for sy in range(gh):
        for sx in range(gw):
            i = sy * gw + sx
            if seen[i] or grid[i]:
                continue
            q = deque([i])
            seen[i] = 1
            n = 0
            while q:
                j = q.popleft()
                n += 1
                x, y = j % gw, j // gw
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < gw and 0 <= ny < gh:
                        k = ny * gw + nx
                        if not seen[k] and not grid[k]:
                            seen[k] = 1
                            q.append(k)
            out.append(n)
    return sorted(out, reverse=True)


def point_cell(x, y, bounds, tile_units):
    x0, y0, _, _ = bounds
    return int((x - x0) // tile_units), int((y - y0) // tile_units)


def reach_from(grid, gw, gh, start):
    dist = [[-1] * gw for _ in range(gh)]
    sx, sy = start
    if not (0 <= sx < gw and 0 <= sy < gh) or grid[sy * gw + sx]:
        return dist, 0
    q = deque([(sx, sy)])
    dist[sy][sx] = 0
    n = 0
    while q:
        x, y = q.popleft()
        n += 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < gw and 0 <= ny < gh and dist[ny][nx] < 0 and not grid[ny * gw + nx]:
                dist[ny][nx] = dist[y][x] + 1
                q.append((nx, ny))
    return dist, n


W, H, CELLS = load_wpm()
print(f"wpm {W}x{H}")

for tile_units, thr in ((64, 0.6), (128, 0.5), (128, 0.6)):
    print(f"\n=== tile={tile_units} units, blocked>{thr:.0%} ===")
    for mid, name, bounds, points in MAPS:
        grid, gw, gh, cx0, cy0, s = build(bounds, tile_units, thr)
        tc = point_cell(points[0][1], points[0][2], bounds, tile_units)
        dist, reach = reach_from(grid, gw, gh, tc)
        total_open = gw * gh - sum(grid)
        ok = []
        for label, x, y in points:
            px, py = point_cell(x, y, bounds, tile_units)
            if not (0 <= px < gw and 0 <= py < gh):
                ok.append(f"{label}=OUT")
            elif grid[py * gw + px]:
                ok.append(f"{label}=WALL")
            elif dist[py][px] < 0:
                ok.append(f"{label}=SEALED")
            else:
                ok.append(f"{label}=d{dist[py][px]}")
        cs = comps(grid, gw, gh)
        print(f"map {mid} {name}: grid {gw}x{gh} open {total_open} biggest {cs[:4]} "
              f"startReach {reach} ({reach/max(1,total_open):.1%}) | {' '.join(ok)}")
