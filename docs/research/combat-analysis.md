# 战斗系统（M0）

## 定点验证（2026-11-26 补充，VERIFIED）

`sa__OldTrollDamageHandler_causeDamage`（`war3map.j` 行 190866，由 `st__IDamageHandler_causeDamage[420]` 注册）：

```jass
damageI = R2I(GetEventDamage())
if not IsUnitAlly(damager, owner(victim)):
    if damager not in punishTrollCheatGroup:
        ResourceUtils.addGold(owner(damager), damageI)
    TextTagUtils.createTextTag("+ " + damageI, ...)
    if damager in AttendTroll.attendGroup: AttendTroll.attack(...)
    if GetUnitAbilityLevel(damager, OLD_TROLL_STOLE_LIFE_SKILL_TYPE) > 0:
        SetUnitState(damager, LIFE, LIFE + 0.22 * damageR)
```

验证了：**造成伤害 = 获得等量金币**；OLD 模式有 22% 吸血技能（`OLD_TROLL_STOLE_LIFE_SKILL_TYPE`）。网页草案的“伤害转金币”规则与之一致。

`Units/UnitWeapons.slk`（VERIFIED）：

| ID | 武器1 冷却 | 武器1 射程 | 武器1 平均伤害 | 武器2 |
| --- | ---: | ---: | ---: | --- |
| H010 | 2.2 | 100 | 7（2d6） | 远程 500，平均 5（2d4） |
| H020 | 1.5 | 80 | 7（2d6，另有 dmgplus=4 字段） | 对空 300，平均 5 |

精灵 10 HP、巨魔平均 7 伤害 → **两击击杀**，不是严格的一击必杀；网页草案后来改成伤害制是正确的方向。

## 已验证（原有记录）

- 原版存在统一伤害事件：`Trig_DamageEventActions`（行 144463）与模式化伤害处理器 `OldTrollDamageHandler.causeDamage`（行 49063）、`BalanceTrollDamageHandler`、`FastTrollDamageHandler`、`MiddleTrollDamageHandler`（**VERIFIED**）。
- 物编中存在 `UnitWeapons.slk`（H010/H020 行）与 `Units/AbilityBuffData.slk`、`Units/AbilityData.slk`（**VERIFIED**）。
- 护甲类型在 UnitUI 中：英雄为 Flesh，建筑多为 Stone，箭塔/金矿为 Wood（**VERIFIED**）。
- 网页草案 `wc3ArmorReduction` 使用 WC3 常见护甲公式 `1 - a*0.06/(1+a*0.06)`（**PROPOSED**，未从原版 JASS VERIFY）。

## 待确认（UNKNOWN）

- 巨魔对英雄的伤害是否一击必杀：当前网页草案早期直接 `killElf`，后改为伤害制（7 伤害 vs 10 HP）。原版 `OldTrollDamageHandler` 的实际伤害公式尚未逐行解析。
- 暴击、闪避、魔法免疫、伤害类型克制是否存在。
- 技能伤害与状态.duration 的精确数值（`war3map.w3a` 为二进制且尚未解析）。

## 已知证据来源

`war3map.j` 中的 `LIBRARY_c*TrollDamageHandler` 常量与 `sc__OldTrollDamageHandler_causeDamage` 函数体；下一步需定点阅读该函数。
