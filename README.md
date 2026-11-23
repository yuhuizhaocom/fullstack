# TaskFlow

基于 Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui + PostgreSQL + Prisma 的全栈任务管理系统，桌面端与移动端自适应，内置完整的 CRUD 示例。

## 功能特性

- **仪表盘**：任务总数、各状态数量、完成率、最近 5 条任务、服务与数据库连通状态
- **任务管理**：列表（表格 / 移动端卡片双形态）、关键词搜索（标题 / 描述 / 负责人）、按状态与优先级筛选、分页
- **CRUD**：新建、编辑、切换状态、删除，全部走 Server Actions + Zod 校验
- **响应式**：`lg` 以上侧边栏 + 表格，移动端抽屉导航 + 卡片列表
- **健康检查**：`GET /api/health` 实际执行 `SELECT 1`，成功 200 / 失败 503

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
src/
├─ app/
│  ├─ layout.tsx               根布局（字体、Toaster、AppShell）
│  ├─ page.tsx                 仪表盘（Server Component 直接查询 Prisma）
│  ├─ tasks/
│  │  ├─ page.tsx              任务列表：searchParams 驱动搜索/筛选/分页
│  │  └─ loading.tsx           加载骨架
│  └─ api/health/route.ts      健康检查（SELECT 1）
├─ actions/tasks.ts            Server Actions：create / update / updateStatus / delete
├─ components/
│  ├─ layout/                  侧边栏、移动端头部、导航配置
│  ├─ tasks/                   对话框表单、表格、卡片列表、筛选器、行操作
│  └─ ui/                      shadcn/ui 基础组件
└─ lib/
   ├─ prisma.ts                PrismaClient 单例（开发环境避免连接泄漏）
   ├─ task-meta.ts             状态/优先级文案与样式映射
   ├─ validations/task.ts      Zod schema
   └─ format.ts / utils.ts     日期格式化、cn()

prisma/
├─ schema.prisma               Task 模型 + 三个索引
├─ migrations/                 SQL 迁移
└─ seed.mjs                    10 条示例任务（upsert，可重复执行）

scripts/
├─ install.sh                  本地/WSL 一键安装
├─ server-bootstrap.sh         服务器端一键重建（生产部署）
└─ server/                     生产环境启停脚本（start.sh / stop.sh）
```

## 数据流

**读**：Server Component 在服务端直接 `await prisma.task.findMany(...)`，查询条件来自 URL 的 `searchParams`（`q` / `status` / `priority` / `page`），无需客户端 `fetch`。

**写**：客户端表单 → Server Action（`src/actions/tasks.ts`）→ Zod 校验 → Prisma 写库 → `revalidatePath` 刷新缓存 → 前端 toast + `router.refresh()`。

## 数据模型

`Task`（表名 `tasks`）：`id`(cuid) / `title` / `description?` / `assignee?` / `status`(TODO|IN_PROGRESS|DONE) / `priority`(LOW|MEDIUM|HIGH) / `dueDate?` / `createdAt` / `updatedAt`，并对 `status`、`priority`、`createdAt` 建索引。

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

服务器部署、端口约定、重置后快速重建、运维与踩坑记录见 [DEPLOY.md](./DEPLOY.md)。
