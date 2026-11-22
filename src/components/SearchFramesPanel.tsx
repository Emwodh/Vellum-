import React, { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Frame, Plus, Search, X } from 'lucide-react';
import type { FrameObject } from '../types/canvas';
import type { SearchMatch } from '../utils/search';

interface SearchBarProps {
  open: boolean;
  query: string;
  matches: SearchMatch[];
  activeIndex: number;
  onQueryChange: (q: string) => void;
  onSelectMatch: (index: number) => void;
  onClose: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  open,
  query,
  matches,
  activeIndex,
  onQueryChange,
  onSelectMatch,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open]);

  if (!open) return null;

  const stepMatch = (delta: number) => {
    if (matches.length === 0) return;
    const next = (activeIndex + delta + matches.length) % matches.length;
    onSelectMatch(next);
  };

  return (
    <div
      role="search"
      aria-label="Search board text"
      className="fixed top-14 right-3 z-40 w-[min(340px,calc(100vw-24px))] rounded-xl bg-white/96 dark:bg-[#161D27]/96 backdrop-blur-md border border-slate-200 dark:border-[#263142] shadow-lg overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-[#232D3D]">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          aria-label="Search text on board"
          value={query}
          placeholder="Find text on board..."
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              stepMatch(e.shiftKey ? -1 : 1);
            }
          }}
          className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
        />
        {query.trim() && (
          <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
            {matches.length > 0 ? `${activeIndex + 1}/${matches.length}` : '0/0'}
          </span>
        )}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            aria-label="Previous search match"
            disabled={matches.length === 0}
            onClick={() => stepMatch(-1)}
            className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1E2736] disabled:opacity-30"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next search match"
            disabled={matches.length === 0}
            onClick={() => stepMatch(1)}
            className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1E2736] disabled:opacity-30"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {query.trim() && (
        <div className="max-h-56 overflow-y-auto vellum-scroll p-1.5">
          {matches.length === 0 ? (
            <div className="px-2.5 py-3 text-center text-[12px] text-slate-400">
              No matching text on this board.
            </div>
          ) : (
            <div className="space-y-0.5">
              {matches.map((m, idx) => (
                <button
                  key={`${m.objectId}_${idx}`}
                  type="button"
                  onClick={() => onSelectMatch(idx)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors ${
                    idx === activeIndex
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-slate-50 dark:hover:bg-[#1E2736] text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                    {m.title}
                  </div>
                  <div className="text-[12.5px] truncate">{m.snippet}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface FramesPopoverProps {
  open: boolean;
  frames: FrameObject[];
  onJumpToFrame: (frame: FrameObject) => void;
  onAddFrame: () => void;
  onClose: () => void;
}

export const FramesPopover: React.FC<FramesPopoverProps> = ({
  open,
  frames,
  onJumpToFrame,
  onAddFrame,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Board frames"
      className="fixed top-14 right-3 z-40 w-64 rounded-xl bg-white/96 dark:bg-[#161D27]/96 backdrop-blur-md border border-slate-200 dark:border-[#263142] shadow-lg p-2"
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 dark:border-[#232D3D]">
        <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
          <Frame className="w-3.5 h-3.5 text-slate-400" />
          Frames ({frames.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onAddFrame();
              onClose();
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 whitespace-nowrap"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
          <button
            type="button"
            aria-label="Close frames panel"
            onClick={onClose}
            className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-1.5 max-h-60 overflow-y-auto vellum-scroll space-y-0.5">
        {frames.length === 0 ? (
          <div className="px-2.5 py-4 text-center">
            <p className="text-[12px] text-slate-400">
              No named frames yet. Press <span className="font-mono-tabular">F</span> to draw a section frame.
            </p>
          </div>
        ) : (
          frames.map((frame, idx) => (
            <button
              key={frame.id}
              type="button"
              onClick={() => {
                onJumpToFrame(frame);
                onClose();
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-[12.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736] transition-colors"
            >
              <span className="truncate font-medium">{frame.title || `Frame ${idx + 1}`}</span>
              <span className="font-mono-tabular text-[10.5px] text-slate-400 shrink-0">
                {Math.round(frame.width)}×{Math.round(frame.height)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
