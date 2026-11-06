import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { requireAdmin } from './auth.js';

const MAX_BYTES=40*1024*1024;
type ImageResult={extension:string;width:number|null;height:number|null};
export function classifyImage(b:Buffer):ImageResult|null {
  if(b.length>=24&&b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))){
    const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
    if(width&&height&&width<=100000&&height<=100000)return {extension:'png',width,height};
  }
  if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
    const type=b.toString('ascii',12,16);
    let width:null|number=null,height:null|number=null;
    if(type==='VP8X'){
      width=1+b.readUIntLE(24,3);
      height=1+b.readUIntLE(27,3);
    }else if(type==='VP8L'&&b[20]===0x2f){
      width=1+(b[21]!|((b[22]!&63)<<8));
      height=1+(((b[22]!&192)>>6)|(b[23]!<<2)|((b[24]!&15)<<10));
    }else if(type==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42){
      width=b.readUInt16LE(26)&16383;
      height=b.readUInt16LE(28)&16383;
    }
    if(width&&height&&width<=100000&&height<=100000)return {extension:'webp',width,height};
  }
  if(b.length>=10&&b[0]===255&&b[1]===216&&b[2]===255){
    // JPEG is decoded by the browser; dimensions must be entered by the editor.
    return {extension:'jpg',width:null,height:null};
  }
  return null;
}
export function registerUploads(app:Express,db:PrismaClient){
  app.post('/api/admin/assets/:kind',requireAdmin(db),
    express.raw({type:'application/octet-stream',limit:MAX_BYTES}),async(req,res,next)=>{
      try{
        const kind=req.params.kind;
        if(kind!=='maps'&&kind!=='media'){
          res.status(400).json({error:{code:'BAD_KIND',message:'Допустимы только maps и media'}});return;
        }
        if(!Buffer.isBuffer(req.body)||!req.body.length){
          res.status(400).json({error:{code:'EMPTY_FILE',message:'Нужен двоичный файл'}});return;
        }
        const buffer=req.body as Buffer;
        const info=classifyImage(buffer);
        if(!info){
          res.status(415).json({error:{code:'BAD_IMAGE',message:'Разрешены PNG, WebP и JPEG с корректной сигнатурой'}});return;
        }
        const name=randomUUID()+'.'+info.extension;
        const key=kind+'/'+name;
        const assetsDir=path.resolve(process.env.ATLAS_ASSETS_DIR??path.join(process.cwd(),'storage','assets'));
        const targetDir=path.join(assetsDir,kind);
        await fs.mkdir(targetDir,{recursive:true});
        const target=path.join(targetDir,name);
        const sha256=createHash('sha256').update(buffer).digest('hex');
        let stored=false;
        try{
          const file=await fs.open(target,'wx',0o600);
          stored=true;
          try{await file.writeFile(buffer);await file.sync();}finally{await file.close();}
          await db.mediaAsset.create({data:{
            path:key,filename:name,kind,bytes:buffer.length,sha256,
            width:info.width,height:info.height,storedPath:key
          }});
        }catch(e){
          if(stored)await fs.rm(target,{force:true});
          throw e;
        }
        await db.atlasDocument.updateMany({data:{isModified:true}});
        res.status(201).json({path:key,filename:name,width:info.width,height:info.height,sha256});
      }catch(e){next(e);}
    });
}
