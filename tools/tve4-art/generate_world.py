"""从零生成 Phaser 4 版世界：房间布局 + 碰撞格 + 地图背景。

完全程序化，不读取任何旧版地图/图片数据。
输出：
  public/tve4/blocked.bin  128x96，1=墙
  public/tve4/arena.png    2048x1536 背景
"""

import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "tve4")
os.makedirs(OUT, exist_ok=True)

GW, GH = 128, 96
IW, IH = 2048, 1536
rnd = random.Random(40334)

# 房间布局（游戏格坐标）：主战场 + 周边小房间，全部由走廊连接
# 每个房间 (x, y, w, h)
ROOMS = [
    (10, 10, 28, 26),   # 左上
    (48, 8, 34, 30),    # 中上（主战场之一）
    (92, 12, 26, 24),   # 右上
    (10, 46, 26, 30),   # 左下
    (46, 48, 36, 34),   # 中央大厅
    (92, 48, 26, 32),   # 右下
    (48, 88, 34, 6),    # 下方走廊房间
]
# 走廊 (x1,y1,x2,y2,width)
CORRIDORS = [
    (38, 22, 48, 22, 4),
    (82, 22, 92, 22, 4),
    (24, 36, 24, 46, 4),
    (64, 38, 64, 48, 5),
    (105, 36, 105, 48, 4),
    (36, 60, 46, 60, 4),
    (82, 64, 92, 64, 4),
    (64, 82, 64, 88, 5),
]

# 出生点（游戏格）：分布在中央大厅与右侧
ELF_STARTS = [(55, 55), (73, 55), (55, 73)]
TROLL_START = (73, 73)


def build_blocked():
    blocked = bytearray([1]) * (GW * GH)

    def set_open(x, y):
        if 0 <= x < GW and 0 <= y < GH:
            blocked[y * GW + x] = 0

    for rx, ry, rw, rh in ROOMS:
        for y in range(ry, ry + rh):
            for x in range(rx, rx + rw):
                set_open(x, y)
                # 房间内随机小障碍（柱子）
                if rnd.random() < 0.018 and 2 < x - rx < rw - 3 and 2 < y - ry < rh - 3:
                    blocked[y * GW + x] = 1
    for x1, y1, x2, y2, width in CORRIDORS:
        steps = max(abs(x2 - x1), abs(y2 - y1))
        for i in range(steps + 1):
            x = round(x1 + (x2 - x1) * i / max(1, steps))
            y = round(y1 + (y2 - y1) * i / max(1, steps))
            for dy in range(width):
                for dx in range(width):
                    set_open(x + dx - width // 2, y + dy - width // 2)
    # 出生点周围 3x3 清空
    for gx, gy in ELF_STARTS + [TROLL_START]:
        for y in range(gy - 2, gy + 3):
            for x in range(gx - 2, gx + 3):
                set_open(x, y)
    return blocked


def draw_map(blocked):
    CW, CH = IW / GW, IH / GH
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
            base = (
                int(188 + 44 * k),
                int(206 + 36 * k),
                int(216 + 30 * k),
            )
            grit = rnd.randint(-6, 6)
            px[x, y] = tuple(max(0, min(255, c + grit)) for c in base)
    d = ImageDraw.Draw(img, "RGBA")

    # 冰面斑块与雪堆
    for _ in range(150):
        gx = rnd.randrange(GW)
        gy = rnd.randrange(GH)
        if blocked[gy * GW + gx]:
            continue
        cx = (gx + rnd.random()) * CW
        cy = (gy + rnd.random()) * CH
        r = rnd.uniform(5, 18)
        d.ellipse([cx - r, cy - r * 0.55, cx + r, cy + r * 0.55], fill=(158, 198, 214, rnd.randint(20, 46)))
    for _ in range(240):
        gx = rnd.randrange(GW)
        gy = rnd.randrange(GH)
        if blocked[gy * GW + gx]:
            continue
        cx = (gx + rnd.random()) * CW
        cy = (gy + rnd.random()) * CH
        r = rnd.uniform(6, 16)
        d.ellipse([cx - r, cy - r * 0.4, cx + r, cy + r * 0.4], fill=(246, 251, 253, rnd.randint(30, 70)))

    # 墙体：多面石块 + 四面雪帽
    for gy in range(GH):
        for gx in range(GW):
            if not blocked[gy * GW + gx]:
                continue
            x0, y0 = gx * CW, gy * CH
            x1, y1 = x0 + CW, y0 + CH
            d.rectangle([x0, y0, x1, y1], fill=(54, 68, 80, 255))
            d.rectangle([x0 + 2, y0 + 2, x1 - 2, y0 + CH * 0.40], fill=(118, 134, 146, 255))
            d.rectangle([x0 + 2, y0 + CH * 0.45, x1 - 2, y1 - 2], fill=(76, 92, 104, 255))
            d.line([x0 + 2, y0 + CH * 0.42, x1 - 2, y0 + CH * 0.42], fill=(32, 44, 54, 200), width=2)
            if gy > 0 and not blocked[(gy - 1) * GW + gx]:
                d.rectangle([x0, y0 - 1, x1, y0 + 5], fill=(244, 250, 253, 245))
            if gy < GH - 1 and not blocked[(gy + 1) * GW + gx]:
                d.rectangle([x0, y1 - 4, x1, y1], fill=(220, 232, 240, 210))
            if gx > 0 and not blocked[gy * GW + gx - 1]:
                d.rectangle([x0 - 1, y0, x0 + 5, y1], fill=(240, 248, 251, 230))
            if gx < GW - 1 and not blocked[gy * GW + gx + 1]:
                d.rectangle([x1 - 4, y0, x1, y1], fill=(214, 228, 238, 205))
            if rnd.random() < 0.18:
                cx = x0 + rnd.random() * CW
                cy = y0 + rnd.random() * CH
                d.line([cx, cy, cx + rnd.uniform(-7, 7), cy + rnd.uniform(4, 11)], fill=(28, 40, 50, 130), width=2)

    # 脚印 / 霜点
    for _ in range(5200):
        gx = rnd.randrange(GW)
        gy = rnd.randrange(GH)
        if blocked[gy * GW + gx]:
            continue
        x = (gx + rnd.random()) * CW
        y = (gy + rnd.random()) * CH
        if rnd.random() < 0.6:
            d.ellipse([x, y, x + 2, y + 2], fill=(255, 255, 255, rnd.randint(40, 115)))
        else:
            d.ellipse([x, y, x + 3, y + 1], fill=(76, 98, 112, rnd.randint(18, 50)))

    img.save(os.path.join(OUT, "arena.png"))
    print("wrote arena.png", img.size)


def main():
    blocked = build_blocked()
    open(os.path.join(OUT, "blocked.bin"), "wb").write(blocked)
    print("wrote blocked.bin, walls:", sum(blocked))
    draw_map(blocked)
    # 布局数据导出，供代码使用（避免硬编码不一致）
    with open(os.path.join(OUT, "world.json"), "w", encoding="utf-8") as f:
        import json
        json.dump({
            "grid": [GW, GH],
            "rooms": ROOMS,
            "corridors": CORRIDORS,
            "elfStarts": ELF_STARTS,
            "trollStart": TROLL_START,
        }, f)


if __name__ == "__main__":
    main()
