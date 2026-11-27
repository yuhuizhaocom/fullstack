"""Extract the eight tve4 arenas without modifying the original map data.

The input is the already-extracted Warcraft III map directory.  This tool does
not open MPQ archives or extract art assets.  It verifies the Task 1 source
baseline, parses JASS regions/anchors plus W3E/DOO geometry, and writes one
byte-for-byte copy of the full 1536x1152 WPM per arena.

Run from the repository root:
    python -m tools.tve4_source.extract_core_maps

TVE4_EXTRACTED_DIR may point at an alternative extracted directory.  The
optional extract() arguments are intended for focused tests and reproducibility.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import struct
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MVP_DATA = ROOT / "data" / "tve4" / "mvp"
DEFAULT_EXTRACTED = Path(
    os.environ.get(
        "TVE4_EXTRACTED_DIR",
        r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted",
    )
)
TILE_UNITS = 128
WPM_WIDTH = 1536
WPM_HEIGHT = 1152
NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)"

LOCATION_GROUPS = (
    ("COMMON_GAME_TROLL_HOUSE", "trollHouse", 1),
    ("COMMON_GAME_STONE", "stone", 2),
    ("COMMON_GAME_ANGEL", "angel", 1),
    ("SOLO_GAME_LIFE_TREE", "lifeTree", 1),
    ("RACE_GAME_TROLL_HOUSE", "trollHouse", 2),
    ("RACE_GAME_ANGEL", "angel", 1),
    ("DEFEND_GAME_TROLL_HOUSE", "trollHouse", 4),
    ("DEFEND_GAME_BAN_ROAD", "banRoad", 4),
    ("DEFEND_GAME_ELVE", "elf", 8),
)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read_verified_sources(extracted: Path) -> tuple[dict[str, bytes], dict[str, Any]]:
    source_path = MVP_DATA / "source.json"
    source = json.loads(source_path.read_text(encoding="utf-8"))
    names = ("war3map.j", "war3map.wpm", "war3map.w3e", "war3map.doo", "war3map.w3i")
    files: dict[str, bytes] = {}
    for name in names:
        expected = source["coreFiles"][name]
        if expected["status"] != "VERIFIED":
            raise ValueError(f"source baseline is not VERIFIED: {name}")
        data = (extracted / name).read_bytes()
        if len(data) != expected["size"] or _sha256(data) != expected["sha256"]:
            raise ValueError(f"extracted source does not match Task 1 baseline: {name}")
        files[name] = data
    return files, source


def _function_body(jass: str, name: str) -> str:
    match = re.search(
        rf"function\s+{re.escape(name)}\s+takes\s+nothing\s+returns\s+nothing\s*(.*?)endfunction",
        jass,
        re.DOTALL,
    )
    if match is None:
        raise ValueError(f"JASS function not found: {name}")
    return match.group(1)


def _rect(values: tuple[float, float, float, float]) -> dict[str, float]:
    return {
        "minX": values[0],
        "minY": values[1],
        "maxX": values[2],
        "maxY": values[3],
    }


def _parse_regions(jass: str) -> dict[str, dict[str, float]]:
    body = _function_body(jass, "CreateRegions")
    regions: dict[str, dict[str, float]] = {}
    pattern = re.compile(
        rf"set\s+gg_rct_(\w+)\s*=\s*Rect\(\s*({NUMBER})\s*,\s*({NUMBER})\s*,\s*({NUMBER})\s*,\s*({NUMBER})\s*\)"
    )
    for match in pattern.finditer(body):
        regions[match.group(1)] = _rect(tuple(float(match.group(i)) for i in range(2, 6)))
    for map_id in range(8):
        for suffix in ("AREA", "CHECK_AREA"):
            key = f"MAP_{map_id}_{suffix}"
            if key not in regions:
                raise ValueError(f"JASS region not found: {key}")
    if "MAP_5_AREA_EXTRA" not in regions:
        raise ValueError("JASS region not found: MAP_5_AREA_EXTRA")
    return regions


def _parse_units(jass: str) -> dict[str, dict[str, Any]]:
    pattern = re.compile(
        rf"set\s+(gg_unit_\w+)\s*=\s*CreateUnit\(\s*[^,]+,\s*'([^']+)'\s*,\s*"
        rf"({NUMBER})\s*,\s*({NUMBER})\s*,\s*({NUMBER})\s*\)"
    )
    units: dict[str, dict[str, Any]] = {}
    for match in pattern.finditer(jass):
        units[match.group(1)] = {
            "unitId": match.group(2),
            "x": float(match.group(3)),
            "y": float(match.group(4)),
            "facing": float(match.group(5)),
        }
    if not units:
        raise ValueError("no preplaced CreateUnit definitions found")
    return units


def _resolve(expression: str, units: dict[str, dict[str, Any]]) -> tuple[float, dict[str, Any] | None]:
    expression = expression.strip()
    getter = re.fullmatch(r"GetUnit(X|Y|Facing)\((gg_unit_\w+)\)", expression)
    if getter:
        variable = getter.group(2)
        if variable not in units:
            raise ValueError(f"preplaced unit definition not found: {variable}")
        unit = units[variable]
        field = {"X": "x", "Y": "y", "Facing": "facing"}[getter.group(1)]
        return float(unit[field]), unit
    if re.fullmatch(NUMBER, expression):
        return float(expression), None
    raise ValueError(f"unsupported anchor expression: {expression}")


def _anchor(
    x_expression: str,
    y_expression: str,
    units: dict[str, dict[str, Any]],
    facing_expression: str | None = None,
    default_unit_id: str | None = None,
    default_facing: float | None = None,
) -> dict[str, Any]:
    x, unit = _resolve(x_expression, units)
    y, y_unit = _resolve(y_expression, units)
    if unit is not None and y_unit is not None and unit is not y_unit:
        raise ValueError("anchor X/Y resolve to different preplaced units")
    if facing_expression is not None:
        facing, facing_unit = _resolve(facing_expression, units)
        if unit is not None and facing_unit is not None and unit is not facing_unit:
            raise ValueError("anchor facing resolves to a different preplaced unit")
    elif unit is not None:
        facing = float(unit["facing"])
    else:
        facing = default_facing
    result: dict[str, Any] = {
        "unitId": unit["unitId"] if unit is not None else default_unit_id,
        "x": x,
        "y": y,
    }
    if result["unitId"] is None:
        raise ValueError("anchor has no source unit id")
    if facing is not None:
        result["facing"] = facing
    return result


def _direct_anchor(
    block: str,
    prefix: str,
    units: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    expressions = []
    for field in ("X", "Y"):
        match = re.search(
            rf"set\s+s__GameMap_{prefix}{field}\[gameMap\]\s*=\s*(.+)$",
            block,
            re.MULTILINE,
        )
        if match is None:
            raise ValueError(f"map anchor not found: {prefix}{field}")
        expressions.append(match.group(1).strip())
    return _anchor(expressions[0], expressions[1], units)


def _parse_anchors(block: str, units: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    current: str | None = None
    for line in block.splitlines():
        integer = re.search(
            r"call\s+SaveInteger\(s__GameMap_locationTable\[gameMap\],s__GameMap_(\w+),0,(\d+)\)",
            line,
        )
        if integer:
            current = integer.group(1)
            groups[current] = {"count": int(integer.group(2)), "values": {}}
            continue
        real = re.search(
            r"call\s+SaveReal\(s__GameMap_locationTable\[gameMap\],s__GameMap_(\w+),(\d+),(.+)\)$",
            line.strip(),
        )
        if real and current == real.group(1):
            groups[current]["values"][int(real.group(2))] = real.group(3).strip()

    anchors: dict[str, dict[str, Any]] = {}
    for group_name, base_name, point_count in LOCATION_GROUPS:
        group = groups.get(group_name)
        if group is None:
            continue
        if len(group["values"]) != point_count * 2:
            raise ValueError(f"unexpected scalar count for {group_name}: {len(group['values'])}")
        for index in range(point_count):
            key = base_name if point_count == 1 else f"{base_name}{index}"
            anchors[key] = _anchor(
                group["values"][index * 2 + 1],
                group["values"][index * 2 + 2],
                units,
                default_unit_id="MODE_LIFE_TREE" if group_name == "SOLO_GAME_LIFE_TREE" else None,
                default_facing=270.0 if group_name == "SOLO_GAME_LIFE_TREE" else None,
            )

    facing_group = groups.get("DEFEND_GAME_ELVE_FACING")
    if facing_group is not None:
        if len(facing_group["values"]) != 8:
            raise ValueError("unexpected scalar count for DEFEND_GAME_ELVE_FACING")
        for index in range(8):
            key = f"elf{index}"
            if key not in anchors:
                raise ValueError(f"missing defend elf anchor: {key}")
            facing, _ = _resolve(facing_group["values"][index + 1], units)
            anchors[key]["facing"] = facing

    anchors["previewCenter"] = _direct_anchor(block, "previewCenter", units)
    anchors["chooseRole"] = _direct_anchor(block, "chooseRole", units)
    anchors["chooseDieRole"] = _direct_anchor(block, "chooseDieRole", units)
    return anchors


def _parse_maps(jass: str, regions: dict[str, dict[str, float]], units: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    body = _function_body(jass, "s__GameMap_load")
    constants = {
        match.group(1): int(match.group(2))
        for match in re.finditer(r"constant\s+integer\s+s__GameMap_(MAP_\w+)\s*=\s*(\d+)", jass)
    }
    starts = list(re.finditer(r"set\s+gameMap\s*=\s*s__GameMap_create\(s__GameMap_(MAP_\w+)\)", body))
    if len(starts) != 8:
        raise ValueError(f"expected 8 GameMap_load blocks, found {len(starts)}")

    maps: list[dict[str, Any]] = []
    for index, start in enumerate(starts):
        end = starts[index + 1].start() if index + 1 < len(starts) else len(body)
        block = body[start.start():end]
        map_id = constants[start.group(1)]
        name = re.search(r'set\s+s__GameMap_name\[gameMap\]\s*=\s*("(?:[^"\\]|\\.)*")', block)
        minimap = re.search(r'set\s+s__GameMap_miniPath\[gameMap\]\s*=\s*("(?:[^"\\]|\\.)*")', block)
        bound = re.search(r"set\s+s__GameMap_boundRect\[gameMap\]\s*=\s*gg_rct_(\w+)", block)
        check = re.search(r"set\s+s__GameMap_checkRect\[gameMap\]\s*=\s*gg_rct_(\w+)", block)
        if not all((name, minimap, bound, check)):
            raise ValueError(f"incomplete GameMap_load block: {start.group(1)}")
        camera = {}
        for field in ("MinX", "MinY", "MaxX", "MaxY"):
            match = re.search(rf"set\s+s__GameMap_camera{field}\[gameMap\]\s*=\s*({NUMBER})", block)
            if match is None:
                raise ValueError(f"camera bound not found: {start.group(1)} {field}")
            camera[field] = float(match.group(1))
        maps.append({
            "id": map_id,
            "name": json.loads(name.group(1)),
            "boundRect": regions[bound.group(1)],
            "checkRect": regions[check.group(1)],
            "extraRects": [regions["MAP_5_AREA_EXTRA"]] if map_id == 5 else [],
            "cameraBounds": _rect((camera["MinX"], camera["MinY"], camera["MaxX"], camera["MaxY"])),
            "minimap": json.loads(minimap.group(1)),
            "anchors": _parse_anchors(block, units),
        })
    maps.sort(key=lambda map_data: map_data["id"])
    if [map_data["id"] for map_data in maps] != list(range(8)):
        raise ValueError("GameMap ids are not 0..7")
    return maps


def _parse_wpm(data: bytes) -> tuple[int, int]:
    magic, version, width, height = struct.unpack_from("<4sIII", data, 0)
    if magic != b"MP3W" or version != 0:
        raise ValueError("unsupported WPM header")
    if (width, height) != (WPM_WIDTH, WPM_HEIGHT) or len(data) != 16 + width * height:
        raise ValueError("unexpected WPM dimensions or byte length")
    return width, height


def _parse_w3e(data: bytes) -> tuple[int, int, int, list[int]]:
    if data[:4] != b"W3E!" or struct.unpack_from("<I", data, 4)[0] != 11:
        raise ValueError("unsupported W3E header")
    offset = 17
    while offset + 4 <= len(data) and all(
        65 <= byte <= 90 or 97 <= byte <= 122 for byte in data[offset:offset + 4]
    ):
        offset += 4
    cliff_count = struct.unpack_from("<I", data, offset)[0]
    offset += 4 + cliff_count * 4
    width, height = struct.unpack_from("<II", data, offset)
    offset += 8
    cells = width * height
    if len(data) != offset + cells * 7 + 8:
        raise ValueError("unexpected W3E byte length")
    ground_offset = offset + cells * 4
    return width, height, ground_offset, list(data[ground_offset:ground_offset + cells])


def _parse_w3i_playable_size(data: bytes) -> tuple[int, int]:
    if struct.unpack_from("<I", data, 0)[0] != 25:
        raise ValueError("unsupported W3I version")
    offset = 12
    for _ in range(4):
        end = data.find(b"\0", offset)
        if end < 0:
            raise ValueError("truncated W3I header")
        offset = end + 1
    offset += 32 + 16  # eight camera floats and four camera complements
    width, height = struct.unpack_from("<II", data, offset)
    if width == 0 or height == 0:
        raise ValueError("empty W3I playable area")
    return width, height


def _parse_world_origin(
    jass: str,
    w3i: bytes,
    terrain_width: int,
    terrain_height: int,
) -> tuple[int, int]:
    """Return the W3E/WPM tile-grid origin in world coordinates.

    Warcraft III centers the larger terrain grid on the W3I playable area,
    whose bounds are also installed by JASS cameraAll. This map's playable
    center is (-5120, 256), not (0, 0); assuming a zero-centered grid shifts
    every source tile and clips the two western arenas.
    """
    body = _function_body(jass, "main")
    match = re.search(
        rf"call\s+SetCameraBounds\(\s*({NUMBER})\s*\+\s*GetCameraMargin\(CAMERA_MARGIN_LEFT\),"
        rf"\s*({NUMBER})\s*\+\s*GetCameraMargin\(CAMERA_MARGIN_BOTTOM\),"
        rf"\s*({NUMBER})\s*-\s*GetCameraMargin\(CAMERA_MARGIN_RIGHT\),"
        rf"\s*({NUMBER})\s*-\s*GetCameraMargin\(CAMERA_MARGIN_TOP\)",
        body,
    )
    if match is None:
        raise ValueError("JASS playable bounds not found")
    min_x, min_y, max_x, max_y = (float(match.group(i)) for i in range(1, 5))
    playable_width, playable_height = _parse_w3i_playable_size(w3i)
    if (
        max_x - min_x != playable_width * TILE_UNITS
        or max_y - min_y != playable_height * TILE_UNITS
    ):
        raise ValueError("JASS bounds do not match W3I playable dimensions")
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    origin_x = center_x - terrain_width * TILE_UNITS / 2
    origin_y = center_y - terrain_height * TILE_UNITS / 2
    if not origin_x.is_integer() or not origin_y.is_integer():
        raise ValueError("terrain origin is not an integer world coordinate")
    return int(origin_x), int(origin_y)


def _parse_doo(data: bytes) -> list[dict[str, Any]]:
    magic, version, subversion, count = struct.unpack_from("<4sIII", data, 0)
    if magic != b"W3do" or (version, subversion) != (8, 11):
        raise ValueError("unsupported DOO header")
    if len(data) < 16 + count * 50:
        raise ValueError("truncated DOO records")
    doodads = []
    for index in range(count):
        offset = 16 + index * 50
        type_id = data[offset:offset + 4].decode("ascii")
        _variation, x, y, _z, rotation, _scale, _flags, _life, _doodad_id = struct.unpack_from(
            "<I3f2f3i", data, offset + 4
        )
        doodads.append({"typeId": type_id, "x": x, "y": y, "rotation": rotation})
    return doodads


def _tile_intersects(tile_x: int, tile_y: int, rect: dict[str, float]) -> bool:
    return (
        tile_x < rect["maxX"]
        and tile_x + TILE_UNITS > rect["minX"]
        and tile_y < rect["maxY"]
        and tile_y + TILE_UNITS > rect["minY"]
    )


def _point_inside(x: float, y: float, rect: dict[str, float]) -> bool:
    return rect["minX"] <= x <= rect["maxX"] and rect["minY"] <= y <= rect["maxY"]


def _crop_terrain(
    map_data: dict[str, Any],
    width: int,
    height: int,
    ground_offset: int,
    w3e: bytes,
    origin_x: int,
    origin_y: int,
) -> list[dict[str, Any]]:
    rects = [map_data["boundRect"], *map_data["extraRects"]]
    terrain = []
    for tile_y in range(height):
        y = origin_y + tile_y * TILE_UNITS
        for tile_x in range(width):
            x = origin_x + tile_x * TILE_UNITS
            if not any(_tile_intersects(x, y, rect) for rect in rects):
                continue
            terrain.append({
                "x": int(x),
                "y": int(y),
                "tileId": w3e[ground_offset + tile_y * width + tile_x],
            })
    return terrain


def _crop_doodads(map_data: dict[str, Any], doodads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rects = [map_data["boundRect"], *map_data["extraRects"]]
    return [
        doodad for doodad in doodads
        if any(_point_inside(doodad["x"], doodad["y"], rect) for rect in rects)
    ]


def extract(
    extracted_dir: str | Path | None = None,
    output_dir: str | Path | None = None,
) -> list[dict[str, Any]]:
    extracted = Path(extracted_dir) if extracted_dir is not None else DEFAULT_EXTRACTED
    output = Path(output_dir) if output_dir is not None else MVP_DATA
    files, _source = _read_verified_sources(extracted)
    jass = files["war3map.j"].decode("utf-8", errors="replace")
    regions = _parse_regions(jass)
    units = _parse_units(jass)
    maps = _parse_maps(jass, regions, units)

    wpm = files["war3map.wpm"]
    pathing_width, pathing_height = _parse_wpm(wpm)
    pathing_sha256 = _sha256(wpm)
    terrain_width, terrain_height, ground_offset, _ground = _parse_w3e(files["war3map.w3e"])
    if (terrain_width - 1, terrain_height - 1) != (pathing_width // 4, pathing_height // 4):
        raise ValueError("unexpected WPM-to-W3E grid dimensions")
    origin_x, origin_y = _parse_world_origin(
        jass, files["war3map.w3i"], terrain_width, terrain_height
    )
    doodads = _parse_doo(files["war3map.doo"])

    pathing_dir = output / "pathing"
    pathing_dir.mkdir(parents=True, exist_ok=True)
    for map_data in maps:
        map_data["pathing"] = {
            "width": pathing_width,
            "height": pathing_height,
            "file": f"pathing/map-{map_data['id']}.bin",
            "sha256": pathing_sha256,
        }
        map_data["terrain"] = _crop_terrain(
            map_data,
            terrain_width,
            terrain_height,
            ground_offset,
            files["war3map.w3e"],
            origin_x,
            origin_y,
        )
        map_data["doodads"] = _crop_doodads(map_data, doodads)
        (output / map_data["pathing"]["file"]).write_bytes(wpm)

    (output / "maps.json").write_text(
        json.dumps(maps, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return maps


if __name__ == "__main__":
    extracted_maps = extract()
    print(f"wrote {len(extracted_maps)} maps and {len(extracted_maps)} raw WPM files to {MVP_DATA}")
