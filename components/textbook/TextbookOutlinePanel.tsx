'use client';

import { AlertTriangle, BookOpenText, ChevronRight, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { Textbook, TextbookTOCItem } from '@/lib/types';
import { getTextbookIssueSummary } from '@/lib/textbook';

function SectionTree({
  items,
  activeSectionId,
  textbook,
  onSelect,
}: {
  items: TextbookTOCItem[];
  activeSectionId?: string | null;
  textbook: Textbook;
  onSelect: (sectionId: string, pageNumber: number) => void;
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const progress = textbook.studyStats?.sectionProgress?.[item.id];
        return (
          <div key={item.id} className="space-y-1">
            <button
              onClick={() => onSelect(item.id, item.startPage)}
              className={clsx(
                'w-full rounded-xl border px-3 py-2 text-left transition-colors',
                activeSectionId === item.id
                  ? 'border-indigo-500/60 bg-indigo-500/10'
                  : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
              )}
            >
              <div className="flex items-start gap-2">
                <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-100 truncate">{item.title}</span>
                    {item.highlight === 'needs_review' && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span>{item.startPage}-{item.endPage} 页</span>
                    <span>掌握度 {progress?.mastery || 0}</span>
                    <span>标注 {progress?.annotationCount || 0}</span>
                  </div>
                </div>
              </div>
            </button>
            {item.children?.length > 0 && (
              <div className="ml-4 border-l border-slate-900 pl-2">
                <SectionTree items={item.children} activeSectionId={activeSectionId} textbook={textbook} onSelect={onSelect} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TextbookOutlinePanel({
  textbook,
  activeSectionId,
  onSelectSection,
  onJumpToPage,
}: {
  textbook: Textbook;
  activeSectionId?: string | null;
  onSelectSection: (sectionId: string, pageNumber: number) => void;
  onJumpToPage: (pageNumber: number) => void;
}) {
  const issues = getTextbookIssueSummary(textbook);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3 space-y-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex items-center gap-2">
          <BookOpenText className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="text-xs font-semibold text-white">{textbook.name}</div>
            <div className="text-[10px] text-slate-500">
              {textbook.totalPages || textbook.pages.length} 页 · {textbook.processingStatus === 'needs_review' ? '待复核' : '已就绪'}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
            <div className="text-slate-500">已读页</div>
            <div className="mt-1 text-sm font-semibold text-white">{textbook.studyStats?.readPageNumbers?.length || 0}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
            <div className="text-slate-500">标注数</div>
            <div className="mt-1 text-sm font-semibold text-white">{textbook.studyStats?.totalAnnotations || 0}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <h3 className="text-xs font-semibold text-white">章节结构</h3>
        </div>
        <SectionTree items={textbook.toc || []} activeSectionId={activeSectionId} textbook={textbook} onSelect={onSelectSection} />
      </div>

      {issues.hasIssues && (
        <div className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-amber-200">低置信 / 异常页</h3>
          </div>
          <div className="space-y-2 text-[11px] text-slate-300">
            {issues.lowConfidencePages.length > 0 && (
              <div>
                <div className="text-slate-500 mb-1">低置信页</div>
                <div className="flex flex-wrap gap-2">
                  {issues.lowConfidencePages.slice(0, 8).map((pageNumber) => (
                    <button
                      key={`low-${pageNumber}`}
                      onClick={() => onJumpToPage(pageNumber)}
                      className="rounded-full border border-amber-900/50 px-2 py-1 hover:bg-amber-500/10"
                    >
                      第 {pageNumber} 页
                    </button>
                  ))}
                </div>
              </div>
            )}

            {issues.emptyPages.length > 0 && (
              <div>
                <div className="text-slate-500 mb-1">空白页 / 未识别页</div>
                <div className="flex flex-wrap gap-2">
                  {issues.emptyPages.slice(0, 8).map((pageNumber) => (
                    <button
                      key={`empty-${pageNumber}`}
                      onClick={() => onJumpToPage(pageNumber)}
                      className="rounded-full border border-slate-800 px-2 py-1 hover:bg-slate-800/80"
                    >
                      第 {pageNumber} 页
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
