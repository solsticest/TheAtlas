'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const { spawnSync }=require('node:child_process');
const { PrismaClient }=require('@prisma/client');
const root=path.resolve(__dirname,'..');

test('Viewer API serves imported Atlas without write permissions or precision loss', async () => {
  const temp=fs.mkdtempSync(path.join(root,'storage','api-test-'));
  const backup=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-api-backup-'));
  const dbFile=path.join(temp,'atlas.db');
  const rel=path.relative(path.join(root,'apps/api/prisma'),dbFile).split(path.sep).join('/');
  const env={...process.env,DATABASE_URL:'file:'+rel,ATLAS_ASSETS_DIR:path.join(temp,'assets')};
  const spawn=(script,args=[])=>{
    const child=spawnSync(process.execPath,[path.join(root,script),...args],{
      cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:10*1024*1024
    });
    assert.equal(child.status,0,script+'\n'+child.stdout+'\n'+child.stderr);
  };
  let httpServer=null;
  let prisma=null;
  try {
    spawn('scripts/db-setup.cjs');
    spawn('scripts/import-legacy-atlas.cjs',['--apply','--backup-dir',backup]);
    process.env.DATABASE_URL=env.DATABASE_URL;
    process.env.ATLAS_ASSETS_DIR=env.ATLAS_ASSETS_DIR;
    const { createApp }=await import('../apps/api/src/app.ts');
    prisma=new PrismaClient();
    const app=createApp(prisma);
    httpServer=await new Promise(resolve=>{
      const server=app.listen(0,'127.0.0.1',()=>resolve(server));
    });
    const address=httpServer.address();
    assert(address && typeof address!=='string');
    const base='http://127.0.0.1:'+address.port;
    const call=(route,options)=>fetch(base+route,options);
    const health=await call('/api/health');
    assert.equal(health.status,200);
    assert.equal((await health.json()).ok,true);
    const worldResponse=await call('/api/worlds');
    assert.equal(worldResponse.status,200);
    const worlds=await worldResponse.json();
    assert.equal(worlds.length,2);
    assert.equal(worlds[1].name,'Элдран');
    const types=await(await call('/api/types')).json();
    assert.equal(types.length,7);
    const id=worlds[1].id;
    const layers=await(await call('/api/worlds/'+id+'/layers')).json();
    assert.equal(layers.length,2);
    assert.equal(layers[1].parentId,layers[0].id);
    const source=JSON.parse(fs.readFileSync(path.join(root,'data','atlas.json'),'utf8'));
    assert.deepEqual(layers[1].bounds,source.worlds[1].layers[1].bounds);
    assert.equal(layers[1].showAtZoom,4.0310122895601825);
    const locations=await(await call('/api/worlds/'+id+'/locations')).json();
    assert.equal(locations.length,2);
    const estara=locations.find(x=>x.name==='Эстара');
    assert(estara);
    assert.deepEqual(estara.tags,['столица','эльмарийская империя','крупный город','синдикат']);
    assert.equal(estara.y,1808.12817291269);
    assert.match(estara.article,/data-world/);
    const find=await(await call('/api/search?q='+encodeURIComponent('синдикат'))).json();
    assert(find.some(x=>x.id===estara.id && x.kind==='location'));
    const badSearch=await call('/api/search?q='+'a'.repeat(151));
    assert.equal(badSearch.status,400);
    const image=await call('/api/assets/maps/'+encodeURIComponent(worlds[1].image));
    assert.equal(image.status,200);
    assert.equal((await image.arrayBuffer()).byteLength,13692391);
    assert.equal((await call('/api/assets/maps/'+encodeURIComponent('../secrets'))).status,400);
    assert.equal((await call('/api/locations/nonexistent')).status,404);
    const mutation=await call('/api/worlds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'hacked'})});
    assert.equal(mutation.status,404);
    assert.equal((await(await call('/api/worlds')).json()).length,2);
  } finally {
    if(httpServer) await new Promise(resolve=>httpServer.close(resolve));
    if(prisma) await prisma.$disconnect();
    fs.rmSync(temp,{recursive:true,force:true});
    fs.rmSync(backup,{recursive:true,force:true});
  }
});
