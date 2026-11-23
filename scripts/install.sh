#!/usr/bin/env bash
#
# TaskFlow 一键安装脚本
# 适用于 WSL2（Ubuntu / Debian）以及原生 Ubuntu / Debian 虚拟机
#
# 用法:
#   bash scripts/install.sh                 # 安装依赖 + 初始化数据库 + 启动开发服务器
#   bash scripts/install.sh --prod          # 以生产模式构建并启动
#   bash scripts/install.sh --no-start      # 只安装与初始化，不启动服务
#   bash scripts/install.sh --skip-db       # 跳过本地 PostgreSQL 安装（使用 .env 中已有数据库）
#   bash scripts/install.sh --no-seed       # 跳过示例数据
#   bash scripts/install.sh --port 4000     # 指定端口
#
# 可通过环境变量覆盖: APP_PORT DB_NAME DB_USER DB_PASSWORD DB_HOST DB_PORT
#
set -Eeuo pipefail

APP_NAME="TaskFlow"
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

APP_PORT="${APP_PORT:-3000}"
DB_NAME="${DB_NAME:-taskflow}"
DB_USER="${DB_USER:-taskflow}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
START_MODE="dev"
START_SERVER=1
INSTALL_DB=1
SEED_DB=1
WRITE_ENV=0

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_INFO=$'\033[36m'
  C_OK=$'\033[32m'
  C_WARN=$'\033[33m'
  C_ERR=$'\033[31m'
  C_DIM=$'\033[2m'
else
  C_RESET=""
  C_INFO=""
  C_OK=""
  C_WARN=""
  C_ERR=""
  C_DIM=""
fi

info() { printf '%s[信息]%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
ok() { printf '%s[完成]%s %s\n' "$C_OK" "$C_RESET" "$*"; }
warn() { printf '%s[警告]%s %s\n' "$C_WARN" "$C_RESET" "$*"; }
fail() { printf '%s[错误]%s %s\n' "$C_ERR" "$C_RESET" "$*" >&2; }
die() { fail "$*"; exit 1; }

on_error() {
  fail "安装在第 ${1} 行中断，请查看上方日志后重试。"
  exit 1
}
trap 'on_error "$LINENO"' ERR

usage() {
  cat <<'EOF'
TaskFlow 一键安装脚本（WSL2 / Ubuntu / Debian）

用法:
  bash scripts/install.sh [选项]

选项:
  --port <端口>   指定应用端口（默认 3000）
  --prod          生产模式：执行构建并使用 next start 启动
  --no-start      只完成安装与数据库初始化，不启动服务
  --skip-db       跳过本地 PostgreSQL 安装，使用 .env 中已有的 DATABASE_URL
  --no-seed       跳过示例数据写入
  -h, --help      显示帮助

环境变量:
  APP_PORT DB_NAME DB_USER DB_PASSWORD DB_HOST DB_PORT

示例:
  bash scripts/install.sh
  bash scripts/install.sh --prod --port 8080
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      [[ $# -ge 2 ]] || die "--port 需要一个端口号"
      APP_PORT="$2"
      shift 2
      ;;
    --prod)
      START_MODE="prod"
      shift
      ;;
    --no-start)
      START_SERVER=0
      shift
      ;;
    --skip-db)
      INSTALL_DB=0
      shift
      ;;
    --no-seed)
      SEED_DB=0
      shift
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      die "未知参数: $1（使用 --help 查看用法）"
      ;;
  esac
done

[[ "$APP_PORT" =~ ^[0-9]+$ ]] || die "端口必须是数字: $APP_PORT"
((APP_PORT > 0 && APP_PORT < 65536)) || die "端口超出范围: $APP_PORT"

if [[ ! -f /etc/os-release ]]; then
  die "无法识别操作系统，请在 Ubuntu / Debian（含 WSL2）中运行本脚本"
fi
# shellcheck disable=SC1091
. /etc/os-release
OS_ID="${ID:-unknown}"
OS_LIKE="${ID_LIKE:-}"
APT_SUPPORTED=0
if [[ "$OS_ID" == "ubuntu" || "$OS_ID" == "debian" || "$OS_LIKE" == *debian* || "$OS_LIKE" == *ubuntu* ]]; then
  APT_SUPPORTED=1
fi

IS_WSL=0
if grep -qi microsoft /proc/version 2>/dev/null; then
  IS_WSL=1
fi

if [[ "$PROJECT_ROOT" == /mnt/* ]]; then
  warn "项目位于 Windows 挂载盘（/mnt/...），npm 安装与热更新会明显变慢，建议复制到 Linux 家目录（如 ~/taskflow）后运行"
fi

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  die "需要 root 权限或 sudo，请使用具备 sudo 权限的用户重新运行"
fi

run_as_root() {
  if [[ -n "$SUDO" ]]; then
    sudo "$@"
  else
    "$@"
  fi
}

run_as_root_env() {
  if [[ -n "$SUDO" ]]; then
    sudo -E "$@"
  else
    "$@"
  fi
}

apt_update() {
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get update -y
}

apt_install() {
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

step() {
  printf '\n%s========== %s ==========%s\n' "$C_DIM" "$*" "$C_RESET"
}

# ---------------------------------------------------------------- Node.js
step "1/6 检查 Node.js"

NODE_MIN_MAJOR=20
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi

if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && ((NODE_MAJOR >= NODE_MIN_MAJOR)) && command -v npm >/dev/null 2>&1; then
  ok "Node.js $(node -v) / npm $(npm -v) 已满足要求"
else
  info "未检测到 Node.js ${NODE_MIN_MAJOR}+，开始安装 Node.js 22 LTS..."
  [[ "$APT_SUPPORTED" -eq 1 ]] || die "请先安装 Node.js ${NODE_MIN_MAJOR}+ 与 npm 后重试"
  apt_update
  apt_install curl ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  run_as_root bash /tmp/nodesource_setup.sh
  apt_install nodejs
  command -v node >/dev/null 2>&1 || die "Node.js 安装失败"
  command -v npm >/dev/null 2>&1 || die "npm 未安装，请检查 Node.js 安装"
  ok "Node.js $(node -v) / npm $(npm -v) 安装完成"
fi

# ---------------------------------------------------------------- .env
step "2/6 配置环境变量"

ENV_FILE="$PROJECT_ROOT/.env"
FRESH_ENV=0

if [[ ! -f "$ENV_FILE" ]]; then
  [[ -f .env.example ]] || die ".env.example 不存在，无法生成 .env"
  cp .env.example .env
  FRESH_ENV=1
  info "已根据 .env.example 创建 .env"
else
  info "检测到已有 .env，将复用其中的数据库配置"
fi

PARSED_ENV=""
if [[ "$FRESH_ENV" -eq 0 ]]; then
  PARSED_ENV="$(node -e '
const fs = require("fs");
const file = process.argv[1];
let content = "";
try {
  content = fs.readFileSync(file, "utf8");
} catch (error) {
  process.exit(0);
}
const line = content
  .split(/\r?\n/)
  .find((item) => item.trim().startsWith("DATABASE_URL="));
if (!line) process.exit(0);
let value = line.slice(line.indexOf("=") + 1).trim();
if (
  (value.startsWith("\"") && value.endsWith("\"")) ||
  (value.startsWith("\x27") && value.endsWith("\x27"))
) {
  value = value.slice(1, -1);
}
try {
  const url = new URL(value);
  const fields = [
    decodeURIComponent(url.username || ""),
    decodeURIComponent(url.password || ""),
    url.hostname || "127.0.0.1",
    url.port || "5432",
    decodeURIComponent(url.pathname.replace(/^\//, "")) || "taskflow",
  ];
  process.stdout.write(fields.join("\t"));
} catch (error) {
  process.exit(0);
}
' "$ENV_FILE" 2>/dev/null || true)"
fi

if [[ -n "$PARSED_ENV" ]]; then
  ENV_DB_USER=""
  ENV_DB_PASS=""
  ENV_DB_HOST=""
  ENV_DB_PORT=""
  ENV_DB_NAME=""
  IFS=$'\t' read -r ENV_DB_USER ENV_DB_PASS ENV_DB_HOST ENV_DB_PORT ENV_DB_NAME <<< "$PARSED_ENV" || true
  [[ -n "${ENV_DB_USER:-}" ]] && DB_USER="$ENV_DB_USER"
  [[ -n "${ENV_DB_PASS:-}" ]] && DB_PASSWORD="$ENV_DB_PASS"
  [[ -n "${ENV_DB_HOST:-}" ]] && DB_HOST="$ENV_DB_HOST"
  [[ -n "${ENV_DB_PORT:-}" ]] && DB_PORT="$ENV_DB_PORT"
  [[ -n "${ENV_DB_NAME:-}" ]] && DB_NAME="$ENV_DB_NAME"
fi

[[ "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "DB_USER 只支持字母、数字和下划线: $DB_USER"
[[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "DB_NAME 只支持字母、数字和下划线: $DB_NAME"

if [[ -z "$DB_PASSWORD" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    DB_PASSWORD="$(openssl rand -hex 16)"
  else
    DB_PASSWORD="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
fi

IS_LOCAL_DB=1
case "$DB_HOST" in
  localhost | 127.0.0.1 | ::1) IS_LOCAL_DB=1 ;;
  *) IS_LOCAL_DB=0 ;;
esac

if [[ "$IS_LOCAL_DB" -eq 0 && "$INSTALL_DB" -eq 1 ]]; then
  warn "DATABASE_URL 指向非本地数据库（$DB_HOST），已跳过本地 PostgreSQL 安装"
  INSTALL_DB=0
fi

write_env_file() {
  DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" \
    node -e '
const fs = require("fs");
const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
const url =
  "postgresql://" +
  encodeURIComponent(DB_USER) +
  ":" +
  encodeURIComponent(DB_PASSWORD) +
  "@" +
  DB_HOST +
  ":" +
  DB_PORT +
  "/" +
  encodeURIComponent(DB_NAME) +
  "?schema=public";
const line = "DATABASE_URL=\"" + url + "\"";
let content = fs.readFileSync(".env", "utf8");
if (/^DATABASE_URL=.*$/m.test(content)) {
  content = content.replace(/^DATABASE_URL=.*$/m, line);
} else {
  content = content.replace(/\s*$/, "") + "\n" + line + "\n";
}
fs.writeFileSync(".env", content);
'
}

# ---------------------------------------------------------------- PostgreSQL
step "3/6 准备 PostgreSQL"

if [[ "$INSTALL_DB" -eq 0 ]]; then
  warn "已跳过本地 PostgreSQL 安装，请确保 DATABASE_URL 可正常连接"
else
  [[ "$APT_SUPPORTED" -eq 1 ]] || die "当前系统不支持自动安装 PostgreSQL，请手动安装后使用 --skip-db"

  if ! command -v psql >/dev/null 2>&1; then
    info "安装 PostgreSQL..."
    apt_update
    apt_install postgresql postgresql-contrib
    ok "PostgreSQL 安装完成"
  else
    ok "PostgreSQL 已安装（$(psql --version)）"
  fi

  if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
    info "启动 PostgreSQL 服务..."
    if command -v systemctl >/dev/null 2>&1; then
      run_as_root systemctl start postgresql 2>/dev/null || true
    fi
    run_as_root service postgresql start 2>/dev/null || true
    if command -v pg_ctlcluster >/dev/null 2>&1; then
      while read -r cluster_version cluster_name _rest; do
        [[ -n "${cluster_version:-}" ]] || continue
        run_as_root pg_ctlcluster "$cluster_version" "$cluster_name" start 2>/dev/null || true
      done < <(pg_lsclusters -h 2>/dev/null || true)
    fi
    for _attempt in $(seq 1 30); do
      if pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  fi

  pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1 ||
    die "PostgreSQL 未能启动，请手动启动后重试（WSL 可执行：sudo service postgresql start）"
  ok "PostgreSQL 服务运行中（${DB_HOST}:${DB_PORT}）"

  pg_admin() {
    if [[ "${EUID}" -eq 0 ]]; then
      if command -v runuser >/dev/null 2>&1; then
        runuser -u postgres -- "$@"
      else
        su -s /bin/sh postgres -c "$(printf '%q ' "$@")"
      fi
    else
      run_as_root -u postgres "$@"
    fi
  }

  DB_PASSWORD_SQL="${DB_PASSWORD//\'/\'\'}"

  info "创建或复用数据库角色与数据库..."
  ROLE_EXISTS="$(pg_admin psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'" 2>/dev/null || true)"
  if [[ "$ROLE_EXISTS" != "1" ]]; then
    pg_admin psql -v ON_ERROR_STOP=1 -c "CREATE ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$DB_PASSWORD_SQL';" >/dev/null
    ok "已创建数据库角色 $DB_USER"
    WRITE_ENV=1
  elif [[ "$FRESH_ENV" -eq 1 ]]; then
    pg_admin psql -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$DB_PASSWORD_SQL';" >/dev/null
  fi

  DB_EXISTS="$(pg_admin psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null || true)"
  if [[ "$DB_EXISTS" != "1" ]]; then
    pg_admin createdb -O "$DB_USER" "$DB_NAME"
    ok "已创建数据库 $DB_NAME"
  else
    pg_admin psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "ALTER DATABASE \"$DB_NAME\" OWNER TO \"$DB_USER\";" >/dev/null 2>&1 || true
    ok "复用已有数据库 $DB_NAME"
  fi

  pg_admin psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO \"$DB_USER\";" >/dev/null 2>&1 || true

  if [[ "$FRESH_ENV" -eq 1 ]]; then
    WRITE_ENV=1
  fi
fi

if [[ "$WRITE_ENV" -eq 1 ]]; then
  write_env_file
  ok "已写入 .env 中的 DATABASE_URL"
elif [[ "$FRESH_ENV" -eq 1 ]]; then
  warn ".env 沿用示例连接串，请按实际数据库调整后再执行迁移"
else
  info "复用已有 .env 中的 DATABASE_URL"
fi

# ---------------------------------------------------------------- 依赖
step "4/6 安装项目依赖"

if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
ok "项目依赖安装完成"

# ---------------------------------------------------------------- 数据库结构
step "5/6 初始化数据库结构"

npx prisma generate
if ! npx prisma migrate deploy; then
  warn "migrate deploy 失败，改用 prisma db push 同步表结构"
  npx prisma db push --skip-generate
fi

if [[ "$SEED_DB" -eq 1 ]]; then
  if npx prisma db seed; then
    ok "示例数据写入完成"
  else
    warn "示例数据写入失败，可稍后执行 npm run db:seed 重试"
  fi
fi
ok "数据库结构初始化完成"

# ---------------------------------------------------------------- 启动
step "6/6 准备启动"

if [[ "$START_MODE" == "prod" ]]; then
  info "执行生产构建（npm run build）..."
  npm run build
  ok "生产构建完成"
fi

if [[ "$START_SERVER" -eq 0 ]]; then
  ok "安装完成（按 --no-start 要求未启动服务）"
  echo "  开发模式启动: npm run dev -- --hostname 0.0.0.0 --port ${APP_PORT}"
  echo "  生产模式启动: npm run start -- -H 0.0.0.0 -p ${APP_PORT}"
  exit 0
fi

if command -v ss >/dev/null 2>&1; then
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${APP_PORT}$"; then
    die "端口 ${APP_PORT} 已被占用，请使用 --port 指定其他端口"
  fi
fi

printf '\n'
ok "${APP_NAME} 安装完成"
printf '  本机访问:   %shttp://localhost:%s%s\n' "$C_INFO" "$APP_PORT" "$C_RESET"
if [[ "$IS_WSL" -eq 1 ]]; then
  printf '  Windows 浏览器可直接访问上述地址（WSL2 已自动映射 localhost）\n'
fi
printf '  健康检查:   http://localhost:%s/api/health\n' "$APP_PORT"
printf '  停止服务:   Ctrl+C\n\n'

if [[ "$START_MODE" == "prod" ]]; then
  exec npm run start -- -H 0.0.0.0 -p "$APP_PORT"
else
  exec npm run dev -- --hostname 0.0.0.0 --port "$APP_PORT"
fi
