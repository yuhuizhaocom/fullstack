"""生成 tve4 纯雪地底图：不含墙、不含编号，墙和编号由 map.ts 的元素直接渲染。"""
import math
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "tve4")
IW, IH = 2688, 1536
rnd = random.Random(20261126)

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
for _ in range(220):
    cx, cy = rnd.randrange(IW), rnd.randrange(IH)
    r = rnd.uniform(8, 26)
    d.ellipse([cx - r, cy - r * 0.5, cx + r, cy + r * 0.5], fill=(158, 198, 214, rnd.randint(14, 34)))
for _ in range(320):
    cx, cy = rnd.randrange(IW), rnd.randrange(IH)
    r = rnd.uniform(8, 24)
    d.ellipse([cx - r, cy - r * 0.4, cx + r, cy + r * 0.4], fill=(246, 251, 253, rnd.randint(20, 55)))
for _ in range(9000):
    cx, cy = rnd.randrange(IW), rnd.randrange(IH)
    if rnd.random() < 0.6:
        d.ellipse([cx, cy, cx + 2, cy + 2], fill=(255, 255, 255, rnd.randint(30, 100)))
    else:
        d.ellipse([cx, cy, cx + 3, cy + 1], fill=(76, 98, 112, rnd.randint(12, 40)))

img.save(os.path.join(OUT, "snow.png"))
print("wrote snow.png", img.size)
