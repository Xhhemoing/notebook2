'use client';

import React, { createContext, useContext } from 'react';
import { useChat, type UseChatHelpers } from '@ai-sdk/react';
import { DefaultChatTransport, type FileUIPart, type UIMessage } from 'ai';
import { useAppContext } from './store';
import { v4 as uuidv4 } from 'uuid';
import { createMemoryPayload } from './data/commands';

type GlobalAIChatContextType = UseChatHelpers<UIMessage> & {
  startMistakeAnalysis: (images: string[]) => void;
  startGraphAnalysis: (text: string, images?: string[]) => void;
  clearChat: () => void;
};

const GlobalAIChatContext = createContext<GlobalAIChatContextType | null>(null);

function toFilePart(image: string): FileUIPart {
  const mediaType = image.match(/^data:([^;]+);/)?.[1] || 'image/jpeg';
  return {
    type: 'file',
    url: image,
    mediaType,
  };
}

export function GlobalAIChatProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useAppContext();

  const chat = useChat<UIMessage>({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
    onToolCall({ toolCall }) {
      const toolInput = 'input' in toolCall ? toolCall.input as any : undefined;

      if (toolCall.toolName === 'proposeGraphChanges') {
        const { changes, analysis } = toolInput || {};
        console.log('Got graph changes tool call:', changes);

        const operations = (changes || []).map((change: any) => {
          if (change.action === 'ADD_NODE') {
            return { action: 'add', name: change.targetName, parentId: null };
          }
          if (change.action === 'ADD_RELATION') {
            return { action: 'move', nodeId: change.targetName, parentId: null };
          }
          return null;
        }).filter(Boolean);

        dispatch({
          type: 'UPDATE_DRAFT',
          payload: {
            draftGraphProposal: { reasoning: analysis || '', operations },
          },
        });
      } else if (toolCall.toolName === 'storeMistake') {
        const payload = toolInput || {};

        const memoryResult = createMemoryPayload({
          id: uuidv4(),
          subject: state.currentSubject,
          content: payload.originalQuestion || 'Unknown Question',
          sourceType: 'image',
          functionType: '错题收录',
          purposeType: '记忆型',
          knowledgeNodeIds: [],
          confidence: 0,
          mastery: 0,
          createdAt: Date.now(),
          isMistake: true,
          wrongAnswer: payload.studentAnswer,
          correctAnswer: payload.correctAnswer,
          errorReason: payload.explanation,
          visualDescription: payload.coreConcept,
          dataSource: 'mistake_analysis'
        });

        if (memoryResult.ok) {
          dispatch({ type: 'ADD_MEMORY', payload: memoryResult.value });
          console.log('Mistake memory added via AI tool call.');
        } else {
          console.warn('Failed to store mistake memory:', memoryResult.error);
        }
      }
    },
  });

  const startMistakeAnalysis = (images: string[]) => {
    void chat.sendMessage({
      text: '请分析这张错题截图，提取原题、我的错误答案、正确答案，并指出核心概念和错因。完成分析后请自动调用 storeMistake 工具保存；如果有图谱建议，也请调用 proposeGraphChanges。',
      files: images.map(toFilePart),
    });
  };

  const startGraphAnalysis = (text: string, images?: string[]) => {
    void chat.sendMessage({
      text: `请根据以下资料更新我的知识图谱：${text}`,
      files: images?.map(toFilePart),
    });
  };

  const clearChat = () => {
    chat.setMessages([]);
  };

  return (
    <GlobalAIChatContext.Provider value={{ ...chat, startMistakeAnalysis, startGraphAnalysis, clearChat }}>
      {children}
    </GlobalAIChatContext.Provider>
  );
}

export function useGlobalAIChat() {
  const ctx = useContext(GlobalAIChatContext);
  if (!ctx) throw new Error('useGlobalAIChat must be used within GlobalAIChatProvider');
  return ctx;
}
