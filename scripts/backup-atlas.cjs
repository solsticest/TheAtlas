'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env')});
process.env.DATABASE_URL ||= 'file:../../../storage/atlas.db';

async function main(args){
  const {PrismaClient}=require('@prisma/client');
  const {createBackup,verifyBackup}=await import('../apps/api/src/backup.ts');
  let from=null,into=null,dir=null,mode='create';
  for(let i=0;i<args.length;i++){
    if(args[i]==='--verify'){mode='verify';continue;}
    if(args[i]==='--restore'){mode='restore';continue;}
    if(args[i]==='--from'&&args[i+1]){from=path.resolve(args[++i]);continue;}
    if(args[i]==='--into'&&args[i+1]){into=path.resolve(args[++i]);continue;}
    if(args[i]==='--backup-dir'&&args[i+1]){dir=path.resolve(args[++i]);continue;}
    throw Error('Unknown argument '+args[i]);
  }
  if(mode==='verify'){
    if(!from)throw Error('--verify requires --from path');
    const manifest=await verifyBackup(from);
    console.log('BACKUP VERIFIED: '+from+'; assets: '+manifest.assets.length);return;
  }
  if(mode==='restore'){
    if(!from||!into)throw Error('--restore requires --from and --into (new empty folder)');
    await verifyBackup(from);
    // Never overwrite the active project, any existing DB or even an empty folder.
    await fs.mkdir(into,{recursive:false});
    try{
      await fs.copyFile(path.join(from,'atlas.db'),path.join(into,'atlas.db'));
      try{await fs.cp(path.join(from,'assets'),path.join(into,'assets'),{recursive:true,errorOnExist:true,force:false});}
      catch(e){if(e.code!=='ENOENT')throw e;}
      console.log('RESTORED INTO: '+into+'. Original Atlas was not changed.');
    }catch(e){await fs.rm(into,{recursive:true,force:true});throw e;}
    return;
  }
  const db=new PrismaClient();
  try{
    const result=await createBackup(db,dir??undefined);
    await verifyBackup(result.folder);
    console.log('BACKUP CREATED & VERIFIED: '+result.folder+'; assets: '+result.manifest.assets.length);
  }finally{await db.$disconnect();}
}
main(process.argv.slice(2)).catch(e=>{console.error('BACKUP ERROR: '+e.message);process.exitCode=1;});
