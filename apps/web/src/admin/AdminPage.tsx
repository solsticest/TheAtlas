import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControl,
  FormControlLabel, InputLabel, List, ListItemButton, ListItemText,
  MenuItem, Paper, Select, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useLayersQuery, useLocationsQuery, useMarkerTypesQuery, useWorldsQuery } from '../atlas/api';
import { MapPointPicker } from '../atlas/MapPointPicker';

type Kind = 'world'|'type'|'layer'|'location'|'timeline'|'era'|'event';
type Row = Record<string,unknown> & {id:string};
type Field={key:string; label:string; type?:'text'|'number'|'integer'|'flag'|'tags'|'textarea'|'select'; createOnly?:boolean; nullable?:boolean};
type Session={authenticated:boolean;csrfToken?:string};
type AtlasError={error?:{code?:string;message?:string}};
const kinds:Kind[]=['world','type','layer','location','timeline','era','event'];
const titles:Record<Kind,string>={
  world:'Миры',type:'Типы',layer:'Карты',location:'Локации',
  timeline:'Таймлайны',era:'Эпохи',event:'События',
};
const fields:Record<Kind,Field[]>={
  world:[
    {key:'name',label:'Название мира'},
    {key:'width',label:'Ширина изображения (px)',type:'integer'},
    {key:'height',label:'Высота изображения (px)',type:'integer'},
    {key:'image',label:'Имя файла карты',nullable:true},
    {key:'kmPerPixel',label:'Километров на пиксель',type:'number',nullable:true},
  ],
  type:[{key:'name',label:'Название'},{key:'symbol',label:'Символ (эмодзи)'}],
  layer:[
    {key:'name',label:'Название слоя'},
    {key:'parentId',label:'Родительская карта',type:'select',nullable:true},
    {key:'image',label:'Имя файла изображения',nullable:true},
    {key:'width',label:'Ширина исходного файла',type:'integer'},
    {key:'height',label:'Высота исходного файла',type:'integer'},
    {key:'x1',label:'Bounds: x1 (родитель)',type:'number'},
    {key:'y1',label:'Bounds: y1 (родитель)',type:'number'},
    {key:'x2',label:'Bounds: x2 (родитель)',type:'number'},
    {key:'y2',label:'Bounds: y2 (родитель)',type:'number'},
    {key:'rotation',label:'Поворот (градусы)',type:'number'},
    {key:'showAtZoom',label:'Порог появления',type:'number'},
    {key:'fadeRange',label:'Диапазон затухания',type:'number'},
    {key:'enabled',label:'Слой виден',type:'flag'},
  ],
  location:[
    {key:'name',label:'Название локации'},
    {key:'type',label:'Тип маркера',type:'select'},
    {key:'x',label:'Координата X в мире',type:'number'},
    {key:'y',label:'Координата Y в мире',type:'number'},
    {key:'color',label:'Цвет (#RRGGBB)'},
    {key:'minZoom',label:'Минимальный масштаб',type:'number'},
    {key:'description',label:'Краткое описание',type:'textarea'},
    {key:'article',label:'HTML-статья',type:'textarea'},
    {key:'tags',label:'Теги (через запятую)',type:'tags'},
  ],
  timeline:[
    {key:'name',label:'Название таймлайна'},
    {key:'description',label:'Описание',type:'textarea'},
    {key:'sortOrder',label:'Порядок',type:'integer'},
    {key:'isDefault',label:'Основной таймлайн мира',type:'flag'},
    {key:'status',label:'Публикация',type:'select'},
  ],
  era:[
    {key:'name',label:'Название эпохи'},
    {key:'dateLabel',label:'Подпись даты / периода'},
    {key:'description',label:'Описание',type:'textarea'},
    {key:'sortOrder',label:'Порядок',type:'integer'},
    {key:'image',label:'Имя файла иллюстрации',nullable:true},
  ],
  event:[
    {key:'title',label:'Название события'},
    {key:'dateLabel',label:'Дата / подпись'},
    {key:'summary',label:'Краткое описание',type:'textarea'},
    {key:'article',label:'Статья (HTML)',type:'textarea'},
    {key:'type',label:'Категория'},
    {key:'tags',label:'Теги через запятую',type:'tags'},
    {key:'sortOrder',label:'Порядок',type:'integer'},
    {key:'locationId',label:'Связь с локацией',type:'select',nullable:true},
    {key:'x',label:'Координата X (необязательно)',type:'number',nullable:true},
    {key:'y',label:'Координата Y (необязательно)',type:'number',nullable:true},
    {key:'image',label:'Имя файла иллюстрации',nullable:true},
    {key:'status',label:'Публикация',type:'select'},
  ],
};
const defaults:Record<Kind,Record<string,unknown>>={
  world:{name:'',width:1600,height:1000,image:null,kmPerPixel:null},
  type:{name:'',symbol:'◆'},
  layer:{name:'',parentId:null,image:null,width:1000,height:1000,
    x1:100,y1:100,x2:500,y2:500,rotation:0,showAtZoom:0,fadeRange:0.75,enabled:true},
  location:{name:'',type:'city',x:0,y:0,color:'#d6b77a',minZoom:-6,description:'',article:'',tags:[]},
  timeline:{name:'',description:'',sortOrder:0,isDefault:false,status:'draft'},
  era:{name:'',description:'',dateLabel:'',sortOrder:0,image:null},
  event:{title:'',summary:'',article:'',type:'',tags:[],sortOrder:0,
    dateLabel:'',locationId:null,x:null,y:null,image:null,status:'draft'},
};
function asRows(data:unknown):Row[]{
  return Array.isArray(data)?data.filter((entry):entry is Row=>
    entry!==null&&typeof entry==='object'&&!Array.isArray(entry)&&typeof entry.id==='string'):[];
}
function toForm(kind:Kind,record:Row):Record<string,unknown>{
  const base={...defaults[kind],...record};
  if(kind==='layer'&&record.bounds&&typeof record.bounds==='object')
    Object.assign(base,record.bounds);
  return base;
}
function toValue(value:unknown,field:Field){
  if(field.type==='flag')return Boolean(value);
  if(field.type==='tags')return Array.isArray(value)?value.join(', '):String(value??'');
  return value===null||value===undefined?'':String(value);
}
function payloadOf(kind:Kind,draft:Record<string,unknown>,create:boolean,parents:{worldId:string;timelineId:string;eraId:string}) {
  const payload:Record<string,unknown>={};
  for(const field of fields[kind]){
    if(field.createOnly&&!create)continue;
    const val=draft[field.key];
    if(field.type==='flag')payload[field.key]=Boolean(val);
    else if(field.type==='tags')payload[field.key]=(Array.isArray(val)?val:String(val??'').split(','))
      .map((tag:unknown)=>String(tag).trim()).filter(Boolean);
    else if(field.type==='number'||field.type==='integer')
      payload[field.key]=(val==null||String(val).trim()==='')&&field.nullable?null:Number(val);
    else payload[field.key]=(val==null||val==='')&&field.nullable?null:String(val??'');
  }
  if(kind==='layer'){
    payload.bounds={x1:payload.x1,y1:payload.y1,x2:payload.x2,y2:payload.y2};
    delete payload.x1;delete payload.x2;delete payload.y1;delete payload.y2;
  }
  if(create) {
    if(['layer','location','timeline'].includes(kind))payload.worldId=parents.worldId;
    if(kind==='era')payload.timelineId=parents.timelineId;
    if(kind==='event')payload.eraId=parents.eraId;
  }else{
    if(kind==='timeline')payload.worldId=parents.worldId;
    if(kind==='era')payload.timelineId=parents.timelineId;
    if(kind==='event')payload.eraId=parents.eraId;
  }
  return payload;
}
async function request<T>(url:string,method='GET',body?:unknown,csrf?:string):Promise<T>{
  const headers:Record<string,string>={};
  if(body!==undefined)headers['content-type']='application/json';
  if(csrf)headers['x-csrf-token']=csrf;
  const response=await fetch(url,{method,credentials:'same-origin',headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json() as T&AtlasError;
  if(!response.ok)throw Error(data.error?.message??('Ошибка HTTP '+response.status));
  return data;
}
function editorPath(kind:Kind,id?:string):string{
  const base:{[K in Kind]:string}={
    world:'/api/admin/worlds',type:'/api/admin/types',
    layer:'/api/admin/layers',location:'/api/admin/locations',
    timeline:'/api/admin/timelines',era:'/api/admin/eras',event:'/api/admin/events',
  };
  return base[kind]+(id?'/'+encodeURIComponent(id):'');
}

export function AdminPage(){
  const [session,setSession]=useState<Session|null>(null);
  const [password,setPassword]=useState('');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [worldId,setWorldId]=useState('');
  const [timelineId,setTimelineId]=useState('');
  const [eraId,setEraId]=useState('');
  const [kind,setKind]=useState<Kind>('timeline');
  const [selected,setSelected]=useState<string|null>(null);
  const [draft,setDraft]=useState<Record<string,unknown>>({...defaults.timeline});
  const [dirty,setDirty]=useState(false);
  const [revision,setRevision]=useState(0);
  const [pick,setPick]=useState(false);
  const [assetKind,setAssetKind]=useState<'maps'|'media'>('media');
  const [timelines,setTimelines]=useState<Row[]>([]);
  const [eras,setEras]=useState<Row[]>([]);
  const [events,setEvents]=useState<Row[]>([]);
  const worldQuery=useWorldsQuery();
  const typeQuery=useMarkerTypesQuery();
  const worlds=worldQuery.currentData??[];
  const types=typeQuery.currentData??[];
  const currentWorldId=worlds.find(w=>w.id===worldId)?.id??worlds[0]?.id??'';
  const layerQuery=useLayersQuery(currentWorldId,{skip:!currentWorldId});
  const locationQuery=useLocationsQuery(currentWorldId,{skip:!currentWorldId});
  const layers=layerQuery.currentData??[];
  const locations=locationQuery.currentData??[];
  const currentTimelineId=timelines.find(t=>t.id===timelineId)?.id??timelines[0]?.id??'';
  const currentEraId=eras.find(t=>t.id===eraId)?.id??eras[0]?.id??'';
  const rows:Row[]=useMemo(()=>{
    const source:unknown=kind==='world'?worlds:kind==='type'?types:kind==='layer'?layers:
      kind==='location'?locations:kind==='timeline'?timelines:kind==='era'?eras:events;
    return asRows(source);
  },[kind,worlds,types,layers,locations,timelines,eras,events]);
  const currentWorld=worlds.find(w=>w.id===currentWorldId)??null;

  useEffect(()=>{void request<Session>('/api/auth/me').then(setSession).catch(e=>{
    setError(e instanceof Error?e.message:'Не удалось проверить вход');setSession({authenticated:false});
  });},[]);
  useEffect(()=>{
    if(!session?.authenticated||!currentWorldId)return;
    let active=true;
    void request<unknown>('/api/admin/timelines?worldId='+encodeURIComponent(currentWorldId),'GET',undefined,session.csrfToken)
      .then(data=>{if(active)setTimelines(asRows(data));}).catch(e=>{if(active)setError(String(e));});
    return()=>{active=false;};
  },[session?.authenticated,session?.csrfToken,currentWorldId,revision]);
  useEffect(()=>{
    if(!session?.authenticated||!currentTimelineId){setEras([]);return;}
    let active=true;
    void request<unknown>('/api/admin/eras?timelineId='+encodeURIComponent(currentTimelineId),'GET',undefined,session.csrfToken)
      .then(data=>{if(active)setEras(asRows(data));}).catch(e=>{if(active)setError(String(e));});
    return()=>{active=false;};
  },[session?.authenticated,session?.csrfToken,currentTimelineId,revision]);
  useEffect(()=>{
    if(!session?.authenticated||!currentEraId){setEvents([]);return;}
    let active=true;
    void request<unknown>('/api/admin/events?eraId='+encodeURIComponent(currentEraId),'GET',undefined,session.csrfToken)
      .then(data=>{if(active)setEvents(asRows(data));}).catch(e=>{if(active)setError(String(e));});
    return()=>{active=false;};
  },[session?.authenticated,session?.csrfToken,currentEraId,revision]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='Есть несохранённые изменения';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  function discard(){return !dirty||window.confirm('Отменить несохранённые изменения?');}
  function selectKind(next:Kind){
    if(!discard())return;
    setKind(next);setSelected(null);setDraft({...defaults[next]});setDirty(false);setNotice('');setError('');
  }
  function selectRow(row:Row){
    if(!discard())return;
    setSelected(row.id);setDraft(toForm(kind,row));setDirty(false);setNotice('');setError('');
  }
  function setField(key:string,val:unknown){setDraft(prev=>({...prev,[key]:val}));setDirty(true);}
  async function login(){
    setError('');
    try{
      const result=await request<Session>('/api/auth/login','POST',{password});
      setSession(result);setPassword('');setNotice('Вход выполнен');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  async function logout(){
    try{
      await request('/api/auth/logout','POST',{},session?.csrfToken);
      setSession({authenticated:false});setDirty(false);setNotice('Вы вышли');
    }catch(e){setError(String(e));}
  }
  async function save(){
    if(!session?.authenticated)return;
    setError('');setNotice('');
    const isNew=!selected;
    const parents={worldId:currentWorldId,timelineId:currentTimelineId,eraId:currentEraId};
    if((kind==='timeline'||kind==='location'||kind==='layer')&&!currentWorldId){
      setError('Сначала выбери мир');return;
    }
    if(kind==='era'&&!currentTimelineId){setError('Сначала создай таймлайн');return;}
    if(kind==='event'&&!currentEraId){setError('Сначала создай эпоху');return;}
    try{
      const result=await request<{id?:string;ok?:boolean}>(
        editorPath(kind,selected??undefined),isNew?'POST':'PATCH',
        payloadOf(kind,draft,isNew,parents),session.csrfToken);
      setNotice('Сохранено. Изменения записаны в SQLite.');
      setDirty(false);setSelected(result.id??selected);setRevision(v=>v+1);
      // RTK Query data is cached; invalidate after editing.
      void Promise.all([worldQuery.refetch(),typeQuery.refetch(),
        ...(currentWorldId?[layerQuery.refetch(),locationQuery.refetch()]:[])]);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  async function remove(){
    if(!selected||!session?.authenticated)return;
    if(!window.confirm('Удалить объект? Перед удалением сервер сделает резервную копию. Для зависимых объектов операция будет запрещена.'))return;
    setError('');
    try{
      await request(editorPath(kind,selected),'DELETE',undefined,session.csrfToken);
      setSelected(null);setDraft({...defaults[kind]});setDirty(false);
      setRevision(v=>v+1);setNotice('Объект удалён. Снимок сохранён сервером.');
      void Promise.all([worldQuery.refetch(),typeQuery.refetch(),
        ...(currentWorldId?[layerQuery.refetch(),locationQuery.refetch()]:[])]);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  async function upload(file:File){
    if(!session?.authenticated)return;
    setError('');
    try{
      const response=await fetch('/api/admin/assets/'+assetKind,{
        method:'POST',headers:{'content-type':'application/octet-stream','x-csrf-token':session.csrfToken??''},
        credentials:'same-origin',body:file,
      });
      const data=await response.json() as {filename?:string;width?:number;height?:number;error?:{message:string}};
      if(!response.ok||!data.filename)throw Error(data.error?.message??'Ошибка загрузки');
      setNotice('Изображение сохранено: '+data.filename);
      setField('image',data.filename);
      if(kind==='world'||kind==='layer'){
        if(data.width)setField('width',data.width);
        if(data.height)setField('height',data.height);
      }
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  const options=(key:string):{id:string;label:string}[]=>{
    if(key==='status')return [{id:'draft',label:'Черновик'},{id:'published',label:'Опубликовано'}];
    if(key==='type')return types.map(t=>({id:t.id,label:t.symbol+' '+t.name}));
    if(key==='parentId')return layers.filter(l=>l.id!==selected).map(l=>({id:l.id,label:l.name}));
    if(key==='locationId')return locations.map(l=>({id:l.id,label:l.name}));
    return [];
  };
  const canChoose=kind==='event'||kind==='location';
  if(session===null)return <Stack sx={{minHeight:'100vh'}} alignItems="center" justifyContent="center">
    <CircularProgress/><Typography>Проверяем сессию администратора…</Typography>
  </Stack>;
  if(!session.authenticated)return <Box sx={{minHeight:'100vh',bgcolor:'background.default',p:3}}>
    <Paper sx={{p:3,maxWidth:470,mx:'auto',mt:6}}>
      <Typography variant="h5" color="primary.main">The Atlas · Вход мастера</Typography>
      <Typography color="text.secondary" sx={{mt:1,mb:2}}>
        Один администратор, без регистрации. Пароль настраивается командой npm.cmd run admin:setup.
      </Typography>
      <TextField fullWidth type="password" label="Пароль" autoComplete="current-password"
        value={password} onChange={e=>setPassword(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter')void login();}} />
      <Stack direction="row" gap={2} sx={{mt:2}}>
        <Button variant="contained" onClick={()=>void login()}>Войти</Button>
        <Button component={RouterLink} to="/" variant="outlined">К карте</Button>
      </Stack>
      {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
    </Paper>
  </Box>;

  return <Box sx={{minHeight:'100vh',bgcolor:'background.default',p:2}}>
    <Stack direction="row" alignItems="center" gap={2} sx={{mb:2}}>
      <Typography variant="h5" color="primary.main">The Atlas · Редактор</Typography>
      <Box sx={{flex:1}}/>
      <Button component={RouterLink} to="/" variant="outlined" onClick={e=>{
        if(!discard())e.preventDefault();
      }}>К карте</Button>
      <Button onClick={()=>void logout()}>Выйти</Button>
    </Stack>
    <Typography fontSize={13} color="text.secondary" sx={{mb:2}}>
      Изменения сохраняются в SQLite. Исходный data/atlas.json не перезаписывается. Перед удалением сервер создаёт backup.
    </Typography>
    {error&&<Alert severity="error" sx={{mb:2}} onClose={()=>setError('')}>{error}</Alert>}
    {notice&&<Alert severity="success" sx={{mb:2}} onClose={()=>setNotice('')}>{notice}</Alert>}
    <Paper sx={{p:2,mb:2}}>
      <Stack direction={{xs:'column',sm:'row'}} gap={2}>
        <FormControl size="small" sx={{minWidth:220}}>
          <InputLabel id="admin-world">Рабочий мир</InputLabel>
          <Select labelId="admin-world" label="Рабочий мир" value={currentWorldId} onChange={e=>{
            if(!discard())return;
            setWorldId(e.target.value);setTimelineId('');setEraId('');setSelected(null);setDraft({...defaults[kind]});setDirty(false);
          }}>
            {worlds.map(w=><MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{minWidth:220}}>
          <InputLabel id="admin-timeline">Линия времени</InputLabel>
          <Select labelId="admin-timeline" label="Линия времени" value={currentTimelineId} onChange={e=>{
            if(!discard())return;
            setTimelineId(e.target.value);setEraId('');setSelected(null);setDraft({...defaults[kind]});setDirty(false);
          }}>
            {timelines.map(t=><MenuItem key={t.id} value={t.id}>{String(t.name)}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{minWidth:220}}>
          <InputLabel id="admin-era">Эпоха</InputLabel>
          <Select labelId="admin-era" label="Эпоха" value={currentEraId} onChange={e=>{
            if(!discard())return;
            setEraId(e.target.value);setSelected(null);setDraft({...defaults[kind]});setDirty(false);
          }}>
            {eras.map(t=><MenuItem key={t.id} value={t.id}>{String(t.name)}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>
    </Paper>
    <Paper sx={{mb:2}}>
      <Tabs value={kind} onChange={(_e,value:Kind)=>selectKind(value)} variant="scrollable" scrollButtons="auto">
        {kinds.map(value=><Tab key={value} value={value} label={titles[value]}/>)}
      </Tabs>
    </Paper>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'290px minmax(0,1fr)'},gap:2}}>
      <Paper sx={{p:1,maxHeight:'73vh',overflowY:'auto'}}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{p:1}}>
          <Typography fontWeight={600}>{titles[kind]} ({rows.length})</Typography>
          <Button size="small" onClick={()=>{if(discard()){setSelected(null);setDraft({...defaults[kind]});setDirty(false);}}}>Создать</Button>
        </Stack>
        <Divider/>
        <List dense>
          {rows.map(row=><ListItemButton key={row.id} selected={selected===row.id} onClick={()=>selectRow(row)}>
            <ListItemText primary={String(row.name??row.title??row.id)}
              secondary={String(row.dateLabel??row.description??row.id).slice(0,100)}/>
          </ListItemButton>)}
        </List>
        {!rows.length&&<Typography fontSize={12} color="text.secondary" sx={{p:2}}>Записей пока нет.</Typography>}
      </Paper>
      <Paper sx={{p:3}}>
        <Typography variant="h6" sx={{mb:2}}>{selected?'Редактирование':'Новая запись'} · {titles[kind]}</Typography>
        {selected&&<Typography color="text.secondary" fontSize={12} sx={{mb:2}}>ID: {selected}</Typography>}
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1fr 1fr'},gap:2}}>
          {fields[kind].filter(field=>!field.createOnly||!selected).map(field=>
            field.type==='flag'?<FormControlLabel key={field.key} control={
              <Checkbox checked={Boolean(draft[field.key])} onChange={e=>setField(field.key,e.target.checked)}/>
            } label={field.label}/>:
            field.type==='select'?<FormControl size="small" key={field.key}>
              <InputLabel>{field.label}</InputLabel>
              <Select label={field.label} value={String(draft[field.key]??'')}
                onChange={e=>setField(field.key,e.target.value||null)}>
                {field.nullable&&<MenuItem value="">Без связи</MenuItem>}
                {options(field.key).map(opt=><MenuItem key={opt.id} value={opt.id}>{opt.label}</MenuItem>)}
              </Select>
            </FormControl>:
            <TextField key={field.key} size="small" fullWidth
              multiline={field.type==='textarea'} rows={field.type==='textarea'?4:undefined}
              label={field.label}
              type={field.type==='number'||field.type==='integer'?'number':'text'}
              value={toValue(draft[field.key],field)}
              onChange={e=>setField(field.key,e.target.value)}
              sx={field.type==='textarea'?{gridColumn:'1 / -1'}:undefined}
              slotProps={field.type==='number'||field.type==='integer'?{htmlInput:{step:field.type==='integer'?1:'any'}}:undefined}/>
          )}
        </Box>
        {canChoose&&<Button onClick={()=>setPick(true)} sx={{mt:2}} variant="outlined">
          Выбрать координаты на карте
        </Button>}
        <Stack direction="row" flexWrap="wrap" gap={2} sx={{mt:3}}>
          <Button variant="contained" onClick={()=>void save()} disabled={!selected&&!currentWorldId&&kind!=='world'&&kind!=='type'}>
            Сохранить
          </Button>
          {selected&&<Button color="error" variant="outlined" onClick={()=>void remove()}>Удалить…</Button>}
        </Stack>
        <Divider sx={{my:3}}/>
        <Typography variant="subtitle2">Загрузка изображений</Typography>
        <Typography fontSize={12} color="text.secondary" sx={{my:1}}>
          PNG, WebP или JPEG. До 40 МБ. Имя безопасного файла создаётся сервером, без перезаписи оригиналов.
        </Typography>
        <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
          <FormControl size="small" sx={{minWidth:130}}>
            <InputLabel>Тип файла</InputLabel>
            <Select label="Тип файла" value={assetKind} onChange={e=>setAssetKind(e.target.value as 'maps'|'media')}>
              <MenuItem value="maps">Карты</MenuItem>
              <MenuItem value="media">Статьи</MenuItem>
            </Select>
          </FormControl>
          <Button variant="outlined" component="label">Загрузить файл
            <input hidden type="file" accept="image/png,image/webp,image/jpeg" onChange={e=>{
              const file=e.target.files?.[0];if(file)void upload(file);e.target.value='';
            }}/>
          </Button>
        </Stack>
      </Paper>
    </Box>
    <MapPointPicker open={pick} world={currentWorld} layers={layers}
      x={draft.x==null?null:Number(draft.x)} y={draft.y==null?null:Number(draft.y)}
      onChoose={(x,y)=>{setField('x',x);setField('y',y);}} onClose={()=>setPick(false)}/>
  </Box>;
}
