'use client';

import { useAppContext } from '@/lib/store';
import { 
  BarChart3, 
  TrendingDown, 
  Target, 
  Calendar, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  ChevronRight, 
  Sparkles, 
  Loader2,
  BrainCircuit,
  ArrowRight
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { generateReviewPlan } from '@/lib/ai';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';

export function MistakeAnalysis() {
  const { state, dispatch } = useAppContext();
  const [isGenerating, setIsGenerating] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  const currentSubjectMistakes = useMemo(() => 
    state.memories.filter(m => m.subject === state.currentSubject && m.isMistake),
  [state.memories, state.currentSubject]);

  const currentSubjectNodes = useMemo(() => 
    state.knowledgeNodes.filter(n => n.subject === state.currentSubject),
  [state.knowledgeNodes, state.currentSubject]);

  const currentPlans = useMemo(() => 
    state.reviewPlans.filter(p => p.subject === state.currentSubject),
  [state.reviewPlans, state.currentSubject]);

  // Stats calculation
  const stats = useMemo(() => {
    const reasonCounts: { [key: string]: number } = {};
    const nodeMistakeCounts: { [key: string]: number } = {};
    
    currentSubjectMistakes.forEach(m => {
      if (m.errorReason) {
        reasonCounts[m.errorReason] = (reasonCounts[m.errorReason] || 0) + 1;
      }
      m.knowledgeNodeIds.forEach(id => {
        nodeMistakeCounts[id] = (nodeMistakeCounts[id] || 0) + 1;
      });
    });

    const reasonData = Object.entries(reasonCounts).map(([name, value]) => ({ name, value }));
    const nodeData = Object.entries(nodeMistakeCounts)
      .map(([id, value]) => {
        const node = state.knowledgeNodes.find(n => n.id === id);
        return { name: node?.name || '未知', value, id };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return { reasonData, nodeData };
  }, [currentSubjectMistakes, state.knowledgeNodes]);

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    try {
      const plan = await generateReviewPlan(
        state.currentSubject,
        state.memories,
        state.knowledgeNodes,
        state.settings,
        (log) => dispatch({ type: 'ADD_LOG', payload: log })
      );
      dispatch({ type: 'ADD_REVIEW_PLAN', payload: plan });
      setActivePlanId(plan.id);
    } catch (error) {
      console.error('Failed to generate review plan', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const activePlan = currentPlans.find(p => p.id === activePlanId) || currentPlans[0];

  const toggleItemStatus = (planId: string, itemId: string) => {
    const plan = state.reviewPlans.find(p => p.id === planId);
    if (!plan) return;

    const updatedItems = plan.items.map(item => 
      item.id === itemId 
        ? { ...item, status: item.status === 'completed' ? 'pending' : 'completed' } as any
        : item
    );

    dispatch({
      type: 'UPDATE_REVIEW_PLAN',
      payload: { ...plan, items: updatedItems }
    });
  };

  const COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'];

  return (
    <div className="p-6 h-full flex flex-col max-w-6xl mx-auto text-slate-200 bg-black">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <TrendingDown className="w-6 h-6 text-indigo-500" />
            </div>
            错题分析与复习计划
          </h2>
          <p className="text-slate-500 text-sm mt-1">基于 AI 深度解析，精准定位薄弱环节，科学制定复习路径</p>
        </div>
        
        <button
          onClick={handleGeneratePlan}
          disabled={isGenerating || currentSubjectMistakes.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-600/20"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              正在生成计划...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              生成最新复习计划
            </>
          )}
        </button>
      </div>

      {currentSubjectMistakes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-900 rounded-3xl p-12">
          <AlertCircle className="w-16 h-16 mb-4 opacity-20" />
          <h3 className="text-xl font-semibold mb-2">暂无错题数据</h3>
          <p className="text-center max-w-md opacity-60">
            请先在“录入”页面添加错题，AI 将自动分析错误原因并关联知识点，随后即可生成深度分析报告。
          </p>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
          {/* Left Column: Stats & Analysis */}
          <div className="lg:col-span-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
            {/* Mistake Distribution by Reason */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                错误原因分布
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.reasonData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {stats.reasonData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                      itemStyle={{ color: '#f1f5f9' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {stats.reasonData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-400">{item.name}</span>
                    </div>
                    <span className="font-mono text-slate-200">{item.value} 次</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Weak Points */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <Target className="w-4 h-4" />
                核心薄弱知识点
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.nodeData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={80} 
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                    />
                    <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Right Column: Review Plan */}
          <div className="lg:col-span-2 flex flex-col bg-slate-900/20 border border-slate-900 rounded-3xl overflow-hidden">
            {activePlan ? (
              <div className="flex flex-col h-full">
                {/* Plan Header */}
                <div className="p-6 border-b border-slate-800 bg-slate-900/40">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-500/10 rounded-lg">
                        <Calendar className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">复习计划：{state.currentSubject}</h3>
                        <p className="text-xs text-slate-500">生成于 {new Date(activePlan.createdAt).toLocaleString('zh-CN')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">完成进度</span>
                      <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 transition-all duration-500" 
                          style={{ width: `${(activePlan.items.filter(i => i.status === 'completed').length / activePlan.items.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-indigo-400">
                        {Math.round((activePlan.items.filter(i => i.status === 'completed').length / activePlan.items.length) * 100)}%
                      </span>
                    </div>
                  </div>
                  
                  {/* AI Analysis Text */}
                  <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                    <div className="flex items-center gap-2 mb-2">
                      <BrainCircuit className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">AI 诊断报告</span>
                    </div>
                    <div className="text-sm text-slate-300 leading-relaxed prose prose-invert prose-indigo max-w-none">
                      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {activePlan.analysis}
                      </Markdown>
                    </div>
                  </div>
                </div>

                {/* Plan Items */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                  {activePlan.items.map((item, idx) => (
                    <div 
                      key={item.id}
                      className={clsx(
                        "group relative flex gap-4 p-5 rounded-2xl border transition-all duration-300",
                        item.status === 'completed' 
                          ? "bg-slate-900/20 border-slate-800/50 opacity-60" 
                          : "bg-slate-900/60 border-slate-800 hover:border-indigo-500/30 hover:bg-slate-900/80"
                      )}
                    >
                      <button 
                        onClick={() => toggleItemStatus(activePlan.id, item.id)}
                        className="mt-1 flex-shrink-0"
                      >
                        {item.status === 'completed' ? (
                          <CheckCircle2 className="w-6 h-6 text-green-500" />
                        ) : (
                          <Circle className="w-6 h-6 text-slate-700 group-hover:text-indigo-500 transition-colors" />
                        )}
                      </button>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <h4 className={clsx(
                            "font-bold text-base transition-all",
                            item.status === 'completed' ? "text-slate-500 line-through" : "text-slate-100"
                          )}>
                            {item.title}
                          </h4>
                          <div className="flex items-center gap-2">
                            <span className={clsx(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                              item.priority === 'high' ? "bg-red-500/10 text-red-500" :
                              item.priority === 'medium' ? "bg-orange-500/10 text-orange-500" :
                              "bg-blue-500/10 text-blue-500"
                            )}>
                              {item.priority === 'high' ? '高优先级' : item.priority === 'medium' ? '中优先级' : '低优先级'}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-800 text-slate-500 rounded text-[10px] font-bold uppercase tracking-wider">
                              {item.type === 'knowledge' ? '知识巩固' : item.type === 'exercise' ? '针对性练习' : '总结提升'}
                            </span>
                          </div>
                        </div>
                        
                        <p className={clsx(
                          "text-sm leading-relaxed",
                          item.status === 'completed' ? "text-slate-600" : "text-slate-400"
                        )}>
                          {item.content}
                        </p>

                        <div className="flex flex-wrap gap-2 pt-2">
                          {item.relatedNodeIds.map(nodeId => {
                            const node = state.knowledgeNodes.find(n => n.id === nodeId);
                            return node ? (
                              <span key={nodeId} className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-md">
                                <Target className="w-3 h-3" />
                                {node.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>

                      {item.status !== 'completed' && (
                        <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300">
                            去执行 <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-600">
                <Sparkles className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-center max-w-xs">点击上方按钮，让 AI 为你量身定制复习计划</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
