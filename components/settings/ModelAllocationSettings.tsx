'use client';

import React, { useMemo, useState } from 'react';
import { Brain, ChevronDown, ChevronUp, Cpu, Network, Search, Sparkles } from 'lucide-react';

import { useAppContext } from '@/lib/store';
import { getPresetExampleModels } from '@/lib/ai';
import type { AIPreset, Settings } from '@/lib/types';

const PRESET_CARDS: Array<{
  id: Exclude<AIPreset, 'advanced'> | 'advanced';
  title: string;
  description: string;
  highlights: string[];
}> = [
  {
    id: 'quality',
    title: '质量优先',
    description: '更强生成模型，适合重讲原理、错因分析、整卷梳理。',
    highlights: ['答题更稳', '讲解更深', '延迟略高'],
  },
  {
    id: 'balanced',
    title: '均衡',
    description: '默认推荐。保留较好效果，同时减少时延与配置负担。',
    highlights: ['默认可用', '速度更快', '日常录入更顺'],
  },
  {
    id: 'advanced',
    title: '高级自定义',
    description: '保留原有 provider / model 粒度，适合你后续专项调参。',
    highlights: ['完全自定义', '保留老能力', '配置更复杂'],
  },
];

const ADVANCED_FIELDS = [
  { key: 'parseModel', label: '录入解析模型', icon: Sparkles },
  { key: 'chatModel', label: '问答模型', icon: Brain },
  { key: 'graphModel', label: '导图建议模型', icon: Network },
  { key: 'reviewModel', label: '复习与总结模型', icon: Cpu },
  { key: 'embeddingModel', label: 'Embedding 模型', icon: Search },
] as const;

type AdvancedFieldKey = (typeof ADVANCED_FIELDS)[number]['key'];

const BUILTIN_GENERATION_MODELS = [
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
];

const BUILTIN_EMBEDDINGS = [
  { value: 'text-embedding-004', label: 'text-embedding-004' },
  { value: 'gemini-embedding-2-preview', label: 'gemini-embedding-2-preview' },
];

function applyPreset(preset: AIPreset) {
  if (preset === 'quality') {
    return {
      aiPreset: preset,
      parseModel: 'gemini-3.1-pro-preview',
      chatModel: 'gemini-3.1-pro-preview',
      graphModel: 'gemini-3.1-pro-preview',
      reviewModel: 'gemini-3.1-pro-preview',
      embeddingModel: 'text-embedding-004',
      rerankMode: 'hybrid-only' as const,
      rerankTopN: 8,
    };
  }

  if (preset === 'balanced') {
    return {
      aiPreset: preset,
      parseModel: 'gemini-3-flash-preview',
      chatModel: 'gemini-3-flash-preview',
      graphModel: 'gemini-3-flash-preview',
      reviewModel: 'gemini-3-flash-preview',
      embeddingModel: 'text-embedding-004',
      rerankMode: 'hybrid-only' as const,
      rerankTopN: 8,
    };
  }

  return {
    aiPreset: 'advanced' as const,
  };
}

export default function ModelAllocationSettings() {
  const { state, dispatch } = useAppContext();
  const preset = state.settings.aiPreset || 'balanced';
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(preset === 'advanced');
  const presetExamples = useMemo(
    () => (preset === 'advanced' ? null : getPresetExampleModels(preset)),
    [preset]
  );

  const customOptions =
    state.settings.customProviders?.flatMap((provider) =>
      (provider.models || []).map((model) => ({
        value: `${provider.id}:${model.id}`,
        label: `${provider.name} · ${model.name || model.id}`,
      }))
    ) || [];

  const updateField = (key: AdvancedFieldKey, value: string) => {
    const payload = { [key]: value } as Partial<Pick<Settings, AdvancedFieldKey>>;
    dispatch({ type: 'UPDATE_SETTINGS', payload });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <section className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 text-indigo-400 shrink-0" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-100">默认只保留三档预设</h3>
            <p className="text-xs text-slate-400">
              首版统一走“图谱范围过滤 → dense+sparse 混合召回 → 直接回答”，默认关闭复杂 rerank / late interaction。
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PRESET_CARDS.map((card) => {
          const selected = preset === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                dispatch({ type: 'UPDATE_SETTINGS', payload: applyPreset(card.id as AIPreset) });
                if (card.id !== 'advanced') setShowAdvancedPanel(false);
              }}
              className={[
                'rounded-2xl border p-4 text-left transition-all',
                selected
                  ? 'border-indigo-500/40 bg-indigo-500/10 shadow-lg shadow-indigo-900/10'
                  : 'border-slate-800 bg-slate-900 hover:border-slate-700',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">{card.title}</h3>
                {selected && <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-200">当前</span>}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{card.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {card.highlights.map((item) => (
                  <span key={item} className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-400">
                    {item}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {preset !== 'advanced' && presetExamples && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-slate-100">当前预设说明</h3>
          <p className="text-xs text-slate-400">零配置默认使用内置 Gemini 组合，保证开箱即用。</p>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
            <div>内置组合：{presetExamples.builtin}</div>
            <div className="mt-1 text-slate-500">可替代示例：{presetExamples.optional}</div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <button
          type="button"
          onClick={() => setShowAdvancedPanel((value) => !value)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-100">高级自定义面板</h3>
            <p className="mt-1 text-xs text-slate-500">
              仅在需要细调 provider / model 时打开；日常使用建议保持预设模式。
            </p>
          </div>
          {showAdvancedPanel ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showAdvancedPanel && (
          <div className="mt-4 space-y-4 border-t border-slate-800 pt-4">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100">
              打开高级模式后，你可以继续使用原有 provider 模型；但首版默认效果已针对预设做过简化。
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {ADVANCED_FIELDS.map((field) => {
                const Icon = field.icon;
                const options = field.key === 'embeddingModel' ? BUILTIN_EMBEDDINGS : BUILTIN_GENERATION_MODELS;
                return (
                  <div key={field.key} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm text-slate-200">
                      <Icon className="h-4 w-4 text-slate-400" />
                      {field.label}
                    </div>
                    <select
                      value={state.settings[field.key] || ''}
                      onChange={(event) => {
                        dispatch({ type: 'UPDATE_SETTINGS', payload: { aiPreset: 'advanced' } });
                        updateField(field.key, event.target.value);
                      }}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
                    >
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                      {customOptions.length > 0 && <option disabled>────────</option>}
                      {customOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
