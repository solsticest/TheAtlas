import { randomUUID } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';
import { timelineInputSchema, eraInputSchema, eventInputSchema } from '@atlas/shared';
import { requireAdmin } from './auth.js';
import { cleanArticle } from './html.js';
import { createBackup } from './backup.js';
import { recordHistory } from './history.js';

const error=(res:Response,status:number,code:string,message:string)=>{
  res.status(status).json({error:{code,message}});
};
type Handler=(req:Request,res:Response,next:NextFunction)=>Promise<void>;
function route(fn:Handler){
  return (req:Request,res:Response,next:NextFunction)=>{fn(req,res,next).catch(next);};
}
const timelineDTO=(t:{id:string;worldId:string;name:string;description:string;sortOrder:number;isDefault:boolean;status:string})=>t;
const eraDTO=(e:{id:string;timelineId:string;name:string;description:string;dateLabel:string;sortOrder:number;image:string|null})=>e;
const eventDTO=(e:{id:string;eraId:string;title:string;summary:string;article:string;type:string;tags:string;sortOrder:number;dateLabel:string;locationId:string|null;x:number|null;y:number|null;image:string|null;status:string})=>({...e,tags:JSON.parse(e.tags) as string[]});
const order=[{sortOrder:'asc' as const},{id:'asc' as const}];
const routeId=(value:string|string[]|undefined):string=>typeof value==='string'?value:'';

export function registerTimelines(app:Express,db:PrismaClient){
  const admin=requireAdmin(db);
  const markModified=()=>db.atlasDocument.updateMany({data:{isModified:true}});
  // Public endpoints never reveal drafts, including draft timelines and their eras.
  app.get('/api/worlds/:worldId/timelines',route(async(req,res)=>{
    const world=await db.world.findUnique({where:{id:routeId(req.params.worldId)}});
    if(!world){error(res,404,'NOT_FOUND','Мир не найден');return;}
    const rows=await db.timeline.findMany({where:{worldId:world.id,status:'published'},orderBy:order});
    res.json(rows.map(timelineDTO));
  }));
  app.get('/api/timelines/:id/eras',route(async(req,res)=>{
    const timeline=await db.timeline.findUnique({where:{id:routeId(req.params.id)}});
    if(!timeline||timeline.status!=='published'){error(res,404,'NOT_FOUND','Таймлайн не найден');return;}
    res.json((await db.era.findMany({where:{timelineId:timeline.id},orderBy:order})).map(eraDTO));
  }));
  app.get('/api/eras/:id/events',route(async(req,res)=>{
    const era=await db.era.findUnique({where:{id:routeId(req.params.id)},include:{timeline:true}});
    if(!era||era.timeline.status!=='published'){error(res,404,'NOT_FOUND','Эпоха не найдена');return;}
    const rows=await db.event.findMany({where:{eraId:era.id,status:'published'},orderBy:order});
    res.json(rows.map(eventDTO));
  }));
  app.get('/api/events/:id',route(async(req,res)=>{
    const row=await db.event.findUnique({where:{id:routeId(req.params.id)},include:{era:{include:{timeline:true}}}});
    if(!row||row.status!=='published'||row.era.timeline.status!=='published'){
      error(res,404,'NOT_FOUND','Событие не найдено');return;
    }
    res.json(eventDTO(row));
  }));

  app.get('/api/admin/timelines',admin,route(async(req,res)=>{
    const worldId=req.query.worldId;
    if(typeof worldId!=='string'||!worldId){error(res,400,'BAD_INPUT','Нужен worldId');return;}
    res.json((await db.timeline.findMany({where:{worldId},orderBy:order})).map(timelineDTO));
  }));
  app.get('/api/admin/eras',admin,route(async(req,res)=>{
    const timelineId=req.query.timelineId;
    if(typeof timelineId!=='string'||!timelineId){error(res,400,'BAD_INPUT','Нужен timelineId');return;}
    res.json((await db.era.findMany({where:{timelineId},orderBy:order})).map(eraDTO));
  }));
  app.get('/api/admin/events',admin,route(async(req,res)=>{
    const eraId=req.query.eraId;
    if(typeof eraId!=='string'||!eraId){error(res,400,'BAD_INPUT','Нужен eraId');return;}
    res.json((await db.event.findMany({where:{eraId},orderBy:order})).map(eventDTO));
  }));

  app.post('/api/admin/timelines',admin,route(async(req,res)=>{
    const parsed=timelineInputSchema.safeParse(req.body);
    if(!parsed.success){error(res,400,'BAD_INPUT','Некорректные поля таймлайна');return;}
    const data=parsed.data;
    if(!await db.world.findUnique({where:{id:data.worldId}})){error(res,404,'WORLD_NOT_FOUND','Мир не найден');return;}
    if(data.isDefault)await createBackup(db);
    const t=await db.$transaction(async(tx)=>{
      if(data.isDefault)await tx.timeline.updateMany({where:{worldId:data.worldId},data:{isDefault:false}});
      return tx.timeline.create({data:{id:randomUUID(),...data}});
    });
    await markModified();
    res.status(201).json(timelineDTO(t));
  }));
  app.patch('/api/admin/timelines/:id',admin,route(async(req,res)=>{
    const parsed=timelineInputSchema.safeParse(req.body);
    if(!parsed.success){error(res,400,'BAD_INPUT','Некорректные поля таймлайна');return;}
    const exists=await db.timeline.findUnique({where:{id:routeId(req.params.id)}});
    if(!exists){error(res,404,'NOT_FOUND','Таймлайн не найден');return;}
    if(parsed.data.worldId!==exists.worldId){error(res,409,'WORLD_CHANGE','Нельзя переносить таймлайн в другой мир');return;}
    await createBackup(db);
    const t=await db.$transaction(async tx=>{
      if(parsed.data.isDefault)await tx.timeline.updateMany({where:{worldId:exists.worldId},data:{isDefault:false}});
      return tx.timeline.update({where:{id:exists.id},data:parsed.data});
    });
    await markModified();
    res.json(timelineDTO(t));
  }));
  app.delete('/api/admin/timelines/:id',admin,route(async(req,res)=>{
    const exists=await db.timeline.findUnique({where:{id:routeId(req.params.id)},include:{_count:{select:{eras:true}}}});
    if(!exists){error(res,404,'NOT_FOUND','Таймлайн не найден');return;}
    if(exists._count.eras){error(res,409,'HAS_CHILDREN','Сначала удалите эпохи');return;}
    await createBackup(db);
    await db.timeline.delete({where:{id:exists.id}});
    await markModified();
    res.json({ok:true});
  }));

  app.post('/api/admin/eras',admin,route(async(req,res)=>{
    const parsed=eraInputSchema.safeParse(req.body);
    if(!parsed.success){error(res,400,'BAD_INPUT','Некорректная эпоха');return;}
    if(!await db.timeline.findUnique({where:{id:parsed.data.timelineId}})){
      error(res,404,'NOT_FOUND','Таймлайн не найден');return;
    }
    const e=await db.era.create({data:{id:randomUUID(),...parsed.data}});
    await markModified();
    res.status(201).json(eraDTO(e));
  }));
  app.patch('/api/admin/eras/:id',admin,route(async(req,res)=>{
    const parsed=eraInputSchema.safeParse(req.body);
    if(!parsed.success){error(res,400,'BAD_INPUT','Некорректная эпоха');return;}
    const existing=await db.era.findUnique({where:{id:routeId(req.params.id)}});
    if(!existing){error(res,404,'NOT_FOUND','Эпоха не найдена');return;}
    if(existing.timelineId!==parsed.data.timelineId){error(res,409,'MOVE_DENIED','Нельзя переносить эпоху');return;}
    await createBackup(db);
    const e=await db.era.update({where:{id:existing.id},data:parsed.data});
    await markModified();
    res.json(eraDTO(e));
  }));
  app.delete('/api/admin/eras/:id',admin,route(async(req,res)=>{
    const e=await db.era.findUnique({where:{id:routeId(req.params.id)},include:{_count:{select:{events:true}}}});
    if(!e){error(res,404,'NOT_FOUND','Эпоха не найдена');return;}
    if(e._count.events){error(res,409,'HAS_CHILDREN','Сначала удалите события');return;}
    await createBackup(db);
    await db.era.delete({where:{id:e.id}});
    await markModified();
    res.json({ok:true});
  }));

  // Validate that a location belongs to the same world as the event's era/timeline.
  async function checkWorld(eraId:string,locationId:string|null,image:string|null){
    const era=await db.era.findUnique({where:{id:eraId},include:{timeline:true}});
    if(!era)return {error:'ERA_NOT_FOUND'} as const;
    if(locationId){
      const location=await db.location.findUnique({where:{id:locationId}});
      if(!location||location.worldId!==era.timeline.worldId)return {error:'WRONG_WORLD'} as const;
    }
    if(image){
      const asset=await db.mediaAsset.findUnique({where:{path:'media/'+image}});
      if(!asset)return {error:'ASSET_NOT_FOUND'} as const;
    }
    return {error:null} as const;
  }
  app.post('/api/admin/events',admin,route(async(req,res)=>{
    const parsed=eventInputSchema.safeParse(req.body);
    if(!parsed.success){error(res,400,'BAD_INPUT','Некорректные поля события');return;}
    const input=parsed.data,check=await checkWorld(input.eraId,input.locationId,input.image);
    if(check.error){error(res,400,check.error,'Неверная связь события с миром, эпохой или изображением');return;}
    const row=await db.$transaction(async tx=>{
      const created=await tx.event.create({data:{
        ...input,id:randomUUID(),article:cleanArticle(input.article),tags:JSON.stringify(input.tags)
      }});
      await recordHistory(tx,'event','create',created.id,null,created);
      return created;
    });
    await markModified();
    res.status(201).json(eventDTO(row));
  }));
  app.patch('/api/admin/events/:id',admin,route(async(req,res)=>{
    const parsed=eventInputSchema.safeParse(req.body);
    if(!parsed.success){error(res,400,'BAD_INPUT','Некорректные поля события');return;}
    const existing=await db.event.findUnique({where:{id:routeId(req.params.id)}});
    if(!existing){error(res,404,'NOT_FOUND','Событие не найдено');return;}
    if(existing.eraId!==parsed.data.eraId){error(res,409,'MOVE_DENIED','Нельзя переносить событие между эпохами');return;}
    const input=parsed.data,check=await checkWorld(input.eraId,input.locationId,input.image);
    if(check.error){error(res,400,check.error,'Неверная связь события');return;}
    await createBackup(db);
    const row=await db.$transaction(async tx=>{
      const updated=await tx.event.update({where:{id:existing.id},data:{
        ...input,article:cleanArticle(input.article),tags:JSON.stringify(input.tags)
      }});
      await recordHistory(tx,'event','update',existing.id,existing,updated);
      return updated;
    });
    await markModified();
    res.json(eventDTO(row));
  }));
  app.delete('/api/admin/events/:id',admin,route(async(req,res)=>{
    const item=await db.event.findUnique({where:{id:routeId(req.params.id)}});
    if(!item){error(res,404,'NOT_FOUND','Событие не найдено');return;}
    await createBackup(db);
    await db.$transaction(async tx=>{
      await tx.event.delete({where:{id:item.id}});
      await recordHistory(tx,'event','delete',item.id,item,null);
    });
    await markModified();
    res.json({ok:true});
  }));
}
