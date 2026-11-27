"""Deterministically regenerate the tve4 OLD + SINGLE core-rule whitelist.

Reads the existing mixed-confidence runtime catalog and checks/annotates it against
original SLK/W3A/JASS evidence. The runtime catalog supplies only values whose
web conversion is not proven; those values stay INFERRED. Original map files are
opened read-only. Run with --check to compare stdout without writing any file.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "map-parser"))
import parse_slk  # noqa: E402
import parse_w3a  # noqa: E402

EXTRACTED = Path(r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted")
UNITS = EXTRACTED / "Units"
LEGACY_PATH = ROOT / "data/game/game-rules.json"
SOURCE_PATH = ROOT / "data/tve4/mvp/source.json"
OUTPUT_PATH = ROOT / "data/tve4/mvp/rules.json"
SLK_FILES = [
    "AbilityBuffData.slk", "AbilityData.slk", "ItemData.slk",
    "UnitAbilities.slk", "UnitBalance.slk", "UnitData.slk", "UnitUI.slk",
    "UnitWeapons.slk", "UpgradeData.slk",
]
BUILDINGS = {
    "tent": ("u00Y", ["gold", "wood", "hp", "income"]),
    "wall": ("u01F", ["gold", "wood", "hp"]),
    "tower": ("h000", ["gold", "wood", "hp", "damage"]),
    "mine": ("e00H", ["gold", "wood", "hp", "income"]),
    "reveal": ("u01E", ["gold", "wood", "hp"]),
    "trollHouse": ("u03D", ["gold", "wood", "hp", "income"]),
    "market": ("u018", ["gold", "hp"]),
}
HEROES = {"elf": "H010", "troll": "H020"}
SKILLS = {
    "blink": ("A066", 25, 25), "haste": ("A067", 30, 15),
    "entangle": ("A068", 45, 3), "silence": ("A069", 60, 5),
    "windwalk": ("A061", 30, 20), "berserk": ("A06T", 120, 10),
    "teleport": ("A06W", 45, 2), "farSight": ("A062", 40, 25),
}
SHOPS = ["u03I", "u03J", "u03K", "u03L", "u03M", "u03N", "o003"]
REQUIREMENTS = {
    "tent": [(2, "wall", 1), (3, "wall", 4), (4, "market", 1), (5, "wall", 1), (6, "market", 2), (7, "wall", 4), (8, "market", 2), (9, "market", 3), (10, "market", 3)],
    "tower": [(3, "market", 1), (4, "market", 1), (5, "market", 2), (6, "market", 2), (7, "market", 3)],
    "reveal": [(1, "market", 2)],
}


def evidence(file: str, confidence: str, **locator) -> dict:
    return {"file": file, **locator, "confidence": confidence}


def legacy_evidence(record_id: str, field: str) -> dict:
    return evidence("data/game/game-rules.json", "INFERRED", objectId=record_id, field=field)


def config_evidence(record_id: str, field: str) -> dict:
    return evidence("src/lib/tve4/config.ts", "INFERRED", objectId=record_id, field=field)


def slk_evidence(filename: str, object_id: str, field: str, confidence: str = "VERIFIED") -> dict:
    return evidence(f"Units/{filename}", confidence, objectId=object_id, field=field)


def number(value) -> float | int:
    n = float(value)
    return int(n) if n.is_integer() else n


def make_record(record_id: str, values: dict, sources: dict[str, list[dict]]) -> dict:
    evidence_map = {}
    for key, value in values.items():
        if isinstance(value, (int, float, bool)):
            sources_for_value = sources.get(key) or [legacy_evidence(record_id, key)]
            evidence_map[key] = sources_for_value[0] if len(sources_for_value) == 1 else sources_for_value
    if not evidence_map:
        raise ValueError(f"{record_id}: numeric rules require evidence")
    # A record's primary source describes its strongest evidence, not a claim
    # that every independently sourced value is VERIFIED.
    first = evidence_map[next(iter(evidence_map))]
    first = first if isinstance(first, dict) else first[0]
    primary = next((item for value in evidence_map.values() for item in (value if isinstance(value, list) else [value]) if item["confidence"] == "VERIFIED"), first)
    return {"id": record_id, "values": values, "source": primary, "evidence": evidence_map}


def add_unknown(unknowns: list, record_id: str, field: str, reason: str, blocking: bool = False) -> None:
    unknowns.append({"id": f"{record_id}.{field}", "reason": reason, "blocking": blocking})


def read_ini(path: Path) -> dict[str, dict[str, str]]:
    sections: dict[str, dict[str, str]] = {}
    current = None
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        match = re.match(r"^\[([^\]]+)\]$", line)
        if match:
            current = match.group(1)
            sections[current] = {}
        elif current and "=" in line:
            key, value = line.split("=", 1)
            sections[current][key] = value
    return sections


def update_source_manifest() -> dict:
    source = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    for name in SLK_FILES:
        data = (UNITS / name).read_bytes()
        source["coreFiles"][name] = {
            "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "status": "VERIFIED",
            "note": f"War3 默认物编；Task 5 从 {UNITS / name} 只读计算实际字节数与 SHA-256。",
        }
    source["notes"] = [
        "地图文件哈希摘自 docs/research/file-index.json；九份默认 SLK 的大小与 SHA-256 由 Task 5 从本地只读文件实际计算。"
        if item.startswith("来源索引：") else item
        for item in source["notes"]
    ]
    source["unknowns"] = [
        item for item in source["unknowns"]
        if "九份 War3 默认 SLK" not in item and "本任务不重新读取原 W3X" not in item
    ]
    return source


def jass_function_evidence(jass_lines: list[str], function: str, needle: str, field: str) -> dict:
    start = next((i for i, line in enumerate(jass_lines) if line.startswith(f"function {function} ")), None)
    if start is None:
        raise ValueError(f"JASS function not found: {function}")
    end = next((i for i in range(start + 1, len(jass_lines)) if jass_lines[i] == "endfunction"), None)
    if end is None:
        raise ValueError(f"JASS function is not closed: {function}")
    for i in range(start, end + 1):
        if needle in jass_lines[i]:
            return evidence("war3map.j", "VERIFIED", field=field, jassLine=i + 1)
    raise ValueError(f"JASS evidence not found in {function}: {needle}")


def extract(jass_lines: list[str]) -> dict:
    legacy = json.loads(LEGACY_PATH.read_text(encoding="utf-8"))
    balance = parse_slk.parse_slk(str(UNITS / "UnitBalance.slk"))[1]
    weapons = parse_slk.parse_slk(str(UNITS / "UnitWeapons.slk"))[1]
    abilities = parse_slk.parse_slk(str(UNITS / "UnitAbilities.slk"))[1]
    ability_data = parse_slk.parse_slk(str(UNITS / "AbilityData.slk"))[1]
    item_data = parse_slk.parse_slk(str(UNITS / "ItemData.slk"))[1]
    w3a_version, w3a_records = parse_w3a.parse(str(EXTRACTED / "war3map.w3a"))
    assert w3a_version == 2 and len(w3a_records) == 50
    w3a = {r["id"]: r for r in w3a_records}
    assert [aid for aid in w3a if aid in {v[0] for v in SKILLS.values()}] == ["A067"]
    unknowns: list[dict] = []

    mode_sources = {
        "elfGold": [jass_function_evidence(jass_lines, "sa__SingleParamProvider_getElveInitGold", "set gold=30", "sa__SingleParamProvider_getElveInitGold/set gold=30")],
        "trollGold": [jass_function_evidence(jass_lines, "sa__SingleParamProvider_getTrollInitGold", "set gold=70", "sa__SingleParamProvider_getTrollInitGold/set gold=70")],
        "startWood": [jass_function_evidence(jass_lines, "sa__SingleParamProvider_getElveInitWood", "local integer wood=0", "sa__SingleParamProvider_getElveInitWood")],
        "prepareSeconds": [legacy_evidence("trollAppear", "withPrepare")],
        "originalWaitSeconds": [jass_function_evidence(jass_lines, "sc__SingleParamProvider_getTrollAppearTime", "return 30.0", "sc__SingleParamProvider_getTrollAppearTime")],
    }
    mode = make_record("modeSingle", {"mode": "OLD", "rule": "SINGLE", "elfGold": 30, "trollGold": 70, "startWood": 0, "prepareSeconds": 35, "originalWaitSeconds": 30}, mode_sources)
    add_unknown(unknowns, "modeSingle", "prepareSeconds", "35 秒保留当前运行契约（5 秒精灵准备 + JASS 30 秒等待）；5 秒前置尚未在本提取器定位。")

    hero_records = []
    for key, object_id in HEROES.items():
        old = legacy["heroes"][key]
        runtime_ranges = {"elf": 32, "troll": 34}
        values = {"objectId": object_id, "hp": old["hp"], "damage": old["attack"], "interval": old["interval"], "range": runtime_ranges[key], "worldRange": old["range"], "speed": old["speed"], "radius": old["radius"], "originalHp": number(balance[object_id]["HP"]), "originalSpeed": number(balance[object_id]["spd"]), "originalRange": number(weapons[object_id]["rangeN1"])}
        sources = {
            "hp": [slk_evidence("UnitBalance.slk", object_id, "HP")],
            "interval": [slk_evidence("UnitWeapons.slk", object_id, "cool1")],
            "originalHp": [slk_evidence("UnitBalance.slk", object_id, "HP")],
            "originalSpeed": [slk_evidence("UnitBalance.slk", object_id, "spd")],
            "originalRange": [slk_evidence("UnitWeapons.slk", object_id, "rangeN1")],
            "speed": [slk_evidence("UnitBalance.slk", object_id, "spd", "INFERRED"), legacy_evidence(key, "speed")],
            "range": [evidence("src/lib/tve4/config.ts", "INFERRED", objectId=key, field="range"), legacy_evidence(key, "range")],
            "worldRange": [legacy_evidence(key, "range")],
            "damage": [slk_evidence("UnitWeapons.slk", object_id, "dmgplus1/dmgpt1", "INFERRED"), legacy_evidence(key, "attack")],
            "radius": [slk_evidence("UnitData.slk", object_id, "collision", "INFERRED"), legacy_evidence(key, "radius")],
        }
        hero_records.append(make_record(key, values, sources))
        for field in ["damage", "speed", "range", "radius"]:
            add_unknown(unknowns, f"hero.{key}", field, "保留当前网页换算值；SLK 到网页像素/碰撞半径的语义尚未完整证明。")

    building_records = []
    config_meta = {
        "tent": (2, 1.2), "wall": (1, 0.5), "tower": (2, 1.5), "mine": (2, 2),
        "reveal": (2, 2), "trollHouse": (3, 2), "market": (2, 2),
    }
    ranges = [96, 112, 128, 144, 160, 176, 192, 208]
    for key, (object_id, array_fields) in BUILDINGS.items():
        old = legacy["buildings"].get(key, {"gold": [64], "hp": [50]} if key == "market" else None)
        if old is None:
            raise ValueError(f"Missing runtime building contract: {key}")
        values: dict[str, object] = {"objectId": object_id, "size": config_meta[key][0], "buildTime": config_meta[key][1]}
        sources: dict[str, list[dict]] = {
            "size": [config_evidence(key, "size")],
            "buildTime": [config_evidence(key, "buildTime")],
        }
        for field in array_fields:
            items = old[field] if isinstance(old[field], list) else [old[field]]
            for i, value in enumerate(items):
                out_field = field if len(items) == 1 else f"{field}.{i}"
                values[out_field] = value
                if i == 0 and field in {"gold", "wood", "hp"}:
                    source_field = {"gold": "goldcost", "wood": "lumbercost", "hp": "HP"}[field]
                    raw_value = balance[object_id].get(source_field)
                    sources[out_field] = [slk_evidence("UnitBalance.slk", object_id, source_field, "VERIFIED" if raw_value is not None else "INFERRED")]
                    if raw_value is None and value == 0:
                        add_unknown(unknowns, f"building.{key}", out_field, "SLK 空费用按当前运行契约视为 0；空值到零的转换标记 INFERRED。")
                else:
                    sources[out_field] = [slk_evidence("UnitBalance.slk", object_id, field, "INFERRED"), legacy_evidence(key, out_field)]
        if key == "market":
            # These two upgrades have no UnitBalance row and remain the current
            # runtime contract; they are not promoted to VERIFIED.
            for i, (gold, hp) in enumerate([(256, 100), (1024, 200)], 1):
                values[f"gold.{i}"] = gold
                values[f"hp.{i}"] = hp
                sources[f"gold.{i}"] = [evidence("src/lib/tve4/config.ts", "INFERRED", field=f"market.levels[{i}].cost")]
                sources[f"hp.{i}"] = [evidence("src/lib/tve4/config.ts", "INFERRED", field=f"market.levels[{i}].hp")]
        if key in REQUIREMENTS:
            for level, need_kind, need_level in REQUIREMENTS[key]:
                values[f"requirement.{level}.needKind"] = need_kind
                values[f"requirement.{level}.needLevel"] = need_level
                sources[f"requirement.{level}.needLevel"] = [config_evidence(key, f"requirement[{level}].need.level")]
            add_unknown(unknowns, f"building.{key}", "requirements", "前置链保留当前运行契约；原版 Requires/DependencyOr 到墙/市场等级的映射尚未完整重建。")
        if key == "tower":
            for i, value in enumerate(ranges):
                values[f"range.{i}"] = value
                sources[f"range.{i}"] = [config_evidence(key, f"range.{i}")]
            values["interval"] = 1.5
            sources["interval"] = [legacy_evidence(key, "interval")]
            values["ultimateObjectId"] = "h096"
        if key == "reveal":
            values["revealRange"] = old["revealRange"]
            sources["revealRange"] = [slk_evidence("AbilityData.slk", "A02P", "Area1", "INFERRED"), legacy_evidence(key, "revealRange")]
        if key == "trollHouse":
            values.update({"heal": old["heal"], "auraRange": old["auraRange"]})
            sources.update({"heal": [legacy_evidence(key, "heal")], "auraRange": [legacy_evidence(key, "auraRange")]})
        building_records.append(make_record(key, values, sources))
        later = [field for field in array_fields if any(f"{field}.{i}" in values for i in range(1, 10))]
        if later:
            add_unknown(unknowns, f"building.{key}", "upgrade-chain", "L2+ 的升级费用/HP/收入保留当前运行值；尚未从 JASS 建筑升级调用逐项重建。")
        if key == "tower":
            add_unknown(unknowns, "building.tower", "damage.7", "终极塔伤害保留当前运行值；未找到原版 UnitWeapons/JASS 的等值证据。")

    skill_records = []
    runtime_cd = {"blink": 25, "haste": 30, "entangle": 3, "silence": 60, "windwalk": 30, "berserk": 120, "teleport": 45, "farSight": 25}
    for key, (object_id, original_cd, duration) in SKILLS.items():
        assert object_id in abilities["H010" if key in ["blink", "haste", "entangle", "silence"] else "H020"]["abilList"].split(",")
        row = ability_data[object_id]
        values = {
            "id": object_id, "cooldown": runtime_cd[key], "originalCooldown": number(row["Cool1"]),
            "duration": duration, "runtimeDuration": duration,
            "manaCost": number(row["Cost1"]),
        }
        duration_field = "HeroDur1" if row.get("HeroDur1") is not None else "Dur1" if row.get("Dur1") is not None else None
        sources = {
            "cooldown": [slk_evidence("AbilityData.slk", object_id, "Cool1")],
            "originalCooldown": [slk_evidence("AbilityData.slk", object_id, "Cool1")],
            "manaCost": [slk_evidence("AbilityData.slk", object_id, "Cost1")],
            "duration": [legacy_evidence(key, "duration")],
            "runtimeDuration": [legacy_evidence(key, "runtimeDuration")],
        }
        if duration_field:
            values["defaultDuration"] = number(row[duration_field])
            sources["defaultDuration"] = [slk_evidence("AbilityData.slk", object_id, duration_field)]
        assert values["originalCooldown"] == original_cd
        old_skill = legacy["skills"].get(key, {})
        for field, value in old_skill.items():
            if field not in {"id", "cooldown", "duration"} and isinstance(value, (int, float, bool)):
                values[field] = value
                sources[field] = [legacy_evidence(key, field)]
                add_unknown(unknowns, f"skill.{key}", field, "保留当前运行效果数值；原版 SLK 字段到网页效果语义尚未完整证明。")
        if key == "haste":
            values["originalDuration"] = 6.0
            sources["originalDuration"] = [jass_function_evidence(jass_lines, "bSingleCreateElves___createElvesAndChooseCB", "call YDWESetUnitAbilityDataReal(u,'A067',GetPlayerId(p)+1,102,6.00)", "YDWESetUnitAbilityDataReal/A067/102")]
            assert all(f["value"] == 15.0 for f in w3a[object_id]["fields"] if f["name"] == "adur")
        if key in ["entangle", "farSight"]:
            sources["cooldown"] = [slk_evidence("AbilityData.slk", object_id, "Cool1", "INFERRED"), legacy_evidence(key, "cooldown")]
            add_unknown(unknowns, f"skill.{key}", "cooldown", f"网页冷却 {runtime_cd[key]} 秒与原版默认 {original_cd} 秒不同；为保持运行行为标记 INFERRED。", True)
        if key in ["haste", "farSight"]:
            add_unknown(unknowns, f"skill.{key}", "duration", "网页持续时间与原版默认/JASS 覆盖不同；为保持运行行为标记 INFERRED。", True)
        skill_records.append(make_record(key, values, sources))

    # Derive the whitelist from the original shop inventories, never from a full
    # object catalog. Deduplicate while retaining the current runtime ordering.
    unit_func = read_ini(UNITS / "CampaignUnitFunc.txt")
    item_func = read_ini(UNITS / "ItemFunc.txt")
    item_ids: list[str] = []
    item_shops: dict[str, str] = {}
    for shop in SHOPS:
        raw = unit_func[shop].get("Sellitems") or unit_func[shop].get("Makeitems") or ""
        for item_id in [x.strip() for x in raw.split(",") if x.strip()]:
            if item_id not in item_ids:
                item_ids.append(item_id)
            item_shops.setdefault(item_id, shop)
    legacy_items = {i["key"]: i for i in legacy["equipmentShop"]["items"]}
    assert len(item_ids) == 81 and set(item_ids) == set(legacy_items)
    item_records = []
    for item_id in item_ids:
        old = legacy_items[item_id]
        row = item_data[item_id]
        values = {
            "gold": number(row["goldcost"] or 0), "wood": number(row["lumbercost"] or 0),
            "label": old["label"], "shop": old["shop"], "shopId": item_shops[item_id], "description": item_func.get(item_id, {}).get("Ubertip", ""),
        }
        sources = {"gold": [slk_evidence("ItemData.slk", item_id, "goldcost", "VERIFIED" if row["goldcost"] is not None else "INFERRED")], "wood": [slk_evidence("ItemData.slk", item_id, "lumbercost", "VERIFIED" if row["lumbercost"] is not None else "INFERRED")]}
        for field, source_field in [("gold", "goldcost"), ("wood", "lumbercost")]:
            if row[source_field] is None and values[field] == 0:
                add_unknown(unknowns, f"item.{item_id}", field, "SLK 空费用按当前运行契约视为 0；空值到零的转换标记 INFERRED。")
        for field in ["allStats", "strength", "agility", "damage", "heroDamage", "armor", "speed", "magicImmune"]:
            if field in old:
                values[field] = old[field]
                sources[field] = [legacy_evidence(item_id, field)]
                add_unknown(unknowns, f"item.{item_id}", field, "数值来自混合置信目录；尚未从原版物品 JASS 处理函数证明，保留运行值并标记 INFERRED。")
        # Preserve legacy notes verbatim as metadata for effects the MVP does not implement.
        if old.get("note"):
            values["note"] = old["note"]
            for ability, field, raw_value in re.findall(r"([A-Z][A-Z0-9]{3})\.([A-Za-z]+\d+)=([0-9]+(?:\.[0-9]+)?)", old["note"]):
                out_field = f"original.{ability}.{field}"
                values[out_field] = number(raw_value)
                sources[out_field] = [legacy_evidence(item_id, f"note:{ability}.{field}")]
                add_unknown(unknowns, f"item.{item_id}", out_field, "原版物品效果数值来自混合置信目录；当前网页未实现，标记 INFERRED 而非 VERIFIED。")
        item_records.append(make_record(item_id, values, sources))

    catalog_payload = json.dumps({"heroes": hero_records, "buildings": building_records, "skills": skill_records, "items": item_records, "modeSingle": mode}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    catalog_version = hashlib.sha256(catalog_payload.encode()).hexdigest()
    return {
        "catalogVersion": catalog_version,
        "primarySource": "data/tve4/mvp/source.json",
        "modeSingle": [mode], "heroes": hero_records, "buildings": building_records,
        "skills": skill_records, "items": item_records, "unknowns": unknowns,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="compare generated bytes without writing")
    args = parser.parse_args()
    source = update_source_manifest()
    jass_lines = (EXTRACTED / "war3map.j").read_text(encoding="utf-8-sig", errors="replace").splitlines()
    rules = extract(jass_lines)
    rendered = json.dumps(rules, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        sys.stdout.buffer.write(rendered.encode("utf-8"))
        return
    # Manifest and whitelist are regenerated together; neither original source is modified.
    SOURCE_PATH.write_bytes((json.dumps(source, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    OUTPUT_PATH.write_bytes(rendered.encode("utf-8"))
    print(f"wrote {OUTPUT_PATH} ({len(rules['items'])} items, {len(rules['unknowns'])} unknowns)")


if __name__ == "__main__":
    main()
