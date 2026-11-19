'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {audit,args} = require('../scripts/audit-legacy.cjs');

async function fixture(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-preflight-'));
  const json=path.join(dir,'data','atlas.json'),maps=path.join(dir,'maps');
  fs.mkdirSync(path.dirname(json));fs.mkdirSync(maps);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlEdWMAAAAASUVORK5CYII=','base64');
  fs.writeFileSync(path.join(maps,'world.png'),png);
  fs.writeFileSync(path.join(maps,'region.png'),png);
  const data={version:4,unknownRoot:'keep',types:[{id:'city',name:'Город',symbol:'🏘'}],worlds:[{
    id:'world',name:'Мир',image:'world.png',width:1,height:1,customField:'preserve',
    locations:[{id:'location',name:'Город',x:0.123456789,y:0.25,type:'city',article:'<a data-world="world" data-location="location" href="#location">здесь</a>',tags:['город']}],
    layers:[{id:'region',name:'Регион',image:'region.png',width:1,height:1,parentId:null,bounds:{x1:0,y1:0,x2:1,y2:1},showAtZoom:1,fadeRange:0.75,enabled:true,rotation:333.875676895683}]
  }]};
  fs.writeFileSync(json,JSON.stringify(data,null,2));
  try {return await fn({dir,json,maps,data});}
  finally {fs.rmSync(dir,{recursive:true,force:true});}
}
test('dry-run reports original IDs, coordinates and unknown fields without writes',()=>fixture(async f=>{
  const original=fs.readFileSync(f.json);
  const r=await audit({input:f.json});
  assert.deepEqual(r.errors,[]);
  assert.equal(r.counts.worlds,1);assert.equal(r.counts.locations,1);assert.equal(r.counts.layers,1);
  assert.equal(r.worlds[0].layers[0].rotation,333.875676895683);
  assert.equal(r.worlds[0].locations[0].x,0.123456789);
  assert.equal(r.assets.length,2);
  assert.equal(r.assets.every(a=>/^[0-9a-f]{64}$/.test(a.sha256)),true);
  assert.equal(r.unknownFields.some(x=>x.keys.includes('customField')),true);
  assert.deepEqual(fs.readFileSync(f.json),original);
}));
test('missing file and incorrect size stop preflight',()=>fixture(async f=>{
  f.data.worlds[0].width=3840;
  fs.writeFileSync(f.json,JSON.stringify(f.data));
  const bad=await audit({input:f.json});
  assert.match(bad.errors.join(' '),/размеры/);
  fs.rmSync(path.join(f.maps,'region.png'));
  const missing=await audit({input:f.json});
  assert.match(missing.errors.join(' '),/файл не найден/);
}));
test('cycles and invalid parent references are rejected',()=>fixture(async f=>{
  f.data.worlds[0].layers.push({id:'other',name:'Другая',parentId:'region',width:1,height:1,bounds:{x1:0,y1:0,x2:1,y2:1}});
  f.data.worlds[0].layers[0].parentId='other';
  fs.writeFileSync(f.json,JSON.stringify(f.data));
  assert.match((await audit({input:f.json})).errors.join(' '),/цикл/);
  f.data.worlds[0].layers[0].parentId='unknown';
  fs.writeFileSync(f.json,JSON.stringify(f.data));
  assert.match((await audit({input:f.json})).errors.join(' '),/не найден parentId/);
}));
test('unsafe media path and duplicate IDs are rejected',()=>fixture(async f=>{
  f.data.worlds[0].locations[0].article='<img data-asset="../secret.png">';
  f.data.worlds[0].locations.push({...f.data.worlds[0].locations[0]});
  fs.writeFileSync(f.json,JSON.stringify(f.data));
  const r=await audit({input:f.json});
  assert.match(r.errors.join(' '),/Недопустимый путь/);
  assert.match(r.errors.join(' '),/повтор ID локации/);
}));
test('CLI emits machine-readable JSON and refuses apply',()=>fixture(async f=>{
  const exe=path.resolve(__dirname,'../scripts/audit-legacy.cjs');
  const out=spawnSync(process.execPath,[exe,'--input',f.json,'--json'],{encoding:'utf8'});
  assert.equal(out.status,0,out.stderr);
  assert.equal(JSON.parse(out.stdout).counts.worlds,1);
  assert.throws(()=>args(['--apply']),/только dry-run/);
  const denied=spawnSync(process.execPath,[exe,'--apply'],{encoding:'utf8'});
  assert.equal(denied.status,2);
}));
