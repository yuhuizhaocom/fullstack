"""Probe the 8 original map regions at full WPM resolution (32 units/cell)."""

import struct
from collections import deque
from pathlib import Path

E = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")
ORIGIN_X = -24640.0
ORIGIN_Y = -18496.0
UNIT = 32.0

MAPS = [
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

d = (E / "war3map.wpm").read_bytes()
W, H, CELLS = struct.unpack_from("<II", d, 8)[0], struct.unpack_from("<II", d, 8)[1], d[16:]


def comp_stats(mask, gw, gh):
    seen = bytearray(gw * gh)
    out = []
    for sy in range(gh):
        for sx in range(gw):
            i = sy * gw + sx
            if seen[i] or not mask[i]:
                continue
            q = deque([i]); seen[i] = 1; n = 0
            while q:
                j = q.popleft(); n += 1
                x, y = j % gw, j // gw
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < gw and 0 <= ny < gh:
                        k = ny * gw + nx
                        if not seen[k] and mask[k]:
                            seen[k] = 1; q.append(k)
            out.append(n)
    return sorted(out, reverse=True)


for mid, name, bounds, points in MAPS:
    x0, y0, x1, y1 = bounds
    gw, gh = int((x1 - x0) // UNIT), int((y1 - y0) // UNIT)
    cx0, cy0 = int((x0 - ORIGIN_X) // UNIT), int((y0 - ORIGIN_Y) // UNIT)
    open_mask = bytearray(gw * gh)
    for gy in range(gh):
        row = (cy0 + gy) * W + cx0
        for gx in range(gw):
            open_mask[gy * gw + gx] = 1 if not (CELLS[row + gx] & 0x02) else 0
    tc = (int((points[0][1] - x0) // UNIT), int((points[0][2] - y0) // UNIT))
    # clear a 5x5 spawn yard like the game does for a town hall footprint
    for yy in range(tc[1] - 2, tc[1] + 3):
        for xx in range(tc[0] - 2, tc[0] + 3):
            if 0 <= xx < gw and 0 <= yy < gh:
                open_mask[yy * gw + xx] = 1
    dist = [[-1] * gw for _ in range(gh)]
    q = deque([tc]); dist[tc[1]][tc[0]] = 0
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < gw and 0 <= ny < gh and dist[ny][nx] < 0 and open_mask[ny * gw + nx]:
                dist[ny][nx] = dist[y][x] + 1
                q.append((nx, ny))
    total_open = sum(open_mask)
    reach = sum(1 for row in dist for v in row if v >= 0)
    cs = comp_stats(open_mask, gw, gh)
    ok = []
    for label, x, y in points:
        px, py = int((x - x0) // UNIT), int((y - y0) // UNIT)
        if not (0 <= px < gw and 0 <= py < gh):
            ok.append(f"{label}=OUT")
        elif not open_mask[py * gw + px]:
            ok.append(f"{label}=WALL")
        elif dist[py][px] < 0:
            ok.append(f"{label}=SEALED")
        else:
            ok.append(f"{label}=d{dist[py][px]}")
    print(f"map {mid} {name}: {gw}x{gh} open {total_open} comps {len(cs)} top {cs[:6]} "
          f"reach {reach} ({reach/total_open:.1%}) | {' '.join(ok)}")
