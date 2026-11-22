import type { Board, CanvasObject, ChartObject, StickyObject } from '../types/canvas';
import { STICKY_PALETTE } from '../types/canvas';
import {
  buildArrowheadPoints,
  buildConnectorPath,
  buildPressureOutlinePath,
  buildStrokePath,
  getCombinedBounds,
} from './geometry';
import { compileFormula, parseChartCsv } from './mathParser';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getStickyStyle(colorKey: string) {
  return STICKY_PALETTE.find((p) => p.id === colorKey) ?? STICKY_PALETTE[0];
}

function renderChartSvgInner(obj: ChartObject, isDark: boolean): string {
  const padL = 34;
  const padR = 16;
  const padT = 38;
  const padB = 26;
  const w = obj.width - padL - padR;
  const h = obj.height - padT - padB;
  const axisColor = isDark ? '#475569' : '#CBD5E1';
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const bg = isDark ? '#161D27' : '#FFFFFF';
  const border = isDark ? '#263142' : '#E2E8F0';
  const titleColor = isDark ? '#F1F5F9' : '#0F172A';

  let content = `<rect x="0" y="0" width="${obj.width}" height="${obj.height}" rx="12" fill="${bg}" stroke="${border}" stroke-width="1" />`;
  content += `<text x="14" y="24" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="${titleColor}">${escapeXml(obj.title)}</text>`;

  if (obj.chartType === 'function') {
    const { fn } = compileFormula(obj.formula);
    if (fn) {
      const samples = 160;
      const xMin = obj.xMin;
      const xMax = obj.xMax > obj.xMin ? obj.xMax : obj.xMin + 10;
      const pts: Array<{ x: number; y: number }> = [];
      let yMin = Infinity;
      let yMax = -Infinity;
      for (let i = 0; i <= samples; i++) {
        const x = xMin + ((xMax - xMin) * i) / samples;
        const y = fn(x);
        if (Number.isFinite(y) && Math.abs(y) < 1e5) {
          pts.push({ x, y });
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
        }
      }
      if (pts.length > 1) {
        if (yMin === yMax) {
          yMin -= 1;
          yMax += 1;
        }
        const mapX = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * w;
        const mapY = (y: number) => padT + h - ((y - yMin) / (yMax - yMin)) * h;
        const zeroY = mapY(0);
        const zeroX = mapX(0);
        if (zeroY >= padT && zeroY <= padT + h) {
          content += `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${padL + w}" y2="${zeroY.toFixed(1)}" stroke="${axisColor}" stroke-width="1" />`;
        }
        if (zeroX >= padL && zeroX <= padL + w) {
          content += `<line x1="${zeroX.toFixed(1)}" y1="${padT}" x2="${zeroX.toFixed(1)}" y2="${padT + h}" stroke="${axisColor}" stroke-width="1" />`;
        }
        const d = pts
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapX(p.x).toFixed(1)} ${mapY(p.y).toFixed(1)}`)
          .join(' ');
        content += `<path d="${d}" fill="none" stroke="${obj.accentColor}" stroke-width="2.2" stroke-linecap="round" />`;
      }
    }
    content += `<text x="${obj.width - 14}" y="24" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="11" fill="${textColor}">${escapeXml(obj.formula)}</text>`;
    return content;
  }

  const parsed = parseChartCsv(obj.csvData);
  const firstSeries = parsed.series[0];
  if (!firstSeries || firstSeries.values.length === 0) return content;

  const palette = [obj.accentColor, '#0D9488', '#D97706', '#7C3AED', '#DC2626'];

  if (obj.chartType === 'pie') {
    const total = firstSeries.values.reduce((acc, v) => acc + Math.max(0, v), 0) || 1;
    const cx = obj.width / 2;
    const cy = padT + h / 2;
    const r = Math.min(w, h) * 0.42;
    let angle = -Math.PI / 2;
    firstSeries.values.forEach((v, idx) => {
      const slice = (Math.max(0, v) / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(angle + slice);
      const y2 = cy + r * Math.sin(angle + slice);
      const largeArc = slice > Math.PI ? 1 : 0;
      content += `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${palette[idx % palette.length]}" />`;
      angle += slice;
    });
    return content;
  }

  const allVals = parsed.series.flatMap((s) => s.values);
  const maxV = Math.max(1, ...allVals);
  const minV = Math.min(0, ...allVals);
  const range = maxV - minV || 1;

  content += `<line x1="${padL}" y1="${padT + h}" x2="${padL + w}" y2="${padT + h}" stroke="${axisColor}" stroke-width="1" />`;
  content += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + h}" stroke="${axisColor}" stroke-width="1" />`;

  if (obj.chartType === 'bar') {
    const count = parsed.labels.length;
    const groupW = w / Math.max(1, count);
    const barW = Math.max(6, (groupW * 0.72) / parsed.series.length);
    parsed.series.forEach((s, si) => {
      s.values.forEach((val, idx) => {
        const bx = padL + idx * groupW + groupW * 0.14 + si * barW;
        const bh = ((val - minV) / range) * h;
        const by = padT + h - bh;
        content += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${Math.max(2, barW - 2).toFixed(1)}" height="${Math.max(1, bh).toFixed(1)}" rx="3" fill="${palette[si % palette.length]}" />`;
      });
    });
  } else {
    parsed.series.forEach((s, si) => {
      const pts = s.values.map((val, idx) => {
        const px = padL + (s.values.length > 1 ? (idx / (s.values.length - 1)) * w : w / 2);
        const py = padT + h - ((val - minV) / range) * h;
        return { x: px, y: py };
      });
      if (obj.chartType === 'line') {
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        content += `<path d="${d}" fill="none" stroke="${palette[si % palette.length]}" stroke-width="2.2" />`;
      }
      pts.forEach((p) => {
        content += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${palette[si % palette.length]}" />`;
      });
    });
  }

  return content;
}

export function buildBoardSvgString(board: Board, isDark: boolean): string {
  const bounds = getCombinedBounds(board.objects) ?? { x: 0, y: 0, width: 900, height: 600 };
  const pad = 48;
  const vbX = bounds.x - pad;
  const vbY = bounds.y - pad;
  const vbW = bounds.width + pad * 2;
  const vbH = bounds.height + pad * 2;
  const bg = isDark ? '#0F141B' : '#F7F8FA';
  const cardBg = isDark ? '#161D27' : '#FFFFFF';
  const cardBorder = isDark ? '#263142' : '#E2E8F0';
  const ink = isDark ? '#F1F5F9' : '#0F172A';
  const muted = isDark ? '#94A3B8' : '#64748B';

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(vbW)}" height="${Math.ceil(vbH)}" viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}">`
  );
  parts.push(`<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${bg}" />`);

  const orderedObjects = [
    ...board.objects.filter((o) => o.type === 'frame'),
    ...board.objects.filter((o) => o.type !== 'frame'),
  ];

  for (const obj of orderedObjects) {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const rotTransform = obj.rotation ? ` transform="rotate(${obj.rotation} ${cx} ${cy})"` : '';

    if (obj.type === 'frame') {
      const border = obj.borderColor || '#94A3B8';
      parts.push(`<g${rotTransform}>`);
      parts.push(
        `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="14" fill="${obj.background}" stroke="${border}" stroke-width="1.5" stroke-dasharray="6 4" />`
      );
      parts.push(
        `<text x="${obj.x + 8}" y="${obj.y - 10}" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="${muted}">${escapeXml(obj.title)}</text>`
      );
      parts.push(`</g>`);
    } else if (obj.type === 'pen') {
      const opacity = obj.mode === 'highlighter' ? 0.38 : 1;
      parts.push(`<g transform="translate(${obj.x} ${obj.y})" opacity="${opacity}">`);
      if (obj.mode === 'pen') {
        const d = buildPressureOutlinePath(obj.points, obj.strokeWidth);
        parts.push(`<path d="${d}" fill="${obj.color}" />`);
      } else {
        const d = buildStrokePath(obj.points);
        parts.push(
          `<path d="${d}" fill="none" stroke="${obj.color}" stroke-width="${obj.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`
        );
      }
      parts.push(`</g>`);
    } else if (obj.type === 'shape') {
      parts.push(`<g${rotTransform}>`);
      const fill = obj.fill === 'transparent' ? 'none' : obj.fill;
      if (obj.shapeKind === 'rectangle') {
        parts.push(
          `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="10" fill="${fill}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" />`
        );
      } else if (obj.shapeKind === 'ellipse') {
        parts.push(
          `<ellipse cx="${cx}" cy="${cy}" rx="${obj.width / 2}" ry="${obj.height / 2}" fill="${fill}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" />`
        );
      } else if (obj.shapeKind === 'diamond') {
        const pts = `${cx},${obj.y} ${obj.x + obj.width},${cy} ${cx},${obj.y + obj.height} ${obj.x},${cy}`;
        parts.push(
          `<polygon points="${pts}" fill="${fill}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" stroke-linejoin="round" />`
        );
      } else if (obj.shapeKind === 'triangle') {
        const pts = `${cx},${obj.y} ${obj.x + obj.width},${obj.y + obj.height} ${obj.x},${obj.y + obj.height}`;
        parts.push(
          `<polygon points="${pts}" fill="${fill}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" stroke-linejoin="round" />`
        );
      } else if (obj.shapeKind === 'line') {
        parts.push(
          `<line x1="${obj.x}" y1="${obj.y + obj.height / 2}" x2="${obj.x + obj.width}" y2="${obj.y + obj.height / 2}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" stroke-linecap="round" />`
        );
      }
      if (obj.label) {
        parts.push(
          `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="14" font-weight="500" fill="${ink}">${escapeXml(obj.label)}</text>`
        );
      }
      parts.push(`</g>`);
    } else if (obj.type === 'connector') {
      const geo = buildConnectorPath(obj, board.objects);
      parts.push(`<g>`);
      parts.push(
        `<path d="${geo.d}" fill="none" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`
      );
      if (obj.arrowEnd !== false) {
        const arrowPts = buildArrowheadPoints(geo.end, geo.endAngleRad, 10 + obj.strokeWidth);
        parts.push(`<polygon points="${arrowPts}" fill="${obj.stroke}" />`);
      }
      if (obj.arrowStart) {
        const arrowPts = buildArrowheadPoints(geo.start, geo.startAngleRad, 10 + obj.strokeWidth);
        parts.push(`<polygon points="${arrowPts}" fill="${obj.stroke}" />`);
      }
      if (obj.label) {
        const lw = Math.max(44, obj.label.length * 7.5 + 16);
        parts.push(
          `<rect x="${geo.mid.x - lw / 2}" y="${geo.mid.y - 12}" width="${lw}" height="24" rx="6" fill="${bg}" stroke="${cardBorder}" />`
        );
        parts.push(
          `<text x="${geo.mid.x}" y="${geo.mid.y + 4}" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="12" fill="${ink}">${escapeXml(obj.label)}</text>`
        );
      }
      parts.push(`</g>`);
    } else if (obj.type === 'text') {
      const lines = obj.text.split('\n');
      parts.push(`<g${rotTransform}>`);
      lines.forEach((line, idx) => {
        parts.push(
          `<text x="${obj.x}" y="${obj.y + obj.fontSize * (idx + 1)}" font-family="DM Sans, sans-serif" font-size="${obj.fontSize}" font-weight="${obj.fontWeight}" fill="${obj.color}">${escapeXml(line)}</text>`
        );
      });
      parts.push(`</g>`);
    } else if (obj.type === 'sticky') {
      const st = getStickyStyle((obj as StickyObject).color);
      parts.push(`<g${rotTransform}>`);
      parts.push(
        `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="10" fill="${st.bg}" stroke="${st.border}" stroke-opacity="0.45" />`
      );
      const lines = obj.text.split('\n');
      lines.forEach((line, idx) => {
        parts.push(
          `<text x="${obj.x + 14}" y="${obj.y + 28 + idx * 19}" font-family="DM Sans, sans-serif" font-size="13.5" fill="${st.text}">${escapeXml(line)}</text>`
        );
      });
      parts.push(`</g>`);
    } else if (obj.type === 'checklist') {
      parts.push(`<g transform="translate(${obj.x} ${obj.y})">`);
      parts.push(
        `<rect x="0" y="0" width="${obj.width}" height="${obj.height}" rx="12" fill="${cardBg}" stroke="${cardBorder}" />`
      );
      parts.push(
        `<text x="14" y="26" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="600" fill="${ink}">${escapeXml(obj.title)}</text>`
      );
      obj.items.slice(0, 12).forEach((item, idx) => {
        const iy = 54 + idx * 24;
        parts.push(
          `<rect x="14" y="${iy - 11}" width="13" height="13" rx="3" fill="${item.done ? '#2563EB' : 'none'}" stroke="${item.done ? '#2563EB' : muted}" />`
        );
        parts.push(
          `<text x="34" y="${iy}" font-family="DM Sans, sans-serif" font-size="12.5" fill="${item.done ? muted : ink}">${escapeXml(item.text)}</text>`
        );
      });
      parts.push(`</g>`);
    } else if (obj.type === 'kanban') {
      parts.push(`<g transform="translate(${obj.x} ${obj.y})">`);
      parts.push(
        `<rect x="0" y="0" width="${obj.width}" height="${obj.height}" rx="12" fill="${cardBg}" stroke="${cardBorder}" />`
      );
      parts.push(
        `<text x="16" y="28" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="600" fill="${ink}">${escapeXml(obj.title)}</text>`
      );
      const colW = (obj.width - 32 - (obj.columns.length - 1) * 10) / Math.max(1, obj.columns.length);
      obj.columns.forEach((col, ci) => {
        const cxCol = 16 + ci * (colW + 10);
        parts.push(
          `<rect x="${cxCol}" y="42" width="${colW}" height="${obj.height - 56}" rx="8" fill="${bg}" stroke="${cardBorder}" />`
        );
        parts.push(
          `<text x="${cxCol + 10}" y="62" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="600" fill="${muted}">${escapeXml(col.title)}</text>`
        );
        col.cards.slice(0, 6).forEach((card, kIdx) => {
          const cyCard = 74 + kIdx * 42;
          parts.push(
            `<rect x="${cxCol + 8}" y="${cyCard}" width="${colW - 16}" height="34" rx="6" fill="${cardBg}" stroke="${cardBorder}" />`
          );
          parts.push(
            `<text x="${cxCol + 16}" y="${cyCard + 21}" font-family="DM Sans, sans-serif" font-size="11.5" fill="${ink}">${escapeXml(card.title.slice(0, 26))}</text>`
          );
        });
      });
      parts.push(`</g>`);
    } else if (obj.type === 'chart') {
      parts.push(`<g transform="translate(${obj.x} ${obj.y})">${renderChartSvgInner(obj, isDark)}</g>`);
    } else if (obj.type === 'image') {
      parts.push(
        `<g${rotTransform}><image href="${obj.src}" x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" preserveAspectRatio="none" /></g>`
      );
    } else if (obj.type === 'file') {
      parts.push(`<g transform="translate(${obj.x} ${obj.y})">`);
      parts.push(
        `<rect x="0" y="0" width="${obj.width}" height="${obj.height}" rx="10" fill="${cardBg}" stroke="${cardBorder}" />`
      );
      parts.push(
        `<text x="16" y="34" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="${ink}">${escapeXml(obj.name)}</text>`
      );
      parts.push(
        `<text x="16" y="54" font-family="JetBrains Mono, monospace" font-size="11" fill="${muted}">${Math.max(1, Math.round(obj.size / 1024))} KB</text>`
      );
      parts.push(`</g>`);
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vellum-board';
}

export function exportBoardAsJson(board: Board): void {
  const payload = JSON.stringify({ version: 1, app: 'vellum', board }, null, 2);
  triggerDownload(new Blob([payload], { type: 'application/json' }), `${safeSlug(board.name)}.vellum.json`);
}

export function exportBoardAsSvg(board: Board, isDark: boolean): void {
  const svg = buildBoardSvgString(board, isDark);
  triggerDownload(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeSlug(board.name)}.svg`);
}

export async function exportBoardAsPng(board: Board, isDark: boolean): Promise<void> {
  const svg = buildBoardSvgString(board, isDark);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.min(8192, Math.round(img.width * scale)));
    canvas.height = Math.max(1, Math.min(8192, Math.round(img.height * scale)));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (pngBlob) {
      triggerDownload(pngBlob, `${safeSlug(board.name)}.png`);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function parseImportedBoardJson(text: string): { board: Board | null; error: string | null } {
  try {
    const parsed = JSON.parse(text);
    const candidate = parsed?.board ?? parsed;
    if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.objects)) {
      return { board: null, error: 'File does not contain a valid Vellum board.' };
    }
    const now = Date.now();
    const board: Board = {
      id: `board_import_${now.toString(36)}`,
      name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : 'Imported Board',
      createdAt: now,
      updatedAt: now,
      camera:
        candidate.camera &&
        typeof candidate.camera.x === 'number' &&
        typeof candidate.camera.y === 'number' &&
        typeof candidate.camera.zoom === 'number'
          ? candidate.camera
          : { x: 0, y: 0, zoom: 1 },
      objects: candidate.objects as CanvasObject[],
    };
    return { board, error: null };
  } catch {
    return { board: null, error: 'Invalid JSON file.' };
  }
}
