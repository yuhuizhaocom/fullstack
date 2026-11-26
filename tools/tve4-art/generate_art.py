"""从零绘制 tve4 的角色与建筑素材（纯 PIL，不读取任何旧资源）。

输出（public/tve4/）：
  hero_elf.png    576x512  6列x4行：idle / walk / attack / death
  hero_troll.png  576x512  同上
  b_wall.png      96x96
  b_tower.png     96x128
  b_mine.png      96x96
  b_tent.png      96x80
"""

import math
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "tve4")
os.makedirs(OUT, exist_ok=True)

FW, FH = 96, 128
COLS, ROWS = 6, 4
SS = 2  # 超采样


def poly(d, pts, fill, outline=None, width=2):
    d.polygon([(int(x), int(y)) for x, y in pts], fill=fill)
    if outline:
        d.line([(int(x), int(y)) for x, y in pts] + [(int(pts[0][0]), int(pts[0][1]))], fill=outline, width=width, joint="curve")


def ellipse(d, box, fill, outline=None, width=2):
    d.ellipse(tuple(int(v) for v in box), fill=fill, outline=outline, width=width)


def new_frame():
    img = Image.new("RGBA", (FW * SS, FH * SS), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img, "RGBA")


def finish_frame(img):
    return img.resize((FW, FH), Image.LANCZOS)


# ---------------------------------------------------------------- 精灵
def draw_elf(col, row):
    img, d = new_frame()
    S = SS
    phase = col / COLS * math.tau
    death = row == 3
    attack = row == 2
    walk = row == 1
    tilt = 0.0

    if death:
        tilt = min(1.0, (col + 1) / COLS) * 1.15
    bob = 0.0
    if not death:
        bob = math.sin(phase) * (2.4 if walk else 1.0)

    cx = FW / 2 * S
    base = (FH - 10) * S
    cy = base - bob * S

    def P(x, y):
        return (cx + x * S, cy + y * S)

    # 腿 / 靴子
    swing = math.sin(phase) * 8 if walk else 0
    for sgn in (-1, 1):
        lx = sgn * 9 * S + (swing * S if sgn < 0 else -swing * S)
        poly(d, [P(sgn * 4 - 5, -30), P(sgn * 4 + 5, -30), P(sgn * 5 + lx / S - cx / S + sgn * 9, -2), P(sgn * 5 - 6 + lx / S - cx / S + sgn * 9, -2)],
             (44, 58, 46, 255), (20, 30, 24, 255), 2)
        ellipse(d, [P(sgn * 9 - 8, -6)[0], P(sgn * 9 - 8, -6)[1], P(sgn * 9 + 8, 0)[0], P(sgn * 9 + 8, 0)[1]], (74, 52, 34, 255), (30, 20, 14, 255), 2)

    # 身体（绿色长袍）
    poly(d, [P(-13, -30), P(13, -30), P(17, -66), P(-17, -66)], (46, 118, 72, 255), (18, 58, 38, 255), 2)
    poly(d, [P(-3, -30), P(3, -30), P(6, -66), P(-6, -66)], (34, 92, 58, 255))
    # 腰带
    d.rectangle([P(-14, -40)[0], P(-14, -40)[1], P(14, -35)[0], P(14, -35)[1]], fill=(120, 86, 48, 255))
    d.rectangle([P(-5, -40)[0], P(-5, -40)[1], P(5, -35)[0], P(5, -35)[1]], fill=(220, 188, 96, 255))

    # 手臂 + 弓
    draw_y = -54 - (6 * S if attack else 0)
    if attack:
        poly(d, [P(-16, -60), P(-22, draw_y / S), P(-30, -66), P(-24, -58)], (46, 118, 72, 255), (18, 58, 38, 255), 2)
        # 弓（左侧竖弧）
        bx = cx - 34 * S
        d.arc([bx - 10 * S, cy - 92 * S, bx + 10 * S, cy - 34 * S], 70, 290, fill=(150, 104, 54, 255), width=3 * S)
        d.line([(bx, cy - 92 * S), (bx, cy - 34 * S)], fill=(230, 226, 210, 255), width=S)
        # 箭
        d.line([(bx - 2 * S, cy - 62 * S), (cx + 6 * S, cy - 62 * S)], fill=(220, 210, 180, 255), width=2 * S)
    else:
        poly(d, [P(-16, -60), P(-26, -46), P(-22, -42), P(-14, -56)], (46, 118, 72, 255), (18, 58, 38, 255), 2)
        bx = cx - 26 * S
        d.arc([bx - 9 * S, cy - 86 * S, bx + 9 * S, cy - 40 * S], 75, 285, fill=(150, 104, 54, 255), width=3 * S)

    # 头 + 兜帽
    ellipse(d, [P(-13, -98)[0], P(-13, -98)[1], P(13, -66)[0], P(13, -66)[1]], (224, 186, 148, 255), (90, 60, 40, 255), 2)
    poly(d, [P(-17, -72), P(17, -72), P(13, -102), P(-11, -102)], (34, 104, 66, 255), (16, 54, 34, 255), 2)
    poly(d, [P(-17, -72), P(-19, -82), P(-11, -102), P(-13, -74)], (26, 82, 52, 255))
    # 尖耳
    poly(d, [P(-13, -84), P(-22, -90), P(-13, -78)], (224, 186, 148, 255), (90, 60, 40, 255), 1)
    # 眼睛
    ellipse(d, [P(-8, -86)[0], P(-8, -86)[1], P(-4, -82)[0], P(-4, -82)[1]], (28, 34, 30, 255))
    ellipse(d, [P(4, -86)[0], P(4, -86)[1], P(8, -82)[0], P(8, -82)[1]], (28, 34, 30, 255))

    if death:
        # 死亡：整体压扁并旋转（用镜像模拟倒地）
        img = img.rotate(-tilt * 55, resample=Image.BICUBIC, expand=False, center=(cx, cy))
    return finish_frame(img)


# ---------------------------------------------------------------- 巨魔
def draw_troll(col, row):
    img, d = new_frame()
    S = SS
    phase = col / COLS * math.tau
    death = row == 3
    attack = row == 2
    walk = row == 1
    tilt = min(1.0, (col + 1) / COLS) * 1.15 if death else 0

    bob = math.sin(phase) * (2.0 if walk else 0.8) if not death else 0
    cx = FW / 2 * S
    cy = (FH - 6) * S - bob * S

    def P(x, y):
        return (cx + x * S, cy + y * S)

    SKIN = (108, 132, 92, 255)
    SKIN_D = (74, 94, 64, 255)
    SKIN_L = (138, 160, 114, 255)

    swing = math.sin(phase) * 7 if walk else 0
    for sgn in (-1, 1):
        off = swing if sgn < 0 else -swing
        poly(d, [P(sgn * 6 - 9, -26), P(sgn * 6 + 9, -26), P(sgn * 7 + off + 10, -2), P(sgn * 7 + off - 10, -2)],
             SKIN_D, (40, 54, 36, 255), 2)
        ellipse(d, [P(sgn * 7 + off - 11, -6)[0], P(sgn * 7 + off - 11, -6)[1], P(sgn * 7 + off + 11, 0)[0], P(sgn * 7 + off + 11, 0)[1]],
                 (62, 48, 34, 255), (30, 22, 16, 255), 2)

    # 躯干
    poly(d, [P(-24, -28), P(24, -28), P(28, -74), P(-28, -74)], SKIN, (40, 54, 36, 255), 3)
    poly(d, [P(-24, -28), P(-6, -28), P(-10, -74), P(-28, -74)], SKIN_L)
    poly(d, [P(-20, -30), P(20, -30), P(22, -42), P(-22, -42)], (86, 52, 38, 255), (40, 24, 18, 255), 2)

    # 手臂 + 棒子
    club_ang = -0.7 + (0.5 if attack else 0) + math.sin(phase) * 0.1
    hx, hy = 26, -60
    ex = hx + math.cos(club_ang) * 30
    ey = hy + math.sin(club_ang) * 30 - (10 if attack else 0)
    poly(d, [P(hx - 8, hy + 4), P(hx + 10, hy - 4), P(ex, ey), P(ex - 6, ey + 10)], SKIN, (40, 54, 36, 255), 2)
    # 棒
    poly(d, [P(ex - 5, ey + 4), P(ex + 5, ey - 4), P(ex + 14, ey - 30), P(ex + 2, ey - 34)], (110, 78, 46, 255), (56, 38, 24, 255), 2)
    ellipse(d, [P(ex + 1, ey - 38)[0], P(ex + 1, ey - 38)[1], P(ex + 15, ey - 24)[0], P(ex + 15, ey - 24)[1]],
             (132, 94, 56, 255), (56, 38, 24, 255), 2)
    # 另一只手
    poly(d, [P(-26, -60), P(-34, -44), P(-28, -40), P(-18, -56)], SKIN, (40, 54, 36, 255), 2)

    # 头
    ellipse(d, [P(-22, -106)[0], P(-22, -106)[1], P(22, -68)[0], P(22, -68)[1]], SKIN, (40, 54, 36, 255), 3)
    poly(d, [P(-20, -84), P(20, -84), P(16, -66), P(-16, -66)], SKIN_D, (40, 54, 36, 255), 2)
    # 獠牙
    poly(d, [P(-13, -76), P(-9, -76), P(-11, -66)], (240, 236, 218, 255))
    poly(d, [P(9, -76), P(13, -76), P(11, -66)], (240, 236, 218, 255))
    # 眼睛
    ellipse(d, [P(-13, -94)[0], P(-13, -94)[1], P(-5, -88)[0], P(-5, -88)[1]], (190, 58, 48, 255))
    ellipse(d, [P(5, -94)[0], P(5, -94)[1], P(13, -88)[0], P(13, -88)[1]], (190, 58, 48, 255))
    ellipse(d, [P(-10, -92)[0], P(-10, -92)[1], P(-7, -89)[0], P(-7, -89)[1]], (30, 20, 18, 255))
    ellipse(d, [P(7, -92)[0], P(7, -92)[1], P(10, -89)[0], P(10, -89)[1]], (30, 20, 18, 255))

    if death:
        img = img.rotate(-tilt * 55, resample=Image.BICUBIC, expand=False, center=(cx, cy))
    return finish_frame(img)


def build_sheet(fn, path):
    sheet = Image.new("RGBA", (FW * COLS, FH * ROWS), (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            sheet.paste(fn(col, row), (col * FW, row * FH))
    sheet.save(path)
    print("wrote", os.path.relpath(path, ROOT), sheet.size)


# ---------------------------------------------------------------- 建筑
def draw_wall(level):
    img = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    tint = [ (96,108,116), (110,120,128), (128,138,146) ][min(level, 2)]
    d.rectangle([6, 22, 90, 92], fill=(58, 72, 82, 255), outline=(28, 38, 46, 255), width=3)
    d.rectangle([10, 26, 86, 56], fill=tint + (255,))
    d.line([12, 58, 84, 58], fill=(36, 48, 56, 200), width=3)
    d.line([48, 58, 48, 90], fill=(36, 48, 56, 180), width=3)
    d.rectangle([6, 16, 90, 26], fill=(238, 246, 250, 245))
    d.rectangle([6, 16, 90, 20], fill=(255, 255, 255, 255))
    return img


def draw_tower(level):
    img = Image.new("RGBA", (96, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([20, 40, 76, 124], fill=(74, 88, 96, 255), outline=(30, 42, 50, 255), width=3)
    d.rectangle([14, 30, 82, 48], fill=(104, 116, 124, 255), outline=(30, 42, 50, 255), width=3)
    poly(d, [(10, 30), (48, 6), (86, 30)], (48, 92, 66, 255), (24, 52, 36, 255), 3)
    d.rectangle([14, 26, 82, 32], fill=(238, 246, 250, 240))
    d.rectangle([42, 66, 54, 86], fill=(30, 40, 46, 255))
    if level >= 1:
        poly(d, [(30, 46), (48, 24), (66, 46)], (214, 186, 96, 255), (120, 90, 40, 255), 2)
    if level >= 2:
        d.ellipse([40, 10, 56, 26], fill=(150, 230, 255, 220))
    return img


def draw_mine(level):
    img = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([10, 28, 86, 90], fill=(70, 82, 90, 255), outline=(30, 40, 48, 255), width=3)
    d.polygon([(22, 84), (30, 34), (66, 34), (74, 84)], fill=(36, 44, 50, 255))
    d.ellipse([38, 52, 58, 84], fill=(16, 22, 26, 255))
    d.rectangle([16, 22, 80, 34], fill=(238, 246, 250, 235))
    d.rectangle([28, 60, 68, 66], fill=(180, 150, 70, 255))
    return img


def draw_tent(level):
    img = Image.new("RGBA", (96, 80), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    poly(d, [(48, 8), (88, 72), (8, 72)], (44, 112, 72, 255), (20, 58, 38, 255), 3)
    poly(d, [(48, 8), (48, 72), (8, 72)], (34, 92, 58, 255))
    poly(d, [(40, 72), (56, 72), (56, 44), (40, 44)], (60, 42, 28, 255))
    d.rectangle([46, 6, 50, 14], fill=(220, 188, 96, 255))
    return img


def main():
    build_sheet(draw_elf, os.path.join(OUT, "hero_elf.png"))
    build_sheet(draw_troll, os.path.join(OUT, "hero_troll.png"))
    for name, fn, lv in [
        ("b_wall.png", draw_wall, 2),
        ("b_tower.png", draw_tower, 2),
        ("b_mine.png", draw_mine, 0),
        ("b_tent.png", draw_tent, 0),
    ]:
        im = fn(lv)
        im.save(os.path.join(OUT, name))
        print("wrote", name, im.size)


if __name__ == "__main__":
    main()
