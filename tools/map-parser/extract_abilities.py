"""Extract ability IDs referenced in JASS and resolve names from CampaignAbilityStrings.txt."""

import os
import re

ROOT = r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted"
JASS = os.path.join(ROOT, "war3map.j")
UNITDIR = os.path.join(ROOT, "Units")

text = open(JASS, encoding="utf-8", errors="replace").read()
pat = re.compile(r"(?:GetUnitAbilityLevel|UnitAddAbility|RemoveUnitAbility|SetUnitAbilityLevel|BlzSetUnitAbilityCooldown|BlzGetUnitAbilityByIndex|IssueImmediateOrderById|IssueTargetOrderById|IssuePointOrderById)\s*\([^\n]*?'([A-Za-z0-9]{4})'", re.I)
ids = sorted(set(m.group(1) for m in pat.finditer(text)))
print("ability ids referenced", len(ids))


def sections(path):
    out, cur = {}, None
    for line in open(path, encoding="utf-8-sig", errors="replace"):
        line = line.rstrip("\n")
        m = re.match(r"^\[([^\]]+)\]$", line)
        if m:
            cur = m.group(1)
            out[cur] = {}
        elif cur and "=" in line:
            k, v = line.split("=", 1)
            out[cur][k] = v
    return out


for fname in ["CampaignAbilityStrings.txt", "CampaignAbilityFunc.txt"]:
    secs = sections(os.path.join(UNITDIR, fname))
    print("==", fname)
    for aid in ids:
        s = secs.get(aid)
        if s:
            print(aid, "|", s.get("Name", "-"), "|", s.get("Art", "-"), "|", s.get("Tip", "-")[:60])
