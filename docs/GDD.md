# 《新巨魔与精灵》Web 版游戏设计文档（GDD）

> 基于 M0 原版地图研究（`docs/research/`）。所有规则条目标注可信度：
> **VERIFIED** = 直接从 `war3map.j` / 物编 SLK / MPQ 解包文件读取；
> **INFERRED** = 依据代码与数据表推断；
> **UNKNOWN** = 尚未确认，不得当成原版事实；
> **PROPOSED** = 为网页端实现提出的设计（不是原版规则）。
>
> 技术决策（2026-11-26 更新）：**不引入 C#/.NET 权威服务器**。实时逻辑沿用本仓库既有的 Next.js + WebSocket 前后端结构，仅做前端调整，不大改架构。原提示中的 .NET 方案在本项目中作废。

---

## 1. 游戏背景

《新巨魔与精灵 v4.0.34b》是 Warcraft III 自定义地图，非对称对抗：精灵一方建造经济与防御，巨魔一方拆建筑、杀英雄获取金币成长。原版地图文件、版本字符串、触发器与物编数据已核验（VERIFIED，见 `original-overview.md`）。网页版目标是浏览器直接打开、支持 PC 与手机，保留原版核心玩法而非简化成普通塔防。

## 2. 游戏目标

- 精灵阵营：在巨魔到来前建立经济与防线，守住英雄或达成模式目标。
- 巨魔阵营：拆毁精灵建筑获得金币，购买装备与升级，击杀精灵英雄。
- 单局以规则检查器判定胜负并结束（VERIFIED，见 `victory-rules.md`）。

## 3. 阵营与角色

| 阵营 | 主英雄 | 原版 HP/移速 | 角色扩展 | 可信度 |
| --- | --- | --- | --- | --- |
| 精灵 | H010 精灵 | 10 / 250（网页按 1:2 缩放为 125） | 天使（Angel）、多种皮肤（农夫/牧师/吉安娜等） | VERIFIED（H010 数值、皮肤常量见 JASS） |
| 巨魔 | H020 巨魔 | 750 / 350（网页为 175） | 狼（Wolf）、多种皮肤（暗巨魔等） | VERIFIED |

- 阵营 force 概念来自 JASS：`singleElveForce/singleTrollForce/singleWolfForce/singleAngelForce` 等（VERIFIED）。
- 网页当前仅实现单一精灵 + 单一巨魔，无狼/天使与皮肤系统（PROPOSED 简化）。

## 4. 游戏流程

1. 选图/选规则/选模式 → `currentMode/currentRule/currentMap` 由 JASS 初始化（VERIFIED）。
2. 准备期：巨魔在 **30 秒**（多数规则）或 **45 秒**（FIX/SURVIVE）后出现（VERIFIED，`getTrollAppearTime`）。
3. 精灵建造与发展；巨魔出现后开始进攻。
4. 300 秒精灵互享视野；600 秒没有作坊的精灵向敌人暴露（VERIFIED，`docs/research/original-mechanics-verified.md`）。
5. 胜负检查器每秒检查，force 清空则结算（VERIFIED）。

网页按 OLD-SINGLE 对齐为 5 秒生成 + 30 秒等待（约 35 秒）；300/600 秒视野机制按原文实现，不使巨魔显形。

## 5. 玩家人数

- 原版 `war3map.w3i` 建议玩家 12（VERIFIED），含 8 种地图区域与多套 force。
- 规则层面：SINGLE 单巨魔 vs 多精灵；DOUBLE/DUET/SOLO/RACE 等各有不同人数组织（VERIFIED 规则枚举，具体人数细节 UNKNOWN）。
- 网页草案固定 1 巨魔 vs 3 精灵（PROPOSED）。

## 6. 地图结构

- 385×289 地形格；wpm 1536×1152；4,282 棵冬季树 `WTst`（VERIFIED，数据保留但网页渲染已移除树木）。
- 8 个地图区域矩形（MAP_0..MAP_7）与关键锚点 COMMON_MAJIA 等已从 JASS 取得（VERIFIED，见 `map-analysis.md`）。
- 全图共检出 16 个可通行连通区域（房间/隔间），与“近 20 个房间”一致（VERIFIED，由 blocked 网格 BFS 得出）。
- 网页逻辑地图：128×96 格、TILE=64、WORLD=8192×6144，整张原图按约 3:1 映射；背景为 `arena.png`（2048×1536），墙体重叠清晰雪檐轮廓（PROPOSED 渲染方案）。
- 碰撞：由 `war3map.wpm` 的 bit 0x02（No Walk）生成 128×96 `blocked.bin`；棕色 Wdrt 是可走地面，灰白 Wsng/Wrok 是墙体（VERIFIED 修正）。

## 7. 游戏模式

### 7.1 平衡模式（VERIFIED）
OLD=0、BALANCE=1、FAST=2、MIDDLE=3。

### 7.2 规则（VERIFIED 枚举与胜负判定）
SINGLE=0、DOUBLE=1、FIX=2、RACE=3、DEFEND=5、SOLO=6、DUET=7、SURVIVE=8、REVIVE=9。胜负条件详见 `victory-rules.md`（全部 VERIFIED）。

### 7.3 地图（VERIFIED 枚举）
BIG_SNOW_LAND、BIG_FOREST、SMALL_FOREST、SOLO_AREA、DEFEND_AREA、MIDDLE_FOREST、RACE_FOREST、BIG_SNOW_FIELD。

### 7.4 网页实现
仅实现 OLD 风格单机模式（PROPOSED），其余模式待补，禁止擅自删减。

## 8. 经济系统

- 初始金币：OLD 精灵 30 / 巨魔 70；MIDDLE 精灵 10 / 巨魔 50；木材 0（VERIFIED）。
- 每秒收入：帐篷 1、金矿 1、精灵农场 4、高等农场 8、蓝宝石矿 32、巨魔房屋 L1 3（VERIFIED，建筑 Ubertip）。
- 建筑费用/HP：见 `buildings.md`（VERIFIED 抽样）。
- 击杀赏金：`floor(死者金币*0.5) + 木材*8`；MIDDLE 减半；下限 `AngelStoleGoldInt*25`；上限 1,000,000（VERIFIED）。
- 木材市场：价格随拥有市场人数变化（VERIFIED）；网页固定步长为 PROPOSED。
- 巨魔造成伤害即获得等量金币（VERIFIED，OLD 伤害处理器）。
- 网页已对齐：赏金四项公式完整实现；伤害转金币覆盖拆建筑与攻击英雄（准备期内精灵/箭塔不会伤害未出现的巨魔）。

## 9. 单位系统

- H010/H020 属性见 `units.md`（VERIFIED）。
- 武器：H010 冷却 2.2 / 射程 100 / 均伤 7（2d6），副武器 500 射程均伤 5；H020 冷却 1.5 / 射程 80 / 均伤 7（VERIFIED，`UnitWeapons.slk`）。
- 单位创建/销毁/移动/受伤/死亡/复活：原版由 JASS 管理（VERIFIED 存在）；网页由 `engine.ts` 单机模拟（PROPOSED）。
- 单位属性应配置化（工程目标，PROPOSED）。

## 10. 建筑系统

- 帐篷 u00Y、金矿 e00H、房屋 u03D、精灵墙 u04B、岩石墙 u01X、水泥墙 u030、箭塔 h000 等的 HP/费用/收入见 `buildings.md`（VERIFIED 抽样）。
- 帐篷“每精灵仅一座”来自 Ubertip（VERIFIED）。
- 建造合法性：网格占用 + 地形阻挡 + VERIFIED 的前置科技链（`Requires`/`DependencyOr`：农场需墙、作坊需墙/城镇、真视塔需猎手大厅；网页用墙等级与城镇/市场等级近似）。区域建造限制 UNKNOWN。
- 网页已对齐：**基础墙（u01F，4 金起）可直接建造**；精灵墙/岩石墙/水泥墙不再直接建造，而是基础墙的升级链（10/10 断言通过）。
- 建造进度、升级链、修理：原版存在相关处理器（VERIFIED 存在，细则 UNKNOWN）。

## 11. 装备系统

- `ItemData.slk` / `ItemFunc.txt` 已解包，具体物品 ID 与属性尚未逐项映射（UNKNOWN）。
- 网页草案 8 件装备（剑/手套/靴/护符/项链/指环）及其数值为 PROPOSED。
- 商店购买、金币消耗、属性加成逻辑见 `engine.ts`（PROPOSED）。网页 tve4 规定巨魔必须回到出生点附近才能购买装备，给精灵发育时间；装备价格与属性由 `data/game/game-rules.json` 的 `equipmentShop` 提供。
- 精灵主动拆除建筑 A02P（VERIFIED）：HP ≥ 95%、1240 范围无敌对英雄、1800 范围无巨魔之眼（作坊例外），0.25 秒后死亡；作坊死亡返还全部累计升级花费（金+木）。数值由 `elfDemolish` / `buildings.tent` 规则文件字段读取。

## 12. 技能系统

- `war3map.w3a` v2 全部 50 个技能已解析（VERIFIED，见 `skills.md`）。
- A067 魔法提速：冷却 30 / 持续 15 / 魔力 20 / 移速 +110%（VERIFIED）。
- A06M 纠缠根须：冷却 3 / 持续 3 / 射程 999999 / 魔力 0（VERIFIED；网页草案 45 秒为 PROPOSED 平衡改动）。
- A066 闪烁：名称/图标 VERIFIED，数值来自物编内置技能（部分 UNKNOWN）。
- 巨魔疾风步/狂战士/传送：技能 ID 未直接定位（UNKNOWN）；网页实现为 PROPOSED。
- 技能释放、冷却、目标、增益/减益由引擎管理（PROPOSED）。

## 13. 战斗系统

- OLD 巨魔伤害处理器（`sa__OldTrollDamageHandler_causeDamage`）：
  - 伤害取整 `damageI` → 攻击者获得等量金币；
  - 有 OLD_TROLL_STOLE_LIFE_SKILL_TYPE 时回血 `0.22 * damageR`；
  - 显示 `+damage` 飘字；攻击 AttendTroll 触发（VERIFIED）。
- 精灵 10 HP vs 巨魔均伤 7 → 两击击杀（VERIFIED 推导）。
- 护甲公式：网页用 WC3 常见 `1 - a*0.06/(1+a*0.06)`（PROPOSED，原版公式 UNKNOWN）。
- 暴击/闪避/伤害类型克制：UNKNOWN。

## 14. 复活系统

- 原版存在 `gg_trg_ReviveElveDie` 与 REVIVE 规则（VERIFIED 存在）。
- DOUBLE 规则下巨魔死亡转狼并按 `DOUBLE_WOLF_REVIVE_TIME` 复活（VERIFIED）。
- 网页已对齐：巨魔在小屋 2.5 格内持续回血（12%/秒）并加速恢复技能冷却（回蓝），带“休整”飘字（10/10 断言通过）。
- 网页单机模拟：精灵 2 秒清理、狼 20 秒小屋复活、REVIVE 3 条命；狼/天使角色与皮肤仍未实现（PROPOSED 缺失）。

## 15. 死亡机制

- 精灵死亡：赏金计算 → 2 秒清理单位 → 移出 force → 胜负检查（VERIFIED）。
- 巨魔死亡：输出信息 → 转狼（DOUBLE）/胜负检查（VERIFIED）。
- 网页实现为立即判定（PROPOSED）。

## 16. 胜负规则

九种规则的完整判定表见 `victory-rules.md`（全部 VERIFIED）。核心：force 清空即判负；RACE 为双队判定；SURVIVE 仅检查精灵 force。网页仅实现简化版（PROPOSED）。

## 17. 特殊事件

- 300 秒精灵共享视野；600 秒没有作坊的精灵暴露给巨魔（均不使巨魔显形，VERIFIED）。
- 模式化结算埋点（oldSingleTrollWin / fastDoubleElveWin 等，VERIFIED 存在）。
- 随机事件、计时器、触发器依赖：部分 VERIFIED，完整调用链 UNKNOWN。

## 18. 数值系统

- 原版配置保留在 `docs/research/` 与 `tools/map-parser/` 输出（VERIFIED）。
- 网页配置集中在 `src/lib/tve4/config.ts` 与 `src/lib/tve4/map.ts`（PROPOSED/VERIFIED 混合），镜像为 `data/game/game-rules.json`。旧 `tve-classic` 实现已删除。
- M1 起建立 `data/original/`（原版 VERIFIED，不可覆盖）与 `data/game/`（网页 PROPOSED，带版本号与来源标记）（工程目标）。

## 19. UI 系统

- 原版 UI 资源（BLP 图标、载入画面等）见 `texture-analysis.md`。
- 网页 HUD 由 React `src/components/tve4/game.tsx` 实现，状态通过 `Snapshot` 传递（PROPOSED）。
- 当前 tve4 使用自绘角色序列帧 `public/tve4/hero_elf.png`、`hero_troll.png`（原创素材，idle/walk/attack/death 四组帧），不依赖已删除的原版烘焙资源。

## 20. 多人游戏规则（技术决策更新）

- 原版为多人 Warcraft III 对战（VERIFIED 建议玩家 12）。
- **本项目不使用 C#/.NET 权威服务器**。实时逻辑沿用仓库既有 `server.ts` + `src/server/realtime.ts` 的 Node WebSocket 链路；业务后端沿用现有 Next.js Server Actions / API routes（PROPOSED 工程决策）。
- 服务端权威、房间隔离、快照/增量同步、断线重连按 M4 阶段在现有 Node 链路上扩展，不新建 .NET 项目（PROPOSED）。
- 当前 `/tve-*` 页面为单机模拟（PROPOSED），多人对战尚未实现。

---

## 21. 网页核心玩法线（PROPOSED，按用户描述）
- 进入界面先选择阵营：精灵或巨魔；模式/规则/测试模式可在起始页选择。
- 精灵线：前期全速发育；中期起塔压制巨魔打钱；后期 66 座终极塔召唤精灵大法师；可迁移到新房间、开启游走发育降低巨魔打钱；也可到巨魔家里起塔。
- 巨魔线：前期把打钱投入攻击/攻速，精灵反抗时补护甲血量；杀光精灵或堆到 16 万力量（购买力量之书）触发属性暴涨获胜。
- 实现位于 `src/lib/tve4/engine.ts` 的 `summonArchmage` / `relocateElf` / `toggleMobileDev` / `buyStrengthBook`，数值在 `data/game/game-rules.json` 的 `scenarios`。

## 附：与网页现状的差异清单（PROPOSED → 原版）

| 项目 | 网页现状 | 原版 VERIFIED |
| --- | --- | --- |
| 巨魔出现 | 约 35 秒（5+30，OLD-SINGLE） | 5+30 秒；FIX/SURVIVE 45 秒 |
| 伤害击杀 | 早期瞬杀，已修为伤害制 | 两击击杀，伤害转金币 |
| 纠缠根须 CD | 45 秒 | 3 秒 |
| 模式 | 1 种 | 4 模式 × 9 规则 × 8 地图 |
| 角色 | 精灵/巨魔 | 另有狼/天使与多皮肤 |
| 复活 | 无 | REVIVE 规则与 DOUBLE 转狼 |
| 视野 | 300 秒精灵共享、600 秒无作坊精灵暴露 | 300/600 秒触发，均不使巨魔显形 |
| 出生点 | PROPOSED 坐标 | w3i 未解析（UNKNOWN） |

> 本 GDD 不把 UNKNOWN 当成规则写入实现；后续解析得到的 VERIFIED 数据需同步更新本文档与 `docs/research/`。
