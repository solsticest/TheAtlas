'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

const make=(overrides={})=>({
  id:'event-'+Math.random(),
  title:'Battle of Arda',
  summary:'A decisive political battle',
  article:'',
  kind:'point',
  startDay:10,
  endDay:null,
  startPrecision:'exact',
  earliestDay:null,
  latestDay:null,
  endPrecision:null,
  significance:'important',
  visibility:'public',
  color:'#c95f5f',
  icon:'⚔',
  worlds:[{id:'estara',name:'Estara'}],
  tags:[{id:'war',name:'Война',color:'#d6b77a',icon:null,description:''}],
  ...overrides,
});

test('Chronicle filters combine categories with AND and values inside a category with OR',async()=>{
  const f=await import('../apps/web/src/chronicle/filters.ts');
  const battle=make();
  const politics=make({id:'politics',title:'Council vote',significance:'key',
    tags:[{id:'politics',name:'Политика',color:'#d6b77a',icon:null,description:''}]});
  const quiet=make({id:'quiet',title:'Quiet day',significance:'normal',
    tags:[{id:'life',name:'Быт',color:'#d6b77a',icon:null,description:''}]});
  const filters=f.emptyChronicleFilters();
  filters.tags=['Война','Политика'];
  filters.significances=['important','key'];
  assert.deepEqual(f.filterChronicleEvents([battle,politics,quiet],filters).map(x=>x.id),
    [battle.id,'politics']);
});

test('Chronicle global world and text filters match event metadata',async()=>{
  const f=await import('../apps/web/src/chronicle/filters.ts');
  const estara=make();
  const other=make({id:'other',title:'Coronation',summary:'Royal ceremony',
    worlds:[{id:'zenith',name:'Zenith'}],tags:[]});
  const filters=f.emptyChronicleFilters();
  filters.worldIds=['estara'];
  filters.query='полит';
  assert.deepEqual(f.filterChronicleEvents([estara,other],filters).map(x=>x.id),[estara.id]);
});

test('Chronicle filter helpers expose stable tag options and active condition count',async()=>{
  const f=await import('../apps/web/src/chronicle/filters.ts');
  const a=make();
  const b=make({id:'b',tags:[
    {id:'p',name:'Политика',color:'#d6b77a',icon:null,description:''},
    {id:'w2',name:'война',color:'#d6b77a',icon:null,description:''},
  ]});
  assert.deepEqual(f.chronicleTagOptions([a,b]),['Война','Политика']);
  const filters=f.emptyChronicleFilters();
  filters.query='battle';
  filters.tags=['Война'];
  filters.kinds=['point'];
  assert.equal(f.chronicleFilterCount(filters),3);
});
