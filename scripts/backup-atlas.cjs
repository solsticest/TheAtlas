'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env')});
process.env.DATABASE_URL ||= 'file:../../../storage/atlas.db';

function formatBytes(bytes){
  if(bytes>=1024**3)return (bytes/1024**3).toFixed(2)+' GB';
  if(bytes>=1024**2)return (bytes/1024**2).toFixed(2)+' MB';
  if(bytes>=1024)return (bytes/1024).toFixed(2)+' KB';
  return bytes+' B';
}
async function main(args){
  const {PrismaClient}=require('@prisma/client');
  const {createBackup,verifyBackup,pruneBackups,defaultBackups}=await import('../apps/api/src/backup.ts');
  let from=null,into=null,dir=null,mode='create',keepDatabase,keepFull;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--verify'){mode='verify';continue;}
    if(args[i]==='--restore'){mode='restore';continue;}
    if(args[i]==='--prune'){mode='prune';continue;}
    if(args[i]==='--from'&&args[i+1]){from=path.resolve(args[++i]);continue;}
    if(args[i]==='--into'&&args[i+1]){into=path.resolve(args[++i]);continue;}
    if(args[i]==='--backup-dir'&&args[i+1]){dir=path.resolve(args[++i]);continue;}
    if(args[i]==='--keep-db'&&args[i+1]){keepDatabase=Number(args[++i]);continue;}
    if(args[i]==='--keep-full'&&args[i+1]){keepFull=Number(args[++i]);continue;}
    throw Error('Unknown argument '+args[i]);
  }
  if(mode==='prune'){
    const target=dir??defaultBackups();
    const result=await pruneBackups(target,{keepDatabase,keepFull,includeLegacy:true});
    console.log(
      'BACKUPS PRUNED: snapshots removed '+result.removedSnapshots+
      ' ('+formatBytes(result.removedSnapshotBytes)+' logical); blobs removed '+
      result.removedBlobs+' ('+formatBytes(result.removedBlobBytes)+'); kept DB '+
      result.keptDatabase+', full '+result.keptFull
    );
    return;
  }
  if(mode==='verify'){
    if(!from)throw Error('--verify requires --from path');
    const manifest=await verifyBackup(from);
    const kind=manifest.format==='the-atlas-v1'?'full':manifest.kind;
    console.log('BACKUP VERIFIED: '+from+'; kind: '+kind+'; assets: '+manifest.assets.length);return;
  }
  if(mode==='restore'){
    if(!from||!into)throw Error('--restore requires --from and --into (new empty folder)');
    const manifest=await verifyBackup(from);
    const kind=manifest.format==='the-atlas-v1'?'full':manifest.kind;
    await fs.mkdir(into,{recursive:false});
    try{
      await fs.copyFile(path.join(from,'atlas.db'),path.join(into,'atlas.db'));
      if(kind==='full'){
        await fs.cp(path.join(from,'assets'),path.join(into,'assets'),{
          recursive:true,errorOnExist:true,force:false,
        });
      }
      console.log('RESTORED INTO: '+into+'. Kind: '+kind+'. Original Atlas was not changed.');
    }catch(e){await fs.rm(into,{recursive:true,force:true});throw e;}
    return;
  }
  const db=new PrismaClient();
  try{
    // Manual backup is intentionally full. Automatic pre-write backups created
    // by the API are DB-only and retained separately.
    const result=await createBackup(db,dir??undefined,{kind:'full'});
    await verifyBackup(result.folder);
    console.log('FULL BACKUP CREATED & VERIFIED: '+result.folder+'; assets: '+result.manifest.assets.length);
  }finally{await db.$disconnect();}
}
main(process.argv.slice(2)).catch(e=>{console.error('BACKUP ERROR: '+e.message);process.exitCode=1;});
