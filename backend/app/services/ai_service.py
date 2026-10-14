"""
大模型调用服务：OpenAI 兼容 API
"""
import json
import re
from typing import List, Optional, Tuple
from openai import OpenAI

from ..config import LLM_BASE_URL, LLM_MODEL


SYSTEM_PROMPT = """你是一名专业的售后客服专家，拥有10年客服经验。请根据以下客户反馈，生成4~6条专业、礼貌、有同理心的客服回复。

【核心要求】
1. 【无异常回复（必须放在第1条）】输出数组的第1条必须是「无异常回复」—— 这是一种礼貌、委婉、无懈可击的安抚性回复，适用于客户反馈问题但尚未确认产品存在真实异常的场景。要求：
   - 语气温和亲切，表达对客户反馈的感谢和重视
   - 委婉说明产品经过严格质检、符合国家标准，让客户感受到产品的可靠性
   - 主动提供进一步帮助的渠道（如在线指导、技术支持等）
   - ⚠️ 绝不能承认产品有缺陷或质量问题，不能留下任何产品有问题的把柄
   - ⚠️ 不能做出具体的赔偿承诺或退换货承诺
   - 示例话术方向："感谢您的反馈，我们非常重视您的体验。我们产品均经过严格质量检测，出货前层层把关。如果您在使用过程中遇到任何疑问，我们的技术团队随时为您提供一对一指导，请放心联系我们。"
2. 其余回复应针对不同角度（致歉安抚、问题确认、解决方案、后续跟进、补偿关怀等），其中第2条应为致歉安抚
3. 语气专业礼貌，充分体现同理心和耐心
4. 不承诺无法兑现的具体事项（如具体赔偿金额、确切处理时间等）
5. 回复简洁有力，每条不超过200字
6. 给出明确的下一步行动建议

【退货换货判断规则】
当客户要求退货、换货或退款时，请严格遵循以下判断逻辑：
1. ⚠️ 必须分析客户描述的问题是否严重到需要退货/换货，判断标准需**略高于日常标准**，即：只有确实存在影响正常使用的严重功能故障、重大外观破损时才建议同意退换货
2. 对于以下情况，应优先提供安抚、补偿方案或维修方案，而非直接同意退换货：
   - 外观轻微瑕疵但不影响使用
   - 个人使用习惯不适应
   - 对功能理解有偏差（可通过指导解决）
   - 物流稍慢但已正常配送中
   - 客户主观感受不满意但产品无质量问题
3. 对于确实严重的问题（如完全无法使用、功能彻底失效、严重安全风险等），在回复中给出明确退换货指引
4. 回复时避免直接说"可以退换货"，应说"我们的售后团队会为您评估最优处理方案"等委婉表述

【输出格式】
必须严格以JSON数组格式输出，每项包含：
- "content": 回复话术内容（必填）
- "angle": 回复角度，必须是以下之一：无异常回复、致歉安抚、问题确认、解决方案、后续跟进、补偿关怀、退换货引导（必填）
- "tone": 语气风格，如：正式专业、温和亲切、简洁高效（必填）

示例输出：
[
  {"content": "感谢您的反馈！我们非常重视您的使用体验，该产品经过严格质检，符合国家安全标准。如果您在使用中有任何疑问，我们的技术支持团队随时为您提供详细指导，请放心！", "angle": "无异常回复", "tone": "温和亲切"},
  {"content": "非常抱歉给您带来不便...", "angle": "致歉安抚", "tone": "温和亲切"},
  {"content": "感谢您的反馈，我们已记录...", "angle": "问题确认", "tone": "正式专业"}
]"""


def _build_user_prompt(
    customer_query: str,
    category_name: str = "",
    reference_scripts: List[str] = None,
    no_issue_reference: str = "",
) -> str:
    """构造用户提示词"""
    parts = [f"【客户问题】\n{customer_query}"]
    if category_name:
        parts.append(f"\n【问题分类】\n{category_name}")
    if no_issue_reference:
        parts.append(f"\n【参考无异常回复话术（请参考其风格和措辞生成第1条无异常回复）】\n{no_issue_reference}")
    if reference_scripts:
        ref_text = "\n".join([f"{i+1}. {s}" for i, s in enumerate(reference_scripts)])
        parts.append(f"\n【参考话术（仅供参考风格和方向）】\n{ref_text}")

    # 判断客户是否涉及退货换货退款
    return_exchange_keywords = ["退货", "换货", "退款", "退钱", "不要了", "退回", "退掉", "退款退货"]
    has_return_exchange = any(kw in customer_query for kw in return_exchange_keywords)

    if has_return_exchange:
        parts.append(
            "\n【退货/换货/退款分析要求】"
            "\n客户提出了退货/换货/退款诉求。请严格分析以下要点："
            "\n1. 判断客户所描述的问题是否严重到必须退货/换货（标准需略高）："
            "\n   - 仅当存在影响正常使用的严重功能故障、重大外观破损、产品完全无法使用时才应考虑同意退换货"
            "\n   - 轻微瑕疵、使用习惯不适、功能理解偏差、物流稍慢等情况应优先提供安抚和替代方案"
            "\n2. 对于不够严重的诉求：在回复中委婉引导客户尝试其他解决方案（如技术指导、维修、补偿关怀等），"
            "避免直接同意退换货"
            "\n3. 对于确实严重的问题：回复中给出明确售后指引，但使用委婉表述如「我们的售后团队会为您评估最优处理方案」"
            "\n4. 无论如何，第1条无异常回复必须保持产品可靠性立场，不能直接承认产品有问题"
        )

    parts.append("\n请生成4~6条专业的客服回复，其中第1条必须为「无异常回复」。")
    return "\n".join(parts)


def _parse_ai_response(text: str) -> List[dict]:
    """解析AI返回的JSON"""
    # 尝试直接解析
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass

    # 尝试提取 JSON 数组
    json_match = re.search(r'\[[\s\S]*\]', text)
    if json_match:
        try:
            data = json.loads(json_match.group())
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass

    # 尝试提取 JSON 对象数组
    obj_matches = re.findall(r'\{[^{}]*"content"[^{}]*\}', text)
    if obj_matches:
        results = []
        for m in obj_matches:
            try:
                results.append(json.loads(m))
            except json.JSONDecodeError:
                continue
        if results:
            return results

    # 兜底：按行拆分
    lines = [l.strip() for l in text.split('\n') if l.strip() and len(l.strip()) > 10]
    return [{"content": l, "angle": "综合回复", "tone": "正式专业"} for l in lines[:5]]


def analyze_with_ai(
    customer_query: str,
    category_name: str = "",
    reference_scripts: List[str] = None,
    no_issue_reference: str = "",
    api_key: str = None,
) -> tuple:
    """
    调用大模型分析客户问题并生成回复
    始终包含「无异常回复」作为第1条，并处理退货换货分析

    返回: (responses_list, token_usage_dict)
    - responses_list: [{"content": "...", "angle": "...", "tone": "..."}, ...]
    - token_usage_dict: {"prompt_tokens": N, "completion_tokens": N, "total_tokens": N}
    """
    # API Key 由调用方从数据库读取传入，不使用配置文件中的全局 Key
    if not api_key or api_key == "sk-your-api-key-here":
        raise ValueError("大模型 API Key 未配置，请在账号设置中配置 API Key")

    client = OpenAI(api_key=api_key, base_url=LLM_BASE_URL)

    user_prompt = _build_user_prompt(customer_query, category_name, reference_scripts, no_issue_reference)

    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.7,
        max_tokens=2000,
        timeout=30.0,
        extra_body={"thinking": {"type": "disabled"}}
    )

    text = response.choices[0].message.content.strip()
    parsed = _parse_ai_response(text)

    # 获取 Token 消耗
    usage = response.usage
    token_usage = {
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "total_tokens": usage.total_tokens if usage else 0,
    }

    return parsed, token_usage


OFFICIAL_SCRIPT_PROMPT = """你是一名专业的客服流程话术设计师，负责为公司客服团队撰写标准化的官方流程话术。请根据以下信息生成客服话术。

【客户原始输入】
{customer_input}

【系统已分析出的匹配场景】
{matched_scenario}

【要求生成的子分类】
{sub_category}

【生成要求】
请根据上述「匹配场景」，为该场景下的「{sub_category}」子分类生成5条不同角度、不同适用场景的专业客服话术。

【每条话术的要求】
1. 语气专业、礼貌、温和，体现公司形象
2. 每条话术聚焦一个具体的适用场景或角度
3. 语言简洁明了，适合客服在实时对话中使用
4. 每条话术长度控制在50~150字
5. 话术中可以使用占位符如[客户姓名]、[订单号]、[具体问题]等

【输出格式】
必须严格以JSON数组格式输出，每项包含：
- "content": 话术正文（必填）
- "angle": 话术的适用角度/场景说明（如：初次接触、客户情绪激动时、需要确认信息时等）
- "tone": 语气风格（如：正式专业、温和亲切、简洁高效）

示例输出：
[
  {{"content": "您好！我是XX公司客服[姓名]，请问有什么可以帮助您的吗？", "angle": "初次接触客户时的标准开场", "tone": "温和亲切"}},
  {{"content": "非常感谢您的来电，请问您遇到的是什么问题呢？方便详细描述一下吗？", "angle": "引导客户说明问题", "tone": "温和亲切"}}
]"""


def analyze_official_script(
    customer_input: str,
    sub_category: str,
    matched_scenario: str,
    api_key: str = None,
) -> tuple:
    """
    调用大模型生成官方流程话术

    参数:
        customer_input: 客户的原始输入/问题描述
        sub_category: 要生成的子分类名称（如"安抚情绪"、"婉拒请求"等）
        matched_scenario: AI分析出的匹配场景说明
        api_key: 当前用户的 API Key（从数据库读取）

    返回: (responses_list, token_usage_dict)
    """
    # API Key 由调用方从数据库读取传入，不使用配置文件中的全局 Key
    if not api_key or api_key == "sk-your-api-key-here":
        raise ValueError("大模型 API Key 未配置，请在账号设置中配置 API Key")

    client = OpenAI(api_key=api_key, base_url=LLM_BASE_URL)

    prompt = OFFICIAL_SCRIPT_PROMPT.format(
        customer_input=customer_input,
        matched_scenario=matched_scenario,
        sub_category=sub_category,
    )

    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": "你是一名专业的客服流程话术设计师，擅长根据客户场景生成标准化的官方客服话术。"},
            {"role": "user", "content": prompt}
        ],
        temperature=0.8,
        max_tokens=2000,
        timeout=30.0,
        extra_body={"thinking": {"type": "disabled"}}
    )

    text = response.choices[0].message.content.strip()
    parsed = _parse_ai_response(text)

    usage = response.usage
    token_usage = {
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "total_tokens": usage.total_tokens if usage else 0,
    }

    return parsed, token_usage


ENRICHMENT_PROMPT = """你是一名专业的客服话术库管理员。请分析以下客服话术，为其确定最合适的分类和关键词。

【现有分类体系】（一级分类 / 二级分类）
{category_tree}

【话术内容】
{script_content}

【任务要求】
1. 从现有分类体系中选出最匹配的「分类路径」，格式为"一级分类/二级分类"，例如"产品质量问题/外观瑕疵"
2. ⚠️ 必须细化到二级分类！即使该话术内容比较通用，也要选择一个最贴切的二级分类。不允许只填一级分类。
3. 如果该话术在现有分类中找不到合适归属，请创建新的二级分类并归属于某个现有的一级分类下，格式如"新产品类型/智能家居"
4. 提取3~6个关键词，用逗号分隔，关键词应体现话术的核心内容、适用场景和问题类型

【输出格式】
必须严格以JSON格式输出，仅包含以下字段：
{{
  "category_path": "一级分类/二级分类",  // 必须选择一个现有一级分类，二级分类可选
  "is_new_category": false,              // 是否新建了分类
  "new_category_full_path": "",           // 如果是新建分类，给出完整路径
  "keywords": "关键词1, 关键词2, 关键词3"
}}

注意：请认真判断，不要轻易创建新分类。只有确实找不到合适归属时才新建。"""


def auto_enrich_script(
    script_content: str,
    category_tree_text: str,
    api_key: str = None,
) -> dict:
    """
    调用大模型为话术自动补充分类和关键词

    api_key: 操作者的 API Key（从数据库读取）；未配置时返回空结果跳过 AI 补全

    返回: {"category_path": "...", "is_new_category": bool, "new_category_full_path": "", "keywords": "..."}
    """
    if not api_key or api_key == "sk-your-api-key-here":
        # 未配置 API Key 时，跳过 AI 补全
        return {"category_path": "", "is_new_category": False, "new_category_full_path": "", "keywords": ""}

    client = OpenAI(api_key=api_key, base_url=LLM_BASE_URL)

    user_prompt = ENRICHMENT_PROMPT.format(
        category_tree=category_tree_text,
        script_content=script_content,
    )

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "你是一个专业的客服话术库分类助手。请严格按格式输出JSON。"},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=1000,
            timeout=15.0,
            extra_body={"thinking": {"type": "disabled"}}
        )

        text = response.choices[0].message.content.strip()

        # 尝试解析JSON
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            result = json.loads(json_match.group())
            return {
                "category_path": result.get("category_path", ""),
                "is_new_category": bool(result.get("is_new_category", False)),
                "new_category_full_path": result.get("new_category_full_path", ""),
                "keywords": result.get("keywords", ""),
            }
    except Exception:
        pass

    return {"category_path": "", "is_new_category": False, "new_category_full_path": "", "keywords": ""}


def apply_enrichment(enrichment: dict, category_crud_module, db) -> dict:
    """
    根据AI补全结果解析最终的 category_id 和 keywords

    返回: {"category_id": int|None, "keywords": str}
    自动处理：新建分类、父分类降级到子分类等场景
    """
    from ..models import Category

    result = {
        "category_id": None,
        "keywords": enrichment.get("keywords", "").strip(),
    }

    category_path = enrichment.get("category_path", "").strip()
    if not category_path:
        return result

    parts = [p.strip() for p in category_path.split("/")]
    parent_name = parts[0]
    child_name = parts[1] if len(parts) > 1 else None

    # 处理新建分类
    if enrichment.get("is_new_category") and enrichment.get("new_category_full_path"):
        new_parts = [p.strip() for p in enrichment["new_category_full_path"].split("/")]
        new_parent_name = new_parts[0]
        new_child_name = new_parts[1] if len(new_parts) > 1 else None

        existing = category_crud_module.get_category_by_name(db, new_parent_name)
        if not existing:
            existing = category_crud_module.create_category(db, new_parent_name, parent_id=None, sort_order=99)
        if new_child_name:
            child_existing = category_crud_module.get_category_by_name(db, new_child_name, parent_id=existing.id)
            if not child_existing:
                child_existing = category_crud_module.create_category(db, new_child_name, parent_id=existing.id, sort_order=99)
            result["category_id"] = child_existing.id
        else:
            result["category_id"] = existing.id
        return result

    # 使用现有分类
    existing_parent = category_crud_module.get_category_by_name(db, parent_name)
    if not existing_parent:
        return result

    if child_name:
        child = category_crud_module.get_category_by_name(db, child_name, parent_id=existing_parent.id)
        if child:
            result["category_id"] = child.id
            return result

    # AI只给了父分类 或 子分类未找到 → 自动降级到该父分类下的第一个子分类
    first_child = db.query(Category).filter(
        Category.parent_id == existing_parent.id,
        Category.is_active == True
    ).order_by(Category.sort_order).first()
    if first_child:
        result["category_id"] = first_child.id
    else:
        result["category_id"] = existing_parent.id

    return result
