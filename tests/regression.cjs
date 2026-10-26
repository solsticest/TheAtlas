/* No browser, CDN, network or writes to user data. DOM/Leaflet/File System Access
   are simulated. This verifies control flow, geometry, migration and disk errors;
   it cannot verify painting, real permissions, or browser input/animation. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const python=process.env.ATLAS_TEST_PYTHON||'python';
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const voidTags=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
let document;
class Node {
  constructor(tag='#fragment',text=''){
    this.tagName=tag.startsWith('#')?undefined:tag.toUpperCase();this.nodeType=tag==='#text'?3:tag==='#fragment'?11:1;
    this.childNodes=[];this.attrs={};this._text=text;this._value=null;this.style={setProperty(k,v){this[k]=v;}};this.listeners={};this.open=false;this.hidden=false;
    if(tag==='template')this.content=new Node();
    this.classList={add:(...names)=>this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' '),remove:(...names)=>this.className=this.className.split(/\s+/).filter(n=>!names.includes(n)).join(' '),contains:n=>this.className.split(/\s+/).includes(n),toggle:(n,force)=>{const add=force??!this.classList.contains(n);if(add)this.classList.add(n);else this.classList.remove(n);return add;}};
    this.dataset=new Proxy({},{get:(_,key)=>this.getAttribute('data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()))||undefined,set:(_,key,value)=>{this.setAttribute('data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);return true;}});
  }
  get className(){return this.attrs.class||'';}set className(v){this.attrs.class=v;}
  get id(){return this.attrs.id||'';}set id(v){this.attrs.id=v;}
  get value(){if(this._value!==null)return this._value;if(this.tagName==='SELECT')return this.options[0]?.value||'';if(this.tagName==='OPTION')return this.attrs.value??this.textContent;return this.attrs.value||'';}
  set value(v){this._value=String(v);}
  get type(){return this.attrs.type||'';}set type(v){this.attrs.type=v;}
  get options(){return this.childNodes.filter(n=>n.tagName==='OPTION');}
  get textContent(){return this.nodeType===3?this._text:(this.content||this).childNodes.map(n=>n.textContent).join('');}
  set textContent(v){if(this.nodeType===3)this._text=String(v);else this.replaceChildren(new Node('#text',String(v)));}
  append(...nodes){for(let n of nodes){if(typeof n==='string')n=new Node('#text',n);if(n.nodeType===11){this.append(...[...n.childNodes]);continue;}if(n.parentNode)n.parentNode.childNodes=n.parentNode.childNodes.filter(c=>c!==n);n.parentNode=this;this.childNodes.push(n);}}
  appendChild(n){this.append(n);return n;}
  prepend(n){this.append(n);this.childNodes.unshift(this.childNodes.pop());}
  replaceChildren(...nodes){this.childNodes.forEach(n=>n.parentNode=null);this.childNodes=[];if(this.tagName==='SELECT')this._value=null;this.append(...nodes);}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
  get innerHTML(){return (this.content||this).childNodes.map(serialize).join('');}
  set innerHTML(v){const target=this.content||this;target.replaceChildren(...parse(String(v)).childNodes);}
  get outerHTML(){return serialize(this);}
  add(n){this.append(n);}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  dispatch(name,event={}){event.target??=this;event.preventDefault??=()=>{};event.stopImmediatePropagation??=()=>{};for(const fn of this.listeners[name]||[])fn(event);this['on'+name]?.(event);}
  querySelectorAll(selector){return descendants(this.content||this).filter(n=>matches(n,selector));}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){let n=this;while(n){if(matches(n,selector))return n;n=n.parentNode;}return null;}
  contains(n){return n===this||descendants(this).includes(n);}
  showModal(){this.open=true;}close(){this.open=false;}focus(){document.activeElement=this;}
}
function serialize(n){if(n.nodeType===3)return escape(n._text);if(n.nodeType===11)return n.innerHTML;const tag=n.tagName.toLowerCase(),attrs=Object.entries(n.attrs).map(([k,v])=>` ${k}="${escape(v)}"`).join('');return `<${tag}${attrs}>`+(voidTags.has(tag)?'':n.innerHTML+`</${tag}>`);}
function descendants(n){return n.childNodes.flatMap(c=>[c,...descendants(c)]);}
function matches(n,selector){
  if(!n.tagName)return false;
  if(selector.includes(','))return selector.split(',').some(s=>matches(n,s.trim()));
  const parts=selector.trim().split(/\s+/);if(parts.length>1){if(!matches(n,parts.pop()))return false;return !!n.parentNode?.closest(parts.join(' '));}
  const s=parts[0];if(s.startsWith('#'))return n.id===s.slice(1);if(s.startsWith('.'))return n.classList.contains(s.slice(1));
  const attr=s.match(/^([\w-]*)\[([^=\]]+)(?:="([^"]*)")?\]$/);if(attr)return (!attr[1]||n.tagName===attr[1].toUpperCase())&&n.getAttribute(attr[2])!==null&&(attr[3]===undefined||n.getAttribute(attr[2])===attr[3]);
  return n.tagName===s.toUpperCase();
}
function parse(html){
  const run=spawnSync(python,[path.join(__dirname,'html-tree.py')],{input:html,encoding:'utf8'});if(run.status!==0)throw Error(run.stderr||run.error?.message);
  function build(t){const n=new Node(t.tag||'#text',t.text||'');Object.assign(n.attrs,t.attrs||{});if('hidden'in n.attrs)n.hidden=true;for(const c of t.children||[])(n.content||n).append(build(c));return n;}
  return build(JSON.parse(run.stdout));
}
document=parse(fs.readFileSync(path.join(root,'index.html'),'utf8'));
document.createElement=tag=>new Node(tag);document.createTextNode=t=>new Node('#text',t);document.createDocumentFragment=()=>new Node();
document.getElementById=id=>document.querySelector('#'+id);document.body=document.querySelector('body');document.activeElement=document.body;
document.addEventListener=()=>{};
const originalJSON=fs.readFileSync(path.join(root,'data/atlas.json'),'utf8');
const ll=(a,b)=>Array.isArray(a)?{lat:a[0],lng:a[1]}:typeof a==='object'?a:{lat:a,lng:b};
class Layer {
  constructor(value,options={}){this.value=value;this.options=options;this.items=new Set();this.handlers={};this._latlng=ll(value||[0,0]);}
  addTo(map){map.addLayer(this);return this;}on(name,fn){this.handlers[name]=fn;return this;}
  addLayer(layer){this.items.add(layer);layer._map=this;if(layer._initImage&&!layer._image)layer._initImage();return this;}
  removeLayer(layer){this.items.delete(layer);return this;}hasLayer(layer){return this.items.has(layer);}clearLayers(){this.items.clear();return this;}
  setLatLng(p){this._latlng=ll(p);return this;}getLatLng(){return this._latlng;}setBounds(b){this.bounds=b;this.boundsCalls=(this.boundsCalls||0)+1;return this;}
  setOpacity(v){this.opacity=v;return this;}bringToFront(){this.frontCalls=(this.frontCalls||0)+1;return this;}bindTooltip(t){this.tooltip=t;return this;}
}
class ImageOverlay extends Layer {constructor(url,bounds,opts){super(null,opts);this.url=url;this.bounds=bounds;}_initImage(){this._image=new Node('img');this._image.className='leaflet-image-layer leaflet-zoom-animated';}}
ImageOverlay.extend=proto=>{class Child extends ImageOverlay{}Object.assign(Child.prototype,proto);return Child;};
class MapStub extends Layer {
  constructor(id,options){super(null,options);this.id=id;this.zoom=0;this.center=ll([0,0]);this.panes={};this.dragging={enable(){},disable(){}};}
  createPane(n){return this.panes[n]={style:{}};}getPane(n){return this.panes[n];}getContainer(){return document.getElementById(this.id);}
  getZoom(){return this.zoom;}getCenter(){return this.center;}setMaxBounds(){return this;}stop(){return this;}
  fitBounds(b){this.center=ll([(b[0][0]+b[1][0])/2,(b[0][1]+b[1][1])/2]);this.zoom=Math.log2(500/Math.max(1,b[1][0]-b[0][0]));return this;}
  setView(c,z){this.center=ll(c);this.zoom=z;return this;}setZoom(z){this.zoom=z;return this;}
  getBounds(){return {getEast:()=>1e10,getWest:()=>-1e10,getNorth:()=>1e10,getSouth:()=>-1e10};}
  closePopup(){this.popup=null;return this;}invalidateSize(){return this;}remove(){return this;}
  latLngToContainerPoint(p){p=ll(p);return {x:p.lng*2**this.zoom,y:-p.lat*2**this.zoom,subtract(v){return {x:this.x-v.x,y:this.y-v.y};}};}
  containerPointToLatLng(p){return ll([-p[1]/2**this.zoom,p[0]/2**this.zoom]);}
}
const L={CRS:{Simple:{}},map:(id,o)=>new MapStub(id,o),layerGroup:()=>new Layer(),marker:(p,o)=>new Layer(p,o),circleMarker:(p,o)=>new Layer(p,o),polyline:(p,o)=>new Layer(null,o),rectangle:(p,o)=>new Layer(null,o),divIcon:o=>o,latLng:ll,ImageOverlay,imageOverlay:(...args)=>new ImageOverlay(...args),DomUtil:{create:(tag,className)=>{const n=new Node(tag);n.className=className;return n;}},DomEvent:{disableClickPropagation(){},disableScrollPropagation(){}},Control:{extend:proto=>class {addTo(map){this.holder=proto.onAdd.call(this,map);map.getContainer().append(this.holder);return this;}}},popup:()=>({setLatLng(){return this;},setContent(c){this.content=c;return this;},openOn(map){map.popup=this;return this;}})};
let alerts=[],answers=[],timers=new Map(),timerId=0;
const context=vm.createContext({console,document,L,structuredClone,crypto:require('node:crypto').webcrypto,Blob,URL,Image:class {naturalWidth=1600;naturalHeight=1000;set src(s){this._src=s;queueMicrotask(()=>this.onload?.());}},createImageBitmap:async()=>({close(){}}),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),alert:s=>alerts.push(s),confirm:()=>true,prompt:()=>answers.shift()??null,Option:function(t,v){const n=new Node('option');n.textContent=t;n.value=v;return n;}});
context.window=context;context.addEventListener=()=>{};context.getSelection=()=>({rangeCount:0,removeAllRanges(){},addRange(){}});
for(const name of ['app.js','atlas-math.js','atlas-v4.js'])vm.runInContext(fs.readFileSync(path.join(root,'js',name),'utf8'),context,{filename:name});
const run=code=>vm.runInContext(code,context);
const plain=code=>JSON.parse(JSON.stringify(run(code)));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const test=async(name,fn)=>{await fn();console.log('PASS '+name);};
function missing(){return Object.assign(Error('Missing'),{name:'NotFoundError'});}
class MemDir {
  constructor(name='project',base='',store=new Map(),log=[]){Object.assign(this,{name,base,store,log});}
  async getDirectoryHandle(name,opts={}){const base=this.base+name+'/';if(!opts.create&&![...this.store.keys()].some(k=>k.startsWith(base)))throw missing();return new MemDir(name,base,this.store,this.log);}
  async getFileHandle(name,opts={}){
    const key=this.base+name,dir=this;if(!opts.create&&!this.store.has(key))throw missing();
    return {getFile:async()=>{if(!dir.store.has(key))throw missing();const value=dir.store.get(key);return value instanceof Blob?value:new Blob([value]);},createWritable:async()=>{let staged;return {write:async value=>{staged=value;await dir.store.hook?.(key,'write');},close:async()=>{await dir.store.hook?.(key,'close');dir.store.set(key,staged);dir.log.push(key);},abort:async()=>{}};}};
  }
}
function seeded(raw=originalJSON){const dir=new MemDir();dir.store.set('data/atlas.json',raw);const data=JSON.parse(raw);for(const w of data.worlds){if(w.image)dir.store.set('maps/'+w.image,'image');for(const r of w.layers||[])if(r.image)dir.store.set('maps/'+r.image,'image');}return dir;}
async function open(dir){context.showDirectoryPicker=async()=>dir;await run('openAtlasProject()');await flush();alerts=[];}
function approx(a,b){assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);}
(async()=>{
  await test('startup, controls and stable image panes',async()=>{
    assert.equal(run('data.version'),4);assert.equal(run('map.getPane("atlasBasePane").style.zIndex'),'210');assert.equal(run('map.getPane("atlasRegionPane").style.zIndex'),'260');
    assert.ok(document.getElementById('toggleSidebar').parentNode.classList.contains('atlas-sidebar-control'));
    assert.equal(document.querySelectorAll('[id]').length,new Set(document.querySelectorAll('[id]').map(n=>n.id)).size);
  });
  let project=seeded();await open(project);
  await test('loads real v3 project without losing worlds or nested layers',()=>{
    assert.equal(run('data.worlds.length'),2);assert.equal(run('data.worlds[1].layers[1].parentId'),JSON.parse(originalJSON).worlds[1].layers[0].id);assert.equal(project.store.get('data/atlas.json'),originalJSON);
  });
  await test('migration preserves unknown fields and repairs cycles',()=>{
    assert.equal(run(`(()=>{const sample={version:2,custom:'keep',types:[],worlds:[{id:'old',name:'Old',extra:7,locations:[{id:'m',type:'🏘',secret:'kept'}],layers:[{id:'a',parentId:'b'},{id:'b',parentId:'a'}]}]};normalize(sample);return sample.custom+sample.worlds[0].extra+sample.worlds[0].locations[0].secret+sample.worlds[0].locations[0].type;})()`),'keep7keptcity');
    assert.doesNotThrow(()=>run(`normalize({worlds:[{id:'v2',locations:[]}]})`));
  });
  await test('undo preserves fractional zoom and camera center',()=>{
    run(`map.setView([1700,1200],2.83);world().locations[0].name='Changed';changed();undoAction();`);
    approx(run('map.getZoom()'),2.83);assert.deepEqual(plain('map.getCenter()'),{lat:1700,lng:1200});assert.equal(run('world().locations[0].name'),'Люменпорт');
  });
  await test('undo restores region geometry and rotation without fitting world',()=>{
    const original=plain('world().layers[0].bounds');run(`world().layers[0].bounds.x1+=10;world().layers[0].rotation=30;changed();undoAction();`);
    assert.deepEqual(plain('world().layers[0].bounds'),original);assert.equal(run('world().layers[0].rotation'),0);approx(run('map.getZoom()'),2.83);
  });
  await test('search finds article text and tags in another world; navigation switches worlds',()=>{
    run(`data.worlds[1].locations[0].article='<h2>Гильдия следопытов</h2>';data.worlds[1].locations[0].tags=['перевал'];$('atlasSearch').value='следопытов';renderSearch();`);
    assert.ok(document.getElementById('searchResults').textContent.includes('Элдран'));
    document.getElementById('searchResults').querySelector('button').onclick();assert.equal(run('world().name'),'Элдран');assert.ok(run('!!map.popup'));
    run(`$('atlasSearch').value='перевал';renderSearch()`);assert.ok(document.getElementById('searchResults').querySelector('button'));
  });
  await test('catalog filters by type and popup retains short description',()=>{
    run(`$('catalogType').value='fortress';renderCatalog()`);assert.equal(document.getElementById('markerCatalog').querySelectorAll('button').length,0);
    run(`$('catalogType').value='';renderCatalog();showLocationCard(world().locations[0]);`);assert.ok(run('map.popup.content.textContent').includes('Подробнее'));
  });
  await test('rich text sanitizer removes scripts, handlers and external image URLs',()=>{
    const value=run(`sanitizeArticle('<h2 onclick="bad()">Title</h2><script>bad()</script><a href="javascript:bad()">bad</a><img src="https://bad/track"><figure><img data-asset="good.png" src="blob:old" onerror="bad()"><figcaption>Caption</figcaption></figure>')`);
    assert.ok(value.includes('<h2>Title</h2>'));assert.ok(value.includes('data-asset="good.png"'));assert.ok(!/script|onclick|onerror|src=|javascript:/.test(value));
    assert.ok(!run(`sanitizeArticle('<img data-asset="../secret.png">')`).includes('<img'));
  });
  await test('article editing survives close and old summary stays separate',()=>{
    const previousDescription=run('world().locations[0].description');
    run(`openArticle(worldId,world().locations[0].id,true);$('articleBody').innerHTML='<h2>История города</h2><p><strong>Текст</strong></p>';$('articleTags').value='город, столица';syncArticle();closeArticle();`);
    assert.ok(run('world().locations[0].article').includes('<strong>Текст</strong>'));assert.deepEqual(plain('world().locations[0].tags'),['город','столица']);assert.equal(run('world().locations[0].description'),previousDescription);assert.equal(document.getElementById('articleDialog').open,false);
  });
  await test('ruler measures a multi-segment route in world coordinates',()=>{
    run(`world().kmPerPixel=2;startMeasure('route');atlasMapClick(L.latLng(0,0));atlasMapClick(L.latLng(4,3));atlasMapClick(L.latLng(4,6));`);
    assert.ok(document.getElementById('measureResult').textContent.includes('16'));assert.equal(run('measurePoints.length'),3);run('resetMeasure()');
  });
  await test('scale calibration uses two points and stores kilometers per pixel',()=>{
    answers.push('40');run(`startMeasure('calibrate');atlasMapClick(L.latLng(0,0));atlasMapClick(L.latLng(4,3));`);approx(run('world().kmPerPixel'),8);assert.equal(run('measureMode'),null);
  });
  await test('view mode disables marker dragging and atlas undo',()=>{
    const before=run('JSON.stringify(data)');document.getElementById('viewMode').onclick();assert.equal(run('atlasCanEdit()'),false);assert.equal(run('markerObjects[0].marker.options.draggable'),false);run('undoAction()');assert.equal(run('JSON.stringify(data)'),before);document.getElementById('viewMode').onclick();assert.equal(run('atlasCanEdit()'),true);
  });
  await test('two-point similarity alignment matches both anchors at 0, 30, 90, 127 degrees',()=>{
    const math=require('../js/atlas-math.js');for(const degrees of [0,30,90,127]){
      const rad=degrees*Math.PI/180,scale=2.7,source=[{x:50,y:60},{x:870,y:310}];
      const transform=p=>({x:120+scale*(p.x*Math.cos(rad)-p.y*Math.sin(rad)),y:-450+scale*(p.x*Math.sin(rad)+p.y*Math.cos(rad))});
      const target=source.map(transform),result=math.alignTwoPoints(source,target,1200,800),b=result.bounds,c={x:(b.x1+b.x2)/2,y:(b.y1+b.y2)/2};
      for(let i=0;i<2;i++){const dx=(source[i].x-600)*result.scale,dy=(source[i].y-400)*result.scale,angle=-result.rotation*Math.PI/180;approx(c.x+dx*Math.cos(angle)-dy*Math.sin(angle),target[i].x);approx(c.y+dx*Math.sin(angle)+dy*Math.cos(angle),target[i].y);}
    }
    assert.throws(()=>math.alignTwoPoints([{x:0,y:0},{x:0,y:0}],[{x:0,y:0},{x:1,y:1}],100,100));
  });
  await test('nested region coordinate conversion round-trips',()=>{
    run(`switchWorld(data.worlds[1].id)`);const original=plain('world().layers[1].bounds');const roundtrip=plain('globalToLocalBox(worldBox(world().layers[1]),world().layers[1].parentId)');for(const key of Object.keys(original))approx(roundtrip[key],original[key]);
  });
  await test('alignment controller applies only on confirmation, then undo preserves camera',async()=>{
    run(`selectedRegionId=world().layers[0].id;setTab('regions');map.setView([1500,1200],2.25);`);
    const before=plain('region().bounds');await run('openAlignment()');assert.equal(run('alignment.ready'),true);
    run(`pickAlignmentPoint('source',L.latLng(10,20));pickAlignmentPoint('target',L.latLng(100,200));pickAlignmentPoint('source',L.latLng(110,220));pickAlignmentPoint('target',L.latLng(300,600));`);
    assert.deepEqual(plain('region().bounds'),before);assert.equal(document.getElementById('applyAlignment').disabled,false);
    document.getElementById('applyAlignment').onclick();assert.notDeepEqual(plain('region().bounds'),before);assert.equal(run('alignment'),null);
    run('undoAction()');assert.deepEqual(plain('region().bounds'),before);approx(run('map.getZoom()'),2.25);assert.deepEqual(plain('map.getCenter()'),{lat:1500,lng:1200});
  });
  await test('marker threshold remains discrete during fractional zoom',()=>{
    run(`world().locations[0].minZoom=3;renderMarkers();map.setZoom(2.83);updateMarkerVisibility()`);assert.equal(run('markerLayer.hasLayer(markerObjects[0].marker)'),false);
    run('map.setZoom(3.02);updateMarkerVisibility()');assert.equal(run('markerLayer.hasLayer(markerObjects[0].marker)'),true);run('world().locations[0].minZoom=-6');
  });
  await test('first paint of a rotated overlay gets the saved rotation',async()=>{
    run(`world().layers[0].rotation=30;map.setZoom(3);updateRegions()`);await flush();run('updateRegions()');assert.equal(run(`regionOverlays.get(world().layers[0].id)._atlasBitmap.style.rotate`),'30deg');
    const calls=run(`regionOverlays.get(world().layers[0].id).boundsCalls||0`);run('updateRegions();updateRegions()');assert.equal(run(`regionOverlays.get(world().layers[0].id).boundsCalls||0`),calls);
  });
  await test('save creates exact old-data backup before replacing JSON',async()=>{
    await run('saveAtlasProject()');assert.equal(alerts.length,0,alerts.join(';'));const backup=[...project.store.keys()].find(k=>k.startsWith('data/backups/'));assert.ok(backup);assert.equal(project.store.get(backup),originalJSON);assert.equal(JSON.parse(project.store.get('data/atlas.json')).version,4);assert.equal(run('dirty'),false);assert.ok(project.log.indexOf(backup)<project.log.indexOf('data/atlas.json'));
  });
  await test('saved project reopens with article, tags and ruler scale',async()=>{
    await open(project);assert.ok(run('data.worlds[1].locations[0].article').includes('История'));assert.deepEqual(plain('data.worlds[1].locations[0].tags'),['город','столица']);approx(run('data.worlds[1].kmPerPixel'),8);
  });
  await test('editing and replacing staged file during save leaves newer changes dirty',async()=>{
    run(`pendingFiles.set('test-image',{name:'test.png',file:new Blob(['old'])});world().locations[0].name='Snapshot';changed();`);
    project.store.hook=async(key,step)=>{if(key==='maps/test.png'&&step==='write'){run(`world().locations[0].name='Newer';pendingFiles.set('test-image',{name:'newer.png',file:new Blob(['new'])});changed();`);}};
    await run('saveAtlasProject()');delete project.store.hook;
    assert.equal(JSON.parse(project.store.get('data/atlas.json')).worlds[0].locations[0].name,'Snapshot');assert.equal(run('world().locations[0].name'),'Newer');assert.equal(run('dirty'),true);assert.equal(run(`pendingFiles.get('test-image').name`),'newer.png');
    await run('saveAtlasProject()');assert.equal(run('dirty'),false);assert.equal(run('pendingFiles.size'),0);
  });
  await test('media files are saved before JSON and local image references round-trip',async()=>{
    run(`pendingFiles.set('media:article-test.png',{directory:'media',name:'article-test.png',file:new Blob(['picture'])});world().locations[0].article='<figure><img data-asset="article-test.png"><figcaption>Caption</figcaption></figure>';changed();`);
    project.log.length=0;await run('saveAtlasProject()');assert.equal(alerts.length,0,alerts.join(';'));assert.ok(project.store.has('media/article-test.png'));assert.ok(project.log.indexOf('media/article-test.png')<project.log.indexOf('data/atlas.json'));
    await open(project);assert.ok(run('world().locations[0].article').includes('article-test.png'));
  });
  await test('external JSON edits stop save and preserve external data',async()=>{
    const external=project.store.get('data/atlas.json')+'\n';project.store.set('data/atlas.json',external);run(`world().name='Unsaved';changed()`);await run('saveAtlasProject()');assert.equal(project.store.get('data/atlas.json'),external);assert.equal(run('dirty'),true);assert.ok(alerts.pop().includes('изменён вне'));await open(project);
  });
  await test('missing asset stops save before touching disk data',async()=>{
    const before=project.store.get('data/atlas.json'),logLength=project.log.length;run(`world().image='missing.png';changed()`);await run('saveAtlasProject()');assert.equal(project.store.get('data/atlas.json'),before);assert.equal(project.log.length,logLength);assert.ok(alerts.pop().includes('Не найдены'));await open(project);
  });
  await test('backup failure prevents JSON replacement',async()=>{
    const before=project.store.get('data/atlas.json');project.store.hook=async(key,step)=>{if(key.startsWith('data/backups/')&&step==='close')throw Error('Backup failed');};run(`world().name='Backup failure';changed()`);await run('saveAtlasProject()');delete project.store.hook;assert.equal(project.store.get('data/atlas.json'),before);assert.equal(run('dirty'),true);assert.ok(alerts.pop().includes('Backup failed'));await open(project);
  });
  await test('JSON write failure retains prior data and unsaved state',async()=>{
    const before=project.store.get('data/atlas.json');project.store.hook=async(key,step)=>{if(key==='data/atlas.json'&&step==='close')throw Error('Disk full');};run(`world().name='Disk failure';changed()`);await run('saveAtlasProject()');delete project.store.hook;assert.equal(project.store.get('data/atlas.json'),before);assert.equal(run('dirty'),true);assert.ok(alerts.pop().includes('Disk full'));await open(project);
  });
  await test('external save during image write is detected before JSON commit',async()=>{
    const external=project.store.get('data/atlas.json')+'\n\n';project.store.hook=async(key,step)=>{if(key==='maps/concurrent.png'&&step==='close')project.store.set('data/atlas.json',external);};run(`pendingFiles.set('concurrent',{name:'concurrent.png',file:new Blob(['image'])});changed()`);await run('saveAtlasProject()');delete project.store.hook;assert.equal(project.store.get('data/atlas.json'),external);assert.ok(alerts.pop().includes('во время сохранения'));await open(project);
  });
  await test('malformed project opening leaves current atlas intact',async()=>{
    const before=run('JSON.stringify(data)');context.showDirectoryPicker=async()=>seeded('{broken');await run('openAtlasProject()');assert.equal(run('JSON.stringify(data)'),before);assert.ok(alerts.pop().includes('Не удалось открыть'));
  });
  await test('stale asset requests cannot restore revoked cache entries',async()=>{
    let resolveRead;const delayed=new Promise(resolve=>resolveRead=resolve);
    context.delayedFolder={getDirectoryHandle:async()=>({getFileHandle:async()=>({getFile:()=>delayed})})};context.originalFolder=project;
    run('clearAssetUrls();folder=delayedFolder');const request=run(`ensureAsset(worldId,'delayed-test','delayed.png')`);await flush();run('clearAssetUrls()');resolveRead(new Blob(['image']));assert.equal(await request,null);assert.equal(run(`assetUrls.has(imageKey(worldId,'delayed-test'))`),false);run('folder=originalFolder');
  });
  await test('no user data file was modified by regression checks',()=>assert.equal(fs.readFileSync(path.join(root,'data/atlas.json'),'utf8'),originalJSON));
  console.log('All regression checks passed. Browser painting/input/permissions were not tested.');
})().catch(e=>{console.error(e);process.exitCode=1;});
