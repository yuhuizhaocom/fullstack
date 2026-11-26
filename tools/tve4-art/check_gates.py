"""校验 tve4 房间：每个房间除入口外应完全封闭。"""
import json
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GW, GH = 168, 96
blocked = bytearray((ROOT / "public" / "tve4" / "blocked.bin").read_bytes())
world = json.loads((ROOT / "public" / "tve4" / "world.json").read_text(encoding="utf-8"))


def is_open(x, y):
    return 0 <= x < GW and 0 <= y < GH and blocked[y * GW + x] == 0


bad = []
for room in world["rooms"]:
    if room["label"] == 1:  # 巨魔出生点无墙
        continue
    cx, cy = room["center"]
    gx, gy = room["gate"]
    seen = {(cx, cy)}
    queue = deque([(cx, cy)])
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if (nx, ny) in seen or not is_open(nx, ny) or (nx, ny) == (gx, gy):
                continue
            seen.add((nx, ny))
            queue.append((nx, ny))
    exits = set()
    for x, y in seen:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if (nx, ny) not in seen and is_open(nx, ny):
                exits.add((nx, ny))
    if len(exits) != 1:
        bad.append((room["label"], len(exits), sorted(exits)[:8]))

visited = set()
components = 0
for y in range(GH):
    for x in range(GW):
        if not is_open(x, y) or (x, y) in visited:
            continue
        comp = { (x, y) }
        queue = [(x, y)]
        while queue:
            cx, cy = queue.pop()
            for nx, ny in ((cx+1,cy),(cx-1,cy),(cx,cy+1),(cx,cy-1)):
                if (nx, ny) in comp or not is_open(nx, ny):
                    continue
                comp.add((nx, ny))
                queue.append((nx, ny))
        visited |= comp
        components += 1

print("rooms:", len(world["rooms"]), "bad:", bad, "open components:", components)
