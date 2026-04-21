import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '@/lib/store';
import { Loader2 } from 'lucide-react';
import { loadPdfJs } from '@/lib/file-parsers';

export function TextbookPagePreview({ textbookId, pageNumber }: { textbookId: string, pageNumber: number }) {
  const { state } = useAppContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const textbook = state.textbooks.find(t => t.id === textbookId);

  useEffect(() => {
    let isMounted = true;
    
    const renderPage = async () => {
      if (!textbook) {
        setError('课本未找到');
        setIsRendering(false);
        return;
      }

      try {
        if (textbook.fileType === 'application/pdf' && textbook.fileId) {
          const { loadFile } = await import('@/lib/store');
          const buffer = await loadFile(textbook.fileId);
          if (buffer && isMounted) {
            const pdfjsLib = await loadPdfJs();
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            if (pdfjsLib) {
              const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
              const page = await doc.getPage(pageNumber);
              const viewport = page.getViewport({ scale: 1.0 });
              const canvas = canvasRef.current;
              if (canvas && isMounted) {
                const context = canvas.getContext('2d');
                if (context) {
                  canvas.height = viewport.height;
                  canvas.width = viewport.width;
                  await page.render({ canvasContext: context, viewport }).promise;
                }
              }
            }
          }
        } else {
          // It's a docx or image, we might have imageUrl stored in the page
          const page = textbook.pages.find(p => p.pageNumber === pageNumber);
          if (page && page.imageUrl) {
            const canvas = canvasRef.current;
            if (canvas && isMounted) {
              const ctx = canvas.getContext('2d');
              const img = new Image();
              img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx?.drawImage(img, 0, 0);
              };
              img.src = page.imageUrl;
            }
          } else {
            setError('无法预览该页面');
          }
        }
      } catch (e) {
        console.error('Failed to render preview', e);
        if (isMounted) setError('渲染失败');
      } finally {
        if (isMounted) setIsRendering(false);
      }
    };

    renderPage();

    return () => { isMounted = false; };
  }, [textbookId, pageNumber, textbook]);

  if (error) {
    return <div className="text-xs text-red-400 p-2 border border-red-900 rounded bg-red-950/50">{error}</div>;
  }

  return (
    <div className="relative border border-slate-700 rounded-lg overflow-hidden bg-slate-800 my-2 max-w-sm">
      <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-700 text-xs font-medium text-slate-400 flex justify-between items-center">
        <span>{textbook?.name || '课本'}</span>
        <span>第 {pageNumber} 页</span>
      </div>
      <div className="relative">
        <canvas ref={canvasRef} className="w-full h-auto" />
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          </div>
        )}
      </div>
    </div>
  );
}
