/* Controlled IndexedDB / directory-handle simulation. No browser permissions,
   network access or real file writes. Runs the actual preference and loader code. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const v4=fs.readFileSync(path.join(root,'js/atlas-v4.js'),'utf8');
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const loader=v4.slice(v4.indexOf('async function connectAtlasProject('),v4.indexOf('async function saveAtlasProject('));
const normalize=app.slice(app.indexOf('function normalize(candidate='),app.indexOf('\nnormalize();'));
const source=fs.readFileSync(path.join(root,'js/main-folder.js'),'utf8');
const key='main-folder:/atlas/index.html';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function database(){
  const records=new Map();
  return {records,open(){
    const request={};queueMicrotask(()=>{
      const db={objectStoreNames:{contains:()=>true},close(){},transaction(){
        const tx={error:null,abort(){tx.error=Error('Aborted');queueMicrotask(()=>tx.onabort?.());},objectStore(){
          const operate=(kind,k,value)=>{
            const entry={};queueMicrotask(async()=>{
              if(kind==='get'&&records.delay)await records.delay;
              if(records.fail){tx.error=Error('Storage unavailable');tx.onabort?.();return;}
              if(kind==='put')records.set(k,value);if(kind==='delete')records.delete(k);
              entry.result=kind==='get'?records.get(k):undefined;entry.onsuccess?.();tx.oncomplete?.();
            });return entry;
          };
          return {get:k=>operate('get',k),put:(v,k)=>operate('put',k,v),delete:k=>operate('delete',k)};
        }};return tx;
      }};
      request.result=db;request.onsuccess?.();
    });return request;
  }};
}
function directory(name='Main'){
  return {kind:'directory',name,permission:'granted',requests:0,reads:0,raw:JSON.stringify({version:3,worlds:[{id:name,name,locations:[],layers:[]}]}),
    async queryPermission(){if(this.queryFailure)throw Error('Permission revoked');return this.permission;},
    async requestPermission(){this.requests++;return this.permission;},
  };
}
function environment(db=database(),pathname='/atlas/index.html'){
  const nodes=new Map(),messages=[],alerts=[];
  const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:['reconnectMainFolder','forgetMainFolder'].includes(id),disabled:false});return nodes.get(id);};
  const c=vm.createContext({console,$,confirm:()=>true,alert:m=>alerts.push(m),indexedDB:db,location:{pathname},defaultTypes:[{id:'city',symbol:'🏘'}],structuredClone,uid:()=> 'generated-id',cleanNum:v=>Number.isFinite(Number(v))?Number(v):0,
    status:m=>messages.push(m),syncArticle(){},beforeAtlasHistory(){},clearAssetUrls(){},setTab(){},render(){},resetUndo(){},
    async readDiskJSON(handle){handle.reads++;if(handle.readDelay)await handle.readDelay;return handle.raw;},
    showDirectoryPicker:async()=>{throw Error('Unexpected picker');},
  });c.window=c;
  vm.runInContext(`let savingProject=false,dirty=false,folder=null,folderOpenGeneration=0,projectGeneration=0,worldId='demo',viewingAtlas=false,imageJobs=0;
    let data={worlds:[{id:'demo',name:'Demo'}]},diskBaseline=null,selectedRegionId=null,selectedMarker=null;
    const hiddenTypes=new Set(),pendingFiles=new Map();`,c);
  vm.runInContext(normalize+'\n'+loader,c);vm.runInContext(source,c);
  return {c,nodes,messages,alerts,db,run:s=>vm.runInContext(s,c),ready:vm.runInContext('AtlasMainFolder.ready',c)};
}
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{
  await test('first launch keeps demo and never opens a picker',async()=>{
    const e=environment();await e.ready;assert.equal(e.run('folder'),null);assert.equal(e.nodes.get('forgetMainFolder').hidden,true);
  });
  await test('choose remembers the directory; next launch automatically opens it',async()=>{
    const db=database(),handle=directory(),e=environment(db);await e.ready;let pickers=0;e.c.showDirectoryPicker=async()=>{pickers++;return handle;};
    await e.nodes.get('setMainFolder').onclick();assert.equal(db.records.get(key),handle);assert.equal(e.run('folder'),handle);assert.equal(pickers,1);
    const next=environment(db);await next.ready;assert.equal(next.run('worldId'),'Main');assert.equal(next.run('diskBaseline'),handle.raw);assert.equal(handle.requests,0);assert.equal(next.run('dirty'),false);
  });
  await test('startup never prompts when browser permission was reset',async()=>{
    const db=database(),handle=directory();handle.permission='prompt';db.records.set(key,handle);const e=environment(db);await e.ready;
    assert.equal(handle.requests,0);assert.equal(handle.reads,0);assert.equal(e.run('folder'),null);assert.equal(e.nodes.get('reconnectMainFolder').hidden,false);
    handle.permission='denied';await e.nodes.get('reconnectMainFolder').onclick();assert.equal(e.run('folder'),null);assert.equal(e.nodes.get('reconnectMainFolder').hidden,false);
    handle.permission='granted';await e.nodes.get('reconnectMainFolder').onclick();assert.equal(handle.requests,2);assert.equal(e.run('folder'),handle);assert.equal(e.nodes.get('reconnectMainFolder').hidden,true);
  });
  await test('forget removes preference without closing project or deleting files',async()=>{
    const db=database(),handle=directory();db.records.set(key,handle);const e=environment(db);await e.ready;const raw=handle.raw;
    await e.nodes.get('forgetMainFolder').onclick();assert.equal(db.records.has(key),false);assert.equal(e.run('folder'),handle);assert.equal(handle.raw,raw);
    const next=environment(db);await next.ready;assert.equal(next.run('folder'),null);
  });
  await test('cancelled picker retains the previous main folder',async()=>{
    const db=database(),handle=directory();db.records.set(key,handle);const e=environment(db);await e.ready;
    e.c.showDirectoryPicker=async()=>{throw Object.assign(Error('Cancelled'),{name:'AbortError'});};await e.nodes.get('setMainFolder').onclick();assert.equal(db.records.get(key),handle);assert.equal(e.run('folder'),handle);assert.equal(e.alerts.length,0);
  });
  await test('folder without atlas.json is rejected, not replaced with demo',async()=>{
    const e=environment();await e.ready;const handle=directory();handle.raw=null;e.c.showDirectoryPicker=async()=>handle;
    await e.nodes.get('setMainFolder').onclick();assert.equal(e.run('folder'),null);assert.equal(e.db.records.has(key),false);assert.ok(e.alerts[0].includes('atlas.json'));
  });
  await test('broken saved JSON leaves demo intact and offers reconnect',async()=>{
    const db=database(),handle=directory();handle.raw='{broken';db.records.set(key,handle);const e=environment(db);await e.ready;
    assert.equal(e.run('worldId'),'demo');assert.equal(e.run('folder'),null);assert.equal(e.nodes.get('reconnectMainFolder').hidden,false);
  });
  await test('declining discard of edits never opens the picker',async()=>{
    const e=environment();await e.ready;e.run('dirty=true');e.c.confirm=()=>false;await e.nodes.get('setMainFolder').onclick();assert.equal(e.run('dirty'),true);assert.equal(e.alerts.length,0);
  });
  await test('restore cannot overwrite edits made while JSON is loading',async()=>{
    const db=database(),handle=directory(),gate=deferred();handle.readDelay=gate.promise;db.records.set(key,handle);const e=environment(db);await tick();
    assert.equal(handle.reads,1);e.run(`dirty=true;data.worlds[0].name='My edit'`);gate.resolve();await e.ready;
    assert.equal(e.run('folder'),null);assert.equal(e.run('data.worlds[0].name'),'My edit');assert.equal(e.run('dirty'),true);
  });
  await test('manual folder opening wins over a delayed automatic restore',async()=>{
    const db=database(),handle=directory(),gate=deferred();handle.readDelay=gate.promise;db.records.set(key,handle);const e=environment(db);await tick();
    e.c.manual=directory('Manual');e.run('folderOpenGeneration++');await e.run('connectAtlasProject(manual)');gate.resolve();await e.ready;assert.equal(e.run('worldId'),'Manual');
  });
  await test('pending image upload is not discarded by automatic restore',async()=>{
    const db=database(),handle=directory(),gate=deferred();handle.readDelay=gate.promise;db.records.set(key,handle);const e=environment(db);await tick();e.run('imageJobs=1');gate.resolve();await e.ready;assert.equal(e.run('folder'),null);assert.equal(e.run('imageJobs'),1);
  });
  await test('saving in progress prevents restoring or choosing another folder',async()=>{
    const db=database(),handle=directory(),gate=deferred();db.records.delay=gate.promise;db.records.set(key,handle);const e=environment(db);e.run('savingProject=true');gate.resolve();await e.ready;await e.nodes.get('setMainFolder').onclick();assert.equal(handle.reads,0);assert.equal(e.run('folder'),null);
  });
  await test('unavailable IndexedDB still permits opening selected project',async()=>{
    const e=environment(null);await e.ready;e.c.showDirectoryPicker=async()=>directory();await e.nodes.get('setMainFolder').onclick();assert.equal(e.run('worldId'),'Main');assert.ok(e.messages.at(-1).includes('запомнить её не удалось'));
  });
  await test('failed preference write is reported and does not pretend to remember',async()=>{
    const db=database(),e=environment(db);await e.ready;db.records.fail=true;e.c.showDirectoryPicker=async()=>directory();await e.nodes.get('setMainFolder').onclick();assert.equal(db.records.has(key),false);assert.ok(e.messages.at(-1).includes('запомнить её не удалось'));assert.equal(e.nodes.get('forgetMainFolder').hidden,true);
  });
  await test('preference is scoped to the HTML pathname',async()=>{
    const db=database();db.records.set(key,directory());const e=environment(db,'/other/index.html');await e.ready;assert.equal(e.run('folder'),null);
  });
  await test('revoked or deleted folder offers recovery without losing app data',async()=>{
    const db=database(),handle=directory();handle.queryFailure=true;db.records.set(key,handle);const e=environment(db);await e.ready;assert.equal(e.run('folder'),null);assert.equal(e.nodes.get('reconnectMainFolder').hidden,false);assert.equal(handle.requests,0);
  });
  console.log(`${count} main-folder checks passed. Browser persistence/permissions need manual verification.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
