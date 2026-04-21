'use client';

import { useState, useRef, useEffect } from 'react';
import { useAppContext } from '@/lib/store';
import { chatWithAI, searchMemoriesRAG, reorganizeMemories, extractMemoryFromChat, generateGatewaySummary } from '@/lib/ai';
import { Send, Bot, User, Loader2, X, Image as ImageIcon, UploadCloud, Search, Sparkles, Database, RefreshCw, Wand2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { clsx } from 'clsx';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { v4 as uuidv4 } from 'uuid';
import { ModelSelector } from '@/components/ModelSelector';
import { createMemoryPayload } from '@/lib/data/commands';
import { getAutoExpireAt } from '@/lib/feedback';

import { TextbookPagePreview } from './TextbookPagePreview';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  image?: string;
  feedback?: 'helpful' | 'inaccurate';
}

function renderMessageContent(content: string) {
  const parts = content.split(/(\[TEXTBOOK_PAGE:[^\]]+\])/g);
  return parts.map((part, index) => {
    const match = part.match(/\[TEXTBOOK_PAGE:([^:]+):(\d+)\]/);
    if (match) {
      const textbookId = match[1];
      const pageNumber = parseInt(match[2], 10);
      return <TextbookPagePreview key={index} textbookId={textbookId} pageNumber={pageNumber} />;
    }
    return <Markdown key={index} remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{part}</Markdown>;
  });
}

export function AIChat() {
  const { state, dispatch } = useAppContext();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'ai', content: `你好！我是你的${state.currentSubject} AI辅导老师。有什么问题可以随时问我，我会结合你的记忆库为你解答。` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ragStatus, setRagStatus] = useState<string | null>(null);
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [imageResourceId, setImageResourceId] = useState<string | null>(null);
  const [showMemorySelector, setShowMemorySelector] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [enableRAG, setEnableRAG] = useState(true);
  const [isReorganizing, setIsReorganizing] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [selectedModel, setSelectedModel] = useState(state.settings.chatModel);

  const addFeedback = (
    targetId: string,
    signalType: 'chat_helpful' | 'chat_inaccurate',
    note?: string
  ) => {
    dispatch({
      type: 'ADD_FEEDBACK_EVENT',
      payload: {
        id: uuidv4(),
        timestamp: Date.now(),
        subject: state.currentSubject,
        targetType: 'chat',
        targetId,
        signalType,
        sentiment: signalType === 'chat_helpful' ? 'positive' : 'negative',
        note,
        metadata: {
          workflow: 'chat',
          model: selectedModel,
        },
      },
    });
  };

  const markMessageFeedback = (messageId: string, feedback: 'helpful' | 'inaccurate') => {
    const current = messages.find((message) => message.id === messageId);
    if (current?.feedback === feedback) return;

    setMessages((previous) =>
      previous.map((message) => (message.id === messageId ? { ...message, feedback } : message))
    );
    addFeedback(messageId, feedback === 'helpful' ? 'chat_helpful' : 'chat_inaccurate');
  };

  // Sync selectedModel if default changes
  useEffect(() => {
    setSelectedModel(state.settings.chatModel);
  }, [state.settings.chatModel]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const SKILLS = [
    { id: 'explain', name: '费曼技巧讲解', prompt: '请用费曼技巧，像教给5岁小孩一样向我解释这个概念：' },
    { id: 'quiz', name: '出题测试', prompt: '请根据我们刚才的讨论，出3道选择题考考我。' },
    { id: 'summarize', name: '总结提炼', prompt: '请将我们今天的讨论总结为3个核心记忆点。' },
    { id: 'extract', name: '提取记忆', prompt: '请从我们刚才的对话中，提取出我需要记住的知识点或错题，并直接告诉我。' },
    { id: 'vocab_summary', name: '词汇归纳 (Gateway)', prompt: '请帮我把记忆库中的英语生词、同义词、熟词生义进行一次系统的归纳和串联讲解。', isGateway: true, gatewayType: 'vocabulary' as const },
    { id: 'qa_summary', name: '题型总结 (Gateway)', prompt: '请帮我总结当前科目记忆库中的常见题型、高频考点和解题套路。', isGateway: true, gatewayType: 'question_types' as const },
    { id: 'error_analysis', name: '错因分析 (Gateway)', prompt: '请帮我深度分析当前科目记忆库中的错题，找出我的认知盲区和常见失误。', isGateway: true, gatewayType: 'error_analysis' as const },
    { id: 'concept_connection', name: '考点串联 (Gateway)', prompt: '请帮我把当前科目记忆库中的零散知识点串联起来，构建宏观知识脉络。', isGateway: true, gatewayType: 'knowledge_connection' as const }
  ];
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset chat when subject changes
  useEffect(() => {
    setMessages([
      { id: Date.now().toString(), role: 'ai', content: `你好！我是你的${state.currentSubject} AI辅导老师。有什么问题可以随时问我，我会结合你的记忆库为你解答。` }
    ]);
  }, [state.currentSubject]);

  const handleSend = async () => {
    if ((!input.trim() && !image) || loading) return;

    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: input,
      image: image || undefined
    };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    const currentImage = image;
    const currentImageResourceId = imageResourceId;
    const currentSelectedMemories = selectedMemoryIds;
    
    setInput('');
    setImage(null);
    setImageResourceId(null);
    setSelectedMemoryIds([]);
    setLoading(true);

    try {
      let ragMemories: any[] = [];
      if (enableRAG) {
        setRagStatus('正在检索个人记忆库...');
        const subjectMemories = state.memories.filter(m => m.subject === state.currentSubject);
        ragMemories = await searchMemoriesRAG(currentInput, subjectMemories, state.settings, 5, currentImage || undefined);
        
        if (ragMemories.length > 0) {
          setRagStatus(`已找到 ${ragMemories.length} 条相关记忆，正在生成回答...`);
        } else {
          setRagStatus('未找到相关记忆，正在生成回答...');
        }
      }

      // Combine with explicitly selected memories
      const explicitlySelected = state.memories.filter(m => currentSelectedMemories.includes(m.id));
      
      // Merge and deduplicate
      const finalContextMemories = Array.from(new Set([...explicitlySelected, ...ragMemories]));

      const response = await chatWithAI(
        currentInput, 
        state.currentSubject, 
        finalContextMemories, 
        state.knowledgeNodes, 
        { ...state.settings, chatModel: selectedModel }, 
        state.textbooks,
        currentImage || undefined, 
        (log) => {
          if (state.settings.enableLogging) {
            dispatch({
              type: 'ADD_LOG',
              payload: {
                ...log,
                subject: state.currentSubject,
                workflow: 'chat',
                resourceIds: currentImageResourceId ? [currentImageResourceId] : undefined,
                metadata: {
                  selectedMemoryCount: currentSelectedMemories.length,
                  ragEnabled: enableRAG,
                },
              }
            });
          }
        },
        state.memories // Pass all memories for the tool
      );
      
      const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'ai', content: response };
      setMessages(prev => [...prev, aiMsg]);

      // Background memory extraction
      extractMemoryFromChat(currentInput, response, state.currentSubject, state.settings)
        .then(memory => {
          if (memory) {
            const memoryResult = createMemoryPayload({
              ...memory,
              dataSource: 'ai_chat',
              sourceResourceIds: currentImageResourceId ? [currentImageResourceId] : undefined,
            });
            if (memoryResult.ok) {
              dispatch({ type: 'ADD_MEMORY', payload: memoryResult.value });
            }
            // Optional: notify user or just silently add
          }
        })
        .catch(err => console.error('Memory extraction failed:', err));

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: '抱歉，网络出现问题，请稍后再试。' }]);
    } finally {
      setLoading(false);
      setRagStatus(null);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImage(base64);
        const resourceId = uuidv4();
        setImageResourceId(resourceId);
        
        // Auto-archive to Resource Library
        dispatch({
          type: 'ADD_RESOURCE',
          payload: {
            id: resourceId,
            name: file.name,
            type: file.type || 'unknown',
            size: file.size,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            data: base64,
            subject: state.currentSubject,
            origin: 'chat_upload',
            retentionPolicy: 'auto',
            expiresAt: getAutoExpireAt(state.settings.resourceAutoCleanupDays || 21),
            tags: ['chat', 'conversation-image'],
            isFolder: false,
            parentId: null
          }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImage(base64);
        const resourceId = uuidv4();
        setImageResourceId(resourceId);
        
        // Auto-archive to Resource Library
        dispatch({
          type: 'ADD_RESOURCE',
          payload: {
            id: resourceId,
            name: file.name,
            type: file.type || 'unknown',
            size: file.size,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            data: base64,
            subject: state.currentSubject,
            origin: 'chat_upload',
            retentionPolicy: 'auto',
            expiresAt: getAutoExpireAt(state.settings.resourceAutoCleanupDays || 21),
            tags: ['chat', 'conversation-image'],
            isFolder: false,
            parentId: null
          }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReorganize = async () => {
    if (isReorganizing) return;
    setIsReorganizing(true);
    try {
      const subjectMemories = state.memories.filter(m => m.subject === state.currentSubject);
      const operations = await reorganizeMemories(state.settings, state.currentSubject, subjectMemories);
      if (operations.length === 0) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: '✨ 记忆库已经非常整洁，无需进一步整理。' }]);
      } else {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: `🧠 AI 已完成记忆库分析，建议进行以下调整：\n\n${operations.map(op => {
          const action = op.action || op.type || 'unknown';
          let preview = '';
          if (action === 'merge') preview = op.newMemory?.content || '';
          else if (action === 'split') preview = op.newMemories?.[0]?.content || '';
          else if (action === 'update') preview = op.updates?.content || op.memoryId || '';
          else preview = op.content || '';
          return `- **${(action || '').toUpperCase()}**: ${preview.substring(0, 50)}...`;
        }).join('\n')}\n\n(手动整理功能正在完善中)` }]);
      }
    } catch (error) {
      console.error('Reorganize error:', error);
    } finally {
      setIsReorganizing(false);
    }
  };

  const memories = state.memories.filter(m => m.subject === state.currentSubject);

  return (
    <div className="flex flex-col h-full w-full p-0 sm:p-2 text-slate-200 overflow-hidden">
      <div className="flex-1 bg-slate-950 border-x sm:border border-slate-900 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Chat Header */}
        <div className="px-5 py-3 border-b border-slate-900 bg-slate-950/50 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <Bot className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 tracking-tight uppercase">AI TUTOR ({state.currentSubject})</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <div className={clsx("w-1.5 h-1.5 rounded-full animate-pulse", enableRAG ? "bg-green-500" : "bg-slate-700")} />
                <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">
                  {enableRAG ? 'Multimodal RAG Active' : 'RAG Disabled'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleReorganize}
              disabled={isReorganizing}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border border-slate-800 hover:border-purple-500/50 rounded-lg transition-all group"
              title="AI 整理当前学科记忆"
            >
              {isReorganizing ? <RefreshCw className="w-3 h-3 animate-spin text-purple-400" /> : <Wand2 className="w-3 h-3 text-purple-400 group-hover:scale-110 transition-transform" />}
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">AI RE-ORG</span>
            </button>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border border-slate-800 rounded-lg">
              <Sparkles className="w-3 h-3 text-blue-400" />
              <ModelSelector
                value={selectedModel}
                onChange={setSelectedModel}
                className="bg-transparent border-none text-[10px] font-black text-slate-400 uppercase tracking-widest outline-none"
              />
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {messages.map((msg) => (
            <div key={msg.id} className={clsx('flex gap-3 group', msg.role === 'user' ? 'flex-row-reverse' : '')}>
              <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300',
                msg.role === 'user' 
                  ? 'bg-slate-900 border-slate-800 group-hover:border-slate-700' 
                  : 'bg-indigo-500/10 border-indigo-500/20 group-hover:border-indigo-500/40'
              )}>
                {msg.role === 'user' ? <User className="w-4 h-4 text-slate-300" /> : <Bot className="w-4 h-4 text-indigo-500" />}
              </div>
              <div className={clsx(
                'max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-lg transition-all duration-300',
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-900/20' 
                  : 'bg-slate-900 text-slate-200 rounded-tl-none border border-slate-800 shadow-black/40'
              )}>
                {msg.image && (
                  <div className="mb-3 rounded-lg overflow-hidden border border-white/10 group/img relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={msg.image} alt="User upload" className="max-w-full h-auto max-h-80 object-contain" />
                  </div>
                )}
                <div className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-strong:text-blue-300 prose-code:text-blue-200 prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 text-sm">
                  {renderMessageContent(msg.content)}
                </div>
                {msg.role === 'ai' && (
                  <div className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
                    <span>反馈</span>
                    <button
                      onClick={() => markMessageFeedback(msg.id, 'helpful')}
                      className={clsx(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-1 transition-colors',
                        msg.feedback === 'helpful'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                          : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600'
                      )}
                    >
                      <ThumbsUp className="h-3 w-3" />
                      有帮助
                    </button>
                    <button
                      onClick={() => markMessageFeedback(msg.id, 'inaccurate')}
                      className={clsx(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-1 transition-colors',
                        msg.feedback === 'inaccurate'
                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                          : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600'
                      )}
                    >
                      <ThumbsDown className="h-3 w-3" />
                      不够准
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-4 flex flex-col gap-2 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                  </div>
                  <span className="text-xs text-slate-400 font-medium tracking-wide">
                    {ragStatus || 'AI 正在深度思考中...'}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-black border-t border-slate-900">
          {/* Context Previews */}
          {(selectedMemoryIds.length > 0 || image) && (
            <div className="mb-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2">
              {image && (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-800 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt="Upload preview" className="w-full h-full object-cover" />
                  <button
                    onClick={() => {
                      setImage(null);
                      setImageResourceId(null);
                    }}
                    className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2 h-2" />
                  </button>
                </div>
              )}
              {selectedMemoryIds.map(id => {
                const m = state.memories.find(mem => mem.id === id);
                if (!m) return null;
                return (
                  <div key={id} className="flex items-center gap-2 px-2 py-1 bg-indigo-500/5 text-indigo-400 border border-indigo-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest">
                    <Database className="w-3 h-3" />
                    <span className="max-w-[100px] truncate">{m.content.substring(0, 15)}...</span>
                    <button onClick={() => setSelectedMemoryIds(prev => prev.filter(mid => mid !== id))} className="hover:text-blue-300">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={clsx(
              "relative flex flex-col gap-2 p-2 bg-slate-900/50 border rounded-xl transition-all duration-300 group/input",
              isDragging ? "border-indigo-500 bg-indigo-500/5 scale-[1.01]" : "border-slate-800 hover:border-slate-700"
            )}
          >
            <div className="flex items-center gap-1">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
                title="上传图片"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              
              <div className="relative">
                <button
                  onClick={() => setShowMemorySelector(!showMemorySelector)}
                  className={clsx(
                    "p-2 transition-all rounded-lg",
                    showMemorySelector ? "text-indigo-500 bg-indigo-500/10" : "text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10"
                  )}
                  title="手动选择记忆作为上下文"
                >
                  <Database className="w-4 h-4" />
                </button>
                
                {showMemorySelector && (
                  <div className="absolute bottom-full left-0 mb-3 w-72 bg-slate-950 border border-slate-800 shadow-2xl rounded-xl p-3 z-50 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">SELECT MEMORIES ({memories.length})</span>
                      <button onClick={() => setShowMemorySelector(false)}><X className="w-3 h-3 text-slate-500 hover:text-slate-300" /></button>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                      {memories.length === 0 ? (
                        <p className="text-[10px] text-slate-600 text-center py-6 italic uppercase tracking-widest">No memories found</p>
                      ) : (
                        memories.map(m => (
                          <button
                            key={m.id}
                            onClick={() => {
                              if (selectedMemoryIds.includes(m.id)) {
                                setSelectedMemoryIds(prev => prev.filter(id => id !== m.id));
                              } else {
                                setSelectedMemoryIds(prev => [...prev, m.id]);
                              }
                            }}
                            className={clsx(
                              "w-full text-left p-2 rounded-lg text-[10px] transition-all line-clamp-2 border",
                              selectedMemoryIds.includes(m.id) 
                                ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 font-bold" 
                                : "hover:bg-slate-900 text-slate-400 border-transparent"
                            )}
                          >
                            {m.content}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setEnableRAG(!enableRAG)}
                className={clsx(
                  "p-2 transition-all rounded-lg",
                  enableRAG ? "text-green-500 bg-green-500/10" : "text-slate-500 hover:text-slate-400 hover:bg-slate-800"
                )}
                title={enableRAG ? "RAG 已启用" : "RAG 已禁用"}
              >
                <Search className="w-4 h-4" />
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowSkills(!showSkills)}
                  className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all rounded-lg"
                  title="AI 技能"
                >
                  <Wand2 className="w-4 h-4" />
                </button>
                {showSkills && (
                  <div className="absolute bottom-full left-0 mb-3 w-48 bg-slate-950 border border-slate-800 shadow-2xl rounded-xl p-2 z-50 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">AI SKILLS</span>
                      <button onClick={() => setShowSkills(false)}><X className="w-3 h-3 text-slate-500 hover:text-slate-300" /></button>
                    </div>
                    <div className="space-y-1">
                      {SKILLS.map(skill => (
                        <button
                          key={skill.id}
                          onClick={async () => {
                            setShowSkills(false);
                            if (skill.isGateway) {
                              const userMsg: Message = { 
                                id: Date.now().toString(), 
                                role: 'user', 
                                content: skill.prompt,
                              };
                              setMessages(prev => [...prev, userMsg]);
                              setLoading(true);
                              setRagStatus('正在启动 AI Gateway 全局数据分析...');
                              
                              try {
                                const response = await generateGatewaySummary(
                                  state.currentSubject,
                                  state.memories,
                                  skill.gatewayType,
                                  state.settings,
                                  (log) => {
                                    if (state.settings.enableLogging) {
                                      dispatch({
                                        type: 'ADD_LOG',
                                        payload: {
                                          ...log,
                                          subject: state.currentSubject,
                                          workflow: 'chat',
                                          metadata: {
                                            gatewayType: skill.gatewayType,
                                          },
                                        }
                                      });
                                    }
                                  }
                                );
                                const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'ai', content: response };
                                setMessages(prev => [...prev, aiMsg]);
                              } catch (error) {
                                console.error('Gateway error:', error);
                                setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: '抱歉，网关分析失败，请稍后再试。' }]);
                              } finally {
                                setLoading(false);
                                setRagStatus(null);
                              }
                            } else {
                              setInput(prev => prev + (prev ? '\n' : '') + skill.prompt);
                            }
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors"
                        >
                          {skill.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={isDragging ? "DROP IMAGE..." : "ASK ANYTHING..."}
                className="flex-1 bg-transparent border-none outline-none text-xs text-slate-200 placeholder:text-slate-700 py-1.5 px-2"
              />
              
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !image) || loading}
                className="p-2 bg-indigo-600 text-white rounded-lg disabled:opacity-20 disabled:grayscale transition-all hover:bg-indigo-500 active:scale-95 shadow-lg"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="mt-3 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-700 uppercase tracking-widest">
              <Database className="w-2.5 h-2.5" />
              <span>RAG {enableRAG ? 'ON' : 'OFF'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-700 uppercase tracking-widest">
              <UploadCloud className="w-2.5 h-2.5" />
              <span>SYNC ACTIVE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
