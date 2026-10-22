'use strict';
/* Extensions to the stable Leaflet renderer. Saved v3 fields are retained. */
let viewingAtlas=false,savingProject=false,diskBaseline=null,articleContext=null,articleEditing=false;
let articleSelection=null,articleObjectUrls=[],articleGeneration=0,refreshTimer=null;
let measureMode=null,measurePoints=[],measureLayer=L.layerGroup().addTo(map),alignment=null;
let imageJobs=0,projectGeneration=0;
const editorHeaderIds=['undoAction','save','newWorld','add','export','import'];
const editorTabNames=['world','regions','markers'];
const textOnly=html=>{const el=document.createElement('div');el.innerHTML=sanitizeArticle(html);return el.textContent||'';};
const safeFilename=name=>typeof name==='string'&&!!name&&!/[\\/\x00-\x1f]/.test(name)&&name!=='.'&&name!=='..';
function atlasCanEdit(){return !viewingAtlas;}
function atlasMapToolActive(){return viewingAtlas||!!measureMode||!!alignment;}
function updateSaveState(){
  if(!$('saveState'))return;
  $('saveState').classList.toggle('unsaved',dirty);
  $('saveState').textContent=savingProject?'Сохранение…':dirty?'● Есть изменения':folder?'✓ Сохранено в папке':'Демонстрация · папка не подключена';
}
function refreshAtlasV4(){
  updateSaveState();
  $('distanceScale').value=world()?.kmPerPixel||'';
  clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{renderCatalog();renderSearch();},100);
}
function beforeAtlasHistory(){closeArticle();closeAlignment();resetMeasure();map.closePopup();}
function beforeAtlasWorldSwitch(){beforeAtlasHistory();}

// Search and location navigation: all text is inserted through textContent.
function resultRow(title,detail,action){
  const button=document.createElement('button');button.className='result-row';
  const strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=title;small.textContent=detail;
  button.append(strong,small);button.onclick=action;return button;
}
function renderCatalog(){
  const select=$('catalogType'),previous=select.value;
  select.replaceChildren(new Option('Все типы',''));
  for(const t of data.types)select.add(new Option(t.symbol+' '+t.name,t.id));
  if(data.types.some(t=>t.id===previous))select.value=previous;
  const list=world().locations.filter(m=>!select.value||m.type===select.value).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','ru'));
  $('markerCatalog').replaceChildren();$('catalogCount').textContent=`Локаций: ${list.length} из ${world().locations.length}`;
  const wid=worldId;
  for(const m of list){const type=data.types.find(t=>t.id===m.type);$('markerCatalog').append(resultRow((type?.symbol||'◆')+' '+(m.name||'Без названия'),(type?.name||'Локация')+(hiddenTypes.has(m.type)?' · скрыта фильтром':''),()=>goToLocation(wid,m.id)));}
  if(!list.length)$('markerCatalog').textContent='Локаций пока нет.';
}
function renderSearch(){
  const query=$('atlasSearch').value.trim().toLocaleLowerCase('ru'),box=$('searchResults');box.replaceChildren();box.hidden=!query;if(!query)return;
  let count=0;
  for(const w of data.worlds){
    const matches=value=>String(value||'').toLocaleLowerCase('ru').includes(query);
    if(matches(w.name)){count++;box.append(resultRow('🌍 '+w.name,'Мир',()=>{if(worldId!==w.id)switchWorld(w.id);else map.fitBounds([[0,0],[w.height,w.width]]);}));}
    for(const r of w.layers||[])if(matches(r.name)){
      count++;box.append(resultRow('▱ '+r.name,w.name+' · карта',()=>{if(worldId!==w.id)switchWorld(w.id);if(!viewingAtlas)selectRegion(r.id);else{setTab('catalog');refreshPlacement();updateRegions();}const b=worldBox(r);if(b){map.fitBounds(asBounds(b),{padding:[40,40],animate:false});if(viewingAtlas&&map.getZoom()<r.showAtZoom+r.fadeRange)map.setZoom(Math.min(8,r.showAtZoom+r.fadeRange),{animate:false});}}));
    }
    for(const m of w.locations)if(matches([m.name,m.description,textOnly(m.article||''),...(Array.isArray(m.tags)?m.tags:[])].join(' '))){
      count++;box.append(resultRow('⌖ '+(m.name||'Без названия'),w.name+' · локация',()=>goToLocation(w.id,m.id)));
    }
  }
  const summary=document.createElement('small');summary.textContent=count?`Найдено: ${count}`:'Ничего не найдено';box.prepend(summary);
}
function goToLocation(wid,id){
  if(worldId!==wid)switchWorld(wid);
  const m=world().locations.find(m=>m.id===id);if(!m)return;
  setTab('catalog');refreshPlacement();updateRegions();hiddenTypes.delete(m.type);refreshTypes();
  map.setView([m.y,m.x],Math.min(8,Math.max(map.getZoom(),Number(m.minZoom||-6)+0.25)),{animate:false});
  updateMarkerVisibility();showLocationCard(m);
}
function atlasMarkerClick(m){
  if(measureMode){atlasMapClick(L.latLng(m.y,m.x));return;}
  showLocationCard(m);
}
function showLocationCard(m){
  const box=document.createElement('div');box.className='location-popup';
  const title=document.createElement('h3');title.textContent=m.name||'Без названия';
  const type=document.createElement('small');type.textContent=data.types.find(t=>t.id===m.type)?.name||'Локация';
  const summary=document.createElement('p');summary.textContent=m.description||'Краткое описание пока не добавлено.';
  const buttons=document.createElement('div');buttons.className='buttons';
  const more=document.createElement('button');more.textContent='Подробнее →';const wid=worldId;more.onclick=()=>openArticle(wid,m.id);buttons.append(more);
  if(atlasCanEdit()){const edit=document.createElement('button');edit.textContent='Изменить маркер';edit.onclick=()=>{map.closePopup();markerEditor(m)};buttons.append(edit);}
  box.append(title,type,summary,buttons);L.popup({maxWidth:340}).setLatLng([m.y,m.x]).setContent(box).openOn(map);
}

// Rich articles store a small, sanitized HTML vocabulary and media filenames.
// Image URLs are rebuilt from local files; arbitrary HTML never runs on import.
function sanitizeArticle(html){
  const source=document.createElement('template');source.innerHTML=String(html||'');
  const allowed=new Set(['P','BR','DIV','H2','H3','STRONG','B','EM','I','U','UL','OL','LI','BLOCKQUOTE','A','FIGURE','FIGCAPTION','IMG','HR']);
  function clean(node){
    if(node.nodeType===3)return document.createTextNode(node.textContent);
    if(node.nodeType!==1)return document.createDocumentFragment();
    if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','BUTTON'].includes(node.tagName))return document.createDocumentFragment();
    const out=allowed.has(node.tagName)?document.createElement(node.tagName.toLowerCase()):document.createDocumentFragment();
    if(node.tagName==='A'&&out.nodeType===1){
      const href=node.getAttribute('href')||'';
      if(/^https?:\/\//i.test(href)){out.setAttribute('href',href);out.setAttribute('target','_blank');out.setAttribute('rel','noopener noreferrer');}
      const wid=node.getAttribute('data-world'),id=node.getAttribute('data-location');
      if(wid&&id){out.setAttribute('data-world',wid);out.setAttribute('data-location',id);out.setAttribute('href','#location');}
    }
    if(node.tagName==='IMG'&&out.nodeType===1){
      const asset=node.getAttribute('data-asset');if(!safeFilename(asset))return document.createDocumentFragment();
      out.setAttribute('data-asset',asset);out.setAttribute('alt',node.getAttribute('alt')||'Иллюстрация');
    }
    for(const child of node.childNodes)out.append(clean(child));return out;
  }
  const result=document.createElement('div');for(const child of source.content.childNodes)result.append(clean(child));return result.innerHTML;
}
function articleMarker(){return articleContext&&data.worlds.find(w=>w.id===articleContext.wid)?.locations.find(m=>m.id===articleContext.id);}
function releaseArticleImages(){for(const url of articleObjectUrls)URL.revokeObjectURL(url);articleObjectUrls=[];}
async function hydrateArticleImages(){
  const generation=++articleGeneration;releaseArticleImages();
  for(const img of $('articleBody').querySelectorAll('img[data-asset]')){
    const name=img.dataset.asset;
    try{
      const staged=pendingFiles.get('media:'+name);let file=staged?.file;
      if(!file&&folder)file=await(await(await folder.getDirectoryHandle('media')).getFileHandle(name)).getFile();
      if(generation!==articleGeneration)return;
      if(file){const url=URL.createObjectURL(file);articleObjectUrls.push(url);img.src=url;}
      else if(!folder)img.src='media/'+encodeURIComponent(name);
      else throw Error('Файл не найден');
    }catch(e){if(generation===articleGeneration){img.removeAttribute('src');img.alt='Не найдено изображение: '+name;}}
  }
}
function rememberArticleSelection(){
  const selection=window.getSelection();if(selection?.rangeCount&&$('articleBody').contains(selection.anchorNode))articleSelection=selection.getRangeAt(0).cloneRange();
}
function restoreArticleSelection(){
  $('articleBody').focus();const selection=window.getSelection();selection.removeAllRanges();
  if(articleSelection&&$('articleBody').contains(articleSelection.startContainer))selection.addRange(articleSelection);
  else{const range=document.createRange();range.selectNodeContents($('articleBody'));range.collapse(false);selection.addRange(range);}
}
function syncArticle(){
  if(!articleEditing||!atlasCanEdit())return;const m=articleMarker();if(!m)return;
  const html=sanitizeArticle($('articleBody').innerHTML),tags=$('articleTags').value.split(',').map(s=>s.trim()).filter(Boolean);
  if((m.article||'')!==html||JSON.stringify(m.tags||[])!==JSON.stringify(tags)){m.article=html;m.tags=tags;changed('article');}
  $('articleState').textContent='Статья в атласе · запись на диск общей кнопкой';
}
function setArticleEditing(edit){
  syncArticle();articleEditing=!!edit&&atlasCanEdit();articleSelection=null;
  const m=articleMarker();if(!m)return;
  $('articleEditTools').hidden=!articleEditing;$('articleBody').contentEditable=String(articleEditing);
  $('articleRead').classList.toggle('selected',!articleEditing);$('articleEdit').classList.toggle('selected',articleEditing);
  $('articleBody').innerHTML=sanitizeArticle(m.article||'')|| (articleEditing?'<p><br></p>':'<p class="article-empty">Полная статья пока не добавлена.</p>');
  $('articleTags').value=Array.isArray(m.tags)?m.tags.join(', '):'';
  $('articleState').textContent=articleEditing?'Изменения сохраняются в атласе':'Чтение';
  void hydrateArticleImages();
}
function openArticle(wid,id,edit=false){
  const target=data.worlds.find(w=>w.id===wid)?.locations.find(m=>m.id===id);
  if(!target){alert('Эта локация больше не существует.');return;}
  closeArticle();map.closePopup();articleContext={wid,id};const m=articleMarker();
  $('articleTitle').textContent=m.name||'Без названия';$('articleWorld').textContent=data.worlds.find(w=>w.id===wid).name;
  $('articleSummary').textContent=m.description||'';
  $('articleLocationLink').replaceChildren(new Option('Ссылка на локацию…',''));
  for(const w of data.worlds)for(const loc of w.locations)$('articleLocationLink').add(new Option(w.name+' → '+loc.name,JSON.stringify([w.id,loc.id])));
  $('articleDialog').showModal();setArticleEditing(edit);$('articleDialog').scrollTop=0;
}
function closeArticle(){
  syncArticle();articleEditing=false;articleContext=null;articleSelection=null;++articleGeneration;releaseArticleImages();
  if($('articleDialog').open)$('articleDialog').close();
}
function insertArticleNode(node){restoreArticleSelection();const selection=window.getSelection(),range=selection.getRangeAt(0);range.deleteContents();range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);rememberArticleSelection();syncArticle();}
function articleCommand(command,value=null){if(!articleEditing)return;restoreArticleSelection();document.execCommand(command,false,value);rememberArticleSelection();syncArticle();}

// Measurement uses the same world coordinates at every map detail level.
function resetMeasure(){measureMode=null;measurePoints=[];measureLayer.clearLayers();$('measurePanel').hidden=true;$('measureDistance').setAttribute('aria-pressed','false');map.getContainer().classList.remove('atlas-measuring');hint('');refreshPlacement();}
function startMeasure(mode){
  resetMeasure();cancelDrawing();addingMarker=false;$('add').classList.remove('selected');finishRegionDrag();destroyPlacement();map.closePopup();
  measureMode=mode;$('measurePanel').hidden=false;$('measureDistance').setAttribute('aria-pressed','true');map.getContainer().classList.add('atlas-measuring');
  hint(mode==='calibrate'?'Укажи две точки с известным расстоянием.':'Отмечай точки маршрута. «Завершить» оставит измерение на карте.');renderMeasurement();
}
function renderMeasurement(){
  measureLayer.clearLayers();
  if(measurePoints.length>1)L.polyline(measurePoints.map(p=>[p.y,p.x]),{color:'#f2c16e',weight:3,interactive:false}).addTo(measureLayer);
  measurePoints.forEach((p,i)=>L.circleMarker([p.y,p.x],{radius:5,color:'#fff',fillColor:'#d8a24c',fillOpacity:1,interactive:false}).bindTooltip(String(i+1)).addTo(measureLayer));
  const length=AtlasMath.routeLength(measurePoints),scale=Number(world().kmPerPixel);
  $('measureResult').textContent=measurePoints.length<2?'Отметь минимум две точки.':scale>0?`Расстояние: ${(length*scale).toLocaleString('ru',{maximumFractionDigits:3})} км · точек: ${measurePoints.length}`:`Расстояние: ${length.toLocaleString('ru',{maximumFractionDigits:1})} пикс. Задай масштаб мира для километров.`;
  $('measureBack').disabled=!measurePoints.length;$('measureFinish').disabled=!measureMode;
}
function atlasMapClick(latlng){
  if(!measureMode)return false;
  measurePoints.push({x:latlng.lng,y:latlng.lat});renderMeasurement();
  if(measureMode==='calibrate'&&measurePoints.length===2){
    const length=AtlasMath.routeLength(measurePoints);if(length<1e-6){measurePoints.pop();hint('Выбери вторую точку в другом месте.');return true;}
    const answer=prompt('Расстояние между точками в километрах:','100');
    if(answer!==null){const km=Number(answer.replace(',','.'));if(Number.isFinite(km)&&km>0){world().kmPerPixel=km/length;changed();}else alert('Нужно положительное расстояние в километрах.');}
    resetMeasure();
  }
  return true;
}

// Two independent previews leave the atlas unchanged until Apply.
async function openAlignment(){
  const r=region();if(!atlasCanEdit()||!r?.image){alert('Сначала выбери карту-слой с изображением.');return;}
  resetMeasure();cancelDrawing();finishRegionDrag();closeAlignment();
  const state={wid:worldId,rid:r.id,source:[],target:[],maps:[],groups:[],ready:false};alignment=state;
  $('alignmentDialog').showModal();$('alignmentHint').textContent='Загрузка изображений…';$('applyAlignment').disabled=true;
  const options={crs:L.CRS.Simple,minZoom:-8,maxZoom:10,zoomSnap:0,attributionControl:false};
  const source=L.map('alignmentSource',options),target=L.map('alignmentTarget',options);state.maps=[source,target];state.groups=[L.layerGroup().addTo(source),L.layerGroup().addTo(target)];
  source.fitBounds([[0,0],[r.height,r.width]],{padding:[20,20]});const parent=r.parentId?findLayer(r.parentId):null;
  target.fitBounds(asBounds(worldBox(parent)),{padding:[20,20]});
  source.on('click',e=>pickAlignmentPoint('source',e.latlng));target.on('click',e=>pickAlignmentPoint('target',e.latlng));
  try{
    const jobs=[];
    async function addImage(wid,id,name,bounds,destination,rotation=0){
      const url=await ensureAsset(wid,id,name);if(alignment!==state)return;if(!url)throw Error('Не удалось открыть '+name);
      await new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(Error('Не удалось загрузить '+name));image.src=url;});
      if(alignment!==state)return;
      const overlay=rotation?new RotatableImageOverlay(url,bounds):L.imageOverlay(url,bounds);
      overlay.addTo(destination);if(rotation)overlay.setRotation(rotation);
    }
    jobs.push(addImage(worldId,r.id,r.image,[[0,0],[r.height,r.width]],source));
    const w=world();if(w.image)jobs.push(addImage(worldId,null,w.image,[[0,0],[w.height,w.width]],target));
    const ancestors=[];let p=parent;while(p){ancestors.unshift(p);p=p.parentId?findLayer(p.parentId):null;}
    // Load in depth order so late image reads cannot cover a detailed ancestor.
    await Promise.all(jobs);
    for(const ancestor of ancestors)if(ancestor.image)await addImage(state.wid,ancestor.id,ancestor.image,asBounds(worldBox(ancestor)),target,ancestor.rotation||0);
    if(alignment!==state)return;state.ready=true;source.invalidateSize();target.invalidateSize();updateAlignmentHint();
  }catch(e){if(alignment===state)$('alignmentHint').textContent=e.message+' Закрой окно и проверь изображения.';}
}
function pickAlignmentPoint(side,point){
  const a=alignment;if(!a?.ready)return;
  const nextSide=a.source.length===a.target.length?'source':'target';if(side!==nextSide||a[side].length>=2)return;
  a[side].push({x:point.lng,y:point.lat});const group=a.groups[side==='source'?0:1];
  L.marker(point,{interactive:false,icon:L.divIcon({className:'alignment-point',html:String(a[side].length),iconSize:[28,28],iconAnchor:[14,14]})}).addTo(group);
  updateAlignmentHint();
}
function alignmentSolution(){const a=alignment,r=findLayer(a?.rid);return AtlasMath.alignTwoPoints(a.source,a.target,r.width,r.height);}
function updateAlignmentHint(){
  const a=alignment;if(!a)return;$('applyAlignment').disabled=true;
  if(a.source.length===2&&a.target.length===2){try{const result=alignmentSolution();$('alignmentHint').textContent=`Ориентиры выбраны. Поворот: ${result.rotation.toFixed(2)}°. Нажми «Применить совмещение».`;$('applyAlignment').disabled=false;}catch(e){$('alignmentHint').textContent=e.message+' Нажми «Выбрать заново».';}return;}
  const side=a.source.length===a.target.length?'подробной':'родительской',index=Math.min(a.source.length,a.target.length)+1;
  $('alignmentHint').textContent=`Отметь ориентир ${index} на ${side} карте.`;
}
function closeAlignment(){const a=alignment;alignment=null;if(a)for(const preview of a.maps)preview.remove();if($('alignmentDialog').open)$('alignmentDialog').close();}

// Snapshot saving: edits made during disk I/O stay dirty, staged files are never
// indiscriminately cleared, external edits are detected, backups precede writes.
async function readDiskJSON(projectFolder){
  try{const dir=await projectFolder.getDirectoryHandle('data');return await(await(await dir.getFileHandle('atlas.json')).getFile()).text();}
  catch(e){if(e.name==='NotFoundError')return null;throw e;}
}
async function writeProjectFile(dir,name,content){
  const handle=await dir.getFileHandle(name,{create:true}),out=await handle.createWritable();
  try{await out.write(content);await out.close();}catch(e){try{await out.abort();}catch(_){}throw e;}
}
async function validateProjectAssets(snapshot,files,projectFolder){
  const staged=new Set([...files.values()].map(e=>(e.directory||'maps')+'/'+e.name)),required=new Set();
  for(const w of snapshot.worlds){
    if(w.image)required.add('maps/'+w.image);for(const r of w.layers||[])if(r.image)required.add('maps/'+r.image);
    for(const m of w.locations){const template=document.createElement('template');template.innerHTML=sanitizeArticle(m.article||'');for(const img of template.content.querySelectorAll('img[data-asset]'))required.add('media/'+img.dataset.asset);}
  }
  const missing=[];
  for(const path of required){
    if(staged.has(path))continue;const slash=path.indexOf('/'),directory=path.slice(0,slash),name=path.slice(slash+1);
    if(!safeFilename(name)){missing.push(path);continue;}
    try{const dir=await projectFolder.getDirectoryHandle(directory);await dir.getFileHandle(name);}catch(e){if(e.name==='NotFoundError')missing.push(path);else throw e;}
  }
  if(missing.length)throw Error('Не найдены изображения: '+missing.slice(0,5).join(', ')+(missing.length>5?'…':'')+'. Данные на диске не изменены.');
}
async function openAtlasProject(){
  if(savingProject){status('Дождись завершения сохранения.');return;}
  if(!window.showDirectoryPicker){alert('Для открытия папки нужен браузер с File System Access API, например Opera GX, Chrome или Edge.');return;}
  syncArticle();if(dirty&&!confirm('Несохранённые изменения будут потеряны. Открыть другую папку?'))return;
  try{
    const chosen=await window.showDirectoryPicker({mode:'readwrite'}),raw=await readDiskJSON(chosen),parsed=raw===null?demoData():JSON.parse(raw);
    normalize(parsed);beforeAtlasHistory();projectGeneration++;data=parsed;folder=chosen;diskBaseline=raw;worldId=data.worlds[0].id;
    selectedRegionId=null;selectedMarker=null;hiddenTypes.clear();pendingFiles.clear();clearAssetUrls();dirty=false;
    $('markerPanel').hidden=true;setTab(viewingAtlas?'catalog':'world');render();resetUndo();
    status('Папка «'+folder.name+'» подключена. При сохранении предыдущий JSON попадёт в data/backups/.');
  }catch(e){if(e.name!=='AbortError')alert('Не удалось открыть проект: '+e.message);}
}
async function saveAtlasProject(){
  if(savingProject||!atlasCanEdit())return;
  syncArticle();finishRegionDrag();
  if(!folder){status('Сначала нажми «Открыть папку проекта» и выбери корневую папку атласа.');return;}
  if(imageJobs){status('Дождись загрузки изображения перед сохранением.');return;}
  const projectFolder=folder,snapshot=JSON.stringify(data,null,2),parsed=JSON.parse(snapshot),files=new Map(pendingFiles);
  savingProject=true;$('save').disabled=true;$('openFolder').disabled=true;$('import').disabled=true;updateSaveState();
  try{
    const old=await readDiskJSON(projectFolder);
    if(old!==diskBaseline)throw Error('atlas.json изменён вне этого окна. Сохранение остановлено; изменения остаются в памяти. Перед повторным открытием папки экспортируй JSON и сохрани исходники новых изображений.');
    await validateProjectAssets(parsed,files,projectFolder);
    const dataDir=await projectFolder.getDirectoryHandle('data',{create:true});
    if(old!==null){const backupDir=await dataDir.getDirectoryHandle('backups',{create:true});await writeProjectFile(backupDir,'atlas-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+uid().slice(0,8)+'.json',old);}
    for(const entry of files.values()){
      const dir=await projectFolder.getDirectoryHandle(entry.directory||'maps',{create:true});await writeProjectFile(dir,entry.name,entry.file);
    }
    // Recheck after asset writes; another tab may have saved in the meantime.
    if(await readDiskJSON(projectFolder)!==old)throw Error('Другой редактор изменил atlas.json во время сохранения. Экспортируй изменения и открой папку заново.');
    await writeProjectFile(dataDir,'atlas.json',snapshot);diskBaseline=snapshot;
    for(const [key,entry] of files)if(pendingFiles.get(key)===entry)pendingFiles.delete(key);
    dirty=JSON.stringify(data,null,2)!==snapshot||pendingFiles.size>0;
    status(dirty?'Снимок сохранён. Новые изменения ещё не записаны — нажми «Сохранить на диск» снова.':'✓ Сохранено. Предыдущий JSON — в data/backups/.');
  }catch(e){dirty=true;status('Ошибка сохранения: '+e.message);alert('Не удалось сохранить: '+e.message);}
  finally{savingProject=false;$('save').disabled=false;$('openFolder').disabled=false;$('import').disabled=false;updateSaveState();}
}

// Bind additions after app.js has initialized its original controls.
for(const id of editorHeaderIds)$(id).classList.add('editor-only');
for(const name of editorTabNames)document.querySelector(`[data-panel="${name}"]`).classList.add('editor-only');
const SidebarControl=L.Control.extend({options:{position:'topleft'},onAdd(){const holder=L.DomUtil.create('div','leaflet-control atlas-sidebar-control');holder.append($('toggleSidebar'));L.DomEvent.disableClickPropagation(holder);L.DomEvent.disableScrollPropagation(holder);return holder;}});
new SidebarControl().addTo(map);
$('toggleSidebar').onclick=()=>{const collapsed=document.querySelector('main').classList.toggle('collapsed');$('toggleSidebar').setAttribute('aria-label',collapsed?'Развернуть панель':'Свернуть панель');setTimeout(()=>map.invalidateSize({pan:false}),230);};
$('atlasSearch').oninput=renderSearch;$('catalogType').onchange=renderCatalog;
$('viewMode').onclick=()=>{
  beforeAtlasHistory();finishRegionDrag();addingMarker=false;$('add').classList.remove('selected');cancelDrawing();
  viewingAtlas=!viewingAtlas;document.body.classList.toggle('view-mode',viewingAtlas);
  $('viewMode').textContent=viewingAtlas?'✎ Вернуться в редактор':'◉ Режим просмотра';$('viewMode').setAttribute('aria-pressed',String(viewingAtlas));
  setTab('catalog');refreshPlacement();updateRegions();renderMarkers();
  // Keep navigation/search available in the sidebar; only editing controls hide.
};
$('editMarkerArticle').onclick=()=>{if(selectedMarker)openArticle(worldId,selectedMarker.id,true);};
$('closeArticle').onclick=closeArticle;$('articleDialog').addEventListener('cancel',e=>{e.preventDefault();closeArticle();});
$('articleRead').onclick=()=>setArticleEditing(false);$('articleEdit').onclick=()=>setArticleEditing(true);
$('saveArticleDisk').onclick=saveProject;
$('articleBody').addEventListener('input',syncArticle);$('articleTags').oninput=syncArticle;
document.addEventListener('selectionchange',rememberArticleSelection);
$('articleToolbar').addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault();});
$('articleToolbar').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.command)articleCommand(b.dataset.command);if(b?.dataset.block)articleCommand('formatBlock',b.dataset.block);});
$('articleLink').onclick=()=>{const url=prompt('Адрес ссылки (https://…):','https://');if(url&&/^https?:\/\//i.test(url))articleCommand('createLink',url);else if(url)alert('Укажи адрес, начинающийся с https:// или http://.');};
$('articleLocationLink').onchange=e=>{if(!e.target.value)return;const [wid,id]=JSON.parse(e.target.value),m=data.worlds.find(w=>w.id===wid)?.locations.find(m=>m.id===id);if(m){const link=document.createElement('a');link.dataset.world=wid;link.dataset.location=id;link.href='#location';link.textContent=m.name;insertArticleNode(link);}e.target.value='';};
$('articleBody').addEventListener('click',e=>{
  const link=e.target.closest('a');if(!link)return;
  if(articleEditing){e.preventDefault();return;}
  if(link.dataset.location){e.preventDefault();openArticle(link.dataset.world,link.dataset.location);}
});
$('articleBody').addEventListener('paste',e=>{
  if(!articleEditing)return;e.preventDefault();restoreArticleSelection();
  const html=e.clipboardData.getData('text/html'),text=e.clipboardData.getData('text/plain');
  if(html)articleCommand('insertHTML',sanitizeArticle(html));else articleCommand('insertText',text);
});
$('articleBody').addEventListener('drop',e=>e.preventDefault());
$('articleImage').onclick=()=>{rememberArticleSelection();$('articleImageFile').click();};
$('articleImageFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file||!articleEditing)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){alert('Выбери PNG, JPEG или WebP.');return;}
  const context={...articleContext},generation=projectGeneration;imageJobs++;
  try{
    const bitmap=await createImageBitmap(file);bitmap.close();
    if(generation!==projectGeneration||!articleEditing||articleContext?.wid!==context.wid||articleContext?.id!==context.id)return;
    const caption=prompt('Подпись к изображению (можно оставить пустой):','');if(caption===null)return;
    const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type],name='article-'+uid()+'.'+extension;
    const entry={directory:'media',name,file};pendingFiles.set('media:'+name,entry);
    const figure=document.createElement('figure'),img=document.createElement('img');img.dataset.asset=name;img.alt=caption||'Иллюстрация';const url=URL.createObjectURL(file);articleObjectUrls.push(url);img.src=url;figure.append(img);
    if(caption){const label=document.createElement('figcaption');label.textContent=caption;figure.append(label);}
    insertArticleNode(figure);
  }catch(err){alert('Не удалось открыть изображение: '+err.message);}finally{imageJobs--;}
};
$('measureDistance').onclick=()=>measureMode?resetMeasure():startMeasure('route');
$('measureBack').onclick=()=>{measurePoints.pop();renderMeasurement();};
$('measureFinish').onclick=()=>{measureMode=null;map.getContainer().classList.remove('atlas-measuring');hint('');$('measureDistance').setAttribute('aria-pressed','false');renderMeasurement();refreshPlacement();};
$('measureClear').onclick=resetMeasure;
$('applyDistanceScale').onclick=()=>{const scale=Number($('distanceScale').value);if(!Number.isFinite(scale)||scale<=0){alert('Укажи положительный масштаб в километрах.');return;}world().kmPerPixel=scale;changed();renderMeasurement();};
$('calibrateDistance').onclick=()=>startMeasure('calibrate');
$('alignRegion').onclick=openAlignment;$('closeAlignment').onclick=closeAlignment;
$('alignmentDialog').addEventListener('cancel',e=>{e.preventDefault();closeAlignment();});
$('resetAlignment').onclick=()=>{if(!alignment?.ready)return;alignment.source=[];alignment.target=[];alignment.groups.forEach(g=>g.clearLayers());updateAlignmentHint();};
$('applyAlignment').onclick=()=>{
  if(!alignment?.ready||alignment.wid!==worldId)return;
  try{const r=findLayer(alignment.rid),result=alignmentSolution();r.bounds=globalToLocalBox(result.bounds,r.parentId);r.rotation=result.rotation;closeAlignment();changed();fillRegionEditor();refreshPlacement();updateRegions();}catch(e){$('alignmentHint').textContent=e.message;}
};
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&measureMode)resetMeasure();});
// Moving between tabs cancels measurement/calibration instead of competing for clicks.
$('tabs').addEventListener('click',()=>{if(measureMode)resetMeasure();});
for(const id of ['add','newRegion','drawRegion'])$(id).addEventListener('click',()=>{if(measureMode)resetMeasure();},true);
renderCatalog();updateSaveState();
