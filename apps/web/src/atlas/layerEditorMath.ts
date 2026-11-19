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


export function moveBoundsBy(original: ImageBounds, dx: number, dy: number): ImageBounds {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw Error('Некорректное смещение.');
  return {
    x1: original.x1 + dx, x2: original.x2 + dx,
    y1: original.y1 + dy, y2: original.y2 + dy,
  };
}

export function resizeHandleWithAspect(
  original: ImageBounds,
  handle: Exclude<LayerHandle, 'center'>,
  at: Point,
  aspectRatio: number,
): ImageBounds {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw Error('Некорректное соотношение сторон.');
  }
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) {
    throw Error('Некорректная координата.');
  }
  const { x1, x2, y1, y2 } = original;
  if (!(x2 > x1 && y2 > y1)) throw Error('Некорректные границы карты.');

  const fixedX = handle.endsWith('w') ? x2 : x1;
  const fixedY = handle.startsWith('s') ? y2 : y1;
  const desiredWidth = Math.abs(at.x - fixedX);
  const desiredHeight = Math.abs(at.y - fixedY);

  // Use the dominant pointer axis, then derive the other dimension.
  // This mirrors conventional Shift-resize behavior and avoids ratio drift.
  const minHeight = Math.max(1, 1 / aspectRatio);
  const height = Math.max(desiredHeight, desiredWidth / aspectRatio, minHeight);
  const width = height * aspectRatio;

  const west = handle.endsWith('w');
  const south = handle.startsWith('s');
  return {
    x1: west ? fixedX - width : fixedX,
    x2: west ? fixedX : fixedX + width,
    y1: south ? fixedY - height : fixedY,
    y2: south ? fixedY : fixedY + height,
  };
}
