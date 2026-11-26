# 模型资源分析（M0）

## 统计（VERIFIED）

解包目录共有 163 个 `.mdx`/`.MDX` 文件（不区分大小写），包含：

- 英雄/单位：`TrollPirate.mdx`、`DarkTrollTrapper.mdx`、`Oldelf.mdx`、`Jaina.mdx`、`Kael.mdx` 等
- 建筑：`blzModels/buildings/CentaurTent2.mdx`、`EntangledGoldmine050.mdx`、`TowerDefenseTower.mdx`、`City_LowWall_ShortEndCap.mdx`、`ForestTrollHut0.mdx` 等
- 技能特效：`Abilities/Spells/Human/HolyBolt/HolyBoltSpecialArtLianYi.mdx` 等
- 载入画面：`LoadingScreen.mdx`

已转换到 `public/tve-original/models/` 的模型（`scripts/tve/build_assets.py`）：troll、elf、wolf、hut、tent、goldmine、tower、wall、rock（**PROPOSED 选择**）。

## 贴图引用（部分 VERIFIED）

`models.json` 记录每个 MDX 的 TEXS 槽位；多数槽位为空，只有 `troll_4.png`、`elf_0.png` 成功转换（原因是地图模型由第三方工具压缩，且原版 WC3 游戏贴图未打包进地图）。这意味着：

- 模型几何可用（Three.js 草案可显示）。
- 贴图大量缺失，无法直接还原原版外观（**VERIFIED 缺失**）。

## 动画（UNKNOWN）

本次未逐个解析 MDX 的 `SEQS` 块，动画名称/数量未知。M2 阶段需用 MDX 解析工具或 Three.js 运行时枚举动画并制作 2D 序列帧。
