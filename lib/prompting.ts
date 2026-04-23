import { AILog, KnowledgeNode, Memory, Settings, Subject, UserFeedbackEvent } from './types';

const CHAT_MEMORY_LIMIT = 6;
const CHAT_MEMORY_CHAR_BUDGET = 3200;

export const CHAT_PROMPT_VERSION = 'chat-v2.2';
export const INGESTION_PROMPT_VERSION = 'ingestion-v3.0';

type ChatIntent = 'problem-solving' | 'concept-explanation' | 'review' | 'general';

interface BuildChatPromptOptions {
  query: string;
  subject: Subject;
  relevantMemories: Memory[];
  allNodes: KnowledgeNode[];
  settings: Settings;
  hasImage: boolean;
}

interface BuildIngestionPromptOptions {
  input: string;
  subject: Subject;
  settings: Settings;
  imageCount: number;
  previousParsedItems?: unknown[];
  previousAnalysis?: string;
  explicitFunction?: string;
  explicitPurpose?: string;
  existingFunctionTypes?: string[];
  existingPurposeTypes?: string[];
}

interface MemoryContextResult {
  text: string;
  usedCount: number;
  truncatedCount: number;
}

interface LogDiagnostic {
  score: number;
  issues: string[];
  hints: string[];
  summary: string;
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function truncateText(value: unknown, maxLength: number) {
  const text = normalizeText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function hasAnyPattern(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function parseJsonResponse(response: string): any {
  const clean = normalizeText(response)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');

  if (!clean) return null;
  return JSON.parse(clean);
}

function getItemsFromResponse(response: string): any[] {
  try {
    const parsed = parseJsonResponse(response);
    if (!parsed) return [];
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.items)) return parsed.items;
    if (Array.isArray(parsed.parsedItems)) return parsed.parsedItems;
    return [];
  } catch {
    return [];
  }
}

function inferChatIntent(query: string): ChatIntent {
  if (/(求解|计算|证明|推导|步骤|怎么做|如何做|答案|题目|选择题|填空)/.test(query)) {
    return 'problem-solving';
  }
  if (/(解释|为什么|原理|概念|是什么意思|区别|联系)/.test(query)) {
    return 'concept-explanation';
  }
  if (/(总结|归纳|梳理|复盘|记忆|背诵|复习|提炼|串联)/.test(query)) {
    return 'review';
  }
  return 'general';
}

function getIntentGuidance(intent: ChatIntent) {
  switch (intent) {
    case 'problem-solving':
      return '先给结论或答案，再用最短路径说明关键依据、步骤和易错点。';
    case 'concept-explanation':
      return '先下定义，再讲原理，最后补一个贴近学生水平的小例子。';
    case 'review':
      return '先搭框架，再做归类对比，优先输出便于记忆和复习的结构化内容。';
    default:
      return '先直答，再补必要依据；如果信息不足，要明确指出不确定点。';
  }
}

function getIntentLabel(intent: ChatIntent) {
  switch (intent) {
    case 'problem-solving':
      return '解题/求解';
    case 'concept-explanation':
      return '概念解释';
    case 'review':
      return '总结复习';
    default:
      return '一般问答';
  }
}

function toDisplayNumber(value: unknown) {
  const num = readNumber(value);
  if (num === undefined) return '';
  return num <= 1 ? `${Math.round(num * 100)}%` : `${Math.round(num)}%`;
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[]';
  }
}

export function buildFeedbackDirective(settings: Settings) {
  return [
    'AI attention notes:',
    normalizeText(settings.aiAttentionNotes) || 'None.',
    '',
    'Feedback-derived preferences:',
    normalizeText(settings.feedbackLearningNotes) || 'None.',
  ].join('\n');
}

function buildMemoryContext(relevantMemories: Memory[], allNodes: KnowledgeNode[]): MemoryContextResult {
  if (relevantMemories.length === 0) {
    return { text: '暂无相关记忆。', usedCount: 0, truncatedCount: 0 };
  }

  const selected = relevantMemories.slice(0, CHAT_MEMORY_LIMIT * 2);
  const chunks: string[] = [];
  let usedCount = 0;

  for (const memory of selected) {
    const nodeNames = memory.knowledgeNodeIds
      .map((id) => allNodes.find((node) => node.id === id)?.name)
      .filter(Boolean)
      .slice(0, 4)
      .join('、');

    const lines = [
      `- 类型：${memory.isMistake ? '错题' : memory.type || '知识点'}`,
      `  内容：${truncateText(memory.content, 220) || '无'}`,
    ];

    if ((memory as any).questionNo) lines.push(`  题号：${normalizeText((memory as any).questionNo)}`);
    if (nodeNames) lines.push(`  关联节点：${nodeNames}`);
    if ((memory as any).studentAnswer) lines.push(`  学生答案：${truncateText((memory as any).studentAnswer, 80)}`);
    if (memory.correctAnswer) lines.push(`  正确答案：${truncateText(memory.correctAnswer, 80)}`);
    if ((memory as any).errorReasonCategory) {
      lines.push(`  错因分类：${truncateText((memory as any).errorReasonCategory, 60)}`);
    }
    if (memory.errorReason) lines.push(`  错因：${truncateText(memory.errorReason, 120)}`);
    if ((memory as any).learningTask) lines.push(`  防错策略：${truncateText((memory as any).learningTask, 120)}`);
    if ((memory as any).evidence?.sourceText) {
      lines.push(`  证据：${truncateText((memory as any).evidence.sourceText, 120)}`);
    }
    if (memory.notes) lines.push(`  备注：${truncateText(memory.notes, 120)}`);

    const chunk = lines.join('\n');
    const nextText = [...chunks, chunk].join('\n\n');
    if (nextText.length > CHAT_MEMORY_CHAR_BUDGET && chunks.length > 0) {
      break;
    }

    chunks.push(chunk);
    usedCount += 1;

    if (usedCount >= CHAT_MEMORY_LIMIT) {
      break;
    }
  }

  return {
    text: chunks.join('\n\n'),
    usedCount,
    truncatedCount: Math.max(0, relevantMemories.length - usedCount),
  };
}

export function buildChatPrompt(options: BuildChatPromptOptions) {
  const intent = inferChatIntent(options.query);
  const memoryContext = buildMemoryContext(options.relevantMemories, options.allNodes);
  const feedbackDirective = buildFeedbackDirective(options.settings);
  const normalizedQuery = normalizeText(options.query);

  const prompt = [
    feedbackDirective,
    '你是一位高质量的高中学科辅导 AI。',
    '目标不是写“像样的回答”，而是让学生真正理解、会做、能复习。',
    '',
    '【硬规则】',
    '1. 优先解决学生当前问题，不要空话开场。',
    '2. 如果题干不完整、图片不清晰、条件不足，必须明确说出不确定点，禁止脑补。',
    '3. 默认先给结论，再给关键依据、步骤和易错点。',
    '4. 如果命中学生旧错题/旧记忆，要显式关联，帮助学生形成迁移。',
    '5. 不要输出思维链，只输出整理后的结论和必要步骤。',
    '',
    '【本轮任务画像】',
    `- 当前科目：${options.subject}`,
    `- 任务类型：${getIntentLabel(intent)}`,
    `- 学生画像：${normalizeText(options.settings.studentProfile) || '普通高中生'}`,
    `- 检索记忆：共 ${options.relevantMemories.length} 条，本轮注入 ${memoryContext.usedCount} 条${memoryContext.truncatedCount > 0 ? `，另有 ${memoryContext.truncatedCount} 条未展开` : ''}`,
    `- 是否带图：${options.hasImage ? '是' : '否'}`,
    '',
    options.hasImage
      ? [
          '【图片处理要求】',
          '先说明你从图片里读到了哪些题干、图形、批注或关键信息。',
          '如果有模糊、遮挡、裁切不全，先点明，再基于可见信息给最可靠的分析。',
          '',
        ].join('\n')
      : '',
    `【本轮回答策略】\n${getIntentGuidance(intent)}`,
    '',
    `【学生问题】\n${normalizedQuery}`,
    '',
    `【可用记忆与错题上下文】\n${memoryContext.text}`,
    '',
    '【输出格式】',
    '- 第 1 段：1-2 句给核心结论或答案。',
    '- 第 2 段：用 2-4 个要点说明关键依据/步骤。',
    '- 如果有高频易错点、纠偏建议或复习建议，单独列出。',
    '- 如果引用教材原页并希望展示原图，请包含 [TEXTBOOK_PAGE: <textbookId>:<pageNumber>]。',
    '',
    '【严禁】',
    '- 不要写“这是一个很好的问题”“作为 AI”“希望对你有帮助”等套话。',
    '- 不要为了显得专业而堆术语、堆废话、堆长总结。',
    '- 不要伪造教材原文、图片细节或学生过往记录。',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    prompt,
    promptVersion: CHAT_PROMPT_VERSION,
    diagnostics: {
      promptVersion: CHAT_PROMPT_VERSION,
      intent,
      query: normalizedQuery,
      queryChars: normalizedQuery.length,
      relevantMemoryCount: options.relevantMemories.length,
      injectedMemoryCount: memoryContext.usedCount,
      truncatedMemoryCount: memoryContext.truncatedCount,
      hasImage: options.hasImage,
      promptChars: prompt.length,
    },
  };
}

export function buildIngestionPrompt(options: BuildIngestionPromptOptions) {
  const feedbackDirective = buildFeedbackDirective(options.settings);
  const explicitFunction = normalizeText(options.explicitFunction);
  const explicitPurpose = normalizeText(options.explicitPurpose);
  const functionChoices = (options.existingFunctionTypes || []).filter(Boolean);
  const purposeChoices = (options.existingPurposeTypes || []).filter(Boolean);
  const previousParsedItems = Array.isArray(options.previousParsedItems) ? options.previousParsedItems : [];
  const normalizedInput = normalizeText(options.input) || '请分析图片中的作业、错题和批注';

  const prompt = [
    feedbackDirective,
    '你是一个“错题学习闭环”解析引擎，不是普通内容提取器。',
    '你的输出必须帮助学生回答四个问题：我错在哪、为什么错、以后怎么避免、什么时候复习。',
    '',
    `当前用户选择科目：${options.subject}`,
    `当前图片数量：${options.imageCount}`,
    '',
    '【科目隔离】',
    `- 严格只在 ${options.subject} 范围内建立知识点关联。`,
    '- 如果内容明显属于其他科目，可以在 identifiedSubject 标出，但不要错误挂到当前科目的知识节点上。',
    '',
    '【用户偏好】',
    `- 作业/错题偏好：${normalizeText(options.settings.homeworkPreferences) || '无'}`,
    `- 符号标记含义：${normalizeText(options.settings.userSymbols) || '未配置，请结合图片自行判断常见批改符号'}`,
    '',
    '【P0 硬规则，必须严格执行】',
    '1. 不得把多道题合并为一个 qa。每道题必须单独输出一条记录。',
    '2. 禁止把“32-35”这种题组范围当作一个正式错题；必须拆开，拆不开就 needsConfirmation=true。',
    '3. 没有原文证据时，不得给出确定答案；必须降低 confidence，并设置 needsConfirmation=true。',
    '4. 学生答案识别不清时，studentAnswer=null，wrongAnswer=null，needsConfirmation=true。',
    '5. 每个错题必须包含：学生答案、正确答案、证据、错因、选项排除依据、复习任务。',
    '6. 若与上一轮同题结果冲突，必须输出 conflict=true，不能直接覆盖旧结果。',
    '7. 出现 missing_evidence / missing_wrong_answer / missing_error_reason 这类情况时，仍可输出，但必须标记 needsConfirmation=true。',
    '',
    '【P1 学习效果规则】',
    '1. 错因分类尽量标准化：定位错误、同义替换失败、主旨范围过窄、逻辑衔接断裂、词义误判、审题偏差、信息整合错误、语法理解偏差。',
    '2. learningTask 不能空泛，必须写成“下次遇到同类题先做什么”。',
    '3. transferExercises 为每题给 1-2 个小练习，帮助迁移。',
    '4. vocabulary 类型不要只提单词本身，要尽量补齐：词义、语境、近义词、原句、易混点。',
    '5. reviewPriority 必须区分：high / medium / low / summary_only。',
    '',
    '【证据链要求】',
    '- evidence.sourceText：与答案直接相关的原文/题面短句。',
    '- evidence.locationHint：定位提示，例如“阅读理解第34题所在段落”。',
    '- evidence.keySentence：最关键的判断句；如果与 sourceText 相同，也要尽量给出。',
    '- optionAnalysis：至少解释正确选项，以及学生错选项为何不对；如果看不清全部选项，可只写能确认的部分，但 needsConfirmation=true。',
    '',
    '【知识图谱要求】',
    '- 先尽量使用 search_knowledge_graph / get_node_details 找现有节点，再给 suggestedNodeIds。',
    '- 只有现有节点不够细时，才提出 newNodes。',
    '',
    '【显式函数/用途约束】',
    `- functionType：${explicitFunction || '若未指定，请从现有函数类型里选最贴切的一项'}${functionChoices.length > 0 ? `；可选值：${functionChoices.join('、')}` : ''}`,
    `- purposeType：${explicitPurpose || '若未指定，请从现有用途类型里选最贴切的一项'}${purposeChoices.length > 0 ? `；可选值：${purposeChoices.join('、')}` : ''}`,
    '',
    previousParsedItems.length > 0
      ? [
          '【上一轮结果，必须做冲突检查】',
          `- previousAnalysis: ${normalizeText(options.previousAnalysis) || '无'}`,
          `- previousParsedItems:\n${formatJson(previousParsedItems)}`,
          '- 如果你发现同一 questionNo / 同一题面在学生答案、正确答案、错因或证据上与上一轮不一致，必须设置 conflict=true，并在 notes 中简短说明冲突点。',
          '',
        ].join('\n')
      : '',
    `【本轮输入】\n${normalizedInput}`,
    '',
    '【输出要求】',
    '- 只返回 JSON。',
    '- 顶层结构必须是：{ analysisProcess, identifiedSubject, deletedNodeIds, items }。',
    '- items 中每个对象允许的核心字段如下：',
    formatJson({
      questionNo: '34',
      content: '题干或错题卡标题',
      type: 'qa',
      questionType: 'reading_detail',
      studentAnswer: 'A',
      wrongAnswer: 'A',
      correctAnswer: 'D',
      isMistake: true,
      confidence: 0.86,
      needsConfirmation: false,
      conflict: false,
      errorReasonCategory: '同义替换失败',
      errorReason: '把背景现象误当成结果，未定位到 misunderstanding。',
      evidence: {
        sourceText: 'short-lived nature of content can create a space for misunderstanding',
        locationHint: '阅读理解第34题所在段落',
        keySentence: 'create a space for misunderstanding',
      },
      optionAnalysis: {
        A: '背景现象，不是题干问的结果',
        D: '对应原文 misunderstanding',
      },
      learningTask: '遇到 problem/result 题，先定位因果句，再匹配同义替换。',
      transferExercises: ['同义替换判断练习 1 题', 'problem/result 细节题 1 题'],
      memoryCard: {
        front: '阅读细节题问 problem/result 时如何定位？',
        back: '抓题干关键词，回原文找因果/结果句，优先匹配同义替换，不选背景描述。',
      },
      reviewPriority: 'high',
      suggestedNodeIds: ['1.2.3'],
      newNodes: [],
      deletedNodeIds: [],
      functionType: explicitFunction || '细碎记忆',
      purposeType: explicitPurpose || '记忆型',
      notes: '若学生答案识别不清，必须把 studentAnswer 和 wrongAnswer 设为 null。',
      source: '作业截图',
      region: '英语阅读',
      vocabularyData: {
        meaning: '有说服力的',
        context: '用于描述 arguments / evidence / reason',
        usage: 'compelling evidence / compelling reason',
        mnemonics: 'com- 强化 + pel- 推动 -> 强有力地推动人相信',
        synonyms: ['convincing', 'persuasive'],
        originalSentence: 'She gave a compelling argument.',
        confusions: ['competitive', 'comprehensive'],
      },
      visualDescription: '红叉标在 A 选项旁',
    }),
    '',
    '【再次强调】',
    '- 不能把多题合并成一个 qa。',
    '- 没有证据就不能给确定答案。',
    '- 看不清学生答案就 needsConfirmation=true。',
    '- 与上一轮冲突就 conflict=true。',
    '- 错题闭环字段缺失时，也要如实输出，但要把不确定性写清楚。',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    prompt,
    promptVersion: INGESTION_PROMPT_VERSION,
    diagnostics: {
      promptVersion: INGESTION_PROMPT_VERSION,
      subject: options.subject,
      imageCount: options.imageCount,
      inputChars: normalizedInput.length,
      previousParsedItemCount: previousParsedItems.length,
      hasExplicitFunction: Boolean(explicitFunction),
      hasExplicitPurpose: Boolean(explicitPurpose),
      promptChars: prompt.length,
    },
  };
}

export function diagnoseGenericAIResponse(response: string, prompt?: string): LogDiagnostic {
  const cleanResponse = normalizeText(response);
  const issues: string[] = [];
  const hints = new Set<string>();
  let score = 100;

  if (!cleanResponse) {
    return {
      score: 0,
      issues: ['empty_response'],
      hints: ['检查模型空响应时的兜底和重试逻辑。'],
      summary: '模型返回为空',
    };
  }

  if (/^error:/i.test(cleanResponse)) {
    return {
      score: 0,
      issues: ['request_failed'],
      hints: ['优先排查接口错误、模型可用性和请求参数。'],
      summary: '本轮请求失败',
    };
  }

  if (cleanResponse.length < 60) {
    issues.push('too_short');
    hints.add('回答过短时，补上“核心结论 + 关键依据/步骤”的双层结构。');
    score -= 18;
  }

  if (cleanResponse.length > 1200) {
    issues.push('too_verbose');
    hints.add('默认先短答，再按需展开，避免长篇铺陈。');
    score -= 12;
  }

  if (
    cleanResponse.length > 220 &&
    !hasAnyPattern(cleanResponse, [/\n- /, /\n\d+[.)]/, /一、|二、|三、/, /1\./, /2\./])
  ) {
    issues.push('no_structure');
    hints.add('长回答改成“结论 -> 要点 -> 易错点/下一步”的层次结构。');
    score -= 14;
  }

  if (hasAnyPattern(cleanResponse, [/这是一个很好的问题/, /作为AI/, /希望对你有帮助/, /很高兴为你解答/])) {
    issues.push('generic_opening');
    hints.add('删除空泛开场，直接进入答案。');
    score -= 10;
  }

  if (prompt && prompt.length > 6000) {
    issues.push('prompt_too_long');
    hints.add('提示词过长时压缩重复规则，避免冲淡重点。');
    score -= 8;
  }

  const summaryMap: Record<string, string> = {
    too_short: '回答偏短，可能没有真正解决问题',
    too_verbose: '回答偏长，重点不够集中',
    no_structure: '回答缺少层次，阅读成本偏高',
    generic_opening: '回答有套话，缺少直达问题的力度',
    prompt_too_long: '提示词偏长，可能稀释关键要求',
  };

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    hints: Array.from(hints),
    summary: issues.length > 0 ? summaryMap[issues[0]] || '本轮回答存在优化空间' : '回答质量正常',
  };
}

export function diagnoseChatResponse(args: {
  query?: string;
  response: string;
  prompt?: string;
  usedMemoryCount?: number;
  hasImage?: boolean;
}): LogDiagnostic {
  const base = diagnoseGenericAIResponse(args.response, args.prompt);
  const issues = [...base.issues];
  const hints = new Set(base.hints);
  let score = base.score;

  const cleanQuery = normalizeText(args.query);
  const cleanResponse = normalizeText(args.response);

  if ((args.usedMemoryCount || 0) > 0 && !hasAnyPattern(cleanResponse, [/记忆/, /错题/, /你之前/, /笔记/, /之前记录/])) {
    issues.push('missed_personalization');
    hints.add('命中记忆库时显式关联“你之前的错题/笔记/记忆点”，提高个性化程度。');
    score -= 12;
  }

  if (args.hasImage && !hasAnyPattern(cleanResponse, [/图/, /题目/, /图片/, /截图/, /题干/, /可见/])) {
    issues.push('ignored_image_context');
    hints.add('带图提问时先说明识别到的图像/题干信息，再展开解答。');
    score -= 12;
  }

  if (
    (args.hasImage || /[？?]/.test(cleanQuery)) &&
    !hasAnyPattern(cleanResponse, [/不确定/, /看不清/, /如果题干/, /若图片/, /信息不足/, /如果我理解有偏差/])
  ) {
    issues.push('missing_uncertainty_guard');
    hints.add('信息可能不完整时，先标记不确定点，避免模型装懂。');
    score -= 8;
  }

  const summaryMap: Record<string, string> = {
    request_failed: '本轮请求失败',
    empty_response: '模型返回为空',
    too_short: '回答偏短，可能没有真正切中问题',
    too_verbose: '回答偏长，重点不够集中',
    no_structure: '回答缺少结构，阅读成本偏高',
    generic_opening: '回答有套话，缺少直答',
    missed_personalization: '没有把答案和学生已有记忆连接起来',
    ignored_image_context: '没有先处理图片里的题干或批注信息',
    missing_uncertainty_guard: '对不确定信息缺少边界说明',
    prompt_too_long: '提示词偏长，可能稀释关键信号',
  };

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    hints: Array.from(hints),
    summary: issues.length > 0 ? summaryMap[issues[0]] || '本轮聊天回答存在优化空间' : '回答质量正常',
  };
}

export function diagnoseIngestionResponse(response: string, prompt?: string): LogDiagnostic {
  const cleanResponse = normalizeText(response);
  const base = diagnoseGenericAIResponse(response, prompt);
  const issues = [...base.issues];
  const hints = new Set(base.hints);
  let score = base.score;

  let parsed: any;
  try {
    parsed = parseJsonResponse(cleanResponse);
  } catch {
    return {
      score: 12,
      issues: ['invalid_json'],
      hints: ['解析 prompt 必须再次强调“只返回 JSON”，并约束顶层结构。'],
      summary: '解析结果不是合法 JSON',
    };
  }

  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  if (items.length === 0) {
    issues.push('empty_items');
    hints.add('解析结果为空时，要求模型至少输出待确认项，而不是空数组。');
    score -= 28;
  }

  let hasQuestion = false;
  let confirmationCount = 0;
  let conflictCount = 0;

  for (const rawItem of items) {
    const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
    const type = normalizeText((item as any).type).toLowerCase();
    const questionNo = normalizeText((item as any).questionNo);
    const studentAnswer = normalizeText((item as any).studentAnswer) || normalizeText((item as any).wrongAnswer);
    const correctAnswer = normalizeText((item as any).correctAnswer);
    const errorReason = normalizeText((item as any).errorReason);
    const errorReasonCategory = normalizeText((item as any).errorReasonCategory);
    const learningTask = normalizeText((item as any).learningTask);
    const reviewPriority = normalizeText((item as any).reviewPriority);
    const confidence = readNumber((item as any).confidence);
    const needsConfirmation = Boolean((item as any).needsConfirmation);
    const conflict = Boolean((item as any).conflict);
    const evidence = (item as any).evidence && typeof (item as any).evidence === 'object' ? (item as any).evidence : {};
    const optionAnalysis =
      (item as any).optionAnalysis && typeof (item as any).optionAnalysis === 'object' ? (item as any).optionAnalysis : {};
    const memoryCard = (item as any).memoryCard && typeof (item as any).memoryCard === 'object' ? (item as any).memoryCard : {};

    const isQuestionLike =
      type === 'qa' ||
      Boolean(questionNo) ||
      Boolean(studentAnswer) ||
      Boolean(correctAnswer) ||
      Boolean((item as any).isMistake);

    if (!isQuestionLike) continue;
    hasQuestion = true;

    if (!questionNo) {
      issues.push('missing_question_no');
      hints.add('逐题拆分后必须输出 questionNo；无法识别时也要显式标记待确认。');
      score -= 12;
    }

    if (/\d+\s*[-~—]\s*\d+/.test(questionNo)) {
      issues.push('combined_question_group');
      hints.add('提示词要继续强调：禁止把 32-35 这类题组当成一个正式 qa。');
      score -= 24;
    }

    if (confidence === undefined) {
      issues.push('missing_confidence');
      hints.add('每题都输出 confidence，用来区分正式入库和待确认。');
      score -= 10;
    }

    if (!normalizeText((evidence as any).sourceText) || !normalizeText((evidence as any).locationHint)) {
      issues.push('missing_evidence');
      hints.add('没有证据链时不要给确定答案，必须进入待确认。');
      score -= 18;
    }

    if (Object.keys(optionAnalysis).length === 0) {
      issues.push('missing_option_analysis');
      hints.add('错题解析必须解释正确项和错选项的排除依据。');
      score -= 12;
    }

    if (!learningTask) {
      issues.push('missing_learning_task');
      hints.add('每题必须给出可执行的防错策略，而不是泛泛建议。');
      score -= 10;
    }

    if (!normalizeText((memoryCard as any).front) || !normalizeText((memoryCard as any).back)) {
      issues.push('missing_memory_card');
      hints.add('错题卡需要 front/back，帮助学生形成复习闭环。');
      score -= 8;
    }

    if (!reviewPriority) {
      issues.push('missing_review_priority');
      hints.add('输出 reviewPriority，用于区分正式记忆与材料摘要。');
      score -= 8;
    }

    if ((item as any).isMistake) {
      if (!studentAnswer) {
        issues.push('missing_wrong_answer');
        hints.add('学生答案不清楚时要显式置空，并标记 needsConfirmation。');
        score -= 16;
      }

      if (!errorReason) {
        issues.push('missing_error_reason');
        hints.add('每道错题都要说明“为什么错”，不能只给正确答案。');
        score -= 18;
      }

      if (!errorReasonCategory) {
        issues.push('missing_error_reason_category');
        hints.add('错因分类尽量标准化，便于后续归类复习。');
        score -= 8;
      }
    }

    if (needsConfirmation) confirmationCount += 1;
    if (conflict) conflictCount += 1;
  }

  if (hasQuestion && confirmationCount > 0) {
    issues.push('needs_confirmation');
    hints.add('待确认题目要保留，不要直接覆盖旧结果或正式入库。');
    score -= Math.min(12, confirmationCount * 4);
  }

  if (conflictCount > 0) {
    issues.push('answer_conflict');
    hints.add('同题多轮识别冲突时，必须显式输出 conflict=true。');
    score -= Math.min(18, conflictCount * 6);
  }

  const summaryMap: Record<string, string> = {
    invalid_json: '解析结果不是合法 JSON',
    empty_items: '解析结果为空，没有形成可审查条目',
    combined_question_group: '仍然存在多题合并，未实现逐题拆分',
    missing_question_no: '题号粒度不足，无法形成逐题闭环',
    missing_evidence: '缺少证据链，无法支撑高质量错题卡',
    missing_wrong_answer: '缺少学生答案，无法判断错因',
    missing_error_reason: '缺少错因说明，学习闭环不完整',
    missing_confidence: '缺少置信度，无法区分待确认项',
    needs_confirmation: '存在待确认题目，需要人工复核',
    answer_conflict: '存在多轮识别冲突，需要人工确认',
    missing_option_analysis: '缺少选项排除依据',
    missing_learning_task: '缺少防错任务，难以形成迁移',
    missing_memory_card: '缺少错题卡 front/back',
    missing_error_reason_category: '缺少标准化错因分类',
    missing_review_priority: '缺少复习优先级',
  };

  const uniqueIssues = Array.from(new Set(issues));

  return {
    score: Math.max(0, Math.min(100, score)),
    issues: uniqueIssues,
    hints: Array.from(hints),
    summary: uniqueIssues.length > 0 ? summaryMap[uniqueIssues[0]] || '解析结果存在优化空间' : '解析结果质量正常',
  };
}

export function enrichAILog(log: Omit<AILog, 'id' | 'timestamp'>): Omit<AILog, 'id' | 'timestamp'> {
  const metadata = { ...(log.metadata || {}) };
  const promptVersion =
    log.promptVersion ||
    (typeof metadata.promptVersion === 'string' ? metadata.promptVersion : `legacy-${log.type}`);

  const isIngestionLog =
    log.type === 'parse' &&
    (promptVersion.startsWith('ingestion-') ||
      metadata.parseStage === 'ingestion' ||
      ['quick', 'image_pro', 'exam'].includes(String(metadata.workflow || '')));

  const diagnostic =
    log.type === 'chat'
      ? diagnoseChatResponse({
          query: typeof metadata.query === 'string' ? metadata.query : undefined,
          response: log.response,
          prompt: log.prompt,
          usedMemoryCount: readNumber(metadata.injectedMemoryCount) ?? readNumber(metadata.relevantMemoryCount),
          hasImage: Boolean(metadata.hasImage),
        })
      : isIngestionLog
        ? diagnoseIngestionResponse(log.response, log.prompt)
        : diagnoseGenericAIResponse(log.response, log.prompt);

  const existingHints = readStringArray(metadata.optimizationHints);

  return {
    ...log,
    promptVersion,
    qualityScore: log.qualityScore ?? diagnostic.score,
    qualitySummary: log.qualitySummary ?? diagnostic.summary,
    qualityIssues: log.qualityIssues ?? diagnostic.issues,
    metadata: {
      ...metadata,
      promptVersion,
      promptChars: readNumber(metadata.promptChars) ?? log.prompt.length,
      responseChars: readNumber(metadata.responseChars) ?? log.response.length,
      optimizationHints: existingHints.length > 0 ? existingHints : diagnostic.hints,
    },
  };
}

export function buildPromptOptimizationNotes(logs: AILog[], events: UserFeedbackEvent[]) {
  const notes = new Set<string>();
  const relevantLogs = logs.slice(0, 120);
  const logsByTargetId = new Map(
    relevantLogs
      .filter((log) => typeof log.targetId === 'string' && log.targetId.length > 0)
      .map((log) => [log.targetId as string, log])
  );

  const issueCounts = new Map<string, number>();
  const bumpIssue = (issue: string, weight = 1) => {
    issueCounts.set(issue, (issueCounts.get(issue) || 0) + weight);
  };

  for (const log of relevantLogs) {
    for (const issue of log.qualityIssues || []) {
      bumpIssue(issue, 1);
    }
  }

  const recentEvents = events.slice(0, 120);
  const inaccurateChatEvents = recentEvents.filter((event) => event.signalType === 'chat_inaccurate');
  const inaccurateIngestionEvents = recentEvents.filter((event) => event.signalType === 'ingestion_regenerated');
  const helpfulChatEvents = recentEvents.filter((event) => event.signalType === 'chat_helpful');

  for (const event of [...inaccurateChatEvents, ...inaccurateIngestionEvents]) {
    if (!event.targetId) continue;
    const relatedLog = logsByTargetId.get(event.targetId);
    for (const issue of relatedLog?.qualityIssues || []) {
      bumpIssue(issue, 2);
    }
  }

  const addIssueNote = (issue: string, threshold: number, note: string) => {
    if ((issueCounts.get(issue) || 0) >= threshold) {
      notes.add(note);
    }
  };

  addIssueNote('generic_opening', 2, '聊天提示词继续保持“先直答再解释”，删除礼貌套话和空泛开场。');
  addIssueNote('no_structure', 2, '聊天提示词加强输出结构：结论、要点、易错点/下一步。');
  addIssueNote('missed_personalization', 2, '命中记忆库时，提示词要求显式关联旧错题和旧笔记。');
  addIssueNote('ignored_image_context', 1, '带图问答先复述识别到的题干/批注，再展开解题。');
  addIssueNote('missing_uncertainty_guard', 1, '信息不完整时先声明不确定点，避免强行给确定答案。');
  addIssueNote('combined_question_group', 1, '解析提示词要继续强调逐题拆分，禁止把 32-35 之类题组并成一个 qa。');
  addIssueNote('missing_question_no', 1, '解析结果必须输出 questionNo，没有题号也要进入待确认。');
  addIssueNote('missing_evidence', 1, '解析提示词继续强调证据链：原文定位、关键句、选项排除依据缺一不可。');
  addIssueNote('missing_wrong_answer', 1, '学生答案识别不清时不要硬猜，置空并标记 needsConfirmation。');
  addIssueNote('missing_error_reason', 1, '每题都要解释“为什么错”，不能只提取题面和答案。');
  addIssueNote('missing_confidence', 1, '每题输出 confidence，用于区分正式入库和待确认。');
  addIssueNote('answer_conflict', 1, '多轮识别冲突时，提示词必须要求输出 conflict=true 且禁止覆盖旧结果。');
  addIssueNote('missing_option_analysis', 1, '阅读题和选择题需要写出错选项排除依据，避免只有结论没有过程。');
  addIssueNote('missing_learning_task', 1, '解析结果要补“下次先做什么”的防错任务，形成学习迁移。');
  addIssueNote('missing_memory_card', 1, '错题卡需要 front/back，帮助后续复习与 FSRS 调度。');
  addIssueNote('missing_error_reason_category', 1, '错因分类继续标准化，便于后续统计和专题复习。');
  addIssueNote('missing_review_priority', 1, '提示词要区分 high / medium / low / summary_only，避免摘要污染正式记忆。');

  if (inaccurateIngestionEvents.length >= 2) {
    notes.add('解析链路近期被多次重生成，提示词应优先保留题号、证据和学生答案，不要追求泛化总结。');
  }

  if (helpfulChatEvents.length >= 2 && helpfulChatEvents.length > inaccurateChatEvents.length) {
    notes.add('当前聊天提示词整体方向有效，可继续保持“直答 + 依据 + 个性化关联”的风格。');
  }

  return Array.from(notes);
}
