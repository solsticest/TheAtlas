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


// MYTHOS — divine entities and pantheons; plain-text descriptions are rendered safely.
export const mythosVisibilitySchema=z.enum(['draft','gm','public']);
export const mythosPantheonInputSchema=z.object({
  name:label,
  description:shortText.default(''),
  worldId:id.nullable().default(null),
  visibility:mythosVisibilitySchema.default('gm'),
}).strict();
export const mythosPantheonSchema=mythosPantheonInputSchema.extend({id});
export type MythosPantheonInput=z.infer<typeof mythosPantheonInputSchema>;
export type MythosPantheonRecord=z.infer<typeof mythosPantheonSchema>;

export const MYTHOS_GRAPH_COORD_MIN=-1000;
export const MYTHOS_GRAPH_COORD_MAX=1000;
const mythosGraphCoordinate=z.number().finite()
  .min(MYTHOS_GRAPH_COORD_MIN).max(MYTHOS_GRAPH_COORD_MAX);

export const mythosDeityInputSchema=z.object({
  name:label,
  epithet:z.string().max(150).default(''),
  summary:shortText.default(''),
  description:article.default(''),
  symbol:z.string().trim().max(12).default(''),
  color:z.string().regex(/^#[0-9a-f]{6}$/i).default('#d6b77a'),
  rank:z.string().trim().min(1).max(80).default('Божество'),
  power:z.string().trim().max(120).default(''),
  influence:z.number().int().min(0).max(100).default(50),
  domains:z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  primaryDomains:z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  graphX:mythosGraphCoordinate.default(50),
  graphY:mythosGraphCoordinate.default(50),
  visibility:mythosVisibilitySchema.default('gm'),
  pantheonId:id.nullable().default(null),
  worldIds:z.array(id).max(30).default([]),
}).strict();
export const mythosDeitySchema=mythosDeityInputSchema.omit({worldIds:true}).extend({
  id,
  worlds:z.array(chronicleWorldRefSchema),
  pantheon:z.object({id,name:label}).nullable(),
});
export type MythosDeityInput=z.infer<typeof mythosDeityInputSchema>;
export type MythosDeityRecord=z.infer<typeof mythosDeitySchema>;

export const mythosDeityPositionInputSchema=z.object({
  graphX:mythosGraphCoordinate,
  graphY:mythosGraphCoordinate,
}).strict();
export const mythosDeityPositionSchema=mythosDeityPositionInputSchema.extend({id});
export type MythosDeityPositionInput=z.infer<typeof mythosDeityPositionInputSchema>;
export type MythosDeityPositionRecord=z.infer<typeof mythosDeityPositionSchema>;



// MYTHOS v2 — typed relations and secondary knowledge layers.
export const mythosRelationCategorySchema=z.enum([
  'origin','alliance','conflict','service','identity','other'
]);
export const mythosRelationInputSchema=z.object({
  sourceId:id,targetId:id,
  type:z.string().trim().min(1).max(80),
  category:mythosRelationCategorySchema.default('other'),
  label:z.string().max(150).default(''),
  description:shortText.default(''),
  startDay:z.number().int().nullable().default(null),
  endDay:z.number().int().nullable().default(null),
  visibility:mythosVisibilitySchema.default('gm'),
}).strict().refine(v=>v.sourceId!==v.targetId,{message:'Relation endpoints must differ'})
.refine(v=>v.startDay===null||v.endDay===null||v.endDay>=v.startDay,
  {message:'Relation cannot end before it begins'});
export const mythosRelationSchema=mythosRelationInputSchema.extend({id});
export type MythosRelationInput=z.infer<typeof mythosRelationInputSchema>;
export type MythosRelationRecord=z.infer<typeof mythosRelationSchema>;

export const mythosMythInputSchema=z.object({
  title:label,summary:shortText.default(''),description:article.default(''),
  visibility:mythosVisibilitySchema.default('gm'),
  participants:z.array(z.object({deityId:id,role:z.string().max(120).default('')})).max(50).default([]),
}).strict();
export const mythosMythSchema=mythosMythInputSchema.extend({
  id,
  participants:z.array(z.object({deityId:id,deityName:label,role:z.string()})),
});
export type MythosMythInput=z.infer<typeof mythosMythInputSchema>;
export type MythosMythRecord=z.infer<typeof mythosMythSchema>;

export const mythosBeliefIdentitySchema=z.enum(['true','partial','false','unknown']);
export const mythosBeliefInputSchema=z.object({
  deityId:id.nullable().default(null),
  worldId:id.nullable().default(null),
  culture:label,
  publicName:label,
  doctrine:article.default(''),
  identity:mythosBeliefIdentitySchema.default('unknown'),
  visibility:mythosVisibilitySchema.default('gm'),
}).strict();
export const mythosBeliefSchema=mythosBeliefInputSchema.extend({
  id,
  deity:z.object({id,name:label}).nullable(),
  world:z.object({id,name:label}).nullable(),
});
export type MythosBeliefInput=z.infer<typeof mythosBeliefInputSchema>;
export type MythosBeliefRecord=z.infer<typeof mythosBeliefSchema>;

export const mythosSacredSiteInputSchema=z.object({
  deityId:id,locationId:id,name:label,description:shortText.default(''),
  importance:z.string().trim().min(1).max(80).default('Священное место'),
  visibility:mythosVisibilitySchema.default('gm'),
}).strict();
export const mythosSacredSiteSchema=mythosSacredSiteInputSchema.extend({
  id,
  deity:z.object({id,name:label}).nullable(),
  location:z.object({id,name:label,worldId:id,worldName:label}).nullable(),
});
export type MythosSacredSiteInput=z.infer<typeof mythosSacredSiteInputSchema>;
export type MythosSacredSiteRecord=z.infer<typeof mythosSacredSiteSchema>;

export const mythosChronicleLinkInputSchema=z.object({
  deityId:id,eventId:id,role:z.string().max(120).default(''),
}).strict();
export const mythosChronicleLinkSchema=mythosChronicleLinkInputSchema.extend({
  deity:z.object({id,name:label}),
  event:z.object({id,title:label,startDay:z.number().int().nullable()}),
});
export type MythosChronicleLinkInput=z.infer<typeof mythosChronicleLinkInputSchema>;
export type MythosChronicleLinkRecord=z.infer<typeof mythosChronicleLinkSchema>;

export const mythosCosmicNodeInputSchema=z.object({
  name:label,kind:z.string().trim().min(1).max(80).default('План'),
  description:shortText.default(''),symbol:z.string().trim().max(12).default(''),
  color:z.string().regex(/^#[0-9a-f]{6}$/i).default('#7f8da8'),
  x:mythosGraphCoordinate.default(50),
  y:mythosGraphCoordinate.default(50),
  size:z.number().finite().min(.5).max(3).default(1),
  worldId:id.nullable().default(null),
  visibility:mythosVisibilitySchema.default('gm'),
}).strict();
export const mythosCosmicNodeSchema=mythosCosmicNodeInputSchema.extend({id});
export type MythosCosmicNodeInput=z.infer<typeof mythosCosmicNodeInputSchema>;
export type MythosCosmicNodeRecord=z.infer<typeof mythosCosmicNodeSchema>;

export const mythosCosmicLinkInputSchema=z.object({
  sourceId:id,targetId:id,type:z.string().trim().min(1).max(80).default('Путь'),
  label:z.string().max(150).default(''),description:shortText.default(''),
  visibility:mythosVisibilitySchema.default('gm'),
}).strict().refine(v=>v.sourceId!==v.targetId,{message:'Cosmic link endpoints must differ'});
export const mythosCosmicLinkSchema=mythosCosmicLinkInputSchema.extend({id});
export type MythosCosmicLinkInput=z.infer<typeof mythosCosmicLinkInputSchema>;
export type MythosCosmicLinkRecord=z.infer<typeof mythosCosmicLinkSchema>;

export const mythosLocationRefSchema=z.object({
  id,name:label,worldId:id,worldName:label,
});
export type MythosLocationRef=z.infer<typeof mythosLocationRefSchema>;
