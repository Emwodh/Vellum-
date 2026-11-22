export type ToolType =
  | 'select'
  | 'hand'
  | 'pen'
  | 'text'
  | 'sticky'
  | 'shape'
  | 'connector'
  | 'checklist'
  | 'kanban'
  | 'chart'
  | 'frame'
  | 'media';

export type PenMode = 'pen' | 'highlighter' | 'eraser';
export type ShapeKind = 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'line';
export type ConnectorStyle = 'straight' | 'curved' | 'elbow';
export type AnchorSide = 'top' | 'right' | 'bottom' | 'left' | 'center';
export type ChartType = 'line' | 'bar' | 'scatter' | 'pie' | 'function';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface Point {
  x: number;
  y: number;
}

export interface StrokePoint {
  x: number;
  y: number;
  p: number; // pressure 0.1..1.0
}

export interface Camera {
  x: number; // pan X in screen px
  y: number; // pan Y in screen px
  zoom: number; // scale factor 0.1..5
}

export interface BaseCanvasObject {
  id: string;
  type:
    | 'pen'
    | 'text'
    | 'sticky'
    | 'shape'
    | 'connector'
    | 'checklist'
    | 'kanban'
    | 'chart'
    | 'frame'
    | 'image'
    | 'file';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  groupId?: string | null;
  locked?: boolean;
  opacity?: number;
}

export interface PenObject extends BaseCanvasObject {
  type: 'pen';
  points: StrokePoint[]; // stored relative to (x, y)
  color: string;
  strokeWidth: number;
  mode: 'pen' | 'highlighter';
  smoothed: boolean;
}

export interface TextObject extends BaseCanvasObject {
  type: 'text';
  text: string;
  fontSize: number;
  fontWeight: '400' | '500' | '600' | '700';
  color: string;
  align?: 'left' | 'center' | 'right';
}

export interface StickyObject extends BaseCanvasObject {
  type: 'sticky';
  text: string;
  color: string; // preset key or hex
  fontSize?: number;
}

export interface ShapeObject extends BaseCanvasObject {
  type: 'shape';
  shapeKind: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  label?: string;
}

export interface ConnectorEndpoint {
  objectId?: string | null;
  side?: AnchorSide;
  x: number;
  y: number;
}

export interface ConnectorObject extends BaseCanvasObject {
  type: 'connector';
  start: ConnectorEndpoint;
  end: ConnectorEndpoint;
  style: ConnectorStyle;
  stroke: string;
  strokeWidth: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  label?: string;
  midpointOffset?: Point | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ChecklistObject extends BaseCanvasObject {
  type: 'checklist';
  title: string;
  items: ChecklistItem[];
  accentColor?: string;
}

export interface KanbanCardItem {
  id: string;
  title: string;
  note?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCardItem[];
}

export interface KanbanObject extends BaseCanvasObject {
  type: 'kanban';
  title: string;
  columns: KanbanColumn[];
}

export interface ChartObject extends BaseCanvasObject {
  type: 'chart';
  title: string;
  chartType: ChartType;
  csvData: string; // table or CSV text
  formula: string; // e.g., "y = sin(x)"
  xMin: number;
  xMax: number;
  accentColor: string;
}

export interface ImageObject extends BaseCanvasObject {
  type: 'image';
  src: string; // data URL
  name: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface FileObject extends BaseCanvasObject {
  type: 'file';
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface FrameObject extends BaseCanvasObject {
  type: 'frame';
  title: string;
  background: string;
  borderColor?: string;
}

export type CanvasObject =
  | PenObject
  | TextObject
  | StickyObject
  | ShapeObject
  | ConnectorObject
  | ChecklistObject
  | KanbanObject
  | ChartObject
  | FrameObject
  | ImageObject
  | FileObject;

export interface Board {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  camera: Camera;
  objects: CanvasObject[];
}

export interface ToolOptions {
  penMode: PenMode;
  penColor: string;
  penWidth: number;
  penSmooth: boolean;
  textSize: number;
  textWeight: '400' | '500' | '600' | '700';
  textColor: string;
  stickyColor: string;
  shapeKind: ShapeKind;
  shapeFill: string;
  shapeStroke: string;
  shapeStrokeWidth: number;
  connectorStyle: ConnectorStyle;
  connectorStroke: string;
  connectorStrokeWidth: number;
}

export const STICKY_PALETTE = [
  { id: 'butter', name: 'Warm Sand', bg: '#FEF3C7', border: '#F59E0B', text: '#451A03' },
  { id: 'sage', name: 'Soft Sage', bg: '#DCFCE7', border: '#22C55E', text: '#052E16' },
  { id: 'sky', name: 'Studio Sky', bg: '#E0F2FE', border: '#0EA5E9', text: '#082F49' },
  { id: 'rose', name: 'Blush Rose', bg: '#FFE4E6', border: '#F43F5E', text: '#4C0519' },
  { id: 'lavender', name: 'Muted Lilac', bg: '#EDE9FE', border: '#8B5CF6', text: '#2E1065' },
  { id: 'slate', name: 'Paper Neutral', bg: '#F1F5F9', border: '#94A3B8', text: '#0F172A' },
] as const;

export const STROKE_SWATCHES = [
  '#0F172A',
  '#475569',
  '#2563EB',
  '#0D9488',
  '#16A34A',
  '#D97706',
  '#DC2626',
  '#7C3AED',
  '#FFFFFF',
] as const;

export const FILL_SWATCHES = [
  'transparent',
  '#FFFFFF',
  '#F1F5F9',
  '#DBEAFE',
  '#CCFBF1',
  '#DCFCE7',
  '#FEF3C7',
  '#FEE2E2',
  '#EDE9FE',
  '#1E293B',
] as const;

export const FRAME_SWATCHES = [
  { id: 'neutral', name: 'Mist', bg: 'rgba(148, 163, 184, 0.08)', border: '#94A3B8' },
  { id: 'cobalt', name: 'Cobalt', bg: 'rgba(37, 99, 235, 0.06)', border: '#3B82F6' },
  { id: 'teal', name: 'Teal', bg: 'rgba(13, 148, 136, 0.06)', border: '#14B8A6' },
  { id: 'amber', name: 'Sand', bg: 'rgba(217, 119, 6, 0.07)', border: '#F59E0B' },
  { id: 'violet', name: 'Iris', bg: 'rgba(124, 58, 237, 0.06)', border: '#8B5CF6' },
] as const;
