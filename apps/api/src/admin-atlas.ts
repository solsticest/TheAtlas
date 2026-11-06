import { randomUUID } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  worldCreateSchema, worldUpdateSchema, markerTypeInputSchema,
  layerCreateSchema, layerEditSchema, locationCreateSchema, locationEditSchema,
} from '@atlas/shared';
import { requireAdmin } from './auth.js';
import { createBackup } from './backup.js';
import { cleanArticle } from './html.js';

const fail=(res:Response,status:number,code:string,message:string)=>{
  res.status(status).json({error:{code,message}});
};
const id=(v:string|string[]|undefined)=>typeof v==='string'?v:'';
type Route=(req:Request,res:Response)=>Promise<void>;
const route=(fn:Route)=>(req:Request,res:Response,next:NextFunction)=>{fn(req,res).catch(next);};
const changed=(raw:string,patch:Record<string,unknown>)=>JSON.stringify({...JSON.parse(raw) as Record<string,unknown>,...patch});
const maxSort=async (rows:Promise<{sortOrder:number}|null>)=>(await rows)?.sortOrder??-1;
function assetName(name:string|null,kind:string){
  return name===null || /^[a-zA-Z0-9][\w.-]*$/.test(name)&&!name.includes('..')&&kind==='maps';
}
export function registerAtlasAdmin(app:Express,db:PrismaClient){
  const guard=requireAdmin(db);
  async function requireMap(name:string|null){
    if(!assetName(name,'maps'))return false;
    if(name===null)return true;
    return !!await db.mediaAsset.findUnique({where:{path:'maps/'+name}});
  }
  async function checkParent(worldId:string,parentId:string|null,editingId:string|null){
    if(parentId===null)return true;
    if(parentId===editingId)return false;
    const chain=new Set<string>(editingId?[editingId]:[]);
    let current:string|null=parentId;
    while(current){
      if(chain.has(current))return false;
      chain.add(current);
      const parent:{worldId:string;parentId:string|null}|null=await db.mapLayer.findUnique({where:{id:current},select:{worldId:true,parentId:true}});
      if(!parent||parent.worldId!==worldId)return false;
      current=parent.parentId;
    }
    return true;
  }
  app.post('/api/admin/worlds',guard,route(async(req,res)=>{
    const parsed=worldCreateSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Проверь название, размеры и параметры мира');return;}
    const data=parsed.data;
    if(!await requireMap(data.image)){fail(res,400,'BAD_ASSET','Изображение карты не найдено');return;}
    const order=1+await maxSort(db.world.findFirst({orderBy:{sortOrder:'desc'}}));
    const world=await db.world.create({data:{
      id:randomUUID(),name:data.name,sortOrder:order,image:data.image,
      width:data.width,height:data.height,kmPerPixel:data.kmPerPixel??null,
      raw:JSON.stringify({...data,locations:[],layers:[]}),
    }});
    res.status(201).json({id:world.id});
  }));
  app.patch('/api/admin/worlds/:id',guard,route(async(req,res)=>{
    const parsed=worldUpdateSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Некорректные поля мира');return;}
    const existing=await db.world.findUnique({where:{id:id(req.params.id)}});
    if(!existing){fail(res,404,'NOT_FOUND','Мир не найден');return;}
    const data=parsed.data;
    if(data.image!==undefined && !await requireMap(data.image)){
      fail(res,400,'BAD_ASSET','Изображение карты не найдено');return;
    }
    const patch:Record<string,unknown>={name:data.name};
    if(data.kmPerPixel!==undefined)patch.kmPerPixel=data.kmPerPixel;
    if(data.image!==undefined)patch.image=data.image;
    await db.world.update({where:{id:existing.id},data:{
      name:data.name,kmPerPixel:data.kmPerPixel===undefined?existing.kmPerPixel:data.kmPerPixel,
      image:data.image===undefined?existing.image:data.image,raw:changed(existing.raw,patch),
    }});
    res.json({ok:true});
  }));
  app.delete('/api/admin/worlds/:id',guard,route(async(req,res)=>{
    const existing=await db.world.findUnique({
      where:{id:id(req.params.id)},include:{_count:{select:{layers:true,locations:true,timelines:true}}}
    });
    if(!existing){fail(res,404,'NOT_FOUND','Мир не найден');return;}
    if(existing._count.layers||existing._count.locations||existing._count.timelines){
      fail(res,409,'HAS_CHILDREN','Сначала удалите карты, локации и таймлайны мира');return;
    }
    const backup=await createBackup(db);
    await db.world.delete({where:{id:existing.id}});
    res.json({ok:true,backup:backup.folder});
  }));
  app.post('/api/admin/types',guard,route(async(req,res)=>{
    const parsed=markerTypeInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Укажите название и символ типа');return;}
    const order=1+await maxSort(db.markerType.findFirst({orderBy:{sortOrder:'desc'}}));
    const t=await db.markerType.create({data:{
      id:randomUUID(),name:parsed.data.name,symbol:parsed.data.symbol,
      sortOrder:order,raw:JSON.stringify(parsed.data),
    }});
    res.status(201).json({id:t.id});
  }));
  app.patch('/api/admin/types/:id',guard,route(async(req,res)=>{
    const parsed=markerTypeInputSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Некорректный тип маркера');return;}
    const row=await db.markerType.findUnique({where:{id:id(req.params.id)}});
    if(!row){fail(res,404,'NOT_FOUND','Тип не найден');return;}
    await db.markerType.update({where:{id:row.id},data:{
      ...parsed.data,raw:changed(row.raw,parsed.data)
    }});
    res.json({ok:true});
  }));
  app.delete('/api/admin/types/:id',guard,route(async(req,res)=>{
    const row=await db.markerType.findUnique({where:{id:id(req.params.id)},include:{_count:{select:{locations:true}}}});
    if(!row){fail(res,404,'NOT_FOUND','Тип не найден');return;}
    if(row._count.locations){fail(res,409,'HAS_CHILDREN','Тип используется локациями');return;}
    const backup=await createBackup(db);
    await db.markerType.delete({where:{id:row.id}});
    res.json({ok:true,backup:backup.folder});
  }));
  app.post('/api/admin/layers',guard,route(async(req,res)=>{
    const parsed=layerCreateSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Неверные параметры карты-слоя');return;}
    const input=parsed.data;
    if(!await db.world.findUnique({where:{id:input.worldId}})){
      fail(res,404,'NOT_FOUND','Мир не найден');return;
    }
    if(!await requireMap(input.image)||!await checkParent(input.worldId,input.parentId,null)){
      fail(res,400,'INVALID_PARENT_OR_IMAGE','Неверная родительская карта или изображение');return;
    }
    const order=1+await maxSort(db.mapLayer.findFirst({where:{worldId:input.worldId},orderBy:{sortOrder:'desc'}}));
    const l=await db.mapLayer.create({data:{
      ...input,id:randomUUID(),sortOrder:order,bounds:JSON.stringify(input.bounds),raw:JSON.stringify(input),
    }});
    res.status(201).json({id:l.id});
  }));
  app.patch('/api/admin/layers/:id',guard,route(async(req,res)=>{
    const parsed=layerEditSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Неверные параметры карты');return;}
    const row=await db.mapLayer.findUnique({where:{id:id(req.params.id)}});
    if(!row){fail(res,404,'NOT_FOUND','Карта-слой не найдена');return;}
    const patch=parsed.data;
    if(!await checkParent(row.worldId,patch.parentId,row.id)){
      fail(res,400,'INVALID_PARENT','Родительская карта не найдена или образуется цикл');return;
    }
    await db.mapLayer.update({where:{id:row.id},data:{
      ...patch,bounds:JSON.stringify(patch.bounds),raw:changed(row.raw,patch),
    }});
    res.json({ok:true});
  }));
  app.delete('/api/admin/layers/:id',guard,route(async(req,res)=>{
    const row=await db.mapLayer.findUnique({where:{id:id(req.params.id)},include:{_count:{select:{children:true}}}});
    if(!row){fail(res,404,'NOT_FOUND','Карта не найдена');return;}
    if(row._count.children){fail(res,409,'HAS_CHILDREN','Удаление невозможно, у карты есть дочерние карты');return;}
    const backup=await createBackup(db);
    await db.mapLayer.delete({where:{id:row.id}});
    res.json({ok:true,backup:backup.folder});
  }));
  app.post('/api/admin/locations',guard,route(async(req,res)=>{
    const parsed=locationCreateSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Неверные поля локации');return;}
    const input=parsed.data;
    const [world,type]=await Promise.all([
      db.world.findUnique({where:{id:input.worldId}}),
      db.markerType.findUnique({where:{id:input.type}}),
    ]);
    if(!world||!type){fail(res,400,'INVALID_WORLD_OR_TYPE','Мир или тип маркера не найден');return;}
    const order=1+await maxSort(db.location.findFirst({where:{worldId:input.worldId},orderBy:{sortOrder:'desc'}}));
    const article=cleanArticle(input.article);
    const l=await db.location.create({data:{
      id:randomUUID(),worldId:input.worldId,typeId:input.type,name:input.name,x:input.x,y:input.y,
      color:input.color,minZoom:input.minZoom,description:input.description,article,
      tags:JSON.stringify(input.tags),sortOrder:order,
      raw:JSON.stringify({...input,article}),
    }});
    res.status(201).json({id:l.id});
  }));
  app.patch('/api/admin/locations/:id',guard,route(async(req,res)=>{
    const parsed=locationEditSchema.safeParse(req.body);
    if(!parsed.success){fail(res,400,'BAD_INPUT','Неверные поля локации');return;}
    const row=await db.location.findUnique({where:{id:id(req.params.id)}});
    if(!row){fail(res,404,'NOT_FOUND','Локация не найдена');return;}
    if(!await db.markerType.findUnique({where:{id:parsed.data.type}})){
      fail(res,400,'TYPE_NOT_FOUND','Тип маркера не найден');return;
    }
    const input={...parsed.data,article:cleanArticle(parsed.data.article)};
    await db.location.update({where:{id:row.id},data:{
      typeId:input.type,name:input.name,x:input.x,y:input.y,
      color:input.color,minZoom:input.minZoom,description:input.description,
      article:input.article,tags:JSON.stringify(input.tags),raw:changed(row.raw,input),
    }});
    res.json({ok:true});
  }));
  app.delete('/api/admin/locations/:id',guard,route(async(req,res)=>{
    const row=await db.location.findUnique({where:{id:id(req.params.id)},include:{_count:{select:{events:true}}}});
    if(!row){fail(res,404,'NOT_FOUND','Локация не найдена');return;}
    if(row._count.events){fail(res,409,'HAS_CHILDREN','Локация связана с историческими событиями');return;}
    const backup=await createBackup(db);
    await db.location.delete({where:{id:row.id}});
    res.json({ok:true,backup:backup.folder});
  }));
}
