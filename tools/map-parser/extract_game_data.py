import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(HERE)), "scripts", "tve"))
import parse_slk  # noqa: E402

UNITS = r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted\Units"


def func(path):
    secs = {}
    cur = None
    for line in open(path, encoding="utf-8-sig", errors="replace"):
        line = line.rstrip("\n")
        m = re.match(r"^\[([^\]]+)\]$", line)
        if m:
            cur = m.group(1)
            secs[cur] = {}
        elif cur and "=" in line:
            k, v = line.split("=", 1)
            secs[cur][k] = v
    return secs


key_ids = ["H010", "H020", "u00Y", "e00H", "u03D", "u04B", "u01X", "u030", "h000",
           "u010", "e020", "u00D", "u011", "u01C", "u01F", "u018", "u01B", "u01E", "u01D", "u06P"]

uf = func(os.path.join(UNITS, "CampaignUnitFunc.txt"))
slk = {}
for name in ["UnitBalance", "UnitData", "UnitUI", "UnitWeapons", "UnitAbilities"]:
    _cols, rows = parse_slk.parse_slk(os.path.join(UNITS, name + ".slk"))
    slk[name] = rows

for uid in key_ids:
    print("=" * 70)
    print("ID", uid, "FUNC", uf.get(uid, {}).get("Name", "-"))
    for k in ["Tip", "Ubertip", "Builds", "Requires", "Art"]:
        if uid in uf and k in uf[uid]:
            print(f"  {k}: {uf[uid][k][:220]}")
    for name, rows in slk.items():
        row = rows.get(uid)
        if not row:
            continue
        fields = {k: v for k, v in row.items() if k and k.lower() in {
            "nam", "name", "hp", "hpmax", "armor", "arm", "dmg1", "dmg2", "dmgpoint",
            "agl", "str", "int", "spd", "movspd", "rng", "range", "atkint", "cool",
            "abpx", "abpy", "bld", "goldcost", "lumbercost", "buildtime", "sight",
            "hero", "uname", "desc"
        }}
        print(f"  {name}: {fields}")
