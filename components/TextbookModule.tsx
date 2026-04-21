'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '@/lib/store';
import { Textbook, TextbookPage, KnowledgeNode } from '@/lib/types';
import { 
  BookOpen, 
  Upload, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  FileText, 
  Image as ImageIcon,
  Loader2,
  Network,
  Copy,
  Check,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { clsx } from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { processTextbookPage, processTextbookPDF, generateTextbookFramework, getEmbedding } from '@/lib/ai';
import { parsePDF, parseDocx } from '@/lib/file-parsers';
import { createMemoryPayload } from '@/lib/data/commands';

import { loadPdfJs } from '@/lib/file-parsers';

export function TextbookModule() {
  const { state, dispatch } = useAppContext();
  const [activeTextbookId, setActiveTextbookId] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [newTextbookName, setNewTextbookName] = useState('');
  const [isGeneratingFramework, setIsGeneratingFramework] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFramework, setShowFramework] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [isCreatingMemory, setIsCreatingMemory] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [enableOCR, setEnableOCR] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const activeTextbook = state.textbooks.find(t => t.id === activeTextbookId);
  const currentPage = activeTextbook?.pages[currentPageIndex];

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load PDF doc when active textbook changes
  useEffect(() => {
    let isMounted = true;
    if (activeTextbook?.fileId && activeTextbook.fileType === 'application/pdf') {
      const loadDoc = async () => {
        try {
          const { loadFile } = await import('@/lib/store');
          const buffer = await loadFile(activeTextbook.fileId!);
          if (buffer && isMounted) {
            const pdfjsLib = await loadPdfJs();
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            if (pdfjsLib) {
              const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
              if (isMounted) setPdfDoc(doc);
            }
          }
        } catch (e) {
          console.error('Failed to load PDF doc', e);
        }
      };
      loadDoc();
    } else {
      setPdfDoc(null);
    }
    return () => { isMounted = false; };
  }, [activeTextbook?.fileId, activeTextbook?.fileType]);

  // Render page when index changes
  useEffect(() => {
    let isMounted = true;
    if (pdfDoc && currentPage) {
      const renderPage = async () => {
        setIsRendering(true);
        try {
          const page = await pdfDoc.getPage(currentPage.pageNumber);
          const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better viewing
          const canvas = canvasRef.current;
          if (canvas && isMounted) {
            const context = canvas.getContext('2d');
            if (context) {
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              await page.render({ canvasContext: context, viewport }).promise;
            }
          }
        } catch (e) {
          console.error('Failed to render page', e);
        } finally {
          if (isMounted) setIsRendering(false);
        }
      };
      renderPage();
    }
    return () => { isMounted = false; };
  }, [pdfDoc, currentPage?.pageNumber, currentPage]);

  const [selectionMode, setSelectionMode] = useState<'text' | 'image'>('text');

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectionMode !== 'image' || !pdfDoc) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectionMode !== 'image' || !isDragging || !selectionBox) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelectionBox({ ...selectionBox, endX: x, endY: y });
  };

  const handleMouseUp = () => {
    if (selectionMode === 'image') {
      setIsDragging(false);
    }
  };

  const handleCreateImageMemory = async () => {
    if (!selectionBox || !canvasRef.current || !activeTextbook) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate scale between displayed size and actual canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.min(selectionBox.startX, selectionBox.endX) * scaleX;
    const y = Math.min(selectionBox.startY, selectionBox.endY) * scaleY;
    const width = Math.abs(selectionBox.endX - selectionBox.startX) * scaleX;
    const height = Math.abs(selectionBox.endY - selectionBox.startY) * scaleY;

    if (width < 10 || height < 10) {
      setSelectionBox(null);
      return;
    }

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = width;
    cropCanvas.height = height;
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
    const base64Image = cropCanvas.toDataURL('image/jpeg', 0.9);

    setIsCreatingMemory(true);
    try {
      // Get OCR and embedding for the cropped image
      const { content, embedding } = await processTextbookPage(
        base64Image,
        currentPage?.pageNumber || 1,
        state.settings
      );

      const memoryResult = createMemoryPayload({
        id: uuidv4(),
        subject: activeTextbook.subject,
        content: content || '图片摘抄',
        functionType: '细碎记忆',
        purposeType: '记忆型',
        knowledgeNodeIds: [],
        confidence: 50,
        mastery: 0,
        createdAt: Date.now(),
        sourceType: 'image' as const,
        imageUrl: base64Image,
        source: `摘自《${activeTextbook.name}》第 ${currentPage?.pageNumber} 页`,
        sourceTextbookId: activeTextbook.id,
        sourceTextbookPage: currentPage?.pageNumber,
        embedding,
        dataSource: 'textbook_extract'
      });

      if (!memoryResult.ok) {
        throw new Error(memoryResult.error);
      }

      dispatch({ type: 'ADD_MEMORY', payload: memoryResult.value });
      setSelectionBox(null);
      alert('已成功摘抄图片至记忆库！');
    } catch (error) {
      console.error('Failed to create image memory', error);
      alert('摘抄失败');
    } finally {
      setIsCreatingMemory(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    setError(null);
    const fileList = Array.from(files);
    setUploadProgress({ current: 0, total: fileList.length });

    const allPages: TextbookPage[] = [];
    let primaryFileId: string | undefined;
    let primaryFileType: string | undefined;
    let finalName = newTextbookName.trim();

    try {
      for (const file of fileList) {
        if (!finalName) {
          finalName = file.name.replace(/\.[^/.]+$/, "");
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
            dispatch({ 
              type: 'ADD_LOG', 
              payload: { 
                type: 'parse', 
                model: state.settings.parseModel,
                prompt: `[Textbook PDF OCR Start]`,
                response: `正在对整个 PDF 进行 OCR 识别，请稍候...` 
              } 
            });

            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            });

            const ocrResults = await processTextbookPDF(
              base64,
              state.settings,
              (log) => dispatch({ type: 'ADD_LOG', payload: log })
            );

            setUploadProgress(prev => ({ ...prev, total: prev.total + ocrResults.length - 1 }));

            for (const res of ocrResults) {
              const embedding = await getEmbedding(res.content);
              allPages.push({
                id: uuidv4(),
                pageNumber: res.pageNumber,
                content: res.content,
                imageUrl: '',
                embedding
              });
              setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
            }
          } else {
            const pdfPages = await parsePDF(file);
            setUploadProgress(prev => ({ ...prev, total: prev.total + pdfPages.length - 1 }));
            
            for (const p of pdfPages) {
              const embedding = await getEmbedding(p.textContent);
              allPages.push({
                id: uuidv4(),
                pageNumber: p.pageNumber,
                content: p.textContent,
                imageUrl: '',
                embedding
              });
              setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
            }
          }
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const { content } = await parseDocx(file);
          // For docx, we just create one "page" for now as it's text-based
          const embedding = await getEmbedding(content);
          allPages.push({
            id: uuidv4(),
            pageNumber: 1,
            content,
            imageUrl: '', // No image for docx yet
            embedding
          });
          setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
        } else if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });

          const { content, embedding } = await processTextbookPage(
            base64, 
            allPages.length + 1, 
            state.settings,
            (log) => dispatch({ type: 'ADD_LOG', payload: log })
          );
          
          allPages.push({
            id: uuidv4(),
            pageNumber: allPages.length + 1,
            content,
            imageUrl: base64,
            embedding
          });
          setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }
      }

      const newTextbook: Textbook = {
        id: uuidv4(),
        name: finalName || '未命名课本',
        subject: state.currentSubject,
        fileId: primaryFileId,
        fileType: primaryFileType,
        totalPages: allPages.length,
        pages: allPages,
        createdAt: Date.now()
      };

      dispatch({ type: 'ADD_TEXTBOOK', payload: newTextbook });
      setActiveTextbookId(newTextbook.id);
      setNewTextbookName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error('Upload failed', err);
      setError(err.message || '导入失败，请检查文件格式或网络连接');
      dispatch({ 
        type: 'ADD_LOG', 
        payload: { 
          id: uuidv4(),
          timestamp: Date.now(),
          type: 'parse', 
          model: state.settings.parseModel,
          prompt: '[Textbook Import Error]',
          response: `课本导入失败: ${err.message || '未知错误'}` 
        } 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateFramework = async () => {
    if (!activeTextbook) return;
    setIsGeneratingFramework(true);
    try {
      const framework = await generateTextbookFramework(
        activeTextbook, 
        state.settings,
        (log) => dispatch({ type: 'ADD_LOG', payload: log })
      );
      dispatch({ 
        type: 'UPDATE_TEXTBOOK', 
        payload: { ...activeTextbook, framework } 
      });
    } catch (error) {
      console.error('Failed to generate framework', error);
    } finally {
      setIsGeneratingFramework(false);
    }
  };

  const handleCreateMemoryFromSelection = async () => {
    if (!selectedText || !activeTextbook) return;
    setIsCreatingMemory(true);
    try {
      const embedding = await getEmbedding(selectedText);
      const memoryResult = createMemoryPayload({
        id: uuidv4(),
        subject: activeTextbook.subject,
        content: selectedText,
        functionType: '细碎记忆',
        purposeType: '记忆型',
        knowledgeNodeIds: [],
        confidence: 50,
        mastery: 0,
        createdAt: Date.now(),
        sourceType: 'text' as const,
        source: `摘自《${activeTextbook.name}》第 ${currentPage?.pageNumber} 页`,
        sourceTextbookId: activeTextbook.id,
        sourceTextbookPage: currentPage?.pageNumber,
        embedding,
        dataSource: 'textbook_extract'
      });

      if (!memoryResult.ok) {
        throw new Error(memoryResult.error);
      }

      dispatch({ type: 'ADD_MEMORY', payload: memoryResult.value });
      setSelectedText('');
      alert('已成功摘抄至记忆库！');
    } catch (error) {
      console.error('Failed to create memory', error);
    } finally {
      setIsCreatingMemory(false);
    }
  };

  const filteredTextbooks = state.textbooks.filter(t => 
    t.subject === state.currentSubject && 
    (t.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex h-full bg-black text-slate-200 overflow-hidden">
      {/* Left Sidebar: Textbook List */}
      <div className="w-56 border-r border-slate-900 flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-900">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              课本库
            </h2>
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input 
              type="text" 
              placeholder="搜索课本..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-900 rounded-md py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>
          <div className="space-y-2">
            <input 
              type="text" 
              placeholder="新课本名称 (可选)..." 
              value={newTextbookName}
              onChange={(e) => setNewTextbookName(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-900 rounded-md py-1.5 px-3 text-xs focus:outline-none focus:border-blue-500 transition-all"
            />
            <div className="flex items-center gap-2 px-1">
              <input 
                type="checkbox" 
                id="enable-ocr"
                checked={enableOCR}
                onChange={(e) => setEnableOCR(e.target.checked)}
                className="w-3 h-3 rounded border-slate-900 bg-slate-900/50 text-indigo-500 focus:ring-indigo-500"
              />
              <label htmlFor="enable-ocr" className="text-[10px] text-slate-400 cursor-pointer select-none">
                启用 AI OCR (更精准但较慢)
              </label>
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-md text-xs font-medium transition-all"
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {isUploading ? `上传中 ${uploadProgress.current}/${uploadProgress.total}` : '导入课本 (PDF/DOC/图)'}
            </button>
            {error && (
              <div className="p-2 text-[10px] text-red-400 bg-red-900/20 border border-red-900/50 rounded-md">
                {error}
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
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {filteredTextbooks.map(t => (
            <div 
              key={t.id}
              className={clsx(
                "group flex items-center justify-between p-2 rounded-md cursor-pointer transition-all",
                activeTextbookId === t.id ? "bg-slate-900 text-blue-400" : "hover:bg-slate-900/50 text-slate-400 hover:text-slate-200"
              )}
              onClick={() => {
                setActiveTextbookId(t.id);
                setCurrentPageIndex(0);
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs truncate">{t.name}</span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('确定删除这本课本吗？')) {
                    dispatch({ type: 'DELETE_TEXTBOOK', payload: t.id });
                    if (activeTextbookId === t.id) setActiveTextbookId(null);
                  }
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {filteredTextbooks.length === 0 && (
            <div className="text-center py-8 text-slate-600 text-[10px]">
              暂无课本，请先导入
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Textbook Viewer */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {activeTextbook ? (
          <>
            {/* Toolbar */}
            <div className="h-10 border-b border-slate-900 flex items-center justify-between px-3 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold truncate max-w-[150px]">{activeTextbook.name}</h3>
                <div className="h-3 w-[1px] bg-slate-900" />
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => setCurrentPageIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentPageIndex === 0}
                    className="p-1 hover:bg-slate-900 rounded transition-all"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono w-14 text-center">
                    {currentPageIndex + 1} / {activeTextbook.pages.length}
                  </span>
                  <button 
                    onClick={() => setCurrentPageIndex(prev => Math.min(activeTextbook.pages.length - 1, prev + 1))}
                    disabled={currentPageIndex === activeTextbook.pages.length - 1}
                    className="p-1 hover:bg-slate-900 rounded transition-all"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeTextbook.fileType === 'application/pdf' && (
                  <div className="flex items-center bg-slate-900 rounded-md p-0.5 mr-2">
                    <button
                      onClick={() => {
                        setSelectionMode('text');
                        setSelectionBox(null);
                      }}
                      className={clsx(
                        "px-3 py-1 text-xs font-medium rounded-sm transition-all",
                        selectionMode === 'text' ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      选文字
                    </button>
                    <button
                      onClick={() => {
                        setSelectionMode('image');
                        window.getSelection()?.removeAllRanges();
                      }}
                      className={clsx(
                        "px-3 py-1 text-xs font-medium rounded-sm transition-all",
                        selectionMode === 'image' ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      框图片
                    </button>
                  </div>
                )}
                <button 
                  onClick={() => setShowFramework(!showFramework)}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    showFramework ? "bg-purple-600 text-white" : "bg-slate-900 text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Network className="w-3.5 h-3.5" />
                  知识框架
                </button>
                <button 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-1.5 bg-slate-900 text-slate-400 hover:text-slate-200 rounded-md transition-all"
                >
                  {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Viewer Area */}
            <div className="flex-1 flex overflow-hidden">
              {/* Page Content */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center bg-black custom-scrollbar">
                <div 
                  className={clsx(
                    "bg-slate-800 shadow-2xl transition-all duration-300 relative group",
                    isFullScreen ? "w-full max-w-5xl" : "w-full max-w-2xl"
                  )}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {activeTextbook.fileType === 'application/pdf' ? (
                    <div className="relative w-full">
                      <canvas 
                        ref={canvasRef} 
                        className="w-full h-auto select-none"
                      />
                      {isRendering && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                        </div>
                      )}
                      {selectionBox && (
                        <div 
                          className="absolute border-2 border-indigo-500 bg-indigo-500/20 pointer-events-none"
                          style={{
                            left: Math.min(selectionBox.startX, selectionBox.endX),
                            top: Math.min(selectionBox.startY, selectionBox.endY),
                            width: Math.abs(selectionBox.endX - selectionBox.startX),
                            height: Math.abs(selectionBox.endY - selectionBox.startY)
                          }}
                        />
                      )}
                      {selectionBox && !isDragging && (
                        <button
                          onClick={handleCreateImageMemory}
                          className="absolute z-10 bg-indigo-600 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-lg hover:bg-indigo-700 transition-all"
                          style={{
                            left: Math.min(selectionBox.startX, selectionBox.endX),
                            top: Math.max(selectionBox.startY, selectionBox.endY) + 8
                          }}
                        >
                          {isCreatingMemory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '摘抄图片'}
                        </button>
                      )}
                    </div>
                  ) : currentPage?.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img 
                      src={currentPage.imageUrl} 
                      alt={`Page ${currentPage.pageNumber}`}
                      className="w-full h-auto select-none"
                    />
                  ) : (
                    <div className="aspect-[3/4] flex items-center justify-center text-slate-500 bg-slate-900">
                      <div className="text-center">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="text-sm opacity-40">纯文本内容</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Text Overlay / Selection Layer */}
                  <div 
                    className={clsx(
                      "absolute inset-0 p-8 text-transparent select-text whitespace-pre-wrap font-serif leading-relaxed overflow-hidden",
                      selectionMode === 'image' ? "pointer-events-none" : ""
                    )}
                    onMouseUp={() => {
                      if (selectionMode === 'text') {
                        const selection = window.getSelection();
                        if (selection && selection.toString().trim()) {
                          setSelectedText(selection.toString().trim());
                        }
                      }
                    }}
                  >
                    {currentPage?.content}
                  </div>
                </div>
              </div>

              {/* Right Panel: Framework / Selection Info */}
              {showFramework && (
                <div className="w-80 border-l border-slate-900 bg-black flex flex-col shrink-0 animate-in slide-in-from-right duration-300">
                  <div className="p-4 border-b border-slate-900 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">知识框架</h4>
                    {!activeTextbook.framework && (
                      <button 
                        onClick={handleGenerateFramework}
                        disabled={isGeneratingFramework}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        {isGeneratingFramework ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Plus className="w-2.5 h-2.5" />}
                        AI 构建
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {activeTextbook.framework ? (
                      <div className="space-y-2">
                        {activeTextbook.framework.map(node => (
                          <div 
                            key={node.id}
                            style={{ paddingLeft: `${(node.id.split('.').length - 1) * 12}px` }}
                            className="flex items-center gap-2 py-1 group"
                          >
                            <div className="w-1 h-1 rounded-full bg-indigo-500/50" />
                            <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors cursor-default">
                              {node.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                        <Network className="w-8 h-8 mb-2" />
                        <p className="text-[10px]">尚未构建框架<br/>点击上方按钮由 AI 分析</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Selection Floating Action */}
            {selectedText && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-800 rounded-full shadow-2xl p-1 flex items-center gap-1 animate-in fade-in zoom-in duration-200 z-50">
                <div className="px-4 py-1.5 max-w-[200px] truncate text-[10px] text-slate-400 border-r border-slate-800">
                  &quot;{selectedText}&quot;
                </div>
                <button 
                  onClick={handleCreateMemoryFromSelection}
                  disabled={isCreatingMemory}
                  className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-[10px] font-bold transition-all disabled:opacity-50"
                >
                  {isCreatingMemory ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                  摘抄至记忆库
                </button>
                <button 
                  onClick={() => setSelectedText('')}
                  className="p-1.5 hover:bg-slate-800 text-slate-500 rounded-full transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
            <BookOpen className="w-16 h-16 mb-4 opacity-10" />
            <p className="text-sm font-medium opacity-40">请从左侧选择一本课本开始学习</p>
          </div>
        )}
      </div>
    </div>
  );
}
