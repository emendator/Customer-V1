"""
API Key 加密工具：AES-256-GCM + PBKDF2 密钥派生

加密格式（v2）：
    v2:base64(salt(16字节) + nonce(12字节) + ciphertext)
密钥由 PBKDF2-HMAC-SHA256(SECRET_KEY, salt) 派生，每次加密使用随机 salt，
相同明文每次密文也不同，且无法用彩虹表反推。

兼容性：
    - 新数据统一使用 v2 格式
    - 解密时对无 v2 前缀的历史数据（旧版 AES-GCM，密钥为截断/填充的 SECRET_KEY）
      做向下兼容，确保升级后原有 API Key 仍可解密。
"""
import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from ..config import SECRET_KEY

_PREFIX = "v2:"
# 历史版本固定默认密钥（仅用于解密升级前使用默认密钥加密的旧数据，过渡兼容）
_LEGACY_DEFAULT_KEY = "smart-cs-secret-key-change-in-production"
_ITERATIONS = 200_000
_SALT_LEN = 16
_NONCE_LEN = 12


def _derive_key(secret: str, salt: bytes) -> bytes:
    """PBKDF2-HMAC-SHA256 派生 32 字节 AES 密钥（加盐，防彩虹表）"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=_ITERATIONS,
    )
    return kdf.derive(secret.encode("utf-8"))


def _derive_key_legacy(secret: str) -> bytes:
    """旧版密钥派生（截断/填充），仅用于兼容历史数据"""
    raw = secret.encode("utf-8")
    return raw[:32] if len(raw) >= 32 else raw.ljust(32, b"\0")


def encrypt_api_key(plaintext: str) -> str:
    """
    加密 API Key（AES-256-GCM，PBKDF2 加盐派生密钥）
    返回: v2:base64(salt + nonce + ciphertext)
    """
    if not plaintext:
        return ""
    salt = os.urandom(_SALT_LEN)
    key = _derive_key(SECRET_KEY, salt)
    aesgcm = AESGCM(key)
    nonce = os.urandom(_NONCE_LEN)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return _PREFIX + base64.b64encode(salt + nonce + ciphertext).decode("utf-8")


def _decrypt_v2(payload: str):
    """解密 v2 格式密文，失败返回 None"""
    try:
        data = base64.b64decode(payload)
        salt = data[:_SALT_LEN]
        nonce = data[_SALT_LEN:_SALT_LEN + _NONCE_LEN]
        ciphertext = data[_SALT_LEN + _NONCE_LEN:]
        key = _derive_key(SECRET_KEY, salt)
        return AESGCM(key).decrypt(nonce, ciphertext, None).decode("utf-8")
    except Exception:
        return None


def _decrypt_legacy(payload: str):
    """解密旧版格式密文（无前缀，nonce + ciphertext），失败返回 None"""
    try:
        data = base64.b64decode(payload)
        if len(data) <= _NONCE_LEN:
            return None
        nonce = data[:_NONCE_LEN]
        ciphertext = data[_NONCE_LEN:]
        # 优先用当前 SECRET_KEY 的旧派生；再尝试历史默认密钥（升级前未设置密钥的情况）
        for secret in (SECRET_KEY, _LEGACY_DEFAULT_KEY):
            try:
                key = _derive_key_legacy(secret)
                return AESGCM(key).decrypt(nonce, ciphertext, None).decode("utf-8")
            except Exception:
                continue
        return None
    except Exception:
        return None


def decrypt_api_key(encrypted: str) -> str:
    """
    解密 API Key（自动识别新旧格式）
    输入: v2:base64(...) 或旧版 base64(nonce + ciphertext)
    """
    if not encrypted:
        return ""
    if encrypted.startswith(_PREFIX):
        return _decrypt_v2(encrypted[len(_PREFIX):]) or ""
    return _decrypt_legacy(encrypted) or ""
