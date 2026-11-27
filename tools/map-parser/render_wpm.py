"""Render war3map.wpm to PNG with original map rects and spawn markers."""
import struct
from pathlib import Path
from PIL import Image, ImageDraw

E = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")
W, H = 1536, 1152
d = (E / "war3map.wpm").read_bytes()
cells = d[16:16 + W * H]
img = Image.new("RGB", (W, H), (255, 255, 255))
pix = img.load()
for y in range(H):
    for x in range(W):
        if cells[y * W + x] & 2:
            pix[x, y] = (40, 50, 60)
        else:
            v = cells[y * W + x]
            if v == 64:
                pix[x, y] = (235, 242, 246)
            elif v == 72:
                pix[x, y] = (190, 205, 215)
            elif v == 10:
                pix[x, y] = (180, 200, 220)
            else:
                pix[x, y] = (220, 230, 235)
draw = ImageDraw.Draw(img)
ox, oy = -24640, -18496


def px(x, y):
    return int((x - ox) / 32), int((y - oy) / 32)


rects = {
    0: (-15744, -14880, -736, -1536),
    1: (-736, -896, 15392, 15424),
    2: (0, -11872, 10144, -1920),
    3: (9760, -15008, 15712, -7296),
    4: (-24544, 7104, -16448, 15456),
    5: (-26688, -14624, -16480, -4320),
    6: (-26688, -14720, -16448, 6752),
    7: (-15968, -768, -992, 15552),
}
colors = [(255, 0, 0), (0, 128, 255), (0, 180, 0), (255, 140, 0), (160, 0, 200), (0, 180, 180), (200, 160, 0), (255, 0, 160)]
for mid, (x0, y0, x1, y1) in rects.items():
    a, b = px(x0, y0)
    c, e = px(x1, y1)
    draw.rectangle([a, b, c, e], outline=colors[mid], width=3)
    draw.text((a + 6, b + 4), f"MAP{mid}", fill=colors[mid])

points = [
    ("T0", -8064, -8704), ("T1", 7680, 6400), ("T2", 4480, -6016), ("T3", 14464, -9856),
    ("T4", -20480, 11008), ("T5", -21504, -9728), ("T6", -21504, 1664), ("T7", -8320, 6272),
    ("A0", -8323.4, -2099.4), ("A1", 10106.9, -357), ("A2", 8477.3, -10503.2),
    ("A3", 10541.8, -7914.8), ("A5", -21507.5, -3956.7), ("A7", -6909.7, 550.5),
]
for label, x, y in points:
    a, b = px(x, y)
    draw.ellipse([a - 4, b - 4, a + 4, b + 4], fill=(255, 0, 0), outline=(0, 0, 0))
    draw.text((a + 6, b - 4), label, fill=(120, 0, 0))

img = img.resize((W // 2, H // 2), Image.Resampling.NEAREST)
img.save(Path("docs/research/wpm-map.png"))
print("wrote docs/research/wpm-map.png")
