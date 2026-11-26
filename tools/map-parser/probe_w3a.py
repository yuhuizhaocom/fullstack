"""Heuristic w3a parser (M0 research, read-only)."""

import struct

p = r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted\war3map.w3a"
d = open(p, "rb").read()
version, count = struct.unpack_from("<II", d, 0)
print("version", version, "count", count)
off = 8
abilities = []
try:
    for _ in range(count):
        aid = d[off:off + 4].decode("ascii")
        newid = d[off + 4:off + 8]
        off += 8
        nfields = struct.unpack_from("<I", d, off)[0]
        off += 4
        fields = []
        ok = True
        for _ in range(nfields):
            if off + 8 > len(d):
                ok = False
                break
            name = d[off:off + 4].decode("ascii", errors="replace")
            typ = d[off + 4]
            off += 8  # name + type + 3 padding
            if typ == 3:  # string
                lvl = struct.unpack_from("<I", d, off)[0]
                off += 8  # level + ?
                end = d.find(b"\0", off)
                if end < 0 or end - off > 4000:
                    ok = False
                    break
                val = d[off:end].decode("utf-8", errors="replace")
                off = end + 5  # 结尾 0 + 固定 4 字节填充
                fields.append((name, typ, lvl, val))
            elif typ == 2:  # real
                lvl = struct.unpack_from("<I", d, off)[0]
                val = struct.unpack_from("<f", d, off + 8)[0]
                off += 16
                fields.append((name, typ, lvl, val))
            elif typ in (0, 1):  # int-ish
                lvl = struct.unpack_from("<I", d, off)[0]
                val = struct.unpack_from("<i", d, off + 8)[0]
                off += 16
                fields.append((name, typ, lvl, val))
            else:
                ok = False
                break
        abilities.append((aid, newid.hex(), nfields, fields))
        if not ok:
            print("STOP at ability", aid, "offset", off)
            break
    print("parsed", len(abilities), "abilities, end offset", off, "of", len(d))
    for aid, newid, n, fields in abilities[:10]:
        print(aid, "new", newid, "fields", n, fields[:4])
except Exception as e:
    print("ERROR", type(e).__name__, e, "offset", off)
