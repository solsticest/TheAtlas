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
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  iconSvg: z.string().nullable(),
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

export const publishStatusSchema = z.enum(['draft', 'published']);
const id = z.string().trim().min(1).max(128);
const label = z.string().trim().min(1).max(200);
const shortText = z.string().max(4000);
const article = z.string().max(100000);
export const timelineInputSchema = z.object({
  worldId: id,
  name: label,
  description: shortText.default(''),
  sortOrder: z.number().int().min(-1000000).max(1000000).default(0),
  isDefault: z.boolean().default(false),
  status: publishStatusSchema.default('draft'),
}).strict();
export const eraInputSchema = z.object({
  timelineId: id,
  name: label,
  description: shortText.default(''),
  dateLabel: z.string().max(120).default(''),
  sortOrder: z.number().int().min(-1000000).max(1000000).default(0),
  image: z.string().max(255).nullable().default(null),
}).strict();
export const eventInputSchema = z.object({
  eraId: id,
  title: label,
  summary: shortText.default(''),
  article: article.default(''),
  type: z.string().max(120).default(''),
  tags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  sortOrder: z.number().int().min(-1000000).max(1000000).default(0),
  dateLabel: z.string().max(120).default(''),
  locationId: id.nullable().default(null),
  x: z.number().finite().nullable().default(null),
  y: z.number().finite().nullable().default(null),
  image: z.string().max(255).nullable().default(null),
  status: publishStatusSchema.default('draft'),
}).strict().refine(value => (value.x === null) === (value.y === null),
 { message: 'x and y must be set together' });
export const timelineRecordSchema = timelineInputSchema.extend({ id });
export const eraRecordSchema = eraInputSchema.extend({ id });
export const eventRecordSchema = eventInputSchema.safeExtend({ id });
export type TimelineRecord = z.infer<typeof timelineRecordSchema>;
export type EraRecord = z.infer<typeof eraRecordSchema>;
export type EventRecord = z.infer<typeof eventRecordSchema>;

export const loginSchema = z.object({ password: z.string().min(1).max(500) }).strict();
export const worldEditSchema = z.object({
  name: label,
  kmPerPixel: z.number().finite().positive().nullable().optional(),
}).strict();
export const locationEditSchema = z.object({
  name: label,
  x: z.number().finite(),
  y: z.number().finite(),
  type: id,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  minZoom: z.number().finite().min(-20).max(20),
  description: shortText,
  article: article,
  tags: z.array(z.string().max(100)).max(30),
}).strict();
export const layerEditSchema = z.object({
  name: label,
  parentId: id.nullable(),
  bounds: boundsSchema,
  rotation: z.number().finite().min(-3600).max(3600),
  showAtZoom: z.number().finite().min(-20).max(20),
  fadeRange: z.number().finite().min(0).max(20),
  enabled: z.boolean(),
}).strict().refine(v=>v.bounds.x2>v.bounds.x1 && v.bounds.y2>v.bounds.y1,
 {message:'Invalid bounds'});

export const worldCreateSchema = worldEditSchema.extend({
  width: z.number().int().positive().max(100000),
  height: z.number().int().positive().max(100000),
  image: z.string().max(255).nullable().default(null),
});
export const worldUpdateSchema = worldEditSchema.extend({
  image: z.string().max(255).nullable().optional(),
  width: z.number().int().positive().max(100000).optional(),
  height: z.number().int().positive().max(100000).optional(),
});
export const markerTypeInputSchema = z.object({
  name: label,
  symbol: z.string().trim().max(12).default(''),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#d6b77a'),
  iconSvg: z.string().trim().max(255).regex(/^[a-zA-Z0-9][\w.-]*\.svg$/i).nullable().default(null),
}).strict().refine(value => Boolean(value.symbol) !== Boolean(value.iconSvg), {
  message: 'Выберите ровно один значок: эмодзи или SVG',
});
export const layerUpdateSchema = layerEditSchema.safeExtend({
  image: z.string().max(255).nullable().optional(),
  width: z.number().int().positive().max(100000).optional(),
  height: z.number().int().positive().max(100000).optional(),
});
export const layerCreateSchema = layerEditSchema.safeExtend({
  worldId: id,
  image: z.string().max(255).nullable().default(null),
  width: z.number().int().positive().max(100000),
  height: z.number().int().positive().max(100000),
});
export const locationCreateSchema = locationEditSchema.extend({ worldId: id });


export const chronicleEventKindSchema = z.enum(['point','period']);
export const chronicleDatePrecisionSchema = z.enum(['exact','month','year','approximate','range','unknown']);
export const chronicleVisibilitySchema = z.enum(['draft','gm','public']);
export const chronicleSignificanceSchema = z.enum(['normal','important','key']);

export const chronicleTagSchema = z.object({
  id,
  name: label,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  icon: z.string().max(32).nullable(),
  description: shortText,
});
export type ChronicleTagRecord = z.infer<typeof chronicleTagSchema>;

export const chronicleWorldRefSchema = z.object({id,name:label});
export type ChronicleWorldRef = z.infer<typeof chronicleWorldRefSchema>;

export const chronicleEventInputSchema = z.object({
  title: label,
  summary: shortText.default(''),
  article: article.default(''),
  kind: chronicleEventKindSchema.default('point'),
  startDay: z.number().int().nullable().default(null),
  endDay: z.number().int().nullable().default(null),
  startPrecision: chronicleDatePrecisionSchema.default('exact'),
  earliestDay: z.number().int().nullable().default(null),
  latestDay: z.number().int().nullable().default(null),
  endPrecision: chronicleDatePrecisionSchema.nullable().default(null),
  worldIds: z.array(id).max(30).default([]),
  tagNames: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  significance: chronicleSignificanceSchema.default('normal'),
  visibility: chronicleVisibilitySchema.default('gm'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#d6b77a'),
  icon: z.string().trim().max(12).nullable().default(null),
}).strict().superRefine((value,ctx)=>{
  if(value.startPrecision==='unknown'){
    if(value.startDay!==null)ctx.addIssue({code:'custom',path:['startDay'],message:'Unknown date must not have startDay'});
  }else if(value.startDay===null){
    ctx.addIssue({code:'custom',path:['startDay'],message:'Dated event requires startDay'});
  }
  if(value.kind==='point'&&value.endDay!==null){
    ctx.addIssue({code:'custom',path:['endDay'],message:'Point event must not have endDay'});
  }
  if(value.kind==='period'&&value.startPrecision!=='unknown'&&value.endDay===null){
    ctx.addIssue({code:'custom',path:['endDay'],message:'Period event requires endDay'});
  }
  if(value.startDay!==null&&value.endDay!==null&&value.endDay<value.startDay){
    ctx.addIssue({code:'custom',path:['endDay'],message:'Event cannot end before it begins'});
  }
  if(value.earliestDay!==null&&value.latestDay!==null&&value.latestDay<value.earliestDay){
    ctx.addIssue({code:'custom',path:['latestDay'],message:'Uncertainty range is reversed'});
  }
});

export const chronicleEventSchema = z.object({
  id,
  title: label,
  summary: shortText,
  article,
  kind: chronicleEventKindSchema,
  startDay: z.number().int().nullable(),
  endDay: z.number().int().nullable(),
  startPrecision: chronicleDatePrecisionSchema,
  earliestDay: z.number().int().nullable(),
  latestDay: z.number().int().nullable(),
  endPrecision: chronicleDatePrecisionSchema.nullable(),
  significance: chronicleSignificanceSchema,
  visibility: chronicleVisibilitySchema,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  icon: z.string().max(12).nullable(),
  worlds: z.array(chronicleWorldRefSchema),
  tags: z.array(chronicleTagSchema),
});
export type ChronicleEventInput = z.infer<typeof chronicleEventInputSchema>;
export type ChronicleEventRecord = z.infer<typeof chronicleEventSchema>;
