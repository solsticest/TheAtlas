import type { LayerBounds, LayerRecord, WorldRecord } from '@atlas/shared';

// Exactly the legacy worldBox convention: a child layer's bounds are in the
// pixel coordinate system of its PARENT image. Coordinates point upward.
export function worldBox(
  world: WorldRecord, layers: readonly LayerRecord[], id: string | null,
  visited: Set<string> = new Set(),
): LayerBounds | null {
  if (!id) return { x1: 0, y1: 0, x2: world.width, y2: world.height };
  if (visited.has(id)) return null;
  visited.add(id);
  const layer = layers.find(item => item.id === id);
  if (!layer) return null;
  const parent = layer.parentId ? layers.find(item => item.id === layer.parentId) : undefined;
  if (layer.parentId && !parent) return null;
  const box = worldBox(world, layers, layer.parentId, visited);
  if (!box) return null;
  const pw = parent?.width ?? world.width;
  const ph = parent?.height ?? world.height;
  return {
    x1: box.x1 + layer.bounds.x1 * (box.x2 - box.x1) / pw,
    x2: box.x1 + layer.bounds.x2 * (box.x2 - box.x1) / pw,
    y1: box.y1 + layer.bounds.y1 * (box.y2 - box.y1) / ph,
    y2: box.y1 + layer.bounds.y2 * (box.y2 - box.y1) / ph,
  };
}

export function depthOf(layer: LayerRecord, layers: readonly LayerRecord[]): number {
  const seen = new Set<string>([layer.id]);
  let depth = 0, parentId = layer.parentId;
  while (parentId) {
    if (seen.has(parentId)) return depth;
    seen.add(parentId);
    const parent = layers.find(item => item.id === parentId);
    if (!parent) return depth;
    depth++;
    parentId = parent.parentId;
  }
  return depth;
}

export function opacityAtZoom(layer: LayerRecord, zoom: number): number {
  if (!layer.enabled || zoom < layer.showAtZoom) return 0;
  if (layer.fadeRange <= 0) return 1;
  return Math.min(1, Math.max(0.001, (zoom - layer.showAtZoom) / layer.fadeRange));
}

export function assetUrl(kind: 'maps' | 'media' | 'icons', filename: string): string {
  return '/api/assets/' + kind + '/' + encodeURIComponent(filename);
}
