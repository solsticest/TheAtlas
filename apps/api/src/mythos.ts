import { randomUUID } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { mythosPantheonInputSchema, mythosDeityInputSchema } from '@atlas/shared';
import { requireAdmin, sessionFor } from './auth.js';
import { createBackup } from './backup.js';

type Handler=(req:Request,res:Response,next:NextFunction)=>Promise<void>;
const route=(fn:Handler)=>(req:Request,res:Response,next:NextFunction)=>{fn(req,res,next).catch(next);};
const fail=(res:Response,status:number,code:string,message:string)=>{
  res.status(status).json({error:{code,message}});
};
const paramId=(value:string|string[]|undefined)=>typeof value==='string'?value:'';
const deityInclude={
  pantheon:{select:{id:true,name:true,visibility:true}},
  worlds:{include:{world:{select:{id:true,name:true}}}},
} satisfies Prisma.MythosDeityInclude;
type DeityRow=Prisma.MythosDeityGetPayload<{include:typeof deityInclude}>;
const pantheonDTO=(row:{id:string;name:string;description:string;worldId:string|null;visibility:string})=>({
  id:row.id,name:row.name,description:row.description,worldId:row.worldId,visibility:row.visibility,
});
function deityDTO(row:DeityRow,admin:boolean){
  const pantheon=row.pantheon&&(admin||row.pantheon.visibility==='public')?row.pantheon:null;
  return {
    id:row.id,name:row.name,epithet:row.epithet,summary:row.summary,
    description:row.description,symbol:row.symbol,color:row.color,rank:row.rank,
    domains:JSON.parse(row.domains) as string[],visibility:row.visibility,
    pantheonId:pantheon?.id??null,
    pantheon:pantheon?{id:pantheon.id,name:pantheon.name}:null,
    worlds:row.worlds.map(item=>item.world),
  };
}
const normalize=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
function distinctDomains(values:string[]){
  return [...new Map(values.map(name=>[normalize(name),name.trim().replace(/\s+/g,' ')])).values()];
}
async function validateWorlds(db:PrismaClient,ids:string[]){
  const unique=[...new Set(ids)];
  if(!unique.length)return unique;
  const count=await db.world.count({where:{id:{in:unique}}});
  return count===unique.length?unique:null;
}

export function registerMythos(app:Express,db:PrismaClient){
  const admin=requireAdmin(db);
  const markModified=()=>db.atlasDocument.updateMany({data:{isModified:true}});

  app.get('/api/mythos/pantheons',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const isAdmin=Boolean(await sessionFor(req,db));
    const rows=await db.mythosPantheon.findMany({
      where:isAdmin?{}:{visibility:'public'},
      orderBy:[{name:'asc'},{id:'asc'}],
    });
    res.json(rows.map(pantheonDTO));
  }));

  app.get('/api/mythos/deities',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const isAdmin=Boolean(await sessionFor(req,db));
    const rows=await db.mythosDeity.findMany({
      where:isAdmin?{}:{visibility:'public'},
      include:deityInclude,
      orderBy:[{name:'asc'},{id:'asc'}],
    });
    res.json(rows.map(row=>deityDTO(row,isAdmin)));
  }));

  app.post('/api/admin/mythos/pantheons',admin,route(async(req,res)=>{
    const parsed=mythosPantheonInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте поля пантеона');return;}
    const input=parsed.data;
    if(input.worldId&&!await db.world.findUnique({where:{id:input.worldId}})){
      fail(res,400,'WORLD_NOT_FOUND','Мир пантеона не найден');return;
    }
    const row=await db.mythosPantheon.create({data:{id:randomUUID(),...input}});
    await markModified();
    res.status(201).json(pantheonDTO(row));
  }));

  app.patch('/api/admin/mythos/pantheons/:id',admin,route(async(req,res)=>{
    const parsed=mythosPantheonInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте поля пантеона');return;}
    const id=paramId(req.params.id);
    if(!await db.mythosPantheon.findUnique({where:{id}})){
      fail(res,404,'NOT_FOUND','Пантеон не найден');return;
    }
    if(parsed.data.worldId&&!await db.world.findUnique({where:{id:parsed.data.worldId}})){
      fail(res,400,'WORLD_NOT_FOUND','Мир пантеона не найден');return;
    }
    await createBackup(db);
    const row=await db.mythosPantheon.update({where:{id},data:parsed.data});
    await markModified();
    res.json(pantheonDTO(row));
  }));

  app.delete('/api/admin/mythos/pantheons/:id',admin,route(async(req,res)=>{
    const id=paramId(req.params.id);
    const row=await db.mythosPantheon.findUnique({where:{id},include:{_count:{select:{deities:true}}}});
    if(!row){fail(res,404,'NOT_FOUND','Пантеон не найден');return;}
    if(row._count.deities){
      fail(res,409,'HAS_DEITIES','Сначала перенесите божеств в другой пантеон');return;
    }
    await createBackup(db);
    await db.mythosPantheon.delete({where:{id}});
    await markModified();
    res.json({ok:true});
  }));

  app.post('/api/admin/mythos/deities',admin,route(async(req,res)=>{
    const parsed=mythosDeityInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте поля божества');return;}
    const input=parsed.data;
    const worlds=await validateWorlds(db,input.worldIds);
    if(!worlds){fail(res,400,'WORLD_NOT_FOUND','Один из миров не найден');return;}
    if(input.pantheonId&&!await db.mythosPantheon.findUnique({where:{id:input.pantheonId}})){
      fail(res,400,'PANTHEON_NOT_FOUND','Пантеон не найден');return;
    }
    const row=await db.mythosDeity.create({
      data:{
        id:randomUUID(),name:input.name,epithet:input.epithet,summary:input.summary,
        description:input.description,symbol:input.symbol,color:input.color,
        rank:input.rank,domains:JSON.stringify(distinctDomains(input.domains)),
        visibility:input.visibility,pantheonId:input.pantheonId,
        worlds:{create:worlds.map(worldId=>({worldId}))},
      },
      include:deityInclude,
    });
    await markModified();
    res.status(201).json(deityDTO(row,true));
  }));

  app.patch('/api/admin/mythos/deities/:id',admin,route(async(req,res)=>{
    const parsed=mythosDeityInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте поля божества');return;}
    const id=paramId(req.params.id);
    if(!await db.mythosDeity.findUnique({where:{id}})){
      fail(res,404,'NOT_FOUND','Божество не найдено');return;
    }
    const input=parsed.data;
    const worlds=await validateWorlds(db,input.worldIds);
    if(!worlds){fail(res,400,'WORLD_NOT_FOUND','Один из миров не найден');return;}
    if(input.pantheonId&&!await db.mythosPantheon.findUnique({where:{id:input.pantheonId}})){
      fail(res,400,'PANTHEON_NOT_FOUND','Пантеон не найден');return;
    }
    await createBackup(db);
    const row=await db.$transaction(async(tx)=>{
      await tx.mythosDeityWorld.deleteMany({where:{deityId:id}});
      return tx.mythosDeity.update({
        where:{id},
        data:{
          name:input.name,epithet:input.epithet,summary:input.summary,
          description:input.description,symbol:input.symbol,color:input.color,
          rank:input.rank,domains:JSON.stringify(distinctDomains(input.domains)),
          visibility:input.visibility,pantheonId:input.pantheonId,
          worlds:{create:worlds.map(worldId=>({worldId}))},
        },
        include:deityInclude,
      });
    });
    await markModified();
    res.json(deityDTO(row,true));
  }));

  app.delete('/api/admin/mythos/deities/:id',admin,route(async(req,res)=>{
    const id=paramId(req.params.id);
    if(!await db.mythosDeity.findUnique({where:{id}})){
      fail(res,404,'NOT_FOUND','Божество не найдено');return;
    }
    await createBackup(db);
    await db.mythosDeity.delete({where:{id}});
    await markModified();
    res.json({ok:true});
  }));
}
