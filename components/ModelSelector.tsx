import React from 'react';
import { useAppContext } from '@/lib/store';

export const DEFAULT_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite' },
];

export function ModelSelector({ value, onChange, className = '' }: { value: string, onChange: (val: string) => void, className?: string }) {
  const { state } = useAppContext();

  // Aggregate favorite models from custom providers
  const favoriteModels = (state.settings.customProviders || []).flatMap(provider => 
    (provider.models || [])
      .filter(m => m.isFavorite)
      .map(m => ({
        id: `${provider.id}:${m.id}`,
        name: `${provider.name} - ${m.name}`
      }))
  );

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 ${className}`}
    >
      <optgroup label="默认模型">
        {DEFAULT_MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </optgroup>
      {favoriteModels.length > 0 && (
        <optgroup label="收藏模型">
          {favoriteModels.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
