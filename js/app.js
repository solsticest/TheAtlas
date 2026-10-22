'use strict';
/* Далёкие Земли v3 — fully client-side multi-world Leaflet atlas.
   Layer bounds are in the pixel coordinate system of their PARENT image,
   with (0,0) at the bottom-left, as in L.CRS.Simple. */
const $ = id => document.getElementById(id);
const uid = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
const defaultTypes = [
  {id:'city',name:'Город',symbol:'🏘'}, {id:'fortress',name:'Крепость',symbol:'🏰'},
  {id:'portal',name:'Портал',symbol:'🌀'}, {id:'dungeon',name:'Подземелье',symbol:'💀'},
  {id:'temple',name:'Храм',symbol:'⛩'}, {id:'port',name:'Порт',symbol:'⚓'},
  {id:'special',name:'Особая локация',symbol:'★'}
];
function demoData(){return {
  version:3, types:structuredClone(defaultTypes), worlds:[{
    id:'demo-world',name:'Демонстрационный мир',image:'demo-world.svg',width:1600,height:1000,
    locations:[
      {id:'demo-capital',name:'Люменпорт',x:705,y:572,type:'city',color:'#e7bf78',minZoom:-6,description:'Столица у реки.'},
      {id:'demo-village',name:'Долинные хутора',x:810,y:473,type:'city',color:'#78d9ac',minZoom:1,description:'Поселения, видимые при приближении.'},
      {id:'demo-fort',name:'Северный бастион',x:510,y:676,type:'fortress',color:'#cf8071',minZoom:-1,description:'Крепость на торговом тракте.'}
    ],
    layers:[{id:'demo-valley',parentId:null,name:'Долина Семи Дорог',image:'demo-region.svg',width:1400,height:1000,
      bounds:{x1:390,y1:300,x2:980,y2:750},showAtZoom:0.5,fadeRange:1,enabled:true}]
  }]
}};
let data = demoData();
let worldId = data.worlds[0].id, selectedMarker = null, selectedRegionId = null;
let folder = null, dirty = false, addingMarker = false, drawState = null, activeTab = 'world';
let markerLayer = null, markerObjects = [], rootOverlay = null, placeholder = null;
let regionOverlays = new Map(), placementObjects = null, epoch = 0, assetGeneration = 0;
let hiddenTypes = new Set(), previewOpacity = 0.65, previewHidden = false;
let undoStack = [], undoBaseline = '', undoPendingFiles = new Map(), undoLastAt = 0, undoLastKind = '';
function resetUndo(){undoStack=[];undoBaseline=JSON.stringify(data);undoPendingFiles=new Map(pendingFiles);undoLastKind='';updateUndoButton();}
function updateUndoButton(){const el=$('undoAction');if(el)el.disabled=!undoStack.length;}
function recordUndo(kind='edit'){
  const current=JSON.stringify(data);if(current===undoBaseline)return;
  const now=Date.now(),coalesce=['slider','article'].includes(kind)&&undoLastKind===kind&&now-undoLastAt<650;
  if(!coalesce){undoStack.push({json:undoBaseline,files:new Map(undoPendingFiles)});if(undoStack.length>60)undoStack.shift();}
  undoBaseline=current;undoPendingFiles=new Map(pendingFiles);undoLastKind=kind;undoLastAt=now;updateUndoButton();
}
function undoAction(){
  if(typeof atlasCanEdit==='function'&&!atlasCanEdit())return;
  finishRegionDrag();if(!undoStack.length)return;
  const previousWorld=worldId,view={center:map.getCenter(),zoom:map.getZoom()};
  if(typeof beforeAtlasHistory==='function')beforeAtlasHistory();
  if(typeof projectGeneration!=='undefined')projectGeneration++;
  const state=undoStack.pop();data=JSON.parse(state.json);pendingFiles.clear();for(const [k,v] of state.files)pendingFiles.set(k,v);
  normalize();undoBaseline=JSON.stringify(data);undoPendingFiles=new Map(pendingFiles);undoLastKind='';
  if(!data.worlds.some(w=>w.id===worldId))worldId=data.worlds[0].id;
  if(selectedRegionId&&!layers().some(r=>r.id===selectedRegionId))selectedRegionId=null;
  selectedMarker=null;$('markerPanel').hidden=true;clearAssetUrls();render(previousWorld===worldId?view:null);dirty=true;status('Последнее изменение отменено. Нажми «Сохранить на диск», чтобы сохранить результат.');updateUndoButton();
  if(typeof refreshAtlasV4==='function')refreshAtlasV4();
}
const pendingFiles = new Map(), assetUrls = new Map(), assetRequests = new Map();
const map = L.map('map', {crs:L.CRS.Simple,minZoom:-6,maxZoom:8,zoomSnap:0,zoomDelta:.25,wheelPxPerZoomLevel:180,wheelDebounceTime:20,attributionControl:false,zoomControl:true,preferCanvas:true});
// Separate Leaflet panes guarantee the detailed images stay ABOVE the world map,
// regardless of asynchronous loading or DOM insertion order.
map.createPane('atlasBasePane');
map.getPane('atlasBasePane').style.zIndex='210';
map.createPane('atlasRegionPane');
map.getPane('atlasRegionPane').style.zIndex='260';
const world = () => data.worlds.find(w => w.id === worldId);
const layers = () => world()?.layers || [];
const region = () => layers().find(x => x.id === selectedRegionId) || null;
const imageKey = (wid, id) => `${wid}:${id || 'root'}`;
const cleanNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;
function status(message){$('status').textContent=message;if(typeof updateSaveState==='function')updateSaveState();}
function changed(kind='edit'){recordUndo(kind);dirty=true;status('Есть несохранённые изменения. Нажми «Сохранить на диск».');if(typeof refreshAtlasV4==='function')refreshAtlasV4();}
function hint(message){$('mapHint').hidden=!message;$('mapHint').textContent=message||'';}
function normalize(candidate=data){
  const data=candidate;
  if(!Array.isArray(data.types)||!data.types.length)data.types=structuredClone(defaultTypes);
  if(!Array.isArray(data.worlds)||!data.worlds.length)throw Error('В атласе должен существовать хотя бы один мир');
  data.version=4;
  for(const w of data.worlds){
    w.width=Math.max(10,cleanNum(w.width)||1600);w.height=Math.max(10,cleanNum(w.height)||1000);
    if(!Array.isArray(w.locations))w.locations=[];
    if(!Array.isArray(w.layers))w.layers=[];
    for(const loc of w.locations){
      if(!loc.id)loc.id=uid();
      if(!data.types.some(t=>t.id===loc.type))loc.type=defaultTypes.find(t=>t.symbol===loc.type)?.id||data.types[0].id;
      if(!/^#[a-f0-9]{6}$/i.test(loc.color||''))loc.color='#d6b77a';
      if(!Number.isFinite(Number(loc.minZoom)))loc.minZoom=-6;
    }
    const ids=new Set();
    for(const r of w.layers){
      if(!r.id||ids.has(r.id))r.id=uid();ids.add(r.id);
      if(r.parentId===undefined)r.parentId=null;
      r.width=Math.max(1,cleanNum(r.width)||1000);r.height=Math.max(1,cleanNum(r.height)||1000);
      if(!r.bounds)r.bounds={x1:0,y1:0,x2:w.width/2,y2:w.height/2};
      for(const k of ['x1','y1','x2','y2'])r.bounds[k]=cleanNum(r.bounds[k]);
      if(r.bounds.x2<=r.bounds.x1)r.bounds.x2=r.bounds.x1+1;
      if(r.bounds.y2<=r.bounds.y1)r.bounds.y2=r.bounds.y1+1;
      if(!Number.isFinite(Number(r.showAtZoom)))r.showAtZoom=1;
      if(!Number.isFinite(Number(r.fadeRange)))r.fadeRange=0.75;
      r.showAtZoom=Number(r.showAtZoom);r.fadeRange=Math.max(0,Number(r.fadeRange));
      r.enabled=r.enabled!==false;
      r.rotation=Number.isFinite(Number(r.rotation))?((Number(r.rotation)%360)+360)%360:0;
    }
    // Reject malformed parent references and cycles without losing the image data.
    for(const r of w.layers){
      if(!r.parentId)continue;
      const visited=new Set([r.id]);let cur=r.parentId,invalid=false;
      while(cur){if(visited.has(cur)){invalid=true;break}visited.add(cur);const p=w.layers.find(a=>a.id===cur);if(!p){invalid=true;break}cur=p.parentId}
      if(invalid)r.parentId=null;
    }
  }
}
normalize();
function setTab(id){
  activeTab=id;
  for(const el of document.querySelectorAll('#tabs .tab')){let active=el.dataset.panel===id;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
  for(const [tab,section] of [['world','worldSection'],['regions','regionsSection'],['markers','markersSection'],['catalog','catalogSection']])$(section).hidden=(tab!==id);
  if(id==='world')$('worldName').value=world().name;
  if(id==='regions')renderRegionList();
}
function worldList(){
  const select=$('worldSelect');select.replaceChildren();
  for(const w of data.worlds)select.add(new Option(w.name,w.id));select.value=worldId;
}
function refreshTypes(){
  const select=$('markerType'),previous=select.value;select.replaceChildren();
  for(const t of data.types)select.add(new Option(t.symbol+' '+t.name,t.id));
  if(data.types.some(t=>t.id===previous))select.value=previous;
  $('typesList').replaceChildren();$('typeFilters').replaceChildren();
  for(const t of data.types){
    const entry=document.createElement('div');entry.className='type-item';
    const title=document.createElement('span');title.className='type-name';title.textContent=t.symbol+' '+t.name;
    const edit=document.createElement('button');edit.textContent='✎';edit.title='Редактировать';edit.onclick=()=>editType(t);
    const del=document.createElement('button');del.textContent='×';del.title='Удалить';del.onclick=()=>deleteType(t);
    entry.append(title,edit,del);$('typesList').append(entry);
    const label=document.createElement('label');label.className='filter-item';
    const check=document.createElement('input');check.type='checkbox';check.checked=!hiddenTypes.has(t.id);
    check.onchange=()=>{check.checked?hiddenTypes.delete(t.id):hiddenTypes.add(t.id);updateMarkerVisibility()};
    const name=document.createElement('span');name.textContent=t.symbol+' '+t.name;label.append(check,name);$('typeFilters').append(label);
  }
}
function editType(t){
  const name=prompt('Название типа:',t?.name||'');if(!name?.trim())return;
  const symbol=prompt('Символ (эмодзи или знак):',t?.symbol||'◆');if(symbol===null)return;
  if(t){t.name=name.trim();t.symbol=symbol.trim()||'◆'}else data.types.push({id:uid(),name:name.trim(),symbol:symbol.trim()||'◆'});
  changed();refreshTypes();renderMarkers();
}
function deleteType(t){
  if(data.types.length<2){alert('Нужен хотя бы один тип');return}
  if(!confirm('Удалить тип «'+t.name+'»? Его маркеры перейдут в первый оставшийся тип.'))return;
  data.types=data.types.filter(x=>x.id!==t.id);const fallback=data.types[0].id;
  for(const w of data.worlds)for(const m of w.locations)if(m.type===t.id)m.type=fallback;
  hiddenTypes.delete(t.id);changed();refreshTypes();renderMarkers();
}
function iconFor(loc){
  const el=document.createElement('div');el.className='pin';el.style.setProperty('--pin-color',loc.color||'#d6b77a');
  el.textContent=data.types.find(t=>t.id===loc.type)?.symbol||'◆';
  return L.divIcon({html:el.outerHTML,iconSize:[30,30],iconAnchor:[15,15],className:''});
}
function markerEditor(m){
  selectedMarker=m;setTab('markers');refreshPlacement();updateRegions();$('markerPanel').hidden=false;
  $('markerName').value=m.name;$('markerType').value=m.type;$('markerDescription').value=m.description||'';
  $('markerColor').value=m.color||'#d6b77a';$('markerHex').value=m.color||'#d6b77a';
  let v=String(m.minZoom??-6);
  if(!Array.from($('markerImportance').options).some(x=>x.value===v))$('markerImportance').add(new Option('Пользовательский: '+v,v));
  $('markerImportance').value=v;
}
function renderMarkers(){
  if(markerLayer)map.removeLayer(markerLayer);
  markerLayer=L.layerGroup().addTo(map);markerObjects=[];
  for(const loc of world().locations){
    const marker=L.marker([loc.y,loc.x],{icon:iconFor(loc),draggable:typeof atlasCanEdit!=='function'||atlasCanEdit()});
    const tooltip=document.createElement('span');tooltip.textContent=loc.name||'Без названия';marker.bindTooltip(tooltip);
    marker.on('click',e=>{if(typeof atlasMarkerClick==='function')atlasMarkerClick(loc,e);else markerEditor(loc)});
    marker.on('dragend',()=>{const p=marker.getLatLng();loc.x=p.lng;loc.y=p.lat;changed()});
    markerObjects.push({marker,loc});
  }
  updateMarkerVisibility();
}
function updateMarkerVisibility(){
  if(!markerLayer)return;
  const zoom=map.getZoom();
  for(const {marker,loc} of markerObjects){
    const visible=zoom>=Number(loc.minZoom??-6)&&!hiddenTypes.has(loc.type);
    if(visible&&!markerLayer.hasLayer(marker))markerLayer.addLayer(marker);
    if(!visible&&markerLayer.hasLayer(marker))markerLayer.removeLayer(marker);
  }
}
function findLayer(id){return layers().find(r=>r.id===id)||null}
function depthOf(r){let depth=0,p=r.parentId,guard=0;while(p&&guard++<100){depth++;p=findLayer(p)?.parentId}return depth}
function worldBox(r,seen=new Set()){
  const w=world();if(!r)return {x1:0,y1:0,x2:w.width,y2:w.height};
  if(seen.has(r.id))return null;seen.add(r.id);
  const parent=r.parentId?findLayer(r.parentId):null;
  if(r.parentId&&!parent)return null;
  const box=worldBox(parent,seen);if(!box)return null;
  const pw=parent?.width||w.width,ph=parent?.height||w.height;
  return {x1:box.x1+r.bounds.x1*(box.x2-box.x1)/pw,
          x2:box.x1+r.bounds.x2*(box.x2-box.x1)/pw,
          y1:box.y1+r.bounds.y1*(box.y2-box.y1)/ph,
          y2:box.y1+r.bounds.y2*(box.y2-box.y1)/ph};
}
function intoParentCoords(point,parentId){
  const parent=parentId?findLayer(parentId):null;
  const pb=worldBox(parent);if(!pb)return {x:point.x,y:point.y};
  return {x:(point.x-pb.x1)*(parent?.width||world().width)/(pb.x2-pb.x1),
          y:(point.y-pb.y1)*(parent?.height||world().height)/(pb.y2-pb.y1)};
}
function globalToLocalBox(box,parentId){
  const a=intoParentCoords({x:box.x1,y:box.y1},parentId),b=intoParentCoords({x:box.x2,y:box.y2},parentId);
  return {x1:a.x,y1:a.y,x2:b.x,y2:b.y};
}
function asBounds(box){return [[box.y1,box.x1],[box.y2,box.x2]]}
function intersectsViewport(box){
  const b=map.getBounds(),extra=Math.max(box.x2-box.x1,box.y2-box.y1)*0.1;
  return b.getEast()>=box.x1-extra&&b.getWest()<=box.x2+extra&&b.getNorth()>=box.y1-extra&&b.getSouth()<=box.y2+extra;
}
function assetName(wid,id){return imageKey(wid,id)}
async function ensureAsset(wid,id,filename){
  if(!filename)return null;
  const key=assetName(wid,id);
  if(assetUrls.has(key))return assetUrls.get(key);
  if(pendingFiles.has(key)){
    const url=URL.createObjectURL(pendingFiles.get(key).file);assetUrls.set(key,url);return url;
  }
  if(!folder)return 'maps/'+encodeURIComponent(filename);
  if(assetRequests.has(key))return assetRequests.get(key);
  const projectFolder=folder,generation=assetGeneration;
  const req=(async()=>{
    try{
      const maps=await projectFolder.getDirectoryHandle('maps');
      const file=await(await maps.getFileHandle(filename)).getFile();
      if(generation!==assetGeneration)return null;
      const url=URL.createObjectURL(file);assetUrls.set(key,url);return url;
    }catch(err){if(generation===assetGeneration)status('Не найдено изображение '+filename+' в maps/ ('+err.message+').');return null}
    finally{if(generation===assetGeneration)assetRequests.delete(key)}
  })();
  assetRequests.set(key,req);return req;
}
function clearAssetUrls(){
  assetGeneration++;
  for(const url of assetUrls.values())if(url.startsWith('blob:'))URL.revokeObjectURL(url);
  assetUrls.clear();assetRequests.clear();
}
function detachLayers(){
  epoch++;
  if(rootOverlay){map.removeLayer(rootOverlay);rootOverlay=null}
  if(placeholder){map.removeLayer(placeholder);placeholder=null}
  for(const overlay of regionOverlays.values())map.removeLayer(overlay);
  regionOverlays.clear();destroyPlacement();
}
async function setRootImage(wid,token){
  const w=data.worlds.find(x=>x.id===wid);if(!w)return;
  if(!w.image){
    if(token!==epoch)return;
    placeholder=L.rectangle([[0,0],[w.height,w.width]],{pane:'atlasBasePane',color:'#b5986d',weight:2,fillColor:'#27303d',fillOpacity:1}).addTo(map);
    return;
  }
  const url=await ensureAsset(wid,null,w.image);if(token!==epoch)return;
  if(url){rootOverlay=L.imageOverlay(url,[[0,0],[w.height,w.width]],{interactive:false,pane:'atlasBasePane'}).addTo(map)}
  else placeholder=L.rectangle([[0,0],[w.height,w.width]],{pane:'atlasBasePane',color:'#bd896f',fillOpacity:0.2}).addTo(map);
  updateRegions();
  reorderImages(); // Root may load after a child overlay.
}
// Make the Leaflet-managed element the OUTER positioning container.
// Leaflet applies its animated translate/scale only to this element.
// The bitmap is created INSIDE it, before Leaflet inserts or positions the
// overlay. Never reparent an already-mounted image: that leaves a stale
// inline transform on the bitmap and causes jumps or invisible regions.
const RotatableImageOverlay = L.ImageOverlay.extend({
  _initImage: function(){
    L.ImageOverlay.prototype._initImage.call(this);
    const bitmap = this._image;
    const positioner = document.createElement('div');
    positioner.className = bitmap.className + ' atlas-image-positioner';
    // Keep only the wrapper registered with Leaflet's animation lifecycle.
    bitmap.className = 'atlas-rotated-content';
    bitmap.style.transform = '';
    bitmap.style.translate = '';
    bitmap.style.scale = '';
    bitmap.style.rotate = '0deg';
    bitmap.style.left = '0';
    bitmap.style.top = '0';
    bitmap.style.width = '100%';
    bitmap.style.height = '100%';
    bitmap.style.position = 'absolute';
    positioner.appendChild(bitmap);
    this._atlasBitmap = bitmap;
    this._image = positioner;
  },
  setRotation: function(degrees){
    if(this._atlasBitmap)this._atlasBitmap.style.rotate = String(degrees || 0) + 'deg';
    return this;
  }
});

function loadedOverlay(r){return regionOverlays.get(r.id)}
function effectiveOpacity(r){
  if(selectedRegionId===r.id&&activeTab==='regions')return previewHidden?0:previewOpacity;
  if(mustShowForEditor(r))return 1;
  if(!r.enabled)return 0;
  const zoom=map.getZoom(),delta=zoom-r.showAtZoom;
  if(delta<0)return 0;
  return r.fadeRange<=0?1:Math.min(1,Math.max(0.001,delta/r.fadeRange));
}
function mustShowForEditor(r){
  if(activeTab!=='regions'||!selectedRegionId)return false;
  let cur=findLayer(selectedRegionId);
  while(cur){if(cur.id===r.id)return true;cur=cur.parentId?findLayer(cur.parentId):null}
  return false;
}
async function loadRegionOverlay(r,box,token){
  const wid=worldId;
  const url=await ensureAsset(wid,r.id,r.image);
  if(token!==epoch||wid!==worldId||!findLayer(r.id)||!url||loadedOverlay(r))return;
  const overlay=new RotatableImageOverlay(url,asBounds(worldBox(findLayer(r.id))),{opacity:0,interactive:false,className:'atlas-region-image',pane:'atlasRegionPane'});
  overlay._atlasBoundsKey = JSON.stringify(worldBox(findLayer(r.id)));
  regionOverlays.set(r.id,overlay);
  updateRegions();
}
function reorderImages(){
  // Root and regions are isolated in separate panes; never reorder the root.
  for(const r of [...layers()].sort((a,b)=>depthOf(a)-depthOf(b))){
    const overlay=regionOverlays.get(r.id);
    if(overlay&&map.hasLayer(overlay))overlay.bringToFront();
  }
}
function updateRegions(){
  if(!world())return;
  let layerOrderChanged=false;
  const token=epoch,zoom=map.getZoom();
  for(const r of layers()){
    const box=worldBox(r),overlay=loadedOverlay(r);
    if(!box){if(overlay&&map.hasLayer(overlay))map.removeLayer(overlay);continue}
    const forced=mustShowForEditor(r);
    const nearZoom=zoom>=r.showAtZoom-0.8;
    const should=!!r.image&&((r.enabled&&nearZoom&&intersectsViewport(box))||forced);
    if(should&&!overlay)void loadRegionOverlay(r,box,token);
    if(overlay){
      if(should){
        // Do not reset Leaflet's image transform on each fractional zoom frame.
        // setBounds() during zoom animations causes the region to jump sideways.
        const boundsKey=JSON.stringify(box);
        if(overlay._atlasBoundsKey!==boundsKey){overlay.setBounds(asBounds(box));overlay._atlasBoundsKey=boundsKey;}
        // CSS individual rotate composes with Leaflet's transform during animated zoom.
        if(!map.hasLayer(overlay)){overlay.addTo(map);layerOrderChanged=true;}
        overlay.setRotation(r.rotation||0);
        overlay.setOpacity(effectiveOpacity(r));
      }else{
        if(map.hasLayer(overlay)){map.removeLayer(overlay);layerOrderChanged=true;}
        regionOverlays.delete(r.id);
        // Unload no-longer-needed bitmaps instead of retaining every visited region.
        const key=imageKey(worldId,r.id),url=assetUrls.get(key);
        if(url?.startsWith('blob:'))URL.revokeObjectURL(url);
        assetUrls.delete(key);
      }
    }
  }
  // Reordering DOM image nodes on every zoom frame interrupts Leaflet's
  // animated transforms and visibly throws regional images sideways.
  if(layerOrderChanged)reorderImages();
}
function render(view=null){
  finishRegionDrag();cancelDrawing();detachLayers();
  worldList();refreshTypes();$('worldName').value=world().name;
  if(!findLayer(selectedRegionId))selectedRegionId=null;
  if(!selectedRegionId)$('regionEditor').hidden=true;
  else fillRegionEditor();
  renderRegionList();
  if(selectedMarker&&!world().locations.includes(selectedMarker)){selectedMarker=null;$('markerPanel').hidden=true}
  const w=world();
  map.stop();map.setMaxBounds([[-w.height,-w.width],[w.height*2,w.width*2]]);
  if(view)map.setView(view.center,view.zoom,{animate:false});
  else map.fitBounds([[0,0],[w.height,w.width]],{padding:[28,28],animate:false});
  const token=epoch;void setRootImage(worldId,token);
  renderMarkers();updateRegions();refreshPlacement();
  if(typeof refreshAtlasV4==='function')refreshAtlasV4();
}
function flattenRegionTree(){
  const out=[],visited=new Set();
  function walk(parent,level){
    for(const r of layers().filter(x=>(x.parentId||null)===parent)){
      if(visited.has(r.id))continue;visited.add(r.id);out.push({r,level});walk(r.id,level+1);
    }
  }
  walk(null,0);for(const r of layers())if(!visited.has(r.id))out.push({r,level:0});
  return out;
}
function renderRegionList(){
  const box=$('regionList');box.replaceChildren();
  if(!layers().length){const empty=document.createElement('p');empty.className='region-empty';empty.textContent='Пока нет подробных карт. Добавь первую — например, регион из Wonderdraft.';box.append(empty);}
  for(const {r,level} of flattenRegionTree()){
    const button=document.createElement('button');button.className='region-item'+(r.id===selectedRegionId?' active':'');
    button.style.paddingLeft=(10+level*17)+'px';
    const label=document.createElement('span');label.textContent=(level?'↳ ':'▱ ')+r.name;
    const meta=document.createElement('small');meta.textContent='z ≥ '+r.showAtZoom;
    button.append(label,meta);button.onclick=()=>selectRegion(r.id);box.append(button);
  }
}
function isDescendant(candidate,ancestor){
  let p=findLayer(candidate)?.parentId,guard=0;
  while(p&&guard++<100){if(p===ancestor)return true;p=findLayer(p)?.parentId}return false;
}
function fillRegionEditor(){
  const r=region();if(!r)return;
  $('regionEditor').hidden=false;$('regionEditorHeading').textContent='Карта: '+r.name;
  $('regionName').value=r.name;
  $('regionParent').replaceChildren(new Option('🌍 Карта мира',''));
  for(const entry of flattenRegionTree()){
    const p=entry.r;if(p.id===r.id||isDescendant(p.id,r.id))continue;
    $('regionParent').add(new Option('　'.repeat(entry.level)+p.name,p.id));
  }
  $('regionParent').value=r.parentId||'';
  $('regionZoom').value=String(r.showAtZoom);$('regionZoomText').textContent=r.showAtZoom.toFixed(2);
  $('regionFade').value=String(r.fadeRange);$('regionFadeText').textContent=r.fadeRange.toFixed(2);
  $('regionOpacity').value=String(previewOpacity);$('regionOpacityText').textContent=Math.round(previewOpacity*100)+'%';
  $('regionEnabled').checked=r.enabled;
  $('regionRotation').value=String(Math.round(r.rotation||0));$('regionRotationText').textContent=Math.round(r.rotation||0)+'°';
  $('regionFileInfo').textContent=r.image?`${r.image} • ${r.width} × ${r.height} px`:'Изображение ещё не загружено';
  $('blinkRegion').textContent=previewHidden?'Показать слой':'◐ Сравнить с родителем';
}
function selectRegion(id){
  selectedRegionId=id;previewHidden=false;previewOpacity=0.65;
  setTab('regions');fillRegionEditor();renderRegionList();
  refreshPlacement();updateRegions();
}
function destroyPlacement(){
  if(!placementObjects)return;
  map.removeLayer(placementObjects.rectangle);
  for(const m of placementObjects.handles)map.removeLayer(m);
  placementObjects=null;
}
function makeHandle(pos,type){
  const el=document.createElement('div');el.className='placement-handle'+(type==='center'?' placement-center':type==='rotate'?' placement-rotate':'');
  return L.marker(pos,{draggable:true,icon:L.divIcon({html:el.outerHTML,iconSize:[15,15],iconAnchor:[7,7],className:''}),zIndexOffset:1800}).addTo(map);
}
let shiftResizePressed=false;
window.addEventListener('keydown',e=>{if(e.key==='Shift')shiftResizePressed=true});
window.addEventListener('keyup',e=>{if(e.key==='Shift')shiftResizePressed=false});
window.addEventListener('blur',()=>{shiftResizePressed=false});
function placementPoints(box,degrees){
  const cx=(box.x1+box.x2)/2,cy=(box.y1+box.y2)/2;
  const center=map.latLngToContainerPoint([cy,cx]);
  const rad=degrees*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
  const raw=[[box.y2,box.x1],[box.y2,box.x2],[box.y1,box.x2],[box.y1,box.x1],[cy,cx]];
  const rotatePoint=([y,x])=>{const p=map.latLngToContainerPoint([y,x]),dx=p.x-center.x,dy=p.y-center.y;return map.containerPointToLatLng([center.x+dx*cos-dy*sin,center.y+dx*sin+dy*cos]);};
  const corners=raw.map(rotatePoint);
  const topMid=map.latLngToContainerPoint([(box.y2),cx]);
  const dx=topMid.x-center.x,dy=topMid.y-center.y;
  const rotatedTop=[center.x+dx*cos-dy*sin,center.y+dx*sin+dy*cos];
  const distance=Math.hypot(dx,dy)||1;
  const handle=map.containerPointToLatLng([rotatedTop[0]+(rotatedTop[0]-center.x)/distance*34,rotatedTop[1]+(rotatedTop[1]-center.y)/distance*34]);
  return [...corners.map(p=>[p.lat,p.lng]),[cy,cx],[handle.lat,handle.lng]];
}
function refreshPlacement(){
  destroyPlacement();const r=region();if(!r||activeTab!=='regions'||(typeof atlasCanEdit==='function'&&!atlasCanEdit()))return;
  const b=worldBox(r);if(!b)return;
  const rectangle=L.rectangle(asBounds(b),{color:'#f0c77d',weight:2,dashArray:'7 6',fillColor:'#eabb75',fillOpacity:0.07,interactive:false}).addTo(map);
  const points=placementPoints(b,r.rotation||0);
  const handles=points.map((p,i)=>makeHandle(p,i===4?'center':i===5?'rotate':'corner'));
  function updateGraphic(){
    const box=worldBox(r);if(!box)return;
    rectangle.setBounds(asBounds(box));
    const next=placementPoints(box,r.rotation||0);
    handles.forEach((m,i)=>m.setLatLng(next[i]));
    updateRegions();
  }
  // Keep modifier state independently: Leaflet drag events do not consistently
  // expose the underlying DOM MouseEvent across browsers.
  handles.forEach((h,index)=>{
    let startAspect = null;
    h.on('dragstart',()=>{
      const start=worldBox(r);
      startAspect=start ? (start.x2-start.x1)/Math.max(1e-9,start.y2-start.y1) : null;
    });
    h.on('drag',()=>{
      const current=worldBox(r),ll=h.getLatLng();if(!current)return;
      const a={...current};
      if(index===5){
        const c=map.latLngToContainerPoint([(a.y1+a.y2)/2,(a.x1+a.x2)/2]);
        const mouse=map.latLngToContainerPoint(ll);
        r.rotation=((Math.atan2(mouse.x-c.x,c.y-mouse.y)*180/Math.PI)%360+360)%360;
        $('regionRotation').value=String(Math.round(r.rotation));$('regionRotationText').textContent=Math.round(r.rotation)+'°';
        updateGraphic();return;
      }
      if(index===4){const width=a.x2-a.x1,height=a.y2-a.y1;
        a.x1=ll.lng-width/2;a.x2=ll.lng+width/2;a.y1=ll.lat-height/2;a.y2=ll.lat+height/2;
      }else{
        // The opposite corner stays fixed; Shift constrains the dragged corner
        // to the aspect ratio at the beginning of this resize gesture.
        const left=index===0||index===3, top=index===0||index===1;
        const fixedX=left?a.x2:a.x1, fixedY=top?a.y1:a.y2;
        const center=map.latLngToContainerPoint([(a.y1+a.y2)/2,(a.x1+a.x2)/2]);
        const cursor=map.latLngToContainerPoint(ll),angle=-(r.rotation||0)*Math.PI/180;
        const dx=cursor.x-center.x,dy=cursor.y-center.y;
        const unrotated=map.containerPointToLatLng([center.x+dx*Math.cos(angle)-dy*Math.sin(angle),center.y+dx*Math.sin(angle)+dy*Math.cos(angle)]);
        let w=Math.max(1,Math.abs(unrotated.lng-fixedX));
        let ht=Math.max(1,Math.abs(unrotated.lat-fixedY));
        if(shiftResizePressed && startAspect && Number.isFinite(startAspect)){
          // Follow whichever axis has moved farther relative to the current
          // aspect ratio, avoiding an unexpected shrink when Shift is pressed.
          if(w/ht >= startAspect) ht=w/startAspect;
          else w=ht*startAspect;
        }
        if(left)a.x1=fixedX-w;else a.x2=fixedX+w;
        if(top)a.y2=fixedY+ht;else a.y1=fixedY-ht;
      }
      r.bounds=globalToLocalBox(a,r.parentId);updateGraphic();
    });
    h.on('dragend',()=>{startAspect=null;changed();updateGraphic()});
  });
  placementObjects={rectangle,handles};
}
function cancelDrawing(){drawState=null;hint('');$('drawRegion').classList.remove('selected');}
function drawRegionClick(latlng){
  const r=region();if(!r||!drawState)return;
  if(drawState.step===0){drawState.step=1;drawState.first=latlng;hint('Кликни второй раз на противоположном углу участка карты.');return}
  const x1=Math.min(drawState.first.lng,latlng.lng),x2=Math.max(drawState.first.lng,latlng.lng),
        y1=Math.min(drawState.first.lat,latlng.lat),y2=Math.max(drawState.first.lat,latlng.lat);
  if(x2-x1<1||y2-y1<1){hint('Выдели область побольше — нужны два разных угла.');return}
  r.bounds=globalToLocalBox({x1,y1,x2,y2},r.parentId);
  cancelDrawing();changed();refreshPlacement();updateRegions();map.fitBounds(asBounds(worldBox(r)),{padding:[45,45],animate:false});
}
function addRegion(){
  const name=prompt('Название подробной карты:', 'Новый регион');if(!name?.trim())return;
  const parent=region();const parentId=parent?.id||null;
  const b=parent?worldBox(parent):worldBox(null);
  const px=parent?.width||world().width,py=parent?.height||world().height;
  const r={id:uid(),name:name.trim(),image:null,width:1200,height:800,parentId,
    bounds:{x1:px*.25,y1:py*.25,x2:px*.75,y2:py*.75},showAtZoom:Math.min(7,Math.max(-5,map.getZoom()+0.5)),fadeRange:0.75,enabled:true};
  world().layers.push(r);changed();selectRegion(r.id);
  if(b)map.fitBounds(asBounds(worldBox(r)),{padding:[45,45],animate:false});
  status('Карта-слой создана. Загрузите изображение и подгоните область мышью.');
}
function deleteRegion(){
  const r=region();if(!r)return;
  const descendants=layers().filter(x=>isDescendant(x.id,r.id));
  if(!confirm('Удалить карту «'+r.name+'»'+(descendants.length?' и вложенные карты ('+descendants.length+')':'')+'?'))return;
  const ids=new Set([r.id,...descendants.map(x=>x.id)]);
  world().layers=layers().filter(x=>!ids.has(x.id));
  for(const id of ids){const key=imageKey(worldId,id);pendingFiles.delete(key);
    const u=assetUrls.get(key);if(u?.startsWith('blob:'))URL.revokeObjectURL(u);assetUrls.delete(key);
    const layer=regionOverlays.get(id);if(layer)map.removeLayer(layer);regionOverlays.delete(id);
  }
  selectedRegionId=null;destroyPlacement();$('regionEditor').hidden=true;changed();renderRegionList();updateRegions();
}
function stageImage(file,wid,id,callback){
  const url=URL.createObjectURL(file),img=new Image(),generation=projectGeneration;imageJobs++;
  img.onload=()=>{
    try{
    const target=data.worlds.find(w=>w.id===wid);
    if(generation!==projectGeneration||!target||(id&&!target.layers.some(r=>r.id===id))){URL.revokeObjectURL(url);return;}
    const ext=(file.name.split('.').pop()||'png').toLowerCase();
    const filename=(id||wid)+'-'+Date.now()+'.'+ext;
    const key=imageKey(wid,id);const old=assetUrls.get(key);
    if(old?.startsWith('blob:'))URL.revokeObjectURL(old);
    assetUrls.set(key,url);pendingFiles.set(key,{name:filename,file});callback({filename,width:img.naturalWidth,height:img.naturalHeight});
    changed();
    }finally{imageJobs--;}
  };
  img.onerror=()=>{imageJobs--;URL.revokeObjectURL(url);alert('Не удалось прочитать изображение');};
  img.src=url;
}
async function openProject(){return openAtlasProject();}
async function saveProject(){return saveAtlasProject();}
function exportJSON(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='atlas-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status('JSON экспортирован. ВАЖНО: для полной резервной копии сохрани также папку maps/!');
}
function switchWorld(id){
  if(!data.worlds.some(w=>w.id===id))return;
  if(typeof beforeAtlasWorldSwitch==='function')beforeAtlasWorldSwitch();
  selectedRegionId=null;selectedMarker=null;previewHidden=false;worldId=id;
  clearAssetUrls(); // Release previous world's large bitmap blobs; reload lazily when needed.
  $('markerPanel').hidden=true;render();
}
// Drag the selected region from anywhere inside its bounds, even when corners are off-screen.
// Capture the initial press before Leaflet's own map-drag handler receives it.
let regionDrag = null, spacePan = false;
const mapElement = map.getContainer();
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && !e.repeat && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(document.activeElement?.tagName || '')) {
    spacePan = true;
    if (activeTab === 'regions' && selectedRegionId) e.preventDefault();
  }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') spacePan = false; });
window.addEventListener('blur', () => { spacePan = false; });
mapElement.addEventListener('mousedown', e => {
  if (e.button !== 0 || spacePan || e.shiftKey || activeTab !== 'regions' || drawState || addingMarker || (typeof atlasMapToolActive==='function'&&atlasMapToolActive())) return;
  const r = region();
  if (!r || !r.image || previewHidden) return;
  // Leaflet markers, resize handles and map controls keep their own drag/click actions.
  if (e.target.closest('.leaflet-marker-icon, .leaflet-control, .leaflet-popup, button, input')) return;
  const b = worldBox(r);
  if (!b) return;
  const point = map.mouseEventToLatLng(e);
  // Hit-test the rotated image in screen pixels, rather than its unrotated bounding box.
  const c=map.latLngToContainerPoint([(b.y1+b.y2)/2,(b.x1+b.x2)/2]);
  const p=map.mouseEventToContainerPoint(e),theta=-(r.rotation||0)*Math.PI/180;
  const dx=p.x-c.x,dy=p.y-c.y,rx=dx*Math.cos(theta)-dy*Math.sin(theta),ry=dx*Math.sin(theta)+dy*Math.cos(theta);
  const size=map.latLngToContainerPoint([b.y2,b.x2]).subtract(map.latLngToContainerPoint([b.y1,b.x1]));
  if(Math.abs(rx)>Math.abs(size.x)/2||Math.abs(ry)>Math.abs(size.y)/2)return;
  regionDrag = {id:r.id, worldId, start:point, initial:{...b}, moved:false};
  map.dragging.disable();
  mapElement.classList.add('atlas-moving-region');
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);
window.addEventListener('mousemove', e => {
  if (!regionDrag) return;
  if (!(e.buttons & 1)) {finishRegionDrag();return;}
  const r = findLayer(regionDrag.id);
  if (!r || worldId !== regionDrag.worldId && regionDrag.worldId !== undefined) {finishRegionDrag();return;}
  const point = map.mouseEventToLatLng(e), dx=point.lng-regionDrag.start.lng, dy=point.lat-regionDrag.start.lat;
  if (Math.abs(dx)+Math.abs(dy) < 0.001 && !regionDrag.moved) return;
  regionDrag.moved=true;
  const b=regionDrag.initial;
  r.bounds=globalToLocalBox({x1:b.x1+dx,x2:b.x2+dx,y1:b.y1+dy,y2:b.y2+dy},r.parentId);
  if (placementObjects) {
    const current=worldBox(r);
    placementObjects.rectangle.setBounds(asBounds(current));
    const points=placementPoints(current,r.rotation||0);
    placementObjects.handles.forEach((h,i)=>h.setLatLng(points[i]));
  }
  updateRegions();
  e.preventDefault();
}, true);
function finishRegionDrag(){
  if (!regionDrag) return;
  const moved=regionDrag.moved;
  regionDrag=null;
  mapElement.classList.remove('atlas-moving-region');
  map.dragging.enable();
  if (moved) changed();
}
window.addEventListener('mouseup', finishRegionDrag, true);
window.addEventListener('blur', finishRegionDrag);

// Let Leaflet handle wheel animation and cursor anchoring itself.
 // Ctrl changes sensitivity, not zoom position or animation mode.
 // A modest multiplier keeps zoom faster without abrupt jumps.
mapElement.addEventListener('wheel',e=>{
  map.options.wheelPxPerZoomLevel=e.ctrlKey?95:180;
},{capture:true,passive:true});
window.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='z'){
    const target=e.target;
    if(target?.isContentEditable||/^(TEXTAREA|SELECT)$/.test(target?.tagName||'')||(target?.tagName==='INPUT'&&target.type!=='range'))return;
    e.preventDefault();undoAction();
  }
});
$('undoAction').onclick=undoAction;

// Core Leaflet map events
map.on('click',e=>{
  if(typeof atlasMapClick==='function'&&atlasMapClick(e.latlng))return;
  if(typeof atlasCanEdit==='function'&&!atlasCanEdit())return;
  if(drawState){drawRegionClick(e.latlng);return}
  if(!addingMarker)return;
  addingMarker=false;$('add').classList.remove('selected');
  const m={id:uid(),x:e.latlng.lng,y:e.latlng.lat,name:'Новая локация',type:data.types[0].id,color:'#d6b77a',minZoom:-6,description:''};
  world().locations.push(m);changed();renderMarkers();markerEditor(m);
});
map.on('zoom zoomend moveend',()=>{updateMarkerVisibility();updateRegions()});
// UI events
$('tabs').addEventListener('click',e=>{const button=e.target.closest('[data-panel]');if(!button)return;addingMarker=false;$('add').classList.remove('selected');cancelDrawing();setTab(button.dataset.panel);refreshPlacement();updateRegions()});
$('worldSelect').onchange=e=>switchWorld(e.target.value);
$('openFolder').onclick=openProject;$('save').onclick=saveProject;
$('toggleSidebar').onclick=()=>{document.querySelector('main').classList.toggle('collapsed');setTimeout(()=>map.invalidateSize(),250)};
$('newWorld').onclick=()=>{
  const name=prompt('Название нового мира:');if(!name?.trim())return;
  const w={id:uid(),name:name.trim(),image:null,width:1600,height:1000,locations:[],layers:[]};
  data.worlds.push(w);changed();switchWorld(w.id);
};
$('saveWorld').onclick=()=>{world().name=$('worldName').value.trim()||world().name;changed();worldList()};
$('deleteWorld').onclick=()=>{
  if(data.worlds.length===1){alert('Последний мир удалить нельзя');return}
  if(!confirm('Удалить мир и все его маркеры и карты-слои?'))return;
  data.worlds=data.worlds.filter(w=>w.id!==worldId);changed();switchWorld(data.worlds[0].id);
};
$('imageFile').onchange=e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  const wid=worldId;
  stageImage(file,wid,null,({filename,width,height})=>{
    const w=data.worlds.find(x=>x.id===wid);if(!w)return;
    // Keep existing marker and placement relative positions when replacing root map.
    const sx=width/w.width,sy=height/w.height;
    for(const m of w.locations){m.x*=sx;m.y*=sy}
    for(const r of w.layers.filter(x=>!x.parentId)){
      for(const key of ['x1','x2'])r.bounds[key]*=sx;
      for(const key of ['y1','y2'])r.bounds[key]*=sy;
    }
    w.image=filename;w.width=width;w.height=height;
    if(wid===worldId)render();
  });
};
$('add').onclick=()=>{cancelDrawing();addingMarker=!addingMarker;$('add').classList.toggle('selected',addingMarker);
  hint(addingMarker?'Кликни на карте, чтобы поставить новый маркер.':'');};
$('saveMarker').onclick=()=>{
  if(!selectedMarker)return;
  selectedMarker.name=$('markerName').value.trim()||'Без названия';selectedMarker.type=$('markerType').value;
  selectedMarker.description=$('markerDescription').value;selectedMarker.color=$('markerColor').value;
  selectedMarker.minZoom=Number($('markerImportance').value);changed();renderMarkers();
};
$('deleteMarker').onclick=()=>{
  if(!selectedMarker||!confirm('Удалить маркер?'))return;
  world().locations=world().locations.filter(x=>x.id!==selectedMarker.id);selectedMarker=null;
  $('markerPanel').hidden=true;changed();renderMarkers();
};
$('cancelMarker').onclick=()=>{selectedMarker=null;$('markerPanel').hidden=true};
$('newType').onclick=()=>editType(null);
$('showAllTypes').onclick=()=>{hiddenTypes.clear();refreshTypes();updateMarkerVisibility()};
$('hideAllTypes').onclick=()=>{hiddenTypes=new Set(data.types.map(x=>x.id));refreshTypes();updateMarkerVisibility()};
$('markerColor').oninput=e=>$('markerHex').value=e.target.value;
$('markerHex').onchange=e=>{const value=e.target.value.trim();if(/^#[0-9a-f]{6}$/i.test(value))$('markerColor').value=value;else $('markerHex').value=$('markerColor').value};
$('newRegion').onclick=addRegion;
$('regionName').onchange=e=>{const r=region();if(!r)return;r.name=e.target.value.trim()||r.name;changed();renderRegionList();$('regionEditorHeading').textContent='Карта: '+r.name};
$('regionParent').onchange=e=>{
  const r=region();if(!r)return;
  const box=worldBox(r);if(!box)return;
  r.parentId=e.target.value||null;
  r.bounds=globalToLocalBox(box,r.parentId);changed();renderRegionList();refreshPlacement();updateRegions();
};
$('regionImage').onchange=e=>{
  const file=e.target.files[0];e.target.value='';const r=region();if(!file||!r)return;
  const wid=worldId,rid=r.id;
  stageImage(file,wid,rid,({filename,width,height})=>{
    const target=data.worlds.find(w=>w.id===wid)?.layers.find(x=>x.id===rid);
    if(!target)return;target.image=filename;target.width=width;target.height=height;
    if(worldId===wid){
      const old=regionOverlays.get(rid);if(old){map.removeLayer(old);regionOverlays.delete(rid)}
      fillRegionEditor();updateRegions();
    }
  });
};
$('drawRegion').onclick=()=>{
  const r=region();if(!r)return;
  addingMarker=false;$('add').classList.remove('selected');
  if(drawState){cancelDrawing();return}
  drawState={step:0};$('drawRegion').classList.add('selected');
  hint('Кликни на карте по первому углу участка. Затем укажи противоположный угол.');
};
$('zoomToRegion').onclick=()=>{const r=region();if(r){const b=worldBox(r);if(b)map.fitBounds(asBounds(b),{padding:[52,52]})}};
$('regionZoom').oninput=e=>{const r=region();if(!r)return;r.showAtZoom=Number(e.target.value);$('regionZoomText').textContent=r.showAtZoom.toFixed(2);changed('slider');renderRegionList();updateRegions()};
$('regionRotation').oninput=e=>{const r=region();if(!r)return;r.rotation=Number(e.target.value);$('regionRotationText').textContent=r.rotation+'°';changed('slider');refreshPlacement();updateRegions()};
$('regionFade').oninput=e=>{const r=region();if(!r)return;r.fadeRange=Number(e.target.value);$('regionFadeText').textContent=r.fadeRange.toFixed(2);changed('slider');updateRegions()};
$('regionOpacity').oninput=e=>{previewOpacity=Number(e.target.value);$('regionOpacityText').textContent=Math.round(previewOpacity*100)+'%';updateRegions()};
$('blinkRegion').onclick=()=>{previewHidden=!previewHidden;$('blinkRegion').textContent=previewHidden?'Показать слой':'◐ Сравнить с родителем';updateRegions()};
$('regionEnabled').onchange=e=>{const r=region();if(!r)return;r.enabled=e.target.checked;changed();updateRegions()};
$('saveRegion').onclick=()=>{const r=region();if(!r)return;
  r.name=$('regionName').value.trim()||r.name;changed();renderRegionList();fillRegionEditor();status('Параметры применены. Не забудь нажать «Сохранить на диск».')};
$('deleteRegion').onclick=deleteRegion;
$('cancelRegion').onclick=()=>{selectedRegionId=null;cancelDrawing();$('regionEditor').hidden=true;destroyPlacement();renderRegionList();updateRegions()};
$('export').onclick=exportJSON;
$('import').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
    const parsed=JSON.parse(await file.text());if(!atlasCanEdit()||savingProject)return;normalize(parsed);
    if(!confirm('Заменить текущие данные атласа? Карты должны существовать в maps/.'))return;
    beforeAtlasHistory();projectGeneration++;data=parsed;worldId=data.worlds[0].id;selectedMarker=null;selectedRegionId=null;
    hiddenTypes.clear();pendingFiles.clear();clearAssetUrls();changed();setTab('world');render();resetUndo();
  }catch(err){alert('Ошибка импорта: '+err.message)}
};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
worldList();refreshTypes();setTab('world');render();resetUndo();
status('Демонстрация открыта. Чтобы редактировать настоящий проект, сначала выбери его папку.');
