#!/usr/bin/env bash
#
# TaskFlow 生产环境启动脚本
# 适用于没有 systemd 的容器 / 虚拟机（本项目的 sg-sgp13 环境即如此）
# 部署时由 scripts/server-bootstrap.sh 复制到 /opt/taskflow/bin/start.sh
#
# 可用环境变量覆盖：APP_DIR APP_PORT DB_PORT PGDATA PGBIN
#
set -Eeuo pipefail

BASE="${APP_DIR:-/opt/taskflow}"
APP_PORT="${APP_PORT:-25045}"
DB_PORT="${DB_PORT:-25048}"
PGDATA="${PGDATA:-/var/lib/postgresql/16/main}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"

log() { printf '[start] %s\n' "$*"; }
die() { printf '[start][错误] %s\n' "$*" >&2; exit 1; }

# ---------------- PostgreSQL ----------------
if ! pg_isready -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1; then
  log "PostgreSQL 未运行，正在启动（端口 $DB_PORT）"
  su -s /bin/sh postgres -c "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/server.log start" >/dev/null \
    || die "pg_ctl 启动失败，请查看 $PGDATA/server.log"

  for _ in $(seq 1 30); do
    pg_isready -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1 && break
    sleep 1
  done

  pg_isready -h 127.0.0.1 -p "$DB_PORT" >/dev/null 2>&1 \
    || die "PostgreSQL 30 秒内未就绪，请查看 $PGDATA/server.log"
fi
log "PostgreSQL 就绪（127.0.0.1:$DB_PORT）"

# ---------------- 应用 ----------------
if [ -f "$BASE/app.pid" ] && kill -0 "$(cat "$BASE/app.pid")" 2>/dev/null; then
  log "应用已在运行（pid $(cat "$BASE/app.pid")），无需重复启动"
  exit 0
fi
rm -f "$BASE/app.pid"

# 健康检查优先：部分容器里 ss 看不到宿主机 socket，健康检查更可靠
if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
  log "端口 $APP_PORT 已有 TaskFlow 实例在运行（健康检查通过），跳过启动"
  exit 0
fi
if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${APP_PORT}$"; then
  die "端口 $APP_PORT 被其他进程占用，请先执行 stop.sh 或手动释放"
fi

[ -f "$BASE/.next/BUILD_ID" ] || die "未找到构建产物，请先执行 npm run build"

cd "$BASE"

# 保留上一轮日志，便于排查
if [ -f "$BASE/app.log" ]; then
  mv -f "$BASE/app.log" "$BASE/app.log.prev"
fi

nohup npm run start -- -H 0.0.0.0 -p "$APP_PORT" >>"$BASE/app.log" 2>&1 &
echo $! >"$BASE/app.pid"
log "应用已启动（pid $(cat "$BASE/app.pid")），监听 0.0.0.0:$APP_PORT"
log "日志：$BASE/app.log"

# ---------------- Cloudflare Tunnel（可选） ----------------
CF_TOKEN_FILE="${CF_TOKEN_FILE:-/root/.cloudflared/token}"
CF_PID_FILE="$BASE/cloudflared.pid"
CF_LOG="$BASE/cloudflared.log"

if [ -s "$CF_TOKEN_FILE" ] && command -v cloudflared >/dev/null 2>&1; then
  if [ -f "$CF_PID_FILE" ] && kill -0 "$(cat "$CF_PID_FILE")" 2>/dev/null; then
    log "Cloudflare Tunnel 已在运行（pid $(cat "$CF_PID_FILE")）"
  else
    # 用环境变量传 token，避免出现在 ps 的命令行里
    TUNNEL_TOKEN="$(cat "$CF_TOKEN_FILE")" nohup cloudflared tunnel --no-autoupdate run \
      >>"$CF_LOG" 2>&1 &
    echo $! >"$CF_PID_FILE"
    log "Cloudflare Tunnel 已启动（pid $(cat "$CF_PID_FILE")）"
  fi
fi
