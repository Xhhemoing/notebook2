'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { Cloud, Cpu, Database, FileText, Server, Settings2, Shield } from 'lucide-react';

import AISettings from './settings/AISettings';
import DataGovernanceSettings from './settings/DataGovernanceSettings';
import GeneralSettings from './settings/GeneralSettings';
import LogSettings from './settings/LogSettings';
import ModelAllocationSettings from './settings/ModelAllocationSettings';
import RetrievalProviderSettings from './settings/RetrievalProviderSettings';
import SyncSettings from './settings/SyncSettings';
import { DataManager } from './DataManager';

const MENU_ITEMS = [
  { id: 'general', label: '通用', icon: Settings2 },
  { id: 'ai-model', label: 'AI 模型', icon: Cpu },
  { id: 'ai-provider', label: 'AI 供应商', icon: Server },
  { id: 'retrieval-provider', label: '检索 Provider', icon: Server },
  { id: 'sync', label: '数据同步', icon: Cloud },
  { id: 'data', label: '数据管理', icon: Database },
  { id: 'governance', label: '数据治理', icon: Shield },
  { id: 'logs', label: 'AI 日志', icon: FileText },
] as const;

export function Settings() {
  const [activeTab, setActiveTab] = useState<(typeof MENU_ITEMS)[number]['id']>('general');

  return (
    <div className="flex flex-col md:flex-row h-full bg-[#1e1e1e] text-slate-200 overflow-hidden">
      <div className="hidden md:flex w-52 bg-[#1e1e1e] border-r border-slate-800 flex-col shrink-0">
        <div className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2 custom-scrollbar">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                activeTab === item.id
                  ? 'bg-slate-800 text-slate-200'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="md:hidden flex overflow-x-auto border-b border-slate-800 bg-[#1e1e1e] shrink-0 no-scrollbar p-2 gap-2">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
              activeTab === item.id
                ? 'bg-slate-800 text-slate-200'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
            )}
          >
            <item.icon className="w-3.5 h-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]">
        <div className="h-14 border-b border-slate-800 flex items-center px-4 md:px-6 shrink-0">
          <h2 className="text-base md:text-lg font-medium text-slate-200">
            {MENU_ITEMS.find((item) => item.id === activeTab)?.label}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <div className="max-w-5xl mx-auto">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'ai-model' && <ModelAllocationSettings />}
            {activeTab === 'ai-provider' && <AISettings />}
            {activeTab === 'retrieval-provider' && <RetrievalProviderSettings />}
            {activeTab === 'sync' && <SyncSettings />}
            {activeTab === 'data' && <DataManager />}
            {activeTab === 'governance' && <DataGovernanceSettings />}
            {activeTab === 'logs' && <LogSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}
