#!/usr/bin/env bash
#
# TaskFlow 生产环境停止脚本（只停应用，不停 PostgreSQL）
# 部署时由 scripts/server-bootstrap.sh 复制到 /opt/taskflow/bin/stop.sh
#
# 说明：npm run start 会再派生子进程（next-server），仅 kill app.pid 里的 npm 进程
# 会留下孤儿占用端口，因此这里同时按进程名兜底清理并等待端口释放。
#
set -uo pipefail

BASE="${APP_DIR:-/opt/taskflow}"
APP_PORT="${APP_PORT:-25045}"

port_in_use() {
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${APP_PORT}$"
}

stop_pid() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 0
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 15); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 1
  done
  kill -9 "$pid" 2>/dev/null || true
}

if [ -f "$BASE/app.pid" ]; then
  PID="$(cat "$BASE/app.pid")"
  if kill -0 "$PID" 2>/dev/null; then
    stop_pid "$PID"
    echo "已停止应用（pid $PID）"
  else
    echo "app.pid 中的进程 $PID 已不存在，继续清理残留进程"
  fi
  rm -f "$BASE/app.pid"
fi

# 兜底：清理 npm start 派生的 next-server 残留
if pkill -f 'next-server' 2>/dev/null; then
  echo "已清理残留 next-server 进程"
fi
pkill -f 'next start' 2>/dev/null || true

for _ in $(seq 1 10); do
  port_in_use || break
  sleep 1
done

if port_in_use; then
  echo "警告：端口 ${APP_PORT} 仍被占用，请手动检查：ss -ltnp | grep ${APP_PORT}"
  exit 1
fi
echo "应用已停止，端口 ${APP_PORT} 已释放"
