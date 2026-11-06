import {
  forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import {
  Alert, Box, Button, Checkbox, Divider, FormControl, FormControlLabel,
  InputLabel, MenuItem, Select, Slider, Stack, TextField, Typography,
} from '@mui/material';
import type {
  EraRecord, EventRecord, LayerRecord, LocationRecord, MarkerTypeRecord,
  TimelineRecord, WorldRecord,
} from '@atlas/shared';
import { LayerGeometryDialog } from '../atlas/LayerGeometryDialog';
import { TwoPointAlignDialog } from '../atlas/TwoPointAlignDialog';
import { assetUrl } from '../atlas/geometry';
import { RichTextEditor } from './RichTextEditor';

export type EditorKind='world'|'type'|'layer'|'location'|'timeline'|'era'|'event';
export type EditorSection='all'|'marker'|'article';
export type EditorTarget={
  kind:EditorKind;
  id?:string;
  create?:boolean;
  section?:EditorSection;
  initial?:Record<string,unknown>;
};
export type EditorSession={authenticated:boolean;csrfToken?:string};
export type EditorStatus={
  dirty:boolean;canUndo:boolean;canRedo:boolean;saving:boolean;
  title:string;
};
export type AtlasObjectEditorHandle={
  undo:()=>void;redo:()=>void;save:()=>void;cancel:()=>void;
  patch:(values:Record<string,unknown>,key?:string)=>void;
};
type Row=Record<string,unknown>&{id:string};
type ErrorBody={error?:{message?:string}};
type Field={
  key:string;label:string;
  type?:'text'|'number'|'integer'|'flag'|'tags'|'textarea'|'select'|'color';
  nullable?:boolean;
};

type Props={
  target:EditorTarget;
  session:EditorSession;
  world:WorldRecord;
  worlds:WorldRecord[];
  layers:LayerRecord[];
  locations:LocationRecord[];
  types:MarkerTypeRecord[];
  timelines:TimelineRecord[];
  eras:EraRecord[];
  events:EventRecord[];
  timelineId:string;
  eraId:string;
  onStatus:(status:EditorStatus)=>void;
  onPreview:(target:EditorTarget,draft:Record<string,unknown>)=>void;
  onSaved:(kind:EditorKind,id:string,created:boolean)=>void|Promise<void>;
  onDeleted:(kind:EditorKind,id:string)=>void|Promise<void>;
  onCancel:()=>void;
};

const titles:Record<EditorKind,string>={
  world:'Мир',type:'Тип маркера',layer:'Карта региона',location:'Маркер',
  timeline:'Таймлайн',era:'Эпоха',event:'Событие',
};
const allFields:Record<EditorKind,Field[]>={
  world:[
    {key:'name',label:'Название'},
    {key:'width',label:'Ширина изображения',type:'integer'},
    {key:'height',label:'Высота изображения',type:'integer'},
    {key:'image',label:'Файл карты',nullable:true},
    {key:'kmPerPixel',label:'Километров на пиксель',type:'number',nullable:true},
  ],
  type:[],
  layer:[
    {key:'name',label:'Название региона'},
    {key:'parentId',label:'Родительская карта',type:'select',nullable:true},
    {key:'image',label:'Файл изображения',nullable:true},
    {key:'width',label:'Ширина файла',type:'integer'},
    {key:'height',label:'Высота файла',type:'integer'},
    {key:'x1',label:'X1',type:'number'},{key:'y1',label:'Y1',type:'number'},
    {key:'x2',label:'X2',type:'number'},{key:'y2',label:'Y2',type:'number'},
    {key:'rotation',label:'Поворот',type:'number'},
    {key:'showAtZoom',label:'Появление с масштаба',type:'number'},
    {key:'fadeRange',label:'Диапазон затухания',type:'number'},
    {key:'enabled',label:'Слой виден',type:'flag'},
  ],
  location:[
    {key:'name',label:'Название'},
    {key:'type',label:'Тип маркера',type:'select'},
    {key:'x',label:'X',type:'number'},{key:'y',label:'Y',type:'number'},
    {key:'minZoom',label:'Минимальный масштаб',type:'number'},
    {key:'description',label:'Короткая сводка',type:'textarea'},
    {key:'tags',label:'Теги',type:'tags'},
    {key:'article',label:'Статья (HTML)',type:'textarea'},
  ],
  timeline:[
    {key:'name',label:'Название'},
    {key:'description',label:'Описание',type:'textarea'},
    {key:'sortOrder',label:'Порядок',type:'integer'},
    {key:'isDefault',label:'Основной',type:'flag'},
    {key:'status',label:'Публикация',type:'select'},
  ],
  era:[
    {key:'name',label:'Название'},
    {key:'dateLabel',label:'Дата / период'},
    {key:'description',label:'Описание',type:'textarea'},
    {key:'sortOrder',label:'Порядок',type:'integer'},
    {key:'image',label:'Иллюстрация',nullable:true},
  ],
  event:[
    {key:'title',label:'Название'},
    {key:'dateLabel',label:'Дата / подпись'},
    {key:'summary',label:'Короткая сводка',type:'textarea'},
    {key:'article',label:'Статья (HTML)',type:'textarea'},
    {key:'type',label:'Категория'},
    {key:'tags',label:'Теги',type:'tags'},
    {key:'sortOrder',label:'Порядок',type:'integer'},
    {key:'locationId',label:'Связь с локацией',type:'select',nullable:true},
    {key:'x',label:'X',type:'number',nullable:true},{key:'y',label:'Y',type:'number',nullable:true},
    {key:'image',label:'Иллюстрация',nullable:true},
    {key:'status',label:'Публикация',type:'select'},
  ],
};

function sourceRow(props:Props):Row|null{
  if(props.target.create)return null;
  const sources:Record<EditorKind,readonly unknown[]>={
    world:props.worlds,type:props.types,layer:props.layers,location:props.locations,
    timeline:props.timelines,era:props.eras,event:props.events,
  };
  const row=sources[props.target.kind].find(item=>
    item!==null&&typeof item==='object'&&'id' in item&&item.id===props.target.id);
  return row&&typeof row==='object'?row as Row:null;
}
function asForm(kind:EditorKind,row:Row):Record<string,unknown>{
  const result={...row};
  if(kind==='layer'&&row.bounds&&typeof row.bounds==='object'){
    Object.assign(result,row.bounds);
    result.previewOpacity=.72;
  }
  return result;
}
function defaults(props:Props):Record<string,unknown>{
  const initial=props.target.initial??{};
  const type=props.types[0];
  const parentId=typeof initial.parentId==='string'?initial.parentId:null;
  const parent=parentId?props.layers.find(layer=>layer.id===parentId):null;
  const width=parent?.width??props.world.width,height=parent?.height??props.world.height;
  const base:Record<EditorKind,Record<string,unknown>>={
    world:{name:'Новый мир',width:1600,height:1000,image:null,kmPerPixel:null},
    type:{name:'Новый тип',symbol:'◆',color:'#d6b77a',iconSvg:null},
    layer:{name:'Новый регион',parentId,image:null,width:1000,height:1000,
      x1:width*.25,y1:height*.25,x2:width*.75,y2:height*.75,
      rotation:0,showAtZoom:1,fadeRange:.75,enabled:true,previewOpacity:.72},
    location:{name:'Новый маркер',type:type?.id??'',x:props.world.width/2,y:props.world.height/2,
      color:type?.color??'#d6b77a',minZoom:-6,description:'',article:'',tags:[]},
    timeline:{name:'Новый таймлайн',description:'',sortOrder:0,isDefault:false,status:'published'},
    era:{name:'Новая эпоха',description:'',dateLabel:'',sortOrder:0,image:null},
    event:{title:'Новое событие',summary:'',article:'',type:'',tags:[],sortOrder:0,
      dateLabel:'',locationId:null,x:null,y:null,image:null,status:'published'},
  };
  return {...base[props.target.kind],...initial};
}
function fieldsFor(target:EditorTarget){
  if(target.kind!=='location')return allFields[target.kind];
  if(target.section==='article')return allFields.location.filter(field=>field.key==='article');
  return allFields.location.filter(field=>field.key!=='article');
}
function textValue(value:unknown,field:Field){
  if(field.type==='flag')return Boolean(value);
  if(field.type==='tags')return Array.isArray(value)?value.join(', '):String(value??'');
  return value===null||value===undefined?'':String(value);
}
function root(kind:EditorKind){
  const map:Record<EditorKind,string>={
    world:'worlds',type:'types',layer:'layers',location:'locations',
    timeline:'timelines',era:'eras',event:'events',
  };
  return '/api/admin/'+map[kind];
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
function payload(kind:EditorKind,draft:Record<string,unknown>,props:Props){
  const output:Record<string,unknown>={};
  for(const field of allFields[kind]){
    const raw=draft[field.key];
    if(field.type==='flag')output[field.key]=Boolean(raw);
    else if(field.type==='tags')output[field.key]=(Array.isArray(raw)?raw:String(raw??'').split(','))
      .map(item=>String(item).trim()).filter(Boolean);
    else if(field.type==='number'||field.type==='integer')
      output[field.key]=(raw==null||String(raw).trim()==='')&&field.nullable?null:Number(raw);
    else output[field.key]=(raw==null||raw==='')&&field.nullable?null:String(raw??'');
  }
  if(kind==='type'){
    output.name=String(draft.name??'');
    output.symbol=String(draft.symbol??'');
    output.color=String(draft.color??'#d6b77a');
    output.iconSvg=draft.iconSvg?String(draft.iconSvg):null;
  }
  if(kind==='location'){
    const markerType=props.types.find(type=>type.id===output.type);
    output.color=String(draft.color??markerType?.color??'#d6b77a');
    // Article lives in the same row even when the marker-only section is open.
    output.article=String(draft.article??'');
  }
  if(kind==='layer'){
    output.bounds={x1:output.x1,y1:output.y1,x2:output.x2,y2:output.y2};
    delete output.x1;delete output.y1;delete output.x2;delete output.y2;
  }
  if(kind==='timeline')output.worldId=props.world.id;
  if(kind==='era')output.timelineId=props.timelineId;
  if(kind==='event')output.eraId=props.eraId;
  if(kind==='layer'&&props.target.create)output.worldId=props.world.id;
  if(kind==='location'&&props.target.create)output.worldId=props.world.id;
  return output;
}

export const AtlasObjectEditor=forwardRef<AtlasObjectEditorHandle,Props>(function AtlasObjectEditor(props,ref){
  const row=useMemo(()=>sourceRow(props),[
    props.target,props.worlds,props.types,props.layers,props.locations,
    props.timelines,props.eras,props.events,
  ]);
  const [draft,setDraft]=useState<Record<string,unknown>>(()=>row?asForm(props.target.kind,row):defaults(props));
  const [dirty,setDirty]=useState(Boolean(props.target.create));
  const [undo,setUndo]=useState<Record<string,unknown>[]>([]);
  const [redo,setRedo]=useState<Record<string,unknown>[]>([]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [saving,setSaving]=useState(false);
  const [geometryOpen,setGeometryOpen]=useState(false);
  const [alignOpen,setAlignOpen]=useState(false);
  const lastEdit=useRef<{key:string;at:number}|null>(null);

  useEffect(()=>{
    const next=row?asForm(props.target.kind,row):defaults(props);
    setDraft(next);setDirty(Boolean(props.target.create));setUndo([]);setRedo([]);
    setError('');setNotice('');lastEdit.current=null;
  },[props.target.kind,props.target.id,props.target.create,props.target.section]);

  const title=String(draft.name??draft.title??titles[props.target.kind]);
  useEffect(()=>{
    props.onStatus({dirty,canUndo:undo.length>0||Boolean(props.target.create),
      canRedo:redo.length>0,saving,title});
  },[dirty,undo.length,redo.length,saving,title]);
  useEffect(()=>{props.onPreview(props.target,draft);},[draft,props.target]);

  function patch(values:Record<string,unknown>,key='field'){
    setDraft(current=>{
      if(Object.entries(values).every(([name,value])=>Object.is(current[name],value)))return current;
      const now=Date.now(),same=lastEdit.current?.key===key&&now-lastEdit.current.at<650;
      if(!same)setUndo(stack=>[...stack,current].slice(-100));
      setRedo([]);setDirty(true);lastEdit.current={key,at:now};
      return {...current,...values};
    });
  }
  function undoDraft(){
    const previous=undo.at(-1);
    if(!previous){
      if(props.target.create)props.onCancel();
      return;
    }
    setUndo(stack=>stack.slice(0,-1));setRedo(stack=>[draft,...stack].slice(0,100));
    setDraft(previous);setDirty(true);lastEdit.current=null;
  }
  function redoDraft(){
    const next=redo[0];if(!next)return;
    setRedo(stack=>stack.slice(1));setUndo(stack=>[...stack,draft].slice(-100));
    setDraft(next);setDirty(true);lastEdit.current=null;
  }
  function cancel(){
    if(dirty&&!window.confirm('Отменить несохранённые изменения?'))return;
    props.onCancel();
  }
  async function save(){
    if(saving)return;
    if(!props.session.authenticated||!props.session.csrfToken){
      setError('Нужен вход администратора');return;
    }
    if(!props.target.create&&!props.target.id){setError('Объект не выбран');return;}
    if(props.target.kind==='event'&&!props.eraId){setError('Сначала выбери эпоху');return;}
    setSaving(true);setError('');setNotice('');
    try{
      const created=Boolean(props.target.create);
      const result=await request<{id?:string;ok?:boolean}>(
        root(props.target.kind)+(created?'':'/'+encodeURIComponent(props.target.id!)),
        created?'POST':'PATCH',payload(props.target.kind,draft,props),props.session.csrfToken);
      const id=result.id??props.target.id;
      if(!id)throw Error('Сервер не вернул ID созданного объекта');
      setDirty(false);setUndo([]);setRedo([]);lastEdit.current=null;
      setNotice('Сохранено');
      await props.onSaved(props.target.kind,id,created);
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setSaving(false);}
  }
  async function remove(){
    if(!props.target.id||props.target.create||!props.session.csrfToken)return;
    if(!window.confirm('Удалить объект? Сервер создаст резервную копию перед удалением.'))return;
    setSaving(true);setError('');
    try{
      await request(root(props.target.kind)+'/'+encodeURIComponent(props.target.id),
        'DELETE',undefined,props.session.csrfToken);
      setDirty(false);
      await props.onDeleted(props.target.kind,props.target.id);
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setSaving(false);}
  }
  useImperativeHandle(ref,()=>({undo:undoDraft,redo:redoDraft,save:()=>{void save();},cancel,patch}),
    [undo,redo,draft,dirty,saving,props.target,props.session.csrfToken]);

  async function uploadArticleImage(file:File):Promise<string>{
    if(!props.session.csrfToken)throw Error('Нужен вход администратора');
    setSaving(true);setError('');
    try{
      const response=await fetch('/api/admin/assets/media',{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/octet-stream','x-csrf-token':props.session.csrfToken},
        body:file,
      });
      const data=await response.json() as {filename?:string;error?:{message?:string}};
      if(!response.ok||!data.filename)throw Error(data.error?.message??'Ошибка загрузки изображения');
      setNotice('Изображение загружено и вставлено в статью.');
      return data.filename;
    }catch(reason){
      const message=reason instanceof Error?reason.message:String(reason);
      setError(message);
      throw reason;
    }finally{setSaving(false);}
  }

  async function upload(file:File,kind:'maps'|'media'|'icons'){
    if(!props.session.csrfToken)return;
    setSaving(true);setError('');
    try{
      const response=await fetch('/api/admin/assets/'+kind,{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/octet-stream','x-csrf-token':props.session.csrfToken},
        body:file,
      });
      const data=await response.json() as {filename?:string;width?:number;height?:number;error?:{message?:string}};
      if(!response.ok||!data.filename)throw Error(data.error?.message??'Ошибка загрузки');
      if(kind==='icons')patch({iconSvg:data.filename,symbol:''},'icon');
      else{
        patch({image:data.filename,
          ...(data.width?{width:data.width}:{}),...(data.height?{height:data.height}:{})},'asset');
      }
      setNotice('Файл загружен в storage. Сохранение объекта завершит операцию.');
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setSaving(false);}
  }

  const fields=fieldsFor(props.target);
  const options=(key:string):{id:string;label:string}[]=>{
    if(key==='status')return [{id:'draft',label:'Черновик'},{id:'published',label:'Опубликовано'}];
    if(key==='type'&&props.target.kind==='location')return props.types.map(type=>({
      id:type.id,label:(type.iconSvg?'▣':type.symbol)+' '+type.name,
    }));
    if(key==='parentId')return props.layers.filter(layer=>layer.id!==props.target.id).map(layer=>({
      id:layer.id,label:layer.name,
    }));
    if(key==='locationId')return props.locations.map(location=>({id:location.id,label:location.name}));
    return [];
  };
  const parentId=typeof draft.parentId==='string'?draft.parentId:null;
  const parentLayer=props.layers.find(layer=>layer.id===parentId);
  const sourceSpec={
    image:typeof draft.image==='string'&&draft.image?draft.image:null,
    width:Number(draft.width??0),height:Number(draft.height??0),name:'Редактируемая карта',
  };
  const parentSpec=parentLayer?{
    image:parentLayer.image,width:parentLayer.width,height:parentLayer.height,
    name:'Родитель: '+parentLayer.name,
  }:{
    image:props.world.image,width:props.world.width,height:props.world.height,name:'Карта мира',
  };
  const iconMode=draft.iconSvg?'svg':'emoji';

  const articleWorkspace=props.target.kind==='location'&&props.target.section==='article';
  return <Box className={articleWorkspace
    ?'atlas-object-editor atlas-object-editor-article'
    :'atlas-object-editor'}>
    <Stack sx={{p:2}} gap={1.5}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Box sx={{minWidth:0}}>
          <Typography variant="caption" color="primary.main">
            {props.target.create?'Создание':'Редактирование'} · {titles[props.target.kind]}
            {props.target.section==='article'?' · статья':''}
          </Typography>
          <Typography fontWeight={700} noWrap>{title}</Typography>
        </Box>
        <Box sx={{flex:1}}/>
        <Button size="small" onClick={cancel}>✕</Button>
      </Stack>
      {error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}
      {notice&&<Alert severity="success" onClose={()=>setNotice('')}>{notice}</Alert>}
      {dirty&&<Typography fontSize={11} color="warning.main">● Несохранённые изменения</Typography>}
      <Divider/>

      {props.target.kind==='type'?<Stack gap={1.5}>
        <Stack direction="row" gap={1.5} alignItems="center">
          <Box sx={{width:42,height:42,borderRadius:'50%',border:'3px solid',
            borderColor:String(draft.color??'#d6b77a'),display:'flex',
            alignItems:'center',justifyContent:'center',overflow:'hidden',fontSize:22}}>
            {draft.iconSvg&&draft.iconSvg!=='pending.svg'
              ?<Box component="img" src={assetUrl('icons',String(draft.iconSvg))}
                sx={{width:'100%',height:'100%',objectFit:'contain'}}/>
              :String(draft.symbol||'◆')}
          </Box>
          <Typography fontSize={12} color="text.secondary">Предпросмотр типа маркера</Typography>
        </Stack>
        <TextField size="small" label="Название типа" value={String(draft.name??'')}
          onChange={event=>patch({name:event.target.value},'name')}/>
        <Stack direction="row" gap={1} alignItems="center">
          <TextField size="small" type="color" label="Цвет" value={String(draft.color??'#d6b77a')}
            onChange={event=>patch({color:event.target.value},'color')} sx={{width:120}}/>
          <Typography fontSize={12} color="text.secondary">{String(draft.color??'')}</Typography>
        </Stack>
        <FormControl size="small">
          <InputLabel>Тип значка</InputLabel>
          <Select label="Тип значка" value={iconMode} onChange={event=>{
            if(event.target.value==='emoji')patch({iconSvg:null,symbol:String(draft.symbol||'◆')},'icon-mode');
            else patch({iconSvg:String(draft.iconSvg||'pending.svg'),symbol:''},'icon-mode');
          }}>
            <MenuItem value="emoji">Эмодзи / символ</MenuItem>
            <MenuItem value="svg">SVG-иконка</MenuItem>
          </Select>
        </FormControl>
        {iconMode==='emoji'?<TextField size="small" label="Эмодзи или символ" value={String(draft.symbol??'')}
          onChange={event=>patch({symbol:event.target.value,iconSvg:null},'symbol')}/>:
          <Stack gap={1}>
            <Typography fontSize={12} color="text.secondary">
              {draft.iconSvg&&draft.iconSvg!=='pending.svg'?'SVG: '+String(draft.iconSvg):'Выбери SVG-файл.'}
            </Typography>
            <Button component="label" variant="outlined">Загрузить SVG
              <input hidden type="file" accept="image/svg+xml,.svg" onChange={event=>{
                const file=event.target.files?.[0];if(file)void upload(file,'icons');event.target.value='';
              }}/>
            </Button>
          </Stack>}
      </Stack>:<Stack gap={1.5}>
        {fields.map(field=>field.key==='article'
          ?<RichTextEditor key={field.key} value={String(draft.article??'')}
            onChange={html=>patch({article:html},'article')}
            onUploadImage={uploadArticleImage} disabled={saving}/>
          :field.type==='flag'?<FormControlLabel key={field.key} control={
            <Checkbox checked={Boolean(draft[field.key])}
              onChange={event=>patch({[field.key]:event.target.checked},field.key)}/>
          } label={field.label}/>
          :field.type==='select'?<FormControl size="small" key={field.key}>
            <InputLabel>{field.label}</InputLabel>
            <Select label={field.label} value={String(draft[field.key]??'')}
              onChange={event=>{
                const value=event.target.value||null;
                if(props.target.kind==='location'&&field.key==='type'){
                  const type=props.types.find(item=>item.id===value);
                  patch({type:value,color:type?.color??'#d6b77a'},'type');
                }else patch({[field.key]:value},field.key);
              }}>
              {field.nullable&&<MenuItem value="">Без связи</MenuItem>}
              {options(field.key).map(option=><MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}
            </Select>
          </FormControl>
          :<TextField key={field.key} size="small" fullWidth label={field.label}
            multiline={field.type==='textarea'} minRows={field.type==='textarea'?3:undefined}
            type={field.type==='number'||field.type==='integer'?'number':field.type==='color'?'color':'text'}
            value={textValue(draft[field.key],field)}
            onChange={event=>patch({[field.key]:event.target.value},field.key)}
            slotProps={field.type==='number'||field.type==='integer'?{
              htmlInput:{step:field.type==='integer'?1:'any'}
            }:undefined}/>)}
      </Stack>}

      {(props.target.kind==='layer'||props.target.kind==='world')&&<>
        {props.target.kind==='layer'&&<Box>
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography variant="subtitle2" sx={{flex:1}}>Прозрачность предпросмотра</Typography>
            <Typography variant="caption" color="text.secondary">
              {Math.round(Number(draft.previewOpacity??.72)*100)}%
            </Typography>
          </Stack>
          <Slider size="small" min={.05} max={1} step={.05}
            value={Number(draft.previewOpacity??.72)}
            onChange={(_event,value)=>patch({previewOpacity:Number(value)},'preview-opacity')}
            valueLabelDisplay="auto"
            valueLabelFormat={value=>Math.round(value*100)+'%'}/>
          <Typography variant="caption" color="text.secondary">
            Только для сверки: это значение не сохраняется в карту.
          </Typography>
        </Box>}
        {props.target.kind==='layer'&&<Typography variant="caption" color="text.secondary">
          Shift + угловая ручка — пропорциональный resize · Ctrl + ЛКМ по изображению — двигать карту за любую точку.
        </Typography>}
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button component="label" size="small" variant="outlined">Загрузить карту
            <input hidden type="file" accept="image/png,image/webp,image/jpeg" onChange={event=>{
              const file=event.target.files?.[0];if(file)void upload(file,'maps');event.target.value='';
            }}/>
          </Button>
          {props.target.kind==='layer'&&<Button size="small" variant="outlined"
            disabled={!sourceSpec.image} onClick={()=>setGeometryOpen(true)}>Положение / размер</Button>}
          {props.target.kind==='layer'&&<Button size="small" variant="outlined"
            disabled={!sourceSpec.image||!parentSpec.image} onClick={()=>setAlignOpen(true)}>Совместить по 2 точкам</Button>}
        </Stack>
      </>}
      {(props.target.kind==='event'||props.target.kind==='era')&&<Button component="label"
        size="small" variant="outlined">Загрузить иллюстрацию
        <input hidden type="file" accept="image/png,image/webp,image/jpeg" onChange={event=>{
          const file=event.target.files?.[0];if(file)void upload(file,'media');event.target.value='';
        }}/>
      </Button>}

      <Divider/>
      <Stack direction="row" gap={1}>
        <Button size="small" variant="outlined" disabled={!undo.length} onClick={undoDraft}>↶</Button>
        <Button size="small" variant="outlined" disabled={!redo.length} onClick={redoDraft}>↷</Button>
        <Button variant="contained" disabled={!dirty||saving} onClick={()=>void save()} sx={{flex:1}}>
          {saving?'Сохраняем…':'Сохранить'}
        </Button>
      </Stack>
      {!props.target.create&&props.target.id&&<Button color="error" size="small"
        disabled={saving} onClick={()=>void remove()}>Удалить…</Button>}
      <Typography fontSize={11} color="text.secondary">
        Ctrl+S — сохранить · Esc — отменить · Ctrl+Z / Ctrl+Y — история текущей операции.
      </Typography>
    </Stack>

    <LayerGeometryDialog open={geometryOpen} child={sourceSpec} parent={parentSpec}
      bounds={{x1:Number(draft.x1),y1:Number(draft.y1),x2:Number(draft.x2),y2:Number(draft.y2)}}
      rotation={Number(draft.rotation??0)} opacity={Number(draft.previewOpacity??.72)}
      onApply={bounds=>patch(bounds,'geometry')} onClose={()=>setGeometryOpen(false)}/>
    <TwoPointAlignDialog open={alignOpen} child={sourceSpec} parent={parentSpec}
      onApply={(bounds,rotation)=>patch({...bounds,rotation},'alignment')}
      onClose={()=>setAlignOpen(false)}/>
  </Box>;
});
