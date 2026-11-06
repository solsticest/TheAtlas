import type { Express, Response } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { requireAdmin } from './auth.js';
import { createBackup } from './backup.js';

export type HistoryKind='world'|'type'|'layer'|'location'|'timeline'|'era'|'event';
export type HistoryAction='create'|'update'|'delete';
type Db=PrismaClient|Prisma.TransactionClient;
type Snapshot=Record<string,unknown>;

const labels:Record<HistoryKind,string>={
  world:'мир',type:'тип маркера',layer:'регион',location:'маркер',
  timeline:'таймлайн',era:'эпоху',event:'событие',
};
function stringify(value:unknown|null){
  return value==null?null:JSON.stringify(value);
}
function parse<T>(value:string|null):T{
  if(!value)throw Error('History snapshot is missing');
  return JSON.parse(value) as T;
}
function snapshotTitle(value:string|null,kind:HistoryKind,id:string){
  if(!value)return id;
  try{
    const row=JSON.parse(value) as Snapshot;
    return String(row.name??row.title??id);
  }catch{return id;}
}
function description(kind:HistoryKind,action:HistoryAction,json:string|null,id:string){
  const verbs:Record<HistoryAction,string>={create:'Создать',update:'Изменить',delete:'Удалить'};
  return verbs[action]+' '+labels[kind]+' «'+snapshotTitle(json,kind,id)+'»';
}

export async function recordHistory(
  db:Db,kind:HistoryKind,action:HistoryAction,
  entityId:string,before:unknown|null,after:unknown|null,
){
  // A new branch after Undo invalidates Redo, matching desktop editor semantics.
  await db.editHistory.deleteMany({where:{applied:false}});
  await db.editHistory.create({data:{
    entityKind:kind,entityId,action,
    beforeJson:stringify(before),afterJson:stringify(after),applied:true,
  }});
  const overflow=await db.editHistory.findMany({
    orderBy:{id:'desc'},skip:200,select:{id:true},
  });
  if(overflow.length)await db.editHistory.deleteMany({
    where:{id:{in:overflow.map(item=>item.id)}},
  });
}

async function createFromSnapshot(db:Db,kind:HistoryKind,json:string|null){
  switch(kind){
    case 'world':
      await db.world.create({data:parse<Prisma.WorldUncheckedCreateInput>(json)});break;
    case 'type':
      await db.markerType.create({data:parse<Prisma.MarkerTypeUncheckedCreateInput>(json)});break;
    case 'layer':
      await db.mapLayer.create({data:parse<Prisma.MapLayerUncheckedCreateInput>(json)});break;
    case 'location':
      await db.location.create({data:parse<Prisma.LocationUncheckedCreateInput>(json)});break;
    case 'timeline':
      await db.timeline.create({data:parse<Prisma.TimelineUncheckedCreateInput>(json)});break;
    case 'era':
      await db.era.create({data:parse<Prisma.EraUncheckedCreateInput>(json)});break;
    case 'event':
      await db.event.create({data:parse<Prisma.EventUncheckedCreateInput>(json)});break;
  }
}
async function updateFromSnapshot(db:Db,kind:HistoryKind,id:string,json:string|null){
  switch(kind){
    case 'world':
      await db.world.update({where:{id},data:parse<Prisma.WorldUncheckedUpdateInput>(json)});break;
    case 'type':
      await db.markerType.update({where:{id},data:parse<Prisma.MarkerTypeUncheckedUpdateInput>(json)});break;
    case 'layer':
      await db.mapLayer.update({where:{id},data:parse<Prisma.MapLayerUncheckedUpdateInput>(json)});break;
    case 'location':
      await db.location.update({where:{id},data:parse<Prisma.LocationUncheckedUpdateInput>(json)});break;
    case 'timeline':
      await db.timeline.update({where:{id},data:parse<Prisma.TimelineUncheckedUpdateInput>(json)});break;
    case 'era':
      await db.era.update({where:{id},data:parse<Prisma.EraUncheckedUpdateInput>(json)});break;
    case 'event':
      await db.event.update({where:{id},data:parse<Prisma.EventUncheckedUpdateInput>(json)});break;
  }
}
async function deleteEntity(db:Db,kind:HistoryKind,id:string){
  switch(kind){
    case 'world': await db.world.delete({where:{id}});break;
    case 'type': await db.markerType.delete({where:{id}});break;
    case 'layer': await db.mapLayer.delete({where:{id}});break;
    case 'location': await db.location.delete({where:{id}});break;
    case 'timeline': await db.timeline.delete({where:{id}});break;
    case 'era': await db.era.delete({where:{id}});break;
    case 'event': await db.event.delete({where:{id}});break;
  }
}
async function applyEntry(
  db:Db,entry:{entityKind:string;entityId:string;action:string;beforeJson:string|null;afterJson:string|null},
  direction:'undo'|'redo',
){
  const kind=entry.entityKind as HistoryKind;
  const action=entry.action as HistoryAction;
  if(direction==='undo'){
    if(action==='create')await deleteEntity(db,kind,entry.entityId);
    else if(action==='update')await updateFromSnapshot(db,kind,entry.entityId,entry.beforeJson);
    else await createFromSnapshot(db,kind,entry.beforeJson);
    return;
  }
  if(action==='create')await createFromSnapshot(db,kind,entry.afterJson);
  else if(action==='update')await updateFromSnapshot(db,kind,entry.entityId,entry.afterJson);
  else await deleteEntity(db,kind,entry.entityId);
}
async function state(db:PrismaClient){
  const [undo,redo]=await Promise.all([
    db.editHistory.findFirst({where:{applied:true},orderBy:{id:'desc'}}),
    db.editHistory.findFirst({where:{applied:false},orderBy:{id:'asc'}}),
  ]);
  const info=(entry:typeof undo,direction:'undo'|'redo')=>{
    if(!entry)return null;
    const action=entry.action as HistoryAction;
    const source=direction==='undo'
      ?(action==='delete'?entry.beforeJson:entry.afterJson)
      :(action==='delete'?entry.beforeJson:entry.afterJson);
    return {
      id:entry.id,
      label:description(entry.entityKind as HistoryKind,action,source,entry.entityId),
    };
  };
  return {canUndo:Boolean(undo),canRedo:Boolean(redo),
    undo:info(undo,'undo'),redo:info(redo,'redo')};
}
function fail(res:Response,status:number,message:string){
  res.status(status).json({error:{code:'HISTORY',message}});
}

export function registerHistory(app:Express,db:PrismaClient){
  const admin=requireAdmin(db);
  app.get('/api/admin/history/state',admin,async(_req,res,next)=>{
    try{res.json(await state(db));}catch(error){next(error);}
  });
  app.post('/api/admin/history/undo',admin,async(_req,res,next)=>{
    try{
      const entry=await db.editHistory.findFirst({where:{applied:true},orderBy:{id:'desc'}});
      if(!entry){fail(res,409,'Нет действий для отмены');return;}
      await createBackup(db);
      await db.$transaction(async tx=>{
        await applyEntry(tx,entry,'undo');
        await tx.editHistory.update({where:{id:entry.id},data:{applied:false}});
        await tx.atlasDocument.updateMany({data:{isModified:true}});
      });
      res.json({ok:true,state:await state(db)});
    }catch(error){next(error);}
  });
  app.post('/api/admin/history/redo',admin,async(_req,res,next)=>{
    try{
      const entry=await db.editHistory.findFirst({where:{applied:false},orderBy:{id:'asc'}});
      if(!entry){fail(res,409,'Нет действий для повтора');return;}
      await createBackup(db);
      await db.$transaction(async tx=>{
        await applyEntry(tx,entry,'redo');
        await tx.editHistory.update({where:{id:entry.id},data:{applied:true}});
        await tx.atlasDocument.updateMany({data:{isModified:true}});
      });
      res.json({ok:true,state:await state(db)});
    }catch(error){next(error);}
  });
}
