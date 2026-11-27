import base64
import hashlib
import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools.tve4_source import generate_runtime_maps


class RuntimeMapsTest(unittest.TestCase):
    def generate(self, source: Path, output: Path) -> None:
        with patch.object(generate_runtime_maps, "MVP_DATA", source), patch.object(
            generate_runtime_maps, "OUTPUT", output
        ), patch.object(
            generate_runtime_maps,
            "GEOMETRY_OUTPUT",
            output.with_name(f"{output.name}-geometry"),
            create=True,
        ):
            generate_runtime_maps.main()

    def decode_generated_payload(self, text: str) -> bytes:
        encoded = "".join(
            json.loads(match)
            for match in re.findall(r'^\s*("(?:[^"\\]|\\.)*"),$', text, re.MULTILINE)
        )
        packed = base64.b64decode(encoded, validate=True)
        decoded = bytearray()
        index = 0
        while index < len(packed):
            control = packed[index]
            index += 1
            if control == 128:
                continue
            if control <= 127:
                count = control + 1
                self.assertLessEqual(index + count, len(packed))
                decoded.extend(packed[index:index + count])
                index += count
            else:
                count = 257 - control
                self.assertLess(index, len(packed))
                decoded.extend([packed[index]] * count)
                index += 1
        return bytes(decoded)

    def test_task2_and_explicit_origin_are_deterministic_and_preserve_wpm(self):
        original_maps = json.loads(
            (generate_runtime_maps.MVP_DATA / "maps.json").read_text(encoding="utf-8")
        )
        self.assertTrue(all("origin" not in map_data["pathing"] for map_data in original_maps))
        source_wpm = (generate_runtime_maps.MVP_DATA / "pathing" / "map-0.bin").read_bytes()
        expected_cells = source_wpm[generate_runtime_maps.WPM_HEADER_SIZE:]

        with tempfile.TemporaryDirectory(prefix="tve4-runtime-maps-") as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            shutil.copytree(generate_runtime_maps.MVP_DATA / "pathing", source / "pathing")
            generated = {}
            for variant in ("task2", "explicit"):
                maps = json.loads(json.dumps(original_maps))
                if variant == "explicit":
                    for map_data in maps:
                        map_data["pathing"]["origin"] = list(generate_runtime_maps.WPM_ORIGIN)
                (source / "maps.json").write_text(
                    json.dumps(maps, ensure_ascii=False), encoding="utf-8"
                )
                output = root / variant
                self.generate(source, output)
                repeated = root / f"{variant}-repeat"
                self.generate(source, repeated)
                for filename in ("maps.generated.ts", "pathing.generated.ts"):
                    first = (output / filename).read_bytes()
                    self.assertEqual(first, (repeated / filename).read_bytes(), filename)
                    self.assertEqual(
                        hashlib.sha256(first).hexdigest(),
                        hashlib.sha256((repeated / filename).read_bytes()).hexdigest(),
                        filename,
                    )
                    generated[variant, filename] = first
                catalog = (output / "maps.generated.ts").read_text(encoding="utf-8")
                definitions = [
                    json.loads(match)
                    for match in re.findall(r"^  \d+: (\{.*\}),$", catalog, re.MULTILINE)
                ]
                self.assertEqual([definition["id"] for definition in definitions], list(range(8)))
                for definition in definitions:
                    self.assertEqual(
                        tuple(definition["pathing"]["origin"]),
                        generate_runtime_maps.WPM_ORIGIN,
                    )
                payload = (output / "pathing.generated.ts").read_text(encoding="utf-8")
                self.assertEqual(self.decode_generated_payload(payload), expected_cells)

            self.assertEqual(
                generated["task2", "pathing.generated.ts"],
                generated["explicit", "pathing.generated.ts"],
                "optional source origin must not alter the WPM payload",
            )

    def test_rejects_explicit_mismatched_origin(self):
        maps = json.loads(
            (generate_runtime_maps.MVP_DATA / "maps.json").read_text(encoding="utf-8")
        )
        maps[0]["pathing"]["origin"] = [0, 0]
        with tempfile.TemporaryDirectory(prefix="tve4-runtime-maps-origin-") as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            shutil.copytree(generate_runtime_maps.MVP_DATA / "pathing", source / "pathing")
            (source / "maps.json").write_text(json.dumps(maps), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unexpected pathing origin"):
                self.generate(source, root / "output")

    def test_generates_render_only_geometry_with_source_coordinates_and_hash(self):
        maps = json.loads(
            (generate_runtime_maps.MVP_DATA / "maps.json").read_text(encoding="utf-8")
        )

        def number(value: float) -> str:
            text = f"{float(value):.9f}".rstrip("0").rstrip(".")
            return "0" if text in ("", "-0") else text

        def geometry_hash(map_data: dict) -> str:
            lines = ["tve4-render-geometry-v1"]
            lines.extend(
                f"T{number(tile['x'])},{number(tile['y'])},{tile['tileId']}"
                for tile in map_data["terrain"]
            )
            lines.extend(
                f"D{doodad['typeId']},{number(doodad['x'])},{number(doodad['y'])},{number(doodad['rotation'])}"
                for doodad in map_data["doodads"]
            )
            return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()

        with tempfile.TemporaryDirectory(prefix="tve4-render-geometry-") as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            shutil.copytree(generate_runtime_maps.MVP_DATA / "pathing", source / "pathing")
            (source / "maps.json").write_text(
                json.dumps(maps, ensure_ascii=False), encoding="utf-8"
            )
            output = root / "output"
            geometry_output = root / "geometry"
            with patch.object(generate_runtime_maps, "MVP_DATA", source), patch.object(
                generate_runtime_maps, "OUTPUT", output
            ), patch.object(
                generate_runtime_maps, "GEOMETRY_OUTPUT", geometry_output, create=True
            ):
                generate_runtime_maps.main()

            catalog = (output / "maps.generated.ts").read_text(encoding="utf-8")
            catalog_version = re.search(r'MAP_CATALOG_VERSION = "([a-f0-9]{64})"', catalog)
            self.assertIsNotNone(catalog_version)
            self.assertNotIn('"terrain"', catalog)
            self.assertNotIn('"doodads"', catalog)
            self.assertEqual(
                sorted(path.name for path in geometry_output.glob("map-*.json")),
                [f"map-{map_id}.json" for map_id in range(8)],
            )
            for map_data in maps:
                geometry = json.loads(
                    (geometry_output / f"map-{map_data['id']}.json").read_text(encoding="utf-8")
                )
                self.assertEqual(geometry["version"], 1)
                self.assertEqual(geometry["mapId"], map_data["id"])
                self.assertEqual(geometry["catalogVersion"], catalog_version.group(1))
                self.assertEqual(geometry["runtimeBounds"], list(generate_runtime_maps._aligned_bounds(map_data)))
                self.assertEqual(geometry["terrain"], map_data["terrain"])
                self.assertEqual(geometry["doodads"], map_data["doodads"])
                self.assertEqual(geometry["geometryHash"], geometry_hash(map_data))
                self.assertEqual(geometry["coordinateSystem"]["sourceTileUnits"], 128)
                self.assertEqual(geometry["coordinateSystem"]["webTileUnits"], 16)
                self.assertEqual(geometry["coordinateSystem"]["scaleDivisor"], 8)


if __name__ == "__main__":
    unittest.main()
