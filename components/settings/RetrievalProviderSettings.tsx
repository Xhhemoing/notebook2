import React from 'react';

import { useAppContext } from '@/lib/store';
import type { RetrievalProviderConfig } from '@/lib/types';

function ProviderCard(props: {
  title: string;
  description: string;
  value?: RetrievalProviderConfig;
  onChange: (value: RetrievalProviderConfig) => void;
}) {
  const current = props.value || {
    enabled: false,
    provider: 'http-json' as const,
    url: '',
    apiKey: '',
    model: '',
  };

  return (
    <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">{props.title}</h3>
        <p className="text-xs text-slate-500 mt-1">{props.description}</p>
      </div>

      <label className="flex items-center gap-3 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={Boolean(current.enabled)}
          onChange={(event) => props.onChange({ ...current, enabled: event.target.checked })}
        />
        启用
      </label>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Provider 类型</label>
        <select
          value={current.provider}
          onChange={(event) => props.onChange({ ...current, provider: event.target.value as 'http-json' | 'openai' })}
          className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
        >
          <option value="http-json">HTTP JSON</option>
          <option value="openai">OpenAI Compatible</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">URL</label>
        <input
          type="text"
          value={current.url || ''}
          onChange={(event) => props.onChange({ ...current, url: event.target.value })}
          className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
          placeholder="https://your-service.example.com"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Model</label>
          <input
            type="text"
            value={current.model || ''}
            onChange={(event) => props.onChange({ ...current, model: event.target.value })}
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">API Key</label>
          <input
            type="password"
            value={current.apiKey || ''}
            onChange={(event) => props.onChange({ ...current, apiKey: event.target.value })}
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
          />
        </div>
      </div>
    </section>
  );
}

export default function RetrievalProviderSettings() {
  const { state, dispatch } = useAppContext();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <ProviderCard
        title="Reranker Provider"
        description="期望接口：POST JSON，入参 { model, query, documents }，返回 { results: [{ id, score, reason? }] }。"
        value={state.settings.rerankerProvider}
        onChange={(value) => dispatch({ type: 'UPDATE_SETTINGS', payload: { rerankerProvider: value } })}
      />

      <ProviderCard
        title="Late Interaction Provider"
        description="期望接口：POST JSON，入参 { model, mode: 'query'|'document', text }，返回 { vectors: number[][] }。"
        value={state.settings.lateInteractionProvider}
        onChange={(value) => dispatch({ type: 'UPDATE_SETTINGS', payload: { lateInteractionProvider: value } })}
      />
    </div>
  );
}
