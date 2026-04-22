'use client';

import React, { useState, useRef, MouseEvent, useEffect } from 'react';
import { X, Check, Trash2, MapPin, ZoomIn, ZoomOut, RotateCw, MousePointer2, Square, PenTool, Image as ImageIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { v4 as uuidv4 } from 'uuid';

export type AnnotationKind = 'mistake' | 'memory' | 'explain' | 'focus';
export type AnnotationTool = 'point' | 'rect' | 'brush';

export type ImageAnnotation = {
  id: string;
  kind: AnnotationKind;
  note: string;
  number: number;
  tool: AnnotationTool;
  
  // For point
  x?: number; // percentage 0-100
  y?: number; // percentage 0-100

  // For rect
  rX?: number;
  rY?: number;
  rW?: number;
  rH?: number;

  // For brush
  path?: {x: number, y: number}[];
};

interface ImageAnnotatorProps {
  src: string;
  initialAnnotations?: ImageAnnotation[];
  onSave: (annotatedImageBase64: string, annotations: ImageAnnotation[], cutouts?: string[]) => void;
  onCancel: () => void;
}

const KIND_META: Record<AnnotationKind, { label: string, color: string, hex: string }> = {
  mistake: { label: '错题', color: 'bg-rose-500', hex: '#f43f5e' },
  memory: { label: '记忆', color: 'bg-emerald-500', hex: '#10b981' },
  explain: { label: '需解释', color: 'bg-amber-500', hex: '#f59e0b' },
  focus: { label: '重点', color: 'bg-sky-500', hex: '#0ea5e9' },
};

const TOOL_META: Record<AnnotationTool, { label: string, icon: React.FC<any> }> = {
  point: { label: '打点', icon: MousePointer2 },
  rect: { label: '框选', icon: Square },
  brush: { label: '涂抹', icon: PenTool },
};

export function ImageAnnotator({ src, initialAnnotations = [], onSave, onCancel }: ImageAnnotatorProps) {
  const [annotations, setAnnotations] = useState<ImageAnnotation[]>(initialAnnotations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentKind, setCurrentKind] = useState<AnnotationKind>('mistake');
  const [currentTool, setCurrentTool] = useState<AnnotationTool>('point');
  const [generateCutouts, setGenerateCutouts] = useState(false);
  
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); 
  const [iconSize, setIconSize] = useState(24); 
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanMode, setIsPanMode] = useState(false);
  const [startDrag, setStartDrag] = useState({ x: 0, y: 0 });

  const [activeRect, setActiveRect] = useState<{start: {x:number, y:number}, current: {x:number, y:number}} | null>(null);
  const [activePath, setActivePath] = useState<{x:number, y:number}[] | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getLocalCoords = (e: React.PointerEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    
    const rad = (-rotation * Math.PI) / 180;
    
    const rdx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const rdy = dx * Math.sin(rad) + dy * Math.cos(rad);
    
    const unzoomedX = rdx / zoom;
    const unzoomedY = rdy / zoom;
    
    const w = imgRef.current.clientWidth;
    const h = imgRef.current.clientHeight;
    
    const localX = unzoomedX + w / 2;
    const localY = unzoomedY + h / 2;
    
    return {
      x: Math.max(0, Math.min(100, (localX / w) * 100)),
      y: Math.max(0, Math.min(100, (localY / h) * 100))
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.shiftKey) {
      setIsPanMode(true);
      setStartDrag({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      return;
    }
    
    setIsPanMode(false);

    if ((e.target as HTMLElement).closest('.annotation-marker')) {
       return;
    }

    const coords = getLocalCoords(e);

    if (currentTool === 'point') {
      const newAnnotation: ImageAnnotation = {
        id: uuidv4(),
        tool: 'point',
        kind: currentKind,
        x: coords.x,
        y: coords.y,
        note: '',
        number: annotations.length + 1,
      };
      setAnnotations([...annotations, newAnnotation]);
      setSelectedId(newAnnotation.id);
    } else if (currentTool === 'rect') {
      setActiveRect({ start: coords, current: coords });
    } else if (currentTool === 'brush') {
      setActivePath([coords]);
      // set pointer capture to handle drawing reliably
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanMode) {
      setOffset({
        x: e.clientX - startDrag.x,
        y: e.clientY - startDrag.y
      });
      return;
    }

    if (activeRect) {
      setActiveRect({ start: activeRect.start, current: getLocalCoords(e) });
    } else if (activePath) {
      setActivePath([...activePath, getLocalCoords(e)]);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanMode) {
      setIsPanMode(false);
      return;
    }

    if (activeRect) {
      const rX = Math.min(activeRect.start.x, activeRect.current.x);
      const rY = Math.min(activeRect.start.y, activeRect.current.y);
      const rW = Math.abs(activeRect.start.x - activeRect.current.x);
      const rH = Math.abs(activeRect.start.y - activeRect.current.y);

      if (rW > 2 && rH > 2) {
        const newAnn: ImageAnnotation = {
          id: uuidv4(),
          tool: 'rect',
          kind: currentKind,
          rX, rY, rW, rH,
          note: '',
          number: annotations.length + 1,
        };
        setAnnotations([...annotations, newAnn]);
        setSelectedId(newAnn.id);
      }
      setActiveRect(null);
    }

    if (activePath) {
      if (activePath.length > 2) {
        const newAnn: ImageAnnotation = {
          id: uuidv4(),
          tool: 'brush',
          kind: currentKind,
          path: activePath,
          note: '',
          number: annotations.length + 1,
        };
        setAnnotations([...annotations, newAnn]);
        setSelectedId(newAnn.id);
      }
      setActivePath(null);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const handleSave = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || !imgRef.current) return;

    const w = imgRef.current.naturalWidth;
    const h = imgRef.current.naturalHeight;

    if (rotation === 90 || rotation === 270) {
      canvas.width = h;
      canvas.height = w;
    } else {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(imgRef.current, -w / 2, -h / 2, w, h);

    const transformPt = (px: number, py: number) => {
      let finalX = (px / 100) * w;
      let finalY = (py / 100) * h;
      return { x: finalX - w/2, y: finalY - h/2 };
    };

    let cutouts: string[] = [];

    annotations.forEach(a => {
      const colorHex = KIND_META[a.kind].hex;
      
      if (a.tool === 'point' && a.x !== undefined && a.y !== undefined) {
        const pt = transformPt(a.x, a.y);
        const radius = iconSize * (w / imgRef.current!.clientWidth);
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.fillStyle = colorHex;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius / 2, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'white';
        ctx.font = `bold ${radius * 0.4}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(a.number.toString(), pt.x, pt.y);
      } 
      else if (a.tool === 'rect' && a.rX !== undefined && a.rY !== undefined && a.rW !== undefined && a.rH !== undefined) {
        let finalX = (a.rX / 100) * w - w/2;
        let finalY = (a.rY / 100) * h - h/2;
        let finalW = (a.rW / 100) * w;
        let finalH = (a.rH / 100) * h;
        
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 4 * (w / imgRef.current!.clientWidth);
        ctx.strokeRect(finalX, finalY, finalW, finalH);
        ctx.fillStyle = colorHex + '33'; 
        ctx.fillRect(finalX, finalY, finalW, finalH);

        const radius = iconSize * (w / imgRef.current!.clientWidth);
        ctx.fillStyle = colorHex;
        ctx.beginPath();
        ctx.arc(finalX + finalW, finalY, radius / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = `bold ${radius * 0.4}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(a.number.toString(), finalX + finalW, finalY);

        if (generateCutouts) {
          try {
            const sx = (a.rX / 100) * w;
            const sy = (a.rY / 100) * h;
            const sW = (a.rW / 100) * w;
            const sH = (a.rH / 100) * h;
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = sW;
            sliceCanvas.height = sH;
            sliceCanvas.getContext('2d')?.drawImage(imgRef.current!, sx, sy, sW, sH, 0, 0, sW, sH);
            cutouts.push(sliceCanvas.toDataURL('image/jpeg', 0.9));
          } catch(e) {}
        }
      } 
      else if (a.tool === 'brush' && a.path && a.path.length > 0) {
        ctx.strokeStyle = colorHex + '80'; // 50% opacity
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 12 * (w / imgRef.current!.clientWidth);
        
        ctx.beginPath();
        const start = transformPt(a.path[0].x, a.path[0].y);
        ctx.moveTo(start.x, start.y);
        a.path.slice(1).forEach(pt => {
          const tp = transformPt(pt.x, pt.y);
          ctx.lineTo(tp.x, tp.y);
        });
        ctx.stroke();

        const end = transformPt(a.path[a.path.length - 1].x, a.path[a.path.length - 1].y);
        const radius = iconSize * (w / imgRef.current!.clientWidth);
        ctx.fillStyle = colorHex;
        ctx.beginPath();
        ctx.arc(end.x, end.y, radius / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = `bold ${radius * 0.4}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(a.number.toString(), end.x, end.y);

        if (generateCutouts) {
           let minX = 100, minY = 100, maxX = 0, maxY = 0;
           a.path.forEach(pt => {
             if (pt.x < minX) minX = pt.x;
             if (pt.x > maxX) maxX = pt.x;
             if (pt.y < minY) minY = pt.y;
             if (pt.y > maxY) maxY = pt.y;
           });
           try {
              const sx = (minX / 100) * w;
              const sy = (minY / 100) * h;
              const sW = ((maxX - minX) / 100) * w;
              const sH = ((maxY - minY) / 100) * h;
              if (sW > 2 && sH > 2) {
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = sW;
                sliceCanvas.height = sH;
                sliceCanvas.getContext('2d')?.drawImage(imgRef.current!, sx, sy, sW, sH, 0, 0, sW, sH);
                cutouts.push(sliceCanvas.toDataURL('image/jpeg', 0.9));
              }
           } catch(e) {}
        }
      }
    });

    ctx.restore();

    const base64 = canvas.toDataURL('image/jpeg', 0.9);
    onSave(base64, annotations, cutouts);
  };

  const handleDelete = (id: string) => {
    setAnnotations(prev => {
      const filtered = prev.filter(a => a.id !== id);
      return filtered.map((a, i) => ({ ...a, number: i + 1 }));
    });
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col md:flex-row overflow-hidden select-none">
      <div className="flex-1 flex flex-col h-full overflow-hidden p-2 md:p-4">
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex flex-wrap items-center justify-between bg-slate-900/80 p-2 md:p-3 rounded-2xl border border-slate-800 backdrop-blur-md shadow-2xl gap-3">
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-1.5 rounded-xl border border-slate-800">
                {(Object.keys(TOOL_META) as AnnotationTool[]).map(tool => {
                  const ToolIcon = TOOL_META[tool].icon;
                  return (
                    <button
                      key={tool}
                      onClick={() => setCurrentTool(tool)}
                      className={clsx(
                        "px-2 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all",
                        currentTool === tool ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      <ToolIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">{TOOL_META[tool].label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 bg-slate-950 px-2 py-1.5 rounded-xl border border-slate-800">
                {(Object.keys(KIND_META) as AnnotationKind[]).map(kind => (
                  <button
                    key={kind}
                    onClick={() => setCurrentKind(kind)}
                    className={clsx(
                      "px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap",
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

            <div className="flex flex-wrap items-center gap-2">
              <label title="仅对画框和涂抹生效" className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors">
                <input 
                   type="checkbox" 
                   checked={generateCutouts} 
                   onChange={e => setGenerateCutouts(e.target.checked)} 
                   className="hidden" 
                />
                <div className={clsx("w-3.5 h-3.5 rounded border flex items-center justify-center transition-all", generateCutouts ? 'border-indigo-500 bg-indigo-500' : 'border-slate-600 bg-slate-950')}>
                  {generateCutouts && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-slate-300">伴随切割提取</span>
              </label>

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button onClick={() => setZoom(z => Math.min(Math.max(zoom - 0.1, 0.5), 5))} className="p-1.5 text-slate-400 hover:text-white rounded-lg"><ZoomOut className="w-4 h-4" /></button>
                <button onClick={() => setZoom(1)} className="px-2 text-[10px] font-bold text-slate-500 hover:text-white">{Math.round(zoom * 100)}%</button>
                <button onClick={() => setZoom(z => Math.min(Math.max(zoom + 0.1, 0.5), 5))} className="p-1.5 text-slate-400 hover:text-white rounded-lg"><ZoomIn className="w-4 h-4" /></button>
                <div className="w-[1px] h-4 bg-slate-800 mx-1" />
                <button onClick={() => setRotation(r => (r + 90)%360)} className="p-1.5 text-slate-400 hover:text-white rounded-lg"><RotateCw className="w-4 h-4" /></button>
              </div>

              <button onClick={onCancel} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors">
                取消
              </button>
              <button onClick={handleSave} className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg transition-colors flex items-center gap-1.5">
                <Check className="w-4 h-4" /> 
                <span className="hidden sm:inline">完成并保存</span>
              </button>
            </div>
          </div>
        </div>
        
        <div 
          className="flex-1 overflow-hidden flex items-center justify-center bg-transparent rounded-2xl border border-slate-800/50 relative cursor-crosshair touch-none"
        >
          <div 
            ref={containerRef}
            className="relative cursor-crosshair transition-transform duration-75 ease-out inline-block"
            style={{ 
              transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
              transformOrigin: 'center center'
            }}
          >
            <div 
              className="absolute inset-0 z-10"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerOut={handlePointerUp}
              onContextMenu={e => e.preventDefault()}
            />

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              ref={imgRef}
              src={src} 
              alt="To annotate" 
              className="max-w-[85vw] max-h-[75vh] object-contain rounded-lg shadow-2xl pointer-events-none"
              draggable={false}
            />
            
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
              viewBox="0 0 100 100" 
              preserveAspectRatio="none"
              style={{ overflow: 'visible' }}
            >
              {activeRect && (
                <rect 
                  x={Math.min(activeRect.start.x, activeRect.current.x)}
                  y={Math.min(activeRect.start.y, activeRect.current.y)}
                  width={Math.abs(activeRect.start.x - activeRect.current.x)}
                  height={Math.abs(activeRect.start.y - activeRect.current.y)}
                  fill={`${KIND_META[currentKind].hex}33`}
                  stroke={KIND_META[currentKind].hex}
                  strokeWidth="0.5"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {activePath && activePath.length > 0 && (
                <polyline 
                  points={activePath.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={`${KIND_META[currentKind].hex}80`}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {annotations.map(a => {
                if (a.tool === 'rect') {
                  return (
                    <rect 
                      key={`r-${a.id}`}
                      x={a.rX} y={a.rY} width={a.rW} height={a.rH}
                      fill={`${KIND_META[a.kind].hex}33`}
                      stroke={KIND_META[a.kind].hex}
                      strokeWidth="0.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }
                if (a.tool === 'brush') {
                  return (
                    <polyline 
                      key={`b-${a.id}`}
                      points={a.path?.map(p => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke={`${KIND_META[a.kind].hex}80`}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }
                return null;
              })}
            </svg>

            {annotations.map(a => {
              let posLeft = a.x;
              let posTop = a.y;

              if (a.tool === 'rect') {
                posLeft = (a.rX || 0) + (a.rW || 0);
                posTop = a.rY || 0;
              } else if (a.tool === 'brush') {
                const lp = a.path && a.path.length > 0 ? a.path[a.path.length - 1] : {x:0,y:0};
                posLeft = lp.x;
                posTop = lp.y;
              }

              return (
                <div
                  key={`m-${a.id}`}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(a.id); }}
                  className={clsx(
                    "absolute flex items-center justify-center rounded-full text-white font-bold transition-all cursor-pointer shadow-xl border-2 border-white/50 annotation-marker",
                    KIND_META[a.kind].color,
                    selectedId === a.id ? "ring-2 ring-white z-30 scale-125" : "z-20 hover:scale-110"
                  )}
                  style={{ 
                    left: `${posLeft}%`, 
                    top: `${posTop}%`, 
                    width: `${iconSize}px`, 
                    height: `${iconSize}px`,
                    fontSize: `${iconSize * 0.4}px`,
                    transform: `translate(-50%, -50%) rotate(${-rotation}deg)` 
                  }}
                >
                  {a.number}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col h-1/3 md:h-full shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">标注列表 ({annotations.length})</h3>
          </div>
          {annotations.length > 0 && (
            <button onClick={() => setAnnotations([])} className="text-[10px] text-slate-500 hover:text-rose-400 uppercase tracking-widest font-bold">清空</button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {annotations.length === 0 ? (
            <div className="text-center flex flex-col items-center gap-3 text-slate-500 py-12">
              <ImageIcon className="w-8 h-8 opacity-20" />
              <div className="text-xs">选择工具在图片上进行标点、框选或涂抹</div>
              <div className="text-[10px] text-slate-600 px-4 mt-2">按住 Shift / 鼠标中键拖拽可平移画布</div>
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
                    <span className={clsx("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", KIND_META[a.kind].color)}>
                      {a.number}
                    </span>
                    <span className="text-xs font-bold text-slate-300">
                      {TOOL_META[a.tool]?.label || '标注'} · {KIND_META[a.kind].label}
                    </span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }} className="text-slate-600 hover:text-rose-400 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea 
                  value={a.note}
                  onChange={(e) => setAnnotations(prev => prev.map(x => x.id === a.id ? { ...x, note: e.target.value } : x))}
                  placeholder="补充说明 (可选)..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                  rows={2}
                  onClick={e => e.stopPropagation()}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
