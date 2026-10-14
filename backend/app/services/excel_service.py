"""
Excel 读写服务
"""
import os
import pandas as pd
from typing import List, Tuple, Optional
from ..config import UPLOAD_DIR, OUTPUT_DIR

# 确保上传目录存在（输入缓存）
os.makedirs(UPLOAD_DIR, exist_ok=True)
# 确保输出目录存在（输出缓存）
os.makedirs(OUTPUT_DIR, exist_ok=True)


def parse_excel(file_path: str) -> Tuple[List[str], List[dict], int]:
    """
    解析上传的 Excel 文件
    返回: (表头列表, 预览行列表(前10行), 总行数)
    """
    # 根据扩展名选择读取方式
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.csv':
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path, engine='openpyxl')

    # 填充 NaN
    df = df.fillna('')

    headers = list(df.columns)
    total_rows = len(df)

    # 取前10行预览
    preview_df = df.head(10)
    preview_rows = preview_df.to_dict(orient='records')

    return headers, preview_rows, total_rows


def import_from_excel(
    file_path: str,
    column_mapping: dict,
    strategy: str = "append"
) -> Tuple[List[dict], List[str]]:
    """
    从 Excel 导入话术数据
    column_mapping: {"content": "内容列名", "keywords": "关键词列名", "category_name": "分类列名"}
    strategy: "append"(追加) / "dedup"(去重)

    返回: (成功导入的数据列表, 错误列表)
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.csv':
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path, engine='openpyxl')

    df = df.fillna('')

    success_items = []
    errors = []

    content_col = column_mapping.get("content")
    keywords_col = column_mapping.get("keywords")
    category_col = column_mapping.get("category_name")

    if not content_col:
        return [], ["未指定话术内容列"]

    for idx, row in df.iterrows():
        try:
            content = str(row.get(content_col, "")).strip()
            if not content:
                errors.append(f"第{idx+2}行：话术内容为空")
                continue

            item = {
                "content": content,
                "source": "excel",
                "keywords": "",
            }

            if keywords_col and keywords_col in row:
                item["keywords"] = str(row[keywords_col]).strip()

            if category_col and category_col in row:
                item["category_name"] = str(row[category_col]).strip()

            success_items.append(item)

        except Exception as e:
            errors.append(f"第{idx+2}行：{str(e)}")

    return success_items, errors


def export_to_excel(data: List[dict], file_path: str, columns: List[str] = None):
    """导出话术数据到 Excel"""
    df = pd.DataFrame(data)
    if columns:
        df = df[columns]
    df.to_excel(file_path, index=False, engine='openpyxl')


def get_import_template_path() -> str:
    """获取导入模板文件路径"""
    return os.path.join(OUTPUT_DIR, "import_template.xlsx")


def create_import_template() -> str:
    """创建导入模板文件"""
    template_path = get_import_template_path()
    df = pd.DataFrame(columns=["话术内容(必填)", "关键词(选填)", "所属分类(选填)"])
    df.to_excel(template_path, index=False, engine='openpyxl')
    return template_path
