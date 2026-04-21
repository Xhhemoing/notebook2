'use client';

import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { X, Check, Trash2, MapPin, MousePointer2 } from 'lucide-react';
import { clsx } from 'clsx';
import { v4 as uuidv4 } from 'uuid';

export type AnnotationKind = 'mistake' | 'memory' | 'explain' | 'focus';

export type ImageAnnotation = {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  kind: AnnotationKind;
  note: string;
  number: number;
};

interface ImageAnnotatorProps {
  src: string;
  initialAnnotations?: ImageAnnotation[];
  onSave: (annotatedImageBase64: string, annotations: ImageAnnotation[]) => void;
  onCancel: () => void;
}

const KIND_META: Record<AnnotationKind, { label: string, color: string, hex: string }> = {
  mistake: { label: '错题', color: 'bg-rose-500', hex: '#f43f5e' },
  memory: { label: '记忆', color: 'bg-emerald-500', hex: '#10b981' },
  explain: { label: '需解释', color: 'bg-amber-500', hex: '#f59e0b' },
  focus: { label: '重点', color: 'bg-sky-500', hex: '#0ea5e9' },
};

export function ImageAnnotator({ src, initialAnnotations = [], onSave, onCancel }: ImageAnnotatorProps) {
  const [annotations, setAnnotations] = useState<ImageAnnotation[]>(initialAnnotations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentKind, setCurrentKind] = useState<AnnotationKind>('mistake');
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleImageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newAnnotation: ImageAnnotation = {
      id: uuidv4(),
      x,
      y,
      kind: currentKind,
      note: '',
      number: annotations.length + 1,
    };
    setAnnotations([...annotations, newAnnotation]);
    setSelectedId(newAnnotation.id);
  };

  const selectedAnnotation = annotations.find(a => a.id === selectedId);

  const handleSave = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || !imgRef.current) return;

    // Use natural width and height of the image
    const w = imgRef.current.naturalWidth;
    const h = imgRef.current.naturalHeight;
    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(imgRef.current, 0, 0, w, h);

    // Draw annotations
    annotations.forEach(a => {
      const ax = (a.x / 100) * w;
      const ay = (a.y / 100) * h;
      
      const radius = Math.max(w, h) * 0.02; // Dynamic radius relative to image size, approx 2%
      
      ctx.fillStyle = KIND_META[a.kind].hex;
      ctx.beginPath();
      ctx.arc(ax, ay, radius, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = `bold ${radius}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.number.toString(), ax, ay);
    });

    const base64 = canvas.toDataURL('image/jpeg', 0.9);
    onSave(base64, annotations);
  };

  const handleDelete = (id: string) => {
    setAnnotations(prev => {
      const filtered = prev.filter(a => a.id !== id);
      // Reassign numbers
      return filtered.map((a, i) => ({ ...a, number: i + 1 }));
    });
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col md:flex-row">
      <div className="flex-1 flex flex-col h-full overflow-hidden p-4">
        <div className="flex items-center justify-between mb-4 bg-slate-900/80 p-3 rounded-2xl border border-slate-800 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-white flex items-center gap-2">
              <MousePointer2 className="w-4 h-4 text-indigo-400" /> 
              点击图片添加标注
            </span>
            <div className="flex items-center gap-2 bg-slate-950 px-2 py-1.5 rounded-xl border border-slate-800">
              {(Object.keys(KIND_META) as AnnotationKind[]).map(kind => (
                <button
                  key={kind}
                  onClick={() => setCurrentKind(kind)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    currentKind === kind 
                      ? `${KIND_META[kind].color} text-white shadow-lg` 
                      : "text-slate-400 hover:bg-slate-800"
                  )}
                >
                  {KIND_META[kind].label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> 完成标注
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-950/50 rounded-2xl border border-slate-800 relative">
          <div 
            ref={containerRef}
            className="relative cursor-crosshair inline-block max-w-full"
            onClick={handleImageClick}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              ref={imgRef}
              src={src} 
              alt="To annotate" 
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              draggable={false}
            />
            {annotations.map(a => (
              <div
                key={a.id}
                onClick={(e) => { e.stopPropagation(); setSelectedId(a.id); }}
                className={clsx(
                  "absolute flex items-center justify-center rounded-full text-white font-bold text-xs transform -translate-x-1/2 -translate-y-1/2 transition-transform cursor-pointer shadow-lg",
                  KIND_META[a.kind].color,
                  selectedId === a.id ? "w-8 h-8 ring-4 ring-white z-20 scale-110" : "w-6 h-6 z-10 hover:scale-110"
                )}
                style={{ left: `${a.x}%`, top: `${a.y}%` }}
              >
                {a.number}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col h-1/3 md:h-full shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">标注列表 ({annotations.length})</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {annotations.length === 0 ? (
            <div className="text-center text-slate-500 text-xs py-8">
              点击左侧图片上的内容进行标注
            </div>
          ) : (
            annotations.map(a => (
              <div 
                key={a.id} 
                className={clsx(
                  "p-3 rounded-xl border transition-all cursor-pointer",
                  selectedId === a.id ? "bg-slate-800 border-indigo-500/50 shadow-md" : "bg-slate-950 border-slate-800 hover:border-slate-700"
                )}
                onClick={() => setSelectedId(a.id)}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={clsx("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white", KIND_META[a.kind].color)}>
                      {a.number}
                    </span>
                    <span className="text-xs font-bold text-slate-300">{KIND_META[a.kind].label}</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {selectedId === a.id ? (
                  <textarea
                    value={a.note}
                    onChange={(e) => {
                      setAnnotations(prev => prev.map(item => item.id === a.id ? { ...item, note: e.target.value } : item));
                    }}
                    placeholder="添加备注(可选)..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none h-16"
                    autoFocus
                  />
                ) : (
                  <div className="text-xs text-slate-500 truncate mt-1">
                    {a.note || "无备注"}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
