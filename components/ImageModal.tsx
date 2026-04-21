'use client';

import { X } from 'lucide-react';

export function ImageModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button 
        className="absolute top-4 right-4 text-white hover:text-slate-300 p-2"
        onClick={onClose}
      >
        <X className="w-8 h-8" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img 
        src={src} 
        alt="Preview" 
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
