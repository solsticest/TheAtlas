import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControl,
  FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import type {
  EraRecord, EventRecord, LayerRecord, LocationRecord, MarkerTypeRecord,
  TimelineRecord, WorldRecord,
} from '@atlas/shared';
import { MapPointPicker } from '../atlas/MapPointPicker';
import { LayerGeometryDialog } from '../atlas/LayerGeometryDialog';
import { TwoPointAlignDialog } from '../atlas/TwoPointAlignDialog';

export type InlineEditorKind='world'|'type'|'layer'|'location'|'timeline'|'era'|'event';
export type InlineEditorSelection={kind:InlineEditorKind;id:string};
type Session={authenticated:boolean;csrfToken?:string};
type ErrorBody={error?:{message?:string}};
type Row=Record<string,unknown>&{id:string};
type Field={
  key:string;label:string;
  type?:'text'|'number'|'integer'|'flag'|'tags'|'textarea'|'select';
  nullable?:boolean;
};
type Props={
  selection:InlineEditorSelection;
  world:WorldRecord;
  layers:LayerRecord[];
  locations:LocationRecord[];
  types:MarkerTypeRecord[];
  timelines:TimelineRecord[];
  eras:EraRecord[];
  events:EventRecord[];
  timelineId:string;
  eraId:string;
  onSaved:()=>void|Promise<void>;
  onDeleted:()=>void|Promise<void>;
  onDirtyChange:(dirty:boolean)=>void;
  onExit:()=>void;
};

const titles:Record<InlineEditorKind,string>={
  world:'Мир',type:'Тип маркера',layer:'Карта-слой',location:'Локация',
  timeline:'Таймлайн',era:'Эпоха',event:'Событие',
};
const fields:Record<InlineEditorKind,Field[]>={
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
    {key:'x1',label:'Bounds: x1',type:'number'},
    {key:'y1',label:'Bounds: y1',type:'number'},
    {key:'x2',label:'Bounds: x2',type:'number'},
    {key:'y2',label:'Bounds: y2',type:'number'},
    {key:'rotation',label:'Поворот (°)',type:'number'},
    {key:'showAtZoom',label:'Порог появления',type:'number'},
    {key:'fadeRange',label:'Диапазон затухания',type:'number'},
    {key:'enabled',label:'Слой виден',type:'flag'},
  ],
  location:[
    {key:'name',label:'Название'},
    {key:'type',label:'Тип маркера',type:'select'},
    {key:'x',label:'X',type:'number'},
    {key:'y',label:'Y',type:'number'},
    {key:'color',label:'Цвет (#RRGGBB)'},
    {key:'minZoom',label:'Минимальный масштаб',type:'number'},
    {key:'description',label:'Краткое описание',type:'textarea'},
    {key:'article',label:'HTML-статья',type:'textarea'},
    {key:'tags',label:'Теги',type:'tags'},
  ],
  timeline:[
    {key:'name',label:'Название'},
    {key:'description',label:'Описание',type:'textarea'},
    {key:'sortOrder',label:'Порядок',type:'integer'},
    {key:'isDefault',label:'Основной таймлайн',type:'flag'},
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
    {key:'tags',label:'Теги',type:'tags'},
    {key:'sortOrder',label:'Порядок',type:'integer'},
    {key:'locationId',label:'Связь с локацией',type:'select',nullable:true},
    {key:'x',label:'X (необязательно)',type:'number',nullable:true},
    {key:'y',label:'Y (необязательно)',type:'number',nullable:true},
    {key:'image',label:'Имя файла иллюстрации',nullable:true},
    {key:'status',label:'Публикация',type:'select'},
  ],
};

function rowFor(props:Props):Row|null{
  const {selection}=props;
  const sources:Record<InlineEditorKind,readonly unknown[]>={
    world:[props.world],type:props.types,layer:props.layers,location:props.locations,
    timeline:props.timelines,era:props.eras,event:props.events,
  };
  const row=sources[selection.kind].find(item=>
    item!==null&&typeof item==='object'&&'id' in item&&item.id===selection.id);
  return row&&typeof row==='object'?row as Row:null;
}
function toForm(kind:InlineEditorKind,row:Row):Record<string,unknown>{
  const base={...row};
  if(kind==='layer'&&row.bounds&&typeof row.bounds==='object')Object.assign(base,row.bounds);
  return base;
}
function valueOf(value:unknown,field:Field){
  if(field.type==='flag')return Boolean(value);
  if(field.type==='tags')return Array.isArray(value)?value.join(', '):String(value??'');
  return value===null||value===undefined?'':String(value);
}
function endpoint(kind:InlineEditorKind,id:string){
  const names:Record<InlineEditorKind,string>={
    world:'worlds',type:'types',layer:'layers',location:'locations',
    timeline:'timelines',era:'eras',event:'events',
  };
  return '/api/admin/'+names[kind]+'/'+encodeURIComponent(id);
}
function payloadOf(kind:InlineEditorKind,draft:Record<string,unknown>,props:Props){
  const out:Record<string,unknown>={};
  for(const field of fields[kind]){
    const raw=draft[field.key];
    if(field.type==='flag')out[field.key]=Boolean(raw);
    else if(field.type==='tags')out[field.key]=(Array.isArray(raw)?raw:String(raw??'').split(','))
      .map(item=>String(item).trim()).filter(Boolean);
    else if(field.type==='number'||field.type==='integer'){
      out[field.key]=(raw==null||String(raw).trim()==='')&&field.nullable?null:Number(raw);
    }else out[field.key]=(raw==null||raw==='')&&field.nullable?null:String(raw??'');
  }
  if(kind==='layer'){
    out.bounds={x1:out.x1,y1:out.y1,x2:out.x2,y2:out.y2};
    delete out.x1;delete out.y1;delete out.x2;delete out.y2;
  }
  if(kind==='timeline')out.worldId=props.world.id;
  if(kind==='era')out.timelineId=props.timelineId;
  if(kind==='event')out.eraId=props.eraId;
  return out;
}
async function request<T>(url:string,method='GET',body?:unknown,csrf?:string):Promise<T>{
  const headers:Record<string,string>={};
  if(body!==undefined)headers['content-type']='application/json';
  if(csrf)headers['x-csrf-token']=csrf;
  const response=await fetch(url,{method,credentials:'same-origin',headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json() as T&ErrorBody;
  if(!response.ok)throw Error(data.error?.message??('Ошибка HTTP '+response.status));
  return data;
}

export function InlineEditorPanel(props:Props){
  const row=useMemo(()=>rowFor(props),[
    props.selection,props.world,props.types,props.layers,props.locations,
    props.timelines,props.eras,props.events,
  ]);
  const [session,setSession]=useState<Session|null>(null);
  const [password,setPassword]=useState('');
  const [draft,setDraft]=useState<Record<string,unknown>>({});
  const [dirty,setDirty]=useState(false);
  const [undo,setUndo]=useState<Record<string,unknown>[]>([]);
  const [redo,setRedo]=useState<Record<string,unknown>[]>([]);
  const lastEdit=useRef<{key:string;at:number}|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [saving,setSaving]=useState(false);
  const [pointPicker,setPointPicker]=useState(false);
  const [geometryOpen,setGeometryOpen]=useState(false);
  const [alignOpen,setAlignOpen]=useState(false);
  const [assetKind,setAssetKind]=useState<'maps'|'media'>('maps');

  useEffect(()=>{
    void request<Session>('/api/auth/me').then(setSession).catch(reason=>{
      setSession({authenticated:false});
      setError(reason instanceof Error?reason.message:String(reason));
    });
  },[]);
  useEffect(()=>{
    if(!row)return;
    setDraft(toForm(props.selection.kind,row));
    setDirty(false);setUndo([]);setRedo([]);setError('');setNotice('');
    lastEdit.current=null;
  },[props.selection.kind,props.selection.id,row]);
  useEffect(()=>{props.onDirtyChange(dirty);},[dirty,props.onDirtyChange]);

  function patch(values:Record<string,unknown>,key='field'){
    setDraft(current=>{
      if(Object.entries(values).every(([name,value])=>Object.is(current[name],value)))return current;
      const now=Date.now(),consecutive=lastEdit.current?.key===key&&now-lastEdit.current.at<650;
      if(!consecutive)setUndo(previous=>[...previous,current].slice(-60));
      setRedo([]);setDirty(true);lastEdit.current={key,at:now};
      return {...current,...values};
    });
  }
  function setField(key:string,value:unknown){patch({[key]:value},key);}
  function undoDraft(){
    const previous=undo.at(-1);if(!previous)return;
    setUndo(stack=>stack.slice(0,-1));setRedo(stack=>[draft,...stack].slice(0,60));
    setDraft(previous);setDirty(true);lastEdit.current=null;
  }
  function redoDraft(){
    const next=redo[0];if(!next)return;
    setRedo(stack=>stack.slice(1));setUndo(stack=>[...stack,draft].slice(-60));
    setDraft(next);setDirty(true);lastEdit.current=null;
  }
  async function login(){
    setError('');
    try{
      const result=await request<Session>('/api/auth/login','POST',{password});
      setSession(result);setPassword('');setNotice('Режим редактирования разблокирован');
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
  }
  async function save(){
    if(!session?.authenticated||!row)return;
    setSaving(true);setError('');setNotice('');
    try{
      await request(endpoint(props.selection.kind,props.selection.id),'PATCH',
        payloadOf(props.selection.kind,draft,props),session.csrfToken);
      setDirty(false);setUndo([]);setRedo([]);lastEdit.current=null;
      setNotice('Сохранено. Карта обновляется на этой же странице.');
      await props.onSaved();
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setSaving(false);}
  }
  async function remove(){
    if(!session?.authenticated||!row)return;
    if(!window.confirm('Удалить объект? Сервер сначала создаст резервную копию.'))return;
    setSaving(true);setError('');
    try{
      await request(endpoint(props.selection.kind,props.selection.id),'DELETE',undefined,session.csrfToken);
      setDirty(false);await props.onDeleted();
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setSaving(false);}
  }
  async function upload(file:File){
    if(!session?.authenticated)return;
    setSaving(true);setError('');
    try{
      const response=await fetch('/api/admin/assets/'+assetKind,{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/octet-stream','x-csrf-token':session.csrfToken??''},
        body:file,
      });
      const data=await response.json() as {filename?:string;width?:number;height?:number;error?:{message?:string}};
      if(!response.ok||!data.filename)throw Error(data.error?.message??'Ошибка загрузки');
      patch({image:data.filename,
        ...((props.selection.kind==='world'||props.selection.kind==='layer')&&data.width?{width:data.width}:{}),
        ...((props.selection.kind==='world'||props.selection.kind==='layer')&&data.height?{height:data.height}:{}),
      },'asset');
      setNotice('Файл загружен. Нажми «Сохранить», чтобы применить его к объекту.');
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setSaving(false);}
  }

  if(session===null)return <Box className="atlas-inline-editor"><Stack sx={{p:3}} alignItems="center" gap={2}>
    <CircularProgress size={26}/><Typography fontSize={13}>Проверяем сессию…</Typography>
  </Stack></Box>;

  if(!session.authenticated)return <Box className="atlas-inline-editor">
    <Stack sx={{p:2.5}} gap={2}>
      <Typography variant="h6" color="primary.main">Режим редактирования</Typography>
      <Typography fontSize={13} color="text.secondary">
        Карта остаётся перед тобой. Введи пароль администратора один раз — после этого объекты редактируются здесь же.
      </Typography>
      <TextField type="password" size="small" label="Пароль администратора" value={password}
        onChange={event=>setPassword(event.target.value)}
        onKeyDown={event=>{if(event.key==='Enter')void login();}}/>
      <Button variant="contained" onClick={()=>void login()}>Войти</Button>
      <Button variant="text" onClick={props.onExit}>Закрыть редактор</Button>
      {error&&<Alert severity="error">{error}</Alert>}
    </Stack>
  </Box>;

  if(!row)return <Box className="atlas-inline-editor"><Stack sx={{p:2.5}} gap={2}>
    <Typography variant="h6">Объект недоступен</Typography>
    <Typography fontSize={13} color="text.secondary">
      Возможно, он исчез из публичного списка после смены статуса. Для черновиков пока остаётся табличный /admin.
    </Typography>
    <Button onClick={props.onExit}>Закрыть редактор</Button>
  </Stack></Box>;

  const options=(key:string):{id:string;label:string}[]=>{
    if(key==='status')return [{id:'draft',label:'Черновик'},{id:'published',label:'Опубликовано'}];
    if(key==='type'&&props.selection.kind==='location')return props.types.map(type=>({id:type.id,label:type.symbol+' '+type.name}));
    if(key==='parentId')return props.layers.filter(layer=>layer.id!==props.selection.id).map(layer=>({id:layer.id,label:layer.name}));
    if(key==='locationId')return props.locations.map(location=>({id:location.id,label:location.name}));
    return [];
  };
  const parentLayer=props.layers.find(layer=>layer.id===draft.parentId);
  const sourceSpec={
    image:typeof draft.image==='string'&&draft.image?draft.image:null,
    width:Number(draft.width??0),height:Number(draft.height??0),name:'Совмещаемая карта',
  };
  const parentSpec=parentLayer?{
    image:parentLayer.image,width:parentLayer.width,height:parentLayer.height,
    name:'Родительская карта: '+parentLayer.name,
  }:{
    image:props.world.image,width:props.world.width,height:props.world.height,name:'Карта мира',
  };
  const hasCoordinates=props.selection.kind==='location'||props.selection.kind==='event';

  return <Box className="atlas-inline-editor">
    <Stack sx={{p:2}} gap={1.5}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Box sx={{minWidth:0}}>
          <Typography variant="caption" color="primary.main">{titles[props.selection.kind]}</Typography>
          <Typography fontWeight={700} noWrap>
            {String(row.name??row.title??props.selection.id)}
          </Typography>
        </Box>
        <Box sx={{flex:1}}/>
        <Button size="small" onClick={props.onExit}>Закрыть</Button>
      </Stack>
      <Typography fontSize={11} color="text.secondary" sx={{wordBreak:'break-all'}}>ID: {props.selection.id}</Typography>
      {error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}
      {notice&&<Alert severity="success" onClose={()=>setNotice('')}>{notice}</Alert>}
      {dirty&&<Alert severity="warning">Есть несохранённые изменения.</Alert>}
      <Divider/>
      <Stack gap={1.5}>
        {fields[props.selection.kind].map(field=>
          field.type==='flag'?<FormControlLabel key={field.key} control={
            <Checkbox checked={Boolean(draft[field.key])} onChange={event=>setField(field.key,event.target.checked)}/>
          } label={field.label}/>:
          field.type==='select'?<FormControl size="small" key={field.key} fullWidth>
            <InputLabel>{field.label}</InputLabel>
            <Select label={field.label} value={String(draft[field.key]??'')}
              onChange={event=>setField(field.key,event.target.value||null)}>
              {field.nullable&&<MenuItem value="">Без связи</MenuItem>}
              {options(field.key).map(option=><MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}
            </Select>
          </FormControl>:
          <TextField key={field.key} size="small" fullWidth label={field.label}
            multiline={field.type==='textarea'} minRows={field.type==='textarea'?3:undefined}
            type={field.type==='number'||field.type==='integer'?'number':'text'}
            value={valueOf(draft[field.key],field)}
            onChange={event=>setField(field.key,event.target.value)}
            slotProps={field.type==='number'||field.type==='integer'?{
              htmlInput:{step:field.type==='integer'?1:'any'}
            }:undefined}/>
        )}
      </Stack>

      {hasCoordinates&&<Button variant="outlined" onClick={()=>setPointPicker(true)}>
        Выбрать координаты на карте
      </Button>}
      {props.selection.kind==='layer'&&<Stack direction="row" gap={1} flexWrap="wrap">
        <Button size="small" variant="outlined" onClick={()=>setGeometryOpen(true)}>Переместить / размер</Button>
        <Button size="small" variant="outlined" onClick={()=>setAlignOpen(true)}>Совместить по 2 точкам</Button>
      </Stack>}

      <Stack direction="row" gap={1}>
        <Button size="small" variant="outlined" disabled={!undo.length} onClick={undoDraft}>↶</Button>
        <Button size="small" variant="outlined" disabled={!redo.length} onClick={redoDraft}>↷</Button>
        <Button variant="contained" disabled={!dirty||saving} onClick={()=>void save()} sx={{flex:1}}>
          {saving?'Сохраняем…':'Сохранить'}
        </Button>
      </Stack>

      {(props.selection.kind==='world'||props.selection.kind==='layer'||props.selection.kind==='event'||props.selection.kind==='era')&&<>
        <Divider/>
        <Typography variant="subtitle2">Изображение</Typography>
        <Stack direction="row" gap={1}>
          <FormControl size="small" sx={{minWidth:120}}>
            <InputLabel>Хранилище</InputLabel>
            <Select label="Хранилище" value={assetKind} onChange={event=>setAssetKind(event.target.value as 'maps'|'media')}>
              <MenuItem value="maps">Карты</MenuItem><MenuItem value="media">Медиа</MenuItem>
            </Select>
          </FormControl>
          <Button component="label" variant="outlined" size="small">Загрузить
            <input hidden type="file" accept="image/png,image/webp,image/jpeg" onChange={event=>{
              const file=event.target.files?.[0];if(file)void upload(file);event.target.value='';
            }}/>
          </Button>
        </Stack>
      </>}

      <Divider/>
      <Button color="error" size="small" variant="text" disabled={saving} onClick={()=>void remove()}>
        Удалить объект…
      </Button>
      <Typography fontSize={11} color="text.secondary">
        Сохранение и удаление существующего объекта создаёт серверный snapshot до записи.
      </Typography>
    </Stack>

    <MapPointPicker open={pointPicker} world={props.world} layers={props.layers}
      x={draft.x==null?null:Number(draft.x)} y={draft.y==null?null:Number(draft.y)}
      onChoose={(x,y)=>patch({x,y},'map-point')} onClose={()=>setPointPicker(false)}/>
    <LayerGeometryDialog open={geometryOpen} child={sourceSpec} parent={parentSpec}
      bounds={{x1:Number(draft.x1),y1:Number(draft.y1),x2:Number(draft.x2),y2:Number(draft.y2)}}
      rotation={Number(draft.rotation??0)}
      onApply={bounds=>patch(bounds,'drag-resize')} onClose={()=>setGeometryOpen(false)}/>
    <TwoPointAlignDialog open={alignOpen} child={sourceSpec} parent={parentSpec}
      onApply={(bounds,rotation)=>patch({...bounds,rotation},'alignment')} onClose={()=>setAlignOpen(false)}/>
  </Box>;
}
