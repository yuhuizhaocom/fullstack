# TaskFlow

基于 Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui + PostgreSQL + Prisma 的全栈任务管理系统，桌面端与移动端自适应，内置完整的 CRUD 示例。

## 功能特性

- **账号体系**：注册、登录、退出、修改密码；密码使用 scrypt 加盐哈希，会话存数据库 + HttpOnly Cookie
- **账号状态**：超级管理员可禁用/启用账号，禁用后立即下线且无法登录，数据保留
- **三级角色**：超级管理员（管理用户与全部任务）、管理员（管理全部任务）、普通用户（仅自己创建的任务）
- **临时剪贴板**：无需登录，6 位频道码即可在设备间实时互传文本与图片（SSE 推送）；支持自动读取本机剪贴板并发送、自动写入收到的内容（写入前判重），历史按时间倒序保留 24 小时
- **公共聊天室**：登录用户以账号名发言，未登录填昵称即可参与，同一大厅 SSE 实时收发；消息保留 7 天
- **附件分享**：无需登录，单文件 ≤ 100MB，上传后生成下载链接，24 小时后自动删除记录与磁盘文件
- **像素冒险**：无需登录的回合制像素 RPG，含 4 职业、技能、装备、宠物、怪物、BOSS 与 4 个副本，存档存于浏览器 localStorage
- **开放世界**：2.5D 等距视角的实时多人世界，自动组队打怪，服务器统一刷新怪物与 BOSS；靠近怪物自动攻击、掉落自动拾取，玩家只需移动与释放技能；攻击带动作帧与斩击弧光，职业/装备外观不同，怪物为像素绘制，技能有专属特效；移动端摇杆与技能叠加在画面上，支持全屏，带小地图、位置插值、经验条、伤害数字、音效与背景音乐（Web Audio 合成）
- **云存档**：登录后可将角色存档上传到 `game_saves`，换设备一键恢复
- **仪表盘**：任务总数、各状态数量、完成率、最近 5 条任务、服务与数据库连通状态
- **任务管理**：列表（表格 / 移动端卡片双形态）、关键词搜索（标题 / 描述 / 负责人）、按状态与优先级筛选、分页
- **CRUD**：新建、编辑、切换状态、删除，全部走 Server Actions + Zod 校验
- **响应式**：`lg` 以上侧边栏 + 表格，移动端抽屉导航 + 卡片列表
- **健康检查**：`GET /api/health` 实际执行 `SELECT 1`，成功 200 / 失败 503，并返回构建版本号

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 15.5（App Router、Server Components、Server Actions） |
| 语言 | TypeScript 5.9 |
| 样式 | Tailwind CSS 3.4 + shadcn/ui（组件源码内置在仓库） |
| 数据库 | PostgreSQL 16 |
| ORM | Prisma 6.19（migration + seed） |
| 校验 | Zod 3 |
| 提示 | sonner + lucide-react |

## 快速开始

### 方式一：WSL / Ubuntu 一键安装

```bash
bash scripts/install.sh                 # 安装依赖 + 初始化数据库 + 开发模式启动
bash scripts/install.sh --prod --port 8080   # 生产模式构建并启动
bash scripts/install.sh --skip-db       # 已有数据库，只安装依赖并迁移
```

脚本会自动安装 Node.js 20+、PostgreSQL，生成本地数据库与随机密码并写入 `.env`，执行迁移与种子数据。更多参数见 `bash scripts/install.sh --help`。

### 方式二：Docker 起数据库 + 本地跑应用

```bash
docker compose up -d db
cp .env.example .env      # 默认即可连接容器内数据库
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

### 方式三：连接已有 PostgreSQL

```bash
cp .env.example .env      # 修改 DATABASE_URL 指向已有库
npm install
npm run db:deploy && npm run db:seed && npm run dev
```

打开 http://localhost:3000 。

## 目录结构

```
server.ts                        自定义 Node 服务：Next 页面 + 同端口 /ws 实时服务
src/
├─ server/
│  └─ realtime.ts                WebSocket 会话、msgpack 协议与 10Hz 增量广播
├─ app/
│  ├─ layout.tsx               根布局（字体、Toaster）
│  ├─ (app)/
│  │  ├─ layout.tsx            登录校验 + AppShell
│  │  ├─ page.tsx              仪表盘（按角色过滤统计）
│  │  ├─ tasks/                任务列表：searchParams 驱动搜索/筛选/分页
│  │  └─ users/                用户管理（仅超级管理员）
│  ├─ (auth)/
│  │  ├─ login/                登录页（含公开功能入口）
│  │  └─ register/             注册页
│  ├─ (public)/
│  │  ├─ chat/                 公共聊天室（登录 / 游客双身份）
│  │  ├─ clip/                 临时剪贴板：加入频道
│  │  ├─ clip/[code]/          频道页（SSE 实时同步）
│  │  ├─ files/                附件分享（上传 / 下载链接）
│  │  ├─ game/                 旧版入口（重定向到 /world）
│  │  └─ world/                开放世界（实时多人 + 实时副本）
│  └─ api/
│     ├─ health/route.ts       健康检查（SELECT 1 + 版本号）
│     ├─ chat/                 聊天历史读写 + SSE 流
│     ├─ files/                附件流式上传、列表与下载
│     ├─ game/save/            云存档读写（登录用户）
│     └─ clip/[code]/          消息读写 + SSE 流
├─ actions/
│  ├─ auth.ts                  注册 / 登录 / 退出 / 修改密码
│  ├─ users.ts                 角色与启用禁用（超级管理员）
│  └─ tasks.ts                 任务 CRUD（含权限校验）
├─ components/
│  ├─ auth/                    登录注册表单、修改密码弹窗
│  ├─ chat/                    聊天室组件（消息流、身份切换）
│  ├─ clip/                    加入频道表单、频道房间
│  ├─ files/                   附件上传（拖拽 / 进度）与列表
│  ├─ game/                    像素 RPG：主界面、面板、战斗、云存档
│  ├─ world/                   开放世界：Canvas 游戏界面、组队面板、音效开关
│  ├─ layout/                  侧边栏、移动端头部、用户卡片、导航配置
│  ├─ tasks/                   对话框表单、表格、卡片列表、筛选器、行操作
│  ├─ users/                   角色选择器、禁用开关
│  └─ ui/                      shadcn/ui 基础组件
└─ lib/
   ├─ auth/                    密码哈希、数据库会话、角色与数据权限
   ├─ chat/                    聊天室常量、内存广播
   ├─ clip/                    频道常量、内存广播、限流
   ├─ files/                   附件常量、磁盘存储、过期清理
   ├─ game/                    游戏数据、类型、战斗与升级引擎
   ├─ world/                   地形、服务器世界状态、Canvas 渲染、8-bit 音频
   ├─ prisma.ts                PrismaClient 单例（开发环境避免连接泄漏）
   ├─ task-meta.ts             状态/优先级文案与样式映射
   ├─ validations/task.ts      Zod schema
   └─ format.ts / utils.ts     日期格式化、cn()

prisma/
├─ schema.prisma               User / Session / Task / ChatMessage / SharedFile / ClipEntry / GameSave 模型与索引
├─ migrations/                 SQL 迁移
└─ seed.mjs                    10 条示例任务（upsert，可重复执行）

scripts/
├─ install.sh                  本地/WSL 一键安装
├─ server-bootstrap.sh         服务器端一键重建（生产部署）
├─ server-deploy.sh            服务器端更新（CI 调用）
├─ ensure-admin.mjs            确保存在超级管理员
└─ server/                     生产环境启停脚本（start.sh / stop.sh）
```

## 数据流

**读**：Server Component 在服务端直接 `await prisma.task.findMany(...)`，查询条件来自 URL 的 `searchParams`（`q` / `status` / `priority` / `page`），无需客户端 `fetch`。

**写**：客户端表单 → Server Action（`src/actions/tasks.ts`）→ Zod 校验 → Prisma 写库 → `revalidatePath` 刷新缓存 → 前端 toast + `router.refresh()`。

## 数据模型

`Task`（表名 `tasks`）：`id`(cuid) / `title` / `description?` / `assignee?` / `status`(TODO|IN_PROGRESS|DONE) / `priority`(LOW|MEDIUM|HIGH) / `dueDate?` / `ownerId?` / `createdAt` / `updatedAt`，并对 `status`、`priority`、`createdAt`、`ownerId` 建索引。

`User`（`users`）：`id` / `email`(唯一) / `name` / `passwordHash` / `role`(SUPER_ADMIN|ADMIN|USER) / `disabled`；`Session`（`sessions`）：`token`(唯一) / `userId` / `expiresAt`，随用户删除级联。

`ClipEntry`（`clip_entries`）：`channel` / `content` / `clientId`(匿名浏览器标识) / `createdAt`，按 `(channel, createdAt)` 建索引，仅保留 24 小时。

## 账号与权限

| 角色 | 任务可见范围 | 任务操作 | 用户管理 |
| --- | --- | --- | --- |
| `SUPER_ADMIN` 超级管理员 | 全部 | 增删改查全部 | 可调整他人角色、禁用/启用账号 |
| `ADMIN` 管理员 | 全部 | 增删改查全部 | 不可见 |
| `USER` 普通用户 | 仅自己创建的 | 仅自己的任务 | 不可见 |

- 登录后点击侧边栏用户卡片右侧的钥匙图标可修改密码（需验证当前密码，修改后其他设备下线）
- 禁用账号会立即删除该用户的全部会话；超级管理员账号与自己的账号不可禁用
- 本地首次运行：**第一个注册的账号自动成为超级管理员**，之后注册均为普通用户
- 服务器部署：`scripts/ensure-admin.mjs` 会自动创建 `admin@taskflow.local`，初始密码写入 `/root/.taskflow-admin-password`（600）
- 权限在服务端双重校验：读取时按角色过滤查询条件，写入时再校验任务归属，前端隐藏按钮不作为安全边界

## 环境变量

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://taskflow:密码@127.0.0.1:5432/taskflow?schema=public` |
| `NEXT_BUILD_CPUS` | 可选，构建 worker 数量（默认 4）；容器进程数受限时调小 | `2` |

`.env` 已在 `.gitignore` 中，请勿提交。

## 常用命令

```bash
npm run dev         # 开发模式
npm run build       # prisma generate + next build
npm run start       # 生产模式（需先 build）
npm run db:deploy   # 应用迁移（生产）
npm run db:migrate  # 创建新迁移（开发）
npm run db:seed     # 写入示例数据
npm run db:studio   # Prisma Studio
```

## 生产部署

线上入口：https://www.722.qzz.io （Cloudflare Tunnel，HTTPS）。

服务器部署、端口约定、重置后快速重建、运维与踩坑记录见 [DEPLOY.md](./DEPLOY.md)。

推送到 `main` 后由 GitHub Actions 自动构建并发布到服务器（见 [.github/workflows/deploy.yml](./.github/workflows/deploy.yml)）。
