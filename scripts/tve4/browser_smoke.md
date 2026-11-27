# TVE4 Task 4 浏览器验证清单与结果

> 执行方式：`npm run dev` 后打开 `/tve4`。本清单记录真实 Chrome DevTools 验证，不以 TypeScript 检查代替。

## 验证范围

- 8 张地图均在 `844x390` 桌面浏览器逐张加载通过；阵营覆盖双方：地图 0/2/4/7 用精灵，地图 1/3/4/5/6 用巨魔。
- `390x844` 与 `844x390` mobile/touch viewport 使用地图 7 做代表验证：选择页、HUD、摇杆、建造面板、移动与 canvas 尺寸。
- 地图 1 单独验证键盘移动与建造落位；地图 4/6 验证缺失精灵锚点行为。

## 通用流程

- [x] 打开 `/tve4`，确认阵营/地图选择页显示 8 张地图，无旧地图 PNG 缩略图请求。
- [x] 逐张选择地图 0–7；每次选择后启动一局，加载遮罩消失且 canvas 标记 `data-tve4-ready="true"`。
- [x] 确认 canvas 的 `data-map-id`、`data-catalog-version`、`data-geometry-hash` 与当前选中图一致。
- [x] 确认 terrain tile 数、DOO doodad 数大于 0，且 Network 中只请求选中图的 `/tve4/geometry/map-<id>.json`。
- [x] 确认场景没有请求旧 `map-<id>.png`、`hero_elf.png`、`hero_troll.png`、`b_*.png` 作为背景或精灵。
- [x] 确认无 404、无阻断脚本错误、无地图几何 hash/版本校验错误。
- [x] 确认镜头边界来自 `map.cameraBounds`，并按 runtime bounds 原点 `/8` 转换；不是 `0..worldWidth/worldHeight`。

## 双方阵营与开局

- [x] 地图 0–5、7：至少以一方阵营开局，确认英雄几何、建筑几何和阵营色显示。
- [x] 地图 4 默认 `OLD`：确认精灵出生点为 `null`，不显示虚构精灵出生标记。
- [x] 地图 4 `OLD` 巨魔开局后在“更多”切到 `DEFEND`：同一 canvas 的 `data-spawns` 更新为 `elf {29,42}`，`data-spawn-markers` 从 1 增至 2，全图截图可见双方出生标记。
- [x] 地图 4 `DEFEND`：确认使用 JASS `elf0` 锚点。
- [x] 地图 6：确认没有精灵出生点；选择巨魔可开局，选择精灵应被明确拒绝，不显示虚构精灵标记。
- [x] 确认出生格与 JASS 锚点转换结果一致：`gx=floor((anchor.x-runtimeBounds.minX)/128)`、`gy=floor((anchor.y-runtimeBounds.minY)/128)`。

## 交互

- [x] 使用键盘移动：地图 1 按 D 700ms，玩家 `(600,1880) -> (612.5,1880)`；竖屏地图 7 按 D 700ms，玩家 `(904,184) -> (933.167,184)`。
- [x] 点击“建造”，选择石墙并落位，地图 1 建筑数 `0 -> 1`，资源与碰撞入口保持可用。
- [ ] 非法位置红色预览且不会扣费：本轮未单独自动断言。
- [x] 地图 5 保留基础区/扩展区包围并集及非官方 gap：生成测试逐条比对源 W3E/DOO 坐标，runtime bounds 保持 `[-26752,-14720,-16384,6784]`，渲染层未清地、造路或改边界。

## Viewport

- [x] `390x844` 竖屏：选择页 11 个按钮均可见；地图 7 HUD、摇杆和建造面板无横向溢出，可开局、移动、打开建造面板。
- [x] `844x390` 横屏：地图 7 HUD、摇杆和建造面板无横向溢出，可开局、移动、打开建造面板。
- [x] 两种 viewport 下 canvas 实际尺寸与容器一致（`390x844` / `844x390`），镜头缩放/拖动入口可用。

## 结果记录

| 地图 | 阵营 | viewport | terrain / doodads | 出生点（elf / troll） | cameraBounds | 404/阻断错误 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | elf | 844x390 | 12390 / 913 | `{105,7}` / `{60,49}` | `-240,-48,2368x1856` | 无 | hash 校验通过 |
| 1 | troll | 844x390 | 16256 / 1339 | 会话锚点 | `-192,-272,2368x2368` | 无 | 移动、建造通过 |
| 2 | elf | 844x390 | 6320 / 337 | 会话锚点 | `-160,16,1344x1344` | 无 | hash 校验通过 |
| 3 | troll | 844x390 | 2928 / 188 | 会话锚点 | `-32,32,832x960` | 无 | hash 校验通过 |
| 4 | OLD troll；DEFEND elf | 844x390 | 4224 / 160 | OLD: `null / {56,55}`；DEFEND: `{29,42} / {56,55}` | `-224,-240,1344x1344` | 无 | DEFEND 使用 `elf0` |
| 5 | troll | 844x390 | 12800 / 600 | `{17,15}` / `{41,39}` | `-16,-16,1344x1424` | 无 | 保留 gap |
| 6 | troll；elf 拒绝 | 844x390 | 13520 / 600 | `null / {41,128}` | `-16,-80,1344x2880` | 无 | elf 开局明确报错且未请求几何 |
| 7 | elf | 844x390；390x844；844x390 mobile | 15104 / 746 | `{56,11}` / `{60,55}` | `-272,-480,2368x2368` | 无 | 双 viewport 代表验证通过 |

## 修复轮 1 回归（Chrome DevTools）

- [x] 地图 4 `OLD` 巨魔 → “更多”切 `DEFEND`：Stage/canvas 未重建；`data-spawns` 从 `{"elf":null,"troll":{"gx":56,"gy":55}}` 更新为 `{"elf":{"gx":29,"gy":42},"troll":{"gx":56,"gy":55}}`，`data-spawn-markers` `1 -> 2`；按 M 全图后截图可见“巨魔出生点”“精灵出生点”。
- [x] 用初始化脚本让地图 0 geometry 的 XHR/fetch 请求失败：约 2523ms 出现“地图渲染几何加载失败”错误页，提供“返回重选”“重试”；返回重选后再次失败，再关闭拦截并点“重试”，同一 canvas 恢复 `data-tve4-ready=true`、`data-map-id=0`，canvas 数量始终为 1。
- [x] 另开正常地图 1：geometry 200，`terrainTiles=16256`、`doodads=1339`、`spawnMarkers=2`，无回归。
- [x] 上述定向回归 Network 无 404；Console 无 error/warn，仅既有两个 select 缺 `id`/`name` 的 a11y issue。
- [x] `runtimeBounds` 四个坐标分别篡改 +128 的单元测试均被拒绝；水色 `7=#355f66`、冰雪 `8/9=#d7e2df`，源数据含 tileId 7。

所有地图单图几何加载耗时约 1.58–1.68 秒。Network 无 404，旧 TVE4 PNG/spritesheet 请求为 0；Console 无 error/warn，仅有既存表单字段 a11y issue（两个 select 缺 `id`/`name`，不阻断）。Node 检查输出保留环境基线 `UNDICI-EHPA` experimental warning。

## Task 8 视野、AI 与移动端回归（Chrome DevTools）

- [x] `390x844x3 mobile/touch`：地图 3 精灵测试模式开局；`data-fog-enabled=true`，canvas、HUD、摇杆、底部按钮均在 viewport 内，`scrollWidth=390`、`scrollHeight=844`。
- [x] 竖屏摇杆：合成 pointerdown/move/up 后玩家 `(280,104) -> (262.322,86.322)`，说明触控摇杆持续驱动移动。
- [x] 竖屏建造面板：6 个建筑按钮全部可见且无溢出；面板改为换行后不再需要横向滚动。
- [x] `844x390x3 mobile/touch landscape`：同一局切横屏后 canvas `844x390`、摇杆 `112x112`、所有按钮无溢出。
- [x] 双指缩放：合成双指距离 `200 -> 350`，`data-zoom` 从 `1.150` 变为 `1.253`；缩放后 `data-tve4-ready=true`。
- [x] 切后台恢复：新开标签页再返回游戏页，canvas 保持 ready、游戏状态/结果层未丢失、无错误页。
- [x] 真实地图 AI 终局：地图 3 精灵静止，AI 巨魔在真实 WPM 上自行寻路接近，9 秒击杀精灵；页面显示“所有精灵被消灭，失败”“坚守 9 秒”和“再来一局”。
- [x] 浏览器终局测试仅用页面内临时 rAF 时间加速缩短等待，不改产品代码、不改规则数值；AI 决策与战斗仍走真实 `stepGame`。
- [x] `再来一局` 可点击并重新运行同配置对局。
- [x] 上述流程 Console error/warn 为 0；浏览器测试结束后已停止开发服务器。
- [x] 修复后补测内网 HTTP：`http://10.2.5.199:3000/tve4` 在 390×844 下 `isSecureContext=false`、`crypto.subtle=undefined`，选择精灵进入地图 0 后 `data-tve4-ready=true`、`data-fog-enabled=true`，无 `digest` 报错；哈希仍按原 SHA-256 校验，未跳过。
- [x] “更多”按钮移到右上独立位置：竖屏按钮 `y=128..160`、面板 `y=176..348`；横屏面板移到左侧 `x=332..556, y=12..184`。两种朝向面板与面板外按钮重叠数均为 0。
- [x] 已按反馈移除 WPM 阻挡色块、地形条纹、树木/岩石、网格与天使/石头标记；地图改为统一底色，仅保留墙体高亮边界、建筑、单位和出生点。

## 英雄模型接入与地图净化（Chrome DevTools）

- [x] 开局流程变为“阵营 → 英雄模型 → 地图”：精灵显示 12 个候选，巨魔显示 17 个候选；保留“默认几何”选项。
- [x] 模型预览：精灵默认选 `m020 Kael`，`data-preview-ready=true`；原始贴图/灰模、动作完整状态可见。
- [x] 玩家英雄模型：选择 `m022 Oldelf` 进入地图后 Phaser canvas 记录 `data-hero-model-id=m022`、`data-hero-model-ready=true`，额外透明 MDX canvas 随玩家移动；摇杆移动时动作 `stand → walk → stand`。
- [x] 巨魔模型：选择 `m001 DarkTrollTrapper` 可正常进入地图，`data-hero-model-ready=true`，无模型错误。
- [x] 默认几何：选择“默认几何”进入地图后只有 Phaser canvas，无 `data-hero-model-ready`，保持轻量占位。
- [x] 地图净化：`data-map-style=flat`、`data-doodads-visible=false`；统一底色，不再绘制地形条纹、树木/岩石、网格或阻挡色块；只保留 WPM 阻挡区与可通行区的交界线（地图 1 为 18,248 段），不填色，墙体/悬崖边界清晰可见。
- [x] 底色与墙体对比：背景改为柔和灰绿 `#36413c`，墙体填充改为浅石色 `#eadbb8`，加深色外框、亮色内框和低透明度暖色外晕；实际建造石墙后截图中墙体清晰可辨，不刺眼。
- [x] 迷雾改为径向渐变：玩家周围柔和过渡，不再出现硬边方形黑框；全图模式仍关闭迷雾。
- [x] 英雄模型缩放锚点：改用 Phaser 相机视图矩阵 `getViewMatrix(true).transformPoint` 定位；缩放 1.150 与 1.785 时，模型中心与玩家屏幕坐标偏差均小于 0.02px，缩放不再偏移。
- [x] 英雄模型选择：点击阵营后进入独立选择页；精灵 12 个、巨魔 17 个稳定编号模型，显示原始贴图/灰模与动作完整性，默认优先“动作完整 + 原始贴图”。
- [x] 模型预览：选择页使用 `/tve4-model-demo` 的 MDX 查看器实时播放；默认几何选项不创建模型 canvas。
- [x] 玩家英雄接入：精灵 `m022 Oldelf`、巨魔 `m003` 均进入地图后 `data-hero-model-ready=true`；透明覆盖 canvas 跟随玩家，待机/移动动作随输入切换。
- [x] 模型外观不影响模拟：`heroModelId` 不进入 `stateHash`；单测验证同种子下默认几何与 MDX 外观状态哈希一致。
- [x] 竖屏/横屏：模型覆盖层在 `390x844` 与 `844x390` 均保持在 viewport 内；Console error/warn 为 0。
- [x] 自动化补充：`scripts/tve4/ai_vision.test.ts` 5 项通过，包括“视野外不可见”“已探索建筑记忆”“隐身/显影/暴露规则”“真实地图 3 AI 到达并结束对局”。
