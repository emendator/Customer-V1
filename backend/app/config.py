import os
from dotenv import load_dotenv

load_dotenv()

# 服务配置
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8002"))
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# ===== 项目根目录 =====
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

# ===== 数据目录（默认在项目根目录 data/ 下，可通过环境变量 DATA_DIR 覆盖）=====
# 说明：data/ 及其下所有文件均为程序运行时自动生成（不含任何个人私有数据）。
# 删除 data/ 后重启系统，只会自动重建干净的系统骨架（admin 账号、默认分类、示例话术）。
DATA_DIR = os.getenv("DATA_DIR") or os.path.join(_PROJECT_ROOT, "data")
os.makedirs(DATA_DIR, exist_ok=True)

# 数据库
_db_path = os.path.join(DATA_DIR, "smart_cs.db")
_default_db_url = f"sqlite:///{_db_path}"
DATABASE_URL = os.getenv("DATABASE_URL") or _default_db_url

# ===== 超级管理员账号（永久固定，每次重建都使用该信息，不可修改） =====
SUPER_ADMIN_USERNAME = "admin"
SUPER_ADMIN_PASSWORD = "123456"
SUPER_ADMIN_COMPANY = "我的公司"
SUPER_ADMIN_EMAIL = "admin@my.com"
# 超级管理员公司数据库密码（初始值；仅在 admin 未设置公司数据库密码时写入，
# admin 后续可在「用户管理 → 公司数据库密码」中自行修改）
SUPER_ADMIN_COMPANY_PASSWORD = os.getenv("SUPER_ADMIN_COMPANY_PASSWORD", "123abc")

# SQLite 连接池配置（防止并发写入锁死）
SQLITE_TIMEOUT = int(os.getenv("SQLITE_TIMEOUT", "30"))

# 大模型配置（API Key 不在此配置，统一从数据库按账号读取，见 users.api_key_encrypted）
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")

# ===== 输入 / 输出缓存（统一放在 data/ 下，均为自动生成，删除后重启即自动重建）=====
# 输入缓存：用户上传的 Excel 等原始文件
INPUT_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(INPUT_DIR, exist_ok=True)
# 兼容旧引用（upload.py / excel_service.py 使用 UPLOAD_DIR）
UPLOAD_DIR = INPUT_DIR

# 输出缓存：导出的 Excel、生成的导入模板等文件
OUTPUT_DIR = os.path.join(DATA_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB

# ===== JWT 认证配置 =====
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24小时

# ===== 加密密钥 SECRET_KEY 管理 =====
# 优先级：环境变量 SECRET_KEY > data/secret.key 密钥文件 > 自动生成强随机密钥并持久化
# data/ 已被 .gitignore 忽略，密钥文件不会进入版本库；
# 即使数据库泄露，攻击者没有密钥文件也无法解密其中的 API Key。
# 注意：更换 SECRET_KEY 后，历史加密的 API Key 将无法解密，需在各账号重新配置。
SECRET_KEY_FILE = os.path.join(DATA_DIR, "secret.key")


def _load_or_create_secret_key() -> str:
    """按优先级加载 SECRET_KEY：环境变量 -> 密钥文件 -> 自动生成并保存"""
    env_key = os.getenv("SECRET_KEY")
    if env_key:
        return env_key

    if os.path.exists(SECRET_KEY_FILE):
        try:
            with open(SECRET_KEY_FILE, "r", encoding="utf-8") as f:
                file_key = f.read().strip()
            if file_key:
                return file_key
        except OSError:
            pass

    # 首次运行：生成强随机密钥并持久化到 data/secret.key
    import secrets
    generated = secrets.token_urlsafe(48)
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(SECRET_KEY_FILE, "w", encoding="utf-8") as f:
            f.write(generated)
        try:
            os.chmod(SECRET_KEY_FILE, 0o600)  # POSIX 下限制为仅属主可读写
        except OSError:
            pass
        print(f"🔐 已生成加密密钥文件: {SECRET_KEY_FILE}（请妥善保管，勿删除）")
    except OSError as e:
        print(f"⚠️ 写入密钥文件失败: {e}，将使用进程内随机密钥（重启后失效）")
    return generated


SECRET_KEY = _load_or_create_secret_key()

# 匹配配置
MAX_MATCH_RESULTS = 6
MIN_MATCH_SCORE = 0.1
