import type { CanvasObject, FrameObject } from '../types/canvas';

export interface SearchMatch {
  objectId: string;
  objectType: CanvasObject['type'];
  title: string;
  snippet: string;
}

function extractSearchableStrings(obj: CanvasObject): Array<{ title: string; text: string }> {
  switch (obj.type) {
    case 'text':
      return [{ title: 'Text', text: obj.text }];
    case 'sticky':
      return [{ title: 'Sticky Note', text: obj.text }];
    case 'shape':
      return obj.label ? [{ title: `Shape (${obj.shapeKind})`, text: obj.label }] : [];
    case 'connector':
      return obj.label ? [{ title: 'Connector', text: obj.label }] : [];
    case 'frame':
      return [{ title: 'Frame', text: obj.title }];
    case 'checklist': {
      const itemsText = obj.items.map((i) => i.text).join(' · ');
      return [{ title: obj.title || 'Checklist', text: `${obj.title} ${itemsText}`.trim() }];
    }
    case 'kanban': {
      const parts = [obj.title];
      for (const col of obj.columns) {
        parts.push(col.title);
        for (const card of col.cards) {
          parts.push(card.title);
          if (card.note) parts.push(card.note);
        }
      }
      return [{ title: obj.title || 'Kanban', text: parts.join(' · ') }];
    }
    case 'chart':
      return [
        {
          title: obj.title || 'Chart',
          text: `${obj.title} ${obj.formula} ${obj.csvData}`.trim(),
        },
      ];
    case 'image':
      return [{ title: 'Image', text: obj.name }];
    case 'file':
      return [{ title: 'File', text: obj.name }];
    case 'pen':
    default:
      return [];
  }
}

function buildSnippet(haystack: string, queryLower: string, maxLen = 72): string {
  const normalized = haystack.replace(/\s+/g, ' ').trim();
  const idx = normalized.toLowerCase().indexOf(queryLower);
  if (idx === -1) return normalized.slice(0, maxLen);
  const start = Math.max(0, idx - 22);
  const end = Math.min(normalized.length, idx + queryLower.length + 38);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalized.length ? '…' : '';
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

export function searchCanvasObjects(objects: CanvasObject[], rawQuery: string): SearchMatch[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const matches: SearchMatch[] = [];

  for (const obj of objects) {
    const fields = extractSearchableStrings(obj);
    for (const field of fields) {
      if (field.text.toLowerCase().includes(q)) {
        matches.push({
          objectId: obj.id,
          objectType: obj.type,
          title: field.title,
          snippet: buildSnippet(field.text, q),
        });
        break;
      }
    }
  }
  return matches;
}

export function getBoardFrames(objects: CanvasObject[]): FrameObject[] {
  return objects.filter((o): o is FrameObject => o.type === 'frame');
}

/**
 * Returns IDs of non-frame objects whose center lies inside a given frame's bounds.
 */
export function getObjectsInsideFrame(frame: FrameObject, objects: CanvasObject[]): string[] {
  const inside: string[] = [];
  for (const obj of objects) {
    if (obj.id === frame.id || obj.type === 'frame' || obj.type === 'connector') continue;
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    if (
      cx >= frame.x &&
      cx <= frame.x + frame.width &&
      cy >= frame.y &&
      cy <= frame.y + frame.height
    ) {
      inside.push(obj.id);
    }
  }
  return inside;
}
