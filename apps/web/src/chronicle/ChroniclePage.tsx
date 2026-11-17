import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Menu, MenuItem, Snackbar, Stack, TextField, Typography,
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
  CURRENT_YEAR, DAYS_PER_YEAR, chronicleDateToDay, dayToChronicleDate,
  formatChronicleDate, formatChronicleYearBoundary,
} from './calendar';
import {
  EventEditorDialog, defaultEventDraft, draftFromRecord, draftToInput,
  type EventDraft,
} from './EventEditorDialog';
import './chronicle.css';

const MIN_SCALE=.0025;
const MAX_SCALE=3;
const DEFAULT_SCALE=.08;
const NEW_DRAFT_KEY='chronicle:new-event-draft:v2';
const CURRENT_YEAR_CENTER=chronicleDateToDay({
  era:'AS',year:CURRENT_YEAR,monthIndex:0,day:1,
})+DAYS_PER_YEAR/2;

type Session={authenticated:boolean;csrfToken?:string};
type Tick={day:number;left:number;label:string;major:boolean};
type ContextPoint={mouseX:number;mouseY:number;day:number;worldId:string|null};
type EventContext={mouseX:number;mouseY:number;event:ChronicleEventRecord};
const emptySession:Session={authenticated:false};

function tickStep(scale:number){
  const candidates=[1,2,5,10,25,50,100,250,500,1000,2500];
  return candidates.find(years=>years*DAYS_PER_YEAR*scale>=86)??5000;
}
function ticksFor(center:number,width:number,scale:number):Tick[]{
  if(width<=0)return[];
  const years=tickStep(scale),step=years*DAYS_PER_YEAR;
  const start=center-width/(2*scale),end=center+width/(2*scale);
  const first=Math.floor(start/step)*step,ticks:Tick[]=[];
  for(let day=first;day<=end+step;day+=step){
    const left=width/2+(day-center)*scale;
    ticks.push({
      day,left,label:formatChronicleYearBoundary(day),
      major:years>=10||Math.abs(Math.round(day/DAYS_PER_YEAR))%5===0,
    });
  }
  return ticks;
}
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
  const [scale,setScale]=useState(DEFAULT_SCALE);
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
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

  const ticks=useMemo(()=>ticksFor(centerDay,width,scale),[centerDay,width,scale]);
  const yearSpan=width&&scale?width/scale/DAYS_PER_YEAR:0;
  const grid=<>{ticks.map(tick=><span key={tick.day}
    className={'chronicle-grid-line'+(tick.major?' major':'')} style={{left:tick.left}}/>)}</>;

  function zoom(factor:number,anchor=width/2){
    if(!width)return;
    const next=Math.max(MIN_SCALE,Math.min(MAX_SCALE,scale*factor));
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
    if(!drag.current||drag.current.pointer!==event.pointerId)return;
    setCenterDay(drag.current.center-(event.clientX-drag.current.x)/scale);
  }
  function pointerUp(event:ReactPointerEvent<HTMLDivElement>){
    if(!drag.current||drag.current.pointer!==event.pointerId)return;
    drag.current=null;
    event.currentTarget.classList.remove('is-panning');
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function toggleWorld(id:string){
    setExpanded(current=>{
      const next=new Set(current);
      if(next.has(id))next.delete(id);else next.add(id);
      return next;
    });
  }
  function openTrackContext(event:ReactMouseEvent<HTMLDivElement>,worldId:string|null){
    event.preventDefault();
    setEventContext(null);
    const rect=event.currentTarget.getBoundingClientRect();
    const day=Math.round(centerDay+(event.clientX-rect.left-rect.width/2)/scale);
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

  const universeEvents=events.filter(item=>item.worlds.length!==1);

  return <Box className="chronicle-shell">
    <Box component="header" className="chronicle-topbar">
      <Stack direction="row" gap={1.2} alignItems="center" minWidth={0}>
        <Typography component="h1" className="chronicle-brand">Chronicle</Typography>
        <Chip size="small" variant="outlined" label="374 дней · AS / BS"/>
      </Stack>
      <Box sx={{flex:1}}/>
      <Typography className="chronicle-range" variant="caption">
        {yearSpan?'≈ '+Math.max(1,Math.round(yearSpan))+' лет на экране':''}
      </Typography>
      <Button size="small" variant="outlined" onClick={()=>zoom(.78)}>−</Button>
      <Button size="small" variant="outlined" onClick={()=>zoom(1.28)}>+</Button>
      <Button size="small" variant="contained"
        onClick={()=>{setCenterDay(CURRENT_YEAR_CENTER);setScale(DEFAULT_SCALE);}}>
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
      <Box ref={viewportRef} className="chronicle-ruler" onWheel={onWheel}
        onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        {grid}
        {ticks.map(tick=><span key={'label-'+tick.day} className="chronicle-tick-label"
          style={{left:tick.left}}>{tick.label}</span>)}
      </Box>

      <Box className="chronicle-rows">
        <ChronicleTrack label="Мультивселенная" subtitle="Независимые и межмировые события"
          className="chronicle-track-universe" ticks={grid} events={universeEvents}
          centerDay={centerDay} scale={scale} width={width}
          onContext={event=>openTrackContext(event,null)}
          onEvent={setSelectedEvent} onEventContext={openEventContext}/>
        {worldsQuery.isLoading&&<Box className="chronicle-loading">
          <CircularProgress size={22}/><Typography variant="caption">Загружаем миры Atlas…</Typography>
        </Box>}
        {worldsQuery.isError&&<Box className="chronicle-loading">
          <Typography color="error.main">Не удалось получить миры Atlas.</Typography>
        </Box>}
        {worlds.map(world=><Box key={world.id}>
          <ChronicleTrack label={world.name} subtitle="Обзорная дорожка мира" ticks={grid}
            events={events.filter(item=>item.worlds.some(link=>link.id===world.id))}
            centerDay={centerDay} scale={scale} width={width}
            expandable expanded={expanded.has(world.id)} onToggle={()=>toggleWorld(world.id)}
            onContext={event=>openTrackContext(event,world.id)}
            onEvent={setSelectedEvent} onEventContext={openEventContext}/>
          {expanded.has(world.id)&&<ChronicleTrack label="Поддорожки"
            subtitle="Фильтры по тегам появятся следующим этапом" ticks={grid} events={[]}
            centerDay={centerDay} scale={scale} width={width} child/>}
        </Box>)}
      </Box>
    </Box>

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

function ChronicleTrack({label,subtitle,ticks,events,centerDay,scale,width,className='',
  expandable=false,expanded=false,onToggle,onContext,onEvent,onEventContext,child=false}:{
  label:string;subtitle:string;ticks:ReactNode;events:ChronicleEventRecord[];
  centerDay:number;scale:number;width:number;className?:string;
  expandable?:boolean;expanded?:boolean;onToggle?:()=>void;
  onContext?:(event:ReactMouseEvent<HTMLDivElement>)=>void;
  onEvent?:(event:ChronicleEventRecord)=>void;
  onEventContext?:(event:ReactMouseEvent<HTMLButtonElement>,item:ChronicleEventRecord)=>void;
  child?:boolean;
}){
  const placed=layoutEvents(events,centerDay,scale,width);
  const lanes=placed.reduce((max,item)=>Math.max(max,item.lane+1),0);
  const height=Math.max(child?62:86,lanes?30+lanes*50:0);
  return <Box className={'chronicle-track '+className+(child?' is-child':'')}
    style={{minHeight:height}}>
    <Box className="chronicle-track-label">
      {expandable?<button className="chronicle-disclosure" onClick={onToggle}
        aria-label={expanded?'Свернуть дорожку':'Развернуть дорожку'}>
        {expanded?'⌄':'›'}
      </button>:<span className="chronicle-disclosure-spacer"/>}
      <Box minWidth={0}>
        <Typography className="chronicle-track-name">{label}</Typography>
        <Typography className="chronicle-track-subtitle">{subtitle}</Typography>
      </Box>
    </Box>
    <Box className="chronicle-track-time" onContextMenu={onContext}>
      {ticks}
      {!placed.length&&<span className="chronicle-empty-track">ПКМ — создать событие</span>}
      {placed.map(item=>{
        const style={
          left:item.left,top:14+item.lane*50,width:item.width,
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
    const span=Math.max(event.kind==='period'?18:10,(end-start)*scale);
    const base=event.significance==='key'?240:event.significance==='important'?205:175;
    const periodMin=event.significance==='key'?180:event.significance==='important'?135:105;
    const visualWidth=event.kind==='period'?Math.max(periodMin,span):base;
    return {event,left,width:visualWidth,right:left+visualWidth,lane:0};
  }).filter(item=>item.right>-260&&item.left<width+260).sort((a,b)=>a.left-b.left);
  const ends:number[]=[];
  for(const item of raw){
    let lane=ends.findIndex(end=>item.left>end+10);
    if(lane<0){lane=ends.length;ends.push(item.right);}else ends[lane]=item.right;
    item.lane=lane;
  }
  return raw;
}
