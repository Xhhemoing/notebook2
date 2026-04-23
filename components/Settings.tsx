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
  { id: 'ai-model', label: 'AI 预设', icon: Cpu },
  { id: 'ai-provider', label: 'AI 供应商（高级）', icon: Server },
  { id: 'retrieval-provider', label: '检索 Provider（高级）', icon: Server },
  { id: 'sync', label: '数据同步', icon: Cloud },
  { id: 'data', label: '数据管理', icon: Database },
  { id: 'governance', label: '数据治理', icon: Shield },
  { id: 'logs', label: 'AI 日志', icon: FileText },
] as const;

export function Settings() {
  const [activeTab, setActiveTab] = useState<(typeof MENU_ITEMS)[number]['id']>('general');

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#1e1e1e] text-slate-200 md:flex-row">
      <div className="hidden w-56 shrink-0 border-r border-slate-800 bg-[#1e1e1e] md:flex md:flex-col">
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4 custom-scrollbar">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                activeTab === item.id
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-800 bg-[#1e1e1e] p-2 no-scrollbar md:hidden">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={clsx(
              'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === item.id
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#1e1e1e]">
        <div className="flex h-14 items-center border-b border-slate-800 px-4 md:px-6">
          <h2 className="text-base font-medium text-slate-100 md:text-lg">
            {MENU_ITEMS.find((item) => item.id === activeTab)?.label}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar md:p-6">
          <div className="mx-auto max-w-5xl">
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
