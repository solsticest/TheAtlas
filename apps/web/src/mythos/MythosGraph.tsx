import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type {
  MythosDeityRecord, MythosPantheonRecord, MythosRelationInput, MythosRelationRecord,
} from '@atlas/shared';

type GraphLayer='relations'|'origin'|'politics'|'domains'|'pantheon';
type LayoutMode='free'|'genealogy';
type Edge={
  id:string;sourceId:string;targetId:string;label:string;category:string;color:string;
  relation?:MythosRelationRecord;
};

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

export function MythosGraph({deities,relations,pantheons,admin,historicalDay,onSelectDeity,
  onSavePosition,onCreateRelation,onUpdateRelation,onDeleteRelation}:{
  deities:MythosDeityRecord[];relations:MythosRelationRecord[];pantheons:MythosPantheonRecord[];
  admin:boolean;historicalDay:number|null;
  onSelectDeity:(deity:MythosDeityRecord)=>void;
  onSavePosition:(deity:MythosDeityRecord,x:number,y:number)=>Promise<void>;
  onCreateRelation:(input:MythosRelationInput)=>Promise<void>;
  onUpdateRelation:(id:string,input:MythosRelationInput)=>Promise<void>;
  onDeleteRelation:(id:string)=>Promise<void>;
}){
  const board=useRef<HTMLDivElement|null>(null);
  const drag=useRef<{
    id:string;pointer:number;element:HTMLButtonElement;
    startClientX:number;startClientY:number;x:number;y:number;moved:boolean;
  }|null>(null);
  const suppressClick=useRef<{id:string;until:number}|null>(null);
  const [positions,setPositions]=useState<Record<string,{x:number;y:number}>>({});
  const [layer,setLayer]=useState<GraphLayer>('relations');
  const [layout,setLayout]=useState<LayoutMode>('free');
  const [relationDraft,setRelationDraft]=useState<MythosRelationInput|null>(null);
  const [editingRelation,setEditingRelation]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [relationError,setRelationError]=useState('');
  const [dragError,setDragError]=useState('');

  useEffect(()=>{
    setPositions(Object.fromEntries(deities.map(item=>[item.id,{x:item.graphX,y:item.graphY}])));
  },[deities]);

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
  function pointerMove(event:ReactPointerEvent<HTMLDivElement>){
    const active=drag.current;
    if(!active||active.pointer!==event.pointerId||layout!=='free')return;
    const rect=event.currentTarget.getBoundingClientRect();
    const x=Math.max(4,Math.min(96,(event.clientX-rect.left)/rect.width*100));
    const y=Math.max(7,Math.min(93,(event.clientY-rect.top)/rect.height*100));
    active.x=x;active.y=y;
    if(Math.hypot(event.clientX-active.startClientX,event.clientY-active.startClientY)>4)active.moved=true;
    setPositions(current=>({...current,[active.id]:{x,y}}));
  }
  async function pointerUp(event:ReactPointerEvent<HTMLDivElement>){
    const active=drag.current;
    if(!active||active.pointer!==event.pointerId)return;
    drag.current=null;
    if(active.element.hasPointerCapture(event.pointerId))active.element.releasePointerCapture(event.pointerId);
    if(!active.moved)return;
    suppressClick.current={id:active.id,until:performance.now()+350};
    const deity=deities.find(item=>item.id===active.id);
    if(!deity)return;
    setDragError('');
    try{
      await onSavePosition(deity,active.x,active.y);
    }catch(error){
      setPositions(current=>({...current,[deity.id]:{x:deity.graphX,y:deity.graphY}}));
      setDragError(error instanceof Error?error.message:'Не удалось сохранить положение узла.');
    }
  }
  function pointerCancel(event:ReactPointerEvent<HTMLDivElement>){
    const active=drag.current;
    if(!active||active.pointer!==event.pointerId)return;
    drag.current=null;
    if(active.element.hasPointerCapture(event.pointerId))active.element.releasePointerCapture(event.pointerId);
    setPositions(current=>({...current,[active.id]:{
      x:deities.find(item=>item.id===active.id)?.graphX??active.x,
      y:deities.find(item=>item.id===active.id)?.graphY??active.y,
    }}));
  }
  function openCreate(){
    if(deities.length<2)return;
    setEditingRelation(null);setRelationError('');
    setRelationDraft(emptyRelation(deities[0]!.id,deities[1]!.id));
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
      <Stack direction="row" gap={1}>
        <Button size="small" variant={layout==='free'?'contained':'outlined'}
          onClick={()=>setLayout('free')}>Свободно</Button>
        <Button size="small" variant={layout==='genealogy'?'contained':'outlined'}
          onClick={()=>setLayout('genealogy')}>Генеалогия</Button>
        {admin&&<Button size="small" variant="outlined" disabled={deities.length<2}
          onClick={openCreate}>+ Связь</Button>}
      </Stack>
    </Box>
    <Box ref={board} className="mythos-graph-board"
      onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel}>
      <svg className="mythos-graph-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <marker id="mythos-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
            orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3.5 L0,7 z" fill="context-stroke"/>
          </marker>
        </defs>
        {edges.map(edge=>{
          const a=pos(edge.sourceId),b=pos(edge.targetId);
          return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={edge.color} strokeWidth={edge.category==='conflict'?'.48':'.34'}
            strokeDasharray={edge.category==='conflict'?'1.2 1':''}
            markerEnd={edge.relation?'url(#mythos-arrow)':undefined}/>;
        })}
      </svg>
      {edges.map(edge=>{
        const a=pos(edge.sourceId),b=pos(edge.targetId);
        return <button key={'label-'+edge.id} className={'mythos-edge-label edge-'+edge.category}
          style={{left:(a.x+b.x)/2+'%',top:(a.y+b.y)/2+'%'}}
          onClick={event=>openEdit(event,edge)} title={edge.relation?.description||edge.label}>
          {edge.label}
        </button>;
      })}
      {deities.map(deity=>{
        const p=pos(deity.id);
        const pantheon=pantheons.find(item=>item.id===deity.pantheonId);
        return <button key={deity.id} className={'mythos-graph-node'+(layout==='free'&&admin?' is-draggable':'')}
          style={{left:p.x+'%',top:p.y+'%','--node-color':deity.color} as React.CSSProperties}
          title={(deity.epithet||deity.rank)+(pantheon?' · '+pantheon.name:'')}
          onPointerDown={event=>{
            if(!admin||layout!=='free'||event.button!==0)return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const p=pos(deity.id);
            drag.current={
              id:deity.id,pointer:event.pointerId,element:event.currentTarget,
              startClientX:event.clientX,startClientY:event.clientY,x:p.x,y:p.y,moved:false,
            };
            event.stopPropagation();
          }}
          onClick={()=>{
            const blocked=suppressClick.current;
            if(blocked?.id===deity.id&&performance.now()<blocked.until){suppressClick.current=null;return;}
            suppressClick.current=null;
            onSelectDeity(deity);
          }}>
          <span className="mythos-graph-node-symbol">{deity.symbol||'✧'}</span>
          <span className="mythos-graph-node-name">{deity.name}</span>
          <small>{deity.primaryDomains.slice(0,2).join(' · ')||deity.rank}</small>
        </button>;
      })}
      {!deities.length&&<Box className="mythos-graph-empty">
        <Typography variant="h6">Граф пока пуст</Typography>
        <Typography color="text.secondary">Создай хотя бы одно божество.</Typography>
      </Box>}
    </Box>
    {dragError&&<Typography variant="caption" color="error.main">{dragError}</Typography>}
    <Typography variant="caption" color="text.secondary">
      {layout==='free'
        ?admin?'Перетаскивай божеств мышью — позиция сохраняется автоматически.':'Свободная карта связей.'
        :'Генеалогический режим строится из связей категории «Происхождение».'}
      {historicalDay!==null?' Показаны связи, существующие на выбранную историческую дату.':''}
    </Typography>

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
