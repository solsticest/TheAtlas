import { z } from 'zod';

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string().min(1),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const markerTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
}).passthrough();
export type MarkerTypeRecord = z.infer<typeof markerTypeSchema>;

export const worldSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  width: z.number(),
  height: z.number(),
  kmPerPixel: z.number().nullable(),
});
export type WorldRecord = z.infer<typeof worldSchema>;

export const boundsSchema = z.object({
  x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(),
});
export type LayerBounds = z.infer<typeof boundsSchema>;

export const layerSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  image: z.string().nullable(),
  width: z.number(),
  height: z.number(),
  bounds: boundsSchema,
  rotation: z.number(),
  showAtZoom: z.number(),
  fadeRange: z.number(),
  enabled: z.boolean(),
}).passthrough();
export type LayerRecord = z.infer<typeof layerSchema>;

export const locationSchema = z.object({
  id: z.string(), worldId: z.string(), name: z.string(),
  x: z.number(), y: z.number(), type: z.string(),
  color: z.string(), minZoom: z.number(),
  description: z.string(),
  article: z.string().nullable(),
  tags: z.array(z.string()),
}).passthrough();
export type LocationRecord = z.infer<typeof locationSchema>;

export const searchItemSchema = z.object({
  kind: z.enum(['world', 'layer', 'location']),
  id: z.string(),
  worldId: z.string(),
  title: z.string(),
  subtitle: z.string(),
});
export type SearchItem = z.infer<typeof searchItemSchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().max(150).default(''),
});
