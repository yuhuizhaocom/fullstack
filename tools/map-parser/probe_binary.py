"""Probe headers of original map binary files (read-only research tool)."""
import struct
from pathlib import Path

EXTRACTED = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")

for name in ["war3map.w3e", "war3map.wpm", "war3map.w3i", "war3map.doo", "war3map.shd", "war3map.mmp", "war3map.w3a"]:
    p = EXTRACTED / name
    d = p.read_bytes()
    print("=" * 70)
    print(name, "size", len(d))
    print("first 96 bytes hex:", d[:96].hex(" "))
    if len(d) >= 8:
        a, b = struct.unpack_from("<II", d, 0)
        print("u32[0],u32[1] =", a, b)
    if len(d) >= 16:
        c, e = struct.unpack_from("<II", d, 8)
        print("u32[2],u32[3] =", c, e)
    if name.endswith(("w3e", "wpm", "shd")) and len(d) >= 16:
        print("as i32:", struct.unpack_from("<4i", d, 0))
