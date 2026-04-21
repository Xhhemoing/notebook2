'use client';

import React, { useState } from 'react';
import { useGlobalAIChat } from '../lib/ai-chat-context';
import { Bot, X, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import type { UIMessage } from 'ai';

type ToolLikePart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  state?: string;
};

function getMessageText(message?: UIMessage) {
  return message?.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('') || '';
}

function getToolParts(message: UIMessage): ToolLikePart[] {
  return message.parts
    .filter(part => part.type === 'dynamic-tool' || part.type.startsWith('tool-'))
    .map(part => part as ToolLikePart);
}

export function GlobalAIPanel() {
  const { messages, status, clearChat, stop } = useGlobalAIChat();
  const [expanded, setExpanded] = useState(false);
  const isLoading = status === 'submitted' || status === 'streaming';

  if (messages.length === 0 && !isLoading) return null;

  const lastMessage = messages[messages.length - 1];
  const isAI = lastMessage?.role === 'assistant';
  const showSummary = !expanded && messages.length > 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.9 }}
        className={`fixed bottom-6 right-6 z-50 flex flex-col ${expanded ? 'w-96 h-[600px] max-h-[80vh]' : 'w-80'}`}
      >
        <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden backdrop-blur-xl">
          <div className="flex items-center justify-between p-3 border-b border-indigo-500/20 bg-indigo-500/10 cursor-pointer" onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-2">
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              ) : (
                <Bot className="w-4 h-4 text-indigo-400" />
              )}
              <span className="text-sm font-semibold text-indigo-100">
                {isAI ? 'AI 推理引擎' : 'AI 工作台'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                title={expanded ? '最小化' : '展开'}
              >
                {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  if (isLoading) void stop();
                  clearChat();
                }}
                className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-red-400 transition-colors"
                title="关闭并清空"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar text-sm text-slate-300">
            {showSummary ? (
              <div className="line-clamp-3 text-slate-300 prose prose-invert prose-sm">
                {isLoading ? <span className="animate-pulse">正在分析中...</span> : null}
                <Markdown>{getMessageText(lastMessage)}</Markdown>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((message) => (
                  <div key={message.id} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`px-3 py-2 rounded-xl max-w-[85%] ${
                      message.role === 'user'
                        ? 'bg-indigo-600/30 border border-indigo-500/30 text-indigo-100 rounded-tr-none'
                        : 'bg-slate-800/50 border border-slate-700/50 text-slate-200 rounded-tl-none'
                    }`}>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <Markdown>{getMessageText(message)}</Markdown>
                      </div>

                      {getToolParts(message).map((toolPart) => (
                        <div key={toolPart.toolCallId || toolPart.type} className="mt-2 p-2 bg-indigo-900/30 border border-indigo-500/20 rounded-lg text-xs font-mono">
                          <div className="text-indigo-300 font-bold mb-1">
                            正在调用工具: {toolPart.toolName || toolPart.type.replace(/^tool-/, '')}
                          </div>
                          <pre className="overflow-x-auto text-[10px] text-indigo-200/70">
                            {JSON.stringify({ state: toolPart.state, input: toolPart.input }, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-center gap-2 text-indigo-400/70 py-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
                  </div>
                )}
              </div>
            )}
          </div>

          {isLoading && expanded && (
            <div className="bg-indigo-900/20 p-2 text-center border-t border-indigo-500/10">
              <span className="text-[10px] text-indigo-400/70 uppercase tracking-widest font-bold">STREAMING RESPONSE...</span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
