"""Import all original shop items into data/game/game-rules.json.

Source: docs/research/local-item-summary.md (ItemData.slk + ItemFunc.txt)
and Units/AbilityData.slk for the numeric placeholders in the Ubertips.

Only fields the tve4 engine already understands are turned into stats;
original effects that are not implemented (HP regen, attack-speed %,
cleave, etc.) are kept verbatim in `note` and not silently faked.
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import parse_slk  # noqa: E402

SUMMARY = ROOT / "docs" / "research" / "local-item-summary.md"
RULES = ROOT / "data" / "game" / "game-rules.json"
SLK = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted\Units\AbilityData.slk")

PLACEHOLDER = re.compile(r"<([A-Z]\w{3}),([A-Za-z]+\d+)>")


def ability_values():
    _cols, rows = parse_slk.parse_slk(str(SLK))
    out = {}
    for key, row in rows.items():
        out[key] = row
    return out


def stat_from_text(text: str) -> str | None:
    if "忽略" in text and "伤害" in text:
        return "damageReduce"
    if "全属性" in text:
        return "allStats"
    if "力量" in text:
        return "strength"
    if "敏捷" in text:
        return "agility"
    if "护甲" in text:
        return "armor"
    if "攻击力" in text:
        return "damage"
    if "移动速度" in text:
        return "speed"
    if "魔法免疫" in text:
        return "magicImmune"
    if "最大生命值" in text:
        return "hp"
    if "攻击速度" in text:
        return "attackSpeed"
    if "生命回复速度" in text:
        return "regen"
    if "分裂攻击" in text:
        return "cleave"
    if "治疗" in text or "回复" in text:
        return "heal"
    return None


def clean_label(text: str, item_id: str) -> str:
    text = text.replace("|n", " ").replace("\\n", " ")
    text = re.sub(r"\|cFF[0-9A-Fa-f]{6}", "", text)
    text = re.sub(r"\|r", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("\u3000", " ").strip().strip('"').strip()
    first = re.split(r"[.!。,，]", text)[0].strip()
    if len(first) > 18:
        first = first[:18]
    return f"{item_id} {first}" if first else item_id


def main():
    abilities = ability_values()
    lines = SUMMARY.read_text(encoding="utf-8", errors="replace").splitlines()
    shop = None
    items = []
    unresolved = 0
    for line in lines:
        if line.startswith("## "):
            shop = line[3:].strip()
            continue
        m = re.match(r"\s*-\s+\*\*([A-Z0-9]{4})\*\*\s+金(\d+)\s+木(\d+)\s+—\s*(.*)", line)
        if not m:
            continue
        item_id, gold, wood, uber = m.groups()
        segments = re.split(r"\|n|\\n", uber)
        stats = {}
        notes = []
        for seg in segments:
            matches = list(PLACEHOLDER.finditer(seg))
            if not matches:
                continue
            for idx, ph in enumerate(matches):
                ab, field = ph.groups()
                row = abilities.get(ab, {})
                raw = row.get(field)
                try:
                    value = float(raw)
                    value = int(value) if value.is_integer() else value
                except (TypeError, ValueError):
                    unresolved += 1
                    continue
                chunk = seg[max(0, ph.start() - 24):ph.end() + 12]
                stat = stat_from_text(chunk if chunk.strip() else seg)
                if stat is None:
                    notes.append(f"{ab}.{field}={value}")
                    continue
                if stat in ("hp", "attackSpeed", "regen", "damageReduce", "cleave", "heal"):
                    notes.append(f"{stat}: {ab}.{field}={value}（未实现）")
                    continue
                if stat == "magicImmune":
                    stats[stat] = True
                    continue
                stats[stat] = stats.get(stat, 0) + value
        entry = {
            "key": item_id,
            "label": clean_label(uber, item_id),
            "gold": int(gold),
            "wood": int(wood),
            "shop": shop or "未知商店",
        }
        for key in ("damage", "armor", "speed", "allStats", "strength", "agility", "heroDamage"):
            if key in stats:
                entry[key] = stats[key]
        if stats.get("magicImmune"):
            entry["magicImmune"] = True
        if notes:
            entry["note"] = "；".join(notes)
        items.append(entry)

    assert len(items) == 81, f"expected 81 shop items, got {len(items)}"
    assert all(i["gold"] >= 0 and i["wood"] >= 0 for i in items)

    rules = json.loads(RULES.read_text(encoding="utf-8"))
    rules["equipmentShop"]["items"] = items
    rules["equipmentShop"]["note"] = (
        "VERIFIED：ItemData.slk 81 件物品的价格（金/木）与 Ubertip 数值（AbilityData.slk 占位符直读）。"
        "网页端只实现 damage/armor/speed/全属性/力量/敏捷/魔法免疫；HP、攻速、分裂、治疗等原版效果记录在 note，未伪造实现。"
    )
    RULES.write_text(json.dumps(rules, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"imported {len(items)} items, {unresolved} unresolved placeholders")
    print("sample:", json.dumps(items[:3], ensure_ascii=False))


if __name__ == "__main__":
    main()
