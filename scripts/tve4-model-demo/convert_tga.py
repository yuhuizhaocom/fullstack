from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[2] / "public" / "tve4-model-demo" / "textures"
converted = 0
for path in root.rglob("*.tga"):
    target = path.with_suffix(".png")
    with Image.open(path) as image:
        image.convert("RGBA").save(target, optimize=True)
    converted += 1
print(f"converted {converted} TGA textures to PNG")
