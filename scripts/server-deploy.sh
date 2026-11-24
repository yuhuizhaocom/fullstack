#!/usr/bin/env bash
#
# 服务器端更新脚本
# 由 GitHub Actions 在上传新代码后调用（也可手动执行）。
# 流程：安装依赖 → 数据库迁移 → 生产构建 → 重启应用 → 健康检查
#
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/taskflow}"
APP_PORT="${APP_PORT:-25045}"
export NEXT_BUILD_CPUS="${NEXT_BUILD_CPUS:-2}"

cd "$APP_DIR"

echo "[deploy] 安装依赖（npm ci）"
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

echo "[deploy] 应用数据库迁移（prisma migrate deploy）"
npx prisma migrate deploy

echo "[deploy] 确保超级管理员账号存在"
node scripts/ensure-admin.mjs

echo "[deploy] 生产构建（worker=${NEXT_BUILD_CPUS}）"
npm run build

echo "[deploy] 同步启停脚本并重启应用"
install -d "$APP_DIR/bin"
cp "$APP_DIR/scripts/server/start.sh" "$APP_DIR/bin/start.sh"
cp "$APP_DIR/scripts/server/stop.sh" "$APP_DIR/bin/stop.sh"
chmod +x "$APP_DIR/bin/start.sh" "$APP_DIR/bin/stop.sh"
bash "$APP_DIR/bin/stop.sh"
bash "$APP_DIR/bin/start.sh"

echo "[deploy] 健康检查"
CODE=""
for _ in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/health" || true)"
  [[ "$CODE" == "200" ]] && break
  sleep 2
done

if [[ "$CODE" != "200" ]]; then
  echo "[deploy] 健康检查失败（HTTP ${CODE:-无响应}），最近日志："
  tail -30 "$APP_DIR/app.log" 2>/dev/null || true
  exit 1
fi

echo "[deploy] 部署完成：$(curl -s "http://127.0.0.1:${APP_PORT}/api/health")"
