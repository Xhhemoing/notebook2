'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, FileText, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { useAppContext } from '@/lib/store';
import { generateTextbookFramework, getEmbedding, processTextbookPage, processTextbookPDF } from '@/lib/ai';
import { parseDocx, parsePDF } from '@/lib/file-parsers';
import { createMemoryPayload } from '@/lib/data/commands';
import { Textbook, TextbookAnnotation } from '@/lib/types';
import {
  findTextbookSection,
  incrementSectionQuizCount,
  markTextbookPageVisited,
  normalizeTextbookForState,
  upsertTextbookAnnotation,
} from '@/lib/textbook';
import { TextbookImportPanel } from '@/components/textbook/TextbookImportPanel';
import { TextbookOutlinePanel } from '@/components/textbook/TextbookOutlinePanel';
import { TextbookProcessingResult } from '@/components/textbook/TextbookProcessingResult';
import { TextbookWorkspace } from '@/components/textbook/TextbookWorkspace';

type StudyIntent = 'guide' | 'quiz' | 'issues' | 'sync' | null;

export function TextbookModule() {
  const { state, dispatch } = useAppContext();
  const [activeTextbookId, setActiveTextbookId] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [newTextbookName, setNewTextbookName] = useState('');
  const [enableOCR, setEnableOCR] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [studyIntent, setStudyIntent] = useState<StudyIntent>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subjectTextbooks = useMemo(
    () => state.textbooks.filter((textbook) => textbook.subject === state.currentSubject),
    [state.currentSubject, state.textbooks]
  );
  const filteredTextbooks = useMemo(
    () => subjectTextbooks.filter((textbook) => textbook.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [searchQuery, subjectTextbooks]
  );
  const activeTextbook = useMemo(
    () => state.textbooks.find((textbook) => textbook.id === activeTextbookId) || null,
    [activeTextbookId, state.textbooks]
  );
  const currentPage = activeTextbook?.pages[currentPageIndex];

  useEffect(() => {
    if (!activeTextbookId && filteredTextbooks.length > 0) {
      setActiveTextbookId(filteredTextbooks[0].id);
      return;
    }

    if (activeTextbookId && !filteredTextbooks.some((textbook) => textbook.id === activeTextbookId)) {
      setActiveTextbookId(filteredTextbooks[0]?.id || null);
      setCurrentPageIndex(0);
    }
  }, [activeTextbookId, filteredTextbooks]);

  useEffect(() => {
    if (!activeTextbook) {
      setActiveSectionId(null);
      return;
    }

    const page = activeTextbook.pages[currentPageIndex];
    const deepestSectionId = page?.sectionIds?.[page.sectionIds.length - 1] || activeTextbook.toc?.[0]?.id || null;
    setActiveSectionId(deepestSectionId);
  }, [activeTextbook, currentPageIndex]);

  useEffect(() => {
    if (!activeTextbook || activeTextbook.entryMode !== 'workspace' || !currentPage) return;
    const alreadyVisited = activeTextbook.studyStats?.readPageNumbers?.includes(currentPage.pageNumber);
    const lastOpenedPage = activeTextbook.studyStats?.lastOpenedPage;
    if (alreadyVisited && lastOpenedPage === currentPage.pageNumber) return;
    dispatch({
      type: 'UPDATE_TEXTBOOK',
      payload: markTextbookPageVisited(activeTextbook, currentPage.pageNumber, activeSectionId),
    });
  }, [activeSectionId, activeTextbook, currentPage, dispatch]);

  useEffect(() => {
    if (!activeTextbook) return;
    if (currentPageIndex >= activeTextbook.pages.length) {
      setCurrentPageIndex(Math.max(0, activeTextbook.pages.length - 1));
    }
  }, [activeTextbook, currentPageIndex]);

  const subjectMemories = useMemo(
    () => state.memories.filter((memory) => memory.subject === state.currentSubject),
    [state.currentSubject, state.memories]
  );
  const subjectNodes = useMemo(
    () => state.knowledgeNodes.filter((node) => node.subject === state.currentSubject),
    [state.currentSubject, state.knowledgeNodes]
  );

  const logCallback = (log: any) => {
    if (!state.settings.enableLogging) return;
    dispatch({
      type: 'ADD_LOG',
      payload: {
        ...log,
        subject: state.currentSubject,
        workflow: 'chat',
      },
    });
  };

  const updateActiveTextbook = (nextTextbook: Textbook) => {
    dispatch({ type: 'UPDATE_TEXTBOOK', payload: normalizeTextbookForState(nextTextbook) });
  };

  const openWorkspace = (intent: StudyIntent = null) => {
    if (!activeTextbook) return;
    if (activeTextbook.entryMode !== 'workspace') {
      updateActiveTextbook({ ...activeTextbook, entryMode: 'workspace' });
    }
    setStudyIntent(intent);
  };

  const jumpToPage = (pageNumber: number) => {
    const nextIndex = Math.max(0, Math.min((activeTextbook?.pages.length || 1) - 1, pageNumber - 1));
    setCurrentPageIndex(nextIndex);
    if (activeTextbook?.entryMode !== 'workspace') {
      openWorkspace('issues');
    }
  };

  const handleSectionSelect = (sectionId: string, pageNumber: number) => {
    setActiveSectionId(sectionId);
    jumpToPage(pageNumber);
    openWorkspace(null);
  };

  const handleQuizGenerated = (sectionId?: string | null) => {
    if (!activeTextbook) return;
    dispatch({
      type: 'UPDATE_TEXTBOOK',
      payload: incrementSectionQuizCount(activeTextbook, sectionId),
    });
  };

  const handleSyncRequest = () => {
    setNotice('课本内图谱同步入口已预留。当前版本不会自动写入全局知识图谱，请先在工作台内确认结构与重点。');
  };

  const handleCreateAnnotation = async (input: {
    type: TextbookAnnotation['type'];
    text: string;
    note?: string;
    startOffset?: number;
    endOffset?: number;
  }) => {
    if (!activeTextbook || !currentPage) return;

    const annotation: TextbookAnnotation = {
      id: uuidv4(),
      pageNumber: currentPage.pageNumber,
      type: input.type,
      text: input.text,
      note: input.note,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      createdAt: Date.now(),
      sectionId: activeSectionId || currentPage.sectionIds?.[currentPage.sectionIds.length - 1],
    };

    const nextTextbook = upsertTextbookAnnotation(activeTextbook, currentPage.pageNumber, annotation);
    dispatch({ type: 'UPDATE_TEXTBOOK', payload: nextTextbook });

    if (input.type === 'memory') {
      const embedding = await getEmbedding(input.text, state.settings);
      const memoryResult = createMemoryPayload({
        id: uuidv4(),
        subject: activeTextbook.subject,
        content: input.text,
        notes: input.note,
        functionType: '细碎记忆',
        purposeType: '记忆型',
        knowledgeNodeIds: [],
        confidence: 50,
        mastery: 0,
        createdAt: Date.now(),
        sourceType: 'text' as const,
        source: `摘自《${activeTextbook.name}》第 ${currentPage.pageNumber} 页`,
        sourceTextbookId: activeTextbook.id,
        sourceTextbookPage: currentPage.pageNumber,
        embedding,
        dataSource: 'textbook_extract',
        evidence: {
          sourceText: input.text,
          locationHint: `第 ${currentPage.pageNumber} 页`,
          keySentence: input.note || input.text,
        },
      });

      if (memoryResult.ok) {
        dispatch({ type: 'ADD_MEMORY', payload: memoryResult.value });
        setNotice('已将标注内容同步生成到记忆库。');
      } else {
        setNotice(`记忆生成失败：${memoryResult.error}`);
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);
    setNotice(null);
    const fileList = Array.from(files);
    setUploadProgress({ current: 0, total: fileList.length });

    const allPages: Textbook['pages'] = [];
    let primaryFileId: string | undefined;
    let primaryFileType: string | undefined;
    let finalName = newTextbookName.trim();

    try {
      for (const file of fileList) {
        if (!finalName) {
          finalName = file.name.replace(/\.[^/.]+$/, '');
        }

        if (file.type === 'application/pdf') {
          const fileId = uuidv4();
          if (!primaryFileId) {
            primaryFileId = fileId;
            primaryFileType = file.type;
          }

          const { saveFile } = await import('@/lib/store');
          const arrayBuffer = await file.arrayBuffer();
          await saveFile(fileId, arrayBuffer);

          if (enableOCR) {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            });
            const ocrResults = await processTextbookPDF(base64, state.settings, logCallback);
            const fallbackPages = ocrResults.length === 0 ? await parsePDF(file) : [];
            const pagePayloads =
              ocrResults.length > 0
                ? ocrResults.map((item) => ({ pageNumber: item.pageNumber, textContent: item.content }))
                : fallbackPages;

            setUploadProgress((current) => ({
              current: current.current,
              total: Math.max(current.total, fileList.length + pagePayloads.length - 1),
            }));

            for (const page of pagePayloads) {
              const embedding = await getEmbedding(page.textContent, state.settings);
              allPages.push({
                id: uuidv4(),
                pageNumber: page.pageNumber,
                content: page.textContent,
                imageUrl: '',
                embedding,
              });
              setUploadProgress((current) => ({ ...current, current: current.current + 1 }));
            }
          } else {
            const pdfPages = await parsePDF(file);
            setUploadProgress((current) => ({
              current: current.current,
              total: Math.max(current.total, fileList.length + pdfPages.length - 1),
            }));
            for (const page of pdfPages) {
              const embedding = await getEmbedding(page.textContent, state.settings);
              allPages.push({
                id: uuidv4(),
                pageNumber: page.pageNumber,
                content: page.textContent,
                imageUrl: '',
                embedding,
              });
              setUploadProgress((current) => ({ ...current, current: current.current + 1 }));
            }
          }
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const { content } = await parseDocx(file);
          const embedding = await getEmbedding(content, state.settings);
          allPages.push({
            id: uuidv4(),
            pageNumber: 1,
            content,
            imageUrl: '',
            embedding,
          });
          setUploadProgress((current) => ({ ...current, current: current.current + 1 }));
        } else if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          const { content, embedding } = await processTextbookPage(base64, allPages.length + 1, state.settings, logCallback);
          allPages.push({
            id: uuidv4(),
            pageNumber: allPages.length + 1,
            content,
            imageUrl: base64,
            embedding,
          });
          setUploadProgress((current) => ({ ...current, current: current.current + 1 }));
        }
      }

      const textbookBase: Textbook = {
        id: uuidv4(),
        name: finalName || '未命名课本',
        subject: state.currentSubject,
        fileId: primaryFileId,
        fileType: primaryFileType,
        totalPages: allPages.length,
        pages: allPages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        entryMode: 'result',
      };

      const framework = await generateTextbookFramework(textbookBase, state.settings, logCallback).catch(() => []);
      const newTextbook = normalizeTextbookForState({
        ...textbookBase,
        framework,
        processingStatus: undefined,
        entryMode: 'result',
      });

      dispatch({ type: 'ADD_TEXTBOOK', payload: newTextbook });
      setActiveTextbookId(newTextbook.id);
      setCurrentPageIndex(Math.max(0, (newTextbook.studyStats?.lastOpenedPage || 1) - 1));
      setActiveSectionId(newTextbook.toc?.[0]?.id || null);
      setStudyIntent(newTextbook.processingStatus === 'needs_review' ? 'issues' : null);
      setNewTextbookName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setNotice('导入完成，已进入处理结果页。可以先检查结构和低置信页，再进入学习工作台。');
    } catch (uploadError: any) {
      console.error('Upload failed', uploadError);
      setError(uploadError.message || '导入失败，请检查文件格式或网络连接');
      dispatch({
        type: 'ADD_LOG',
        payload: {
          type: 'parse',
          model: state.settings.parseModel,
          prompt: '[Textbook Import Error]',
          response: `课本导入失败: ${uploadError.message || '未知错误'}`,
          subject: state.currentSubject,
        },
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex h-full bg-black text-slate-200 overflow-hidden">
      <aside className="w-[320px] border-r border-slate-900 flex flex-col shrink-0">
        <TextbookImportPanel
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          newTextbookName={newTextbookName}
          onNewTextbookNameChange={setNewTextbookName}
          enableOCR={enableOCR}
          onEnableOCRChange={setEnableOCR}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          error={error}
          onUploadClick={() => fileInputRef.current?.click()}
        />

        <div className="p-2 border-b border-slate-900 max-h-[240px] overflow-y-auto custom-scrollbar space-y-1 shrink-0">
          {filteredTextbooks.map((textbook) => (
            <button
              key={textbook.id}
              onClick={() => {
                setActiveTextbookId(textbook.id);
                const nextPage = Math.max(0, (textbook.studyStats?.lastOpenedPage || 1) - 1);
                setCurrentPageIndex(nextPage);
                setActiveSectionId(textbook.studyStats?.lastOpenedSectionId || textbook.toc?.[0]?.id || null);
              }}
              className={clsx(
                'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                activeTextbookId === textbook.id
                  ? 'border-indigo-500/60 bg-indigo-500/10'
                  : 'border-slate-900 bg-slate-950/60 hover:border-slate-800'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-100 truncate">{textbook.name}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {textbook.entryMode === 'result' ? '处理结果页' : '学习工作台'} · {textbook.processingStatus === 'needs_review' ? '待复核' : '已就绪'}
                  </div>
                </div>
                <span
                  onClick={(event) => {
                    event.stopPropagation();
                    if (confirm('确定删除这本课本吗？')) {
                      dispatch({ type: 'DELETE_TEXTBOOK', payload: textbook.id });
                      if (activeTextbookId === textbook.id) {
                        setActiveTextbookId(null);
                        setCurrentPageIndex(0);
                        setActiveSectionId(null);
                      }
                    }
                  }}
                  className="rounded-lg p-1 text-slate-500 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </span>
              </div>
            </button>
          ))}

          {filteredTextbooks.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 px-4">
              <BookOpen className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-xs">当前学科还没有课本，先导入一本开始建立教材知识底座。</p>
            </div>
          )}
        </div>

        {activeTextbook && (
          <div className="flex-1 min-h-0">
            <TextbookOutlinePanel
              textbook={activeTextbook}
              activeSectionId={activeSectionId}
              onSelectSection={handleSectionSelect}
              onJumpToPage={jumpToPage}
            />
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          multiple
          accept=".pdf,.docx,image/*"
        />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {notice && (
          <div className="border-b border-slate-900 bg-indigo-950/20 px-4 py-2 text-xs text-indigo-100 flex items-center justify-between">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="text-indigo-200/80 hover:text-white">
              关闭
            </button>
          </div>
        )}

        {!activeTextbook ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
            <BookOpen className="w-16 h-16 mb-4 opacity-10" />
            <p className="text-sm font-medium opacity-40">请从左侧导入或选择一本课本开始学习</p>
          </div>
        ) : activeTextbook.entryMode === 'result' ? (
          <TextbookProcessingResult
            textbook={activeTextbook}
            onOpenWorkspace={() => openWorkspace(null)}
            onOpenGuide={() => openWorkspace('guide')}
            onOpenQuiz={() => openWorkspace('quiz')}
            onInspectIssues={() => {
              openWorkspace('issues');
              setNotice('低置信页和结构复核入口已打开。你也可以直接在左侧目录中跳转到问题页。');
            }}
            onSyncGraph={() => {
              setStudyIntent('sync');
              handleSyncRequest();
            }}
          />
        ) : (
          <TextbookWorkspace
            textbook={activeTextbook}
            currentPageIndex={currentPageIndex}
            onPageChange={setCurrentPageIndex}
            onCreateAnnotation={handleCreateAnnotation}
            memories={subjectMemories}
            knowledgeNodes={subjectNodes}
            settings={state.settings}
            intent={studyIntent}
            onIntentHandled={() => setStudyIntent(null)}
            onJumpToPage={jumpToPage}
            onQuizGenerated={handleQuizGenerated}
            onSyncRequest={handleSyncRequest}
            activeSectionId={activeSectionId}
            logCallback={logCallback}
          />
        )}
      </div>
    </div>
  );
}
