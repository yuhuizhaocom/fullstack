"""Render one original map region at 128-unit tiles, colouring BFS components."""
import struct
import sys
from collections import deque
from pathlib import Path

from PIL import Image

E = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")
ORIGIN_X, ORIGIN_Y, UNIT = -24640.0, -18496.0, 32.0
MAPS = {
    0: (-15744, -14880, -736, -1536, (-8064, -8704)),
    1: (-736, -896, 15392, 15424, (7680, 6400)),
    2: (0, -11872, 10144, -1920, (4480, -6016)),
    3: (9760, -15008, 15712, -7296, (14464, -9856)),
    4: (-24544, 7104, -16448, 15456, (-20480, 11008)),
    5: (-26688, -14624, -16480, -4320, (-21504, -9728)),
    6: (-26688, -14720, -16448, 6752, (-21504, 1664)),
    7: (-15968, -768, -992, 15552, (-8320, 6272)),
}
d = (E / "war3map.wpm").read_bytes()
W, H = struct.unpack_from("<II", d, 8)
cells = d[16:16 + W * H]

for mid in [int(a) for a in sys.argv[1:]] or [1]:
    x0, y0, x1, y1, (tx, ty) = MAPS[mid]
    gw, gh = (x1 - x0) // 128, (y1 - y0) // 128
    cx0, cy0 = int((x0 - ORIGIN_X) // 32), int((y0 - ORIGIN_Y) // 32)
    grid = bytearray(gw * gh)
    for gy in range(gh):
        for gx in range(gw):
            blocked = 0
            for yy in range(cy0 + gy * 4, cy0 + gy * 4 + 4):
                row = yy * W
                for xx in range(cx0 + gx * 4, cx0 + gx * 4 + 4):
                    if cells[row + xx] & 2:
                        blocked += 1
            grid[gy * gw + gx] = 1 if blocked >= 9 else 0
    scx, scy = int((tx - x0) // 128), int((ty - y0) // 128)
    for yy in range(scy - 2, scy + 3):
        for xx in range(scx - 2, scx + 3):
            if 0 <= xx < gw and 0 <= yy < gh:
                grid[yy * gw + xx] = 0

    comp = [-1] * (gw * gh)
    colors = [(230, 80, 80), (80, 200, 120), (80, 140, 230), (230, 190, 70), (190, 90, 220), (80, 220, 220)]
    cid = 0
    for sy in range(gh):
        for sx in range(gw):
            i = sy * gw + sx
            if grid[i] or comp[i] >= 0:
                continue
            q = deque([i]); comp[i] = cid; n = 0
            while q:
                j = q.popleft(); n += 1
                x, y = j % gw, j // gw
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < gw and 0 <= ny < gh:
                        k = ny * gw + nx
                        if not grid[k] and comp[k] < 0:
                            comp[k] = cid; q.append(k)
            if n > 3:
                cid += 1
    print(f"map {mid}: {gw}x{gh} comps {cid}")
    scale = 4
    img = Image.new("RGB", (gw * scale, gh * scale), (25, 32, 38))
    pix = img.load()
    for gy in range(gh):
        for gx in range(gw):
            i = gy * gw + gx
            if grid[i]:
                c = (55, 68, 76)
            elif comp[i] >= 0:
                c = colors[comp[i] % len(colors)]
            else:
                c = (200, 210, 215)
            for yy in range(gy * scale, gy * scale + scale):
                for xx in range(gx * scale, gx * scale + scale):
                    pix[xx, yy] = c
    img.save(Path(f"docs/research/wpm-map{mid}.png"))
    print("wrote", f"docs/research/wpm-map{mid}.png")
