import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools.tve4_source import generate_runtime_maps


class RuntimeMapsTest(unittest.TestCase):
    def test_generates_from_task2_schema_without_pathing_origin(self):
        maps = generate_runtime_maps.json.loads(
            (generate_runtime_maps.MVP_DATA / "maps.json").read_text(encoding="utf-8")
        )
        self.assertTrue(all("origin" not in map_data["pathing"] for map_data in maps))

        with tempfile.TemporaryDirectory(prefix="tve4-runtime-maps-") as temporary:
            output = Path(temporary)
            with patch.object(generate_runtime_maps, "OUTPUT", output):
                generate_runtime_maps.main()

            catalog = (output / "maps.generated.ts").read_text(encoding="utf-8")
            payload = (output / "pathing.generated.ts").read_text(encoding="utf-8")
            self.assertIn('"origin":[-29696,-17920]', catalog)
            self.assertIn("WPM_PACKBITS_BASE64", payload)


if __name__ == "__main__":
    unittest.main()
