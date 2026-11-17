import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import type { PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import { useWorldsQuery } from '../atlas/api';
import { CURRENT_YEAR, DAYS_PER_YEAR, chronicleDateToDay, formatChronicleYearBoundary } from './calendar';
import './chronicle.css';

const MIN_SCALE=.0025;
const MAX_SCALE=3;
const DEFAULT_SCALE=.08;
const CURRENT_YEAR_CENTER=chronicleDateToDay({era:'AS',year:CURRENT_YEAR,monthIndex:0,day:1})+DAYS_PER_YEAR/2;

type Tick={day:number;left:number;label:string;major:boolean};

function tickStep(scale:number){
  const candidates=[1,2,5,10,25,50,100,250,500,1000,2500];
  return candidates.find(years=>years*DAYS_PER_YEAR*scale>=86)??5000;
}
function ticksFor(center:number,width:number,scale:number):Tick[]{
  if(width<=0)return[];
  const years=tickStep(scale);
  const step=years*DAYS_PER_YEAR;
  const start=center-width/(2*scale);
  const end=center+width/(2*scale);
  const first=Math.floor(start/step)*step;
  const ticks:Tick[]=[];
  for(let day=first;day<=end+step;day+=step){
    const left=width/2+(day-center)*scale;
    ticks.push({day,left,label:formatChronicleYearBoundary(day),major:years>=10||Math.abs(Math.round(day/DAYS_PER_YEAR))%5===0});
  }
  return ticks;
}

export function ChroniclePage(){
  const worldsQuery=useWorldsQuery();
  const worlds=worldsQuery.currentData??[];
  const viewportRef=useRef<HTMLDivElement|null>(null);
  const drag=useRef<{x:number;center:number;pointer:number}|null>(null);
  const [width,setWidth]=useState(0);
  const [centerDay,setCenterDay]=useState(CURRENT_YEAR_CENTER);
  const [scale,setScale]=useState(DEFAULT_SCALE);
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());

  useEffect(()=>{
    const node=viewportRef.current;
    if(!node)return;
    const measure=()=>setWidth(node.clientWidth);
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(node);
    return()=>observer.disconnect();
  },[]);

  const ticks=useMemo(()=>ticksFor(centerDay,width,scale),[centerDay,width,scale]);
  const yearSpan=width&&scale?width/scale/DAYS_PER_YEAR:0;

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
    if(event.button!==0)return;
    if((event.target as Element).closest('button'))return;
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

  const grid=<>{ticks.map(tick=><span key={tick.day} className={'chronicle-grid-line'+(tick.major?' major':'')} style={{left:tick.left}}/>)}</>;

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
    </Box>

    <Box className="chronicle-intro">
      <Typography variant="caption" color="text.secondary">ЛКМ + перетаскивание — двигать время · колесо — масштаб · Shift + колесо — прокрутка</Typography>
      <Typography variant="caption" color="text.secondary">Первый каркас: миры уже берутся из Atlas; события и фильтруемые поддорожки подключим следующим этапом.</Typography>
    </Box>

    <Box className="chronicle-board">
      <Box className="chronicle-ruler-label"><Typography fontSize={11} fontWeight={800} color="text.secondary">ДОРОЖКИ</Typography></Box>
      <Box ref={viewportRef} className="chronicle-ruler" onWheel={onWheel} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        {grid}
        {ticks.map(tick=><span key={'label-'+tick.day} className="chronicle-tick-label" style={{left:tick.left}}>{tick.label}</span>)}
      </Box>

      <Box className="chronicle-rows">
        <ChronicleTrack label="Мультивселенная" subtitle="Независимые и глобальные события" className="chronicle-track-universe" ticks={grid}/>
        {worldsQuery.isLoading&&<Box className="chronicle-loading"><CircularProgress size={22}/><Typography variant="caption">Загружаем миры Atlas…</Typography></Box>}
        {worldsQuery.isError&&<Box className="chronicle-loading"><Typography color="error.main">Не удалось получить миры Atlas.</Typography></Box>}
        {worlds.map(world=><Box key={world.id}>
          <ChronicleTrack label={world.name} subtitle="Обзорная дорожка мира" ticks={grid} expandable expanded={expanded.has(world.id)} onToggle={()=>toggleWorld(world.id)}/>
          {expanded.has(world.id)&&<ChronicleTrack label="Поддорожки" subtitle="Здесь появятся сохранённые фильтры по тегам" ticks={grid} child/>}
        </Box>)}
      </Box>
    </Box>
  </Box>;
}

function ChronicleTrack({label,subtitle,ticks,className='',expandable=false,expanded=false,onToggle,child=false}:{
  label:string;subtitle:string;ticks:ReactNode;className?:string;expandable?:boolean;expanded?:boolean;onToggle?:()=>void;child?:boolean;
}){
  return <Box className={'chronicle-track '+className+(child?' is-child':'')}>
    <Box className="chronicle-track-label">
      {expandable?<button className="chronicle-disclosure" onClick={onToggle} aria-label={expanded?'Свернуть дорожку':'Развернуть дорожку'}>{expanded?'⌄':'›'}</button>:<span className="chronicle-disclosure-spacer"/>}
      <Box minWidth={0}>
        <Typography className="chronicle-track-name">{label}</Typography>
        <Typography className="chronicle-track-subtitle">{subtitle}</Typography>
      </Box>
    </Box>
    <Box className="chronicle-track-time">{ticks}<span className="chronicle-empty-track">Событий Chronicle пока нет</span></Box>
  </Box>;
}
