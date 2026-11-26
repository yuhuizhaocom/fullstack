# 技能（M0）

## w3a 技能数值（2026-11-26 补充，VERIFIED）

`tools/map-parser/parse_w3a.py` 成功解析 `war3map.w3a` v2 全部 50 个技能（字段按等级存放，字段名如 `acdn/adur/amcs/bsk1/aran`）：

| ID | 名称 | 关键字段（VERIFIED） |
| --- | --- | --- |
| A067 | 魔法提速 | `acdn=30`、`adur=15`、`amcs=20`、`bsk1=1.1`（+110% 移速）；说明中注明群战规则下初始 6 秒/作坊升级后 9 秒 |
| A06M | 纠缠根须 | `acdn=3`、`adur=3`、`ahdu=3`、`aran=999999`、`amcs=0` |
| A066 | 闪烁 | 不在 w3a 中，为物编内置技能（仅从 JASS 引用与 CampaignAbilityStrings 确认名称/图标） |

注意：网页草案把纠缠根须冷却设为 45 秒，而原版 w3a 为 **3 秒**（属 PROPOSED 平衡改动，不是原版数值）。

## 已验证的技能 ID（2026-11-26 补充）

从 JASS 中 `GetUnitAbilityLevel/UnitAddAbility` 等调用提取 85 个技能 ID，并在 `Units/CampaignAbilityStrings.txt` 解析出名称（VERIFIED）：

| ID | 名称 | 图标 |
| --- | --- | --- |
| A066 | 闪烁 | BTNBlink.blp |
| A0LD | 闪烁EX | BTNLoad.blp |
| A067 | 魔法提速 | BTNAnimalWarTraining.blp |
| A06M / A0C0 / A0GX / A0SW | 纠缠根须（多等级/多形态） | BTNEntanglingRoots.blp |
| A062 / A0BS / A0H8 / A0TX | 巨魔之眼（Far Sight） | BTNFarSight.blp |
| A085 / A0CQ / A0HP / A0TN | 恐惧嗥叫 | BTNHowlOfTerror.blp |
| A0K0 | 掠夺 | PASBTNPillage.blp |
| 其他 | 圣光、嗜血、霜甲、魔法护盾等 | 见 `ability-id` 提取脚本输出 |

注意：巨魔的疾风步/狂战士/传送未在已提取的 85 个 ID 中直接找到对应项，可能通过效果单位/触发器实现（UNKNOWN）。网页草案的技能映射仍需谨慎。

## 已验证存在

- `war3map.w3a` 127,740 字节（物编技能数据，**VERIFIED**）。
- `Units/AbilityData.slk` 400,198 字节、`Units/AbilityBuffData.slk` 10,292 字节（**VERIFIED**）。
- JASS 中 `Trig_SoloTrollWindWalkActions`、`Trig_DuetTrollWindWalkActions` 表明疾风步与模式规则相关（**VERIFIED**）。
- `Event`（可能）技能相关：`TriggerRegisterUnitEvent` / `AttackEvent` / `DamageEvent` 系统存在。

## 网页草案（PROPOSED）

| 阵营 | 技能 | 网页实现 |
| --- | --- | --- |
| 精灵 | 闪烁 blink | 向指针位移最多 750，CD 25 |
| 精灵 | 魔法提速 haste | 15 秒 +110% 移速，CD 30 |
| 精灵 | 纠缠根须 entangle | 定身最近巨魔 3 秒，CD 45 |
| 精灵 | 沉默 silence | 封锁巨魔技能 5 秒，CD 60 |
| 巨魔 | 疾风步 windwalk | 隐身 20 秒 +50% 移速，CD 30 |
| 巨魔 | 狂战士 berserk | 10 秒 +50% 攻速、受伤 +50%，CD 120 |
| 巨魔 | 传送 teleport | 2 秒读条回巨魔房屋，CD 45 |

上述效果与数值为 **PROPOSED**，尚未从 `war3map.w3a`/JASS 得到 VERIFIED 映射。

## 下一步

解析 `war3map.w3a` 的 ABIL 表，提取技能 ID、名称、等级字段；与 JASS 中出现的四字符技能 ID 做交叉匹配。
