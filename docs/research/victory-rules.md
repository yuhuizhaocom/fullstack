# 胜负规则（M0）

## 九种规则的胜负判定（2026-11-26 全部 VERIFIED）

| 规则 | 判定函数（行号） | 胜负条件 | 获胜方额外加入 | 模式结算埋点 |
| --- | --- | --- | --- | --- |
| SINGLE | `sa__SingleEndChecker_check` 190307 | `singleTrollForce` 或 `singleElveForce` 清空 | 巨魔胜含 `singleWolfForce`；精灵胜含 `singleAngelForce` | OLD: oldSingleTrollWin / oldSingleElveWin |
| DOUBLE | `sa__DoubleEndChecker_check` 184968 | `doubleTrollForce` 或 `doubleElveForce` 清空 | 巨魔胜含 `doubleWolfForce`；精灵胜含 `doubleAngelForce` | OLD/Fast 两套 |
| FIX | `sa__FixEndChecker_check` 186541 | `fixTrollForce` 或 `fixElveForce` 清空 | 精灵胜含 `fixAngelForce` | - |
| RACE | `sa__RaceEndChecker_check` 190837 | 红/蓝两队的 elve×troll 乘积为 0（任一对被清空） | 另一队 elve+troll 均获胜 | - |
| DEFEND | `sa__DefendEndChecker_check` 184791 | `defendTrollForce` 或 `defendElveForce` 清空 | 巨魔胜含 `defendWolfForce` | - |
| SOLO | `sa__SoloEndChecker_check` 189957 | `soloTrollForce` 或 `soloElveForce` 清空 | - | - |
| DUET | `sa__DuetEndChecker_check` 185214 | `duetTrollForce` 或 `duetElveForce` 清空 | - | - |
| SURVIVE | `sa__SurviveEndChecker_check` 189800 | 仅 `surviveElveForce` 清空（巨魔不死也判负？原版仅检查精灵存活） | - | - |
| REVIVE | `sa__ReviveEndChecker_check` 190542 | `reviveTrollForce` 或 `reviveElveForce` 清空 | 精灵胜含 `reviveAngelForce` | OLD/MIDDLE 两套 |

所有规则在判定后调用 `s__GameLoopUtils_gotoLastGameLoop()` 结束对局。

注意 SURVIVE 只检查精灵 force 是否为空，**不检查巨魔 force**——这是 VERIFIED 的原版行为。

## 定点验证（2026-11-26 补充，VERIFIED）

### SINGLE 规则 `sa__SingleEndChecker_check`（行 190307）

```jass
trollCount = ForceUtils.getSize(singleTrollForce)
elveCount  = ForceUtils.getSize(singleElveForce)
if trollCount == 0 or elveCount == 0:
    if elveCount == 0:
        ForForce(singleTrollForce, addEnumPlayerTrollWinCount)
        ForForce(singleWolfForce,   addEnumPlayerTrollWinCount)
        if currentMode == OLD: TriggerEvaluate(oldSingleTrollWin)
    elif trollCount == 0:
        ForForce(singleElveForce, addEnumPlayerElveWinCount)
        ForForce(singleAngelForce, addEnumPlayerElveWinCount)
        if currentMode == OLD: TriggerEvaluate(oldSingleElveWin)
    GameLoopUtils.gotoLastGameLoop()
```

### REVIVE 规则 `sa__ReviveEndChecker_check`（行 190542）

同样的判定，但使用 `reviveTrollForce/reviveElveForce/reviveAngelForce`，并按 OLD/MIDDLE 分别触发 `oldReviveTrollWin`/`middleReviveTrollWin` 等结算处理器。

这与网页草案的“一方队伍清空即判负”方向一致，但原版按 force（含狼/天使等角色）计，并区分模式触发不同的结算埋点。

## 已验证触发器（VERIFIED）

- `Trig_SingleElveDieActions`（`war3map.j` 行 132614）：精灵英雄死亡后计算赏金，2 秒定时清理玩家单位，将其从 `singleElveForce` 移到 `singleUnchosenForce`；若 `singleElveForce` 为空则调用 `IRuleEndChecker_check`，由规则结束检查器判定胜负。
- `Trig_SingleTrollDieActions`（行 132678）：巨魔死亡输出击杀信息，随后进入规则结束检查。
- 存在 `IRuleEndChecker`、`ITrollMovieHandler.trollWin/trollKill` 等接口，说明胜负由统一规则检查器与模式处理器共同决定（VERIFIED）。
- 存在 `isFinalizingGame` 状态位防止重复结算（VERIFIED）。

## 模式相关（VERIFIED）

规则枚举：`SINGLE=0, DOUBLE=1, FIX=2, RACE=3, DEFEND=5, SOLO=6, DUET=7, SURVIVE=8, REVIVE=9`。
每种规则有对应的 `Trig_*TrollDieActions` / `Trig_*ElveDieActions`（如 Solo/Duet/Defend/Race/Revive），具体胜负条件尚未逐条读取，标记 **UNKNOWN**。

## 当前网页实现（PROPOSED）

`src/lib/tve4/engine.ts`（旧 `tve-classic` 已删除）：

- SINGLE 规则：巨魔 force 清空 → `win`；精灵 force 清空 → `lose`（LIVES=1，无 300 秒自动胜利）。
- 300 秒仅开启共享/暴露视野（VERIFIED 参数），疾风步不再隐身。
- 测试模式（`?test=1`）跳过准备期，巨魔立即出现。

未实现 REVIVE（原版存在 `gg_trg_ReviveElveDie`）、SURVIVE、RACE、DEFEND、SOLO、DUET、FIX 等模式规则。
