#!/usr/bin/env bash
# ============================================================
# 智能客服话术库系统 - 服务器更新脚本
#
# 前提：新代码已 git pull 到 /opt/smart-cs-assist
# 用法：cd /opt/smart-cs-assist && git pull && sudo bash deploy/update.sh
# 效果：修复权限 → 更新后端依赖/初始化 → 重新构建前端 → 重启后端
# ============================================================
set -euo pipefail

APP_DIR="/opt/smart-cs-assist"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
SERVICE_NAME="smart-cs-assist"

echo "============================================================"
echo "  智能客服话术库系统 - 更新服务"
echo "============================================================"

# 0. 修复权限（新拉取的代码属主可能是 root，data/ 需 www-data 可写）
echo "[0/4] 修复目录权限..."
chown -R www-data:www-data "$APP_DIR"

# 1. 更新后端依赖并初始化
echo "[1/4] 更新后端依赖并初始化数据库..."
if [ -d "$BACKEND_DIR/.venv" ]; then
    cd "$BACKEND_DIR"
    .venv/bin/pip install -r requirements.txt -q
    .venv/bin/python init_db.py || echo "  ⚠️ 数据库初始化出现异常，请检查上方日志"
fi

# 2. 重新构建前端
echo "[2/4] 重新构建前端..."
if [ -d "$FRONTEND_DIR" ]; then
    cd "$FRONTEND_DIR"
    npm install --no-audit --no-fund
    npm run build
else
    echo "  [2/4] 未找到前端目录，跳过前端构建"
fi

# 3. 重启后端服务
echo "[3/4] 重启后端服务..."
systemctl restart "$SERVICE_NAME"

# 4. 校验状态
echo "[4/4] 检查服务状态..."
systemctl --no-pager status "$SERVICE_NAME" --lines=3 || true

echo ""
echo "============================================================"
echo "  ✅ 更新完成！刷新浏览器即可（建议 Ctrl+F5 强刷）"
echo "============================================================"
