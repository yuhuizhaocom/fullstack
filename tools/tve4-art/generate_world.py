"""从零生成 tve4 世界：雪地迷宫布局 + 碰撞格 + 地图背景。

布局规则（与需求示意图一致）：
  - 1 号房间是巨魔出生点。
  - 2~26 号房间是精灵房间，每个房间只有 1 格宽的入口；
    在入口放一面墙即可守住整个房间。
  - 房间之外的整片区域完全开放，没有精灵墙时巨魔可以直接通过。

输出：
  public/tve4/blocked.bin  168x96，1=墙
  public/tve4/arena.png    2688x1536 背景（带红色编号）
  public/tve4/world.json   房间/出生点数据
"""

import json
import math
import os
import random
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "tve4")
os.makedirs(OUT, exist_ok=True)

GW, GH = 168, 96
TILE = 16
IW, IH = GW * TILE, GH * TILE
CW, CH = TILE, TILE

# (编号, 中心x, 中心y, 半宽, 半高, 入口方向)  中心/半尺寸为 0~1 归一化
# 入口方向：0=右 1=下 2=左 3=上
ROOMS = [
    (1,  0.38, 0.44, 0.036, 0.046, 2),   # 巨魔出生点：不建墙
    (2,  0.05, 0.055, 0.059, 0.059, 0),
    (3,  0.07, 0.29, 0.059, 0.085, 0),
    (4,  0.05, 0.43, 0.056, 0.045, 0),
    (5,  0.04, 0.54, 0.055, 0.049, 0),
    (6,  0.035, 0.66, 0.059, 0.047, 0),
    (7,  0.05, 0.77, 0.052, 0.057, 0),
    (8,  0.05, 0.89, 0.059, 0.055, 0),
    (9,  0.035, 0.98, 0.049, 0.033, 0),
    (10, 0.26, 0.95, 0.059, 0.078, 3),
    (11, 0.35, 0.97, 0.049, 0.068, 3),
    (12, 0.46, 0.94, 0.059, 0.078, 3),
    (13, 0.62, 0.97, 0.072, 0.059, 3),
    (14, 0.82, 0.97, 0.078, 0.059, 3),
    (15, 0.84, 0.76, 0.078, 0.085, 2),
    (16, 0.84, 0.43, 0.091, 0.124, 2),
    (17, 0.84, 0.04, 0.072, 0.078, 2),
    (18, 0.67, 0.03, 0.059, 0.055, 1),
    (19, 0.59, 0.03, 0.055, 0.042, 1),
    (20, 0.43, 0.03, 0.059, 0.042, 1),
    (21, 0.24, 0.05, 0.072, 0.059, 1),
    (22, 0.24, 0.21, 0.078, 0.085, 0),
    (23, 0.54, 0.22, 0.091, 0.085, 1),
    (24, 0.57, 0.39, 0.078, 0.078, 2),
    (25, 0.32, 0.61, 0.065, 0.098, 0),
    (26, 0.185, 0.62, 0.065, 0.078, 0),
]

ELF_START = (54, 59)    # 25 号房间
TROLL_START = (64, 42)  # 1 号房间


def room_polygon(label, cx, cy, hw, hh):
    """生成整齐的房间轮廓：直角 + 切角，墙线规整。"""
    cx, cy = cx * GW, cy * GH
    hw, hh = hw * GW, hh * GH
    cut = max(2, min(hw, hh) * 0.28)
    pts = [
        (cx - hw + cut, cy - hh), (cx + hw - cut, cy - hh),
        (cx + hw, cy - hh + cut), (cx + hw, cy + hh - cut),
        (cx + hw - cut, cy + hh), (cx - hw + cut, cy + hh),
        (cx - hw, cy + hh - cut), (cx - hw, cy - hh + cut),
    ]
    return pts, (cx, cy)


def neighbors(x, y):
    return ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))


def interior_cells(blocked, cx, cy):
    """从中心洪泛，得到被墙围住的房间内部。"""
    seed = (int(round(cx)), int(round(cy)))
    seen = {seed}
    queue = [seed]
    while queue:
        x, y = queue.pop()
        for nx, ny in neighbors(x, y):
            if (nx, ny) in seen:
                continue
            if nx < 0 or ny < 0 or nx >= GW or ny >= GH:
                continue
            if blocked[ny * GW + nx]:
                continue
            seen.add((nx, ny))
            queue.append((nx, ny))
    return seen


def add_chokepoints(blocked, gates):
    """在巨魔到各房间之间设置 1~4 个 1 格宽的窄口，供精灵放墙逼巨魔现身。"""
    rnd = random.Random(777)
    tx, ty = TROLL_START
    gate_points = [tuple(g["gate"]) for g in gates.values()]
    room_centers = [tuple(g["center"]) for g in gates.values()]
    for label, *_ in ROOMS:
        if label == 1:
            continue
        rx, ry = gates[label]["center"]
        dx, dy = rx - tx, ry - ty
        dist = max(1, math.hypot(dx, dy))
        ux, uy = dx / dist, dy / dist
        count = rnd.randint(1, 4)
        for k in range(count):
            t = 0.12 + 0.72 * (k + 0.5) / count
            bx = tx + dx * t + rnd.uniform(-5, 5)
            by = ty + dy * t + rnd.uniform(-5, 5)
            length = rnd.randint(6, 11)
            ax, ay = int(round(bx)), int(round(by))
            if abs(ux) >= abs(uy):
                # 路径偏水平：放置竖直墙，留 1 格水平窄口
                cells = [(ax, ay + sgn * d) for sgn in (-1, 1) for d in range(1, length + 1)]
            else:
                # 路径偏竖直：放置水平墙，留 1 格竖向窄口
                cells = [(ax + sgn * d, ay) for sgn in (-1, 1) for d in range(1, length + 1)]
            if any(not (0 <= x < GW and 0 <= y < GH) for x, y in cells):
                continue
            if any(blocked[y * GW + x] for x, y in cells):
                continue
            if min(math.hypot(bx - cx, by - cy) for cx, cy in room_centers) < 10:
                continue
            if min(math.hypot(bx - gx, by - gy) for gx, gy in gate_points) < 7:
                continue
            for x, y in cells:
                blocked[y * GW + x] = 1


def flood_open(blocked, start):
    seen = {start}
    stack = [start]
    while stack:
        x, y = stack.pop()
        for nx, ny in neighbors(x, y):
            if (nx, ny) in seen:
                continue
            if nx < 0 or ny < 0 or nx >= GW or ny >= GH:
                continue
            if blocked[ny * GW + nx]:
                continue
            seen.add((nx, ny))
            stack.append((nx, ny))
    return seen


def ensure_connectivity(blocked):
    """保证没有任何建筑时，全图开放格互相可达，不留死角。"""
    while True:
        visited = set()
        components = []
        for y in range(GH):
            for x in range(GW):
                if blocked[y * GW + x] == 0 and (x, y) not in visited:
                    comp = flood_open(blocked, (x, y))
                    visited |= comp
                    components.append(comp)
        if len(components) <= 1:
            return
        components.sort(key=len, reverse=True)
        main = components[0]
        repaired = False
        for comp in components[1:]:
            for x, y in comp:
                for nx, ny in neighbors(x, y):
                    if not (0 <= nx < GW and 0 <= ny < GH) or not blocked[ny * GW + nx]:
                        continue
                    if any((ox, oy) in main for ox, oy in neighbors(nx, ny)):
                        blocked[ny * GW + nx] = 0
                        repaired = True
                        break
                if repaired:
                    break
            if repaired:
                break
        if not repaired:
            for comp in components[1:]:
                for x, y in comp:
                    blocked[y * GW + x] = 1
            return


def build_blocked():
    blocked = bytearray([0]) * (GW * GH)

    # 1) 先画出所有完整房间轮廓（暂时没有入口）；1 号巨魔出生点不建墙
    for label, cx, cy, hw, hh, side in ROOMS:
        if label == 1:
            continue
        pts, center = room_polygon(label, cx, cy, hw, hh)
        for i in range(len(pts)):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % len(pts)]
            steps = max(1, int(math.ceil(math.hypot(x2 - x1, y2 - y1) * 4)))
            for s in range(steps + 1):
                t = s / steps
                x = int(round(x1 + (x2 - x1) * t))
                y = int(round(y1 + (y2 - y1) * t))
                if 0 <= x < GW and 0 <= y < GH:
                    blocked[y * GW + x] = 1

    # 2) 每个房间开一个 1 格入口：选最靠近指定方向的墙格，
    #    且该墙格必须同时邻接房间内部与外部空地。
    gates = {}
    angles = [0, math.pi / 2, math.pi, -math.pi / 2]
    for label, cx, cy, hw, hh, side in ROOMS:
        if label == 1:
            gates[label] = {
                "gate": [int(round(cx * GW)), int(round(cy * GH))],
                "center": [int(round(cx * GW)), int(round(cy * GH))],
            }
            continue
        center = (cx * GW, cy * GH)
        inside = interior_cells(blocked, *center)
        a = angles[side]
        dx, dy = math.cos(a), math.sin(a)
        candidates = []
        for x, y in inside:
            for nx, ny in neighbors(x, y):
                if not (0 <= nx < GW and 0 <= ny < GH):
                    continue
                if not blocked[ny * GW + nx]:
                    continue
                if (nx, ny) in inside:
                    continue
                # 墙格外侧必须通向外部空地
                outside_open = any(
                    0 <= ox < GW and 0 <= oy < GH
                    and not blocked[oy * GW + ox]
                    and (ox, oy) not in inside
                    for ox, oy in neighbors(nx, ny)
                )
                if outside_open:
                    # 优先选该方向侧边中部的墙格，避免落在切角上
                    target_x = center[0] + dx * hw * GW * 0.9
                    target_y = center[1] + dy * hh * GH * 0.9
                    score = -math.hypot(nx - target_x, ny - target_y)
                    candidates.append((score, nx, ny))
        if candidates:
            _, gx, gy = max(candidates)
            blocked[gy * GW + gx] = 0
        else:
            gx, gy = int(round(center[0])), int(round(center[1]))
        gates[label] = {
            "gate": [gx, gy],
            "center": [int(round(center[0])), int(round(center[1]))],
        }

    # 3) 路线窄口
    add_chokepoints(blocked, gates)

    # 4) 出生点周围清空；巨魔出生点留更大空地方便它出来
    for gx, gy, radius in ((ELF_START[0], ELF_START[1], 3), (TROLL_START[0], TROLL_START[1], 8)):
        for y in range(gy - radius, gy + radius + 1):
            for x in range(gx - radius, gx + radius + 1):
                if 0 <= x < GW and 0 <= y < GH:
                    blocked[y * GW + x] = 0

    # 5) 消除死角：全图开放格必须连通
    ensure_connectivity(blocked)
    return blocked, gates


def load_font(size):
    for path in (
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\msyh.ttc",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_map(blocked, gates):
    rnd = random.Random(40334)
    img = Image.new("RGB", (IW, IH), (214, 226, 233))
    px = img.load()
    for y in range(IH):
        ty = y / IH
        for x in range(IW):
            tx = x / IW
            n = (
                math.sin(tx * 9.3 + ty * 4.1) * 0.5
                + math.sin(tx * 3.1 - ty * 8.7) * 0.3
                + math.sin((tx + ty) * 15.6) * 0.2
            )
            k = max(0.0, min(1.0, 0.5 + n * 0.18))
            base = (int(188 + 44 * k), int(206 + 36 * k), int(216 + 30 * k))
            grit = rnd.randint(-6, 6)
            px[x, y] = tuple(max(0, min(255, c + grit)) for c in base)
    d = ImageDraw.Draw(img, "RGBA")

    # 冰面与雪堆
    for _ in range(220):
        gx = rnd.randrange(GW)
        gy = rnd.randrange(GH)
        if blocked[gy * GW + gx]:
            continue
        cx = (gx + rnd.random()) * CW
        cy = (gy + rnd.random()) * CH
        r = rnd.uniform(5, 18)
        d.ellipse([cx - r, cy - r * 0.55, cx + r, cy + r * 0.55], fill=(158, 198, 214, rnd.randint(18, 42)))
    for _ in range(320):
        gx = rnd.randrange(GW)
        gy = rnd.randrange(GH)
        if blocked[gy * GW + gx]:
            continue
        cx = (gx + rnd.random()) * CW
        cy = (gy + rnd.random()) * CH
        r = rnd.uniform(6, 16)
        d.ellipse([cx - r, cy - r * 0.4, cx + r, cy + r * 0.4], fill=(246, 251, 253, rnd.randint(25, 65)))

    # 石墙
    for gy in range(GH):
        for gx in range(GW):
            if not blocked[gy * GW + gx]:
                continue
            x0, y0 = gx * CW, gy * CH
            x1, y1 = x0 + CW, y0 + CH
            d.rectangle([x0, y0, x1, y1], fill=(66, 80, 92, 255))
            d.rectangle([x0 + 2, y0 + 2, x1 - 2, y0 + CH * 0.42], fill=(120, 136, 148, 255))
            d.rectangle([x0 + 2, y0 + CH * 0.46, x1 - 2, y1 - 2], fill=(78, 94, 106, 255))
            if rnd.random() < 0.16:
                d.line(
                    [x0 + rnd.random() * CW, y0 + rnd.random() * CH,
                     x0 + rnd.uniform(-7, CW + 7), y0 + rnd.uniform(4, CH + 4)],
                    fill=(34, 46, 56, 130), width=2,
                )
            if gy > 0 and not blocked[(gy - 1) * GW + gx]:
                d.rectangle([x0, y0 - 1, x1, y0 + 4], fill=(244, 250, 253, 240))
            if gx > 0 and not blocked[gy * GW + gx - 1]:
                d.rectangle([x0 - 1, y0, x0 + 4, y1], fill=(238, 247, 251, 220))

    # 霜点
    for _ in range(6000):
        gx = rnd.randrange(GW)
        gy = rnd.randrange(GH)
        if blocked[gy * GW + gx]:
            continue
        x = (gx + rnd.random()) * CW
        y = (gy + rnd.random()) * CH
        if rnd.random() < 0.6:
            d.ellipse([x, y, x + 2, y + 2], fill=(255, 255, 255, rnd.randint(35, 105)))
        else:
            d.ellipse([x, y, x + 3, y + 1], fill=(76, 98, 112, rnd.randint(15, 45)))

    # 红色编号（与需求示意图一致）
    font = load_font(22)
    for label, cx, cy, hw, hh, side in ROOMS:
        gx, gy = gates[label]["center"]
        x, y = gx * CW + CW / 2, gy * CH + CH / 2
        d.ellipse([x - 17, y - 17, x + 17, y + 17], outline=(222, 56, 56, 235), width=3)
        text = str(label)
        box = d.textbbox((0, 0), text, font=font)
        tw, th = box[2] - box[0], box[3] - box[1]
        d.text((x - tw / 2, y - th / 2 - 2), text, font=font, fill=(222, 56, 56, 245))

    img.save(os.path.join(OUT, "arena.png"))
    print("wrote arena.png", img.size)


def main():
    blocked, gates = build_blocked()
    with open(os.path.join(OUT, "blocked.bin"), "wb") as f:
        f.write(blocked)
    print("wrote blocked.bin", len(blocked), "bytes, walls:", sum(blocked))
    draw_map(blocked, gates)
    with open(os.path.join(OUT, "world.json"), "w", encoding="utf-8") as f:
        json.dump({
            "grid": [GW, GH],
            "tile": TILE,
            "rooms": [
                {"label": label, "center": gates[label]["center"], "gate": gates[label]["gate"]}
                for label, *_ in ROOMS
            ],
            "elfStart": list(ELF_START),
            "trollStart": list(TROLL_START),
        }, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
