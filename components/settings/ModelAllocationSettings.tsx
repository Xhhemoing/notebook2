'use client';

import React from 'react';
import { useAppContext } from '@/lib/store';
import { Cpu, Brain, MessageSquare, Network, BookOpen, Languages, Pencil, Search, Zap } from 'lucide-react';

// Task categories with icons and descriptions
const TASK_CONFIGS = [
  {
    key: 'parseModel',
    label: '笔记解析',
    icon: BookOpen,
    description: '用于识别和结构化处理上传的作业、试卷、笔记图片',
    badge: '核心',
    badgeColor: 'indigo',
  },
  {
    key: 'chatModel',
    label: 'AI 答疑对话',
    icon: MessageSquare,
    description: '用于与学生进行深度问答、解题过程讲解',
    badge: '核心',
    badgeColor: 'indigo',
  },
  {
    key: 'graphModel',
    label: '知识图谱生成',
    icon: Network,
    description: '用于分析知识点关联、自动构建和更新知识树',
    badge: '核心',
    badgeColor: 'indigo',
  },
  {
    key: 'reviewModel',
    label: '复习出题',
    icon: Brain,
    description: '用于根据 FSRS 算法生成个性化复习题目',
    badge: '核心',
    badgeColor: 'indigo',
  },
  {
    key: 'summaryModel',
    label: '错题总结与分析',
    icon: Pencil,
    description: '用于生成错题原因分析、个性化错误归纳报告',
    badge: '分析',
    badgeColor: 'amber',
  },
  {
    key: 'translationModel',
    label: '翻译与语言处理',
    icon: Languages,
    description: '用于英语等外语内容的翻译和语言辅助功能',
    badge: '辅助',
    badgeColor: 'emerald',
  },
  {
    key: 'ragModel',
    label: 'RAG 知识检索增强',
    icon: Search,
    description: '用于基于课本和记忆库进行语义搜索与关联召回',
    badge: '检索',
    badgeColor: 'cyan',
  },
  {
    key: 'embeddingModel',
    label: '文本向量化 (Embedding)',
    icon: Zap,
    description: '用于将知识点转换为向量，支撑语义搜索能力',
    badge: '基础',
    badgeColor: 'slate',
    isEmbedding: true,
  },
];

const BADGE_COLORS: Record<string, string> = {
  indigo: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  cyan: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  slate: 'bg-slate-500/10 text-slate-400 border border-slate-600/20',
};

export default function ModelAllocationSettings() {
  const { state, dispatch } = useAppContext();

  const updateSetting = (key: string, value: string) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { [key]: value } });
  };

  const getAllModels = (isEmbedding = false) => {
    const builtInOptions = isEmbedding
      ? [{ value: 'gemini-embedding-2-preview', label: 'Gemini Embedding 2', group: 'Google (内置)' }]
      : [
          { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', group: 'Google (内置)' },
          { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', group: 'Google (内置)' },
          { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite', group: 'Google (内置)' },
        ];

    const customOptions =
      state.settings.customProviders?.flatMap((p) =>
        p.models
          .filter((m) =>
            isEmbedding
              ? m.id.toLowerCase().includes('embed')
              : !m.id.toLowerCase().includes('embed')
          )
          .map((m) => ({
            value: `${p.id}:${m.id}`,
            label: m.name || m.id,
            group: p.name,
          }))
      ) ?? [];

    return { builtIn: builtInOptions, custom: customOptions };
  };

  const renderSelect = (taskKey: string, isEmbedding = false) => {
    const settingKey = taskKey as keyof typeof state.settings;
    const currentValue = (state.settings[settingKey] as string) || (isEmbedding ? 'gemini-embedding-2-preview' : 'gemini-3-flash-preview');
    const { builtIn, custom } = getAllModels(isEmbedding);

    return (
      <select
        value={currentValue}
        onChange={(e) => updateSetting(settingKey, e.target.value)}
        className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 cursor-pointer transition-colors"
      >
        <optgroup label="Google (内置)">
          {builtIn.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
        {custom.length > 0 && (
          <optgroup label="自定义供应商">
            {custom.map((o) => (
              <option key={o.value} value={o.value}>[{o.group}] {o.label}</option>
            ))}
          </optgroup>
        )}
      </select>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header hint */}
      <div className="flex items-center gap-2 p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
        <Cpu className="w-4 h-4 text-indigo-400 shrink-0" />
        <p className="text-xs text-slate-400">
          为每个 AI 任务单独指定最合适的模型。<span className="text-indigo-400">自定义供应商</span>需在「AI 供应商」侧先完成配置。
        </p>
      </div>

      {/* Task cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TASK_CONFIGS.map((task) => {
          const Icon = task.icon;
          return (
            <div
              key={task.key}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{task.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{task.description}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${BADGE_COLORS[task.badgeColor]}`}>
                  {task.badge}
                </span>
              </div>
              {renderSelect(task.key, task.isEmbedding)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
