# 《新巨魔与精灵 v4.0.34b》原版概览（M0）

## 来源与可信度

- 原文件：`92321DFF967C964EC7EB7EE52A91A7A4.w3x`，43,290,927 字节
- MD5：`92321DFF967C964EC7EB7EE52A91A7A4`（与文件名一致）
- SHA-256：`D8D3DF747520529EE530A87754D568278F51378DFA30E419A64FE208165BB9D7`
- 文件头：`HM3W`，版本字符串 `v4.0.34b`，MPQ 头位于偏移 512
- 以上均为 **VERIFIED**（直接读取文件字节）

## 游戏定位

Warcraft III 自定义地图，非对称对抗：精灵阵营建造/防守，巨魔阵营拆建筑/击杀英雄获取金币。网页端复刻必须保留阵营差异、建造链、经济、装备、技能与模式系统，不能简化成普通塔防。**VERIFIED**（JASS 触发器与物编数据存在大量对应系统；具体数值见其他文档）。

## 已确认存在的核心系统（VERIFIED）

| 系统 | 证据 |
| --- | --- |
| 4 种平衡模式 OLD / BALANCE / FAST / MIDDLE | `war3map.j` 常量 `s__GameMode_MODE_*` |
| 9 种规则 SINGLE / DOUBLE / FIX / RACE / DEFEND / SOLO / DUET / SURVIVE / REVIVE | `war3map.j` 常量 `s__GameRule_RULE_*` |
| 8 种地图 BIG_SNOW_LAND / BIG_FOREST / SMALL_FOREST / SOLO_AREA / DEFEND_AREA / MIDDLE_FOREST / RACE_FOREST / BIG_SNOW_FIELD | `war3map.j` 常量 `s__GameMap_MAP_*` |
| 比赛类型 1001–1005 预设模式组合 | `war3map.j` `bCommonChooseMap___checkIfHostHasSetGameModeAndRule` |
| 精灵死亡赏金：50% 金币 + 8×木材，MIDDLE 减半，最低 `AngelStoleGoldInt*25`，上限 1,000,000 | `Trig_SingleElveDieActions` |
| 精灵有复活触发器 | `gg_trg_ReviveElveDie` |
| 原版 JASS 12,283,445 字节 | MPQ 解包 + 自写解析器交叉验证 |
| 物编技能数据 `war3map.w3a` 127,740 字节 | MPQ 解包 |
| 单位数据 SLK（UnitBalance/UnitData/UnitUI/UnitWeapons/UnitAbilities） | 解包目录 `Units/` |
| 物品数据 `Units/ItemData.slk`、`Units/ItemFunc.txt` | 解包目录 |
| 地形 `war3map.w3e` 778,928 字节，可通行性 `war3map.wpm` 1,769,488 字节 | MPQ 解包 |
| 装饰物 `war3map.doo` 214,174 字节，4,283 条记录 | 解包 + 二进制解析 |
| 阴影 `war3map.shd` 1,769,472 字节 | MPQ 解包 |

## 未确认（UNKNOWN）

- `war3map.w3u`、`war3map.w3t`、`war3map.w3h`、`war3map.w3q` 不在 MPQ hash 表中；`war3mapUnits.doo` 仅在 `(listfile)` 中出现、hash 表缺失。原版自定义单位是否全部通过 SLK/TXT 覆盖，尚未完全确认。
- 触发器 12MB 为 JASS 转写后的大文件，存在大量类库/封装函数；完整调用链尚未全部跟踪。
- MDX 模型动画列表、贴图引用完整性需逐个模型解析后才能给出结论。

## 与现有网页实现的关系

当前仓库 `src/lib/tve-classic/` 已有一个**简化单机**实现（1 巨魔 vs 3 精灵、OLD 线数值、程序化地图），它属于 **PROPOSED** 的网页端移植草案，不等同原版完整规则。原版模式系统、复活机制、商店/装备细节、真实地形碰撞尚未在该草案中完整实现。
