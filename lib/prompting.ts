import { AILog, KnowledgeNode, Memory, Settings, Subject, UserFeedbackEvent } from './types';

const CHAT_MEMORY_LIMIT = 6;
const CHAT_MEMORY_CHAR_BUDGET = 3200;

export const CHAT_PROMPT_VERSION = 'chat-v2.1';

type ChatIntent = 'problem-solving' | 'concept-explanation' | 'review' | 'general';

interface BuildChatPromptOptions {
  query: string;
  subject: Subject;
  relevantMemories: Memory[];
  allNodes: KnowledgeNode[];
  settings: Settings;
  hasImage: boolean;
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
  return `${text.slice(0, maxLength).trim()}…`;
}

function hasAnyPattern(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function inferChatIntent(query: string): ChatIntent {
  if (/(求|解|计算|证明|推导|步骤|怎么做|如何做|答案|题目|选择题|填空)/.test(query)) {
    return 'problem-solving';
  }
  if (/(解释|为什么|原理|概念|是什么|含义|区别|联系)/.test(query)) {
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
      return '先给答案或关键判断，再按最短路径拆步骤；补充常见易错点和检查方法。';
    case 'concept-explanation':
      return '先下定义或给一句本质解释，再讲原理，最后配一个贴近学生水平的小例子。';
    case 'review':
      return '先搭框架，再做归类对比，优先输出便于记忆和复习的结构化内容。';
    default:
      return '优先直答，再补必要依据；如果问题不完整，说明缺口并给当前最可靠的帮助。';
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

    if (nodeNames) lines.push(`  关联节点：${nodeNames}`);
    if (memory.correctAnswer) lines.push(`  标准答案：${truncateText(memory.correctAnswer, 100)}`);
    if (memory.wrongAnswer) lines.push(`  学生易错答案：${truncateText(memory.wrongAnswer, 100)}`);
    if (memory.errorReason) lines.push(`  错因：${truncateText(memory.errorReason, 120)}`);
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

  const prompt = [
    feedbackDirective,
    '你是一位高质量的高中学科辅导 AI，目标是帮学生真正弄懂、会做、记住，而不是只给一段看起来聪明的废话。',
    [
      '【回答总原则】',
      '1. 先解决学生当前问题，再结合记忆库做个性化补充。',
      '2. 如果信息不足、题干不完整或图片看不清，必须明确说出不确定点，禁止硬编。',
      '3. 默认先给结论/答案，再展开关键依据、步骤或易错点。',
      '4. 命中学生的旧错题、旧笔记或记忆点时，要显式关联，帮助形成“这和我以前哪里容易错有关”的感觉。',
      '5. 只有在确实能帮助理解时才追问，不要机械地每轮都反问。',
    ].join('\n'),
    [
      '【本轮任务画像】',
      `- 当前科目：${options.subject}`,
      `- 任务类型：${getIntentLabel(intent)}`,
      `- 学生画像：${normalizeText(options.settings.studentProfile) || '普通高中生'}`,
      `- 已检索记忆：${options.relevantMemories.length} 条，本轮实际注入 ${memoryContext.usedCount} 条${memoryContext.truncatedCount > 0 ? `（另有 ${memoryContext.truncatedCount} 条未展开）` : ''}`,
      `- 附带图片：${options.hasImage ? '是' : '否'}`,
    ].join('\n'),
    options.hasImage
      ? [
          '【图片处理要求】',
          '先说明你从图片里识别到了什么题干、图形或关键信息。',
          '如果有看不清、裁切不全或歧义，先点明，再基于当前可见信息给最可靠的分析。',
        ].join('\n')
      : '',
    ['【本轮回答策略】', getIntentGuidance(intent)].join('\n'),
    `【学生问题】\n${normalizeText(options.query)}`,
    `【可用记忆与错题上下文】\n${memoryContext.text}`,
    [
      '【输出格式】',
      '- 第 1 段：1-2 句给核心结论或答案。',
      '- 第 2 段：用 2-4 个要点说明关键依据/步骤。',
      '- 如果存在高频易错点或纠偏建议，单独列出来。',
      '- 如果引用了课本并想展示原图，请包含 [TEXTBOOK_PAGE: <textbookId>:<pageNumber>]。',
    ].join('\n'),
    [
      '【严禁】',
      '- 不要写“这是一个很好的问题”“作为 AI”“希望对你有帮助”等空话。',
      '- 不要输出内部思维链，只输出整理后的结论和必要步骤。',
      '- 不要为了显得专业而堆砌术语、套话或长段空泛总结。',
      '- 不要伪造课本原文、图像细节或学生过往记录。',
    ].join('\n'),
    [
      '【工具】',
      '- 需要时可以使用 search_textbook 查课本原文、例题和页面。',
      '- 需要时可以使用 search_all_rag 搜更多记忆和教材片段。',
    ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');

  const normalizedQuery = normalizeText(options.query);

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
    hints.add('回答过短时，增加“核心结论 + 关键依据/步骤”两层结构。');
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
    hints.add('长回答改为“结论 -> 要点 -> 易错点/下一步”的层次结构。');
    score -= 14;
  }

  if (hasAnyPattern(cleanResponse, [/这是一个很好的问题/, /作为AI/, /希望对你有帮助/, /很高兴为你解答/])) {
    issues.push('generic_opening');
    hints.add('删除空泛客套，直接进入答案。');
    score -= 10;
  }

  if (prompt && prompt.length > 6000) {
    issues.push('prompt_too_long');
    hints.add('提示词过长时优先压缩上下文和重复规则，避免稀释重点。');
    score -= 8;
  }

  const summaryMap: Record<string, string> = {
    too_short: '回答偏短，可能没有真正解到问题',
    too_verbose: '回答偏长，重点不够集中',
    no_structure: '回答缺少层次，读起来费劲',
    generic_opening: '回答有套话，缺少直达问题的力度',
    prompt_too_long: '提示词偏长，可能冲淡了关键任务',
  };

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    hints: Array.from(hints),
    summary: issues.length > 0 ? summaryMap[issues[0]] || '本轮回答存在可优化空间' : '回答质量正常',
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

  if ((args.usedMemoryCount || 0) > 0 && !hasAnyPattern(cleanResponse, [/记忆/, /错题/, /你之前/, /你前面/, /笔记/, /之前记录/])) {
    issues.push('missed_personalization');
    hints.add('命中记忆库时显式关联“你之前的错题/笔记/记忆点”，提高个性化程度。');
    score -= 12;
  }

  if (args.hasImage && !hasAnyPattern(cleanResponse, [/图/, /题目/, /图片/, /截图/, /题干/, /可见/])) {
    issues.push('ignored_image_context');
    hints.add('带图提问时先说明已识别到的图像/题干信息，再展开解答。');
    score -= 12;
  }

  if (
    (args.hasImage || /[？?]/.test(cleanQuery)) &&
    !hasAnyPattern(cleanResponse, [/不确定/, /看不清/, /如果题干/, /若图片/, /如果我理解有偏差/, /信息不足/])
  ) {
    issues.push('missing_uncertainty_guard');
    hints.add('信息可能不完整时，先标记不确定点，避免模型装懂。');
    score -= 8;
  }

  const summaryMap: Record<string, string> = {
    request_failed: '本轮请求失败',
    empty_response: '模型返回为空',
    too_short: '回答偏短，可能没真正切中问题',
    too_verbose: '回答偏长，重点不够集中',
    no_structure: '回答缺少结构，阅读成本偏高',
    generic_opening: '回答有套话，缺少直答',
    missed_personalization: '没有把答案和学生已有记忆连接起来',
    ignored_image_context: '没有先处理图片里的题干或图形信息',
    missing_uncertainty_guard: '对不确定信息缺少边界说明',
    prompt_too_long: '提示词偏长，可能稀释关键信号',
  };

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    hints: Array.from(hints),
    summary: issues.length > 0 ? summaryMap[issues[0]] || '本轮聊天回答存在可优化空间' : '回答质量正常',
  };
}

export function enrichAILog(log: Omit<AILog, 'id' | 'timestamp'>): Omit<AILog, 'id' | 'timestamp'> {
  const metadata = { ...(log.metadata || {}) };
  const promptVersion =
    log.promptVersion ||
    (typeof metadata.promptVersion === 'string' ? metadata.promptVersion : `legacy-${log.type}`);

  const diagnostic =
    log.type === 'chat'
      ? diagnoseChatResponse({
          query: typeof metadata.query === 'string' ? metadata.query : undefined,
          response: log.response,
          prompt: log.prompt,
          usedMemoryCount: readNumber(metadata.injectedMemoryCount) ?? readNumber(metadata.relevantMemoryCount),
          hasImage: Boolean(metadata.hasImage),
        })
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
  const chatLogs = logs.filter((log) => log.type === 'chat').slice(0, 80);
  const logsByTargetId = new Map(
    chatLogs
      .filter((log) => typeof log.targetId === 'string' && log.targetId.length > 0)
      .map((log) => [log.targetId as string, log])
  );

  const issueCounts = new Map<string, number>();
  const bumpIssue = (issue: string, weight = 1) => {
    issueCounts.set(issue, (issueCounts.get(issue) || 0) + weight);
  };

  for (const log of chatLogs) {
    for (const issue of log.qualityIssues || []) {
      bumpIssue(issue, 1);
    }
  }

  const recentEvents = events.slice(0, 120);
  const inaccurateChatEvents = recentEvents.filter((event) => event.signalType === 'chat_inaccurate');
  const helpfulChatEvents = recentEvents.filter((event) => event.signalType === 'chat_helpful');

  for (const event of inaccurateChatEvents) {
    if (!event.targetId) continue;
    const relatedLog = logsByTargetId.get(event.targetId);
    for (const issue of relatedLog?.qualityIssues || []) {
      bumpIssue(issue, 2);
    }
  }

  if (inaccurateChatEvents.length >= 2) {
    notes.add('当回答被用户判定为不准确时，先复述问题目标，再给结论、依据和不确定点，减少直接硬答。');
  }

  if ((issueCounts.get('generic_opening') || 0) >= 2) {
    notes.add('减少“这是个好问题 / 作为 AI / 希望对你有帮助”等套话，默认直接进入答案。');
  }

  if ((issueCounts.get('no_structure') || 0) >= 2) {
    notes.add('较长回答固定使用“结论 -> 关键步骤/依据 -> 易错点/下一步”结构，避免一整段散文。');
  }

  if ((issueCounts.get('too_verbose') || 0) >= 2) {
    notes.add('默认先短答，再按需展开，避免为了显得全面而写得过长。');
  }

  if ((issueCounts.get('too_short') || 0) >= 2) {
    notes.add('回答过短时至少补上关键依据或步骤，不要只给结论。');
  }

  if ((issueCounts.get('missed_personalization') || 0) >= 2) {
    notes.add('命中记忆库时，要显式关联学生之前的错题、笔记或记忆点，体现个性化辅导。');
  }

  if ((issueCounts.get('ignored_image_context') || 0) >= 1) {
    notes.add('带图提问时先说明识别到的题干/图像信息和看不清的部分，再解题，避免臆断。');
  }

  if ((issueCounts.get('missing_uncertainty_guard') || 0) >= 2) {
    notes.add('题干不完整、图片模糊或上下文不足时，明确标注不确定点，不要装作很确定。');
  }

  if ((issueCounts.get('prompt_too_long') || 0) >= 2) {
    notes.add('提示词过长时优先裁剪上下文和重复规则，保留最能影响答案质量的信息。');
  }

  if (helpfulChatEvents.length >= 3 && helpfulChatEvents.length > inaccurateChatEvents.length) {
    notes.add('保持“先给结论，再展开关键依据”的回答风格，这是当前更受欢迎的模式。');
  }

  return Array.from(notes);
}
