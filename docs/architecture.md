# 当前架构说明（M1，2026-11-26）

## 技术决策

- **不引入 C#/.NET 权威游戏服务器**。实时逻辑沿用本仓库既有 Node 链路。
- 现有逻辑保持不变，M1 只做前端侧的最小基础设施调整。
- 原 Monorepo / Turborepo / NestJS 方案不作为本项目实施目标。

## 现有结构

```
Next.js 15 App Router        src/app/**
React HUD                    src/components/tve-classic/hud.tsx
Phaser 渲染                  src/components/tve-classic/stage-ph.ts
Pixi 2D / Three 3D 渲染      stage2d.ts / stage3d.ts
游戏逻辑（单机模拟）         src/lib/tve-classic/engine.ts
数值表                       src/lib/tve-classic/data.ts
实时 WebSocket（既有）       server.ts + src/server/realtime.ts
业务 API / Server Actions    src/actions/** + src/app/api/**
资源输出                     public/tve-original/**
研究工具                     tools/map-parser/**
配置分层（M1 新增）          data/original/** + data/game/**
```

## 配置分层（M1）

- `data/original/game-rules.json`：**VERIFIED** 原版数值快照，只读，不可覆盖。
- `data/game/game-rules.json`：**PROPOSED** 网页当前镜像，带版本号与来源标记。
- `src/lib/tve-classic/config.ts`：zod 启动校验 + 类型化导出；只用于 UI 展示来源/差异，不参与规则计算。
- `tools/data-validator/validate_config.py`：离线校验配置与 18 项 VERIFIED 常量。
- 游戏 HUD 底部显示配置来源摘要，便于识别 VERIFIED / PROPOSED 差异。

## 渲染与逻辑边界

- `engine.ts` 负责规则/状态，不依赖 Phaser。
- `stage-ph.ts` / `stage2d.ts` / `stage3d.ts` 只负责表现与输入。
- React 只负责 HUD，不负责高频绘制。

## 多人扩展方向（M4，PROPOSED）

在既有 `server.ts` 上新增 `/ws-tve`（见 `src/server/tve-realtime.ts`），与 `/ws` 世界链路隔离。服务端复用 `engine.ts` 做 20Hz 权威 Tick，客户端只发指令并接收快照；不使用 .NET。浏览器客户端尚未接入该端点（下一步）。
