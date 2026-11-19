import { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type {
  MythosCosmicLinkInput, MythosCosmicLinkRecord, MythosCosmicNodeInput,
  MythosCosmicNodeRecord, WorldRecord,
} from '@atlas/shared';
import { BufferedColorField } from './BufferedColorField';

const nodeDefault=(worldId:string|null):MythosCosmicNodeInput=>({
  name:'',kind:'План',description:'',symbol:'',color:'#7f8da8',x:50,y:50,
  worldId,visibility:'gm',
});
const linkDefault=(nodes:MythosCosmicNodeRecord[]):MythosCosmicLinkInput=>({
  sourceId:nodes[0]?.id??'',targetId:nodes[1]?.id??'',type:'Путь',label:'',
  description:'',visibility:'gm',
});

export function MythosCosmology({nodes,links,worlds,admin,onCreateNode,onUpdateNode,onDeleteNode,
  onCreateLink,onUpdateLink,onDeleteLink}:{
  nodes:MythosCosmicNodeRecord[];links:MythosCosmicLinkRecord[];worlds:WorldRecord[];admin:boolean;
  onCreateNode:(input:MythosCosmicNodeInput)=>Promise<void>;
  onUpdateNode:(id:string,input:MythosCosmicNodeInput)=>Promise<void>;
  onDeleteNode:(id:string)=>Promise<void>;
  onCreateLink:(input:MythosCosmicLinkInput)=>Promise<void>;
  onUpdateLink:(id:string,input:MythosCosmicLinkInput)=>Promise<void>;
  onDeleteLink:(id:string)=>Promise<void>;
}){
  const drag=useRef<{id:string;pointer:number}|null>(null);
  const [positions,setPositions]=useState<Record<string,{x:number;y:number}>>({});
  const [nodeDraft,setNodeDraft]=useState<MythosCosmicNodeInput|null>(null);
  const [nodeId,setNodeId]=useState<string|null>(null);
  const [linkDraft,setLinkDraft]=useState<MythosCosmicLinkInput|null>(null);
  const [linkId,setLinkId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>setPositions(Object.fromEntries(nodes.map(node=>[node.id,{x:node.x,y:node.y}]))),[nodes]);
  const pos=(id:string)=>positions[id]??{x:50,y:50};

  function move(event:ReactPointerEvent<HTMLDivElement>){
    if(!drag.current||drag.current.pointer!==event.pointerId)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const x=Math.max(5,Math.min(95,(event.clientX-rect.left)/rect.width*100));
    const y=Math.max(8,Math.min(92,(event.clientY-rect.top)/rect.height*100));
    setPositions(current=>({...current,[drag.current!.id]:{x,y}}));
  }
  async function end(event:ReactPointerEvent<HTMLDivElement>){
    if(!drag.current||drag.current.pointer!==event.pointerId)return;
    const {id}=drag.current;drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    const node=nodes.find(item=>item.id===id),p=positions[id];
    if(node&&p)await onUpdateNode(id,{
      name:node.name,kind:node.kind,description:node.description,symbol:node.symbol,color:node.color,
      x:p.x,y:p.y,worldId:node.worldId,visibility:node.visibility,
    });
  }
  function editNode(node?:MythosCosmicNodeRecord){
    setError('');setNodeId(node?.id??null);
    setNodeDraft(node?{
      name:node.name,kind:node.kind,description:node.description,symbol:node.symbol,color:node.color,
      x:node.x,y:node.y,worldId:node.worldId,visibility:node.visibility,
    }:nodeDefault(null));
  }
  function editLink(link?:MythosCosmicLinkRecord){
    setError('');setLinkId(link?.id??null);
    setLinkDraft(link?{
      sourceId:link.sourceId,targetId:link.targetId,type:link.type,label:link.label,
      description:link.description,visibility:link.visibility,
    }:linkDefault(nodes));
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
      {admin&&<Stack direction="row" gap={1}>
        <Button variant="contained" onClick={()=>editNode()}>+ Узел</Button>
        <Button variant="outlined" disabled={nodes.length<2} onClick={()=>editLink()}>+ Связь</Button>
      </Stack>}
    </Stack>

    <Box className="mythos-cosmic-board" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
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
        const p=pos(node.id);
        return <button key={node.id} className={'mythos-cosmic-node'+(admin?' is-draggable':'')}
          style={{left:p.x+'%',top:p.y+'%','--node-color':node.color} as CSSProperties}
          onPointerDown={event=>{
            if(!admin||event.button!==0)return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current={id:node.id,pointer:event.pointerId};event.stopPropagation();
          }}
          onDoubleClick={()=>admin&&editNode(node)} title={node.description||node.kind}>
          <span>{node.symbol||'◈'}</span><strong>{node.name}</strong><small>{node.kind}</small>
        </button>;
      })}
      {!nodes.length&&<Box className="mythos-graph-empty">
        <Typography variant="h6">Космология пока пуста</Typography>
        <Typography color="text.secondary">Добавь материальный мир, астрал, загробье или любой другой план.</Typography>
      </Box>}
    </Box>
    <Typography variant="caption" color="text.secondary">
      {admin?'Перетаскивай узлы. Двойной клик по узлу или подписи связи — редактирование.':'Карта устройства мироздания.'}
    </Typography>

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
          <FormControl size="small" fullWidth><InputLabel>Мир Atlas</InputLabel>
            <Select label="Мир Atlas" value={nodeDraft.worldId??''}
              onChange={e=>setNodeDraft({...nodeDraft,worldId:e.target.value||null})}>
              <MenuItem value="">Вне конкретного мира</MenuItem>
              {worlds.map(w=><MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </Select></FormControl>
        </Stack>
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
          onClick={()=>void run(()=>linkId?onUpdateLink(linkId,linkDraft!):onCreateLink(linkDraft!),()=>setLinkDraft(null))}>Сохранить</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
