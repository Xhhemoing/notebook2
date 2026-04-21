'use client';

import { useState } from 'react';
import { useAppContext } from '@/lib/store';
import { generateQuizzes, QuizQuestion } from '@/lib/ai';
import { Memory } from '@/lib/types';
import { GraduationCap, Loader2, CheckCircle2, XCircle, ArrowRight, RefreshCw, Play, Layers, BookOpen, Download } from 'lucide-react';
import { clsx } from 'clsx';
import { reviewCard, Rating, Grade, calculateMetrics } from '@/lib/fsrs';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export function ReviewSection() {
  const { state, dispatch } = useAppContext();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [quizzes, setQuizzes] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [evaluations, setEvaluations] = useState<Record<number, Grade>>({});
  const [submitted, setSubmitted] = useState(false);
  const [started, setStarted] = useState(false);
  const [isJoint, setIsJoint] = useState(false);
  const [reviewMode, setReviewMode] = useState<'standard' | 'instant'>('standard');
  const [customBatchSize, setCustomBatchSize] = useState(3);
  const [customDifficulty, setCustomDifficulty] = useState(5);
  const [isPrinting, setIsPrinting] = useState(false);

  const memoriesToReview = state.memories
    .filter(m => m.subject === state.currentSubject)
    .sort((a, b) => {
      // Prioritize due cards
      const aDue = a.fsrs?.due || 0;
      const bDue = b.fsrs?.due || 0;
      if (aDue < Date.now() && bDue >= Date.now()) return -1;
      if (aDue >= Date.now() && bDue < Date.now()) return 1;
      
      // Calculate real-time confidence for sorting
      const aMetrics = calculateMetrics(a.fsrs, a.lastReviewed);
      const bMetrics = calculateMetrics(b.fsrs, b.lastReviewed);
      
      // Then sort by confidence (lower confidence first)
      return aMetrics.confidence - bMetrics.confidence;
    });

  const startReview = async () => {
    if (memoriesToReview.length === 0) return;
    
    // Use custom settings if available
    const batchSize = Math.min(memoriesToReview.length, customBatchSize);
    const selectedMemories = memoriesToReview.slice(0, batchSize);
    const effectiveSettings = {
      ...state.settings,
      minReviewDifficulty: Math.max(0, customDifficulty - 2),
      maxReviewDifficulty: Math.min(10, customDifficulty + 2)
    };
    
    setMemories(selectedMemories);
    setLoading(true);
    setStarted(true);
    setSubmitted(false);
    setAnswers({});
    setEvaluations({});
    setQuizzes([]);

    try {
      const generatedQuizzes = await generateQuizzes(selectedMemories, state.knowledgeNodes, effectiveSettings, isJoint, (log) => {
        if (state.settings.enableLogging) {
          dispatch({
            type: 'ADD_LOG',
            payload: {
              id: Math.random().toString(36).substr(2, 9),
              timestamp: Date.now(),
              ...log
            }
          });
        }
      });
      setQuizzes(generatedQuizzes);
    } catch (error) {
      console.error('Failed to generate quizzes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (quizIdx: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [quizIdx]: answer }));
    
    // If instant feedback mode, evaluate immediately for MC and TF
    if (reviewMode === 'instant') {
      const quiz = quizzes[quizIdx];
      if (quiz.type !== 'qa') {
        const isCorrect = answer === quiz.correctAnswer;
        setEvaluations(prev => ({ ...prev, [quizIdx]: isCorrect ? Rating.Good : Rating.Again }));
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSubmit = () => {
    setSubmitted(true);
    // Auto-evaluate MC and TF
    const newEvals = { ...evaluations };
    quizzes.forEach((quiz, idx) => {
      if (quiz.type !== 'qa') {
        const isCorrect = answers[idx] === quiz.correctAnswer;
        newEvals[idx] = isCorrect ? Rating.Good : Rating.Again;
      }
    });
    setEvaluations(newEvals);
  };

  const handleSelfEvaluate = (quizIdx: number, rating: Grade) => {
    setEvaluations(prev => ({ ...prev, [quizIdx]: rating }));
  };

  const handleFinish = () => {
    // Apply all evaluations to FSRS
    // For joint quizzes, one evaluation might apply to multiple memories
    const memoryEvaluations: Record<string, Grade[]> = {};

    quizzes.forEach((quiz, idx) => {
      const rating = evaluations[idx];
      if (rating !== undefined) {
        quiz.memoryIds.forEach(mid => {
          if (!memoryEvaluations[mid]) memoryEvaluations[mid] = [];
          memoryEvaluations[mid].push(rating);
        });
      }
    });

    // Update each memory with the average or worst rating? 
    // Let's use the minimum rating to be safe (if one joint quiz was hard, the memory needs more review)
    Object.entries(memoryEvaluations).forEach(([mid, ratings]) => {
      const memory = state.memories.find(m => m.id === mid);
      if (memory) {
        const minRating = Math.min(...ratings) as Grade;
        const newFsrs = reviewCard(memory.fsrs, minRating);
        const { confidence, mastery } = calculateMetrics(newFsrs, Date.now());

        dispatch({
          type: 'UPDATE_MEMORY',
          payload: {
            ...memory,
            fsrs: newFsrs,
            confidence,
            mastery,
            lastReviewed: Date.now()
          }
        });
      }
    });

    // Reset state for next review
    setStarted(false);
    setMemories([]);
    setQuizzes([]);
    setAnswers({});
    setEvaluations({});
    setSubmitted(false);
  };

  if (memoriesToReview.length === 0) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-slate-500">
        <GraduationCap className="w-12 h-12 mb-4 text-slate-300" />
        <p>当前科目暂无记忆点可复习</p>
      </div>
    );
  }

  if (!started) {
    const today = new Date().setHours(0, 0, 0, 0);
    const reviewedToday = state.memories.filter(m => m.lastReviewed && m.lastReviewed >= today).length;
    const limit = state.settings.dailyReviewLimit || 20;
    const remainingQuota = Math.max(0, limit - reviewedToday);
    const batchSize = Math.min(state.settings.reviewBatchSize || 3, remainingQuota);

    return (
      <div className="p-6 h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center text-slate-200">
        <div className="w-20 h-20 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center justify-center mb-6">
          <GraduationCap className="w-10 h-10 text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">准备好开始复习了吗？</h2>
        <div className="text-slate-400 mb-8 space-y-4">
          <div className="space-y-1">
            <p>当前科目有 <span className="font-bold text-indigo-400">{memoriesToReview.length}</span> 个记忆点待复习。</p>
            <p>今日复习进度：<span className="font-bold text-indigo-400">{reviewedToday}</span> / {limit}</p>
            {remainingQuota > 0 ? (
              <p>本次将抽取 <span className="font-bold text-indigo-400">{Math.min(memoriesToReview.length, batchSize)}</span> 个记忆点。</p>
            ) : (
              <p className="text-green-400 font-medium">今日复习任务已完成！</p>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 p-4 bg-slate-900/40 rounded-xl border border-slate-800">
            <div className="flex flex-col items-start">
              <span className="text-sm font-semibold text-slate-300 flex items-center gap-1">
                <Play className="w-4 h-4 text-emerald-400" />
                复习模式
              </span>
              <span className="text-xs text-slate-500">
                {reviewMode === 'standard' ? '全部答完后统一提交查看反馈' : '每答一题立即获得反馈'}
              </span>
            </div>
            <div className="flex bg-slate-800 p-1 rounded-lg">
              <button
                onClick={() => setReviewMode('standard')}
                className={clsx(
                  "px-3 py-1 text-xs rounded-md transition-all",
                  reviewMode === 'standard' ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
                )}
              >
                标准
              </button>
              <button
                onClick={() => setReviewMode('instant')}
                className={clsx(
                  "px-3 py-1 text-xs rounded-md transition-all",
                  reviewMode === 'instant' ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
                )}
              >
                即时
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1">
                本次题目数量
              </label>
              <input 
                type="range" min="1" max="10" step="1" 
                value={customBatchSize} 
                onChange={(e) => setCustomBatchSize(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>1</span>
                <span className="text-indigo-400 font-bold">{customBatchSize} 题</span>
                <span>10</span>
              </div>
            </div>
            <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1">
                难度系数
              </label>
              <input 
                type="range" min="1" max="10" step="1" 
                value={customDifficulty} 
                onChange={(e) => setCustomDifficulty(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>易</span>
                <span className="text-amber-400 font-bold">Lv.{customDifficulty}</span>
                <span>难</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 p-4 bg-slate-900/40 rounded-xl border border-slate-800">
            <div className="flex flex-col items-start">
              <span className="text-sm font-semibold text-slate-300 flex items-center gap-1">
                <Layers className="w-4 h-4 text-indigo-400" />
                联合命题模式
              </span>
              <span className="text-xs text-slate-500">结合多个记忆点生成综合性题目</span>
            </div>
            <button
              onClick={() => setIsJoint(!isJoint)}
              className={clsx(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                isJoint ? "bg-indigo-500" : "bg-slate-700"
              )}
            >
              <span
                className={clsx(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  isJoint ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>
        <button
          onClick={startReview}
          disabled={remainingQuota <= 0}
          className="flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-xl font-medium text-lg transition-colors shadow-lg shadow-indigo-900/20"
        >
          <Play className="w-5 h-5 fill-current" />
          {remainingQuota > 0 ? '开始综合测试' : '今日已达上限'}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col max-w-4xl mx-auto overflow-y-auto bg-black text-slate-200 custom-scrollbar print:overflow-visible print:p-0 print:bg-white print:text-black">
      <style jsx global>{`
        @media print {
          nav, aside, button:not(.print-only), .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .quiz-card {
            border: 1px solid #ddd !important;
            margin-bottom: 2rem !important;
            page-break-inside: avoid;
            padding: 2rem !important;
            background: white !important;
            color: black !important;
          }
          .quiz-card * {
            color: black !important;
          }
          .print-header {
            display: block !important;
            margin-bottom: 2rem;
            color: black !important;
          }
        }
        .print-header { display: none; }
      `}</style>
      
      <div className="print-header">
        <h1 className="text-2xl font-bold">{state.currentSubject} - 专项练习测试卷</h1>
        <p className="text-sm text-slate-500">日期: {new Date().toLocaleDateString()} | 题目数量: {quizzes.length}</p>
      </div>

      <div className="flex items-center justify-between mb-8 shrink-0 no-print">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-400" />
          综合复习测试
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            导出纸质版
          </button>
          {submitted && (
            <button
              onClick={handleFinish}
              disabled={Object.keys(evaluations).length < quizzes.length}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              完成复习并保存
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p>AI 正在为您生成专属复习题卷...</p>
        </div>
      ) : (
        <div className="space-y-8 pb-20">
          {quizzes.map((quiz, index) => {
            const associatedMemories = quiz.memoryIds.map(id => memories.find(m => m.id === id)).filter(Boolean) as Memory[];
            const answer = answers[index] || '';
            const isCorrect = answer === quiz.correctAnswer;
            const evaluation = evaluations[index];

            return (
              <div key={index} className="bg-slate-900/40 rounded-2xl shadow-sm border border-slate-800 p-8">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-sm font-bold">
                      {index + 1}
                    </span>
                    <span className="inline-block px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-medium rounded-full">
                      {quiz.type === 'mc' ? '单选题' : quiz.type === 'tf' ? '判断题' : '简答题'}
                    </span>
                    {quiz.memoryIds.length > 1 && (
                      <span className="inline-block px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-medium rounded-full flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        联合命题
                      </span>
                    )}
                  </div>

                  <div className="text-lg font-medium text-slate-200 leading-relaxed prose prose-invert prose-sm max-w-none mb-6">
                    <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{quiz.question}</Markdown>
                  </div>

                  <div className="flex items-center gap-2 text-indigo-400 mb-6 no-print">
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {reviewMode === 'instant' ? '即时练习模式' : '标准答题模式'}
                    </span>
                  </div>
                </div>

                {!submitted && (reviewMode === 'standard' || evaluation === undefined) ? (
                    <div className="space-y-3">
                    {quiz.type === 'mc' && quiz.options?.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleAnswerChange(index, opt)}
                        className={clsx(
                          "w-full text-left p-4 rounded-xl border transition-colors text-slate-300",
                          answer === opt ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500" : "border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/50"
                        )}
                      >
                        <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{opt}</Markdown>
                      </button>
                    ))}
                    
                    {quiz.type === 'tf' && (
                      <div className="flex gap-4">
                        <button
                          onClick={() => handleAnswerChange(index, '对')}
                          className={clsx(
                            "flex-1 p-4 rounded-xl border transition-colors text-slate-300 font-medium text-center",
                            answer === '对' ? "border-green-500 bg-green-500/10 ring-1 ring-green-500" : "border-slate-800 hover:border-green-500/50 hover:bg-slate-800/50"
                          )}
                        >
                          对
                        </button>
                        <button
                          onClick={() => handleAnswerChange(index, '错')}
                          className={clsx(
                            "flex-1 p-4 rounded-xl border transition-colors text-slate-300 font-medium text-center",
                            answer === '错' ? "border-red-500 bg-red-500/10 ring-1 ring-red-500" : "border-slate-800 hover:border-red-500/50 hover:bg-slate-800/50"
                          )}
                        >
                          错
                        </button>
                      </div>
                    )}

                    {quiz.type === 'qa' && (
                      <textarea
                        value={answer}
                        onChange={(e) => handleAnswerChange(index, e.target.value)}
                        placeholder="输入你的答案思路..."
                        className="w-full h-32 p-4 rounded-xl bg-slate-950 border border-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-slate-300 placeholder-slate-600"
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    {/* Show options for MC even after submission */}
                    {quiz.type === 'mc' && (
                      <div className="space-y-3 mb-6">
                        {quiz.options?.map((opt, i) => {
                          const isSelected = answer === opt;
                          const isCorrectOpt = opt === quiz.correctAnswer;
                          return (
                            <div
                              key={i}
                              className={clsx(
                                "w-full text-left p-4 rounded-xl border transition-colors text-slate-300",
                                isCorrectOpt ? "border-green-500 bg-green-500/10 ring-1 ring-green-500" : 
                                isSelected ? "border-red-500 bg-red-500/10 ring-1 ring-red-500" : "border-slate-800 opacity-60"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{opt}</Markdown>
                                {isCorrectOpt && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                {isSelected && !isCorrectOpt && <XCircle className="w-4 h-4 text-red-500" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className={clsx(
                      "p-4 rounded-xl flex items-start gap-3",
                      quiz.type === 'qa' ? "bg-indigo-500/10 border border-indigo-500/20" :
                      isCorrect ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"
                    )}>
                      {quiz.type !== 'qa' && (
                        isCorrect ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={clsx(
                          "font-medium mb-1",
                          quiz.type === 'qa' ? "text-blue-400" :
                          isCorrect ? "text-green-400" : "text-red-400"
                        )}>
                          {quiz.type === 'qa' ? '参考解析' : isCorrect ? '回答正确！' : '回答错误'}
                        </p>
                        
                        {quiz.type === 'qa' && (
                          <div className="mb-4">
                            <p className="text-sm font-medium text-slate-400 mb-1">你的回答：</p>
                            <div className="p-3 bg-slate-950 rounded-lg border border-blue-500/20 text-sm text-slate-300 whitespace-pre-wrap">
                              {answer || '未作答'}
                            </div>
                            <p className="text-sm font-medium text-slate-400 mt-4 mb-1">参考答案：</p>
                            <div className="p-3 bg-slate-950 rounded-lg border border-green-500/20 text-sm text-slate-300 prose prose-invert prose-sm max-w-none">
                              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{quiz.correctAnswer}</Markdown>
                            </div>
                          </div>
                        )}

                        {quiz.type === 'tf' && !isCorrect && (
                          <div className="text-sm text-red-400 mb-2">正确答案是：<Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{quiz.correctAnswer}</Markdown></div>
                        )}
                        <div className="text-sm text-slate-300 leading-relaxed prose prose-invert prose-sm max-w-none">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">解析：</p>
                          <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{quiz.explanation}</Markdown>
                        </div>
                      </div>
                    </div>

                    {quiz.type === 'qa' && evaluation === undefined && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                        <p className="text-sm font-medium text-amber-400 mb-3 text-center">请根据参考解析，客观评价你的掌握程度：</p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleSelfEvaluate(index, Rating.Easy)}
                            className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            太简单了
                          </button>
                          <button
                            onClick={() => handleSelfEvaluate(index, Rating.Good)}
                            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            掌握了
                          </button>
                          <button
                            onClick={() => handleSelfEvaluate(index, Rating.Hard)}
                            className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            有点印象
                          </button>
                          <button
                            onClick={() => handleSelfEvaluate(index, Rating.Again)}
                            className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            完全不记得
                          </button>
                        </div>
                      </div>
                    )}

                    {evaluation !== undefined && (
                      <div className="flex items-center justify-between text-sm p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                        <span className="text-slate-400">本次评估结果：</span>
                        <span className={clsx(
                          "font-medium px-2 py-1 rounded-md border",
                          evaluation === Rating.Easy ? "bg-green-500/10 text-green-400 border-green-500/20" :
                          evaluation === Rating.Good ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                          evaluation === Rating.Hard ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                          "bg-red-500/10 text-red-400 border-red-500/20"
                        )}>
                          {evaluation === Rating.Easy ? '太简单了' :
                           evaluation === Rating.Good ? '掌握了' :
                           evaluation === Rating.Hard ? '有点印象' : '完全不记得'}
                        </span>
                      </div>
                    )}

                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <BookOpen className="w-3 h-3" />
                        关联原始记忆点 ({associatedMemories.length})
                      </h4>
                      {associatedMemories.map(memory => {
                        const metrics = calculateMetrics(memory.fsrs, memory.lastReviewed);
                        return (
                          <div key={memory.id} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                            <div className="text-sm text-slate-300 prose prose-invert prose-sm max-w-none">
                              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{memory.content}</Markdown>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-xs">
                              <span className="text-slate-500">
                                当前掌握度: <span className="font-medium text-indigo-400">{Math.round(metrics.mastery || 0)}%</span>
                              </span>
                              <span className="text-slate-500">
                                当前置信度: <span className="font-medium text-indigo-400">{Math.round(metrics.confidence || 0)}%</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!submitted && quizzes.length > 0 && (
            <button
              onClick={handleSubmit}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-lg transition-colors shadow-lg shadow-indigo-900/20"
            >
              交卷并查看解析
            </button>
          )}
        </div>
      )}
    </div>
  );
}
