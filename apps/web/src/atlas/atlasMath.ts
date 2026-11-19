// Exact port of js/atlas-math.js alignTwoPoints: image pixel coordinates point upward.
export type Point = { x: number; y: number };
export type ImageBounds = { x1: number; y1: number; x2: number; y2: number };

export function routeLength(points: readonly Point[]): number {
  return points.reduce((sum, point, index) => {
    if (index === 0) return 0;
    const previous = points[index - 1];
    if (!previous) return sum;
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

export function alignTwoPoints(
  source: readonly [Point, Point],
  target: readonly [Point, Point],
  width: number,
  height: number,
): { bounds: ImageBounds; rotation: number; scale: number } {
  const [a, b] = source, [c, d] = target;
  if (![a, b, c, d].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) {
    throw new Error('Нужны две пары ориентиров.');
  }
  const sx = b.x - a.x, sy = b.y - a.y;
  const tx = d.x - c.x, ty = d.y - c.y;
  const sl = Math.hypot(sx, sy), tl = Math.hypot(tx, ty);
  if (sl < 1e-6 || tl < 1e-6) {
    throw new Error('Ориентиры должны быть разными точками.');
  }
  if (!(width > 0 && height > 0)) throw new Error('Неизвестны размеры изображения.');

  const scale = tl / sl;
  const angle = Math.atan2(ty, tx) - Math.atan2(sy, sx);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = width / 2 - a.x, dy = height / 2 - a.y;
  const cx = c.x + scale * (dx * cos - dy * sin);
  const cy = c.y + scale * (dx * sin + dy * cos);
  return {
    bounds: {
      x1: cx - width * scale / 2,
      y1: cy - height * scale / 2,
      x2: cx + width * scale / 2,
      y2: cy + height * scale / 2,
    },
    rotation: ((-angle * 180 / Math.PI) % 360 + 360) % 360,
    scale,
  };
}
