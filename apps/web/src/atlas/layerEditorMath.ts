import type { ImageBounds, Point } from './atlasMath';

export type LayerHandle = 'center' | 'nw' | 'ne' | 'sw' | 'se';

export function handlePoint(bounds: ImageBounds, handle: LayerHandle): Point {
  const { x1, x2, y1, y2 } = bounds;
  if (handle === 'center') return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  return {
    x: handle.endsWith('w') ? x1 : x2,
    y: handle.startsWith('s') ? y1 : y2,
  };
}

export function moveHandle(
  original: ImageBounds,
  handle: LayerHandle,
  at: Point,
): ImageBounds {
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) throw Error('Некорректная координата.');
  const { x1, x2, y1, y2 } = original;
  if (!(x2 > x1 && y2 > y1)) throw Error('Некорректные границы карты.');
  if (handle === 'center') {
    const dx = at.x - (x1 + x2) / 2, dy = at.y - (y1 + y2) / 2;
    return { x1: x1 + dx, x2: x2 + dx, y1: y1 + dy, y2: y2 + dy };
  }
  const minSize = 1;
  return {
    x1: handle.endsWith('w') ? Math.min(at.x, x2 - minSize) : x1,
    x2: handle.endsWith('e') ? Math.max(at.x, x1 + minSize) : x2,
    y1: handle.startsWith('s') ? Math.min(at.y, y2 - minSize) : y1,
    y2: handle.startsWith('n') ? Math.max(at.y, y1 + minSize) : y2,
  };
}
