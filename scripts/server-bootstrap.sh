#!/usr/bin/env bash
#
# TaskFlow 服务器端一键重建脚本
#
# 适用：Ubuntu 24.04 容器 / 虚拟机（无 systemd 也可），root 执行。
# 作用：从零准备 Node.js、PostgreSQL、数据库与 .env，安装依赖、迁移、种子、构建、启动。
# 幂等：可重复执行；已存在的数据库、.env、构建产物会被复用（.env 中的密码保持一致）。
#
# 用法（在项目根目录执行）：
#   bash scripts/server-bootstrap.sh
#   APT_MIRROR=http://sg.archive.ubuntu.com/ubuntu/ bash scripts/server-bootstrap.sh
#   SKIP_SEED=1 bash scripts/server-bootstrap.sh      # 不写入示例数据
#   NODE_TARBALL=/root/node-v22.22.0-linux-x64.tar.gz bash scripts/server-bootstrap.sh
#   BUILD_CPUS=4 bash scripts/server-bootstrap.sh     # 限制构建并发（容器 pids 限额较低时自动限制）
#
# 可覆盖的环境变量：
#   APP_DIR APP_PORT DB_PORT DB_NAME DB_USER DB_HOST
#   PGDATA PGBIN PG_VERSION PASSWORD_FILE APT_MIRROR SKIP_SEED NODE_TARBALL BUILD_CPUS
#
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/taskflow}"
APP_PORT="${APP_PORT:-25045}"
DB_PORT="${DB_PORT:-25048}"
DB_NAME="${DB_NAME:-taskflow}"
DB_USER="${DB_USER:-taskflow}"
DB_HOST="${DB_HOST:-127.0.0.1}"
PG_VERSION="${PG_VERSION:-16}"
PGDATA="${PGDATA:-/var/lib/postgresql/${PG_VERSION}/main}"
PGBIN="${PGBIN:-/usr/lib/postgresql/${PG_VERSION}/bin}"
PASSWORD_FILE="${PASSWORD_FILE:-/root/.taskflow-db-password}"
APT_MIRROR="${APT_MIRROR:-}"
NODE_TARBALL="${NODE_TARBALL:-}"
NODE_VERSION="${NODE_VERSION:-22.22.0}"
SKIP_SEED="${SKIP_SEED:-0}"
BUILD_CPUS="${BUILD_CPUS:-}"
PG_SOCKET_DIR="${PG_SOCKET_DIR:-/var/run/postgresql}"

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_INFO=$'\033[36m'; C_OK=$'\033[32m'
  C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'
else
  C_RESET=""; C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""
fi
info() { printf '%s[信息]%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
ok()   { printf '%s[完成]%s %s\n' "$C_OK" "$C_RESET" "$*"; }
warn() { printf '%s[警告]%s %s\n' "$C_WARN" "$C_RESET" "$*"; }
die()  { printf '%s[错误]%s %s\n' "$C_ERR" "$C_RESET" "$*" >&2; exit 1; }
step() { printf '\n%s========== %s ==========%s\n' "$C_DIM" "$*" "$C_RESET"; }

trap 'die "脚本在第 ${LINENO} 行中断，请查看上方日志"' ERR

[[ "${EUID}" -eq 0 ]] || die "请使用 root 执行（su - 或 sudo -i）"
[[ -f /etc/os-release ]] || die "无法识别操作系统，本脚本仅支持 Ubuntu / Debian"
[[ -f "$APP_DIR/package.json" ]] || die "未在 $APP_DIR 找到项目，请先解压代码或设置 APP_DIR"

# sudo 环境变量（sudo 会清洗环境，这里直接 export 更稳妥）
export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------- 1. APT
step "1/8 准备 APT 源"

if [[ -n "$APT_MIRROR" ]]; then
  info "切换 APT 镜像：$APT_MIRROR"
  sed -i "s#http://[a-zA-Z0-9.-]*archive\.ubuntu\.com/ubuntu#${APT_MIRROR%/}#g" \
    /etc/apt/sources.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true
fi
# 部分云环境 IPv6 不可达，强制 IPv4 避免 apt 卡住
printf 'Acquire::ForceIPv4 "true";\n' >/etc/apt/apt.conf.d/99force-ipv4
ok "APT 已配置（ForceIPv4）"

# ---------------------------------------------------------------- 2. Node.js
step "2/8 检查 Node.js"

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi

if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && (( NODE_MAJOR >= 20 )) && command -v npm >/dev/null 2>&1; then
  ok "Node.js $(node -v) / npm $(npm -v) 已满足要求"
else
  info "安装 Node.js ${NODE_VERSION}"
  TGZ="$NODE_TARBALL"
  if [[ -z "$TGZ" ]]; then
    TGZ="$(ls /root/node-v${NODE_VERSION%%%.*}*-linux-x64.tar.gz /root/node-v22*-linux-x64.tar.gz 2>/dev/null | head -1 || true)"
  fi
  if [[ -z "$TGZ" ]]; then
    TGZ="/tmp/node-v${NODE_VERSION}-linux-x64.tar.gz"
    info "下载 $TGZ （网络受限时可本地上传后通过 NODE_TARBALL 指定）"
    curl -fL --connect-timeout 20 -o "$TGZ" \
      "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz" \
      || die "Node.js 下载失败：请本地上传 node-v*-linux-x64.tar.gz 到服务器后重试"
  fi
  mkdir -p /usr/local/lib/nodejs
  tar -xzf "$TGZ" -C /usr/local/lib/nodejs
  NODE_DIR="$(ls -d /usr/local/lib/nodejs/node-v*-linux-x64 | head -1)"
  for b in node npm npx corepack; do
    [[ -e "$NODE_DIR/bin/$b" ]] && ln -sf "$NODE_DIR/bin/$b" "/usr/local/bin/$b"
  done
  hash -r
  command -v node >/dev/null 2>&1 || die "Node.js 安装失败"
  ok "Node.js $(node -v) / npm $(npm -v) 安装完成"
fi

# ---------------------------------------------------------------- 3. PostgreSQL
step "3/8 准备 PostgreSQL"

if ! command -v psql >/dev/null 2>&1; then
  info "安装 PostgreSQL ${PG_VERSION}"
  apt-get update -y
  # 容器中 postinst 的 pg_createcluster 可能因 chown 失败而返回非 0，这里只要求包已可用
  apt-get install -y "postgresql-${PG_VERSION}" postgresql-client-common postgresql-contrib \
    || warn "apt 安装返回非 0，继续检查二进制是否可用"
  command -v psql >/dev/null 2>&1 || die "PostgreSQL 安装失败"
fi
ok "$(psql --version)"

install -d -o postgres -g postgres -m 2775 "$PG_SOCKET_DIR"

# 数据目录：proot / 受限容器中 pg_createcluster 会失败，因此直接用 initdb
if [[ -s "$PGDATA/PG_VERSION" ]] && ! su -s /bin/sh postgres -c "$PGBIN/pg_controldata '$PGDATA' >/dev/null 2>&1"; then
  warn "检测到不完整或损坏的数据目录，重新初始化（原数据不可用）"
  rm -rf "$PGDATA"
fi

if [[ ! -s "$PGDATA/PG_VERSION" ]]; then
  info "初始化数据目录 $PGDATA"
  rm -rf "$PGDATA"
  install -d -o postgres -g postgres -m 700 "$PGDATA"
  su -s /bin/sh postgres -c \
    "$PGBIN/initdb -D '$PGDATA' -U postgres --auth-local=trust --auth-host=scram-sha-256 --encoding=UTF8 --locale=C.UTF-8" \
    >/dev/null
  ok "initdb 完成"
else
  ok "复用已有数据目录 $PGDATA"
fi

CONF="$PGDATA/postgresql.conf"
sed -i -E "s/^#?[[:space:]]*port[[:space:]]*=.*/port = ${DB_PORT}/" "$CONF"
sed -i -E "s/^#?[[:space:]]*listen_addresses[[:space:]]*=.*/listen_addresses = '*'/" "$CONF"
grep -qE '^[[:space:]]*port[[:space:]]*=[[:space:]]*'"$DB_PORT"'$' "$CONF" || echo "port = ${DB_PORT}" >>"$CONF"
grep -qE '^[[:space:]]*listen_addresses' "$CONF" || echo "listen_addresses = '*'" >>"$CONF"

HBA="$PGDATA/pg_hba.conf"
grep -q '^host all all 0.0.0.0/0' "$HBA" || echo 'host all all 0.0.0.0/0 scram-sha-256' >>"$HBA"
grep -q '^host all all ::/0' "$HBA" || echo 'host all all ::/0 scram-sha-256' >>"$HBA"
ok "端口 ${DB_PORT} / listen_addresses='*' / scram-sha-256 已配置"

# ---------------------------------------------------------------- 4. 启动数据库与建库
step "4/8 启动 PostgreSQL 并初始化数据库"

if ! pg_isready -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1; then
  su -s /bin/sh postgres -c "$PGBIN/pg_ctl -D '$PGDATA' -l '$PGDATA/server.log' start" >/dev/null
  for _ in $(seq 1 30); do
    pg_isready -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1 && break
    sleep 1
  done
fi
pg_isready -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1 \
  || die "PostgreSQL 未就绪，请查看 $PGDATA/server.log"
ok "PostgreSQL 运行中（127.0.0.1:${DB_PORT}）"

pg_admin() {
  if command -v runuser >/dev/null 2>&1; then
    runuser -u postgres -- "$@"
  else
    su -s /bin/sh postgres -c "$(printf '%q ' "$@")"
  fi
}

if [[ -s "$PASSWORD_FILE" ]]; then
  DB_PASSWORD="$(cat "$PASSWORD_FILE")"
  info "复用已有数据库密码（$PASSWORD_FILE）"
else
  DB_PASSWORD="$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  printf '%s\n' "$DB_PASSWORD" >"$PASSWORD_FILE"
  chmod 600 "$PASSWORD_FILE"
  ok "已生成数据库密码并保存到 $PASSWORD_FILE"
fi

ROLE_EXISTS="$(pg_admin psql -h "$PG_SOCKET_DIR" -p "$DB_PORT" -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'" 2>/dev/null || true)"
if [[ "$ROLE_EXISTS" != "1" ]]; then
  pg_admin psql -h "$PG_SOCKET_DIR" -p "$DB_PORT" -v ON_ERROR_STOP=1 \
    -c "CREATE ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
  ok "已创建角色 ${DB_USER}"
else
  pg_admin psql -h "$PG_SOCKET_DIR" -p "$DB_PORT" -v ON_ERROR_STOP=1 \
    -c "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
  ok "已同步角色 ${DB_USER} 密码"
fi

DB_EXISTS="$(pg_admin psql -h "$PG_SOCKET_DIR" -p "$DB_PORT" -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" 2>/dev/null || true)"
if [[ "$DB_EXISTS" != "1" ]]; then
  pg_admin createdb -h "$PG_SOCKET_DIR" -p "$DB_PORT" -O "$DB_USER" "$DB_NAME"
  ok "已创建数据库 ${DB_NAME}"
else
  ok "复用已有数据库 ${DB_NAME}"
fi
pg_admin psql -h "$PG_SOCKET_DIR" -p "$DB_PORT" -d "$DB_NAME" \
  -c "GRANT ALL ON SCHEMA public TO \"${DB_USER}\";" >/dev/null 2>&1 || true

# ---------------------------------------------------------------- 5. .env
step "5/8 写入 .env"

umask 077
cat >"$APP_DIR/.env" <<EOF
# 由 scripts/server-bootstrap.sh 生成，请勿提交到仓库
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
EOF
chmod 600 "$APP_DIR/.env"
ok "$APP_DIR/.env 已写入（600）"

# ---------------------------------------------------------------- 6. 依赖与构建
step "6/8 安装依赖并构建"

cd "$APP_DIR"
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
npx prisma generate
ok "依赖安装完成"

npx prisma migrate deploy
ok "数据库迁移完成"

if [[ "$SKIP_SEED" != "1" ]]; then
  if npx prisma db seed; then
    ok "示例数据写入完成"
  else
    warn "示例数据写入失败，可稍后执行 npm run db:seed 重试"
  fi
fi

# 容器 cgroup pids 限额较低时，next build 会按 CPU 数拉起大量 worker（32 核 → 31 个），
# 线程数超限后 fork 失败并报 `spawn ... EAGAIN`；限制 worker 数量即可规避。
if [[ -z "$BUILD_CPUS" ]]; then
  PIDS_MAX="$(cat /sys/fs/cgroup/pids.max 2>/dev/null || echo max)"
  if [[ "$PIDS_MAX" =~ ^[0-9]+$ ]] && (( PIDS_MAX < 1024 )); then
    BUILD_CPUS=2
    info "检测到 cgroup pids 限制 ${PIDS_MAX}，构建 worker 限制为 ${BUILD_CPUS}"
  fi
fi

if [[ -n "$BUILD_CPUS" ]]; then
  NEXT_BUILD_CPUS="$BUILD_CPUS" npm run build
else
  npm run build
fi
ok "生产构建完成"

# ---------------------------------------------------------------- 7. 启停脚本
step "7/8 安装启停脚本"

install -d "$APP_DIR/bin"
cp "$APP_DIR/scripts/server/start.sh" "$APP_DIR/bin/start.sh"
cp "$APP_DIR/scripts/server/stop.sh" "$APP_DIR/bin/stop.sh"
chmod +x "$APP_DIR/bin/start.sh" "$APP_DIR/bin/stop.sh"
ok "$APP_DIR/bin/start.sh | stop.sh 已就绪"

# ---------------------------------------------------------------- 8. 启动与自检
step "8/8 启动服务并自检"

bash "$APP_DIR/bin/start.sh"

HEALTH_CODE=""
for _ in $(seq 1 30); do
  HEALTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/health" || true)"
  [[ "$HEALTH_CODE" == "200" ]] && break
  sleep 2
done

if [[ "$HEALTH_CODE" == "200" ]]; then
  ok "健康检查通过：$(curl -s "http://127.0.0.1:${APP_PORT}/api/health")"
else
  die "健康检查失败（HTTP ${HEALTH_CODE:-无响应}），请查看 $APP_DIR/app.log"
fi

printf '\n'
ok "TaskFlow 部署完成"
printf '  应用地址:   %shttp://<服务器IP>:%s%s\n' "$C_INFO" "$APP_PORT" "$C_RESET"
printf '  健康检查:   http://<服务器IP>:%s/api/health\n' "$APP_PORT"
printf '  数据库:     %s:%s  库/用户 %s\n' "$DB_HOST" "$DB_PORT" "$DB_NAME"
printf '  数据库密码: 见 %s（600 权限，勿外传）\n' "$PASSWORD_FILE"
printf '  启停命令:   bash %s/bin/start.sh | bash %s/bin/stop.sh\n\n' "$APP_DIR" "$APP_DIR"
