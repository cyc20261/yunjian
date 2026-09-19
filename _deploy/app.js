/* =====================================================
 * 云笺 · 个人文稿全能助手
 * 纯前端应用：浏览器直连 DeepSeek API，历史记录存 localStorage
 * 智能升级：补充要求指令 / 多轮追问微调 / AI 小助手 / 壁纸主题
 * ===================================================== */
'use strict';

/* ---------- 常量与提示词 ---------- */

const DEFAULT_API_BASE = 'https://api.deepseek.com';
/* 本地离线模式（Ollama 的 OpenAI 兼容端点；LM Studio 等兼容服务也可填） */
const DEFAULT_OLLAMA_BASE = 'http://localhost:11434/v1';
/* 长文本提示阈值：在线模式下达到该字数，弹窗建议切换本地模型（与自动瘦身阈值一致） */
const LOCAL_HINT_MIN_CHARS = 2000;
/* 本地语音转写服务（faster-whisper sidecar）默认地址 */
const DEFAULT_WHISPER_BASE = 'http://localhost:8765';
/* 免费体验中转（Pages Functions 同域路由 /v1/chat/completions：访客无 Key 可体验，Key 存在 Cloudflare 侧不暴露） */
const TRIAL_BASE = location.origin + '/v1';
const TRIAL_USED_KEY = 'wg_trial_used_count';   // 本机已用次数（数字）
const TRIAL_LEGACY_KEY = 'wg_trial_used';        // 旧版标记（'1'），迁移用
const TRIAL_PER_DEVICE = 3;                      // 每台设备可体验次数
const TRIAL_MAX_CHARS = 3600;                    // Worker 侧 4000 字符上限，预留系统提示词空间
const THEMES = [
  'aurora', 'sakura', 'sky', 'mint', 'sunset', 'starry', 'midnight',
  'photo-sakura', 'photo-window', 'photo-star', 'photo-kimono', 'photo-train', 'photo-splash', 'photo-sea',
];
const PHOTO_THEME_NAMES = {
  'photo-sakura': '樱花季', 'photo-window': '窗边日常', 'photo-star': '星河入梦', 'photo-kimono': '花窗和服',
  'photo-train': '黄昏电车', 'photo-splash': '夏日水花', 'photo-sea': '海风少女',
};
const isPhotoTheme = (t) => String(t || '').startsWith('photo');

/* 小云的 24 个 Q 版表情头像 */
const XW_AVATARS = Array.from({ length: 24 }, (_, i) => `assets/xiaoyun/${String(i + 1).padStart(2, '0')}.jpg`);
function xwAvatar() { return XW_AVATARS[Math.floor(Math.random() * XW_AVATARS.length)]; }

const TAB_PLACEHOLDERS = {
  polish: '在这里粘贴需要处理的文本，例如一段文案、一段汇报、一段作文……\n\n然后选择：润色 / 精简 / 扩写，或选择风格后改写。',
  summary: '在这里粘贴长文章、课程 / PPT 文字、聊天记录或会议记录……\n\n内容不限长度，AI 会自动提炼重点。',
  template: '在这里用几句话描述关键信息，例如：\n· 收件人是谁、什么事、希望对方做什么\n· 请假原因和时间\n· 汇报的主题和要点\n\n信息越具体，生成越好用；没写到的部分会用【待补充】标出。',
  convert: '在这里粘贴需要转换的文字，例如一段书面腔的通知、一段看不懂的专业描述……',
  academic: '在这里粘贴论文、摘要、英文文献或任何学术文本……\n\n· 中英文都可以：润色、纠错、互译、速读全支持\n· 学术润色会附「修改对照表」，语法纠错会列出错误清单',
  note: '在这里粘贴课堂笔记、讲义、网课字幕、录音转文字……\n\nAI 会帮你拆章节、提考点、出复习提纲、出自测题、生成可直接导入 XMind 的思维导图。',
  ppt: '在这里输入 PPT 主题，或直接粘贴文稿 / 论文 / 讲稿……\n\nAI 会生成完整大纲（每页标题 + 要点），生成后可在右侧逐页编辑、增删，并一键导出 .pptx。',
  clip: '在这里粘贴演讲稿、口播文案或 SRT 字幕……\n\n· 分镜脚本 / 剪辑建议：粘贴文稿\n· 字幕纠错润色：粘贴完整 SRT，保留时间轴只改文字（完成后自动校验时间轴）\n· 文稿转字幕：粘贴纯文稿；求快可用「本地快速拆句」，不耗 AI 秒出\n· 字幕翻译：粘贴 SRT 一键生成双语字幕',
  check: '在这里粘贴论文、课程作业或任何怕重复的文稿……\n\n建议流程：先「重复风险自查」看哪里容易撞车 → 再「AI 降重改写」保留原意换句式词汇；也可以生成一段自己的降重提示词。',
  proof: '在这里粘贴开题报告、申请书、论文或公文……\n\n提交前最后一道关：错别字 / 标点 / 语病全面体检 → 参考文献 GB/T 7714 格式与标题层级校验 → 敏感词检测。',
  compare: '在这里粘贴【版本 A · 原稿】……\n\n然后在上方「版本 B」框粘贴新稿，即可高亮差异或生成 AI 对比报告。修改前后论文对比、不同版本演讲稿对比都适用。',
  lit: '在这里粘贴研究主题 / 论文题目、文献摘要或乱格式的参考文献列表……\n\n对应功能：生成检索关键词 / 文献要点提炼 / 参考文献按 GB/T 7714 国标格式化。'
};

/* PPT 导出模板（pptxgenjs 配色方案） */
const PPT_THEMES = {
  defense: { name: '答辩蓝', bg: 'FFFFFF', ink: '1F2937', muted: '6B7280', accent: '2563EB', soft: 'EFF6FF' },
  report:  { name: '商务汇报', bg: 'F8FAFC', ink: '0F172A', muted: '64748B', accent: '0D9488', soft: 'F0FDFA' },
  contest: { name: '竞赛活力', bg: '111827', ink: 'F9FAFB', muted: '9CA3AF', accent: 'F59E0B', soft: '1F2937' },
  minimal: { name: '简约学术', bg: 'FFFFFF', ink: '111827', muted: '6B7280', accent: '111827', soft: 'F3F4F6' },
};

const TEMPLATE_HINTS = {
  email: '生成一封完整邮件（含主题行）。可写明：收件人、你的身份、事情原委、希望对方做什么、截止时间等。',
  leave: '生成一张规范请假条。可写明：请假原因、起止日期、审批人（老师/领导）等。',
  resume: '生成简历片段。可写明：目标岗位、经历（实习/项目/社团）、用数据描述成果等。',
  report: '生成汇报提纲。可写明：汇报主题、场合（周会/答辩/述职）、已完成事项、数据、下一步计划等。',
  speech: '生成发言稿。可写明：场合（班会/年会/竞选）、时长要求、想表达的核心观点等。',
  title: '把写好的文稿粘贴进来（或写清主题），一键生成 10 个不同风格的备选标题：论文题目、汇报标题、视频标题、文档文件名都适用。'
};

const TEMPLATE_NAMES = { email: '邮件', leave: '请假条', resume: '简历片段', report: '汇报提纲', speech: '发言稿', title: '标题命名' };
const STYLE_NAMES = { formal: '正式书面', casual: '轻松口语', literary: '文艺优美', academic: '学术严谨', speech: '演讲激昂', brief: '简洁简报', funny: '幽默口语' };
const DUP_STYLE_NAMES = { light: '保守微调', mid: '均衡改写', deep: '深度重写' };
const SUMMARY_TYPE_NAMES = { article: '长文章', ppt: '课程/PPT文字', chat: '聊天记录', meeting: '会议记录' };
const SUMMARY_MODE_NAMES = { detailed: '详细摘要', points: '要点提取', one: '一句话总结' };

const AI_SYS = '你是「云笺」应用内置的 AI 写作小助手「小云」——一个元气满满、贴心话痨的萌系写作搭子（形象是蓝发双马尾的可爱小可酱）。用户正在一个写作工具箱里工作，功能有：文本润色（润色/精简/扩写/七种风格改写）、文档摘要与思维导图、模板生成（邮件/请假条/简历/汇报/发言稿/标题命名）、语言转换（含转微信消息/转规范邮件）、查重降重（重复风险自查/AI 降重改写/生成降重提示词）、文稿审校（错别字标点语病体检/参考文献 GB/T 7714 格式与标题层级校验/敏感词检测）、多版本对比（本地高亮差异/AI 对比报告）、学术助手（学术润色/语法纠错/中英互译/论文速读）、文献助手（检索关键词/文献要点提炼/参考文献格式化）、学习笔记整理（章节考点/复习提纲/自测题/XMind 思维导图）、PPT 大纲生成（含演讲备注）与导出、AI 剪辑助手（分镜脚本/剪辑建议/SRT 字幕纠错与时间轴校验/本地快速拆句/字幕翻译双语字幕）、本地视频处理，还有「文本瘦身」——本地一键压缩长文本（去多余空白 / 重复行 / 口水词）来省 Token，输入框字数旁可以看到 token 估算。回答要求：内容始终简短实用（一般不超过 150 字，可分点），像朋友聊天一样亲切活泼，可以自然地用一点点 emoji 或颜文字（每条 1～2 个就好，不堆砌），偶尔自称「小云」；涉及具体文书时直接给出可套用的要点或短示例；需要用功能时提示用户去对应模块；与写作无关的问题，先友好地陪聊一句，再引导回写作话题。';

/* few-shot 格式示例（借鉴 prompt-lib 的做法：示例比规则更能锚定输出格式，仅用于格式最敏感的任务） */
const FEWSHOT_MAP = '\n输出格式示例（只参考格式，内容必须换成原文的要点）：\n# 在线教育研究现状\n## 研究背景\n- 政策驱动\n  - 双减落地\n- 需求增长\n## 核心发现\n- 完课率不足两成\n- 互动设计影响留存';

/* 各动作的系统提示词（部分按选项拼接） */
function buildSystem(action) {
  switch (action) {
    case 'polish':
      return '你是一位资深中文编辑。请对用户提供的文本进行润色：修正错别字、标点和语病；让表达更流畅、准确、自然，有文采但不堆砌辞藻。专有名词、数字与直接引用保持原样；严格保持原意和原文段落结构，不新增事实。请根据文本的体裁（文案/汇报/作文/日常表达）自适应调整语言风格。直接输出润色后的完整文本，不要任何解释、前言或后记。';
    case 'simplify':
      return '你是资深中文编辑。请在保留全部核心信息的前提下精简以下文本：删除冗余、重复和空话，合并啰嗦的句子，篇幅压缩到原来的 50%～70%。精简后自查一遍：每句话都要有信息量。直接输出精简后的文本，不要任何解释。';
    case 'expand':
      return '你是资深中文写手。请在不编造事实、不偏离原意的前提下扩写以下文本：补充合理的细节、例子或论证，让内容更充实、更有说服力，篇幅约为原来的 1.5～2 倍。补充的内容必须顺着原文逻辑自然展开。直接输出扩写后的文本，不要任何解释。';
    case 'restyle':
      return ''; // 由 buildTask 按风格拼接
    case 'summarize':
      return ''; // 由 buildTask 按类型/方式拼接
    case 'template':
      return '你是文书写作专家。请根据用户提供的关键信息，生成一份可以直接使用的文书。要求：格式规范、语气得体；用户已提供的信息要自然融入；缺少的信息用【待补充：xxx】清晰标出；内容要具体、可操作，避免空话套话。直接输出文书内容，不要任何解释。';
    case 'toCasual':
      return '请把以下书面语改写成口语：像平时说话一样自然、简单、好懂，长句拆短，去掉书面腔和公文腔，可以适当用语气词，但信息不能丢。直接输出改写结果，不要解释。';
    case 'plainify':
      return '请把以下内容简化成大白话：让没有专业背景的人一听就懂。专业术语用通俗说法替换或加简短括号解释，长句拆短，只保留核心信息。可以适当用类比帮助理解。直接输出简化结果，不要解释。';
    case 'toFormal':
      return '请把以下口语化内容改写成规范的书面语：用词准确、句式完整、逻辑清晰，适合写入作业、报告或正式场合。保持原意，直接输出改写结果，不要解释。';
    case 'acPolish':
      return '你是一位学术论文写作改进助理。请改进用户提供的文本的拼写、语法、清晰度、简洁性和整体可读性，分解长句、减少重复，使其符合学术（或正式书面）写作规范。输出要求：\n1. 先输出改进后的完整文本；\n2. 然后输出一个 markdown 表格列出主要修改点，表头两列：| 修改内容 | 修改理由 |，每行左列写改了什么（可用**加粗**标出改动处），右列简述理由，按重要程度从高到低，最多 8 条。\n保持原意，不新增事实，不改变段落顺序。';
    case 'acGrammar':
      return '你是一位严谨的校对专家。请逐句检查用户提供的文本中的语法、拼写、标点和用词错误（中英文均可）。要求：\n1. 只找错误并给出修正，不要改写文风、不要润色；\n2. 如果没有发现任何错误，只回复：「✅ 检查完毕，没有发现语法或拼写错误，这份文稿很规范。」；\n3. 如果发现错误，先用一个两列 markdown 表格逐条列出：| 原句 | 修正后 |，原句在错误处用**加粗**标出，修正后在修改处用**加粗**标出；\n4. 表格之后，输出全文的修正版本（标题写「**修正后的全文**」）。';
    case 'acToEn':
      return '你是一位专业的学术翻译。请把用户提供的中文内容翻译成准确、地道的学术英语：术语规范，句式符合英文论文与正式写作的表达习惯，必要时可调整语序和句子结构。只输出英文翻译结果，不要解释，不要重复原文。';
    case 'acToZh':
      return '你是一位经验丰富的学术翻译。请把用户提供的英文内容翻译成中文，充分考虑中文的语法、清晰度、简洁性和整体可读性，必要时调整句子顺序以符合中文表达习惯；重要专业术语首次出现时在括号中保留英文原文。只输出中文翻译结果，不要解释，不要重复原文。';
    case 'acRead':
      return '你是一位论文阅读助手。请通读用户提供的论文或学术文本，用中文按以下结构输出速读报告（每个小节用 ## 三级标题）：\n## 一句话概括\n（不超过 50 字）\n## 研究问题\n论文要解决什么问题、为什么重要\n## 方法\n使用了什么方法、数据或实验设计\n## 主要发现\n核心结果与关键数据，分点列出\n## 结论与局限\n结论、适用范围和不足之处\n## 值得借鉴的点\n创新点或可学习的写法\n内容必须忠于原文，不要编造；原文没有明确提及的小节，写「原文未明确提及」。';
    case 'noteSplit':
      return '你是学习笔记整理专家。请通读用户提供的课堂笔记 / 讲义 / 课程文字，整理成结构化复习资料：\n1. 按知识逻辑把内容拆分成若干章节（原文顺序混乱时按知识点重新组织）；\n2. 每个章节用 ## 三级标题写章节名，章节内先分点列出核心知识点（保留关键定义、公式、数据），再单独列「⭐ 考点」小节，指出最可能考的内容（如名词解释、简答、计算）；\n3. 原文没有讲清的地方不要编造，可以标注「（原文未展开，建议补看教材）」。\n直接输出整理结果，不要解释。';
    case 'noteOutline':
      return '你是复习规划专家。请根据用户提供的学习内容生成一份复习提纲：\n1. 用 ## 三级标题按主题分块；\n2. 每块列出「必须掌握 / 建议掌握 / 了解即可」三档知识点，用列表分点；\n3. 提纲末尾加一节「📋 考前最后一遍」，用 5～8 条极短句列出最核心的必背点；\n4. 忠于原文，不编造。\n直接输出提纲，不要解释。';
    case 'noteQuiz':
      return '你是出题老师。请根据用户提供的学习内容出 8 道单项选择题用于自测：\n1. 覆盖不同知识点，难度由易到难；\n2. 每题格式：**1. 题干**，然后四个选项 A. B. C. D. 各占一行；\n3. 全部题目出完后，用「---」分隔，再输出「## 答案与解析」，每题给出正确答案和 1～2 句解析（说明为什么对、错误选项错在哪）；\n4. 只能出原文能支撑的题目，不编造。\n直接输出题目，不要解释。';
    case 'noteMap':
      return '你是思维导图整理专家。请把用户提供的学习内容压缩成一棵思维导图，输出为 Markdown 大纲格式（可直接导入 XMind）：\n1. 第一行用 # 写中心主题；\n2. 一级分支用 ##（不超过 6 个），二级分支用 ### 或 - 列表，三级细节用缩进的 - 列表；\n3. 每个节点尽量精简为短语（不超过 15 字），只保留关键词，不要整句；\n4. 层级要反映知识逻辑，忠于原文。' + FEWSHOT_MAP + '\n只输出 Markdown 大纲，不要任何解释。';
    case 'noteExplain':
      return '你是擅长深入浅出的老师。请从用户提供的学习内容中找出最难懂的专业名词、概念或公式（挑最重要的 5～8 个），逐一通俗解释：\n每个概念用以下格式：\n**术语名**：一句话本质 → 一个生活化类比（如「就像……」）→ 为什么重要 / 怎么用（简短）。\n用通俗语言，像给完全没基础的人讲明白，但不牺牲准确性。直接输出解释，不要前言。';
    case 'clipScript':
      return '你是短视频编导。请把用户提供的文稿 / 演讲稿改编成短视频分镜脚本：\n1. 先用一句话概括视频定位（平台 / 时长 / 风格）；\n2. 然后输出一个 markdown 表格，表头：| 镜号 | 景别 | 画面内容 | 台词 / 口播 | 时长 |；\n3. 台词要口语化、有钩子（开头 3 秒抓人），每个镜头 3～15 秒，总时长控制在 1～3 分钟；\n4. 画面内容写清楚拍什么、字幕重点是什么。\n直接输出脚本，不要解释。';
    case 'clipAdvice':
      return '你是短视频剪辑顾问。请基于用户提供的文稿或脚本，给出具体可执行的剪辑方案建议，分四节输出（用 ## 三级标题）：\n## 镜头设计\n每个段落该用什么素材 / 景别 / 拍法\n## 转场与节奏\n段与段之间用什么转场、哪里卡点、哪里留白，以及整体节奏曲线\n## BGM 与音效\n推荐 2～3 种风格的背景音乐方向（描述风格和参考感觉，不用具体歌名）、关键音效点位\n## 字幕与包装\n字幕样式、关键词高亮、封面和标题建议\n建议要具体到段落，直接输出，不要解释。';
    case 'subFix':
      return '你是字幕校对专家。用户会提供一份 SRT 字幕，请只修正文字内容：改错别字、标点、明显听写错误，可轻度润色让句子更通顺，但：\n1. 绝对不要改动任何序号和时间轴（--> 行原样保留）；\n2. 不要合并、拆分、增删任何字幕条；\n3. 每条字幕的行数和原文件保持一致；\n4. 直接输出修正后的完整 SRT，不要任何解释、不要代码块标记。';
    case 'subSplit':
      return '你是字幕制作专家。请把用户提供的文稿拆分成适合做字幕的短句，并输出带估算时间轴的 SRT：\n1. 每条字幕不超过 18 个字，一屏能读完；按口语节奏断句，可去掉「然后」「那么」等口水词；\n2. 按每秒 4 个字估算每条时长，从 00:00:00,000 连续排布，不留间隔；\n3. 时间格式必须是 SRT 标准：00:00:03,000 --> 00:00:06,500（毫秒用逗号）；\n4. 序号从 1 开始连续编号；\n5. 直接输出完整 SRT，不要任何解释、不要代码块标记。';
    case 'dupCheck':
      return '你是论文查重辅助专家。用户提供一篇文稿（论文、课程作业等），请你从「表达模板化、套话堆砌、与常见文献表述雷同」的角度做重复风险自查：\n1. 先给出整体风险评级：🟢 低 / 🟡 中 / 🔴 高，并用一句话说明理由；\n2. 然后用一个 markdown 表格列出风险点（最多 10 条，按风险从高到低），表头：| 原句摘录 | 风险类型 | 修改建议 |。风险类型包括：高频套话（如「随着…的发展」「综上所述」堆叠）、模板化句式（与常见文献高度雷同的表达）、书面八股/空话、引用未标注（如能看出）；\n3. 最后用 3～5 条要点给出整体降重策略。\n注意：这是基于 AI 的表达层风险自查，不能替代学校查重数据库的结果。直接输出报告，不要解释。';
    case 'dupRewrite':
      return ''; // 由 buildTask 按降重强度拼接
    case 'dupPrompt':
      return '你是提示词工程专家。用户想获得一段可复制到任意 AI 工具使用的「文稿降重」提示词。请根据用户文稿的体裁和指定的降重强度，生成一段结构完整、可直接使用的中文提示词：\n1. 用一个代码块输出提示词本身（不要加代码块语言标记）；\n2. 提示词需包含：角色设定、降重强度与改动幅度、必须保留的内容（原意 / 专业术语 / 数据 / 逻辑顺序）、禁止事项（不增删事实、不改变段落结构）、输出格式要求（改写后全文 + 改写点对照表）；\n3. 代码块之后，用 2～3 条要点说明如何按需修改这段提示词（比如调强度、限字数、指定保留哪段）。\n直接输出，不要解释。';
    case 'proofCheck':
      return '你是资深中文编辑与校对专家。请对用户提供的文稿做一次全面体检，依次检查：错别字、标点误用、语病（搭配不当 / 成分残缺 / 语序不当 / 重复啰嗦）。\n输出要求：\n1. 先给一句话总评（文稿整体文字质量如何）；\n2. 用三列 markdown 表格逐条列出问题：| 位置 / 原句 | 问题类型 | 修改建议 |，原句中错误处用**加粗**标出，最多 15 条，按严重程度排序；\n3. 表格之后输出「**修改后全文**」，给出修正后的完整文本（只改错，不润色、不改风格）；\n4. 如果没有任何问题，只回复：「✅ 体检完成，未发现错别字、标点或语病问题，文稿很规范！」';
    case 'proofFormat':
      return '你是学术论文与公文格式规范专家，熟悉 GB/T 7714-2015《信息与文献 参考文献著录规则》和常见的论文排版规范。请检查用户提供的文稿格式，分三部分输出（各用 ## 三级标题）：\n## 参考文献格式\n逐条检查是否符合 GB/T 7714（文献类型标识 [J]/[M]/[C]/[D]/[N]/[EB/OL]、著录项目与顺序、标点、作者超过 3 人用「等」/「et al.」）；用表格列出问题：| 原条目 | 问题 | 规范写法 |；没有参考文献部分则写「未检测到参考文献」。\n## 标题层级\n检查章节编号是否连贯一致（如 1 / 1.1 / 1.1.1 或 一、（一）、1.），层级有无跳级、混乱；列出问题与修正建议。\n## 其他规范\n图表编号与引用、数字用法、段落格式等明显问题（如能看出）。\n原文不存在的部分跳过；无法确认的不要硬改。最后用 2～3 条要点总结。直接输出报告，不要解释。';
    case 'proofSensitive':
      return '你是文稿合规审查助手。请检查用户提供的文稿中可能存在风险的表述，包括：\n1. 极端化 / 绝对化用词（如「最好」「第一」「100%」「国家级」等广告法禁用倾向词）；\n2. 歧视性或冒犯性表述（性别、地域、民族、残障等）；\n3. 政治敏感或不合时宜的表述；\n4. 夸大宣传与承诺性话术（如「包过」「稳过」「保证」）；\n5. 涉及隐私的信息（真实姓名、身份证号、手机号、住址等，如能识别）。\n输出：先给总体结论，再用表格列出：| 风险表述 | 风险类型 | 建议 |（给出改写或删除建议；隐私信息建议脱敏为【已脱敏】）。没有风险时明确回复「✅ 未发现明显风险表述」。语气客观，正常学术词汇不要误伤。直接输出报告，不要解释。';
    case 'litKeywords':
      return '你是文献检索顾问。用户会给出研究主题 / 论文题目（或摘要），请生成一套文献检索方案，分四部分输出（用 ## 三级标题）：\n## 中文关键词\n5～8 个，包含核心词、近义词、上下位词，每行一个并附一句适用场景说明\n## 英文关键词\n与中文对应的规范学术用语 5～8 个，每行一个\n## 检索式示例\n用布尔逻辑（AND / OR / NOT）组合关键词，各给 1 个中文（适配知网 / 万方）和 1 个英文（适配 Web of Science / Google Scholar）示例\n## 检索建议\n2～3 条实用建议（如先读综述、限定近 5 年、顺引文溯源等）\n直接输出方案，不要解释。';
    case 'litFormat':
      return '你是参考文献格式化专家，严格熟悉 GB/T 7714-2015 国标。用户会提供参考文献信息（可能是格式混乱的文献列表，也可能是零散的字段信息如题目、作者、期刊名、年份、卷期页码、网址等）：\n1. 识别每条文献的类型（期刊 [J]、专著 [M]、会议论文集 [C]、学位论文 [D]、报纸 [N]、电子资源 [EB/OL] 等）；\n2. 若是零散字段信息，直接按国标组装成一条规范著录；若是列表，逐条按国标规范重新著录：作者（3 人以上用「等」/「et al.」）、题名、刊名或出版社、年份、卷（期）、页码，标点与顺序严格符合国标；按原顺序编号输出完整列表；\n3. 信息缺失或无法识别的条目尽量照原样输出，并用【待补充：xxx】标出缺什么；\n4. 如有需要注意的问题（中英文混杂、疑似重复条目、明显缺字段），最后用 2～3 条要点提示。\n只输出格式化结果和提示，不要解释。';
    case 'litNotes':
      return '你是文献阅读助手。请通读用户提供的文献（摘要或正文节选），用中文提炼，按以下结构输出（用 ## 三级标题）：\n## 基本信息\n题目（原文如有英文题目一并给出）、作者与年份（如有）\n## 核心要点\n分点列出：研究问题 / 方法 / 数据或样本 / 主要发现 / 结论，每点 1～2 行\n## 创新与局限\n这篇文章的新意在哪里、有什么明显局限\n## 可引用金句\n摘出 2～3 句最适合在自己论文中引用的原句（标注「原文」），每句配一句「什么场景下可以引用它」\n忠于原文，不编造；原文没有的信息标注「原文未提及」。直接输出，不要解释。';
    case 'mindMap':
      return '你是思维导图整理专家。请把用户提供的文稿（文章 / 报告 / 会议纪要 / 演讲稿等任意内容）压缩成一棵思维导图，输出为 Markdown 大纲格式（可直接导入 XMind / 幕布）：\n1. 第一行用 # 写中心主题；\n2. 一级分支用 ##（不超过 6 个），二级分支用 ### 或 - 列表，三级细节用缩进的 - 列表；会议纪要按「议题 → 讨论要点 → 决议 / 待办」组织，一般文稿按「核心论点 → 论据 / 细节」组织；\n3. 每个节点精简为短语（不超过 15 字），只保留关键词，不要整句；\n4. 层级要反映内容逻辑，忠于原文，不编造。' + FEWSHOT_MAP + '\n只输出 Markdown 大纲，不要任何解释。';
    case 'toWeChat':
      return '你是沟通专家。请把用户提供的正式文稿（通知 / 邮件 / 公告 / 说明等）改写成一条适合发微信的消息：\n1. 语气礼貌但轻松，像平时微信沟通；开头有称呼或问候，结尾有礼貌收尾；\n2. 长句拆短、分段清晰，重要信息（时间、地点、要求、截止时间）放在显眼位置并用【】突出；\n3. 可以在自然的位置用 1～2 个表情符号，不堆砌；信息不能丢，但重复的客套话可以删；\n4. 如果原文很长，提炼成要点式短消息，并在末尾提示「详细内容见下 / 见附件」。\n直接输出微信消息，不要解释。';
    case 'toEmail':
      return '你是公文写作专家。请把用户提供的口语化、零散的文字整理成一份规范的电子邮件：\n1. 第一行输出「主题：xxx」，简明扼要、一眼看懂来意；\n2. 正文结构：称呼 + 问候 → 分段说清事情（背景 / 诉求 / 时间节点）→ 结尾敬语（如「盼复」「此致 敬礼」）→ 署名与日期；\n3. 用词正式得体、逻辑清晰，把口语重新组织成书面语，原意和关键信息不能丢；\n4. 缺少的信息（如收件人姓名、署名）用【待补充：xxx】标出。\n直接输出邮件，不要解释。';
    case 'diffReport':
      return '你是文稿修订分析专家。用户会提供同一文稿的两个版本（版本 A 原稿、版本 B 新稿），请输出一份对比分析报告：\n## 修改概览\n总体改动幅度估计（小 / 中 / 大，改动比例约多少），改动主要集中在哪些部分\n## 主要修改点\n用表格列出 5～10 处最有代表性的修改：| 位置 | 版本 A | 版本 B | 修改性质 |，修改性质分为：内容增删 / 表述优化 / 结构调整 / 事实与数据变化 / 格式调整\n## 质量评价\n新版本相对旧版本的进步之处；如发现信息丢失、逻辑断裂或新版本引入可疑内容，明确指出\n直接输出报告，不要解释。';
    case 'audioClean':
      return '你是速记整理专家。用户会提供一段录音转写的原始文字稿，它可能有：口语废话与语气词、重复啰嗦、缺少标点、识别错别字。请把它整理成一份通顺的书面初稿：\n1. 修正错别字与标点，按话题/语义自然分段；\n2. 删除口水词（然后/就是/那个/嗯啊）、重复表述与无意义的声音描述，但不改变任何观点；\n3. 严格保留全部信息与原意：人名、数字、结论、待办事项一个都不能丢；\n4. 不新增原文没有的内容，不改专业术语。\n直接输出整理后的文稿，不要任何解释或前后记。';
    default:
      return '你是一位专业的中文写作助手。请按要求处理用户提供的文本，直接输出结果，不要解释。';
  }
}

/* ---------- 状态 ---------- */

const settings = loadSettings();
let state = {
  tab: 'polish',
  style: 'formal',
  summaryType: 'article',
  summaryMode: 'detailed',
  template: 'email',
  dupStyle: 'mid',
  subLayout: 'sourceTop',
  generating: false,
  controller: null,
  lastOutput: '',
  lastTask: null,     // { badge, input, sys, messages, fu? }
  activeHistoryId: null,
  lastError: null,
  appliedBackup: null, // 「应用到输入框」前的原文，用于撤销
  customURL: null,     // 当前自定义壁纸的 ObjectURL
  onlineNoHint: null,  // 本次会话内长文本不再弹窗（用户选择继续在线后生效）
  trialActive: false,  // 本次请求走「免费体验」通道（未填 Key 体验 1 次）
};

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('wg_settings') || '{}'); } catch (e) { /* ignore */ }
  return {
    apiKey: s.apiKey || '',
    model: s.model || 'deepseek-chat',
    apiBase: (s.apiBase || DEFAULT_API_BASE).replace(/\/+$/, ''),
    /* 双模式：deepseek = 在线 API（消耗 token）；ollama = 本地离线（免费、断网可用） */
    provider: s.provider === 'ollama' ? 'ollama' : 'deepseek',
    ollamaBase: (s.ollamaBase || DEFAULT_OLLAMA_BASE).replace(/\/+$/, ''),
    ollamaModel: s.ollamaModel || '',
    demo: !!s.demo,
    /* 自动瘦身按模式分别记忆：在线 API 默认开启（省 token 就是省钱）；
       本地模型默认关闭（本地不计费，不需要省 token），用户可以手动开启 */
    autoSlimOnline: s.autoSlimOnline !== undefined ? s.autoSlimOnline !== false : s.autoSlim !== false,
    autoSlimLocal: s.autoSlimLocal === true,
    longTextHintOff: s.longTextHintOff === true, // 长文本「切换本地模型」弹窗不再提示
    /* 本地语音转写服务（faster-whisper sidecar，tools/whisper_server.py） */
    whisperBase: (s.whisperBase || DEFAULT_WHISPER_BASE).replace(/\/+$/, ''),
  };
}

function saveSettings() {
  localStorage.setItem('wg_settings', JSON.stringify(settings));
}

/* 当前是否处于本地离线模式（演示模式优先级更高，由各处单独判断） */
function isLocalMode() { return settings.provider === 'ollama'; }

/* 统一请求配置：DeepSeek 与 Ollama 都走 OpenAI 兼容 /chat/completions，只差三元组
   （借鉴 NetCoreKevin 的做法：本地模型无鉴权时干脆不发 Authorization 头） */
function aiEndpointConfig() {
  if (state.trialActive) {
    // 免费体验：走作者部署的 Worker 中转，无需 Key
    return { local: false, base: TRIAL_BASE, model: 'deepseek-chat', headers: { 'Content-Type': 'application/json' } };
  }
  const local = isLocalMode();
  return {
    local,
    base: local ? settings.ollamaBase : settings.apiBase,
    model: local ? settings.ollamaModel : settings.model,
    headers: local
      ? { 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
  };
}

/* 免费体验资格：在线模式、没填自己的 Key、本机剩余次数 > 0 */
function trialUsedCount() {
  const cur = Number(localStorage.getItem(TRIAL_USED_KEY) || 0);
  if (cur > 0) return cur;
  return localStorage.getItem(TRIAL_LEGACY_KEY) === '1' ? 1 : 0; // 旧版「已用 1 次」标记迁移
}
function trialRemaining() { return Math.max(0, TRIAL_PER_DEVICE - trialUsedCount()); }
function trialEligible() {
  return !settings.demo && !isLocalMode() && !settings.apiKey && trialRemaining() > 0 && !state.trialActive;
}

/* 是否已具备调用条件；未就绪时返回给用户看的提示文案 */
function checkAIReady() {
  if (settings.demo || state.trialActive) return null; // 演示模式 / 免费体验通道直接放行
  if (isLocalMode()) return settings.ollamaModel ? null : '本地模式还没有选择模型：请在「设置」中点「🔍 检测」自动获取';
  return settings.apiKey ? null : '请先填写 DeepSeek API Key（也可以切换到本地离线模式，免费不耗 token）';
}

/* ---------- DOM ---------- */

const $ = (id) => document.getElementById(id);
const inputText = $('inputText');
const resultBody = $('resultBody');
const resultBadge = $('resultBadge');
const charCount = $('charCount');
const banner = $('banner');

/* ---------- 工具 ---------- */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function fmtTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 轻量 Markdown 渲染：先转义 HTML，再处理标题/列表/表格/代码块/加粗/斜体/行内代码 */
function renderMarkdown(text) {
  const lines = esc(text).split('\n');
  let html = '', inUl = false, inOl = false;
  let inCode = false, codeBuf = [];
  let tableRows = null; // null = 不在表格中
  const inline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };
  const parseCells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const flushTable = () => {
    if (!tableRows) return;
    const rows = tableRows.filter(r => r.trim() !== '');
    tableRows = null;
    if (!rows.length) return;
    let bodyStart = 1;
    if (rows.length >= 2 && /^[\s|:\-]+$/.test(rows[1])) bodyStart = 2; // 跳过 |---|---| 分隔行
    const head = parseCells(rows[0]);
    const body = rows.slice(bodyStart).map(parseCells);
    if (!head.length) return;
    html += '<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead>';
    if (body.length) {
      html += '<tbody>' + body.map(cells =>
        '<tr>' + head.map((_, i) => `<td>${inline(cells[i] || '')}</td>`).join('') + '</tr>'
      ).join('') + '</tbody>';
    }
    html += '</table>';
  };
  const flushCode = () => {
    if (!inCode) return;
    html += `<pre><code>${codeBuf.join('\n')}</code></pre>`;
    inCode = false; codeBuf = [];
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (inCode) {
      if (/^```/.test(t)) flushCode();
      else codeBuf.push(raw);
      continue;
    }
    if (/^```/.test(t)) { flushTable(); closeLists(); inCode = true; codeBuf = []; continue; }
    // 表格行：以 | 开头且以 | 结尾，连续行聚合渲染
    if (/^\|/.test(t) && /\|$/.test(t)) { closeLists(); if (!tableRows) tableRows = []; tableRows.push(t); continue; }
    if (tableRows) flushTable();
    if (/^#{1,6}\s+/.test(t)) { closeLists(); html += `<h3>${inline(t.replace(/^#+\s+/, ''))}</h3>`; continue; }
    if (/^[-*•]\s+/.test(t)) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul>'; inUl = true; }
      html += `<li>${inline(t.replace(/^[-*•]\s+/, ''))}</li>`; continue;
    }
    if (/^\d+[.、)]\s*/.test(t)) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol>'; inOl = true; }
      html += `<li>${inline(t.replace(/^\d+[.、)]\s*/, ''))}</li>`; continue;
    }
    if (t === '') { closeLists(); continue; }
    closeLists();
    html += `<p>${inline(t)}</p>`;
  }
  flushCode();
  flushTable();
  closeLists();
  return html || '<p></p>';
}

/* ---------- 组装任务 ---------- */

function buildTask(action, text) {
  let sys = buildSystem(action);
  let badge = '';
  let srtFlag = false;

  switch (action) {
    case 'restyle': {
      sys = `请将以下文本改写为【${STYLE_NAMES[state.style]}】风格：` + {
        formal: '用词专业规范、句式严谨，适合职场汇报、学术或公文场合。',
        casual: '像朋友聊天一样自然亲切，用短句，可以带一点语气词，但不浮夸。',
        literary: '注重意境和节奏，可运用比喻等修辞，但不堆砌辞藻、不偏离原意。',
      }[state.style] + '保持原意和信息量不变。直接输出改写后的文本，不要解释。';
      badge = `改写 · ${STYLE_NAMES[state.style]}风格`;
      break;
    }
    case 'summarize': {
      const typePrompt = {
        article: '用户会给你一篇长文章，请你通读后提炼。',
        ppt: '用户会给你课程或 PPT 的文字内容，请按知识框架梳理出这门内容讲了什么、重点是哪些。',
        chat: '用户会给你一段聊天记录，请客观梳理：讨论的主题、各方的主要观点、达成的结论，以及待办事项（如有）。',
        meeting: '用户会给你一份会议记录，请梳理：会议主题、讨论要点、形成的决议、待办事项及负责人（如有）。',
      }[state.summaryType];
      const modePrompt = {
        detailed: '输出 300～500 字的详细摘要，用连贯段落书写，可适当分点。',
        points: '输出 5～10 条要点，每条一行、以「- 」开头，按重要程度从高到低排序。',
        one: '只输出一句话总结，不超过 50 字，概括最核心的信息。',
      }[state.summaryMode];
      sys = `你是擅长信息提炼的中文编辑。${typePrompt}${modePrompt}保留关键数据和结论，不要输出与摘要无关的内容。`;
      badge = `摘要 · ${SUMMARY_TYPE_NAMES[state.summaryType]} · ${SUMMARY_MODE_NAMES[state.summaryMode]}`;
      break;
    }
    case 'template':
      if (state.template === 'title') {
        badge = '标题命名 · 10 个备选';
        sys = '你是标题创作专家。请基于用户提供的文稿内容（或主题描述），生成 10 个备选标题：\n1. 覆盖不同风格：学术严谨型 2～3 个、简洁凝练型 2 个、亮点突出型 2 个、设问 / 悬念型 2 个、数字 / 对仗型 1～2 个；\n2. 每个标题一行，格式：`风格 | 标题`；\n3. 标题要贴合文稿主题与内容，长度适中，论文标题可带副标题；\n4. 如文稿主题不明确，先在开头用一句话概括你理解的主题。\n输出格式示例（只参考格式，内容须贴合用户文稿）：\n学术严谨 | 基于深度学习的中文文本自动摘要方法研究\n设问悬念 | 你的简历为什么总石沉大海？\n直接输出标题列表，不要解释。';
      } else {
        badge = `模板 · ${TEMPLATE_NAMES[state.template]}`;
        sys = `你是文书写作专家。请根据用户提供的关键信息，生成一份可以直接使用的【${TEMPLATE_NAMES[state.template]}】。要求：格式规范、语气得体；用户已提供的信息要自然融入；缺少的信息用【待补充：xxx】清晰标出。${state.template === 'email' ? '邮件需包含「主题：」一行。' : ''}直接输出文书内容，不要任何解释。`;
      }
      break;
    case 'dupRewrite': {
      const d = {
        light: '轻度改写：只做必要的同义替换和微调，尽量保持原文表达风格，整体改动约 20%～30%。',
        mid: '中度改写：系统调整句式结构、替换同义词汇、变换表达角度，整体改动约 40%～60%。',
        deep: '深度重写：在原意不变的前提下彻底重述每个句子，可重组句序与段落内部结构，整体改动约 70% 以上。',
      }[state.dupStyle || 'mid'];
      sys = `你是论文降重改写专家。请对用户提供的文本做降重改写：通过同义替换、句式重组、主被动转换、长短句变换、语序调整等方式改变表达，严格保持原意、专业术语、数据和逻辑顺序不变。\n本次改写强度：${d}\n要求：专有名词、数字、直接引用保持原样；改写后通顺自然，符合书面 / 学术表达；不新增、不删除事实信息。\n输出：先输出改写后的完整文本；然后输出「**主要改写点**」，用表格列出 5～8 处代表性改写：| 原句 | 改写后 |。`;
      badge = `查重 · AI 降重改写 · ${DUP_STYLE_NAMES[state.dupStyle] || '均衡改写'}`;
      break;
    }
    case 'polish': badge = '润色'; break;
    case 'simplify': badge = '精简'; break;
    case 'expand': badge = '扩写'; break;
    case 'toCasual': badge = '书面语 → 口语'; break;
    case 'plainify': badge = '复杂文字简化'; break;
    case 'toFormal': badge = '口语 → 书面语'; break;
    case 'acPolish': badge = '学术润色'; break;
    case 'acGrammar': badge = '语法纠错'; break;
    case 'acToEn': badge = '中译英'; break;
    case 'acToZh': badge = '英译中'; break;
    case 'acRead': badge = '论文速读'; break;
    case 'noteSplit': badge = '笔记 · 章节考点'; break;
    case 'noteOutline': badge = '笔记 · 复习提纲'; break;
    case 'noteQuiz': badge = '笔记 · 自测题'; break;
    case 'noteMap': badge = '笔记 · 思维导图'; break;
    case 'noteExplain': badge = '笔记 · 通俗解释'; break;
    case 'clipScript': badge = '剪辑 · 分镜脚本'; break;
    case 'clipAdvice': badge = '剪辑 · 方案建议'; break;
    case 'subFix': badge = '字幕 · 纠错润色'; srtFlag = true; break;
    case 'subSplit': badge = '字幕 · 文稿转字幕'; srtFlag = true; break;
    case 'dupCheck': badge = '查重 · 重复风险自查'; break;
    case 'dupPrompt': badge = '查重 · 降重提示词'; break;
    case 'proofCheck': badge = '审校 · 全面体检'; break;
    case 'proofFormat': badge = '审校 · 格式校验'; break;
    case 'proofSensitive': badge = '审校 · 敏感词检测'; break;
    case 'litKeywords': badge = '文献 · 检索关键词'; break;
    case 'litFormat': badge = '文献 · GB/T 7714 格式化'; break;
    case 'litNotes': badge = '文献 · 要点提炼'; break;
    case 'mindMap': badge = '思维导图 · 大纲'; break;
    case 'toWeChat': badge = '💬 转微信消息'; break;
    case 'toEmail': badge = '📧 转规范邮件'; break;
  }

  // 用户在「补充要求」里写下的硬性指令，追加到系统提示词末尾
  const extra = ($('extraReq')?.value || '').trim();
  if (extra) sys += `\n\n【用户的补充要求，必须严格遵守】${extra}`;

  // 哪些结果可以「应用到输入框」：full = 整段结果；head = 取表格/对照表之前的正文；tail = 取「修改后的全文」小节
  const APPLY_FULL = ['polish', 'simplify', 'expand', 'restyle', 'toCasual', 'plainify', 'toFormal', 'toWeChat', 'toEmail', 'acToEn', 'acToZh', 'subFix', 'subSplit'];
  const APPLY_HEAD = ['dupRewrite', 'acPolish'];
  const APPLY_TAIL = ['proofCheck', 'acGrammar'];
  const applyMode = APPLY_FULL.includes(action) ? 'full' : APPLY_HEAD.includes(action) ? 'head' : APPLY_TAIL.includes(action) ? 'tail' : '';

  const user = `【待处理内容】\n${text}`;
  return { badge, input: text, sys, srt: !!srtFlag, applyMode, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] };
}

/* 追问：基于上一轮结果继续修改（多轮对话） */
function followUp(instruction) {
  const base = state.lastTask;
  if (!base || state.generating) return;
  if (!base.messages) { toast('历史回看的结果不支持追问，请在对应模块重新生成后再追问'); return; }
  const notReadyFu = checkAIReady();
  if (notReadyFu) { openSettings(); toast(notReadyFu); return; }
  const task = {
    badge: `${base.badge} · 追问`,
    input: base.input,
    sys: base.sys,
    fu: instruction,
    messages: [
      base.messages[0],
      base.messages[1],
      { role: 'assistant', content: state.lastOutput },
      { role: 'user', content: `请在上一次结果的基础上按要求修改：${instruction}\n直接输出修改后的完整结果，不要任何解释。` },
    ],
  };
  generate(task);
}

/* ---------- AI 请求（流式）：在线 DeepSeek / 本地 Ollama 双模式统一走 OpenAI 兼容协议 ---------- */

/* 思考标签过滤器：qwen3 / deepseek-r1 等思考型模型在 OpenAI 兼容流里会把
   <think>…</think> 思考内容混进正文——既干扰显示，又占满输出长度导致正文为空。
   这里实时剥离思考段（支持标签被网络分块切断的情况），正文照常流式输出。 */
function makeThinkFilter(onDelta, onThinking) {
  const OPEN = '<think>', CLOSE = '</think>';
  let inThink = false, tail = '', sawThink = false;
  function feed(text) {
    tail += text;
    for (;;) {
      if (!inThink) {
        const i = tail.indexOf(OPEN);
        if (i === -1) {
          const keep = OPEN.length - 1;
          if (tail.length > keep) {
            let safe = tail.slice(0, tail.length - keep);
            if (sawThink) { safe = safe.replace(/^\s+/, ''); if (!safe) { tail = tail.slice(tail.length - keep); return; } }
            onDelta(safe);
            tail = tail.slice(tail.length - keep);
          }
          return;
        }
        if (i > 0) { let head = tail.slice(0, i); if (sawThink) head = head.replace(/^\s+/, ''); onDelta(head); }
        tail = tail.slice(i + OPEN.length);
        inThink = true;
        sawThink = true;
        onThinking && onThinking();
      } else {
        const j = tail.indexOf(CLOSE);
        if (j === -1) {
          const keep = CLOSE.length - 1;
          if (tail.length > keep) tail = tail.slice(tail.length - keep);
          return;
        }
        tail = tail.slice(j + CLOSE.length);
        inThink = false;
      }
    }
  }
  function flush() {
    if (!tail) return;
    if (!inThink) { let safe = tail; if (sawThink) safe = safe.replace(/^\s+/, ''); if (safe) onDelta(safe); }
    tail = '';
  }
  return { feed, flush };
}

async function callDeepSeek(messages, onDelta, onThinking, signal, onUsage) {
  const ep = aiEndpointConfig();
  let res;
  try {
    res = await fetch(`${ep.base}/chat/completions`, {
      method: 'POST',
      headers: ep.headers,
      body: JSON.stringify({
        model: ep.model,
        messages,
        stream: true,
        // 本地模式显式拉大输出长度：Ollama 兼容端点默认 max_tokens 偏小，长文书任务会被截断
        ...(ep.local ? { stream_options: { include_usage: true }, max_tokens: 4096 } : {}),
        ...(!ep.local && settings.model === 'deepseek-chat' ? { temperature: 1.2 } : {}),
      }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error(ep.local
      ? `无法连接本地模型服务（${ep.base}）。请确认：① Ollama 已安装并正在运行（开始菜单打开 Ollama，或命令行执行 ollama serve）；② 已拉取模型（如 ollama pull qwen3:8b）；③ 若本页不是从 localhost 打开，需给 Ollama 设置环境变量 OLLAMA_ORIGINS=* 后重启。`
      : '网络错误：无法连接 DeepSeek API。请检查网络，或在「设置 → API 地址」中填入中转 / 代理地址。');
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.error?.message || JSON.stringify(j);
    } catch (e) { detail = await res.text().catch(() => ''); }
    if (ep.local) {
      if (res.status === 404) {
        throw new Error(`本地模型「${ep.model}」不存在。请先在命令行执行 ollama pull ${ep.model || 'qwen3:8b'}，或到「设置 → 本地模式」点「🔍 检测」重新选择已安装的模型。`);
      }
      throw new Error(`本地模型服务返回错误（HTTP ${res.status}）${detail ? '：' + detail.slice(0, 200) : ''}`);
    }
    const map = { 401: 'API Key 无效或已过期，请到「设置」检查。', 402: '账户余额不足，请前往 DeepSeek 平台充值。', 429: '请求过于频繁（限流），请稍后再试。' };
    if (res.status === 402) fetchBalance({ silent: true, force: true }); // 顺手刷新一下余额显示
    // 免费体验通道：Worker 返回的业务提示（次数用完/名额上限等）优先透传给用户
    if (state.trialActive && detail) throw new Error(detail);
    throw new Error(map[res.status] || `请求失败（HTTP ${res.status}）${detail ? '：' + detail.slice(0, 200) : ''}`);
  }
  if (!res.body) throw new Error('当前浏览器不支持流式响应，请更换现代浏览器。');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let usageSeen = false, fullOut = '';
  // 思考内容剥离：正文给 onDelta，思考段只触发「深度思考中」指示
  const filter = makeThinkFilter(
    (txt) => { fullOut += txt; onDelta(txt); },
    () => onThinking && onThinking(),
  );
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') { filter.flush(); return; }
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta || {};
        if (delta.content) filter.feed(delta.content);
        // 思考过程：DeepSeek-R1 用 reasoning_content，新版 Ollama 用 reasoning 字段
        else if (delta.reasoning_content || delta.reasoning) onThinking && onThinking();
        // 在线 DeepSeek 会在最后一个 chunk 带 token 统计；本地模式靠 include_usage 请求，缺失时下方兜底估算
        if (chunk.usage && onUsage) { usageSeen = true; onUsage(chunk.usage); }
      } catch (e) { /* 忽略无法解析的行 */ }
    }
  }
  filter.flush();
  // 本地模式部分版本不返回 usage：按字数本地估算，仅用于展示（不计费）
  if (onUsage && ep.local && !usageSeen) onUsage(demoUsage(messages.map(m => m.content || '').join('\n'), fullOut));
}

/* ---------- Token 用量与账户余额 ---------- */

const CURRENCY_SYMBOLS = { CNY: '¥', USD: 'US$' };

function fmtNum(n) { return Number(n || 0).toLocaleString('zh-CN'); }

/* 累计用量（只统计会花钱的在线 API 调用；本地模型免费，不计入） */
function loadUsageStats() {
  try {
    const s = JSON.parse(localStorage.getItem('wg_usage') || 'null');
    return s && typeof s === 'object' ? s : { prompt: 0, completion: 0, total: 0, requests: 0 };
  } catch (e) { return { prompt: 0, completion: 0, total: 0, requests: 0 }; }
}

function recordUsage(u) {
  if (!u || (isLocalMode() && !settings.demo)) return; // 本地模式不产生费用，不累计
  const s = loadUsageStats();
  s.prompt = (s.prompt || 0) + (u.prompt_tokens || 0);
  s.completion = (s.completion || 0) + (u.completion_tokens || 0);
  s.total = (s.total || 0) + (u.total_tokens || (u.prompt_tokens || 0) + (u.completion_tokens || 0));
  s.requests = (s.requests || 0) + 1;
  localStorage.setItem('wg_usage', JSON.stringify(s));
  renderUsageStats();
}

function renderUsageStats() {
  const s = loadUsageStats();
  const el = $('usageStats');
  if (!s.requests) { el.textContent = '暂无用量记录，完成第一次生成后自动统计'; return; }
  el.textContent = `累计 ${fmtNum(s.total)} tokens（输入 ${fmtNum(s.prompt)} · 输出 ${fmtNum(s.completion)}），共 ${fmtNum(s.requests)} 次请求`;
}

/* 本次请求的用量，显示在结果栏标题旁（本地模式免费，仅展示估算） */
function showUsage(u, demo) {
  const label = demo ? '演示估算 · ' : (state.trialActive ? '🎁 免费体验 · ' : (isLocalMode() ? '本地模型 · 不计费 · ' : ''));
  $('tokenUsage').innerHTML =
    `${label}输入 <b>${fmtNum(u.prompt_tokens)}</b> · 输出 <b>${fmtNum(u.completion_tokens)}</b> · 合计 <b>${fmtNum(u.total_tokens)}</b> tokens`;
}

/* 演示模式：按中文字符数粗略估算 token（约 0.6 token/字） */
function demoUsage(inputStr, outputStr) {
  const est = (s) => Math.max(1, Math.round(String(s || '').length * 0.6));
  const p = est(inputStr), c = est(outputStr);
  return { prompt_tokens: p, completion_tokens: c, total_tokens: p + c };
}

/* 余额（GET /user/balance，结果缓存到 localStorage） */
function loadBalance() {
  try { return JSON.parse(localStorage.getItem('wg_balance') || 'null'); } catch (e) { return null; }
}

let balanceInfo = loadBalance();
let balanceFetching = false;

async function requestBalance(base, key) {
  const res = await fetch(`${base}/user/balance`, { headers: { 'Authorization': `Bearer ${key}` } });
  if (!res.ok) {
    const map = { 401: 'API Key 无效', 403: '该 API 地址不支持余额查询' };
    throw new Error(map[res.status] || `HTTP ${res.status}`);
  }
  const j = await res.json();
  const info = j.balance_infos && j.balance_infos[0];
  if (!info) throw new Error('返回格式异常');
  return {
    currency: info.currency,
    total: info.total_balance,
    granted: info.granted_balance,
    topped: info.topped_up_balance,
    available: j.is_available,
  };
}

function renderBalance() {
  const chip = $('balanceChip'), txt = $('balanceText');
  const detail = $('balanceDetail');
  if (!balanceInfo) {
    txt.textContent = '余额 --';
    chip.classList.remove('low');
    chip.title = '点击查询账户余额';
    if (detail) detail.textContent = settings.demo ? '演示模式不调用真实 API，没有真实余额' : '点击「查询」获取实时余额';
    return;
  }
  const sym = CURRENCY_SYMBOLS[balanceInfo.currency] || balanceInfo.currency + ' ';
  txt.textContent = `${sym}${balanceInfo.total}`;
  const t = new Date(balanceInfo.ts);
  const p = (n) => String(n).padStart(2, '0');
  chip.title = `总余额 ${sym}${balanceInfo.total}（赠送 ${balanceInfo.granted || '0.00'} · 充值 ${balanceInfo.topped || '0.00'}）\n更新于 ${p(t.getHours())}:${p(t.getMinutes())} · 点击刷新`;
  chip.classList.toggle('low', balanceInfo.available === false);
  if (detail) {
    detail.innerHTML = balanceInfo.available === false
      ? `<span class="bd-warn">${sym}${balanceInfo.total}（余额不足，已暂停调用，请充值）</span>`
      : `${sym}${balanceInfo.total}（赠送 ${balanceInfo.granted || '0.00'} · 充值 ${balanceInfo.topped || '0.00'}）`;
  }
}

async function fetchBalance(opts = {}) {
  const { silent = false, force = false } = opts;
  if (settings.demo || isLocalMode() || !settings.apiKey || balanceFetching) return; // 本地模式免费，无余额概念
  if (!force && balanceInfo && Date.now() - balanceInfo.ts < 60 * 1000) return; // 1 分钟内不重复查询
  balanceFetching = true;
  $('balanceText').textContent = '查询中…';
  try {
    const info = await requestBalance(settings.apiBase, settings.apiKey);
    balanceInfo = { ...info, ts: Date.now() };
    localStorage.setItem('wg_balance', JSON.stringify(balanceInfo));
    renderBalance();
    if (!silent) toast(`余额已刷新：${CURRENCY_SYMBOLS[balanceInfo.currency] || ''}${balanceInfo.total}`);
  } catch (e) {
    $('balanceText').textContent = '余额 --';
    $('balanceChip').title = `余额查询失败（${e.message}）\n使用第三方中转地址时通常不支持余额查询 · 点击重试`;
    if (!silent) toast('余额查询失败：' + e.message);
  } finally {
    balanceFetching = false;
  }
}



/* ---------- 演示模式：模拟流式输出 ---------- */

function demoOutput(task) {
  if (task.badge.includes('追问')) {
    return `**（演示模式 · 追问）**已按你的要求「${task.fu || '调整'}」对上一版结果做了优化：\n\n- 核心内容与关键信息完整保留\n- 表达方式已按新要求重新调整\n- 结构更清晰，阅读体验更好\n\n还想继续调整？可以再点一个追问，或在「补充要求」里写下具体规则后重新生成。`;
  }
  const first = task.input.replace(/\s+/g, ' ').slice(0, 40);
  const map = {
    '字幕': `1\n00:00:00,000 --> 00:00:03,200\n大家好，今天我们来聊一个话题\n\n2\n00:00:03,200 --> 00:00:07,500\n那就是**如何高效地**整理课堂笔记\n\n3\n00:00:07,500 --> 00:00:11,000\n（演示模式）实际使用时会保留你的原时间轴，只修正错别字和不通顺的地方。`,
    '剪辑': `**（演示模式）**视频定位：知识口播 · 竖屏 · 约 90 秒\n\n| 镜号 | 景别 | 画面内容 | 台词 / 口播 | 时长 |\n| :--- | :--- | :--- | :--- | :--- |\n| 1 | 特写 | 正面出镜，字幕高亮钩子 | 你是不是也记了笔记从来不再看？ | 4s |\n| 2 | 中景 | 展示杂乱的笔记本 | 问题的根源在于：你只在存储，没有整理 | 8s |\n| 3 | 近景 | 演示整理方法 | 试试这三步：拆分、提炼、自测 | 12s |\n\n（演示模式仅为格式示例，接入 API 后按你的文稿完整生成分镜。）`,
    '笔记': `## 第一章 绪论\n\n- 核心概念：xxx 的定义与三个特征\n- 关键公式：y = f(x) 的适用条件\n\n**⭐ 考点**\n- 名词解释：xxx（高频简答）\n- 计算题：公式适用条件判断\n\n## 第二章 方法\n\n- 分类：A / B / C 三类方法对比\n\n（演示模式仅为格式示例，接入 API 后按你的笔记完整整理。）`,
    '语法纠错': `**（演示模式）**以下是「语法纠错」效果示例：\n\n| 原句 | 修正后 |\n| :--- | :--- |\n| 通过这次活动，使同学们**深受**教育。 | 通过这次活动，同学们**深受**教育。 |\n| 他不仅聪明，**而且**很勤奋。（无错误示例） | 无需修改 |\n\n**修正后的全文**\n\n「${first}……」（演示模式下仅为格式示例，接入 API 后会逐句真实检查，无错误时会直接告知）。`,
    '学术润色': `**（演示模式）**以下是「学术润色」效果示例：\n\n「${first}……」润色后的表达更加严谨规范，句式逻辑更清晰，符合学术写作要求。\n\n| 修改内容 | 修改理由 |\n| :--- | :--- |\n| **做了**实验 → **开展了**实验 | 学术语境中动宾搭配更规范 |\n| 很**多**数据 → 大**量**数据 | 书面语更正式 |\n\n（演示模式下仅为格式示例，接入 API 后输出真实的润色文本与对照表。）`,
    '中译英': `**（演示模式）**以下是「中译英」效果示例：\n\n原文：「${first}……」\n\n译文：This study demonstrates that the proposed method significantly improves performance, which is consistent with previous findings.\n\n（演示模式下仅为格式示例，接入 API 后按学术英语规范真实翻译。）`,
    '英译中': `**（演示模式）**以下是「英译中」效果示例：\n\nThe proposed algorithm outperforms existing baselines.\n\n译文：所提出的算法（algorithm）优于现有基线方法。\n\n（演示模式下仅为格式示例，接入 API 后真实翻译并符合中文表达习惯。）`,
    '论文速读': `**（演示模式）**以下是「论文速读」效果示例：\n\n## 一句话概括\n提出一种新方法，在 XX 任务上取得显著提升。\n## 研究问题\n现有方法在长文本处理上效率不足。\n## 方法\n基于注意力机制的改进模型，使用 XX 数据集验证。\n## 主要发现\n- 准确率提升 5.2%\n- 推理速度提升 2 倍\n## 结论与局限\n方法有效但仅在英文数据集上验证。\n## 值得借鉴的点\n实验设计的对照组设置严谨。\n\n（演示模式下仅为格式示例，接入 API 后会真实通读你的论文并输出速读报告。）`,
    '润色': `**（演示模式）**以下是「润色」效果示例：\n\n原文开头「${first}……」经润色后，语句更加流畅自然，用词更加准确得体，错别字与标点问题已全部修正，整体表达更上一层楼。\n\n- 修正了错别字与标点\n- 优化了句式与衔接\n- 保持了原意与结构`,
    '精简': `**（演示模式）**以下是「精简」效果示例：\n\n核心信息保留，冗余表达已删除，篇幅压缩约 40%：\n\n- ${first}……（主干保留）\n- 删除了重复表述与空话`,
    '扩写': `**（演示模式）**以下是「扩写」效果示例：\n\n围绕「${first}……」这一核心，补充了细节与例证，使论述更充分、更有说服力，篇幅约为原来的 1.8 倍，且未编造任何事实。`,
    '摘要': `**（演示模式）**以下是「提炼重点」效果示例：\n\n- 核心主题：围绕「${first}……」展开\n- 关键信息 1：主要观点与论据\n- 关键信息 2：数据与事实支撑\n- 结论：对全文的最终落脚点`,
    '模板': `**（演示模式）**以下是生成的模板示例：\n\n主题：【待补充：邮件主题】\n\n尊敬的【待补充：收件人称呼】：\n\n您好！我是【待补充：你的身份】。关于「${first}……」一事，现说明如下：\n\n1. 具体情况：……\n2. 我的请求：……\n\n盼复，谢谢！\n\n此致\n敬礼\n\n【待补充：姓名】\n【待补充：日期】`,
    '转换': `**（演示模式）**以下是转换效果示例：\n\n「${first}……」——换成大白话就是：事情其实很简单，就是说清楚发生了什么、需要你做什么、什么时候做完就行。`,
    '重复风险': `**（演示模式）**以下是「重复风险自查」效果示例：\n\n整体风险评级：🟡 中 —— 存在多处常见套话与模板化表达，建议重点改写引言与结论段。\n\n| 原句摘录 | 风险类型 | 修改建议 |\n| :--- | :--- | :--- |\n| **随着经济的快速发展**，人们越来越关注…… | 高频套话 | 换成具体事实或数据切入，如「近十年城乡居民收入翻了 X 倍」 |\n| 综上所述，本文**具有一定的参考意义** | 模板化句式 | 换成具体结论：本研究为 XX 提供了 X 项可操作建议 |\n| 在**新时代背景下** | 书面八股 | 直接点明具体背景，如「2024 年 XX 政策实施后」 |\n\n**整体降重策略**\n- 套话开头改为数据 / 案例切入\n- 长句拆短，主动被动句式互换\n- 引用部分补充规范标注\n\n（演示模式仅为格式示例，接入 API 后会真实分析你的文稿。）`,
    '降重提示词': `**（演示模式）**已按「均衡改写」强度生成一段可复用的降重提示词：\n\n\`\`\`\n你是一位论文降重改写专家。请对以下文本做降重改写：\n1. 通过同义替换、句式重组、主被动转换、长短句变换改变表达；\n2. 严格保持原意、专业术语、数据和逻辑顺序不变；\n3. 整体改动幅度控制在 40%～60%；\n4. 不新增、不删除事实信息，不改变段落结构；\n5. 输出：改写后的完整文本 + 主要改写点对照表。\n\`\`\`\n\n**怎么改这段提示词**\n- 把「40%～60%」改成你想要的改动幅度\n- 追加一句「保留第 X 段不动」锁定不想改的部分\n- 补充「面向 XX 专业」让术语处理更专业`,
    '降重': `**（演示模式）**以下是「AI 降重改写」（均衡改写）效果示例：\n\n原文「${first}……」已保留原意、术语与数据，通过句式重组和同义替换完成改写，整体改动约 50%。\n\n**主要改写点**\n\n| 原句 | 改写后 |\n| :--- | :--- |\n| **随着经济的发展**，问题日益突出 | 经济快速发展**的同时**，这一问题**愈发凸显** |\n| 我们**采用了**问卷调查法 | 本研究**以问卷调查为主要方法** |\n\n（演示模式仅为格式示例，接入 API 后会真实改写你的文稿并附完整对照表。）`,
    '全面体检': `**（演示模式）**以下是「全面体检」效果示例：\n\n总评：文稿整体流畅，但存在 3 处错别字 / 标点 / 语病问题，主要集中在长句。\n\n| 位置 / 原句 | 问题类型 | 修改建议 |\n| :--- | :--- | :--- |\n| 通过这次活动，**使**同学们深受教育 | 语病（成分残缺） | 删去「使」，主语不再缺失 |\n| 他的建议**基本上**完全正确 | 用词矛盾 | 「基本上」与「完全」二选一 |\n| 研究方法包括问卷调查、**访谈、**数据分析…… | 标点误用 | 顿号后不应再加逗号，删去逗号 |\n\n**修改后的全文**\n\n「${first}……」（演示模式仅为格式示例，接入 API 后会逐句真实检查并输出修正全文。）`,
    '格式校验': `**（演示模式）**以下是「格式校验」效果示例：\n\n## 参考文献格式\n\n| 原条目 | 问题 | 规范写法 |\n| :--- | :--- | :--- |\n| 张三. 论文标题. 期刊名 2020 | 缺文献类型标识与卷期页码 | 张三. 论文标题[J]. 期刊名, 2020, 15(3): 12-18. |\n| Li M. A study on… 2019 | 外文文献缺出版信息 | Li M. A study on…[J]. Journal of X, 2019, 8(2): 45-52. |\n\n## 标题层级\n- 「2.1」之后直接出现「2.1.1.1」，建议层级不超过三级\n\n## 其他规范\n- 图 1 与「如图 3 所示」编号不对应，请核对\n\n（演示模式仅为格式示例，接入 API 后会按 GB/T 7714 逐条真实校验。）`,
    '敏感词': `**（演示模式）**以下是「敏感词检测」效果示例：\n\n总体结论：发现 2 处风险表述，1 处隐私信息，建议修改后再提交。\n\n| 风险表述 | 风险类型 | 建议 |\n| :--- | :--- | :--- |\n| 本产品是**最好的**、**100% 有效**的 | 绝对化用词（广告法禁用） | 改为「效果显著」「经测试有效率达 92%」 |\n| **保证**一次通过考试 | 承诺性话术 | 改为「有助于系统备考」 |\n| 联系人张同学，手机 138****5678 | 隐私信息 | 建议脱敏或删除 |\n\n（演示模式仅为格式示例，接入 API 后会真实扫描你的文稿。）`,
    '分析报告': `**（演示模式）**以下是「AI 对比报告」效果示例：\n\n## 修改概览\n总体改动幅度：中（约 40%），集中在引言与结论部分，主体数据段基本未动。\n\n## 主要修改点\n\n| 位置 | 版本 A | 版本 B | 修改性质 |\n| :--- | :--- | :--- | :--- |\n| 引言首段 | 随着经济的发展…… | 近十年数据切入 | 表述优化 |\n| 第二段 | （无） | 新增文献综述两篇 | 内容增删 |\n| 结论 | 具有一定参考意义 | 明确 3 项建议 | 表述优化 |\n\n## 质量评价\n新版本论证更具体、结论更落地；未发现信息丢失。\n\n（演示模式仅为格式示例，接入 API 后会真实对比你的两版文稿。）`,
    '检索关键词': `**（演示模式）**以下是「检索关键词」效果示例：\n\n## 中文关键词\n- 大学生学习投入（核心词）\n- 学习动机（近义词拓展）\n- 学业自我效能感（相关构念）\n\n## 英文关键词\n- academic engagement\n- learning motivation\n- self-efficacy\n\n## 检索式示例\n- 中文：学习投入 AND (大学生 OR 本科生) NOT 网络课程\n- 英文：("academic engagement" AND "undergraduate*") AND motivation\n\n## 检索建议\n- 先读 2～3 篇综述确定理论框架，再限定近 5 年文献\n\n（演示模式仅为格式示例，接入 API 后会按你的主题真实生成。）`,
    '7714': `**（演示模式）**以下是「参考文献格式化」（GB/T 7714）效果示例：\n\n[1] 张三, 李四. 人工智能在教育评价中的应用研究[J]. 中国电化教育, 2021, 42(5): 23-30.\n[2] 王五. 大学生学习行为研究[M]. 北京: 高等教育出版社, 2020: 45-52.\n[3] Smith J, Brown A. Learning analytics in higher education[J]. Comput Educ, 2022, 180: 104-112.\n[4] 教育部. 2022 年全国教育事业发展统计公报[EB/OL]. (2023-05-30). 【待补充：访问日期与网址】\n\n**提示**\n- 原第 3、4 条疑似同一文献重复，请核对\n\n（演示模式仅为格式示例，接入 API 后会逐条真实重排你的文献列表。）`,
    '要点提炼': `**（演示模式）**以下是「文献要点提炼」效果示例：\n\n## 基本信息\nDeep Learning for Image Classification（图像分类的深度学习方法），作者与年份：原文未提及\n\n## 核心要点\n- 研究问题：传统方法在小样本场景下准确率不足\n- 方法：提出改进的卷积神经网络结构\n- 数据：在两个公开数据集上验证\n- 主要发现：准确率提升 5.2%，推理速度提升 2 倍\n\n## 创新与局限\n新意在注意力模块设计；局限是仅在英文数据集验证。\n\n## 可引用金句\n- 「……注意力机制显著提升了模型表现」（原文）→ 可在综述方法部分引用\n\n（演示模式仅为格式示例，接入 API 后会真实提炼你粘贴的文献。）`,
    '思维导图': `# 文稿主题\n\n## 背景与问题\n- 行业现状\n- 核心痛点\n\n## 主要观点\n- 观点一：技术驱动\n  - 案例 A\n- 观点二：以人为本\n  - 案例 B\n\n## 结论与建议\n- 三条行动项\n\n（演示模式仅为格式示例，接入 API 后会按你的文稿真实生成；大纲可直接复制导入 XMind / 幕布。）`,
    '微信': `**（演示模式）**以下是「转微信消息」效果示例：\n\n王老师您好！关于明天的小组汇报，跟您确认一下😊\n\n【时间】下周三下午 2 点\n【地点】教学楼 302 会议室\n【需要您做的】帮我们看一版 PPT 大纲\n\n详细内容我整理在文档里了，稍后发您～辛苦老师！`,
    '邮件': `**（演示模式）**以下是「转规范邮件」效果示例：\n\n主题：【待补充：关于 XX 事项的说明与申请】\n\n尊敬的【待补充：收件人称呼】：\n\n您好！\n\n关于此前口头沟通的「${first}……」一事，现整理说明如下：\n\n1. 背景情况：……\n2. 我的诉求：……\n3. 时间安排：……\n\n盼复，谢谢！\n\n此致\n敬礼\n\n【待补充：姓名】\n【待补充：日期】`,
    '标题命名': `**（演示模式）**以下是「标题命名」效果示例（10 个备选）：\n\n\`学术严谨 | 基于深度学习的文本情感分析研究\`\n\`学术严谨 | 大学生短视频使用行为及其影响：一项实证研究\`\n\`学术严谨 | 面向校园场景的智能日程规划系统设计与实现\`\n\`简洁凝练 | 三步搭好你的知识体系\`\n\`简洁凝练 | 论拖延症的自我救治\`\n\`亮点突出 | 让 AI 当你的论文第一读者\`\n\`亮点突出 | 从 0 到 1：一份能落地的创业计划书\`\n\`设问悬念 | 为什么你记的笔记从来不再看？\`\n\`设问悬念 | 组会上导师到底想听什么？\`\n\`数字对仗 | 五个习惯，三周逆袭：期末复习实战指南\``,
  };
  const key = Object.keys(map).find(k => task.badge.includes(k)) || '润色';
  return map[key];
}

function demoAiReply(q) {
  if (/请假/.test(q)) return '**请假条三要素**～\n\n1. 标题居中写「请假条」\n2. 写清起止时间和原因（病假/事假说清即可）\n3. 结尾写「恳请批准」，署名 + 日期\n\n小提示：去「模板 → 请假条」，把原因和时间填好，10 秒生成哟 ✍️';
  if (/邮件/.test(q)) return '**写邮件的口诀**收好啦～\n\n主题一句话说清来意 → 开头称呼 + 问候 → 中间 1-3 段说清事情和诉求 → 结尾「盼复」+ 署名。\n\n用「模板 → 邮件」可以直接生成哦 (๑•̀ㅂ•́)و✧';
  if (/简历/.test(q)) return '**简历片段要点**：动词开头 + 具体成果 + 数字量化！\n\n例如「组织 3 场校园活动，覆盖 500+ 人次」这样就很棒～\n\n去「模板 → 简历片段」试试吧 (｡•ᴗ•｡)';
  return '演示模式：填好 API Key 后，小云可以——\n\n- 教你写各类文书（邮件、请假条、发言稿……）\n- 对生成结果提修改建议\n- 帮你判断文本用哪个功能最合适\n\n现在可以先点右上角「设置」开启 API，或问我「请假条怎么写？」看看效果哟～';
}

/* ---------- 生成主流程 ---------- */

function setGenerating(on) {
  state.generating = on;
  xwTalking(on); // 小云：生成时蹦跳说话
  $('stopBtn').classList.toggle('hidden', !on);
  $('regenBtn').disabled = on || !state.lastTask;
  const ab = $('applyBtn');
  if (ab) ab.disabled = on;
  document.querySelectorAll('.action-btn, .chip, .tab, .fu-chip').forEach(b => b.disabled = on);
}

async function generate(task) {
  if (state.generating && state.controller) state.controller.abort();
  state.lastTask = task;
  state.activeHistoryId = null;
  state.lastError = null;

  resultBadge.textContent = task.badge;
  $('tokenUsage').textContent = '';
  banner.classList.add('hidden');
  clearSrtTools();
  hideApply();
  $('exportBtn').classList.add('hidden');
  $('followups').classList.add('hidden');
  resultBody.innerHTML = `<div class="md"><p></p><span class="stream-cursor"></span></div>`;
  setGenerating(true);

  let out = '';
  let thinking = false;
  const paint = () => {
    const cursor = '<span class="stream-cursor"></span>';
    resultBody.innerHTML = `<div class="md">${out ? renderMarkdown(out) : (thinking ? '<p>💭 深度思考中…</p>' : '<p></p>')}${cursor}</div>`;
    resultBody.scrollTop = resultBody.scrollHeight;
  };

  state.controller = new AbortController();
  try {
    if (settings.demo) {
      const text = demoOutput(task);
      for (let i = 0; i < text.length && !state.controller.signal.aborted; i += 5) {
        out = text.slice(0, i + 5);
        paint();
        await new Promise(r => setTimeout(r, 16));
      }
      showUsage(demoUsage(task.input, out), true);
    } else {
      const trialAbort = () => { if (state.trialActive) { finishTrialMarkUsed(); toast('体验已使用（本次请求被取消，次数不退）'); } };
      state.controller.signal.addEventListener('abort', trialAbort, { once: true });
      await callDeepSeek(
        task.messages,
        (d) => { out += d; thinking = false; paint(); },
        () => { if (!out) { thinking = true; paint(); } },
        state.controller.signal,
        (u) => { recordUsage(u); showUsage(u, false); }
      );
      // 免费体验：请求已成功完成 → 标记本机已用
      finishTrialMarkUsed();
      // 本地模式兜底诊断：思考内容占满输出 / 模型过小 / 上下文截断时给出可操作的解决建议
      if (isLocalMode() && !state.controller.signal.aborted && out.replace(/\s/g, '').length < 2) {
        throw new Error(`本地模型没有输出有效正文（当前模型：${settings.ollamaModel}）。常见原因与对策：① 思考型模型把输出长度耗在思考上——云笺已自动剥离思考，若正文仍为空，建议换 qwen3:8b 等更大模型；② 上下文被截断——给 Ollama 设置环境变量 OLLAMA_CONTEXT_LENGTH=8192 后重启；③ 1.5b 以下小模型能力不足，复杂文书任务建议 8b 模型或在线模式。`);
      }
    }
    finishTask(task, out);
  } catch (err) {
    if (err.name === 'AbortError') {
      if (out.trim()) { finishTask(task, out + '\n\n*（已手动停止）*'); }
      else {
        resultBody.innerHTML = `<div class="result-error"><div class="err-title">已停止</div><p>本次生成已取消，未产生内容。</p></div>`;
        resultBadge.textContent = task.badge + ' · 已停止';
      }
    } else {
      state.lastError = err.message;
      const errHint = isLocalMode()
        ? '请确认 Ollama 正在运行、模型已拉取；也可到「设置」检查本地服务地址，或用顶栏切换回在线模式。'
        : '请检查网络与「设置」中的 API Key；若持续失败可开启演示模式体验功能。';
      resultBody.innerHTML = `<div class="result-error"><div class="err-title">⚠️ 出错了</div><p>${esc(err.message || String(err))}</p><p style="margin-top:6px;font-size:12.5px;color:#8c4a48">${errHint}</p></div>`;
      resultBadge.textContent = task.badge + ' · 失败';
    }
  } finally {
    setGenerating(false);
    state.controller = null;
    state.trialActive = false; // 体验只在单次生成内有效（追问/重新生成不再免单）
    updateStatus();
    renderTips();
  }
}

function finishTask(task, out) {
  // 字幕任务收尾校验：AI 改动了时间轴就自动用原时间轴修复；条目数变化则给出警告
  let srtNote = '';
  if (task.srt) {
    const rep = repairSrtTimeline(task.input, out);
    if (rep.repaired) { out = rep.out; srtNote = 'fixed'; }
    else if (rep.countMismatch) srtNote = 'warn';
  }
  state.lastOutput = out;
  // SRT 字幕用等宽排版展示更清晰（Markdown 会把序号/时间轴挤成段落）
  resultBody.innerHTML = task.srt
    ? `<div class="md"><pre style="white-space:pre-wrap"><code>${esc(out)}</code></pre></div>`
    : `<div class="md">${renderMarkdown(out)}</div>`;
  resultBody.scrollTop = 0;
  if (out.trim()) {
    addHistory({ badge: task.badge, input: task.input, output: out, applyMode: task.applyMode || '' });
    if (task.srt) {
      addSrtTools(out);
      const st = srtStats(out);
      if (st) mkToolChip(`🧮 ${st.count} 条 · ${st.duration}`);
      if (srtNote === 'warn') mkToolChip('⚠ AI 改动了字幕条数', 'srt-warn');
      $('exportBtn').classList.add('hidden'); // 字幕已有专用下载按钮
    } else {
      mkToolChip(`📄 ${out.replace(/\s/g, '').length} 字`);
      $('exportBtn').classList.remove('hidden');
    }
    const ab = $('applyBtn');
    if (task.applyMode) {
      ab.classList.remove('hidden');
      ab.textContent = '📥 应用到输入框';
      state.appliedBackup = null;
    }
    if (state.autoSlimNote) {
      const n = state.autoSlimNote;
      mkToolChip(`⚡ 自动瘦身 ${n.pct}% · 省 ${fmtNum(n.tokens)} tokens`, 'slim-ok');
      state.autoSlimNote = null;
    }
    $('followups').classList.remove('hidden');
    toast(srtNote === 'fixed' ? '已完成 · 检测到时间轴被改动，已自动恢复原时间轴' : srtNote === 'warn' ? '已完成，但 AI 改动了字幕条数，建议检查' : '已完成，已存入历史记录');
  }
}

/* 结果工具栏里的小徽章（字幕统计 / 警告） */
function mkToolChip(text, cls = '') {
  const tools = document.querySelector('.result-tools');
  if (!tools) return;
  const span = document.createElement('span');
  span.className = 'tool-chip' + (cls ? ' ' + cls : '');
  span.textContent = text;
  tools.insertBefore(span, tools.firstChild);
}

/* ---------- 历史记录 ---------- */

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('wg_history') || '[]'); } catch (e) { return []; }
}

function addHistory(rec) {
  const list = loadHistory();
  list.unshift({ id: Date.now() + '' + Math.floor(Math.random() * 1000), time: new Date().toISOString(), ...rec });
  if (list.length > 200) list.length = 200;
  localStorage.setItem('wg_history', JSON.stringify(list));
  renderHistory();
}

function renderHistory() {
  const kw = ($('historySearch')?.value || '').trim().toLowerCase();
  const all = loadHistory();
  const list = kw ? all.filter(r => `${r.badge} ${r.input} ${r.output}`.toLowerCase().includes(kw)) : all;
  const box = $('historyList');
  if (!all.length) {
    box.innerHTML = '<div class="history-empty">还没有记录<br>完成第一次处理后就会出现在这里</div>';
    return;
  }
  if (!list.length) {
    box.innerHTML = `<div class="history-empty">没有匹配「${esc(kw)}」的记录<br>试试其他关键词，或点右上角 ✕ 后重开</div>`;
    return;
  }
  box.innerHTML = list.map(r => `
    <div class="history-item ${state.activeHistoryId === r.id ? 'active' : ''}" data-id="${r.id}">
      <div class="hi-top">
        <span class="hi-badge">${esc(r.badge)}</span>
        <span class="hi-time">${fmtTime(r.time)}</span>
        <button class="hi-del" data-del="${r.id}" title="删除">✕</button>
      </div>
      <div class="hi-text">${esc(r.input.slice(0, 120))}</div>
    </div>`).join('');
}

function viewHistory(id) {
  const r = loadHistory().find(x => x.id === id);
  if (!r) return;
  state.activeHistoryId = id;
  state.lastOutput = r.output;
  // 历史回看不支持追问 / 重新生成；带 applyMode 的记录仍可一键应用到输入框
  state.lastTask = r.applyMode ? { badge: r.badge, input: r.input, applyMode: r.applyMode } : null;
  inputText.value = r.input;
  updateCharCount();
  resultBadge.textContent = r.badge + ' · 历史';
  $('tokenUsage').textContent = '';
  $('followups').classList.add('hidden');
  $('regenBtn').disabled = true;
  $('exportBtn').classList.remove('hidden');
  const ab = $('applyBtn');
  if (r.applyMode) {
    ab.classList.remove('hidden');
    ab.textContent = '📥 应用到输入框';
    state.appliedBackup = null;
  } else hideApply();
  resultBody.innerHTML = `<div class="md">${renderMarkdown(r.output)}</div>`;
  renderHistory();
  closeDrawer();
}

function deleteHistory(id) {
  const list = loadHistory().filter(x => x.id !== id);
  localStorage.setItem('wg_history', JSON.stringify(list));
  if (state.activeHistoryId === id) state.activeHistoryId = null;
  renderHistory();
}

/* ---------- 抽屉 / 弹窗 ---------- */

function openDrawer() { renderHistory(); $('historyDrawer').classList.add('open'); $('drawerMask').classList.remove('hidden'); }
function closeDrawer() { $('historyDrawer').classList.remove('open'); $('drawerMask').classList.add('hidden'); }

const AUTOSLIM_LABEL_ONLINE = '自动瘦身超长文本（在线 API 模式 · 默认开启：2000 字以上发送前自动压缩「发给 AI 的副本」省 Token——只清理空白与重复行，不改内容，输入框原文保持不变）';
const AUTOSLIM_LABEL_LOCAL = '自动瘦身超长文本（本地模式 · 默认关闭：本地模型不消耗 Token、不计费，无需省 Token；如想要更精炼的输入可开启——同样只清理空白与重复行，不改内容）';

/* 设置弹窗内按模式切换字段分组的可见性与瘦身勾选框 */
function syncSettingsModeFields() {
  const local = $('providerSelect').value === 'ollama';
  $('deepseekFields').classList.toggle('hidden', local);
  $('ollamaFields').classList.toggle('hidden', !local);
  $('autoSlim').checked = local ? settings.autoSlimLocal : settings.autoSlimOnline;
  $('autoSlimLabel').textContent = local ? AUTOSLIM_LABEL_LOCAL : AUTOSLIM_LABEL_ONLINE;
}

function openSettings() {
  $('providerSelect').value = settings.provider;
  $('apiKeyInput').value = settings.apiKey;
  $('modelSelect').value = settings.model;
  $('apiBaseInput').value = settings.apiBase;
  $('ollamaBaseInput').value = settings.ollamaBase;
  $('ollamaModelInput').value = settings.ollamaModel;
  $('demoMode').checked = settings.demo;
  syncSettingsModeFields();
  renderUsageStats();
  renderBalance();
  if (!settings.demo && !isLocalMode() && settings.apiKey) fetchBalance({ silent: true }); // 过期时自动刷新
  if (settings.provider === 'ollama') runOllamaDetect(true); // 打开设置时静默预检测本地模型
  $('settingsMask').classList.remove('hidden');
}
function closeSettings() { $('settingsMask').classList.add('hidden'); }

/* 顶栏快切 / 模式变化后统一刷新 UI 状态 */
function syncModeUI() {
  $('modeQuick').value = settings.provider;
  updateStatus();
  renderTips();
}

function updateStatus() {
  const dot = $('statusDot'), txt = $('statusText');
  $('modeQuick').value = settings.provider;
  if (settings.demo) { dot.className = 'dot demo'; txt.textContent = '演示模式'; }
  else if (isLocalMode()) {
    if (settings.ollamaModel) { dot.className = 'dot local'; txt.textContent = `本地 · ${settings.ollamaModel}`; }
    else { dot.className = 'dot'; txt.textContent = '本地模式 · 未选模型'; }
  }
  else if (state.trialActive) { dot.className = 'dot demo'; txt.textContent = '🎁 免费体验'; }
  else if (settings.apiKey) { dot.className = 'dot ok'; txt.textContent = '在线 · 已就绪'; }
  else { dot.className = 'dot'; txt.textContent = '未设置 API Key'; }
  const ready = settings.demo || !checkAIReady();
  banner.classList.toggle('hidden', ready);
  // 免费体验按钮：未填 Key、还没用过、非本地/演示模式时显示
  $('trialBannerBtn').classList.toggle('hidden', !trialEligible());
  $('balanceChip').classList.toggle('hidden', settings.demo || isLocalMode() || !settings.apiKey);
  if (!settings.demo && !isLocalMode() && settings.apiKey) renderBalance();
}

/* 窄屏下顶栏模式下拉用短文案（宽屏恢复完整文案） */
const mqNarrow = window.matchMedia('(max-width: 560px)');
function syncModeQuickOptions() {
  const short = mqNarrow.matches;
  const opt = $('modeQuick');
  opt.options[0].textContent = short ? '🌐 在线' : '🌐 在线 · DeepSeek';
  opt.options[1].textContent = short ? '💻 本地' : '💻 本地 · Ollama';
}
mqNarrow.addEventListener('change', syncModeQuickOptions);
window.addEventListener('resize', syncModeQuickOptions);
syncModeQuickOptions();

/* ---------- Tab 切换 ---------- */

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ['polish', 'summary', 'template', 'convert', 'check', 'proof', 'compare', 'academic', 'lit', 'note', 'ppt', 'clip'].forEach(t => $(`panel-${t}`).classList.toggle('hidden', t !== tab));
  // 视频剪辑 / 录音转写 / 提示词库 / 批量处理 / 答辩模拟是独立工作区
  const isVideo = tab === 'video';
  const isAudio = tab === 'audio';
  const isPrompts = tab === 'prompts';
  const isBatch = tab === 'batch';
  const isDefense = tab === 'defense';
  document.querySelector('.workspace').classList.toggle('hidden', isVideo || isAudio || isPrompts || isBatch || isDefense);
  $('videoWorkspace').classList.toggle('hidden', !isVideo);
  $('audioWorkspace').classList.toggle('hidden', !isAudio);
  $('promptsWorkspace').classList.toggle('hidden', !isPrompts);
  $('batchWorkspace').classList.toggle('hidden', !isBatch);
  $('defenseWorkspace').classList.toggle('hidden', !isDefense);
  if (isVideo) { renderVFiles(); renderVOps(); return; }
  if (isAudio) { auOnShow(); return; }
  if (isPrompts) { renderPromptCats(); renderPrompts(); return; }
  if (isBatch) { renderBatch(); return; }
  inputText.placeholder = TAB_PLACEHOLDERS[tab];
  if (tab === 'template') $('templateHint').textContent = TEMPLATE_HINTS[state.template];
  renderTips();
}

function selectTemplate(tpl) {
  state.template = tpl;
  document.querySelectorAll('#templateChips .chip').forEach(c => c.classList.toggle('active', c.dataset.tpl === tpl));
  $('templateHint').textContent = TEMPLATE_HINTS[tpl];
}

/* ---------- 智能提示引擎（AI 小助手的主动提示） ---------- */

function analyzeContext() {
  const text = inputText.value.trim();
  const len = text.length;
  const tips = [];

  if (isLocalMode() && !settings.ollamaModel && !settings.demo) {
    tips.push({ icon: '💻', text: '本地模式还没有选择模型哦～启动 Ollama 后到「设置」点「🔍 检测」就能自动获取已装的模型。', act: openSettings, actName: '去设置' });
  } else if (!settings.apiKey && !isLocalMode() && !settings.demo) {
    if (trialEligible()) {
      tips.push({ icon: '🎁', text: `还有 ${trialRemaining()} 次免费体验（真实 AI 生成，由作者承担费用）！粘贴文本后点任意功能按钮即可。`, act: () => openTrialConfirm(null), actName: '了解详情' });
    } else {
      tips.push({ icon: '🔑', text: '还没有设置 API Key 哦～可以填入 DeepSeek Key（在线模式），或切换到本地离线模式（免费、不耗 token）。', act: openSettings, actName: '去设置' });
    }
  }

  if (settings.apiKey && !settings.demo && !isLocalMode() && balanceInfo) {
    if (balanceInfo.available === false) {
      tips.push({ icon: '💰', text: `账户余额已不足（剩 ${balanceInfo.total} ${balanceInfo.currency}），AI 已暂停服务，请前往 DeepSeek 平台充值；也可以切到本地模型继续用（免费）。`, act: () => switchToLocalThen(() => toast('已切到本地模式')), actName: '切本地模式' });
    } else if (parseFloat(balanceInfo.total) < 5) {
      tips.push({ icon: '💰', text: `余额只剩 ${CURRENCY_SYMBOLS[balanceInfo.currency] || ''}${balanceInfo.total}，快用完啦，记得及时充值～`, act: () => fetchBalance({ force: true }), actName: '刷新余额' });
    }
  }

  if (len === 0) {
    tips.push({ icon: '💡', text: '粘贴一段文字开始吧！润色、摘要、写模板、转换语气，粘贴后我会告诉你要用哪个。' });
  } else {
    if (len >= 600) {
      tips.push({ icon: '📄', text: `检测到长文本（${len} 字）。读不完？用「文档摘要」几秒提炼重点。`, act: () => switchTab('summary'), actName: '去摘要' });
    }
    // 省 Token 联动：在线模式下检测到长文本，主动提示可以切换本地模型（免费、不耗 token）
    if (len >= LOCAL_HINT_MIN_CHARS && !isLocalMode() && !settings.demo && !settings.longTextHintOff) {
      tips.push({ icon: '💻', text: `这段有 ${fmtNum(len)} 字，用在线 API 会消耗不少 Token。可以切换本地模型（Ollama）处理——免费、不消耗 Token、断网也能用～`, act: () => switchToLocalThen(() => toast('已切到本地模式，接下来生成都免费')), actName: '切本地模式' });
    }
    if (len >= 3000) {
      tips.push({ icon: '⚡', text: `这段有 ${fmtNum(len)} 字，直接处理比较耗 token。先点输入框下方的「⚡ 瘦身」本地压缩一下，一般能省 10%～30%，不花一分钱～`, act: runSlim, actName: '去瘦身' });
    }
    const lines = text.split('\n').filter(l => l.trim());
    const speakerLines = lines.filter(l => /^[^\s：:]{1,14}[：:]/.test(l.trim())).length;
    if (lines.length >= 5 && (/\d{1,2}:\d{2}/.test(text) || speakerLines >= Math.max(2, lines.length * 0.35))) {
      tips.push({ icon: '💬', text: '这看起来像聊天记录！摘要时把「内容类型」选成「聊天记录」，能自动梳理各方观点和待办。', act: () => { switchTab('summary'); $('summaryType').value = 'chat'; state.summaryType = 'chat'; }, actName: '去摘要' });
    }
    const kwTip = [
      { re: /请假|休假|病假|事假/, icon: '📝', text: '要请假？用「模板生成 → 请假条」，写明原因和时间就能生成规范请假条。', tpl: 'leave', name: '写请假条' },
      { re: /邮件|邮箱|尊敬的|回复.{0,4}(老师|领导|HR)/, icon: '📧', text: '像是要写邮件？用「模板生成 → 邮件」，含主题行直接可发。', tpl: 'email', name: '写邮件' },
      { re: /简历|求职|面试|实习|自我评价/, icon: '📄', text: '在弄简历？「模板生成 → 简历片段」帮你把经历写成动词开头、数字量化的亮点。', tpl: 'resume', name: '写简历' },
      { re: /发言|演讲|主持|开场白|竞选/, icon: '🎤', text: '要上台发言？「模板生成 → 发言稿」按场合生成，控制时长。', tpl: 'speech', name: '写发言稿' },
      { re: /汇报|周报|述职|工作总结|提纲|答辩/, icon: '📊', text: '要做汇报？「模板生成 → 汇报提纲」帮你理清结构。', tpl: 'report', name: '写提纲' },
    ].find(k => k.re.test(text));
    if (kwTip) tips.push({ icon: kwTip.icon, text: kwTip.text, act: () => { switchTab('template'); selectTemplate(kwTip.tpl); }, actName: kwTip.name });

    const longSentences = text.split(/[。！？；]/).filter(s => s.trim().length > 45).length;
    if (longSentences >= 2) {
      tips.push({ icon: '🗣️', text: '句子普遍偏长、书面腔较重。用「语言转换 → 书面语→口语」或「复杂文字简化」让人一听就懂。', act: () => switchTab('convert'), actName: '去转换' });
    }
    const enChars = (text.match(/[A-Za-z]/g) || []).length;
    const looksPaper = /(论文|文献|摘要|关键词|参考文献|Abstract|Keywords|研究方法|Conclusion|Introduction)/i.test(text);
    if (enChars > len * 0.5 && len >= 80) {
      tips.push({ icon: '🎓', text: '检测到较多英文内容。用「学术助手 → 英译中」翻成地道中文，或用「语法纠错」检查英文语法。', act: () => switchTab('academic'), actName: '去学术助手' });
    } else if (looksPaper) {
      tips.push({ icon: '🎓', text: '这看起来和论文有关！「学术助手」提供学术润色（附修改对照表）、语法纠错、中英互译和论文速读。', act: () => switchTab('academic'), actName: '去学术助手' });
    }
    if (looksPaper && len >= 300) {
      tips.push({ icon: '🧬', text: '论文/作业怕重复？「查重降重」先做重复风险自查，再 AI 改写降重——保留原意，只换句式词汇。', act: () => switchTab('check'), actName: '去查重降重' });
    }
    if (/参考文献/.test(text) && len >= 200) {
      tips.push({ icon: '📐', text: '检测到参考文献！「审校 → 格式校验」能按 GB/T 7714 国标逐条检查，标题层级也能一起校验；「文献」页还能一键格式化。', act: () => switchTab('proof'), actName: '去审校' });
    }
    if (/(课堂笔记|讲义|考点|复习|重点整理|上课.{0,6}记|网课)/.test(text)) {
      tips.push({ icon: '📚', text: '像是要整理学习内容！「笔记」模块能拆章节、提考点、出复习提纲和自测题，还能生成 XMind 思维导图。', act: () => switchTab('note'), actName: '去笔记' });
    } else if (/(分镜|口播|短视频|拍摄脚本|vlog|转场|字幕)/i.test(text)) {
      tips.push({ icon: '🎬', text: '在做视频内容？「剪辑助手」能生成分镜脚本、剪辑方案，还能把文稿转成 SRT 字幕直接导入剪映。', act: () => switchTab('clip'), actName: '去剪辑助手' });
    } else if (/(PPT|幻灯片|答辩|演示文稿|slides)/i.test(text) && state.tab !== 'ppt') {
      tips.push({ icon: '📊', text: '要准备 PPT？「PPT」模块输入主题就能生成整份大纲，逐页编辑后一键导出 .pptx。', act: () => switchTab('ppt'), actName: '去做 PPT' });
    }
    if (len < 40 && state.tab === 'template') {
      tips.push({ icon: '✍️', text: '关键信息越具体，模板越好用：写清对象、时间、事由和你的诉求～' });
    }
  }

  if (state.lastError) {
    tips.push({ icon: '🛠️', text: `上一次生成失败了：${state.lastError} 可检查${isLocalMode() ? '本地 Ollama 是否在运行' : 'Key / 网络'}，或开演示模式先体验。`, act: openSettings, actName: '去检查' });
  }

  return tips.slice(0, 3);
}

function renderTips() {
  const tips = analyzeContext();
  const box = $('aiTips');
  const panelOpen = !$('aiPanel').classList.contains('hidden');
  $('aiFabDot').classList.toggle('hidden', panelOpen || !tips.some(t => t.act));
  if (!tips.length) {
    box.innerHTML = '<div class="tip-card"><span class="tip-icon">✨</span><span>目前一切就绪，粘贴文本开始吧～</span></div>';
    return;
  }
  box.innerHTML = tips.map((t, i) =>
    `<div class="tip-card"><span class="tip-icon">${t.icon}</span><span>${esc(t.text)}</span>${t.act ? `<button class="tip-act" data-tip="${i}">${esc(t.actName)}</button>` : ''}</div>`
  ).join('');
  box._acts = tips.map(t => t.act || null);
}

/* ---------- AI 小助手问答 ---------- */

let aiHistory = [];
let aiBusy = false;

function addAiMsg(role, html) {
  const div = document.createElement('div');
  div.className = 'ai-msg ' + role;
  // AI 气泡带随机表情头像，返回内容元素便于流式更新（不动头像）
  div.innerHTML = role === 'ai'
    ? `<img class="ai-msg-avatar" src="${xwAvatar()}" alt="" onerror="this.style.display='none'"><div class="ai-bubble">${html}</div>`
    : html;
  $('aiChat').appendChild(div);
  $('aiChat').scrollTop = $('aiChat').scrollHeight;
  return role === 'ai' ? div.querySelector('.ai-bubble') : div;
}

async function aiAsk() {
  const q = $('aiInput').value.trim();
  if (!q || aiBusy) return;
  const notReadyAi = checkAIReady();
  if (notReadyAi) { openSettings(); toast(notReadyAi); return; }

  $('aiInput').value = '';
  addAiMsg('user', renderMarkdown(q));
  aiHistory.push({ role: 'user', content: q });

  aiBusy = true;
  $('aiSend').disabled = true;
  const bubble = addAiMsg('ai', '<span class="stream-cursor"></span>');
  let out = '';
  const paint = () => { bubble.innerHTML = renderMarkdown(out) + '<span class="stream-cursor"></span>'; $('aiChat').scrollTop = $('aiChat').scrollHeight; };

  const ctrl = new AbortController();
  try {
    if (settings.demo) {
      const text = demoAiReply(q);
      for (let i = 0; i < text.length && !ctrl.signal.aborted; i += 4) {
        out = text.slice(0, i + 4);
        paint();
        await new Promise(r => setTimeout(r, 18));
      }
    } else {
      await callDeepSeek(
        [{ role: 'system', content: AI_SYS }, ...aiHistory.slice(-9)],
        (d) => { out += d; paint(); },
        null,
        ctrl.signal,
        (u) => recordUsage(u)
      );
    }
    bubble.innerHTML = renderMarkdown(out);
    aiHistory.push({ role: 'assistant', content: out });
    if (aiHistory.length > 12) aiHistory = aiHistory.slice(-12);
  } catch (err) {
    bubble.innerHTML = renderMarkdown(err.name === 'AbortError' ? '*（已停止）*' : '⚠️ ' + (err.message || String(err)));
  } finally {
    aiBusy = false;
    $('aiSend').disabled = false;
    $('aiChat').scrollTop = $('aiChat').scrollHeight;
  }
}

/* ---------- 文本瘦身 · 省 Token ----------
 * 思路来自开源项目 Headroom（可逆上下文压缩：原文始终保留在用户手里）与
 * LLMLingua（提示压缩：先去低信息量内容再喂给模型）。这里用纯本地规则实现，
 * 不调用模型、不耗 AI：conservative 模式只清理空白与重复行（自动瘦身用），
 * 完整模式额外压缩口水词、重复标点与叠字（手动「⚡ 瘦身」用）。 */

/* token 估算（DeepSeek 分词近似：中日韩字符 ≈0.6 token，其余 ≈0.3） */
function estTokens(s) {
  const cjk = (s.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
  return Math.round(cjk * 0.6 + (s.length - cjk) * 0.3);
}

/* 是否是 SRT 字幕：需要保护序号行与时间轴行，且不做行去重 */
function looksLikeSrt(s) { return (s.match(/-->/g) || []).length >= 3; }

const SRT_TIMING_RE = /^\s*\d+\s*$|-->|\u2192/; // 序号行 / 时间轴行原样保留

function slimText(raw, conservative = false) {
  const before = String(raw || '');
  if (!before) return { out: '', changed: false, savedChars: 0 };
  const isSrt = looksLikeSrt(before);

  // 全局清理：换行归一化、去零宽字符与不可见控制字符
  let s = before
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  const lines = s.split('\n');
  const out = [];
  let prevBlank = false, inCode = false, prevLine = null;
  for (let l of lines) {
    if (/^\s*```/.test(l)) inCode = !inCode;
    const code = inCode || /^\s*```/.test(l);
    const protectedLine = isSrt && SRT_TIMING_RE.test(l); // SRT 的序号/时间轴行
    // 行尾空白
    l = protectedLine ? l : l.replace(/[ \t]+$/, '');
    // 连续空行压成一行
    const blank = l.trim() === '';
    if (blank) {
      if (prevBlank) continue;
      prevBlank = true; prevLine = null; out.push(''); continue;
    }
    prevBlank = false;
    // 连续完全重复行去重：纯复制粘贴噪音；代码块与 SRT 不动。
    // 自动（保守）模式只去重 4 字以上的行，避免聊天记录里连续的「好的」「嗯」被误合并
    if (!code && !isSrt && l === prevLine && (!conservative || l.trim().length >= 4)) continue;
    prevLine = l;

    if (!code && !protectedLine && !conservative) {
      // 表格行整体不动内部空格，避免破坏对齐（叠字压缩也会把对齐空格压掉，所以一并跳过）
      if (!l.trim().startsWith('|')) {
        // 压行内连续空格但保留行首缩进
        l = l.replace(/(\S)[ \t]{2,}/g, '$1 ').replace(/[ \t]+$/, '');
        // 超长同字串：哈哈哈哈哈哈(6+)→哈哈哈；长分隔线同样压短
        if (!l.includes('http')) l = l.replace(/(.)\1{5,}/g, '$1$1$1');
      }
      // 重复标点：！！！→！ ？？？→？ 。。。→…… ～～～→～
      l = l.replace(/([！？!?，,～~])\1{1,}/g, '$1').replace(/。{2,}/g, '……').replace(/\.{6,}/g, '……');
      // 口水词叠用：然后然后→然后 就是就是→就是 ……
      l = l.replace(/(然后|就是|就是说|那个|这个|但是|可是|所以|因为|其实|反正|真的)(?=\1)/g, '');
      // 单字结巴：我我我→我（只限常见代词，不影响「谢谢」「想想」这类叠词）
      l = l.replace(/([我你他她它嗯呃])\1{1,}/g, '$1');
    }
    out.push(l);
  }
  const outStr = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s+$/g, '');
  return {
    out: outStr,
    changed: outStr !== before.trim(),
    savedChars: before.length - outStr.length,
  };
}

/* 手动「⚡ 瘦身」：替换输入框内容，原文备份用于一键还原 */
let slimBackup = null;

function runSlim() {
  const text = inputText.value;
  if (!text.trim()) { toast('输入框还是空的，先粘贴内容再瘦身～'); inputText.focus(); return; }
  const r = slimText(text, false);
  if (!r.changed || r.savedChars <= 0) { toast('这段文本已经很精炼啦，没有可压缩的空间 (｡•ᴗ•｡)'); return; }
  slimBackup = text;
  inputText.value = r.out;
  updateCharCount(); renderTips();
  const pct = Math.round(r.savedChars / text.length * 100);
  const info = $('slimInfo');
  info.textContent = `⚡ 已瘦身 ${pct}% · ≈省 ${fmtNum(estTokens(text) - estTokens(r.out))} tokens`;
  info.title = `瘦身前 ${fmtNum(text.length)} 字（≈${fmtNum(estTokens(text))} tokens）\n瘦身后 ${fmtNum(r.out.length)} 字（≈${fmtNum(estTokens(r.out))} tokens）\n清理了空白冗余、重复行/标点与口水词，点「↩ 还原」可撤销`;
  info.classList.remove('hidden');
  $('slimUndo').classList.remove('hidden');
  toast(`瘦身完成：${fmtNum(text.length)} → ${fmtNum(r.out.length)} 字（-${pct}%），内容不变、可随时还原`);
}

function undoSlim() {
  if (slimBackup == null) return;
  inputText.value = slimBackup;
  slimBackup = null;
  $('slimInfo').classList.add('hidden');
  $('slimUndo').classList.add('hidden');
  updateCharCount(); renderTips();
  toast('已还原为瘦身前的原文');
}

/* 自动瘦身：发送前对超长文本做保守清理；只影响发给 AI 的副本，输入框原文保持不动。
   联动规则：在线 API 默认开启（省 token 就是省钱）；本地模型默认关闭（不计费，无需省 token），可手动开启 */
const AUTOSLIM_MIN_CHARS = 2000;

function autoSlimEnabled() {
  return isLocalMode() ? settings.autoSlimLocal : settings.autoSlimOnline;
}

function autoSlimText(text) {
  if (!autoSlimEnabled() || text.length < AUTOSLIM_MIN_CHARS) return { text, note: null };
  const r = slimText(text, true);
  if (!r.changed || r.savedChars <= Math.max(20, text.length * 0.01)) return { text, note: null };
  const pct = Math.round(r.savedChars / text.length * 100);
  return { text: r.out, note: { before: text.length, after: r.out.length, pct, tokens: estTokens(text) - estTokens(r.out) } };
}

/* ---------- 执行入口 ---------- */

const TAB_PRIMARY = { polish: 'polish', summary: 'summarize', template: 'template', convert: 'toCasual', check: 'dupRewrite', proof: 'proofCheck', compare: 'diffNow', academic: 'acPolish', lit: 'litKeywords', note: 'noteSplit', ppt: 'pptGen', clip: 'clipScript' };

function run(action) {
  if (action === 'subExtract') { extractEmbeddedSubs(); return; }
  if (action === 'diffNow') { runDiff(); return; } // 本地对比不耗 AI，无需检查 Key
  if (action === 'subSplitLocal') { runLocalSplit(); return; } // 本地断句同样不耗 AI
  const text = inputText.value.trim();
  if (!text) { toast('请先输入内容'); inputText.focus(); return; }
  const notReady = checkAIReady();
  if (notReady) {
    // 未填 Key 的新访客：提供「免费体验 1 次」
    if (trialEligible()) {
      if (text.length > TRIAL_MAX_CHARS) { toast(`免费体验单次限 ${fmtNum(TRIAL_MAX_CHARS)} 字：先点「⚡ 瘦身」或截取部分内容`); return; }
      openTrialConfirm(action);
      return;
    }
    openSettings(); toast(notReady); return;
  }
  // 省 Token 联动：在线模式下检测到长文本，先弹窗建议切换本地模型（免费、不耗 token）
  if (!settings.demo && !isLocalMode() && !settings.longTextHintOff && state.onlineNoHint !== text.length
      && text.length >= LOCAL_HINT_MIN_CHARS) {
    openLocalHint(text,
      () => switchToLocalThen(() => run(action)),   // 切到本地模型后重新走一遍（本地模式不再弹窗）
      () => { state.onlineNoHint = text.length; run(action); }); // 继续在线：本次会话对同长度不再提示
    return;
  }
  if (action === 'pptGen') { generatePPT(text); return; }
  if (action === 'diffReport') { runDiffReport(); return; }
  if (action === 'subTranslate') { translateSubtitles(); return; }
  // 自动瘦身：超长文本发送前本地压缩「发给 AI 的副本」，输入框原文不动，省 Token 不改内容
  const sl = autoSlimText(text);
  state.autoSlimNote = sl.note || null;
  generate(buildTask(action, sl.text));
}

/* ---------- 长文本 · 切换本地模型提示（省 Token 联动） ---------- */

let localHintCtx = null; // { useLocal, keepOnline }

function openLocalHint(text, useLocal, keepOnline) {
  $('localHintText').textContent =
    `检测到长文本（${fmtNum(text.length)} 字 ≈ ${fmtNum(estTokens(text))} tokens），在线模式会消耗较多 Token。可以切换本地模型，不消耗 Token。`;
  $('lhNoHint').checked = false;
  localHintCtx = { useLocal, keepOnline };
  $('localHintMask').classList.remove('hidden');
}

function closeLocalHint() {
  $('localHintMask').classList.add('hidden');
  localHintCtx = null;
}

/* 切换到本地模式；还没有可用模型时先自动检测，检测不到则引导去设置 */
async function switchToLocalThen(cb) {
  if (!settings.ollamaModel) {
    try {
      const models = await detectOllamaModels();
      if (models && models.length) {
        settings.ollamaModel = models[0];
        const inp = $('ollamaModelInput');
        if (inp) inp.value = models[0];
      }
    } catch (e) { /* 检测失败走下方引导 */ }
  }
  if (!settings.ollamaModel) {
    syncModeUI();
    openSettings();
    toast('还没有可用的本地模型：请先启动 Ollama 并在设置中点「🔍 检测」选择模型');
    return;
  }
  settings.provider = 'ollama';
  saveSettings();
  syncModeUI();
  toast('已切换到本地离线模式（免费 · 不消耗 Token）');
  if (cb) cb();
}

/* 检测本地 Ollama 服务与已装模型（GET /api/tags，借鉴 MaxKB 的模型列表获取方式） */
async function detectOllamaModels(baseOverride) {
  const base = (baseOverride || settings.ollamaBase).replace(/\/+$/, '');
  const tagsBase = base.replace(/\/v1$/, ''); // /v1 是 OpenAI 兼容前缀，模型列表走原生 /api/tags
  const res = await fetch(`${tagsBase}/api/tags`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return (j.models || []).map(m => m.model || m.name).filter(Boolean);
}

/* ---------- 免费体验 1 次（Worker 中转，访客无 Key 可用） ---------- */

let trialPendingAction = null;

function openTrialConfirm(action) {
  trialPendingAction = action || TAB_PRIMARY[state.tab] || null;
  $('trialMask').classList.remove('hidden');
}

function enterTrial() {
  state.trialActive = true;
  updateStatus();
  renderTips();
  toast(`已进入体验模式（本机剩余 ${trialRemaining()} 次）：点任意功能按钮生成真实结果`);
}

function finishTrialMarkUsed() {
  if (state.trialActive) {
    localStorage.setItem(TRIAL_USED_KEY, String(trialUsedCount() + 1));
    updateStatus();
    renderTips();
    const left = trialRemaining();
    if (left > 0) toast(`体验成功！本机还剩 ${left} 次免费体验`);
    else toast('体验次数已用完：填入 DeepSeek Key 或切换本地模式即可无限使用');
  }
}

/* ---------- 多版本文稿对比（本地 LCS diff + AI 报告） ---------- */

const DIFF_MAX_LINES = 2500;  // 行数上限
const DIFF_INLINE_MAX = 500;  // 单行字符级比对的长度上限

/* 通用 LCS：A、B 为字符串（或字符）数组，返回 [{ t: 'eq'|'del'|'ins', s }] */
function lcsOps(A, B) {
  const n = A.length, m = B.length, w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = A[i] === B[j]
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ t: 'eq', s: A[i] }); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push({ t: 'del', s: A[i++] }); }
    else { ops.push({ t: 'ins', s: B[j++] }); }
  }
  while (i < n) ops.push({ t: 'del', s: A[i++] });
  while (j < m) ops.push({ t: 'ins', s: B[j++] });
  return ops;
}

/* 成对的「单行删 + 单行增」做字符级定位：删除线标出被改的字，下划线标出新增的字 */
function charPairDiff(oldStr, newStr) {
  const ops = lcsOps(oldStr.split(''), newStr.split(''));
  const delHTML = ops.filter(o => o.t !== 'ins').map(o => o.t === 'eq' ? esc(o.s) : `<span class="dch">${esc(o.s)}</span>`).join('');
  const insHTML = ops.filter(o => o.t !== 'del').map(o => o.t === 'eq' ? esc(o.s) : `<span class="ich">${esc(o.s)}</span>`).join('');
  return [delHTML, insHTML];
}

function runDiff() {
  const a = inputText.value.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  const b = ($('compareTextB').value || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  if (!a.trim() || !b.trim()) {
    toast('两个版本都需要内容：主输入框 = 版本 A（原稿），下方 = 版本 B（新稿）');
    (!a.trim() ? inputText : $('compareTextB')).focus();
    return;
  }
  const A = a.split('\n'), B = b.split('\n');
  if (A.length > DIFF_MAX_LINES || B.length > DIFF_MAX_LINES) { toast(`文稿过长（上限 ${DIFF_MAX_LINES} 行），请截取后对比`); return; }

  resultBadge.textContent = '对比 · 高亮差异';
  $('tokenUsage').textContent = '';
  banner.classList.add('hidden');
  clearSrtTools();
  hideApply();
  $('followups').classList.add('hidden');
  state.lastTask = null;
  state.activeHistoryId = null;
  state.lastError = null;
  $('regenBtn').disabled = true;

  const ops = lcsOps(A, B);
  let del = 0, ins = 0, eq = 0;
  ops.forEach(o => { if (o.t === 'del') del++; else if (o.t === 'ins') ins++; else eq++; });
  const similar = Math.round(200 * eq / Math.max(1, A.length + B.length));

  /* ops → 渲染块（成对单行做字符级高亮） */
  const blocks = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].t === 'eq') { blocks.push({ t: 'eq', s: ops[i].s }); i++; continue; }
    const dels = [], inss = [];
    while (i < ops.length && ops[i].t === 'del') dels.push(ops[i++].s);
    while (i < ops.length && ops[i].t === 'ins') inss.push(ops[i++].s);
    if (dels.length === 1 && inss.length === 1 && dels[0].length <= DIFF_INLINE_MAX && inss[0].length <= DIFF_INLINE_MAX) {
      const [dHTML, iHTML] = charPairDiff(dels[0], inss[0]);
      blocks.push({ t: 'del', s: dels[0], html: dHTML || '&nbsp;' }, { t: 'ins', s: inss[0], html: iHTML || '&nbsp;' });
    } else {
      dels.forEach(s => blocks.push({ t: 'del', s }));
      inss.forEach(s => blocks.push({ t: 'ins', s }));
    }
  }

  /* 折叠大段未改动内容，让差异一目了然 */
  const out = [];
  let runEq = [];
  const flushEq = () => {
    if (!runEq.length) return;
    if (runEq.length > 14) {
      out.push(...runEq.slice(0, 3).map(s => ({ t: 'eq', s })));
      out.push({ t: 'fold', n: runEq.length - 6 });
      out.push(...runEq.slice(-3).map(s => ({ t: 'eq', s })));
    } else out.push(...runEq.map(s => ({ t: 'eq', s })));
    runEq = [];
  };
  for (const bl of blocks) {
    if (bl.t === 'eq') runEq.push(bl.s);
    else { flushEq(); out.push(bl); }
  }
  flushEq();

  let html = `<div class="diff-stats">📊 新增 <b>${ins}</b> 行 · 删除 <b>${del}</b> 行 · 保留 <b>${eq}</b> 行 · 行级重合度约 <b>${similar}%</b><span class="diff-legend"><span class="lg-del"><i></i>删除</span><span class="lg-ins"><i></i>新增</span></span></div><div class="diff-wrap">`;
  let txt = `【文稿对比报告】\n新增 ${ins} 行 · 删除 ${del} 行 · 保留 ${eq} 行 · 行级重合度约 ${similar}%\n\n`;
  out.forEach(bl => {
    if (bl.t === 'eq') { html += `<div class="diff-line">${esc(bl.s) || '&nbsp;'}</div>`; txt += `  ${bl.s}\n`; }
    else if (bl.t === 'fold') { html += `<div class="diff-gutter">⋯ 已折叠 ${bl.n} 行未改动内容 ⋯</div>`; txt += `…… 已折叠 ${bl.n} 行未改动内容 ……\n`; }
    else if (bl.t === 'del') { html += `<div class="diff-line dl">${bl.html ?? esc(bl.s)}</div>`; txt += `- ${bl.s}\n`; }
    else { html += `<div class="diff-line in">${bl.html ?? esc(bl.s)}</div>`; txt += `+ ${bl.s}\n`; }
  });
  html += '</div>';

  state.lastOutput = txt;
  resultBody.innerHTML = html;
  resultBody.scrollTop = 0;
  $('exportBtn').classList.remove('hidden');
  addHistory({ badge: '对比 · 高亮差异', input: a, output: txt });
  toast('对比完成，已存入历史记录');
}

/* AI 对比报告：两个版本一起交给 AI 分析 */
function runDiffReport() {
  const a = inputText.value.trim();
  const b = ($('compareTextB').value || '').trim();
  if (!a || !b) { toast('AI 报告需要两个版本：主输入框 = 版本 A（原稿），下方 = 版本 B（新稿）'); return; }
  const sys = buildSystem('diffReport');
  generate({
    badge: '对比 · AI 分析报告',
    input: a,
    sys,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: `【版本 A · 原稿】\n${a}\n\n【版本 B · 新稿】\n${b}` }],
  });
}

/* ---------- SRT 工具（宽容解析 · 时间轴修复 · 统计）——借鉴 VideoCaptioner / SmartSub ---------- */

/* 宽容的 SRT 解析：序号可缺、多行文本、多余空行都能读 */
function parseSrt(text) {
  const t = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!t) return [];
  const out = [];
  for (const block of t.split(/\n{2,}/)) {
    const lines = block.split('\n').map(l => l.trim());
    const ti = lines.findIndex(l => l.includes('-->'));
    if (ti === -1) continue;
    const m = lines[ti].match(/(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/);
    if (!m) continue;
    const body = lines.slice(ti + 1).filter(l => l !== '');
    if (!body.length) continue;
    out.push({ start: m[1], end: m[2], text: body.join('\n') });
  }
  return out;
}

function srtSeconds(s) {
  const m = String(s).trim().match(/(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return 0;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+String(m[4]).padEnd(3, '0')) / 1000;
}

function srtStats(srtText) {
  const list = parseSrt(srtText);
  if (!list.length) return null;
  const secs = srtSeconds(list[list.length - 1].end);
  const mm = Math.floor(secs / 60), ss = Math.round(secs % 60);
  return { count: list.length, duration: `${mm}:${String(ss).padStart(2, '0')}` };
}

/* 字幕纠错后校验：条目数一致但时间轴被 AI 改动时，用原时间轴 + 新文本重组（VideoCaptioner 的「只换文本不动时间」原则） */
function repairSrtTimeline(inputSrt, outSrt) {
  const a = parseSrt(inputSrt), b = parseSrt(outSrt);
  if (!a.length || !b.length) return { out: outSrt };
  if (a.length !== b.length) return { out: outSrt, countMismatch: true };
  const norm = (s) => s.replace('.', ',');
  const changed = a.some((e, i) => norm(e.start) !== norm(b[i].start) || norm(e.end) !== norm(b[i].end));
  if (!changed) return { out: outSrt };
  const out = b.map((e, i) => `${i + 1}\n${norm(a[i].start)} --> ${norm(a[i].end)}\n${e.text}`).join('\n\n') + '\n';
  return { out, repaired: true };
}

/* ---------- 本地快速拆句（移植 VideoCaptioner 断句思路：标点优先 → 长度二分 → 语速配速） ---------- */

const SUB_MAX_CHARS = 18;  // 每条字幕字数上限（与 AI 拆句版一致）
const SUB_MIN_DUR = 0.8;   // 单条最短时长（秒）
const SUB_CPS = 4;         // 配速：每秒 4 字

function localSplitCues(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  // 1) 按句末标点粗切（标点保留在条尾）
  const sentences = t.split(/(?<=[。！？!?；;…])/).map(s => s.trim()).filter(Boolean);
  // 2) 超长句按逗号、顿号等次级标点贪心组块；单个子句仍超长就在中点附近找标点硬切
  const cues = [];
  for (const sent of sentences) {
    if (sent.length <= SUB_MAX_CHARS) { cues.push(sent); continue; }
    let buf = '';
    for (const part of sent.split(/(?<=[，,、：:——])/).map(s => s.trim()).filter(Boolean)) {
      if (buf && buf.length + part.length > SUB_MAX_CHARS) { cues.push(buf); buf = part; }
      else buf += part;
      while (buf.length > SUB_MAX_CHARS) {
        const cut = hardCut(buf);
        cues.push(buf.slice(0, cut));
        buf = buf.slice(cut);
      }
    }
    if (buf) cues.push(buf);
  }
  // 3) 相邻过短条目合并（前条不足 6 字且合并后不超限）
  const merged = [];
  for (const c of cues) {
    const prev = merged[merged.length - 1];
    if (prev && prev.length < 6 && prev.length + c.length <= SUB_MAX_CHARS) merged[merged.length - 1] = prev + c;
    else merged.push(c);
  }
  return merged;
}

/* 超长且无标点的子句：在「首段不超过上限」的前提下，靠近上限处找标点下刀，找不到就切在上限 */
function hardCut(s) {
  const limit = Math.min(SUB_MAX_CHARS, s.length - 1); // 保证切完剩余非空
  let best = -1, dist = Infinity;
  for (let i = Math.max(1, Math.floor(limit * 0.6)); i <= limit; i++) {
    if (/[，,、：:；;。！？!?\s]/.test(s[i - 1])) {
      const d = limit - i;
      if (d < dist) { dist = d; best = i; }
    }
  }
  return best > 0 ? best : limit;
}

function cleanCue(s) {
  return s.replace(/^[，,、：:—\s]+/, '').replace(/[，,、：:\s]+$/, '').trim();
}

function buildSrtFromCues(cues) {
  const fmt = (sec) => {
    const ms = Math.round(sec * 1000);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  let t = 0;
  return cues.map((raw, i) => {
    const text = cleanCue(raw);
    const dur = Math.max(SUB_MIN_DUR, text.length / SUB_CPS);
    const start = t;
    t += dur;
    return `${i + 1}\n${fmt(start)} --> ${fmt(t)}\n${text}`;
  }).join('\n\n') + '\n';
}

function runLocalSplit() {
  let text = inputText.value.trim();
  if (!text) { toast('请先粘贴文稿内容'); inputText.focus(); return; }
  // 输入已经是 SRT：只取字幕文本重新断句
  const asSrt = parseSrt(text);
  if (asSrt.length >= 3) {
    text = asSrt.map(e => e.text).join('');
    toast(`检测到 SRT（${asSrt.length} 条），已按字幕文本重新断句`);
  }
  const cues = localSplitCues(text);
  if (!cues.length) { toast('没有可拆分的内容'); return; }
  const srt = buildSrtFromCues(cues);
  const stat = srtStats(srt);

  resultBadge.textContent = '字幕 · 本地快速拆句';
  $('tokenUsage').textContent = '';
  banner.classList.add('hidden');
  clearSrtTools();
  hideApply();
  $('followups').classList.add('hidden');
  state.lastTask = null;
  state.activeHistoryId = null;
  state.lastError = null;
  $('regenBtn').disabled = true;
  state.lastOutput = srt;
  resultBody.innerHTML = `<div class="diff-stats">⚡ 本地规则断句 · 未调用 AI：共 <b>${stat.count}</b> 条 · 总时长约 <b>${stat.duration}</b></div><div class="md"><pre style="white-space:pre-wrap"><code>${esc(srt)}</code></pre></div>`;
  resultBody.scrollTop = 0;
  addSrtTools(srt);
  $('exportBtn').classList.add('hidden');
  addHistory({ badge: '字幕 · 本地快速拆句', input: text, output: srt });
  toast('拆句完成，已存入历史记录');
}

/* ---------- 字幕翻译（双语 SRT）——借鉴 SmartSub：分批 JSON + 宽容解析 + 编号校验重试 ---------- */

const LAYOUT_NAMES = { sourceTop: '原文在上', transTop: '译文在上', onlyTrans: '仅译文' };

/* 三级降级的 JSON 解析：直接 parse → 截取 {} → 去尾逗号再 parse（并剥掉 <think> 思考标签） */
function parseJsonLoose(raw) {
  let t = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const tryParse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  let v = tryParse(t);
  if (v) return v;
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s !== -1 && e > s) v = tryParse(t.slice(s, e + 1));
  if (v) return v;
  if (s !== -1 && e > s) return tryParse(t.slice(s, e + 1).replace(/[，,]\s*}/g, '}'));
  return null;
}

/* 单批翻译：编号 → 译文；不合格时把问题喂回去重试 1 次（Agent Loop 简化版） */
async function translateBatch(batch, lang) {
  const dict = {};
  batch.forEach((e, i) => { dict[String(i)] = e.text.replace(/\n/g, ' '); });
  const sys = [
    `你是专业字幕翻译专家，负责把视频字幕翻译成${lang}。要求：`,
    '1. 译文口语化、简洁自然，符合字幕显示习惯（每行不超过 20 个汉字或 40 个英文字符）；',
    '2. 严格保持输入 JSON 的键（编号）与条目数量完全一致，不合并、不拆分、不遗漏；',
    '3. 专有名词准确，保留原文语气，宁可靠意译也要自然；',
    '4. 只输出一个 JSON 对象（键不变、值为译文），不要任何解释，不要 markdown 代码块标记。',
  ].join('\n');
  let lastRaw = '';
  for (let step = 0; step < 2; step++) {
    const user = step === 0
      ? JSON.stringify(dict)
      : `你上一次的输出不合格：${lastRaw}……\n\n请严格按要求重新输出：键与编号完全一致、每条值为${lang}译文、只输出纯 JSON 对象、不要解释和代码块标记。\n\n${JSON.stringify(dict)}`;
    const raw = await fetchChatText(sys, user, state.controller.signal, (u) => { recordUsage(u); showUsage(u, false); });
    const parsed = parseJsonLoose(raw);
    if (parsed) {
      const vals = Object.keys(dict).map(k => parsed[k] ?? parsed[Number(k)]);
      if (vals.every(v => typeof v === 'string' && v.trim())) {
        return vals.map(v => String(v).trim());
      }
    }
    lastRaw = String(raw || '').replace(/\s+/g, ' ').slice(0, 120);
  }
  throw new Error('AI 未按格式返回译文（已自动重试 1 次），请重试');
}

function buildBilingualSrt(entries, translated, layout) {
  const fmt = (s) => s.replace('.', ',');
  return entries.map((e, i) => {
    const tr = (translated[i] || '').trim() || e.text;
    const body = layout === 'onlyTrans' ? tr : layout === 'transTop' ? `${tr}\n${e.text}` : `${e.text}\n${tr}`;
    return `${i + 1}\n${fmt(e.start)} --> ${fmt(e.end)}\n${body}`;
  }).join('\n\n') + '\n';
}

async function translateSubtitles() {
  const src = inputText.value.trim();
  if (!src) { toast('请先粘贴 SRT 字幕'); inputText.focus(); return; }
  const entries = parseSrt(src);
  if (!entries.length) { toast('没有识别到有效的 SRT 字幕（缺少时间轴 -->），请检查格式'); return; }
  const lang = $('subLang')?.value || '英语';
  const layout = state.subLayout || 'sourceTop';

  resultBadge.textContent = '字幕 · 双语翻译';
  $('tokenUsage').textContent = '';
  banner.classList.add('hidden');
  clearSrtTools();
  hideApply();
  $('followups').classList.add('hidden');
  state.lastError = null;
  setGenerating(true);
  state.controller = new AbortController();

  const paintProgress = (done, total) => {
    const pct = Math.round(Math.min(done, total) / total * 100);
    resultBody.innerHTML = `<div class="md subtr-box"><p>🌐 正在翻译字幕（译入 ${lang}）… 第 <b>${Math.min(done + 1, total)}</b> / ${total} 批</p><div class="v-bar"><i style="width:${pct}%"></i></div><p class="hint">共 ${entries.length} 条字幕 · 双语排版：${LAYOUT_NAMES[layout]} · 完成后可下载双语 / 纯译文 .srt</p></div>`;
    resultBody.scrollTop = resultBody.scrollHeight;
  };

  try {
    let translated;
    if (settings.demo) {
      const total = Math.min(3, Math.max(1, Math.ceil(entries.length / 15)));
      for (let i = 0; i <= total; i++) {
        if (state.controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
        paintProgress(i, total);
        await new Promise(r => setTimeout(r, 420));
      }
      translated = entries.map(e => e.text.split('\n').map(l => `[${lang}示例] ${l}`).join('\n'));
      const du = demoUsage(src, src);
      recordUsage(du);
      showUsage(du, true);
    } else {
      const BATCH = 15;
      const batches = [];
      for (let i = 0; i < entries.length; i += BATCH) batches.push(entries.slice(i, i + BATCH));
      translated = [];
      for (let bi = 0; bi < batches.length; bi++) {
        if (state.controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
        paintProgress(bi, batches.length);
        translated.push(...await translateBatch(batches[bi], lang));
      }
    }
    const srt = buildBilingualSrt(entries, translated, layout);
    state.lastTask = null; // 翻译不走追问/重新生成，避免误触发
    const task = {
      badge: `字幕 · 双语翻译（${LAYOUT_NAMES[layout]}）`,
      input: src, sys: '字幕翻译任务。', srt: true, applyMode: 'full',
      messages: [{ role: 'system', content: '字幕翻译任务。' }, { role: 'user', content: src }],
    };
    setGenerating(false);
    resultBadge.textContent = task.badge;
    finishTask(task, srt);
    $('followups').classList.add('hidden');
    $('regenBtn').disabled = true;
    // 额外提供纯译文 SRT 下载
    const tools = document.querySelector('.result-tools');
    if (tools) {
      const only = buildBilingualSrt(entries, translated, 'onlyTrans');
      const b = document.createElement('button');
      b.id = 'srtTransOnlyBtn'; b.className = 'ghost-btn small'; b.textContent = '⬇ 纯译文 .srt';
      b.addEventListener('click', () => downloadText(only, `subtitles_${lang}.srt`));
      tools.insertBefore(b, tools.firstChild);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      resultBody.innerHTML = `<div class="result-error"><div class="err-title">已停止</div><p>本次翻译已取消。</p></div>`;
      resultBadge.textContent = '字幕 · 双语翻译 · 已停止';
    } else {
      state.lastError = err.message;
      const trHint = isLocalMode()
        ? '请确认 Ollama 正在运行、模型已拉取；也可到「设置」检查本地服务地址。'
        : '请检查网络与「设置」中的 API Key；若持续失败可开启演示模式体验功能。';
      resultBody.innerHTML = `<div class="result-error"><div class="err-title">⚠️ 翻译失败</div><p>${esc(err.message || String(err))}</p><p style="margin-top:6px;font-size:12.5px;color:#8c4a48">${trHint}</p></div>`;
      resultBadge.textContent = '字幕 · 双语翻译 · 失败';
    }
  } finally {
    setGenerating(false);
    state.controller = null;
    renderTips();
  }
}

/* ---------- 录音转写 · 多媒体创作全链路 ----------
 * 链路：录音 / 音频 → faster-whisper 本地转写（tools/whisper_server.py，离线免费）
 *   → PromptSlim 自动清理口语废话（本地规则）→ AI 整理初稿（可选，走在线/本地双模式）
 *   → 文稿工作台（润色 / 降重 / 审校 / 思维导图）→ PPT / 分镜脚本 / 字幕
 * 实现参考：SmartSub（whisper 本地集成）、VideoCaptioner（幻觉文本过滤、进度单调递增） */

const au = {
  blob: null, name: '',
  recorder: null, recTimer: null, recStart: 0,
  engine: null,            // /health 结果
  segments: null,          // [{start,end,text}]（已过滤幻觉与空段）
  text: '', rawText: '',   // 当前工作文本 / 原始转写
  duration: 0, lang: '',
  controller: null,
  busy: false, sent: false, exported: false, helpShown: false,
};

/* whisper 幻觉文本（识别模型对静音/杂音的默认脑补句）：整段很短且命中才过滤 */
const WHISPER_HALLUCINATION_RES = [
  /请不吝点赞|订阅.{0,8}转发|打赏|明镜|字幕组|字幕制作|字幕由/,
  /^(谢谢观看|谢谢收看|请订阅|感谢观看|点赞.{0,6}关注)[!.，。！？~\s]*$/,
  /^(音乐|音乐播放|掌声|笑声|静默|空白音频|\[音乐\]|（音乐）|\(音乐\))$/,
  /amara\.org|subtitles?\s+by|translated\s+by/i,
];
const AU_HALLUCINATION_MAX_LEN = 30;

function auIsHallucination(t) {
  const s = (t || '').trim();
  if (!s || s.length > AU_HALLUCINATION_MAX_LEN) return false;
  return WHISPER_HALLUCINATION_RES.some(re => re.test(s));
}

function auFmtDur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function auBase() {
  return ($('auBaseInput').value.trim() || settings.whisperBase || DEFAULT_WHISPER_BASE).replace(/\/+$/, '');
}

/* 是否运行在本地完整版（http://localhost）：本地版转写走本机服务；线上版直接走云端 */
function isLocalSite() {
  return location.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
}

function auSetEngine(level, text) {
  $('auEngineDot').className = 'au-engine-dot ' + level; // ok | err | unknown
  $('auEngineText').textContent = text;
}

async function auDetectEngine() {
  // 线上版（https 非本地）：不探测本机服务（Chrome PNA 会挂起请求），直接走云端转写
  if (!isLocalSite()) {
    au.engine = null;
    auSetEngine('unknown', '☁️ 云端转写可用：录音将自动上传转写（免费 · 每日 10 次 · 无时间轴）');
    return;
  }
  const base = auBase();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    au.engine = j;
    if (j.faster_whisper === false) {
      auSetEngine('err', '⚠ 服务在线但缺少 faster-whisper：请到服务窗口执行 pip install faster-whisper');
      if (!au.helpShown) { $('auEngineHelp').open = true; au.helpShown = true; }
    } else {
      auSetEngine('ok', `🟢 本地转写服务已连接（faster-whisper · 模型 ${j.model || 'base'}）· 音频不出本机`);
      $('auEngineHelp').open = false;
    }
  } catch (e) {
    au.engine = null;
    const online = location.protocol === 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (online) {
      // 线上访客（手机等）：无本机服务是正常的，录音会自动走云端转写
      auSetEngine('unknown', '☁️ 云端转写可用：录音将自动上传转写（免费 · 每日 10 次 · 无时间轴）');
    } else {
      auSetEngine('err', '🔴 未连接本地转写服务——先启动它（免费、离线、不耗 token），或用演示模式体验流程');
      if (!au.helpShown) { $('auEngineHelp').open = true; au.helpShown = true; }
    }
  }
}

function auOnShow() {
  $('auBaseInput').value = auBase();
  auDetectEngine();
  auRenderSteps();
  auRenderRecordBtn();
}

/* ---------- 录音（MediaRecorder，纯浏览器本地） ---------- */

async function auToggleRecord() {
  if (au.recorder && au.recorder.state === 'recording') { au.recorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    toast('当前浏览器不支持录音，请换用 Chrome / Edge，或直接上传音频文件'); return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    toast('无法访问麦克风：请允许浏览器使用麦克风后重试'); return;
  }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(au.recTimer);
    au.recorder = null;
    const secs = (Date.now() - au.recStart) / 1000;
    auRenderRecordBtn();
    if (!chunks.length) { toast('没有录到内容，请再试一次'); return; }
    auOnAudio(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), `现场录音_${auFmtDur(secs).replace(':', '')}.webm`);
  };
  rec.start(1000);
  au.recorder = rec;
  au.recStart = Date.now();
  $('auRecTimer').classList.remove('hidden');
  au.recTimer = setInterval(() => { $('auRecTimer').textContent = auFmtDur((Date.now() - au.recStart) / 1000); }, 250);
  auRenderRecordBtn();
}

function auRenderRecordBtn() {
  const rec = !!au.recorder;
  const btn = $('auRecordBtn');
  btn.textContent = rec ? '⏹ 完成录音' : '🎤 开始录音';
  btn.classList.toggle('danger-btn', rec);
  btn.classList.toggle('primary-btn', !rec);
  if (!rec) $('auRecTimer').classList.add('hidden');
}

/* ---------- 音频就绪（录音完成 / 文件上传 / 拖入） ---------- */

async function auOnAudio(blob, name) {
  if (au.recorder && au.recorder.state === 'recording') { toast('正在录音中：先点「⏹ 完成录音」再导入新音频'); return; }
  if (au.busy && au.controller) { au.controller.abort(); await new Promise(r => setTimeout(r, 120)); } // 打断上一次转写，换新音频重跑
  au.blob = blob;
  au.name = name || 'audio';
  au.segments = null; au.text = ''; au.rawText = '';
  au.sent = false; au.exported = false;
  $('auSrcInfo').textContent = `📎 ${au.name} · ${(blob.size / 1024 / 1024).toFixed(1)} MB`;
  $('auGoBtn').disabled = false;
  auRenderSteps();
  auStartTranscribe(); // 就绪即自动转写
}

/* ---------- 转写（faster-whisper sidecar，NDJSON 流式进度） ---------- */

async function auStartTranscribe() {
  if (!au.blob || au.busy) return;
  au.busy = true;
  $('auGoBtn').disabled = true;
  $('auProgress').classList.remove('hidden');
  $('auCancelBtn').classList.remove('hidden');
  $('auStatusText').textContent = '准备中…';
  $('auBarFill').style.width = '0%';
  au.controller = new AbortController();
  try {
    let result;
    if (settings.demo) {
      result = await auDemoTranscribe();
    } else if (!isLocalSite()) {
      // 线上版：直接云端转写（Workers AI，免费）
      $('auStatusText').textContent = '云端转写中（免费）…';
      $('auBarFill').classList.add('indeterminate');
      const text = await transcribeCloud(au.blob, au.controller.signal);
      $('auBarFill').classList.remove('indeterminate');
      result = { segments: null, text, duration: 0, language: '' };
    } else {
      try {
        result = await auTranscribeRequest();
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        $('auStatusText').textContent = '本机转写服务未连接，改用云端转写（免费）…';
        const text = await transcribeCloud(au.blob, au.controller.signal);
        result = { segments: null, text, duration: 0, language: '' };
      }
    }
    auOnResult(result);
  } catch (err) {
    if (err.name === 'AbortError') {
      $('auStatusText').textContent = '已取消';
      toast('转写已取消');
    } else {
      auSetEngine('err', '🔴 转写失败：' + (err.message || String(err)));
      toast('转写失败：' + (err.message || String(err)));
    }
  } finally {
    au.busy = false;
    au.controller = null;
    $('auCancelBtn').classList.add('hidden');
    $('auGoBtn').disabled = !au.blob;
  }
}

/* 转写请求（通用）：录音转写工作区与批量处理共用，NDJSON 流式进度 */
async function transcribeBlob(blob, { lang = 'auto', signal, onStatus, onProgress } = {}) {
  const base = auBase();
  let res;
  try {
    res = await fetch(`${base}/transcribe?lang=${encodeURIComponent(lang)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('连不上转写服务（' + base + '）：请先运行 tools\\启动转写服务.bat，再点「🔄 检测」');
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch (e) { /* ignore */ }
    if (res.status === 409) throw new Error(msg);
    throw new Error('转写服务返回错误：' + msg);
  }
  if (!res.body) throw new Error('当前浏览器不支持流式响应');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  const segs = [];
  let duration = 0, language = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let ev;
      try { ev = JSON.parse(t); } catch (e) { continue; }
      if (ev.type === 'status') onStatus && onStatus(ev.message);
      else if (ev.type === 'progress') onProgress && onProgress(ev.pct);
      else if (ev.type === 'segment') segs.push(ev);
      else if (ev.type === 'done') {
        duration = Number(ev.duration) || 0;
        language = ev.language || '';
        (ev.segments || []).forEach(s => segs.push(s));
      } else if (ev.type === 'error') throw new Error(ev.message || '转写失败');
    }
  }
  return { segments: segs, duration, language };
}

/* 云端转写兜底（Pages Function + Workers AI Whisper）：线上访客手机可用，无时间轴 */
async function transcribeCloud(blob, signal) {
  const res = await fetch('v1/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: blob,
    signal,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error?.message || msg; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  const j = await res.json();
  return String(j.text || '').trim();
}

/* 录音转写工作区的转写调用（进度打到本工作区 UI） */
async function auTranscribeRequest() {
  return transcribeBlob(au.blob, {
    lang: $('auLangSel').value || 'auto',
    signal: au.controller.signal,
    onStatus: (m) => { $('auStatusText').textContent = m; },
    onProgress: (pct) => {
      $('auBarFill').style.width = `${Math.max(0, Math.min(100, pct))}%`;
      $('auStatusText').textContent = `转写中… ${pct}%`;
    },
  });
}

/* 演示模式：模拟转写流程（不连接任何服务） */
async function auDemoTranscribe() {
  const lines = [
    [0.0, 4.2, '大家好，欢迎来到今天的分享，我先用一分钟介绍一下这次的主题。'],
    [4.4, 9.8, '然后然后就是第一部分，我们先来看一下整体的数据情况，整体其实其实还是不错的。'],
    [10.0, 15.4, '这里我想强调的是，用户体验的核心在于细节，而不是功能的堆砌。'],
    [15.6, 21.2, '第二部分我们聊聊接下来的计划，大概有三件事要去做。'],
    [21.4, 27.0, '（演示模式）实际使用时，这里会是你录音的真实内容，由本地 faster-whisper 离线转写生成。'],
  ];
  for (let i = 0; i <= lines.length; i++) {
    if (au.controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
    const pct = Math.min(99, Math.round(i / lines.length * 100));
    $('auStatusText').textContent = `转写中（演示）… ${pct}%`;
    $('auBarFill').style.width = pct + '%';
    await new Promise(r => setTimeout(r, 240));
  }
  return { segments: lines.map(l => ({ start: l[0], end: l[1], text: l[2] })), duration: 27, language: 'zh' };
}

/* segments → 成段文稿：按时间间隙（≥1.6s 静音）或长度（≥160 字）自然分段 */
function auSegmentsToText(segs) {
  const paras = [];
  let buf = '', lastEnd = -10;
  for (const s of segs) {
    const t = (s.text || '').trim();
    if (!t) continue;
    const gap = (Number(s.start) || 0) - lastEnd;
    if (buf && (gap >= 1.6 || buf.length >= 160)) { paras.push(buf.trim()); buf = ''; }
    // 英文等拉丁文本段与段之间补空格，避免单词粘连；中文直接拼
    if (buf && /[\w,.!?;:]$/.test(buf) && /^[\w]/.test(t)) buf += ' ';
    buf += t;
    lastEnd = Number(s.end) || lastEnd;
  }
  if (buf.trim()) paras.push(buf.trim());
  return paras.join('\n\n');
}

function auBuildSrt() {
  const fmt = (t) => {
    const ms = Math.max(0, Math.round((Number(t) || 0) * 1000));
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor(ms % 3600000 / 60000)).padStart(2, '0');
    const s = String(Math.floor(ms % 60000 / 1000)).padStart(2, '0');
    return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
  };
  return (au.segments || []).map((s, i) => `${i + 1}\n${fmt(s.start)} --> ${fmt(s.end)}\n${(s.text || '').trim()}`).join('\n\n') + '\n';
}

/* 转写完成：过滤幻觉 → PromptSlim 清理口语废话 → 渲染结果 */
function auOnResult(result) {
  // 云端转写只有纯文本（无时间轴）；本地转写带 segments
  const hasSegments = Array.isArray(result.segments);
  let segs = [];
  let cloudText = '';
  if (hasSegments) {
    segs = result.segments
      .map(s => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: (s.text || '').trim() }))
      .filter(s => s.text && !auIsHallucination(s.text));
    if (!segs.length) {
      $('auProgress').classList.add('hidden');
      toast('没有识别到有效语音：请检查音频是否有清晰人声，或换一个更大的模型（--model small）');
      return;
    }
    au.segments = segs;
    au.duration = result.duration || segs[segs.length - 1].end;
    au.lang = result.language || '';
    au.rawText = auSegmentsToText(segs);
  } else {
    cloudText = String(result.text || '').trim();
    if (!cloudText) {
      $('auProgress').classList.add('hidden');
      toast('没有识别到有效语音：请检查音频是否有清晰人声');
      return;
    }
    au.segments = null;
    au.duration = result.duration || 0;
    au.lang = result.language || '';
    au.rawText = cloudText;
  }

  // 前置 PromptSlim：本地规则清理口水词、重复行、叠字（可一键还原原始转写）
  const sl = slimText(au.rawText, false);
  const slimmed = sl.changed && sl.savedChars > 0;
  au.text = slimmed ? sl.out : au.rawText;

  $('auProgress').classList.add('hidden');
  $('auEmpty').classList.add('hidden');
  $('auResult').classList.remove('hidden');
  $('auUndoRawBtn').classList.remove('hidden');
  // 云端转写无时间轴：禁用 .srt 下载
  $('auDownloadSrtBtn').disabled = !hasSegments;
  $('auDownloadSrtBtn').title = hasSegments ? '带原始时间轴的字幕文件，可直接导入剪映' : '云端快速转写无时间轴，如需字幕请用文本走「剪辑助手 → 文稿转字幕」';
  $('auText').value = au.text;
  const meta = [`⏱ ${auFmtDur(au.duration)}`, `🔤 ${fmtNum(au.text.replace(/\s/g, '').length)} 字`];
  if (hasSegments) meta.push(`${segs.length} 段`); else meta.push('☁️ 云端');
  if (au.lang) meta.splice(2, 0, `🌐 ${au.lang}`);
  $('auMeta').textContent = meta.join(' · ');
  $('auChips').innerHTML = slimmed
    ? `<span class="tool-chip slim-ok" title="PromptSlim 本地规则清理：去口水词、重复与叠字，点「↩ 原始转写」可还原">🧹 PromptSlim 已清理口语废话（-${Math.max(1, Math.round(sl.savedChars / au.rawText.length * 100))}%）</span>`
    : `<span class="tool-chip">🧹 转写文本较干净，无需清理</span>`;
  au.sent = false; au.exported = false;
  addHistory({ badge: '🎙️ 录音转写', input: `${au.name}（${auFmtDur(au.duration)}）`, output: au.text });
  auRenderSteps();
  toast('转写完成！已自动清理口语废话，可直接编辑或送往下一步');
}

/* ---------- 全链路跳转：文稿工作台 / PPT / 分镜脚本 / 字幕 ---------- */

function auFillWorkspace() {
  inputText.value = $('auText').value.trim();
  updateCharCount();
  renderTips();
  au.sent = true;
  auRenderSteps();
}

function auToWorkspace() {
  if (!au.text && !$('auText').value.trim()) { toast('还没有转写结果'); return; }
  auFillWorkspace();
  switchTab('polish');
  toast('已发送到文稿工作台：可润色 / 降重 / 审校 / 生成思维导图');
}

function auToAction(kind) {
  const text = $('auText').value.trim();
  if (!text) { toast('还没有转写结果'); return; }
  const notReady = checkAIReady();
  if (notReady) { openSettings(); toast(notReady); return; }
  auFillWorkspace();
  au.exported = true;
  auRenderSteps();
  if (kind === 'ppt') { switchTab('ppt'); generatePPT(text); }
  else if (kind === 'clip') { switchTab('clip'); run('clipScript'); }
  else if (kind === 'sub') { switchTab('clip'); run('subSplit'); toast('提示：赶时间可在「剪辑助手」用「本地快速拆句」，不耗 AI 秒出'); }
}

/* ---------- 四步链路指示 ---------- */

const AU_STEP_NAMES = ['🎙 音频', '🧹 转写+清理', '📝 文稿加工', '📦 成品输出'];

function auRenderSteps() {
  const st = au.exported ? 4 : au.sent ? 3 : au.text ? 2 : au.blob ? 1 : 0;
  $('auSteps').innerHTML = AU_STEP_NAMES.map((n, i) => {
    const cls = i < st ? 'done' : i === st ? 'now' : '';
    return `<span class="au-step ${cls}"><i>${i < st ? '✓' : i + 1}</i>${n}</span>`;
  }).join('<i class="au-step-arrow">→</i>');
}

/* ---------- 提示词库 & 模板包（变现核心模块） ----------
 * 分类管理 · 一键使用 · AI 生成专属提示词 · JSON 包导入导出（可分发 / 售卖）
 * JSON 包约定：{ "name":"包名", "prompts":[{title, content, category, desc, tags}] }
 *   content 中用 {{input}} 标记「用户粘贴内容」的位置；category ∈ doc/audio/ppt/defense */

const PROMPT_CATEGORIES = { doc: '📄 文稿模板', audio: '🎙️ 录音整理', ppt: '📊 PPT 提示词', defense: '🎓 答辩模拟' };
const PROMPT_STORE_KEY = 'wg_prompts';

/* 内置精选模板（作为赠品包预置，可删除后用「恢复内置」补回） */
const BUILTIN_PROMPTS = [
  {
    id: 'pk_bi_doc_weekly', category: 'doc', builtin: true, tags: ['周报', '职场', '汇报'],
    title: '万能周报生成器', desc: '把零散工作记录整理成规范周报：完成/数据/计划/风险',
    content: '你是一位靠谱的职场写作助手。请把用户提供的零散工作记录整理成一份规范的周报。\n要求：\n1. 结构：【本周完成】（分点，量化成果，突出结果而非过程）、【数据/进展】（有数字用数字）、【下周计划】（可执行、标优先级）、【风险与求助】（需要协调的事项）；\n2. 语言简洁专业，动词开头的短句，不堆形容词；\n3. 原文没提的信息不要编造，需要补充的用【待补充】标出；\n4. 直接输出周报正文，不要解释。\n\n零散工作记录：\n{{input}}',
  },
  {
    id: 'pk_bi_doc_abstract', category: 'doc', builtin: true, tags: ['论文', '摘要', '学术'],
    title: '论文结构化摘要', desc: '背景/方法/结果/结论 + 关键词，投稿直用',
    content: '你是学术写作专家。请把用户提供的论文全文或长段落压缩成一份结构化摘要：\n## 背景\n研究问题与意义（2 句以内）\n## 方法\n使用的方法 / 数据 / 实验设计（3 句以内）\n## 结果\n关键发现与数据，分点列出\n## 结论\n核心结论与局限\n## 关键词\n5 个左右\n忠实原文，不编造数据；直接输出摘要，不要解释。\n\n论文内容：\n{{input}}',
  },
  {
    id: 'pk_bi_doc_minutes', category: 'doc', builtin: true, tags: ['会议', '纪要', '待办'],
    title: '会议纪要速成', desc: '议题/讨论/决议/待办清单，负责人与截止时间一目了然',
    content: '你是专业的会议纪要整理师。请把用户提供的会议记录、聊天记录或录音整理稿整理成规范纪要：\n一、会议信息：主题、时间、参与人（原文有则写，没有标【待补充】）\n二、议题与讨论：每个议题一组「讨论要点 → 结论」\n三、决议事项：编号列出最终决定\n四、待办清单：表格列出（| 待办 | 负责人 | 截止时间 |），无法确定的用【待确认】\n不遗漏任何决议和待办，不新增原文没有的决定。直接输出纪要。\n\n会议内容：\n{{input}}',
  },
  {
    id: 'pk_bi_doc_xhs', category: 'doc', builtin: true, tags: ['小红书', '文案', '自媒体'],
    title: '小红书爆款文案', desc: '钩子标题 + 干货正文 + 话题标签，平台风格拿捏',
    content: '你是小红书爆款内容操盘手。请基于用户给出的主题或素材，写一条小红书笔记：\n1. 标题：20 字内，带 1 个 emoji，制造好奇或实用感；\n2. 正文：250 字左右，口语化、分段短句，开头 1 句钩子，中间 3~5 个干货点（可用 ✅/💡 列点），结尾互动引导；\n3. 话题标签：5~8 个（# 开头）；\n4. 语气真诚不硬广，不夸大功效。\n直接输出「标题 / 正文 / 标签」三部分。\n\n主题或素材：\n{{input}}',
  },
  {
    id: 'pk_bi_audio_meeting', category: 'audio', builtin: true, tags: ['会议', '录音', '复盘'],
    title: '会议录音 → 一页纸摘要', desc: '配合录音转写使用：转写稿秒变决议与待办清单',
    content: '你是会议复盘专家。用户会粘贴一段会议录音的转写稿（口语、可能有识别错误）。请整理成「一页纸会议摘要」：\n1. 一句话总结这次会议最重要的结论；\n2. 关键讨论：按议题分点，每点 1~2 句（去掉口语废话，保留观点与分歧）；\n3. 决议与待办：表格列出（| 事项 | 负责人 | 时间 |），原文未明确的标【待确认】；\n4. 风险提示：提到但未解决的风险。\n口语转成书面语，人名/数字/时间必须忠于原文。直接输出。\n\n转写稿：\n{{input}}',
  },
  {
    id: 'pk_bi_audio_interview', category: 'audio', builtin: true, tags: ['访谈', '研究', '洞察'],
    title: '访谈逐字稿洞察报告', desc: '核心观点 + 原话引用 + 可追问点，质性研究好用',
    content: '你是质性研究分析助手。请分析用户提供的访谈逐字稿：\n## 受访者画像\n身份与背景（原文可推断的）\n## 核心观点\n3~6 条，每条附一句原文引用（标注「原话」）\n## 情绪与态度\n受访者对关键话题的态度倾向\n## 可追问的点\n3 个值得二次访谈追问的问题\n忠于原文，不做过度解读；直接输出。\n\n逐字稿：\n{{input}}',
  },
  {
    id: 'pk_bi_audio_course', category: 'audio', builtin: true, tags: ['网课', '笔记', '考点'],
    title: '网课录音 → 考点笔记', desc: '配合录音转写：章节知识点 + 考点 + 必背清单',
    content: '你是学习笔记整理专家。用户会粘贴一段网课/课堂录音的转写稿。请整理成复习笔记：\n1. 按「## 章节主题」分块，每块先列核心知识点（保留定义、公式、数字）；\n2. 单独列「⭐ 考点」：老师重复强调、明确说"要考"的内容；\n3. 末尾用 5~8 条极短句总结必背点；\n4. 口语转书面语，识别错误的术语根据上下文修正（拿不准的保留原文并标注）。\n直接输出笔记。\n\n转写稿：\n{{input}}',
  },
  {
    id: 'pk_bi_audio_speech', category: 'audio', builtin: true, tags: ['讲稿', '演讲', '书面化'],
    title: '口语稿 → 正式讲稿', desc: '保留观点与个性，去口水词，可照着念的演讲稿',
    content: '你是演讲撰稿人。用户会粘贴一段口语化的发言录音整理稿。请把它打磨成一份可以照着念的正式讲稿：\n1. 保留说话人的真实观点、例子和语气个性，只做书面化：去口水词、修病句、理顺逻辑；\n2. 按演讲节奏分段，重要转折处加一句过渡；\n3. 全文口语可念：长句拆短，不用生僻词；\n4. 开头加一句开场钩子，结尾加一句收束。\n不新增事实，不改观点。直接输出讲稿。\n\n整理稿：\n{{input}}',
  },
  {
    id: 'pk_bi_ppt_report', category: 'ppt', builtin: true, tags: ['汇报', '大纲', 'PPT'],
    title: '汇报 PPT 黄金 10 页', desc: '进展总览 + 关键成果 ×3 + 计划，生成后可直接编辑导出',
    content: '你是资深汇报教练。请根据用户提供的主题、文稿或数据，生成一份 10 页工作汇报 PPT 大纲：\n页面结构：封面 → 目录 → 背景/目标 → 进展总览（1 页看懂）→ 关键成果 ×3（每页一个成果 + 数据）→ 问题与对策 → 下一步计划 → 结尾页。\n只输出 JSON 数组，不要任何解释或代码块标记，格式：\n[{"title":"页面标题（12字内）","points":["要点1","要点2","要点3"],"notes":"演讲备注：这页讲什么、强调什么"}]\n要点具体可量化，备注口语化、可直接照念。\n\n主题或文稿：\n{{input}}',
  },
  {
    id: 'pk_bi_ppt_defense', category: 'ppt', builtin: true, tags: ['答辩', '大纲', '评委'],
    title: '答辩 PPT 大纲（评委视角）', desc: '结论式标题 + 预判评委追问，备注含应对话术',
    content: '你是答辩评委兼 PPT 教练。请根据用户提供的论文或课题信息，从评委视角生成答辩 PPT 大纲（10~12 页）：\n要求：评委最关心什么就讲什么——研究问题是否清晰、方法是否可靠、结论是否有支撑；每页标题用结论式表述（如「XX 显著提升了 XX」而不是「实验结果」）；方法页必须留出「为什么这样做」的要点。\n只输出 JSON 数组（title/points/notes），notes 写「这页评委可能追问什么 + 怎么应对」。\n\n论文或课题信息：\n{{input}}',
  },
  {
    id: 'pk_bi_ppt_bp', category: 'ppt', builtin: true, tags: ['路演', 'BP', '融资'],
    title: '路演 BP 大纲（投资人视角）', desc: '从痛点到融资计划，备注含投资人挑刺与应答',
    content: '你是投资人视角的商业计划书顾问。请根据用户提供的项目信息生成路演 PPT 大纲（12 页以内）：\n页面顺序：一句话定位 → 痛点 → 解决方案 → 市场规模 → 商业模式 → 竞争优势 → 数据验证 → 团队 → 融资计划 → 愿景。\n每页 points 3 条以内、能被一句话记住；notes 里写「投资人会挑什么刺、怎么答」。\n只输出 JSON 数组（title/points/notes）。\n\n项目信息：\n{{input}}',
  },
  {
    id: 'pk_bi_defense_mock', category: 'defense', builtin: true, tags: ['答辩', '模拟', '提问'],
    title: '毕业答辩模拟考官', desc: '8 个问题（含 1 个刁钻追问），附考察点与回答思路',
    content: '你是毕业答辩委员会的考官，专业、严格但礼貌。请阅读用户的论文摘要或文稿，模拟一次答辩提问：\n1. 提出 8 个问题：2 个基础概念题、3 个方法细节题、2 个创新与贡献题、1 个「刁钻但常见」的缺陷追问；\n2. 每个问题附【考察点】和【参考回答思路】（3 句以内，告诉学生往哪个方向答）；\n3. 最后给出 3 条针对性答辩建议。\n直接输出，不要解释。\n\n论文/文稿：\n{{input}}',
  },
  {
    id: 'pk_bi_defense_proposal', category: 'defense', builtin: true, tags: ['开题', '评审', '模拟'],
    title: '开题报告评审模拟', desc: '必答 5 问 + 三方面修改意见 + 通过率预判',
    content: '你是研究生开题评审会的专家。请根据用户提供的开题报告内容，从评审角度输出：\n## 必答问题\n5 个开题必问的问题（选题依据 / 文献综述 / 研究设计 / 可行性 / 创新点），每个附参考回答思路\n## 评审意见\n按「选题意义 / 研究方案 / 工作量与可行性」三方面各给 1 条修改建议\n## 通过预判\n给出 🟢🟡🔴 评级与一句话理由\n直接输出，不要解释。\n\n开题报告：\n{{input}}',
  },
  {
    id: 'pk_bi_defense_selfintro', category: 'defense', builtin: true, tags: ['自我陈述', '开场', '打磨'],
    title: '答辩自我陈述打磨', desc: '3 分钟开场稿：选题缘由→核心工作→创新点，附加减分点',
    content: '你是答辩辅导教练。用户会提供自己的论文或项目介绍素材（摘要、经历、成果）。请生成一份 3 分钟答辩开场自我陈述稿：\n1. 结构：选题缘由（30 秒）→ 核心工作（60 秒，突出 1~2 个亮点）→ 创新点（45 秒）→ 局限与致谢（15 秒）→「请各位老师批评指正」收尾；\n2. 全文 800 字以内，口语可念、有节奏停顿；\n3. 稿子后附「评委第一印象加分点 / 减分点」各 2 条。\n直接输出。\n\n素材：\n{{input}}',
  },
];

const pk = { cat: 'all', kw: '', using: null, lastGen: null };

function loadPrompts() {
  try {
    const a = JSON.parse(localStorage.getItem(PROMPT_STORE_KEY) || 'null');
    if (Array.isArray(a)) return a;
  } catch (e) { /* ignore */ }
  localStorage.setItem(PROMPT_STORE_KEY, JSON.stringify(BUILTIN_PROMPTS));
  return JSON.parse(JSON.stringify(BUILTIN_PROMPTS));
}

function savePrompts(list) {
  localStorage.setItem(PROMPT_STORE_KEY, JSON.stringify(list || loadPrompts()));
}

function pkNewId() { return 'pk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function upsertPrompt(p) {
  const list = loadPrompts();
  if (p.id) {
    const i = list.findIndex(x => x.id === p.id);
    if (i >= 0) {
      list[i] = { ...list[i], ...p, builtin: !!list[i].builtin, updatedAt: new Date().toISOString() };
      savePrompts(list);
      return list[i];
    }
  }
  const np = { id: pkNewId(), createdAt: new Date().toISOString(), ...p, builtin: false };
  list.unshift(np);
  savePrompts(list);
  return np;
}

function deletePrompt(id) {
  savePrompts(loadPrompts().filter(x => x.id !== id));
}

function normTags(tags) {
  const arr = Array.isArray(tags) ? tags : String(tags || '').split(/[,，、]/);
  return arr.map(t => String(t).trim()).filter(Boolean).slice(0, 8);
}

/* ---------- 提示词库渲染 ---------- */

function renderPromptCats() {
  const list = loadPrompts();
  const countOf = (c) => list.filter(p => p.category === c).length;
  const items = [['all', `🗂 全部 (${list.length})`], ...Object.entries(PROMPT_CATEGORIES).map(([k, v]) => [k, `${v} (${countOf(k)})`])];
  $('pkCats').innerHTML = items.map(([k, label]) =>
    `<button class="pk-cat ${pk.cat === k ? 'active' : ''}" data-pkcat="${k}">${label}</button>`).join('');
}

function renderPrompts() {
  const list = loadPrompts();
  const kw = pk.kw.trim().toLowerCase();
  const filtered = list.filter(p =>
    (pk.cat === 'all' || p.category === pk.cat) &&
    (!kw || `${p.title} ${p.desc || ''} ${(p.tags || []).join(' ')} ${p.content}`.toLowerCase().includes(kw)));
  $('pkStats').innerHTML =
    `共 <b>${list.length}</b> 条 · 内置 <b>${list.filter(p => p.builtin).length}</b> · 自定义/导入 <b>${list.filter(p => !p.builtin).length}</b>` +
    (pk.cat !== 'all' || kw ? ` · 当前筛出 <b>${filtered.length}</b> 条` : '');
  const box = $('pkList');
  if (!filtered.length) {
    box.innerHTML = `<div class="pk-empty">没有匹配的提示词<br><span class="pk-empty-sub">换个关键词、切换分类，或用「🪄 AI 生成提示词」造一条</span></div>`;
    return;
  }
  box.innerHTML = filtered.map(p => `
    <div class="pk-card" data-id="${p.id}">
      <div class="pk-card-head">
        <span class="pk-card-title">${esc(p.title)}</span>
        <span class="pk-cat-badge">${esc(PROMPT_CATEGORIES[p.category] || '📄 未分类')}</span>
      </div>
      ${p.desc ? `<div class="pk-card-desc">${esc(p.desc)}</div>` : ''}
      <div class="pk-card-body">${esc(p.content.replace(/\s+/g, ' ').slice(0, 96))}…</div>
      <div class="pk-card-foot">
        <span class="pk-card-meta">${p.content.replace(/\s/g, '').length} 字${(p.tags || []).length ? ' · ' + p.tags.map(t => '#' + esc(t)).join(' ') : ''}${p.builtin ? ' · 内置' : ''}</span>
        <span class="pk-card-acts">
          <button class="pk-act use" data-act="use" data-id="${p.id}">▶ 使用</button>
          <button class="pk-act" data-act="edit" data-id="${p.id}" title="编辑">✏️</button>
          <button class="pk-act" data-act="export" data-id="${p.id}" title="导出这条 JSON">⬇</button>
          <button class="pk-act" data-act="del" data-id="${p.id}" title="删除">🗑</button>
        </span>
      </div>
    </div>`).join('');
}

/* ---------- 提示词库 · JSON 导入导出（售卖包格式） ---------- */

function downloadJSON(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function buildPromptExport(list, packName) {
  return {
    app: '云笺 · 个人文稿全能助手',
    type: 'yunjian-prompt-pack',
    version: 1,
    name: packName || '云笺提示词包',
    exportedAt: new Date().toISOString(),
    count: list.length,
    prompts: list.map(p => ({
      title: p.title, category: p.category, content: p.content,
      ...(p.desc ? { desc: p.desc } : {}), ...(p.tags && p.tags.length ? { tags: p.tags } : {}),
    })),
  };
}

function importPromptsText(text) {
  let data;
  try { data = JSON.parse(String(text || '').replace(/^\ufeff/, '').trim()); }
  catch (e) { return { error: 'JSON 解析失败：' + e.message }; }
  const arr = Array.isArray(data) ? data : (Array.isArray(data.prompts) ? data.prompts : null);
  if (!arr) return { error: '格式不对：需要 { "prompts": [...] } 结构，或直接一个数组' };
  const list = loadPrompts();
  let added = 0, skipped = 0;
  for (const it of arr) {
    const title = String(it?.title || '').trim();
    const content = String(it?.content || '').trim();
    if (!title || !content) { skipped++; continue; }
    if (list.some(x => x.title === title && x.content === content)) { skipped++; continue; }
    list.unshift({
      id: pkNewId(),
      title: title.slice(0, 60),
      content,
      desc: String(it?.desc || '').slice(0, 80),
      tags: normTags(it?.tags),
      category: PROMPT_CATEGORIES[it?.category] ? it.category : 'doc',
      builtin: false,
      fromPack: String(data?.name || (data && !Array.isArray(data) ? '导入包' : '导入')),
      createdAt: new Date().toISOString(),
    });
    added++;
  }
  savePrompts(list);
  return { added, skipped };
}

/* ---------- 提示词库 · 编辑 / 新建 ---------- */

let pkEditing = null; // null = 新建，否则为被编辑的 id

function openPromptEdit(id) {
  pkEditing = id || null;
  $('pkEditTitle').textContent = id ? '✏️ 编辑提示词' : '➕ 新建提示词';
  $('pkEditCat').innerHTML = Object.entries(PROMPT_CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const p = id ? loadPrompts().find(x => x.id === id) : null;
  $('pkEditName').value = p?.title || '';
  $('pkEditCat').value = p?.category || (pk.cat !== 'all' ? pk.cat : 'doc');
  $('pkEditDesc').value = p?.desc || '';
  $('pkEditTags').value = (p?.tags || []).join(', ');
  $('pkEditBody').value = p?.content || '';
  $('pkEditMask').classList.remove('hidden');
  $('pkEditName').focus();
}

function pkSaveEdit() {
  const title = $('pkEditName').value.trim();
  const content = $('pkEditBody').value.trim();
  if (!title || !content) { toast('标题和提示词正文都不能为空'); return; }
  upsertPrompt({
    id: pkEditing,
    title, content,
    desc: $('pkEditDesc').value.trim(),
    tags: normTags($('pkEditTags').value),
    category: $('pkEditCat').value,
  });
  $('pkEditMask').classList.add('hidden');
  renderPromptCats(); renderPrompts();
  toast(pkEditing ? '已保存修改' : '已保存到模板库');
}

/* ---------- 提示词库 · 使用（{{input}} 占位符约定） ---------- */

function openUsePrompt(id) {
  const p = loadPrompts().find(x => x.id === id);
  if (!p) return;
  pk.using = p;
  $('pkUseTitle').textContent = '▶ ' + p.title;
  $('pkUseDesc').textContent = p.desc || PROMPT_CATEGORIES[p.category] || '';
  $('pkUseBody').value = p.content;
  $('pkUseContent').value = '';
  $('pkUseMask').classList.remove('hidden');
  $('pkUseContent').focus();
}

function pkUseRun() {
  const p = pk.using;
  if (!p) return;
  const body = $('pkUseBody').value.trim();
  const content = $('pkUseContent').value.trim();
  if (!body) { toast('提示词正文不能为空'); return; }
  if (body.includes('{{input}}') && !content) { toast('这个提示词需要粘贴要处理的内容（{{input}} 位置）'); return; }
  const notReady = checkAIReady();
  if (notReady) { openSettings(); toast(notReady); return; }
  $('pkUseMask').classList.add('hidden');
  let sys, user;
  if (body.includes('{{input}}')) {
    sys = body.split('{{input}}').join(content);
    user = '请按系统提示词完成任务，直接输出结果，不要解释。';
  } else {
    sys = body;
    user = content ? `【待处理内容】\n${content}\n\n请按系统提示词完成任务，直接输出结果。` : '请按系统提示词完成任务，直接输出结果。';
  }
  switchTab('polish'); // 结果在主工作台流式呈现
  generate({
    badge: `📦 ${p.title}`,
    input: content || p.title,
    sys: body,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
  });
}

/* ---------- 提示词库 · AI 生成器 ---------- */

const PK_GEN_SYS = [
  '你是提示词工程专家，为「云笺」文稿助手的用户定制可复用提示词。用户会描述使用场景，请只输出一个 JSON 对象（不要 markdown 代码块标记，不要解释）：',
  '{"title":"简短标题（12字内）","desc":"一句话说明用途与适用场景（40字内）","content":"完整提示词正文"}',
  'content 的要求：',
  '1) 以明确的角色设定开头（你是……）；',
  '2) 任务描述具体可执行，含输出结构/格式要求；',
  '3) 包含必要约束（忠于原意、字数、语气等），并要求直接输出结果不解释；',
  '4) 用 {{input}} 占位符标记「用户将粘贴的内容」的位置，至少出现一次；',
  '5) 全部使用中文，content 一般在 150~300 字。',
].join('\n');

async function pkGenRun() {
  const scene = $('pkGenScene').value.trim();
  if (!scene) { toast('先描述一下你的使用场景'); $('pkGenScene').focus(); return; }
  const notReady = checkAIReady();
  if (notReady) { openSettings(); toast(notReady); return; }
  const btn = $('pkGenRun');
  btn.disabled = true;
  btn.textContent = '🪄 生成中…';
  const cat = $('pkGenCat').value;
  const extra = $('pkGenExtra').value.trim();
  const user = `【使用场景】\n${scene}\n【保存分类】${PROMPT_CATEGORIES[cat] || cat}${extra ? `\n【补充要求】${extra}` : ''}`;
  try {
    let raw;
    if (settings.demo) {
      await new Promise(r => setTimeout(r, 900));
      raw = JSON.stringify({
        title: '场景定制提示词（演示）',
        desc: '演示模式生成的示例提示词，接入 AI 后按你的场景真实定制',
        content: `你是……（演示模式示例）。请针对以下内容完成任务：\n1. 要求一；\n2. 要求二；\n3. 输出格式要求。\n\n内容：\n{{input}}`,
      });
    } else {
      raw = await fetchChatText(PK_GEN_SYS, user, null, null);
    }
    const obj = parseJsonLoose(raw);
    if (!obj || !String(obj.title || '').trim() || !String(obj.content || '').trim()) {
      throw new Error('AI 没有返回合格的提示词结构，请重试');
    }
    pk.lastGen = {
      title: String(obj.title).trim().slice(0, 60),
      desc: String(obj.desc || '').trim().slice(0, 80),
      content: String(obj.content).trim(),
      category: cat,
    };
    $('pkGenTitle').value = pk.lastGen.title;
    $('pkGenDesc').value = pk.lastGen.desc;
    $('pkGenBody').value = pk.lastGen.content;
    $('pkGenForm').classList.add('hidden');
    $('pkGenPreview').classList.remove('hidden');
  } catch (err) {
    toast('生成失败：' + (err.message || String(err)));
  } finally {
    btn.disabled = false;
    btn.textContent = '🪄 生成';
  }
}

/* ---------- 提示词库 · 导入 / 导出 / 恢复内置 ---------- */

function pkExport(list, name, filePrefix) {
  if (!list.length) { toast('没有可导出的提示词'); return; }
  downloadJSON(buildPromptExport(list, name), `${filePrefix}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`);
  toast(`已导出 ${list.length} 条提示词（.json 包）`);
}

function pkResetBuiltin() {
  const list = loadPrompts();
  let added = 0;
  for (const b of BUILTIN_PROMPTS) {
    if (!list.some(x => x.builtin && x.title === b.title)) { list.unshift(JSON.parse(JSON.stringify(b))); added++; }
  }
  savePrompts(list);
  renderPromptCats(); renderPrompts();
  toast(added ? `已恢复 ${added} 条内置模板` : '内置模板都在，无需恢复');
}



/* ---------- 批量处理（任务队列） ----------
 * 多篇文档 / 多段录音 → 排队逐个执行：摘要 / 润色 / 字幕校对
 * .srt 文件自动按字幕校对；音频文件先走本地转写再进 AI 队列；串行执行防限流 */

const batch = {
  tasks: [],   // {id, name, kind:'doc'|'audio', text, blob, autoSub, status:'wait'|'transcribing'|'running'|'done'|'fail'|'skip', result, error}
  op: 'summary',
  running: false, cancel: false, controller: null, viewing: null,
};

const BT_SYS_SUMMARY = '你是擅长信息提炼的中文编辑。用户会给你一篇长文本，请你通读后提炼：输出 300～500 字的详细摘要，用连贯段落书写，可适当分点；保留关键数据和结论，不要输出与摘要无关的内容。';
const BT_STATUS_LABEL = {
  wait: '⏳ 等待', transcribing: '🎙️ 转写中', running: '⚙️ 处理中',
  done: '✅ 完成', fail: '❌ 失败', skip: '⏭ 跳过',
};

function btAddTask({ name, kind = 'doc', text = '', blob = null }) {
  batch.tasks.push({
    id: 'bt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: (name || '未命名').slice(0, 60),
    kind, text, blob,
    autoSub: kind === 'doc' && (!!text && looksLikeSrt(text) || /\.srt$/i.test(name || '')),
    status: 'wait', result: '', error: '',
  });
  renderBatch();
}

function btRemoveTask(id) {
  if (batch.running) { toast('批量处理进行中，请先取消'); return; }
  batch.tasks = batch.tasks.filter(t => t.id !== id);
  renderBatch();
}

function btClearAll() {
  if (batch.running) { toast('批量处理进行中，请先取消'); return; }
  if (!batch.tasks.length) return;
  batch.tasks = [];
  renderBatch();
  toast('队列已清空');
}

function renderBatch() {
  const box = $('btList');
  if (!batch.tasks.length) {
    box.innerHTML = '<div class="bt-empty">队列为空：添加文档或录音后，这里会显示处理进度与结果</div>';
  } else {
    box.innerHTML = batch.tasks.map((t, i) => `
      <div class="bt-item ${t.status}" data-id="${t.id}">
        <span class="bt-idx">${i + 1}</span>
        <span class="bt-name" title="${esc(t.name)}">${esc(t.name)}</span>
        <span class="bt-kind">${t.kind === 'audio' ? '🎙️ 音频' : t.autoSub ? '🎬 字幕' : '📄 文档'}</span>
        <span class="bt-size">${t.text ? fmtNum(t.text.replace(/\s/g, '').length) + ' 字' : (t.blob ? (t.blob.size / 1024 / 1024).toFixed(1) + ' MB' : '')}</span>
        <span class="bt-status">${BT_STATUS_LABEL[t.status] || t.status}${t.status === 'done' && t.result ? ` · ${fmtNum(t.result.replace(/\s/g, '').length)} 字` : ''}</span>
        <span class="bt-item-acts">
          ${t.status === 'done' ? `<button class="pk-act use" data-btact="view" data-id="${t.id}">查看</button>` : ''}
          ${t.status !== 'running' && t.status !== 'transcribing' ? `<button class="pk-act" data-btact="del" data-id="${t.id}" title="移除">🗑</button>` : ''}
        </span>
        ${t.error ? `<div class="bt-error">${esc(t.error)}</div>` : ''}
      </div>`).join('');
  }
  const doneCount = batch.tasks.filter(t => t.status === 'done').length;
  const hasAudio = batch.tasks.some(t => t.kind === 'audio');
  const hasPending = batch.tasks.some(t => t.status !== 'done');
  $('btRunBtn').disabled = batch.running || !batch.tasks.length || !hasPending;
  $('btCancelBtn').classList.toggle('hidden', !batch.running);
  $('btClearBtn').classList.toggle('hidden', !batch.tasks.length || batch.running);
  $('btExportBtn').classList.toggle('hidden', !doneCount);
  $('btProgressText').textContent = batch.running
    ? `处理中 ${Math.min(doneCount + 1, batch.tasks.length)} / ${batch.tasks.length}…`
    : (doneCount ? `已完成 ${doneCount} / ${batch.tasks.length}` : '');
  $('btBar').classList.toggle('hidden', !batch.running && !doneCount);
  if (batch.running || doneCount) {
    $('btBarFill').style.width = `${Math.round(doneCount / Math.max(1, batch.tasks.length) * 100)}%`;
  }
}

async function btRun() {
  if (batch.running || !batch.tasks.length) return;
  const notReady = checkAIReady();
  if (notReady) { openSettings(); toast(notReady); return; }
  const hasAudio = batch.tasks.some(t => t.kind === 'audio');
  if (hasAudio && !settings.demo && isLocalSite()) {
    await auDetectEngine();
    if (!au.engine) toast('本机转写服务未连接：音频任务将使用云端转写（免费 · 每日 10 次）');
  }
  batch.running = true;
  batch.cancel = false;
  batch.controller = new AbortController();
  renderBatch();
  let ok = 0, fail = 0;
  try {
    for (const t of batch.tasks) {
      if (batch.cancel) break;
      if (t.status === 'done') continue; // 重跑时跳过已完成任务，只处理等待/失败的
      try {
        // 1) 音频先转写（已转写过的不重复转）；本地服务不可用时自动云端兜底
        if (t.kind === 'audio' && !t.text) {
          if (!t.blob) throw new Error('音频数据丢失');
          t.status = 'transcribing';
          t.error = '';
          renderBatch();
          if (settings.demo) {
            await new Promise(r => setTimeout(r, 700));
            t.text = '（演示转写）这是一段录音的转写文本，实际使用时由本地 faster-whisper 离线生成。';
          } else if (au.engine && isLocalSite()) {
            try {
              const r = await transcribeBlob(t.blob, {
                signal: batch.controller.signal,
                onStatus: () => {},
                onProgress: () => {},
              });
              const segs = (r.segments || [])
                .map(s => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: (s.text || '').trim() }))
                .filter(s => s.text && !auIsHallucination(s.text));
              if (!segs.length) throw new Error('没有识别到有效语音');
              t.text = auSegmentsToText(segs);
            } catch (err) {
              if (err.name === 'AbortError') throw err;
              t.text = await transcribeCloud(t.blob, batch.controller.signal); // 本地失败 → 云端兜底
            }
          } else {
            t.text = await transcribeCloud(t.blob, batch.controller.signal); // 线上版直接云端
          }
        }
        if (!t.text || !t.text.trim()) throw new Error('内容为空');
        // 2) AI 任务（.srt 强制字幕校对）
        const op = t.autoSub ? 'subfix' : batch.op;
        t.status = 'running';
        renderBatch();
        let result;
        if (settings.demo) {
          await new Promise(r2 => setTimeout(r2, 600));
          result = `**（演示）${{ summary: '批量摘要', polish: '批量润色', subfix: '字幕校对' }[op]}结果**\n\n已按「${t.name}」的内容演示处理。实际使用时由当前 AI 模式（在线 DeepSeek 或本地 Ollama）真实生成。`;
        } else {
          const sys = op === 'summary' ? BT_SYS_SUMMARY : buildSystem(op === 'subfix' ? 'subFix' : op);
          result = (await fetchChatText(sys, `【待处理内容】\n${t.text}`, batch.controller.signal, null) || '').trim();
        }
        if (!result) throw new Error('AI 没有返回内容');
        if (op === 'subfix') {
          const rep = repairSrtTimeline(t.text, result);
          if (rep.repaired) result = rep.out;
        }
        t.result = result;
        t.status = 'done';
        ok++;
      } catch (err) {
        // 取消/中止：把执行中的任务放回等待队列，用户可重跑续做
        if (err.name === 'AbortError' || batch.cancel) {
          if (t.status === 'running' || t.status === 'transcribing') t.status = 'wait';
          break;
        }
        t.status = 'fail';
        t.error = err.message || String(err);
        fail++;
      }
      renderBatch();
      if (batch.op !== 'subfix' && !settings.demo && !isLocalMode()) await new Promise(r => setTimeout(r, 400)); // 在线模式任务间小歇防限流
    }
  } finally {
    batch.running = false;
    batch.controller = null;
    renderBatch();
    toast(batch.cancel ? `已取消：完成 ${ok} 个${fail ? `，失败 ${fail} 个` : ''}` : `批量处理完成：成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ''}`);
  }
}

function btView(id) {
  const t = batch.tasks.find(x => x.id === id);
  if (!t || !t.result) return;
  batch.viewing = t;
  $('btResultTitle').textContent = `📄 ${t.name}`;
  $('btResultText').value = t.result;
  $('btResultMask').classList.remove('hidden');
}

function btExportMerged() {
  const dones = batch.tasks.filter(t => t.status === 'done' && t.result);
  if (!dones.length) { toast('还没有已完成的任务'); return; }
  const md = dones.map((t, i) => `## ${i + 1}. ${t.name}\n\n${t.result}`).join('\n\n---\n\n');
  downloadText(`# 云笺批量处理结果（${dones.length} 个任务）\n\n${md}\n`, `批量结果_${new Date().toISOString().slice(0, 10)}.md`);
  toast(`已合并导出 ${dones.length} 个任务结果`);
}

async function btReadFile(f) {
  if (/\.(txt|md|srt|vtt|csv)$/i.test(f.name)) {
    const text = await f.text();
    if (!text.trim()) { toast(`「${f.name}」是空的，已跳过`); return; }
    btAddTask({ name: f.name, kind: 'doc', text });
  } else {
    btAddTask({ name: f.name, kind: 'audio', blob: f });
  }
}

/* ---------- 答辩模拟（AI 评委多轮提问 + 点评 + 报告） ---------- */

const df = {
  history: [],   // messages（含 system）
  busy: false, round: 0, ended: false,
  controller: null, painting: null,
};

const DF_STYLE_HINT = { 温和: '温和：以鼓励为主，问题循循善诱，点评先肯定再建议', 标准: '标准：客观严格，直指回答中的漏洞，不给情面但不人身攻击', 犀利: '犀利：直击要害，敢于质疑与追问到底，模拟最难缠的评委' };

function dfSysPrompt() {
  return `你是「${$('dfScene').value}」现场的评委老师（风格：${$('dfStyleSeg').querySelector('.seg.active')?.dataset.dfstyle || '标准'}，${DF_STYLE_HINT[$('dfStyleSeg').querySelector('.seg.active')?.dataset.dfstyle || '标准']}）。请对学生进行多轮模拟答辩，每一轮回复严格遵守以下规则：
1. 若学生刚回答了上一问，先用 60～150 字输出【点评】：指出 1～2 个亮点，再指出 2 个以内漏洞（答错的、没答到点上的、含糊其辞的），最后给一句「更好的答法」建议；
2. 然后输出【问题N】（N 为题号）：只提一个新问题，简短具体；问题按此顺序逐步深入：研究背景与动机 → 核心概念与方法 → 实验或论证细节 → 结果与数据 → 创新点 → 局限与未来工作，学生答到哪里就追问到哪里；
3. 点评必须针对学生回答的具体内容，不复读规则；每轮只提一个问题，绝不一次列出多个；
4. 输出格式（严格遵守）：
【点评】……
【问题N】……
第一轮没有点评，直接【问题1】。不要解释这些规则。

【学生汇报文稿】
${$('dfDoc').value.trim()}`;
}

function dfAddMsg(role, html) {
  const div = document.createElement('div');
  div.className = 'df-msg ' + role;
  div.innerHTML = role === 'judge'
    ? `<div class="df-who">👨‍🏫 评委</div><div class="df-bubble">${html}</div>`
    : `<div class="df-who">🧑‍🎓 我</div><div class="df-bubble">${html}</div>`;
  $('dfChat').appendChild(div);
  $('dfChat').scrollTop = $('dfChat').scrollHeight;
  return div.querySelector('.df-bubble');
}

function dfUpdateRound() {
  $('dfRound').classList.remove('hidden');
  $('dfRoundNum').textContent = df.ended ? '报告' : Math.max(1, df.round);
}

async function dfAsk(userText, { isReport = false } = {}) {
  if (df.busy) return;
  df.busy = true;
  $('dfSendBtn').disabled = true;
  df.history.push({ role: 'user', content: userText });
  if (isReport) df.ended = true;
  dfUpdateRound();
  const bubble = dfAddMsg('judge', '<span class="stream-cursor"></span>');
  let out = '';
  const paint = () => { bubble.innerHTML = renderMarkdown(out) + '<span class="stream-cursor"></span>'; $('dfChat').scrollTop = $('dfChat').scrollHeight; };
  df.controller = new AbortController();
  try {
    if (settings.demo) {
      const demo = isReport
        ? '## 总体评分 7/10\n\n## 表现亮点\n- 概念表述清晰，逻辑基本完整\n- 对核心方法的理解到位\n\n## 暴露的漏洞\n- 数据支撑不足（演示模式）\n- 创新点回答偏泛\n\n## 改进清单\n1. 每个结论配一个数字\n2. 准备一句「创新点一句话」\n\n（演示模式示例报告）'
        : `【点评】回答思路是对的，但${df.round % 2 ? '缺少数据支撑' : '没有落到具体方法上'}，建议先给结论再补论据。\n\n【问题${df.round + 1}】（演示）那你的方案在样本量扩大 10 倍后，性能还能保持吗？`;
      for (let i = 0; i < demo.length && !df.controller.signal.aborted; i += 4) {
        out = demo.slice(0, i + 4);
        paint();
        await new Promise(r => setTimeout(r, 14));
      }
    } else {
      await callDeepSeek(
        df.history.slice(-13),
        (d) => { out += d; paint(); },
        () => { if (!out) paint(); },
        df.controller.signal,
        null,
      );
    }
    bubble.innerHTML = renderMarkdown(out);
    df.history.push({ role: 'assistant', content: out });
    if (df.history.length > 14) df.history = [df.history[0], ...df.history.slice(-13)]; // 保留 system
    if (!isReport) {
      const m = out.match(/【问题(\d+)】/);
      df.round = m ? Number(m[1]) : df.round + 1;
      df.ended = false;
      dfUpdateRound();
    }
  } catch (err) {
    bubble.innerHTML = renderMarkdown(err.name === 'AbortError' ? '*（已停止）*' : '⚠️ ' + (err.message || String(err)));
  } finally {
    df.busy = false;
    $('dfSendBtn').disabled = false;
    $('dfChat').scrollTop = $('dfChat').scrollHeight;
  }
}

function dfStart() {
  const doc = $('dfDoc').value.trim();
  if (!doc) { toast('请先粘贴汇报文稿 / 论文摘要'); $('dfDoc').focus(); return; }
  const notReady = checkAIReady();
  if (notReady) { openSettings(); toast(notReady); return; }
  df.history = [{ role: 'system', content: dfSysPrompt() }];
  df.round = 0;
  df.ended = false;
  df.busy = false;
  $('dfSetup').classList.add('hidden');
  $('dfChatWrap').classList.remove('hidden');
  $('dfChat').innerHTML = '';
  dfAddMsg('student', `<div class="md">${renderMarkdown(`📋 汇报文稿已提交（${fmtNum(doc.replace(/\s/g, '').length)} 字），场景：${$('dfScene').value} · 评委风格：${$('dfStyleSeg').querySelector('.seg.active')?.dataset.dfstyle || '标准'}`)}</div>`);
  dfAsk('评委老师好，请开始第一问。');
}

function dfSend() {
  const text = $('dfInput').value.trim();
  if (!text || df.busy) return;
  if (df.ended) { toast('本轮已结束出报告，点「↺ 重新开始」再来一局'); return; }
  $('dfInput').value = '';
  dfAddMsg('student', `<div class="md">${renderMarkdown(text)}</div>`);
  dfAsk(text);
}

function dfEnd() {
  if (df.busy) return;
  if (df.round < 1) { toast('至少回答一个问题再出报告'); return; }
  dfAddMsg('student', '<div class="md"><p>🏁 <b>（学生）模拟到此结束，请评委出整体表现报告。</b></p></div>');
  dfAsk('（模拟结束）请基于以上全部问答，输出整体表现报告，格式：\n## 总体评分 X/10\n## 表现亮点\n## 暴露的漏洞\n## 改进清单\n## 高危追问预测（3 个最可能问倒我的问题与应对思路）', { isReport: true });
}

function dfRestart() {
  if (df.busy) df.controller?.abort();
  df.busy = false;
  df.ended = false;
  df.round = 0;
  df.history = [];
  $('dfChatWrap').classList.add('hidden');
  $('dfSetup').classList.remove('hidden');
  $('dfRound').classList.add('hidden');
}



/* ---------- 小云动画系统：待机浮动 / 说话蹦跳 / 表情气泡 ---------- */

function xwTalking(on) {
  $('aiFab')?.classList.toggle('talking', on);
  document.getElementById('aiHead')?.classList.toggle('talking', on);
}

/* 小云头顶冒表情气泡 */
function xwBubble(emoji) {
  const fab = $('aiFab');
  if (!fab) return;
  const b = document.createElement('span');
  b.className = 'ai-fab-bubble';
  b.textContent = emoji || ['💬', '✨', '📝', '🎓', '💡', '🎀'][Math.floor(Math.random() * 6)];
  fab.appendChild(b);
  setTimeout(() => b.remove(), 1900);
}

/* 待机小动作：交替「轻轻晃 / 左右踱步」，偶尔冒个气泡——让小云像站在页面上一样活 */
let xwIdleTick = 0;
setInterval(() => {
  if (document.hidden || state.generating || aiBusy) return;
  const fab = $('aiFab');
  if (!fab || fab.classList.contains('talking') || fab.classList.contains('wiggle') || fab.classList.contains('walk')) return;
  xwIdleTick++;
  if (xwIdleTick % 3 === 0) {
    fab.classList.add('walk');
    setTimeout(() => fab.classList.remove('walk'), 7000);
    if (Math.random() < 0.5) xwBubble();
  } else {
    fab.classList.add('wiggle');
    setTimeout(() => fab.classList.remove('wiggle'), 800);
    if (Math.random() < 0.3) xwBubble();
  }
}, 8000);

/* ---------- 使用指南 / 新手分步引导 ---------- */

const GUIDE_SEEN_KEY = 'wg_seen_guide';

function openGuide() {
  $('guideMask').classList.remove('hidden');
  localStorage.setItem(GUIDE_SEEN_KEY, '1');
}

function closeGuide() {
  $('guideMask').classList.add('hidden');
}

const TOUR_STEPS = [
  { sel: '#modeQuick', t: '第 1 步 · 选 AI 模式', d: '🌐 在线：填 DeepSeek Key（还没 Key？点「🎁 免费体验 3 次」直接试）；💻 本地：Ollama 离线免费。随时可切换。' },
  { sel: '#inputText', t: '第 2 步 · 喂入内容', d: '把文稿、录音转写结果、字幕粘贴到这里；也支持直接拖入 txt / srt 文件。' },
  { sel: '.tabs', t: '第 3 步 · 挑一个功能', d: '润色、摘要、PPT、答辩模拟、批量处理、录音转写……17 个模块点上方标签切换，再点醒目的功能按钮生成。' },
  { sel: '#resultBody', t: '第 4 步 · 收结果', d: '流式输出实时可见：可复制、导出 .md / .srt、一键应用回输入框继续加工，还能追问微调。' },
];
let tourIdx = -1;

function startTour() {
  $('aiPanel').classList.add('hidden');
  closeGuide();
  tourIdx = 0;
  renderTourStep();
}

function endTour(msg = '教程完成！去试试吧，有问题随时找小云～') {
  tourIdx = -1;
  document.getElementById('tourHighlight')?.remove();
  document.getElementById('tourCard')?.remove();
  if (msg) toast(msg);
}

function renderTourStep() {
  document.getElementById('tourHighlight')?.remove();
  document.getElementById('tourCard')?.remove();
  const step = TOUR_STEPS[tourIdx];
  if (!step) return endTour();
  const el = document.querySelector(step.sel);
  if (!el) return endTour();
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });

  setTimeout(() => {
    const r = el.getBoundingClientRect();
    const hi = document.createElement('div');
    hi.id = 'tourHighlight';
    hi.style.left = (r.left - 6) + 'px';
    hi.style.top = (r.top - 6) + 'px';
    hi.style.width = (r.width + 12) + 'px';
    hi.style.height = (r.height + 12) + 'px';
    document.body.appendChild(hi);

    const card = document.createElement('div');
    card.id = 'tourCard';
    card.innerHTML = `
      <div class="t-title">🎓 ${step.t}</div>
      <div class="t-desc">${step.d}</div>
      <div class="t-foot">
        <span class="t-idx">${tourIdx + 1} / ${TOUR_STEPS.length}</span>
        <span class="t-btns">
          <button class="text-btn" id="tourSkip">跳过</button>
          <button class="primary-btn small" id="tourNext">${tourIdx < TOUR_STEPS.length - 1 ? '下一步 →' : '完成 🎉'}</button>
        </span>
      </div>`;
    document.body.appendChild(card);
    // 卡片定位：优先高亮框下方，空间不足放上方，左右收进视口
    const cr = card.getBoundingClientRect();
    let top = r.bottom + 12;
    if (top + cr.height > window.innerHeight - 12) top = Math.max(12, r.top - cr.height - 12);
    card.style.top = top + 'px';
    card.style.left = Math.max(12, Math.min(window.innerWidth - cr.width - 12, r.left)) + 'px';
    $('tourNext').addEventListener('click', () => { tourIdx++; renderTourStep(); });
    $('tourSkip').addEventListener('click', () => endTour());
  }, 380);
}



/* ---------- 结果一键应用到输入框（SmartSub「逐条采纳」思想的轻量版，带撤销） ---------- */

function hideApply() {
  const b = $('applyBtn');
  if (!b) return;
  b.classList.add('hidden');
  b.textContent = '📥 应用到输入框';
  state.appliedBackup = null;
}

/* full = 整段结果；head = 截掉改写对照表之前的正文；tail = 取「修改后的全文」小节 */
function extractApplyText(task, out) {
  const t = String(out || '');
  if (task?.applyMode === 'tail') {
    const m = t.match(/\*?\*?(?:修改后|修正后)的(?:全文|文稿)\*?\*?\s*\n?/);
    return m ? t.slice(m.index + m[0].length).trim() : '';
  }
  if (task?.applyMode === 'head') {
    const cut = t.search(/\*?\*?主要改写点\*?\*?|\|\s*修改内容|\|\s*原句/);
    if (cut > 30) return t.slice(0, cut).trim();
    const ti = t.search(/^\s*\|/m);
    if (ti > 30) return t.slice(0, ti).trim();
  }
  return t.trim();
}

function applyToInput() {
  if (state.appliedBackup !== null) { // 再点一次 = 撤销
    inputText.value = state.appliedBackup;
    state.appliedBackup = null;
    updateCharCount();
    $('applyBtn').textContent = '📥 应用到输入框';
    toast('已撤销，输入框恢复原内容');
    return;
  }
  const txt = extractApplyText(state.lastTask, state.lastOutput);
  if (!txt) { toast('这个结果没有可直接应用的正文'); return; }
  state.appliedBackup = inputText.value;
  inputText.value = txt;
  updateCharCount();
  $('applyBtn').textContent = '↩ 撤销替换';
  inputText.focus();
  toast('已替换输入框内容；再点一次可撤销');
}

/* ---------- 文本文件下载（SRT / TXT 导出） ---------- */

function downloadText(text, name) {
  const blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* 字幕任务完成后，在结果工具栏加 .srt / 剪映文稿 下载按钮 */
function addSrtTools(out) {
  const tools = document.querySelector('.result-tools');
  if (!tools || !out.includes('-->')) return;
  const base = (inputText.value.trim().slice(0, 12).replace(/[\\/:*?"<>|\s]/g, '') || 'subtitles');
  const mk = (id, label, content, name) => {
    const b = document.createElement('button');
    b.id = id; b.className = 'ghost-btn small'; b.textContent = label;
    b.addEventListener('click', () => downloadText(content, name));
    tools.insertBefore(b, tools.firstChild);
  };
  mk('srtDlBtn', '⬇ .srt 字幕', out, `${base}.srt`);
  // 剪映「文稿匹配」用的纯文本：去掉序号行与时间轴行
  const plain = out.split('\n').map(l => l.trim()).filter(l => l && !/^\d+$/.test(l) && !l.includes('-->')).join('\n');
  mk('txtDlBtn', '⬇ 剪映文稿.txt', plain, `${base}_文稿.txt`);
}

function clearSrtTools() {
  ['srtDlBtn', 'txtDlBtn', 'srtTransOnlyBtn'].forEach(id => document.getElementById(id)?.remove());
  document.querySelectorAll('.result-tools .tool-chip').forEach(el => el.remove());
}

/* ---------- 提取视频内嵌字幕（复用本地 ffmpeg 引擎） ---------- */async function extractEmbeddedSubs() {
  const input = $('subVidInput');
  input.onchange = async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (typeof FFmpegWASM === 'undefined' || typeof ensureEngine !== 'function') { toast('处理引擎未就绪，请刷新页面'); return; }
    try {
      const ff = await ensureEngine();
      setVProgress(true, '正在提取内嵌字幕…', null);
      const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, 'mkv'])[1].toLowerCase();
      await ff.writeFile('subin.' + ext, new Uint8Array(await file.arrayBuffer()));
      const code = await ff.exec(['-i', 'subin.' + ext, '-map', '0:s:0', 'subout.srt']);
      try { await ff.deleteFile('subin.' + ext); } catch (e) { /* ignore */ }
      if (code !== 0) {
        setVProgress(false);
        toast('该视频没有内嵌字幕轨。可把字幕文稿粘贴过来用「文稿转字幕」生成 SRT，剪映里也可用「文稿匹配」功能');
        return;
      }
      const data = await ff.readFile('subout.srt');
      try { await ff.deleteFile('subout.srt'); } catch (e) { /* ignore */ }
      setVProgress(false);
      const text = new TextDecoder('utf-8').decode(data);
      inputText.value = text;
      updateCharCount();
      toast('内嵌字幕已提取到输入框，点「字幕纠错润色」可让 AI 修正错别字');
    } catch (e) {
      setVProgress(false);
      toast('提取失败：' + (e.message || e));
    }
  };
  input.click();
}

/* ---------- PPT 智能生成 ---------- */

const PPT = { slides: [], theme: 'defense', busy: false };

function setPptTheme(t) {
  if (!PPT_THEMES[t]) t = 'defense';
  PPT.theme = t;
  document.querySelectorAll('[data-ptheme]').forEach(c => c.classList.toggle('active', c.dataset.ptheme === t));
  const sel = document.getElementById('pptThemeSel');
  if (sel) sel.value = t;
}

/* 调 DeepSeek 生成大纲 JSON */
async function generatePPT(text) {
  if (PPT.busy) return;
  PPT.busy = true;
  document.querySelectorAll('[data-action]').forEach(b => { if (b.dataset.action === 'pptGen') b.disabled = true; });

  const pages = Number($('pptPages')?.value) || 10;
  resultBadge.textContent = 'PPT · 大纲生成';
  $('tokenUsage').textContent = '';
  banner.classList.add('hidden');
  clearSrtTools();
  hideApply();
  $('followups').classList.add('hidden');
  resultBody.innerHTML = `<div class="md"><p>🪄 正在构思《${esc(text.slice(0, 16))}${text.length > 16 ? '…' : ''}》的大纲…</p><span class="stream-cursor"></span></div>`;

  const finish = () => {
    PPT.busy = false;
    document.querySelectorAll('[data-action]').forEach(b => { if (b.dataset.action === 'pptGen') b.disabled = false; });
  };

  const sys = [
    '你是资深 PPT 策划与结构设计师。请根据用户的主题或文稿设计一份 PPT 大纲。要求：',
    '1. 严格只输出一个 JSON 数组——第一个字符必须是 [，最后一个字符必须是 ]。不要任何解释、前言、后记，不要 markdown 代码块标记；',
    '2. 数组每个元素形如 {"title":"页面标题","points":["要点1","要点2","要点3"],"notes":"演讲备注，1～2 句"}；',
    `3. 共 ${pages} 页左右：第 1 页是封面（title 为主标题，points 为副标题/汇报人占位），第 2 页为目录/总览，最后一页是致谢结束页；`,
    '4. 中间每页 2～5 个要点，每条要点不超过 22 字，基于文稿提炼、逻辑清晰、详略得当；',
    '5. notes 是这一页的演讲备注：口语化 1～2 句，说明这一页要讲什么、怎么讲，每页都要写；',
    '6. 所有文字用中文（专有名词除外）。字段名必须用英文 title / points / notes。',
    '输出格式示例（只参考格式，内容必须换成用户的主题，注意第一字符是 [）：',
    '[{"title":"人工智能在校园学习中的应用","points":["汇报人：XXX","日期占位"],"notes":"大家好，今天分享 AI 如何帮我们更高效地学习。"},{"title":"AI 带来的三个改变","points":["查资料更快","写作业更高效","复习更有针对性"],"notes":"这一页举三个身边例子，每个 10 秒带过。"}]',
  ].join('\n');

  try {
    let raw = '';
    if (settings.demo) {
      const name = text.replace(/\s+/g, ' ').slice(0, 20);
      const demo = [
        { title: name, points: ['副标题：现状 · 方法 · 展望', '汇报人：【你的名字】'], notes: '开场问好，用一句话介绍主题和自己的身份，控制在 20 秒内。' },
        { title: '目录', points: ['背景与现状', '核心方法', '实践效果', '总结与展望'], notes: '快速过一遍汇报结构，告诉评委接下来分几部分讲。' },
        { title: '背景与现状', points: [`「${name}」的由来`, '当前存在的问题', '为什么要做这件事'], notes: '用一个具体例子引出问题，强调「为什么值得做」。' },
        { title: '核心方法', points: ['关键思路：化繁为简', '三个步骤拆解', '与常规做法对比'], notes: '这是重点页，放慢语速；三个步骤各用一句话概括，再展开讲第一个。' },
        { title: '实践效果', points: ['效率提升明显', '质量更稳定', '可复制推广'], notes: '用数据说话，对比前后的差异，语气可以自信一些。' },
        { title: '总结与展望', points: ['回顾三个要点', '下一步计划'], notes: '回顾呼应开头，展望部分提一个具体的下一步即可。' },
        { title: '谢谢观看', points: ['欢迎提问交流'], notes: '致谢并邀请提问，准备好回答方法细节类问题。' },
      ];
      let i = 0;
      for (; i <= demo.length; i++) {
        if (state.controller?.signal.aborted) throw new DOMException('aborted', 'AbortError');
        resultBody.innerHTML = `<div class="md"><p>🪄 正在构思大纲…（${Math.min(i + 1, demo.length)}/${demo.length} 页）</p><span class="stream-cursor"></span></div>`;
        await new Promise(r => setTimeout(r, 160));
      }
      PPT.slides = demo.map(s => ({ title: s.title, points: s.points.join('\n'), notes: s.notes }));
      recordUsage(demoUsage(text, JSON.stringify(demo)));
      showUsage(demoUsage(text, JSON.stringify(demo)), true);
    } else {
      state.controller = new AbortController();
      // 大纲需要完整 JSON，流式解析易碎，直接取完整结果
      // 生成 + 解析；解析失败把错误信息喂回去自动重试一次（小模型 JSON 常见）
      let slides = null, lastErr = null;
      for (let attempt = 0; attempt < 2 && !state.controller.signal.aborted; attempt++) {
        const retryHint = attempt === 0 ? '' : `\n\n【重要】你上一次的输出无法解析（${lastErr}）。请严格输出 JSON 数组：第一个字符必须是 [，字段名用英文 title / points / notes，不要任何其他文字。`;
        const raw = await fetchChatText(sys, text + retryHint, state.controller.signal);
        try { slides = parseSlidesJSON(raw); break; }
        catch (e) { lastErr = e.message; }
        if (attempt === 0) {
          resultBody.innerHTML = `<div class="md"><p>格式不太对，正在自动修正重试…（第 2 次，共 2 次）</p><span class="stream-cursor"></span></div>`;
        }
      }
      if (!slides) throw new Error(lastErr || 'AI 没有返回可解析的大纲');
      PPT.slides = slides;
    }
    renderPptEditor();
    toast('大纲已生成，可在右侧逐页编辑后导出');
  } catch (err) {
    if (err.name === 'AbortError') {
      resultBody.innerHTML = `<div class="result-error"><div class="err-title">已停止</div><p>本次生成已取消。</p></div>`;
    } else {
      resultBody.innerHTML = `<div class="result-error"><div class="err-title">⚠️ 大纲生成失败</div><p>${esc(err.message || String(err))}</p></div>`;
    }
  } finally {
    state.controller = null;
    finish();
  }
}

/* 非流式请求（PPT 大纲需要完整 JSON，流式解析反而易碎；同样支持在线 / 本地双模式） */
async function fetchChatText(sys, user, signal, onUsage) {
  const ep = aiEndpointConfig();
  let res;
  try {
    res = await fetch(`${ep.base}/chat/completions`, {
      method: 'POST',
      headers: ep.headers,
      body: JSON.stringify({
        model: ep.model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        ...(ep.local ? { max_tokens: 4096 } : {}),
      }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error(ep.local
      ? `无法连接本地模型服务（${ep.base}）。请确认 Ollama 正在运行且已拉取模型；若本页不是从 localhost 打开，需设置环境变量 OLLAMA_ORIGINS=* 后重启 Ollama。`
      : '网络错误：无法连接 DeepSeek API。请检查网络，或在「设置 → API 地址」中填入中转地址。');
  }
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.error?.message || JSON.stringify(j); } catch (e) { /* ignore */ }
    if (ep.local && res.status === 404) {
      throw new Error(`本地模型「${ep.model}」不存在。请先执行 ollama pull ${ep.model || 'qwen3:8b'}，或到「设置」重新检测选择。`);
    }
    const map = { 401: 'API Key 无效或已过期', 402: '账户余额不足', 429: '请求过于频繁' };
    throw new Error(map[res.status] || `请求失败（HTTP ${res.status}）${detail ? '：' + detail.slice(0, 200) : ''}`);
  }
  const j = await res.json();
  if (onUsage) {
    if (j.usage) onUsage(j.usage);
    else if (ep.local) onUsage(demoUsage(sys + user, j.choices?.[0]?.message?.content || ''));
  }
  // 剥离思考型模型（qwen3 / deepseek-r1）混在正文里的 <think> 思考段
  let out = j.choices?.[0]?.message?.content || '';
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s+/, '');
  return out;
}

/* PPT 大纲解析（健壮版）：兼容代码块包裹、对象包裹（slides/outline/pages）、
   中文引号、无引号键、尾逗号、字段名变体、要点为字符串等多种小模型输出习惯 */
function parseSlidesJSON(raw) {
  let t = String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[a-z]*\n?/gi, '')
    .trim();

  const tryParse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  const fixPasses = [
    (s) => s,
    (s) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),                                              // 中文引号
    (s) => s.replace(/"(?:[^"\\]|\\[\s\S])*"/g, (m) => m.replace(/\r/g, '').replace(/\n/g, '\\n')),     // 字符串值内的裸换行转义（小模型常见非法输出）
    (s) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,(\s*[}\]])/g, '$1'),                // + 尾逗号
    (s) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":'), // + 无引号键
  ];
  const candidates = [t];
  const ai = t.indexOf('['), ae = t.lastIndexOf(']');
  if (ai !== -1 && ae > ai) candidates.push(t.slice(ai, ae + 1));
  const bi = t.indexOf('{'), be = t.lastIndexOf('}');
  if (bi !== -1 && be > bi) candidates.push(t.slice(bi, be + 1));

  let arr = null;
  outer:
  for (const cand of candidates) {
    for (const fix of fixPasses) {
      const v = tryParse(fix(cand));
      if (v === null || typeof v !== 'object') continue;
      const list = Array.isArray(v) ? v
        : (Array.isArray(v.slides) ? v.slides
        : (Array.isArray(v.outline) ? v.outline
        : (Array.isArray(v.pages) ? v.pages : null)));
      if (list && list.length) { arr = list; break outer; }
    }
  }
  if (!arr) throw new Error('AI 没有返回可解析的大纲 JSON');

  const pick = (it, keys) => {
    for (const k of keys) {
      const v = it[k];
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) return v.map(p => String(p).trim()).filter(Boolean);
      if (typeof v === 'string' && v.trim()) return [v.trim()];
    }
    return [];
  };
  const normTitle = (it) => pick(it, ['title', '标题', 'pageTitle', 'name', 'heading'])[0] || '';
  const normNotes = (it) => pick(it, ['notes', '备注', 'note', '演讲备注', 'remark'])[0] || '';

  const slides = arr
    .filter(it => it && typeof it === 'object')
    .map(it => {
      const title = normTitle(it);
      const points = pick(it, ['points', '要点', 'bullets', 'items', 'content'])
        .flatMap(p => String(p).split(/\n|；|;/))
        .map(p => p.trim().replace(/^[-•·*\d.、)\s]+/, ''))
        .filter(Boolean)
        .slice(0, 8);
      return {
        title: title.slice(0, 60) || (points[0] ? points[0].slice(0, 30) : '未命名页'),
        points: points.join('\n') || '（本页要点，可编辑补充）',
        notes: normNotes(it).slice(0, 300),
      };
    })
    .filter(s => s.title !== '未命名页' || s.points !== '（本页要点，可编辑补充）');
  if (!slides.length) throw new Error('大纲为空，请重试');
  return slides.slice(0, 30);
}

function slideCardHTML(s, i) {
  return `
  <div class="slide-card">
    <div class="slide-card-head">
      <span class="slide-num">${i + 1}</span>
      <input class="slide-title" data-slide-title="${i}" value="${esc(s.title)}" placeholder="页面标题">
      ${PPT.slides.length > 1 ? `<button class="slide-del" data-slide-del="${i}" title="删除本页">🗑</button>` : ''}
    </div>
    <textarea class="slide-bullets" data-slide-points="${i}" placeholder="每行一个要点">${esc(s.points)}</textarea>
    <textarea class="slide-notes" data-slide-notes="${i}" placeholder="🗣 演讲备注（导出到 PPT 备注栏，答辩 / 演讲时照着讲）">${esc(s.notes || '')}</textarea>
  </div>`;
}

function renderPptEditor() {
  resultBadge.textContent = `PPT · 编辑大纲（${PPT.slides.length} 页）`;
  $('tokenUsage').textContent = '';
  resultBody.innerHTML = `
    <div class="slide-list">
      ${PPT.slides.map(slideCardHTML).join('')}
      <button class="slide-add" id="slideAddBtn">＋ 添加一页</button>
    </div>
    <div class="ppt-toolbar">
      <select id="pptThemeSel" class="select" title="导出模板风格">
        ${Object.entries(PPT_THEMES).map(([k, t]) => `<option value="${k}" ${k === PPT.theme ? 'selected' : ''}>${t.name}</option>`).join('')}
      </select>
      <span class="spacer"></span>
      <button class="primary-btn small" id="pptExportBtn">⬇ 导出 .pptx</button>
    </div>`;
  resultBody.scrollTop = 0;

  resultBody.querySelectorAll('[data-slide-title]').forEach(inp =>
    inp.addEventListener('input', () => { PPT.slides[+inp.dataset.slideTitle].title = inp.value; }));
  resultBody.querySelectorAll('[data-slide-points]').forEach(ta =>
    ta.addEventListener('input', () => { PPT.slides[+ta.dataset.slidePoints].points = ta.value; }));
  resultBody.querySelectorAll('[data-slide-notes]').forEach(ta =>
    ta.addEventListener('input', () => { PPT.slides[+ta.dataset.slideNotes].notes = ta.value; }));
  resultBody.querySelectorAll('[data-slide-del]').forEach(btn =>
    btn.addEventListener('click', () => { PPT.slides.splice(+btn.dataset.slideDel, 1); renderPptEditor(); }));
  $('slideAddBtn').addEventListener('click', () => {
    PPT.slides.splice(Math.max(1, PPT.slides.length - 1), 0, { title: '新页面', points: '要点一\n要点二', notes: '' });
    renderPptEditor();
    resultBody.querySelectorAll('[data-slide-title]')[Math.max(1, PPT.slides.length - 2)]?.focus();
  });
  $('pptThemeSel').addEventListener('change', (e) => setPptTheme(e.target.value));
  $('pptExportBtn').addEventListener('click', exportPptx);
}

/* 用 pptxgenjs 把大纲导出为 .pptx */
async function exportPptx() {
  if (!PPT.slides.length) { toast('请先生成或添加幻灯片'); return; }
  if (typeof PptxGenJS === 'undefined') { toast('导出组件未加载，请联网刷新页面后重试'); return; }
  const btn = $('pptExportBtn');
  btn.disabled = true;
  btn.textContent = '生成中…';
  try {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    buildPptx(pptx);
    let blob;
    try { blob = await pptx.write({ outputType: 'blob' }); }
    catch (e) { blob = await pptx.write('blob'); }
    const name = (PPT.slides[0].title || '演示文稿').replace(/[\\/:*?"<>|]/g, '').slice(0, 40) + '.pptx';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    toast(`已导出 ${name}`);
  } catch (e) {
    toast('导出失败：' + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇ 导出 .pptx';
  }
}

function buildPptx(pptx) {
  const T = PPT_THEMES[PPT.theme] || PPT_THEMES.defense;
  const W = 10, H = 5.625;
  const n = PPT.slides.length;
  PPT.slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: T.bg };
    const isCover = i === 0;
    const isEnd = i === n - 1 && n > 2;
    if (isCover) {
      slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 2.05, w: 0.16, h: 1.5, fill: { color: T.accent } });
      slide.addText(s.title, { x: 0.55, y: 1.85, w: W - 1.2, h: 1.2, fontSize: 36, bold: true, color: T.ink, fontFace: 'Microsoft YaHei', valign: 'middle' });
      const sub = s.points.split('\n').filter(Boolean).join('　·　');
      if (sub) slide.addText(sub, { x: 0.58, y: 3.2, w: W - 1.3, h: 0.5, fontSize: 14, color: T.muted, fontFace: 'Microsoft YaHei' });
    } else if (isEnd) {
      slide.addText(s.title, { x: 0.5, y: 1.8, w: W - 1, h: 1.1, align: 'center', fontSize: 40, bold: true, color: T.ink, fontFace: 'Microsoft YaHei' });
      const sub = s.points.split('\n').filter(Boolean).join('\n');
      if (sub) slide.addText(sub, { x: 0.5, y: 3.05, w: W - 1, h: 0.8, align: 'center', fontSize: 14, color: T.muted, fontFace: 'Microsoft YaHei' });
      slide.addShape(pptx.shapes.RECTANGLE, { x: W / 2 - 0.4, y: 4.05, w: 0.8, h: 0.05, fill: { color: T.accent } });
    } else {
      slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.12, fill: { color: T.accent } });
      slide.addText(s.title, { x: 0.55, y: 0.4, w: W - 1.1, h: 0.6, fontSize: 24, bold: true, color: T.ink, fontFace: 'Microsoft YaHei' });
      slide.addShape(pptx.shapes.RECTANGLE, { x: 0.57, y: 1.04, w: 0.5, h: 0.045, fill: { color: T.accent } });
      const items = s.points.split('\n').map(t => t.trim()).filter(Boolean)
        .map(t => ({ text: t, options: { bullet: { code: '25AA' }, breakLine: true, color: T.ink } }));
      if (items.length) {
        slide.addText(items, { x: 0.55, y: 1.4, w: W - 1.1, h: H - 2.0, fontSize: 16, fontFace: 'Microsoft YaHei', lineSpacingMultiple: 1.4, valign: 'top' });
      }
      slide.addText(`${i + 1} / ${n}`, { x: W - 1.4, y: H - 0.45, w: 1.0, h: 0.3, align: 'right', fontSize: 10, color: T.muted, fontFace: 'Consolas' });
    }
    // 演讲备注写入 PPT 备注栏（演示者视图可见，放映不显示）
    if (s.notes && s.notes.trim()) slide.addNotes(s.notes.trim());
  });
}

function updateCharCount() {
  const v = inputText.value;
  charCount.textContent = v ? `${fmtNum(v.length)} 字 · ≈${fmtNum(estTokens(v))} tokens` : '0 字';
}

/* ---------- 壁纸主题 ---------- */

function applyTheme(t) {
  const custom = isCustomTheme(t);
  if (!custom && !THEMES.includes(t)) t = 'aurora';
  document.body.dataset.theme = t;
  localStorage.setItem('wg_theme', t);
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === t));
  // 插画壁纸与自定义壁纸共用「浓度」滑杆
  $('wpOpacityRow').classList.toggle('hidden', !(isPhotoTheme(t) || custom));
  if (!custom) {
    // 切回内置壁纸：清掉背景图并释放自定义壁纸的 blob URL，避免内存泄漏
    if (state.customURL) { URL.revokeObjectURL(state.customURL); state.customURL = null; }
    $('bgLayer').style.backgroundImage = '';
    return;
  }
  // 自定义壁纸：从 IndexedDB 取图，异步铺到背景层
  const id = t.slice(7);
  idbGet(id).then(rec => {
    if (!rec) { toast('这张自定义壁纸已被删除，先换回默认壁纸'); applyTheme('aurora'); return; }
    if (state.customURL) { URL.revokeObjectURL(state.customURL); }
    state.customURL = URL.createObjectURL(rec.blob);
    if (document.body.dataset.theme === t) $('bgLayer').style.backgroundImage = `url(${state.customURL})`;
  }).catch(() => toast('自定义壁纸加载失败，请重试'));
}

/* 壁纸浓度（仅插画壁纸生效），持久化到 localStorage */

/* 壁纸浓度（仅插画壁纸生效），持久化到 localStorage */
function applyWpOpacity(v) {
  const n = Math.min(100, Math.max(10, Number(v) || 45));
  document.documentElement.style.setProperty('--wp-opacity', n / 100);
  $('wpOpacityVal').textContent = n + '%';
  localStorage.setItem('wg_wp_opacity', String(n));
}

/* 毛玻璃工作台开关：开启时工作台半透明 + 背景模糊，壁纸透出但不影响阅读 */
function applyGlass(on) {
  document.body.classList.toggle('glass-off', !on);
  $('glassToggle').classList.toggle('active', on);
  localStorage.setItem('wg_glass', on ? '1' : '0');
}

/* ---------- 自定义壁纸上传（IndexedDB 本地存储，不上传服务器） ---------- */

const isCustomTheme = (t) => String(t || '').startsWith('custom-');

function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('wg_yunjian', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('wallpapers', { keyPath: 'id' });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbAll() {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const req = db.transaction('wallpapers').objectStore('wallpapers').getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}
async function idbGet(id) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const req = db.transaction('wallpapers').objectStore('wallpapers').get(id);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbPut(rec) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const req = db.transaction('wallpapers', 'readwrite').objectStore('wallpapers').put(rec);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
async function idbDel(id) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const req = db.transaction('wallpapers', 'readwrite').objectStore('wallpapers').delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

/* 上传图片本地压缩：长边压到 2560px 存 JPEG（控制体积），另生成缩略图用于色板预览 */
async function processWallpaperImage(file) {
  let img;
  try {
    img = await createImageBitmap(file);
  } catch (e) {
    img = await new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); res(im); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('图片无法解析')); };
      im.src = url;
    });
  }
  const scale = Math.min(1, 2560 / img.width);
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.86));
  const tw = 300, th = Math.max(1, Math.round(h * tw / w));
  const tc = document.createElement('canvas');
  tc.width = tw; tc.height = th;
  tc.getContext('2d').drawImage(canvas, 0, 0, tw, th);
  const thumb = tc.toDataURL('image/jpeg', 0.8);
  return { blob, thumb };
}

/* 把已上传的自定义壁纸渲染成壁纸栏色板（新传的排前面） */
async function renderCustomWallpapers() {
  try {
    const list = await idbAll();
    const grid = document.querySelector('.theme-grid');
    grid.querySelectorAll('.theme-swatch[data-theme^="custom-"]').forEach(el => el.remove());
    const uploadBtn = document.getElementById('wpUploadBtn');
    list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).forEach(rec => {
      const b = document.createElement('button');
      b.className = 'theme-swatch';
      b.dataset.theme = 'custom-' + rec.id;
      b.title = rec.name + '（悬停可删除）';
      b.innerHTML = `<i style="background-image:url(${rec.thumb})"></i><span>${esc(rec.name)}</span><span class="sw-del" title="删除这张壁纸">✕</span>`;
      grid.insertBefore(b, uploadBtn);
    });
    const cur = document.body.dataset.theme;
    grid.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === cur));
  } catch (e) { /* IndexedDB 不可用（如隐私模式）时静默降级 */ }
}

/* 处理上传：压缩 → 存库 → 刷新色板 → 自动应用最后一张 */
async function handleWallpaperUpload(files) {
  let lastTheme = null, count = 0;
  for (const f of files) {
    if (!f.type.startsWith('image/')) { toast(`「${f.name}」不是图片，已跳过`); continue; }
    if (f.size > 20 * 1024 * 1024) { toast(`「${f.name}」超过 20MB，已跳过`); continue; }
    try {
      const { blob, thumb } = await processWallpaperImage(f);
      const rec = {
        id: Date.now() + '' + Math.floor(Math.random() * 1000),
        name: (f.name.replace(/\.[a-z0-9]+$/i, '') || '我的壁纸').slice(0, 10),
        blob, thumb, addedAt: Date.now(),
      };
      await idbPut(rec);
      lastTheme = 'custom-' + rec.id;
      count++;
    } catch (e) { toast(`「${f.name}」处理失败：${e.message || e}`); }
  }
  await renderCustomWallpapers();
  if (lastTheme) {
    applyTheme(lastTheme);
    toast(count > 1 ? `已上传 ${count} 张壁纸，已应用最新一张` : '壁纸已上传并应用');
  }
}

/* ---------- 事件绑定 ---------- */

const extraReq = $('extraReq');

// Tab
$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (btn) switchTab(btn.dataset.tab);
});

// 所有动作按钮（润色/精简/扩写/改写/摘要/模板/转换）
document.querySelectorAll('[data-action]').forEach(btn =>
  btn.addEventListener('click', () => run(btn.dataset.action)));

// 风格选择（润色 · 七种风格）
$('styleSeg').addEventListener('click', (e) => {
  const seg = e.target.closest('.chip'); if (!seg) return;
  state.style = seg.dataset.style;
  $('styleSeg').querySelectorAll('.chip').forEach(s => s.classList.toggle('active', s === seg));
});

// 降重强度
$('dupStyleChips').addEventListener('click', (e) => {
  const seg = e.target.closest('.chip'); if (!seg) return;
  state.dupStyle = seg.dataset.dstyle;
  $('dupStyleChips').querySelectorAll('.chip').forEach(s => s.classList.toggle('active', s === seg));
});

// 字幕双语排版
$('subLayoutSeg').addEventListener('click', (e) => {
  const seg = e.target.closest('.seg'); if (!seg) return;
  state.subLayout = seg.dataset.layout;
  $('subLayoutSeg').querySelectorAll('.seg').forEach(s => s.classList.toggle('active', s === seg));
});

// 结果一键应用到输入框（带撤销）
$('applyBtn').addEventListener('click', applyToInput);

// 摘要方式
$('summarySeg').addEventListener('click', (e) => {
  const seg = e.target.closest('.seg'); if (!seg) return;
  state.summaryMode = seg.dataset.mode;
  $('summarySeg').querySelectorAll('.seg').forEach(s => s.classList.toggle('active', s === seg));
});
$('summaryType').addEventListener('change', (e) => state.summaryType = e.target.value);

// 模板选择
$('templateChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  selectTemplate(chip.dataset.tpl);
});

// PPT 模板风格
$('pptThemeChips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-ptheme]'); if (!chip) return;
  setPptTheme(chip.dataset.ptheme);
});

// 追问微调
document.querySelectorAll('.fu-chip').forEach(btn =>
  btn.addEventListener('click', () => followUp(btn.dataset.fu)));

// 输入
inputText.addEventListener('input', () => { updateCharCount(); tipsSoon(); });
$('clearInput').addEventListener('click', () => { inputText.value = ''; slimBackup = null; $('slimInfo').classList.add('hidden'); $('slimUndo').classList.add('hidden'); updateCharCount(); renderTips(); inputText.focus(); });
$('slimBtn').addEventListener('click', runSlim);
$('slimUndo').addEventListener('click', undoSlim);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !state.generating) {
    const primary = TAB_PRIMARY[state.tab];
    if (primary) { e.preventDefault(); run(primary); }
  }
  if (e.key === 'Escape') { closeDrawer(); closeSettings(); $('themePanel').classList.add('hidden'); $('aiPanel').classList.add('hidden'); }
});

// 结果工具
$('copyBtn').addEventListener('click', async () => {
  if (!state.lastOutput) { toast('还没有可复制的内容'); return; }
  try {
    await navigator.clipboard.writeText(state.lastOutput);
    toast('已复制到剪贴板');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = state.lastOutput; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove();
    toast('已复制到剪贴板');
  }
});

// 结果导出为 .md 文件（字幕类结果用专用 .srt 下载按钮）
$('exportBtn').addEventListener('click', () => {
  if (!state.lastOutput) { toast('还没有可导出的内容'); return; }
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const tag = (state.lastTask?.badge || resultBadge.textContent || '云笺结果').replace(/[\\/:*?"<>|·（）()\s]/g, '');
  const name = `云笺_${tag}_${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.md`;
  downloadText(state.lastOutput, name);
  toast('已导出 ' + name);
});

// 历史记录搜索
$('historySearch').addEventListener('input', renderHistory);

// 拖拽文本文件到输入区直接导入（TXT / SRT / MD / VTT / CSV 等）
(() => {
  const card = document.querySelector('.input-card');
  const TEXT_EXT = /\.(txt|srt|md|markdown|csv|vtt|lrc)$/i;
  card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('dragover'); });
  card.addEventListener('dragleave', () => card.classList.remove('dragover'));
  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    card.classList.remove('dragover');
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('text/') || TEXT_EXT.test(f.name));
    if (!files.length) { toast('请拖入文本文件（TXT / SRT / MD / VTT / CSV）'); return; }
    const parts = [];
    for (const f of files) {
      if (f.size > 2 * 1024 * 1024) { toast(`「${f.name}」超过 2MB，已跳过`); continue; }
      try {
        const txt = (await f.text()).replace(/^\uFEFF/, '').trim();
        if (txt) parts.push(txt);
      } catch (err) { toast(`「${f.name}」读取失败`); }
    }
    if (!parts.length) return;
    const joined = parts.join('\n\n');
    inputText.value = inputText.value.trim() ? inputText.value.trimEnd() + '\n\n' + joined : joined;
    inputText.dispatchEvent(new Event('input', { bubbles: true }));
    toast(`已导入 ${files.length} 个文件（共 ${joined.length} 字）`);
  });
})();
$('regenBtn').addEventListener('click', () => {
  if (!state.lastTask || state.generating) return;
  if (!state.lastTask.messages) { toast('历史回看的结果无法重新生成，请在对应模块重跑一次'); return; }
  const notReadyRe = checkAIReady();
  if (notReadyRe) { openSettings(); toast(notReadyRe); return; }
  generate(state.lastTask);
});
$('stopBtn').addEventListener('click', () => state.controller?.abort());

// 录音转写工作区
$('auRecordBtn').addEventListener('click', auToggleRecord);
$('auDetectBtn').addEventListener('click', () => auDetectEngine());
$('auGoBtn').addEventListener('click', auStartTranscribe);
$('auCancelBtn').addEventListener('click', () => au.controller?.abort());
$('auDropZone').addEventListener('click', () => $('auFileInput').click());
$('auFileInput').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) auOnAudio(f, f.name);
  e.target.value = ''; // 允许重复选择同一文件
});
(() => {
  const dz = $('auDropZone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) {
      if (au.recorder && au.recorder.state === 'recording') { toast('正在录音中，先点「完成录音」再导入文件'); return; }
      auOnAudio(f, f.name);
    }
  });
})();
$('auBaseInput').addEventListener('change', () => {
  settings.whisperBase = auBase();
  saveSettings();
  auDetectEngine();
});
$('auSendBtn').addEventListener('click', auToWorkspace);
$('auPptBtn').addEventListener('click', () => auToAction('ppt'));
$('auClipBtn').addEventListener('click', () => auToAction('clip'));
$('auSubBtn').addEventListener('click', () => auToAction('sub'));
$('auUndoRawBtn').addEventListener('click', () => {
  if (!au.rawText) return;
  $('auText').value = au.rawText;
  au.text = au.rawText;
  toast('已还原为原始转写文本');
});
$('auCopyBtn').addEventListener('click', async () => {
  const t = $('auText').value.trim();
  if (!t) { toast('还没有可复制的内容'); return; }
  try { await navigator.clipboard.writeText(t); toast('已复制到剪贴板'); }
  catch (e) { toast('复制失败，请手动选择文本复制'); }
});
$('auDownloadTxtBtn').addEventListener('click', () => {
  const t = $('auText').value.trim();
  if (!t) { toast('还没有可下载的内容'); return; }
  downloadText(t, `${(au.name || 'transcript').replace(/\.[^.]+$/, '')}_文稿.txt`);
});
$('auDownloadSrtBtn').addEventListener('click', () => {
  if (!au.segments || !au.segments.length) { toast('没有带时间轴的转写结果'); return; }
  downloadText(auBuildSrt(), `${(au.name || 'transcript').replace(/\.[^.]+$/, '')}.srt`);
});
$('auAiCleanBtn').addEventListener('click', async () => {
  const text = $('auText').value.trim();
  if (!text) { toast('还没有转写结果'); return; }
  const notReady = checkAIReady();
  if (notReady) { openSettings(); toast(notReady); return; }
  const btn = $('auAiCleanBtn');
  btn.disabled = true;
  btn.textContent = '🧹 整理中…';
  try {
    const out = (await fetchChatText(buildSystem('audioClean'), `【录音转写原始稿】\n${text}`, null, null) || '').trim();
    if (!out) throw new Error('AI 没有返回内容');
    au.text = out;
    $('auText').value = out;
    $('auUndoRawBtn').classList.remove('hidden');
    toast('AI 整理完成：已修标点、去口水词、按语义分段');
  } catch (err) {
    toast('AI 整理失败（原文保留）：' + (err.message || String(err)));
  } finally {
    btn.disabled = false;
    btn.textContent = '🧹 AI 整理初稿';
  }
});

// 批量处理
$('btOpSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-op]');
  if (!b) return;
  batch.op = b.dataset.op;
  document.querySelectorAll('#btOpSeg .seg').forEach(s => s.classList.toggle('active', s === b));
});
$('btDrop').addEventListener('click', () => $('btFileInput').click());
$('btFileInput').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  for (const f of files) await btReadFile(f);
  if (files.length) toast(`已添加 ${files.length} 个任务到队列`);
});
(() => {
  const dz = $('btDrop');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', async (e) => {
    e.preventDefault();
    dz.classList.remove('drag');
    const files = [...(e.dataTransfer.files || [])];
    for (const f of files) await btReadFile(f);
    if (files.length) toast(`已添加 ${files.length} 个任务到队列`);
  });
})();
$('btPasteBtn').addEventListener('click', () => {
  $('btPasteName').value = '';
  $('btPasteContent').value = '';
  $('btPasteMask').classList.remove('hidden');
  $('btPasteName').focus();
});
$('btPasteClose').addEventListener('click', () => $('btPasteMask').classList.add('hidden'));
$('btPasteMask').addEventListener('click', (e) => { if (e.target === $('btPasteMask')) $('btPasteMask').classList.add('hidden'); });
$('btPasteSave').addEventListener('click', () => {
  const text = $('btPasteContent').value.trim();
  if (!text) { toast('内容不能为空'); return; }
  btAddTask({ name: $('btPasteName').value.trim() || `文本任务 ${batch.tasks.length + 1}`, kind: 'doc', text });
  $('btPasteMask').classList.add('hidden');
  toast('已添加到队列');
});
$('btFromAuBtn').addEventListener('click', () => {
  const text = ($('auText')?.value || au.text || '').trim();
  if (!text) { toast('「录音转写」页还没有转写结果，先去转写一段录音'); return; }
  btAddTask({ name: `录音转写_${au.name || 'audio'}`.slice(0, 50), kind: 'doc', text });
  toast('已把录音转写结果加入队列');
});
$('btRunBtn').addEventListener('click', btRun);
$('btCancelBtn').addEventListener('click', () => { batch.cancel = true; batch.controller?.abort(); toast('将在当前任务完成后停止'); });
$('btClearBtn').addEventListener('click', btClearAll);
$('btExportBtn').addEventListener('click', btExportMerged);
$('btList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-btact]');
  if (!b) return;
  if (b.dataset.btact === 'view') btView(b.dataset.id);
  else if (b.dataset.btact === 'del') btRemoveTask(b.dataset.id);
});
$('btResultClose').addEventListener('click', () => $('btResultMask').classList.add('hidden'));
$('btResultMask').addEventListener('click', (e) => { if (e.target === $('btResultMask')) $('btResultMask').classList.add('hidden'); });
$('btResultDownload').addEventListener('click', () => {
  if (!batch.viewing) return;
  const isSrt = batch.viewing.autoSub || batch.viewing.result.includes('-->');
  downloadText($('btResultText').value, `${batch.viewing.name.replace(/\.[^.]+$/, '')}${isSrt ? '.srt' : '_结果.txt'}`);
});
$('btResultApply').addEventListener('click', () => {
  const v = $('btResultText').value.trim();
  if (!v) return;
  inputText.value = v;
  updateCharCount(); renderTips();
  $('btResultMask').classList.add('hidden');
  switchTab('polish');
  toast('已应用到输入框');
});

// 答辩模拟
$('dfStyleSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dfstyle]');
  if (!b) return;
  document.querySelectorAll('#dfStyleSeg .seg').forEach(s => s.classList.toggle('active', s === b));
});
$('dfStartBtn').addEventListener('click', dfStart);
$('dfSendBtn').addEventListener('click', dfSend);
$('dfEndBtn').addEventListener('click', dfEnd);
$('dfRestartBtn').addEventListener('click', dfRestart);
$('dfInput').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); dfSend(); }
});

// 免费体验 1 次
$('closeTrial').addEventListener('click', () => $('trialMask').classList.add('hidden'));
$('trialMask').addEventListener('click', (e) => { if (e.target === $('trialMask')) $('trialMask').classList.add('hidden'); });
$('trialBannerBtn').addEventListener('click', () => openTrialConfirm(null));
$('trialGo').addEventListener('click', () => {
  $('trialMask').classList.add('hidden');
  enterTrial();
  const act = trialPendingAction;
  trialPendingAction = null;
  if (act) run(act); else { inputText.focus(); toast('已进入体验模式：粘贴文本后点任意功能按钮'); }
});
$('trialGoSettings').addEventListener('click', () => { $('trialMask').classList.add('hidden'); openSettings(); });

// 使用指南 & 新手引导
$('guideBtn').addEventListener('click', openGuide);
$('closeGuide').addEventListener('click', () => $('guideMask').classList.add('hidden'));
$('closeGuide2').addEventListener('click', () => $('guideMask').classList.add('hidden'));
$('guideMask').addEventListener('click', (e) => { if (e.target === $('guideMask')) $('guideMask').classList.add('hidden'); });
$('guideTour').addEventListener('click', startTour);
$('aiHeadTour').addEventListener('click', startTour);
$('aiHeadGuide').addEventListener('click', openGuide);
window.addEventListener('resize', () => { if (tourIdx >= 0) renderTourStep(); });
// 首次访问：自动弹出使用指南（只一次）
if (!localStorage.getItem(GUIDE_SEEN_KEY)) {
  setTimeout(openGuide, 1200);
}

// 提示词库 & 模板包
$('pkNewBtn').addEventListener('click', () => openPromptEdit(null));
$('pkGenBtn').addEventListener('click', () => {
  $('pkGenCat').innerHTML = Object.entries(PROMPT_CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('pkGenScene').value = '';
  $('pkGenExtra').value = '';
  $('pkGenForm').classList.remove('hidden');
  $('pkGenPreview').classList.add('hidden');
  $('pkGenMask').classList.remove('hidden');
  $('pkGenScene').focus();
});
$('pkImportBtn').addEventListener('click', () => $('pkImportInput').click());
$('pkImportInput').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const r = importPromptsText(await f.text());
    if (r.error) { toast('导入失败：' + r.error); return; }
    renderPromptCats(); renderPrompts();
    toast(`导入完成：新增 ${r.added} 条${r.skipped ? `，跳过 ${r.skipped} 条（重复/缺字段）` : ''}`);
  } catch (err) { toast('导入失败：' + (err.message || String(err))); }
});
$('pkExportAllBtn').addEventListener('click', () => pkExport(loadPrompts(), '云笺提示词包（全量）', '云笺提示词包_全量'));
$('pkResetBtn').addEventListener('click', pkResetBuiltin);
$('pkSearch').addEventListener('input', () => { pk.kw = $('pkSearch').value; renderPrompts(); });
$('pkCats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pkcat]');
  if (!b) return;
  pk.cat = b.dataset.pkcat;
  renderPromptCats(); renderPrompts();
});
$('pkList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  const p = loadPrompts().find(x => x.id === id);
  if (!p) return;
  if (act === 'use') openUsePrompt(id);
  else if (act === 'edit') openPromptEdit(id);
  else if (act === 'export') pkExport([p], p.title, `提示词_${p.title.replace(/[\\/:*?"<>|]/g, '')}`);
  else if (act === 'del') {
    if (confirm(`确定删除「${p.title}」吗？${p.builtin ? '\n（内置模板删后可用「恢复内置」补回）' : ''}`)) {
      deletePrompt(id);
      renderPromptCats(); renderPrompts();
      toast('已删除');
    }
  }
});
// 编辑弹窗
$('pkEditClose').addEventListener('click', () => $('pkEditMask').classList.add('hidden'));
$('pkEditMask').addEventListener('click', (e) => { if (e.target === $('pkEditMask')) $('pkEditMask').classList.add('hidden'); });
$('pkEditSave').addEventListener('click', pkSaveEdit);
// 使用弹窗
$('pkUseClose').addEventListener('click', () => $('pkUseMask').classList.add('hidden'));
$('pkUseMask').addEventListener('click', (e) => { if (e.target === $('pkUseMask')) $('pkUseMask').classList.add('hidden'); });
$('pkUseRun').addEventListener('click', pkUseRun);
$('pkUseCopy').addEventListener('click', async () => {
  const t = $('pkUseBody').value.trim();
  if (!t) { toast('提示词为空'); return; }
  try { await navigator.clipboard.writeText(t); toast('提示词已复制，可粘贴到任何 AI 工具使用'); }
  catch (err) { toast('复制失败，请手动选择复制'); }
});
// 生成器弹窗
$('pkGenClose').addEventListener('click', () => $('pkGenMask').classList.add('hidden'));
$('pkGenMask').addEventListener('click', (e) => { if (e.target === $('pkGenMask')) $('pkGenMask').classList.add('hidden'); });
$('pkGenRun').addEventListener('click', pkGenRun);
$('pkGenAgain').addEventListener('click', () => { $('pkGenPreview').classList.add('hidden'); $('pkGenForm').classList.remove('hidden'); pkGenRun(); });
$('pkGenSave').addEventListener('click', () => {
  if (!pk.lastGen) return;
  upsertPrompt({
    title: $('pkGenTitle').value.trim() || pk.lastGen.title,
    desc: $('pkGenDesc').value.trim(),
    content: $('pkGenBody').value.trim(),
    category: pk.lastGen.category,
    tags: ['AI 生成'],
  });
  $('pkGenMask').classList.add('hidden');
  renderPromptCats(); renderPrompts();
  toast('已保存到模板库');
});

// 历史抽屉
$('historyBtn').addEventListener('click', openDrawer);
$('closeDrawer').addEventListener('click', closeDrawer);
$('drawerMask').addEventListener('click', closeDrawer);
$('clearHistory').addEventListener('click', () => {
  if (!loadHistory().length) { toast('历史记录已经是空的啦'); return; }
  if (confirm('确定要清空全部历史记录吗？此操作不可恢复。')) {
    localStorage.removeItem('wg_history');
    state.activeHistoryId = null;
    renderHistory();
    toast('历史记录已清空');
  }
});
$('historyList').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); deleteHistory(del.dataset.del); return; }
  const item = e.target.closest('.history-item');
  if (item) viewHistory(item.dataset.id);
});

// 壁纸
$('themeBtn').addEventListener('click', (e) => { e.stopPropagation(); $('themePanel').classList.toggle('hidden'); });
$('themePanel').addEventListener('click', async (e) => {
  // 自定义壁纸的删除按钮（优先于选择壁纸）
  const del = e.target.closest('.sw-del');
  if (del) {
    e.stopPropagation();
    const sw = del.closest('.theme-swatch');
    const theme = sw.dataset.theme;
    if (!confirm('确定删除这张自定义壁纸吗？')) return;
    await idbDel(theme.slice(7));
    if (document.body.dataset.theme === theme) {
      if (state.customURL) { URL.revokeObjectURL(state.customURL); state.customURL = null; }
      applyTheme('aurora');
    }
    await renderCustomWallpapers();
    toast('壁纸已删除');
    return;
  }
  const sw = e.target.closest('.theme-swatch');
  if (sw && sw.id !== 'wpUploadBtn') { applyTheme(sw.dataset.theme); toast('壁纸已更换：' + sw.querySelector('span').textContent); }
});
// 上传自定义壁纸
$('wpUploadBtn').addEventListener('click', () => $('wpUploadInput').click());
$('wpUploadInput').addEventListener('change', () => {
  const files = [...$('wpUploadInput').files];
  $('wpUploadInput').value = '';
  if (files.length) handleWallpaperUpload(files);
});
$('wpOpacity').addEventListener('input', (e) => applyWpOpacity(e.target.value));
$('glassToggle').addEventListener('click', () => {
  const on = document.body.classList.contains('glass-off'); // 当前是关 → 点击变开
  applyGlass(on);
  toast(on ? '毛玻璃已开启，壁纸透出工作台' : '毛玻璃已关闭，工作台恢复不透明');
});
document.addEventListener('click', (e) => {
  if (!$('themePanel').contains(e.target) && e.target !== $('themeBtn') && !$('themeBtn').contains(e.target)) {
    $('themePanel').classList.add('hidden');
  }
});

// AI 小助手
$('aiFab').addEventListener('click', () => {
  const p = $('aiPanel');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) {
    $('aiFabDot').classList.add('hidden');
    renderTips();
    $('aiInput').focus();
    // 首次打开面板：小云主动教学（欢迎 + 两条快捷入口）
    if (!window.__xwGreeted) {
      window.__xwGreeted = true;
      const bubble = addAiMsg('ai', '');
      const html = renderMarkdown('嗨～第一次见面，教你 **3 步上手**：\n\n1. 顶栏选 AI 模式（新朋友点「🎁 免费体验 3 次」）\n2. 把文字粘贴进输入框\n3. 点功能按钮，右侧出结果！\n\n也可以让我带你去逛一圈～');
      bubble.innerHTML = html + '<div class="ai-msg-acts"><button class="ai-act-btn" data-xact="tour">🎓 带我用一遍</button><button class="ai-act-btn" data-xact="guide">📖 看使用指南</button></div>';
      $('aiChat').scrollTop = $('aiChat').scrollHeight;
      xwBubble('🎓');
    }
  }
});
$('aiChat').addEventListener('click', (e) => {
  const b = e.target.closest('[data-xact]');
  if (!b) return;
  if (b.dataset.xact === 'tour') startTour();
  else if (b.dataset.xact === 'guide') openGuide();
});
$('aiClose').addEventListener('click', () => $('aiPanel').classList.add('hidden'));
$('aiSend').addEventListener('click', aiAsk);
$('aiInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aiAsk(); } });
$('aiTips').addEventListener('click', (e) => {
  const b = e.target.closest('.tip-act');
  if (!b) return;
  const act = $('aiTips')._acts?.[+b.dataset.tip];
  if (act) { act(); }
});

// 设置
$('settingsBtn').addEventListener('click', openSettings);
$('bannerGo').addEventListener('click', openSettings);
$('closeSettings').addEventListener('click', closeSettings);
$('settingsMask').addEventListener('click', (e) => { if (e.target === $('settingsMask')) closeSettings(); });
$('toggleKey').addEventListener('click', () => {
  const k = $('apiKeyInput');
  k.type = k.type === 'password' ? 'text' : 'password';
});
/* 设置弹窗内切换 AI 模式：切换字段分组，切到本地时顺手预检测模型列表 */
$('providerSelect').addEventListener('change', () => {
  syncSettingsModeFields();
  if ($('providerSelect').value === 'ollama') runOllamaDetect();
});

/* 本地模型检测：拉取 /api/tags 填充候选列表，没选过模型时自动填第一个 */
async function runOllamaDetect(silent = false) {
  const statusEl = $('ollamaDetStatus');
  const baseInput = $('ollamaBaseInput').value.trim() || undefined;
  if (!silent) { statusEl.className = 'field-hint'; statusEl.textContent = '检测中…'; }
  try {
    const models = await detectOllamaModels(baseInput);
    $('ollamaModelList').innerHTML = models.map(m => `<option value="${esc(m)}"></option>`).join('');
    if (!models.length) {
      statusEl.className = 'field-hint det-warn';
      statusEl.innerHTML = '⚠ 已连上 Ollama 服务，但<b>还没有拉取任何模型</b>——这是本地模式生成没有结果的最常见原因。请在命令行执行 <code>ollama pull qwen3:8b</code>（约 5GB，几分钟），完成后重新点「🔍 检测」。 <button class="ghost-btn small" data-copycmd="ollama pull qwen3:8b">📋 复制命令</button>';
      return models;
    }
    const inp = $('ollamaModelInput');
    if (!inp.value.trim()) inp.value = models[0];
    statusEl.className = 'field-hint det-ok';
    statusEl.textContent = `✅ 检测到 ${models.length} 个本地模型：${models.join('、')}（当前选择：${inp.value.trim() || '未选择'}）`;
    return models;
  } catch (e) {
    statusEl.className = 'field-hint det-err';
    statusEl.textContent = silent
      ? '❌ 暂未检测到 Ollama 服务——请确认已安装并正在运行 Ollama，然后点「🔍 检测」重试。'
      : '❌ 未检测到 Ollama 服务。请确认：① 已从 ollama.com 下载安装并正在运行 Ollama；② 上方服务地址正确（默认 http://localhost:11434）。若浏览器控制台报跨域错误，给 Ollama 设置环境变量 OLLAMA_ORIGINS=* 后重启即可。';
    return null;
  }
}
$('detectOllama').addEventListener('click', () => runOllamaDetect());
/* 检测状态区里的「📋 复制命令」按钮（如拉取模型命令） */
$('ollamaFields').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copycmd]');
  if (!b) return;
  try {
    await navigator.clipboard.writeText(b.dataset.copycmd);
    toast('命令已复制：粘贴到命令提示符（Win+R 输入 cmd）执行即可');
  } catch (err) { toast('复制失败，请手动输入：' + b.dataset.copycmd); }
});

// 余额与 Token 用量
$('balanceChip').addEventListener('click', () => fetchBalance({ force: true }));
$('queryBalance').addEventListener('click', async () => {
  if (settings.demo) { $('balanceDetail').textContent = '演示模式不调用真实 API，没有真实余额'; return; }
  const key = $('apiKeyInput').value.trim();
  if (!key) { $('balanceDetail').textContent = '请先填写 API Key'; return; }
  const base = ($('apiBaseInput').value.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
  $('queryBalance').disabled = true;
  $('balanceDetail').textContent = '查询中…';
  try {
    const info = await requestBalance(base, key);
    balanceInfo = { ...info, ts: Date.now() };
    localStorage.setItem('wg_balance', JSON.stringify(balanceInfo));
    renderBalance();
    if (key !== settings.apiKey) toast('查询成功，点「保存」后顶栏也会显示这个账户的余额');
  } catch (e) {
    $('balanceDetail').textContent = `查询失败：${e.message}（第三方中转地址通常不支持余额查询）`;
  } finally {
    $('queryBalance').disabled = false;
  }
});
$('resetUsage').addEventListener('click', () => {
  if (!loadUsageStats().requests) { toast('还没有用量记录'); return; }
  if (confirm('确定清零累计的 Token 用量统计吗？（只清零统计数字，不影响历史记录）')) {
    localStorage.removeItem('wg_usage');
    renderUsageStats();
    toast('用量统计已清零');
  }
});
$('saveSettings').addEventListener('click', () => {
  settings.provider = $('providerSelect').value;
  settings.apiKey = $('apiKeyInput').value.trim();
  settings.model = $('modelSelect').value;
  settings.apiBase = ($('apiBaseInput').value.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
  settings.ollamaBase = ($('ollamaBaseInput').value.trim() || DEFAULT_OLLAMA_BASE).replace(/\/+$/, '');
  settings.ollamaModel = $('ollamaModelInput').value.trim();
  settings.demo = $('demoMode').checked;
  // 瘦身勾选框按当前模式存到对应的记忆位（在线默认开、本地默认关）
  if (settings.provider === 'ollama') settings.autoSlimLocal = $('autoSlim').checked;
  else settings.autoSlimOnline = $('autoSlim').checked;
  saveSettings();
  syncModeUI();
  closeSettings();
  renderTips();
  toast('设置已保存');
  if (!settings.demo && !isLocalMode() && settings.apiKey) fetchBalance({ silent: true, force: true });
});

// 顶栏 AI 模式快切（在线 DeepSeek ↔ 本地 Ollama）
$('modeQuick').addEventListener('change', async () => {
  const p = $('modeQuick').value;
  if (p === settings.provider) { syncModeUI(); return; }
  if (p === 'ollama' && !settings.ollamaModel) {
    // 还没选过本地模型：先静默检测，能拿到就自动选第一个，拿不到引导去设置
    try {
      const models = await detectOllamaModels();
      if (models && models.length) {
        settings.ollamaModel = models[0];
        toast(`已连接本地 Ollama，自动选择模型 ${models[0]}`);
      }
    } catch (e) { /* 忽略，下方引导 */ }
    if (!settings.ollamaModel) {
      settings.provider = 'ollama';
      saveSettings();
      syncModeUI();
      openSettings();
      toast('暂未检测到本地模型：请先启动 Ollama 并点「🔍 检测」选择');
      return;
    }
  }
  settings.provider = p;
  saveSettings();
  syncModeUI();
  toast(p === 'ollama' ? '已切换：本地离线模式（免费 · 不消耗 Token · 断网可用）' : '已切换：在线 API 模式（DeepSeek · 能力更强，消耗 token）');
});

// 长文本 · 切换本地模型提示弹窗
$('closeLocalHint').addEventListener('click', closeLocalHint);
$('localHintMask').addEventListener('click', (e) => { if (e.target === $('localHintMask')) closeLocalHint(); });
$('lhUseLocal').addEventListener('click', () => {
  if ($('lhNoHint').checked) { settings.longTextHintOff = true; saveSettings(); }
  const ctx = localHintCtx;
  closeLocalHint();
  switchToLocalThen(() => ctx && ctx.useLocal && ctx.useLocal());
});
$('lhKeepOnline').addEventListener('click', () => {
  if ($('lhNoHint').checked) { settings.longTextHintOff = true; saveSettings(); }
  const ctx = localHintCtx;
  closeLocalHint();
  state.onlineNoHint = inputText.value.trim().length; // 同长度文本本次会话不再提示
  ctx && ctx.keepOnline && ctx.keepOnline();
});

/* ---------- 初始化 ---------- */

let tipsTimer = null;
function tipsSoon() { clearTimeout(tipsTimer); tipsTimer = setTimeout(renderTips, 500); }

/* 先渲染自定义壁纸色板，再应用上次选择的主题（自定义壁纸异步从 IndexedDB 加载） */
renderCustomWallpapers();
applyTheme(localStorage.getItem('wg_theme') || 'aurora');
/* 恢复毛玻璃设置（默认开启） */
applyGlass(localStorage.getItem('wg_glass') !== '0');
/* 恢复壁纸浓度设置（滑杆位置 + CSS 变量） */
(() => {
  const saved = Number(localStorage.getItem('wg_wp_opacity') || 45);
  $('wpOpacity').value = saved;
  applyWpOpacity(saved);
})();
/* 空闲时预载插画壁纸，切换不闪白 */
setTimeout(() => { const im = new Image(); im.src = 'assets/wallpapers/wp1.jpg'; }, 1500);
/* 小云今日形象：悬浮球、面板头、应用 Logo、浏览器标签图标保持同一随机表情 */
(() => {
  const a = xwAvatar();
  const fab = $('aiFabImg'); if (fab) fab.src = a;
  const head = $('aiHeadAvatar'); if (head) head.src = a;
  const logoImg = document.querySelector('.logo img'); if (logoImg) logoImg.src = a;
  const fav = document.querySelector('link[rel="icon"]'); if (fav) fav.href = a;
})();
switchTab('polish');
updateCharCount();
updateStatus();
/* 小云出场：从屏幕右侧走出来 */
(() => {
  const fab = $('aiFab');
  fab.classList.add('enter');
  setTimeout(() => fab.classList.remove('enter'), 1100);
})();
renderUsageStats();
renderHistory();
renderTips();
if (!settings.demo && settings.apiKey) fetchBalance({ silent: true });
