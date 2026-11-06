'use strict';
// Safe v4 -> SQLite importer. Applies once, refuses destructive re-imports.
// The atlas.json and source images are read only. Use --backup-dir outside the repo.
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {audit}=require('./audit-legacy.cjs');
const {database,exportAtlas,hashFile,assertAssetIntegrity,root}=require('./legacy-db.cjs');

function argumentsOf(argv){
  const options={mode:'dry-run'};
  const valueFlags={'--input':'input','--assets-dir':'mapsDir','--media-dir':'mediaDir','--backup-dir':'backupDir'};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--dry-run'||arg==='--apply'||arg==='--verify'){
      if(options.mode!=='dry-run' && options.mode!==arg.substring(2)) throw Error('Выбери один режим: --dry-run, --apply или --verify');
      options.mode=arg.substring(2);continue;
    }
    if(arg==='--json'){options.json=true;continue;}
    if(arg==='--help'){options.help=true;continue;}
    if(!Object.hasOwn(valueFlags,arg)||!argv[i+1]) throw Error('Неизвестный или неполный аргумент: '+arg);
    options[valueFlags[arg]]=argv[++i];
  }
  if(options.mode==='apply' && !options.backupDir) throw Error('Для --apply обязателен --backup-dir ВНЕ репозитория (например, D:\\Projects\\TheAtlas-Backups)');
  return options;
}
function allIdsUnique(data){
  const seenWorlds=new Set(),seenLayers=new Set(),seenLocations=new Set(),seenTypes=new Set();
  for(const t of data.types){if(seenTypes.has(t.id))throw Error('Дублирующийся ID типа '+t.id);seenTypes.add(t.id);}
  for(const w of data.worlds){
    if(seenWorlds.has(w.id))throw Error('Дублирующийся ID мира '+w.id);seenWorlds.add(w.id);
    for(const l of w.layers){if(seenLayers.has(l.id))throw Error('Дублирующийся ID слоя '+l.id);seenLayers.add(l.id);}
    for(const loc of w.locations){if(seenLocations.has(loc.id))throw Error('Дублирующийся ID локации '+loc.id);seenLocations.add(loc.id);}
  }
}
function sourcePaths(options,report){
  const input=path.resolve(options.input||path.join(root,'data','atlas.json'));
  const project=path.dirname(path.dirname(input));
  const maps=path.resolve(options.mapsDir||path.join(project,'maps'));
  const media=path.resolve(options.mediaDir||path.join(project,'media'));
  return {input,project,maps,media};
}
async function backup(paths,report,dir,sqlitePath){
  const target=path.resolve(dir);
  if(target===root||target.startsWith(root+path.sep)) throw Error('Резервная копия должна находиться ВНЕ репозитория');
  const srcReal=await fsp.realpath(paths.project);
  await fsp.mkdir(target,{recursive:true});
  const backupRoot=await fsp.realpath(target);
  if(backupRoot===srcReal||srcReal.startsWith(backupRoot+path.sep)||backupRoot.startsWith(srcReal+path.sep))
    throw Error('Backup-dir не должен находиться внутри исходного проекта и наоборот');
  const folder=await fsp.mkdtemp(path.join(backupRoot,'atlas-v4-'));
  // Copy whole directories, not merely referenced files, so stray local media is also safe.
  try {
    for(const [source,label] of [[path.dirname(paths.input),'data'],[paths.maps,'maps'],[paths.media,'media']]){
      if(fs.existsSync(source)) await fsp.cp(source,path.join(folder,label),{recursive:true,force:false,errorOnExist:true});
    }
    if(sqlitePath && fs.existsSync(sqlitePath)) await fsp.copyFile(sqlitePath,path.join(folder,'database-before-import.db'));
    await fsp.writeFile(path.join(folder,'manifest.json'),JSON.stringify({
      sourceSha256:report.sourceSha256,counts:report.counts,
      assets:report.assets,originalInput:paths.input,createdAt:new Date().toISOString()
    },null,2));
    if(await hashFile(path.join(folder,'data','atlas.json'))!==report.sourceSha256)
      throw Error('Backup не совпадает с исходным JSON');
    for(const asset of report.assets){
      const stored=path.join(folder,asset.path);
      if(await hashFile(stored)!==asset.sha256) throw Error('Backup повреждён: '+asset.path);
    }
    return folder;
  }catch(err){throw Error('Backup не завершён в '+folder+': '+err.message);}
}
async function ensureAssets(report,paths){
  const destinationRoot=process.env.ATLAS_ASSETS_DIR ? path.resolve(process.env.ATLAS_ASSETS_DIR) : path.join(root,'storage','assets');
  const created=[];
  try {
    for(const asset of report.assets){
      const [folder,name]=asset.path.split('/');
      const source=path.join(paths[folder==='maps'?'maps':'media'],name);
      const dest=path.join(destinationRoot,folder,name);
      await fsp.mkdir(path.dirname(dest),{recursive:true});
      if(fs.existsSync(dest)){
        if(await hashFile(dest)!==asset.sha256) throw Error('Существующий storage asset отличается: '+asset.path);
        continue;
      }
      const temp=dest+'.tmp-'+crypto.randomUUID();
      try {
        await fsp.copyFile(source,temp,fs.constants.COPYFILE_EXCL);
        if(await hashFile(temp)!==asset.sha256) throw Error('Изображение изменилось при копировании: '+asset.path);
        // Exclusive link cannot overwrite another process's existing asset.
        try {await fsp.link(temp,dest);}
        catch(e){
          if(e.code!=='EEXIST'||await hashFile(dest)!==asset.sha256) throw e;
        }
        if(await hashFile(dest)!==asset.sha256) throw Error('SHA-256 не совпадает в storage: '+asset.path);
        created.push(dest);
      } finally {await fsp.rm(temp,{force:true});}
    }
    return created;
  }catch(e){
    for(const file of created.reverse()) await fsp.rm(file,{force:true});
    throw e;
  }
}
async function populate(tx,data,report){
  const extra=Object.fromEntries(Object.entries(data).filter(([key])=>!['version','worlds','types'].includes(key)));
  await tx.atlasDocument.create({data:{id:'legacy-v4',version:4,sourceSha256:report.sourceSha256,rootExtras:JSON.stringify(extra)}});
  for(const [i,t] of data.types.entries()) await tx.markerType.create({
    data:{id:t.id,name:t.name,symbol:t.symbol,sortOrder:i,raw:JSON.stringify(t)}
  });
  for(const [i,w] of data.worlds.entries()) {
    await tx.world.create({
      data:{id:w.id,name:w.name,image:w.image??null,width:w.width,height:w.height,
        kmPerPixel:w.kmPerPixel??null,sortOrder:i,raw:JSON.stringify(w)}
    });
    // Parent layers are inserted before descendants to preserve the FK constraint.
    const waiting=new Map(w.layers.map((l,index)=>[l.id,{layer:l,index}]));
    while(waiting.size){
      let advanced=false;
      for(const [id,entry] of waiting){
        const l=entry.layer;
        if(l.parentId && waiting.has(l.parentId)) continue;
        await tx.mapLayer.create({data:{
          id:l.id,worldId:w.id,parentId:l.parentId??null,name:l.name,image:l.image??null,
          width:l.width,height:l.height,bounds:JSON.stringify(l.bounds),rotation:l.rotation??0,
          showAtZoom:l.showAtZoom??1,fadeRange:l.fadeRange??0.75,enabled:l.enabled!==false,
          sortOrder:entry.index,raw:JSON.stringify(l)
        }});
        waiting.delete(id);advanced=true;
      }
      if(!advanced) throw Error('Не удалось упорядочить parentId слоёв мира '+w.id);
    }
    for(const [j,loc] of w.locations.entries()) await tx.location.create({data:{
      id:loc.id,worldId:w.id,typeId:loc.type,name:loc.name,x:loc.x,y:loc.y,
      color:loc.color??'#d6b77a',minZoom:loc.minZoom??-6,
      description:loc.description??'',article:loc.article??null,tags:JSON.stringify(loc.tags??[]),sortOrder:j,raw:JSON.stringify(loc)
    }});
  }
  for(const a of report.assets){
    const [folder,name]=a.path.split('/');
    await tx.mediaAsset.create({data:{
      path:a.path,filename:name,kind:folder,bytes:a.bytes,sha256:a.sha256,
      width:a.dimensions?.[0]??null,height:a.dimensions?.[1]??null,storedPath:a.path
    }});
  }
}
async function verify(db,data,report){
  const result=await exportAtlas(db);
  assert.deepStrictEqual(result,data,'Round-trip JSON не совпадает с исходным atlas.json');
  const count=await assertAssetIntegrity(db);
  assert.equal(count,report.assets.length,'Не все изображения учтены в БД');
  return {count,hash:report.sourceSha256};
}
async function execute(options){
  const paths=sourcePaths(options);
  const report=await audit({input:paths.input,mapsDir:paths.maps,mediaDir:paths.media});
  if(report.errors.length) throw Error('Аудит заблокировал импорт:\n'+report.errors.join('\n'));
  const data=JSON.parse(await fsp.readFile(paths.input,'utf8'));
  allIdsUnique(data);
  if(options.mode==='dry-run') return {status:'dry-run',report};
  const db=database();
  try {
    const doc=await db.atlasDocument.findUnique({where:{id:'legacy-v4'}});
    if(options.mode==='verify'){
      if(!doc||doc.sourceSha256!==report.sourceSha256) throw Error('База не импортирована из этого JSON');
      const result=await verify(db,data,report);
      return {status:'verified',...result};
    }
    if(doc){
      if(doc.sourceSha256!==report.sourceSha256) throw Error('База уже импортирована из другого JSON. Нельзя автоматически перезаписывать изменения.');
      const result=await verify(db,data,report);
      return {status:'already-imported',...result};
    }
    const [worldCount,typeCount,layerCount,locationCount]=await Promise.all([
      db.world.count(),db.markerType.count(),db.mapLayer.count(),db.location.count()
    ]);
    if(worldCount+typeCount+layerCount+locationCount>0||await db.mediaAsset.count())
      throw Error('База содержит данные без AtlasDocument. Автоматический импорт запрещён.');
    const backupDir=path.resolve(options.backupDir);
    const backupLocation=await backup(paths,report,backupDir,
      path.resolve(root,'apps','api','prisma',(process.env.DATABASE_URL||'file:../../../storage/atlas.db').slice(5)));
    // Source must not change between audit, backup and write.
    if(await hashFile(paths.input)!==report.sourceSha256) throw Error('Исходный JSON изменился после аудита');
    const created=await ensureAssets(report,paths);
    try {
      await db.$transaction(async tx=>{
        await populate(tx,data,report);
        const rebuilt=await exportAtlas(tx);
        assert.deepStrictEqual(rebuilt,data,'Импорт не прошёл round-trip внутри транзакции');
      },{timeout:30000});
      const result=await verify(db,data,report);
      return {status:'imported',backup:backupLocation,...result};
    }catch(e){
      for(const file of created.reverse()) await fsp.rm(file,{force:true});
      throw e;
    }
  }finally{await db.$disconnect();}
}
if(require.main===module)(async()=>{
  try{
    const options=argumentsOf(process.argv.slice(2));
    if(options.help){
      console.log('node scripts/import-legacy-atlas.cjs [--dry-run|--apply|--verify] [--backup-dir OUTSIDE_REPOSITORY] [--input data/atlas.json] [--assets-dir maps] [--media-dir media] [--json]');
      return;
    }
    const result=await execute(options);
    console.log(JSON.stringify(options.json?result:result.status==='dry-run'
      ?{status:result.status,counts:result.report.counts,errors:result.report.errors,sourceSha256:result.report.sourceSha256}
      :result,null,2));
  }catch(e){console.error('IMPORT ERROR: '+e.message);process.exitCode=1;}
})();
module.exports={execute,argumentsOf,allIdsUnique};
