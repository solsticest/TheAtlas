import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from './store';
import {
  focusMap, navigateToWorld, resolveDefaultWorld, selectEra, selectTimeline,
  selectWorld, toggleMarkerType,
} from './viewSlice';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, FormControlLabel, InputLabel, List, ListItemButton,
  ListItemText, Menu, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import type {
  EventRecord, LayerRecord, LocationRecord, MarkerTypeRecord, SearchItem,
} from '@atlas/shared';
import {
  useErasQuery, useEventsQuery, useLayersQuery, useLocationsQuery,
  useMarkerTypesQuery, useSearchQuery, useTimelinesQuery, useWorldsQuery,
} from './api';
import {
  LeafletAtlas, type AtlasContextTarget, type AtlasMapPoint,
} from './LeafletAtlas';
import { ArticleDialog } from './ArticleDialog';
import { EventDialog } from './EventDialog';
import { TimelinePanel } from './TimelinePanel';
import { assetUrl } from './geometry';
import {
  AtlasObjectEditor, type AtlasObjectEditorHandle, type EditorKind,
  type EditorSection, type EditorSession, type EditorStatus, type EditorTarget,
} from '../admin/AtlasObjectEditor';

type ErrorBody={error?:{message?:string}};
const emptyStatus:EditorStatus={dirty:false,canUndo:false,canRedo:false,saving:false,title:''};

async function apiRequest<T>(
  url:string,method:string,body:unknown,session:EditorSession,
):Promise<T>{
  const headers:Record<string,string>={};
  if(body!==undefined)headers['content-type']='application/json';
  if(session.csrfToken)headers['x-csrf-token']=session.csrfToken;
  const response=await fetch(url,{method,credentials:'same-origin',headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json() as T&ErrorBody;
  if(!response.ok)throw Error(data.error?.message??('Ошибка HTTP '+response.status));
  return data;
}
function locationPayload(location:LocationRecord,name=location.name){
  return {
    worldId:location.worldId,name,type:location.type,x:location.x,y:location.y,
    color:location.color,minZoom:location.minZoom,description:location.description,
    article:location.article??'',tags:location.tags,
  };
}
function layerPayload(layer:LayerRecord,name=layer.name){
  return {
    worldId:layer.worldId,name,parentId:layer.parentId,image:layer.image,
    width:layer.width,height:layer.height,bounds:layer.bounds,rotation:layer.rotation,
    showAtZoom:layer.showAtZoom,fadeRange:layer.fadeRange,enabled:layer.enabled,
  };
}
function eventPayload(event:EventRecord,title=event.title){
  return {
    eraId:event.eraId,title,summary:event.summary,article:event.article,type:event.type,
    tags:event.tags,sortOrder:event.sortOrder,dateLabel:event.dateLabel,
    locationId:event.locationId,x:event.x,y:event.y,image:event.image,status:event.status,
  };
}

export function AtlasViewer(){
  const worldsQuery=useWorldsQuery();
  const typesQuery=useMarkerTypesQuery();
  const worlds=worldsQuery.currentData??[];
  const types=typesQuery.currentData??[];
  const dispatch=useDispatch();
  const {worldId,timelineId,eraId,hiddenTypes,focus}=
    useSelector((state:RootState)=>state.atlasView);

  const [eventId,setEventId]=useState<string|null>(null);
  const [articleId,setArticleId]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [session,setSession]=useState<EditorSession|null>(null);
  const [loginOpen,setLoginOpen]=useState(false);
  const [password,setPassword]=useState('');
  const [loginError,setLoginError]=useState('');
  const [pendingLoginAction,setPendingLoginAction]=useState<'location'|'event'|'layer'|'type'|null>(null);
  const [notice,setNotice]=useState('');
  const [editorTarget,setEditorTarget]=useState<EditorTarget|null>(null);
  const [editorStatus,setEditorStatus]=useState<EditorStatus>(emptyStatus);
  const [preview,setPreview]=useState<{target:EditorTarget;draft:Record<string,unknown>}|null>(null);
  const [placementTool,setPlacementTool]=useState<'location'|'event'|null>(null);
  const [moveLocationId,setMoveLocationId]=useState<string|null>(null);
  const [contextTarget,setContextTarget]=useState<AtlasContextTarget|null>(null);
  const editorRef=useRef<AtlasObjectEditorHandle|null>(null);

  const world=worlds.find(item=>item.id===worldId)??worlds[0];
  const selectedWorldId=world?.id??'';
  const layersQuery=useLayersQuery(selectedWorldId,{skip:!selectedWorldId});
  const locationsQuery=useLocationsQuery(selectedWorldId,{skip:!selectedWorldId});
  const searchQuery=useSearchQuery(search.trim(),{skip:search.trim().length<2});
  const layers=layersQuery.currentData??[];
  const locations=locationsQuery.currentData??[];
  const timelinesQuery=useTimelinesQuery(selectedWorldId,{skip:!selectedWorldId});
  const timelines=timelinesQuery.currentData??[];
  const timeline=timelines.find(item=>item.id===timelineId)??timelines.find(item=>item.isDefault)??timelines[0];
  const erasQuery=useErasQuery(timeline?.id??'',{skip:!timeline});
  const eras=erasQuery.currentData??[];
  const era=eras.find(item=>item.id===eraId)??eras[0];
  const eventsQuery=useEventsQuery(era?.id??'',{skip:!era});
  const events=eventsQuery.currentData??[];
  const canEdit=Boolean(session?.authenticated&&session.csrfToken);

  useEffect(()=>{
    void fetch('/api/auth/me',{credentials:'same-origin'}).then(async response=>{
      const data=await response.json() as EditorSession;
      setSession(data);
    }).catch(()=>setSession({authenticated:false}));
  },[]);

  useEffect(()=>{
    if(!world)return;
    const query=new URLSearchParams();
    query.set('world',world.id);
    if(timeline)query.set('timeline',timeline.id);
    if(era)query.set('era',era.id);
    window.history.replaceState(null,'',window.location.pathname+'?'+query.toString());
  },[world?.id,timeline?.id,era?.id]);

  useEffect(()=>{
    if(!worldId&&worlds.length)dispatch(resolveDefaultWorld(worlds[0]?.id??''));
  },[worldId,worlds,dispatch]);

  const visibleTypes=useMemo(()=>new Set(types.map(type=>type.id)
    .filter(id=>!hiddenTypes.includes(id))),[types,hiddenTypes]);

  function nextFocus(kind:'world'|'layer'|'location'|'event',id:string){
    dispatch(focusMap({kind,id}));
  }
  function mayReplaceEditor(){
    return !editorStatus.dirty||window.confirm('Отменить несохранённые изменения текущей операции?');
  }
  function closeEditor(force=false){
    if(!force&&!mayReplaceEditor())return false;
    setEditorTarget(null);setPreview(null);setMoveLocationId(null);setEditorStatus(emptyStatus);
    return true;
  }
  function openEditor(target:EditorTarget){
    if(!mayReplaceEditor())return false;
    setEditorTarget(target);setPreview(null);setMoveLocationId(null);
    return true;
  }
  function editLocation(location:LocationRecord,section:EditorSection='marker'){
    setArticleId(null);
    openEditor({kind:'location',id:location.id,section});
  }
  function startMove(location:LocationRecord){
    if(!openEditor({kind:'location',id:location.id,section:'marker'}))return;
    setMoveLocationId(location.id);nextFocus('location',location.id);
  }
  function beginPlacement(kind:'location'|'event'){
    if(!canEdit){setPendingLoginAction(kind);setLoginOpen(true);return;}
    if(kind==='event'&&!era){setNotice('Сначала выбери таймлайн и эпоху.');return;}
    if(!closeEditor())return;
    setPlacementTool(kind);setNotice(kind==='location'
      ?'Кликни по карте, где должен появиться новый маркер.'
      :'Кликни по карте, где должно появиться новое событие.');
  }
  function place(point:AtlasMapPoint){
    if(!placementTool)return;
    if(placementTool==='location'){
      openEditor({kind:'location',create:true,section:'marker',initial:{x:point.x,y:point.y}});
    }else{
      openEditor({kind:'event',create:true,initial:{x:point.x,y:point.y}});
    }
    setPlacementTool(null);setContextTarget(null);
  }

  async function login(){
    setLoginError('');
    try{
      const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json'},body:JSON.stringify({password})});
      const data=await response.json() as EditorSession&ErrorBody;
      if(!response.ok)throw Error(data.error?.message??'Не удалось войти');
      setSession(data);setPassword('');setLoginOpen(false);
      const action=pendingLoginAction;setPendingLoginAction(null);
      if(action==='location'){
        setPlacementTool('location');setNotice('Кликни по карте, где должен появиться новый маркер.');
      }else if(action==='event'){
        if(era){setPlacementTool('event');setNotice('Кликни по карте, где должно появиться новое событие.');}
        else setNotice('Вход выполнен. Для события сначала выбери таймлайн и эпоху.');
      }else if(action==='layer')openEditor({kind:'layer',create:true});
      else if(action==='type')openEditor({kind:'type',create:true});
      else setNotice('Редакторские инструменты разблокированы.');
    }catch(reason){setLoginError(reason instanceof Error?reason.message:String(reason));}
  }
  async function logout(){
    if(!session||!mayReplaceEditor())return;
    try{
      await apiRequest('/api/auth/logout','POST',{},session);
      closeEditor(true);setPlacementTool(null);setSession({authenticated:false});setNotice('Вы вышли.');
    }catch(reason){setNotice(reason instanceof Error?reason.message:String(reason));}
  }

  async function refetchVisibleData(){
    const tasks:PromiseLike<unknown>[]=[worldsQuery.refetch(),typesQuery.refetch()];
    if(selectedWorldId)tasks.push(layersQuery.refetch(),locationsQuery.refetch(),timelinesQuery.refetch());
    if(timeline)tasks.push(erasQuery.refetch());
    if(era)tasks.push(eventsQuery.refetch());
    await Promise.allSettled(tasks);
  }
  async function editorSaved(_kind:EditorKind,id:string,created:boolean){
    await refetchVisibleData();
    closeEditor(true);
    setNotice(created?'Объект создан.':'Изменения сохранены.');
    if(_kind==='location')nextFocus('location',id);
    if(_kind==='layer')nextFocus('layer',id);
    if(_kind==='event')nextFocus('event',id);
  }
  async function editorDeleted(){
    await refetchVisibleData();closeEditor(true);setNotice('Объект удалён.');
  }

  async function removeObject(kind:'location'|'event'|'layer',id:string){
    if(!session?.csrfToken)return;
    if(!window.confirm('Удалить объект? Перед удалением сервер создаст резервную копию.'))return;
    const roots={location:'locations',event:'events',layer:'layers'};
    try{
      await apiRequest('/api/admin/'+roots[kind]+'/'+encodeURIComponent(id),'DELETE',undefined,session);
      await refetchVisibleData();setNotice('Объект удалён.');
    }catch(reason){setNotice(reason instanceof Error?reason.message:String(reason));}
  }
  function duplicateObject(target:AtlasContextTarget){
    if(target.kind==='location'){
      const source=target.location;
      openEditor({kind:'location',create:true,section:'marker',initial:{
        ...locationPayload(source,source.name+' (копия)'),x:source.x+12,y:source.y+12,
      }});
      return;
    }
    if(target.kind==='event'){
      openEditor({kind:'event',create:true,initial:
        eventPayload(target.event,target.event.title+' (копия)')});
      return;
    }
    if(target.kind==='layer'){
      const source=target.layer,b=source.bounds;
      openEditor({kind:'layer',create:true,initial:{
        ...layerPayload(source,source.name+' (копия)'),
        x1:b.x1+20,y1:b.y1+20,x2:b.x2+20,y2:b.y2+20,
      }});
    }
  }
  async function copyCoordinates(point:AtlasMapPoint){
    try{
      await navigator.clipboard.writeText(point.x.toFixed(3)+', '+point.y.toFixed(3));
      setNotice('Координаты скопированы.');
    }catch{setNotice('Координаты: '+point.x.toFixed(3)+', '+point.y.toFixed(3));}
  }

  function contextAction(action:string){
    const target=contextTarget;if(!target)return;
    setContextTarget(null);
    if(action==='copy'){void copyCoordinates(target.point);return;}
    if(action==='create-location'){placeFromContext('location',target.point);return;}
    if(action==='create-event'){placeFromContext('event',target.point);return;}
    if(action==='create-region'){
      const spanX=world!.width*.25,spanY=world!.height*.25;
      openEditor({kind:'layer',create:true,initial:{
        x1:Math.max(0,target.point.x-spanX/2),y1:Math.max(0,target.point.y-spanY/2),
        x2:Math.min(world!.width,target.point.x+spanX/2),
        y2:Math.min(world!.height,target.point.y+spanY/2),
      }});return;
    }
    if(target.kind==='location'){
      if(action==='details'){setArticleId(target.location.id);return;}
      if(action==='edit-marker'){editLocation(target.location,'marker');return;}
      if(action==='edit-article'){editLocation(target.location,'article');return;}
      if(action==='move'){startMove(target.location);return;}
      if(action==='duplicate'){duplicateObject(target);return;}
      if(action==='delete'){void removeObject('location',target.location.id);return;}
    }
    if(target.kind==='event'){
      if(action==='details'){setEventId(target.event.id);return;}
      if(action==='edit'){openEditor({kind:'event',id:target.event.id});return;}
      if(action==='duplicate'){duplicateObject(target);return;}
      if(action==='delete'){void removeObject('event',target.event.id);return;}
    }
    if(target.kind==='layer'){
      if(action==='edit'){openEditor({kind:'layer',id:target.layer.id});return;}
      if(action==='child'){openEditor({kind:'layer',create:true,initial:{parentId:target.layer.id}});return;}
      if(action==='duplicate'){duplicateObject(target);return;}
      if(action==='delete'){void removeObject('layer',target.layer.id);return;}
    }
  }
  function placeFromContext(kind:'location'|'event',point:AtlasMapPoint){
    if(kind==='event'&&!era){setNotice('Сначала выбери эпоху.');return;}
    openEditor({kind,create:true,...(kind==='location'?{section:'marker' as const}:{}),
      initial:{x:point.x,y:point.y}});
  }

  function popupListMenu(event:React.MouseEvent,kind:'location'|'layer',id:string){
    event.stopPropagation();
    if(kind==='location'){
      const location=locations.find(item=>item.id===id);if(!location)return;
      setContextTarget({kind:'location',location,point:{
        x:location.x,y:location.y,clientX:event.clientX,clientY:event.clientY,
      }});
    }else{
      const layer=layers.find(item=>item.id===id);if(!layer)return;
      setContextTarget({kind:'layer',layer,point:{x:0,y:0,clientX:event.clientX,clientY:event.clientY}});
    }
  }

  function openWorld(id:string){
    if(!mayReplaceEditor())return;
    dispatch(selectWorld(id));setArticleId(null);setEventId(null);closeEditor(true);
  }
  function navigate(worldTarget:string,kind:'world'|'layer'|'location'|'event',id:string){
    if(worldTarget!==selectedWorldId){
      if(!mayReplaceEditor())return;
      closeEditor(true);
      dispatch(navigateToWorld(worldTarget));
    }
    setArticleId(null);setEventId(null);nextFocus(kind,id);
  }
  function changeTimeline(id:string){
    if(editorTarget&&!mayReplaceEditor())return;
    if(editorTarget)closeEditor(true);
    dispatch(selectTimeline(id));setEventId(null);setArticleId(null);
  }
  function changeEra(id:string){
    if(editorTarget&&!mayReplaceEditor())return;
    if(editorTarget)closeEditor(true);
    dispatch(selectEra(id));setEventId(null);setArticleId(null);
  }
  function clickSearchResult(item:SearchItem){
    navigate(item.worldId,item.kind,item.id);setSearch('');
  }
  function focusEvent(event:EventRecord){setEventId(event.id);nextFocus('event',event.id);}

  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        if(document.querySelector('[role="dialog"]'))return;
        if(contextTarget){setContextTarget(null);return;}
        if(placementTool){setPlacementTool(null);setNotice('Инструмент отменён.');return;}
        if(editorTarget){event.preventDefault();editorRef.current?.cancel();}
        return;
      }
      if(!editorTarget||(event.ctrlKey||event.metaKey)===false)return;
      const value=event.key.toLowerCase();
      if(value==='s'){event.preventDefault();editorRef.current?.save();}
      if(value==='z'&&!event.shiftKey){event.preventDefault();editorRef.current?.undo();}
      if(value==='y'||(value==='z'&&event.shiftKey)){event.preventDefault();editorRef.current?.redo();}
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[editorTarget,placementTool,contextTarget]);

  const pending=worldsQuery.isLoading||typesQuery.isLoading||
    Boolean(selectedWorldId&&(layersQuery.isLoading||locationsQuery.isLoading));
  const error=worldsQuery.isError||typesQuery.isError||layersQuery.isError||locationsQuery.isError;
  const selectedArticle=locations.find(location=>location.id===articleId)??null;
  const selectedEvent=events.find(event=>event.id===eventId)??null;

  return <Box className="atlas-shell">
    <Box component="header" className="atlas-topbar atlas-commandbar">
      <Typography component="h1" fontSize={17} fontWeight={700} color="primary.main">The Atlas</Typography>
      <Divider orientation="vertical" flexItem sx={{mx:1}}/>
      <Button size="small" variant={placementTool==='location'?'contained':'outlined'}
        onClick={()=>beginPlacement('location')}>+ Маркер</Button>
      <Button size="small" variant="outlined" onClick={()=>{
        if(!canEdit){setPendingLoginAction('layer');setLoginOpen(true);return;}
        openEditor({kind:'layer',create:true});
      }}>+ Регион</Button>
      <Button size="small" variant={placementTool==='event'?'contained':'outlined'}
        disabled={canEdit&&!era} onClick={()=>beginPlacement('event')}>+ Событие</Button>
      <Button size="small" variant="outlined" onClick={()=>{
        if(!canEdit){setPendingLoginAction('type');setLoginOpen(true);return;}
        openEditor({kind:'type',create:true});
      }}>+ Тип маркера</Button>
      {canEdit&&editorTarget&&<>
        <Divider orientation="vertical" flexItem sx={{mx:.5}}/>
        <Typography variant="caption" color={editorStatus.dirty?'warning.main':'text.secondary'}
          sx={{maxWidth:170,overflow:'hidden',textOverflow:'ellipsis'}}>
          {editorStatus.dirty?'● ':''}{editorStatus.title}
        </Typography>
        <Button size="small" disabled={!editorStatus.canUndo} onClick={()=>editorRef.current?.undo()}>↶</Button>
        <Button size="small" disabled={!editorStatus.canRedo} onClick={()=>editorRef.current?.redo()}>↷</Button>
        <Button size="small" variant="contained" disabled={!editorStatus.dirty||editorStatus.saving}
          onClick={()=>editorRef.current?.save()}>Сохранить</Button>
        <Button size="small" onClick={()=>editorRef.current?.cancel()}>Отмена</Button>
      </>}
      <Box sx={{flex:1}}/>
      {placementTool&&<Typography variant="caption" color="warning.main">
        {placementTool==='location'?'Укажи место нового маркера':'Укажи место события'} · Esc отменяет
      </Typography>}
      {canEdit
        ?<Button size="small" color="secondary" onClick={()=>void logout()}>Выйти</Button>
        :<Button size="small" color="secondary" onClick={()=>setLoginOpen(true)}>Войти</Button>}
    </Box>

    <Box className="atlas-workspace">
      <Box component="aside" className="atlas-sidebar" aria-label="Навигация атласа">
        <Stack spacing={2} sx={{p:2}}>
          {notice&&<Alert severity="info" onClose={()=>setNotice('')}>{notice}</Alert>}
          <FormControl fullWidth size="small" disabled={!worlds.length}>
            <InputLabel id="atlas-world-label">Мир</InputLabel>
            <Select labelId="atlas-world-label" label="Мир" value={selectedWorldId}
              onChange={event=>openWorld(event.target.value)}>
              {worlds.map(item=><MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField size="small" fullWidth value={search} onChange={event=>setSearch(event.target.value)}
            label="Поиск по всем мирам" placeholder="Карта, локация, статья, тег"/>
          {search.trim().length>=2&&<Box className="atlas-results">
            <Typography fontSize={12} color="text.secondary" sx={{mb:1}}>
              {searchQuery.isFetching?'Поиск…':'Результаты поиска'}
            </Typography>
            <List dense disablePadding>
              {(searchQuery.currentData??[]).map(item=><ListItemButton key={item.kind+item.id}
                onClick={()=>clickSearchResult(item)}>
                <ListItemText primary={item.title} secondary={item.subtitle+' · '+
                  (item.kind==='world'?'мир':item.kind==='layer'?'карта':'локация')}/>
              </ListItemButton>)}
            </List>
          </Box>}

          <Divider/>
          <Stack direction="row" alignItems="center">
            <Typography variant="subtitle2" color="primary.main" sx={{flex:1}}>{world?.name??'Миры'}</Typography>
            {canEdit&&world&&<Button size="small" onClick={()=>openEditor({kind:'world',id:world.id})}>✎</Button>}
          </Stack>
          <Typography color="text.secondary" variant="caption">
            Карты: {layers.length} · Локации: {locations.length}
          </Typography>

          <Typography variant="subtitle2">Карты-слои</Typography>
          <Stack gap={0}>
            {layers.map(layer=><Stack key={layer.id} direction="row" alignItems="stretch">
              <ListItemButton onClick={()=>nextFocus('layer',layer.id)}
                sx={{pl:layer.parentId?3.5:1,minWidth:0}}>
                <ListItemText primary={layer.name} secondary={layer.parentId?'Вложенная карта':'Регион'}/>
              </ListItemButton>
              {canEdit&&<Button size="small" sx={{minWidth:34}} onClick={event=>popupListMenu(event,'layer',layer.id)}>⋯</Button>}
            </Stack>)}
            {!layers.length&&<Typography color="text.secondary" fontSize={12}>Нет вложенных карт.</Typography>}
          </Stack>

          <TimelinePanel timelines={timelines} eras={eras} events={events}
            timelineId={timeline?.id??''} eraId={era?.id??''}
            onTimeline={changeTimeline}
            onEra={changeEra}
            onEvent={focusEvent} canEdit={canEdit}
            onEditTimeline={id=>openEditor({kind:'timeline',id})}
            onEditEra={id=>openEditor({kind:'era',id})}
            loading={timelinesQuery.isFetching||erasQuery.isFetching||eventsQuery.isFetching}/>

          <Stack direction="row" alignItems="center">
            <Typography variant="subtitle2" sx={{flex:1}}>Типы маркеров</Typography>
            {canEdit&&<Button size="small" onClick={()=>openEditor({kind:'type',create:true})}>+</Button>}
          </Stack>
          <Stack spacing={0}>
            {types.map(type=><Stack key={type.id} direction="row" alignItems="center">
              <FormControlLabel sx={{my:-.5,flex:1,mr:0}} control={
                <Checkbox size="small" checked={!hiddenTypes.includes(type.id)}
                  onChange={(_,checked)=>dispatch(toggleMarkerType({id:type.id,visible:checked}))}/>
              } label={<Stack direction="row" gap={.7} alignItems="center">
                <Box sx={{width:18,height:18,borderRadius:'50%',border:'2px solid',borderColor:type.color,
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,overflow:'hidden'}}>
                  {type.iconSvg?<Box component="img" src={assetUrl('icons',type.iconSvg)}
                    sx={{width:'100%',height:'100%',objectFit:'contain'}}/>:type.symbol}
                </Box>
                <Typography fontSize={13}>{type.name}</Typography>
              </Stack>}/>
              {canEdit&&<Button size="small" sx={{minWidth:34}}
                onClick={()=>openEditor({kind:'type',id:type.id})}>✎</Button>}
            </Stack>)}
          </Stack>

          <Typography variant="subtitle2">Локации</Typography>
          <Stack gap={0}>
            {[...locations].sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(location=>
              <Stack key={location.id} direction="row" alignItems="stretch">
                <ListItemButton onClick={()=>{
                  if(hiddenTypes.includes(location.type))
                    dispatch(toggleMarkerType({id:location.type,visible:true}));
                  nextFocus('location',location.id);
                }} sx={{minWidth:0}}>
                  <ListItemText primary={location.name} secondary={location.description||'Локация'}/>
                </ListItemButton>
                {canEdit&&<Button size="small" sx={{minWidth:34}}
                  onClick={event=>popupListMenu(event,'location',location.id)}>⋯</Button>}
              </Stack>)}
          </Stack>

          <Button size="small" color="secondary" variant="outlined"
            onClick={()=>selectedWorldId&&nextFocus('world',selectedWorldId)}>Показать весь мир</Button>
        </Stack>
      </Box>

      <Box component="main" className="atlas-map-area">
        {pending&&<Stack className="atlas-status-overlay" alignItems="center" spacing={2}>
          <Typography>Загружаем карту…</Typography>
        </Stack>}
        {error&&<Alert severity="error" sx={{m:2,maxWidth:650}}>
          Не удалось прочитать данные Atlas из SQLite.
        </Alert>}
        {!error&&!pending&&world&&<LeafletAtlas key={world.id} world={world} layers={layers}
          locations={locations} types={types} visibleTypes={visibleTypes} focus={focus} events={events}
          canEdit={canEdit} preview={preview} placementTool={placementTool}
          moveLocationId={moveLocationId}
          onSelectLocation={location=>setArticleId(location.id)}
          onSelectEvent={event=>setEventId(event.id)}
          onEditLocation={editLocation}
          onContext={setContextTarget}
          onPlace={place}
          onMoveLocation={(_location,x,y)=>editorRef.current?.patch({x,y},'drag-marker')}
          onLayerGeometryDraft={bounds=>editorRef.current?.patch(bounds,'map-layer-geometry')}/>}
      </Box>

      {canEdit&&editorTarget&&world&&<AtlasObjectEditor ref={editorRef}
        target={editorTarget} session={session!} world={world} worlds={worlds} layers={layers}
        locations={locations} types={types} timelines={timelines} eras={eras} events={events}
        timelineId={timeline?.id??''} eraId={era?.id??''}
        onStatus={setEditorStatus}
        onPreview={(target,draft)=>setPreview({target,draft})}
        onSaved={editorSaved} onDeleted={editorDeleted}
        onCancel={()=>closeEditor(true)}/>}
    </Box>

    <ArticleDialog location={selectedArticle} onClose={()=>setArticleId(null)}
      onLink={(targetWorld,id)=>navigate(targetWorld,'location',id)}
      canEdit={canEdit} onEdit={()=>selectedArticle&&editLocation(selectedArticle,'article')}/>
    <EventDialog event={selectedEvent} onClose={()=>setEventId(null)}
      onLink={(targetWorld,id)=>navigate(targetWorld,'location',id)}
      canEdit={canEdit} onEdit={()=>{
        if(selectedEvent){setEventId(null);openEditor({kind:'event',id:selectedEvent.id});}
      }}/>

    <Menu open={!!contextTarget} onClose={()=>setContextTarget(null)}
      anchorReference="anchorPosition"
      anchorPosition={contextTarget?{top:contextTarget.point.clientY,left:contextTarget.point.clientX}:undefined}>
      {contextTarget?.kind==='map'&&[
        canEdit&&<MenuItem key="marker" onClick={()=>contextAction('create-location')}>Создать маркер здесь</MenuItem>,
        canEdit&&era&&<MenuItem key="event" onClick={()=>contextAction('create-event')}>Создать событие здесь</MenuItem>,
        canEdit&&<MenuItem key="region" onClick={()=>contextAction('create-region')}>Добавить карту региона</MenuItem>,
        <MenuItem key="copy" onClick={()=>contextAction('copy')}>Скопировать координаты</MenuItem>,
      ]}
      {contextTarget?.kind==='location'&&[
        <MenuItem key="details" onClick={()=>contextAction('details')}>Подробнее</MenuItem>,
        canEdit&&<MenuItem key="edit-marker" onClick={()=>contextAction('edit-marker')}>Редактировать маркер</MenuItem>,
        canEdit&&<MenuItem key="edit-article" onClick={()=>contextAction('edit-article')}>Редактировать статью</MenuItem>,
        canEdit&&<MenuItem key="move" onClick={()=>contextAction('move')}>Переместить маркер</MenuItem>,
        canEdit&&<MenuItem key="duplicate" onClick={()=>contextAction('duplicate')}>Дублировать</MenuItem>,
        canEdit&&<MenuItem key="delete" onClick={()=>contextAction('delete')}>Удалить…</MenuItem>,
      ]}
      {contextTarget?.kind==='event'&&[
        <MenuItem key="details" onClick={()=>contextAction('details')}>Открыть событие</MenuItem>,
        canEdit&&<MenuItem key="edit" onClick={()=>contextAction('edit')}>Редактировать</MenuItem>,
        canEdit&&<MenuItem key="duplicate" onClick={()=>contextAction('duplicate')}>Дублировать</MenuItem>,
        canEdit&&<MenuItem key="delete" onClick={()=>contextAction('delete')}>Удалить…</MenuItem>,
      ]}
      {contextTarget?.kind==='layer'&&[
        canEdit&&<MenuItem key="edit" onClick={()=>contextAction('edit')}>Редактировать карту</MenuItem>,
        canEdit&&<MenuItem key="child" onClick={()=>contextAction('child')}>Добавить вложенную карту</MenuItem>,
        canEdit&&<MenuItem key="duplicate" onClick={()=>contextAction('duplicate')}>Дублировать</MenuItem>,
        canEdit&&<MenuItem key="delete" onClick={()=>contextAction('delete')}>Удалить…</MenuItem>,
      ]}
    </Menu>

    <Dialog open={loginOpen} onClose={()=>{setLoginOpen(false);setPendingLoginAction(null);}} maxWidth="xs" fullWidth>
      <DialogTitle>Редактор Atlas</DialogTitle>
      <DialogContent>
        <Typography fontSize={13} color="text.secondary" sx={{mb:2}}>
          После входа редакторские команды появятся прямо на основной карте.
        </Typography>
        <TextField autoFocus fullWidth type="password" label="Пароль администратора"
          value={password} onChange={event=>setPassword(event.target.value)}
          onKeyDown={event=>{if(event.key==='Enter')void login();}}/>
        {loginError&&<Alert severity="error" sx={{mt:2}}>{loginError}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>{setLoginOpen(false);setPendingLoginAction(null);}}>Отмена</Button>
        <Button variant="contained" onClick={()=>void login()}>Войти</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
