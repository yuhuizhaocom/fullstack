"""Parse war3map.w3i player starts and camera bounds (research only)."""
import struct
from pathlib import Path

P = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted\war3map.w3i")
d = P.read_bytes()
off = 0


def i32():
    global off
    v = struct.unpack_from("<i", d, off)[0]
    off += 4
    return v


def u32():
    global off
    v = struct.unpack_from("<I", d, off)[0]
    off += 4
    return v


def f32():
    global off
    v = struct.unpack_from("<f", d, off)[0]
    off += 4
    return v


def string():
    global off
    end = d.find(b"\0", off)
    if end < 0:
        end = len(d)
    raw = d[off:end]
    off = end + 1
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("gbk", errors="replace")


def bytes4():
    global off
    v = d[off:off + 4]
    off += 4
    return v


version = i32()
save_count = i32()
editor = i32()
name = string()
author = string()
desc = string()
players_text = string()
print("version", version, "save", save_count, "editor", editor)
print("name", repr(name))
print("author", repr(author))
print("players_text", repr(players_text), "offset", off)
print("camera floats", [round(f32(), 2) for _ in range(8)])
print("camera complements", [i32() for _ in range(4)])
print("playable", i32(), i32())
print("flags", i32())
print("tileset", chr(d[off])); off += 1
print("loading screen", i32(), repr(string()), repr(string()), repr(string()), repr(string()))
print("game data set", i32())
print("prologue", repr(string()), repr(string()), repr(string()))
print("fog", i32(), f32(), f32(), f32(), bytes4())
print("weather", i32(), repr(string()), bytes4(), bytes4())
count = i32()
print("player count", count)
for n in range(count):
    pnum = i32()
    ptype = i32()
    race = i32()
    fixed = i32()
    pname = string()
    x = f32()
    y = f32()
    ally_low = i32()
    ally_high = i32()
    print(f"player {n}: num={pnum} type={ptype} race={race} fixed={fixed} name={pname!r} start=({x:.1f},{y:.1f}) ally=({ally_low},{ally_high})")
print("offset after players", off)
# remaining forces
for n in range(u32()):
    print("force", n, "flag", i32(), "playerMask", u32(), "name", repr(string()))
print("remaining", len(d) - off, d[off:off + 40].hex(" "))
