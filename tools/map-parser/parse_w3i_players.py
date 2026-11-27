"""Parse W3I player records from the known player-count offset."""
import struct
from pathlib import Path

d = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted\war3map.w3i").read_bytes()
off = 296
count = struct.unpack_from("<I", d, off)[0]
off += 4
print("players", count)
for n in range(count):
    pnum, ptype, race, fixed = struct.unpack_from("<4I", d, off)
    off += 16
    end = d.find(b"\0", off)
    raw = d[off:end]
    off = end + 1
    try:
        name = raw.decode("utf-8")
    except UnicodeDecodeError:
        name = raw.decode("gbk", errors="replace")
    x, y = struct.unpack_from("<2f", d, off)
    off += 8
    ally_low, ally_high = struct.unpack_from("<2I", d, off)
    off += 8
    print(f"{n:2d}: num={pnum} type={ptype} race={race} fixed={fixed} name={name!r} start=({x:.1f},{y:.1f}) ally=({ally_low:#x},{ally_high:#x})")
print("offset", off, "remaining", len(d) - off)
forces = struct.unpack_from("<I", d, off)[0]
off += 4
print("forces", forces)
for n in range(forces):
    flag = struct.unpack_from("<I", d, off)[0]
    mask = struct.unpack_from("<I", d, off + 4)[0]
    off += 8
    end = d.find(b"\0", off)
    raw = d[off:end]
    off = end + 1
    try:
        name = raw.decode("utf-8")
    except UnicodeDecodeError:
        name = raw.decode("gbk", errors="replace")
    print(f"force {n}: flag={flag} mask={mask:#x} name={name!r}")
