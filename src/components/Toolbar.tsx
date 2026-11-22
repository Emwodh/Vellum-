import React from 'react';
import {
  ArrowUpRight,
  BarChart3,
  CheckSquare,
  Circle,
  Columns3,
  Diamond,
  Eraser,
  Frame,
  Hand,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  PenTool,
  Square,
  StickyNote,
  Triangle,
  Type,
} from 'lucide-react';
import {
  FILL_SWATCHES,
  STICKY_PALETTE,
  STROKE_SWATCHES,
  type ConnectorStyle,
  type PenMode,
  type ShapeKind,
  type ToolOptions,
  type ToolType,
} from '../types/canvas';

interface ToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  options: ToolOptions;
  onChangeOptions: (partial: Partial<ToolOptions>) => void;
  onTriggerUpload: () => void;
}

const TOOLS: Array<{
  id: ToolType;
  label: string;
  shortcut: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 },
  { id: 'hand', label: 'Hand', shortcut: 'H', icon: Hand },
  { id: 'pen', label: 'Pen', shortcut: 'P', icon: PenTool },
  { id: 'text', label: 'Text', shortcut: 'T', icon: Type },
  { id: 'sticky', label: 'Sticky Note', shortcut: 'S', icon: StickyNote },
  { id: 'shape', label: 'Shape', shortcut: 'R', icon: Square },
  { id: 'connector', label: 'Arrow', shortcut: 'A', icon: ArrowUpRight },
  { id: 'checklist', label: 'Checklist', shortcut: 'C', icon: CheckSquare },
  { id: 'kanban', label: 'Kanban', shortcut: 'K', icon: Columns3 },
  { id: 'chart', label: 'Graph / Plot', shortcut: 'G', icon: BarChart3 },
  { id: 'frame', label: 'Frame', shortcut: 'F', icon: Frame },
  { id: 'media', label: 'Image / File', shortcut: 'I', icon: ImagePlus },
];

const SHAPE_VARIANTS: Array<{ id: ShapeKind; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'diamond', label: 'Diamond', icon: Diamond },
  { id: 'triangle', label: 'Triangle', icon: Triangle },
  { id: 'line', label: 'Line', icon: Minus },
];

const PEN_MODES: Array<{ id: PenMode; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'pen', label: 'Pen', icon: PenTool },
  { id: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
];

const CONNECTOR_STYLES: Array<{ id: ConnectorStyle; label: string }> = [
  { id: 'curved', label: 'Curved' },
  { id: 'straight', label: 'Straight' },
  { id: 'elbow', label: 'Elbow' },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onSelectTool,
  options,
  onChangeOptions,
  onTriggerUpload,
}) => {
  const showSubBar =
    activeTool === 'pen' ||
    activeTool === 'shape' ||
    activeTool === 'sticky' ||
    activeTool === 'connector' ||
    activeTool === 'text';

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 max-w-[calc(100vw-24px)] pointer-events-none">
      {/* Contextual Tool Sub-Options Bar */}
      {showSubBar && (
        <div className="pointer-events-auto px-2.5 py-1.5 rounded-xl bg-white/95 dark:bg-[#161D27]/95 backdrop-blur-md border border-slate-200/90 dark:border-[#263142] shadow-sm flex items-center gap-2.5 overflow-x-auto no-scrollbar max-w-full">
          {activeTool === 'pen' && (
            <>
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#0F141B] p-0.5 rounded-lg shrink-0">
                {PEN_MODES.map((m) => {
                  const Icon = m.icon;
                  const active = options.penMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-label={m.label}
                      onClick={() => onChangeOptions({ penMode: m.id })}
                      className={`px-2 py-1 rounded-md text-[11.5px] font-medium flex items-center gap-1 transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white dark:bg-[#1E2736] text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {options.penMode !== 'eraser' && (
                <>
                  <div className="w-px h-5 bg-slate-200 dark:bg-[#263142] shrink-0" />
                  <div className="flex items-center gap-1 shrink-0">
                    {STROKE_SWATCHES.slice(0, 7).map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Pen color ${color}`}
                        onClick={() => onChangeOptions({ penColor: color })}
                        className={`w-5 h-5 rounded-full border transition-transform ${
                          options.penColor === color
                            ? 'scale-110 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#161D27] border-transparent'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>

                  <div className="w-px h-5 bg-slate-200 dark:bg-[#263142] shrink-0" />
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    <span className="font-mono-tabular w-5 text-right">{options.penWidth}</span>
                    <input
                      type="range"
                      aria-label="Pen stroke thickness"
                      min={1}
                      max={options.penMode === 'highlighter' ? 32 : 16}
                      value={options.penWidth}
                      onChange={(e) => onChangeOptions({ penWidth: Number(e.target.value) })}
                      className="w-16 accent-blue-600"
                    />
                  </label>

                  <button
                    type="button"
                    aria-pressed={options.penSmooth}
                    onClick={() => onChangeOptions({ penSmooth: !options.penSmooth })}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                      options.penSmooth
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1E2736]'
                    }`}
                  >
                    Smooth
                  </button>
                </>
              )}
            </>
          )}

          {activeTool === 'shape' && (
            <>
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#0F141B] p-0.5 rounded-lg shrink-0">
                {SHAPE_VARIANTS.map((sv) => {
                  const Icon = sv.icon;
                  return (
                    <button
                      key={sv.id}
                      type="button"
                      aria-label={sv.label}
                      title={sv.label}
                      onClick={() => onChangeOptions({ shapeKind: sv.id })}
                      className={`p-1.5 rounded-md transition-colors ${
                        options.shapeKind === sv.id
                          ? 'bg-white dark:bg-[#1E2736] text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
              <div className="w-px h-5 bg-slate-200 dark:bg-[#263142] shrink-0" />
              <div className="flex items-center gap-1 shrink-0" title="Fill color">
                {FILL_SWATCHES.slice(0, 7).map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Shape fill ${color}`}
                    onClick={() => onChangeOptions({ shapeFill: color })}
                    className={`w-5 h-5 rounded-full border transition-transform ${
                      options.shapeFill === color
                        ? 'scale-110 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#161D27]'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                    style={{
                      backgroundColor: color === 'transparent' ? undefined : color,
                      backgroundImage:
                        color === 'transparent'
                          ? 'linear-gradient(45deg, #cbd5e1 25%, transparent 25%, transparent 75%, #cbd5e1 75%)'
                          : undefined,
                      backgroundSize: color === 'transparent' ? '6px 6px' : undefined,
                    }}
                  />
                ))}
              </div>
              <div className="w-px h-5 bg-slate-200 dark:bg-[#263142] shrink-0" />
              <div className="flex items-center gap-1 shrink-0" title="Stroke color">
                {STROKE_SWATCHES.slice(0, 6).map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Shape stroke ${color}`}
                    onClick={() => onChangeOptions({ shapeStroke: color })}
                    className={`w-4 h-4 rounded-sm border transition-transform ${
                      options.shapeStroke === color
                        ? 'scale-110 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#161D27]'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </>
          )}

          {activeTool === 'sticky' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 pr-1 whitespace-nowrap">
                Note color
              </span>
              {STICKY_PALETTE.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  aria-label={`Sticky color ${st.name}`}
                  title={st.name}
                  onClick={() => onChangeOptions({ stickyColor: st.id })}
                  className={`w-5 h-5 rounded-md border transition-transform ${
                    options.stickyColor === st.id
                      ? 'scale-110 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#161D27]'
                      : 'border-black/10'
                  }`}
                  style={{ backgroundColor: st.bg }}
                />
              ))}
            </div>
          )}

          {activeTool === 'connector' && (
            <>
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#0F141B] p-0.5 rounded-lg shrink-0">
                {CONNECTOR_STYLES.map((cs) => (
                  <button
                    key={cs.id}
                    type="button"
                    onClick={() => onChangeOptions({ connectorStyle: cs.id })}
                    className={`px-2 py-1 rounded-md text-[11.5px] font-medium transition-colors whitespace-nowrap ${
                      options.connectorStyle === cs.id
                        ? 'bg-white dark:bg-[#1E2736] text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {cs.label}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-slate-200 dark:bg-[#263142] shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                {STROKE_SWATCHES.slice(0, 6).map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Connector color ${color}`}
                    onClick={() => onChangeOptions({ connectorStroke: color })}
                    className={`w-4 h-4 rounded-full border transition-transform ${
                      options.connectorStroke === color
                        ? 'scale-110 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#161D27]'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </>
          )}

          {activeTool === 'text' && (
            <>
              <div className="flex items-center gap-1 shrink-0">
                {[14, 18, 24, 32].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => onChangeOptions({ textSize: sz })}
                    className={`px-2 py-0.5 rounded text-[11.5px] font-mono-tabular transition-colors ${
                      options.textSize === sz
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-slate-200 dark:bg-[#263142] shrink-0" />
              <button
                type="button"
                onClick={() =>
                  onChangeOptions({
                    textWeight: options.textWeight === '700' ? '400' : '700',
                  })
                }
                className={`px-2 py-0.5 rounded text-[12px] font-bold transition-colors ${
                  options.textWeight === '700'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]'
                }`}
              >
                B
              </button>
              <div className="w-px h-5 bg-slate-200 dark:bg-[#263142] shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                {STROKE_SWATCHES.slice(0, 6).map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Text color ${color}`}
                    onClick={() => onChangeOptions({ textColor: color })}
                    className={`w-4 h-4 rounded-full border transition-transform ${
                      options.textColor === color
                        ? 'scale-110 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#161D27]'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Main Floating Dock */}
      <nav
        aria-label="Canvas tools"
        className="pointer-events-auto px-1.5 py-1.5 rounded-2xl bg-white/95 dark:bg-[#161D27]/95 backdrop-blur-md border border-slate-200/90 dark:border-[#263142] shadow-md flex items-center gap-0.5 overflow-x-auto no-scrollbar max-w-full"
      >
        {TOOLS.map((tool, index) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <React.Fragment key={tool.id}>
              {index === 2 || index === 7 ? (
                <div className="w-px h-6 mx-0.5 bg-slate-200/80 dark:bg-[#263142] shrink-0" />
              ) : null}
              <button
                type="button"
                aria-label={`${tool.label} (${tool.shortcut})`}
                aria-pressed={active}
                title={`${tool.label} (${tool.shortcut})`}
                onClick={() => {
                  if (tool.id === 'media') {
                    onTriggerUpload();
                  } else {
                    onSelectTool(tool.id);
                  }
                }}
                className={`relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span
                  className={`hidden md:block absolute bottom-0.5 right-1 text-[8.5px] font-mono-tabular leading-none ${
                    active ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {tool.shortcut}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
};
