import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Check, GripHorizontal, Plus, Trash2 } from 'lucide-react';
import type { ChecklistObject } from '../../types/canvas';
import { uid } from '../../utils/geometry';

interface ChecklistCardProps {
  obj: ChecklistObject;
  isSelected: boolean;
  onUpdate: (next: ChecklistObject, commit?: boolean) => void;
  onSelectStart: (e: React.PointerEvent) => void;
}

export const ChecklistCard: React.FC<ChecklistCardProps> = ({
  obj,
  onUpdate,
  onSelectStart,
}) => {
  const [newItemText, setNewItemText] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const completed = obj.items.filter((i) => i.done).length;
  const total = obj.items.length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

  const toggleItem = (id: string) => {
    onUpdate(
      {
        ...obj,
        items: obj.items.map((item) =>
          item.id === id ? { ...item, done: !item.done } : item
        ),
      },
      true
    );
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    onUpdate(
      {
        ...obj,
        items: [...obj.items, { id: uid('ci'), text: trimmed, done: false }],
      },
      true
    );
    setNewItemText('');
  };

  const removeItem = (id: string) => {
    onUpdate(
      {
        ...obj,
        items: obj.items.filter((i) => i.id !== id),
      },
      true
    );
  };

  const moveItem = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= obj.items.length || fromIdx === toIdx) return;
    const next = [...obj.items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onUpdate({ ...obj, items: next }, true);
  };

  return (
    <div className="w-full h-full flex flex-col rounded-xl bg-white dark:bg-[#161D27] border border-slate-200 dark:border-[#263142] shadow-sm overflow-hidden select-none">
      {/* Header / drag handle */}
      <div
        onPointerDown={onSelectStart}
        className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2 cursor-grab active:cursor-grabbing border-b border-slate-100 dark:border-[#232D3D]"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            aria-label="Checklist title"
            value={obj.title}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => onUpdate({ ...obj, title: e.target.value }, false)}
            onBlur={() => onUpdate(obj, true)}
            className="w-full bg-transparent text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 focus:outline-none truncate"
          />
        </div>
        <span className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          {completed}/{total} · {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-3.5 pt-2">
        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-[#232D3D] overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Items */}
      <div
        className="flex-1 overflow-y-auto vellum-scroll px-2.5 py-2 space-y-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {obj.items.map((item, idx) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => setDragIndex(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) moveItem(dragIndex, idx);
              setDragIndex(null);
            }}
            className="group flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-50 dark:hover:bg-[#1E2736] transition-colors"
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              aria-label={`Toggle "${item.text}"`}
              onClick={() => toggleItem(item.id)}
              className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                item.done
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-300 dark:border-slate-600 hover:border-blue-500'
              }`}
            >
              {item.done && <Check className="w-3 h-3 stroke-[2.5]" />}
            </button>
            <input
              type="text"
              aria-label={`Checklist item ${idx + 1}`}
              value={item.text}
              onChange={(e) =>
                onUpdate(
                  {
                    ...obj,
                    items: obj.items.map((it) =>
                      it.id === item.id ? { ...it, text: e.target.value } : it
                    ),
                  },
                  false
                )
              }
              onBlur={() => onUpdate(obj, true)}
              className={`flex-1 min-w-0 bg-transparent text-[12.5px] focus:outline-none ${
                item.done
                  ? 'line-through text-slate-400 dark:text-slate-500'
                  : 'text-slate-800 dark:text-slate-200'
              }`}
            />
            <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                aria-label={`Move "${item.text}" up`}
                onClick={() => moveItem(idx, idx - 1)}
                disabled={idx === 0}
                className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-25"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                aria-label={`Move "${item.text}" down`}
                onClick={() => moveItem(idx, idx + 1)}
                disabled={idx === obj.items.length - 1}
                className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-25"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                aria-label={`Delete "${item.text}"`}
                onClick={() => removeItem(item.id)}
                className="p-0.5 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add item form */}
      <form
        onSubmit={addItem}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5 px-3 py-2 border-t border-slate-100 dark:border-[#232D3D]"
      >
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          placeholder="Add task..."
          aria-label="New checklist task"
          className="flex-1 min-w-0 bg-transparent text-[12px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Add checklist task"
          className="p-1 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
