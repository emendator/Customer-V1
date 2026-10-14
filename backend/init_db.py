"""
数据库初始化脚本：创建表并插入默认分类数据和超级管理员
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

# 控制台编码不是 UTF-8 时（例如 Windows GBK 代码页），emoji/中文打印可能抛 UnicodeEncodeError。
# 一旦抛出会被下面的 except 捕获并回滚事务，导致管理员信息校正"看起来执行了却没生效"，
# 因此这里把输出流设置为遇到无法编码的字符时替换，而不是抛异常。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except (AttributeError, OSError, ValueError):
        pass

from app.database import init_db, SessionLocal
from app.models import Category, User
from app.auth import get_password_hash
from app.config import (
    SUPER_ADMIN_USERNAME, SUPER_ADMIN_PASSWORD,
    SUPER_ADMIN_COMPANY, SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_COMPANY_PASSWORD,
)
from app.utils.crypto import encrypt_api_key


def ensure_super_admin(db):
    """
    确保超级管理员账号存在。
    - 不存在：按固定信息创建（登录口令来自环境变量 SUPER_ADMIN_PASSWORD）
    - 已存在：仅把 角色 / 所属公司 / 邮箱 校正回固定信息；
      登录口令不做回写（仅在库中口令为空时补写一次），公司数据库密码同理
    """
    admin = db.query(User).filter(User.username == SUPER_ADMIN_USERNAME).first()
    if admin is None:
        # 初始 API Key 从环境变量 ADMIN_API_KEY 读取，不在源码中硬编码（避免项目共享时泄露）
        admin_api_key = os.getenv("ADMIN_API_KEY", "")
        admin = User(
            username=SUPER_ADMIN_USERNAME,
            password_hash=get_password_hash(SUPER_ADMIN_PASSWORD),
            email=SUPER_ADMIN_EMAIL,
            role="super_admin",
            company_name=SUPER_ADMIN_COMPANY,
            is_active=True,
            api_key_encrypted=encrypt_api_key(admin_api_key),
            company_password_hash=get_password_hash(SUPER_ADMIN_COMPANY_PASSWORD),
        )
        db.add(admin)
        db.flush()
        api_note = "已配置 ADMIN_API_KEY" if admin_api_key else "未配置初始 API Key"
        print(f"✅ 已创建超级管理员（{SUPER_ADMIN_USERNAME}，口令取自环境变量 SUPER_ADMIN_PASSWORD；{api_note}）")
        return

    # 已存在：校正为固定信息，确保不可改变
    changes = []
    if admin.role != "super_admin":
        admin.role = "super_admin"
        changes.append("角色")
    # 登录口令不做回写：仅在库中口令完全为空（无法登录）时，用环境变量补写一次
    if not admin.password_hash:
        admin.password_hash = get_password_hash(SUPER_ADMIN_PASSWORD)
        changes.append("密码(初始化)")
    if admin.company_name != SUPER_ADMIN_COMPANY:
        admin.company_name = SUPER_ADMIN_COMPANY
        changes.append("所属公司")
    if admin.email != SUPER_ADMIN_EMAIL:
        admin.email = SUPER_ADMIN_EMAIL
        changes.append("邮箱")
    # 公司数据库密码：仅在未设置时写入初始值（admin 可在界面自行修改，不强制覆盖）
    if not admin.company_password_hash:
        admin.company_password_hash = get_password_hash(SUPER_ADMIN_COMPANY_PASSWORD)
        changes.append("公司数据库密码(初始)")
    db.flush()
    if changes:
        print(f"🔧 超级管理员信息已校正为固定值（变更：{'、'.join(changes)}）")
    else:
        print(f"超级管理员 '{SUPER_ADMIN_USERNAME}' 已存在，信息与固定配置一致")


def _get_or_create_category_id(db, cat_name: str, sub_cat_name: str, default_company: str) -> int:
    """获取分类ID，若不存在则创建（仅用于初始化）"""
    parent = db.query(Category).filter(Category.name == cat_name, Category.parent_id == None).first()
    if not parent:
        return 0
    child = db.query(Category).filter(
        Category.name == sub_cat_name,
        Category.parent_id == parent.id
    ).first()
    if child:
        return child.id
    # 不存在则创建（兜底）
    child = Category(name=sub_cat_name, parent_id=parent.id, sort_order=99, is_active=True, company_name=default_company)
    db.add(child)
    db.flush()
    return child.id


DEFAULT_CATEGORIES = [
    {"name": "产品质量问题", "children": ["外观瑕疵", "功能故障", "配件缺失", "包装破损", "与描述不符"]},
    {"name": "物流配送", "children": ["发货延迟", "物流信息不更新", "包裹丢失", "送错地址", "快递服务态度"]},
    {"name": "退款退货", "children": ["退款进度查询", "退货流程咨询", "退款金额异议", "运费承担问题", "退款到账时间"]},
    {"name": "使用方法咨询", "children": ["产品安装", "功能使用", "故障排查", "配件更换", "保养维护"]},
    {"name": "服务态度投诉", "children": ["客服态度", "售后响应慢", "承诺未兑现", "信息不透明"]},
    {"name": "售后保修", "children": ["保修政策咨询", "维修进度", "保修范围", "延保购买", "以旧换新"]},
    {"name": "其他问题", "children": ["合作咨询", "意见建议", "其他"]},
    {"name": "公司官方流程话术", "children": [
        "自我介绍", "开场白", "询问客户需求", "确认信息",
        "安抚情绪", "婉拒请求", "道歉致歉",
        "结束语", "好评请求", "转接人工",
        "投诉处理", "回访跟进",
    ]},
]


def init_default_data():
    db = SessionLocal()
    try:
        # ===== 确保超级管理员存在且信息固定（用户名/公司/邮箱见 app/config.py，口令见 .env） =====
        ensure_super_admin(db)

        # ===== 创建/补充默认分类（始终增量，永不删除已有数据） =====
        default_company = SUPER_ADMIN_COMPANY
        created_any = False

        for idx, cat_data in enumerate(DEFAULT_CATEGORIES):
            parent = db.query(Category).filter(
                Category.name == cat_data["name"],
                Category.parent_id == None,
            ).first()

            if parent is None:
                # 创建新的一级分类
                parent = Category(
                    name=cat_data["name"],
                    parent_id=None,
                    sort_order=idx,
                    is_active=True,
                    company_name=default_company,
                )
                db.add(parent)
                db.flush()
                print(f"✅ 新增一级分类「{cat_data['name']}」")
                created_any = True

                # 「公司官方流程话术」不需要「无异常回复」
                if cat_data["name"] != "公司官方流程话术":
                    db.add(Category(
                        name="无异常回复", parent_id=parent.id,
                        sort_order=-1, is_active=True, company_name=default_company,
                    ))

            # 补充缺失的子分类（只增不减）
            existing_children = {
                c.name for c in db.query(Category).filter(
                    Category.parent_id == parent.id
                ).all()
            }
            for child_idx, child_name in enumerate(cat_data["children"]):
                if child_name not in existing_children:
                    db.add(Category(
                        name=child_name, parent_id=parent.id,
                        sort_order=child_idx, is_active=True, company_name=default_company,
                    ))
                    print(f'  ├ 新增子分类「{cat_data["name"]} / {child_name}」')
                    created_any = True

        if not created_any:
            print("✅ 所有分类已存在，无需补充")
        else:
            db.flush()

        # ===== 添加示例话术（仅数据库为空时） =====
        from app.models import Script
        existing_scripts = db.query(Script).count()
        if existing_scripts > 0:
            print(f"✅ 已有 {existing_scripts} 条话术数据，跳过初始化话术")
        else:
            # 无异常回复话术（每个一级分类下一条）
            no_issue_scripts = [
                ("产品质量问题", "无异常回复", "感谢您的反馈！我们非常重视每一次用户体验，经核实该批次产品均通过国家质量认证，出货前也经过了严格质检。如果您在使用过程中有任何疑问，欢迎随时联系我们，我们将为您提供一对一指导。您的满意是我们最大的追求！", "产品质量, 无异常, 质检合格"),
                ("物流配送", "无异常回复", "感谢您的耐心等待！我们已核实您的物流信息，包裹正在正常运输途中，预计在正常时效内送达。物流信息可能存在更新延迟的情况，建议您稍后再刷新查看。如您有任何紧急需求，欢迎随时联系在线客服，我们将竭诚为您服务！", "物流正常, 运输中, 时效正常"),
                ("退款退货", "无异常回复", "感谢您的咨询！经查询您的退款申请已在正常处理流程中，我们一直严格按照平台规则高效处理每一笔售后申请。请您放心，符合条件的退款会第一时间为您办理。如您有任何疑问，欢迎随时联系我们，我们将为您详细解答！", "退款处理中, 正常流程, 售后保障"),
                ("使用方法咨询", "无异常回复", "感谢您的信赖！关于您咨询的功能，产品说明书中有详细的操作步骤说明，建议您先参照说明书进行操作。我们的产品设计充分考虑了用户的使用便捷性，按照指引操作即可顺利完成。如仍然遇到困难，欢迎随时联系我们的技术支持团队获取进一步帮助！", "使用指导, 说明书, 技术支持"),
                ("服务态度投诉", "无异常回复", "非常感谢您提出的宝贵意见！我们一直致力于提供优质的服务体验，对于您反馈的情况我们非常重视并已记录。我们将持续加强团队培训，不断提升服务水平。感谢您对我们工作的监督和支持，期待继续为您提供更优质的服务！", "服务改进, 投诉处理, 培训提升"),
                ("售后保修", "无异常回复", "感谢您的咨询！关于保修服务，我们的产品享有完善的售后保障体系，严格按照国家三包规定执行。您反馈的情况我们已记录，建议您先确认是否在保修期内，如有需要可通过官方渠道提交申请，我们会第一时间为您处理。感谢您的理解与支持！", "保修政策, 售后保障, 三包服务"),
                ("其他问题", "无异常回复", "非常感谢您联系我们的客服团队！对于您提出的问题，我们已详细记录并将反馈给相关部门。我们会认真对待每一位用户的反馈，持续优化产品和服务。如果您有其他疑问或需要进一步的帮助，欢迎随时联系我们，祝您生活愉快！", "问题反馈, 记录处理, 持续优化"),
            ]

            # 构建：(一级分类名, 二级分类名(可选), 话术内容, 关键词)
            sample_scripts_raw = [
            # ===== 产品质量问题 =====
            ("产品质量问题", "外观瑕疵", "非常抱歉给您带来不便！关于您反馈的产品质量问题，我们已记录并安排专人跟进。请您提供一下订单号和问题照片，我们会尽快为您处理退换货事宜。", "货物破损, 质量问题, 退换货"),
            ("产品质量问题", "外观瑕疵", "关于您反馈的产品外观瑕疵问题，我们深表歉意。请您拍摄瑕疵部位照片发送给我们，确认后我们将为您安排换货或退款。", "外观瑕疵, 退换货, 拍照"),
            ("产品质量问题", "功能故障", "您好，关于产品功能故障的问题，建议您先尝试重启设备看是否恢复正常。如问题依旧，请提供故障视频，我们将为您办理换货处理。", "功能故障, 重启, 换货"),
            # ===== 物流配送 =====
            ("物流配送", "发货延迟", "非常抱歉，物流配送延迟给您带来不便。我已联系快递公司核实您的包裹状态，目前显示已到达中转站，预计明天送达。我们会持续跟进直到您收到包裹。", "物流延迟, 包裹追踪, 快递"),
            ("物流配送", "发货延迟", "关于您反馈的发货延迟问题，我们已催促仓库优先处理您的订单。您的订单目前处于打包状态，预计今天内发出，感谢您的耐心等待！", "发货延迟, 催促, 仓库"),
            ("物流配送", "送错地址", "您反馈的快递送错地址的问题我们已记录。我们会在24小时内联系快递公司安排转寄，新的快递单号会短信通知您，给您添麻烦了！", "送错地址, 转寄, 快递"),
            # ===== 退款退货 =====
            ("退款退货", "退款进度查询", "关于退款进度查询，一般情况下退款会在3-5个工作日原路返回到您的支付账户。如果超时未到账，请联系我们查询处理。", "退款进度, 到账时间, 支付"),
            ("退款退货", "退款进度查询", "感谢您的耐心等待，您申请的退款我们已经审核通过，预计2-3个工作日内到账。如您需要其他帮助，欢迎随时联系我们。", "退款审核, 到账, 售后"),
            ("退款退货", "退货流程咨询", "关于退货流程，您可以在订单页面选择'我要退货'，按照提示填写退货原因并提交，审核通过后会有快递员上门取件，全程免费。", "退货流程, 上门取件, 免费退货"),
            # ===== 使用方法咨询 =====
            ("使用方法咨询", "产品安装", "感谢您选择我们的产品！关于产品的使用方法，您可以查看随附的说明书第3-5页详细了解。也可以关注我们的公众号获取视频教程，搜索'产品型号+教程'即可。", "使用教程, 说明书, 视频教学"),
            ("使用方法咨询", "产品安装", "关于您咨询的安装问题，建议先确认配件是否齐全，然后按照说明书步骤依次安装。如仍有问题，可以联系我们的技术人员进行视频指导。", "安装指导, 配件检查, 视频指导"),
            # ===== 服务态度投诉 =====
            ("服务态度投诉", "客服态度", "非常抱歉让您有了不好的体验！您反馈的客服服务问题我们非常重视，已上报主管核查处理。我们会加强客服培训，杜绝此类问题再次发生。", "客服投诉, 服务态度, 处理反馈"),
            ("服务态度投诉", "客服态度", "感谢您指出我们服务中的不足，这帮助我们不断进步。我们将对相关客服进行再培训，并为您申请一份专属补偿，再次向您致歉！", "服务改进, 客服培训, 补偿"),
            # ===== 售后保修 =====
            ("售后保修", "保修政策咨询", "您好，关于保修问题，您购买的产品享受一年免费保修服务。凭订单号即可联系客服申请保修，维修周期一般为7-15个工作日。", "保修政策, 免费保修, 维修周期"),
            ("售后保修", "维修进度", "您反馈的维修进度问题我们已查询，您的产品目前已完成检测正在维修中，预计3个工作日内维修完毕并寄回，您可通过售后单号查询进度。", "维修进度, 检测, 寄回"),
            # ===== 其他问题 =====
            ("其他问题", "意见建议", "感谢您的宝贵建议！我们已将您的意见提交给产品部门，会在后续产品优化中认真考虑。为表感谢，我们为您准备了一份心意礼券。", "建议反馈, 产品优化, 礼券"),
            # ===== 公司官方流程话术 =====
            ("公司官方流程话术", "自我介绍", "您好！我是XX公司的客服代表[姓名]，很高兴为您服务。请问有什么可以帮助您的吗？", "自我介绍, 开场, 客服"),
            ("公司官方流程话术", "开场白", "感谢您联系XX公司客服中心，我是客服代表[姓名]，请问您遇到什么问题了呢？请放心，我会尽全力为您解决。", "开场白, 客服, 服务"),
            ("公司官方流程话术", "询问客户需求", "为了更好地帮助您，请问您能否详细描述一下您遇到的问题？比如产品出现什么情况、是什么时候购买的，这样我可以更快为您查找解决方案。", "询问, 需求了解, 问题描述"),
            ("公司官方流程话术", "确认信息", "感谢您的耐心配合。我跟您确认一下：您是[客户姓名]先生/女士，订单号是[订单号]，您反馈的问题是[问题简述]，请问我理解得对吗？", "确认信息, 核对, 订单"),
            ("公司官方流程话术", "安抚情绪", "我非常理解您现在的心情，遇到这种情况确实让人着急，请您先消消气。我们一定会认真对待您反馈的问题，给您一个满意的答复。您放心，这事交给我来处理。", "安抚, 情绪安抚, 理解"),
            ("公司官方流程话术", "婉拒请求", "非常感谢您提出的这个建议/请求，我非常理解您的想法。不过根据公司的相关规定，目前我们暂时无法满足这个需求，还请您谅解。不过我可以帮您争取其他的补偿方案，您看可以吗？", "婉拒, 解释, 替代方案"),
            ("公司官方流程话术", "道歉致歉", "非常抱歉给您带来了不愉快的体验！这确实是我们工作上的疏忽，我代表公司向您真诚致歉。我们会立即进行整改，并为您提供相应的补偿措施。", "道歉, 致歉, 补偿"),
            ("公司官方流程话术", "结束语", "再次感谢您对XX公司的支持与信任！如果后续还有任何问题，欢迎随时联系我们。祝您生活愉快，再见！", "结束语, 感谢, 再见"),
            ("公司官方流程话术", "好评请求", "如果您对我的服务感到满意，方便给个五星好评吗？您的认可是我们最大的动力！如果您有任何建议也欢迎随时提出，我们会不断改进。", "好评请求, 评价, 满意度"),
            ("公司官方流程话术", "转接人工", "您反馈的问题比较专业，我为您转接给我们的高级技术专员来处理，请您稍等不要挂机。转接过程中如果遇到问题，请随时再联系我们。", "转接人工, 升级处理, 专员"),
            ("公司官方流程话术", "投诉处理", "非常抱歉让您有了不好的体验！您的投诉我已详细记录并升级到主管处理，我们会在24小时内给您一个明确的处理方案。请您保持电话畅通，我们会第一时间联系您。", "投诉处理, 升级, 处理方案"),
            ("公司官方流程话术", "回访跟进", "您好，我是XX公司的客服代表[姓名]，之前您反馈的问题我们已经处理完毕了，今天特意来电做个回访：请问您的问题是否已经解决了？对我们的处理结果还满意吗？", "回访, 跟进, 满意度调查"),
            ]

            all_sample_scripts = no_issue_scripts + sample_scripts_raw
            for cat_name, sub_cat_name, content, keywords in all_sample_scripts:
                category_id = _get_or_create_category_id(db, cat_name, sub_cat_name, default_company)
                if category_id:
                    db.add(Script(
                        content=content, source="manual",
                        category_id=category_id, keywords=keywords,
                        company_name=default_company,
                    ))

            print(f"✅ 已初始化 {len(DEFAULT_CATEGORIES)} 个一级分类和 {len(all_sample_scripts)} 条示例话术")

        # ===== 统一提交：确保 admin 账号与增量分类在所有分支下均被持久化 =====
        # （修复：此前 commit 仅在「插入示例话术」分支内执行，数据库已有话术时
        #   不会提交事务，导致 ensure_super_admin 创建的 admin 在 close 时被回滚丢失）
        db.commit()
        print("✅ 初始化数据已提交")

    except Exception as e:
        db.rollback()
        print(f"❌ 初始化失败：{e}")
    finally:
        db.close()


if __name__ == "__main__":
    print("正在初始化数据库...")
    init_db()
    init_default_data()
    print("完成！")
