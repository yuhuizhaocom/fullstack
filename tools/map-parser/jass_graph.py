"""Extract JASS function bodies and print a focused call chain for M0 research."""

import os
import re
import sys

JASS = r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted\war3map.j"

text = open(JASS, encoding="utf-8", errors="replace").read()
pattern = re.compile(r"(?m)^function\s+([A-Za-z0-9_]+)\s+takes[^\n]*\n(.*?)^endfunction", re.S | re.M)
funcs = {m.group(1): m.group(2) for m in pattern.finditer(text)}
print("functions", len(funcs), file=sys.stderr)

call_re = re.compile(r"\bcall\s+([A-Za-z0-9_]+)\s*\(")
setcall_re = re.compile(r"\bset\s+[A-Za-z0-9_]+\s*=\s*([A-Za-z0-9_]+)\s*\(")


def calls(body):
    out = []
    for m in call_re.finditer(body):
        out.append(m.group(1))
    for m in setcall_re.finditer(body):
        out.append(m.group(1))
    return [c for c in dict.fromkeys(out) if c in funcs]


def show(name, depth=0, seen=None):
    if seen is None:
        seen = set()
    if name in seen or depth > 2:
        return
    seen.add(name)
    body = funcs.get(name)
    if body is None:
        print("  " * depth + f"- {name}: <native or missing>")
        return
    print("  " * depth + f"- {name}: {len(body.splitlines())} lines")
    for c in calls(body):
        print("  " * (depth + 1) + f"-> {c}")
        if depth < 2:
            show(c, depth + 2, seen)


targets = [
    "s__IRuleEndChecker_check",
    "sc__OldTrollDamageHandler_causeDamage",
    "Trig_SingleTrollDieActions",
    "Trig_DoubleTrollDieActions",
    "Trig_FixTrollDieActions",
    "Trig_RaceTrollDieActions",
    "Trig_DefendTrollDieActions",
    "Trig_ReviveElveDieActions",
]
for t in targets:
    print("=" * 78)
    print("TARGET", t)
    print("=" * 78)
    show(t)
    body = funcs.get(t)
    if body:
        print("--- body ---")
        print(body[:12000])
