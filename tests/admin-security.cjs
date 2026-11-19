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

    // Chronicle core: separate event model, world links, tag entities and visibility.
    const chronicleBase={
      title:'Chronicle GM event',summary:'private history',article:'',kind:'point',
      startDay:686664,endDay:null,startPrecision:'exact',earliestDay:null,latestDay:null,
      endPrecision:null,worldIds:['demo-world'],tagNames:['Война','война'],
      significance:'important',visibility:'gm',color:'#c95f5f',icon:'⚔'
    };
    const gmChronicle=await request('/api/admin/chronicle/events','POST',chronicleBase);
    assert.equal(gmChronicle.status,201,JSON.stringify(gmChronicle.data));
    assert.equal(gmChronicle.data.worlds[0].id,'demo-world');
    assert.equal(gmChronicle.data.tags.length,1,'normalized duplicate tags must merge');
    assert.equal(gmChronicle.data.color,'#c95f5f');
    assert.equal(gmChronicle.data.icon,'⚔');
    const editedChronicle=await request('/api/admin/chronicle/events/'+gmChronicle.data.id,'PATCH',{
      ...chronicleBase,title:'Chronicle GM event edited',color:'#5f86c9',icon:'★',significance:'key'
    });
    assert.equal(editedChronicle.status,200,JSON.stringify(editedChronicle.data));
    assert.equal(editedChronicle.data.id,gmChronicle.data.id,'edit must update, not duplicate');
    assert.equal(editedChronicle.data.color,'#5f86c9');
    assert.equal(editedChronicle.data.icon,'★');
    assert.equal(editedChronicle.data.significance,'key');
    assert.equal(await db.chronicleEvent.count({where:{id:gmChronicle.data.id}}),1);
    const anonymousChronicle=await request('/api/chronicle/events','GET',undefined,false,false);
    assert.equal(anonymousChronicle.status,200);
    assert.equal(anonymousChronicle.data.some(item=>item.id===gmChronicle.data.id),false);
    const authenticatedChronicle=await request('/api/chronicle/events');
    assert.equal(authenticatedChronicle.data.some(item=>item.id===gmChronicle.data.id),true);
    const publicChronicle=await request('/api/admin/chronicle/events','POST',{
      ...chronicleBase,title:'Chronicle public period',kind:'period',endDay:686674,
      tagNames:['Политика'],visibility:'public'
    });
    assert.equal(publicChronicle.status,201,JSON.stringify(publicChronicle.data));
    const publicChronicleList=await request('/api/chronicle/events','GET',undefined,false,false);
    assert.equal(publicChronicleList.data.some(item=>item.id===publicChronicle.data.id),true);

    // Mythos: panthеons and gods are separate entities; private knowledge must not leak.
    const mythosPantheonBase={name:'Старший круг',description:'Забытые первосущности',
      worldId:'demo-world',visibility:'gm'};
    assert.equal((await request('/api/admin/mythos/pantheons','POST',mythosPantheonBase,
      false,false)).status,401);
    assert.equal((await request('/api/admin/mythos/pantheons','POST',mythosPantheonBase,
      true,false)).status,403);
    const mythosPantheon=await request('/api/admin/mythos/pantheons','POST',mythosPantheonBase);
    assert.equal(mythosPantheon.status,201,JSON.stringify(mythosPantheon.data));
    const publicPantheon=await request('/api/admin/mythos/pantheons','POST',{
      name:'Боги-покровители',description:'Известный культ',worldId:'demo-world',visibility:'public'
    });
    assert.equal(publicPantheon.status,201);
    const deityBase={
      name:'Омнат',epithet:'Хранитель перемен',summary:'Дух природы',
      description:'Легенда о <первых> превращениях',symbol:'🌿',color:'#69a66f',
      rank:'Первосущность',domains:['Эволюция','эволюция','Природа'],
      worldIds:['demo-world'],pantheonId:mythosPantheon.data.id,visibility:'gm'
    };
    const deity=await request('/api/admin/mythos/deities','POST',deityBase);
    assert.equal(deity.status,201,JSON.stringify(deity.data));
    assert.deepEqual(deity.data.domains,['Эволюция','Природа']);
    assert.equal(deity.data.worlds[0].id,'demo-world');
    assert.equal(deity.data.pantheon.id,mythosPantheon.data.id);
    const anonymousDeities=await request('/api/mythos/deities','GET',undefined,false,false);
    assert.equal(anonymousDeities.status,200);
    assert.equal(anonymousDeities.data.some(item=>item.id===deity.data.id),false);
    const anonymousPantheons=await request('/api/mythos/pantheons','GET',undefined,false,false);
    assert.equal(anonymousPantheons.data.some(item=>item.id===mythosPantheon.data.id),false);
    assert.equal(anonymousPantheons.data.some(item=>item.id===publicPantheon.data.id),true);
    const publicDeity=await request('/api/admin/mythos/deities','POST',{
      ...deityBase,name:'Видимый бог',visibility:'public',domains:['Свет']
    });
    assert.equal(publicDeity.status,201);
    const guestPublic=await request('/api/mythos/deities','GET',undefined,false,false);
    const guestGod=guestPublic.data.find(item=>item.id===publicDeity.data.id);
    assert.ok(guestGod,'Public deity must remain visible');
    assert.equal(guestGod.pantheonId,null,'Private pantheon id must not leak');
    assert.equal(guestGod.pantheon,null,'Private pantheon name must not leak');
    const badDeity=await request('/api/admin/mythos/deities','POST',{
      ...deityBase,worldIds:['not-a-world']
    });
    assert.equal(badDeity.status,400);
    const changedDeity=await request('/api/admin/mythos/deities/'+deity.data.id,'PATCH',{
      ...deityBase,name:'Омнат изменённый',pantheonId:publicPantheon.data.id,
      visibility:'public',domains:['Природа','Перемены']
    });
    assert.equal(changedDeity.status,200,JSON.stringify(changedDeity.data));
    assert.equal(changedDeity.data.id,deity.data.id);
    assert.equal(await db.mythosDeity.count({where:{id:deity.data.id}}),1);
    assert.deepEqual(changedDeity.data.domains,['Природа','Перемены']);
    assert.equal((await request('/api/admin/mythos/pantheons/'+publicPantheon.data.id,
      'DELETE')).status,409,'Cannot remove a pantheon with assigned deities');
    assert.equal((await request('/api/admin/mythos/deities/'+deity.data.id,'DELETE')).status,200);
    assert.equal((await request('/api/admin/mythos/pantheons/'+publicPantheon.data.id,
      'DELETE')).status,200);

    // Development must allow Vite on any loopback port, but still reject external origins.
    const loopbackOrigin=await fetch(base+'/api/admin/history/state',{headers:{
      cookie,'x-csrf-token':csrf,origin:'http://localhost:5179'
    }});
    assert.equal(loopbackOrigin.status,200,await loopbackOrigin.text());
    const evilOrigin=await fetch(base+'/api/admin/history/state',{headers:{
      cookie,'x-csrf-token':csrf,origin:'https://evil.invalid'
    }});
    assert.equal(evilOrigin.status,403);

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

    // Mythos v2: relation graph, myths, subjective belief, Atlas geography,
    // Chronicle history and cosmology must round-trip through the same database.
    const secondDeity=await request('/api/admin/mythos/deities','POST',{
      ...deityBase,name:'Вторая сущность',epithet:'Дитя перемен',pantheonId:mythosPantheon.data.id,
      visibility:'public',domains:['Эволюция','Время'],primaryDomains:['Время'],
      power:'Космическая сила',influence:73,graphX:68,graphY:34
    });
    assert.equal(secondDeity.status,201,JSON.stringify(secondDeity.data));
    assert.equal(secondDeity.data.power,'Космическая сила');
    assert.equal(secondDeity.data.influence,73);
    assert.deepEqual(secondDeity.data.primaryDomains,['Время']);
    assert.equal(secondDeity.data.graphX,68);

    // Graph dragging uses a lightweight endpoint: moving a node must not rewrite deity lore.
    assert.equal((await request('/api/admin/mythos/deities/'+secondDeity.data.id+'/position','PATCH',
      {graphX:42.5,graphY:61.25},false,false)).status,401);
    assert.equal((await request('/api/admin/mythos/deities/'+secondDeity.data.id+'/position','PATCH',
      {graphX:42.5,graphY:61.25},true,false)).status,403);
    assert.equal((await request('/api/admin/mythos/deities/'+secondDeity.data.id+'/position','PATCH',
      {graphX:101,graphY:50})).status,400);
    const movedDeity=await request('/api/admin/mythos/deities/'+secondDeity.data.id+'/position','PATCH',
      {graphX:42.5,graphY:61.25});
    assert.equal(movedDeity.status,200,JSON.stringify(movedDeity.data));
    assert.equal(movedDeity.data.graphX,42.5);
    assert.equal(movedDeity.data.graphY,61.25);
    const storedMovedDeity=await db.mythosDeity.findUnique({where:{id:secondDeity.data.id}});
    assert.equal(storedMovedDeity.name,'Вторая сущность');
    assert.equal(storedMovedDeity.power,'Космическая сила');
    assert.equal(storedMovedDeity.influence,73);
    assert.equal(storedMovedDeity.pantheonId,mythosPantheon.data.id);
    assert.equal(storedMovedDeity.domains,JSON.stringify(['Эволюция','Время']));
    assert.equal(storedMovedDeity.graphX,42.5);
    assert.equal(storedMovedDeity.graphY,61.25);

    const relation=await request('/api/admin/mythos/relations','POST',{
      sourceId:publicDeity.data.id,targetId:secondDeity.data.id,type:'создал',
      category:'origin',label:'создатель',description:'Мифическое происхождение',
      startDay:publicChronicle.data.startDay,endDay:null,visibility:'public'
    });
    assert.equal(relation.status,201,JSON.stringify(relation.data));
    assert((await request('/api/mythos/relations','GET',undefined,false,false)).data
      .some(item=>item.id===relation.data.id));

    const myth=await request('/api/admin/mythos/myths','POST',{
      title:'Раскол первого света',summary:'Общий миф',description:'Две сущности делят мир.',
      visibility:'public',participants:[
        {deityId:publicDeity.data.id,role:'создатель'},
        {deityId:secondDeity.data.id,role:'наследник'}
      ]
    });
    assert.equal(myth.status,201,JSON.stringify(myth.data));
    assert.equal(myth.data.participants.length,2);
    assert((await request('/api/mythos/myths','GET',undefined,false,false)).data
      .some(item=>item.id===myth.data.id&&item.participants.length===2));

    const belief=await request('/api/admin/mythos/beliefs','POST',{
      deityId:secondDeity.data.id,worldId:'demo-world',culture:'Северяне',
      publicName:'Часовщик',doctrine:'Они считают его создателем времени.',
      identity:'partial',visibility:'public'
    });
    assert.equal(belief.status,201,JSON.stringify(belief.data));
    assert.equal(belief.data.deity.name,'Вторая сущность');
    assert((await request('/api/mythos/beliefs','GET',undefined,false,false)).data
      .some(item=>item.id===belief.data.id&&item.publicName==='Часовщик'));

    const site=await request('/api/admin/mythos/sites','POST',{
      deityId:publicDeity.data.id,locationId:location.data.id,name:'Храм у тестового города',
      description:'Культовый центр',importance:'Главный храм',visibility:'public'
    });
    assert.equal(site.status,201,JSON.stringify(site.data));
    assert.equal(site.data.location.name,'Тестовый город');
    assert.equal(site.data.location.worldId,'demo-world');
    assert.equal(typeof site.data.location.worldName,'string');
    assert.ok(site.data.location.worldName.length>0);

    const historyLink=await request('/api/admin/mythos/history-links','POST',{
      deityId:publicDeity.data.id,eventId:publicChronicle.data.id,role:'вмешался'
    });
    assert.equal(historyLink.status,201,JSON.stringify(historyLink.data));
    assert((await request('/api/mythos/history-links','GET',undefined,false,false)).data
      .some(item=>item.deityId===publicDeity.data.id&&item.eventId===publicChronicle.data.id));

    const planeA=await request('/api/admin/mythos/cosmology/nodes','POST',{
      name:'Материальный план',kind:'План',description:'Обычный мир',symbol:'◈',
      color:'#7f8da8',x:25,y:50,worldId:'demo-world',visibility:'public'
    });
    const planeB=await request('/api/admin/mythos/cosmology/nodes','POST',{
      name:'Звёздное море',kind:'Межплан',description:'Путь между мирами',symbol:'✦',
      color:'#879ac1',x:75,y:50,worldId:null,visibility:'public'
    });
    assert.equal(planeA.status,201,JSON.stringify(planeA.data));
    assert.equal(planeB.status,201,JSON.stringify(planeB.data));
    const cosmicLink=await request('/api/admin/mythos/cosmology/links','POST',{
      sourceId:planeA.data.id,targetId:planeB.data.id,type:'Переход',
      label:'Врата',description:'Доступен через ритуал',visibility:'public'
    });
    assert.equal(cosmicLink.status,201,JSON.stringify(cosmicLink.data));
    assert((await request('/api/mythos/cosmology/links','GET',undefined,false,false)).data
      .some(item=>item.id===cosmicLink.data.id));
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

    const svg=Buffer.from('<?xml version="1.0"?><!-- exported icon --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><style>.x{fill:url(#g)}</style><path class="x" d="M3 3h18v18H3z"/></svg>');
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
    const externalSvg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><style>.x{fill:url(https://evil.invalid/x)}</style><path class="x" d="M0 0h1v1z"/></svg>');
    assert.equal((await fetch(base+'/api/admin/assets/icons',{method:'POST',headers:{
      cookie,'x-csrf-token':csrf,'content-type':'application/octet-stream'
    },body:externalSvg})).status,415);

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

    // Persistent global map history: create -> update -> undo update -> undo create -> redo both.
    const historyLocation=await request('/api/admin/locations','POST',{
      worldId,name:'History marker',x:111,y:222,type:emojiType.data.id,
      color:'#cc3344',minZoom:-2,description:'before',article:'',tags:['history']
    });
    assert.equal(historyLocation.status,201);
    const historyUpdated=await request('/api/admin/locations/'+historyLocation.data.id,'PATCH',{
      name:'History marker moved',x:333,y:444,type:emojiType.data.id,
      color:'#cc3344',minZoom:-2,description:'after',article:'',tags:['history']
    });
    assert.equal(historyUpdated.status,200);
    const historyState=await request('/api/admin/history/state');
    assert.equal(historyState.status,200);
    assert.equal(historyState.data.canUndo,true);
    assert.match(historyState.data.undo.label,/History marker moved/);

    const undoUpdate=await request('/api/admin/history/undo','POST',{});
    assert.equal(undoUpdate.status,200);
    let historyRow=await db.location.findUnique({where:{id:historyLocation.data.id}});
    assert.equal(historyRow.name,'History marker');
    assert.equal(historyRow.x,111);

    const undoCreate=await request('/api/admin/history/undo','POST',{});
    assert.equal(undoCreate.status,200);
    historyRow=await db.location.findUnique({where:{id:historyLocation.data.id}});
    assert.equal(historyRow,null);

    const redoCreate=await request('/api/admin/history/redo','POST',{});
    assert.equal(redoCreate.status,200);
    historyRow=await db.location.findUnique({where:{id:historyLocation.data.id}});
    assert.equal(historyRow.name,'History marker');

    const redoUpdate=await request('/api/admin/history/redo','POST',{});
    assert.equal(redoUpdate.status,200);
    historyRow=await db.location.findUnique({where:{id:historyLocation.data.id}});
    assert.equal(historyRow.name,'History marker moved');
    assert.equal(historyRow.x,333);

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
