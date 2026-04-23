'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, FileText, Highlighter, Loader2, NotebookPen, PanelsTopLeft, ScanText, Target, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Textbook, TextbookAnnotation } from '@/lib/types';
import { loadPdfJs } from '@/lib/file-parsers';
import { loadFile } from '@/lib/store';

function getAnnotationClasses(type: TextbookAnnotation['type']) {
  if (type === 'focus') return 'bg-rose-500/20 text-rose-100 ring-1 ring-rose-500/30';
  if (type === 'review') return 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/30';
  if (type === 'memory') return 'bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-500/30';
  if (type === 'note') return 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-500/30';
  return 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-500/30';
}

function renderAnnotatedContent(content: string, annotations: TextbookAnnotation[]) {
  const textAnnotations = annotations
    .filter((annotation) => annotation.text && annotation.text.trim())
    .map((annotation, index) => {
      const start = Number.isFinite(annotation.startOffset)
        ? annotation.startOffset!
        : content.indexOf(annotation.text || '');
      const end = Number.isFinite(annotation.endOffset) ? annotation.endOffset! : start + (annotation.text || '').length;
      return {
        annotation,
        start,
        end,
        index,
      };
    })
    .filter((item) => item.start >= 0 && item.end > item.start)
    .sort((left, right) => left.start - right.start);

  if (textAnnotations.length === 0) {
    return <span>{content}</span>;
  }

  const segments: Array<string | ReactNode> = [];
  let cursor = 0;

  textAnnotations.forEach((item) => {
    if (item.start < cursor) return;
    if (item.start > cursor) {
      segments.push(content.slice(cursor, item.start));
    }
    segments.push(
      <mark
        key={`${item.annotation.id}-${item.index}`}
        className={clsx('rounded px-1 py-0.5', getAnnotationClasses(item.annotation.type))}
      >
        {content.slice(item.start, item.end)}
      </mark>
    );
    cursor = item.end;
  });

  if (cursor < content.length) {
    segments.push(content.slice(cursor));
  }

  return segments;
}

export function TextbookReader({
  textbook,
  currentPageIndex,
  onPageChange,
  onCreateAnnotation,
}: {
  textbook: Textbook;
  currentPageIndex: number;
  onPageChange: (index: number) => void;
  onCreateAnnotation: (input: {
    type: TextbookAnnotation['type'];
    text: string;
    note?: string;
    startOffset?: number;
    endOffset?: number;
  }) => Promise<void> | void;
}) {
  const currentPage = textbook.pages[currentPageIndex];
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionOffsets, setSelectionOffsets] = useState<{ start?: number; end?: number }>({});
  const [noteDraft, setNoteDraft] = useState('');
  const [savingType, setSavingType] = useState<TextbookAnnotation['type'] | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'page' | 'ocr'>('split');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pageAnnotations = useMemo(() => currentPage?.annotations || [], [currentPage?.annotations]);

  useEffect(() => {
    let isMounted = true;

    const loadDoc = async () => {
      if (textbook.fileType !== 'application/pdf' || !textbook.fileId) {
        setPdfDoc(null);
        return;
      }

      try {
        const buffer = await loadFile(textbook.fileId);
        if (!buffer || !isMounted) return;
        const pdfjsLib = await loadPdfJs();
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (isMounted) setPdfDoc(doc);
      } catch (error) {
        console.error('Failed to load PDF doc', error);
      }
    };

    loadDoc();
    return () => {
      isMounted = false;
    };
  }, [textbook.fileId, textbook.fileType]);

  useEffect(() => {
    let isMounted = true;

    const renderPage = async () => {
      if (!pdfDoc || !currentPage || textbook.fileType !== 'application/pdf') return;
      setIsRendering(true);
      try {
        const page = await pdfDoc.getPage(currentPage.pageNumber);
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = canvasRef.current;
        if (!canvas || !isMounted) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
      } catch (error) {
        console.error('Failed to render textbook page', error);
      } finally {
        if (isMounted) setIsRendering(false);
      }
    };

    renderPage();
    return () => {
      isMounted = false;
    };
  }, [currentPage, pdfDoc, textbook.fileType]);

  useEffect(() => {
    setSelectedText('');
    setSelectionOffsets({});
    setNoteDraft('');
  }, [currentPageIndex, textbook.id]);

  const handleSelection = () => {
    const selection = window.getSelection();
    const nextText = selection?.toString().trim() || '';
    if (!nextText || !currentPage?.content) {
      setSelectedText('');
      setSelectionOffsets({});
      return;
    }

    const startOffset = currentPage.content.indexOf(nextText);
    setSelectedText(nextText);
    setSelectionOffsets({
      start: startOffset >= 0 ? startOffset : undefined,
      end: startOffset >= 0 ? startOffset + nextText.length : undefined,
    });
  };

  const annotationPreview = useMemo(() => {
    if (!currentPage?.content) return null;
    return renderAnnotatedContent(currentPage.content, pageAnnotations);
  }, [currentPage?.content, pageAnnotations]);

  const persistSelection = async (type: TextbookAnnotation['type']) => {
    if (!selectedText) return;
    setSavingType(type);
    try {
      await onCreateAnnotation({
        type,
        text: selectedText,
        note: noteDraft.trim() || undefined,
        startOffset: selectionOffsets.start,
        endOffset: selectionOffsets.end,
      });
      setSelectedText('');
      setSelectionOffsets({});
      setNoteDraft('');
      window.getSelection()?.removeAllRanges();
    } finally {
      setSavingType(null);
    }
  };

  return (
    <div className="flex-1 min-w-0 border-r border-slate-900 bg-black flex flex-col">
      <div className="border-b border-slate-900 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold text-white">{textbook.name}</div>
            <div className="text-[10px] text-slate-500">
              第 {currentPageIndex + 1} / {textbook.pages.length} 页
            </div>
          </div>
          <div className="h-6 w-px bg-slate-900" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(Math.max(0, currentPageIndex - 1))}
              disabled={currentPageIndex === 0}
              className="rounded-lg border border-slate-800 p-1.5 text-slate-400 hover:text-white disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange(Math.min(textbook.pages.length - 1, currentPageIndex + 1))}
              disabled={currentPageIndex === textbook.pages.length - 1}
              className="rounded-lg border border-slate-800 p-1.5 text-slate-400 hover:text-white disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
          <button
            onClick={() => setViewMode('page')}
            className={clsx('rounded-lg px-2.5 py-1 text-xs', viewMode === 'page' ? 'bg-slate-800 text-white' : 'text-slate-400')}
          >
            原页
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={clsx('rounded-lg px-2.5 py-1 text-xs', viewMode === 'split' ? 'bg-slate-800 text-white' : 'text-slate-400')}
          >
            对照
          </button>
          <button
            onClick={() => setViewMode('ocr')}
            className={clsx('rounded-lg px-2.5 py-1 text-xs', viewMode === 'ocr' ? 'bg-slate-800 text-white' : 'text-slate-400')}
          >
            OCR
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {(viewMode === 'page' || viewMode === 'split') && (
          <div className={clsx('overflow-auto custom-scrollbar bg-slate-950/40', viewMode === 'split' ? 'h-1/2 border-b border-slate-900' : 'h-full')}>
            <div className="p-4 flex justify-center">
              <div className="relative w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-2xl">
                {textbook.fileType === 'application/pdf' ? (
                  <div className="relative">
                    <canvas ref={canvasRef} className="w-full h-auto" />
                    {isRendering && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                      </div>
                    )}
                  </div>
                ) : currentPage?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentPage.imageUrl} alt={`第 ${currentPage.pageNumber} 页`} className="w-full h-auto" />
                ) : (
                  <div className="aspect-[4/3] flex flex-col items-center justify-center text-slate-500">
                    <FileText className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-sm">当前页以 OCR 文本为主</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {(viewMode === 'ocr' || viewMode === 'split') && (
          <div className={clsx('overflow-auto custom-scrollbar bg-black', viewMode === 'split' ? 'h-1/2' : 'h-full')}>
            <div className="max-w-3xl mx-auto p-4 space-y-3">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-500">
                <ScanText className="w-3.5 h-3.5" />
                OCR 文本与标注
              </div>

              {selectedText && (
                <div className="rounded-2xl border border-indigo-900/40 bg-indigo-950/20 p-3 space-y-3">
                  <div className="text-xs text-slate-300 line-clamp-3">&quot;{selectedText}&quot;</div>
                  <input
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="给这段内容写一句批注（可选）"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => persistSelection('highlight')}
                      className="rounded-full bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/25"
                    >
                      <Highlighter className="w-3.5 h-3.5 inline mr-1" />
                      仅标注
                    </button>
                    <button
                      onClick={() => persistSelection('note')}
                      className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/25"
                    >
                      <NotebookPen className="w-3.5 h-3.5 inline mr-1" />
                      标注并写批注
                    </button>
                    <button
                      onClick={() => persistSelection('memory')}
                      className="rounded-full bg-indigo-500/15 px-3 py-1.5 text-xs text-indigo-100 hover:bg-indigo-500/25"
                    >
                      <Copy className="w-3.5 h-3.5 inline mr-1" />
                      生成记忆
                    </button>
                    <button
                      onClick={() => persistSelection('focus')}
                      className="rounded-full bg-rose-500/15 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-500/25"
                    >
                      <Target className="w-3.5 h-3.5 inline mr-1" />
                      设为重点
                    </button>
                    <button
                      onClick={() => persistSelection('review')}
                      className="rounded-full bg-amber-500/15 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/25"
                    >
                      <Check className="w-3.5 h-3.5 inline mr-1" />
                      设为待复习
                    </button>
                    <button
                      onClick={() => {
                        setSelectedText('');
                        setSelectionOffsets({});
                        setNoteDraft('');
                        window.getSelection()?.removeAllRanges();
                      }}
                      className="rounded-full border border-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5 inline mr-1" />
                      取消
                    </button>
                  </div>
                  {savingType && (
                    <div className="text-[11px] text-slate-500">正在保存 {savingType}...</div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
                  <div className="text-xs text-slate-300">请选择 OCR 文本中的内容进行高亮、批注或生成记忆</div>
                  <PanelsTopLeft className="w-4 h-4 text-slate-500" />
                </div>
                <div
                  className="px-4 py-4 text-sm leading-7 text-slate-200 whitespace-pre-wrap select-text"
                  onMouseUp={handleSelection}
                >
                  {currentPage?.content ? annotationPreview : <span className="text-slate-500">当前页暂无 OCR 文本。</span>}
                </div>
              </div>

              {pageAnnotations.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-xs text-slate-400 mb-3">本页标注</div>
                  <div className="space-y-2">
                    {pageAnnotations.map((annotation) => (
                      <div key={annotation.id} className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span className="uppercase">{annotation.type}</span>
                          <span>{new Date(annotation.createdAt).toLocaleString()}</span>
                        </div>
                        {annotation.text && <div className="mt-1 text-sm text-slate-100">{annotation.text}</div>}
                        {annotation.note && <div className="mt-1 text-xs text-slate-400">{annotation.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
