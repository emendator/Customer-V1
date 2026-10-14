import os
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import (
    ApiResponse, ImportRequest, ImportResultResponse
)
from ..services.excel_service import (
    parse_excel, import_from_excel, export_to_excel,
    create_import_template, UPLOAD_DIR
)
from ..config import OUTPUT_DIR
from ..crud import script as script_crud, category as category_crud
from ..services.ai_service import auto_enrich_script, apply_enrichment
from ..utils.crypto import decrypt_api_key
from ..models import User
from ..auth import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["导入导出"])


@router.post("/upload/excel", response_model=ApiResponse)
async def upload_excel(file: UploadFile = File(...)):
    """上传 Excel 文件并返回预览"""
    # 校验文件类型
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.xlsx', '.xls', '.csv']:
        raise HTTPException(status_code=400, detail="仅支持 .xlsx / .xls / .csv 格式")

    # 保存文件
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # 解析预览
    try:
        headers, preview_rows, total_rows = parse_excel(file_path)
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(status_code=400, detail=f"文件解析失败：{str(e)}")

    # 转换预览行（datetime等不可序列化类型）
    clean_rows = []
    for row in preview_rows:
        clean_row = {}
        for k, v in row.items():
            key = str(k)
            if hasattr(v, 'isoformat'):
                clean_row[key] = v.isoformat()
            elif hasattr(v, 'item'):
                clean_row[key] = v.item()
            else:
                clean_row[key] = str(v) if v is not None else ""
        clean_rows.append(clean_row)

    return ApiResponse(
        success=True,
        data={
            "headers": headers,
            "preview_rows": clean_rows,
            "total_rows": total_rows,
            "filename": filename,
        }
    )


@router.post("/upload/import", response_model=ApiResponse)
def confirm_import(
    body: ImportRequest,
    current_user: User = Depends(require_role("super_admin", "admin", "guest")),
    db: Session = Depends(get_db),
):
    """确认导入 Excel 数据到话术库（管理员/游客可导入）"""
    file_path = os.path.join(UPLOAD_DIR, body.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="上传文件不存在，请重新上传")

    # 解析数据
    try:
        items, errors = import_from_excel(file_path, body.column_mapping, body.strategy)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"数据解析失败：{str(e)}")

    # 处理分类映射
    success_count = 0
    imported_scripts = []

    def _build_category_tree_text(db: Session) -> str:
        """构建分类树文本供AI参考"""
        cats = category_crud.get_all_categories(db)
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

    tree_text = _build_category_tree_text(db)

    for item in items:
        try:
            category_id = None
            category_name = item.pop("category_name", None)
            if category_name:
                cat = category_crud.get_category_by_name(db, category_name)
                if not cat:
                    # 自动创建二级分类
                    cat = category_crud.create_category(db, category_name)
                category_id = cat.id

            # 先保存脚本
            script = script_crud.create_script(
                db,
                content=item["content"],
                category_id=category_id,
                keywords=item.get("keywords", ""),
                source=item.get("source", "excel"),
                company_name=current_user.company_name,
            )
            imported_scripts.append({"id": script.id, "content": item["content"]})
            success_count += 1
        except Exception as e:
            errors.append(f"写入失败：{str(e)}")

    # 并行 AI 补全（不阻塞主流程）
    if imported_scripts:
        # 使用当前操作者（导入人）从数据库读取的 API Key 进行 AI 补全
        importer_api_key = decrypt_api_key(current_user.api_key_encrypted) if current_user.api_key_encrypted else None

        def enrich_script(data: dict):
            """单条话术的 AI 补全"""
            try:
                enrichment = auto_enrich_script(data["content"], tree_text, importer_api_key)
                applied = apply_enrichment(enrichment, category_crud, db)
                update_data = {}
                if applied.get("keywords"):
                    update_data["keywords"] = applied["keywords"]
                if applied.get("category_id") is not None:
                    update_data["category_id"] = applied["category_id"]
                if update_data:
                    script_crud.update_script(db, data["id"], **update_data)
            except Exception:
                pass

        # 最多5个线程并行
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(enrich_script, d) for d in imported_scripts]
            for future in as_completed(futures):
                pass  # 等待所有完成

    # 清理上传文件

    # 清理上传文件
    try:
        os.remove(file_path)
    except Exception:
        pass

    return ApiResponse(
        success=True,
        data={
            "success_count": success_count,
            "fail_count": len(items) - success_count + len(errors),
            "errors": errors[:20],  # 最多返回20条错误
        }
    )


@router.get("/export/scripts", response_model=ApiResponse)
def export_scripts(
    category_id: int = None,
    keyword: str = None,
    script_ids: str = None,  # 逗号分隔的选中ID列表
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """导出话术为 Excel
    - 若指定 script_ids，仅导出选中的话术
    - 否则按 keyword / category_id 筛选导出
    """
    company_name = current_user.company_name if current_user.role != "super_admin" else None

    if script_ids:
        # 按选中ID列表导出
        id_list = [int(x) for x in script_ids.split(",") if x.strip()]
        items = script_crud.get_scripts_by_ids(db, id_list)
        # 过滤公司
        if company_name:
            items = [s for s in items if s.company_name == company_name]
    else:
        total, items = script_crud.get_scripts(
            db, keyword=keyword, category_id=category_id,
            page=1, page_size=10000, company_name=company_name,
        )

    data = []
    for s in items:
        cat_name = s.category.name if s.category else ""
        data.append({
            "话术内容": s.content,
            "关键词": s.keywords,
            "所属分类": cat_name,
            "使用次数": s.usage_count,
            "来源": s.source,
            "报价更新": s.updated_at.strftime("%Y-%m-%d") if s.updated_at else "",
            "状态": "启用" if s.is_active else "禁用",
        })

    filename = f"export_{uuid.uuid4()}.xlsx"
    file_path = os.path.join(OUTPUT_DIR, filename)
    export_to_excel(data, file_path)

    return FileResponse(
        file_path,
        filename="话术库导出.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@router.get("/export/template")
def download_template():
    """下载导入模板"""
    template_path = create_import_template()
    return FileResponse(
        template_path,
        filename="话术导入模板.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
