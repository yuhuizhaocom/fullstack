import ast
import hashlib
import json
import os
import struct
import tempfile
import unittest
from pathlib import Path

from tools.tve4_source.extract_core_maps import extract

ROOT = Path(__file__).resolve().parents[3]
EXTRACTED = Path(os.environ.get(
    "TVE4_EXTRACTED_DIR",
    r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted",
))
MVP_DATA = ROOT / "data" / "tve4" / "mvp"
WPM_SHA256 = "0ec395397888d611c1c9a1d4107f16e38482273c69ca3e8c169e3a1b0631e399"


class CoreMapsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        temporary = tempfile.TemporaryDirectory(prefix="tve4-core-maps-")
        cls.addClassCleanup(temporary.cleanup)
        cls.fresh_output = Path(temporary.name)
        cls.fresh_maps = extract(output_dir=cls.fresh_output)
        cls.maps = json.loads((MVP_DATA / "maps.json").read_text(encoding="utf-8"))
        cls.source = json.loads((MVP_DATA / "source.json").read_text(encoding="utf-8"))
        cls.wpm = (EXTRACTED / "war3map.wpm").read_bytes()

    def test_committed_artifacts_match_fresh_extraction(self):
        committed_json = (MVP_DATA / "maps.json").read_bytes()
        fresh_json = (self.fresh_output / "maps.json").read_bytes()
        self.assertEqual(committed_json, fresh_json)
        self.assertEqual(self.maps, self.fresh_maps)
        for map_data in self.maps:
            with self.subTest(map=map_data["id"]):
                committed = (MVP_DATA / map_data["pathing"]["file"]).read_bytes()
                fresh = (self.fresh_output / map_data["pathing"]["file"]).read_bytes()
                self.assertEqual(committed, fresh)
                self.assertEqual(committed, self.wpm)

    def test_real_maps_and_jass_regions(self):
        self.assertEqual(len(self.maps), 8)
        self.assertEqual([m["id"] for m in self.maps], list(range(8)))
        self.assertEqual([m["name"] for m in self.maps], [
            "大型雪地", "大型草地", "小型森林", "单挑地形",
            "防守地形", "中型森林", "竞赛森林", "冰天雪地",
        ])
        self.assertEqual(self.maps[0]["boundRect"], {
            "minX": -15744.0, "minY": -14880.0, "maxX": -736.0, "maxY": -1536.0,
        })
        self.assertEqual(self.maps[0]["checkRect"], {
            "minX": -9280.0, "minY": -9696.0, "maxX": -6816.0, "maxY": -7488.0,
        })
        self.assertEqual(self.maps[0]["cameraBounds"], {
            "minX": -17664.0, "minY": -15360.0, "maxX": 1280.0, "maxY": -512.0,
        })
        self.assertEqual(self.maps[0]["minimap"], "miniMaps\\mapId0.blp")
        self.assertEqual(self.maps[5]["extraRects"], [{
            "minX": -26688.0, "minY": -3264.0, "maxX": -16448.0, "maxY": 6752.0,
        }])
        for map_id in (0, 1, 2, 3, 6, 7):
            self.assertEqual(self.maps[map_id]["extraRects"], [])

    def test_jass_anchor_objects(self):
        troll = self.maps[0]["anchors"]["trollHouse"]
        self.assertEqual(troll["unitId"], "u03R")
        self.assertEqual(troll["x"], -8064.0)
        self.assertEqual(troll["y"], -8704.0)
        self.assertEqual(troll["facing"], 270.0)
        angel = self.maps[0]["anchors"]["angel"]
        self.assertEqual(angel["unitId"], "e00Z")
        self.assertEqual(angel["x"], -8323.4)
        self.assertEqual(angel["y"], -2099.4)
        self.assertEqual(angel["facing"], 165.712)

        expected = {
            1: ((7680.0, 6400.0), (10106.9, -357.0)),
            2: ((4480.0, -6016.0), (8477.3, -10503.2)),
            3: ((14464.0, -9856.0), (10541.8, -7914.8)),
            5: ((-21504.0, -9728.0), (-21507.5, -3956.7)),
            7: ((-8320.0, 6272.0), (-6909.7, 550.5)),
        }
        for map_id, (troll_xy, angel_xy) in expected.items():
            anchors = self.maps[map_id]["anchors"]
            self.assertEqual((anchors["trollHouse"]["x"], anchors["trollHouse"]["y"]), troll_xy)
            self.assertEqual((anchors["angel"]["x"], anchors["angel"]["y"]), angel_xy)

        defend = self.maps[4]["anchors"]
        self.assertEqual((defend["trollHouse0"]["x"], defend["trollHouse0"]["y"]), (-17408.0, 14080.0))
        self.assertEqual((defend["trollHouse3"]["x"], defend["trollHouse3"]["y"]), (-23552.0, 14080.0))
        self.assertEqual((defend["banRoad0"]["x"], defend["banRoad0"]["y"]), (-22336.0, 11008.0))
        self.assertEqual((defend["elf0"]["x"], defend["elf0"]["y"]), (-20860.7, 12423.0))
        self.assertEqual(defend["elf0"]["facing"], 52.497)
        self.assertEqual(defend["elf7"]["facing"], 217.256)
        self.assertNotIn("angel", defend)

        race = self.maps[6]["anchors"]
        self.assertEqual((race["trollHouse0"]["x"], race["trollHouse0"]["y"]), (-21504.0, 1664.0))
        self.assertEqual((race["trollHouse1"]["x"], race["trollHouse1"]["y"]), (-21504.0, -9728.0))
        self.assertEqual((race["angel"]["x"], race["angel"]["y"]), (-21507.5, -3956.7))

        extra = self.maps[5]["extraRects"][0]
        angel5 = self.maps[5]["anchors"]["angel"]
        self.assertGreater(angel5["y"], self.maps[5]["boundRect"]["maxY"])
        self.assertGreater(extra["minY"], self.maps[5]["boundRect"]["maxY"])

    def test_raw_pathing_files_match_source_wpm_bytes(self):
        self.assertEqual(self.source["coreFiles"]["war3map.wpm"]["sha256"], WPM_SHA256)
        self.assertEqual(hashlib.sha256(self.wpm).hexdigest(), WPM_SHA256)
        self.assertEqual(struct.unpack_from("<II", self.wpm, 8), (1536, 1152))
        for map_data in self.maps:
            with self.subTest(map=map_data["id"]):
                pathing = map_data["pathing"]
                self.assertEqual(pathing["width"], 1536)
                self.assertEqual(pathing["height"], 1152)
                self.assertEqual(pathing["file"], f"pathing/map-{map_data['id']}.bin")
                self.assertEqual(pathing["sha256"], WPM_SHA256)
                raw = (MVP_DATA / pathing["file"]).read_bytes()
                self.assertEqual(raw, self.wpm)
                self.assertEqual(hashlib.sha256(raw).hexdigest(), pathing["sha256"])

    def test_terrain_and_doodads_are_unaltered_source_geometry(self):
        w3e = (EXTRACTED / "war3map.w3e").read_bytes()
        doo = (EXTRACTED / "war3map.doo").read_bytes()
        magic, version, subversion, doodad_count = struct.unpack_from("<4sIII", doo, 0)
        self.assertEqual((magic, version, subversion, doodad_count), (b"W3do", 8, 11, 4_283))
        source_doodads = []
        for index in range(doodad_count):
            offset = 16 + index * 50
            type_id = doo[offset:offset + 4].decode("ascii")
            x, y, _z = struct.unpack_from("<3f", doo, offset + 8)
            rotation = struct.unpack_from("<f", doo, offset + 20)[0]
            source_doodads.append({"typeId": type_id, "x": x, "y": y, "rotation": rotation})

        ground_offset = 65 + 385 * 289 * 4
        first_doodad = self.maps[4]["doodads"][0]
        self.assertEqual(first_doodad["typeId"], "WTst")
        self.assertEqual(first_doodad["x"], -19776.0)
        self.assertEqual(first_doodad["y"], 11840.0)
        self.assertAlmostEqual(first_doodad["rotation"], 4.7123894691467285)

        for map_data in self.maps:
            with self.subTest(map=map_data["id"]):
                self.assertGreater(len(map_data["terrain"]), 0)
                self.assertGreater(len(map_data["doodads"]), 0)
                rects = [map_data["boundRect"], *map_data["extraRects"]]
                for tile in map_data["terrain"]:
                    # The playable bounds in JASS cameraAll span 372x276
                    # terrain cells and are centered at (-5120, 256). Center
                    # the 385x289 W3E grid on that point, not on (0, 0).
                    self.assertEqual((tile["x"] + 29760) % 128, 0)
                    self.assertEqual((tile["y"] + 18240) % 128, 0)
                    tx = (tile["x"] + 29760) // 128
                    ty = (tile["y"] + 18240) // 128
                    self.assertGreaterEqual(tx, 0)
                    self.assertLess(tx, 385)
                    self.assertGreaterEqual(ty, 0)
                    self.assertLess(ty, 289)
                    self.assertEqual(tile["tileId"], w3e[ground_offset + ty * 385 + tx])
                    self.assertTrue(any(
                        tile["x"] < rect["maxX"] and tile["x"] + 128 > rect["minX"]
                        and tile["y"] < rect["maxY"] and tile["y"] + 128 > rect["minY"]
                        for rect in rects
                    ))
                for rect in rects:
                    self.assertTrue(any(
                        tile["x"] <= rect["minX"] and tile["x"] + 128 > rect["minX"]
                        for tile in map_data["terrain"]
                    ))
                    self.assertTrue(any(
                        tile["x"] < rect["maxX"] and tile["x"] + 128 >= rect["maxX"]
                        for tile in map_data["terrain"]
                    ))
                expected_doodads = [
                    doodad for doodad in source_doodads
                    if any(
                        rect["minX"] <= doodad["x"] <= rect["maxX"]
                        and rect["minY"] <= doodad["y"] <= rect["maxY"]
                        for rect in rects
                    )
                ]
                self.assertEqual(map_data["doodads"], expected_doodads)

    def test_legacy_generator_has_no_spawn_mutation_calls(self):
        path = ROOT / "tools" / "map-parser" / "generate_tve4_maps.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        called = {
            node.func.id
            for node in ast.walk(tree)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
        }
        self.assertFalse(called & {"clear_rect", "carve_to_main", "choose_elf_spawn"})


if __name__ == "__main__":
    unittest.main()
