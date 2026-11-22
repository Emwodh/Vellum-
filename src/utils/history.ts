import type { CanvasObject } from '../types/canvas';
import { uid } from './geometry';

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export const MAX_HISTORY = 80;

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], present: initial, future: [] };
}

export function pushHistory<T>(state: HistoryState<T>, next: T): HistoryState<T> {
  if (state.present === next) return state;
  const past = [...state.past, state.present];
  if (past.length > MAX_HISTORY) past.shift();
  return { past, present: next, future: [] };
}

export function undoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future].slice(0, MAX_HISTORY),
  };
}

export function redoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return {
    past: [...state.past, state.present].slice(-MAX_HISTORY),
    present: next,
    future: state.future.slice(1),
  };
}

/**
 * Clones objects with fresh IDs and optional offset, remapping connector references and groupIds within the selection.
 */
export function cloneObjectsWithOffset(
  objects: CanvasObject[],
  offsetX = 28,
  offsetY = 28
): CanvasObject[] {
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();

  for (const obj of objects) {
    idMap.set(obj.id, uid(obj.type));
    if (obj.groupId && !groupMap.has(obj.groupId)) {
      groupMap.set(obj.groupId, uid('grp'));
    }
  }

  return objects.map((obj) => {
    const cloned = structuredClone(obj);
    cloned.id = idMap.get(obj.id)!;
    if (cloned.groupId) {
      cloned.groupId = groupMap.get(cloned.groupId) ?? null;
    }
    if (cloned.type === 'connector') {
      cloned.start = {
        ...cloned.start,
        objectId: cloned.start.objectId ? idMap.get(cloned.start.objectId) ?? null : null,
        x: cloned.start.x + offsetX,
        y: cloned.start.y + offsetY,
      };
      cloned.end = {
        ...cloned.end,
        objectId: cloned.end.objectId ? idMap.get(cloned.end.objectId) ?? null : null,
        x: cloned.end.x + offsetX,
        y: cloned.end.y + offsetY,
      };
    } else {
      cloned.x += offsetX;
      cloned.y += offsetY;
    }
    return cloned;
  });
}

export type LayerAction = 'front' | 'back' | 'forward' | 'backward';

export function reorderObjectsLayer(
  objects: CanvasObject[],
  selectedIds: Set<string>,
  action: LayerAction
): CanvasObject[] {
  if (selectedIds.size === 0) return objects;
  const list = [...objects];

  if (action === 'front') {
    const rest = list.filter((o) => !selectedIds.has(o.id));
    const sel = list.filter((o) => selectedIds.has(o.id));
    return [...rest, ...sel];
  }

  if (action === 'back') {
    const sel = list.filter((o) => selectedIds.has(o.id));
    const rest = list.filter((o) => !selectedIds.has(o.id));
    return [...sel, ...rest];
  }

  if (action === 'forward') {
    for (let i = list.length - 2; i >= 0; i--) {
      if (selectedIds.has(list[i].id) && !selectedIds.has(list[i + 1].id)) {
        const tmp = list[i];
        list[i] = list[i + 1];
        list[i + 1] = tmp;
      }
    }
    return list;
  }

  // backward
  for (let i = 1; i < list.length; i++) {
    if (selectedIds.has(list[i].id) && !selectedIds.has(list[i - 1].id)) {
      const tmp = list[i];
      list[i] = list[i - 1];
      list[i - 1] = tmp;
    }
  }
  return list;
}

export function groupObjects(
  objects: CanvasObject[],
  selectedIds: Set<string>
): CanvasObject[] {
  if (selectedIds.size < 2) return objects;
  const newGroupId = uid('grp');
  return objects.map((obj) =>
    selectedIds.has(obj.id) ? { ...obj, groupId: newGroupId } : obj
  );
}

export function ungroupObjects(
  objects: CanvasObject[],
  selectedIds: Set<string>
): CanvasObject[] {
  const groupIdsToClear = new Set<string>();
  for (const obj of objects) {
    if (selectedIds.has(obj.id) && obj.groupId) {
      groupIdsToClear.add(obj.groupId);
    }
  }
  if (groupIdsToClear.size === 0) return objects;
  return objects.map((obj) =>
    obj.groupId && groupIdsToClear.has(obj.groupId) ? { ...obj, groupId: null } : obj
  );
}

/**
 * Expands a clicked object ID to include all members of its group.
 */
export function expandSelectionWithGroups(
  objects: CanvasObject[],
  baseIds: Iterable<string>
): Set<string> {
  const result = new Set<string>(baseIds);
  const groupIds = new Set<string>();
  for (const obj of objects) {
    if (result.has(obj.id) && obj.groupId) {
      groupIds.add(obj.groupId);
    }
  }
  if (groupIds.size > 0) {
    for (const obj of objects) {
      if (obj.groupId && groupIds.has(obj.groupId)) {
        result.add(obj.id);
      }
    }
  }
  return result;
}
