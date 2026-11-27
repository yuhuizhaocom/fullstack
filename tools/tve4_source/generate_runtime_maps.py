"""Generate the lightweight tve4 runtime catalog and shared WPM payload.

The simulation bundle must not contain the terrain/doodad geometry from
``data/tve4/mvp/maps.json``.  This generator reads that artifact plus the raw
Task 2 WPM files, verifies their header, dimensions, size, and SHA-256, and
emits only map metadata, anchors, aligned runtime bounds, and one synchronous
PackBits + Base64 payload shared by all eight maps.

Run from the repository root:
    python -m tools.tve4_source.generate_runtime_maps
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import struct
from collections import deque
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MVP_DATA = ROOT / "data" / "tve4" / "mvp"
OUTPUT = ROOT / "src" / "lib" / "tve4"
GEOMETRY_OUTPUT = ROOT / "public" / "tve4" / "geometry"

WPM_WIDTH = 1_536
WPM_HEIGHT = 1_152
WPM_HEADER_SIZE = 16
WPM_SIZE = WPM_HEADER_SIZE + WPM_WIDTH * WPM_HEIGHT
WPM_ORIGIN = (-29_696, -17_920)
PATHING_CELL_UNITS = 32
BUILD_CELL_UNITS = 128
WEB_TILE_UNITS = 16


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _packbits(data: bytes) -> bytes:
    """Encode with the standard decoder-compatible PackBits control bytes."""
    output = bytearray()
    index = 0
    while index < len(data):
        run = 1
        while (
            index + run < len(data)
            and run < 128
            and data[index + run] == data[index]
        ):
            run += 1
        if run >= 3:
            output.extend((257 - run, data[index]))
            index += run
            continue

        literal_start = index
        index += run
        while index < len(data) and index - literal_start < 128:
            run = 1
            while (
                index + run < len(data)
                and run < 128
                and data[index + run] == data[index]
            ):
                run += 1
            if run >= 3:
                break
            index += run
        output.append(index - literal_start - 1)
        output.extend(data[literal_start:index])
    return bytes(output)


def _read_wpm(path: Path, expected_sha256: str) -> bytes:
    data = path.read_bytes()
    if len(data) != WPM_SIZE:
        raise ValueError(f"unexpected WPM size for {path}: {len(data)}")
    magic, version, width, height = struct.unpack_from("<4sIII", data, 0)
    if magic != b"MP3W" or version != 0:
        raise ValueError(f"unsupported WPM header for {path}")
    if (width, height) != (WPM_WIDTH, WPM_HEIGHT):
        raise ValueError(f"unexpected WPM dimensions for {path}: {width}x{height}")
    if _sha256(data) != expected_sha256:
        raise ValueError(f"WPM hash mismatch for {path}")
    return data


def _aligned_bounds(map_data: dict[str, Any]) -> tuple[int, int, int, int]:
    rects = [map_data["boundRect"], *map_data["extraRects"]]
    min_x = min(rect["minX"] for rect in rects)
    min_y = min(rect["minY"] for rect in rects)
    max_x = max(rect["maxX"] for rect in rects)
    max_y = max(rect["maxY"] for rect in rects)
    return (
        math.floor(min_x / BUILD_CELL_UNITS) * BUILD_CELL_UNITS,
        math.floor(min_y / BUILD_CELL_UNITS) * BUILD_CELL_UNITS,
        math.ceil(max_x / BUILD_CELL_UNITS) * BUILD_CELL_UNITS,
        math.ceil(max_y / BUILD_CELL_UNITS) * BUILD_CELL_UNITS,
    )


def _grid_point(
    anchor: dict[str, Any] | None,
    bounds: tuple[int, int, int, int],
    width: int,
    height: int,
) -> dict[str, int] | None:
    if anchor is None:
        return None
    gx = math.floor((anchor["x"] - bounds[0]) / BUILD_CELL_UNITS)
    gy = math.floor((anchor["y"] - bounds[1]) / BUILD_CELL_UNITS)
    if not (0 <= gx < width and 0 <= gy < height):
        raise ValueError(f"anchor {anchor} is outside runtime bounds {bounds}")
    return {"gx": gx, "gy": gy}


def _build_grid(
    cells: bytes,
    bounds: tuple[int, int, int, int],
) -> tuple[list[int], int, int]:
    width = (bounds[2] - bounds[0]) // BUILD_CELL_UNITS
    height = (bounds[3] - bounds[1]) // BUILD_CELL_UNITS
    pathing_x = (bounds[0] - WPM_ORIGIN[0]) // PATHING_CELL_UNITS
    pathing_y = (bounds[1] - WPM_ORIGIN[1]) // PATHING_CELL_UNITS
    if (
        (bounds[0] - WPM_ORIGIN[0]) % PATHING_CELL_UNITS
        or (bounds[1] - WPM_ORIGIN[1]) % PATHING_CELL_UNITS
        or pathing_x < 0
        or pathing_y < 0
        or pathing_x + width * 4 > WPM_WIDTH
        or pathing_y + height * 4 > WPM_HEIGHT
    ):
        raise ValueError(f"runtime bounds are not aligned to the WPM: {bounds}")

    grid = [0] * (width * height)
    for gy in range(height):
        for gx in range(width):
            blocked = 0
            for dy in range(4):
                row = (pathing_y + gy * 4 + dy) * WPM_WIDTH
                for dx in range(4):
                    if cells[row + pathing_x + gx * 4 + dx] & 0x02:
                        blocked += 1
            if blocked >= 9:
                grid[gy * width + gx] = 1
    return grid, width, height


def _bfs_distance(
    grid: list[int],
    width: int,
    height: int,
    start: dict[str, int] | None,
    goal: dict[str, int] | None,
) -> int:
    if start is None or goal is None:
        return 0
    start_index = start["gy"] * width + start["gx"]
    goal_index = goal["gy"] * width + goal["gx"]
    distances = [-1] * (width * height)
    distances[start_index] = 0
    queue = deque([start_index])
    while queue:
        current = queue.popleft()
        if current == goal_index:
            return distances[current]
        x = current % width
        y = current // width
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if not (0 <= nx < width and 0 <= ny < height):
                continue
            next_index = ny * width + nx
            if distances[next_index] >= 0 or grid[next_index]:
                continue
            distances[next_index] = distances[current] + 1
            queue.append(next_index)
    return 0


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _format_number(value: float) -> str:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"non-finite render geometry number: {value}")
    text = f"{number:.9f}".rstrip("0").rstrip(".")
    return "0" if text in ("", "-0") else text


def _render_geometry_hash(map_data: dict[str, Any]) -> str:
    """Hash source W3E/DOO records with a JS-stable numeric representation."""
    lines = ["tve4-render-geometry-v1"]
    lines.extend(
        f"T{_format_number(tile['x'])},{_format_number(tile['y'])},{tile['tileId']}"
        for tile in map_data["terrain"]
    )
    lines.extend(
        f"D{doodad['typeId']},{_format_number(doodad['x'])},"
        f"{_format_number(doodad['y'])},{_format_number(doodad['rotation'])}"
        for doodad in map_data["doodads"]
    )
    return _sha256("\n".join(lines).encode("utf-8"))


def _render_geometry(
    map_data: dict[str, Any],
    bounds: tuple[int, int, int, int],
    catalog_version: str,
) -> dict[str, Any]:
    return {
        "version": 1,
        "mapId": map_data["id"],
        "catalogVersion": catalog_version,
        "geometryHash": _render_geometry_hash(map_data),
        "runtimeBounds": list(bounds),
        "coordinateSystem": {
            "sourceTileUnits": BUILD_CELL_UNITS,
            "webTileUnits": WEB_TILE_UNITS,
            "scaleDivisor": BUILD_CELL_UNITS // WEB_TILE_UNITS,
            "webOrigin": "runtimeBounds.minX/minY",
        },
        "terrain": map_data["terrain"],
        "doodads": map_data["doodads"],
    }


def _base64_typescript(payload: str) -> list[str]:
    lines = [
        "// AUTO-GENERATED by tools/tve4_source/generate_runtime_maps.py. Do not edit by hand.",
        "// Source: data/tve4/mvp/maps.json + data/tve4/mvp/pathing/map-0.bin.",
        "",
        "export const WPM_PATHING = {",
        f"  width: {WPM_WIDTH},",
        f"  height: {WPM_HEIGHT},",
        f"  cellUnits: {PATHING_CELL_UNITS},",
        f"  origin: [{WPM_ORIGIN[0]}, {WPM_ORIGIN[1]}] as [number, number],",
        f"  sha256: {_json(WPM_SHA256)},",
        f"  size: {WPM_SIZE},",
        "} as const;",
        "",
        "// Standard PackBits control bytes, then Base64. Decode synchronously.",
        "export const WPM_PACKBITS_BASE64 = [",
    ]
    for offset in range(0, len(payload), 120):
        lines.append(f"  {_json(payload[offset:offset + 120])},")
    lines.extend(["].join(\"\");", ""])
    return lines


def _maps_typescript(
    maps: list[dict[str, Any]],
    definitions: list[dict[str, Any]],
    catalog_version: str,
) -> list[str]:
    lines = [
        "// AUTO-GENERATED by tools/tve4_source/generate_runtime_maps.py. Do not edit by hand.",
        "// Source: data/tve4/mvp/maps.json + verified Task 2 WPM artifacts.",
        "// Terrain and doodad geometry intentionally stay out of the simulation bundle.",
        "",
        "export interface Rect {",
        "  minX: number;",
        "  minY: number;",
        "  maxX: number;",
        "  maxY: number;",
        "}",
        "",
        "export interface Anchor {",
        "  unitId: string;",
        "  x: number;",
        "  y: number;",
        "  facing?: number;",
        "}",
        "",
        "export interface PathingMetadata {",
        "  width: number;",
        "  height: number;",
        "  cellUnits: number;",
        "  file: string;",
        "  sha256: string;",
        "  origin: [number, number];",
        "}",
        "",
        "export interface MvpMap {",
        "  id: number;",
        "  name: string;",
        "  boundRect: Rect;",
        "  checkRect: Rect;",
        "  extraRects: Rect[];",
        "  cameraBounds: Rect;",
        "  minimap: string;",
        "  anchors: Record<string, Anchor>;",
        "  pathing: PathingMetadata;",
        "}",
        "",
        "export interface GridPoint { gx: number; gy: number }",
        "",
        "export interface MapDefinition extends MvpMap {",
        "  key: string;",
        "  description: string;",
        "  tags: string[];",
        "  grid: [number, number];",
        "  world: [number, number];",
        "  tileUnits: number;",
        "  sourceRect: [number, number, number, number];",
        "  bounds: [number, number, number, number];",
        "  spawns: { troll: GridPoint | null; elf: GridPoint | null };",
        "  trollHouse: { x: number; y: number };",
        "  angel: GridPoint | null;",
        "  stones: GridPoint[];",
        "  openTiles: number;",
        "  carvedTiles: number;",
        "  elfDistance: number;",
        "  background: string;",
        "  thumb: string;",
        "}",
        "",
        f"export const MAP_CATALOG_VERSION = {_json(catalog_version)};",
        f"export const MAP_ORDER = [{', '.join(str(map_data['id']) for map_data in maps)}];",
        "export const DEFAULT_MAP_ID = 1;",
        "",
        "export const MAP_DEFINITIONS: Record<number, MapDefinition> = {",
    ]
    for definition in definitions:
        lines.append(f"  {definition['id']}: {_json(definition)},")
    lines.extend(["};", ""])
    return lines


def main() -> None:
    global WPM_SHA256

    source_path = MVP_DATA / "maps.json"
    source_bytes = source_path.read_bytes()
    maps = json.loads(source_bytes)
    if [map_data["id"] for map_data in maps] != list(range(8)):
        raise ValueError("expected map ids 0..7")

    first = maps[0]
    WPM_SHA256 = first["pathing"]["sha256"]
    raw_wpm = _read_wpm(MVP_DATA / first["pathing"]["file"], WPM_SHA256)
    for map_data in maps:
        if map_data["pathing"]["file"] != f"pathing/map-{map_data['id']}.bin":
            raise ValueError(f"unexpected pathing file for map {map_data['id']}")
        if map_data["pathing"]["width"] != WPM_WIDTH or map_data["pathing"]["height"] != WPM_HEIGHT:
            raise ValueError(f"unexpected pathing metadata for map {map_data['id']}")
        if map_data["pathing"].get("cellUnits", PATHING_CELL_UNITS) != PATHING_CELL_UNITS:
            raise ValueError(f"unexpected pathing cell size for map {map_data['id']}")
        if tuple(map_data["pathing"].get("origin", WPM_ORIGIN)) != WPM_ORIGIN:
            raise ValueError(f"unexpected pathing origin for map {map_data['id']}")
        artifact = _read_wpm(MVP_DATA / map_data["pathing"]["file"], map_data["pathing"]["sha256"])
        if artifact != raw_wpm:
            raise ValueError(f"map {map_data['id']} WPM differs from map 0")

    cells = raw_wpm[WPM_HEADER_SIZE:]
    packed = _packbits(cells)
    payload = base64.b64encode(packed).decode("ascii")
    catalog_version = _sha256(source_bytes + b"\0" + raw_wpm)

    definitions = []
    for map_data in maps:
        bounds = _aligned_bounds(map_data)
        grid, width, height = _build_grid(cells, bounds)
        anchors = map_data["anchors"]
        troll = _grid_point(anchors.get("trollHouse") or anchors.get("trollHouse0"), bounds, width, height)
        # lifeTree is the simulation elf anchor. elf0 is selected only by
        # createSession for map 4 DEFEND; map 6 intentionally remains null.
        elf = _grid_point(anchors.get("lifeTree"), bounds, width, height)
        angel = _grid_point(anchors.get("angel"), bounds, width, height)
        stones = []
        for key in ("stone0", "stone1"):
            point = _grid_point(anchors.get(key), bounds, width, height)
            if point is not None:
                stones.append(point)
        if troll is None:
            raise ValueError(f"map {map_data['id']} has no troll-house anchor")
        troll_center = {
            "x": (troll["gx"] + 0.5) * WEB_TILE_UNITS,
            "y": (troll["gy"] + 0.5) * WEB_TILE_UNITS,
        }
        definitions.append({
            "id": map_data["id"],
            "key": f"MAP_{map_data['id']}",
            "name": map_data["name"],
            "description": f"{map_data['name']}（原版 GameMap_load 竞技场）",
            "tags": [],
            "grid": [width, height],
            "world": [width * WEB_TILE_UNITS, height * WEB_TILE_UNITS],
            "tileUnits": BUILD_CELL_UNITS,
            "sourceRect": [
                map_data["boundRect"]["minX"],
                map_data["boundRect"]["minY"],
                map_data["boundRect"]["maxX"],
                map_data["boundRect"]["maxY"],
            ],
            "extraRects": map_data["extraRects"],
            "bounds": list(bounds),
            "spawns": {"troll": troll, "elf": elf},
            "trollHouse": troll_center,
            "angel": angel,
            "stones": stones,
            "openTiles": sum(1 for value in grid if value == 0),
            "carvedTiles": 0,
            "elfDistance": _bfs_distance(grid, width, height, troll, elf),
            "background": f"/tve4/maps/map-{map_data['id']}.png",
            "thumb": f"/tve4/maps/map-{map_data['id']}-thumb.png",
            "boundRect": map_data["boundRect"],
            "checkRect": map_data["checkRect"],
            "cameraBounds": map_data["cameraBounds"],
            "minimap": map_data["minimap"],
            "anchors": anchors,
            "pathing": {
                "width": WPM_WIDTH,
                "height": WPM_HEIGHT,
                "cellUnits": PATHING_CELL_UNITS,
                "file": map_data["pathing"]["file"],
                "sha256": WPM_SHA256,
                "origin": list(WPM_ORIGIN),
            },
        })

    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "pathing.generated.ts").write_text(
        "\n".join(_base64_typescript(payload)),
        encoding="utf-8",
        newline="\n",
    )
    (OUTPUT / "maps.generated.ts").write_text(
        "\n".join(_maps_typescript(maps, definitions, catalog_version)),
        encoding="utf-8",
        newline="\n",
    )

    GEOMETRY_OUTPUT.mkdir(parents=True, exist_ok=True)
    geometry_sizes = []
    for map_data in maps:
        geometry = _render_geometry(map_data, _aligned_bounds(map_data), catalog_version)
        payload = _json(geometry)
        (GEOMETRY_OUTPUT / f"map-{map_data['id']}.json").write_text(
            payload,
            encoding="utf-8",
            newline="\n",
        )
        geometry_sizes.append(len(payload.encode("utf-8")))
    print(
        f"generated {len(definitions)} maps; shared WPM {len(cells)} bytes -> "
        f"PackBits {len(packed)} bytes -> Base64 {len(payload)} chars; "
        f"render geometry {sum(geometry_sizes)} bytes across 8 lazy-loaded files"
    )


if __name__ == "__main__":
    main()
