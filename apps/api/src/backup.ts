import { createHash } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';

// This file is also imported directly by scripts/backup-atlas.cjs in a clean
// subprocess (without a compiled server). Keep its path resolution self-contained.
const projectRoot=fileURLToPath(new URL('../../../',import.meta.url));
const atlasAssetsDir=()=>path.resolve(
  process.env.ATLAS_ASSETS_DIR||path.join(projectRoot,'storage','assets')
);
export const defaultBackups=()=>path.resolve(
  process.env.ATLAS_BACKUP_DIR||path.join(projectRoot,'storage','backups')
);

type AssetRecord={path:string;bytes:number;sha256:string};
export type BackupKind='database'|'full';
export type BackupManifest={
  format:'the-atlas-v2';
  kind:BackupKind;
  createdAt:string;
  database:{bytes:number;sha256:string};
  assets:AssetRecord[];
};
type LegacyManifest={
  format:'the-atlas-v1';
  createdAt?:string;
  database:{bytes:number;sha256:string};
  assets:AssetRecord[];
};
type AnyManifest=BackupManifest|LegacyManifest;
export type BackupOptions={
  kind?:BackupKind;
  prune?:boolean;
};
export type PruneOptions={
  keepDatabase?:number;
  keepFull?:number;
  includeLegacy?:boolean;
};

const DEFAULT_DB_KEEP=30;
const DEFAULT_FULL_KEEP=2;
let backupQueue:Promise<void>=Promise.resolve();

async function sha256(file:string):Promise<string>{
  const hasher=createHash('sha256');
  for await(const chunk of createReadStream(file))hasher.update(chunk);
  return hasher.digest('hex');
}
async function fileManifest(dir:string):Promise<AssetRecord[]>{
  const records:AssetRecord[]=[];
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
async function fileBytes(root:string){
  let total=0;
  async function walk(current:string){
    for(const entry of await fs.readdir(current,{withFileTypes:true})){
      const target=path.join(current,entry.name);
      if(entry.isDirectory())await walk(target);
      else if(entry.isFile())total+=(await fs.stat(target)).size;
    }
  }
  try{await walk(root);}catch(e){
    if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
  }
  return total;
}
async function readManifest(folder:string):Promise<AnyManifest|null>{
  try{return JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8')) as AnyManifest;}
  catch{return null;}
}
function manifestKind(manifest:AnyManifest):BackupKind{
  return manifest.format==='the-atlas-v1'?'full':manifest.kind;
}
function assetStoreRoot(backupRoot:string){
  return path.join(backupRoot,'.asset-store');
}
function assetBlobPath(backupRoot:string,hash:string){
  return path.join(assetStoreRoot(backupRoot),hash.slice(0,2),hash);
}
async function ensureAssetBlob(backupRoot:string,source:string,record:AssetRecord){
  const blob=assetBlobPath(backupRoot,record.sha256);
  try{
    const stat=await fs.stat(blob);
    if(stat.size===record.bytes)return blob;
    await fs.rm(blob,{force:true});
  }catch(e){
    if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
  }
  await fs.mkdir(path.dirname(blob),{recursive:true});
  const temp=blob+'.tmp-'+process.pid+'-'+Date.now();
  try{
    await fs.copyFile(source,temp);
    const stat=await fs.stat(temp);
    if(stat.size!==record.bytes||await sha256(temp)!==record.sha256)
      throw Error('Asset changed while backing up: '+record.path);
    try{await fs.rename(temp,blob);}
    catch(e){
      if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
      await fs.rm(temp,{force:true});
    }
  }catch(e){
    await fs.rm(temp,{force:true});
    throw e;
  }
  return blob;
}
async function materializeAssets(
  backupRoot:string,snapshotFolder:string,sourceRoot:string,records:AssetRecord[],
){
  for(const record of records){
    const source=path.join(sourceRoot,...record.path.split('/'));
    const blob=await ensureAssetBlob(backupRoot,source,record);
    const destination=path.join(snapshotFolder,'assets',...record.path.split('/'));
    await fs.mkdir(path.dirname(destination),{recursive:true});
    try{
      // On the normal local layout backupRoot and storage/assets are on the
      // same volume. Hard links make every full snapshot self-contained while
      // identical files consume disk blocks only once.
      await fs.link(blob,destination);
    }catch(e){
      const code=(e as NodeJS.ErrnoException).code;
      if(!['EXDEV','EPERM','EACCES','ENOTSUP'].includes(code??''))throw e;
      await fs.copyFile(blob,destination);
    }
  }
}
async function pruneAssetStore(backupRoot:string,referenced:Set<string>){
  const store=assetStoreRoot(backupRoot);
  let removedBlobs=0,removedBlobBytes=0;
  try{
    for(const prefix of await fs.readdir(store,{withFileTypes:true})){
      if(!prefix.isDirectory())continue;
      const dir=path.join(store,prefix.name);
      for(const entry of await fs.readdir(dir,{withFileTypes:true})){
        if(!entry.isFile())continue;
        if(referenced.has(entry.name))continue;
        const target=path.join(dir,entry.name);
        removedBlobBytes+=(await fs.stat(target)).size;
        await fs.rm(target,{force:true});
        removedBlobs++;
      }
      if(!(await fs.readdir(dir)).length)await fs.rmdir(dir);
    }
  }catch(e){
    if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
  }
  return {removedBlobs,removedBlobBytes};
}
function keepCount(value:number|undefined,fallback:number){
  if(value===undefined)return fallback;
  return Math.max(0,Math.floor(value));
}

export async function pruneBackups(backupDir=defaultBackups(),options:PruneOptions={}){
  const root=path.resolve(backupDir);
  await fs.mkdir(root,{recursive:true});
  const keepDatabase=keepCount(options.keepDatabase,DEFAULT_DB_KEEP);
  const keepFull=keepCount(options.keepFull,DEFAULT_FULL_KEEP);
  const includeLegacy=options.includeLegacy??false;
  const entries:{folder:string;name:string;manifest:AnyManifest;time:number;legacy:boolean}[]=[];
  for(const entry of await fs.readdir(root,{withFileTypes:true})){
    if(!entry.isDirectory()||!entry.name.startsWith('atlas-snapshot-'))continue;
    const folder=path.join(root,entry.name),manifest=await readManifest(folder);
    if(!manifest||!['the-atlas-v1','the-atlas-v2'].includes(manifest.format))continue;
    const stat=await fs.stat(folder);
    const parsed=manifest.createdAt?Date.parse(manifest.createdAt):NaN;
    entries.push({
      folder,name:entry.name,manifest,
      time:Number.isFinite(parsed)?parsed:stat.mtimeMs,
      legacy:manifest.format==='the-atlas-v1',
    });
  }
  entries.sort((a,b)=>b.time-a.time);
  const database=entries.filter(item=>manifestKind(item.manifest)==='database');
  const full=entries.filter(item=>manifestKind(item.manifest)==='full'&&(includeLegacy||!item.legacy));
  const remove=[
    ...database.slice(keepDatabase),
    ...full.slice(keepFull),
  ];
  const removeNames=new Set(remove.map(item=>item.name));
  let removedSnapshots=0,removedSnapshotBytes=0;
  for(const item of remove){
    removedSnapshotBytes+=await fileBytes(item.folder);
    await fs.rm(item.folder,{recursive:true,force:true});
    removedSnapshots++;
  }

  // Keep the dedupe store aligned with all surviving v2 full manifests.
  const referenced=new Set<string>();
  for(const item of entries){
    if(removeNames.has(item.name)||item.manifest.format!=='the-atlas-v2'||item.manifest.kind!=='full')continue;
    for(const asset of item.manifest.assets)referenced.add(asset.sha256);
  }
  const blobs=await pruneAssetStore(root,referenced);
  return {
    removedSnapshots,removedSnapshotBytes,
    removedBlobs:blobs.removedBlobs,removedBlobBytes:blobs.removedBlobBytes,
    keptDatabase:database.length-Math.max(0,database.length-keepDatabase),
    keptFull:entries.filter(item=>manifestKind(item.manifest)==='full'&&!removeNames.has(item.name)).length,
  };
}

async function createBackupInternal(
  db:PrismaClient,backupDir:string,options:BackupOptions,
){
  const safeRoot=path.resolve(backupDir);
  await fs.mkdir(safeRoot,{recursive:true});
  const folder=await fs.mkdtemp(path.join(safeRoot,'atlas-snapshot-'));
  const dbPath=path.join(folder,'atlas.db');
  const kind=options.kind??'database';
  try{
    // SQLite VACUUM INTO creates a consistent copy even in WAL mode.
    const sqlitePath=dbPath.replace(/\\/g,'/').replace(/'/g,"''");
    await db.$executeRawUnsafe("VACUUM INTO '"+sqlitePath+"'");

    let assets:AssetRecord[]=[];
    if(kind==='full'){
      const source=atlasAssetsDir();
      assets=await fileManifest(source);
      const registered=await db.mediaAsset.findMany({select:{path:true,bytes:true,sha256:true}});
      const byPath=new Map(assets.map(item=>[item.path,item]));
      for(const asset of registered){
        const sourceAsset=byPath.get(asset.path);
        if(!sourceAsset||sourceAsset.bytes!==asset.bytes||sourceAsset.sha256!==asset.sha256)
          throw Error('Cannot create complete Atlas backup: missing or corrupt '+asset.path);
      }
      await materializeAssets(safeRoot,folder,source,assets);
    }

    const manifest:BackupManifest={
      format:'the-atlas-v2',kind,createdAt:new Date().toISOString(),
      database:{bytes:(await fs.stat(dbPath)).size,sha256:await sha256(dbPath)},
      assets,
    };
    await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
    if(options.prune!==false)await pruneBackups(safeRoot,{includeLegacy:false});
    return {folder,manifest};
  }catch(e){
    await fs.rm(folder,{recursive:true,force:true});
    throw e;
  }
}

export function createBackup(
  db:PrismaClient,backupDir=defaultBackups(),options:BackupOptions={},
){
  const task=()=>createBackupInternal(db,backupDir,options);
  const run=backupQueue.then(task,task);
  backupQueue=run.then(()=>undefined,()=>undefined);
  return run;
}

export async function verifyBackup(folder:string){
  const source=path.resolve(folder);
  const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8')) as AnyManifest;
  if(!['the-atlas-v1','the-atlas-v2'].includes(manifest.format))throw Error('Unsupported backup format');
  const file=path.join(source,'atlas.db');
  const stat=await fs.stat(file);
  if(stat.size!==manifest.database.bytes||await sha256(file)!==manifest.database.sha256)
    throw Error('SQLite backup SHA-256 mismatch');
  const kind=manifestKind(manifest);
  if(kind==='full'){
    const assets=await fileManifest(path.join(source,'assets'));
    if(JSON.stringify(assets)!==JSON.stringify(manifest.assets))
      throw Error('Asset file list or checksum mismatch');
  }else if(manifest.assets.length){
    throw Error('Database-only backup must not contain asset records');
  }
  return manifest;
}
