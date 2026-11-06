'use strict';
// Helpers for one-way legacy v4 import and round-trip verification.
const {PrismaClient}=require('@prisma/client');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env'),quiet:true});
process.env.DATABASE_URL ||= 'file:../../../storage/atlas.db';
function database(){return new PrismaClient();}
const hashFile=async file=>{
  const hash=crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
async function exportAtlas(db){
  const doc=await db.atlasDocument.findUnique({where:{id:'legacy-v4'}});
  if(!doc) throw Error('База пока не содержит импортированного Atlas v4');
  const [types,worlds,layers,locations]=await Promise.all([
    db.markerType.findMany({orderBy:{sortOrder:'asc'}}),
    db.world.findMany({orderBy:{sortOrder:'asc'}}),
    db.mapLayer.findMany({orderBy:[{worldId:'asc'},{sortOrder:'asc'}]}),
    db.location.findMany({orderBy:[{worldId:'asc'},{sortOrder:'asc'}]})
  ]);
  const byWorld=(rows,id)=>rows.filter(item=>item.worldId===id).sort((a,b)=>a.sortOrder-b.sortOrder).map(item=>JSON.parse(item.raw));
  return {...JSON.parse(doc.rootExtras),version:doc.version,types:types.map(t=>JSON.parse(t.raw)),worlds:worlds.map(w=>({...JSON.parse(w.raw),layers:byWorld(layers,w.id),locations:byWorld(locations,w.id)}))};
}
async function assertAssetIntegrity(db){
  const rows=await db.mediaAsset.findMany({orderBy:{path:'asc'}});
  for(const item of rows){
    const assetRoot=process.env.ATLAS_ASSETS_DIR ? path.resolve(process.env.ATLAS_ASSETS_DIR) : path.join(root,'storage','assets');
    const file=path.join(assetRoot,item.path);
    const digest=await hashFile(file);
    if(digest!==item.sha256) throw Error('Несовпадение SHA-256 файла после миграции: '+item.path);
  }
  return rows.length;
}
module.exports={database,exportAtlas,hashFile,assertAssetIntegrity,root};
