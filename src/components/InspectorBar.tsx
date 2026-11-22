import React from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Group,
  Layers,
  Trash2,
  Ungroup,
} from 'lucide-react';
import {
  FILL_SWATCHES,
  FRAME_SWATCHES,
  STICKY_PALETTE,
  STROKE_SWATCHES,
  type CanvasObject,
  type ConnectorStyle,
} from '../types/canvas';
import type { LayerAction } from '../utils/history';

interface InspectorBarProps {
  selectedObjects: CanvasObject[];
  onPatchSelected: (updater: (obj: CanvasObject) => CanvasObject) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReorderLayer: (action: LayerAction) => void;
  onGroup: () => void;
  onUngroup: () => void;
}

export const InspectorBar: React.FC<InspectorBarProps> = ({
  selectedObjects,
  onPatchSelected,
  onDuplicate,
  onDelete,
  onReorderLayer,
  onGroup,
  onUngroup,
}) => {
  if (selectedObjects.length === 0) return null;

  const first = selectedObjects[0];
  const canGroup = selectedObjects.length >= 2;
  const hasGroup = selectedObjects.some((o) => Boolean(o.groupId));

  return (
    <div
      aria-label="Selection inspector"
      className="fixed top-14 sm:top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto px-2 py-1.5 rounded-xl bg-white/95 dark:bg-[#161D27]/95 backdrop-blur-md border border-slate-200/90 dark:border-[#263142] shadow-sm flex items-center gap-1.5 max-w-[calc(100vw-24px)] overflow-x-auto no-scrollbar"
    >
      {/* Object-specific styling controls */}
      {first.type === 'frame' && (
        <div className="flex items-center gap-1 pr-1.5 border-r border-slate-200 dark:border-[#263142] shrink-0">
          {FRAME_SWATCHES.map((sw) => (
            <button
              key={sw.id}
              type="button"
              aria-label={`Set frame color to ${sw.name}`}
              onClick={() =>
                onPatchSelected((o) =>
                  o.type === 'frame'
                    ? { ...o, background: sw.bg, borderColor: sw.border }
                    : o
                )
              }
              className={`w-4 h-4 rounded border ${
                first.borderColor === sw.border
                  ? 'ring-2 ring-blue-500 border-transparent'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
              style={{ backgroundColor: sw.border }}
            />
          ))}
        </div>
      )}

      {first.type === 'sticky' && (
        <div className="flex items-center gap-1 pr-1.5 border-r border-slate-200 dark:border-[#263142] shrink-0">
          {STICKY_PALETTE.map((st) => (
            <button
              key={st.id}
              type="button"
              aria-label={`Change note color to ${st.name}`}
              onClick={() =>
                onPatchSelected((o) =>
                  o.type === 'sticky' ? { ...o, color: st.id } : o
                )
              }
              className={`w-4 h-4 rounded border ${
                first.color === st.id
                  ? 'ring-2 ring-blue-500 border-transparent'
                  : 'border-black/10'
              }`}
              style={{ backgroundColor: st.bg }}
            />
          ))}
        </div>
      )}

      {first.type === 'shape' && (
        <div className="flex items-center gap-1.5 pr-1.5 border-r border-slate-200 dark:border-[#263142] shrink-0">
          <div className="flex items-center gap-1" title="Fill">
            {FILL_SWATCHES.slice(0, 6).map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Set fill ${c}`}
                onClick={() =>
                  onPatchSelected((o) => (o.type === 'shape' ? { ...o, fill: c } : o))
                }
                className={`w-4 h-4 rounded-full border ${
                  first.fill === c
                    ? 'ring-2 ring-blue-500 border-transparent'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
                style={{
                  backgroundColor: c === 'transparent' ? undefined : c,
                  backgroundImage:
                    c === 'transparent'
                      ? 'linear-gradient(45deg, #cbd5e1 25%, transparent 25%, transparent 75%, #cbd5e1 75%)'
                      : undefined,
                  backgroundSize: c === 'transparent' ? '6px 6px' : undefined,
                }}
              />
            ))}
          </div>
          <div className="w-px h-4 bg-slate-200 dark:bg-[#263142]" />
          <div className="flex items-center gap-1" title="Stroke">
            {STROKE_SWATCHES.slice(0, 5).map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Set stroke ${c}`}
                onClick={() =>
                  onPatchSelected((o) => (o.type === 'shape' ? { ...o, stroke: c } : o))
                }
                className={`w-3.5 h-3.5 rounded-sm border ${
                  first.stroke === c
                    ? 'ring-2 ring-blue-500 border-transparent'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}

      {first.type === 'text' && (
        <div className="flex items-center gap-1 pr-1.5 border-r border-slate-200 dark:border-[#263142] shrink-0">
          {[14, 18, 24, 32].map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() =>
                onPatchSelected((o) => (o.type === 'text' ? { ...o, fontSize: sz } : o))
              }
              className={`px-1.5 py-0.5 rounded text-[11px] font-mono-tabular ${
                first.fontSize === sz
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]'
              }`}
            >
              {sz}
            </button>
          ))}
          <button
            type="button"
            aria-label="Toggle bold text"
            onClick={() =>
              onPatchSelected((o) =>
                o.type === 'text'
                  ? { ...o, fontWeight: o.fontWeight === '700' ? '400' : '700' }
                  : o
              )
            }
            className={`px-1.5 py-0.5 rounded text-[11.5px] font-bold ${
              first.fontWeight === '700'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]'
            }`}
          >
            B
          </button>
          {STROKE_SWATCHES.slice(0, 5).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Set text color ${c}`}
              onClick={() =>
                onPatchSelected((o) => (o.type === 'text' ? { ...o, color: c } : o))
              }
              className={`w-3.5 h-3.5 rounded-full border ${
                first.color === c
                  ? 'ring-2 ring-blue-500 border-transparent'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      {first.type === 'connector' && (
        <div className="flex items-center gap-1 pr-1.5 border-r border-slate-200 dark:border-[#263142] shrink-0">
          {(['curved', 'straight', 'elbow'] as ConnectorStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() =>
                onPatchSelected((o) => (o.type === 'connector' ? { ...o, style } : o))
              }
              className={`px-1.5 py-0.5 rounded text-[11px] capitalize ${
                first.style === style
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]'
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      )}

      {first.type === 'pen' && (
        <div className="flex items-center gap-1 pr-1.5 border-r border-slate-200 dark:border-[#263142] shrink-0">
          {STROKE_SWATCHES.slice(0, 6).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Set ink color ${c}`}
              onClick={() =>
                onPatchSelected((o) => (o.type === 'pen' ? { ...o, color: c } : o))
              }
              className={`w-4 h-4 rounded-full border ${
                first.color === c
                  ? 'ring-2 ring-blue-500 border-transparent'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      {/* Layer Order */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          aria-label="Bring to front"
          title="Bring to Front (])"
          onClick={() => onReorderLayer('front')}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
        >
          <ArrowUpToLine className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Send to back"
          title="Send to Back ([)"
          onClick={() => onReorderLayer('back')}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Group / Ungroup */}
      {(canGroup || hasGroup) && (
        <div className="flex items-center gap-0.5 pl-1 border-l border-slate-200 dark:border-[#263142] shrink-0">
          {canGroup && (
            <button
              type="button"
              aria-label="Group selection"
              title="Group (Ctrl+G)"
              onClick={onGroup}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
            >
              <Group className="w-3.5 h-3.5" />
            </button>
          )}
          {hasGroup && (
            <button
              type="button"
              aria-label="Ungroup selection"
              title="Ungroup (Ctrl+Shift+G)"
              onClick={onUngroup}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
            >
              <Ungroup className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Duplicate & Delete */}
      <div className="flex items-center gap-0.5 pl-1 border-l border-slate-200 dark:border-[#263142] shrink-0">
        {selectedObjects.length > 1 && (
          <span className="px-1.5 text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {selectedObjects.length}
          </span>
        )}
        <button
          type="button"
          aria-label="Duplicate selection"
          title="Duplicate (Ctrl+D)"
          onClick={onDuplicate}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Delete selection"
          title="Delete (Del)"
          onClick={onDelete}
          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
