'use client';

import React, { useState } from 'react';
import imageCompression from 'browser-image-compression';
import { motion, AnimatePresence } from 'motion/react';
import { UploadCloud, CheckCircle, Loader2, ImagePlus, X, Tag, FileImage } from 'lucide-react';
import { useGlobalAIChat } from '../lib/ai-chat-context';

type IntentTag = '题目正文' | '我的错解' | '关键概念(可选)';

interface Snippet {
  id: string;
  file: File;
  preview: string;
  tag: IntentTag;
}

interface MistakeUploaderProps {
  onTaskComplete?: (result: any) => void;
}

export default function MistakeUploader({ onTaskComplete }: MistakeUploaderProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { startMistakeAnalysis } = useGlobalAIChat();

  const handleAddSnippet = async (e: React.ChangeEvent<HTMLInputElement>, tag: IntentTag) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // 1. Client-side extreme compression for 1C1G server architecture
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.1, // extremely aggressive for snippets
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.8
      });

      const preview = await imageCompression.getDataUrlFromFile(compressedFile);
      
      setSnippets(prev => [...prev, {
        id: Math.random().toString(36).substring(7),
        file: compressedFile,
        preview,
        tag
      }]);
    } catch (error) {
      console.error('Error handling snippet:', error);
      alert('图片处理失败');
    }
  };

  const removeSnippet = (id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
  };

  const handleUpload = async () => {
    if (snippets.length === 0) return;
    setIsUploading(true);

    try {
      // We pass the compressed base64 images directly into the streaming Chat context
      const imageArray = snippets.map(s => s.preview);
      
      // Starts the stream globally!
      startMistakeAnalysis(imageArray);
      
      // Wait a moment before clearing to let the user see it happened
      setTimeout(() => {
        setSnippets([]);
        setIsUploading(false);
      }, 500);

    } catch (error) {
      console.error('Upload Error:', error);
      alert('上传失败');
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-indigo-400" />
          意图裁剪录入 (微距目标推理)
        </h3>
        <p className="text-xs text-slate-500 mt-1">分别截取或拍摄题目正文、你的错解，帮助 AI 极低成本精准诊断</p>
      </div>

      <div className="space-y-6">
        <div className="flex flex-wrap gap-4">
          {(['题目正文', '我的错解', '关键概念(可选)'] as IntentTag[]).map(tag => (
            <label key={tag} className="flex-1 min-w-[200px] cursor-pointer group">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleAddSnippet(e, tag)}
              />
              <div className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-slate-700 bg-slate-800/30 rounded-xl group-hover:border-indigo-500/50 group-hover:bg-indigo-500/5 transition-all">
                <ImagePlus className="w-6 h-6 text-slate-500 group-hover:text-indigo-400 mb-2" />
                <span className="text-sm text-slate-400 group-hover:text-slate-300 font-medium">+ {tag}</span>
              </div>
            </label>
          ))}
        </div>

        {snippets.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-800/50">
            <h4 className="text-sm font-medium text-slate-300">已选片段</h4>
            <div className="flex flex-wrap gap-4">
              {snippets.map(s => (
                <div key={s.id} className="relative group rounded-lg overflow-hidden border border-slate-700 w-32 h-32 bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.preview} alt={s.tag} className="w-full h-full object-contain" />
                  <div className="absolute top-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center gap-1 backdrop-blur-sm">
                    <Tag className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] text-white font-medium truncate">{s.tag}</span>
                  </div>
                  <button
                    onClick={() => removeSnippet(s.id)}
                    className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
            >
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
              提交给 AI 诊断 (极速连线)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
