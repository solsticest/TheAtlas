import { createHash } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { atlasAssetsDir, atlasBackupDir } from './paths.js';

export const defaultBackups=atlasBackupDir;
async function sha256(file:string):Promise<string>{
  const hasher=createHash('sha256');
  for await(const chunk of createReadStream(file))hasher.update(chunk);
  return hasher.digest('hex');
}
async function fileManifest(dir:string):Promise<{path:string;bytes:number;sha256:string}[]>{
  const records:{path:string;bytes:number;sha256:string}[]=[];
  async function walk(current:string,relative:string){
    for(const entry of await fs.readdir(current,{withFileTypes:true})){
      const name=path.join(current,entry.name),rel=path.join(relative,entry.name);
      if(entry.isSymbolicLink())throw Error('Symlinks forbidden in backup asset store: '+rel);
      if(entry.isDirectory())await walk(name,rel);
      else if(entry.isFile())records.push({
        path:rel.replace(/\\/g,'/'),bytes:(await fs.stat(name)).size,sha256:await sha256(name),
      });
    }
  }
  try{await walk(dir,'');}catch(e){
    if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
  }
  records.sort((a,b)=>a.path.localeCompare(b.path));
  return records;
}

export async function createBackup(db:PrismaClient,backupDir=defaultBackups()){
  const safeRoot=path.resolve(backupDir);
  await fs.mkdir(safeRoot,{recursive:true});
  const folder=await fs.mkdtemp(path.join(safeRoot,'atlas-snapshot-'));
  const dbPath=path.join(folder,'atlas.db');
  try{
    // SQLite VACUUM INTO creates a consistent copy even in WAL mode.
    // The destination is a newly generated file, never an existing DB.
    const sqlitePath=dbPath.replace(/\\/g,'/').replace(/'/g,"''");
    await db.$executeRawUnsafe("VACUUM INTO '"+sqlitePath+"'");
    const assets=atlasAssetsDir();
    const output=path.join(folder,'assets');
    try{await fs.cp(assets,output,{recursive:true,errorOnExist:true,force:false});}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    const files=await fileManifest(output);
    const copiedByPath=new Map(files.map(item=>[item.path,item]));
    const registered=await db.mediaAsset.findMany({
      select:{path:true,bytes:true,sha256:true},
    });
    for(const asset of registered){
      const copy=copiedByPath.get(asset.path);
      if(!copy||copy.bytes!==asset.bytes||copy.sha256!==asset.sha256){
        throw Error('Cannot create complete Atlas backup: missing or corrupt '+asset.path);
      }
    }
    const manifest={
      format:'the-atlas-v1',createdAt:new Date().toISOString(),
      database:{bytes:(await fs.stat(dbPath)).size,sha256:await sha256(dbPath)},
      assets:files,
    };
    await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
    return {folder,manifest};
  }catch(e){
    // Never claim a partly written snapshot to be restorable.
    await fs.rm(folder,{recursive:true,force:true});
    throw e;
  }
}
export async function verifyBackup(folder:string){
  const source=path.resolve(folder);
  const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8')) as {
    format:string;database:{bytes:number;sha256:string};assets:{path:string;bytes:number;sha256:string}[]
  };
  if(manifest.format!=='the-atlas-v1')throw Error('Unsupported backup format');
  const file=path.join(source,'atlas.db');
  const stat=await fs.stat(file);
  if(stat.size!==manifest.database.bytes||await sha256(file)!==manifest.database.sha256)
    throw Error('SQLite backup SHA-256 mismatch');
  const assets=await fileManifest(path.join(source,'assets'));
  if(JSON.stringify(assets)!==JSON.stringify(manifest.assets))
    throw Error('Asset file list or checksum mismatch');
  return manifest;
}
