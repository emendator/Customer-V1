from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True, comment="用户名")
    password_hash = Column(String(255), nullable=False, comment="密码哈希")
    email = Column(String(100), comment="邮箱")
    role = Column(String(20), nullable=False, default="user", comment="角色：super_admin / admin / user")
    company_name = Column(String(200), comment="公司名称")
    company_password_hash = Column(String(255), nullable=True, comment="公司数据库密码哈希（同公司用户共享同一明文密码，用于公司级数据隔离）")
    invitation_code_id = Column(Integer, ForeignKey("invitation_codes.id"), nullable=True, comment="注册使用的邀请码ID")
    is_active = Column(Boolean, default=True, comment="是否激活")
    expires_at = Column(DateTime, nullable=True, comment="账号过期时间")
    last_login_at = Column(DateTime, nullable=True, comment="最后登录时间")
    api_key_encrypted = Column(String(512), nullable=True, comment="加密后的API Key")
    total_tokens_spent = Column(Integer, default=0, comment="累计消耗Token数")
    created_at = Column(DateTime, default=datetime.now, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', role='{self.role}')>"


class TokenUsageLog(Base):
    """Token消耗记录表"""
    __tablename__ = "token_usage_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="用户ID")
    prompt_tokens = Column(Integer, default=0, comment="Prompt Token数")
    completion_tokens = Column(Integer, default=0, comment="Completion Token数")
    total_tokens = Column(Integer, default=0, comment="总Token数")
    endpoint = Column(String(100), default="chat/completions", comment="API端点")
    model_name = Column(String(100), default="", comment="模型名称")
    created_at = Column(DateTime, default=datetime.now, comment="创建时间")


class InvitationCode(Base):
    """邀请码表"""
    __tablename__ = "invitation_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(64), unique=True, nullable=False, index=True, comment="邀请码")
    level = Column(Integer, nullable=False, comment="等级：1=一级(管理员), 2=二级(用户)")
    company_name = Column(String(200), comment="关联公司名称")
    created_by = Column(Integer, ForeignKey("users.id"), comment="创建者用户ID")
    used_by = Column(Integer, ForeignKey("users.id"), nullable=True, comment="使用者用户ID")
    is_active = Column(Boolean, default=True, comment="是否有效")
    deleted_at = Column(DateTime, nullable=True, comment="删除时间（软删除标记，被删除的邀请码进入回收站）")
    expires_at = Column(DateTime, nullable=False, comment="过期时间")
    used_at = Column(DateTime, nullable=True, comment="使用时间")
    created_at = Column(DateTime, default=datetime.now, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")

    def __repr__(self):
        return f"<InvitationCode(id={self.id}, code='{self.code}', level={self.level})>"


class PendingScript(Base):
    """待审核话术表"""
    __tablename__ = "pending_scripts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    content = Column(Text, nullable=False, comment="话术内容")
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, comment="所属分类ID")
    keywords = Column(String(500), default="", comment="关键词")
    action = Column(String(20), nullable=False, comment="操作类型：create / update")
    target_script_id = Column(Integer, ForeignKey("scripts.id"), nullable=True, comment="编辑时指向原话术ID")
    submitted_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="提交者用户ID")
    company_name = Column(String(200), comment="所属公司")
    status = Column(String(20), default="pending", comment="状态：pending / approved / rejected")
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True, comment="审核人用户ID")
    review_reason = Column(Text, nullable=True, comment="驳回原因")
    created_at = Column(DateTime, default=datetime.now, comment="提交时间")
    reviewed_at = Column(DateTime, nullable=True, comment="审核时间")

    submitted_by_rel = relationship("User", foreign_keys=[submitted_by], lazy="selectin")
    reviewed_by_rel = relationship("User", foreign_keys=[reviewed_by], lazy="selectin")

    def __repr__(self):
        return f"<PendingScript(id={self.id}, action='{self.action}', status='{self.status}')>"


class Category(Base):
    """问题分类表（支持两级）"""
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, comment="分类名称")
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True, comment="父分类ID，NULL表示一级分类")
    sort_order = Column(Integer, default=0, comment="排序序号")
    is_active = Column(Boolean, default=True, comment="是否启用")
    company_name = Column(String(200), comment="所属公司")

    # 自引用关系
    parent = relationship("Category", remote_side=[id], back_populates="children", lazy="selectin")
    children = relationship("Category", back_populates="parent", lazy="selectin")
    scripts = relationship("Script", back_populates="category", lazy="selectin")

    def __repr__(self):
        return f"<Category(id={self.id}, name='{self.name}')>"


class Script(Base):
    """客服话术表"""
    __tablename__ = "scripts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    content = Column(Text, nullable=False, comment="话术内容")
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, comment="所属分类ID")
    keywords = Column(String(500), default="", comment="标签/关键词，逗号分隔")
    usage_count = Column(Integer, default=0, comment="使用次数")
    rating_good = Column(Integer, default=0, comment="好评数")
    rating_bad = Column(Integer, default=0, comment="差评数")
    source = Column(String(50), default="manual", comment="来源：manual/ai/excel")
    is_active = Column(Boolean, default=True, comment="是否启用")
    company_name = Column(String(200), comment="所属公司")
    created_at = Column(DateTime, default=datetime.now, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")

    category = relationship("Category", back_populates="scripts", lazy="selectin")

    def __repr__(self):
        return f"<Script(id={self.id}, content='{self.content[:30]}...')>"


class UsageLog(Base):
    """使用日志表"""
    __tablename__ = "usage_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    script_id = Column(Integer, ForeignKey("scripts.id"), nullable=True, comment="使用的话术ID，AI模式可为NULL")
    customer_query = Column(Text, nullable=True, comment="客户原始问题")
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, comment="选择的分类ID")
    mode = Column(String(20), default="local", comment="模式：local/ai")
    rating = Column(Integer, nullable=True, comment="评分：1好评 0差评")
    company_name = Column(String(200), comment="所属公司")
    created_at = Column(DateTime, default=datetime.now, comment="创建时间")

    def __repr__(self):
        return f"<UsageLog(id={self.id}, mode='{self.mode}')>"
