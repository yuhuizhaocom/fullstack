# 经济系统（M0）

## 初始资源（VERIFIED，2026-11-26）

`SINGLE` 规则参数提供者（`s__SingleParamProvider_*`，行 132532 起）：

| 阵营 | OLD | MIDDLE | 木材 |
| --- | ---: | ---: | ---: |
| 精灵 | 30 金 | 10 金 | 0 |
| 巨魔 | 70 金 | 50 金 | 0 |

网页草案 `START_GOLD={elf:30,troll:70}` 与 OLD 模式完全一致。

## 巨魔出现时间（VERIFIED，2026-11-26）

各规则 `getTrollAppearTime`：SINGLE/REVIVE/DOUBLE/RACE/SOLO/DUET/DEFEND = **30 秒**，FIX/SURVIVE = **45 秒**。精灵共享视野/暴露视野时间均为 300 秒。

这意味着原版在巨魔出现前有 30–45 秒准备期；网页草案巨魔开局即可行动，属于重大差异（PROPOSED 简化）。

## 初始资源（原记录，PROPOSED）

当前网页草案 `START_GOLD={elf:30,troll:70}`、`START_WOOD=0` 为 **PROPOSED**，尚未从 JASS 初始化触发器中 VERIFY。

## 收入（VERIFIED）

建筑 Ubertip 明确给出“每秒”收入：

| 建筑 | 每秒金币 |
| --- | ---: |
| 帐篷 u00Y | 1 |
| 精灵农场 u010 | 4 |
| 高等精灵农场 u011 | 8 |
| 闹鬼金矿 e00H | 1 |
| 蓝宝石矿脉 e020 | 32 |
| 巨魔房屋 u03D L1 | 3 |

后续等级收入在网页草案中为 1/2/4/8/... 与 3/5/9/17/1250（**PROPOSED**，需以 w3u/JASS 复核）。

## 木材市场（VERIFIED）

`u018` Ubertip：提供金币与木材之间的交易，价格随“当前拥有市场的人数”变化。当前网页草案用固定步长 5、买入 155、卖出 150、上限 495 模拟（**PROPOSED**）。

## 击杀赏金（VERIFIED）

`Trig_SingleElveDieActions`：

```
awardGold = floor(ownGold * 0.50) + ownWood * 8
if currentMode == MIDDLE: awardGold = floor(awardGold * 0.50)
awardGold = max(awardGold, AngelManager_getAngelStoleGoldInt() * 25)
awardGold = min(awardGold, 1000000)
if IsUnitEnemy(death, killerOwner): addGold(killerOwner, awardGold)
```

即 50% 金币 + 8×木材，MIDDLE 模式减半，有下限与 100 万上限。网页 `elfDeathBounty` 已完整实现四项（VERIFIED 对齐）。

## 伤害转金币（VERIFIED）

`sa__OldTrollDamageHandler_causeDamage` 对所有非友军伤害都给攻击者 `floor(damage)` 金币，并在攻击者处显示 `+damage`。网页现对**拆建筑**与**攻击英雄**两种伤害都发放等量金币（英雄分支飘字在攻击者处，与 JASS 一致）。

## 装备价格（PARTIAL VERIFIED）

`Units/ItemData.slk` 与 `Units/ItemFunc.txt` 已解包；当前网页草案的 8 种装备价格/属性为 **PROPOSED**，尚未逐项映射到原版物品 ID。
