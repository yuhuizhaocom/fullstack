"""Parse war3map.w3a v2 into ability field records (read-only research tool)."""

import json
import os
import struct
import sys

DEFAULT = r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted\war3map.w3a"


def parse(path=DEFAULT):
    d = open(path, "rb").read()
    version, count = struct.unpack_from("<II", d, 0)
    off = 8
    out = []
    for _ in range(count):
        aid = d[off:off + 4].decode("ascii", errors="replace")
        off += 8  # original id + new id
        nfields = struct.unpack_from("<I", d, off)[0]
        off += 4
        fields = []
        for _ in range(nfields):
            if off + 8 > len(d):
                break
            name = d[off:off + 4].decode("ascii", errors="replace")
            typ = d[off + 4]
            off += 8
            lvl = struct.unpack_from("<I", d, off)[0]
            if typ == 3:
                off += 8
                end = d.find(b"\0", off)
                if end < 0:
                    break
                val = d[off:end].decode("utf-8", errors="replace")
                off = end + 5
            elif typ == 2:
                val = struct.unpack_from("<f", d, off + 8)[0]
                off += 16
            else:
                val = struct.unpack_from("<i", d, off + 8)[0]
                off += 16
            fields.append({"name": name, "type": typ, "level": lvl, "value": val})
        out.append({"id": aid, "fields": fields})
    return version, out


if __name__ == "__main__":
    version, abilities = parse()
    print("version", version, "abilities", len(abilities), file=sys.stderr)
    wanted = set(sys.argv[1:]) or None
    for a in abilities:
        if wanted and a["id"] not in wanted:
            continue
        print("=" * 60)
        print("ABILITY", a["id"], "fields", len(a["fields"]))
        for f in a["fields"]:
            v = f["value"]
            if isinstance(v, float):
                v = round(v, 4)
            print(f"  L{f['level']:>2} {f['name']:<6} t{f['type']} = {v}")
