'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, GitBranch, Loader2, Sparkles, Target } from 'lucide-react';
import { clsx } from 'clsx';
import { generateTextbookQuiz, generateTextbookStudyGuide } from '@/lib/ai';
import { findTextbookSection, flattenTextbookTOC, getPageRangeForSection } from '@/lib/textbook';
import { KnowledgeNode, Memory, Settings, Textbook, TextbookQuizConfig, TextbookQuizQuestion } from '@/lib/types';

type StudyIntent = 'guide' | 'quiz' | 'issues' | 'sync' | null;

export function TextbookStudyPanel({
  textbook,
  activeSectionId,
  memories,
  knowledgeNodes,
  settings,
  intent,
  onIntentHandled,
  onJumpToPage,
  onQuizGenerated,
  onSyncRequest,
  logCallback,
}: {
  textbook: Textbook;
  activeSectionId?: string | null;
  memories: Memory[];
  knowledgeNodes: KnowledgeNode[];
  settings: Settings;
  intent: StudyIntent;
  onIntentHandled: () => void;
  onJumpToPage: (pageNumber: number) => void;
  onQuizGenerated: (sectionId?: string | null) => void;
  onSyncRequest: () => void;
  logCallback?: (log: any) => void;
}) {
  const [activeTab, setActiveTab] = useState<'guide' | 'quiz' | 'links'>('guide');
  const [guide, setGuide] = useState('');
  const [quiz, setQuiz] = useState<TextbookQuizQuestion[]>([]);
  const [loadingGuide, setLoadingGuide] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [quizConfig, setQuizConfig] = useState<TextbookQuizConfig>({
    scopeType: 'section',
    sectionId: activeSectionId || textbook.toc?.[0]?.id,
    depth: 'standard',
    adaptive: true,
    questionTypes: ['single_choice', 'true_false'],
  });

  useEffect(() => {
    setQuizConfig((current) => ({
      ...current,
      sectionId: activeSectionId || current.sectionId || textbook.toc?.[0]?.id,
    }));
  }, [activeSectionId, textbook.toc]);

  useEffect(() => {
    if (!intent) return;
    if (intent === 'guide') setActiveTab('guide');
    if (intent === 'quiz') setActiveTab('quiz');
    if (intent === 'issues') setActiveTab('links');
    if (intent === 'sync') onSyncRequest();
    onIntentHandled();
  }, [intent, onIntentHandled, onSyncRequest]);

  const scopeSection = useMemo(
    () => findTextbookSection(textbook.toc || [], quizConfig.sectionId || activeSectionId || null),
    [activeSectionId, quizConfig.sectionId, textbook.toc]
  );
  const allSections = useMemo(() => flattenTextbookTOC(textbook.toc || []), [textbook.toc]);

  const scopedRange = useMemo(() => {
    if (quizConfig.scopeType === 'custom' && quizConfig.pageRange) return quizConfig.pageRange;
    return getPageRangeForSection(textbook.toc || [], quizConfig.sectionId || activeSectionId, textbook.totalPages);
  }, [activeSectionId, quizConfig.pageRange, quizConfig.scopeType, quizConfig.sectionId, textbook.toc, textbook.totalPages]);

  const scopedMemories = useMemo(() => {
    return memories.filter((memory) => {
      if (memory.subject !== textbook.subject) return false;
      if (memory.sourceTextbookId === textbook.id) {
        const page = memory.sourceTextbookPage || -1;
        return page >= scopedRange.start && page <= scopedRange.end;
      }
      return false;
    });
  }, [memories, scopedRange.end, scopedRange.start, textbook.id, textbook.subject]);

  const scopedMistakes = scopedMemories.filter((memory) => memory.isMistake);
  const relatedNodes = useMemo(() => {
    const nodeIds = Array.from(new Set(scopedMemories.flatMap((memory) => memory.knowledgeNodeIds || [])));
    return knowledgeNodes
      .filter((node) => node.subject === textbook.subject && nodeIds.includes(node.id))
      .slice(0, 8);
  }, [knowledgeNodes, scopedMemories, textbook.subject]);

  const lowConfidencePages = textbook.pages
    .filter((page) => page.pageNumber >= scopedRange.start && page.pageNumber <= scopedRange.end && (page.confidence || 0) < 55)
    .slice(0, 6);

  const handleGenerateGuide = async () => {
    setLoadingGuide(true);
    try {
      const result = await generateTextbookStudyGuide(
        textbook,
        settings,
        {
          sectionId: quizConfig.scopeType === 'section' ? quizConfig.sectionId : undefined,
          pageRange: quizConfig.scopeType === 'custom' ? quizConfig.pageRange : undefined,
          memories,
          knowledgeNodes,
        },
        logCallback
      );
      setGuide(result);
      setActiveTab('guide');
    } catch (error) {
      console.error('Failed to generate textbook study guide', error);
      setGuide('生成导学失败，请稍后重试。');
    } finally {
      setLoadingGuide(false);
    }
  };

  const handleGenerateQuiz = async () => {
    setLoadingQuiz(true);
    try {
      const result = await generateTextbookQuiz(
        textbook,
        settings,
        quizConfig,
        {
          memories,
          knowledgeNodes,
        },
        logCallback
      );
      setQuiz(result);
      setActiveTab('quiz');
      onQuizGenerated(quizConfig.scopeType === 'section' ? quizConfig.sectionId : activeSectionId);
    } catch (error) {
      console.error('Failed to generate textbook quiz', error);
      setQuiz([]);
    } finally {
      setLoadingQuiz(false);
    }
  };

  return (
    <div className="w-[360px] shrink-0 bg-black flex flex-col">
      <div className="border-b border-slate-900 px-4 py-3">
        <div className="text-sm font-semibold text-white">学习联动</div>
        <div className="mt-1 text-[11px] text-slate-500">
          {scopeSection ? scopeSection.title : `${textbook.name} 当前页范围`} · 第 {scopedRange.start}-{scopedRange.end} 页
        </div>
      </div>

      <div className="px-4 py-3 border-b border-slate-900 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-slate-500">相关记忆</div>
            <div className="mt-1 text-lg font-semibold text-white">{scopedMemories.length}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-slate-500">相关错题</div>
            <div className="mt-1 text-lg font-semibold text-white">{scopedMistakes.length}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleGenerateGuide}
            className="rounded-full bg-violet-500/15 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-500/25"
          >
            <Sparkles className="w-3.5 h-3.5 inline mr-1" />
            AI 导学某章
          </button>
          <button
            onClick={handleGenerateQuiz}
            className="rounded-full bg-indigo-500/15 px-3 py-1.5 text-xs text-indigo-100 hover:bg-indigo-500/25"
          >
            <Target className="w-3.5 h-3.5 inline mr-1" />
            按范围考察
          </button>
          <button
            onClick={() => setActiveTab('links')}
            className="rounded-full border border-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
            检查结构 / 低置信页
          </button>
          <button
            onClick={onSyncRequest}
            className="rounded-full border border-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            <GitBranch className="w-3.5 h-3.5 inline mr-1" />
            同步到全局图谱
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
          {[
            ['guide', '导学'],
            ['quiz', '考察'],
            ['links', '联动'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as 'guide' | 'quiz' | 'links')}
              className={clsx('rounded-lg px-3 py-1.5 text-xs', activeTab === key ? 'bg-slate-800 text-white' : 'text-slate-400')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {activeTab === 'guide' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs text-slate-400 mb-3">AI 导学</div>
              {loadingGuide ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在生成章节导学...
                </div>
              ) : guide ? (
                <div className="text-sm whitespace-pre-wrap leading-7 text-slate-100">{guide}</div>
              ) : (
                <div className="text-sm text-slate-500">
                  让 AI 基于当前章节、相关记忆和错题，生成一份适合实际学习的导学建议。
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'quiz' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="text-xs text-slate-400">范围考察配置</div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-[11px] text-slate-400">
                  <span>范围</span>
                  <select
                    value={quizConfig.scopeType}
                    onChange={(event) =>
                      setQuizConfig((current) => ({
                        ...current,
                        scopeType: event.target.value as TextbookQuizConfig['scopeType'],
                      }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="section">当前章节</option>
                    <option value="custom">自定义页段</option>
                  </select>
                </label>

                <label className="space-y-1 text-[11px] text-slate-400">
                  <span>细致程度</span>
                  <select
                    value={quizConfig.depth}
                    onChange={(event) =>
                      setQuizConfig((current) => ({
                        ...current,
                        depth: event.target.value as TextbookQuizConfig['depth'],
                      }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="basic">基础</option>
                    <option value="standard">标准</option>
                    <option value="deep">深入</option>
                  </select>
                </label>
              </div>

              {quizConfig.scopeType === 'section' ? (
                <label className="space-y-1 text-[11px] text-slate-400 block">
                  <span>章节</span>
                  <select
                    value={quizConfig.sectionId || ''}
                    onChange={(event) =>
                      setQuizConfig((current) => ({
                        ...current,
                        sectionId: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    {allSections.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-[11px] text-slate-400">
                    <span>起始页</span>
                    <input
                      type="number"
                      min={1}
                      max={textbook.totalPages || textbook.pages.length}
                      value={quizConfig.pageRange?.start || 1}
                      onChange={(event) =>
                        setQuizConfig((current) => ({
                          ...current,
                          pageRange: {
                            start: Number(event.target.value) || 1,
                            end: current.pageRange?.end || current.pageRange?.start || 1,
                          },
                        }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-slate-400">
                    <span>结束页</span>
                    <input
                      type="number"
                      min={1}
                      max={textbook.totalPages || textbook.pages.length}
                      value={quizConfig.pageRange?.end || Math.min(3, textbook.totalPages || textbook.pages.length)}
                      onChange={(event) =>
                        setQuizConfig((current) => ({
                          ...current,
                          pageRange: {
                            start: current.pageRange?.start || 1,
                            end: Number(event.target.value) || current.pageRange?.start || 1,
                          },
                        }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </label>
                </div>
              )}

              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <input
                  type="checkbox"
                  checked={quizConfig.adaptive}
                  onChange={(event) =>
                    setQuizConfig((current) => ({
                      ...current,
                      adaptive: event.target.checked,
                    }))
                  }
                  className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-900 text-indigo-500"
                />
                依据当前掌握度自适应
              </label>

              <button
                onClick={handleGenerateQuiz}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white"
              >
                {loadingQuiz ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在出题...
                  </span>
                ) : (
                  '生成自测题'
                )}
              </button>
            </div>

            <div className="space-y-3">
              {quiz.length === 0 && !loadingQuiz && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">
                  生成后会在这里展示选择题 / 判断题，并附带答案与解释。
                </div>
              )}
              {quiz.map((item, index) => (
                <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-[11px] text-slate-500 mb-2">
                    第 {index + 1} 题 · {item.type === 'true_false' ? '判断题' : '单选题'}
                  </div>
                  <div className="text-sm text-white leading-7">{item.prompt}</div>
                  {item.options?.length ? (
                    <div className="mt-3 space-y-2">
                      {item.options.map((option, optionIndex) => (
                        <div key={`${item.id}-${optionIndex}`} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300">
                          {option}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 rounded-xl border border-emerald-900/30 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">
                    答案：{item.answer}
                    {item.explanation ? <div className="mt-1 text-xs text-emerald-200/80">{item.explanation}</div> : null}
                  </div>
                  {item.relatedPageNumbers?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.relatedPageNumbers.map((pageNumber) => (
                        <button
                          key={`${item.id}-page-${pageNumber}`}
                          onClick={() => onJumpToPage(pageNumber)}
                          className="rounded-full border border-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-900"
                        >
                          回到第 {pageNumber} 页
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'links' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs text-slate-400 mb-3">相关记忆 / 错题 / 图谱</div>
              <div className="space-y-3">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                    <BrainCircuit className="w-3.5 h-3.5" />
                    相关记忆
                  </div>
                  {scopedMemories.length === 0 ? (
                    <div className="text-sm text-slate-500">当前范围还没有回链到记忆库的内容。</div>
                  ) : (
                    <div className="space-y-2">
                      {scopedMemories.slice(0, 5).map((memory) => (
                        <div key={memory.id} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-200">
                          {memory.content}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    低置信页 / 风险页
                  </div>
                  {lowConfidencePages.length === 0 ? (
                    <div className="text-sm text-slate-500">当前范围暂无明显低置信页。</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {lowConfidencePages.map((page) => (
                        <button
                          key={page.id}
                          onClick={() => onJumpToPage(page.pageNumber)}
                          className="rounded-full border border-amber-900/40 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-500/10"
                        >
                          第 {page.pageNumber} 页 · 置信 {page.confidence}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                    <GitBranch className="w-3.5 h-3.5" />
                    相关知识图谱节点
                  </div>
                  {relatedNodes.length === 0 ? (
                    <div className="text-sm text-slate-500">当前范围还没有和全局知识图谱形成稳定映射。</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {relatedNodes.map((node) => (
                        <span key={node.id} className="rounded-full border border-slate-800 px-2 py-1 text-[11px] text-slate-300">
                          {node.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
