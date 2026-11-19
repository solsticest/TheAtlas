import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, InputLabel, Menu, MenuItem, Select, Snackbar, Stack,
  TextField, Typography,
} from '@mui/material';
import type {
  CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent,
  ReactNode, WheelEvent as ReactWheelEvent,
} from 'react';
import type { ChronicleEventRecord } from '@atlas/shared';
import {
  useChronicleEventsQuery, useCreateChronicleEventMutation,
  useDeleteChronicleEventMutation, useUpdateChronicleEventMutation, useWorldsQuery,
} from '../atlas/api';
import {
  CHRONICLE_MONTHS, CURRENT_YEAR, DAYS_PER_YEAR, chronicleDateToDay, dayToChronicleDate,
  formatChronicleDate, type ChronicleDate,
} from './calendar';
import {
  DEFAULT_TIMELINE_SCALE, MAX_TIMELINE_SCALE, MIN_TIMELINE_SCALE,
  dayAtViewportX, drillInScale, timelineGranularity, timelineGranularityLabel,
  timelineTicks, visibleRangeLabel, type TimelineGranularity,
} from './timeline';
import {
  EventEditorDialog, defaultEventDraft, draftFromRecord, draftToInput,
  type EventDraft,
} from './EventEditorDialog';
import { ChronicleFilterMenu } from './ChronicleFilterMenu';
import {
  chronicleFilterCount, chronicleTagOptions, emptyChronicleFilters,
  filterChronicleEvents, type ChronicleFilterState,
} from './filters';
import './chronicle.css';

const NEW_DRAFT_KEY='chronicle:new-event-draft:v2';
const CURRENT_YEAR_CENTER=chronicleDateToDay({
  era:'AS',year:CURRENT_YEAR,monthIndex:0,day:1,
})+DAYS_PER_YEAR/2;

type Session={authenticated:boolean;csrfToken?:string};
type ContextPoint={mouseX:number;mouseY:number;day:number;worldId:string|null};
type EventContext={mouseX:number;mouseY:number;event:ChronicleEventRecord};
const emptySession:Session={authenticated:false};

function draftKey(eventId:string|null){
  return eventId?'chronicle:event-draft:'+eventId:NEW_DRAFT_KEY;
}
function parseStoredDraft(key:string):EventDraft|null{
  try{
    const raw=localStorage.getItem(key);
    if(!raw)return null;
    const value=JSON.parse(raw) as EventDraft;
    if(!value||typeof value.title!=='string'||!Array.isArray(value.worldIds))return null;
    if(typeof value.color!=='string'||typeof value.significance!=='string')return null;
    return value;
  }catch{return null;}
}

export function ChroniclePage(){
  const worldsQuery=useWorldsQuery();
  const worlds=worldsQuery.currentData??[];
  const eventsQuery=useChronicleEventsQuery();
  const events=eventsQuery.currentData??[];
  const [createEvent,{isLoading:creating}]=useCreateChronicleEventMutation();
  const [updateEvent,{isLoading:updating}]=useUpdateChronicleEventMutation();
  const [deleteEvent,{isLoading:deleting}]=useDeleteChronicleEventMutation();
  const viewportRef=useRef<HTMLDivElement|null>(null);
  const drag=useRef<{x:number;center:number;pointer:number}|null>(null);
  const [width,setWidth]=useState(0);
  const [centerDay,setCenterDay]=useState(CURRENT_YEAR_CENTER);
  const [scale,setScale]=useState(DEFAULT_TIMELINE_SCALE);
  const [hoverDay,setHoverDay]=useState<number|null>(null);
  const [jumpOpen,setJumpOpen]=useState(false);
  const [jumpDate,setJumpDate]=useState<ChronicleDate>(()=>dayToChronicleDate(CURRENT_YEAR_CENTER));
  const [globalFilterAnchor,setGlobalFilterAnchor]=useState<HTMLElement|null>(null);
  const [globalFilters,setGlobalFilters]=useState<ChronicleFilterState>(()=>emptyChronicleFilters());
  const [worldFilterAnchor,setWorldFilterAnchor]=useState<{worldId:string;anchor:HTMLElement}|null>(null);
  const [worldFilters,setWorldFilters]=useState<Record<string,ChronicleFilterState>>({});
  const [session,setSession]=useState<Session>(emptySession);
  const [loginOpen,setLoginOpen]=useState(false);
  const [password,setPassword]=useState('');
  const [loginError,setLoginError]=useState('');
  const [trackContext,setTrackContext]=useState<ContextPoint|null>(null);
  const [eventContext,setEventContext]=useState<EventContext|null>(null);
  const [pendingCreate,setPendingCreate]=useState<ContextPoint|null>(null);
  const [pendingEditId,setPendingEditId]=useState<string|null>(null);
  const [editorOpen,setEditorOpen]=useState(false);
  const [editingEventId,setEditingEventId]=useState<string|null>(null);
  const [draft,setDraft]=useState<EventDraft|null>(null);
  const [editorError,setEditorError]=useState('');
  const [notice,setNotice]=useState('');
  const [selectedEvent,setSelectedEvent]=useState<ChronicleEventRecord|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<ChronicleEventRecord|null>(null);

  useEffect(()=>{
    void fetch('/api/auth/me',{credentials:'same-origin'})
      .then(async response=>setSession(await response.json() as Session))
      .catch(()=>setSession(emptySession));
  },[]);
  useEffect(()=>{
    const node=viewportRef.current;
    if(!node)return;
    const measure=()=>setWidth(node.clientWidth);
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(node);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(editorOpen&&draft)localStorage.setItem(draftKey(editingEventId),JSON.stringify(draft));
  },[editorOpen,draft,editingEventId]);

  const ticks=useMemo(()=>timelineTicks(centerDay,width,scale),[centerDay,width,scale]);
  const granularity=timelineGranularity(scale);
  const rangeLabel=visibleRangeLabel(width,scale);
  const hoverLeft=hoverDay===null?null:width/2+(hoverDay-centerDay)*scale;
  const grid=<>{ticks.map(tick=><span key={'grid-'+tick.kind+'-'+tick.day}
    className={'chronicle-grid-line kind-'+tick.kind+(tick.major?' major':'')}
    style={{left:width/2+(tick.day-centerDay)*scale}}/>)}</>;

  function zoom(factor:number,anchor=width/2){
    if(!width)return;
    const next=Math.max(MIN_TIMELINE_SCALE,Math.min(MAX_TIMELINE_SCALE,scale*factor));
    const underCursor=centerDay+(anchor-width/2)/scale;
    setCenterDay(underCursor-(anchor-width/2)/next);
    setScale(next);
  }
  function onWheel(event:ReactWheelEvent<HTMLDivElement>){
    event.preventDefault();
    const rect=event.currentTarget.getBoundingClientRect();
    if(event.shiftKey){setCenterDay(value=>value+event.deltaY/scale);return;}
    zoom(event.deltaY>0?.82:1.22,event.clientX-rect.left);
  }
  function pointerDown(event:ReactPointerEvent<HTMLDivElement>){
    if(event.button!==0||(event.target as Element).closest('button'))return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={x:event.clientX,center:centerDay,pointer:event.pointerId};
    event.currentTarget.classList.add('is-panning');
  }
  function pointerMove(event:ReactPointerEvent<HTMLDivElement>){
    const rect=event.currentTarget.getBoundingClientRect();
    setHoverDay(Math.round(dayAtViewportX(centerDay,rect.width,scale,event.clientX-rect.left)));
    if(!drag.current||drag.current.pointer!==event.pointerId)return;
    setCenterDay(drag.current.center-(event.clientX-drag.current.x)/scale);
  }
  function drillIn(event:ReactMouseEvent<HTMLDivElement>){
    const rect=event.currentTarget.getBoundingClientRect();
    const day=Math.round(dayAtViewportX(centerDay,rect.width,scale,event.clientX-rect.left));
    setCenterDay(day);
    setScale(drillInScale(granularity,scale));
  }
  function pointerUp(event:ReactPointerEvent<HTMLDivElement>){
    if(!drag.current||drag.current.pointer!==event.pointerId)return;
    drag.current=null;
    event.currentTarget.classList.remove('is-panning');
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function openTrackContext(event:ReactMouseEvent<HTMLDivElement>,worldId:string|null){
    event.preventDefault();
    setEventContext(null);
    const rect=event.currentTarget.getBoundingClientRect();
    const day=Math.round(dayAtViewportX(centerDay,rect.width,scale,event.clientX-rect.left));
    setTrackContext({mouseX:event.clientX+2,mouseY:event.clientY-6,day,worldId});
  }
  function openEventContext(event:ReactMouseEvent<HTMLButtonElement>,item:ChronicleEventRecord){
    event.preventDefault();
    event.stopPropagation();
    setTrackContext(null);
    setEventContext({mouseX:event.clientX+2,mouseY:event.clientY-6,event:item});
  }
  function openCreateEditor(point:ContextPoint){
    setTrackContext(null);
    setEditingEventId(null);
    const stored=parseStoredDraft(NEW_DRAFT_KEY);
    setDraft(stored??defaultEventDraft(point.day,point.worldId));
    setEditorError('');
    setEditorOpen(true);
    if(stored)setNotice('Восстановлен несохранённый черновик нового события.');
  }
  function beginCreate(point:ContextPoint){
    if(!session.authenticated){
      setPendingCreate(point);setLoginOpen(true);return;
    }
    openCreateEditor(point);
  }
  function openEditEditor(item:ChronicleEventRecord){
    setEventContext(null);
    setSelectedEvent(null);
    setEditingEventId(item.id);
    const stored=parseStoredDraft(draftKey(item.id));
    setDraft(stored??draftFromRecord(item));
    setEditorError('');
    setEditorOpen(true);
    if(stored)setNotice('Восстановлен несохранённый черновик изменений.');
  }
  function beginEdit(item:ChronicleEventRecord){
    if(!session.authenticated){
      setPendingEditId(item.id);setLoginOpen(true);return;
    }
    openEditEditor(item);
  }
  async function login(){
    setLoginError('');
    try{
      const response=await fetch('/api/auth/login',{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json'},body:JSON.stringify({password}),
      });
      const data=await response.json() as Session&{error?:{message?:string}};
      if(!response.ok)throw Error(data.error?.message??'Не удалось войти');
      setSession(data);setPassword('');setLoginOpen(false);
      await eventsQuery.refetch();
      if(pendingCreate){
        const point=pendingCreate;setPendingCreate(null);openCreateEditor(point);
      }else if(pendingEditId){
        const item=events.find(value=>value.id===pendingEditId);
        setPendingEditId(null);
        if(item)openEditEditor(item);
      }
    }catch(reason){setLoginError(reason instanceof Error?reason.message:String(reason));}
  }
  async function logout(){
    if(!session.csrfToken)return;
    await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',
      headers:{'x-csrf-token':session.csrfToken}});
    setSession(emptySession);await eventsQuery.refetch();
  }
  async function saveEvent(){
    if(!draft||!session.csrfToken)return;
    setEditorError('');
    const input=draftToInput(draft);
    try{
      if(editingEventId){
        await updateEvent({id:editingEventId,csrf:session.csrfToken,input}).unwrap();
      }else{
        await createEvent({csrf:session.csrfToken,input}).unwrap();
      }
      localStorage.removeItem(draftKey(editingEventId));
      setEditorOpen(false);setDraft(null);setEditingEventId(null);
      setNotice(editingEventId?'Изменения события сохранены.':'Событие Chronicle сохранено.');
    }catch(reason){
      const payload=reason as {data?:{error?:{message?:string}}};
      setEditorError(payload.data?.error?.message??'Не удалось сохранить событие');
    }
  }
  function closeEditor(){
    setEditorOpen(false);
    if(draft)setNotice('Черновик сохранён в браузере и восстановится при следующем открытии.');
  }
  async function confirmDelete(){
    if(!deleteTarget||!session.csrfToken)return;
    try{
      await deleteEvent({id:deleteTarget.id,csrf:session.csrfToken}).unwrap();
      localStorage.removeItem(draftKey(deleteTarget.id));
      setDeleteTarget(null);
      setSelectedEvent(null);
      setNotice('Событие удалено.');
    }catch{
      setNotice('Не удалось удалить событие.');
    }
  }

  const globalTags=useMemo(()=>chronicleTagOptions(events),[events]);
  const globallyFilteredEvents=useMemo(
    ()=>filterChronicleEvents(events,globalFilters),[events,globalFilters]);
  const globalFilterCount=chronicleFilterCount(globalFilters);
  const visibleWorlds=globalFilters.worldIds.length
    ?worlds.filter(world=>globalFilters.worldIds.includes(world.id))
    :worlds;
  const universeEvents=globallyFilteredEvents.filter(item=>item.worlds.length!==1);
  const activeWorldFilter=worldFilterAnchor
    ?worldFilters[worldFilterAnchor.worldId]??emptyChronicleFilters()
    :emptyChronicleFilters();
  const activeWorldTags=worldFilterAnchor?chronicleTagOptions(events.filter(item=>
    item.worlds.some(world=>world.id===worldFilterAnchor.worldId))):[];

  function filteredWorldEvents(worldId:string){
    const local=worldFilters[worldId]??emptyChronicleFilters();
    const inWorld=globallyFilteredEvents.filter(item=>item.worlds.some(link=>link.id===worldId));
    return filterChronicleEvents(inWorld,local);
  }
  function updateWorldFilter(worldId:string,filters:ChronicleFilterState){
    setWorldFilters(current=>({...current,[worldId]:filters}));
  }

  return <Box className="chronicle-shell">
    <Box component="header" className="chronicle-topbar">
      <Stack direction="row" gap={1.2} alignItems="center" minWidth={0}>
        <Typography component="h1" className="chronicle-brand">Chronicle</Typography>
        <Chip size="small" variant="outlined" label="374 дней · AS / BS"/>
      </Stack>
      <Box sx={{flex:1}}/>
      <Button size="small" variant={globalFilterCount?'contained':'outlined'}
        className="chronicle-global-filter-button"
        onClick={event=>setGlobalFilterAnchor(event.currentTarget)}>
        Фильтры{globalFilterCount?' · '+globalFilterCount:''}
      </Button>
      <Chip className="chronicle-detail-chip" size="small" label={timelineGranularityLabel(granularity)}/>
      <Typography className="chronicle-range" variant="caption">{rangeLabel}</Typography>
      <Button size="small" variant="outlined" onClick={()=>zoom(.78)}>−</Button>
      <Button size="small" variant="outlined" onClick={()=>zoom(1.28)}>+</Button>
      <Button size="small" variant="outlined" onClick={()=>{
        setJumpDate(dayToChronicleDate(centerDay));setJumpOpen(true);
      }}>К дате</Button>
      <Button size="small" variant="contained"
        onClick={()=>{setCenterDay(CURRENT_YEAR_CENTER);setScale(DEFAULT_TIMELINE_SCALE);}}>
        {CURRENT_YEAR} AS
      </Button>
      {session.authenticated
        ?<Button size="small" onClick={()=>void logout()}>Выйти</Button>
        :<Button size="small" onClick={()=>setLoginOpen(true)}>Войти</Button>}
    </Box>

    <Box className="chronicle-intro">
      <Typography variant="caption" color="text.secondary">
        ЛКМ + drag — двигать время · колесо — масштаб · ПКМ по дорожке — создать · ПКМ по событию — редактировать
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Цвет, иконка и значимость события теперь управляют его видом на шкале.
      </Typography>
    </Box>

    <Box className="chronicle-board">
      <Box className="chronicle-ruler-label">
        <Typography fontSize={12} fontWeight={800} color="text.secondary">ДОРОЖКИ</Typography>
      </Box>
      <Box ref={viewportRef} className={'chronicle-ruler view-'+granularity} onWheel={onWheel}
        onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={pointerUp} onPointerCancel={pointerUp}
        onPointerLeave={()=>{if(!drag.current)setHoverDay(null);}}
        onDoubleClick={drillIn}>
        {grid}
        {ticks.map(tick=><span key={'label-'+tick.kind+'-'+tick.day}
          className={'chronicle-tick-label kind-'+tick.kind}
          style={{left:width/2+(tick.day-centerDay)*scale}}>
          <span>{tick.label}</span>
          {tick.secondary&&<small>{tick.secondary}</small>}
        </span>)}
        {hoverLeft!==null&&hoverLeft>=0&&hoverLeft<=width&&<>
          <span className="chronicle-hover-line" style={{left:hoverLeft}}/>
          <span className="chronicle-hover-date" style={{left:hoverLeft}}>
            {formatChronicleDate(dayToChronicleDate(hoverDay!))}
          </span>
        </>}
      </Box>

      <Box className="chronicle-rows">
        <ChronicleTrack label="Мультивселенная" subtitle="Независимые и межмировые события"
          className="chronicle-track-universe" ticks={grid} events={universeEvents}
          centerDay={centerDay} scale={scale} width={width} granularity={granularity}
          hoverDay={hoverDay} onHoverDay={setHoverDay}
          onContext={event=>openTrackContext(event,null)}
          onEvent={setSelectedEvent} onEventContext={openEventContext}/>
        {worldsQuery.isLoading&&<Box className="chronicle-loading">
          <CircularProgress size={22}/><Typography variant="caption">Загружаем миры Atlas…</Typography>
        </Box>}
        {worldsQuery.isError&&<Box className="chronicle-loading">
          <Typography color="error.main">Не удалось получить миры Atlas.</Typography>
        </Box>}
        {visibleWorlds.map(world=>{
          const worldEvents=filteredWorldEvents(world.id);
          const localCount=chronicleFilterCount(worldFilters[world.id]??emptyChronicleFilters());
          const totalAfterGlobal=globallyFilteredEvents.filter(item=>
            item.worlds.some(link=>link.id===world.id)).length;
          return <Box key={world.id}>
            <ChronicleTrack label={world.name}
              subtitle={worldEvents.length+' из '+totalAfterGlobal+' событий после глобальных фильтров'}
              ticks={grid} events={worldEvents}
              centerDay={centerDay} scale={scale} width={width} granularity={granularity}
              hoverDay={hoverDay} onHoverDay={setHoverDay}
              filterCount={localCount}
              onFilterMenu={event=>setWorldFilterAnchor({worldId:world.id,anchor:event.currentTarget})}
              onContext={event=>openTrackContext(event,world.id)}
              onEvent={setSelectedEvent} onEventContext={openEventContext}/>
          </Box>;
        })}
      </Box>
    </Box>

    <ChronicleFilterMenu anchor={globalFilterAnchor} title="Фильтры Chronicle"
      filters={globalFilters} worlds={worlds} tags={globalTags}
      onChange={setGlobalFilters} onClose={()=>setGlobalFilterAnchor(null)}/>

    <ChronicleFilterMenu anchor={worldFilterAnchor?.anchor??null}
      title={worldFilterAnchor
        ?'Фильтры · '+(worlds.find(world=>world.id===worldFilterAnchor.worldId)?.name??'Мир')
        :'Фильтры мира'}
      filters={activeWorldFilter} tags={activeWorldTags}
      onChange={filters=>{
        if(worldFilterAnchor)updateWorldFilter(worldFilterAnchor.worldId,filters);
      }}
      onClose={()=>setWorldFilterAnchor(null)}/>

    <Dialog open={jumpOpen} onClose={()=>setJumpOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Перейти к дате</DialogTitle>
      <DialogContent>
        <Stack direction={{xs:'column',sm:'row'}} gap={1.2} sx={{pt:1}}>
          <FormControl size="small" sx={{minWidth:90}}>
            <InputLabel>Эра</InputLabel>
            <Select label="Эра" value={jumpDate.era}
              onChange={event=>setJumpDate(value=>({...value,era:event.target.value as ChronicleDate['era']}))}>
              <MenuItem value="AS">AS</MenuItem>
              <MenuItem value="BS">BS</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" type="number" label="Год" value={jumpDate.year}
            inputProps={{min:1}} onChange={event=>setJumpDate(value=>({
              ...value,year:Math.max(1,Number(event.target.value)||1),
            }))}/>
          <FormControl size="small" sx={{minWidth:150}}>
            <InputLabel>Месяц</InputLabel>
            <Select label="Месяц" value={jumpDate.monthIndex}
              onChange={event=>setJumpDate(value=>{
                const monthIndex=Number(event.target.value);
                return {...value,monthIndex,day:Math.min(value.day,CHRONICLE_MONTHS[monthIndex]!.days)};
              })}>
              {CHRONICLE_MONTHS.map((month,index)=>
                <MenuItem key={month.name} value={index}>{month.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" type="number" label="День" value={jumpDate.day}
            inputProps={{min:1,max:CHRONICLE_MONTHS[jumpDate.monthIndex]!.days}}
            onChange={event=>setJumpDate(value=>({
              ...value,day:Math.max(1,Math.min(CHRONICLE_MONTHS[value.monthIndex]!.days,
                Number(event.target.value)||1)),
            }))}/>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>setJumpOpen(false)}>Отмена</Button>
        <Button variant="contained" onClick={()=>{
          setCenterDay(chronicleDateToDay(jumpDate));
          setScale(value=>Math.max(value,.7));
          setJumpOpen(false);
        }}>Перейти</Button>
      </DialogActions>
    </Dialog>

    <Menu open={Boolean(trackContext)} onClose={()=>setTrackContext(null)}
      anchorReference="anchorPosition"
      anchorPosition={trackContext?{top:trackContext.mouseY,left:trackContext.mouseX}:undefined}>
      <MenuItem onClick={()=>trackContext&&beginCreate(trackContext)}>+ Создать событие здесь</MenuItem>
    </Menu>

    <Menu open={Boolean(eventContext)} onClose={()=>setEventContext(null)}
      anchorReference="anchorPosition"
      anchorPosition={eventContext?{top:eventContext.mouseY,left:eventContext.mouseX}:undefined}>
      <MenuItem onClick={()=>eventContext&&beginEdit(eventContext.event)}>Редактировать</MenuItem>
      <MenuItem onClick={()=>{
        if(!eventContext)return;
        if(!session.authenticated){
          setPendingEditId(eventContext.event.id);setEventContext(null);setLoginOpen(true);return;
        }
        setDeleteTarget(eventContext.event);setEventContext(null);
      }} sx={{color:'error.main'}}>Удалить</MenuItem>
    </Menu>

    <Dialog open={loginOpen} onClose={()=>setLoginOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Вход администратора</DialogTitle>
      <DialogContent>
        {loginError&&<Alert severity="error" sx={{mb:2}}>{loginError}</Alert>}
        <TextField autoFocus fullWidth type="password" label="Пароль" value={password}
          onChange={event=>setPassword(event.target.value)}
          onKeyDown={event=>{if(event.key==='Enter')void login();}}/>
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>setLoginOpen(false)}>Отмена</Button>
        <Button variant="contained" onClick={()=>void login()}>Войти</Button>
      </DialogActions>
    </Dialog>

    <EventEditorDialog open={editorOpen} draft={draft} worlds={worlds}
      editing={Boolean(editingEventId)} error={editorError}
      saving={creating||updating} onChange={setDraft}
      onClose={closeEditor} onSave={()=>void saveEvent()}/>

    <Dialog open={Boolean(deleteTarget)} onClose={()=>setDeleteTarget(null)} maxWidth="xs" fullWidth>
      <DialogTitle>Удалить событие?</DialogTitle>
      <DialogContent>
        <Typography>
          {deleteTarget?.title} будет удалено из Chronicle. Перед удалением сервер создаст backup базы.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>setDeleteTarget(null)}>Отмена</Button>
        <Button color="error" variant="contained" disabled={deleting}
          onClick={()=>void confirmDelete()}>Удалить</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(selectedEvent)} onClose={()=>setSelectedEvent(null)} fullWidth maxWidth="sm">
      {selectedEvent&&<>
        <DialogTitle>
          <Stack direction="row" gap={1.2} alignItems="center">
            {selectedEvent.icon&&<span className="chronicle-detail-icon"
              style={{background:selectedEvent.color}}>{selectedEvent.icon}</span>}
            <span>{selectedEvent.title}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack gap={1.4}>
            <Typography sx={{color:selectedEvent.color,fontWeight:700}}>
              {selectedEvent.startDay===null?'Дата неизвестна'
                :formatChronicleDate(dayToChronicleDate(selectedEvent.startDay))}
              {selectedEvent.endDay!==null
                ?' — '+formatChronicleDate(dayToChronicleDate(selectedEvent.endDay)):''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {selectedEvent.significance==='key'?'Ключевое событие'
                :selectedEvent.significance==='important'?'Важное событие':'Обычное событие'}
            </Typography>
            <Stack direction="row" gap={.7} flexWrap="wrap">
              {selectedEvent.worlds.map(world=><Chip key={world.id} size="small" label={world.name}/>)}
              {selectedEvent.tags.map(tag=><Chip key={tag.id} size="small" label={'#'+tag.name}/>)}
            </Stack>
            {selectedEvent.summary&&<Typography>{selectedEvent.summary}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          {session.authenticated&&<Button onClick={()=>beginEdit(selectedEvent)}>Редактировать</Button>}
          <Button onClick={()=>setSelectedEvent(null)}>Закрыть</Button>
        </DialogActions>
      </>}
    </Dialog>

    <Snackbar open={Boolean(notice)} autoHideDuration={3600}
      onClose={()=>setNotice('')} message={notice}/>
  </Box>;
}

function ChronicleTrack({label,subtitle,ticks,events,centerDay,scale,width,granularity,
  hoverDay,onHoverDay,className='',filterCount=0,onFilterMenu,onContext,
  onEvent,onEventContext,child=false}:{
  label:string;subtitle:string;ticks:ReactNode;events:ChronicleEventRecord[];
  centerDay:number;scale:number;width:number;granularity:TimelineGranularity;
  hoverDay:number|null;onHoverDay?:(day:number|null)=>void;className?:string;
  filterCount?:number;onFilterMenu?:(event:ReactMouseEvent<HTMLButtonElement>)=>void;
  onContext?:(event:ReactMouseEvent<HTMLDivElement>)=>void;
  onEvent?:(event:ChronicleEventRecord)=>void;
  onEventContext?:(event:ReactMouseEvent<HTMLButtonElement>,item:ChronicleEventRecord)=>void;
  child?:boolean;
}){
  const placed=layoutEvents(events,centerDay,scale,width);
  const lanes=placed.reduce((max,item)=>Math.max(max,item.lane+1),0);
  const laneHeight=granularity==='days'?58:50;
  const height=Math.max(child?62:86,lanes?30+lanes*laneHeight:0);
  const hoverLeft=hoverDay===null?null:width/2+(hoverDay-centerDay)*scale;
  return <Box className={'chronicle-track chronicle-view-'+granularity+' '+className+(child?' is-child':'')}
    style={{minHeight:height}}>
    <Box className={'chronicle-track-label'+(filterCount?' has-filter':'')}>
      <span className="chronicle-disclosure-spacer"/>
      <Box minWidth={0} sx={{flex:1}}>
        <Typography className="chronicle-track-name">{label}</Typography>
        <Typography className="chronicle-track-subtitle">{subtitle}</Typography>
      </Box>
      {onFilterMenu&&<button className={'chronicle-world-filter'+(filterCount?' is-active':'')}
        onClick={event=>{event.stopPropagation();onFilterMenu(event);}}
        title="Фильтры этого мира">
        Фильтр{filterCount?' · '+filterCount:''}
      </button>}
    </Box>
    <Box className="chronicle-track-time" onContextMenu={onContext}
      onPointerMove={event=>{
        const rect=event.currentTarget.getBoundingClientRect();
        onHoverDay?.(Math.round(dayAtViewportX(centerDay,rect.width,scale,event.clientX-rect.left)));
      }}
      onPointerLeave={()=>onHoverDay?.(null)}>
      {ticks}
      {hoverLeft!==null&&hoverLeft>=0&&hoverLeft<=width&&
        <span className="chronicle-hover-line" style={{left:hoverLeft}}/>}
      {!placed.length&&<span className="chronicle-empty-track">ПКМ — создать событие</span>}
      {placed.map(item=>{
        const style={
          left:item.left,top:14+item.lane*laneHeight,width:item.width,
          '--event-color':item.event.color,
        } as CSSProperties;
        return <button key={item.event.id}
          className={'chronicle-event chronicle-event-'+item.event.kind+
            ' chronicle-event-'+item.event.significance}
          style={style} title={item.event.title}
          onClick={event=>{event.stopPropagation();onEvent?.(item.event);}}
          onContextMenu={event=>onEventContext?.(event,item.event)}>
          {item.event.icon
            ?<span className="chronicle-event-icon">{item.event.icon}</span>
            :<span className="chronicle-event-mark"/>}
          <span className="chronicle-event-title">{item.event.title}</span>
        </button>;
      })}
    </Box>
  </Box>;
}

function layoutEvents(events:ChronicleEventRecord[],center:number,scale:number,width:number){
  const raw=events.filter(event=>event.startDay!==null).map(event=>{
    const start=event.startDay!;
    const left=width/2+(start-center)*scale;
    const end=event.endDay??start;
    const durationWidth=Math.max(4,(end-start+1)*scale);
    const labelWidth=event.significance==='key'?240:event.significance==='important'?205:175;
    const visualWidth=event.kind==='period'?durationWidth:labelWidth;
    const collisionWidth=event.kind==='period'?Math.max(durationWidth,labelWidth):labelWidth;
    return {event,left,width:visualWidth,right:left+collisionWidth,lane:0};
  }).filter(item=>item.right>-260&&item.left<width+260).sort((a,b)=>a.left-b.left);
  const ends:number[]=[];
  for(const item of raw){
    let lane=ends.findIndex(end=>item.left>end+10);
    if(lane<0){lane=ends.length;ends.push(item.right);}else ends[lane]=item.right;
    item.lane=lane;
  }
  return raw;
}
