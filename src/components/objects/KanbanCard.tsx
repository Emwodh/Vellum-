import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, GripHorizontal, Plus, Trash2, X } from 'lucide-react';
import type { KanbanObject } from '../../types/canvas';
import { uid } from '../../utils/geometry';

interface KanbanCardProps {
  obj: KanbanObject;
  isSelected: boolean;
  onUpdate: (next: KanbanObject, commit?: boolean) => void;
  onSelectStart: (e: React.PointerEvent) => void;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  obj,
  onUpdate,
  onSelectStart,
}) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dragPayload, setDragPayload] = useState<{ fromColId: string; cardId: string } | null>(null);
  const [hoverColId, setHoverColId] = useState<string | null>(null);

  const addColumn = () => {
    onUpdate(
      {
        ...obj,
        columns: [
          ...obj.columns,
          { id: uid('col'), title: `Column ${obj.columns.length + 1}`, cards: [] },
        ],
      },
      true
    );
  };

  const removeColumn = (colId: string) => {
    if (obj.columns.length <= 1) return;
    onUpdate(
      {
        ...obj,
        columns: obj.columns.filter((c) => c.id !== colId),
      },
      true
    );
  };

  const addCard = (colId: string, e: React.FormEvent) => {
    e.preventDefault();
    const title = (drafts[colId] ?? '').trim();
    if (!title) return;
    onUpdate(
      {
        ...obj,
        columns: obj.columns.map((col) =>
          col.id === colId
            ? { ...col, cards: [...col.cards, { id: uid('kc'), title }] }
            : col
        ),
      },
      true
    );
    setDrafts((prev) => ({ ...prev, [colId]: '' }));
  };

  const removeCard = (colId: string, cardId: string) => {
    onUpdate(
      {
        ...obj,
        columns: obj.columns.map((col) =>
          col.id === colId
            ? { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
            : col
        ),
      },
      true
    );
  };

  const moveCard = (fromColId: string, toColId: string, cardId: string) => {
    if (fromColId === toColId) return;
    const sourceCol = obj.columns.find((c) => c.id === fromColId);
    const card = sourceCol?.cards.find((c) => c.id === cardId);
    if (!card) return;
    onUpdate(
      {
        ...obj,
        columns: obj.columns.map((col) => {
          if (col.id === fromColId) {
            return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
          }
          if (col.id === toColId) {
            return { ...col, cards: [...col.cards, card] };
          }
          return col;
        }),
      },
      true
    );
  };

  return (
    <div className="w-full h-full flex flex-col rounded-xl bg-white dark:bg-[#161D27] border border-slate-200 dark:border-[#263142] shadow-sm overflow-hidden select-none">
      {/* Header drag bar */}
      <div
        onPointerDown={onSelectStart}
        className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-grab active:cursor-grabbing border-b border-slate-100 dark:border-[#232D3D]"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            aria-label="Kanban board title"
            value={obj.title}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => onUpdate({ ...obj, title: e.target.value }, false)}
            onBlur={() => onUpdate(obj, true)}
            className="w-full bg-transparent text-[14px] font-semibold text-slate-900 dark:text-slate-100 focus:outline-none truncate"
          />
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={addColumn}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11.5px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-[#1E2736] rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3 h-3" />
          Column
        </button>
      </div>

      {/* Columns */}
      <div
        className="flex-1 flex gap-2.5 p-3 overflow-x-auto vellum-scroll"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {obj.columns.map((col, colIdx) => (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setHoverColId(col.id);
            }}
            onDragLeave={() => setHoverColId(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragPayload) {
                moveCard(dragPayload.fromColId, col.id, dragPayload.cardId);
              }
              setDragPayload(null);
              setHoverColId(null);
            }}
            className={`flex-1 min-w-[148px] flex flex-col rounded-lg bg-[#F7F8FA] dark:bg-[#0F141B] border transition-colors ${
              hoverColId === col.id
                ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                : 'border-slate-200/80 dark:border-[#232D3D]'
            }`}
          >
            {/* Column header */}
            <div className="flex items-center justify-between gap-1 px-2.5 py-2 border-b border-slate-200/60 dark:border-[#1E2736]">
              <input
                type="text"
                aria-label={`Column ${colIdx + 1} title`}
                value={col.title}
                onChange={(e) =>
                  onUpdate(
                    {
                      ...obj,
                      columns: obj.columns.map((c) =>
                        c.id === col.id ? { ...c, title: e.target.value } : c
                      ),
                    },
                    false
                  )
                }
                onBlur={() => onUpdate(obj, true)}
                className="w-full min-w-0 bg-transparent text-[12px] font-semibold text-slate-700 dark:text-slate-300 focus:outline-none truncate"
              />
              <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                {col.cards.length}
              </span>
              {obj.columns.length > 1 && (
                <button
                  type="button"
                  aria-label={`Delete column ${col.title}`}
                  onClick={() => removeColumn(col.id)}
                  className="p-0.5 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Cards list */}
            <div className="flex-1 overflow-y-auto vellum-scroll p-2 space-y-1.5">
              {col.cards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => setDragPayload({ fromColId: col.id, cardId: card.id })}
                  onDragEnd={() => {
                    setDragPayload(null);
                    setHoverColId(null);
                  }}
                  className="group p-2 rounded-md bg-white dark:bg-[#161D27] border border-slate-200/80 dark:border-[#263142] cursor-grab active:cursor-grabbing hover:border-blue-400/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[12px] leading-snug text-slate-800 dark:text-slate-100 break-words">
                      {card.title}
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete card "${card.title}"`}
                      onClick={() => removeCard(col.id, card.id)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-slate-400 hover:text-red-500 shrink-0 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {card.note && (
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {card.note}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {colIdx > 0 && (
                      <button
                        type="button"
                        aria-label={`Move "${card.title}" left`}
                        onClick={() => moveCard(col.id, obj.columns[colIdx - 1].id, card.id)}
                        className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
                      >
                        <ArrowLeft className="w-3 h-3" />
                      </button>
                    )}
                    {colIdx < obj.columns.length - 1 && (
                      <button
                        type="button"
                        aria-label={`Move "${card.title}" right`}
                        onClick={() => moveCard(col.id, obj.columns[colIdx + 1].id, card.id)}
                        className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
                      >
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add card form */}
            <form
              onSubmit={(e) => addCard(col.id, e)}
              className="flex items-center gap-1 p-1.5 border-t border-slate-200/60 dark:border-[#1E2736]"
            >
              <input
                type="text"
                value={drafts[col.id] ?? ''}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [col.id]: e.target.value }))
                }
                placeholder="Add card..."
                aria-label={`Add card to ${col.title}`}
                className="flex-1 min-w-0 px-1.5 py-1 text-[11.5px] bg-transparent text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                aria-label={`Submit card to ${col.title}`}
                className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
};
