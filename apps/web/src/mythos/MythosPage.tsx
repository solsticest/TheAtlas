import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { ReactNode } from 'react';
import { Alert, Box, Button, ButtonBase, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Drawer, FormControl, InputLabel,
  MenuItem, Select, Slider, Stack, TextField, Typography } from '@mui/material';
import type {
  MythosDeityRecord, MythosPantheonInput, MythosPantheonRecord,
} from '@atlas/shared';
import {
  atlasApi, useWorldsQuery, useChronicleEventsQuery,
  useMythosDeitiesQuery, useMythosPantheonsQuery, useMythosRelationsQuery,
  useMythosMythsQuery, useMythosBeliefsQuery, useMythosSitesQuery,
  useMythosHistoryLinksQuery, useMythosCosmicNodesQuery, useMythosCosmicLinksQuery,
  useMythosLocationsQuery,
  useCreateMythosDeityMutation, useUpdateMythosDeityMutation, useUpdateMythosDeityPositionMutation,
  useDeleteMythosDeityMutation,
  useCreateMythosPantheonMutation, useUpdateMythosPantheonMutation, useDeleteMythosPantheonMutation,
  useCreateMythosRelationMutation, useUpdateMythosRelationMutation, useDeleteMythosRelationMutation,
  useCreateMythosMythMutation, useUpdateMythosMythMutation, useDeleteMythosMythMutation,
  useCreateMythosBeliefMutation, useUpdateMythosBeliefMutation, useDeleteMythosBeliefMutation,
  useCreateMythosSiteMutation, useUpdateMythosSiteMutation, useDeleteMythosSiteMutation,
  useUpsertMythosHistoryLinkMutation, useDeleteMythosHistoryLinkMutation,
  useCreateMythosCosmicNodeMutation, useUpdateMythosCosmicNodeMutation, useDeleteMythosCosmicNodeMutation,
  useCreateMythosCosmicLinkMutation, useUpdateMythosCosmicLinkMutation, useDeleteMythosCosmicLinkMutation,
} from '../atlas/api';
import type { AppDispatch } from '../atlas/store';
import { dayToChronicleDate, formatChronicleDate } from '../chronicle/calendar';
import {
  DeityEditorDialog, PantheonEditorDialog, defaultDeityDraft, defaultPantheonDraft,
  deityRecordToDraft, deityDraftToInput, type DeityDraft,
} from './MythosEditor';
import { MythosGraph } from './MythosGraph';
import { MythosTable } from './MythosTable';
import { MythosLore } from './MythosLore';
import { MythosCosmology } from './MythosCosmology';
import './mythos.css';

type Session={authenticated:boolean;csrfToken?:string};
type View='graph'|'table'|'encyclopedia'|'lore'|'cosmology'|'pantheons';
const normalize=(value:string)=>value.trim().toLocaleLowerCase('ru');
const visibilityLabel=(value:string)=>value==='public'?'Публично':value==='draft'?'Черновик':'Мастер';

function apiError(error:unknown){
  const payload=error as {data?:{error?:{message?:string}};message?:string};
  return payload.data?.error?.message??payload.message??'Не удалось выполнить действие.';
}
export function MythosPage(){
  const dispatch=useDispatch<AppDispatch>();
  const worldsQuery=useWorldsQuery();
  const deitiesQuery=useMythosDeitiesQuery();
  const pantheonsQuery=useMythosPantheonsQuery();
  const relationsQuery=useMythosRelationsQuery();
  const mythsQuery=useMythosMythsQuery();
  const beliefsQuery=useMythosBeliefsQuery();
  const sitesQuery=useMythosSitesQuery();
  const historyQuery=useMythosHistoryLinksQuery();
  const cosmicNodesQuery=useMythosCosmicNodesQuery();
  const cosmicLinksQuery=useMythosCosmicLinksQuery();
  const locationsQuery=useMythosLocationsQuery();
  const chronicleQuery=useChronicleEventsQuery();

  const worlds=worldsQuery.currentData??[];
  const deities=deitiesQuery.currentData??[];
  const pantheons=pantheonsQuery.currentData??[];
  const relations=relationsQuery.currentData??[];
  const myths=mythsQuery.currentData??[];
  const beliefs=beliefsQuery.currentData??[];
  const sites=sitesQuery.currentData??[];
  const history=historyQuery.currentData??[];
  const cosmicNodes=cosmicNodesQuery.currentData??[];
  const cosmicLinks=cosmicLinksQuery.currentData??[];
  const locations=locationsQuery.currentData??[];
  const chronicleEvents=chronicleQuery.currentData??[];

  const [createDeity,{isLoading:creatingDeity}]=useCreateMythosDeityMutation();
  const [updateDeity,{isLoading:updatingDeity}]=useUpdateMythosDeityMutation();
  const [updateDeityPosition]=useUpdateMythosDeityPositionMutation();
  const [deleteDeity,{isLoading:deletingDeity}]=useDeleteMythosDeityMutation();
  const [createPantheon,{isLoading:creatingPantheon}]=useCreateMythosPantheonMutation();
  const [updatePantheon,{isLoading:updatingPantheon}]=useUpdateMythosPantheonMutation();
  const [deletePantheon,{isLoading:deletingPantheon}]=useDeleteMythosPantheonMutation();
  const [createRelation]=useCreateMythosRelationMutation();
  const [updateRelation]=useUpdateMythosRelationMutation();
  const [deleteRelation]=useDeleteMythosRelationMutation();
  const [createMyth]=useCreateMythosMythMutation();
  const [updateMyth]=useUpdateMythosMythMutation();
  const [deleteMyth]=useDeleteMythosMythMutation();
  const [createBelief]=useCreateMythosBeliefMutation();
  const [updateBelief]=useUpdateMythosBeliefMutation();
  const [deleteBelief]=useDeleteMythosBeliefMutation();
  const [createSite]=useCreateMythosSiteMutation();
  const [updateSite]=useUpdateMythosSiteMutation();
  const [deleteSite]=useDeleteMythosSiteMutation();
  const [upsertHistory]=useUpsertMythosHistoryLinkMutation();
  const [deleteHistory]=useDeleteMythosHistoryLinkMutation();
  const [createCosmicNode]=useCreateMythosCosmicNodeMutation();
  const [updateCosmicNode]=useUpdateMythosCosmicNodeMutation();
  const [deleteCosmicNode]=useDeleteMythosCosmicNodeMutation();
  const [createCosmicLink]=useCreateMythosCosmicLinkMutation();
  const [updateCosmicLink]=useUpdateMythosCosmicLinkMutation();
  const [deleteCosmicLink]=useDeleteMythosCosmicLinkMutation();

  const [session,setSession]=useState<Session>({authenticated:false});
  const [view,setView]=useState<View>('graph');
  const [query,setQuery]=useState('');
  const [worldFilter,setWorldFilter]=useState('*');
  const [pantheonFilter,setPantheonFilter]=useState('*');
  const [domainFilter,setDomainFilter]=useState('*');
  const [historicalDay,setHistoricalDay]=useState<number|null>(null);
  const [selectedDeityId,setSelectedDeityId]=useState<string|null>(null);
  const [selectedPantheonId,setSelectedPantheonId]=useState<string|null>(null);
  const [deityDraft,setDeityDraft]=useState<DeityDraft|null>(null);
  const [deityEditingId,setDeityEditingId]=useState<string|null>(null);
  const [pantheonDraft,setPantheonDraft]=useState<MythosPantheonInput|null>(null);
  const [pantheonEditingId,setPantheonEditingId]=useState<string|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<{kind:'deity'|'pantheon';id:string}|null>(null);
  const [loginOpen,setLoginOpen]=useState(false);
  const [password,setPassword]=useState('');
  const [loginError,setLoginError]=useState('');
  const [editorError,setEditorError]=useState('');
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    void fetch('/api/auth/me',{credentials:'same-origin'})
      .then(async response=>setSession(await response.json() as Session))
      .catch(()=>setSession({authenticated:false}));
  },[]);

  const domainOptions=useMemo(()=>[...new Map(deities.flatMap(item=>item.domains)
    .map(domain=>[normalize(domain),domain])).values()].sort((a,b)=>a.localeCompare(b,'ru')),[deities]);
  const filteredDeities=useMemo(()=>deities.filter(deity=>{
    if(worldFilter!=='*'&&deity.worlds.length&&!deity.worlds.some(world=>world.id===worldFilter))return false;
    if(pantheonFilter!=='*'&&deity.pantheonId!==pantheonFilter)return false;
    if(domainFilter!=='*'&&!deity.domains.some(domain=>normalize(domain)===normalize(domainFilter)))return false;
    const q=normalize(query);
    return !q||normalize([
      deity.name,deity.epithet,deity.summary,deity.description,deity.rank,deity.power,
      deity.pantheon?.name??'',...deity.domains,...deity.worlds.map(world=>world.name),
    ].join(' ')).includes(q);
  }),[deities,worldFilter,pantheonFilter,domainFilter,query]);
  const filteredPantheons=useMemo(()=>pantheons.filter(item=>{
    if(worldFilter!=='*'&&item.worldId&&item.worldId!==worldFilter)return false;
    const q=normalize(query);
    return !q||normalize(item.name+' '+item.description).includes(q);
  }),[pantheons,worldFilter,query]);
  const visibleIds=useMemo(()=>new Set(filteredDeities.map(d=>d.id)),[filteredDeities]);
  const filteredRelations=useMemo(()=>relations.filter(r=>visibleIds.has(r.sourceId)&&visibleIds.has(r.targetId)),
    [relations,visibleIds]);
  const selectedDeity=deities.find(item=>item.id===selectedDeityId)??null;
  const selectedPantheon=pantheons.find(item=>item.id===selectedPantheonId)??null;

  const historyBounds=useMemo(()=>{
    const values=relations.flatMap(r=>[r.startDay,r.endDay]).filter((v):v is number=>v!==null);
    return values.length?{min:Math.min(...values),max:Math.max(...values)}:null;
  },[relations]);

  const loading=[worldsQuery,deitiesQuery,pantheonsQuery,relationsQuery,mythsQuery,beliefsQuery,
    sitesQuery,historyQuery,cosmicNodesQuery,cosmicLinksQuery].some(item=>item.isLoading);
  const failed=[worldsQuery,deitiesQuery,pantheonsQuery,relationsQuery,mythsQuery,beliefsQuery,
    sitesQuery,historyQuery,cosmicNodesQuery,cosmicLinksQuery].some(item=>item.isError);

  function requireCsrf(){
    if(!session.csrfToken)throw Error('Сначала войди как администратор.');
    return session.csrfToken;
  }
  function beginDeity(item?:MythosDeityRecord){
    setEditorError('');setDeityEditingId(item?.id??null);
    setDeityDraft(item?deityRecordToDraft(item):defaultDeityDraft(worldFilter==='*'?null:worldFilter));
  }
  function beginDeityAt(graphX:number,graphY:number){
    setEditorError('');setDeityEditingId(null);
    setDeityDraft({
      ...defaultDeityDraft(worldFilter==='*'?null:worldFilter),
      graphX,graphY,
    });
  }
  function beginPantheon(item?:MythosPantheonRecord){
    setEditorError('');setPantheonEditingId(item?.id??null);
    setPantheonDraft(item?{
      name:item.name,description:item.description,visibility:item.visibility,worldId:item.worldId,
    }:defaultPantheonDraft(worldFilter==='*'?null:worldFilter));
  }
  async function saveDeity(){
    if(!deityDraft)return;
    setEditorError('');
    try{
      const csrf=requireCsrf(),input=deityDraftToInput(deityDraft);
      const saved=deityEditingId
        ?await updateDeity({id:deityEditingId,input,csrf}).unwrap()
        :await createDeity({input,csrf}).unwrap();
      setDeityDraft(null);setDeityEditingId(null);setSelectedDeityId(saved.id);setNotice('Божество сохранено');
    }catch(error){setEditorError(apiError(error));}
  }
  async function savePantheon(){
    if(!pantheonDraft)return;
    setEditorError('');
    try{
      const csrf=requireCsrf();
      const saved=pantheonEditingId
        ?await updatePantheon({id:pantheonEditingId,input:pantheonDraft,csrf}).unwrap()
        :await createPantheon({input:pantheonDraft,csrf}).unwrap();
      setPantheonDraft(null);setPantheonEditingId(null);setSelectedPantheonId(saved.id);setNotice('Пантеон сохранён');
    }catch(error){setEditorError(apiError(error));}
  }
  async function login(){
    setLoginError('');
    try{
      const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json'},body:JSON.stringify({password})});
      const data=await response.json() as Session&{error?:{message?:string}};
      if(!response.ok)throw Error(data.error?.message??'Не удалось войти');
      setSession(data);setPassword('');setLoginOpen(false);
      await Promise.all([
        deitiesQuery.refetch(),pantheonsQuery.refetch(),relationsQuery.refetch(),mythsQuery.refetch(),
        beliefsQuery.refetch(),sitesQuery.refetch(),historyQuery.refetch(),cosmicNodesQuery.refetch(),
        cosmicLinksQuery.refetch(),chronicleQuery.refetch(),
      ]);
    }catch(error){setLoginError(error instanceof Error?error.message:String(error));}
  }
  async function logout(){
    if(!session.csrfToken)return;
    await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',
      headers:{'x-csrf-token':session.csrfToken}});
    setSession({authenticated:false});setSelectedDeityId(null);setSelectedPantheonId(null);
    await Promise.all([deitiesQuery.refetch(),pantheonsQuery.refetch(),relationsQuery.refetch(),
      mythsQuery.refetch(),beliefsQuery.refetch(),sitesQuery.refetch(),historyQuery.refetch(),
      cosmicNodesQuery.refetch(),cosmicLinksQuery.refetch(),chronicleQuery.refetch()]);
  }
  async function removeSelected(){
    if(!deleteTarget)return;
    try{
      const csrf=requireCsrf();
      if(deleteTarget.kind==='deity')await deleteDeity({id:deleteTarget.id,csrf}).unwrap();
      else await deletePantheon({id:deleteTarget.id,csrf}).unwrap();
      setDeleteTarget(null);setSelectedDeityId(null);setSelectedPantheonId(null);setNotice('Запись удалена');
    }catch(error){setNotice(apiError(error));setDeleteTarget(null);}
  }

  const perform=async<T,>(promise:Promise<T>)=>{
    try{return await promise;}catch(error){throw Error(apiError(error));}
  };

  return <Box className="mythos-shell">
    <header className="mythos-header">
      <Box>
        <Typography className="mythos-eyebrow">WORLD ARCHIVE / METAPHYSICS</Typography>
        <Typography component="h1" className="mythos-title">Mythos</Typography>
        <Typography color="text.secondary" className="mythos-subtitle">
          Рабочее название · божества, связи, верования и устройство мироздания.
        </Typography>
      </Box>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" justifyContent="flex-end">
        {session.authenticated&&<Button variant="contained" onClick={()=>beginDeity()}>+ Божество</Button>}
        <Button variant="outlined" onClick={()=>session.authenticated?void logout():setLoginOpen(true)}>
          {session.authenticated?'Выйти':'Войти'}
        </Button>
      </Stack>
    </header>

    <Box className="mythos-metrics">
      <Box><Typography className="mythos-metric-value">{deities.length}</Typography><Typography variant="caption" color="text.secondary">Сущностей</Typography></Box>
      <Box><Typography className="mythos-metric-value">{relations.length}</Typography><Typography variant="caption" color="text.secondary">Связей</Typography></Box>
      <Box><Typography className="mythos-metric-value">{domainOptions.length}</Typography><Typography variant="caption" color="text.secondary">Доменов</Typography></Box>
      <Box><Typography className="mythos-metric-value">{myths.length}</Typography><Typography variant="caption" color="text.secondary">Мифов</Typography></Box>
    </Box>

    <Box className="mythos-viewbar">
      {([
        ['graph','Связи'],['table','Таблица'],['encyclopedia','Энциклопедия'],
        ['lore','Предания'],['cosmology','Космология'],['pantheons','Пантеоны'],
      ] as const).map(([id,label])=><Button key={id} size="small"
        variant={view===id?'contained':'outlined'} onClick={()=>setView(id)}>{label}</Button>)}
    </Box>

    {['graph','table','encyclopedia','pantheons'].includes(view)&&<Box className="mythos-toolbar">
      <Box className="mythos-filters">
        <TextField size="small" label="Поиск" value={query} onChange={event=>setQuery(event.target.value)}
          sx={{minWidth:190,flex:'2 1 250px'}}/>
        <FormControl size="small" sx={{minWidth:150,flex:'1 1 160px'}}><InputLabel>Мир</InputLabel>
          <Select label="Мир" value={worldFilter} onChange={event=>setWorldFilter(event.target.value)}>
            <MenuItem value="*">Все миры</MenuItem>{worlds.map(item=><MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
          </Select></FormControl>
        {view!=='pantheons'&&<>
          <FormControl size="small" sx={{minWidth:150,flex:'1 1 160px'}}><InputLabel>Пантеон</InputLabel>
            <Select label="Пантеон" value={pantheonFilter} onChange={event=>setPantheonFilter(event.target.value)}>
              <MenuItem value="*">Все пантеоны</MenuItem>{pantheons.map(item=><MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
            </Select></FormControl>
          <FormControl size="small" sx={{minWidth:145,flex:'1 1 155px'}}><InputLabel>Домен</InputLabel>
            <Select label="Домен" value={domainFilter} onChange={event=>setDomainFilter(event.target.value)}>
              <MenuItem value="*">Все домены</MenuItem>{domainOptions.map(item=><MenuItem key={item} value={item}>{item}</MenuItem>)}
            </Select></FormControl>
        </>}
      </Box>
    </Box>}

    {loading&&<Box className="mythos-status"><CircularProgress size={24}/><Typography>Открываем Mythos…</Typography></Box>}
    {failed&&<Alert severity="error" sx={{my:2}}>Часть Mythos не загрузилась. Проверь, применена ли новая миграция базы.</Alert>}

    {!loading&&view==='graph'&&<Box className="mythos-content">
      <Box className="mythos-history-filter">
        <Stack gap={1}>
          <Stack direction={{xs:'column',sm:'row'}} gap={1} alignItems={{sm:'center'}}>
            <Typography variant="caption" color="text.secondary">Историческое состояние графа:</Typography>
            {historyBounds&&historicalDay===null&&<Button size="small" variant="outlined"
              onClick={()=>setHistoricalDay(historyBounds.min)}>Включить снимок времени</Button>}
            {historicalDay!==null&&<>
              <TextField size="small" type="number" label="Абсолютный день" value={historicalDay}
                inputProps={historyBounds?{min:historyBounds.min,max:historyBounds.max}:undefined}
                onChange={e=>setHistoricalDay(Number(e.target.value))}/>
              <Chip size="small" label={formatChronicleDate(dayToChronicleDate(historicalDay))}/>
              <Button size="small" onClick={()=>setHistoricalDay(null)}>Все эпохи</Button>
            </>}
            {!historyBounds&&<Typography variant="caption" color="text.secondary">
              У связей пока нет дат — граф показывает все эпохи.
            </Typography>}
          </Stack>
          {historyBounds&&historicalDay!==null&&<Slider size="small"
            min={historyBounds.min} max={Math.max(historyBounds.min+1,historyBounds.max)}
            value={Math.max(historyBounds.min,Math.min(historyBounds.max,historicalDay))}
            onChange={(_event,value)=>setHistoricalDay(value as number)}
            valueLabelDisplay="auto"
            valueLabelFormat={value=>formatChronicleDate(dayToChronicleDate(value))}/>}
        </Stack>
      </Box>
      <MythosGraph deities={filteredDeities} relations={filteredRelations} pantheons={pantheons}
        admin={session.authenticated} historicalDay={historicalDay}
        onSelectDeity={d=>setSelectedDeityId(d.id)}
        onCreateDeityAt={beginDeityAt}
        onSavePosition={async(d,x,y)=>{
          if(!session.csrfToken)throw Error('Сначала войди как администратор.');
          const saved=await perform(updateDeityPosition({
            id:d.id,graphX:x,graphY:y,csrf:session.csrfToken,
          }).unwrap());
          dispatch(atlasApi.util.updateQueryData('mythosDeities',undefined,draft=>{
            const target=draft.find(item=>item.id===saved.id);
            if(target){target.graphX=saved.graphX;target.graphY=saved.graphY;}
          }));
        }}
        onCreateRelation={async input=>{await perform(createRelation({input,csrf:requireCsrf()}).unwrap());}}
        onUpdateRelation={async(id,input)=>{await perform(updateRelation({id,input,csrf:requireCsrf()}).unwrap());}}
        onDeleteRelation={async id=>{await perform(deleteRelation({id,csrf:requireCsrf()}).unwrap());}}/>
    </Box>}

    {!loading&&view==='table'&&<Box className="mythos-content">
      <Typography variant="body2" color="text.secondary" sx={{mb:2}}>
        Отфильтровано {filteredDeities.length} из {deities.length}. Матрица показывает покрытие доменов и дублирование ролей.
      </Typography>
      <MythosTable deities={filteredDeities} onSelect={d=>setSelectedDeityId(d.id)}/>
    </Box>}

    {!loading&&view==='encyclopedia'&&<Box className="mythos-content">
      <Box className="mythos-card-grid">
        {filteredDeities.map(item=><ButtonBase key={item.id} className="mythos-deity-card"
          onClick={()=>setSelectedDeityId(item.id)}>
          <Box className="mythos-deity-symbol" sx={{background:item.color+'24',borderColor:item.color}}>
            {item.symbol||'✧'}
          </Box>
          <Box className="mythos-card-body">
            <Typography className="mythos-card-title">{item.name}</Typography>
            <Typography className="mythos-card-epithet">{item.epithet||item.rank}</Typography>
            {item.summary&&<Typography className="mythos-card-summary">{item.summary}</Typography>}
            <Stack direction="row" flexWrap="wrap" gap={.7} sx={{mt:1.5}}>
              {item.domains.slice(0,5).map(domain=><Chip size="small" key={domain}
                label={(item.primaryDomains.some(p=>normalize(p)===normalize(domain))?'● ':'')+domain}
                sx={{borderColor:item.color+'77'}} variant="outlined"/>)}
            </Stack>
            <Typography className="mythos-card-meta">
              {item.pantheon?.name??'Без пантеона'} · {item.worlds.length?item.worlds.map(w=>w.name).join(', '):'Мультивселенная'}
            </Typography>
          </Box>
        </ButtonBase>)}
      </Box>
      {!filteredDeities.length&&<Empty text="По текущим фильтрам сущностей нет."/>}
    </Box>}

    {!loading&&view==='lore'&&<Box className="mythos-content">
      <MythosLore admin={session.authenticated} deities={deities} worlds={worlds} locations={locations}
        events={chronicleEvents} myths={myths} beliefs={beliefs} sites={sites} history={history}
        onCreateMyth={async input=>{await perform(createMyth({input,csrf:requireCsrf()}).unwrap());}}
        onUpdateMyth={async(id,input)=>{await perform(updateMyth({id,input,csrf:requireCsrf()}).unwrap());}}
        onDeleteMyth={async id=>{await perform(deleteMyth({id,csrf:requireCsrf()}).unwrap());}}
        onCreateBelief={async input=>{await perform(createBelief({input,csrf:requireCsrf()}).unwrap());}}
        onUpdateBelief={async(id,input)=>{await perform(updateBelief({id,input,csrf:requireCsrf()}).unwrap());}}
        onDeleteBelief={async id=>{await perform(deleteBelief({id,csrf:requireCsrf()}).unwrap());}}
        onCreateSite={async input=>{await perform(createSite({input,csrf:requireCsrf()}).unwrap());}}
        onUpdateSite={async(id,input)=>{await perform(updateSite({id,input,csrf:requireCsrf()}).unwrap());}}
        onDeleteSite={async id=>{await perform(deleteSite({id,csrf:requireCsrf()}).unwrap());}}
        onUpsertHistory={async input=>{await perform(upsertHistory({input,csrf:requireCsrf()}).unwrap());}}
        onDeleteHistory={async(deityId,eventId)=>{await perform(deleteHistory({deityId,eventId,csrf:requireCsrf()}).unwrap());}}/>
    </Box>}

    {!loading&&view==='cosmology'&&<Box className="mythos-content">
      <MythosCosmology nodes={cosmicNodes} links={cosmicLinks} worlds={worlds} admin={session.authenticated}
        onCreateNode={async input=>{await perform(createCosmicNode({input,csrf:requireCsrf()}).unwrap());}}
        onUpdateNode={async(id,input)=>{await perform(updateCosmicNode({id,input,csrf:requireCsrf()}).unwrap());}}
        onDeleteNode={async id=>{await perform(deleteCosmicNode({id,csrf:requireCsrf()}).unwrap());}}
        onCreateLink={async input=>{await perform(createCosmicLink({input,csrf:requireCsrf()}).unwrap());}}
        onUpdateLink={async(id,input)=>{await perform(updateCosmicLink({id,input,csrf:requireCsrf()}).unwrap());}}
        onDeleteLink={async id=>{await perform(deleteCosmicLink({id,csrf:requireCsrf()}).unwrap());}}/>
    </Box>}

    {!loading&&view==='pantheons'&&<Box className="mythos-content">
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:2}}>
        <Typography color="text.secondary">Пантеон — организационная группа; связи между богами хранятся отдельно.</Typography>
        {session.authenticated&&<Button variant="contained" onClick={()=>beginPantheon()}>+ Пантеон</Button>}
      </Stack>
      <Box className="mythos-card-grid">
        {filteredPantheons.map(item=><ButtonBase key={item.id} className="mythos-pantheon-card"
          onClick={()=>setSelectedPantheonId(item.id)}>
          <Typography className="mythos-pantheon-rune">✦</Typography>
          <Typography className="mythos-card-title">{item.name}</Typography>
          <Typography color="text.secondary" variant="body2">
            {item.worldId?worlds.find(world=>world.id===item.worldId)?.name??'Мир':'Мультивселенная'}
          </Typography>
          <Typography className="mythos-pantheon-excerpt">{item.description||'История ещё не написана.'}</Typography>
          <Typography className="mythos-card-meta">
            {deities.filter(deity=>deity.pantheonId===item.id).length} сущностей
            {session.authenticated?' · '+visibilityLabel(item.visibility):''}
          </Typography>
        </ButtonBase>)}
      </Box>
    </Box>}

    <Drawer anchor="right" open={Boolean(selectedDeity)} onClose={()=>setSelectedDeityId(null)}
      PaperProps={{className:'mythos-detail-drawer'}}>
      {selectedDeity&&<DeityDetail deity={selectedDeity}
        relations={relations.filter(r=>r.sourceId===selectedDeity.id||r.targetId===selectedDeity.id)}
        deities={deities} myths={myths.filter(m=>m.participants.some(p=>p.deityId===selectedDeity.id))}
        beliefs={beliefs.filter(b=>b.deityId===selectedDeity.id)}
        sites={sites.filter(s=>s.deityId===selectedDeity.id)}
        history={history.filter(h=>h.deityId===selectedDeity.id)}
        admin={session.authenticated} onEdit={()=>beginDeity(selectedDeity)}
        onDelete={()=>setDeleteTarget({kind:'deity',id:selectedDeity.id})}/>}
    </Drawer>

    <Drawer anchor="right" open={Boolean(selectedPantheon)} onClose={()=>setSelectedPantheonId(null)}
      PaperProps={{className:'mythos-detail-drawer'}}>
      {selectedPantheon&&<Box className="mythos-detail">
        <Typography className="mythos-eyebrow">MYTHOS / ПАНТЕОН</Typography>
        <Typography className="mythos-detail-symbol">✦</Typography>
        <Typography component="h2" className="mythos-detail-title">{selectedPantheon.name}</Typography>
        <Typography color="text.secondary">{selectedPantheon.worldId
          ?worlds.find(w=>w.id===selectedPantheon.worldId)?.name??'Мир':'Мультивселенная'}</Typography>
        <Box className="mythos-detail-section"><Typography className="mythos-detail-label">ПРЕДАНИЕ</Typography>
          <Typography sx={{whiteSpace:'pre-wrap',lineHeight:1.75}}>{selectedPantheon.description||'История пока не написана.'}</Typography>
        </Box>
        <Box className="mythos-detail-section"><Typography className="mythos-detail-label">СУЩНОСТИ</Typography>
          <Stack gap={1}>{deities.filter(d=>d.pantheonId===selectedPantheon.id).map(d=><Button key={d.id}
            variant="outlined" onClick={()=>{setSelectedPantheonId(null);setSelectedDeityId(d.id);}}>{d.symbol||'✧'} {d.name}</Button>)}</Stack>
        </Box>
        {session.authenticated&&<Stack direction="row" gap={1} sx={{mt:'auto',pt:3}}>
          <Button variant="contained" onClick={()=>beginPantheon(selectedPantheon)}>Редактировать</Button>
          <Button color="error" variant="outlined" onClick={()=>setDeleteTarget({kind:'pantheon',id:selectedPantheon.id})}>Удалить</Button>
        </Stack>}
      </Box>}
    </Drawer>

    <DeityEditorDialog open={Boolean(deityDraft)} editing={Boolean(deityEditingId)} draft={deityDraft}
      onChange={setDeityDraft} onClose={()=>setDeityDraft(null)} onSave={()=>void saveDeity()}
      busy={creatingDeity||updatingDeity} error={editorError} worlds={worlds} pantheons={pantheons}
      domainSuggestions={domainOptions}/>
    <PantheonEditorDialog open={Boolean(pantheonDraft)} editing={Boolean(pantheonEditingId)}
      draft={pantheonDraft} onChange={setPantheonDraft} onClose={()=>setPantheonDraft(null)}
      onSave={()=>void savePantheon()} busy={creatingPantheon||updatingPantheon} error={editorError} worlds={worlds}/>

    <Dialog open={Boolean(deleteTarget)} onClose={()=>setDeleteTarget(null)} fullWidth maxWidth="xs">
      <DialogTitle>Удалить запись?</DialogTitle><DialogContent>
        <Typography>Перед удалением сервер создаст резервную копию базы.</Typography>
      </DialogContent><DialogActions>
        <Button onClick={()=>setDeleteTarget(null)}>Отмена</Button>
        <Button color="error" variant="contained" disabled={deletingDeity||deletingPantheon}
          onClick={()=>void removeSelected()}>Удалить</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={loginOpen} onClose={()=>setLoginOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Вход администратора</DialogTitle><DialogContent>
        {loginError&&<Alert severity="error" sx={{mb:2}}>{loginError}</Alert>}
        <TextField autoFocus fullWidth type="password" label="Пароль" value={password}
          onChange={event=>setPassword(event.target.value)}
          onKeyDown={event=>{if(event.key==='Enter')void login();}}/>
      </DialogContent><DialogActions>
        <Button onClick={()=>setLoginOpen(false)}>Отмена</Button>
        <Button variant="contained" onClick={()=>void login()}>Войти</Button>
      </DialogActions>
    </Dialog>

    {notice&&<Box className="mythos-notice" role="status" onClick={()=>setNotice('')}>{notice}</Box>}
  </Box>;
}

function DeityDetail({deity,relations,deities,myths,beliefs,sites,history,admin,onEdit,onDelete}:{
  deity:MythosDeityRecord;
  relations:{id:string;sourceId:string;targetId:string;type:string;label:string;description:string}[];
  deities:MythosDeityRecord[];myths:{id:string;title:string;participants:{deityId:string}[]}[];
  beliefs:{id:string;culture:string;publicName:string;doctrine:string}[];
  sites:{id:string;name:string;location:{name:string;worldName:string}|null}[];
  history:{deityId:string;eventId:string;role:string;event:{title:string;startDay:number|null}}[];
  admin:boolean;onEdit:()=>void;onDelete:()=>void;
}){
  return <Box className="mythos-detail">
    <Typography className="mythos-eyebrow">MYTHOS / СУЩНОСТЬ</Typography>
    <Box className="mythos-detail-symbol" sx={{color:deity.color}}>{deity.symbol||'✧'}</Box>
    <Typography component="h2" className="mythos-detail-title">{deity.name}</Typography>
    <Typography color="text.secondary">{deity.epithet||deity.rank}</Typography>
    <Stack direction="row" flexWrap="wrap" gap={.7} sx={{mt:2}}>
      <Chip size="small" label={deity.rank}/>
      <Chip size="small" variant="outlined" label={(deity.power||'Сила не описана')+' · '+deity.influence+'/100'}/>
      {deity.domains.map(domain=><Chip key={domain} size="small"
        variant={deity.primaryDomains.some(p=>normalize(p)===normalize(domain))?'filled':'outlined'}
        label={(deity.primaryDomains.some(p=>normalize(p)===normalize(domain))?'● ':'')+domain}/>)}
    </Stack>
    {deity.summary&&<DetailSection label="СУТЬ"><Typography sx={{whiteSpace:'pre-wrap'}}>{deity.summary}</Typography></DetailSection>}
    <DetailSection label="ОБЪЕКТИВНОЕ ПРЕДАНИЕ">
      <Typography sx={{whiteSpace:'pre-wrap',lineHeight:1.75}}>{deity.description||'Предание пока не написано.'}</Typography>
    </DetailSection>
    <DetailSection label={'СВЯЗИ · '+relations.length}>
      <Stack gap={.8}>{relations.map(r=>{
        const other=deities.find(d=>d.id===(r.sourceId===deity.id?r.targetId:r.sourceId));
        return <Box key={r.id} className="mythos-mini-row"><strong>{r.sourceId===deity.id?'→':'←'} {other?.name??'?'}</strong>
          <span>{r.label||r.type}</span>{r.description&&<small>{r.description}</small>}</Box>;
      })}{!relations.length&&<Typography color="text.secondary" variant="body2">Связей пока нет.</Typography>}</Stack>
    </DetailSection>
    <DetailSection label={'МИФЫ · '+myths.length}>
      {myths.map(m=><Chip key={m.id} label={m.title} size="small" sx={{mr:.6,mb:.6}}/>)}
      {!myths.length&&<Typography color="text.secondary" variant="body2">Не участвует в записанных мифах.</Typography>}
    </DetailSection>
    <DetailSection label={'ВЕРОВАНИЯ · '+beliefs.length}>
      {beliefs.map(b=><Box key={b.id} className="mythos-mini-row"><strong>{b.culture}: {b.publicName}</strong><small>{b.doctrine}</small></Box>)}
      {!beliefs.length&&<Typography color="text.secondary" variant="body2">Культурных интерпретаций пока нет.</Typography>}
    </DetailSection>
    <DetailSection label={'СВЯТЫНИ · '+sites.length}>
      {sites.map(s=><Box key={s.id} className="mythos-mini-row"><strong>{s.name}</strong>
        <span>{s.location?s.location.worldName+' · '+s.location.name:''}</span></Box>)}
      {!sites.length&&<Typography color="text.secondary" variant="body2">Нет привязанных мест Atlas.</Typography>}
    </DetailSection>
    <DetailSection label={'ИСТОРИЯ · '+history.length}>
      {[...history].sort((a,b)=>(a.event.startDay??Infinity)-(b.event.startDay??Infinity)).map(h=><Box key={h.eventId} className="mythos-mini-row">
        <strong>{h.event.title}</strong><span>{h.event.startDay===null?'Дата неизвестна':formatChronicleDate(dayToChronicleDate(h.event.startDay))}{h.role?' · '+h.role:''}</span>
      </Box>)}
      {!history.length&&<Typography color="text.secondary" variant="body2">Нет связей с Chronicle.</Typography>}
    </DetailSection>
    {admin&&<Stack direction="row" gap={1} sx={{mt:'auto',pt:3}}>
      <Button variant="contained" onClick={onEdit}>Редактировать</Button>
      <Button color="error" variant="outlined" onClick={onDelete}>Удалить</Button>
    </Stack>}
  </Box>;
}
function DetailSection({label,children}:{label:string;children:ReactNode}){
  return <Box className="mythos-detail-section"><Typography className="mythos-detail-label">{label}</Typography>{children}</Box>;
}
function Empty({text}:{text:string}){
  return <Box className="mythos-empty"><Typography color="text.secondary">{text}</Typography></Box>;
}
