import { useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type {
  ChronicleEventRecord, MythosBeliefInput, MythosBeliefRecord, MythosChronicleLinkInput,
  MythosChronicleLinkRecord, MythosDeityRecord, MythosLocationRef, MythosMythInput,
  MythosMythRecord, MythosSacredSiteInput, MythosSacredSiteRecord, WorldRecord,
} from '@atlas/shared';
import { dayToChronicleDate, formatChronicleDate } from '../chronicle/calendar';

type LoreMode='myths'|'beliefs'|'sites'|'history';
const identityLabel:Record<string,string>={
  true:'Знают истинную сущность',partial:'Знают лишь часть истины',
  false:'Ошибочная идентификация',unknown:'Истина неизвестна',
};
const visibilityItems=[
  ['gm','Только мастер'],['public','Публично'],['draft','Черновик'],
] as const;

export function MythosLore({admin,deities,worlds,locations,events,myths,beliefs,sites,history,
  onCreateMyth,onUpdateMyth,onDeleteMyth,onCreateBelief,onUpdateBelief,onDeleteBelief,
  onCreateSite,onUpdateSite,onDeleteSite,onUpsertHistory,onDeleteHistory}:{
  admin:boolean;deities:MythosDeityRecord[];worlds:WorldRecord[];locations:MythosLocationRef[];
  events:ChronicleEventRecord[];myths:MythosMythRecord[];beliefs:MythosBeliefRecord[];
  sites:MythosSacredSiteRecord[];history:MythosChronicleLinkRecord[];
  onCreateMyth:(input:MythosMythInput)=>Promise<void>;
  onUpdateMyth:(id:string,input:MythosMythInput)=>Promise<void>;
  onDeleteMyth:(id:string)=>Promise<void>;
  onCreateBelief:(input:MythosBeliefInput)=>Promise<void>;
  onUpdateBelief:(id:string,input:MythosBeliefInput)=>Promise<void>;
  onDeleteBelief:(id:string)=>Promise<void>;
  onCreateSite:(input:MythosSacredSiteInput)=>Promise<void>;
  onUpdateSite:(id:string,input:MythosSacredSiteInput)=>Promise<void>;
  onDeleteSite:(id:string)=>Promise<void>;
  onUpsertHistory:(input:MythosChronicleLinkInput)=>Promise<void>;
  onDeleteHistory:(deityId:string,eventId:string)=>Promise<void>;
}){
  const [mode,setMode]=useState<LoreMode>('myths');
  const [mythDraft,setMythDraft]=useState<MythosMythInput|null>(null);
  const [mythId,setMythId]=useState<string|null>(null);
  const [beliefDraft,setBeliefDraft]=useState<MythosBeliefInput|null>(null);
  const [beliefId,setBeliefId]=useState<string|null>(null);
  const [siteDraft,setSiteDraft]=useState<MythosSacredSiteInput|null>(null);
  const [siteId,setSiteId]=useState<string|null>(null);
  const [historyDraft,setHistoryDraft]=useState<MythosChronicleLinkInput|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  function startMyth(item?:MythosMythRecord){
    setError('');setMythId(item?.id??null);
    setMythDraft(item?{
      title:item.title,summary:item.summary,description:item.description,visibility:item.visibility,
      participants:item.participants.map(p=>({deityId:p.deityId,role:p.role})),
    }:{title:'',summary:'',description:'',visibility:'gm',participants:[]});
  }
  function startBelief(item?:MythosBeliefRecord){
    setError('');setBeliefId(item?.id??null);
    setBeliefDraft(item?{
      deityId:item.deityId,worldId:item.worldId,culture:item.culture,publicName:item.publicName,
      doctrine:item.doctrine,identity:item.identity,visibility:item.visibility,
    }:{deityId:null,worldId:null,culture:'',publicName:'',doctrine:'',identity:'unknown',visibility:'gm'});
  }
  function startSite(item?:MythosSacredSiteRecord){
    setError('');setSiteId(item?.id??null);
    setSiteDraft(item?{
      deityId:item.deityId,locationId:item.locationId,name:item.name,description:item.description,
      importance:item.importance,visibility:item.visibility,
    }:{deityId:deities[0]?.id??'',locationId:locations[0]?.id??'',name:'',description:'',
      importance:'Священное место',visibility:'gm'});
  }
  async function run(task:()=>Promise<void>,close:()=>void){
    setBusy(true);setError('');
    try{await task();close();}catch(reason){setError(reason instanceof Error?reason.message:'Не удалось сохранить');}
    finally{setBusy(false);}
  }

  return <Box className="mythos-lore-shell">
    <Stack direction="row" gap={.8} flexWrap="wrap" alignItems="center" justifyContent="space-between">
      <Stack direction="row" gap={.8} flexWrap="wrap">
        <Button size="small" variant={mode==='myths'?'contained':'outlined'} onClick={()=>setMode('myths')}>Мифы</Button>
        <Button size="small" variant={mode==='beliefs'?'contained':'outlined'} onClick={()=>setMode('beliefs')}>Верования</Button>
        <Button size="small" variant={mode==='sites'?'contained':'outlined'} onClick={()=>setMode('sites')}>Святыни Atlas</Button>
        <Button size="small" variant={mode==='history'?'contained':'outlined'} onClick={()=>setMode('history')}>История Chronicle</Button>
      </Stack>
      {admin&&<Button size="small" variant="contained" onClick={()=>{
        if(mode==='myths')startMyth();
        else if(mode==='beliefs')startBelief();
        else if(mode==='sites')startSite();
        else setHistoryDraft({deityId:deities[0]?.id??'',eventId:events[0]?.id??'',role:''});
      }}>+ {mode==='myths'?'Миф':mode==='beliefs'?'Верование':mode==='sites'?'Святыня':'Связь с Chronicle'}</Button>}
    </Stack>

    {mode==='myths'&&<Box className="mythos-lore-grid">
      {myths.map(item=><Box key={item.id} className="mythos-lore-card">
        <Typography className="mythos-lore-title">{item.title}</Typography>
        <Typography color="text.secondary" variant="body2">{item.summary||'Без краткого описания'}</Typography>
        <Stack direction="row" gap={.6} flexWrap="wrap" sx={{mt:1.3}}>
          {item.participants.map(p=><Chip key={p.deityId} size="small"
            label={p.deityName+(p.role?' · '+p.role:'')}/>)}
        </Stack>
        <Typography className="mythos-lore-text">{item.description||'Текст мифа пока не написан.'}</Typography>
        {admin&&<Stack direction="row" gap={1} sx={{mt:'auto'}}>
          <Button size="small" onClick={()=>startMyth(item)}>Редактировать</Button>
          <Button size="small" color="error" onClick={()=>void run(()=>onDeleteMyth(item.id),()=>{})}>Удалить</Button>
        </Stack>}
      </Box>)}
      {!myths.length&&<Empty text="Мифов пока нет. Создавай одну историю и связывай её сразу с несколькими божествами."/>}
    </Box>}

    {mode==='beliefs'&&<Box className="mythos-lore-grid">
      {beliefs.map(item=><Box key={item.id} className="mythos-lore-card">
        <Typography className="mythos-lore-kicker">{item.culture}{item.world?' · '+item.world.name:''}</Typography>
        <Typography className="mythos-lore-title">{item.publicName}</Typography>
        <Typography color="primary.main" variant="caption">{identityLabel[item.identity]??item.identity}</Typography>
        <Typography className="mythos-lore-text">{item.doctrine||'Учение пока не описано.'}</Typography>
        <Typography variant="caption" color="text.secondary">
          Объективная сущность: {item.deity?.name??'не привязана / неизвестна'}
        </Typography>
        {admin&&<Stack direction="row" gap={1} sx={{mt:'auto'}}>
          <Button size="small" onClick={()=>startBelief(item)}>Редактировать</Button>
          <Button size="small" color="error" onClick={()=>void run(()=>onDeleteBelief(item.id),()=>{})}>Удалить</Button>
        </Stack>}
      </Box>)}
      {!beliefs.length&&<Empty text="Здесь можно хранить то, во что верят культуры, отдельно от объективной истины мастера."/>}
    </Box>}

    {mode==='sites'&&<Box className="mythos-lore-grid">
      {sites.map(item=><Box key={item.id} className="mythos-lore-card">
        <Typography className="mythos-lore-kicker">{item.importance}</Typography>
        <Typography className="mythos-lore-title">{item.name}</Typography>
        <Typography color="text.secondary" variant="body2">
          {item.location?.worldName} · {item.location?.name}
        </Typography>
        <Chip size="small" sx={{alignSelf:'flex-start',mt:1}} label={item.deity?.name??'Божество'}/>
        <Typography className="mythos-lore-text">{item.description||'Описание святыни пока отсутствует.'}</Typography>
        {admin&&<Stack direction="row" gap={1} sx={{mt:'auto'}}>
          <Button size="small" onClick={()=>startSite(item)}>Редактировать</Button>
          <Button size="small" color="error" onClick={()=>void run(()=>onDeleteSite(item.id),()=>{})}>Удалить</Button>
        </Stack>}
      </Box>)}
      {!sites.length&&<Empty text="Свяжи богов с реальными локациями Atlas: храмами, рощами, руинами и культовыми центрами."/>}
    </Box>}

    {mode==='history'&&<Box className="mythos-history-list">
      {[...history].sort((a,b)=>(a.event.startDay??Infinity)-(b.event.startDay??Infinity)).map(item=>
        <Box key={item.deityId+item.eventId} className="mythos-history-row">
          <Box>
            <Typography fontWeight={800}>{item.deity.name} → {item.event.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {item.event.startDay===null?'Дата неизвестна':formatChronicleDate(dayToChronicleDate(item.event.startDay))}
              {item.role?' · '+item.role:''}
            </Typography>
          </Box>
          {admin&&<Button size="small" color="error"
            onClick={()=>void run(()=>onDeleteHistory(item.deityId,item.eventId),()=>{})}>Удалить связь</Button>}
        </Box>)}
      {!history.length&&<Empty text="Связывай рождение, гибель, войны, передачу доменов и другие этапы истории богов с событиями Chronicle."/>}
    </Box>}

    <Dialog open={Boolean(mythDraft)} onClose={()=>!busy&&setMythDraft(null)} fullWidth maxWidth="md">
      <DialogTitle>{mythId?'Редактировать миф':'Новый миф'}</DialogTitle>
      {mythDraft&&<DialogContent><Stack gap={1.5} sx={{pt:1}}>
        {error&&<Typography color="error.main">{error}</Typography>}
        <TextField label="Название" value={mythDraft.title}
          onChange={e=>setMythDraft({...mythDraft,title:e.target.value})}/>
        <TextField label="Кратко" value={mythDraft.summary}
          onChange={e=>setMythDraft({...mythDraft,summary:e.target.value})}/>
        <FormControl size="small"><InputLabel>Участники</InputLabel>
          <Select multiple label="Участники" value={mythDraft.participants.map(p=>p.deityId)}
            renderValue={ids=>ids.map(id=>deities.find(d=>d.id===id)?.name??id).join(', ')}
            onChange={e=>{
              const ids=typeof e.target.value==='string'?e.target.value.split(','):e.target.value;
              setMythDraft({...mythDraft,participants:ids.map(id=>({
                deityId:id,role:mythDraft.participants.find(p=>p.deityId===id)?.role??''
              }))});
            }}>
            {deities.map(d=><MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </Select></FormControl>
        {mythDraft.participants.map((p,index)=><TextField size="small" key={p.deityId}
          label={'Роль · '+(deities.find(d=>d.id===p.deityId)?.name??p.deityId)} value={p.role}
          onChange={e=>setMythDraft({...mythDraft,participants:mythDraft.participants.map((x,i)=>
            i===index?{...x,role:e.target.value}:x)})}/>)}
        <TextField multiline minRows={6} label="Текст мифа" value={mythDraft.description}
          onChange={e=>setMythDraft({...mythDraft,description:e.target.value})}/>
        <Visibility value={mythDraft.visibility} onChange={visibility=>setMythDraft({...mythDraft,visibility})}/>
      </Stack></DialogContent>}
      <DialogActions><Button onClick={()=>setMythDraft(null)}>Отмена</Button>
        <Button variant="contained" disabled={busy||!mythDraft?.title.trim()}
          onClick={()=>void run(()=>mythId?onUpdateMyth(mythId,mythDraft!):onCreateMyth(mythDraft!),()=>setMythDraft(null))}>Сохранить</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(beliefDraft)} onClose={()=>!busy&&setBeliefDraft(null)} fullWidth maxWidth="sm">
      <DialogTitle>{beliefId?'Редактировать верование':'Новое верование'}</DialogTitle>
      {beliefDraft&&<DialogContent><Stack gap={1.5} sx={{pt:1}}>
        {error&&<Typography color="error.main">{error}</Typography>}
        <Stack direction={{xs:'column',sm:'row'}} gap={1}>
          <TextField fullWidth label="Культура / религия" value={beliefDraft.culture}
            onChange={e=>setBeliefDraft({...beliefDraft,culture:e.target.value})}/>
          <TextField fullWidth label="Как они называют сущность" value={beliefDraft.publicName}
            onChange={e=>setBeliefDraft({...beliefDraft,publicName:e.target.value})}/>
        </Stack>
        <FormControl size="small"><InputLabel>Объективная сущность</InputLabel>
          <Select label="Объективная сущность" value={beliefDraft.deityId??''}
            onChange={e=>setBeliefDraft({...beliefDraft,deityId:e.target.value||null})}>
            <MenuItem value="">Неизвестна / не существует</MenuItem>
            {deities.map(d=><MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </Select></FormControl>
        <Stack direction={{xs:'column',sm:'row'}} gap={1}>
          <FormControl size="small" fullWidth><InputLabel>Мир</InputLabel>
            <Select label="Мир" value={beliefDraft.worldId??''}
              onChange={e=>setBeliefDraft({...beliefDraft,worldId:e.target.value||null})}>
              <MenuItem value="">Мультивселенная / не указан</MenuItem>
              {worlds.map(w=><MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </Select></FormControl>
          <FormControl size="small" fullWidth><InputLabel>Насколько они правы</InputLabel>
            <Select label="Насколько они правы" value={beliefDraft.identity}
              onChange={e=>setBeliefDraft({...beliefDraft,identity:e.target.value as MythosBeliefInput['identity']})}>
              {Object.entries(identityLabel).map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}
            </Select></FormControl>
        </Stack>
        <TextField multiline minRows={6} label="Во что они верят" value={beliefDraft.doctrine}
          onChange={e=>setBeliefDraft({...beliefDraft,doctrine:e.target.value})}/>
        <Visibility value={beliefDraft.visibility} onChange={visibility=>setBeliefDraft({...beliefDraft,visibility})}/>
      </Stack></DialogContent>}
      <DialogActions><Button onClick={()=>setBeliefDraft(null)}>Отмена</Button>
        <Button variant="contained" disabled={busy||!beliefDraft?.culture.trim()||!beliefDraft?.publicName.trim()}
          onClick={()=>void run(()=>beliefId?onUpdateBelief(beliefId,beliefDraft!):onCreateBelief(beliefDraft!),()=>setBeliefDraft(null))}>Сохранить</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(siteDraft)} onClose={()=>!busy&&setSiteDraft(null)} fullWidth maxWidth="sm">
      <DialogTitle>{siteId?'Редактировать святыню':'Новая святыня'}</DialogTitle>
      {siteDraft&&<DialogContent><Stack gap={1.5} sx={{pt:1}}>
        {error&&<Typography color="error.main">{error}</Typography>}
        <TextField label="Название связи / святыни" value={siteDraft.name}
          onChange={e=>setSiteDraft({...siteDraft,name:e.target.value})}/>
        <FormControl size="small"><InputLabel>Божество</InputLabel>
          <Select label="Божество" value={siteDraft.deityId}
            onChange={e=>setSiteDraft({...siteDraft,deityId:e.target.value})}>
            {deities.map(d=><MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </Select></FormControl>
        <FormControl size="small"><InputLabel>Локация Atlas</InputLabel>
          <Select label="Локация Atlas" value={siteDraft.locationId}
            onChange={e=>setSiteDraft({...siteDraft,locationId:e.target.value})}>
            {locations.map(loc=><MenuItem key={loc.id} value={loc.id}>{loc.worldName} · {loc.name}</MenuItem>)}
          </Select></FormControl>
        <TextField label="Тип" value={siteDraft.importance} placeholder="Главный храм, священная роща…"
          onChange={e=>setSiteDraft({...siteDraft,importance:e.target.value})}/>
        <TextField multiline minRows={4} label="Описание" value={siteDraft.description}
          onChange={e=>setSiteDraft({...siteDraft,description:e.target.value})}/>
        <Visibility value={siteDraft.visibility} onChange={visibility=>setSiteDraft({...siteDraft,visibility})}/>
      </Stack></DialogContent>}
      <DialogActions><Button onClick={()=>setSiteDraft(null)}>Отмена</Button>
        <Button variant="contained" disabled={busy||!siteDraft?.name.trim()||!siteDraft?.deityId||!siteDraft?.locationId}
          onClick={()=>void run(()=>siteId?onUpdateSite(siteId,siteDraft!):onCreateSite(siteDraft!),()=>setSiteDraft(null))}>Сохранить</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(historyDraft)} onClose={()=>!busy&&setHistoryDraft(null)} fullWidth maxWidth="sm">
      <DialogTitle>Связать божество с Chronicle</DialogTitle>
      {historyDraft&&<DialogContent><Stack gap={1.5} sx={{pt:1}}>
        {error&&<Typography color="error.main">{error}</Typography>}
        <FormControl size="small"><InputLabel>Божество</InputLabel>
          <Select label="Божество" value={historyDraft.deityId}
            onChange={e=>setHistoryDraft({...historyDraft,deityId:e.target.value})}>
            {deities.map(d=><MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </Select></FormControl>
        <FormControl size="small"><InputLabel>Событие Chronicle</InputLabel>
          <Select label="Событие Chronicle" value={historyDraft.eventId}
            onChange={e=>setHistoryDraft({...historyDraft,eventId:e.target.value})}>
            {events.map(event=><MenuItem key={event.id} value={event.id}>{event.title}</MenuItem>)}
          </Select></FormControl>
        <TextField label="Роль в событии" value={historyDraft.role}
          placeholder="родился, погиб, передал домен, вмешался…"
          onChange={e=>setHistoryDraft({...historyDraft,role:e.target.value})}/>
      </Stack></DialogContent>}
      <DialogActions><Button onClick={()=>setHistoryDraft(null)}>Отмена</Button>
        <Button variant="contained" disabled={busy||!historyDraft?.deityId||!historyDraft?.eventId}
          onClick={()=>void run(()=>onUpsertHistory(historyDraft!),()=>setHistoryDraft(null))}>Связать</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}

function Visibility({value,onChange}:{value:'draft'|'gm'|'public';onChange:(value:'draft'|'gm'|'public')=>void}){
  return <FormControl size="small"><InputLabel>Видимость</InputLabel>
    <Select label="Видимость" value={value} onChange={e=>onChange(e.target.value as typeof value)}>
      {visibilityItems.map(([id,label])=><MenuItem key={id} value={id}>{label}</MenuItem>)}
    </Select></FormControl>;
}
function Empty({text}:{text:string}){
  return <Box className="mythos-lore-empty"><Typography color="text.secondary">{text}</Typography></Box>;
}
