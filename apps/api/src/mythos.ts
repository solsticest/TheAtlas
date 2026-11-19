import { randomUUID } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  mythosPantheonInputSchema, mythosDeityInputSchema, mythosRelationInputSchema,
  mythosMythInputSchema, mythosBeliefInputSchema, mythosSacredSiteInputSchema,
  mythosChronicleLinkInputSchema, mythosCosmicNodeInputSchema, mythosCosmicLinkInputSchema,
} from '@atlas/shared';
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
const mythInclude={
  participants:{include:{deity:{select:{id:true,name:true,visibility:true}}}},
} satisfies Prisma.MythosMythInclude;
type MythRow=Prisma.MythosMythGetPayload<{include:typeof mythInclude}>;
const beliefInclude={
  deity:{select:{id:true,name:true,visibility:true}},
  world:{select:{id:true,name:true}},
} satisfies Prisma.MythosBeliefInclude;
type BeliefRow=Prisma.MythosBeliefGetPayload<{include:typeof beliefInclude}>;
const siteInclude={
  deity:{select:{id:true,name:true,visibility:true}},
  location:{include:{world:{select:{id:true,name:true}}}},
} satisfies Prisma.MythosSacredSiteInclude;
type SiteRow=Prisma.MythosSacredSiteGetPayload<{include:typeof siteInclude}>;
const historyInclude={
  deity:{select:{id:true,name:true,visibility:true}},
  event:{select:{id:true,title:true,startDay:true,visibility:true}},
} satisfies Prisma.MythosChronicleLinkInclude;
type HistoryRow=Prisma.MythosChronicleLinkGetPayload<{include:typeof historyInclude}>;

const pantheonDTO=(row:{id:string;name:string;description:string;worldId:string|null;visibility:string})=>({
  id:row.id,name:row.name,description:row.description,worldId:row.worldId,visibility:row.visibility,
});
function deityDTO(row:DeityRow,admin:boolean){
  const pantheon=row.pantheon&&(admin||row.pantheon.visibility==='public')?row.pantheon:null;
  return {
    id:row.id,name:row.name,epithet:row.epithet,summary:row.summary,
    description:row.description,symbol:row.symbol,color:row.color,rank:row.rank,
    power:row.power,influence:row.influence,domains:JSON.parse(row.domains) as string[],
    primaryDomains:JSON.parse(row.primaryDomains) as string[],
    graphX:row.graphX,graphY:row.graphY,visibility:row.visibility,
    pantheonId:pantheon?.id??null,
    pantheon:pantheon?{id:pantheon.id,name:pantheon.name}:null,
    worlds:row.worlds.map(item=>item.world),
  };
}
function mythDTO(row:MythRow,admin:boolean){
  return {
    id:row.id,title:row.title,summary:row.summary,description:row.description,visibility:row.visibility,
    participants:row.participants
      .filter(item=>admin||item.deity.visibility==='public')
      .map(item=>({deityId:item.deityId,deityName:item.deity.name,role:item.role})),
  };
}
function beliefDTO(row:BeliefRow,admin:boolean){
  const deity=row.deity&&(admin||row.deity.visibility==='public')?row.deity:null;
  return {
    id:row.id,deityId:deity?.id??null,worldId:row.worldId,culture:row.culture,
    publicName:row.publicName,doctrine:row.doctrine,identity:row.identity,visibility:row.visibility,
    deity:deity?{id:deity.id,name:deity.name}:null,
    world:row.world?{id:row.world.id,name:row.world.name}:null,
  };
}
function siteDTO(row:SiteRow){
  return {
    id:row.id,deityId:row.deityId,locationId:row.locationId,name:row.name,
    description:row.description,importance:row.importance,visibility:row.visibility,
    deity:{id:row.deity.id,name:row.deity.name},
    location:{id:row.location.id,name:row.location.name,worldId:row.location.worldId,
      worldName:row.location.world.name},
  };
}
function historyDTO(row:HistoryRow){
  return {
    deityId:row.deityId,eventId:row.eventId,role:row.role,
    deity:{id:row.deity.id,name:row.deity.name},
    event:{id:row.event.id,title:row.event.title,startDay:row.event.startDay},
  };
}
const normalize=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
function distinctDomains(values:string[]){
  const unique=new Map<string,string>();
  for(const value of values){
    const key=normalize(value);
    if(key&&!unique.has(key))unique.set(key,value.trim().replace(/\s+/g,' '));
  }
  return [...unique.values()];
}
function normalizedPrimary(domains:string[],primary:string[]){
  const byKey=new Map(domains.map(value=>[normalize(value),value]));
  return distinctDomains(primary).map(value=>byKey.get(normalize(value))).filter((value):value is string=>Boolean(value));
}
async function validateWorlds(db:PrismaClient,ids:string[]){
  const unique=[...new Set(ids)];
  if(!unique.length)return unique;
  const count=await db.world.count({where:{id:{in:unique}}});
  return count===unique.length?unique:null;
}
async function ensureDeities(db:PrismaClient,ids:string[]){
  const unique=[...new Set(ids)];
  if(!unique.length)return true;
  return await db.mythosDeity.count({where:{id:{in:unique}}})===unique.length;
}
async function isAdminRequest(req:Request,db:PrismaClient){
  return Boolean(await sessionFor(req,db));
}

export function registerMythos(app:Express,db:PrismaClient){
  const admin=requireAdmin(db);
  const markModified=()=>db.atlasDocument.updateMany({data:{isModified:true}});

  app.get('/api/mythos/pantheons',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const isAdmin=await isAdminRequest(req,db);
    const rows=await db.mythosPantheon.findMany({
      where:isAdmin?{}:{visibility:'public'},orderBy:[{name:'asc'},{id:'asc'}],
    });
    res.json(rows.map(pantheonDTO));
  }));
  app.get('/api/mythos/deities',route(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const isAdmin=await isAdminRequest(req,db);
    const rows=await db.mythosDeity.findMany({
      where:isAdmin?{}:{visibility:'public'},include:deityInclude,orderBy:[{name:'asc'},{id:'asc'}],
    });
    res.json(rows.map(row=>deityDTO(row,isAdmin)));
  }));
  app.get('/api/mythos/relations',route(async(req,res)=>{
    const isAdmin=await isAdminRequest(req,db);
    const rows=await db.mythosRelation.findMany({
      where:isAdmin?{}:{visibility:'public',source:{visibility:'public'},target:{visibility:'public'}},
      orderBy:[{category:'asc'},{type:'asc'},{id:'asc'}],
    });
    res.json(rows.map(row=>({
      id:row.id,sourceId:row.sourceId,targetId:row.targetId,type:row.type,category:row.category,
      label:row.label,description:row.description,startDay:row.startDay,endDay:row.endDay,
      visibility:row.visibility,
    })));
  }));
  app.get('/api/mythos/myths',route(async(req,res)=>{
    const isAdmin=await isAdminRequest(req,db);
    const rows=await db.mythosMyth.findMany({
      where:isAdmin?{}:{visibility:'public'},include:mythInclude,orderBy:[{title:'asc'},{id:'asc'}],
    });
    res.json(rows.map(row=>mythDTO(row,isAdmin)));
  }));
  app.get('/api/mythos/beliefs',route(async(req,res)=>{
    const isAdmin=await isAdminRequest(req,db);
    const rows=await db.mythosBelief.findMany({
      where:isAdmin?{}:{visibility:'public'},include:beliefInclude,
      orderBy:[{culture:'asc'},{publicName:'asc'},{id:'asc'}],
    });
    res.json(rows.map(row=>beliefDTO(row,isAdmin)));
  }));
  app.get('/api/mythos/sites',route(async(req,res)=>{
    const isAdmin=await isAdminRequest(req,db);
    const rows=await db.mythosSacredSite.findMany({
      where:isAdmin?{}:{visibility:'public',deity:{visibility:'public'}},
      include:siteInclude,orderBy:[{name:'asc'},{id:'asc'}],
    });
    res.json(rows.map(siteDTO));
  }));
  app.get('/api/mythos/history-links',route(async(req,res)=>{
    const isAdmin=await isAdminRequest(req,db);
    const rows=await db.mythosChronicleLink.findMany({
      where:isAdmin?{}:{deity:{visibility:'public'},event:{visibility:'public'}},
      include:historyInclude,orderBy:[{event:{startDay:'asc'}},{deityId:'asc'}],
    });
    res.json(rows.map(historyDTO));
  }));
  app.get('/api/mythos/cosmology/nodes',route(async(req,res)=>{
    const isAdmin=await isAdminRequest(req,db);
    res.json(await db.mythosCosmicNode.findMany({
      where:isAdmin?{}:{visibility:'public'},orderBy:[{name:'asc'},{id:'asc'}],
    }));
  }));
  app.get('/api/mythos/cosmology/links',route(async(req,res)=>{
    const isAdmin=await isAdminRequest(req,db);
    res.json(await db.mythosCosmicLink.findMany({
      where:isAdmin?{}:{visibility:'public',source:{visibility:'public'},target:{visibility:'public'}},
      orderBy:[{type:'asc'},{id:'asc'}],
    }));
  }));
  app.get('/api/mythos/locations',route(async(_req,res)=>{
    const rows=await db.location.findMany({
      include:{world:{select:{id:true,name:true}}},
      orderBy:[{worldId:'asc'},{name:'asc'}],
    });
    res.json(rows.map(row=>({id:row.id,name:row.name,worldId:row.worldId,worldName:row.world.name})));
  }));

  app.post('/api/admin/mythos/pantheons',admin,route(async(req,res)=>{
    const parsed=mythosPantheonInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте поля пантеона');return;}
    const input=parsed.data;
    if(input.worldId&&!await db.world.findUnique({where:{id:input.worldId}})){
      fail(res,400,'WORLD_NOT_FOUND','Мир пантеона не найден');return;
    }
    const row=await db.mythosPantheon.create({data:{id:randomUUID(),...input}});
    await markModified();res.status(201).json(pantheonDTO(row));
  }));
  app.patch('/api/admin/mythos/pantheons/:id',admin,route(async(req,res)=>{
    const parsed=mythosPantheonInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте поля пантеона');return;}
    const id=paramId(req.params.id);
    if(!await db.mythosPantheon.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Пантеон не найден');return;}
    if(parsed.data.worldId&&!await db.world.findUnique({where:{id:parsed.data.worldId}})){
      fail(res,400,'WORLD_NOT_FOUND','Мир пантеона не найден');return;
    }
    await createBackup(db);
    const row=await db.mythosPantheon.update({where:{id},data:parsed.data});
    await markModified();res.json(pantheonDTO(row));
  }));
  app.delete('/api/admin/mythos/pantheons/:id',admin,route(async(req,res)=>{
    const id=paramId(req.params.id);
    const row=await db.mythosPantheon.findUnique({where:{id},include:{_count:{select:{deities:true}}}});
    if(!row){fail(res,404,'NOT_FOUND','Пантеон не найден');return;}
    if(row._count.deities){fail(res,409,'HAS_DEITIES','Сначала перенесите божеств в другой пантеон');return;}
    await createBackup(db);await db.mythosPantheon.delete({where:{id}});await markModified();res.json({ok:true});
  }));

  app.post('/api/admin/mythos/deities',admin,route(async(req,res)=>{
    const parsed=mythosDeityInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте поля божества');return;}
    const input=parsed.data,worlds=await validateWorlds(db,input.worldIds);
    if(!worlds){fail(res,400,'WORLD_NOT_FOUND','Один из миров не найден');return;}
    if(input.pantheonId&&!await db.mythosPantheon.findUnique({where:{id:input.pantheonId}})){
      fail(res,400,'PANTHEON_NOT_FOUND','Пантеон не найден');return;
    }
    const domains=distinctDomains(input.domains);
    const row=await db.mythosDeity.create({
      data:{
        id:randomUUID(),name:input.name,epithet:input.epithet,summary:input.summary,
        description:input.description,symbol:input.symbol,color:input.color,rank:input.rank,
        power:input.power,influence:input.influence,domains:JSON.stringify(domains),primaryDomains:JSON.stringify(normalizedPrimary(domains,input.primaryDomains)),
        graphX:input.graphX,graphY:input.graphY,visibility:input.visibility,pantheonId:input.pantheonId,
        worlds:{create:worlds.map(worldId=>({worldId}))},
      },include:deityInclude,
    });
    await markModified();res.status(201).json(deityDTO(row,true));
  }));
  app.patch('/api/admin/mythos/deities/:id',admin,route(async(req,res)=>{
    const parsed=mythosDeityInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте поля божества');return;}
    const id=paramId(req.params.id);
    if(!await db.mythosDeity.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Божество не найдено');return;}
    const input=parsed.data,worlds=await validateWorlds(db,input.worldIds);
    if(!worlds){fail(res,400,'WORLD_NOT_FOUND','Один из миров не найден');return;}
    if(input.pantheonId&&!await db.mythosPantheon.findUnique({where:{id:input.pantheonId}})){
      fail(res,400,'PANTHEON_NOT_FOUND','Пантеон не найден');return;
    }
    const domains=distinctDomains(input.domains);
    await createBackup(db);
    const row=await db.$transaction(async(tx)=>{
      await tx.mythosDeityWorld.deleteMany({where:{deityId:id}});
      return tx.mythosDeity.update({
        where:{id},data:{
          name:input.name,epithet:input.epithet,summary:input.summary,description:input.description,
          symbol:input.symbol,color:input.color,rank:input.rank,power:input.power,
          influence:input.influence,domains:JSON.stringify(domains),
          primaryDomains:JSON.stringify(normalizedPrimary(domains,input.primaryDomains)),
          graphX:input.graphX,graphY:input.graphY,visibility:input.visibility,pantheonId:input.pantheonId,
          worlds:{create:worlds.map(worldId=>({worldId}))},
        },include:deityInclude,
      });
    });
    await markModified();res.json(deityDTO(row,true));
  }));
  app.delete('/api/admin/mythos/deities/:id',admin,route(async(req,res)=>{
    const id=paramId(req.params.id);
    if(!await db.mythosDeity.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Божество не найдено');return;}
    await createBackup(db);await db.mythosDeity.delete({where:{id}});await markModified();res.json({ok:true});
  }));

  app.post('/api/admin/mythos/relations',admin,route(async(req,res)=>{
    const parsed=mythosRelationInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте связь');return;}
    if(!await ensureDeities(db,[parsed.data.sourceId,parsed.data.targetId])){
      fail(res,400,'DEITY_NOT_FOUND','Один из участников связи не найден');return;
    }
    const row=await db.mythosRelation.create({data:{id:randomUUID(),...parsed.data}});
    await markModified();res.status(201).json(row);
  }));
  app.patch('/api/admin/mythos/relations/:id',admin,route(async(req,res)=>{
    const parsed=mythosRelationInputSchema.safeParse(req.body),id=paramId(req.params.id);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте связь');return;}
    if(!await db.mythosRelation.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Связь не найдена');return;}
    if(!await ensureDeities(db,[parsed.data.sourceId,parsed.data.targetId])){
      fail(res,400,'DEITY_NOT_FOUND','Один из участников связи не найден');return;
    }
    await createBackup(db);
    const row=await db.mythosRelation.update({where:{id},data:parsed.data});
    await markModified();res.json(row);
  }));
  app.delete('/api/admin/mythos/relations/:id',admin,route(async(req,res)=>{
    const id=paramId(req.params.id);
    if(!await db.mythosRelation.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Связь не найдена');return;}
    await createBackup(db);await db.mythosRelation.delete({where:{id}});await markModified();res.json({ok:true});
  }));

  app.post('/api/admin/mythos/myths',admin,route(async(req,res)=>{
    const parsed=mythosMythInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте миф');return;}
    const input=parsed.data;
    if(!await ensureDeities(db,input.participants.map(p=>p.deityId))){
      fail(res,400,'DEITY_NOT_FOUND','Участник мифа не найден');return;
    }
    const unique=[...new Map(input.participants.map(p=>[p.deityId,p])).values()];
    const row=await db.mythosMyth.create({
      data:{id:randomUUID(),title:input.title,summary:input.summary,description:input.description,
        visibility:input.visibility,participants:{create:unique}},
      include:mythInclude,
    });
    await markModified();res.status(201).json(mythDTO(row,true));
  }));
  app.patch('/api/admin/mythos/myths/:id',admin,route(async(req,res)=>{
    const parsed=mythosMythInputSchema.safeParse(req.body),id=paramId(req.params.id);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте миф');return;}
    if(!await db.mythosMyth.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Миф не найден');return;}
    if(!await ensureDeities(db,parsed.data.participants.map(p=>p.deityId))){
      fail(res,400,'DEITY_NOT_FOUND','Участник мифа не найден');return;
    }
    const unique=[...new Map(parsed.data.participants.map(p=>[p.deityId,p])).values()];
    await createBackup(db);
    const row=await db.$transaction(async tx=>{
      await tx.mythosMythParticipant.deleteMany({where:{mythId:id}});
      return tx.mythosMyth.update({where:{id},data:{
        title:parsed.data.title,summary:parsed.data.summary,description:parsed.data.description,
        visibility:parsed.data.visibility,participants:{create:unique},
      },include:mythInclude});
    });
    await markModified();res.json(mythDTO(row,true));
  }));
  app.delete('/api/admin/mythos/myths/:id',admin,route(async(req,res)=>{
    const id=paramId(req.params.id);
    if(!await db.mythosMyth.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Миф не найден');return;}
    await createBackup(db);await db.mythosMyth.delete({where:{id}});await markModified();res.json({ok:true});
  }));

  app.post('/api/admin/mythos/beliefs',admin,route(async(req,res)=>{
    const parsed=mythosBeliefInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте верование');return;}
    if(parsed.data.deityId&&!await db.mythosDeity.findUnique({where:{id:parsed.data.deityId}})){
      fail(res,400,'DEITY_NOT_FOUND','Божество не найдено');return;
    }
    if(parsed.data.worldId&&!await db.world.findUnique({where:{id:parsed.data.worldId}})){
      fail(res,400,'WORLD_NOT_FOUND','Мир не найден');return;
    }
    const row=await db.mythosBelief.create({data:{id:randomUUID(),...parsed.data},include:beliefInclude});
    await markModified();res.status(201).json(beliefDTO(row,true));
  }));
  app.patch('/api/admin/mythos/beliefs/:id',admin,route(async(req,res)=>{
    const parsed=mythosBeliefInputSchema.safeParse(req.body),id=paramId(req.params.id);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте верование');return;}
    if(!await db.mythosBelief.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Верование не найдено');return;}
    if(parsed.data.deityId&&!await db.mythosDeity.findUnique({where:{id:parsed.data.deityId}})){
      fail(res,400,'DEITY_NOT_FOUND','Божество не найдено');return;
    }
    if(parsed.data.worldId&&!await db.world.findUnique({where:{id:parsed.data.worldId}})){
      fail(res,400,'WORLD_NOT_FOUND','Мир не найден');return;
    }
    await createBackup(db);
    const row=await db.mythosBelief.update({where:{id},data:parsed.data,include:beliefInclude});
    await markModified();res.json(beliefDTO(row,true));
  }));
  app.delete('/api/admin/mythos/beliefs/:id',admin,route(async(req,res)=>{
    const id=paramId(req.params.id);
    if(!await db.mythosBelief.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Верование не найдено');return;}
    await createBackup(db);await db.mythosBelief.delete({where:{id}});await markModified();res.json({ok:true});
  }));

  app.post('/api/admin/mythos/sites',admin,route(async(req,res)=>{
    const parsed=mythosSacredSiteInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте священное место');return;}
    if(!await db.mythosDeity.findUnique({where:{id:parsed.data.deityId}})){
      fail(res,400,'DEITY_NOT_FOUND','Божество не найдено');return;
    }
    if(!await db.location.findUnique({where:{id:parsed.data.locationId}})){
      fail(res,400,'LOCATION_NOT_FOUND','Локация Atlas не найдена');return;
    }
    const row=await db.mythosSacredSite.create({data:{id:randomUUID(),...parsed.data},include:siteInclude});
    await markModified();res.status(201).json(siteDTO(row));
  }));
  app.patch('/api/admin/mythos/sites/:id',admin,route(async(req,res)=>{
    const parsed=mythosSacredSiteInputSchema.safeParse(req.body),id=paramId(req.params.id);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте священное место');return;}
    if(!await db.mythosSacredSite.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Священное место не найдено');return;}
    if(!await db.mythosDeity.findUnique({where:{id:parsed.data.deityId}})||
      !await db.location.findUnique({where:{id:parsed.data.locationId}})){
      fail(res,400,'BAD_REFERENCE','Божество или локация не найдены');return;
    }
    await createBackup(db);
    const row=await db.mythosSacredSite.update({where:{id},data:parsed.data,include:siteInclude});
    await markModified();res.json(siteDTO(row));
  }));
  app.delete('/api/admin/mythos/sites/:id',admin,route(async(req,res)=>{
    const id=paramId(req.params.id);
    if(!await db.mythosSacredSite.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Священное место не найдено');return;}
    await createBackup(db);await db.mythosSacredSite.delete({where:{id}});await markModified();res.json({ok:true});
  }));

  app.post('/api/admin/mythos/history-links',admin,route(async(req,res)=>{
    const parsed=mythosChronicleLinkInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте историческую связь');return;}
    const [deity,event]=await Promise.all([
      db.mythosDeity.findUnique({where:{id:parsed.data.deityId}}),
      db.chronicleEvent.findUnique({where:{id:parsed.data.eventId}}),
    ]);
    if(!deity||!event){fail(res,400,'BAD_REFERENCE','Божество или событие Chronicle не найдено');return;}
    const row=await db.mythosChronicleLink.upsert({
      where:{deityId_eventId:{deityId:parsed.data.deityId,eventId:parsed.data.eventId}},
      create:parsed.data,update:{role:parsed.data.role},include:historyInclude,
    });
    await markModified();res.status(201).json(historyDTO(row));
  }));
  app.delete('/api/admin/mythos/history-links/:deityId/:eventId',admin,route(async(req,res)=>{
    const deityId=paramId(req.params.deityId),eventId=paramId(req.params.eventId);
    const exists=await db.mythosChronicleLink.findUnique({where:{deityId_eventId:{deityId,eventId}}});
    if(!exists){fail(res,404,'NOT_FOUND','Историческая связь не найдена');return;}
    await createBackup(db);
    await db.mythosChronicleLink.delete({where:{deityId_eventId:{deityId,eventId}}});
    await markModified();res.json({ok:true});
  }));

  app.post('/api/admin/mythos/cosmology/nodes',admin,route(async(req,res)=>{
    const parsed=mythosCosmicNodeInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте узел космологии');return;}
    if(parsed.data.worldId&&!await db.world.findUnique({where:{id:parsed.data.worldId}})){
      fail(res,400,'WORLD_NOT_FOUND','Мир не найден');return;
    }
    const row=await db.mythosCosmicNode.create({data:{id:randomUUID(),...parsed.data}});
    await markModified();res.status(201).json(row);
  }));
  app.patch('/api/admin/mythos/cosmology/nodes/:id',admin,route(async(req,res)=>{
    const parsed=mythosCosmicNodeInputSchema.safeParse(req.body),id=paramId(req.params.id);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте узел космологии');return;}
    if(!await db.mythosCosmicNode.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Узел не найден');return;}
    if(parsed.data.worldId&&!await db.world.findUnique({where:{id:parsed.data.worldId}})){
      fail(res,400,'WORLD_NOT_FOUND','Мир не найден');return;
    }
    await createBackup(db);
    const row=await db.mythosCosmicNode.update({where:{id},data:parsed.data});
    await markModified();res.json(row);
  }));
  app.delete('/api/admin/mythos/cosmology/nodes/:id',admin,route(async(req,res)=>{
    const id=paramId(req.params.id);
    if(!await db.mythosCosmicNode.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Узел не найден');return;}
    await createBackup(db);await db.mythosCosmicNode.delete({where:{id}});await markModified();res.json({ok:true});
  }));

  app.post('/api/admin/mythos/cosmology/links',admin,route(async(req,res)=>{
    const parsed=mythosCosmicLinkInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте связь планов');return;}
    const count=await db.mythosCosmicNode.count({where:{id:{in:[parsed.data.sourceId,parsed.data.targetId]}}});
    if(count!==2){fail(res,400,'NODE_NOT_FOUND','Один из узлов не найден');return;}
    const row=await db.mythosCosmicLink.create({data:{id:randomUUID(),...parsed.data}});
    await markModified();res.status(201).json(row);
  }));
  app.patch('/api/admin/mythos/cosmology/links/:id',admin,route(async(req,res)=>{
    const parsed=mythosCosmicLinkInputSchema.safeParse(req.body),id=paramId(req.params.id);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверьте связь планов');return;}
    if(!await db.mythosCosmicLink.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Связь не найдена');return;}
    const count=await db.mythosCosmicNode.count({where:{id:{in:[parsed.data.sourceId,parsed.data.targetId]}}});
    if(count!==2){fail(res,400,'NODE_NOT_FOUND','Один из узлов не найден');return;}
    await createBackup(db);
    const row=await db.mythosCosmicLink.update({where:{id},data:parsed.data});
    await markModified();res.json(row);
  }));
  app.delete('/api/admin/mythos/cosmology/links/:id',admin,route(async(req,res)=>{
    const id=paramId(req.params.id);
    if(!await db.mythosCosmicLink.findUnique({where:{id}})){fail(res,404,'NOT_FOUND','Связь не найдена');return;}
    await createBackup(db);await db.mythosCosmicLink.delete({where:{id}});await markModified();res.json({ok:true});
  }));
}
