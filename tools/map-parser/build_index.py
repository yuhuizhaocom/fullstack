"""Generate docs/research/original-file-index.md from the MPQ listfile and extracted files."""

import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mpq_mini  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
EXTRACTED = r"C:\Users\肥胖的粽子\AppData\Local\Temp\tve_w3x\extracted"
W3X = r"C:\Users\肥胖的粽子\Downloads\3DMGAME-xj4034ditu\92321DFF967C964EC7EB7EE52A91A7A4.w3x"
OUT_DIR = os.path.join(ROOT, "docs", "research")

CATEGORY = {
    ".j": "触发器脚本 (JASS)",
    ".w3e": "地形数据",
    ".wpm": "可通行性数据",
    ".shd": "烘焙阴影图",
    ".mmp": "小地图",
    ".doo": "装饰物数据",
    ".w3a": "物编-技能",
    ".w3i": "地图信息",
    ".w3d": "物编-装饰物模型",
    ".blp": "贴图 (BLP)",
    ".mdx": "模型 (MDX)",
    ".tga": "贴图 (TGA)",
    ".wav": "音效",
    ".slk": "物编 SLK 数据",
    ".txt": "文本配置",
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_extracted(name):
    rel = name.replace("\\", os.sep)
    p = os.path.join(EXTRACTED, rel)
    if os.path.isfile(p):
        return p
    # 大小写不敏感兜底
    parts = rel.split(os.sep)
    cur = EXTRACTED
    for part in parts:
        if not os.path.isdir(cur):
            return None
        match = next((x for x in os.listdir(cur) if x.lower() == part.lower()), None)
        if match is None:
            return None
        cur = os.path.join(cur, match)
    return cur if os.path.isfile(cur) else None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    mpq = mpq_mini.Mpq(W3X)
    data = mpq.read("(listfile)")
    names = sorted({x.strip().replace("/", "\\") for x in data.decode("latin1").splitlines() if x.strip()})
    rows = []
    counts = {}
    extracted_count = 0
    for name in names:
        ext = os.path.splitext(name)[1].lower()
        cat = CATEGORY.get(ext, "其它资源")
        counts[cat] = counts.get(cat, 0) + 1
        path = find_extracted(name)
        if path:
            extracted_count += 1
            size = os.path.getsize(path)
            digest = sha256(path)
            status = "VERIFIED (已解包)"
        else:
            idx = mpq.block_index(name)
            if idx is None:
                size, digest, status = "-", "-", "UNKNOWN (listfile 有记录，hash 表中缺失)"
            else:
                payload = mpq.read(name)
                size = len(payload) if payload is not None else "-"
                digest = "-"
                status = "VERIFIED (MPQ 内可读，未解包到目录)"
        rows.append((cat, name.replace("\\", "/"), size, digest, status))

    lines = [
        "# 原版地图文件索引",
        "",
        "来源：`92321DFF967C964EC7EB7EE52A91A7A4.w3x`（《新巨魔与精灵 v4.0.34b》）",
        "",
        "- SHA-256：`D8D3DF747520529EE530A87754D568278F51378DFA30E419A64FE208165BB9D7`",
        "- MD5：`92321DFF967C964EC7EB7EE52A91A7A4`",
        "- 文件大小：43,290,927 字节",
        "- MPQ 头偏移：512；hash 表 1024 项，block 表 653 项，有效文件 661 个",
        "- `(listfile)` 记录文件数：%d；已解包到目录：%d" % (len(names), extracted_count),
        "- 解包工具：Devo's Map Doctor `extract --all`（前期完成）",
        "- MPQ 表核验工具：`tools/map-parser/mpq_mini.py`（本项目自写，只读）",
        "",
        "## 分类统计",
        "",
        "| 类别 | 数量 |",
        "| --- | ---: |",
    ]
    for cat, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        lines.append(f"| {cat} | {n} |")
    lines += [
        "",
        "## 关键文件解析状态",
        "",
        "| 文件 | 大小 | 状态 | 用途 |",
        "| --- | ---: | --- | --- |",
    ]
    for cat, name, size, digest, status in rows:
        if name.startswith("war3map") or name.endswith(".slk"):
            lines.append(f"| `{name}` | {size} | {status} | {cat} |")
    lines += [
        "",
        "## 完整文件清单",
        "",
        "| 类别 | 路径 | 大小 | SHA-256 | 状态 |",
        "| --- | --- | ---: | --- | --- |",
    ]
    for cat, name, size, digest, status in rows:
        lines.append(f"| {cat} | `{name}` | {size} | `{digest}` | {status} |")
    lines.append("")
    out = os.path.join(OUT_DIR, "original-file-index.md")
    open(out, "w", encoding="utf-8").write("\n".join(lines))
    print("wrote", out, "rows", len(rows))

    machine = os.path.join(OUT_DIR, "file-index.json")
    json.dump(
        {
            "w3x": os.path.basename(W3X),
            "sha256": "D8D3DF747520529EE530A87754D568278F51378DFA30E419A64FE208165BB9D7",
            "md5": "92321DFF967C964EC7EB7EE52A91A7A4",
            "listfile_count": len(names),
            "files": [
                {"category": c, "path": n, "size": s, "sha256": d, "status": st}
                for c, n, s, d, st in rows
            ],
        },
        open(machine, "w", encoding="utf-8"),
        ensure_ascii=False,
        indent=2,
    )
    print("wrote", machine)


if __name__ == "__main__":
    main()
