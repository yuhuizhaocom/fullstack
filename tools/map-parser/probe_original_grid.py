"""Probe original WPM downsampling thresholds for the tve4 grid."""
import struct
from collections import deque
from pathlib import Path

E = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")
GW, GH = 192, 144
S = 8
d = (E / "war3map.wpm").read_bytes()
W, H = struct.unpack_from("<II", d, 8)
cells = d[16:16 + W * H]
TX, TY = 118, 16  # SOLO_MAJIA


def build(threshold):
    g = bytearray(GW * GH)
    for gy in range(GH):
        for gx in range(GW):
            blocked = 0
            for y in range(gy * S, gy * S + S):
                row = y * W
                for x in range(gx * S, gx * S + S):
                    if cells[row + x] & 0x02:
                        blocked += 1
            if blocked >= threshold:
                g[gy * GW + gx] = 1
    # clear troll 5x5
    for y in range(TY - 2, TY + 3):
        for x in range(TX - 2, TX + 3):
            g[y * GW + x] = 0
    return g


def components(g):
    seen = bytearray(GW * GH)
    comps = []
    for sy in range(GH):
        for sx in range(GW):
            if seen[sy * GW + sx] or g[sy * GW + sx]:
                continue
            q = deque([(sx, sy)])
            seen[sy * GW + sx] = 1
            n = 0
            while q:
                x, y = q.popleft()
                n += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < GW and 0 <= ny < GH and not seen[ny * GW + nx] and not g[ny * GW + nx]:
                        seen[ny * GW + nx] = 1
                        q.append((nx, ny))
            comps.append(n)
    return sorted(comps, reverse=True)


for t in (40, 44, 48, 52, 56, 60, 64):
    g = build(t)
    comps = components(g)
    print(f"threshold {t:2d}: blocked={sum(g)} open={GW*GH-sum(g)} comps={len(comps)} top={comps[:5]}")
