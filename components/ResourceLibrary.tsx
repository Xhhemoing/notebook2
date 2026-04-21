'use client';

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useAppContext } from '@/lib/store';
import { Database, UploadCloud, FileText, Image as ImageIcon, File as GenericFile, Trash2, Download, Search, HardDrive, Folder, ChevronRight, FolderPlus, AlertTriangle, ShieldAlert, Pin, PinOff, Zap } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Resource } from '@/lib/types';
import { clsx } from 'clsx';
import { parsePDF, parseDocx } from '@/lib/file-parsers';
import { createMemoryPayload } from '@/lib/data/commands';

async function processFile(file: File, parentId: string | null, dispatch: any, subject: string, existingResources: Resource[]) {
  // Check for duplicates in the current folder
  const isDuplicate = existingResources.some(
    r => r.parentId === parentId && r.name === file.name && !r.isFolder
  );
  
  if (isDuplicate) {
    console.log(`File ${file.name} ignored because it already exists.`);
    return; // Skip duplicate
  }

  const reader = new FileReader();
  reader.onloadend = () => {
    const newResource: Resource = {
      id: uuidv4(),
      name: file.name,
      type: file.type || 'unknown',
      size: file.size,
      createdAt: Date.now(),
      data: reader.result as string,
      subject: subject,
      origin: 'manual',
      retentionPolicy: 'manual',
      isFolder: false,
      parentId: parentId
    };
    dispatch({ type: 'ADD_RESOURCE', payload: newResource });
  };
  reader.readAsDataURL(file);
}

async function traverseFileTree(item: any, parentId: string | null, dispatch: any, subject: string, existingResources: Resource[]) {
  if (item.isFile) {
    item.file((file: File) => {
      processFile(file, parentId, dispatch, subject, existingResources);
    });
  } else if (item.isDirectory) {
    // Check if folder already exists
    let folderInfo = existingResources.find(r => r.parentId === parentId && r.name === item.name && r.isFolder);
    let folderId = folderInfo?.id;

    if (!folderInfo) {
      folderId = uuidv4();
      const newFolder: Resource = {
        id: folderId,
        name: item.name,
        type: 'folder',
        size: 0,
        createdAt: Date.now(),
        subject: subject,
        origin: 'manual',
        retentionPolicy: 'manual',
        isFolder: true,
        parentId: parentId
      };
      dispatch({ type: 'ADD_RESOURCE', payload: newFolder });
      // Update our temporary list so subsequent sub-files know about it
      existingResources.push(newFolder);
    }
    
    // Read the directory contents
    const dirReader = item.createReader();
    const readEntries = async () => {
      dirReader.readEntries(async (entries: any[]) => {
        if (entries.length > 0) {
          for (let i = 0; i < entries.length; i++) {
            await traverseFileTree(entries[i], folderId || null, dispatch, subject, existingResources);
          }
          await readEntries(); // Continue reading because readEntries might not return all at once
        }
      });
    };
    await readEntries();
  }
}

export function ResourceLibrary() {
  const { state, dispatch } = useAppContext();
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean, title: string, message: string, type: 'alert' | 'confirm' | 'prompt', onConfirm?: (value?: string) => void, inputValue?: string }>({ isOpen: false, title: '', message: '', type: 'alert' });
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});

  const handleProcessForRAG = async (resource: Resource) => {
    setIsProcessing(prev => ({ ...prev, [resource.id]: true }));
    try {
      if (!resource.data) throw new Error('File has no data.');
      let textContent = '';
      
      const isPdf = resource.type === 'application/pdf' || resource.name.endsWith('.pdf');
      const isDocx = resource.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || resource.name.endsWith('.docx');
      
      const res = await fetch(resource.data);
      const blob = await res.blob();
      const file = new File([blob], resource.name, { type: resource.type });

      if (isPdf) {
        const pages = await parsePDF(file);
        textContent = pages.map(p => p.textContent).join('\n\n');
      } else if (isDocx) {
        const data = await parseDocx(file);
        textContent = data.content;
      } else if (resource.type.startsWith('text/') || resource.name.endsWith('.txt') || resource.name.endsWith('.md')) {
        textContent = await file.text();
      } else {
        throw new Error('不支持的文件类型');
      }

      if (!textContent.trim()) {
        throw new Error('解析的文本为空');
      }

      const chunkSize = 500;
      for (let i = 0; i < textContent.length; i += chunkSize) {
        const chunk = textContent.slice(i, i + chunkSize);
        const memPayload = createMemoryPayload({
          id: uuidv4(),
          subject: resource.subject,
          content: chunk,
          functionType: 'Resource Content',
          purposeType: '内化型',
          createdAt: Date.now(),
          sourceType: 'text',
          dataSource: 'manual',
          notes: `来自文件: ${resource.name}`,
          sourceResourceIds: [resource.id]
        });
        if (memPayload.ok) {
          dispatch({ type: 'ADD_MEMORY', payload: memPayload.value });
        }
      }

      showAlert('处理完成', `成功为 ${resource.name} 生成 ${Math.ceil(textContent.length / chunkSize)} 条 RAG 记忆。`);

    } catch (err: any) {
      showAlert('处理失败', err.message);
    } finally {
      setIsProcessing(prev => ({ ...prev, [resource.id]: false }));
    }
  };

  const showAlert = (title: string, message: string) => {
    setModalConfig({ isOpen: true, title, message, type: 'alert' });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalConfig({ isOpen: true, title, message, type: 'confirm', onConfirm });
  };

  const showPrompt = (title: string, message: string, onConfirm: (value?: string) => void) => {
    setModalConfig({ isOpen: true, title, message, type: 'prompt', onConfirm, inputValue: '' });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const items = e.dataTransfer.items;
    if (items) {
      const existingResources = [...(state.resources || [])];
      for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) {
          await traverseFileTree(item, currentFolderId, dispatch, state.currentSubject, existingResources);
        }
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const existingResources = [...(state.resources || [])];
      for (const file of files) {
        await processFile(file, currentFolderId, dispatch, state.currentSubject, existingResources);
        // Note: processFile doesn't mutate existingResources immediately due to async read, 
        // but it prevents duplicate file names in the existing snapshot. 
      }
    }
  };

  const handleCreateFolder = () => {
    showPrompt('新建文件夹', '请输入文件夹名称：', (name) => {
      if (name) {
        const newFolder: Resource = {
          id: uuidv4(),
          name: name,
          type: 'folder',
          size: 0,
          createdAt: Date.now(),
          subject: state.currentSubject,
          origin: 'manual',
          retentionPolicy: 'manual',
          isFolder: true,
          parentId: currentFolderId
        };
        dispatch({ type: 'ADD_RESOURCE', payload: newFolder });
      }
    });
  };

  const handleDelete = (id: string, isFolder?: boolean) => {
    showConfirm('删除确认', `确定要删除这个${isFolder ? '文件夹及其所有内容' : '文件'}吗？`, () => {
      if (isFolder) {
        // Recursively delete children
        const deleteRecursively = (parentId: string) => {
          const children = (state.resources || []).filter(r => r.parentId === parentId);
          children.forEach(child => {
            if (child.isFolder) deleteRecursively(child.id);
            dispatch({ type: 'DELETE_RESOURCE', payload: child.id });
          });
        };
        deleteRecursively(id);
      }
      dispatch({ type: 'DELETE_RESOURCE', payload: id });
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string, isFolder?: boolean) => {
    if (isFolder) return <Folder className="w-10 h-10 text-amber-400" fill="currentColor" fillOpacity={0.2} />;
    if (type.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-emerald-400" />;
    if (type.includes('pdf')) return <FileText className="w-8 h-8 text-rose-400" />;
    return <GenericFile className="w-8 h-8 text-indigo-400" />;
  };

  const currentResources = useMemo(() => {
    let filtered = (state.resources || []).filter(r => r.subject === state.currentSubject);
    
    if (searchQuery) {
      return filtered.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    
    return filtered.filter(r => r.parentId === currentFolderId || (!r.parentId && !currentFolderId));
  }, [state.resources, state.currentSubject, currentFolderId, searchQuery]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [];
    let currentId = currentFolderId;
    while (currentId) {
      const folder = (state.resources || []).find(r => r.id === currentId);
      if (folder) {
        crumbs.unshift(folder);
        currentId = folder.parentId || null;
      } else {
        break;
      }
    }
    return crumbs;
  }, [currentFolderId, state.resources]);

  return (
    <div className="flex h-full bg-[#1e1e1e] text-slate-200">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-800 flex flex-col bg-[#1e1e1e]">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="搜索资源..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#252526] border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button 
            onClick={() => { setCurrentFolderId(null); setSearchQuery(''); }}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              !currentFolderId && !searchQuery ? "bg-teal-500/20 text-teal-400" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"
            )}
          >
            <Database className="w-4 h-4" />
            全部文件
          </button>
          {/* Add more sidebar items here if needed (e.g., Recent, Favorites) */}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 py-4 border-b border-slate-800 flex items-center justify-between bg-[#1e1e1e]">
          <div className="flex items-center gap-2 text-sm font-medium">
            <button 
              onClick={() => setCurrentFolderId(null)}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              根目录
            </button>
            {breadcrumbs.map(crumb => (
              <React.Fragment key={crumb.id}>
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <button 
                  onClick={() => setCurrentFolderId(crumb.id)}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateFolder}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#252526] hover:bg-slate-800 text-slate-300 rounded-lg text-sm transition-colors border border-slate-800"
            >
              <FolderPlus className="w-4 h-4" />
              新建文件夹
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-teal-900/20"
            >
              <UploadCloud className="w-4 h-4" />
              上传文件
            </button>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={clsx(
            "flex-1 p-8 overflow-y-auto custom-scrollbar transition-colors",
            isDragging ? "bg-teal-500/5" : "bg-[#1e1e1e]"
          )}
        >
          {currentResources.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
              <div className="w-16 h-16 bg-[#252526] rounded-full flex items-center justify-center border border-slate-800">
                <HardDrive className="w-8 h-8 text-slate-600" />
              </div>
              <p className="text-sm">此文件夹为空，拖拽文件或文件夹到此处上传</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {currentResources.map(resource => (
                <div 
                  key={resource.id} 
                  className="group relative flex flex-col items-center p-4 rounded-xl hover:bg-[#252526] transition-colors cursor-pointer"
                  onDoubleClick={() => resource.isFolder && setCurrentFolderId(resource.id)}
                >
                  <div className="mb-3 relative">
                    {getFileIcon(resource.type, resource.isFolder)}
                  </div>
                  <h3 className="text-xs font-medium text-slate-300 text-center w-full truncate px-2" title={resource.name}>
                    {resource.name}
                  </h3>
                  {!resource.isFolder && (
                    <>
                      <span className="text-[10px] text-slate-500 mt-1">{formatSize(resource.size)}</span>
                      <span className="text-[10px] text-slate-600 mt-1">
                        {resource.retentionPolicy === 'auto' && resource.expiresAt
                          ? `Auto clear ${new Date(resource.expiresAt).toLocaleDateString()}`
                          : resource.pinnedAt
                            ? 'Pinned'
                            : 'Manual keep'}
                      </span>
                    </>
                  )}
                  
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                    {!resource.isFolder && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch({
                            type: 'UPDATE_RESOURCE',
                            payload: {
                              ...resource,
                              retentionPolicy: resource.pinnedAt ? 'auto' : 'keep',
                              pinnedAt: resource.pinnedAt ? undefined : Date.now(),
                            },
                          });
                          dispatch({
                            type: 'ADD_FEEDBACK_EVENT',
                            payload: {
                              id: uuidv4(),
                              timestamp: Date.now(),
                              subject: state.currentSubject,
                              targetType: 'resource',
                              targetId: resource.id,
                              signalType: 'resource_pinned',
                              sentiment: 'positive',
                              note: resource.pinnedAt ? 'Resource unpinned' : 'Resource pinned',
                              metadata: {
                                workflow: resource.origin === 'chat_upload' ? 'chat' : 'quick',
                              },
                            },
                          });
                        }}
                        className="p-1.5 bg-slate-800 text-slate-400 hover:text-amber-300 rounded-md hover:bg-slate-700 transition-colors shadow-lg"
                        title={resource.pinnedAt ? '取消固定' : '固定保留'}
                      >
                        {resource.pinnedAt ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {resource.data && !resource.isFolder && (
                      <>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleProcessForRAG(resource); }}
                          disabled={isProcessing[resource.id]}
                          className={clsx("p-1.5 bg-slate-800 text-slate-400 hover:text-purple-400 rounded-md hover:bg-slate-700 transition-colors shadow-lg", isProcessing[resource.id] && "opacity-50 cursor-not-allowed")}
                          title="提取为 RAG 知识点"
                        >
                          <Zap className={clsx("w-3.5 h-3.5", isProcessing[resource.id] && "animate-pulse")} />
                        </button>
                        <a 
                          href={resource.data} 
                          download={resource.name}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 bg-slate-800 text-slate-400 hover:text-teal-400 rounded-md hover:bg-slate-700 transition-colors shadow-lg"
                          title="下载"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </>
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(resource.id, resource.isFolder); }}
                      className="p-1.5 bg-slate-800 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-700 transition-colors shadow-lg"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Custom Modal */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                {modalConfig.type === 'confirm' ? <AlertTriangle className="w-5 h-5 text-amber-500" /> : <ShieldAlert className="w-5 h-5 text-teal-500" />}
                {modalConfig.title}
              </h3>
              <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed mb-4">
                {modalConfig.message}
              </p>
              {modalConfig.type === 'prompt' && (
                <input
                  type="text"
                  autoFocus
                  value={modalConfig.inputValue || ''}
                  onChange={(e) => setModalConfig({ ...modalConfig, inputValue: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && modalConfig.onConfirm) {
                      modalConfig.onConfirm(modalConfig.inputValue);
                      setModalConfig({ ...modalConfig, isOpen: false });
                    }
                  }}
                />
              )}
            </div>
            <div className="px-6 py-4 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-3">
              {(modalConfig.type === 'confirm' || modalConfig.type === 'prompt') && (
                <button
                  onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}
                  className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                >
                  取消
                </button>
              )}
              <button
                onClick={() => {
                  if (modalConfig.onConfirm) {
                    modalConfig.onConfirm(modalConfig.inputValue);
                  }
                  setModalConfig({ ...modalConfig, isOpen: false });
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
