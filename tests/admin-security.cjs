'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const bcrypt=require('bcryptjs');
const {PrismaClient}=require('@prisma/client');

const root=path.resolve(__dirname,'..');

test('One-admin security, draft isolation, safe CRUD, uploads and restorable backup',async()=>{
  fs.mkdirSync(path.join(root,'storage'),{recursive:true});
  const temp=fs.mkdtempSync(path.join(root,'storage','admin-test-'));
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-admin-original-'));
  const database=path.join(temp,'atlas.db');
  const relative=path.relative(path.join(root,'apps/api/prisma'),database).replace(/\\/g,'/');
  const password='a long local test password 123!';
  const env={...process.env,DATABASE_URL:'file:'+relative,ATLAS_ASSETS_DIR:path.join(temp,'assets'),
    SESSION_SECRET:'test-secret-longer-than-32-characters-and-random-for-this-test',
    ADMIN_PASSWORD_HASH:bcrypt.hashSync(password,10),NODE_ENV:'test',
    ATLAS_BACKUP_DIR:path.join(temp,'backups')};
  const originalPath=path.join(root,'data','atlas.json');
  const original=fs.readFileSync(originalPath);
  const run=(script,args=[])=>{
    const p=spawnSync(process.execPath,[path.join(root,script),...args],{
      cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:10*1024*1024
    });
    assert.equal(p.status,0,script+'\n'+p.stderr+'\n'+p.stdout);
    return p.stdout;
  };
  let db,server;
  try{
    run('scripts/db-setup.cjs');
    run('scripts/import-legacy-atlas.cjs',['--apply','--backup-dir',outside]);
    Object.assign(process.env,{
      DATABASE_URL:env.DATABASE_URL,ATLAS_ASSETS_DIR:env.ATLAS_ASSETS_DIR,
      SESSION_SECRET:env.SESSION_SECRET,ADMIN_PASSWORD_HASH:env.ADMIN_PASSWORD_HASH,
      NODE_ENV:'test',ATLAS_BACKUP_DIR:env.ATLAS_BACKUP_DIR
    });
    const {createApp}=await import('../apps/api/src/app.ts');
    db=new PrismaClient();
    const app=createApp(db);
    server=await new Promise(resolve=>{
      const s=app.listen(0,'127.0.0.1',()=>resolve(s));
    });
    const base='http://127.0.0.1:'+server.address().port;
    let cookie='',csrf='';
    const request=async(url,method='GET',body=undefined,useCookie=true,useCsrf=true)=>{
      const headers={};
      if(useCookie&&cookie)headers.cookie=cookie;
      if(useCsrf&&csrf)headers['x-csrf-token']=csrf;
      if(body!==undefined)headers['content-type']='application/json';
      const response=await fetch(base+url,{method,headers,
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      const data=await response.json();
      return {status:response.status,data,headers:response.headers};
    };
    assert.equal((await request('/api/auth/me')).data.authenticated,false);
    const worldId='demo-world';
    const timeline={worldId,name:'История теста',description:'',sortOrder:0,isDefault:true,status:'published'};
    assert.equal((await request('/api/admin/timelines','POST',timeline)).status,401);
    assert.equal((await request('/api/auth/login','POST',{password:'wrong password'})).status,401);
    const login=await request('/api/auth/login','POST',{password});
    assert.equal(login.status,200);
    assert.equal(login.data.authenticated,true);
    assert.match(login.headers.get('set-cookie')??'',/HttpOnly/i);
    assert.match(login.headers.get('set-cookie')??'',/SameSite=Strict/i);
    cookie=(login.headers.get('set-cookie')??'').split(';')[0];
    csrf=login.data.csrfToken;
    assert.equal(typeof csrf,'string');
    assert.equal((await request('/api/admin/timelines','POST',timeline,true,false)).status,403);
    assert.equal((await request('/api/admin/timelines','POST',{...timeline,name:'bad', status:'unknown'})).status,400);
    const published=await request('/api/admin/timelines','POST',timeline);
    assert.equal(published.status,201);
    const draft=await request('/api/admin/timelines','POST',{...timeline,name:'Скрытая история',isDefault:false,status:'draft'});
    assert.equal(draft.status,201);
    const publicTimelines=await request('/api/worlds/'+worldId+'/timelines');
    assert.equal(publicTimelines.status,200);
    assert.equal(publicTimelines.data.length,1);
    assert.equal(publicTimelines.data[0].id,published.data.id);
    assert.equal((await request('/api/timelines/'+draft.data.id+'/eras')).status,404);
    const era=await request('/api/admin/eras','POST',{timelineId:published.data.id,name:'Эпоха А',description:'',
      dateLabel:'1201 год',sortOrder:0,image:null});
    assert.equal(era.status,201);
    const baseEvent={eraId:era.data.id,title:'Историческое событие',summary:'',
      article:'<p>Текст</p><img src="x" onerror="alert(1)">',type:'история',tags:['тег'],
      sortOrder:0,dateLabel:'1201.05.17',locationId:null,x:100,y:200,image:null,status:'published'};
    const event=await request('/api/admin/events','POST',baseEvent);
    assert.equal(event.status,201);
    assert.doesNotMatch(event.data.article,/onerror|alert\(/i);
    const draftEvent=await request('/api/admin/events','POST',{...baseEvent,title:'Секрет',status:'draft',sortOrder:1});
    assert.equal(draftEvent.status,201);
    const publicEvents=await request('/api/eras/'+era.data.id+'/events');
    assert.equal(publicEvents.data.length,1);
    assert.equal(publicEvents.data[0].id,event.data.id);
    assert.equal((await request('/api/events/'+draftEvent.data.id)).status,404);
    const wrongWorld=await request('/api/admin/events','POST',{
      ...baseEvent,locationId:'8d67bd24-baa7-473d-9329-63bca8e14f18'
    });
    assert.equal(wrongWorld.status,400);
    const location=await request('/api/admin/locations','POST',{
      worldId,name:'Тестовый город',x:400.123456789,y:200.987654321,type:'city',
      color:'#d6b77a',minZoom:-1,description:'Новая локация',article:'<b>Безопасно</b>',tags:['test']
    });
    assert.equal(location.status,201);
    const locs=await request('/api/worlds/'+worldId+'/locations');
    assert(locs.data.some(loc=>loc.id===location.data.id&&loc.name==='Тестовый город'));
    // Every change to an existing record must have a verified pre-write snapshot.
    const {createBackup,verifyBackup}=await import('../apps/api/src/backup.ts');
    const snapshotsBefore=fs.readdirSync(env.ATLAS_BACKUP_DIR).filter(name=>name.startsWith('atlas-snapshot-'));
    const updated=await request('/api/admin/locations/'+location.data.id,'PATCH',{
      name:'Переименованный город',x:400.123456789,y:200.987654321,type:'city',
      color:'#d6b77a',minZoom:-1,description:'Изменённое описание',
      article:'<p>Текст после редактирования</p>',tags:['test','new'],
    });
    assert.equal(updated.status,200);
    const stored=await db.location.findUnique({where:{id:location.data.id}});
    assert.equal(stored.name,'Переименованный город');
    const afterWriteSnapshots=fs.readdirSync(env.ATLAS_BACKUP_DIR).filter(name=>name.startsWith('atlas-snapshot-'));
    assert.equal(afterWriteSnapshots.length,snapshotsBefore.length+1,'save must create a snapshot before overwriting');
    const createdSnapshot=afterWriteSnapshots.find(name=>!snapshotsBefore.includes(name));
    assert.ok(createdSnapshot,'new snapshot must be separately identifiable');
    const beforeWriteManifest=await verifyBackup(path.join(env.ATLAS_BACKUP_DIR,createdSnapshot));
    assert.equal(beforeWriteManifest.assets.length,5);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlEdWMAAAAASUVORK5CYII=','base64');
    const imageResponse=await fetch(base+'/api/admin/assets/media',{method:'POST',headers:{
      cookie,'x-csrf-token':csrf,'content-type':'application/octet-stream'
    },body:png});
    assert.equal(imageResponse.status,201,await imageResponse.text());
    // Body stream was consumed above only if assertion fails; use API list via Prisma.
    const assets=await db.mediaAsset.findMany({where:{kind:'media'}});
    assert.equal(assets.length,1);
    assert.equal((await fetch(base+'/api/assets/'+assets[0].path)).status,200);

    const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>');
    const svgResponse=await fetch(base+'/api/admin/assets/icons',{method:'POST',headers:{
      cookie,'x-csrf-token':csrf,'content-type':'application/octet-stream'
    },body:svg});
    assert.equal(svgResponse.status,201,await svgResponse.text());
    const svgAsset=(await db.mediaAsset.findMany({where:{kind:'icons'}}))[0];
    assert.ok(svgAsset);
    assert.match(svgAsset.filename,/\.svg$/);
    assert.equal((await fetch(base+'/api/assets/icons/'+svgAsset.filename)).status,200);
    const unsafeSvg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.equal((await fetch(base+'/api/admin/assets/icons',{method:'POST',headers:{
      cookie,'x-csrf-token':csrf,'content-type':'application/octet-stream'
    },body:unsafeSvg})).status,415);

    const emojiType=await request('/api/admin/types','POST',{
      name:'Красный город',symbol:'🏰',color:'#cc3344',iconSvg:null
    });
    assert.equal(emojiType.status,201);
    const svgType=await request('/api/admin/types','POST',{
      name:'SVG город',symbol:'',color:'#33aacc',iconSvg:svgAsset.filename
    });
    assert.equal(svgType.status,201);
    const publicTypes=await request('/api/types');
    assert(publicTypes.data.some(type=>type.id===emojiType.data.id&&
      type.color==='#cc3344'&&type.symbol==='🏰'&&type.iconSvg===null));
    assert(publicTypes.data.some(type=>type.id===svgType.data.id&&
      type.color==='#33aacc'&&type.iconSvg===svgAsset.filename&&type.symbol===''));

    assert.equal((await request('/api/admin/timelines/'+published.data.id,'DELETE')).status,409);
    const snapshot=await createBackup(db,path.join(temp,'snapshots'));
    const manifest=await verifyBackup(snapshot.folder);
    assert.equal(manifest.assets.length,7);
    assert.ok(fs.existsSync(path.join(snapshot.folder,'atlas.db')));
    const copied=path.join(outside,'restore-clone');
    run('scripts/backup-atlas.cjs',['--restore','--from',snapshot.folder,'--into',copied]);
    assert.ok(fs.existsSync(path.join(copied,'atlas.db')));
    assert.ok(fs.existsSync(path.join(copied,'assets','media',assets[0].filename)));
    assert.ok(fs.existsSync(path.join(copied,'assets','icons',svgAsset.filename)));
    const importedStatus=JSON.parse(run('scripts/import-legacy-atlas.cjs',['--verify']));
    assert.equal(importedStatus.status,'verified-edited');
    const logout=await request('/api/auth/logout','POST',{});
    assert.equal(logout.status,200);
    assert.equal((await request('/api/admin/timelines?worldId='+worldId)).status,401);
    assert.deepEqual(fs.readFileSync(originalPath),original,'legacy source must not change');
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(db)await db.$disconnect();
    fs.rmSync(temp,{recursive:true,force:true});
    fs.rmSync(outside,{recursive:true,force:true});
  }
});
