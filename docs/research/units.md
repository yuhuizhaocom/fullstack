# 单位数据（M0）

来源：`Units/UnitBalance.slk`、`Units/UnitData.slk`、`Units/UnitUI.slk`、`Units/UnitWeapons.slk`、`Units/CampaignUnitFunc.txt`。均为 **VERIFIED**（直接从解包文件读取）。

> 注意：原版 WC3 世界单位 1 地形格 = 128；网页实现使用 TILE=64，因此移动速度数值在网页端按 1/2 换算（数据变更属 **PROPOSED**）。

## 英雄

| 单位 ID | 名称 | 原版 HP | 原版移速 | 视野 | 费用 | 证据 |
| --- | --- | ---: | ---: | ---: | --- | --- |
| H010 | 精灵 | 10 | 250 | 1200 | 425 金 / 100 木 | UnitBalance + CampaignUnitFunc `[H010]` |
| H020 | 巨魔 | 750 | 350 | 1400 | 425 金 / 100 木 | UnitBalance + CampaignUnitFunc `[H020]` |

`CampaignUnitFunc.txt` 中 `[H010]` 的 `Builds=u01C,u01F,u00Y,u018,u01B,u01E,u01D,u06P`，说明原版精灵英雄可建造 8 类建筑，而当前网页实现只开放帐篷/金矿/墙/塔（**PROPOSED 简化**，待补全）。

`UnitUI` 中两者的 `armor=Flesh`，`name=shasure_H010/H020`（中文名在 CampaignUnitFunc）。

## 攻击/技能（部分 UNKNOWN）

- `UnitWeapons.slk` 中存在 H010/H020 行，但本次未逐字段解析攻击力与攻击间隔（攻击数值当前取自网页草案 `data.ts`，属于 **INFERRED/PROPOSED**，需用 w3a + JASS 复核）。
- 技能 ID 尚未从 `war3map.w3a` 解出；当前网页的 blink/haste/entangle/silence/windwalk/berserk/teleport 为 **PROPOSED** 映射。
- `CampaignUnitFunc.txt` 中 H010 的 `Ubertip` 描述的是圣骑士技能（神圣之光/神圣护甲/专注光环/复活），与地图自定义技能不一致，说明 TXT 中部分文本为原版模板残留，不能直接当作地图规则（**UNKNOWN**）。

## 其他可见单位/建筑相关 ID

| ID | 名称 | HP | 费用 | 说明 |
| --- | --- | ---: | --- | --- |
| u00Y | 帐篷 | 10 | - | 每秒 1 金，4 人口，"每个精灵只能建造一座" |
| e00H | 闹鬼金矿 | 50 | 90 金 | 每秒 1 金 |
| u03D | 巨魔房屋 L1 | 550 | 200 金 | 每秒 3 金 |
| u04B | 精灵墙 L1 | 320 | 128 金 | Stone 护甲 |
| u01X | 岩石墙 L1 | 300 | 120 金 | Stone 护甲 |
| u030 | 水泥墙 L1 | 360 | 144 金 | Stone 护甲 |
| h000 | 基础箭塔 | 10 | 4 金 | Wood 护甲 |
| u010 | 精灵农场 | 40 | 100 金 | 每秒 4 金，12 人口，需 u00D |
| e020 | 蓝宝石矿脉 | 50 | 800 木 | 每秒 32 金 |
| u011 | 高等精灵农场 | 80 | 200 金 | 每秒 8 金，16 人口 |
| u01C | 精灵工厂 | 25 | 32 金 | 需墙类建筑 |
| u01F | 石墙 L1 | 50 | 4 金 | 视野 800 |
| u018 | 市场/交易所 | 50 | 64 金 | 提供金币与木材交易 |
| u01B | 猎手大厅 | 400 | 512 木 | 需 u00W |
| u01E | 显影之塔 | 10 | 256 木 | 反隐 |
| u01D | 精灵之树 | 100 | 256 金 | 生产小精灵 |

详见 `buildings.md` 与 `economy-analysis.md`。
