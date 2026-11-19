import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Drawer, FormControl, InputLabel,
  MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type { MythosDeityRecord, MythosPantheonRecord, MythosDeityInput,
  MythosPantheonInput } from '@atlas/shared';
import {
  useWorldsQuery, useMythosDeitiesQuery, useMythosPantheonsQuery,
  useCreateMythosDeityMutation, useUpdateMythosDeityMutation, useDeleteMythosDeityMutation,
  useCreateMythosPantheonMutation, useUpdateMythosPantheonMutation,
  useDeleteMythosPantheonMutation,
} from '../atlas/api';
import {
  DeityEditorDialog, PantheonEditorDialog, defaultDeityDraft, defaultPantheonDraft,
  deityRecordToDraft, deityDraftToInput, type DeityDraft,
} from './MythosEditor';
import './mythos.css';

type Session={authenticated:boolean;csrfToken?:string};
type Selection={kind:'deity'|'pantheon';id:string};
const visibilityLabel=(value:string)=>value==='public'?'Публично':value==='draft'?'Черновик':'Мастер';
const normalize=(value:string)=>value.trim().toLocaleLowerCase('ru');
function errorMessage(error:unknown){
  const payload=error as {data?:{error?:{message?:string}}};
  return payload.data?.error?.message??'Не удалось выполнить действие. Проверь подключение и повтори.';
}

export function MythosPage(){
  const worldsQuery=useWorldsQuery();
  const pantheonsQuery=useMythosPantheonsQuery();
  const deitiesQuery=useMythosDeitiesQuery();
  const worlds=worldsQuery.currentData??[];
  const pantheons=pantheonsQuery.currentData??[];
  const deities=deitiesQuery.currentData??[];
  const [createDeity,{isLoading:creatingDeity}]=useCreateMythosDeityMutation();
  const [updateDeity,{isLoading:updatingDeity}]=useUpdateMythosDeityMutation();
  const [deleteDeity,{isLoading:deletingDeity}]=useDeleteMythosDeityMutation();
  const [createPantheon,{isLoading:creatingPantheon}]=useCreateMythosPantheonMutation();
  const [updatePantheon,{isLoading:updatingPantheon}]=useUpdateMythosPantheonMutation();
  const [deletePantheon,{isLoading:deletingPantheon}]=useDeleteMythosPantheonMutation();

  const [session,setSession]=useState<Session>({authenticated:false});
  const [tab,setTab]=useState<'deities'|'pantheons'>('deities');
  const [query,setQuery]=useState('');
  const [worldFilter,setWorldFilter]=useState('*');
  const [pantheonFilter,setPantheonFilter]=useState('*');
  const [domainFilter,setDomainFilter]=useState('*');
  const [selection,setSelection]=useState<Selection|null>(null);
  const [deityDraft,setDeityDraft]=useState<DeityDraft|null>(null);
  const [deityEditingId,setDeityEditingId]=useState<string|null>(null);
  const [pantheonDraft,setPantheonDraft]=useState<MythosPantheonInput|null>(null);
  const [pantheonEditingId,setPantheonEditingId]=useState<string|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<Selection|null>(null);
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
    if(worldFilter!=='*'&&deity.worlds.length&&
      !deity.worlds.some(world=>world.id===worldFilter))return false;
    if(pantheonFilter!=='*'&&deity.pantheonId!==pantheonFilter)return false;
    if(domainFilter!=='*'&&!deity.domains.some(domain=>normalize(domain)===normalize(domainFilter)))return false;
    const q=normalize(query);
    return !q||normalize([
      deity.name,deity.epithet,deity.summary,deity.description,deity.rank,
      deity.pantheon?.name??'',...deity.domains,...deity.worlds.map(world=>world.name),
    ].join(' ')).includes(q);
  }),[deities,worldFilter,pantheonFilter,domainFilter,query]);
  const filteredPantheons=useMemo(()=>pantheons.filter(item=>{
    if(worldFilter!=='*'&&item.worldId&&item.worldId!==worldFilter)return false;
    const q=normalize(query);
    return !q||normalize(item.name+' '+item.description).includes(q);
  }),[pantheons,worldFilter,query]);

  const selectedDeity=selection?.kind==='deity'
    ?deities.find(item=>item.id===selection.id)??null:null;
  const selectedPantheon=selection?.kind==='pantheon'
    ?pantheons.find(item=>item.id===selection.id)??null:null;
  const deleteName=deleteTarget?.kind==='deity'
    ?deities.find(item=>item.id===deleteTarget.id)?.name
    :pantheons.find(item=>item.id===deleteTarget?.id)?.name;

  function beginDeity(item?:MythosDeityRecord){
    setEditorError('');
    setDeityEditingId(item?.id??null);
    setDeityDraft(item?deityRecordToDraft(item):defaultDeityDraft(worldFilter==='*'?null:worldFilter));
  }
  function beginPantheon(item?:MythosPantheonRecord){
    setEditorError('');
    setPantheonEditingId(item?.id??null);
    setPantheonDraft(item?{
      name:item.name,description:item.description,visibility:item.visibility,worldId:item.worldId,
    }:defaultPantheonDraft(worldFilter==='*'?null:worldFilter));
  }
  async function saveDeity(){
    if(!deityDraft||!session.csrfToken)return;
    setEditorError('');
    const input:MythosDeityInput=deityDraftToInput(deityDraft);
    try{
      const saved=deityEditingId
        ?await updateDeity({id:deityEditingId,input,csrf:session.csrfToken}).unwrap()
        :await createDeity({input,csrf:session.csrfToken}).unwrap();
      setDeityDraft(null);
      setDeityEditingId(null);
      setSelection({kind:'deity',id:saved.id});
      setNotice('Божество сохранено');
    }catch(error){setEditorError(errorMessage(error));}
  }
  async function savePantheon(){
    if(!pantheonDraft||!session.csrfToken)return;
    setEditorError('');
    try{
      const saved=pantheonEditingId
        ?await updatePantheon({id:pantheonEditingId,input:pantheonDraft,csrf:session.csrfToken}).unwrap()
        :await createPantheon({input:pantheonDraft,csrf:session.csrfToken}).unwrap();
      setPantheonDraft(null);
      setPantheonEditingId(null);
      setSelection({kind:'pantheon',id:saved.id});
      setNotice('Пантеон сохранён');
    }catch(error){setEditorError(errorMessage(error));}
  }
  async function confirmDelete(){
    if(!deleteTarget||!session.csrfToken)return;
    const target=deleteTarget;
    try{
      if(target.kind==='deity')await deleteDeity({id:target.id,csrf:session.csrfToken}).unwrap();
      else await deletePantheon({id:target.id,csrf:session.csrfToken}).unwrap();
      setDeleteTarget(null);
      setSelection(null);
      setNotice(target.kind==='deity'?'Божество удалено':'Пантеон удалён');
    }catch(error){setDeleteTarget(null);setNotice(errorMessage(error));}
  }
  async function login(){
    setLoginError('');
    try{
      const response=await fetch('/api/auth/login',{
        method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',
        body:JSON.stringify({password}),
      });
      const data=await response.json() as Session&{error?:{message?:string}};
      if(!response.ok)throw Error(data.error?.message??'Не удалось войти');
      setSession(data);setPassword('');setLoginOpen(false);
      await Promise.all([deitiesQuery.refetch(),pantheonsQuery.refetch()]);
    }catch(error){setLoginError(error instanceof Error?error.message:String(error));}
  }
  async function logout(){
    if(!session.csrfToken)return;
    try{
      await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',
        headers:{'x-csrf-token':session.csrfToken}});
      setSession({authenticated:false});
      setSelection(null);
      await Promise.all([deitiesQuery.refetch(),pantheonsQuery.refetch()]);
    }catch{setNotice('Не удалось выйти из учётной записи');}
  }

  return <Box className="mythos-shell">
    <header className="mythos-header">
      <Box>
        <Typography className="mythos-eyebrow">WORLD ARCHIVE / DIVINITY</Typography>
        <Typography component="h1" className="mythos-title">Mythos</Typography>
        <Typography color="text.secondary" className="mythos-subtitle">
          Боги, пантеоны, домены и мифология твоих миров.
        </Typography>
      </Box>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" justifyContent="flex-end">
        {session.authenticated&&<Button variant="contained"
          onClick={()=>tab==='deities'?beginDeity():beginPantheon()}>
          + {tab==='deities'?'Божество':'Пантеон'}
        </Button>}
        <Button variant="outlined" onClick={()=>session.authenticated?void logout():setLoginOpen(true)}>
          {session.authenticated?'Выйти':'Войти'}
        </Button>
      </Stack>
    </header>

    <Box className="mythos-metrics">
      <Box><Typography className="mythos-metric-value">{deities.length}</Typography>
        <Typography variant="caption" color="text.secondary">Божеств</Typography></Box>
      <Box><Typography className="mythos-metric-value">{pantheons.length}</Typography>
        <Typography variant="caption" color="text.secondary">Пантеонов</Typography></Box>
      <Box><Typography className="mythos-metric-value">{domainOptions.length}</Typography>
        <Typography variant="caption" color="text.secondary">Уникальных доменов</Typography></Box>
    </Box>

    <Box className="mythos-toolbar">
      <Stack direction="row" gap={1}>
        <Button variant={tab==='deities'?'contained':'outlined'}
          onClick={()=>setTab('deities')}>Божества</Button>
        <Button variant={tab==='pantheons'?'contained':'outlined'}
          onClick={()=>setTab('pantheons')}>Пантеоны</Button>
      </Stack>
      <Box className="mythos-filters">
        <TextField size="small" label="Поиск по мифологии" value={query}
          onChange={event=>setQuery(event.target.value)}
          sx={{minWidth:180,flex:'2 1 220px'}}/>
        <FormControl size="small" sx={{minWidth:150,flex:'1 1 160px'}}>
          <InputLabel>Мир</InputLabel>
          <Select label="Мир" value={worldFilter} onChange={event=>setWorldFilter(event.target.value)}>
            <MenuItem value="*">Все миры</MenuItem>
            {worlds.map(item=><MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
          </Select>
        </FormControl>
        {tab==='deities'&&<>
          <FormControl size="small" sx={{minWidth:145,flex:'1 1 150px'}}>
            <InputLabel>Пантеон</InputLabel>
            <Select label="Пантеон" value={pantheonFilter}
              onChange={event=>setPantheonFilter(event.target.value)}>
              <MenuItem value="*">Все пантеоны</MenuItem>
              {pantheons.map(item=><MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{minWidth:140,flex:'1 1 145px'}}>
            <InputLabel>Домен</InputLabel>
            <Select label="Домен" value={domainFilter}
              onChange={event=>setDomainFilter(event.target.value)}>
              <MenuItem value="*">Все домены</MenuItem>
              {domainOptions.map(item=><MenuItem key={item} value={item}>{item}</MenuItem>)}
            </Select>
          </FormControl>
        </>}
      </Box>
    </Box>

    {(deitiesQuery.isLoading||pantheonsQuery.isLoading)&&<Box className="mythos-status">
      <CircularProgress size={24}/><Typography>Открываем архив…</Typography>
    </Box>}
    {(deitiesQuery.isError||pantheonsQuery.isError||worldsQuery.isError)&&
      <Alert severity="error" sx={{my:2}}>Не удалось загрузить Mythos. Проверь, выполнена ли миграция базы.</Alert>}

    {tab==='deities'&&<Box className="mythos-content">
      <Typography color="text.secondary" variant="body2">
        Показано {filteredDeities.length} из {deities.length}. Нажми на карточку, чтобы прочитать предание.
      </Typography>
      <Box className="mythos-card-grid">
        {filteredDeities.map(item=><ButtonBase key={item.id} className="mythos-deity-card"
          onClick={()=>setSelection({kind:'deity',id:item.id})}>
          <Box className="mythos-deity-symbol" sx={{background:item.color+'24',borderColor:item.color}}>
            {item.symbol||'✧'}
          </Box>
          <Box className="mythos-card-body">
            <Typography className="mythos-card-title">{item.name}</Typography>
            <Typography className="mythos-card-epithet">{item.epithet||item.rank}</Typography>
            {item.summary&&<Typography className="mythos-card-summary">{item.summary}</Typography>}
            <Stack direction="row" flexWrap="wrap" gap={.7} sx={{mt:1.5}}>
              {item.domains.slice(0,4).map(domain=><Chip size="small" key={domain}
                label={domain} sx={{borderColor:item.color+'77'}} variant="outlined"/>)}
              {item.domains.length>4&&<Chip size="small" label={'+'+(item.domains.length-4)}/>}
            </Stack>
            <Typography className="mythos-card-meta">
              {item.pantheon?.name??'Без пантеона'} · {item.worlds.length
                ?item.worlds.map(world=>world.name).join(', '):'Мультивселенная'}
              {session.authenticated?' · '+visibilityLabel(item.visibility):''}
            </Typography>
          </Box>
        </ButtonBase>)}
      </Box>
      {!deitiesQuery.isLoading&&!filteredDeities.length&&<Box className="mythos-empty">
        <Typography className="mythos-empty-icon">✧</Typography>
        <Typography variant="h6">Божеств не найдено</Typography>
        <Typography color="text.secondary">Сними фильтры или начни создавать историю своего пантеона.</Typography>
        {session.authenticated&&<Button onClick={()=>beginDeity()} variant="outlined">+ Создать божество</Button>}
      </Box>}
    </Box>}

    {tab==='pantheons'&&<Box className="mythos-content">
      <Typography color="text.secondary" variant="body2">
        Пантеоны группируют божеств, но не ограничивают их связь с другими мирами.
      </Typography>
      <Box className="mythos-card-grid">
        {filteredPantheons.map(item=><ButtonBase key={item.id} className="mythos-pantheon-card"
          onClick={()=>setSelection({kind:'pantheon',id:item.id})}>
          <Typography className="mythos-pantheon-rune">✦</Typography>
          <Typography className="mythos-card-title">{item.name}</Typography>
          <Typography color="text.secondary" variant="body2">
            {item.worldId?worlds.find(world=>world.id===item.worldId)?.name??'Мир':'Мультивселенная'}
          </Typography>
          <Typography className="mythos-pantheon-excerpt">{item.description||'История ещё не написана.'}</Typography>
          <Typography className="mythos-card-meta">
            {deities.filter(deity=>deity.pantheonId===item.id).length} божеств
            {session.authenticated?' · '+visibilityLabel(item.visibility):''}
          </Typography>
        </ButtonBase>)}
      </Box>
      {!pantheonsQuery.isLoading&&!filteredPantheons.length&&<Box className="mythos-empty">
        <Typography className="mythos-empty-icon">✦</Typography>
        <Typography variant="h6">Пантеонов не найдено</Typography>
        <Typography color="text.secondary">Создай первый пантеон или измени фильтры.</Typography>
        {session.authenticated&&<Button variant="outlined" onClick={()=>beginPantheon()}>
          + Создать пантеон
        </Button>}
      </Box>}
    </Box>}

    <Drawer anchor="right" open={Boolean(selectedDeity||selectedPantheon)}
      onClose={()=>setSelection(null)} PaperProps={{className:'mythos-detail-drawer'}}>
      {selectedDeity&&<Box className="mythos-detail">
        <Typography className="mythos-eyebrow">MYTHOS / БОЖЕСТВО</Typography>
        <Box className="mythos-detail-symbol" sx={{color:selectedDeity.color}}>
          {selectedDeity.symbol||'✧'}
        </Box>
        <Typography component="h2" className="mythos-detail-title">{selectedDeity.name}</Typography>
        <Typography color="text.secondary">{selectedDeity.epithet||selectedDeity.rank}</Typography>
        <Stack direction="row" flexWrap="wrap" gap={.7} sx={{mt:2}}>
          <Chip size="small" label={selectedDeity.rank}/>
          {selectedDeity.domains.map(domain=><Chip key={domain} size="small" variant="outlined" label={domain}/>)}
        </Stack>
        <Box className="mythos-detail-section">
          <Typography className="mythos-detail-label">ПАНТЕОН И МИРЫ</Typography>
          <Typography>{selectedDeity.pantheon?.name??'Вне пантеона'}</Typography>
          <Typography color="text.secondary" variant="body2">
            {selectedDeity.worlds.length?selectedDeity.worlds.map(world=>world.name).join(', '):'Мультивселенная'}
          </Typography>
        </Box>
        {selectedDeity.summary&&<Box className="mythos-detail-section">
          <Typography className="mythos-detail-label">СУТЬ</Typography>
          <Typography sx={{whiteSpace:'pre-wrap'}}>{selectedDeity.summary}</Typography>
        </Box>}
        <Box className="mythos-detail-section">
          <Typography className="mythos-detail-label">ПРЕДАНИЕ</Typography>
          <Typography sx={{whiteSpace:'pre-wrap',lineHeight:1.75}}>
            {selectedDeity.description||'Предание пока не написано.'}
          </Typography>
        </Box>
        {session.authenticated&&<Stack direction="row" gap={1} sx={{mt:'auto',pt:3}}>
          <Button variant="contained" onClick={()=>beginDeity(selectedDeity)}>Редактировать</Button>
          <Button color="error" variant="outlined"
            onClick={()=>setDeleteTarget({kind:'deity',id:selectedDeity.id})}>Удалить</Button>
        </Stack>}
      </Box>}
      {selectedPantheon&&<Box className="mythos-detail">
        <Typography className="mythos-eyebrow">MYTHOS / ПАНТЕОН</Typography>
        <Typography className="mythos-detail-symbol">✦</Typography>
        <Typography component="h2" className="mythos-detail-title">{selectedPantheon.name}</Typography>
        <Typography color="text.secondary">{selectedPantheon.worldId
          ?worlds.find(world=>world.id===selectedPantheon.worldId)?.name??'Мир'
          :'Мультивселенная'}</Typography>
        <Box className="mythos-detail-section">
          <Typography className="mythos-detail-label">ПРЕДАНИЕ</Typography>
          <Typography sx={{whiteSpace:'pre-wrap',lineHeight:1.75}}>
            {selectedPantheon.description||'История пантеона пока не написана.'}
          </Typography>
        </Box>
        <Box className="mythos-detail-section">
          <Typography className="mythos-detail-label">БОЖЕСТВА ПАНТЕОНА</Typography>
          <Stack gap={1}>
            {deities.filter(deity=>deity.pantheonId===selectedPantheon.id)
              .map(deity=><Button key={deity.id} variant="outlined" size="small" fullWidth
                onClick={()=>setSelection({kind:'deity',id:deity.id})}>
                {deity.symbol||'✧'} {deity.name}
              </Button>)}
            {!deities.some(deity=>deity.pantheonId===selectedPantheon.id)&&
              <Typography color="text.secondary" variant="body2">Пока никого нет.</Typography>}
          </Stack>
        </Box>
        {session.authenticated&&<Stack direction="row" gap={1} sx={{mt:'auto',pt:3}}>
          <Button variant="contained" onClick={()=>beginPantheon(selectedPantheon)}>Редактировать</Button>
          <Button color="error" variant="outlined"
            onClick={()=>setDeleteTarget({kind:'pantheon',id:selectedPantheon.id})}>Удалить</Button>
        </Stack>}
      </Box>}
    </Drawer>

    <DeityEditorDialog open={Boolean(deityDraft)} editing={Boolean(deityEditingId)}
      draft={deityDraft} onChange={setDeityDraft} onClose={()=>setDeityDraft(null)}
      onSave={()=>void saveDeity()} busy={creatingDeity||updatingDeity} error={editorError}
      worlds={worlds} pantheons={pantheons} domainSuggestions={domainOptions}/>
    <PantheonEditorDialog open={Boolean(pantheonDraft)} editing={Boolean(pantheonEditingId)}
      draft={pantheonDraft} onChange={setPantheonDraft} onClose={()=>setPantheonDraft(null)}
      onSave={()=>void savePantheon()} busy={creatingPantheon||updatingPantheon} error={editorError}
      worlds={worlds}/>

    <Dialog open={Boolean(deleteTarget)} onClose={()=>setDeleteTarget(null)} fullWidth maxWidth="xs">
      <DialogTitle>Удалить запись?</DialogTitle>
      <DialogContent>
        <Typography>«{deleteName}» будет удалено. Перед этим автоматически создастся резервная копия.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>setDeleteTarget(null)}>Отмена</Button>
        <Button color="error" variant="contained" onClick={()=>void confirmDelete()}
          disabled={deletingDeity||deletingPantheon}>Удалить</Button>
      </DialogActions>
    </Dialog>

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

    {notice&&<Box className="mythos-notice" role="status" onClick={()=>setNotice('')}>{notice}</Box>}
  </Box>;
}
