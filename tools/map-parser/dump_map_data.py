"""Parse all original map binary/text data into docs/research/local-map-data.md."""

import re
import struct
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
E = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")
OUT = ROOT / "docs" / "research" / "local-map-data.md"

lines = []


def w(s=""):
    lines.append(str(s))


def hex4(d, off):
    return d[off:off + 4].decode("ascii", errors="replace")


def parse_w3e(d):
    w("## war3map.w3e（地形）")
    w(f"- magic={hex4(d, 0)}, version={struct.unpack_from('<I', d, 4)[0]}")
    # v11 header: magic, version, flag bytes, 7 tileset ids, cliff count + ids, width, height
    off = 17
    tilesets = []
    while off + 4 <= len(d) and all(65 <= c <= 90 or 97 <= c <= 122 for c in d[off:off + 4]):
        tilesets.append(hex4(d, off))
        off += 4
    ncliff = struct.unpack_from("<I", d, off)[0]
    off += 4
    cliffs = [hex4(d, off + i * 4) for i in range(ncliff)]
    off += ncliff * 4
    width, height = struct.unpack_from("<II", d, off)
    off += 8
    w(f"- tileset count={len(tilesets)}: {', '.join(tilesets)}")
    w(f"- cliff tilesets={ncliff}: {', '.join(cliffs)}")
    w(f"- size={width} x {height} terrain cells (tile=128 world units)")
    cells = width * height
    w(f"- data offset={off}, file size={len(d)}, cells={cells}, bytes/cell={(len(d) - off) / cells:.3f}")
    heights = struct.unpack_from(f"<{cells}I", d, off)
    ground = d[off + cells * 4:off + cells * 5]
    layer = d[off + cells * 5:off + cells * 6]
    flags = d[off + cells * 6:off + cells * 7]
    w(f"- corner heights: min={min(heights)}, max={max(heights)}, distinct={len(set(heights))}")
    hist = Counter(ground)
    w("- ground layer histogram (raw id → tileset index id>>5, variation id&31):")
    for k, v in hist.most_common(12):
        ts = tilesets[k >> 5] if (k >> 5) < len(tilesets) else "?"
        w(f"  - id {k} ({ts}, var {k & 31}): {v}")
    w(f"- layer heights distinct={len(set(layer))}, flags distinct={len(set(flags))}")


def parse_wpm(d):
    w("## war3map.wpm（可通行性）")
    w(f"- magic={hex4(d, 0)}, version={struct.unpack_from('<I', d, 4)[0]}")
    width, height = struct.unpack_from("<II", d, 8)
    cells = d[16:16 + width * height]
    blocked = sum(1 for c in cells if c & 0x02)
    w(f"- size={width} x {height}, cells={len(cells)}, no-walk(bit 0x02)={blocked} ({blocked / max(1, len(cells)):.1%})")
    hist = Counter(cells)
    w("- value histogram (top 12):")
    for k, v in hist.most_common(12):
        w(f"  - {k}: {v}")
    # downsample 4x4 to 384x288 game grid (as research docs did)
    gw, gh = width // 4, height // 4
    ds = []
    for gy in range(gh):
        row = []
        for gx in range(gw):
            val = any(cells[(gy * 4 + dy) * width + (gx * 4 + dx)] & 0x02 for dy in range(4) for dx in range(4))
            row.append("#" if val else ".")
        ds.append("".join(row))
    w(f"- downsampled full map {gw}x{gh} (first 24 rows, every 8th column):")
    for row in ds[:24]:
        w("  " + row[::8])
    # cropped arena: x=123.155,y=40.46,size=104.04 terrain cells -> wpm pixels *4
    cx, cy, cs = int(123.155 * 4), int(40.46 * 4), int(104.04 * 4)
    crop = []
    for gy in range(64):
        row = []
        for gx in range(64):
            px = cx + gx * cs // 64
            py = cy + gy * cs // 64
            idx = py * width + px
            row.append("#" if idx < len(cells) and cells[idx] & 0x02 else ".")
        crop.append("".join(row))
    w(f"- arena crop ({cx},{cy},{cs}) downsampled 64x64:")
    for row in crop:
        w("  " + row)


def parse_doo(d):
    w("## war3map.doo（装饰物）")
    ver, sub, count = struct.unpack_from("<III", d, 4)
    w(f"- version={ver}, subversion={sub}, doodad count={count}")
    ids = Counter()
    trees = []
    for i in range(count):
        off = 16 + i * 50
        if off + 30 > len(d):
            break
        did = hex4(d, off)
        ids[did] += 1
        flags = struct.unpack_from("<I", d, off + 4)[0]
        x, y, z = struct.unpack_from("<3f", d, off + 8)
        if did == "WTst":
            trees.append((x, y, z, flags))
    w("- type histogram:")
    for k, v in ids.most_common(15):
        w(f"  - {k}: {v}")
    if trees:
        xs = [p[0] for p in trees]
        ys = [p[1] for p in trees]
        w(f"- WTst count={len(trees)}, x range=[{min(xs):.0f}, {max(xs):.0f}], y range=[{min(ys):.0f}, {max(ys):.0f}]")
        w(f"- WTst first 5 positions: {[(round(x), round(y), round(z)) for x, y, z, _ in trees[:5]]}")


def parse_shd(d):
    w("## war3map.shd（阴影图）")
    w(f"- size={len(d)} bytes, expected 1536x1152={1536 * 1152}")
    hist = Counter(d)
    w(f"- distinct byte values={len(hist)}, top={hist.most_common(8)}")


def parse_mmp(d):
    w("## war3map.mmp（小地图图标）")
    count = struct.unpack_from("<I", d, 4)[0]
    w(f"- icon count={count}")
    for i in range(min(count, 30)):
        x, y, kind, color = struct.unpack_from("<4I", d, 8 + i * 16)
        w(f"  - #{i}: x={x}, y={y}, icon={kind}, color={color:#08x}")


def parse_w3i(d):
    w("## war3map.w3i（地图信息）")
    ver, editor, mapver = struct.unpack_from("<III", d, 0)
    w(f"- version={ver}, editor version={editor}, map version={mapver}")
    off = 12
    strings = []
    for n in range(4):
        end = d.find(b"\0", off)
        if end < 0:
            break
        s = d[off:end].decode("utf-8", errors="replace")
        strings.append(s)
        w(f"- string[{n}]={s!r}")
        off = end + 1
    w(f"- suggested players={int(strings[3]) if len(strings) > 3 and strings[3].isdigit() else '?'}")
    w(f"- string bytes end offset={off}")


def parse_jass():
    t = (E / "war3map.j").read_text(encoding="utf-8", errors="replace")
    w("## war3map.j（触发器脚本：常量与区域）")
    consts = []
    for line in t.splitlines():
        m = re.match(r"\s*constant\s+(\w+)\s+(\w+)\s*=\s*(.+)$", line)
        if m:
            consts.append((m.group(1), m.group(2), m.group(3).strip()))
    w(f"- constant declarations: {len(consts)}")
    keywords = ["FINAL_TOWER", "REVIVE", "STOLE", "COLLISION", "SCARE", "ENABLE", "SHARE_VISION", "EXPOSE_VISION", "MAX_ROUND", "APPER", "PRICE", "WOOD", "KRYPTON"]
    shown = 0
    for typ, name, val in consts:
        if name.startswith("si__") or name.startswith("LIBRARY") or "LIBRARY" in name:
            continue
        if any(k in name.upper() for k in keywords):
            w(f"  - {typ} {name} = {val}")
            shown += 1
            if shown >= 160:
                w("  - ... (truncated)")
                break
    # region rectangles from CreateRegions section
    w("- region rectangles (from CreateRegions):")
    in_region = False
    for line in t.splitlines():
        if "CreateRegions" in line and "function" in line:
            in_region = True
        if in_region and "Rect(" in line:
            w("  " + line.strip()[:180])
        if in_region and line.startswith("endfunction"):
            in_region = False
    # preplaced units with exact positions
    preplaced = []
    for line in t.splitlines():
        m = re.match(r"\s*set\s+(gg_unit_\w+)=CreateUnit\(p,'(\w+)',(-?[\d.]+),(-?[\d.]+),([\d.]+)\)", line)
        if m:
            preplaced.append((m.group(1), m.group(2), float(m.group(3)), float(m.group(4))))
    w(f"- preplaced units (CreateUnit): {len(preplaced)}")
    hist = Counter(p[1] for p in preplaced)
    w("- preplaced unit type histogram (top 20):")
    for k, v in hist.most_common(20):
        w(f"  - {k}: {v}")
    for key in ["u03R", "e015", "e013", "n008", "h096"]:
        hits = [p for p in preplaced if p[1] == key]
        if hits:
            w(f"- key preplaced {key} ({len(hits)}): {[(round(x), round(y)) for _, _, x, y in hits[:12]]}")


def parse_abilities():
    import sys
    sys.path.insert(0, str(HERE))
    import parse_w3a
    ver, abilities = parse_w3a.parse(str(E / "war3map.w3a"))
    w("## war3map.w3a（全部技能）")
    w(f"- version={ver}, count={len(abilities)}")
    w("- ids: " + ", ".join(a["id"] for a in abilities))
    w("- full per-ability fields: `local-w3a-all.md` (all 50, key fields), `local-w3a-summary.md` (selected deep).")
    w("- full unit table: `local-unit-all.md`; full shop items: `local-item-summary.md`.")


def parse_object_files():
    units = E / "Units"
    w("## 物编文件规模")
    for p in sorted(units.glob("*")):
        if p.suffix.lower() in {".slk", ".txt"}:
            w(f"- {p.name}: {p.stat().st_size} bytes")


def dump_all_abilities():
    import sys
    sys.path.insert(0, str(HERE))
    import parse_w3a
    ver, abilities = parse_w3a.parse(str(E / "war3map.w3a"))
    keys = {"acdn", "adur", "aran", "amcs", "bsk1", "DataA1", "DataA2", "DataA3", "DataB1", "DataB2",
            "DataC1", "DataC2", "Dur1", "Dur2", "Cool1", "Cool2", "Rng1", "Rng2", "Area1", "Area2", "targs1"}
    doc = ["# 原版全部技能字段（war3map.w3a v2 完整导出）", "", f"version={ver}, count={len(abilities)}", ""]
    for a in abilities:
        doc.append(f"## {a['id']}")
        for f in a["fields"]:
            if f["name"] not in keys:
                continue
            v = round(f["value"], 4) if isinstance(f["value"], float) else f["value"]
            if isinstance(v, str):
                v = v[:160].replace("\n", " ")
            doc.append(f"- L{f['level']} {f['name']} = {v}")
        doc.append("")
    (ROOT / "docs" / "research" / "local-w3a-all.md").write_text("\n".join(doc) + "\n", encoding="utf-8")
    print("wrote local-w3a-all.md")


def dump_all_units():
    import sys
    sys.path.insert(0, str(HERE))
    import parse_slk
    cols, rows = parse_slk.parse_slk(str(E / "Units" / "UnitBalance.slk"))
    _c2, ui = parse_slk.parse_slk(str(E / "Units" / "UnitUI.slk"))
    doc = ["# 原版单位数值（UnitBalance.slk + UnitUI.slk 完整导出）", "",
           f"columns={len(cols)}, units={len(rows)}", ""]
    for uid, row in rows.items():
        picked = {k: v for k, v in row.items() if k in {
            "goldcost", "lumbercost", "HP", "spd", "sight", "arm", "dmg1", "dmg2", "cool", "rng"
        } and v not in (None, "")}
        if not picked:
            continue
        name = ui.get(uid, {}).get("name", "")
        doc.append(f"- **{uid}** {name} {picked}")
    (ROOT / "docs" / "research" / "local-unit-all.md").write_text("\n".join(doc) + "\n", encoding="utf-8")
    print("wrote local-unit-all.md")


def main():
    w("# 原版地图数据完整解析（本地解包直读）")
    w("")
    w("来源：`C:/Users/肥胖的粽子/AppData/Local/Temp/tve_w3x/extracted`。工具：`tools/map-parser/dump_map_data.py`。")
    w("")
    parse_w3e((E / "war3map.w3e").read_bytes())
    w("")
    parse_wpm((E / "war3map.wpm").read_bytes())
    w("")
    parse_doo((E / "war3map.doo").read_bytes())
    w("")
    parse_shd((E / "war3map.shd").read_bytes())
    w("")
    parse_mmp((E / "war3map.mmp").read_bytes())
    w("")
    parse_w3i((E / "war3map.w3i").read_bytes())
    w("")
    parse_jass()
    w("")
    parse_abilities()
    w("")
    parse_object_files()
    dump_all_abilities()
    dump_all_units()
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote", OUT, "lines", len(lines))


if __name__ == "__main__":
    main()
