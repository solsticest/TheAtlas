import { useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, Menu, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type {
  MythosCosmicLinkInput, MythosCosmicLinkRecord, MythosCosmicNodeInput,
  MythosCosmicNodeRecord, WorldRecord,
} from '@atlas/shared';
import { BufferedColorField } from './BufferedColorField';

type Viewport={x:number;y:number;scale:number};
type ContextState={mouseX:number;mouseY:number;worldX:number;worldY:number;nodeId:string|null};

const MIN_ZOOM=.45;
const MAX_ZOOM=3.5;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

const nodeDefault=(worldId:string|null,x=50,y=50):MythosCosmicNodeInput=>({
  name:'',kind:'План',description:'',symbol:'',color:'#7f8da8',x,y,size:1,
  worldId,visibility:'gm',
});
const linkDefault=(nodes:MythosCosmicNodeRecord[],sourceId?:string,targetId?:string):MythosCosmicLinkInput=>{
  const source=sourceId??nodes[0]?.id??'';
  const target=targetId??nodes.find(node=>node.id!==source)?.id??nodes[1]?.id??'';
  return {sourceId:source,targetId:target,type:'Путь',label:'',description:'',visibility:'gm'};
};

export function MythosCosmology({nodes,links,worlds,admin,onCreateNode,onUpdateNode,onDeleteNode,
  onCreateLink,onUpdateLink,onDeleteLink}:{
  nodes:MythosCosmicNodeRecord[];links:MythosCosmicLinkRecord[];worlds:WorldRecord[];admin:boolean;
  onCreateNode:(input:MythosCosmicNodeInput)=>Promise<void>;
  onUpdateNode:(id:string,input:MythosCosmicNodeInput)=>Promise<void>;
  onDeleteNode:(id:string)=>Promise<void>;
  onCreateLink:(input:MythosCosmicLinkInput)=>Promise<MythosCosmicLinkRecord>;
  onUpdateLink:(id:string,input:MythosCosmicLinkInput)=>Promise<void>;
  onDeleteLink:(id:string)=>Promise<void>;
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
  const [sizes,setSizes]=useState<Record<string,number>>({});
  const [viewport,setViewport]=useState<Viewport>({x:0,y:0,scale:1});
  const [isPanning,setIsPanning]=useState(false);
  const [context,setContext]=useState<ContextState|null>(null);
  const [linkSourceId,setLinkSourceId]=useState<string|null>(null);
  const [quickLinkBusy,setQuickLinkBusy]=useState(false);
  const [nodeDraft,setNodeDraft]=useState<MythosCosmicNodeInput|null>(null);
  const [nodeId,setNodeId]=useState<string|null>(null);
  const [linkDraft,setLinkDraft]=useState<MythosCosmicLinkInput|null>(null);
  const [linkId,setLinkId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [dragError,setDragError]=useState('');

  useEffect(()=>{
    setPositions(Object.fromEntries(nodes.map(node=>[node.id,{x:node.x,y:node.y}])));
    setSizes(Object.fromEntries(nodes.map(node=>[node.id,node.size])));
  },[nodes]);

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

  const pos=(id:string)=>positions[id]??{x:50,y:50};
  const nodeSize=(id:string)=>sizes[id]??1;
  const sourceNode=linkSourceId?nodes.find(node=>node.id===linkSourceId)??null:null;

  function screenToWorld(clientX:number,clientY:number){
    const rect=board.current?.getBoundingClientRect();
    if(!rect)return {x:50,y:50};
    const x=(clientX-rect.left-viewport.x)/viewport.scale/rect.width*100;
    const y=(clientY-rect.top-viewport.y)/viewport.scale/rect.height*100;
    return {x:clamp(x,5,95),y:clamp(y,8,92)};
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
    if(target.closest('.mythos-cosmic-node,.mythos-edge-label'))return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current={
      pointer:event.pointerId,element:event.currentTarget,
      startClientX:event.clientX,startClientY:event.clientY,
      originX:viewport.x,originY:viewport.y,
    };
    setIsPanning(true);
  }
  function move(event:ReactPointerEvent<HTMLDivElement>){
    const activeDrag=drag.current;
    if(activeDrag&&activeDrag.pointer===event.pointerId){
      const rect=event.currentTarget.getBoundingClientRect();
      const worldPixelX=(event.clientX-rect.left-viewport.x)/viewport.scale;
      const worldPixelY=(event.clientY-rect.top-viewport.y)/viewport.scale;
      const x=clamp(worldPixelX/rect.width*100,5,95);
      const y=clamp(worldPixelY/rect.height*100,8,92);
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
  async function end(event:ReactPointerEvent<HTMLDivElement>){
    const activeDrag=drag.current;
    if(activeDrag&&activeDrag.pointer===event.pointerId){
      drag.current=null;
      if(activeDrag.element.hasPointerCapture(event.pointerId))activeDrag.element.releasePointerCapture(event.pointerId);
      if(!activeDrag.moved)return;
      suppressClick.current={id:activeDrag.id,until:performance.now()+350};
      const node=nodes.find(item=>item.id===activeDrag.id);
      if(!node)return;
      setDragError('');
      try{
        await onUpdateNode(activeDrag.id,{
          name:node.name,kind:node.kind,description:node.description,symbol:node.symbol,color:node.color,
          x:activeDrag.x,y:activeDrag.y,size:nodeSize(node.id),worldId:node.worldId,visibility:node.visibility,
        });
      }catch(reason){
        setPositions(current=>({...current,[activeDrag.id]:{x:node.x,y:node.y}}));
        setDragError(reason instanceof Error?reason.message:'Не удалось сохранить положение узла.');
      }
      return;
    }
    const activePan=pan.current;
    if(activePan&&activePan.pointer===event.pointerId){
      pan.current=null;setIsPanning(false);
      if(activePan.element.hasPointerCapture(event.pointerId))activePan.element.releasePointerCapture(event.pointerId);
    }
  }
  function cancelDrag(event:ReactPointerEvent<HTMLDivElement>){
    const activeDrag=drag.current;
    if(activeDrag&&activeDrag.pointer===event.pointerId){
      drag.current=null;
      if(activeDrag.element.hasPointerCapture(event.pointerId))activeDrag.element.releasePointerCapture(event.pointerId);
      const node=nodes.find(item=>item.id===activeDrag.id);
      if(node)setPositions(current=>({...current,[activeDrag.id]:{x:node.x,y:node.y}}));
    }
    const activePan=pan.current;
    if(activePan&&activePan.pointer===event.pointerId){
      pan.current=null;setIsPanning(false);
      if(activePan.element.hasPointerCapture(event.pointerId))activePan.element.releasePointerCapture(event.pointerId);
    }
  }
  function openContext(event:ReactMouseEvent,nodeIdValue:string|null=null){
    event.preventDefault();
    const point=screenToWorld(event.clientX,event.clientY);
    setContext({mouseX:event.clientX+2,mouseY:event.clientY-6,worldX:point.x,worldY:point.y,nodeId:nodeIdValue});
  }
  function editNode(node?:MythosCosmicNodeRecord,point?:{x:number;y:number}){
    setError('');setNodeId(node?.id??null);
    setNodeDraft(node?{
      name:node.name,kind:node.kind,description:node.description,symbol:node.symbol,color:node.color,
      x:node.x,y:node.y,size:node.size,worldId:node.worldId,visibility:node.visibility,
    }:nodeDefault(null,point?.x??50,point?.y??50));
  }
  function editLink(link?:MythosCosmicLinkRecord,sourceId?:string,targetId?:string){
    setError('');setLinkId(link?.id??null);
    setLinkDraft(link?{
      sourceId:link.sourceId,targetId:link.targetId,type:link.type,label:link.label,
      description:link.description,visibility:link.visibility,
    }:linkDefault(nodes,sourceId,targetId));
  }
  async function resizeNode(node:MythosCosmicNodeRecord,delta:number){
    const old=nodeSize(node.id),next=clamp(Math.round((old+delta)*10)/10,.5,3);
    if(next===old)return;
    setSizes(current=>({...current,[node.id]:next}));
    setDragError('');
    try{
      await onUpdateNode(node.id,{
        name:node.name,kind:node.kind,description:node.description,symbol:node.symbol,color:node.color,
        x:pos(node.id).x,y:pos(node.id).y,size:next,worldId:node.worldId,visibility:node.visibility,
      });
    }catch(reason){
      setSizes(current=>({...current,[node.id]:old}));
      setDragError(reason instanceof Error?reason.message:'Не удалось изменить размер узла.');
    }
  }
  async function finishQuickLink(node:MythosCosmicNodeRecord){
    const sourceId=linkSourceId;
    if(!sourceId||sourceId===node.id||quickLinkBusy)return;
    setQuickLinkBusy(true);setDragError('');
    try{
      const created=await onCreateLink(linkDefault(nodes,sourceId,node.id));
      setLinkSourceId(null);
      editLink(created);
    }catch(reason){
      setDragError(reason instanceof Error?reason.message:'Не удалось создать космологическую связь.');
    }finally{setQuickLinkBusy(false);}
  }
  async function run(task:()=>Promise<void>,close:()=>void){
    setBusy(true);setError('');
    try{await task();close();}catch(reason){setError(reason instanceof Error?reason.message:'Не удалось сохранить');}
    finally{setBusy(false);}
  }

  return <Box className="mythos-cosmology-shell">
    <Stack direction="row" justifyContent="space-between" gap={2} alignItems="center" flexWrap="wrap">
      <Box>
        <Typography variant="h5" fontFamily="Georgia,serif" color="primary.main">Космология</Typography>
        <Typography variant="body2" color="text.secondary">
          Отдельная карта планов, миров, посмертий, метафизических областей и путей между ними.
        </Typography>
      </Box>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button size="small" variant="outlined" onClick={()=>zoomCenter(1/1.2)}>−</Button>
        <Chip size="small" label={Math.round(viewport.scale*100)+'%'}/>
        <Button size="small" variant="outlined" onClick={()=>zoomCenter(1.2)}>+</Button>
        <Button size="small" onClick={()=>setViewport({x:0,y:0,scale:1})}>Сбросить вид</Button>
        {admin&&<>
          <Button variant="contained" onClick={()=>editNode()}>+ Узел</Button>
          <Button variant="outlined" disabled={nodes.length<2} onClick={()=>editLink()}>+ Связь</Button>
        </>}
      </Stack>
    </Stack>

    {sourceNode&&<Box className="mythos-link-mode">
      <Typography variant="body2">
        {quickLinkBusy?'Создаём связь…':<>Создаём путь от <strong>{sourceNode.name}</strong>. Кликни по второму узлу.</>}
      </Typography>
      <Button size="small" color="inherit" disabled={quickLinkBusy} onClick={()=>setLinkSourceId(null)}>Отмена</Button>
    </Box>}

    <Box ref={board} className={'mythos-cosmic-board'+(isPanning?' is-panning':'')}
      style={{
        backgroundSize:`auto, ${42*viewport.scale}px ${42*viewport.scale}px, ${42*viewport.scale}px ${42*viewport.scale}px`,
        backgroundPosition:`center, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`,
      }}
      onPointerDown={boardPointerDown} onPointerMove={move} onPointerUp={end}
      onPointerCancel={cancelDrag} onContextMenu={event=>openContext(event)}>
      <Box className="mythos-cosmic-world"
        style={{transform:`translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})`}}>
        <svg className="mythos-graph-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs><marker id="cosmic-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
            orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3.5 L0,7 z" fill="context-stroke"/></marker></defs>
          {links.map(link=>{
            const a=pos(link.sourceId),b=pos(link.targetId);
            return <line key={link.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="#8394ac" strokeWidth=".35" markerEnd="url(#cosmic-arrow)"/>;
          })}
        </svg>
        {links.map(link=>{
          const a=pos(link.sourceId),b=pos(link.targetId);
          return <button key={'label-'+link.id} className="mythos-edge-label edge-cosmic"
            style={{left:(a.x+b.x)/2+'%',top:(a.y+b.y)/2+'%'}}
            onClick={()=>admin&&editLink(link)}>{link.label||link.type}</button>;
        })}
        {nodes.map(node=>{
          const p=pos(node.id),isSource=node.id===linkSourceId;
          return <button key={node.id}
            className={'mythos-cosmic-node'+(admin?' is-draggable':'')+
              (isSource?' is-link-source':linkSourceId?' is-link-target':'')}
            style={{
              left:p.x+'%',top:p.y+'%','--node-color':node.color,
              '--cosmic-node-size':nodeSize(node.id),
            } as CSSProperties}
            onPointerDown={event=>{
              if(!admin||event.button!==0||linkSourceId)return;
              event.currentTarget.setPointerCapture(event.pointerId);
              const current=pos(node.id);
              drag.current={
                id:node.id,pointer:event.pointerId,element:event.currentTarget,
                startClientX:event.clientX,startClientY:event.clientY,x:current.x,y:current.y,moved:false,
              };
              event.stopPropagation();
            }}
            onContextMenu={event=>{event.stopPropagation();openContext(event,node.id);}}
            onDoubleClick={()=>admin&&editNode(node)}
            onClick={()=>{
              const blocked=suppressClick.current;
              if(blocked?.id===node.id&&performance.now()<blocked.until){suppressClick.current=null;return;}
              suppressClick.current=null;
              if(linkSourceId){void finishQuickLink(node);}
            }}
            title={node.description||node.kind}>
            <span>{node.symbol||'◈'}</span><strong>{node.name}</strong><small>{node.kind}</small>
          </button>;
        })}
      </Box>
      {!nodes.length&&<Box className="mythos-graph-empty">
        <Typography variant="h6">Космология пока пуста</Typography>
        <Typography color="text.secondary">ПКМ по полю → «Создать узел здесь».</Typography>
      </Box>}
    </Box>

    {dragError&&<Typography variant="caption" color="error.main">{dragError}</Typography>}
    <Typography variant="caption" color="text.secondary">
      ЛКМ по пустому месту + drag — двигать карту · колесо — масштаб · ПКМ — контекстное меню.
      {admin?' Узлы можно перетаскивать и менять их визуальный размер.':' Карта устройства мироздания.'}
    </Typography>

    <Menu open={Boolean(context)} onClose={()=>setContext(null)} anchorReference="anchorPosition"
      anchorPosition={context?{top:context.mouseY,left:context.mouseX}:undefined}>
      {admin&&context?.nodeId&&<MenuItem onClick={()=>{
        const node=nodes.find(item=>item.id===context.nodeId);setContext(null);if(node)editNode(node);
      }}>Редактировать узел</MenuItem>}
      {admin&&<MenuItem onClick={()=>{
        if(!context)return;
        const point={x:context.worldX,y:context.worldY};setContext(null);editNode(undefined,point);
      }}>Создать узел здесь</MenuItem>}
      {admin&&context?.nodeId&&<MenuItem disabled={nodes.length<2} onClick={()=>{
        const id=context.nodeId;setContext(null);setLinkSourceId(id);
      }}>Создать связь от этого узла</MenuItem>}
      {admin&&!context?.nodeId&&<MenuItem disabled={nodes.length<2} onClick={()=>{
        setContext(null);editLink();
      }}>Создать связь…</MenuItem>}
      {admin&&context?.nodeId&&<MenuItem disabled={(sizes[context.nodeId]??1)>=3} onClick={()=>{
        const node=nodes.find(item=>item.id===context.nodeId);setContext(null);if(node)void resizeNode(node,.2);
      }}>Увеличить узел</MenuItem>}
      {admin&&context?.nodeId&&<MenuItem disabled={(sizes[context.nodeId]??1)<=.5} onClick={()=>{
        const node=nodes.find(item=>item.id===context.nodeId);setContext(null);if(node)void resizeNode(node,-.2);
      }}>Уменьшить узел</MenuItem>}
      <MenuItem onClick={()=>{setContext(null);setViewport({x:0,y:0,scale:1});}}>Сбросить вид</MenuItem>
    </Menu>

    <Dialog open={Boolean(nodeDraft)} onClose={()=>!busy&&setNodeDraft(null)} fullWidth maxWidth="sm">
      <DialogTitle>{nodeId?'Редактировать узел':'Новый узел космологии'}</DialogTitle>
      {nodeDraft&&<DialogContent><Stack gap={1.5} sx={{pt:1}}>
        {error&&<Typography color="error.main">{error}</Typography>}
        <Stack direction={{xs:'column',sm:'row'}} gap={1}>
          <TextField fullWidth label="Название" value={nodeDraft.name}
            onChange={e=>setNodeDraft({...nodeDraft,name:e.target.value})}/>
          <TextField fullWidth label="Тип" value={nodeDraft.kind}
            placeholder="План, измерение, посмертие…"
            onChange={e=>setNodeDraft({...nodeDraft,kind:e.target.value})}/>
        </Stack>
        <Stack direction={{xs:'column',sm:'row'}} gap={1}>
          <TextField label="Символ" value={nodeDraft.symbol} onChange={e=>setNodeDraft({...nodeDraft,symbol:e.target.value})}/>
          <BufferedColorField value={nodeDraft.color}
            onCommit={color=>setNodeDraft({...nodeDraft,color})}/>
          <TextField type="number" label="Размер на графе" value={nodeDraft.size}
            inputProps={{min:.5,max:3,step:.1}}
            helperText="0.5–3.0"
            onChange={e=>setNodeDraft({...nodeDraft,size:clamp(Number(e.target.value)||1,.5,3)})}/>
        </Stack>
        <FormControl size="small" fullWidth><InputLabel>Мир Atlas</InputLabel>
          <Select label="Мир Atlas" value={nodeDraft.worldId??''}
            onChange={e=>setNodeDraft({...nodeDraft,worldId:e.target.value||null})}>
            <MenuItem value="">Вне конкретного мира</MenuItem>
            {worlds.map(w=><MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
          </Select></FormControl>
        <TextField multiline minRows={5} label="Описание" value={nodeDraft.description}
          onChange={e=>setNodeDraft({...nodeDraft,description:e.target.value})}/>
        <FormControl size="small"><InputLabel>Видимость</InputLabel>
          <Select label="Видимость" value={nodeDraft.visibility}
            onChange={e=>setNodeDraft({...nodeDraft,visibility:e.target.value as MythosCosmicNodeInput['visibility']})}>
            <MenuItem value="gm">Мастер</MenuItem><MenuItem value="public">Публично</MenuItem><MenuItem value="draft">Черновик</MenuItem>
          </Select></FormControl>
      </Stack></DialogContent>}
      <DialogActions>
        {nodeId&&<Button color="error" disabled={busy} onClick={()=>void run(()=>onDeleteNode(nodeId),()=>setNodeDraft(null))}>Удалить</Button>}
        <Box sx={{flex:1}}/><Button onClick={()=>setNodeDraft(null)}>Отмена</Button>
        <Button variant="contained" disabled={busy||!nodeDraft?.name.trim()}
          onClick={()=>void run(()=>nodeId?onUpdateNode(nodeId,nodeDraft!):onCreateNode(nodeDraft!),()=>setNodeDraft(null))}>Сохранить</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(linkDraft)} onClose={()=>!busy&&setLinkDraft(null)} fullWidth maxWidth="sm">
      <DialogTitle>{linkId?'Редактировать связь планов':'Новая космологическая связь'}</DialogTitle>
      {linkDraft&&<DialogContent><Stack gap={1.5} sx={{pt:1}}>
        {error&&<Typography color="error.main">{error}</Typography>}
        <Stack direction={{xs:'column',sm:'row'}} gap={1}>
          <FormControl size="small" fullWidth><InputLabel>Откуда</InputLabel>
            <Select label="Откуда" value={linkDraft.sourceId}
              onChange={e=>setLinkDraft({...linkDraft,sourceId:e.target.value})}>
              {nodes.map(n=><MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
            </Select></FormControl>
          <FormControl size="small" fullWidth><InputLabel>Куда</InputLabel>
            <Select label="Куда" value={linkDraft.targetId}
              onChange={e=>setLinkDraft({...linkDraft,targetId:e.target.value})}>
              {nodes.map(n=><MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
            </Select></FormControl>
        </Stack>
        <Stack direction={{xs:'column',sm:'row'}} gap={1}>
          <TextField fullWidth label="Тип пути" value={linkDraft.type}
            onChange={e=>setLinkDraft({...linkDraft,type:e.target.value})}/>
          <TextField fullWidth label="Подпись" value={linkDraft.label}
            onChange={e=>setLinkDraft({...linkDraft,label:e.target.value})}/>
        </Stack>
        <TextField multiline minRows={4} label="Описание" value={linkDraft.description}
          onChange={e=>setLinkDraft({...linkDraft,description:e.target.value})}/>
        <FormControl size="small"><InputLabel>Видимость</InputLabel>
          <Select label="Видимость" value={linkDraft.visibility}
            onChange={e=>setLinkDraft({...linkDraft,visibility:e.target.value as MythosCosmicLinkInput['visibility']})}>
            <MenuItem value="gm">Мастер</MenuItem><MenuItem value="public">Публично</MenuItem><MenuItem value="draft">Черновик</MenuItem>
          </Select></FormControl>
      </Stack></DialogContent>}
      <DialogActions>
        {linkId&&<Button color="error" disabled={busy} onClick={()=>void run(()=>onDeleteLink(linkId),()=>setLinkDraft(null))}>Удалить</Button>}
        <Box sx={{flex:1}}/><Button onClick={()=>setLinkDraft(null)}>Отмена</Button>
        <Button variant="contained" disabled={busy||!linkDraft?.sourceId||!linkDraft?.targetId||
          linkDraft?.sourceId===linkDraft?.targetId||!linkDraft?.type.trim()}
          onClick={()=>void run(()=>linkId?onUpdateLink(linkId,linkDraft!):onCreateLink(linkDraft!).then(()=>undefined),()=>setLinkDraft(null))}>Сохранить</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
