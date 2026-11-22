import React, { useState } from 'react';
import { Download, Eye, FileText, Image as ImageIcon } from 'lucide-react';
import type { FileObject, ImageObject } from '../../types/canvas';

interface ImageCardProps {
  obj: ImageObject;
  onSelectStart: (e: React.PointerEvent) => void;
}

export const ImageCard: React.FC<ImageCardProps> = ({ obj, onSelectStart }) => {
  const [failed, setFailed] = useState(false);

  return (
    <div
      onPointerDown={onSelectStart}
      className="w-full h-full rounded-lg overflow-hidden bg-slate-100 dark:bg-[#161D27] border border-slate-200/70 dark:border-[#263142] shadow-xs select-none"
    >
      {failed ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 p-4">
          <ImageIcon className="w-7 h-7" />
          <span className="text-xs truncate max-w-full">{obj.name}</span>
        </div>
      ) : (
        <img
          src={obj.src}
          alt={obj.name}
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setFailed(true)}
          className="w-full h-full object-fill pointer-events-none"
        />
      )}
    </div>
  );
};

interface FileCardProps {
  obj: FileObject;
  onSelectStart: (e: React.PointerEvent) => void;
  onPreviewFile: (file: FileObject) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const FileCard: React.FC<FileCardProps> = ({ obj, onSelectStart, onPreviewFile }) => {
  const ext = obj.name.includes('.') ? obj.name.split('.').pop()?.toUpperCase() : 'FILE';

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = obj.dataUrl;
    a.download = obj.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div
      onPointerDown={onSelectStart}
      className="w-full h-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#161D27] border border-slate-200 dark:border-[#263142] shadow-sm select-none cursor-grab active:cursor-grabbing"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
          {obj.name}
        </p>
        <p className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
          {ext} · {formatBytes(obj.size)}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label={`Open ${obj.name}`}
          onClick={() => onPreviewFile(obj)}
          className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors"
          title="Preview file"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label={`Download ${obj.name}`}
          onClick={handleDownload}
          className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors"
          title="Download file"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
