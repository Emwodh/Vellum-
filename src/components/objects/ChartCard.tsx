import React, { useMemo, useState } from 'react';
import { GripHorizontal, SlidersHorizontal, X } from 'lucide-react';
import type { ChartObject, ChartType } from '../../types/canvas';
import { compileFormula, parseChartCsv } from '../../utils/mathParser';

interface ChartCardProps {
  obj: ChartObject;
  isSelected: boolean;
  onUpdate: (next: ChartObject, commit?: boolean) => void;
  onSelectStart: (e: React.PointerEvent) => void;
}

const CHART_TYPES: Array<{ id: ChartType; label: string }> = [
  { id: 'line', label: 'Line' },
  { id: 'bar', label: 'Bar' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'pie', label: 'Pie' },
  { id: 'function', label: 'f(x)' },
];

const SERIES_COLORS = ['#2563EB', '#0D9488', '#D97706', '#7C3AED', '#DC2626'];

export const ChartCard: React.FC<ChartCardProps> = ({
  obj,
  onUpdate,
  onSelectStart,
}) => {
  const [editing, setEditing] = useState(false);

  const parsedCsv = useMemo(() => parseChartCsv(obj.csvData), [obj.csvData]);
  const compiledFn = useMemo(
    () => (obj.chartType === 'function' ? compileFormula(obj.formula) : null),
    [obj.chartType, obj.formula]
  );

  // SVG viewport math
  const svgW = Math.max(220, obj.width - 24);
  const svgH = Math.max(130, obj.height - 62);
  const padL = 38;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const plotW = Math.max(60, svgW - padL - padR);
  const plotH = Math.max(50, svgH - padT - padB);

  const renderFunctionPlot = () => {
    if (!compiledFn || !compiledFn.fn) {
      return (
        <div className="w-full h-full flex items-center justify-center text-xs text-red-500 px-4 text-center">
          {compiledFn?.error ?? 'Enter a formula such as y = sin(x)'}
        </div>
      );
    }

    const xMin = Number.isFinite(obj.xMin) ? obj.xMin : -10;
    const xMax = Number.isFinite(obj.xMax) && obj.xMax > xMin ? obj.xMax : xMin + 20;
    const samples = 220;
    const segments: Array<Array<{ x: number; y: number }>> = [];
    let currentSeg: Array<{ x: number; y: number }> = [];
    let yMin = Infinity;
    let yMax = -Infinity;

    for (let i = 0; i <= samples; i++) {
      const x = xMin + ((xMax - xMin) * i) / samples;
      const y = compiledFn.fn(x);
      if (Number.isFinite(y) && Math.abs(y) < 1e4) {
        currentSeg.push({ x, y });
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
      } else if (currentSeg.length > 0) {
        segments.push(currentSeg);
        currentSeg = [];
      }
    }
    if (currentSeg.length > 0) segments.push(currentSeg);

    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      return (
        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
          No real values in [{xMin}, {xMax}]
        </div>
      );
    }
    if (Math.abs(yMax - yMin) < 1e-6) {
      yMin -= 1;
      yMax += 1;
    } else {
      const margin = (yMax - yMin) * 0.1;
      yMin -= margin;
      yMax += margin;
    }

    const mapX = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
    const mapY = (y: number) => padT + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
    const zeroX = mapX(0);
    const zeroY = mapY(0);

    return (
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full overflow-visible">
        {/* Horizontal guide lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yPos = padT + plotH * t;
          const val = yMax - (yMax - yMin) * t;
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={yPos}
                x2={padL + plotW}
                y2={yPos}
                className="stroke-slate-200/80 dark:stroke-slate-800"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={yPos + 3}
                textAnchor="end"
                className="fill-slate-400 text-[9.5px] font-mono-tabular"
              >
                {val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Origin axes */}
        {zeroY >= padT && zeroY <= padT + plotH && (
          <line
            x1={padL}
            y1={zeroY}
            x2={padL + plotW}
            y2={zeroY}
            className="stroke-slate-400 dark:stroke-slate-500"
            strokeWidth={1.2}
          />
        )}
        {zeroX >= padL && zeroX <= padL + plotW && (
          <line
            x1={zeroX}
            y1={padT}
            x2={zeroX}
            y2={padT + plotH}
            className="stroke-slate-400 dark:stroke-slate-500"
            strokeWidth={1.2}
          />
        )}

        {/* X axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const xPos = padL + plotW * t;
          const val = xMin + (xMax - xMin) * t;
          return (
            <text
              key={t}
              x={xPos}
              y={padT + plotH + 15}
              textAnchor="middle"
              className="fill-slate-400 text-[9.5px] font-mono-tabular"
            >
              {Number(val.toFixed(1))}
            </text>
          );
        })}

        {/* Curve segments */}
        {segments.map((seg, sIdx) => {
          if (seg.length < 2) return null;
          const d = seg
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapX(p.x).toFixed(1)} ${mapY(p.y).toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={sIdx}
              d={d}
              fill="none"
              stroke={obj.accentColor || '#2563EB'}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
    );
  };

  const renderDataChart = () => {
    const { labels, series } = parsedCsv;
    if (series.length === 0 || labels.length === 0) {
      return (
        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
          Paste CSV rows in Data settings
        </div>
      );
    }

    if (obj.chartType === 'pie') {
      const vals = series[0].values.map((v) => Math.max(0, v));
      const total = vals.reduce((a, b) => a + b, 0) || 1;
      const cx = svgW * 0.4;
      const cy = svgH * 0.5;
      const r = Math.min(svgW * 0.32, svgH * 0.42);
      let angle = -Math.PI / 2;

      return (
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full">
          {vals.map((val, idx) => {
            const slice = (val / total) * Math.PI * 2;
            const x1 = cx + r * Math.cos(angle);
            const y1 = cy + r * Math.sin(angle);
            const x2 = cx + r * Math.cos(angle + slice);
            const y2 = cy + r * Math.sin(angle + slice);
            const large = slice > Math.PI ? 1 : 0;
            const color = SERIES_COLORS[idx % SERIES_COLORS.length];
            const path = `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
            angle += slice;
            return <path key={idx} d={path} fill={color} opacity={0.9} />;
          })}
          {/* Legend */}
          {labels.slice(0, 6).map((lbl, idx) => (
            <g key={idx} transform={`translate(${svgW * 0.72}, ${18 + idx * 18})`}>
              <rect width={8} height={8} rx={2} fill={SERIES_COLORS[idx % SERIES_COLORS.length]} />
              <text x={13} y={8} className="fill-slate-600 dark:fill-slate-300 text-[10px]">
                {lbl} ({Math.round((vals[idx] / total) * 100)}%)
              </text>
            </g>
          ))}
        </svg>
      );
    }

    const allVals = series.flatMap((s) => s.values);
    const maxV = Math.max(1, ...allVals);
    const minV = Math.min(0, ...allVals);
    const range = maxV - minV || 1;
    const mapY = (v: number) => padT + plotH - ((v - minV) / range) * plotH;

    return (
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full">
        {[0, 0.5, 1].map((t) => {
          const yPos = padT + plotH * t;
          const val = maxV - range * t;
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={yPos}
                x2={padL + plotW}
                y2={yPos}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={yPos + 3}
                textAnchor="end"
                className="fill-slate-400 text-[9.5px] font-mono-tabular"
              >
                {Number(val.toFixed(1))}
              </text>
            </g>
          );
        })}

        {/* Axes */}
        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} className="stroke-slate-300 dark:stroke-slate-700" />
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} className="stroke-slate-300 dark:stroke-slate-700" />

        {obj.chartType === 'bar' &&
          (() => {
            const groupW = plotW / Math.max(1, labels.length);
            const barW = Math.max(6, (groupW * 0.72) / series.length);
            return series.map((s, si) => (
              <g key={s.name}>
                {s.values.map((val, idx) => {
                  const bx = padL + idx * groupW + groupW * 0.14 + si * barW;
                  const by = mapY(val);
                  const bh = Math.max(1, padT + plotH - by);
                  return (
                    <rect
                      key={idx}
                      x={bx}
                      y={by}
                      width={Math.max(2, barW - 2)}
                      height={bh}
                      rx={3}
                      fill={si === 0 ? obj.accentColor || SERIES_COLORS[0] : SERIES_COLORS[si % SERIES_COLORS.length]}
                    />
                  );
                })}
              </g>
            ));
          })()}

        {(obj.chartType === 'line' || obj.chartType === 'scatter') &&
          series.map((s, si) => {
            const color = si === 0 ? obj.accentColor || SERIES_COLORS[0] : SERIES_COLORS[si % SERIES_COLORS.length];
            const pts = s.values.map((val, idx) => ({
              x: padL + (s.values.length > 1 ? (idx / (s.values.length - 1)) * plotW : plotW / 2),
              y: mapY(val),
            }));
            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
            return (
              <g key={s.name}>
                {obj.chartType === 'line' && (
                  <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                )}
                {pts.map((p, idx) => (
                  <circle key={idx} cx={p.x} cy={p.y} r={obj.chartType === 'scatter' ? 4 : 3} fill={color} />
                ))}
              </g>
            );
          })}

        {/* X labels */}
        {labels.map((lbl, idx) => {
          const xPos =
            obj.chartType === 'bar'
              ? padL + (idx + 0.5) * (plotW / labels.length)
              : padL + (labels.length > 1 ? (idx / (labels.length - 1)) * plotW : plotW / 2);
          return (
            <text
              key={idx}
              x={xPos}
              y={padT + plotH + 15}
              textAnchor="middle"
              className="fill-slate-500 dark:fill-slate-400 text-[9.5px]"
            >
              {lbl.slice(0, 8)}
            </text>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="w-full h-full flex flex-col rounded-xl bg-white dark:bg-[#161D27] border border-slate-200 dark:border-[#263142] shadow-sm overflow-hidden select-none">
      {/* Header */}
      <div
        onPointerDown={onSelectStart}
        className="flex items-center justify-between gap-2 px-3.5 py-2 cursor-grab active:cursor-grabbing border-b border-slate-100 dark:border-[#232D3D]"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            aria-label="Chart title"
            value={obj.title}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => onUpdate({ ...obj, title: e.target.value }, false)}
            onBlur={() => onUpdate(obj, true)}
            className="w-full bg-transparent text-[13px] font-semibold text-slate-900 dark:text-slate-100 focus:outline-none truncate"
          />
        </div>
        <div
          className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#0F141B] p-0.5 rounded-md shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.id}
              type="button"
              onClick={() => onUpdate({ ...obj, chartType: ct.id }, true)}
              className={`px-1.5 py-0.5 text-[10.5px] font-medium rounded transition-colors whitespace-nowrap ${
                obj.chartType === ct.id
                  ? 'bg-white dark:bg-[#1E2736] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {ct.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label={editing ? 'Close chart data editor' : 'Edit chart data or formula'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setEditing((v) => !v)}
          className={`p-1 rounded-md transition-colors shrink-0 ${
            editing
              ? 'bg-blue-600 text-white'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736]'
          }`}
        >
          {editing ? <X className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Body: Editor or Chart Plot */}
      <div className="flex-1 min-h-0 p-3 relative" onPointerDown={(e) => editing && e.stopPropagation()}>
        {editing ? (
          <div className="w-full h-full flex flex-col gap-2.5 overflow-y-auto vellum-scroll">
            {obj.chartType === 'function' ? (
              <>
                <label className="block">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Function Equation
                  </span>
                  <input
                    type="text"
                    value={obj.formula}
                    onChange={(e) => onUpdate({ ...obj, formula: e.target.value }, false)}
                    onBlur={() => onUpdate(obj, true)}
                    placeholder="y = sin(x) * cos(x/2)"
                    className="mt-1 w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-[#263142] bg-[#F7F8FA] dark:bg-[#0F141B] text-xs font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Domain Min (x)
                    </span>
                    <input
                      type="number"
                      value={obj.xMin}
                      onChange={(e) => onUpdate({ ...obj, xMin: Number(e.target.value) }, true)}
                      className="mt-1 w-full px-2 py-1 rounded-md border border-slate-200 dark:border-[#263142] bg-[#F7F8FA] dark:bg-[#0F141B] text-xs font-mono-tabular text-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Domain Max (x)
                    </span>
                    <input
                      type="number"
                      value={obj.xMax}
                      onChange={(e) => onUpdate({ ...obj, xMax: Number(e.target.value) }, true)}
                      className="mt-1 w-full px-2 py-1 rounded-md border border-slate-200 dark:border-[#263142] bg-[#F7F8FA] dark:bg-[#0F141B] text-xs font-mono-tabular text-slate-900 dark:text-slate-100"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-slate-400">
                  Supports +, -, *, /, ^, sin, cos, tan, sqrt, abs, ln, log, exp, pi, e.
                </p>
              </>
            ) : (
              <label className="flex-1 flex flex-col">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Table or CSV Data (Label, Series 1, Series 2...)
                </span>
                <textarea
                  value={obj.csvData}
                  onChange={(e) => onUpdate({ ...obj, csvData: e.target.value }, false)}
                  onBlur={() => onUpdate(obj, true)}
                  rows={6}
                  className="mt-1 flex-1 w-full p-2 rounded-md border border-slate-200 dark:border-[#263142] bg-[#F7F8FA] dark:bg-[#0F141B] text-xs font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
                />
              </label>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col">
            {obj.chartType === 'function' && (
              <div className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400 text-right -mt-1 mb-0.5 truncate">
                {obj.formula}
              </div>
            )}
            <div className="flex-1 min-h-0">
              {obj.chartType === 'function' ? renderFunctionPlot() : renderDataChart()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
