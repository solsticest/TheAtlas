import { randomUUID } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { chronicleEventInputSchema } from '@atlas/shared';
import { requireAdmin, sessionFor } from './auth.js';
import { createBackup } from './backup.js';
import { cleanArticle } from './html.js';

type Handler=(req:Request,res:Response,next:NextFunction)=>Promise<void>;
const route=(fn:Handler)=>(req:Request,res:Response,next:NextFunction)=>{fn(req,res,next).catch(next);};
const fail=(res:Response,status:number,code:string,message:string)=>res.status(status).json({error:{code,message}});
const eventInclude={
  worlds:{include:{world:{select:{id:true,name:true}}}},
  tags:{include:{tag:true}},
} satisfies Prisma.ChronicleEventInclude;
type ChronicleRow=Prisma.ChronicleEventGetPayload<{include:typeof eventInclude}>;

function dto(row:ChronicleRow){
  return {
    id:row.id,title:row.title,summary:row.summary,article:row.article,kind:row.kind,
    startDay:row.startDay,endDay:row.endDay,startPrecision:row.startPrecision,
    earliestDay:row.earliestDay,latestDay:row.latestDay,endPrecision:row.endPrecision,
    significance:row.significance,visibility:row.visibility,
    worlds:row.worlds.map(item=>item.world),
    tags:row.tags.map(item=>({
      id:item.tag.id,name:item.tag.name,color:item.tag.color,
      icon:item.tag.icon,description:item.tag.description,
    })),
  };
}
const normalize=(name:string)=>name.trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
const routeId=(value:string|string[]|undefined)=>typeof value==='string'?value:'';

async function validateWorlds(db:PrismaClient,ids:string[]){
  const unique=[...new Set(ids)];
  if(!unique.length)return unique;
  const count=await db.world.count({where:{id:{in:unique}}});
  if(count!==unique.length)throw Object.assign(Error('Unknown Chronicle world'),{code:'CHRONICLE_WORLD_NOT_FOUND'});
  return unique;
}

export function registerChronicle(app:Express,db:PrismaClient){
  const admin=requireAdmin(db);
  const markModified=()=>db.atlasDocument.updateMany({data:{isModified:true}});

  app.get('/api/chronicle/events',route(async(req,res)=>{
    const session=await sessionFor(req,db);
    const rows=await db.chronicleEvent.findMany({
      where:session?{}:{visibility:'public'},
      include:eventInclude,
      orderBy:[{startDay:'asc'},{createdAt:'asc'}],
    });
    res.json(rows.map(dto));
  }));

  app.get('/api/chronicle/tags',route(async(req,res)=>{
    const session=await sessionFor(req,db);
    const rows=await db.chronicleTag.findMany({
      where:session?{}:{events:{some:{event:{visibility:'public'}}}},
      orderBy:[{name:'asc'}],
    });
    res.json(rows.map(tag=>({
      id:tag.id,name:tag.name,color:tag.color,icon:tag.icon,description:tag.description,
    })));
  }));

  app.post('/api/admin/chronicle/events',admin,route(async(req,res)=>{
    const parsed=chronicleEventInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Некорректные поля события Chronicle');return;}
    const input=parsed.data;
    let worldIds:string[];
    try{worldIds=await validateWorlds(db,input.worldIds);}
    catch{fail(res,400,'WORLD_NOT_FOUND','Один из миров Chronicle не найден');return;}
    const tagNames=[...new Map(input.tagNames.map(name=>[normalize(name),name.trim()])).values()];
    const row=await db.$transaction(async tx=>{
      const tags=[];
      for(const name of tagNames){
        const normalizedName=normalize(name);
        tags.push(await tx.chronicleTag.upsert({
          where:{normalizedName},
          update:{name},
          create:{id:randomUUID(),name,normalizedName},
        }));
      }
      return tx.chronicleEvent.create({
        data:{
          id:randomUUID(),title:input.title,summary:input.summary,
          article:cleanArticle(input.article),kind:input.kind,
          startDay:input.startDay,endDay:input.endDay,startPrecision:input.startPrecision,
          earliestDay:input.earliestDay,latestDay:input.latestDay,endPrecision:input.endPrecision,
          significance:input.significance,visibility:input.visibility,
          worlds:{create:worldIds.map(worldId=>({worldId}))},
          tags:{create:tags.map(tag=>({tagId:tag.id}))},
        },
        include:eventInclude,
      });
    });
    await markModified();
    res.status(201).json(dto(row));
  }));

  app.patch('/api/admin/chronicle/events/:id',admin,route(async(req,res)=>{
    const parsed=chronicleEventInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Некорректные поля события Chronicle');return;}
    const existing=await db.chronicleEvent.findUnique({where:{id:routeId(req.params.id)}});
    if(!existing){fail(res,404,'NOT_FOUND','Событие Chronicle не найдено');return;}
    const input=parsed.data;
    let worldIds:string[];
    try{worldIds=await validateWorlds(db,input.worldIds);}
    catch{fail(res,400,'WORLD_NOT_FOUND','Один из миров Chronicle не найден');return;}
    await createBackup(db);
    const tagNames=[...new Map(input.tagNames.map(name=>[normalize(name),name.trim()])).values()];
    const row=await db.$transaction(async tx=>{
      const tags=[];
      for(const name of tagNames){
        const normalizedName=normalize(name);
        tags.push(await tx.chronicleTag.upsert({
          where:{normalizedName},update:{name},create:{id:randomUUID(),name,normalizedName},
        }));
      }
      await tx.chronicleEventWorld.deleteMany({where:{eventId:existing.id}});
      await tx.chronicleEventTag.deleteMany({where:{eventId:existing.id}});
      return tx.chronicleEvent.update({
        where:{id:existing.id},
        data:{
          title:input.title,summary:input.summary,article:cleanArticle(input.article),
          kind:input.kind,startDay:input.startDay,endDay:input.endDay,
          startPrecision:input.startPrecision,earliestDay:input.earliestDay,
          latestDay:input.latestDay,endPrecision:input.endPrecision,
          significance:input.significance,visibility:input.visibility,
          worlds:{create:worldIds.map(worldId=>({worldId}))},
          tags:{create:tags.map(tag=>({tagId:tag.id}))},
        },
        include:eventInclude,
      });
    });
    await markModified();
    res.json(dto(row));
  }));

  app.delete('/api/admin/chronicle/events/:id',admin,route(async(req,res)=>{
    const existing=await db.chronicleEvent.findUnique({where:{id:routeId(req.params.id)}});
    if(!existing){fail(res,404,'NOT_FOUND','Событие Chronicle не найдено');return;}
    await createBackup(db);
    await db.chronicleEvent.delete({where:{id:existing.id}});
    await markModified();
    res.json({ok:true});
  }));
}
