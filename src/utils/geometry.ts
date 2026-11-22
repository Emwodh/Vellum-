import type {
  AnchorSide,
  Camera,
  CanvasObject,
  ConnectorEndpoint,
  ConnectorObject,
  Point,
  StrokePoint,
} from '../types/canvas';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5.0;
export const GRID_SIZE = 24;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function screenToWorld(screenX: number, screenY: number, camera: Camera): Point {
  return {
    x: (screenX - camera.x) / camera.zoom,
    y: (screenY - camera.y) / camera.zoom,
  };
}

export function worldToScreen(worldX: number, worldY: number, camera: Camera): Point {
  return {
    x: worldX * camera.zoom + camera.x,
    y: worldY * camera.zoom + camera.y,
  };
}

/**
 * Zooms the camera toward a fixed cursor screen point so the world point under the cursor stays stationary.
 */
export function zoomCameraAtPoint(
  camera: Camera,
  screenX: number,
  screenY: number,
  nextZoomRaw: number
): Camera {
  const nextZoom = clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM);
  const worldBefore = screenToWorld(screenX, screenY, camera);
  return {
    zoom: nextZoom,
    x: screenX - worldBefore.x * nextZoom,
    y: screenY - worldBefore.y * nextZoom,
  };
}

export function snapValue(value: number, gridSize = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(pt: Point, enabled: boolean, gridSize = GRID_SIZE): Point {
  if (!enabled) return pt;
  return {
    x: snapValue(pt.x, gridSize),
    y: snapValue(pt.y, gridSize),
  };
}

export function getObjectBounds(obj: CanvasObject, allObjects?: CanvasObject[]): Rect {
  if (obj.type === 'connector') {
    const start = resolveEndpoint(obj.start, allObjects);
    const end = resolveEndpoint(obj.end, allObjects);
    const midX = (start.x + end.x) / 2 + (obj.midpointOffset?.x ?? 0);
    const midY = (start.y + end.y) / 2 + (obj.midpointOffset?.y ?? 0);
    const minX = Math.min(start.x, end.x, midX) - 24;
    const minY = Math.min(start.y, end.y, midY) - 24;
    const maxX = Math.max(start.x, end.x, midX) + 24;
    const maxY = Math.max(start.y, end.y, midY) + 24;
    return {
      x: minX,
      y: minY,
      width: Math.max(32, maxX - minX),
      height: Math.max(32, maxY - minY),
    };
  }
  return {
    x: obj.x,
    y: obj.y,
    width: Math.max(1, obj.width),
    height: Math.max(1, obj.height),
  };
}

export function getCombinedBounds(objects: CanvasObject[], allObjects?: CanvasObject[]): Rect | null {
  if (objects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of objects) {
    const b = getObjectBounds(obj, allObjects ?? objects);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function computeZoomToFit(
  objects: CanvasObject[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 96
): Camera {
  const bounds = getCombinedBounds(objects);
  if (!bounds || viewportWidth <= 0 || viewportHeight <= 0) {
    return { x: viewportWidth / 2, y: viewportHeight / 2, zoom: 1 };
  }
  const availW = Math.max(120, viewportWidth - padding * 2);
  const availH = Math.max(120, viewportHeight - padding * 2);
  const zoom = clamp(Math.min(availW / bounds.width, availH / bounds.height, 1.25), MIN_ZOOM, MAX_ZOOM);
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return {
    zoom,
    x: viewportWidth / 2 - cx * zoom,
    y: viewportHeight / 2 - cy * zoom,
  };
}

export function computeCameraToFocusObject(
  obj: CanvasObject,
  allObjects: CanvasObject[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 120
): Camera {
  const b = getObjectBounds(obj, allObjects);
  const availW = Math.max(160, viewportWidth - padding * 2);
  const availH = Math.max(160, viewportHeight - padding * 2);
  const maxZoom = obj.type === 'frame' ? 1.15 : 1.35;
  const zoom = clamp(Math.min(availW / b.width, availH / b.height, maxZoom), 0.25, maxZoom);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return {
    zoom,
    x: viewportWidth / 2 - cx * zoom,
    y: viewportHeight / 2 - cy * zoom,
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

export function normalizeRect(p1: Point, p2: Point): Rect {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  return {
    x,
    y,
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  };
}

export function getViewportWorldRect(camera: Camera, width: number, height: number, margin = 200): Rect {
  const tl = screenToWorld(-margin, -margin, camera);
  const br = screenToWorld(width + margin, height + margin, camera);
  return {
    x: tl.x,
    y: tl.y,
    width: br.x - tl.x,
    height: br.y - tl.y,
  };
}

/**
 * Returns anchor port position on an object's bounding box, accounting for rotation.
 */
export function getAnchorPoint(obj: CanvasObject, side: AnchorSide): Point {
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  let localX = 0;
  let localY = 0;
  switch (side) {
    case 'top':
      localY = -obj.height / 2;
      break;
    case 'bottom':
      localY = obj.height / 2;
      break;
    case 'left':
      localX = -obj.width / 2;
      break;
    case 'right':
      localX = obj.width / 2;
      break;
    case 'center':
    default:
      break;
  }
  if (!obj.rotation) {
    return { x: cx + localX, y: cy + localY };
  }
  const rad = (obj.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cx + localX * cos - localY * sin,
    y: cy + localX * sin + localY * cos,
  };
}

export function getAllAnchorPorts(obj: CanvasObject): Array<{ side: AnchorSide; x: number; y: number }> {
  const sides: AnchorSide[] = ['top', 'right', 'bottom', 'left'];
  return sides.map((side) => ({
    side,
    ...getAnchorPoint(obj, side),
  }));
}

export function resolveEndpoint(
  endpoint: ConnectorEndpoint,
  allObjects?: CanvasObject[]
): Point {
  if (endpoint.objectId && allObjects) {
    const target = allObjects.find((o) => o.id === endpoint.objectId);
    if (target) {
      return getAnchorPoint(target, endpoint.side ?? 'center');
    }
  }
  return { x: endpoint.x, y: endpoint.y };
}

export function findNearestAnchor(
  pt: Point,
  objects: CanvasObject[],
  maxDistance = 28,
  excludeId?: string
): { objectId: string; side: AnchorSide; x: number; y: number } | null {
  let best: { objectId: string; side: AnchorSide; x: number; y: number; dist: number } | null = null;
  for (const obj of objects) {
    if (obj.type === 'connector' || obj.type === 'pen' || obj.id === excludeId) continue;
    const ports = getAllAnchorPorts(obj);
    for (const port of ports) {
      const dist = Math.hypot(port.x - pt.x, port.y - pt.y);
      if (dist <= maxDistance && (!best || dist < best.dist)) {
        best = { objectId: obj.id, side: port.side, x: port.x, y: port.y, dist };
      }
    }
  }
  if (!best) return null;
  return { objectId: best.objectId, side: best.side, x: best.x, y: best.y };
}

function sideNormal(side?: AnchorSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

export interface ConnectorPathGeometry {
  d: string;
  mid: Point;
  start: Point;
  end: Point;
  endAngleRad: number;
  startAngleRad: number;
}

export function buildConnectorPath(
  connector: ConnectorObject,
  allObjects: CanvasObject[]
): ConnectorPathGeometry {
  const start = resolveEndpoint(connector.start, allObjects);
  const end = resolveEndpoint(connector.end, allObjects);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy);

  if (connector.style === 'straight') {
    const angle = Math.atan2(dy, dx);
    return {
      d: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
      mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      start,
      end,
      endAngleRad: angle,
      startAngleRad: angle + Math.PI,
    };
  }

  if (connector.style === 'elbow') {
    const sNorm = sideNormal(connector.start.side);
    const eNorm = sideNormal(connector.end.side);
    const horizontalBias =
      sNorm.x !== 0 || eNorm.x !== 0
        ? Math.abs(sNorm.x) + Math.abs(eNorm.x) >= Math.abs(sNorm.y) + Math.abs(eNorm.y)
        : Math.abs(dx) >= Math.abs(dy);

    const offX = connector.midpointOffset?.x ?? 0;
    const offY = connector.midpointOffset?.y ?? 0;
    let pts: Point[];
    if (horizontalBias) {
      const midX = (start.x + end.x) / 2 + offX;
      pts = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
    } else {
      const midY = (start.y + end.y) / 2 + offY;
      pts = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
    }
    const d = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    const prevEnd = pts[pts.length - 2];
    const nextStart = pts[1];
    return {
      d,
      mid: { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 },
      start,
      end,
      endAngleRad: Math.atan2(end.y - prevEnd.y, end.x - prevEnd.x),
      startAngleRad: Math.atan2(start.y - nextStart.y, start.x - nextStart.x),
    };
  }

  // Curved connector: if user dragged the midpoint handle, route a smooth quadratic Bezier through that exact midpoint
  if (
    connector.midpointOffset &&
    (Math.abs(connector.midpointOffset.x) > 0.5 || Math.abs(connector.midpointOffset.y) > 0.5)
  ) {
    const mid: Point = {
      x: (start.x + end.x) / 2 + connector.midpointOffset.x,
      y: (start.y + end.y) / 2 + connector.midpointOffset.y,
    };
    const ctrl: Point = {
      x: 2 * mid.x - 0.5 * (start.x + end.x),
      y: 2 * mid.y - 0.5 * (start.y + end.y),
    };
    return {
      d: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
      mid,
      start,
      end,
      endAngleRad: Math.atan2(end.y - ctrl.y, end.x - ctrl.x),
      startAngleRad: Math.atan2(start.y - ctrl.y, start.x - ctrl.x),
    };
  }

  // Default curved cubic Bezier
  const tension = clamp(dist * 0.42, 40, 220);
  const sNorm = sideNormal(connector.start.side);
  const eNorm = sideNormal(connector.end.side);
  const c1: Point =
    sNorm.x !== 0 || sNorm.y !== 0
      ? { x: start.x + sNorm.x * tension, y: start.y + sNorm.y * tension }
      : { x: start.x + dx * 0.35, y: start.y };
  const c2: Point =
    eNorm.x !== 0 || eNorm.y !== 0
      ? { x: end.x + eNorm.x * tension, y: end.y + eNorm.y * tension }
      : { x: end.x - dx * 0.35, y: end.y };

  // Midpoint on cubic Bezier at t = 0.5
  const mid: Point = {
    x: 0.125 * start.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * end.x,
    y: 0.125 * start.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * end.y,
  };

  return {
    d: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    mid,
    start,
    end,
    endAngleRad: Math.atan2(end.y - c2.y, end.x - c2.x),
    startAngleRad: Math.atan2(start.y - c1.y, start.x - c1.x),
  };
}

export function buildArrowheadPoints(tip: Point, angleRad: number, size = 11): string {
  const spread = Math.PI / 6.5;
  const p1 = {
    x: tip.x - size * Math.cos(angleRad - spread),
    y: tip.y - size * Math.sin(angleRad - spread),
  };
  const p2 = {
    x: tip.x - size * Math.cos(angleRad + spread),
    y: tip.y - size * Math.sin(angleRad + spread),
  };
  return `${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
}

/**
 * Smooths raw freehand points using a weighted moving average (Chaikin/EMA blend)
 * while preserving endpoints and pressure values.
 */
export function smoothStrokePoints(points: StrokePoint[], passes = 2): StrokePoint[] {
  if (points.length < 3) return points;
  let curr = points;
  for (let pass = 0; pass < passes; pass++) {
    const next: StrokePoint[] = [curr[0]];
    for (let i = 1; i < curr.length - 1; i++) {
      const prev = curr[i - 1];
      const pt = curr[i];
      const after = curr[i + 1];
      next.push({
        x: prev.x * 0.25 + pt.x * 0.5 + after.x * 0.25,
        y: prev.y * 0.25 + pt.y * 0.5 + after.y * 0.25,
        p: prev.p * 0.25 + pt.p * 0.5 + after.p * 0.25,
      });
    }
    next.push(curr[curr.length - 1]);
    curr = next;
  }
  return curr;
}

/**
 * Builds a smooth quadratic SVG path from stroke points.
 */
export function buildStrokePath(points: StrokePoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + 0.1).toFixed(1)} ${(p.y + 0.1).toFixed(1)}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

/**
 * Builds a closed variable-width outline polygon SVG path for pressure-sensitive stylus strokes.
 */
export function buildPressureOutlinePath(points: StrokePoint[], baseWidth: number): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const r = Math.max(1, (baseWidth * clamp(points[0].p, 0.2, 1.2)) / 2);
    const { x, y } = points[0];
    return `M ${x - r} ${y} A ${r} ${r} 0 1 0 ${x + r} ${y} A ${r} ${r} 0 1 0 ${x - r} ${y} Z`;
  }

  const left: Point[] = [];
  const right: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;

    // Taper ends slightly
    const endTaper = i === 0 || i === points.length - 1 ? 0.65 : 1;
    const radius = Math.max(0.6, (baseWidth * clamp(curr.p, 0.25, 1.25) * endTaper) / 2);
    left.push({ x: curr.x + nx * radius, y: curr.y + ny * radius });
    right.push({ x: curr.x - nx * radius, y: curr.y - ny * radius });
  }

  const parts: string[] = [`M ${left[0].x.toFixed(1)} ${left[0].y.toFixed(1)}`];
  for (let i = 1; i < left.length; i++) {
    parts.push(`L ${left[i].x.toFixed(1)} ${left[i].y.toFixed(1)}`);
  }
  for (let i = right.length - 1; i >= 0; i--) {
    parts.push(`L ${right[i].x.toFixed(1)} ${right[i].y.toFixed(1)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Checks whether a world point is near any segment of a freehand stroke (for the eraser tool).
 */
export function isPointNearStroke(
  pt: Point,
  objX: number,
  objY: number,
  points: StrokePoint[],
  threshold = 14
): boolean {
  const localX = pt.x - objX;
  const localY = pt.y - objY;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[Math.min(points.length - 1, i + 1)];
    if (distanceToSegment({ x: localX, y: localY }, a, b) <= threshold) {
      return true;
    }
  }
  return false;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function uid(prefix = 'obj'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
