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
| 2 真实地图与原始碰撞 | `maps.json`、8 份 pathing、提取器测试；8 图、JASS 区域/锚点、原始 WPM、地图 5 扩展区 | 已完成 |
| 3 会话化地图状态 | `SessionContext`、真实 pathing 加载；切图/重开不串状态，32 单位移动视线、128 单位建造格 | 已完成 |
| 4 八图临时视觉 | `placeholder.ts`、浏览器清单；真实几何和锚点加载，无旧自绘背景/碰撞 | 已完成 |
| 5 核心规则数据化 | `rules.json`、MVP 适配层；白名单记录均有来源，`OLD + SINGLE` 数值迁移 | 已完成 |
| 6 核心单局闭环 | 确定性 RNG/状态哈希、经济/建造/战斗/胜负；固定种子复现，实际进入终局 | 已完成 |
| 7 技能与装备 | 8 技能、81 物品购买与基础效果；施放边界、未实现效果明确记录 | 已完成 |
| 8 视野、AI 与移动端 | `Perception`、迷雾、AI 查询约束、浏览器 golden path；AI 不读全图，双朝向触控通过 | 已完成 |

## 4. 来源约束与已知未知

- `source.json` 中 JASS/WPM/W3E/DOO/W3I/W3A 的大小与哈希来自既有 607 条文件索引，状态为 `VERIFIED`。
- 九份相关 War3 默认 SLK（AbilityBuffData、AbilityData、ItemData、UnitAbilities、UnitBalance、UnitData、UnitUI、UnitWeapons、UpgradeData）已在 Task 5 补入实际字节数与 SHA-256，状态为 `VERIFIED`。提取器通过 `TVE4_EXTRACTED_ROOT` 或 `--extracted-root` 读取来源，证据按 SLK → W3A → JASS 优先级分层；W3A/JASS 覆盖不会被默认值错误覆盖。
- War3 客户端内的动态事件顺序和部分公式尚未建立参考轨迹；没有实测证据时保持 `UNKNOWN`。
- 当前 `HERO_STATS.troll.radius = 22` 是未经原作 SLK/W3A/JASS 证据确认的网页值。真实 WPM 点路径在 8 图中连通，但该半径下巨魔无法从出生区域穿越地图 0/1/2/3/4/5/7 的狭窄通道；Task 5/6 必须补齐碰撞半径/单位语义来源后再调校，不得通过改 WPM 或清地掩盖。
- 当前 `npm run check:tve4` 与 `npm run check:data` 只证明既有简化实现自洽，不作为原作正确性证据。

## 5. 验证策略

| 层次 | 命令/方法 | 验收重点 |
| --- | --- | --- |
| 来源 | `npx tsx --test scripts/tve4/source.test.ts` | 原包 SHA-256 与五份核心地图文件哈希存在 |
| 地图 | `python -m unittest tools.tve4_source.tests.test_core_maps -v`；`npx tsx scripts/tve4/check_maps.ts`；`npx tsx --test scripts/tve4/session.test.ts`；`python -m unittest tools.tve4_source.tests.test_runtime_maps -v` | 8 图、原始 WPM、锚点、相机边界、地图 5 扩展区；会话隔离、PackBits 载荷、零 clearance 点路径；无人工改造 |
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

### Task 2 验证记录

- 实现：`tools/tve4_source/extract_core_maps.py` 校验 Task 1 的 JASS/WPM/W3E/DOO/W3I 大小与哈希，解析 8 图区域、相机、小地图、预置单位锚点、W3E tile 与 DOO；每图写入完整原始 WPM，不修改碰撞、不清出生点、不挖走廊。
- 几何坐标：W3I 可玩区为 372×276 tile，JASS `cameraAll` 给出同一范围，中心为 `(-5120, 256)`；385×289 W3E 网格以该中心对齐，原点为 `(-29760, -18240)`。旧研究按 `(0, 0)` 居中会移动全部 tile 并裁掉地图 5/6 左侧；WPM 为 384×288 个 terrain cell，旧预览生成器的 pathing 原点相应为 `(-29696, -17920)`。
- 产物：`maps.json` 7,113,157 bytes；8 份 pathing 各 1,769,488 bytes，逐字节等于来源 `war3map.wpm`，SHA-256 均为 `0ec395397888d611c1c9a1d4107f16e38482273c69ca3e8c169e3a1b0631e399`。
- 几何数量（terrain/doodads）：`12390/913`、`16256/1339`、`6320/337`、`2928/188`、`4224/160`、`12800/600`、`13520/600`、`15104/746`。
- RED：首次 Python 测试因提取器模块不存在而失败；几何回归测试以错误原点运行后 8 个地图子测试全部失败（tile ID 错配），随后按 W3I/JASS 中心修正实现。
- GREEN：`python -m unittest tools.tve4_source.tests.test_core_maps -v`，5 passed；`npx tsx scripts/tve4/check_maps.ts`，7 checks passed，包含本地来源 WPM 逐字节比对。
- 回归：`npm run check:tve4` 44 passed；`npm run check:data` 8 passed；Python `py_compile` 通过；旧生成器 8 图边界与来源精灵锚点检查通过（未重写旧资产）。
- 地图 5：`MAP_5_AREA_EXTRA = (-26688,-3264,-16448,6752)` 完整保留；天使 `(-21507.5,-3956.7)` 位于基础区与扩展区之间，不断言其属于扩展区。
- 旧生成器仅保留预览兼容，已删除 `clear_rect()`、`carve_to_main()`、`choose_elf_spawn()` 及生产调用；地图 5 旧预览按基础区与官方扩展区的包围矩形裁剪（并非严格并集，会包含两区之间的空隙），元数据仍分别保留两区。

### Task 3 验证记录

- 实现：新增 `SessionContext`，把地图、目录版本、seed、模式、规则、阵营、尺寸、出生点、WPM 元数据与碰撞数组绑定到单局；`createGame` 不再读取模块级地图变量，重开和切图使用显式 `mapId`/session。
- 运行期数据：`tools/tve4_source/generate_runtime_maps.py` 从 Task 2 产物生成轻量目录与共享 WPM；1,769,472 bytes cell payload 编码为 122,748 bytes PackBits / 163,664 Base64 字符，同步解码，不引入依赖、异步 fetch 或客户端 `node:fs`。
- 碰撞分工：完整 1536×1152、32 单位 WPM 用于移动/视线；128 单位粗网格由 4×4 WPM 中至少 9 个 `0x02` 阻挡格派生，仅用于建造/粗寻路。删除出生点清空，不开挖走廊。
- 锚点：巨魔取 `trollHouse/trollHouse0`，精灵取 `lifeTree`；地图 4 DEFEND 取 `elf0`；地图 6 无精灵锚点时显式失败；地图 5 使用基础区/扩展区包围并集，保留间隙中的天使坐标。
- RED/GREEN：生成器测试先以真实 Task 2 schema 复现 `KeyError: origin`，修复后 2 tests 通过；会话隔离/冻结/碰撞 helper 测试 7/7 通过。未声称复现前任实现者未留下的初始 RED。
- 真实路径：8 图均通过未修改 WPM 的零 clearance 双向点路径检查；地图 6 因无精灵锚点明确跳过。当前半径出生点中心与局部移动检查继续通过。半径 22 的巨魔全图身体穿越失败已作为 Task 5/6 阻塞遗留记录，不以改地图或伪造路径处理。
- 最终回归：`npm run check:tve4` 45 passed；`npm run check:data` 8 passed；`npx tsc --noEmit`、Python 2 tests、生成可复现性与 `git diff --check` 均通过。Node 仍有既有 `UNDICI-EHPA` experimental 环境警告。
- 独立审查：原审查 1 Important / 2 Minor，经两轮修复后全部 ADDRESSED，无新增 Critical/Important 破坏。Task 3 提交为 `45645a7`、`3373093`、`1d40029`；修复提交未 amend、未 push。
- 未进行浏览器/WebGL 实测，Task 3 不声称 UI 已完成浏览器验收。

### Task 4 验证记录

- 实现：`stage.ts` 不再加载旧自绘地图背景或旧英雄/建筑 spritesheet；新增 `render/placeholder.ts`，单位四状态、建筑、树木/岩石统一使用有限色板几何。`game.tsx` 选图继续读取版本化 `MAP_DEFINITIONS/MAP_ORDER`，缩略图改为地图色块。
- 渲染数据：扩展 `generate_runtime_maps.py`，从真实 `maps.json` 生成 8 份按图懒加载 JSON（共 3,161,593 bytes）到 `public/tve4/geometry/`；模拟目录不含 terrain/doodads。每份带 catalogVersion、geometryHash、runtimeBounds 与源 W3E/DOO 坐标。
- 坐标：W3E tile 左上角与 DOO 中心统一按 `(source - runtimeBounds.minX/minY)/8` 转换；128 源单位 tile 渲染为 16 Web 单位。相机边界使用同一原点与比例，不再使用 `0..worldWidth/worldHeight`。
- 锚点：出生标记只读 session spawns；地图 4 OLD 不伪造精灵点，DEFEND 使用 `elf0`；地图 6 无精灵点时明确拒绝。地图 5 保留基础区/扩展区包围并集及非官方 gap。
- 自动验证：`npm run check:tve4` 45 passed；`npm run check:data` 8 passed；`npx tsc --noEmit`、Python 3 tests、render/placeholder 8 tests、生成可复现性与 `git diff --check` 均通过。
- 浏览器验证：Chrome DevTools 实测 8 图加载、双方代表阵营、地图 4/6 特例、地图 1 移动/建造、地图 7 的 `390x844` 与 `844x390`；Network 无 404，旧 PNG/spritesheet 请求为 0，Console 无 error/warn，仅既存 select a11y issue。
- 独立审查：首轮 2 Important / 2 Minor；修复 `4c24513` 后定向复审全部 ADDRESSED，Spec/Quality 均通过。修复覆盖重开同步 DEFEND 精灵锚点、Phaser 失败销毁/重试、render bounds 严格比较与水色映射。
- Task 4 提交：`1f964c1`（实现）、`4c24513`（修复）、`ec97cc9`（验证记录）；未 push、未 amend。临时几何不代表最终原作美术，后续只替换 `render/placeholder.ts`。

### Task 5 验证记录

- 实现：新增 `tools/tve4_source/extract_core_rules.py`，按白名单提取 2 英雄、7 建筑、8 技能、81 物品与 `OLD + SINGLE` 初始规则；`src/lib/tve4/data/mvp-rules.ts` 提供逐值证据与等级感知查询，`rules.ts`/`config.ts` 优先读取 MVP 数据并保留未覆盖字段回退。
- 来源：九份默认 SLK 已记录真实大小/SHA-256；技能对象 ID 修正为 `A066/A067/A068/A069/A061/A06T/A06W/A062`。证据按 SLK → W3A → JASS 分层，A067 持续时间明确记录默认 15 秒、W3A 4–16 级覆盖 15 秒、JASS level 1 运行期覆盖 6 秒。
- 置信度：每个数值/布尔字段都有独立 evidence；所有非 VERIFIED 字段自动进入 `unknowns`。当前 379 条 unknowns 中仅 4 条 blocking，分别为纠缠/巨魔之眼冷却和急速/巨魔之眼持续时间的 Web 运行值与原版来源差异；本轮保持运行行为，不伪报已修复。
- 自动验证：`npx tsx --test scripts/tve4/mvp_rules.test.ts` 17/17；Python 6/6；`npm run check:tve4` 45；`npm run check:data` 8；`npx tsc --noEmit`、确定性生成、`python -O` 校验与 diff 检查均通过。来源测试要求设置 `TVE4_EXTRACTED_ROOT`。
- 独立审查：首轮 4 Important / 2 Minor，修复轮 1 全部解决但发现 1 个新 Important（证据查询未按技能等级过滤）；修复轮 2 后定向复审全部 ADDRESSED，无新增 Critical/Important。
- Task 5 提交：`25431af`（实现）、`51d6d6c`（来源优先级/unknown/可移植性修复）、`e6f6ea9`（证据等级过滤修复）；未 push、未 amend。`HERO_STATS.troll.radius = 22` 仍未取得原作语义证明，继续作为 Task 6 阻塞遗留，不得通过改 WPM 掩盖。

### Task 6 验证记录

- 实现：新增 `sim/rng.ts`（固定种子 Mulberry32）与 `sim/pathing.ts`（32 单位 WPM 查询、连续段视线、128 单位 A*）；`GameState` 保存 RNG，`engine.ts` 移除全部 `Math.random`，新增 `stateHash`，移动与视线均连续校验原始 WPM。
- 确定性：固定种子 30 秒两次运行状态哈希一致，不同种子不一致；状态哈希排除纯展示的 `effects/floats/hint`，包含 RNG、AI 路径、实体、资源与地图碰撞。
- 碰撞裁定：H020 在 `UnitData.slk` 没有 collision-radius 字段，`radius=22` 继续是 INFERRED 展示/战斗值；WPM 是路径权威，不用未证明半径额外阻断路径。地图 0/1/2/3/5/7 的精灵↔巨魔双向路径在 radius 22 调用的公开判定下连通，未改 WPM。
- 自动验证：`npx tsx --test scripts/tve4/core_loop.test.ts` 7/7；MVP 17/17；Python 6/6；`npm run check:tve4` 45；`npm run check:data` 8；`npx tsc --noEmit` 与 diff 检查均通过。
- 终局：精灵清空、巨魔清空、巨魔 16 万力量三条路径都有直接测试；未用网页固定计时器代替原作条件。
- 独立审查：原子计费日限额导致子代理中断且未留下代码，本轮由主会话顺序实现并自审；独立 Task 6 审查尚未执行，已作为遗留项记录，未伪称已完成。
- Task 6 提交：`11c80c5`；未 push、未 amend。未做浏览器实测，完整移动端单局验收属于 Task 8。

### Task 7 验证记录

- 实现：8 技能冷却/持续时间/法力/闪烁最大距离/纠缠与沉默施法距离均从 MVP 规则读取；新增英雄法力上限与回复（H010 200/2、H020 200/1），施法扣蓝、复活回满。81 件装备仍按原商店白名单购买，现有属性字段生效。
- 边界：冷却、法力不足、目标超距/无视线、巨魔之眼无目标均失败且不扣蓝、不进冷却；急速/纠缠/沉默/疾风步/狂战士/巨魔之眼/传送均验证效果到期或读条。
- 规则：`farSight` 运行持续时间统一为实际 15 秒，来源默认 8 秒仍是 blocking unknown；四条 blocking 技能差异未被伪报为已解决。
- 图标：新增代码内占位图标 `render/icons.ts`，技能/商店 UI 显示图标与法力消耗，未引用原作图。
- 自动验证：`skills_items` 8/8；`core_loop` 7/7；MVP 17/17；Python 6/6；`npm run check:tve4` 45；`npm run check:data` 8；`npx tsc --noEmit` 与 diff 检查通过。
- 浏览器：Chrome DevTools 实测精灵/巨魔技能图标、闪烁扣蓝 200→180 与 25 秒冷却、法力状态栏、巨魔商店 81 件物品占位图标；Console error/warn 为 0，随后停止开发服务器。
- 独立审查：子代理计费限额仍未恢复，本轮主会话实现并自审；独立 Task 7 审查与 Task 6 审查一并列为遗留，不伪造已完成。
- Task 7 提交：`397bba7`；未 push、未 amend。

### Task 8 验证记录

- 感知：新增 `ai/perception.ts`，英雄视野取 SLK `sight`（H010 1200、H020 1400 源单位），建筑提供 MVP 近似视野；支持疾风步隐身、显影、无作坊暴露和已探索建筑记忆。玩家侧感知不写 AI 记忆。
- AI：精灵只追踪可见巨魔；巨魔只使用可见英雄/建筑、已探索记忆与最后目击点，视线/A* 阻挡也改用已知建筑。修复粗网格地形 1 格余量导致地图 3 AI 卡住的问题；地形改由 32 单位 WPM 校验，建筑保留缓冲。
- 表现：`stage.ts` 新增屏幕空间基础迷雾和 `data-fog-enabled`/`data-zoom`；`game.tsx` 新增双指缩放、safe-area 摇杆与按钮、建造/技能面板换行。
- 自动验证：`ai_vision` 6/6；`core_loop` 7/7；`skills_items` 8/8；MVP 17/17；Python 6/6；`npm run check:tve4` 45；`npm run check:data` 8；`npx tsc --noEmit` 与 diff 检查通过。
- 浏览器：`390x844` 与 `844x390` 无溢出；竖屏摇杆移动、建造面板、双指缩放 1.150→1.253、切后台恢复均通过；地图 3 受限 AI 在真实 WPM 上到达并 9 秒结束对局，显示失败/再来一局；Console error/warn 为 0。浏览器仅临时加速 rAF，不改产品代码。
- 独立审查：Task 6/7/8 的独立子代理审查均因计费日限额未执行；已用主会话自审、自动测试与浏览器证据替代，并保留为后续质量遗留。
- Task 8 提交：`f9ae8fb`；未 push、未 amend。
- 内网 HTTP 修复：移动端经内网 IP 访问时 `crypto.subtle` 不存在，地图几何哈希改为优先 Web Crypto、缺失时使用纯 TypeScript SHA-256 回退；8 图哈希、篡改拒绝与 `390x844` 内网实测均通过，未跳过完整性校验。
- UI 反馈修复：`更多` 从底栏移到右上独立按钮，竖屏面板固定在其下方、横屏面板移至左侧，两种朝向与面板外按钮重叠均为 0；新增 render-only WPM 阻挡叠加层，按横向连续段合并绘制，地图 0 标记 62,048 个不可通行源单元，不改模拟碰撞。

### 英雄模型接入

- 开局新增“阵营 → 英雄模型 → 地图”步骤：精灵 12 个候选、巨魔 17 个候选，保留默认几何；模型预览复用 `/tve4-model-demo` 的 MDX 查看器和原始贴图，缺贴图显示灰模，不使用程序化上色。
- 玩家英雄使用独立透明 WebGL canvas 覆盖渲染，按玩家位置同步，待机/移动/攻击/死亡动作由 `HeroModelViewer` 驱动；AI、建筑、数值、碰撞和状态哈希不受外观选择影响。
- 自动验证：`hero-model` 4/4；`render-geometry` 7/7；`ai_vision` 6/6；`core_loop` 7/7；`skills_items` 8/8；MVP 17/17；Python 6/6；`check:tve4` 45；`check:data` 8；`tsc --noEmit` 通过。
- 浏览器：390×844 下完成精灵/巨魔选模、默认几何、`m022 Oldelf` 与 `m003` 进图；模型跟随、`stand → walk → stand`、横竖屏覆盖层位置均通过，Console error/warn 为 0。

### MVP 结论

- 八项任务均已完成：真实 8 图/锚点/WPM、会话隔离、临时几何渲染、核心规则来源化、确定性单局闭环、8 技能/81 物品、视野约束 AI、迷雾与移动端双朝向验证。
- 仍保留的明确未知：四条技能冷却/持续时间 blocking unknown、高级装备效果、建筑完整视野来源、逐格战争迷雾、原作视觉资产提取。它们不阻塞当前可玩 MVP，但不得被宣称为已复刻完成。
- 独立审查缺口：Task 6/7/8 未执行独立子代理审查；后续恢复审查能力时应补做一次全分支质量审查。

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
