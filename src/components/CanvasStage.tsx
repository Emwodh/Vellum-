import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import {
  FRAME_SWATCHES,
  STICKY_PALETTE,
  type Camera,
  type CanvasObject,
  type ConnectorEndpoint,
  type ConnectorObject,
  type FileObject,
  type FrameObject,
  type PenObject,
  type Point,
  type ShapeObject,
  type StickyObject,
  type StrokePoint,
  type TextObject,
  type ToolOptions,
  type ToolType,
} from '../types/canvas';
import {
  GRID_SIZE,
  buildArrowheadPoints,
  buildConnectorPath,
  buildPressureOutlinePath,
  buildStrokePath,
  clamp,
  findNearestAnchor,
  getAllAnchorPorts,
  getCombinedBounds,
  getObjectBounds,
  getViewportWorldRect,
  isPointNearStroke,
  normalizeRect,
  rectsIntersect,
  screenToWorld,
  smoothStrokePoints,
  snapPoint,
  uid,
  zoomCameraAtPoint,
} from '../utils/geometry';
import { expandSelectionWithGroups } from '../utils/history';
import { getObjectsInsideFrame } from '../utils/search';
import {
  computeAlignmentGuides,
  type SnapGuideLine,
  type SpacingIndicator,
} from '../utils/alignment';
import { ChecklistCard } from './objects/ChecklistCard';
import { KanbanCard } from './objects/KanbanCard';
import { ChartCard } from './objects/ChartCard';
import { FileCard, ImageCard } from './objects/MediaCard';

interface CanvasStageProps {
  objects: CanvasObject[];
  camera: Camera;
  activeTool: ToolType;
  toolOptions: ToolOptions;
  selectedIds: Set<string>;
  snapToGrid: boolean;
  isDark: boolean;
  spaceHeld: boolean;
  onCameraChange: (next: Camera) => void;
  onObjectsLiveChange: (next: CanvasObject[]) => void;
  onObjectsCommit: (next: CanvasObject[]) => void;
  onSelectIds: (ids: Set<string>) => void;
  onSelectTool: (tool: ToolType) => void;
  onDropFiles: (files: FileList, worldPt: Point) => void;
  onPreviewFile: (file: FileObject) => void;
  onViewportResize: (size: { width: number; height: number }) => void;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type InteractionState =
  | { kind: 'idle' }
  | { kind: 'pan'; startScreen: Point; startCamera: Camera }
  | {
      kind: 'drag';
      startWorld: Point;
      initialPositions: Map<string, { x: number; y: number; start?: Point; end?: Point }>;
      moved: boolean;
    }
  | { kind: 'marquee'; startWorld: Point; currWorld: Point }
  | {
      kind: 'resize';
      handle: ResizeHandle;
      startWorld: Point;
      startBounds: { x: number; y: number; width: number; height: number };
      initialObjects: Map<string, CanvasObject>;
    }
  | {
      kind: 'rotate';
      center: Point;
      startAngle: number;
      initialRotations: Map<string, number>;
    }
  | { kind: 'pen'; points: StrokePoint[]; lastTime: number }
  | { kind: 'erase'; erasedAny: boolean }
  | { kind: 'shape'; id: string; startWorld: Point; currWorld: Point }
  | { kind: 'frame'; id: string; startWorld: Point; currWorld: Point }
  | {
      kind: 'connector';
      start: ConnectorEndpoint;
      currWorld: Point;
      snapEnd: { objectId: string; side: ConnectorEndpoint['side']; x: number; y: number } | null;
    }
  | {
      kind: 'connector-endpoint';
      connectorId: string;
      endKey: 'start' | 'end';
      snapTarget: { objectId: string; side: ConnectorEndpoint['side']; x: number; y: number } | null;
    }
  | {
      kind: 'connector-midpoint';
      connectorId: string;
    };

export const CanvasStage: React.FC<CanvasStageProps> = ({
  objects,
  camera,
  activeTool,
  toolOptions,
  selectedIds,
  snapToGrid,
  isDark,
  spaceHeld,
  onCameraChange,
  onObjectsLiveChange,
  onObjectsCommit,
  onSelectIds,
  onSelectTool,
  onDropFiles,
  onPreviewFile,
  onViewportResize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 1440, height: 900 });
  const [interaction, setInteraction] = useState<InteractionState>({ kind: 'idle' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDragOverFiles, setIsDragOverFiles] = useState(false);
  const [alignmentGuides, setAlignmentGuides] = useState<{
    lines: SnapGuideLine[];
    spacings: SpacingIndicator[];
  }>({ lines: [], spacings: [] });

  useEffect(() => {
    if (!editingId) return;
    const raf = requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(
        '[data-inline-editor="true"]'
      );
      el?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [editingId]);

  // Refs for gesture tracking & avoiding stale closures
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // Multi-touch pinch/pan tracker
  const activeTouchesRef = useRef<Map<number, Point>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    mid: Point;
    camera: Camera;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const next = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
      setViewport(next);
      onViewportResize(next);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onViewportResize]);

  // Native non-passive wheel listener for smooth cursor-anchored zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Allow inner scroll containers (checklists, kanban columns, chart textareas) to scroll naturally
      const target = e.target as HTMLElement | null;
      if (target && !e.ctrlKey && !e.metaKey) {
        const scrollable = target.closest('.vellum-scroll') as HTMLElement | null;
        if (scrollable && scrollable.scrollHeight > scrollable.clientHeight + 2) {
          return;
        }
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cam = cameraRef.current;
      // Zoom smoothly toward cursor
      const factor = Math.exp(-e.deltaY * 0.0018);
      const nextCam = zoomCameraAtPoint(cam, sx, sy, cam.zoom * factor);
      onCameraChange(nextCam);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onCameraChange]);

  // Viewport culling for smooth performance with hundreds of objects
  const visibleObjects = useMemo(() => {
    const viewRect = getViewportWorldRect(camera, viewport.width, viewport.height, 360);
    return objects.filter((obj) => {
      if (selectedIds.has(obj.id) || editingId === obj.id) return true;
      return rectsIntersect(getObjectBounds(obj, objects), viewRect);
    });
  }, [objects, camera, viewport, selectedIds, editingId]);

  const selectedObjects = useMemo(
    () => objects.filter((o) => selectedIds.has(o.id)),
    [objects, selectedIds]
  );

  const selectionBounds = useMemo(() => {
    const resizable = selectedObjects.filter((o) => o.type !== 'connector');
    if (resizable.length === 0) return null;
    return getCombinedBounds(resizable, objects);
  }, [selectedObjects, objects]);

  const getLocalPoint = (clientX: number, clientY: number): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return {
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
    };
  };

  const updateSingleObject = (updated: CanvasObject, commit = false) => {
    const next = objectsRef.current.map((o) => (o.id === updated.id ? updated : o));
    if (commit) onObjectsCommit(next);
    else onObjectsLiveChange(next);
  };

  const startObjectDrag = (objId: string, e: React.PointerEvent) => {
    if (spaceHeld || activeTool === 'hand' || e.button === 1) return;
    if (activeTool === 'connector' || activeTool === 'pen') return;

    e.stopPropagation();
    const screenPt = getLocalPoint(e.clientX, e.clientY);
    const worldPt = screenToWorld(screenPt.x, screenPt.y, camera);

    let nextSelection: Set<string>;
    if (e.shiftKey) {
      nextSelection = new Set(selectedIds);
      if (nextSelection.has(objId)) nextSelection.delete(objId);
      else nextSelection.add(objId);
      nextSelection = expandSelectionWithGroups(objects, nextSelection);
    } else if (selectedIds.has(objId)) {
      nextSelection = selectedIds;
    } else {
      nextSelection = expandSelectionWithGroups(objects, [objId]);
    }
    onSelectIds(nextSelection);

    const dragIds = new Set<string>(nextSelection);
    for (const o of objects) {
      if (nextSelection.has(o.id) && o.type === 'frame') {
        for (const childId of getObjectsInsideFrame(o, objects)) {
          dragIds.add(childId);
        }
      }
    }

    const initialPositions = new Map<string, { x: number; y: number; start?: Point; end?: Point }>();
    for (const o of objects) {
      if (dragIds.has(o.id)) {
        if (o.type === 'connector') {
          initialPositions.set(o.id, {
            x: o.x,
            y: o.y,
            start: { x: o.start.x, y: o.start.y },
            end: { x: o.end.x, y: o.end.y },
          });
        } else {
          initialPositions.set(o.id, { x: o.x, y: o.y });
        }
      }
    }

    containerRef.current?.setPointerCapture(e.pointerId);
    setInteraction({
      kind: 'drag',
      startWorld: worldPt,
      initialPositions,
      moved: false,
    });
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      const pt = getLocalPoint(e.clientX, e.clientY);
      activeTouchesRef.current.set(e.pointerId, pt);
      if (activeTouchesRef.current.size === 2) {
        const pts = Array.from(activeTouchesRef.current.values());
        pinchStartRef.current = {
          dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1,
          mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
          camera: cameraRef.current,
        };
        setInteraction({ kind: 'idle' });
        return;
      }
    }

    const screenPt = getLocalPoint(e.clientX, e.clientY);
    const rawWorld = screenToWorld(screenPt.x, screenPt.y, camera);
    const worldPt = snapPoint(rawWorld, snapToGrid);

    // Middle mouse or Spacebar or Hand tool -> Pan
    if (e.button === 1 || spaceHeld || activeTool === 'hand') {
      e.preventDefault();
      containerRef.current?.setPointerCapture(e.pointerId);
      setInteraction({ kind: 'pan', startScreen: screenPt, startCamera: camera });
      return;
    }

    if (e.button !== 0) return;

    // Clicking empty stage finishes any active inline text edit
    if (editingId) {
      setEditingId(null);
      onObjectsCommit(objectsRef.current);
    }

    if (activeTool === 'select') {
      onSelectIds(new Set());
      containerRef.current?.setPointerCapture(e.pointerId);
      setInteraction({ kind: 'marquee', startWorld: rawWorld, currWorld: rawWorld });
      return;
    }

    if (activeTool === 'pen') {
      containerRef.current?.setPointerCapture(e.pointerId);
      if (toolOptions.penMode === 'eraser') {
        const remaining = objectsRef.current.filter(
          (o) =>
            !(
              o.type === 'pen' &&
              isPointNearStroke(rawWorld, o.x, o.y, o.points, Math.max(12, o.strokeWidth + 8))
            )
        );
        const erasedAny = remaining.length !== objectsRef.current.length;
        if (erasedAny) onObjectsLiveChange(remaining);
        setInteraction({ kind: 'erase', erasedAny });
        return;
      }
      const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.65;
      setInteraction({
        kind: 'pen',
        points: [{ x: rawWorld.x, y: rawWorld.y, p: pressure }],
        lastTime: performance.now(),
      });
      return;
    }

    if (activeTool === 'text') {
      e.preventDefault();
      const id = uid('txt');
      const newObj: TextObject = {
        id,
        type: 'text',
        x: worldPt.x,
        y: worldPt.y,
        width: 260,
        height: Math.max(36, toolOptions.textSize * 1.5),
        rotation: 0,
        text: '',
        fontSize: toolOptions.textSize,
        fontWeight: toolOptions.textWeight,
        color:
          isDark && toolOptions.textColor === '#0F172A'
            ? '#F1F5F9'
            : toolOptions.textColor,
      };
      onObjectsCommit([...objects, newObj]);
      onSelectIds(new Set([id]));
      setEditingId(id);
      onSelectTool('select');
      return;
    }

    if (activeTool === 'sticky') {
      e.preventDefault();
      const id = uid('sticky');
      const newObj: StickyObject = {
        id,
        type: 'sticky',
        x: worldPt.x - 105,
        y: worldPt.y - 80,
        width: 215,
        height: 165,
        rotation: 0,
        color: toolOptions.stickyColor,
        text: '',
      };
      onObjectsCommit([...objects, newObj]);
      onSelectIds(new Set([id]));
      setEditingId(id);
      onSelectTool('select');
      return;
    }

    if (activeTool === 'shape') {
      containerRef.current?.setPointerCapture(e.pointerId);
      setInteraction({
        kind: 'shape',
        id: uid('shape'),
        startWorld: worldPt,
        currWorld: worldPt,
      });
      return;
    }

    if (activeTool === 'connector') {
      containerRef.current?.setPointerCapture(e.pointerId);
      const anchor = findNearestAnchor(rawWorld, objects, 32 / camera.zoom);
      const startEndpoint: ConnectorEndpoint = anchor
        ? { objectId: anchor.objectId, side: anchor.side, x: anchor.x, y: anchor.y }
        : { objectId: null, x: worldPt.x, y: worldPt.y };
      setInteraction({
        kind: 'connector',
        start: startEndpoint,
        currWorld: rawWorld,
        snapEnd: null,
      });
      return;
    }

    if (activeTool === 'checklist') {
      const id = uid('chk');
      const newObj: CanvasObject = {
        id,
        type: 'checklist',
        x: worldPt.x - 130,
        y: worldPt.y - 100,
        width: 265,
        height: 230,
        rotation: 0,
        title: 'Checklist',
        accentColor: '#2563EB',
        items: [
          { id: uid('ci'), text: 'First action item', done: false },
          { id: uid('ci'), text: 'Second action item', done: false },
        ],
      };
      onObjectsCommit([...objects, newObj]);
      onSelectIds(new Set([id]));
      onSelectTool('select');
      return;
    }

    if (activeTool === 'kanban') {
      const id = uid('kanban');
      const newObj: CanvasObject = {
        id,
        type: 'kanban',
        x: worldPt.x - 250,
        y: worldPt.y - 160,
        width: 520,
        height: 340,
        rotation: 0,
        title: 'Project Board',
        columns: [
          {
            id: uid('col'),
            title: 'To Do',
            cards: [{ id: uid('kc'), title: 'Outline scope' }],
          },
          {
            id: uid('col'),
            title: 'In Progress',
            cards: [{ id: uid('kc'), title: 'Build prototype' }],
          },
          {
            id: uid('col'),
            title: 'Done',
            cards: [],
          },
        ],
      };
      onObjectsCommit([...objects, newObj]);
      onSelectIds(new Set([id]));
      onSelectTool('select');
      return;
    }

    if (activeTool === 'chart') {
      const id = uid('chart');
      const newObj: CanvasObject = {
        id,
        type: 'chart',
        x: worldPt.x - 200,
        y: worldPt.y - 150,
        width: 400,
        height: 300,
        rotation: 0,
        title: 'Data & Formula Plot',
        chartType: 'line',
        csvData: 'Step,Value,Baseline\n1,18,15\n2,34,24\n3,49,38\n4,62,50\n5,84,65',
        formula: 'y = sin(x)',
        xMin: -10,
        xMax: 10,
        accentColor: '#2563EB',
      };
      onObjectsCommit([...objects, newObj]);
      onSelectIds(new Set([id]));
      onSelectTool('select');
      return;
    }

    if (activeTool === 'frame') {
      containerRef.current?.setPointerCapture(e.pointerId);
      setInteraction({
        kind: 'frame',
        id: uid('frame'),
        startWorld: worldPt,
        currWorld: worldPt,
      });
    }
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Handle 2-finger pinch & pan
    if (e.pointerType === 'touch' && activeTouchesRef.current.has(e.pointerId)) {
      const pt = getLocalPoint(e.clientX, e.clientY);
      activeTouchesRef.current.set(e.pointerId, pt);
      if (activeTouchesRef.current.size === 2 && pinchStartRef.current) {
        const pts = Array.from(activeTouchesRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const scaleRatio = dist / pinchStartRef.current.dist;
        const startCam = pinchStartRef.current.camera;
        const nextZoom = clamp(startCam.zoom * scaleRatio, 0.1, 5);
        const worldMid = screenToWorld(
          pinchStartRef.current.mid.x,
          pinchStartRef.current.mid.y,
          startCam
        );
        onCameraChange({
          zoom: nextZoom,
          x: mid.x - worldMid.x * nextZoom,
          y: mid.y - worldMid.y * nextZoom,
        });
        return;
      }
    }

    if (interaction.kind === 'idle') return;
    const screenPt = getLocalPoint(e.clientX, e.clientY);
    const rawWorld = screenToWorld(screenPt.x, screenPt.y, camera);

    if (interaction.kind === 'pan') {
      onCameraChange({
        ...interaction.startCamera,
        x: interaction.startCamera.x + (screenPt.x - interaction.startScreen.x),
        y: interaction.startCamera.y + (screenPt.y - interaction.startScreen.y),
      });
      return;
    }

    if (interaction.kind === 'drag') {
      const rawDx = rawWorld.x - interaction.startWorld.x;
      const rawDy = rawWorld.y - interaction.startWorld.y;
      const moved = interaction.moved || Math.hypot(rawDx, rawDy) > 1.5;
      if (!moved) return;

      // Compute combined tentative bounding box of dragged non-connector objects
      const draggedIds = new Set(interaction.initialPositions.keys());
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const obj of objectsRef.current) {
        const init = interaction.initialPositions.get(obj.id);
        if (!init || obj.type === 'connector') continue;
        const tx = init.x + rawDx;
        const ty = init.y + rawDy;
        minX = Math.min(minX, tx);
        minY = Math.min(minY, ty);
        maxX = Math.max(maxX, tx + obj.width);
        maxY = Math.max(maxY, ty + obj.height);
      }

      let alignDx = 0;
      let alignDy = 0;
      if (!e.altKey && minX !== Infinity) {
        const res = computeAlignmentGuides(
          { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
          objectsRef.current,
          draggedIds,
          7 / camera.zoom
        );
        alignDx = res.dx;
        alignDy = res.dy;
        setAlignmentGuides({ lines: res.lines, spacings: res.spacings });
      } else {
        setAlignmentGuides({ lines: [], spacings: [] });
      }

      const finalDx = rawDx + alignDx;
      const finalDy = rawDy + alignDy;

      const nextObjects = objectsRef.current.map((obj) => {
        const init = interaction.initialPositions.get(obj.id);
        if (!init) return obj;
        if (obj.type === 'connector') {
          return {
            ...obj,
            start: obj.start.objectId
              ? obj.start
              : { ...obj.start, x: init.start!.x + finalDx, y: init.start!.y + finalDy },
            end: obj.end.objectId
              ? obj.end
              : { ...obj.end, x: init.end!.x + finalDx, y: init.end!.y + finalDy },
          };
        }
        const gridTarget = snapPoint({ x: init.x + rawDx, y: init.y + rawDy }, snapToGrid);
        const nx = alignDx !== 0 ? init.x + finalDx : gridTarget.x;
        const ny = alignDy !== 0 ? init.y + finalDy : gridTarget.y;
        return { ...obj, x: nx, y: ny };
      });
      if (!interaction.moved) {
        setInteraction({ ...interaction, moved: true });
      }
      onObjectsLiveChange(nextObjects);
      return;
    }

    if (interaction.kind === 'marquee') {
      setInteraction({ ...interaction, currWorld: rawWorld });
      const box = normalizeRect(interaction.startWorld, rawWorld);
      const hitIds = objectsRef.current
        .filter((o) => rectsIntersect(getObjectBounds(o, objectsRef.current), box))
        .map((o) => o.id);
      onSelectIds(expandSelectionWithGroups(objectsRef.current, hitIds));
      return;
    }

    if (interaction.kind === 'resize') {
      const targetPt = snapPoint(rawWorld, snapToGrid);
      const dx = targetPt.x - interaction.startWorld.x;
      const dy = targetPt.y - interaction.startWorld.y;
      const sb = interaction.startBounds;
      let nx = sb.x;
      let ny = sb.y;
      let nw = sb.width;
      let nh = sb.height;

      const h = interaction.handle;
      if (h.includes('e')) nw = Math.max(24, sb.width + dx);
      if (h.includes('s')) nh = Math.max(24, sb.height + dy);
      if (h.includes('w')) {
        const maxDx = sb.width - 24;
        const clampedDx = Math.min(dx, maxDx);
        nx = sb.x + clampedDx;
        nw = sb.width - clampedDx;
      }
      if (h.includes('n')) {
        const maxDy = sb.height - 24;
        const clampedDy = Math.min(dy, maxDy);
        ny = sb.y + clampedDy;
        nh = sb.height - clampedDy;
      }

      const scaleX = nw / Math.max(1, sb.width);
      const scaleY = nh / Math.max(1, sb.height);

      const next = objectsRef.current.map((obj) => {
        const orig = interaction.initialObjects.get(obj.id);
        if (!orig || orig.type === 'connector') return obj;
        const newX = nx + (orig.x - sb.x) * scaleX;
        const newY = ny + (orig.y - sb.y) * scaleY;
        const newW = Math.max(20, orig.width * scaleX);
        const newH = Math.max(20, orig.height * scaleY);
        if (orig.type === 'pen') {
          return {
            ...orig,
            x: newX,
            y: newY,
            width: newW,
            height: newH,
            points: orig.points.map((p) => ({
              x: p.x * scaleX,
              y: p.y * scaleY,
              p: p.p,
            })),
          };
        }
        return { ...orig, x: newX, y: newY, width: newW, height: newH };
      });
      onObjectsLiveChange(next);
      return;
    }

    if (interaction.kind === 'rotate') {
      const currAngle =
        (Math.atan2(rawWorld.y - interaction.center.y, rawWorld.x - interaction.center.x) * 180) /
        Math.PI;
      let delta = currAngle - interaction.startAngle;
      if (e.shiftKey) {
        delta = Math.round(delta / 15) * 15;
      }
      const next = objectsRef.current.map((obj) => {
        const initRot = interaction.initialRotations.get(obj.id);
        if (initRot === undefined) return obj;
        return { ...obj, rotation: Math.round((initRot + delta + 360) % 360) };
      });
      onObjectsLiveChange(next);
      return;
    }

    if (interaction.kind === 'pen') {
      const prev = interaction.points[interaction.points.length - 1];
      const dist = Math.hypot(rawWorld.x - prev.x, rawWorld.y - prev.y);
      if (dist < 1.8 / camera.zoom) return;
      const now = performance.now();
      const dt = Math.max(4, now - interaction.lastTime);
      const velocity = dist / dt;
      const pressure =
        e.pointerType === 'pen' && e.pressure > 0
          ? e.pressure
          : clamp(0.85 - velocity * 0.16, 0.35, 0.95);
      setInteraction({
        kind: 'pen',
        points: [...interaction.points, { x: rawWorld.x, y: rawWorld.y, p: pressure }],
        lastTime: now,
      });
      return;
    }

    if (interaction.kind === 'erase') {
      const remaining = objectsRef.current.filter(
        (o) =>
          !(
            o.type === 'pen' &&
            isPointNearStroke(rawWorld, o.x, o.y, o.points, Math.max(12, o.strokeWidth + 8))
          )
      );
      if (remaining.length !== objectsRef.current.length) {
        onObjectsLiveChange(remaining);
        if (!interaction.erasedAny) {
          setInteraction({ kind: 'erase', erasedAny: true });
        }
      }
      return;
    }

    if (interaction.kind === 'shape' || interaction.kind === 'frame') {
      setInteraction({
        ...interaction,
        currWorld: snapPoint(rawWorld, snapToGrid),
      });
      return;
    }

    if (interaction.kind === 'connector') {
      const snapEnd = findNearestAnchor(
        rawWorld,
        objectsRef.current,
        32 / camera.zoom,
        interaction.start.objectId ?? undefined
      );
      setInteraction({
        ...interaction,
        currWorld: snapEnd ? { x: snapEnd.x, y: snapEnd.y } : snapPoint(rawWorld, snapToGrid),
        snapEnd,
      });
      return;
    }

    if (interaction.kind === 'connector-endpoint') {
      const conn = objectsRef.current.find(
        (o): o is ConnectorObject => o.id === interaction.connectorId && o.type === 'connector'
      );
      if (!conn) return;
      const otherEnd = interaction.endKey === 'start' ? conn.end : conn.start;
      const snapTarget = findNearestAnchor(
        rawWorld,
        objectsRef.current,
        32 / camera.zoom,
        otherEnd.objectId ?? undefined
      );
      const nextPt = snapTarget
        ? { x: snapTarget.x, y: snapTarget.y }
        : snapPoint(rawWorld, snapToGrid);
      const updatedEndpoint: ConnectorEndpoint = snapTarget
        ? { objectId: snapTarget.objectId, side: snapTarget.side, x: snapTarget.x, y: snapTarget.y }
        : { objectId: null, x: nextPt.x, y: nextPt.y };

      setInteraction({ ...interaction, snapTarget });
      const nextObjects = objectsRef.current.map((o) =>
        o.id === conn.id && o.type === 'connector'
          ? { ...o, [interaction.endKey]: updatedEndpoint }
          : o
      );
      onObjectsLiveChange(nextObjects);
      return;
    }

    if (interaction.kind === 'connector-midpoint') {
      const conn = objectsRef.current.find(
        (o): o is ConnectorObject => o.id === interaction.connectorId && o.type === 'connector'
      );
      if (!conn) return;
      const geo = buildConnectorPath({ ...conn, midpointOffset: null }, objectsRef.current);
      const targetPt = snapPoint(rawWorld, snapToGrid);
      const baseMidX = (geo.start.x + geo.end.x) / 2;
      const baseMidY = (geo.start.y + geo.end.y) / 2;
      const nextOffset = {
        x: Math.round((targetPt.x - baseMidX) * 10) / 10,
        y: Math.round((targetPt.y - baseMidY) * 10) / 10,
      };
      const nextObjects = objectsRef.current.map((o) =>
        o.id === conn.id && o.type === 'connector'
          ? { ...o, midpointOffset: nextOffset }
          : o
      );
      onObjectsLiveChange(nextObjects);
      return;
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.delete(e.pointerId);
      if (activeTouchesRef.current.size < 2) {
        pinchStartRef.current = null;
      }
    }

    if (interaction.kind === 'drag') {
      if (interaction.moved) onObjectsCommit(objectsRef.current);
      setAlignmentGuides({ lines: [], spacings: [] });
    } else if (
      interaction.kind === 'resize' ||
      interaction.kind === 'rotate' ||
      interaction.kind === 'connector-endpoint' ||
      interaction.kind === 'connector-midpoint'
    ) {
      onObjectsCommit(objectsRef.current);
    } else if (interaction.kind === 'erase') {
      if (interaction.erasedAny) onObjectsCommit(objectsRef.current);
    } else if (interaction.kind === 'pen') {
      const rawPts = interaction.points;
      if (rawPts.length >= 1) {
        const processed = toolOptions.penSmooth ? smoothStrokePoints(rawPts, 2) : rawPts;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of processed) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        const pad = Math.max(4, toolOptions.penWidth);
        const relPts = processed.map((p) => ({
          x: p.x - (minX - pad),
          y: p.y - (minY - pad),
          p: p.p,
        }));
        const strokeColor =
          isDark && toolOptions.penColor === '#0F172A'
            ? '#F1F5F9'
            : toolOptions.penColor;
        const newStroke: PenObject = {
          id: uid('pen'),
          type: 'pen',
          x: minX - pad,
          y: minY - pad,
          width: Math.max(12, maxX - minX + pad * 2),
          height: Math.max(12, maxY - minY + pad * 2),
          rotation: 0,
          points: relPts,
          color: strokeColor,
          strokeWidth:
            toolOptions.penMode === 'highlighter'
              ? Math.max(14, toolOptions.penWidth * 3)
              : toolOptions.penWidth,
          mode: toolOptions.penMode === 'highlighter' ? 'highlighter' : 'pen',
          smoothed: toolOptions.penSmooth,
        };
        onObjectsCommit([...objectsRef.current, newStroke]);
      }
    } else if (interaction.kind === 'shape') {
      const box = normalizeRect(interaction.startWorld, interaction.currWorld);
      const isClick = box.width < 10 && box.height < 10;
      const w = isClick ? 160 : Math.max(24, box.width);
      const h = isClick ? (toolOptions.shapeKind === 'line' ? 24 : 96) : Math.max(24, box.height);
      const x = isClick ? interaction.startWorld.x - w / 2 : box.x;
      const y = isClick ? interaction.startWorld.y - h / 2 : box.y;
      const stroke =
        isDark && toolOptions.shapeStroke === '#0F172A'
          ? '#CBD5E1'
          : toolOptions.shapeStroke;
      const newShape: ShapeObject = {
        id: interaction.id,
        type: 'shape',
        x,
        y,
        width: w,
        height: h,
        rotation: 0,
        shapeKind: toolOptions.shapeKind,
        fill: toolOptions.shapeFill,
        stroke,
        strokeWidth: toolOptions.shapeStrokeWidth,
        label: '',
      };
      onObjectsCommit([...objectsRef.current, newShape]);
      onSelectIds(new Set([newShape.id]));
      onSelectTool('select');
    } else if (interaction.kind === 'frame') {
      const box = normalizeRect(interaction.startWorld, interaction.currWorld);
      const isClick = box.width < 16 && box.height < 16;
      const w = isClick ? 560 : Math.max(160, box.width);
      const h = isClick ? 360 : Math.max(120, box.height);
      const x = isClick ? interaction.startWorld.x - w / 2 : box.x;
      const y = isClick ? interaction.startWorld.y - h / 2 : box.y;
      const frameCount = objectsRef.current.filter((o) => o.type === 'frame').length;
      const defaultSwatch = FRAME_SWATCHES[0];
      const newFrame: FrameObject = {
        id: interaction.id,
        type: 'frame',
        x,
        y,
        width: w,
        height: h,
        rotation: 0,
        title: `Section ${frameCount + 1}`,
        background: defaultSwatch.bg,
        borderColor: defaultSwatch.border,
      };
      onObjectsCommit([newFrame, ...objectsRef.current]);
      onSelectIds(new Set([newFrame.id]));
      setEditingId(newFrame.id);
      onSelectTool('select');
    } else if (interaction.kind === 'connector') {
      const dist = Math.hypot(
        interaction.currWorld.x - interaction.start.x,
        interaction.currWorld.y - interaction.start.y
      );
      if (dist > 14) {
        const endEndpoint: ConnectorEndpoint = interaction.snapEnd
          ? {
              objectId: interaction.snapEnd.objectId,
              side: interaction.snapEnd.side,
              x: interaction.snapEnd.x,
              y: interaction.snapEnd.y,
            }
          : { objectId: null, x: interaction.currWorld.x, y: interaction.currWorld.y };
        const stroke =
          isDark && toolOptions.connectorStroke === '#0F172A'
            ? '#CBD5E1'
            : toolOptions.connectorStroke;
        const newConn: ConnectorObject = {
          id: uid('conn'),
          type: 'connector',
          x: Math.min(interaction.start.x, endEndpoint.x),
          y: Math.min(interaction.start.y, endEndpoint.y),
          width: Math.abs(endEndpoint.x - interaction.start.x),
          height: Math.abs(endEndpoint.y - interaction.start.y),
          rotation: 0,
          start: interaction.start,
          end: endEndpoint,
          style: toolOptions.connectorStyle,
          stroke,
          strokeWidth: toolOptions.connectorStrokeWidth,
          arrowEnd: true,
          label: '',
        };
        onObjectsCommit([...objectsRef.current, newConn]);
        onSelectIds(new Set([newConn.id]));
        onSelectTool('select');
      }
    }

    setInteraction({ kind: 'idle' });
  };

  const startResize = (handle: ResizeHandle, e: React.PointerEvent) => {
    if (!selectionBounds) return;
    e.stopPropagation();
    const screenPt = getLocalPoint(e.clientX, e.clientY);
    const worldPt = screenToWorld(screenPt.x, screenPt.y, camera);
    const initialObjects = new Map<string, CanvasObject>();
    for (const o of selectedObjects) {
      initialObjects.set(o.id, structuredClone(o));
    }
    containerRef.current?.setPointerCapture(e.pointerId);
    setInteraction({
      kind: 'resize',
      handle,
      startWorld: worldPt,
      startBounds: { ...selectionBounds },
      initialObjects,
    });
  };

  const startRotate = (e: React.PointerEvent) => {
    if (!selectionBounds) return;
    e.stopPropagation();
    const screenPt = getLocalPoint(e.clientX, e.clientY);
    const worldPt = screenToWorld(screenPt.x, screenPt.y, camera);
    const center = {
      x: selectionBounds.x + selectionBounds.width / 2,
      y: selectionBounds.y + selectionBounds.height / 2,
    };
    const startAngle = (Math.atan2(worldPt.y - center.y, worldPt.x - center.x) * 180) / Math.PI;
    const initialRotations = new Map<string, number>();
    for (const o of selectedObjects) {
      if (o.type !== 'connector') initialRotations.set(o.id, o.rotation || 0);
    }
    containerRef.current?.setPointerCapture(e.pointerId);
    setInteraction({ kind: 'rotate', center, startAngle, initialRotations });
  };

  // Dynamic dot grid sizing
  const effectiveGridPx = useMemo(() => {
    let step = GRID_SIZE * camera.zoom;
    while (step < 14) step *= 2;
    while (step > 64) step /= 2;
    return step;
  }, [camera.zoom]);

  const dotColor = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.28)';
  const cursorClass =
    interaction.kind === 'pan'
      ? 'cursor-grabbing'
      : spaceHeld || activeTool === 'hand'
      ? 'cursor-grab'
      : activeTool === 'pen' || activeTool === 'shape' || activeTool === 'connector'
      ? 'cursor-crosshair'
      : activeTool === 'text'
      ? 'cursor-text'
      : 'cursor-default';

  const resizeHandles: Array<{ id: ResizeHandle; x: number; y: number; cursor: string }> =
    selectionBounds
      ? [
          { id: 'nw', x: selectionBounds.x, y: selectionBounds.y, cursor: 'nwse-resize' },
          {
            id: 'n',
            x: selectionBounds.x + selectionBounds.width / 2,
            y: selectionBounds.y,
            cursor: 'ns-resize',
          },
          {
            id: 'ne',
            x: selectionBounds.x + selectionBounds.width,
            y: selectionBounds.y,
            cursor: 'nesw-resize',
          },
          {
            id: 'e',
            x: selectionBounds.x + selectionBounds.width,
            y: selectionBounds.y + selectionBounds.height / 2,
            cursor: 'ew-resize',
          },
          {
            id: 'se',
            x: selectionBounds.x + selectionBounds.width,
            y: selectionBounds.y + selectionBounds.height,
            cursor: 'nwse-resize',
          },
          {
            id: 's',
            x: selectionBounds.x + selectionBounds.width / 2,
            y: selectionBounds.y + selectionBounds.height,
            cursor: 'ns-resize',
          },
          {
            id: 'sw',
            x: selectionBounds.x,
            y: selectionBounds.y + selectionBounds.height,
            cursor: 'nesw-resize',
          },
          {
            id: 'w',
            x: selectionBounds.x,
            y: selectionBounds.y + selectionBounds.height / 2,
            cursor: 'ew-resize',
          },
        ]
      : [];

  return (
    <div
      ref={containerRef}
      data-testid="canvas-stage"
      data-object-count={objects.length}
      data-zoom={Math.round(camera.zoom * 100)}
      data-tool={activeTool}
      data-selected-count={selectedIds.size}
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      onPointerCancel={handleStagePointerUp}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDragOverFiles(true);
        }
      }}
      onDragLeave={() => setIsDragOverFiles(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          setIsDragOverFiles(false);
          const screenPt = getLocalPoint(e.clientX, e.clientY);
          const worldPt = screenToWorld(screenPt.x, screenPt.y, camera);
          onDropFiles(e.dataTransfer.files, worldPt);
        }
      }}
      className={`relative w-full h-full overflow-hidden touch-none select-none bg-[#F7F8FA] dark:bg-[#0F141B] ${cursorClass}`}
      style={{
        backgroundImage: `radial-gradient(${dotColor} 1.2px, transparent 1.2px)`,
        backgroundSize: `${effectiveGridPx}px ${effectiveGridPx}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
    >
      {/* File drop indicator overlay */}
      {isDragOverFiles && (
        <div className="pointer-events-none fixed inset-4 z-40 rounded-2xl border-2 border-dashed border-blue-500 bg-blue-500/5 flex items-center justify-center">
          <div className="px-4 py-2 rounded-xl bg-white dark:bg-[#161D27] border border-blue-200 dark:border-blue-800 shadow-md text-sm font-medium text-blue-600 dark:text-blue-400">
            Drop images or files anywhere on the canvas
          </div>
        </div>
      )}

      {/* World Transform Container */}
      <div
        className="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{
          transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
        }}
      >
        {/* Background Layer: Named Section Frames */}
        {visibleObjects
          .filter((o): o is FrameObject => o.type === 'frame')
          .map((frame) => {
            const isSelected = selectedIds.has(frame.id);
            const isEditing = editingId === frame.id;
            return (
              <div
                key={frame.id}
                style={{
                  position: 'absolute',
                  left: frame.x,
                  top: frame.y,
                  width: frame.width,
                  height: frame.height,
                  backgroundColor: frame.background,
                  borderColor: isSelected ? '#2563EB' : frame.borderColor || '#94A3B8',
                  pointerEvents: 'none',
                }}
                className="rounded-2xl border border-dashed"
              >
                {/* Frame draggable title header above top-left corner */}
                <div
                  onPointerDown={(e) => startObjectDrag(frame.id, e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(frame.id);
                  }}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: -28,
                    pointerEvents: 'auto',
                  }}
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[12.5px] font-semibold cursor-grab active:cursor-grabbing select-none border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white/90 dark:bg-[#161D27]/90 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#263142]'
                  }`}
                >
                  {isEditing ? (
                    <input
                      type="text"
                      autoFocus
                      data-inline-editor="true"
                      aria-label="Frame title"
                      value={frame.title}
                      onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateSingleObject({ ...frame, title: e.target.value }, false)
                      }
                      onBlur={() => {
                        setEditingId(null);
                        onObjectsCommit(objectsRef.current);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          setEditingId(null);
                          onObjectsCommit(objectsRef.current);
                        }
                      }}
                      className="w-36 bg-transparent text-[12.5px] font-semibold focus:outline-none"
                    />
                  ) : (
                    <span>{frame.title || 'Untitled Frame'}</span>
                  )}
                </div>
              </div>
            );
          })}

        {/* Live Frame Draft Preview */}
        {interaction.kind === 'frame' &&
          (() => {
            const box = normalizeRect(interaction.startWorld, interaction.currWorld);
            return (
              <div
                style={{
                  position: 'absolute',
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  pointerEvents: 'none',
                }}
                className="rounded-2xl border-2 border-dashed border-blue-500 bg-blue-500/5"
              />
            );
          })()}

        {/* Vector Layer: Pen strokes, Connectors, Draft previews, Marquee */}
        <svg
          className="overflow-visible pointer-events-none absolute top-0 left-0"
          width="1"
          height="1"
        >
          {/* Freehand Pen Strokes */}
          {visibleObjects
            .filter((o): o is PenObject => o.type === 'pen')
            .map((stroke) => {
              const isSelected = selectedIds.has(stroke.id);
              const opacity = stroke.mode === 'highlighter' ? 0.36 : 1;
              const cx = stroke.x + stroke.width / 2;
              const cy = stroke.y + stroke.height / 2;
              return (
                <g
                  key={stroke.id}
                  transform={
                    stroke.rotation
                      ? `rotate(${stroke.rotation} ${cx} ${cy}) translate(${stroke.x} ${stroke.y})`
                      : `translate(${stroke.x} ${stroke.y})`
                  }
                  opacity={opacity}
                  className="pointer-events-auto cursor-move"
                  onPointerDown={(e) => startObjectDrag(stroke.id, e)}
                >
                  {stroke.mode === 'pen' ? (
                    <path
                      d={buildPressureOutlinePath(stroke.points, stroke.strokeWidth)}
                      fill={stroke.color}
                    />
                  ) : (
                    <path
                      d={buildStrokePath(stroke.points)}
                      fill="none"
                      stroke={stroke.color}
                      strokeWidth={stroke.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {/* Wide transparent hit area */}
                  <path
                    d={buildStrokePath(stroke.points)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(14, stroke.strokeWidth + 10)}
                  />
                  {isSelected && (
                    <rect
                      x={0}
                      y={0}
                      width={stroke.width}
                      height={stroke.height}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth={1.25 / camera.zoom}
                      strokeDasharray={`${4 / camera.zoom} ${3 / camera.zoom}`}
                    />
                  )}
                </g>
              );
            })}

          {/* Connectors / Arrows */}
          {visibleObjects
            .filter((o): o is ConnectorObject => o.type === 'connector')
            .map((conn) => {
              const geo = buildConnectorPath(conn, objects);
              const isSelected = selectedIds.has(conn.id);
              const arrowSize = 9 + conn.strokeWidth * 1.4;
              return (
                <g
                  key={conn.id}
                  className="pointer-events-auto cursor-pointer"
                  onPointerDown={(e) => startObjectDrag(conn.id, e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(conn.id);
                  }}
                >
                  {/* Fat invisible hit target */}
                  <path
                    d={geo.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(18, conn.strokeWidth + 14)}
                  />
                  <path
                    d={geo.d}
                    fill="none"
                    stroke={isSelected ? '#2563EB' : conn.stroke}
                    strokeWidth={conn.strokeWidth + (isSelected ? 0.75 : 0)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {conn.arrowEnd !== false && (
                    <polygon
                      points={buildArrowheadPoints(geo.end, geo.endAngleRad, arrowSize)}
                      fill={isSelected ? '#2563EB' : conn.stroke}
                    />
                  )}
                  {conn.arrowStart && (
                    <polygon
                      points={buildArrowheadPoints(geo.start, geo.startAngleRad, arrowSize)}
                      fill={isSelected ? '#2563EB' : conn.stroke}
                    />
                  )}
                </g>
              );
            })}

          {/* Live Pen Draft */}
          {interaction.kind === 'pen' && interaction.points.length > 0 && (
            <path
              d={
                toolOptions.penMode === 'highlighter'
                  ? buildStrokePath(interaction.points)
                  : buildPressureOutlinePath(interaction.points, toolOptions.penWidth)
              }
              fill={
                toolOptions.penMode === 'highlighter'
                  ? 'none'
                  : isDark && toolOptions.penColor === '#0F172A'
                  ? '#F1F5F9'
                  : toolOptions.penColor
              }
              stroke={
                toolOptions.penMode === 'highlighter'
                  ? toolOptions.penColor
                  : 'none'
              }
              strokeWidth={
                toolOptions.penMode === 'highlighter'
                  ? Math.max(14, toolOptions.penWidth * 3)
                  : 0
              }
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={toolOptions.penMode === 'highlighter' ? 0.36 : 1}
            />
          )}

          {/* Live Shape Draft */}
          {interaction.kind === 'shape' &&
            (() => {
              const box = normalizeRect(interaction.startWorld, interaction.currWorld);
              const fill = toolOptions.shapeFill === 'transparent' ? 'none' : toolOptions.shapeFill;
              const stroke =
                isDark && toolOptions.shapeStroke === '#0F172A'
                  ? '#CBD5E1'
                  : toolOptions.shapeStroke;
              if (toolOptions.shapeKind === 'ellipse') {
                return (
                  <ellipse
                    cx={box.x + box.width / 2}
                    cy={box.y + box.height / 2}
                    rx={box.width / 2}
                    ry={box.height / 2}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={toolOptions.shapeStrokeWidth}
                  />
                );
              }
              if (toolOptions.shapeKind === 'diamond') {
                const cx = box.x + box.width / 2;
                const cy = box.y + box.height / 2;
                return (
                  <polygon
                    points={`${cx},${box.y} ${box.x + box.width},${cy} ${cx},${box.y + box.height} ${box.x},${cy}`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={toolOptions.shapeStrokeWidth}
                  />
                );
              }
              if (toolOptions.shapeKind === 'triangle') {
                const cx = box.x + box.width / 2;
                return (
                  <polygon
                    points={`${cx},${box.y} ${box.x + box.width},${box.y + box.height} ${box.x},${box.y + box.height}`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={toolOptions.shapeStrokeWidth}
                  />
                );
              }
              if (toolOptions.shapeKind === 'line') {
                return (
                  <line
                    x1={interaction.startWorld.x}
                    y1={interaction.startWorld.y}
                    x2={interaction.currWorld.x}
                    y2={interaction.currWorld.y}
                    stroke={stroke}
                    strokeWidth={toolOptions.shapeStrokeWidth}
                    strokeLinecap="round"
                  />
                );
              }
              return (
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  rx={10}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={toolOptions.shapeStrokeWidth}
                />
              );
            })()}

          {/* Live Connector Draft */}
          {interaction.kind === 'connector' &&
            (() => {
              const draftConn: ConnectorObject = {
                id: 'draft',
                type: 'connector',
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                rotation: 0,
                style: toolOptions.connectorStyle,
                stroke: '#2563EB',
                strokeWidth: toolOptions.connectorStrokeWidth,
                arrowEnd: true,
                start: interaction.start,
                end: interaction.snapEnd
                  ? {
                      objectId: interaction.snapEnd.objectId,
                      side: interaction.snapEnd.side,
                      x: interaction.snapEnd.x,
                      y: interaction.snapEnd.y,
                    }
                  : { objectId: null, x: interaction.currWorld.x, y: interaction.currWorld.y },
              };
              const geo = buildConnectorPath(draftConn, objects);
              return (
                <g>
                  <path
                    d={geo.d}
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth={toolOptions.connectorStrokeWidth}
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                  />
                  <polygon
                    points={buildArrowheadPoints(geo.end, geo.endAngleRad, 11)}
                    fill="#2563EB"
                  />
                </g>
              );
            })()}

          {/* Anchor Ports Indicator when Connector tool is active OR dragging a connector endpoint */}
          {(activeTool === 'connector' || interaction.kind === 'connector-endpoint') &&
            visibleObjects
              .filter((o) => o.type !== 'connector' && o.type !== 'pen')
              .map((obj) => (
                <g key={`ports_${obj.id}`}>
                  {getAllAnchorPorts(obj).map((port) => {
                    const snappedObj =
                      interaction.kind === 'connector'
                        ? interaction.snapEnd
                        : interaction.kind === 'connector-endpoint'
                        ? interaction.snapTarget
                        : null;
                    const isSnapped =
                      snappedObj?.objectId === obj.id && snappedObj?.side === port.side;
                    return (
                      <circle
                        key={port.side}
                        cx={port.x}
                        cy={port.y}
                        r={(isSnapped ? 6.5 : 4.5) / camera.zoom}
                        fill={isSnapped ? '#2563EB' : '#FFFFFF'}
                        stroke="#2563EB"
                        strokeWidth={1.75 / camera.zoom}
                      />
                    );
                  })}
                </g>
              ))}

          {/* Marquee Selection Box */}
          {interaction.kind === 'marquee' &&
            (() => {
              const box = normalizeRect(interaction.startWorld, interaction.currWorld);
              return (
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill="rgba(37, 99, 235, 0.08)"
                  stroke="#2563EB"
                  strokeWidth={1.25 / camera.zoom}
                />
              );
            })()}
        </svg>

        {/* Connector Labels (HTML for crisp editable badges) */}
        {visibleObjects
          .filter((o): o is ConnectorObject => o.type === 'connector')
          .map((conn) => {
            const isEditing = editingId === conn.id;
            if (!conn.label && !isEditing) return null;
            const isSelected = selectedIds.has(conn.id);
            const showMidHandle =
              isSelected &&
              selectedObjects.length === 1 &&
              (conn.style === 'curved' || conn.style === 'elbow');
            const geo = buildConnectorPath(conn, objects);
            return (
              <div
                key={`label_${conn.id}`}
                style={{
                  position: 'absolute',
                  left: geo.mid.x,
                  top: showMidHandle ? geo.mid.y - 22 / camera.zoom : geo.mid.y,
                  transform: 'translate(-50%, -50%)',
                }}
                onPointerDown={(e) => {
                  if (isEditing) {
                    e.stopPropagation();
                    return;
                  }
                  startObjectDrag(conn.id, e);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingId(conn.id);
                }}
                className="px-2 py-0.5 rounded-md bg-[#F7F8FA] dark:bg-[#0F141B] border border-slate-200 dark:border-[#263142] text-[12px] text-slate-700 dark:text-slate-200 shadow-xs cursor-pointer select-none"
              >
                {isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    data-inline-editor="true"
                    aria-label="Connector label"
                    value={conn.label ?? ''}
                    onChange={(e) => updateSingleObject({ ...conn, label: e.target.value }, false)}
                    onBlur={() => {
                      setEditingId(null);
                      onObjectsCommit(objectsRef.current);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        setEditingId(null);
                        onObjectsCommit(objectsRef.current);
                      }
                    }}
                    className="w-28 bg-transparent text-center text-[12px] focus:outline-none"
                  />
                ) : (
                  <span>{conn.label}</span>
                )}
              </div>
            );
          })}

        {/* Interactive Object Layer: Shapes, Stickies, Text, Checklists, Kanban, Charts, Images, Files */}
        {visibleObjects
          .filter((o) => o.type !== 'pen' && o.type !== 'connector' && o.type !== 'frame')
          .map((obj) => {
            const isSelected = selectedIds.has(obj.id);
            const isEditing = editingId === obj.id;
            const wrapperStyle: React.CSSProperties = {
              position: 'absolute',
              left: obj.x,
              top: obj.y,
              width: obj.width,
              height: obj.height,
              transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
              transformOrigin: 'center center',
            };

            if (obj.type === 'shape') {
              const fill = obj.fill === 'transparent' ? 'none' : obj.fill;
              const isDarkFill = obj.fill === '#1E293B';
              return (
                <div
                  key={obj.id}
                  style={wrapperStyle}
                  onPointerDown={(e) => startObjectDrag(obj.id, e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(obj.id);
                  }}
                  className="group cursor-move"
                >
                  <svg
                    viewBox={`0 0 ${Math.max(1, obj.width)} ${Math.max(1, obj.height)}`}
                    className="w-full h-full overflow-visible block"
                  >
                    {obj.shapeKind === 'rectangle' && (
                      <rect
                        x={0}
                        y={0}
                        width={obj.width}
                        height={obj.height}
                        rx={10}
                        fill={fill}
                        stroke={obj.stroke}
                        strokeWidth={obj.strokeWidth}
                      />
                    )}
                    {obj.shapeKind === 'ellipse' && (
                      <ellipse
                        cx={obj.width / 2}
                        cy={obj.height / 2}
                        rx={obj.width / 2}
                        ry={obj.height / 2}
                        fill={fill}
                        stroke={obj.stroke}
                        strokeWidth={obj.strokeWidth}
                      />
                    )}
                    {obj.shapeKind === 'diamond' && (
                      <polygon
                        points={`${obj.width / 2},0 ${obj.width},${obj.height / 2} ${obj.width / 2},${obj.height} 0,${obj.height / 2}`}
                        fill={fill}
                        stroke={obj.stroke}
                        strokeWidth={obj.strokeWidth}
                        strokeLinejoin="round"
                      />
                    )}
                    {obj.shapeKind === 'triangle' && (
                      <polygon
                        points={`${obj.width / 2},0 ${obj.width},${obj.height} 0,${obj.height}`}
                        fill={fill}
                        stroke={obj.stroke}
                        strokeWidth={obj.strokeWidth}
                        strokeLinejoin="round"
                      />
                    )}
                    {obj.shapeKind === 'line' && (
                      <line
                        x1={0}
                        y1={obj.height / 2}
                        x2={obj.width}
                        y2={obj.height / 2}
                        stroke={obj.stroke}
                        strokeWidth={obj.strokeWidth}
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-none">
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        data-inline-editor="true"
                        aria-label="Shape label"
                        value={obj.label ?? ''}
                        onPointerDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateSingleObject({ ...obj, label: e.target.value }, false)
                        }
                        onBlur={() => {
                          setEditingId(null);
                          onObjectsCommit(objectsRef.current);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            setEditingId(null);
                            onObjectsCommit(objectsRef.current);
                          }
                        }}
                        className={`pointer-events-auto w-full bg-transparent text-center text-[13.5px] font-medium focus:outline-none ${
                          isDarkFill ? 'text-white' : 'text-slate-900 dark:text-slate-100'
                        }`}
                      />
                    ) : obj.label ? (
                      <span
                        className={`text-[13.5px] font-medium text-center leading-tight break-words ${
                          obj.fill === 'transparent'
                            ? 'text-slate-900 dark:text-slate-100'
                            : isDarkFill
                            ? 'text-white'
                            : 'text-slate-900'
                        }`}
                      >
                        {obj.label}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            }

            if (obj.type === 'text') {
              const displayColor =
                isDark && obj.color === '#0F172A' ? '#F1F5F9' : obj.color;
              return (
                <div
                  key={obj.id}
                  style={wrapperStyle}
                  onPointerDown={(e) => startObjectDrag(obj.id, e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(obj.id);
                  }}
                  className="cursor-move"
                >
                  {isEditing ? (
                    <textarea
                      autoFocus
                      data-inline-editor="true"
                      aria-label="Canvas text"
                      value={obj.text}
                      placeholder="Type something..."
                      onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const target = e.currentTarget;
                        const nextH = Math.max(obj.fontSize * 1.5, target.scrollHeight);
                        updateSingleObject({ ...obj, text: e.target.value, height: nextH }, false);
                      }}
                      onBlur={() => {
                        setEditingId(null);
                        onObjectsCommit(objectsRef.current);
                      }}
                      style={{
                        fontSize: obj.fontSize,
                        fontWeight: obj.fontWeight,
                        color: displayColor,
                      }}
                      className="w-full h-full bg-transparent resize-none leading-snug focus:outline-none overflow-hidden"
                    />
                  ) : (
                    <div
                      style={{
                        fontSize: obj.fontSize,
                        fontWeight: obj.fontWeight,
                        color: displayColor,
                      }}
                      className="w-full h-full leading-snug whitespace-pre-wrap break-words"
                    >
                      {obj.text || (
                        <span className="text-slate-400 italic text-sm">Double-click to type</span>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            if (obj.type === 'sticky') {
              const palette =
                STICKY_PALETTE.find((p) => p.id === obj.color) ?? STICKY_PALETTE[0];
              return (
                <div
                  key={obj.id}
                  style={{
                    ...wrapperStyle,
                    backgroundColor: palette.bg,
                    borderColor: `${palette.border}55`,
                    color: palette.text,
                  }}
                  onPointerDown={(e) => startObjectDrag(obj.id, e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(obj.id);
                  }}
                  className="rounded-xl border shadow-sm p-3.5 flex flex-col cursor-move"
                >
                  {isEditing ? (
                    <textarea
                      autoFocus
                      data-inline-editor="true"
                      aria-label="Sticky note text"
                      value={obj.text}
                      placeholder="Write a note..."
                      onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const el = e.currentTarget;
                        const desiredHeight = Math.max(obj.height, el.scrollHeight + 28);
                        updateSingleObject(
                          { ...obj, text: e.target.value, height: desiredHeight },
                          false
                        );
                      }}
                      onBlur={() => {
                        setEditingId(null);
                        onObjectsCommit(objectsRef.current);
                      }}
                      className="w-full flex-1 bg-transparent text-[13.5px] leading-relaxed resize-none focus:outline-none placeholder:opacity-50"
                      style={{ color: palette.text }}
                    />
                  ) : (
                    <div className="w-full flex-1 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words overflow-hidden">
                      {obj.text || <span className="opacity-45 italic">Double-click to write...</span>}
                    </div>
                  )}
                </div>
              );
            }

            if (obj.type === 'checklist') {
              return (
                <div key={obj.id} style={wrapperStyle}>
                  <ChecklistCard
                    obj={obj}
                    isSelected={isSelected}
                    onUpdate={(next, commit) => updateSingleObject(next, commit)}
                    onSelectStart={(e) => startObjectDrag(obj.id, e)}
                  />
                </div>
              );
            }

            if (obj.type === 'kanban') {
              return (
                <div key={obj.id} style={wrapperStyle}>
                  <KanbanCard
                    obj={obj}
                    isSelected={isSelected}
                    onUpdate={(next, commit) => updateSingleObject(next, commit)}
                    onSelectStart={(e) => startObjectDrag(obj.id, e)}
                  />
                </div>
              );
            }

            if (obj.type === 'chart') {
              return (
                <div key={obj.id} style={wrapperStyle}>
                  <ChartCard
                    obj={obj}
                    isSelected={isSelected}
                    onUpdate={(next, commit) => updateSingleObject(next, commit)}
                    onSelectStart={(e) => startObjectDrag(obj.id, e)}
                  />
                </div>
              );
            }

            if (obj.type === 'image') {
              return (
                <div key={obj.id} style={wrapperStyle}>
                  <ImageCard obj={obj} onSelectStart={(e) => startObjectDrag(obj.id, e)} />
                </div>
              );
            }

            if (obj.type === 'file') {
              return (
                <div key={obj.id} style={wrapperStyle}>
                  <FileCard
                    obj={obj}
                    onSelectStart={(e) => startObjectDrag(obj.id, e)}
                    onPreviewFile={onPreviewFile}
                  />
                </div>
              );
            }

            return null;
          })}

        {/* Selection Bounding Frame, 8 Resize Handles & Rotation Handle */}
        {selectionBounds && (
          <div
            style={{
              position: 'absolute',
              left: selectionBounds.x,
              top: selectionBounds.y,
              width: selectionBounds.width,
              height: selectionBounds.height,
              border: `${1.5 / camera.zoom}px solid #2563EB`,
              pointerEvents: 'none',
            }}
          >
            {/* Rotation Handle */}
            <button
              type="button"
              aria-label="Rotate selection"
              onPointerDown={startRotate}
              style={{
                position: 'absolute',
                left: '50%',
                top: -28 / camera.zoom,
                width: 20 / camera.zoom,
                height: 20 / camera.zoom,
                transform: 'translate(-50%, -50%)',
                borderWidth: 1.5 / camera.zoom,
                pointerEvents: 'auto',
              }}
              className="rounded-full bg-white border-blue-600 text-blue-600 flex items-center justify-center shadow-xs cursor-grab active:cursor-grabbing"
            >
              <RotateCw style={{ width: 11 / camera.zoom, height: 11 / camera.zoom }} />
            </button>

            {/* 8 Resize Handles */}
            {resizeHandles.map((h) => (
              <div
                key={h.id}
                onPointerDown={(e) => startResize(h.id, e)}
                style={{
                  position: 'absolute',
                  left: h.x - selectionBounds.x,
                  top: h.y - selectionBounds.y,
                  width: 9 / camera.zoom,
                  height: 9 / camera.zoom,
                  transform: 'translate(-50%, -50%)',
                  borderWidth: 1.5 / camera.zoom,
                  cursor: h.cursor,
                  pointerEvents: 'auto',
                }}
                className="rounded-[2px] bg-white border-blue-600 shadow-xs"
              />
            ))}
          </div>
        )}

        {/* Selected Connector Endpoint Re-attachment & Midpoint Bend Handles */}
        {selectedObjects.length === 1 &&
          selectedObjects[0].type === 'connector' &&
          (() => {
            const conn = selectedObjects[0];
            const geo = buildConnectorPath(conn, objects);
            const showMidpoint = conn.style === 'curved' || conn.style === 'elbow';
            const handleSz = 12 / camera.zoom;
            const midSz = 11 / camera.zoom;
            return (
              <>
                <button
                  type="button"
                  aria-label="Drag connector start endpoint"
                  data-testid="connector-handle-start"
                  title="Drag to re-attach start"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    containerRef.current?.setPointerCapture(e.pointerId);
                    setInteraction({
                      kind: 'connector-endpoint',
                      connectorId: conn.id,
                      endKey: 'start',
                      snapTarget: null,
                    });
                  }}
                  style={{
                    position: 'absolute',
                    left: geo.start.x,
                    top: geo.start.y,
                    width: handleSz,
                    height: handleSz,
                    transform: 'translate(-50%, -50%)',
                    borderWidth: 2 / camera.zoom,
                  }}
                  className="rounded-full bg-white border-blue-600 shadow-sm cursor-grab active:cursor-grabbing z-20"
                />
                <button
                  type="button"
                  aria-label="Drag connector end endpoint"
                  data-testid="connector-handle-end"
                  title="Drag to re-attach end"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    containerRef.current?.setPointerCapture(e.pointerId);
                    setInteraction({
                      kind: 'connector-endpoint',
                      connectorId: conn.id,
                      endKey: 'end',
                      snapTarget: null,
                    });
                  }}
                  style={{
                    position: 'absolute',
                    left: geo.end.x,
                    top: geo.end.y,
                    width: handleSz,
                    height: handleSz,
                    transform: 'translate(-50%, -50%)',
                    borderWidth: 2 / camera.zoom,
                  }}
                  className="rounded-full bg-white border-blue-600 shadow-sm cursor-grab active:cursor-grabbing z-20"
                />
                {showMidpoint && (
                  <button
                    type="button"
                    aria-label="Drag connector midpoint handle"
                    data-testid="connector-handle-midpoint"
                    title="Drag to adjust curve/elbow (double-click to reset)"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      containerRef.current?.setPointerCapture(e.pointerId);
                      setInteraction({
                        kind: 'connector-midpoint',
                        connectorId: conn.id,
                      });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      updateSingleObject({ ...conn, midpointOffset: null }, true);
                    }}
                    style={{
                      position: 'absolute',
                      left: geo.mid.x,
                      top: geo.mid.y,
                      width: midSz,
                      height: midSz,
                      transform: 'translate(-50%, -50%) rotate(45deg)',
                      borderWidth: 1.75 / camera.zoom,
                    }}
                    className="rounded-[2px] bg-blue-600 border-white shadow-sm cursor-move z-20"
                  />
                )}
              </>
            );
          })()}

        {/* Top-Layer Anchor Port Overlay when creating or re-attaching a connector */}
        {(activeTool === 'connector' || interaction.kind === 'connector-endpoint') && (
          <svg
            className="overflow-visible pointer-events-none absolute top-0 left-0 z-10"
            width="1"
            height="1"
          >
            {visibleObjects
              .filter((o) => o.type !== 'connector' && o.type !== 'pen')
              .map((obj) => (
                <g key={`top_ports_${obj.id}`}>
                  {getAllAnchorPorts(obj).map((port) => {
                    const snappedObj =
                      interaction.kind === 'connector'
                        ? interaction.snapEnd
                        : interaction.kind === 'connector-endpoint'
                        ? interaction.snapTarget
                        : null;
                    const isSnapped =
                      snappedObj?.objectId === obj.id && snappedObj?.side === port.side;
                    return (
                      <circle
                        key={port.side}
                        cx={port.x}
                        cy={port.y}
                        r={(isSnapped ? 6.5 : 4.5) / camera.zoom}
                        fill={isSnapped ? '#2563EB' : '#FFFFFF'}
                        stroke="#2563EB"
                        strokeWidth={1.75 / camera.zoom}
                      />
                    );
                  })}
                </g>
              ))}
          </svg>
        )}

        {/* Smart Alignment Guide Lines & Equal-Spacing Indicators */}
        {(alignmentGuides.lines.length > 0 || alignmentGuides.spacings.length > 0) && (
          <svg
            className="overflow-visible pointer-events-none absolute top-0 left-0 z-30"
            width="1"
            height="1"
            data-testid="alignment-guides-layer"
          >
            {alignmentGuides.lines.map((line, i) =>
              line.orientation === 'v' ? (
                <g key={`v_${i}`}>
                  <line
                    data-testid="alignment-guide-line"
                    x1={line.pos}
                    y1={line.start}
                    x2={line.pos}
                    y2={line.end}
                    stroke="#F43F5E"
                    strokeWidth={1.15 / camera.zoom}
                    strokeDasharray={`${4 / camera.zoom} ${3 / camera.zoom}`}
                  />
                </g>
              ) : (
                <g key={`h_${i}`}>
                  <line
                    data-testid="alignment-guide-line"
                    x1={line.start}
                    y1={line.pos}
                    x2={line.end}
                    y2={line.pos}
                    stroke="#F43F5E"
                    strokeWidth={1.15 / camera.zoom}
                    strokeDasharray={`${4 / camera.zoom} ${3 / camera.zoom}`}
                  />
                </g>
              )
            )}

            {alignmentGuides.spacings.map((sp, i) => {
              const cap = 4.5 / camera.zoom;
              const sw = 1.25 / camera.zoom;
              const fontSize = 10 / camera.zoom;
              const padX = 5 / camera.zoom;
              const label = `${sp.gap}`;
              const pillW = Math.max(20 / camera.zoom, label.length * (6.2 / camera.zoom) + padX * 2);
              const pillH = 15 / camera.zoom;
              if (sp.orientation === 'h') {
                const midX = (sp.from + sp.to) / 2;
                return (
                  <g key={`sph_${i}`} data-testid="alignment-spacing-indicator">
                    <line
                      x1={sp.from}
                      y1={sp.crossPos}
                      x2={sp.to}
                      y2={sp.crossPos}
                      stroke="#F43F5E"
                      strokeWidth={sw}
                    />
                    <line
                      x1={sp.from}
                      y1={sp.crossPos - cap}
                      x2={sp.from}
                      y2={sp.crossPos + cap}
                      stroke="#F43F5E"
                      strokeWidth={sw}
                    />
                    <line
                      x1={sp.to}
                      y1={sp.crossPos - cap}
                      x2={sp.to}
                      y2={sp.crossPos + cap}
                      stroke="#F43F5E"
                      strokeWidth={sw}
                    />
                    <rect
                      x={midX - pillW / 2}
                      y={sp.crossPos - pillH / 2}
                      width={pillW}
                      height={pillH}
                      rx={3.5 / camera.zoom}
                      fill="#F43F5E"
                    />
                    <text
                      x={midX}
                      y={sp.crossPos + fontSize * 0.35}
                      textAnchor="middle"
                      fontSize={fontSize}
                      fontFamily="'JetBrains Mono', monospace"
                      fontWeight={600}
                      fill="#FFFFFF"
                    >
                      {label}
                    </text>
                  </g>
                );
              }
              const midY = (sp.from + sp.to) / 2;
              return (
                <g key={`spv_${i}`} data-testid="alignment-spacing-indicator">
                  <line
                    x1={sp.crossPos}
                    y1={sp.from}
                    x2={sp.crossPos}
                    y2={sp.to}
                    stroke="#F43F5E"
                    strokeWidth={sw}
                  />
                  <line
                    x1={sp.crossPos - cap}
                    y1={sp.from}
                    x2={sp.crossPos + cap}
                    y2={sp.from}
                    stroke="#F43F5E"
                    strokeWidth={sw}
                  />
                  <line
                    x1={sp.crossPos - cap}
                    y1={sp.to}
                    x2={sp.crossPos + cap}
                    y2={sp.to}
                    stroke="#F43F5E"
                    strokeWidth={sw}
                  />
                  <rect
                    x={sp.crossPos - pillW / 2}
                    y={midY - pillH / 2}
                    width={pillW}
                    height={pillH}
                    rx={3.5 / camera.zoom}
                    fill="#F43F5E"
                  />
                  <text
                    x={sp.crossPos}
                    y={midY + fontSize * 0.35}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fontFamily="'JetBrains Mono', monospace"
                    fontWeight={600}
                    fill="#FFFFFF"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
};
