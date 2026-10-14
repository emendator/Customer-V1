#!/usr/bin/env bash
# ============================================================
# 智能客服话术库系统 - Ubuntu 云服务器一键部署脚本
#
# 前提：
#   1. 项目已通过 git clone 到 /opt/smart-cs-assist（含 backend/ frontend/ deploy/）
#   2. 系统为 Ubuntu 20.04 / 22.04 / 24.04
#
# 用法：
#   cd /opt/smart-cs-assist
#   sudo bash deploy/deploy.sh            # 默认 80 端口（需备案/海外节点）
#   sudo bash deploy/deploy.sh 8081       # 内地未备案或端口冲突时，指定端口
#
# 会执行：
#   ① 系统依赖  ② Node.js  ③ 后端依赖+初始化  ④ 前端构建
#   ⑤ systemd 服务  ⑥ Nginx  ⑦ 防火墙
# ============================================================
set -euo pipefail

# 访问端口：默认 80；可通过参数指定（避免与同机其他服务冲突）
PORT="${1:-80}"
case "$PORT" in
    ''|*[!0-9]*) echo "[ERROR] 端口必须是数字，例如: sudo bash deploy/deploy.sh 8081"; exit 1;;
esac

APP_DIR="/opt/smart-cs-assist"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
DEPLOY_DIR="$APP_DIR/deploy"
SERVICE_NAME="smart-cs-assist"
BACKEND_PORT=8002   # 后端内部端口（仅 Nginx 反代访问）

echo "============================================================"
echo "  智能客服话术库系统 - 云服务器一键部署"
echo "============================================================"

if [ ! -d "$BACKEND_DIR" ]; then
    echo "[ERROR] 找不到 $BACKEND_DIR"
    echo "        请先 git clone 项目到 $APP_DIR 后再运行本脚本"
    exit 1
fi

# ---------- 1. 系统依赖 ----------
echo ""
echo "[1/7] 更新系统并安装基础依赖..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx python3 python3-venv python3-pip curl

# ---------- 2. Node.js ----------
echo ""
echo "[2/7] 安装 Node.js 20 LTS..."
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "  Node.js: $(node --version)"
# 国内服务器加速 npm 下载
npm config set registry https://registry.npmmirror.com 2>/dev/null || true

# ---------- 3. 后端依赖 + 数据库初始化 ----------
echo ""
echo "[3/7] 创建 Python 虚拟环境并安装依赖..."
cd "$BACKEND_DIR"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
# 国内服务器加速 pip 下载
.venv/bin/pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple 2>/dev/null || true
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q

echo "[3.5/7] 初始化数据库（创建 admin、默认分类、示例话术）..."
# 首次部署时若 .env 不存在，则基于 .env.example 生成（不含密钥）
if [ ! -f "$BACKEND_DIR/.env" ]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    echo "  已生成 backend/.env（可后续修改 LLM 配置）"
fi
# 必填项校验：源码中不保留任何默认口令，缺失时直接中止部署
if ! grep -qE "^SUPER_ADMIN_PASSWORD=.+" "$BACKEND_DIR/.env" || ! grep -qE "^SUPER_ADMIN_COMPANY_PASSWORD=.+" "$BACKEND_DIR/.env"; then
    echo "[ERROR] 请在 $BACKEND_DIR/.env 中填写以下必填项后重新运行本脚本："
    echo "        SUPER_ADMIN_PASSWORD=<内置超级管理员的登录口令>"
    echo "        SUPER_ADMIN_COMPANY_PASSWORD=<该公司数据库密码>"
    exit 1
fi
.venv/bin/python init_db.py || echo "  ⚠️ 数据库初始化出现异常，请检查上方日志"

# ---------- 4. 前端构建 ----------
echo ""
echo "[4/7] 构建前端页面..."
cd "$FRONTEND_DIR"
npm install --no-audit --no-fund
npm run build

# ---------- 5. systemd 后端服务 ----------
echo ""
echo "[5/7] 配置后端 systemd 服务..."
cp "$DEPLOY_DIR/smart-cs-assist.service" "/etc/systemd/system/$SERVICE_NAME.service"
chown -R www-data:www-data "$APP_DIR"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# ---------- 6. Nginx ----------
echo ""
echo "[6/7] 配置 Nginx..."
cp "$DEPLOY_DIR/nginx.conf" "/etc/nginx/sites-available/$SERVICE_NAME"
# 按指定端口替换监听端口（默认 80）
sed -i "s/listen 80;/listen $PORT;/" "/etc/nginx/sites-available/$SERVICE_NAME"
ln -sf "/etc/nginx/sites-available/$SERVICE_NAME" "/etc/nginx/sites-enabled/$SERVICE_NAME"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

# ---------- 7. 防火墙 ----------
echo ""
echo "[7/7] 配置防火墙..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow OpenSSH
    ufw allow "$PORT/tcp"
    ufw --force enable
fi

# 获取公网 IP（用于最后提示）
IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || curl -s --max-time 5 ip.sb 2>/dev/null || echo "你的服务器公网IP")
if [ "$PORT" = "80" ]; then
    ACCESS_URL="http://$IP"
else
    ACCESS_URL="http://$IP:$PORT"
fi

echo ""
echo "============================================================"
echo "  ✅ 部署完成！"
echo "------------------------------------------------------------"
echo "  访问地址:      $ACCESS_URL"
echo "  登录账号:      admin"
echo "  初始口令:      取自 backend/.env 的 SUPER_ADMIN_PASSWORD（部署前必须先设置）"
echo "  公司名:        我的公司"
echo "  公司数据库密码: 取自 backend/.env 的 SUPER_ADMIN_COMPANY_PASSWORD（登录后可在「用户管理」中修改）"
echo ""
echo "  常用命令:"
echo "    查看后端日志:  journalctl -u $SERVICE_NAME -f"
echo "    重启后端:      systemctl restart $SERVICE_NAME"
echo "    重载 Nginx:    nginx -t && systemctl reload nginx"
echo "============================================================"
