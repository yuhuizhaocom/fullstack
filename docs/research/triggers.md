# 触发器分析（M0）

`war3map.j` 共 12,283,445 字节，由 JASS 与大量类库（结构体 `s__*`、接口 `sc__*`）组成。本次只做**定点验证**，不声称完整理解全部触发器。

## 已定位并阅读的触发器（VERIFIED）

| 触发器/函数 | 行号（解包文件） | 已确认逻辑 |
| --- | ---: | --- |
| `Trig_SingleElveDieActions` | 132614 | 赏金计算、2 秒清理、队伍转移、结束检查 |
| `Trig_SingleTrollDieActions` | 132678 | 巨魔死亡信息、结束检查 |
| `bCommonChooseMap___checkIfHostHasSetGameModeAndRule` | 58937 | matchType 1001–1005 预设 mode/rule/map 组合 |
| `Trig_AttackEventActions` | 141809 | 存在攻击事件系统（未逐行读） |
| `Trig_DamageEventActions` | 144463 | 存在伤害事件系统（未逐行读） |
| `Trig_ReviveElveDieActions` | 133199 | 存在精灵复活规则（未逐行读） |
| `Trig_DoubleTrollDieActions` | 133496 | DOUBLE 规则 |
| `Trig_FixTrollDieActions` | 133854 | FIX 规则 |
| `Trig_RaceTrollDieActions` | 134130 | RACE 规则 |
| `Trig_SoloElveDamagedActions` / `Trig_SoloTrollDieActions` | 134308 / 134372 | SOLO 规则 |
| `Trig_DuetElveDamagedActions` / `Trig_DuetTrollDieActions` | 134480 / 134596 | DUET 规则 |
| `Trig_DefendTrollDieActions` | 134843 | DEFEND 规则 |
| `Trig_SoloTrollWindWalkActions` / `Trig_DuetTrollWindWalkActions` | 134425 / 134720 | 疾风步相关模式逻辑 |

## 类库/子系统（VERIFIED 存在，语义部分 UNKNOWN）

- 平衡模式：`cOldTrollDamageHandler`、`cBalanceTrollDamageHandler`、`cFastTrollDamageHandler`、`cMiddleTrollDamageHandler`（四种模式的伤害处理器）。
- 资源：`LIBRARY_cElveHouseResourceHandler`、`cElveMineResourceHandler`、`cTrollHouseResourceHandler`、`IResourceHandler`、`ResourceHandlerRegister`。
- 其他：`AngelManager`、`VisionExposer`、`TextTagUtils`、`ForceUtils`、`CameraUtils`、`GoodsManager`、`MovieHandlerRegister`、`RuleEndChecker`。

## 调用链说明

已确认 `Trig_SingleElveDieActions` 调用 `s__IRuleEndChecker_check(ruleEndChecker)`，但 `IRuleEndChecker` 内部如何结合 mode/rule 判定胜负尚未跟踪（**UNKNOWN**）。`DamageEventActions` 与 `OldTrollDamageHandler.causeDamage` 之间的调用关系也需进一步跟踪（**UNKNOWN**）。

## 调用链补充（2026-11-26，VERIFIED）

- `sc__OldTrollDamageHandler_causeDamage` 只是接口桩，实际实现由 `st__IDamageHandler_causeDamage[420]` 触发 `sa__OldTrollDamageHandler_causeDamage`（行 190866）。该函数确认伤害转金币、OLD 吸血 22%（详见 combat-analysis.md）。
- `sc__IRuleEndChecker_check` 为接口桩，SINGLE 规则实现为 `sa__SingleEndChecker_check`（行 190307），REVIVE 为 `sa__ReviveEndChecker_check`（行 190542），详见 victory-rules.md。
- `Trig_SingleTrollDieActions` → `sc__IRuleEndChecker_check`、`sc__ITrollMovieHandler_trollFail`；`Trig_DoubleTrollDieActions` 还调用 `sc__IRoleManager_setPlayerRoleWolf` 并设置 `DOUBLE_WOLF_REVIVE_TIME` 复活计时器（DOUBLE 规则下巨魔死亡转为狼并复活）。
- 自写调用图脚本：`tools/map-parser/jass_graph.py`（解析出 20,791 个函数）。

## 下一步

1. 用脚本提取所有 `function Trig_*`、`function s__*`、`function sc__*` 的函数名与调用边，生成调用图。
2. 重点跟踪 `causeDamage`、`IRuleEndChecker_check`、各 `Trig_*TrollDieActions`、资源处理器。
3. 将 VERIFIED 的规则补进 GDD，替换网页草案中的 PROPOSED 简化。
