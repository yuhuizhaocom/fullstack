"""Dump original shop items with costs and descriptions into a UTF-8 research doc."""

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import parse_slk  # noqa: E402

UNITS = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted\Units")
OUT = ROOT / "docs" / "research" / "local-item-summary.md"

SHOPS = ["u03I", "u03J", "u03K", "u03L", "u03M", "u03N", "o003"]


def func(path):
    secs = {}
    cur = None
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        m = re.match(r"^\[([^\]]+)\]$", line)
        if m:
            cur = m.group(1)
            secs[cur] = {}
        elif cur and "=" in line:
            k, v = line.split("=", 1)
            secs[cur][k] = v
    return secs


def main():
    uf = func(UNITS / "CampaignUnitFunc.txt")
    item_func = func(UNITS / "ItemFunc.txt")
    _cols, item_rows = parse_slk.parse_slk(str(UNITS / "ItemData.slk"))

    ids = []
    for shop in SHOPS:
        raw = uf.get(shop, {}).get("Sellitems") or uf.get(shop, {}).get("Makeitems") or ""
        ids += [x.strip() for x in raw.split(",") if x.strip()]

    lines = ["# 原版商店物品（ItemData.slk + ItemFunc.txt 直读）", ""]
    seen = set()
    for shop in SHOPS:
        raw = uf.get(shop, {}).get("Sellitems") or uf.get(shop, {}).get("Makeitems") or ""
        shop_ids = [x.strip() for x in raw.split(",") if x.strip()]
        lines.append(f"## {shop} {uf.get(shop, {}).get('Name', '')}")
        for iid in shop_ids:
            if iid in seen:
                continue
            seen.add(iid)
            row = item_rows.get(iid, {})
            gold = row.get("goldcost") or "0"
            lumber = row.get("lumbercost") or "0"
            desc = item_func.get(iid, {}).get("Ubertip", "").replace("\n", " ")
            lines.append(f"- **{iid}** 金{gold} 木{lumber} — {desc[:160]}")
        lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"dumped {len(seen)} items to {OUT}")


if __name__ == "__main__":
    main()
