# 贴图资源分析（M0）

## 统计（VERIFIED）

| 类型 | 数量 |
| --- | ---: |
| `.blp` / `.BLP` | 408 |
| `.tga` / `.TGA` | 11 |
| `war3mapMap.blp`（小地图） | 1（17,864 字节） |

## 转换状态

- `scripts/tve/blpread.py` 可将 BLP 转为 PNG；`public/tve-original/icons/` 中的命令按钮图标已生成（**VERIFIED**）。
- `public/tve-original/map/minimap.png` 由 `war3mapMap.blp` 转换（**VERIFIED**）。
- 模型贴图仅 `troll_4.png`、`elf_0.png` 成功；大量贴图槽位指向 WC3 安装目录资源，地图内不存在（**VERIFIED 缺失**）。
- 地形瓦片贴图未在解包目录中找到，当前网页地表为程序化调色（**PROPOSED**）。

## 图标对应关系（UNKNOWN）

`ICON_PATHS` 在 `build_assets.py` 中为网页草案指定的图标映射（例如 `H010→BTNelveputong.blp`），尚未与原版单位/技能 ID 逐项 VERIFY。
