# 开发计划（按用户 2026-11-26 调整）

## 里程碑总览

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| M0 原版地图研究 | 已完成 | `docs/research/**` 15 份文档 + `docs/GDD.md` |
| M1 项目基础设施 | 进行中 | 仅前端配置分层与文档；不建 .NET / 不改现有游戏逻辑 |
| M2 地图与资源 | 待开始 | 现有 `/tve-ph` 已具备原版地形/树木/程序化建筑（PROPOSED） |
| M3 核心单机玩法 | 待开始 | 需按 GDD 补齐准备期、模式、复活等 VERIFIED 规则 |
| M4 多人 | 第一步完成 | `/ws-tve` 房间权威 Tick + 双客户端同步；客户端接入待做；不使用 .NET |
| M5-M9 | 待开始 | 桌面/手机适配、后台、测试与部署 |

## M1 本轮交付

1. `docs/GDD.md`：20 个系统章节，全部标注 VERIFIED / INFERRED / UNKNOWN / PROPOSED。
2. `data/original/game-rules.json`、`data/game/game-rules.json`：配置分层，版本化、来源可追溯。
3. `src/lib/tve-classic/config.ts`：zod 校验 + 类型化导出。
4. `tools/data-validator/validate_config.py`：18 项常量校验。
5. `docs/architecture.md`、`docs/development-plan.md`：架构与计划文档（明确排除 .NET）。
6. `game.tsx`：HUD 底部来源摘要（唯一前端 UI 改动）。

## 验收证据

- `python tools/data-validator/validate_config.py` → `OK ... checks=18`
- `npx tsc --noEmit` → 无错误

## M4 第一步交付（2026-11-26）

- `src/lib/tve-protocol.ts`：版本化 JSON 协议（join/move/build/leave/ping + welcome/state/error）。
- `src/server/tve-realtime.ts`：房间注册表、20Hz 服务端权威 Tick、复用 `engine.ts` 计算、状态快照广播、按连接裁剪资源视图。
- `server.ts`：新增 `/ws-tve` 端点，与既有 `/ws` 世界链路完全隔离；关闭时一并清理。
- `scripts/tve/check_ws.ts`：双客户端加入、状态广播、玩家移动与准备期巨魔静止的联机断言。

## tve4 当前实现（2026-11-26 更新）

旧三套渲染器与 `tve-classic` 已删除，当前唯一实现为 `/tve4`（Phaser 4 + React HUD）：

- 地图为显式元素（`src/lib/tve4/map.ts`）：26 个编号房间、巨魔出生点无墙、房间唯一 3 格入口、沿途 1~4 个窄口；无建筑时全图开放格连通。
- 规则按 `docs/research/**` 对齐：OLD 初始 30/70 金、30 秒准备期、伤害转等量金币、22% 偷血、赏金 `floor(金*0.5)+木*8`、force 清空判负、300 秒共享视野。
- 资源全部自绘（`public/tve4/`），不依赖原版 MPQ 烘焙资源。
- 自检：`npm run check:tve4`。

## 明确不做

- 不初始化 Monorepo / pnpm workspace / Turborepo。
- 不新建 NestJS / .NET 项目。
- 不改动 `engine.ts` 的现有玩法逻辑（上一轮玩法改动保持原样，待浏览器实测）。
