"""
本地匹配引擎：基于 jieba 分词 + TF-IDF + 余弦相似度
"""
import jieba
import re
import numpy as np
from typing import List, Tuple, Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..models import Script, Category
from ..config import MAX_MATCH_RESULTS, MIN_MATCH_SCORE


# 停用词（常见中文停用词）
STOP_WORDS = set([
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
    "没有", "看", "好", "自己", "这", "他", "她", "它", "们", "那", "些",
    "什么", "怎么", "如何", "为什么", "可以", "这个", "那个", "还是",
    "但是", "因为", "所以", "如果", "虽然", "而且", "或者", "然后",
    "啊", "吧", "呢", "吗", "哦", "嗯", "哈", "呀", "嘛",
])


class ScriptMatcher:
    """话术匹配引擎"""

    def __init__(self):
        self._scripts: List[Script] = []
        self._contents: List[str] = []
        self._vectorizer: Optional[TfidfVectorizer] = None
        self._tfidf_matrix = None

    def load_scripts(self, scripts: List[Script]):
        """加载/更新话术库"""
        self._scripts = scripts
        self._contents = [s.content for s in scripts]
        if self._contents:
            self._vectorizer = TfidfVectorizer(
                tokenizer=self._jieba_tokenize,
                max_features=5000,
                stop_words=list(STOP_WORDS)
            )
            self._tfidf_matrix = self._vectorizer.fit_transform(self._contents)
        else:
            self._vectorizer = None
            self._tfidf_matrix = None

    def _jieba_tokenize(self, text: str) -> List[str]:
        """jieba 分词"""
        # 清理文本
        text = re.sub(r'[^\u4e00-\u9fa5a-zA-Z0-9]', ' ', text)
        words = jieba.cut(text)
        return [w for w in words if w.strip() and w not in STOP_WORDS and len(w) > 1]

    def get_no_issue_scripts(self) -> List[Script]:
        """获取所有「无异常回复」分类下的话术"""
        return [
            s for s in self._scripts
            if s.category and s.category.name == "无异常回复"
        ]

    def get_best_no_issue_script(self, category_name: str = "") -> Optional[Script]:
        """获取最适合当前分类的「无异常回复」话术
        优先匹配同一一级分类下的无异常回复，其次返回通用无异常回复
        """
        no_issue_scripts = self.get_no_issue_scripts()
        if not no_issue_scripts:
            return None

        if not category_name:
            return no_issue_scripts[0]

        # 尝试找同一一级分类下的无异常回复
        for s in no_issue_scripts:
            if s.category and s.category.parent and s.category.parent.name == category_name:
                return s
            # 如果script的category本身就是一级分类名称"无异常回复"？不，无异常回复是二级分类
            # 找二级分类名称为"无异常回复"且父分类匹配的
            if s.category and s.category.name == "无异常回复":
                parent = s.category.parent
                if parent and parent.name == category_name:
                    return s

        # 没有匹配的，返回第一个
        return no_issue_scripts[0]

    def ensure_no_issue_at_top(self, results: List[Tuple[Script, float]], category_name: str = "") -> List[Tuple[Script, float]]:
        """确保「无异常回复」话术在匹配结果的最顶上"""
        # 检查结果中是否已有「无异常回复」
        has_no_issue = any(
            s.category and s.category.name == "无异常回复"
            for s, _ in results
        )
        if has_no_issue:
            return results

        no_issue = self.get_best_no_issue_script(category_name)
        if no_issue:
            # 插入到最前面，保持分数为0以区分
            results.insert(0, (no_issue, 1.0))
            # 如果超出top_k，去掉最后一个
            if len(results) > MAX_MATCH_RESULTS:
                results.pop()
        return results

    def _keyword_overlap_score(self, query_tokens: List[str], script_tokens: List[str]) -> float:
        """计算关键词重叠分数（基于 Jaccard 相似度）"""
        if not query_tokens or not script_tokens:
            return 0.0
        q_set = set(query_tokens)
        s_set = set(script_tokens)
        intersection = q_set & s_set
        if not intersection:
            return 0.0
        return len(intersection) / max(len(q_set), len(s_set))

    def extract_keywords(self, text: str, topk: int = 5) -> List[str]:
        """从文本中提取关键词"""
        words = self._jieba_tokenize(text)
        if not words:
            return []
        # 使用 TF-IDF 提取关键词
        try:
            vectorizer = TfidfVectorizer(tokenizer=lambda x: x, lowercase=False)
            tfidf = vectorizer.fit_transform([words])
            feature_names = vectorizer.get_feature_names_out()
            scores = tfidf.toarray()[0]
            top_indices = scores.argsort()[-topk:][::-1]
            return [feature_names[i] for i in top_indices if scores[i] > 0]
        except Exception:
            return words[:topk]

    def match(self, query: str, top_k: int = MAX_MATCH_RESULTS) -> List[Tuple[Script, float]]:
        """匹配查询文本，返回 (话术, 相似度分数) 列表
        使用混合评分：TF-IDF 余弦相似度 + 关键词重叠评分
        """
        if not self._scripts or self._tfidf_matrix is None:
            return []

        query_tokens = self._jieba_tokenize(query)
        if not query_tokens:
            # 无法分词时，直接返回空
            return []

        # 查询向量化（TF-IDF）
        try:
            query_vec = self._vectorizer.transform([query])
            similarities = cosine_similarity(query_vec, self._tfidf_matrix).flatten()
        except Exception:
            similarities = np.zeros(len(self._scripts))

        # 计算混合分数
        ranked = []
        for i, script in enumerate(self._scripts):
            tfidf_score = float(similarities[i])

            # 关键词重叠分数
            script_tokens = self._jieba_tokenize(script.content)
            kw_score = self._keyword_overlap_score(query_tokens, script_tokens)

            # 混合分数：TF-IDF 占 60%，关键词重叠占 40%
            hybrid_score = tfidf_score * 0.6 + kw_score * 0.4

            if hybrid_score > 0:
                ranked.append((script, round(hybrid_score, 4)))

        # 按分数降序排列
        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked[:top_k]

    def match_with_category_filter(
        self, query: str, scripts: List[Script], top_k: int = MAX_MATCH_RESULTS
    ) -> List[Tuple[Script, float]]:
        """在指定话术列表中进行匹配（分类筛选后使用）"""
        if not scripts:
            return []

        query_tokens = self._jieba_tokenize(query)
        if not query_tokens:
            return []

        contents = [s.content for s in scripts]
        try:
            vectorizer = TfidfVectorizer(
                tokenizer=self._jieba_tokenize,
                max_features=5000
            )
            tfidf_matrix = vectorizer.fit_transform(contents)
            query_vec = vectorizer.transform([query])
            similarities = cosine_similarity(query_vec, tfidf_matrix).flatten()
        except Exception:
            similarities = np.zeros(len(scripts))

        ranked = []
        for i, script in enumerate(scripts):
            tfidf_score = float(similarities[i])
            script_tokens = self._jieba_tokenize(script.content)
            kw_score = self._keyword_overlap_score(query_tokens, script_tokens)
            hybrid_score = tfidf_score * 0.6 + kw_score * 0.4
            if hybrid_score > 0:
                ranked.append((script, round(hybrid_score, 4)))

        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked[:top_k]


# 全局单例
matcher = ScriptMatcher()
