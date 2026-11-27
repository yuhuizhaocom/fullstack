"""Dump selected original object-editor data into UTF-8 research docs."""

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import parse_slk  # noqa: E402
import parse_w3a  # noqa: E402

EXTRACTED = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")
OUT = ROOT / "docs" / "research"
OUT.mkdir(parents=True, exist_ok=True)

WANTED_ABILITIES = ["A061", "A0H0", "A02P", "A02R", "A0JP", "A067", "A024", "A0H3", "A0C6", "A070"]
WANTED_UNITS = ["H010", "H020", "u00Y", "e00H", "u03D", "u04B", "u01X", "u030",
                "h000", "h001", "h002", "h003", "h004", "h005", "h006", "h096",
                "u010", "e020", "u011", "u01C", "u01F", "u018", "u01B", "u01E", "u01D", "u06P", "e00Y"]
FIELDS = {"acdn", "adur", "aran", "amcs", "bsk1", "DataA1", "DataB1", "DataC1", "Dur1", "Cool1",
          "Rng1", "Area1", "targs1", "aub1", "atp1"}


def dump_abilities():
    version, abilities = parse_w3a.parse(str(EXTRACTED / "war3map.w3a"))
    lines = [
        "# 原版技能字段（war3map.w3a v2 直读）",
        "",
        f"version={version}, total={len(abilities)}。仅列出关键字段，等级 1~3。",
        "",
    ]
    for a in abilities:
        if a["id"] not in WANTED_ABILITIES:
            continue
        lines.append(f"## {a['id']}")
        for f in a["fields"]:
            if f["name"] not in FIELDS:
                continue
            if f["name"] in {"aub1", "atp1"}:
                continue
            v = f["value"]
            if isinstance(v, float):
                v = round(v, 4)
            lines.append(f"- L{f['level']} {f['name']} = {v}")
        lines.append("")
    (OUT / "local-w3a-summary.md").write_text("\n".join(lines), encoding="utf-8")
    return len(abilities)


def dump_units():
    units = EXTRACTED / "Units"
    columns, rows = parse_slk.parse_slk(str(units / "UnitBalance.slk"))
    _c2, ui = parse_slk.parse_slk(str(units / "UnitUI.slk"))
    lines = ["# 原版单位数值（UnitBalance.slk / UnitUI.slk 直读）", ""]
    for uid in WANTED_UNITS:
        row = rows.get(uid, {})
        line_ui = ui.get(uid, {})
        picked = {k: v for k, v in row.items() if k and k.lower() in {
            "goldcost", "lumbercost", "hp", "spd", "sight", "arm", "dmg1", "dmg2", "cool", "rng"
        }}
        lines.append(f"- **{uid}** {line_ui.get('name', '')} {picked}")
    lines.append("")
    (OUT / "local-unit-summary.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    n = dump_abilities()
    dump_units()
    print(f"dumped {n} abilities")
