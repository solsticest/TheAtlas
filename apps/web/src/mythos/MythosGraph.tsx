import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, Menu, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type {
  MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent,
} from 'react';
import {
  MYTHOS_GRAPH_COORD_MAX, MYTHOS_GRAPH_COORD_MIN,
  type MythosDeityRecord, type MythosPantheonRecord, type MythosRelationInput, type MythosRelationRecord,
} from '@atlas/shared';

type GraphLayer='relations'|'origin'|'politics'|'domains'|'pantheon';
type LayoutMode='free'|'genealogy';
type Edge={
  id:string;sourceId:string;targetId:string;label:string;category:string;color:string;
  relation?:MythosRelationRecord;
};
type Viewport={x:number;y:number;scale:number};
type ContextState={
  mouseX:number;mouseY:number;worldX:number;worldY:number;deityId:string|null;
};

const MIN_ZOOM=.45;
const MAX_ZOOM=3.5;
const relationColors:Record<string,string>={
  origin:'#8aa3c7',alliance:'#7eb48a',conflict:'#c66b68',service:'#c6a569',
  identity:'#a788c7',other:'#8f979f',domain:'#6e9fb1',pantheon:'#b59362',
};
const layerLabels:Record<GraphLayer,string>={
  relations:'Все связи',origin:'Происхождение',politics:'Политика',
  domains:'Общие домены',pantheon:'Пантеоны',
};
const categoryLabels:Record<string,string>={
  origin:'Происхождение',alliance:'Союз',conflict:'Конфликт',
  service:'Служение / иерархия',identity:'Воплощение / тождество',other:'Другое',
};
const emptyRelation=(sourceId:string,targetId:string):MythosRelationInput=>({
  sourceId,targetId,type:'связан с',category:'other',label:'',description:'',
  startDay:null,endDay:null,visibility:'gm',
});
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

function syntheticDomainEdges(deities:MythosDeityRecord[]):Edge[]{
  const out:Edge[]=[];
  for(let i=0;i<deities.length;i++)for(let j=i+1;j<deities.length;j++){
    const left=deities[i]!,right=deities[j]!;
    const keys=new Map(left.domains.map(name=>[name.toLocaleLowerCase('ru'),name]));
    const shared=right.domains.map(name=>keys.get(name.toLocaleLowerCase('ru'))).filter(Boolean) as string[];
    if(shared.length)out.push({
      id:'domain:'+left.id+':'+right.id,sourceId:left.id,targetId:right.id,
      label:shared.slice(0,2).join(', ')+(shared.length>2?'…':''),
      category:'domain',color:relationColors.domain!,
    });
  }
  return out;
}
function syntheticPantheonEdges(deities:MythosDeityRecord[]):Edge[]{
  const groups=new Map<string,MythosDeityRecord[]>();
  for(const deity of deities)if(deity.pantheonId){
    const list=groups.get(deity.pantheonId)??[];list.push(deity);groups.set(deity.pantheonId,list);
  }
  const out:Edge[]=[];
  for(const [pantheonId,list] of groups)for(let i=1;i<list.length;i++){
    out.push({
      id:'pantheon:'+pantheonId+':'+i,sourceId:list[0]!.id,targetId:list[i]!.id,
      label:list[i]!.pantheon?.name??'Пантеон',category:'pantheon',color:relationColors.pantheon!,
    });
  }
  return out;
}
function genealogyPositions(deities:MythosDeityRecord[],relations:MythosRelationRecord[]){
  const ids=new Set(deities.map(item=>item.id));
  const parents=relations.filter(r=>r.category==='origin'&&ids.has(r.sourceId)&&ids.has(r.targetId));
  const incoming=new Map<string,number>();
  deities.forEach(d=>incoming.set(d.id,0));
  parents.forEach(r=>incoming.set(r.targetId,(incoming.get(r.targetId)??0)+1));
  const queue=deities.filter(d=>(incoming.get(d.id)??0)===0).map(d=>d.id);
  const depth=new Map<string,number>(queue.map(id=>[id,0]));
  while(queue.length){
    const id=queue.shift()!,base=depth.get(id)??0;
    for(const rel of parents.filter(r=>r.sourceId===id)){
      depth.set(rel.targetId,Math.max(depth.get(rel.targetId)??0,base+1));
      incoming.set(rel.targetId,(incoming.get(rel.targetId)??1)-1);
      if(incoming.get(rel.targetId)===0)queue.push(rel.targetId);
    }
  }
  deities.forEach(d=>{if(!depth.has(d.id))depth.set(d.id,0);});
  const levels=new Map<number,MythosDeityRecord[]>();
  deities.forEach(d=>{const level=depth.get(d.id)??0;const list=levels.get(level)??[];list.push(d);levels.set(level,list);});
  const maxLevel=Math.max(0,...levels.keys());
  const result=new Map<string,{x:number;y:number}>();
  for(const [level,list] of levels){
    list.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    list.forEach((d,index)=>result.set(d.id,{
      x:10+80*(index+1)/(list.length+1),
      y:maxLevel?10+80*level/maxLevel:50,
    }));
  }
  return result;
}

export function MythosGraph({deities,relations,pantheons,admin,historicalDay,pantheonFocusId,onSelectDeity,
  onCreateDeityAt,onSavePosition,onCreateRelation,onUpdateRelation,onDeleteRelation}:{
  deities:MythosDeityRecord[];relations:MythosRelationRecord[];pantheons:MythosPantheonRecord[];
  admin:boolean;historicalDay:number|null;pantheonFocusId:string|null;
  onSelectDeity:(deity:MythosDeityRecord)=>void;
  onCreateDeityAt:(x:number,y:number)=>void;
  onSavePosition:(deity:MythosDeityRecord,x:number,y:number)=>Promise<void>;
  onCreateRelation:(input:MythosRelationInput)=>Promise<MythosRelationRecord>;
  onUpdateRelation:(id:string,input:MythosRelationInput)=>Promise<void>;
  onDeleteRelation:(id:string)=>Promise<void>;
}){
  const board=useRef<HTMLDivElement|null>(null);
  const drag=useRef<{
    id:string;pointer:number;element:HTMLButtonElement;
    startClientX:number;startClientY:number;x:number;y:number;moved:boolean;
  }|null>(null);
  const pan=useRef<{
    pointer:number;element:HTMLDivElement;startClientX:number;startClientY:number;
    originX:number;originY:number;
  }|null>(null);
  const suppressClick=useRef<{id:string;until:number}|null>(null);
  const [positions,setPositions]=useState<Record<string,{x:number;y:number}>>({});
  const [viewport,setViewport]=useState<Viewport>({x:0,y:0,scale:1});
  const [isPanning,setIsPanning]=useState(false);
  const [layer,setLayer]=useState<GraphLayer>('relations');
  const [layout,setLayout]=useState<LayoutMode>('free');
  const [relationDraft,setRelationDraft]=useState<MythosRelationInput|null>(null);
  const [editingRelation,setEditingRelation]=useState<string|null>(null);
  const [linkSourceId,setLinkSourceId]=useState<string|null>(null);
  const [context,setContext]=useState<ContextState|null>(null);
  const [busy,setBusy]=useState(false);
  const [quickLinkBusy,setQuickLinkBusy]=useState(false);
  const [relationError,setRelationError]=useState('');
  const [dragError,setDragError]=useState('');

  useEffect(()=>{
    setPositions(Object.fromEntries(deities.map(item=>[item.id,{x:item.graphX,y:item.graphY}])));
  },[deities]);

  useEffect(()=>{
    const element=board.current;
    if(!element)return;
    const handleWheel=(event:WheelEvent)=>{
      event.preventDefault();
      event.stopPropagation();
      const rect=element.getBoundingClientRect();
      const cursorX=event.clientX-rect.left,cursorY=event.clientY-rect.top;
      const factor=clamp(Math.exp(-event.deltaY*.0015),.82,1.22);
      setViewport(current=>{
        const scale=clamp(current.scale*factor,MIN_ZOOM,MAX_ZOOM);
        if(Math.abs(scale-current.scale)<.0001)return current;
        const worldX=(cursorX-current.x)/current.scale;
        const worldY=(cursorY-current.y)/current.scale;
        return {scale,x:cursorX-worldX*scale,y:cursorY-worldY*scale};
      });
    };
    element.addEventListener('wheel',handleWheel,{passive:false});
    return()=>element.removeEventListener('wheel',handleWheel);
  },[]);

  const activeRelations=useMemo(()=>relations.filter(rel=>
    historicalDay===null||
      ((rel.startDay===null||rel.startDay<=historicalDay)&&(rel.endDay===null||rel.endDay>=historicalDay))
  ),[relations,historicalDay]);
  const layoutPositions=useMemo(()=>layout==='genealogy'
    ?genealogyPositions(deities,activeRelations):null,[layout,deities,activeRelations]);
  const actualEdges=useMemo(():Edge[]=>
    activeRelations.filter(rel=>{
      if(layer==='relations')return true;
      if(layer==='origin')return rel.category==='origin';
      if(layer==='politics')return ['alliance','conflict','service'].includes(rel.category);
      return false;
    }).map(rel=>({
      id:rel.id,sourceId:rel.sourceId,targetId:rel.targetId,
      label:rel.label||rel.type,category:rel.category,color:relationColors[rel.category]??relationColors.other!,
      relation:rel,
    })),[activeRelations,layer]);
  const edges=useMemo(()=>layer==='domains'?syntheticDomainEdges(deities)
    :layer==='pantheon'?syntheticPantheonEdges(deities):actualEdges,[layer,deities,actualEdges]);

  const pos=(id:string)=>layoutPositions?.get(id)??positions[id]??{x:50,y:50};
  const sourceDeity=linkSourceId?deities.find(item=>item.id===linkSourceId)??null:null;

  const screenPoint=(point:{x:number;y:number})=>({
    left:`calc(${point.x*viewport.scale}% + ${viewport.x}px)`,
    top:`calc(${point.y*viewport.scale}% + ${viewport.y}px)`,
  });
  const nodeMetrics=(scale:number)=>({
    minWidth:128*scale,maxWidth:180*scale,minHeight:72*scale,
    padding:`${9*scale}px ${12*scale}px`,
    borderRadius:12*scale,gap:3*scale,
  });
  const edgeLabelMetrics=(scale:number)=>({
    maxWidth:145*scale,padding:`${3*scale}px ${6*scale}px`,
    fontSize:9*scale,
  });

  function screenToWorld(clientX:number,clientY:number){
    const rect=board.current?.getBoundingClientRect();
    if(!rect)return {x:50,y:50};
    const x=(clientX-rect.left-viewport.x)/viewport.scale/rect.width*100;
    const y=(clientY-rect.top-viewport.y)/viewport.scale/rect.height*100;
    return {
      x:clamp(x,MYTHOS_GRAPH_COORD_MIN,MYTHOS_GRAPH_COORD_MAX),
      y:clamp(y,MYTHOS_GRAPH_COORD_MIN,MYTHOS_GRAPH_COORD_MAX),
    };
  }
  function zoomAt(clientX:number,clientY:number,factor:number){
    const rect=board.current?.getBoundingClientRect();
    if(!rect)return;
    const cursorX=clientX-rect.left,cursorY=clientY-rect.top;
    setViewport(current=>{
      const scale=clamp(current.scale*factor,MIN_ZOOM,MAX_ZOOM);
      if(Math.abs(scale-current.scale)<.0001)return current;
      const worldX=(cursorX-current.x)/current.scale;
      const worldY=(cursorY-current.y)/current.scale;
      return {scale,x:cursorX-worldX*scale,y:cursorY-worldY*scale};
    });
  }
  function zoomCenter(factor:number){
    const rect=board.current?.getBoundingClientRect();
    if(rect)zoomAt(rect.left+rect.width/2,rect.top+rect.height/2,factor);
  }
  function boardPointerDown(event:ReactPointerEvent<HTMLDivElement>){
    if(event.button!==0||drag.current)return;
    const target=event.target as HTMLElement;
    if(target.closest('.mythos-graph-node,.mythos-edge-label'))return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current={
      pointer:event.pointerId,element:event.currentTarget,
      startClientX:event.clientX,startClientY:event.clientY,
      originX:viewport.x,originY:viewport.y,
    };
    setIsPanning(true);
  }
  function pointerMove(event:ReactPointerEvent<HTMLDivElement>){
    const activeDrag=drag.current;
    if(activeDrag&&activeDrag.pointer===event.pointerId&&layout==='free'){
      const rect=event.currentTarget.getBoundingClientRect();
      const worldPixelX=(event.clientX-rect.left-viewport.x)/viewport.scale;
      const worldPixelY=(event.clientY-rect.top-viewport.y)/viewport.scale;
      const x=clamp(worldPixelX/rect.width*100,MYTHOS_GRAPH_COORD_MIN,MYTHOS_GRAPH_COORD_MAX);
      const y=clamp(worldPixelY/rect.height*100,MYTHOS_GRAPH_COORD_MIN,MYTHOS_GRAPH_COORD_MAX);
      activeDrag.x=x;activeDrag.y=y;
      if(Math.hypot(event.clientX-activeDrag.startClientX,event.clientY-activeDrag.startClientY)>4)activeDrag.moved=true;
      setPositions(current=>({...current,[activeDrag.id]:{x,y}}));
      return;
    }
    const activePan=pan.current;
    if(activePan&&activePan.pointer===event.pointerId){
      setViewport(current=>({
        ...current,
        x:activePan.originX+(event.clientX-activePan.startClientX),
        y:activePan.originY+(event.clientY-activePan.startClientY),
      }));
    }
  }
  async function pointerUp(event:ReactPointerEvent<HTMLDivElement>){
    const activeDrag=drag.current;
    if(activeDrag&&activeDrag.pointer===event.pointerId){
      drag.current=null;
      if(activeDrag.element.hasPointerCapture(event.pointerId))activeDrag.element.releasePointerCapture(event.pointerId);
      if(!activeDrag.moved)return;
      suppressClick.current={id:activeDrag.id,until:performance.now()+350};
      const deity=deities.find(item=>item.id===activeDrag.id);
      if(!deity)return;
      setDragError('');
      try{
        await onSavePosition(deity,activeDrag.x,activeDrag.y);
      }catch(error){
        setPositions(current=>({...current,[deity.id]:{x:deity.graphX,y:deity.graphY}}));
        setDragError(error instanceof Error?error.message:'Не удалось сохранить положение узла.');
      }
      return;
    }
    const activePan=pan.current;
    if(activePan&&activePan.pointer===event.pointerId){
      pan.current=null;setIsPanning(false);
      if(activePan.element.hasPointerCapture(event.pointerId))activePan.element.releasePointerCapture(event.pointerId);
    }
  }
  function pointerCancel(event:ReactPointerEvent<HTMLDivElement>){
    const activeDrag=drag.current;
    if(activeDrag&&activeDrag.pointer===event.pointerId){
      drag.current=null;
      if(activeDrag.element.hasPointerCapture(event.pointerId))activeDrag.element.releasePointerCapture(event.pointerId);
      setPositions(current=>({...current,[activeDrag.id]:{
        x:deities.find(item=>item.id===activeDrag.id)?.graphX??activeDrag.x,
        y:deities.find(item=>item.id===activeDrag.id)?.graphY??activeDrag.y,
      }}));
    }
    const activePan=pan.current;
    if(activePan&&activePan.pointer===event.pointerId){
      pan.current=null;setIsPanning(false);
      if(activePan.element.hasPointerCapture(event.pointerId))activePan.element.releasePointerCapture(event.pointerId);
    }
  }
  function openCreate(sourceId?:string,targetId?:string){
    if(deities.length<2)return;
    const source=sourceId??deities[0]!.id;
    const target=targetId??deities.find(item=>item.id!==source)?.id??deities[1]!.id;
    setEditingRelation(null);setRelationError('');
    setRelationDraft(emptyRelation(source,target));
  }
  function openEdit(event:ReactMouseEvent,edge:Edge){
    event.stopPropagation();
    if(!admin||!edge.relation)return;
    setEditingRelation(edge.relation.id);setRelationError('');
    setRelationDraft({
      sourceId:edge.relation.sourceId,targetId:edge.relation.targetId,type:edge.relation.type,
      category:edge.relation.category,label:edge.relation.label,description:edge.relation.description,
      startDay:edge.relation.startDay,endDay:edge.relation.endDay,visibility:edge.relation.visibility,
    });
  }
  function openContext(event:ReactMouseEvent,deityId:string|null=null){
    event.preventDefault();
    const point=screenToWorld(event.clientX,event.clientY);
    setContext({
      mouseX:event.clientX+2,mouseY:event.clientY-6,
      worldX:point.x,worldY:point.y,deityId,
    });
  }
  async function finishQuickRelation(deity:MythosDeityRecord){
    const sourceId=linkSourceId;
    if(!sourceId||deity.id===sourceId||quickLinkBusy)return;
    setQuickLinkBusy(true);setRelationError('');setDragError('');
    try{
      const created=await onCreateRelation(emptyRelation(sourceId,deity.id));
      setLinkSourceId(null);
      setEditingRelation(created.id);
      setRelationDraft({
        sourceId:created.sourceId,targetId:created.targetId,type:created.type,
        category:created.category,label:created.label,description:created.description,
        startDay:created.startDay,endDay:created.endDay,visibility:created.visibility,
      });
    }catch(error){
      setDragError(error instanceof Error?error.message:'Не удалось создать связь.');
    }finally{setQuickLinkBusy(false);}
  }
  async function saveRelation(){
    if(!relationDraft)return;
    setBusy(true);setRelationError('');
    try{
      if(editingRelation)await onUpdateRelation(editingRelation,relationDraft);
      else await onCreateRelation(relationDraft);
      setRelationDraft(null);setEditingRelation(null);
    }catch(error){setRelationError(error instanceof Error?error.message:'Не удалось сохранить связь');}
    finally{setBusy(false);}
  }
  async function removeRelation(){
    if(!editingRelation)return;
    setBusy(true);
    try{await onDeleteRelation(editingRelation);setRelationDraft(null);setEditingRelation(null);}
    finally{setBusy(false);}
  }

  return <Box className="mythos-graph-shell">
    <Box className="mythos-graph-toolbar">
      <Stack direction="row" gap={.7} flexWrap="wrap">
        {(Object.keys(layerLabels) as GraphLayer[]).map(value=><Chip key={value}
          size="small" label={layerLabels[value]} clickable
          variant={layer===value?'filled':'outlined'} onClick={()=>setLayer(value)}/>)}
      </Stack>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button size="small" variant={layout==='free'?'contained':'outlined'}
          onClick={()=>setLayout('free')}>Свободно</Button>
        <Button size="small" variant={layout==='genealogy'?'contained':'outlined'}
          onClick={()=>setLayout('genealogy')}>Генеалогия</Button>
        <Button size="small" variant="outlined" onClick={()=>zoomCenter(1/1.2)}>−</Button>
        <Chip size="small" label={Math.round(viewport.scale*100)+'%'}/>
        <Button size="small" variant="outlined" onClick={()=>zoomCenter(1.2)}>+</Button>
        <Button size="small" onClick={()=>setViewport({x:0,y:0,scale:1})}>Сбросить вид</Button>
        {admin&&<Button size="small" variant="outlined" disabled={deities.length<2}
          onClick={()=>openCreate()}>+ Связь</Button>}
      </Stack>
    </Box>

    {sourceDeity&&<Box className="mythos-link-mode">
      <Typography variant="body2">
        {quickLinkBusy?'Создаём связь…':<>Создаём связь от <strong>{sourceDeity.name}</strong>. Кликни по второму божеству.</>}
      </Typography>
      <Button size="small" color="inherit" disabled={quickLinkBusy}
        onClick={()=>setLinkSourceId(null)}>Отмена</Button>
    </Box>}

    <Box ref={board} className={'mythos-graph-board'+(isPanning?' is-panning':'')}
      style={{
        backgroundSize:`auto, ${42*viewport.scale}px ${42*viewport.scale}px, ${42*viewport.scale}px ${42*viewport.scale}px`,
        backgroundPosition:`center, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`,
      }}
      onPointerDown={boardPointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={pointerCancel} onContextMenu={event=>openContext(event)}>
      <Box className="mythos-graph-world"
        style={{transform:`translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})`}}>
        <svg className="mythos-graph-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker id="mythos-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
              orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L7,3.5 L0,7 z" fill="context-stroke"/>
            </marker>
          </defs>
          {edges.map(edge=>{
            const a=pos(edge.sourceId),b=pos(edge.targetId);
            const source=deities.find(item=>item.id===edge.sourceId);
            const target=deities.find(item=>item.id===edge.targetId);
            const edgeFocused=!pantheonFocusId||source?.pantheonId===pantheonFocusId||target?.pantheonId===pantheonFocusId;
            return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={edge.color} strokeWidth={edge.category==='conflict'?'.48':'.34'}
              strokeDasharray={edge.category==='conflict'?'1.2 1':''}
              opacity={edgeFocused?1:.18}
              markerEnd={edge.relation?'url(#mythos-arrow)':undefined}/>;
          })}
        </svg>
      </Box>
      {edges.map(edge=>{
        const a=pos(edge.sourceId),b=pos(edge.targetId);
        const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        const source=deities.find(item=>item.id===edge.sourceId);
        const target=deities.find(item=>item.id===edge.targetId);
        const edgeFocused=!pantheonFocusId||source?.pantheonId===pantheonFocusId||target?.pantheonId===pantheonFocusId;
        return <button key={'label-'+edge.id}
          className={'mythos-edge-label edge-'+edge.category+(edgeFocused?'':' is-pantheon-dim')}
          style={{...screenPoint(midpoint),...edgeLabelMetrics(viewport.scale)}}
          onClick={event=>openEdit(event,edge)} title={edge.relation?.description||edge.label}>
          {edge.label}
        </button>;
      })}
      {deities.map(deity=>{
        const p=pos(deity.id);
        const pantheon=pantheons.find(item=>item.id===deity.pantheonId);
        const isSource=deity.id===linkSourceId;
        const pantheonFocusClass=!pantheonFocusId?'':deity.pantheonId===pantheonFocusId?' is-pantheon-focus':' is-pantheon-dim';
        return <button key={deity.id}
          className={'mythos-graph-node'+(layout==='free'&&admin?' is-draggable':'')+
            (isSource?' is-link-source':linkSourceId?' is-link-target':'')+pantheonFocusClass}
          style={{
            ...screenPoint(p),...nodeMetrics(viewport.scale),
            '--node-color':deity.color,
          } as React.CSSProperties}
          title={(deity.epithet||deity.rank)+(pantheon?' · '+pantheon.name:'')}
          onPointerDown={event=>{
            if(!admin||layout!=='free'||event.button!==0||linkSourceId)return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const current=pos(deity.id);
            drag.current={
              id:deity.id,pointer:event.pointerId,element:event.currentTarget,
              startClientX:event.clientX,startClientY:event.clientY,x:current.x,y:current.y,moved:false,
            };
            event.stopPropagation();
          }}
          onContextMenu={event=>{event.stopPropagation();openContext(event,deity.id);}}
          onClick={()=>{
            const blocked=suppressClick.current;
            if(blocked?.id===deity.id&&performance.now()<blocked.until){suppressClick.current=null;return;}
            suppressClick.current=null;
            if(linkSourceId){void finishQuickRelation(deity);return;}
            onSelectDeity(deity);
          }}>
          <span className="mythos-graph-node-symbol" style={{fontSize:23*viewport.scale}}>{deity.symbol||'✧'}</span>
          <span className="mythos-graph-node-name" style={{fontSize:14*viewport.scale}}>{deity.name}</span>
          <small style={{fontSize:9*viewport.scale,maxWidth:150*viewport.scale}}>
            {deity.primaryDomains.slice(0,2).join(' · ')||deity.rank}
          </small>
        </button>;
      })}
      {!deities.length&&<Box className="mythos-graph-empty">
        <Typography variant="h6">Граф пока пуст</Typography>
        <Typography color="text.secondary">ПКМ по полю → «Создать божество здесь».</Typography>
      </Box>}
    </Box>

    {dragError&&<Typography variant="caption" color="error.main">{dragError}</Typography>}
    <Typography variant="caption" color="text.secondary">
      ЛКМ по пустому месту + drag — двигать граф · колесо — масштаб · ПКМ — контекстное меню.
      {' '}{layout==='free'
        ?admin?'Божеств можно перетаскивать отдельно.':'Свободная карта связей.'
        :'Генеалогический режим строится из связей категории «Происхождение».'}
      {historicalDay!==null?' Показаны связи, существующие на выбранную историческую дату.':''}
    </Typography>

    <Menu open={Boolean(context)} onClose={()=>setContext(null)} anchorReference="anchorPosition"
      anchorPosition={context?{top:context.mouseY,left:context.mouseX}:undefined}>
      {context?.deityId&&<MenuItem onClick={()=>{
        const deity=deities.find(item=>item.id===context.deityId);
        setContext(null);if(deity)onSelectDeity(deity);
      }}>Открыть божество</MenuItem>}
      {admin&&<MenuItem onClick={()=>{
        if(!context)return;
        const {worldX,worldY}=context;setContext(null);onCreateDeityAt(worldX,worldY);
      }}>Создать божество здесь</MenuItem>}
      {admin&&context?.deityId&&<MenuItem disabled={deities.length<2} onClick={()=>{
        const id=context.deityId;setContext(null);setLinkSourceId(id);
      }}>Создать связь от этого божества</MenuItem>}
      {admin&&!context?.deityId&&<MenuItem disabled={deities.length<2} onClick={()=>{
        setContext(null);openCreate();
      }}>Создать связь…</MenuItem>}
      <MenuItem onClick={()=>{setContext(null);setViewport({x:0,y:0,scale:1});}}>Сбросить вид</MenuItem>
    </Menu>

    <Dialog open={Boolean(relationDraft)} onClose={()=>!busy&&setRelationDraft(null)} fullWidth maxWidth="sm">
      <DialogTitle>{editingRelation?'Редактировать связь':'Новая связь'}</DialogTitle>
      {relationDraft&&<DialogContent>
        <Stack gap={1.6} sx={{pt:1}}>
          {relationError&&<Typography color="error.main">{relationError}</Typography>}
          <Stack direction={{xs:'column',sm:'row'}} gap={1}>
            <FormControl size="small" fullWidth><InputLabel>От кого</InputLabel>
              <Select label="От кого" value={relationDraft.sourceId}
                onChange={e=>setRelationDraft({...relationDraft,sourceId:e.target.value})}>
                {deities.map(d=><MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </Select></FormControl>
            <FormControl size="small" fullWidth><InputLabel>К кому</InputLabel>
              <Select label="К кому" value={relationDraft.targetId}
                onChange={e=>setRelationDraft({...relationDraft,targetId:e.target.value})}>
                {deities.map(d=><MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </Select></FormControl>
          </Stack>
          <Stack direction={{xs:'column',sm:'row'}} gap={1}>
            <FormControl size="small" fullWidth><InputLabel>Категория</InputLabel>
              <Select label="Категория" value={relationDraft.category}
                onChange={e=>setRelationDraft({...relationDraft,category:e.target.value as MythosRelationInput['category']})}>
                {Object.entries(categoryLabels).map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}
              </Select></FormControl>
            <TextField size="small" fullWidth label="Тип связи" value={relationDraft.type}
              placeholder="создал, предал, служит, соперничает…"
              onChange={e=>setRelationDraft({...relationDraft,type:e.target.value})}/>
          </Stack>
          <TextField size="small" label="Короткая подпись на графе" value={relationDraft.label}
            onChange={e=>setRelationDraft({...relationDraft,label:e.target.value})}/>
          <TextField multiline minRows={3} label="Почему они связаны?" value={relationDraft.description}
            onChange={e=>setRelationDraft({...relationDraft,description:e.target.value})}/>
          <Stack direction={{xs:'column',sm:'row'}} gap={1}>
            <TextField size="small" type="number" label="Начало (абсолютный день)" value={relationDraft.startDay??''}
              onChange={e=>setRelationDraft({...relationDraft,startDay:e.target.value===''?null:Number(e.target.value)})}/>
            <TextField size="small" type="number" label="Конец (абсолютный день)" value={relationDraft.endDay??''}
              onChange={e=>setRelationDraft({...relationDraft,endDay:e.target.value===''?null:Number(e.target.value)})}/>
            <FormControl size="small" fullWidth><InputLabel>Видимость</InputLabel>
              <Select label="Видимость" value={relationDraft.visibility}
                onChange={e=>setRelationDraft({...relationDraft,visibility:e.target.value as MythosRelationInput['visibility']})}>
                <MenuItem value="gm">Мастер</MenuItem><MenuItem value="public">Публично</MenuItem>
                <MenuItem value="draft">Черновик</MenuItem>
              </Select></FormControl>
          </Stack>
        </Stack>
      </DialogContent>}
      <DialogActions>
        {editingRelation&&<Button color="error" disabled={busy} onClick={()=>void removeRelation()}>Удалить</Button>}
        <Box sx={{flex:1}}/><Button onClick={()=>setRelationDraft(null)}>Отмена</Button>
        <Button variant="contained" disabled={busy||!relationDraft?.type.trim()||
          relationDraft?.sourceId===relationDraft?.targetId} onClick={()=>void saveRelation()}>Сохранить</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
