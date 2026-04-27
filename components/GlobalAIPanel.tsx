'use client';

import React, { useState } from 'react';
import { useGlobalAIChat } from '../lib/ai-chat-context';
import { Bot, X, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import type { UIMessage } from 'ai';

type TextLikePart = {
  type: string;
  text?: string;
};

type ToolLikePart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  state?: string;
};

function getMessageParts(message?: UIMessage) {
  return Array.isArray(message?.parts) ? message.parts : [];
}

function getMessageText(message?: UIMessage) {
  return getMessageParts(message)
    .filter((part) => part.type === 'text')
    .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
    .join('');
}

function getToolParts(message: UIMessage): ToolLikePart[] {
  return getMessageParts(message)
    .filter((part) => typeof part.type === 'string' && (part.type === 'dynamic-tool' || part.type.startsWith('tool-')))
    .map((part) => part as ToolLikePart);
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
        className={`fixed bottom-6 right-6 z-50 flex flex-col ${expanded ? 'h-[600px] max-h-[80vh] w-96' : 'w-80'}`}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-indigo-500/30 bg-slate-900 shadow-2xl backdrop-blur-xl">
          <div
            className="flex cursor-pointer items-center justify-between border-b border-indigo-500/20 bg-indigo-500/10 p-3"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex items-center gap-2">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
              ) : (
                <Bot className="h-4 w-4 text-indigo-400" />
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
                className="rounded p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                title={expanded ? '最小化' : '展开'}
              >
                {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  if (isLoading) void stop();
                  clearChat();
                }}
                className="rounded p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-red-400"
                title="关闭并清空"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto p-4 text-sm text-slate-300">
            {showSummary ? (
              <div className="prose prose-invert prose-sm line-clamp-3 text-slate-300">
                {isLoading ? <span className="animate-pulse">正在分析中...</span> : null}
                <Markdown>{getMessageText(lastMessage)}</Markdown>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 ${
                        message.role === 'user'
                          ? 'rounded-tr-none border border-indigo-500/30 bg-indigo-600/30 text-indigo-100'
                          : 'rounded-tl-none border border-slate-700/50 bg-slate-800/50 text-slate-200'
                      }`}
                    >
                      <div className="prose prose-invert prose-sm max-w-none">
                        <Markdown>{getMessageText(message)}</Markdown>
                      </div>

                      {getToolParts(message).map((toolPart) => (
                        <div
                          key={toolPart.toolCallId || toolPart.type}
                          className="mt-2 rounded-lg border border-indigo-500/20 bg-indigo-900/30 p-2 text-xs font-mono"
                        >
                          <div className="mb-1 font-bold text-indigo-300">
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
                  <div className="flex items-center gap-2 py-2 text-indigo-400/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" />
                  </div>
                )}
              </div>
            )}
          </div>

          {isLoading && expanded && (
            <div className="border-t border-indigo-500/10 bg-indigo-900/20 p-2 text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400/70">
                Streaming Response...
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
