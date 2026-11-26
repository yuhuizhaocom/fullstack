"""Validate original/game rule configs (M1 infrastructure, no game logic changes)."""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ORIGINAL = os.path.join(ROOT, "data", "original", "game-rules.json")
GAME = os.path.join(ROOT, "data", "game", "game-rules.json")

EXPECTED_ORIGINAL = {
    "startGold.elf.OLD": 30,
    "startGold.elf.MIDDLE": 10,
    "startGold.troll.OLD": 70,
    "startGold.troll.MIDDLE": 50,
    "heroes.H010.hp": 10,
    "heroes.H010.speed": 250,
    "heroes.H020.hp": 750,
    "heroes.H020.speed": 350,
    "trollAppearSeconds.SINGLE": 30,
    "trollAppearSeconds.FIX": 45,
    "skills.A067.cooldown": 30,
    "skills.A067.duration": 15,
    "skills.A067.moveSpeedBonus": 1.1,
    "skills.A06M.cooldown": 3,
    "skills.A06M.duration": 3,
    "bounty.goldRatio": 0.5,
    "bounty.woodMultiplier": 8,
    "damage.oldLifestealRatio": 0.22,
}


def get(obj, path):
    cur = obj
    for part in path.split("."):
        cur = cur[part]
    return cur


def main():
    errors = []
    for path in (ORIGINAL, GAME):
        if not os.path.isfile(path):
            errors.append("missing file: " + path)
    if errors:
        print("\n".join(errors))
        return 1

    original = json.load(open(ORIGINAL, encoding="utf-8"))
    game = json.load(open(GAME, encoding="utf-8"))

    if original.get("confidence") != "VERIFIED":
        errors.append("original confidence must be VERIFIED")
    if game.get("confidence") != "PROPOSED":
        errors.append("game confidence must be PROPOSED")
    if original.get("version") != 1 or game.get("version") != 1:
        errors.append("version must be 1")

    for path, expected in EXPECTED_ORIGINAL.items():
        try:
            actual = get(original, path)
        except (KeyError, TypeError):
            errors.append("original missing path: " + path)
            continue
        if actual != expected:
            errors.append(f"{path}: expected {expected}, got {actual}")

    if len(original.get("rules", [])) != 9:
        errors.append("original rules must contain 9 entries")
    if len(original.get("modes", [])) != 4:
        errors.append("original modes must contain 4 entries")
    if len(original.get("maps", [])) != 8:
        errors.append("original maps must contain 8 entries")

    if game.get("startGold") != {"elf": 30, "troll": 70}:
        errors.append("web startGold must mirror current data.ts (elf 30 / troll 70)")

    if errors:
        print("FAILED")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: original=%s game=%s checks=%d" % (
        os.path.relpath(ORIGINAL, ROOT), os.path.relpath(GAME, ROOT), len(EXPECTED_ORIGINAL)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
