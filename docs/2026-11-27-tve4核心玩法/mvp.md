# tve4 核心玩法 MVP（2026-11-27）

> 状态：实施中。本文是获批 MVP 计划的活文档；后续任务完成后更新进度、偏差与验证证据。
> 唯一入口：`/tve4`。`docs/development-plan.md` 中的旧 `/tve-ph` 描述不适用于本轮。

## 1. 目标与来源

先做出“真实原地图 + 完整 `OLD + SINGLE` 核心玩法 + 基础单机 AI”的可玩版本。保留 `/tve4`、Phaser 场景和大部分 `engine.ts` 骨架，迁移真实地图数据、会话化状态和核心规则数据，不重写引擎。

- 原作：`92321DFF967C964EC7EB7EE52A91A7A4.w3x`，《新巨魔与精灵 v4.0.34b》，作者跃耀F9。
- 原包 SHA-256：`d8d3df747520529ee530a87754d568278f51378dfa30e419a64fe208165bb9d7`。
- 机器可读基准：[`data/tve4/mvp/source.json`](../../data/tve4/mvp/source.json)，快照 `tve4-4.0.34b-d8d3df747520`。
- 既有证据：`docs/research/file-index.json`、`tools/map-parser/build_index.py`。哈希复用索引，不重新实现 MPQ 全量解析。
- 事实优先级：SLK 默认值 → W3A 覆盖 → JASS 初始化/运行期修改。核心数值记录 `sourceFile/objectId/field/level/confidence`；未知值显式标为 `UNKNOWN`，不用当前实现自证。

## 2. 本轮范围

### 交付

1. 原 W3X 内 8 张真实竞技场、完整 1536×1152 WPM、W3E/DOO 几何及 JASS 锚点。
2. 单机对 AI 的 `OLD + SINGLE`：准备、资源、建造、战斗、技能/装备、死亡/复活、胜负、重开形成闭环。
3. 核心英雄、建筑、8 个技能、81 件商店物品和 `OLD + SINGLE` 规则数据化。
4. 固定步长、固定种子；同种子同输入得到同状态哈希。AI 只读取己方视野、共享视野和已探索记忆。
5. 移动端输入、镜头、UI 与性能适配；390×844 和 844×390 完成实测。
6. 临时几何视觉与地图/规则数据分离，后续可单独替换原作资产。

### 不做

- 不新建 `/tve-ph`，不做实时联机、UP 平台、房间、排行榜。
- 不提取或转换原作 MDX/BLP/TGA/音效。
- 不导入全部单位、技能、物品目录，不实现全部模式。
- 不做 `carve_to_main()`、`clear_rect()` 或最远点出生点算法，不人工清地/挖洞。
- 移动端只改交互与显示，不覆盖原作规则数值。

## 3. 实施任务

任务按依赖顺序执行，一任务一提交、独立验证；只允许本地提交，不 push。

| 任务 | 交付物与验收 | 状态 |
| --- | --- | --- |
| 1 来源基准与 MVP 文档 | `source.json`、来源测试、本文；锁定原包与核心文件哈希，记录 UNKNOWN | 已完成 |
| 2 真实地图与原始碰撞 | `maps.json`、8 份 pathing、提取器测试；8 图、JASS 区域/锚点、原始 WPM、地图 5 扩展区 | 待开始 |
| 3 会话化地图状态 | `SessionContext`、真实 pathing 加载；切图/重开不串状态，32 单位移动视线、128 单位建造格 | 待开始 |
| 4 八图临时视觉 | `placeholder.ts`、浏览器清单；真实几何和锚点加载，无旧自绘背景/碰撞 | 待开始 |
| 5 核心规则数据化 | `rules.json`、MVP 适配层；白名单记录均有来源，`OLD + SINGLE` 数值迁移 | 待开始 |
| 6 核心单局闭环 | 确定性 RNG/状态哈希、经济/建造/战斗/胜负；固定种子复现，实际进入终局 | 待开始 |
| 7 技能与装备 | 8 技能、81 物品购买与基础效果；施放边界、未实现效果明确记录 | 待开始 |
| 8 视野、AI 与移动端 | `Perception`、迷雾、AI 查询约束、浏览器 golden path；AI 不读全图，双朝向触控通过 | 待开始 |

## 4. 来源约束与已知未知

- `source.json` 中 JASS/WPM/W3E/DOO/W3I/W3A 的大小与哈希来自既有 607 条文件索引，状态为 `VERIFIED`。
- 九份相关 War3 默认 SLK（AbilityBuffData、AbilityData、ItemData、UnitAbilities、UnitBalance、UnitData、UnitUI、UnitWeapons、UpgradeData）未出现在该索引中，大小和哈希保持 `UNKNOWN`。Task 5 使用前须定位具体 War3 版本文件并补充哈希；W3A/JASS 可验证的覆盖不得被默认值错误覆盖。
- War3 客户端内的动态事件顺序和部分公式尚未建立参考轨迹；没有实测证据时保持 `UNKNOWN`。
- 当前 `npm run check:tve4` 与 `npm run check:data` 只证明既有简化实现自洽，不作为原作正确性证据。

## 5. 验证策略

| 层次 | 命令/方法 | 验收重点 |
| --- | --- | --- |
| 来源 | `npx tsx --test scripts/tve4/source.test.ts` | 原包 SHA-256 与五份核心地图文件哈希存在 |
| 地图 | `python -m unittest tools.tve4_source.tests.test_core_maps -v`；`npx tsx scripts/tve4/check_maps.ts` | 8 图、原始 WPM、锚点、相机边界、地图 5 扩展区；无人工改造 |
| 规则 | `npx tsx --test scripts/tve4/mvp_rules.test.ts` | 核心记录来源完整，UNKNOWN 显式输出 |
| 模拟 | `npx tsx --test scripts/tve4/core_loop.test.ts` | 固定步长/种子状态哈希一致，完整单局可进入胜负 |
| 技能装备 | `npx tsx --test scripts/tve4/skills_items.test.ts` | 8 技能与 81 物品购买路径、施放/购买边界 |
| 回归 | `npm run check:tve4`；`npm run check:data` | 既有规则与数据检查保持通过 |
| AI/移动端 | `npx tsx --test scripts/tve4/ai_vision.test.ts`；`npm run dev` 后按 `scripts/tve4/browser_smoke.md` 实测 | AI 不穿墙/不全图追击；完整单局、双朝向触控、切后台恢复、无阻断 console 错误 |

### Task 1 验证记录

- RED：`npx tsx --test scripts/tve4/source.test.ts`，因 `data/tve4/mvp/source.json` 不存在而失败（1 failed）。
- GREEN：实现后执行同一命令，1 passed / 0 failed。
- 提交前基线：`npm run check:tve4` 44 passed；`npm run check:data` 8 passed。
- `git diff --check` 通过。测试运行存在 Node `UNDICI-EHPA` experimental 环境警告，不影响退出码或断言结果。

## 6. 后续原作资产阶段（本轮不实施）

MVP 稳定后独立执行以下阶段，替换 `render/placeholder.ts` 与临时色块，不改地图、碰撞、坐标、动画帧时长或技能命中逻辑：

1. 建立资产清单、哈希、引用关系并确认授权。
2. BLP/TGA 转 PNG/WebP，保留透明通道。
3. 按地形/悬崖、树木/岩石、建筑、单位、技能、装备图标分批替换。
4. MDX 静态装饰先离线渲染；关键单位骨骼/glTF 单独通过移动端性能门禁。
5. 低端机质量档只降低纹理、特效和帧率，不影响碰撞、命中和计时。
6. 替换后重跑 MVP 全部规则测试、状态哈希对拍和浏览器 golden path。

## 7. 本轮完成定义

- 8 张真实地图可加载，原始碰撞和锚点与来源一致，无人工开洞。
- `OLD + SINGLE` 能从准备、资源、建造、战斗、技能/装备、死亡/复活打到胜负并重开。
- 核心规则数值有来源，未知项显式可见。
- AI 不读全图，固定种子模拟可复现。
- 移动端关键操作实测通过。
- 临时几何视觉与规则/地图数据分离，后续可无痛替换原作资产。
