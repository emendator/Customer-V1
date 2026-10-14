import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..schemas import (
    AnalyzeRequest, AnalyzeResponse, ScriptMatch,
    AIAnalyzeResponse, AIResponseItem, OfficialScriptRequest,
    FeedbackRequest, ApiResponse
)
from ..crud import script as script_crud, category as category_crud, log as log_crud, pending_script as ps_crud
        # 修改导入
from ..services.matcher import matcher
from ..services.ai_service import analyze_with_ai, auto_enrich_script, apply_enrichment, analyze_official_script
from ..config import MAX_MATCH_RESULTS
from ..models import User, TokenUsageLog
from ..auth import get_current_user
from ..utils.crypto import decrypt_api_key

router = APIRouter(prefix="/api/analyze", tags=["智能分析"])


def _load_matcher_scripts(db: Session, company_name: str = None):
    """从数据库加载话术到匹配引擎（支持公司隔离）"""
    scripts = script_crud.get_all_active_scripts(db, company_name=company_name)
    matcher.load_scripts(scripts)


@router.post("/local", response_model=ApiResponse)
def local_analyze(
    body: AnalyzeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    本地匹配分析：
    1. 提取查询关键词
    2. 在话术库中匹配最相关的话术
    3. 始终在顶部插入一条「无异常回复」
    """
    company_name = current_user.company_name if current_user.role != "super_admin" else None
    _load_matcher_scripts(db, company_name=company_name)

    # 提取关键词
    keywords = matcher.extract_keywords(body.query)

    # 获取分类名称（用于匹配同分类下的无异常回复）
    category_name = ""
    if body.category_id:
        cat = category_crud.get_category_by_id(db, body.category_id)
        if cat:
            category_name = cat.name

    # 如果指定了分类，在该分类下匹配
    if body.category_id:
        scripts = script_crud.get_all_active_scripts(db, category_id=body.category_id, company_name=company_name)
        results = matcher.match_with_category_filter(body.query, scripts, top_k=MAX_MATCH_RESULTS)
    else:
        results = matcher.match(body.query, top_k=MAX_MATCH_RESULTS)

    # 兜底：无匹配结果时，按使用次数返回最热门的话术
    if not results:
        fallback_scripts = script_crud.get_scripts(
            db, category_id=body.category_id, page=1, page_size=MAX_MATCH_RESULTS
        )[1]
        # 按使用次数排序
        fallback_scripts.sort(key=lambda s: s.usage_count, reverse=True)
        results = [(s, 0.0) for s in fallback_scripts[:MAX_MATCH_RESULTS]]

    # 确保「无异常回复」在顶部
    results = matcher.ensure_no_issue_at_top(results, category_name)

    # 构造返回
    matches = []
    for script, score in results:
        cat_name = script.category.name if script.category else None
        matches.append(ScriptMatch(
            script_id=script.id,
            content=script.content,
            score=round(score, 4),
            category_name=cat_name,
            keywords=script.keywords,
            usage_count=script.usage_count,
            source=script.source,
        ))

    return ApiResponse(
        success=True,
        data={
            "matches": [m.model_dump() for m in matches],
            "mode": "local",
            "query_keywords": keywords,
        }
    )


@router.post("/ai", response_model=ApiResponse)
def ai_analyze(
    body: AnalyzeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    AI 智能分析：
    1. 先本地匹配 Top3 作为参考
    2. 调用大模型生成专业回复
    3. 失败时回退到本地匹配（含无异常回复置顶）
    """
    company_name = current_user.company_name if current_user.role != "super_admin" else None

    # 获取分类名称
    category_name = ""
    if body.category_id:
        cat = category_crud.get_category_by_id(db, body.category_id)
        if cat:
            # 取一级分类名称
            if cat.parent_id:
                parent = category_crud.get_category_by_id(db, cat.parent_id)
                if parent:
                    category_name = parent.name
            else:
                category_name = cat.name

    # 本地匹配 Top3 作为参考（含无异常回复）
    _load_matcher_scripts(db, company_name=company_name)
    ref_scripts = []
    no_issue_ref = ""
    if body.category_id:
        scripts = script_crud.get_all_active_scripts(db, category_id=body.category_id, company_name=company_name)
        results = matcher.match_with_category_filter(body.query, scripts, top_k=3)
    else:
        results = matcher.match(body.query, top_k=3)

    # 获取无异常回复作为参考
    results = matcher.ensure_no_issue_at_top(results, category_name)
    for script, _ in results:
        ref_scripts.append(script.content)
    # 第一条是无异常回复，记录下来
    if results and results[0][0].category and results[0][0].category.name == "无异常回复":
        no_issue_ref = results[0][0].content

    # 获取当前用户的 API Key
    api_key = decrypt_api_key(current_user.api_key_encrypted) if current_user.api_key_encrypted else None

    # 调用大模型
    fallback = False
    fallback_message = ""
    ai_responses = []
    token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    try:
        raw_responses, usage = analyze_with_ai(body.query, category_name, ref_scripts, no_issue_ref, api_key)
        token_usage = usage
        for r in raw_responses:
            ai_responses.append(AIResponseItem(
                content=r.get("content", ""),
                angle=r.get("angle", ""),
                tone=r.get("tone", ""),
            ))
        # 保存 Token 消耗记录
        if usage["total_tokens"] > 0:
            from ..config import LLM_MODEL
            log = TokenUsageLog(
                user_id=current_user.id, endpoint="chat/completions",
                prompt_tokens=usage["prompt_tokens"], completion_tokens=usage["completion_tokens"],
                total_tokens=usage["total_tokens"], model_name=LLM_MODEL,
            )
            db.add(log)
            current_user.total_tokens_spent = (current_user.total_tokens_spent or 0) + usage["total_tokens"]
            db.commit()
    except Exception as e:
        # 降级：使用本地匹配结果（确保无异常回复在顶部）
        fallback = True
        err_msg = str(e)
        if "API Key 未配置" in err_msg:
            fallback_message = "请先在右上角账号菜单中配置 API Key，已为您切换到本地匹配模式"
        else:
            fallback_message = f"AI服务暂时不可用（{err_msg}），已为您切换到本地匹配模式"

        fallback_results = matcher.ensure_no_issue_at_top(list(results), category_name)
        for script, score in fallback_results[:MAX_MATCH_RESULTS]:
            ai_responses.append(AIResponseItem(
                content=script.content,
                angle="本地匹配",
                tone="",
            ))

    return ApiResponse(
        success=True,
        data={
            "responses": [r.model_dump() for r in ai_responses],
            "mode": "local" if fallback else "ai",
            "fallback": fallback,
            "fallback_message": fallback_message,
            "token_usage": token_usage,
        }
    )


@router.post("/official", response_model=ApiResponse)
def official_analyze(
    body: OfficialScriptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    官方流程话术分析：
    1. 调用大模型根据客户输入生成官方流程话术
    2. 返回 5 条不同角度的话术
    """
    # 获取当前用户的 API Key
    api_key = decrypt_api_key(current_user.api_key_encrypted) if current_user.api_key_encrypted else None

    official_responses = []
    fallback = False
    fallback_message = ""
    token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    try:
        raw_responses, usage = analyze_official_script(
            customer_input=body.query,
            sub_category=body.sub_category,
            matched_scenario=body.matched_scenario,
            api_key=api_key,
        )
        token_usage = usage
        for r in raw_responses:
            official_responses.append(AIResponseItem(
                content=r.get("content", ""),
                angle=r.get("angle", ""),
                tone=r.get("tone", ""),
            ))
        # 保存 Token 消耗记录
        if usage["total_tokens"] > 0:
            from ..config import LLM_MODEL
            log = TokenUsageLog(
                user_id=current_user.id, endpoint="chat/completions",
                prompt_tokens=usage["prompt_tokens"], completion_tokens=usage["completion_tokens"],
                total_tokens=usage["total_tokens"], model_name=LLM_MODEL,
            )
            db.add(log)
            current_user.total_tokens_spent = (current_user.total_tokens_spent or 0) + usage["total_tokens"]
            db.commit()
    except Exception as e:
        fallback = True
        fallback_message = f"AI服务暂时不可用（{str(e)}），请稍后重试"

    return ApiResponse(
        success=True,
        data={
            "responses": [r.model_dump() for r in official_responses],
            "sub_category": body.sub_category,
            "mode": "official",
            "fallback": fallback,
            "fallback_message": fallback_message,
            "token_usage": token_usage,
        }
    )


@router.post("/feedback", response_model=ApiResponse)
def submit_feedback(
    body: FeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    用户反馈：
    - 记录使用日志
    - 增加话术使用次数
    - AI生成内容写入话术库
    """
    # 获取当前用户的 API Key（从数据库读取，用于 AI 补全）
    api_key = decrypt_api_key(current_user.api_key_encrypted) if current_user.api_key_encrypted else None

    # 记录日志
    log_crud.create_log(
        db,
        script_id=body.script_id,
        customer_query=body.query,
        category_id=body.category_id,
        mode=body.mode,
        rating=body.rating,
        company_name=current_user.company_name,
    )

    new_script_id = None

    def _build_category_tree_text(db: Session) -> str:
        """构建分类树文本供AI参考"""
        cats = category_crud.get_all_categories(db)
        # 组织成树形文本
        parent_map = {}
        for c in cats:
            if c.parent_id is None:
                parent_map[c.id] = {"name": c.name, "children": []}
        for c in cats:
            if c.parent_id and c.parent_id in parent_map:
                parent_map[c.parent_id]["children"].append(c.name)
        lines = []
        for pid, p in parent_map.items():
            if p["children"]:
                lines.append(f"  {p['name']} / {'、'.join(p['children'])}")
            else:
                lines.append(f"  {p['name']}")
        return "现有分类体系：\n" + "\n".join(lines) if lines else "暂无分类"

    if body.mode == "ai" and body.content:
        # AI 生成的回复
        # 先通过匹配引擎推测最佳分类（为后续入库或审核做准备）
        final_category_id = body.category_id
        if final_category_id is None and body.query:
            _load_matcher_scripts(db)
            matches = matcher.match(body.query, top_k=1)
            if matches:
                best_script, _ = matches[0]
                final_category_id = best_script.category_id

        # AI 自动补充分类和关键词
        enrichment_keywords = ""
        enrichment_category_id = final_category_id
        try:
            tree_text = _build_category_tree_text(db)
            enrichment = auto_enrich_script(body.content, tree_text, api_key)
            applied = apply_enrichment(enrichment, category_crud, db)
            if applied.get("keywords"):
                enrichment_keywords = applied["keywords"]
            if applied.get("category_id") is not None and final_category_id is None:
                enrichment_category_id = applied["category_id"]
            elif applied.get("category_id") is not None:
                enrichment_category_id = applied["category_id"]
        except Exception:
            pass  # AI 补全失败不影响主流程

        # 普通用户 → 提交审核（带上分类和关键词）；管理员以上 → 直接入库
        if current_user.role == "user":
            ps_crud.create_pending_script(
                db,
                content=body.content,
                category_id=enrichment_category_id,
                keywords=enrichment_keywords,
                action="create",
                submitted_by=current_user.id,
                company_name=current_user.company_name,
            )
            new_script_id = None
        else:
            new_script = script_crud.create_script(
                db,
                content=body.content,
                category_id=final_category_id,
                keywords="",
                source="ai",
                company_name=current_user.company_name,
            )
            new_script_id = new_script.id

            # AI 自动补充分类和关键词（异步风格：try/except 不阻塞）
            try:
                tree_text = _build_category_tree_text(db)
                enrichment = auto_enrich_script(body.content, tree_text, api_key)
                applied = apply_enrichment(enrichment, category_crud, db)
                update_data = {}
                if applied.get("keywords"):
                    update_data["keywords"] = applied["keywords"]
                if applied.get("category_id") is not None and final_category_id is None:
                    update_data["category_id"] = applied["category_id"]
                elif applied.get("category_id") is not None:
                    update_data["category_id"] = applied["category_id"]
                if update_data:
                    script_crud.update_script(db, new_script_id, **update_data)
            except Exception:
                pass  # AI 补全失败不影响主流程
            created_by_review = False
    elif body.mode == "local" and body.script_id:
        # 本地匹配：增加使用次数
        script_crud.increment_usage(db, body.script_id)
        if body.rating is not None:
            script_crud.rate_script(db, body.script_id, body.rating)

    if body.mode == "ai" and body.content and current_user.role == "user":
        msg_suffix = "，AI回复已提交审核"
    elif new_script_id:
        msg_suffix = "，AI回复已入库"
    else:
        msg_suffix = ""

    return ApiResponse(
        success=True,
        data={"script_id": new_script_id or body.script_id},
        message="反馈已记录" + msg_suffix
    )
