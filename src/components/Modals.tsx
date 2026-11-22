import React from 'react';
import { Download, X } from 'lucide-react';
import type { FileObject } from '../types/canvas';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: 'Tools',
    items: [
      ['V', 'Select & multi-select'],
      ['H / Space', 'Hand / Pan canvas'],
      ['P', 'Pen, highlighter & eraser'],
      ['T', 'Text'],
      ['S', 'Sticky note'],
      ['R', 'Shapes'],
      ['A', 'Arrow / Connector'],
      ['C', 'Checklist card'],
      ['K', 'Kanban board'],
      ['G', 'Graph / Function plotter'],
      ['F', 'Named frame / section'],
      ['I', 'Insert image or file'],
    ],
  },
  {
    title: 'Canvas & Editing',
    items: [
      ['Ctrl / ⌘ + F', 'Search board text'],
      ['Ctrl / ⌘ + S', 'Save .vellum.json to disk'],
      ['Ctrl / ⌘ + Z', 'Undo'],
      ['Ctrl / ⌘ + Y', 'Redo'],
      ['Ctrl / ⌘ + C / V', 'Copy & paste (including images)'],
      ['Ctrl / ⌘ + D', 'Duplicate selection'],
      ['Ctrl / ⌘ + G', 'Group selection'],
      ['Ctrl / ⌘ + Shift + G', 'Ungroup'],
      ['[  /  ]', 'Send to back / Bring to front'],
      ['Shift + 1', 'Zoom to fit'],
      ['0', 'Reset zoom to 100%'],
      ['Delete / Backspace', 'Delete selection'],
    ],
  },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#161D27] border border-slate-200 dark:border-[#263142] shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-[#232D3D]">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            aria-label="Close shortcuts dialog"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto vellum-scroll">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
                {group.title}
              </h3>
              <dl className="space-y-1.5">
                {group.items.map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <dt className="text-slate-700 dark:text-slate-300">{desc}</dt>
                    <dd className="font-mono-tabular text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#0F141B] text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-[#263142] whitespace-nowrap shrink-0">
                      {key}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface FilePreviewModalProps {
  file: FileObject | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose }) => {
  if (!file) return null;

  const isPdf = file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isText = file.mimeType.startsWith('text/') || /\.(txt|md|csv|json|js|ts|html|css)$/i.test(file.name);

  let decodedText: string | null = null;
  if (isText && file.dataUrl.includes(',')) {
    try {
      decodedText = atob(file.dataUrl.split(',')[1]);
    } catch {
      decodedText = null;
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.name}`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-[#161D27] border border-slate-200 dark:border-[#263142] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[#232D3D]">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 truncate">
              {file.name}
            </h2>
            <p className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
              {file.mimeType || 'Binary file'} · {Math.max(1, Math.round(file.size / 1024))} KB
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={file.dataUrl}
              download={file.name}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <button
              type="button"
              aria-label="Close file preview"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-[#F7F8FA] dark:bg-[#0F141B] p-4 overflow-auto">
          {isPdf ? (
            <iframe
              src={file.dataUrl}
              title={file.name}
              className="w-full h-full rounded-lg border border-slate-200 dark:border-[#263142] bg-white"
            />
          ) : decodedText !== null ? (
            <pre className="p-4 rounded-lg bg-white dark:bg-[#161D27] border border-slate-200 dark:border-[#263142] text-xs font-mono-tabular text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
              {decodedText}
            </pre>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3 text-slate-500 dark:text-slate-400">
              <p className="text-sm">Inline preview is not available for this file type.</p>
              <a
                href={file.dataUrl}
                download={file.name}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                Download {file.name}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
