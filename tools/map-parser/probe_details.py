import struct
from pathlib import Path
E = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")
# doodad ids positions
d = (E / "war3map.doo").read_bytes()
pos = []
i = 16
while i < len(d) - 4:
    tok = d[i:i+4]
    if tok[:2] == b"WT" or (tok.isalpha() and tok.isupper()):
        pos.append((i, tok.decode("ascii", "replace")))
    i += 1
print("doo candidate ids", len(pos), "first", pos[:12])
# unique ids by scanning 4-byte ascii uppercase sequences at every 4th offset
ids = {}
for i in range(16, len(d) - 4, 4):
    tok = d[i:i+4]
    if all(65 <= c <= 90 or 48 <= c <= 57 for c in tok):
        ids.setdefault(tok.decode(), 0)
        ids[tok.decode()] += 1
print("doo id histogram (top)", sorted(ids.items(), key=lambda x:-x[1])[:15])
# w3i strings
w = (E / "war3map.w3i").read_bytes()
off = 12
for n in range(8):
    end = w.find(b"\0", off)
    s = w[off:end].decode("utf-8", "replace")
    print("w3i str", n, repr(s[:120]))
    off = end + 1
