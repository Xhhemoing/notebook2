'use client';

import { AlertTriangle, BookCheck, BrainCircuit, GitBranch, ScanSearch, Sparkles, Target } from 'lucide-react';
import { Textbook } from '@/lib/types';
import { flattenTextbookTOC, getTextbookIssueSummary } from '@/lib/textbook';

export function TextbookProcessingResult({
  textbook,
  onOpenWorkspace,
  onOpenGuide,
  onOpenQuiz,
  onInspectIssues,
  onSyncGraph,
}: {
  textbook: Textbook;
  onOpenWorkspace: () => void;
  onOpenGuide: () => void;
  onOpenQuiz: () => void;
  onInspectIssues: () => void;
  onSyncGraph: () => void;
}) {
  const sections = flattenTextbookTOC(textbook.toc || []);
  const issues = getTextbookIssueSummary(textbook);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-black p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">处理结果页</div>
              <h2 className="mt-2 text-2xl font-black text-white tracking-tight">{textbook.name}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
                这本课本已经进入系统的教材知识底座。你现在可以继续阅读标注，也可以直接发起 AI 导学、章节测验和后续图谱同步准备。
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-black/50 px-4 py-3 text-sm text-slate-300">
              {textbook.processingStatus === 'needs_review' ? '存在待复核内容' : '导入已完成'}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-[11px] text-slate-500">页数</div>
              <div className="mt-1 text-2xl font-semibold text-white">{textbook.totalPages || textbook.pages.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-[11px] text-slate-500">章节结构</div>
              <div className="mt-1 text-2xl font-semibold text-white">{sections.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-[11px] text-slate-500">低置信页</div>
              <div className="mt-1 text-2xl font-semibold text-white">{issues.lowConfidencePages.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-[11px] text-slate-500">空白 / 未识别页</div>
              <div className="mt-1 text-2xl font-semibold text-white">{issues.emptyPages.length}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <button
            onClick={onOpenWorkspace}
            className="rounded-2xl border border-cyan-900/40 bg-cyan-500/10 p-4 text-left hover:bg-cyan-500/15"
          >
            <BookCheck className="w-5 h-5 text-cyan-300" />
            <div className="mt-3 text-sm font-semibold text-white">去阅读标注</div>
            <div className="mt-1 text-xs text-cyan-100/70">进入工作台，开始阅读、划线和写批注。</div>
          </button>

          <button
            onClick={onOpenGuide}
            className="rounded-2xl border border-violet-900/40 bg-violet-500/10 p-4 text-left hover:bg-violet-500/15"
          >
            <Sparkles className="w-5 h-5 text-violet-300" />
            <div className="mt-3 text-sm font-semibold text-white">AI 导学某章</div>
            <div className="mt-1 text-xs text-violet-100/70">按章节生成学习重点、易错点和阅读顺序。</div>
          </button>

          <button
            onClick={onOpenQuiz}
            className="rounded-2xl border border-indigo-900/40 bg-indigo-500/10 p-4 text-left hover:bg-indigo-500/15"
          >
            <Target className="w-5 h-5 text-indigo-300" />
            <div className="mt-3 text-sm font-semibold text-white">按范围考察</div>
            <div className="mt-1 text-xs text-indigo-100/70">优先选择题、判断题，快速测掌握度。</div>
          </button>

          <button
            onClick={onInspectIssues}
            className="rounded-2xl border border-amber-900/40 bg-amber-500/10 p-4 text-left hover:bg-amber-500/15"
          >
            <ScanSearch className="w-5 h-5 text-amber-300" />
            <div className="mt-3 text-sm font-semibold text-white">检查结构 / 低置信页</div>
            <div className="mt-1 text-xs text-amber-100/70">优先定位识别质量不稳、需要手工复核的页。</div>
          </button>

          <button
            onClick={onSyncGraph}
            className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left hover:bg-slate-900"
          >
            <GitBranch className="w-5 h-5 text-slate-300" />
            <div className="mt-3 text-sm font-semibold text-white">同步到全局图谱</div>
            <div className="mt-1 text-xs text-slate-400">当前仅提供入口和同步准备，不自动写入全局图谱。</div>
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BrainCircuit className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-white">自动识别出的课本结构</h3>
            </div>
            <div className="space-y-3">
              {sections.length === 0 ? (
                <div className="text-sm text-slate-500">暂未识别出稳定目录，后续会按整本课本进入工作台。</div>
              ) : (
                sections.slice(0, 12).map((section) => (
                  <div key={section.id} className="rounded-2xl border border-slate-800 bg-black/30 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100">{section.title}</span>
                      {section.highlight === 'needs_review' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      第 {section.startPage}-{section.endPage} 页 · 置信 {section.confidence}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">当前需要留意</h3>
            </div>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800 bg-black/30 px-4 py-3">
                <div className="text-xs text-slate-500">低置信页</div>
                <div className="mt-1">
                  {issues.lowConfidencePages.length > 0 ? issues.lowConfidencePages.join('、') : '暂无'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-black/30 px-4 py-3">
                <div className="text-xs text-slate-500">空白 / 未识别页</div>
                <div className="mt-1">
                  {issues.emptyPages.length > 0 ? issues.emptyPages.join('、') : '暂无'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-black/30 px-4 py-3">
                <div className="text-xs text-slate-500">建议</div>
                <div className="mt-1 leading-7">
                  先从章节结构进入工作台，再利用 AI 导学与范围考察逐章推进。若当前存在低置信页，优先阅读时顺手核对。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
