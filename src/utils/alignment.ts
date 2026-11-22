import type { CanvasObject } from '../types/canvas';

export interface AlignRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapGuideLine {
  orientation: 'v' | 'h';
  pos: number;
  start: number;
  end: number;
}

export interface SpacingIndicator {
  orientation: 'h' | 'v';
  from: number;
  to: number;
  crossPos: number;
  gap: number;
}

export interface AlignmentResult {
  dx: number;
  dy: number;
  lines: SnapGuideLine[];
  spacings: SpacingIndicator[];
}

function getSimpleRect(obj: CanvasObject): AlignRect {
  return {
    x: obj.x,
    y: obj.y,
    width: obj.width,
    height: obj.height,
  };
}

function overlapRange(a1: number, a2: number, b1: number, b2: number): [number, number] | null {
  const start = Math.max(a1, b1);
  const end = Math.min(a2, b2);
  return end > start ? [start, end] : null;
}

/**
 * Computes Figma/Miro-style alignment snap lines (left/center/right, top/middle/bottom)
 * and equal-spacing indicators against sibling objects on the board.
 */
export function computeAlignmentGuides(
  dragRect: AlignRect,
  allObjects: CanvasObject[],
  draggedIds: Set<string>,
  threshold = 6
): AlignmentResult {
  const draggingFrame = allObjects.some(
    (o) => draggedIds.has(o.id) && o.type === 'frame'
  );

  const siblings: AlignRect[] = [];
  for (const obj of allObjects) {
    if (draggedIds.has(obj.id)) continue;
    if (obj.type === 'connector') continue;
    if (draggingFrame) {
      if (obj.type !== 'frame') continue;
    } else if (obj.type === 'frame') {
      continue;
    }
    siblings.push(getSimpleRect(obj));
  }

  if (siblings.length === 0) {
    return { dx: 0, dy: 0, lines: [], spacings: [] };
  }

  const dLeft = dragRect.x;
  const dCx = dragRect.x + dragRect.width / 2;
  const dRight = dragRect.x + dragRect.width;
  const dTop = dragRect.y;
  const dCy = dragRect.y + dragRect.height / 2;
  const dBottom = dragRect.y + dragRect.height;

  // 1. Find closest vertical (X) alignment snap
  let bestDx = 0;
  let minAbsDx = threshold + 0.001;
  const xAnchors = [dLeft, dCx, dRight];

  for (const s of siblings) {
    const sAnchors = [s.x, s.x + s.width / 2, s.x + s.width];
    for (const da of xAnchors) {
      for (const sa of sAnchors) {
        const diff = sa - da;
        const abs = Math.abs(diff);
        if (abs < minAbsDx) {
          minAbsDx = abs;
          bestDx = diff;
        }
      }
    }
  }

  // 2. Find closest horizontal (Y) alignment snap
  let bestDy = 0;
  let minAbsDy = threshold + 0.001;
  const yAnchors = [dTop, dCy, dBottom];

  for (const s of siblings) {
    const sAnchors = [s.y, s.y + s.height / 2, s.y + s.height];
    for (const da of yAnchors) {
      for (const sa of sAnchors) {
        const diff = sa - da;
        const abs = Math.abs(diff);
        if (abs < minAbsDy) {
          minAbsDy = abs;
          bestDy = diff;
        }
      }
    }
  }

  let snappedX = dragRect.x + bestDx;
  let snappedY = dragRect.y + bestDy;
  const spacings: SpacingIndicator[] = [];

  // 3. Equal-spacing indicators along X (for siblings overlapping vertically)
  const rowSiblings = siblings
    .filter((s) => overlapRange(snappedY, snappedY + dragRect.height, s.y, s.y + s.height) !== null)
    .sort((a, b) => a.x - b.x);

  if (rowSiblings.length >= 2) {
    // Case A: Dragged object centered between nearest left & nearest right neighbor
    let leftNeighbor: AlignRect | null = null;
    let rightNeighbor: AlignRect | null = null;
    for (const s of rowSiblings) {
      if (s.x + s.width <= snappedX + threshold) {
        if (!leftNeighbor || s.x + s.width > leftNeighbor.x + leftNeighbor.width) {
          leftNeighbor = s;
        }
      } else if (s.x >= snappedX + dragRect.width - threshold) {
        if (!rightNeighbor || s.x < rightNeighbor.x) {
          rightNeighbor = s;
        }
      }
    }

    let matchedHorizontalSpacing = false;
    if (leftNeighbor && rightNeighbor) {
      const totalSpan = rightNeighbor.x - (leftNeighbor.x + leftNeighbor.width);
      const equalGap = (totalSpan - dragRect.width) / 2;
      if (equalGap >= 4) {
        const targetX = leftNeighbor.x + leftNeighbor.width + equalGap;
        const deltaFromRaw = targetX - dragRect.x;
        const deltaFromSnapped = targetX - snappedX;
        if (Math.abs(deltaFromRaw) <= threshold && (minAbsDx > threshold || Math.abs(deltaFromSnapped) < 0.75)) {
          bestDx = deltaFromRaw;
          snappedX = targetX;
          minAbsDx = Math.abs(deltaFromRaw);
        }
        const leftGap = snappedX - (leftNeighbor.x + leftNeighbor.width);
        const rightGap = rightNeighbor.x - (snappedX + dragRect.width);
        if (Math.abs(leftGap - rightGap) <= 1.25 && leftGap >= 4) {
          const ov1 = overlapRange(snappedY, snappedY + dragRect.height, leftNeighbor.y, leftNeighbor.y + leftNeighbor.height);
          const ov2 = overlapRange(snappedY, snappedY + dragRect.height, rightNeighbor.y, rightNeighbor.y + rightNeighbor.height);
          const cross1 = ov1 ? (ov1[0] + ov1[1]) / 2 : snappedY + dragRect.height / 2;
          const cross2 = ov2 ? (ov2[0] + ov2[1]) / 2 : snappedY + dragRect.height / 2;
          const roundedGap = Math.round(leftGap);
          spacings.push(
            {
              orientation: 'h',
              from: leftNeighbor.x + leftNeighbor.width,
              to: snappedX,
              crossPos: cross1,
              gap: roundedGap,
            },
            {
              orientation: 'h',
              from: snappedX + dragRect.width,
              to: rightNeighbor.x,
              crossPos: cross2,
              gap: roundedGap,
            }
          );
          matchedHorizontalSpacing = true;
        }
      }
    }

    // Case B: Continuing an existing equal-gap sequence to the right or left
    if (!matchedHorizontalSpacing) {
      for (let i = 0; i < rowSiblings.length - 1; i++) {
        const a = rowSiblings[i];
        const b = rowSiblings[i + 1];
        const refGap = b.x - (a.x + a.width);
        if (refGap < 4) continue;

        // Continuing to the right of B
        const targetRightX = b.x + b.width + refGap;
        if (Math.abs(targetRightX - dragRect.x) <= threshold) {
          if (minAbsDx > threshold || Math.abs(targetRightX - snappedX) < 0.75) {
            bestDx = targetRightX - dragRect.x;
            snappedX = targetRightX;
            minAbsDx = Math.abs(bestDx);
          }
          if (Math.abs(snappedX - (b.x + b.width) - refGap) <= 1.25) {
            const crossY = snappedY + dragRect.height / 2;
            const roundedGap = Math.round(refGap);
            spacings.push(
              { orientation: 'h', from: a.x + a.width, to: b.x, crossPos: crossY, gap: roundedGap },
              { orientation: 'h', from: b.x + b.width, to: snappedX, crossPos: crossY, gap: roundedGap }
            );
            break;
          }
        }

        // Continuing to the left of A
        const targetLeftX = a.x - refGap - dragRect.width;
        if (Math.abs(targetLeftX - dragRect.x) <= threshold) {
          if (minAbsDx > threshold || Math.abs(targetLeftX - snappedX) < 0.75) {
            bestDx = targetLeftX - dragRect.x;
            snappedX = targetLeftX;
            minAbsDx = Math.abs(bestDx);
          }
          if (Math.abs(a.x - (snappedX + dragRect.width) - refGap) <= 1.25) {
            const crossY = snappedY + dragRect.height / 2;
            const roundedGap = Math.round(refGap);
            spacings.push(
              { orientation: 'h', from: snappedX + dragRect.width, to: a.x, crossPos: crossY, gap: roundedGap },
              { orientation: 'h', from: a.x + a.width, to: b.x, crossPos: crossY, gap: roundedGap }
            );
            break;
          }
        }
      }
    }
  }

  // 4. Equal-spacing indicators along Y (for siblings overlapping horizontally)
  const colSiblings = siblings
    .filter((s) => overlapRange(snappedX, snappedX + dragRect.width, s.x, s.x + s.width) !== null)
    .sort((a, b) => a.y - b.y);

  if (colSiblings.length >= 2) {
    let topNeighbor: AlignRect | null = null;
    let bottomNeighbor: AlignRect | null = null;
    for (const s of colSiblings) {
      if (s.y + s.height <= snappedY + threshold) {
        if (!topNeighbor || s.y + s.height > topNeighbor.y + topNeighbor.height) {
          topNeighbor = s;
        }
      } else if (s.y >= snappedY + dragRect.height - threshold) {
        if (!bottomNeighbor || s.y < bottomNeighbor.y) {
          bottomNeighbor = s;
        }
      }
    }

    let matchedVerticalSpacing = false;
    if (topNeighbor && bottomNeighbor) {
      const totalSpan = bottomNeighbor.y - (topNeighbor.y + topNeighbor.height);
      const equalGap = (totalSpan - dragRect.height) / 2;
      if (equalGap >= 4) {
        const targetY = topNeighbor.y + topNeighbor.height + equalGap;
        const deltaFromRaw = targetY - dragRect.y;
        const deltaFromSnapped = targetY - snappedY;
        if (Math.abs(deltaFromRaw) <= threshold && (minAbsDy > threshold || Math.abs(deltaFromSnapped) < 0.75)) {
          bestDy = deltaFromRaw;
          snappedY = targetY;
          minAbsDy = Math.abs(deltaFromRaw);
        }
        const topGap = snappedY - (topNeighbor.y + topNeighbor.height);
        const bottomGap = bottomNeighbor.y - (snappedY + dragRect.height);
        if (Math.abs(topGap - bottomGap) <= 1.25 && topGap >= 4) {
          const ov1 = overlapRange(snappedX, snappedX + dragRect.width, topNeighbor.x, topNeighbor.x + topNeighbor.width);
          const ov2 = overlapRange(snappedX, snappedX + dragRect.width, bottomNeighbor.x, bottomNeighbor.x + bottomNeighbor.width);
          const cross1 = ov1 ? (ov1[0] + ov1[1]) / 2 : snappedX + dragRect.width / 2;
          const cross2 = ov2 ? (ov2[0] + ov2[1]) / 2 : snappedX + dragRect.width / 2;
          const roundedGap = Math.round(topGap);
          spacings.push(
            {
              orientation: 'v',
              from: topNeighbor.y + topNeighbor.height,
              to: snappedY,
              crossPos: cross1,
              gap: roundedGap,
            },
            {
              orientation: 'v',
              from: snappedY + dragRect.height,
              to: bottomNeighbor.y,
              crossPos: cross2,
              gap: roundedGap,
            }
          );
          matchedVerticalSpacing = true;
        }
      }
    }

    if (!matchedVerticalSpacing) {
      for (let i = 0; i < colSiblings.length - 1; i++) {
        const a = colSiblings[i];
        const b = colSiblings[i + 1];
        const refGap = b.y - (a.y + a.height);
        if (refGap < 4) continue;

        const targetBottomY = b.y + b.height + refGap;
        if (Math.abs(targetBottomY - dragRect.y) <= threshold) {
          if (minAbsDy > threshold || Math.abs(targetBottomY - snappedY) < 0.75) {
            bestDy = targetBottomY - dragRect.y;
            snappedY = targetBottomY;
            minAbsDy = Math.abs(bestDy);
          }
          if (Math.abs(snappedY - (b.y + b.height) - refGap) <= 1.25) {
            const crossX = snappedX + dragRect.width / 2;
            const roundedGap = Math.round(refGap);
            spacings.push(
              { orientation: 'v', from: a.y + a.height, to: b.y, crossPos: crossX, gap: roundedGap },
              { orientation: 'v', from: b.y + b.height, to: snappedY, crossPos: crossX, gap: roundedGap }
            );
            break;
          }
        }

        const targetTopY = a.y - refGap - dragRect.height;
        if (Math.abs(targetTopY - dragRect.y) <= threshold) {
          if (minAbsDy > threshold || Math.abs(targetTopY - snappedY) < 0.75) {
            bestDy = targetTopY - dragRect.y;
            snappedY = targetTopY;
            minAbsDy = Math.abs(bestDy);
          }
          if (Math.abs(a.y - (snappedY + dragRect.height) - refGap) <= 1.25) {
            const crossX = snappedX + dragRect.width / 2;
            const roundedGap = Math.round(refGap);
            spacings.push(
              { orientation: 'v', from: snappedY + dragRect.height, to: a.y, crossPos: crossX, gap: roundedGap },
              { orientation: 'v', from: a.y + a.height, to: b.y, crossPos: crossX, gap: roundedGap }
            );
            break;
          }
        }
      }
    }
  }

  // 5. Collect merged guide lines at final snapped position
  const lines: SnapGuideLine[] = [];
  const finalXAnchors = [snappedX, snappedX + dragRect.width / 2, snappedX + dragRect.width];
  const finalYAnchors = [snappedY, snappedY + dragRect.height / 2, snappedY + dragRect.height];

  const vLineMap = new Map<number, { start: number; end: number }>();
  const hLineMap = new Map<number, { start: number; end: number }>();

  for (const s of siblings) {
    const sXAnchors = [s.x, s.x + s.width / 2, s.x + s.width];
    for (const fx of finalXAnchors) {
      for (const sx of sXAnchors) {
        if (Math.abs(fx - sx) <= 0.75) {
          const key = Math.round(sx * 2) / 2;
          const prev = vLineMap.get(key);
          const minY = Math.min(snappedY, s.y);
          const maxY = Math.max(snappedY + dragRect.height, s.y + s.height);
          vLineMap.set(key, {
            start: prev ? Math.min(prev.start, minY) : minY,
            end: prev ? Math.max(prev.end, maxY) : maxY,
          });
        }
      }
    }

    const sYAnchors = [s.y, s.y + s.height / 2, s.y + s.height];
    for (const fy of finalYAnchors) {
      for (const sy of sYAnchors) {
        if (Math.abs(fy - sy) <= 0.75) {
          const key = Math.round(sy * 2) / 2;
          const prev = hLineMap.get(key);
          const minX = Math.min(snappedX, s.x);
          const maxX = Math.max(snappedX + dragRect.width, s.x + s.width);
          hLineMap.set(key, {
            start: prev ? Math.min(prev.start, minX) : minX,
            end: prev ? Math.max(prev.end, maxX) : maxX,
          });
        }
      }
    }
  }

  for (const [pos, span] of vLineMap) {
    lines.push({ orientation: 'v', pos, start: span.start - 10, end: span.end + 10 });
  }
  for (const [pos, span] of hLineMap) {
    lines.push({ orientation: 'h', pos, start: span.start - 10, end: span.end + 10 });
  }

  return { dx: bestDx, dy: bestDy, lines, spacings };
}
