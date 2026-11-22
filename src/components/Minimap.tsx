import React, { useMemo, useRef, useState } from 'react';
import { Map as MapIcon, Maximize2, Minus, Plus } from 'lucide-react';
import type { Camera, CanvasObject } from '../types/canvas';
import { getCombinedBounds, getObjectBounds, getViewportWorldRect } from '../utils/geometry';

interface MinimapProps {
  objects: CanvasObject[];
  camera: Camera;
  viewportSize: { width: number; height: number };
  onSetCamera: (next: Camera) => void;
  onZoomStep: (factor: number) => void;
  onZoomReset: () => void;
  onZoomToFit: () => void;
}

const MAP_W = 168;
const MAP_H = 108;

export const Minimap: React.FC<MinimapProps> = ({
  objects,
  camera,
  viewportSize,
  onSetCamera,
  onZoomStep,
  onZoomReset,
  onZoomToFit,
}) => {
  const [expanded, setExpanded] = useState(true);
  const draggingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const viewWorld = useMemo(
    () => getViewportWorldRect(camera, viewportSize.width, viewportSize.height, 0),
    [camera, viewportSize]
  );

  const worldFrame = useMemo(() => {
    const objBounds = getCombinedBounds(objects);
    const minX = Math.min(objBounds?.x ?? 0, viewWorld.x) - 180;
    const minY = Math.min(objBounds?.y ?? 0, viewWorld.y) - 180;
    const maxX = Math.max(
      objBounds ? objBounds.x + objBounds.width : 800,
      viewWorld.x + viewWorld.width
    ) + 180;
    const maxY = Math.max(
      objBounds ? objBounds.y + objBounds.height : 600,
      viewWorld.y + viewWorld.height
    ) + 180;
    return {
      x: minX,
      y: minY,
      width: Math.max(400, maxX - minX),
      height: Math.max(300, maxY - minY),
    };
  }, [objects, viewWorld]);

  const scale = Math.min(MAP_W / worldFrame.width, MAP_H / worldFrame.height);
  const offsetX = (MAP_W - worldFrame.width * scale) / 2;
  const offsetY = (MAP_H - worldFrame.height * scale) / 2;

  const toMapX = (wx: number) => offsetX + (wx - worldFrame.x) * scale;
  const toMapY = (wy: number) => offsetY + (wy - worldFrame.y) * scale;

  const centerCameraFromPointer = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const wx = worldFrame.x + (mx - offsetX) / scale;
    const wy = worldFrame.y + (my - offsetY) / scale;
    onSetCamera({
      ...camera,
      x: viewportSize.width / 2 - wx * camera.zoom,
      y: viewportSize.height / 2 - wy * camera.zoom,
    });
  };

  return (
    <div className="fixed bottom-3 right-3 z-30 hidden sm:flex flex-col items-end gap-2 pointer-events-auto">
      {expanded && (
        <div className="rounded-xl bg-white/92 dark:bg-[#161D27]/92 backdrop-blur-md border border-slate-200/90 dark:border-[#263142] shadow-sm p-1.5 overflow-hidden">
          <svg
            ref={svgRef}
            width={MAP_W}
            height={MAP_H}
            role="img"
            aria-label="Canvas minimap"
            onPointerDown={(e) => {
              draggingRef.current = true;
              (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
              centerCameraFromPointer(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (draggingRef.current) centerCameraFromPointer(e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            className="rounded-lg bg-[#F7F8FA] dark:bg-[#0F141B] cursor-crosshair block"
          >
            {objects.map((obj) => {
              const b = getObjectBounds(obj, objects);
              const fill =
                obj.type === 'sticky'
                  ? '#F59E0B'
                  : obj.type === 'chart' || obj.type === 'kanban'
                  ? '#2563EB'
                  : '#64748B';
              return (
                <rect
                  key={obj.id}
                  x={toMapX(b.x)}
                  y={toMapY(b.y)}
                  width={Math.max(2.5, b.width * scale)}
                  height={Math.max(2.5, b.height * scale)}
                  rx={1}
                  fill={fill}
                  opacity={0.55}
                />
              );
            })}
            <rect
              x={toMapX(viewWorld.x)}
              y={toMapY(viewWorld.y)}
              width={Math.max(8, viewWorld.width * scale)}
              height={Math.max(6, viewWorld.height * scale)}
              rx={2}
              fill="rgba(37, 99, 235, 0.1)"
              stroke="#2563EB"
              strokeWidth={1.25}
            />
          </svg>
        </div>
      )}

      {/* Zoom bar */}
      <div className="h-9 px-1 rounded-xl bg-white/92 dark:bg-[#161D27]/92 backdrop-blur-md border border-slate-200/90 dark:border-[#263142] shadow-xs flex items-center gap-0.5">
        <button
          type="button"
          aria-label={expanded ? 'Hide minimap' : 'Show minimap'}
          title={expanded ? 'Hide minimap' : 'Show minimap'}
          onClick={() => setExpanded((v) => !v)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            expanded
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1E2736]'
          }`}
        >
          <MapIcon className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-200 dark:bg-[#263142] mx-0.5" />

        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom Out (-)"
          onClick={() => onZoomStep(1 / 1.2)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          aria-label="Reset zoom to 100%"
          title="Reset to 100% (0)"
          onClick={onZoomReset}
          className="px-1.5 h-7 rounded-lg font-mono-tabular text-[11.5px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2736] min-w-[44px]"
        >
          {Math.round(camera.zoom * 100)}%
        </button>

        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom In (+)"
          onClick={() => onZoomStep(1.2)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-200 dark:bg-[#263142] mx-0.5" />

        <button
          type="button"
          aria-label="Zoom to fit all objects"
          title="Zoom to Fit (Shift+1)"
          onClick={onZoomToFit}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2736]"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
