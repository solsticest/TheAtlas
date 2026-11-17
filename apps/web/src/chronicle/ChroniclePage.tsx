import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, InputLabel, Menu, MenuItem, Select, Snackbar, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import type {
  PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent,
} from 'react';
import type { ChronicleEventRecord } from '@atlas/shared';
import {
  useChronicleEventsQuery, useCreateChronicleEventMutation, useWorldsQuery,
} from '../atlas/api';
import {
  CHRONICLE_MONTHS, CURRENT_YEAR, DAYS_PER_YEAR, chronicleDateToDay,
  dayToChronicleDate, formatChronicleDate, formatChronicleYearBoundary,
  type ChronicleDate,
} from './calendar';
import './chronicle.css';

const MIN_SCALE=.0025;
const MAX_SCALE=3;
const DEFAULT_SCALE=.08;
const DRAFT_KEY='chronicle:new-event-draft:v1';
const CURRENT_YEAR_CENTER=chronicleDateToDay({
  era:'AS',year:CURRENT_YEAR,monthIndex:0,day:1,
})+DAYS_PER_YEAR/2;

type Session={authenticated:boolean;csrfToken?:string};
type Tick={day:number;left:number;label:string;major:boolean};
type ContextPoint={mouseX:number;mouseY:number;day:number;worldId:string|null};
type EventDraft={
  title:string;summary:string;kind:'point'|'period';
  start:ChronicleDate;end:ChronicleDate;
  worldIds:string[];tagText:string;visibility:'draft'|'gm'|'public';
};
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
function defaultDraft(day:number,worldId:string|null):EventDraft{
  return {
    title:'',summary:'',kind:'point',
    start:dayToChronicleDate(day),end:dayToChronicleDate(day+7),
    worldIds:worldId?[worldId]:[],tagText:'',visibility:'gm',
  };
}
function parseStoredDraft():EventDraft|null{
  try{
    const raw=localStorage.getItem(DRAFT_KEY);
    if(!raw)return null;
    const value=JSON.parse(raw) as EventDraft;
    if(!value||typeof value.title!=='string'||!Array.isArray(value.worldIds))return null;
    return value;
  }catch{return null;}
}

export function ChroniclePage(){
  const worldsQuery=useWorldsQuery();
  const worlds=worldsQuery.currentData??[];
  const eventsQuery=useChronicleEventsQuery();
  const events=eventsQuery.currentData??[];
  const [createEvent,{isLoading:creating}]=useCreateChronicleEventMutation();
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
  const [context,setContext]=useState<ContextPoint|null>(null);
  const [pendingCreate,setPendingCreate]=useState<ContextPoint|null>(null);
  const [editorOpen,setEditorOpen]=useState(false);
  const [draft,setDraft]=useState<EventDraft|null>(null);
  const [editorError,setEditorError]=useState('');
  const [notice,setNotice]=useState('');
  const [selectedEvent,setSelectedEvent]=useState<ChronicleEventRecord|null>(null);

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
    if(editorOpen&&draft)localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));
  },[editorOpen,draft]);

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
  function openTrackContext(event:React.MouseEvent<HTMLDivElement>,worldId:string|null){
    event.preventDefault();
    const rect=event.currentTarget.getBoundingClientRect();
    const day=Math.round(centerDay+(event.clientX-rect.left-rect.width/2)/scale);
    setContext({mouseX:event.clientX+2,mouseY:event.clientY-6,day,worldId});
  }
  function beginCreate(point:ContextPoint){
    setContext(null);
    if(!session.authenticated){
      setPendingCreate(point);setLoginOpen(true);return;
    }
    const stored=parseStoredDraft();
    setDraft(stored??defaultDraft(point.day,point.worldId));
    setEditorError('');
    setEditorOpen(true);
    if(stored)setNotice('Восстановлен несохранённый черновик события.');
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
      if(pendingCreate){const point=pendingCreate;setPendingCreate(null);beginCreate(point);}
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
    const startDay=chronicleDateToDay(draft.start);
    const endDay=draft.kind==='period'?chronicleDateToDay(draft.end):null;
    const tagNames=draft.tagText.split(',').map(x=>x.trim()).filter(Boolean);
    try{
      await createEvent({csrf:session.csrfToken,input:{
        title:draft.title.trim(),summary:draft.summary,article:'',kind:draft.kind,
        startDay,endDay,startPrecision:'exact',earliestDay:null,latestDay:null,
        endPrecision:draft.kind==='period'?'exact':null,worldIds:draft.worldIds,
        tagNames,significance:'normal',visibility:draft.visibility,
      }}).unwrap();
      localStorage.removeItem(DRAFT_KEY);
      setEditorOpen(false);setDraft(null);
      setNotice('Событие Chronicle сохранено.');
    }catch(reason){
      const payload=reason as {data?:{error?:{message?:string}}};
      setEditorError(payload.data?.error?.message??'Не удалось сохранить событие');
    }
  }
  function closeEditor(){
    setEditorOpen(false);
    if(draft)setNotice('Черновик сохранён в браузере и восстановится при следующем создании.');
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
      <Button size="small" variant="contained" onClick={()=>{setCenterDay(CURRENT_YEAR_CENTER);setScale(DEFAULT_SCALE);}}>{CURRENT_YEAR} AS</Button>
      {session.authenticated
        ?<Button size="small" onClick={()=>void logout()}>Выйти</Button>
        :<Button size="small" onClick={()=>setLoginOpen(true)}>Войти</Button>}
    </Box>

    <Box className="chronicle-intro">
      <Typography variant="caption" color="text.secondary">ЛКМ + drag — двигать время · колесо — масштаб · ПКМ по дорожке — создать событие</Typography>
      <Typography variant="caption" color="text.secondary">События мира получают связь с ним автоматически; независимые создаются на дорожке «Мультивселенная».</Typography>
    </Box>

    <Box className="chronicle-board">
      <Box className="chronicle-ruler-label"><Typography fontSize={11} fontWeight={800} color="text.secondary">ДОРОЖКИ</Typography></Box>
      <Box ref={viewportRef} className="chronicle-ruler" onWheel={onWheel}
        onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        {grid}
        {ticks.map(tick=><span key={'label-'+tick.day} className="chronicle-tick-label" style={{left:tick.left}}>{tick.label}</span>)}
      </Box>

      <Box className="chronicle-rows">
        <ChronicleTrack label="Мультивселенная" subtitle="Независимые и межмировые события"
          className="chronicle-track-universe" ticks={grid} events={universeEvents}
          centerDay={centerDay} scale={scale} width={width}
          onContext={event=>openTrackContext(event,null)} onEvent={setSelectedEvent}/>
        {worldsQuery.isLoading&&<Box className="chronicle-loading"><CircularProgress size={22}/><Typography variant="caption">Загружаем миры Atlas…</Typography></Box>}
        {worldsQuery.isError&&<Box className="chronicle-loading"><Typography color="error.main">Не удалось получить миры Atlas.</Typography></Box>}
        {worlds.map(world=><Box key={world.id}>
          <ChronicleTrack label={world.name} subtitle="Обзорная дорожка мира" ticks={grid}
            events={events.filter(item=>item.worlds.some(link=>link.id===world.id))}
            centerDay={centerDay} scale={scale} width={width}
            expandable expanded={expanded.has(world.id)} onToggle={()=>toggleWorld(world.id)}
            onContext={event=>openTrackContext(event,world.id)} onEvent={setSelectedEvent}/>
          {expanded.has(world.id)&&<ChronicleTrack label="Поддорожки"
            subtitle="Фильтры по тегам появятся следующим этапом" ticks={grid} events={[]}
            centerDay={centerDay} scale={scale} width={width} child/>}
        </Box>)}
      </Box>
    </Box>

    <Menu open={Boolean(context)} onClose={()=>setContext(null)}
      anchorReference="anchorPosition"
      anchorPosition={context?{top:context.mouseY,left:context.mouseX}:undefined}>
      <MenuItem onClick={()=>context&&beginCreate(context)}>+ Создать событие здесь</MenuItem>
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

    <Dialog open={editorOpen&&Boolean(draft)} onClose={closeEditor} fullWidth maxWidth="md">
      <DialogTitle>Новое событие Chronicle</DialogTitle>
      {draft&&<DialogContent>
        <Stack gap={2} sx={{pt:1}}>
          {editorError&&<Alert severity="error">{editorError}</Alert>}
          <TextField autoFocus label="Название" value={draft.title}
            onChange={event=>setDraft({...draft,title:event.target.value})}/>
          <ToggleButtonGroup exclusive size="small" value={draft.kind}
            onChange={(_event,value:'point'|'period'|null)=>value&&setDraft({...draft,kind:value})}>
            <ToggleButton value="point">Момент</ToggleButton>
            <ToggleButton value="period">Период</ToggleButton>
          </ToggleButtonGroup>
          <DateFields title="Начало" value={draft.start}
            onChange={start=>setDraft({...draft,start})}/>
          {draft.kind==='period'&&<DateFields title="Окончание" value={draft.end}
            onChange={end=>setDraft({...draft,end})}/>}
          <FormControl fullWidth size="small">
            <InputLabel id="chronicle-worlds">Миры</InputLabel>
            <Select multiple labelId="chronicle-worlds" label="Миры" value={draft.worldIds}
              onChange={event=>setDraft({...draft,worldIds:typeof event.target.value==='string'
                ?event.target.value.split(','):event.target.value})}>
              {worlds.map(world=><MenuItem key={world.id} value={world.id}>{world.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Теги" helperText="Через запятую: Война, Магия, Политика"
            value={draft.tagText} onChange={event=>setDraft({...draft,tagText:event.target.value})}/>
          <TextField label="Краткое описание" multiline minRows={3} value={draft.summary}
            onChange={event=>setDraft({...draft,summary:event.target.value})}/>
          <FormControl fullWidth size="small">
            <InputLabel id="chronicle-visibility">Видимость</InputLabel>
            <Select labelId="chronicle-visibility" label="Видимость" value={draft.visibility}
              onChange={event=>setDraft({...draft,visibility:event.target.value as EventDraft['visibility']})}>
              <MenuItem value="draft">Черновик</MenuItem>
              <MenuItem value="gm">Только мастер</MenuItem>
              <MenuItem value="public">Публичное</MenuItem>
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary">
            Черновик сохраняется автоматически в браузере. В SQLite изменения попадут только после «Сохранить».
          </Typography>
        </Stack>
      </DialogContent>}
      <DialogActions>
        <Button onClick={closeEditor}>Закрыть</Button>
        <Button variant="contained" disabled={!draft?.title.trim()||creating}
          onClick={()=>void saveEvent()}>Сохранить</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(selectedEvent)} onClose={()=>setSelectedEvent(null)} fullWidth maxWidth="sm">
      {selectedEvent&&<>
        <DialogTitle>{selectedEvent.title}</DialogTitle>
        <DialogContent>
          <Stack gap={1.4}>
            <Typography color="primary.main">
              {selectedEvent.startDay===null?'Дата неизвестна':formatChronicleDate(dayToChronicleDate(selectedEvent.startDay))}
              {selectedEvent.endDay!==null?' — '+formatChronicleDate(dayToChronicleDate(selectedEvent.endDay)):''}
            </Typography>
            <Stack direction="row" gap={.7} flexWrap="wrap">
              {selectedEvent.worlds.map(world=><Chip key={world.id} size="small" label={world.name}/>)}
              {selectedEvent.tags.map(tag=><Chip key={tag.id} size="small" label={'#'+tag.name}/>)}
            </Stack>
            {selectedEvent.summary&&<Typography>{selectedEvent.summary}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={()=>setSelectedEvent(null)}>Закрыть</Button></DialogActions>
      </>}
    </Dialog>

    <Snackbar open={Boolean(notice)} autoHideDuration={3600}
      onClose={()=>setNotice('')} message={notice}/>
  </Box>;
}

function DateFields({title,value,onChange}:{
  title:string;value:ChronicleDate;onChange:(date:ChronicleDate)=>void;
}){
  const month=CHRONICLE_MONTHS[value.monthIndex]!;
  const set=(patch:Partial<ChronicleDate>)=>{
    const next={...value,...patch};
    const max=CHRONICLE_MONTHS[next.monthIndex]!.days;
    if(next.day>max)next.day=max;
    onChange(next);
  };
  return <Stack gap={1}>
    <Typography variant="caption" color="text.secondary">{title}</Typography>
    <Stack direction={{xs:'column',sm:'row'}} gap={1}>
      <FormControl size="small" sx={{minWidth:90}}>
        <InputLabel>Эра</InputLabel>
        <Select label="Эра" value={value.era}
          onChange={event=>set({era:event.target.value as ChronicleDate['era']})}>
          <MenuItem value="AS">AS</MenuItem><MenuItem value="BS">BS</MenuItem>
        </Select>
      </FormControl>
      <TextField size="small" type="number" label="Год" value={value.year}
        inputProps={{min:1}} onChange={event=>set({year:Math.max(1,Number(event.target.value)||1)})}/>
      <FormControl size="small" sx={{minWidth:150}}>
        <InputLabel>Месяц</InputLabel>
        <Select label="Месяц" value={value.monthIndex}
          onChange={event=>set({monthIndex:Number(event.target.value)})}>
          {CHRONICLE_MONTHS.map((item,index)=><MenuItem key={item.name} value={index}>{item.name}</MenuItem>)}
        </Select>
      </FormControl>
      <TextField size="small" type="number" label="День" value={value.day}
        helperText={'1–'+month.days} inputProps={{min:1,max:month.days}}
        onChange={event=>set({day:Math.min(month.days,Math.max(1,Number(event.target.value)||1))})}/>
    </Stack>
  </Stack>;
}

function ChronicleTrack({label,subtitle,ticks,events,centerDay,scale,width,className='',
  expandable=false,expanded=false,onToggle,onContext,onEvent,child=false}:{
  label:string;subtitle:string;ticks:ReactNode;events:ChronicleEventRecord[];
  centerDay:number;scale:number;width:number;className?:string;
  expandable?:boolean;expanded?:boolean;onToggle?:()=>void;
  onContext?:(event:React.MouseEvent<HTMLDivElement>)=>void;
  onEvent?:(event:ChronicleEventRecord)=>void;child?:boolean;
}){
  const placed=layoutEvents(events,centerDay,scale,width);
  const lanes=placed.reduce((max,item)=>Math.max(max,item.lane+1),0);
  const height=Math.max(child?56:78,lanes?28+lanes*34:0);
  return <Box className={'chronicle-track '+className+(child?' is-child':'')} style={{minHeight:height}}>
    <Box className="chronicle-track-label">
      {expandable?<button className="chronicle-disclosure" onClick={onToggle}
        aria-label={expanded?'Свернуть дорожку':'Развернуть дорожку'}>{expanded?'⌄':'›'}</button>
        :<span className="chronicle-disclosure-spacer"/>}
      <Box minWidth={0}>
        <Typography className="chronicle-track-name">{label}</Typography>
        <Typography className="chronicle-track-subtitle">{subtitle}</Typography>
      </Box>
    </Box>
    <Box className="chronicle-track-time" onContextMenu={onContext}>
      {ticks}
      {!placed.length&&<span className="chronicle-empty-track">ПКМ — создать событие</span>}
      {placed.map(item=><button key={item.event.id}
        className={'chronicle-event chronicle-event-'+item.event.kind}
        style={{left:item.left,top:14+item.lane*34,width:item.width}}
        title={item.event.title} onClick={()=>onEvent?.(item.event)}>
        <span className="chronicle-event-mark"/><span className="chronicle-event-title">{item.event.title}</span>
      </button>)}
    </Box>
  </Box>;
}
function layoutEvents(events:ChronicleEventRecord[],center:number,scale:number,width:number){
  const raw=events.filter(event=>event.startDay!==null).map(event=>{
    const start=event.startDay!;
    const left=width/2+(start-center)*scale;
    const end=event.endDay??start;
    const span=Math.max(event.kind==='period'?18:10,(end-start)*scale);
    const visualWidth=event.kind==='period'?Math.max(90,span):150;
    return {event,left,width:visualWidth,right:left+visualWidth,lane:0};
  }).filter(item=>item.right>-180&&item.left<width+180).sort((a,b)=>a.left-b.left);
  const ends:number[]=[];
  for(const item of raw){
    let lane=ends.findIndex(end=>item.left>end+8);
    if(lane<0){lane=ends.length;ends.push(item.right);}else ends[lane]=item.right;
    item.lane=lane;
  }
  return raw;
}
