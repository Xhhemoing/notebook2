import React, { useState } from 'react';
import { useAppContext } from '@/lib/store';
import { CustomProvider } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { Cpu, Plus, Trash2, X, Eye, EyeOff, Download, Activity, Edit2, Check, Star } from 'lucide-react';
import clsx from 'clsx';

const BUILT_IN_PROVIDERS = [
  { id: 'siliconflow', name: '硅基流动', type: 'openai', baseUrl: 'https://api.siliconflow.cn/v1' },
  { id: 'tongyi', name: '通义千问', type: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'moonshot', name: '月之暗面', type: 'openai', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'zhipu', name: '智谱AI', type: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4/' },
  { id: 'doubao', name: '字节豆包', type: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'deepseek', name: 'DeepSeek', type: 'openai', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'gemini', name: 'Google Gemini', type: 'gemini', baseUrl: '' },
  { id: 'minimax', name: 'MiniMax', type: 'openai', baseUrl: 'https://api.minimax.chat/v1' },
  { id: 'openai', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1' },
];

export default function AISettings() {
  const { state, dispatch } = useAppContext();
  const providers = state.settings.customProviders || [];
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(providers.length > 0 ? providers[0].id : null);
  const [showApiKey, setShowApiKey] = useState(false);

  const [isFetching, setIsFetching] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<{ id: string, name: string }[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modelSearch, setModelSearch] = useState('');

  const selectedProvider = providers.find(p => p.id === selectedProviderId);

  const handleAddProvider = () => {
    const newProvider: CustomProvider = {
      id: `provider-${uuidv4()}`,
      name: '新供应商',
      type: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      models: []
    };
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { customProviders: [...providers, newProvider] }
    });
    setSelectedProviderId(newProvider.id);
  };

  const updateProvider = (id: string, updates: Partial<CustomProvider>) => {
    const newProviders = providers.map(p => p.id === id ? { ...p, ...updates } : p);
    dispatch({ type: 'UPDATE_SETTINGS', payload: { customProviders: newProviders } });
  };

  const deleteProvider = (id: string) => {
    const newProviders = providers.filter(p => p.id !== id);
    dispatch({ type: 'UPDATE_SETTINGS', payload: { customProviders: newProviders } });
    if (selectedProviderId === id) {
      setSelectedProviderId(newProviders.length > 0 ? newProviders[0].id : null);
    }
  };

  const handleAddModel = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    const newModels = [...(provider.models || []), { id: '', name: '新模型' }];
    updateProvider(providerId, { models: newModels });
  };

  const updateModel = (providerId: string, modelIndex: number, updates: { id?: string, name?: string, isFavorite?: boolean }) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    const newModels = [...(provider.models || [])];
    if (newModels[modelIndex]) {
      newModels[modelIndex] = { ...newModels[modelIndex], ...updates };
      updateProvider(providerId, { models: newModels });
    }
  };

  const deleteModel = (providerId: string, modelIndex: number) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    const newModels = [...(provider.models || [])];
    newModels.splice(modelIndex, 1);
    updateProvider(providerId, { models: newModels });
  };

  const handleFetchModels = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider || !provider.baseUrl || !provider.apiKey) {
      alert('请先填写接口地址和 API 密钥');
      return;
    }
    
    setIsFetching(true);
    try {
      const url = provider.baseUrl.endsWith('/') ? `${provider.baseUrl}models` : `${provider.baseUrl}/models`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`
        }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Expected JSON but got ${contentType}`);
      }
      
      const data = await res.json();
      if (data && data.data && Array.isArray(data.data)) {
        const newModels = data.data.map((m: any) => ({
          id: m.id,
          name: m.id
        }));
        
        setFetchedModels(newModels);
        setSelectedIds(new Set(newModels.map((m: { id: string }) => m.id))); // Default select all
        setShowImportModal(true);
      } else {
        throw new Error('返回数据格式不正确，未找到 data 数组');
      }
    } catch (error: any) {
      console.error('Fetch models failed:', error);
      alert('获取模型失败: ' + error.message);
    } finally {
      setIsFetching(false);
    }
  };

  const handleTestConnection = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider || !provider.baseUrl || !provider.apiKey) {
      alert('请先填写接口地址和 API 密钥');
      return;
    }
    
    setIsFetching(true);
    try {
      const url = provider.baseUrl.endsWith('/') ? `${provider.baseUrl}models` : `${provider.baseUrl}/models`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`
        }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      alert('连通性测试成功！');
    } catch (error: any) {
      console.error('Test connection failed:', error);
      alert('连通性测试失败: ' + error.message);
    } finally {
      setIsFetching(false);
    }
  };

  const handleConfirmImport = () => {
    if (!selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return;

    const toImport = fetchedModels.filter((m: { id: string }) => selectedIds.has(m.id));
    const existingModels = provider.models || [];
    const mergedModels = [...existingModels];

    let addedCount = 0;
    toImport.forEach(m => {
      if (!existingModels.find(em => em.id === m.id)) {
        mergedModels.push(m);
        addedCount++;
      }
    });

    updateProvider(selectedProviderId, { models: mergedModels });
    setShowImportModal(false);
    alert(`成功导入 ${addedCount} 个模型！`);
  };

  const toggleModelSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const filteredFetchedModels = fetchedModels.filter((m: { id: string }) => 
    m.id.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-12rem)] bg-[#1e1e1e] rounded-2xl border border-slate-800 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-[#1e1e1e] border-r border-slate-800 flex flex-col">
        <div className="p-4 flex items-center justify-between text-slate-400">
          <span className="text-sm font-medium">供应商列表</span>
          <button onClick={handleAddProvider} className="hover:text-slate-200">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {providers.map(provider => (
            <button
              key={provider.id}
              onClick={() => setSelectedProviderId(provider.id)}
              className={clsx(
                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                selectedProviderId === provider.id 
                  ? "bg-indigo-500/20 text-indigo-400" 
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"
              )}
            >
              <div className="flex items-center gap-2 truncate">
                <div className={clsx("w-2 h-2 rounded-full", provider.apiKey ? "bg-green-500" : "bg-slate-600")} />
                <span className="truncate">{provider.name}</span>
              </div>
                <span className="text-xs text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded">
                {(provider.models || []).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-[#1e1e1e]">
        {selectedProvider ? (
          <div className="p-8 max-w-3xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={selectedProvider.name}
                  onChange={(e) => updateProvider(selectedProvider.id, { name: e.target.value })}
                  className="text-2xl font-bold bg-transparent border-none focus:ring-0 text-slate-200 p-0"
                />
              </div>
              <button 
                onClick={() => deleteProvider(selectedProvider.id)}
                className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm text-slate-400 mb-2">接口地址</label>
                <input
                  type="text"
                  value={selectedProvider.baseUrl || ''}
                  onChange={(e) => updateProvider(selectedProvider.id, { baseUrl: e.target.value })}
                  className="w-full p-3 bg-[#252526] border border-slate-800 rounded-xl text-sm text-slate-300 focus:outline-none focus:border-indigo-500 font-mono"
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={selectedProvider.apiKey}
                    onChange={(e) => updateProvider(selectedProvider.id, { apiKey: e.target.value })}
                    className="w-full p-3 pr-10 bg-[#252526] border border-slate-800 rounded-xl text-sm text-slate-300 focus:outline-none focus:border-indigo-500 font-mono"
                    placeholder="sk-..."
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleTestConnection(selectedProvider.id)}
                  disabled={isFetching}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  <Activity className="w-4 h-4" />
                  连通性测试
                </button>
                <button 
                  onClick={() => handleFetchModels(selectedProvider.id)}
                  disabled={isFetching}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  获取模型列表
                </button>
                <button 
                  onClick={() => updateProvider(selectedProvider.id, { apiKey: '' })}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm transition-colors ml-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  清除
                </button>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-800">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-medium text-slate-200">模型列表</h3>
                  <p className="text-sm text-slate-500">共 {(selectedProvider.models || []).length} 个模型</p>
                </div>
                <button 
                  onClick={() => handleAddModel(selectedProvider.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#252526] hover:bg-slate-800 text-slate-300 rounded-lg text-sm transition-colors border border-slate-800"
                >
                  <Plus className="w-4 h-4" />
                  添加模型
                </button>
              </div>

              <div className="space-y-3">
                {(selectedProvider.models || []).map((model, index) => (
                  <div key={index} className="p-4 bg-[#252526] border border-slate-800 rounded-xl flex items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={model.name}
                        onChange={(e) => updateModel(selectedProvider.id, index, { name: e.target.value })}
                        className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-200 p-0"
                        placeholder="显示名称 (如 DeepSeek Chat)"
                      />
                      <input
                        type="text"
                        value={model.id}
                        onChange={(e) => updateModel(selectedProvider.id, index, { id: e.target.value })}
                        className="w-full bg-transparent border-none focus:ring-0 text-xs text-slate-500 p-0 font-mono"
                        placeholder="模型 ID (如 deepseek-chat)"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                       <button 
                        onClick={() => updateModel(selectedProvider.id, index, { isFavorite: !model.isFavorite })}
                        className={clsx("p-2 transition-colors", model.isFavorite ? "text-amber-400 hover:text-amber-500" : "text-slate-500 hover:text-amber-400")}
                        title={model.isFavorite ? "取消收藏" : "收藏模型，可在临时切换面板快速选择"}
                      >
                        <Star className="w-4 h-4" fill={model.isFavorite ? "currentColor" : "none"} />
                      </button>
                      <button className="p-2 text-slate-500 hover:text-slate-300">
                        <Activity className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => deleteModel(selectedProvider.id, index)}
                        className="p-2 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {(selectedProvider.models || []).length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                    暂无模型，请点击右上角添加
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            请在左侧选择或添加一个供应商
          </div>
        )}
      </div>
      {/* Model Import Selection Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1e1e1e] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">选择要导入的模型</h3>
                <p className="text-xs text-slate-500">检测到 {fetchedModels.length} 个模型，请勾选您需要使用的项目</p>
              </div>
              <button 
                onClick={() => setShowImportModal(false)}
                className="p-2 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text"
                  placeholder="搜索模型名称..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="w-full bg-[#252526] border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                <button 
                  onClick={() => setSelectedIds(new Set(fetchedModels.map((m: { id: string }) => m.id)))}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 bg-indigo-500/10 rounded"
                >
                  全选
                </button>
                <button 
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-slate-400 hover:text-slate-300 font-medium px-2 py-1 bg-slate-800 rounded"
                >
                  取消全选
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {filteredFetchedModels.map(model => (
                <label 
                  key={model.id}
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                    selectedIds.has(model.id) 
                      ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-300" 
                      : "bg-[#252526] border-slate-800 text-slate-400 hover:border-slate-700"
                  )}
                >
                  <input 
                    type="checkbox"
                    checked={selectedIds.has(model.id)}
                    onChange={() => toggleModelSelection(model.id)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-slate-900"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{model.id}</div>
                  </div>
                  {selectedIds.has(model.id) && <Check className="w-4 h-4" />}
                </label>
              ))}
              {filteredFetchedModels.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  没有找到匹配的模型
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-800 flex justify-end gap-3">
              <button 
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleConfirmImport}
                disabled={selectedIds.size === 0}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/20"
              >
                确认导入 ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Search(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
