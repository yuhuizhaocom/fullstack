# 生产部署手册（sg-sgp13）

本文档记录 TaskFlow 在 `sg-sgp13.tryaltare.ai` 上的生产部署方式、重置后的快速重建流程、日常运维与踩坑记录。

另：本地/WSL 一键安装见 [README.md](./README.md) 与 `scripts/install.sh`。

---

## 1. 环境与端口约定

| 项目 | 值 |
| --- | --- |
| SSH | `root@sg-sgp13.tryaltare.ai -p 25044`（密码由管理员保管，勿写入仓库） |
| 系统 | Ubuntu 24.04.5 LTS（受限容器，**无 systemd**） |
| 应用目录 | `/opt/taskflow` |
| 应用端口 | **25045**（`next start -H 0.0.0.0 -p 25045`） |
| 数据库端口 | **25048**（PostgreSQL 16，监听 `0.0.0.0`） |
| 数据库 | 库 `taskflow` / 用户 `taskflow` / 密码见 `/root/.taskflow-db-password` |
| Node.js | v22.22.0，安装于 `/usr/local/lib/nodejs/`，软链到 `/usr/local/bin` |
| PG 数据目录 | `/var/lib/postgresql/16/main`，socket 在 `/var/run/postgresql` |
| 日志 | 应用 `/opt/taskflow/app.log`，数据库 `/var/lib/postgresql/16/main/server.log` |

对外访问：

- 应用：http://sg-sgp13.tryaltare.ai:25045
- 健康检查：http://sg-sgp13.tryaltare.ai:25045/api/health
- 数据库：`sg-sgp13.tryaltare.ai:25048`（scram-sha-256，仅 `taskflow` 可连）

### 架构

```
浏览器 ──25045──> next start (Node 22) ──127.0.0.1:25048──> PostgreSQL 16
                        │                                        │
                   /opt/taskflow                          /var/lib/postgresql/16/main
                        │
                  bin/start.sh (pg_ctl + nohup)  ← 无 systemd，需手工拉起
```

---

## 2. 服务器重置后：三步快速重建

前提：本机已能 SSH 登录、服务器可访问外网（或可上传离线包）。

### 第 1 步：打包并上传代码（本机执行）

```powershell
# 在项目根目录 e:\code\github\servercode
tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env -czf taskflow.tar.gz .
scp -P 25044 taskflow.tar.gz root@sg-sgp13.tryaltare.ai:/root/
```

### 第 2 步：解压（服务器执行）

```bash
ssh -p 25044 root@sg-sgp13.tryaltare.ai
mkdir -p /opt/taskflow
tar -xzf /root/taskflow.tar.gz -C /opt/taskflow
```

如果 Node.js 无法在线下载，另需本机上传安装包（可跳过，先尝试第 3 步）：

```powershell
scp -P 25044 node-v22.22.0-linux-x64.tar.gz root@sg-sgp13.tryaltare.ai:/root/
```

### 第 3 步：一键重建（服务器执行）

```bash
cd /opt/taskflow
APT_MIRROR=http://sg.archive.ubuntu.com/ubuntu/ bash scripts/server-bootstrap.sh
```

脚本结束后会打印健康检查结果。访问 `http://sg-sgp13.tryaltare.ai:25045` 即可。

> 若之前保留过 `/root/.taskflow-db-password`，脚本会复用同一密码；若数据目录也被清空，则重新 `initdb` 并重跑迁移与种子数据（10 条示例任务）。

### 脚本做了什么（8 步）

| 步骤 | 内容 | 关键点 |
| --- | --- | --- |
| 1 | APT 源 | 可选切换 `APT_MIRROR`，写 `Acquire::ForceIPv4` 避免 IPv6 超时 |
| 2 | Node.js | 已有 20+ 则复用；否则解压 `node-v22*-linux-x64.tar.gz`（可本地上传），软链到 `/usr/local/bin` |
| 3 | PostgreSQL | 缺包则 apt 安装；数据目录用 `initdb` 手工初始化（绕开容器里的 `pg_createcluster` 失败）；配置 `port=25048`、`listen_addresses='*'`、`scram-sha-256` |
| 4 | 启库建库 | `pg_ctl` 启动；创建/同步 `taskflow` 角色与数据库；密码写入 `/root/.taskflow-db-password`（600） |
| 5 | `.env` | 生成 `DATABASE_URL` 指向 `127.0.0.1:25048`，文件权限 600 |
| 6 | 构建 | `npm ci` → `prisma generate` → `migrate deploy` → `db seed` → `npm run build` |
| 7 | 启停脚本 | 复制 `scripts/server/{start,stop}.sh` 到 `/opt/taskflow/bin/` |
| 8 | 启动自检 | 启动应用并轮询 `/api/health`，非 200 直接报错退出 |

---

## 3. 日常运维

```bash
bash /opt/taskflow/bin/start.sh    # 启动 PostgreSQL（若未运行）+ 应用；已运行则跳过
bash /opt/taskflow/bin/stop.sh     # 停止应用（不影响 PostgreSQL）
tail -f /opt/taskflow/app.log      # 查看应用日志（上一轮在 app.log.prev）
tail -f /var/lib/postgresql/16/main/server.log   # 查看数据库日志
```

**容器重启后必须手动执行 `start.sh`** —— 该环境没有 systemd，进程不会自动恢复。

`start.sh` 会先检查 `app.pid` 与 `/api/health`，已在运行则直接跳过（可安全重复执行）。`stop.sh` 除结束 `app.pid` 中的 npm 进程外，还会清理其派生的 `next-server` 子进程并等待端口释放；容器内 `ss` 可能看不到监听端口，因此判断“是否已运行”以健康检查为准。

### 升级代码

```bash
# 本机重新打包上传后
cd /opt/taskflow
tar -xzf /root/taskflow.tar.gz -C /opt/taskflow
npm ci && npx prisma migrate deploy && npm run build
bash /opt/taskflow/bin/stop.sh && bash /opt/taskflow/bin/start.sh
```

### 数据库备份 / 恢复

```bash
# 备份（在服务器上，密码从文件读取，避免明文进入历史记录）
PGPASSWORD="$(cat /root/.taskflow-db-password)" pg_dump -h 127.0.0.1 -p 25048 -U taskflow -d taskflow \
  -Fc -f /root/taskflow-$(date +%F).dump

# 恢复
PGPASSWORD="$(cat /root/.taskflow-db-password)" pg_restore -h 127.0.0.1 -p 25048 -U taskflow \
  -d taskflow --clean --if-exists /root/taskflow-2026-11-23.dump
```

### 连接数据库（本机有 psql 时）

```bash
psql "postgresql://taskflow:<密码>@sg-sgp13.tryaltare.ai:25048/taskflow"
```

---

## 4. 部署后验证清单

```bash
# 应用与数据库连通性（应返回 200 与 database: connected）
curl -i http://127.0.0.1:25045/api/health

# 页面可访问
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:25045/tasks

# 任务条数（首次部署应为 10 条种子数据）
PGPASSWORD="$(cat /root/.taskflow-db-password)" psql -h 127.0.0.1 -p 25048 -U taskflow -d taskflow \
  -c 'SELECT count(*) FROM tasks;'

# 外网端口连通性（本机 PowerShell）
Test-NetConnection sg-sgp13.tryaltare.ai -Port 25045
Test-NetConnection sg-sgp13.tryaltare.ai -Port 25048
```

业务验证：在 `/tasks` 新建 → 编辑 → 切换状态 → 删除一条任务，刷新后数据应保持一致（此前已在生产环境实测通过，数据库最终 10 条）。

---

## 5. 首次部署记录（手工步骤参考）

以下为 2026-11 首次部署时的实际操作，`server-bootstrap.sh` 已将其固化，仅供排查时对照。

1. **探测环境**：Ubuntu 24.04 容器，无 systemd、无 Node、无 PostgreSQL、无 Docker；apt 默认源走 IPv6 超时。
2. **修 APT 源**：改为 `http://sg.archive.ubuntu.com/ubuntu/`（改用 `sed` 修改，避免用 `pkill -f "apt-get install"` 误杀自身 shell），并写入 `Acquire::ForceIPv4 "true"`。
3. **装 Node**：NodeSource 不可靠，改为本地上传 `node-v22.22.0-linux-x64.tar.gz`，解压到 `/usr/local/lib/nodejs/` 后软链。
4. **装 PostgreSQL**：`apt-get install postgresql postgresql-contrib`（16.15）。
5. **手工 initdb**：`pg_createcluster 16 main` 报 `data directory has wrong ownership`（容器 chown/stat 视图问题），改为以 `postgres` 用户直接执行：
   ```bash
   install -d -o postgres -g postgres -m 700 /var/lib/postgresql/16/main
   su -s /bin/sh postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/16/main \
     -U postgres --auth-local=trust --auth-host=scram-sha-256 --encoding=UTF8 --locale=C.UTF-8"
   ```
6. **配端口**：`postgresql.conf` 中 `port = 25048`、`listen_addresses = '*'`；`pg_hba.conf` 追加 `host all all 0.0.0.0/0 scram-sha-256` 与 `::/0` 行。
7. **建库**：`psql` 的 socket 在 `/var/run/postgresql`（不是 `/tmp`），据此创建角色与数据库，密码存 `/root/.taskflow-db-password`。
8. **部署应用**：上传 `taskflow.tar.gz` 解压到 `/opt/taskflow`，写 `.env`，`npm ci` → `prisma migrate deploy` → `db seed` → `npm run build`。
9. **启动**：`nohup npm run start -- -H 0.0.0.0 -p 25045 &`，PID 写入 `app.pid`。

### 用重建脚本复验（2026-11-23）

在现有服务器上完整跑了一遍 `bash scripts/server-bootstrap.sh`，确认脚本可重复执行：

- 复用了 PostgreSQL 数据目录、`/root/.taskflow-db-password` 中的密码与 `taskflow` 数据库；
- `npm ci` → `prisma migrate deploy` → `db seed`（10 条 upsert）→ `next build` 全部通过；
- 自检输出 `健康检查通过：{"status":"ok","database":"connected"}`；
- 公网 `http://sg-sgp13.tryaltare.ai:25045/api/health` 返回 200，`/tasks` 返回 200 且包含种子任务。

> 期间发现并修复：32 核 + `cgroup pids.max=512` 环境下，Next 默认按 CPU 数启动 31 个构建 worker，导致 `spawn ... EAGAIN`。现在 `next.config.ts` 支持 `NEXT_BUILD_CPUS`，重建脚本检测到 pids 限额较低时自动设为 2。

---

## 6. 踩坑记录

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `apt-get update` 长时间卡住 | 默认源解析到 IPv6，网络不通 | 换 `sg.archive.ubuntu.com` + `Acquire::ForceIPv4 "true"` |
| 终止 apt 时连自己的 SSH shell 一起被杀 | `pkill -f "apt-get install"` 匹配到了执行该命令的 shell 本身 | 不要用 `pkill -f` 杀 apt；改用 `kill <pid>` 或等待完成 |
| `pg_createcluster` 报 data directory has wrong ownership | proot 容器内 root 与 postgres 用户看到的属主不一致 | 以 `postgres` 用户手工 `initdb` |
| `psql -h /tmp` 连不上 | Debian/Ubuntu 的 socket 目录是 `/var/run/postgresql` | `-h /var/run/postgresql`，或直接 `-h 127.0.0.1 -p 25048` |
| NodeSource 安装失败 / 连不上 | 出网受限 | 本地下载 linux-x64 tar.gz 上传解压，软链二进制 |
| 容器重启后网站 502 / 连接被拒绝 | 无 systemd，进程不会自动拉起 | 执行 `/opt/taskflow/bin/start.sh` |
| `next build` 报 `spawn .../node EAGAIN` | 容器 `cgroup pids.max=512`，而 32 核机器上 Next 默认拉起 31 个构建 worker，线程数瞬间超过 512 | 用 `NEXT_BUILD_CPUS=2 npm run build` 降低 worker 数；`server-bootstrap.sh` 已自动检测 pids 限额并设置 |
| 创建/删除任务后页面数字短暂不一致 | `router.refresh()` 与读取存在竞态 | 属正常刷新延迟，数据库已生效；以 DB 查询为准 |
| PowerShell 传参给 ssh 时引号丢失 | Windows 原生参数解析 | 复合命令写成脚本上传后执行，或用 base64 传输 |

---

## 7. 安全说明

- 数据库只允许 `taskflow` 账号远程连接，`postgres` 超级用户未设密码，无法远程登录。
- 密码保存在服务器 `/root/.taskflow-db-password`（600），`.env` 同为 600；不要把这两处内容提交到仓库或粘贴到聊天/工单。
- `.env` 已在 `.gitignore` 中，打包脚本也显式排除。
- 25048 对公网开放是为满足外部连接需求；若不需要，建议在云安全组中收紧来源 IP。

---

## 8. 清理临时文件

部署过程产生的安装包与日志可删除：

```bash
rm -f /root/taskflow.tar.gz /root/node-v22.22.0-linux-x64.tar.gz /root/*.log
```

---

## 9. GitHub Actions 自动部署（CI/CD）

仓库：<https://github.com/yuhuizhaocom/fullstack>，推送到 `main` 即触发构建与发布。

### 流水线结构

```
push main ──> build（ubuntu-latest）
                npm ci → prisma generate → tsc --noEmit → next build（NEXT_BUILD_CPUS=2）
                → 打包源码 tar → artifact
            ──> deploy
                sshpass 上传 tar 到 /root → 解压到 /opt/taskflow
                → scripts/server-deploy.sh：npm ci → migrate deploy → build → 重启 → 健康检查
                → 从 runner 再做一次外网 /api/health 检查
```

- 配置文件：`.github/workflows/deploy.yml`
- 服务器端更新逻辑：[scripts/server-deploy.sh](./scripts/server-deploy.sh)
- 同一时间只跑一个部署（`concurrency: deploy-production`），避免并发覆盖

### 首次配置：仓库密钥

在 GitHub 仓库 `Settings → Secrets and variables → Actions → New repository secret` 添加 4 个密钥（只用于 deploy job，不会出现在日志里）：

| 名称 | 值 |
| --- | --- |
| `SSH_HOST` | `sg-sgp13.tryaltare.ai` |
| `SSH_PORT` | `25044` |
| `SSH_USER` | `root` |
| `SSH_PASSWORD` | 服务器 root 密码 |

未配置时，`deploy` job 会打印提示并跳过，`build` job 仍然照常校验构建。

### 服务器前置条件

- `/opt/taskflow` 已按本文档完成过一次部署（Node 22、PostgreSQL 25048、`.env` 存在）
- `.env` 不在 tar 中，升级不会覆盖数据库连接串
- 部署期间应用会在构建完成后重启一次（约 3–5 秒不可用）

### 手动触发与失败排查

- 手动触发：Actions → 构建与部署 → Run workflow
- 构建失败看 `build` job 日志；部署失败看 `deploy` job 与服务器 `/opt/taskflow/app.log`
- 若 `server-deploy.sh` 健康检查失败，脚本会 `exit 1`，GitHub 上显示红叉，服务器保持**新代码但未通过自检**的状态，需人工回滚或修复后重跑

### 已验证

2026-11-23 首次跑通：`构建与检查` 与 `部署到服务器` 全绿，服务器进程重启、`BUILD_ID` 更新为流水线构建时间，外网 `/api/health` 返回 200。踩坑一处已修：源码 `tar` 归档不能放在被归档目录内，否则报 `file changed as we read it`，现改为写入 `/tmp`。

---

## 10. 账号与权限

### 角色矩阵

| 能力 | 超级管理员 | 管理员 | 普通用户 |
| --- | --- | --- | --- |
| 查看任务 | 全部 | 全部 | 仅自己创建 |
| 新建 / 编辑 / 删除 / 改状态 | 全部 | 全部 | 仅自己的 |
| 仪表盘统计范围 | 全部 | 全部 | 仅自己创建 |
| 用户管理页 `/users` | 可见，可调整他人角色、禁用/启用账号 | 不可见 | 不可见 |

角色与禁用状态的变更即时生效（下一次请求即按新状态校验），无需对方重新登录；系统禁止把最后一个超级管理员降级，也禁止修改自己的角色、禁用自己或超级管理员账号。管理员在 `/users` 禁用账号时会同时删除该用户全部会话，对方立刻掉线且无法再次登录；重新启用后即可正常登录，任务数据保留。

普通用户在侧边栏用户卡片点击钥匙图标可修改自己的密码（需验证当前密码），修改后其他已登录设备需要重新登录。

### 超级管理员账号从哪来

- **公开注册**：系统内没有任何用户时，第一个注册的账号自动成为超级管理员
- **服务器部署**：`scripts/ensure-admin.mjs` 在每次部署（`server-deploy.sh`）与重建（`server-bootstrap.sh`）时执行，若不存在超级管理员则创建：
  - 邮箱 `admin@taskflow.local`（可用 `ADMIN_EMAIL` 覆盖）
  - 密码优先取 `ADMIN_PASSWORD` 环境变量，否则读取已有密码文件，最后才随机生成
  - 密码文件：`/root/.taskflow-admin-password`（权限 600）
  - 同时把历史遗留的无主任务（`ownerId` 为空）归到该账号，避免管理员看不到旧数据

查看初始密码：

```bash
cat /root/.taskflow-admin-password
```

### 安全说明补充

- 密码使用 `scrypt`（N=16384, r=8, p=1）加盐哈希存储，不保存明文
- 会话为数据库记录 + HttpOnly Cookie（7 天有效），退出时删除会话并清 Cookie
- 业务写操作在 Server Action 内二次校验归属，直接调用接口也无法越权
- 本站当前是 HTTP 部署，Cookie 未加 `Secure`；启用 HTTPS 后建议补上

---

## 11. Cloudflare Tunnel（HTTPS 入口）

服务器所在平台只放通 25044/25045/25048，80/443 从公网不可达，因此 HTTPS 走 Cloudflare Tunnel：`cloudflared` 主动出站连到 Cloudflare 边缘，无需开放任何入站端口。

```
浏览器 ──https:443──> Cloudflare 边缘 ──隧道──> cloudflared ──http:25045──> next start
```

### 一次性配置（Cloudflare 控制台）

1. 域名 NS 托管到 Cloudflare（Free 计划即可）
2. Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared，记下 **token**
3. 该隧道 → Public Hostname → Add：
   - Subdomain：如 `task`；Domain：你的域名
   - Service：`HTTP` + `localhost:25045`
4. 不要给该子域名手动添加 A 记录指向服务器 IP，Cloudflare 会自动创建 CNAME

### 服务器侧文件

| 路径 | 说明 |
| --- | --- |
| `/usr/local/bin/cloudflared` | 二进制（`cloudflared --version` 验证） |
| `/root/.cloudflared/token` | 隧道 token，权限 600，**不入仓库** |
| `/opt/taskflow/cloudflared.log` | 隧道日志 |
| `/opt/taskflow/cloudflared.pid` | 进程号 |

`bin/start.sh` 检测到 token 文件存在时会自动拉起隧道，`bin/stop.sh` 会一并停止；容器重启后执行一次 `start.sh` 即可恢复应用 + 隧道。

手动操作等价命令：

```bash
# 启动
nohup cloudflared tunnel --no-autoupdate run --token "$(cat /root/.cloudflared/token)" \
  >>/opt/taskflow/cloudflared.log 2>&1 &
echo $! >/opt/taskflow/cloudflared.pid

# 查看连接状态
grep "Registered tunnel connection" /opt/taskflow/cloudflared.log | tail -3

# 换 token：控制台轮换后覆盖文件，再重启隧道
bash /opt/taskflow/bin/stop.sh && bash /opt/taskflow/bin/start.sh
```

### 临时验证用 Quick Tunnel

无需域名，适合验证 HTTPS 与 Clipboard API：

```bash
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:25045
```

输出 `https://xxx.trycloudflare.com`，进程退出即失效，不要用于正式入口。

### 注意事项

- 同一端口不能同时提供 HTTP 和 HTTPS；隧道与 `http://<IP>:25045` 可以并存（前者走 Cloudflare，后者直连）
- 启用 HTTPS 后如需强制安全 Cookie，可把 `createSession` 里的 `secure` 设为 `true`；但会导致 HTTP 直连无法登录，需先确认只走域名
- Cloudflare 免费版单请求 100MB 上限，SSE / WebSocket 可用
- token 等同于入口凭证，泄露后应在控制台重新生成并更新服务器文件

### 已验证

2026-11-24：命名隧道启动成功，日志显示 `Registered tunnel connection ... location=sin20 protocol=quic`；Quick Tunnel 阶段实测 `isSecureContext=true`，`navigator.clipboard` 读写均可用。
