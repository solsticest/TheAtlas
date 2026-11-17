import { useMemo } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  InputLabel, MenuItem, Select, Stack, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography,
} from '@mui/material';
import type { WorldRecord, ChronicleEventRecord } from '@atlas/shared';
import {
  CHRONICLE_MONTHS, chronicleDateToDay, dayToChronicleDate, type ChronicleDate,
} from './calendar';

export const EVENT_COLOR_PRESETS=[
  {name:'Золото',value:'#d6b77a'},
  {name:'Красный',value:'#c95f5f'},
  {name:'Бордовый',value:'#8f454f'},
  {name:'Оранжевый',value:'#d8874f'},
  {name:'Зелёный',value:'#69a66f'},
  {name:'Бирюзовый',value:'#58a6a6'},
  {name:'Синий',value:'#5f86c9'},
  {name:'Индиго',value:'#6968bd'},
  {name:'Фиолетовый',value:'#9b69bd'},
  {name:'Серебро',value:'#9ca4ad'},
] as const;

export type EventDraft={
  title:string;
  summary:string;
  article:string;
  kind:'point'|'period';
  start:ChronicleDate;
  end:ChronicleDate;
  worldIds:string[];
  tagText:string;
  visibility:'draft'|'gm'|'public';
  significance:'normal'|'important'|'key';
  color:string;
  icon:string;
};

export function defaultEventDraft(day:number,worldId:string|null):EventDraft{
  return {
    title:'',summary:'',article:'',kind:'point',
    start:dayToChronicleDate(day),end:dayToChronicleDate(day+7),
    worldIds:worldId?[worldId]:[],tagText:'',visibility:'gm',
    significance:'normal',color:'#d6b77a',icon:'',
  };
}

export function draftFromRecord(event:ChronicleEventRecord):EventDraft{
  const fallback=dayToChronicleDate(0);
  return {
    title:event.title,
    summary:event.summary,
    article:event.article,
    kind:event.kind,
    start:event.startDay===null?fallback:dayToChronicleDate(event.startDay),
    end:event.endDay===null
      ?dayToChronicleDate((event.startDay??0)+7)
      :dayToChronicleDate(event.endDay),
    worldIds:event.worlds.map(world=>world.id),
    tagText:event.tags.map(tag=>tag.name).join(', '),
    visibility:event.visibility,
    significance:event.significance,
    color:event.color,
    icon:event.icon??'',
  };
}

export function draftToInput(draft:EventDraft){
  const startDay=chronicleDateToDay(draft.start);
  return {
    title:draft.title.trim(),
    summary:draft.summary,
    article:draft.article,
    kind:draft.kind,
    startDay,
    endDay:draft.kind==='period'?chronicleDateToDay(draft.end):null,
    startPrecision:'exact' as const,
    earliestDay:null,
    latestDay:null,
    endPrecision:draft.kind==='period'?'exact' as const:null,
    worldIds:draft.worldIds,
    tagNames:draft.tagText.split(',').map(value=>value.trim()).filter(Boolean),
    significance:draft.significance,
    visibility:draft.visibility,
    color:draft.color,
    icon:draft.icon.trim()||null,
  };
}

export function EventEditorDialog({
  open,draft,worlds,editing,error,saving,onChange,onClose,onSave,
}:{
  open:boolean;
  draft:EventDraft|null;
  worlds:WorldRecord[];
  editing:boolean;
  error:string;
  saving:boolean;
  onChange:(draft:EventDraft)=>void;
  onClose:()=>void;
  onSave:()=>void;
}){
  const rgb=useMemo(()=>draft?hexToRgb(draft.color):{r:214,g:183,b:122},[draft?.color]);
  if(!draft)return null;

  const set=(patch:Partial<EventDraft>)=>onChange({...draft,...patch});
  const setRgb=(part:'r'|'g'|'b',value:number)=>{
    const next={...rgb,[part]:Math.max(0,Math.min(255,Number.isFinite(value)?value:0))};
    set({color:rgbToHex(next.r,next.g,next.b)});
  };

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle>{editing?'Редактировать событие':'Новое событие Chronicle'}</DialogTitle>
    <DialogContent>
      <Stack gap={2.2} sx={{pt:1}}>
        {error&&<Alert severity="error">{error}</Alert>}
        <TextField autoFocus label="Название" value={draft.title}
          onChange={event=>set({title:event.target.value})}/>

        <Stack direction={{xs:'column',md:'row'}} gap={2} alignItems={{md:'center'}}>
          <ToggleButtonGroup exclusive size="small" value={draft.kind}
            onChange={(_event,value:'point'|'period'|null)=>value&&set({kind:value})}>
            <ToggleButton value="point">Момент</ToggleButton>
            <ToggleButton value="period">Период</ToggleButton>
          </ToggleButtonGroup>
          <FormControl size="small" sx={{minWidth:180}}>
            <InputLabel>Значимость</InputLabel>
            <Select label="Значимость" value={draft.significance}
              onChange={event=>set({significance:event.target.value as EventDraft['significance']})}>
              <MenuItem value="normal">Обычное</MenuItem>
              <MenuItem value="important">Важное</MenuItem>
              <MenuItem value="key">Ключевое</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Иконка" value={draft.icon}
            helperText="Эмодзи или короткий символ"
            inputProps={{maxLength:12}}
            onChange={event=>set({icon:event.target.value})}/>
        </Stack>

        <DateFields title="Начало" value={draft.start}
          onChange={start=>set({start})}/>
        {draft.kind==='period'&&<DateFields title="Окончание" value={draft.end}
          onChange={end=>set({end})}/>}

        <Box>
          <Typography variant="subtitle2" sx={{mb:1}}>Цвет события</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {EVENT_COLOR_PRESETS.map(preset=><Tooltip key={preset.value} title={preset.name}>
              <button type="button"
                className={'chronicle-color-swatch'+(draft.color.toLowerCase()===preset.value?' is-selected':'')}
                style={{background:preset.value}}
                onClick={()=>set({color:preset.value})}
                aria-label={preset.name}/>
            </Tooltip>)}
          </Stack>

          <Stack direction={{xs:'column',sm:'row'}} gap={1.2} sx={{mt:1.4}} alignItems={{sm:'center'}}>
            <TextField size="small" type="color" label="Свой цвет" value={draft.color}
              onChange={event=>set({color:event.target.value.toLowerCase()})}
              sx={{width:{sm:120}}}/>
            <TextField size="small" label="HEX" value={draft.color.toUpperCase()}
              inputProps={{maxLength:7}}
              onChange={event=>{
                const value=event.target.value;
                if(/^#[0-9a-f]{6}$/i.test(value))set({color:value.toLowerCase()});
              }} sx={{width:{sm:120}}}/>
            <TextField size="small" type="number" label="R" value={rgb.r}
              inputProps={{min:0,max:255}} onChange={event=>setRgb('r',Number(event.target.value))}
              sx={{width:{sm:82}}}/>
            <TextField size="small" type="number" label="G" value={rgb.g}
              inputProps={{min:0,max:255}} onChange={event=>setRgb('g',Number(event.target.value))}
              sx={{width:{sm:82}}}/>
            <TextField size="small" type="number" label="B" value={rgb.b}
              inputProps={{min:0,max:255}} onChange={event=>setRgb('b',Number(event.target.value))}
              sx={{width:{sm:82}}}/>
            <Box className="chronicle-color-preview" style={{background:draft.color}}>
              {draft.icon||'Aa'}
            </Box>
          </Stack>
        </Box>

        <FormControl fullWidth size="small">
          <InputLabel id="chronicle-worlds">Миры</InputLabel>
          <Select multiple labelId="chronicle-worlds" label="Миры" value={draft.worldIds}
            onChange={event=>set({worldIds:typeof event.target.value==='string'
              ?event.target.value.split(','):event.target.value})}>
            {worlds.map(world=><MenuItem key={world.id} value={world.id}>{world.name}</MenuItem>)}
          </Select>
        </FormControl>

        <TextField label="Теги" helperText="Через запятую: Война, Магия, Политика"
          value={draft.tagText} onChange={event=>set({tagText:event.target.value})}/>
        <TextField label="Краткое описание" multiline minRows={3} value={draft.summary}
          onChange={event=>set({summary:event.target.value})}/>

        <FormControl fullWidth size="small">
          <InputLabel id="chronicle-visibility">Видимость</InputLabel>
          <Select labelId="chronicle-visibility" label="Видимость" value={draft.visibility}
            onChange={event=>set({visibility:event.target.value as EventDraft['visibility']})}>
            <MenuItem value="draft">Черновик</MenuItem>
            <MenuItem value="gm">Только мастер</MenuItem>
            <MenuItem value="public">Публичное</MenuItem>
          </Select>
        </FormControl>

        <Typography variant="caption" color="text.secondary">
          Несохранённые изменения автоматически остаются в браузере. В SQLite они попадут только после «Сохранить».
        </Typography>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Закрыть</Button>
      <Button variant="contained" disabled={!draft.title.trim()||saving} onClick={onSave}>
        Сохранить
      </Button>
    </DialogActions>
  </Dialog>;
}

function DateFields({title,value,onChange}:{
  title:string;value:ChronicleDate;onChange:(date:ChronicleDate)=>void;
}){
  const month=CHRONICLE_MONTHS[value.monthIndex]!;
  const set=(patch:Partial<ChronicleDate>)=>{
    const next={...value,...patch};
    const max=CHRONICLE_MONTHS[next.monthIndex]!.days;
    if(next.day>max)next.day=max;
    onChange(next);
  };
  return <Stack gap={1}>
    <Typography variant="caption" color="text.secondary">{title}</Typography>
    <Stack direction={{xs:'column',sm:'row'}} gap={1}>
      <FormControl size="small" sx={{minWidth:90}}>
        <InputLabel>Эра</InputLabel>
        <Select label="Эра" value={value.era}
          onChange={event=>set({era:event.target.value as ChronicleDate['era']})}>
          <MenuItem value="AS">AS</MenuItem>
          <MenuItem value="BS">BS</MenuItem>
        </Select>
      </FormControl>
      <TextField size="small" type="number" label="Год" value={value.year}
        inputProps={{min:1}} onChange={event=>set({year:Math.max(1,Number(event.target.value)||1)})}/>
      <FormControl size="small" sx={{minWidth:150}}>
        <InputLabel>Месяц</InputLabel>
        <Select label="Месяц" value={value.monthIndex}
          onChange={event=>set({monthIndex:Number(event.target.value)})}>
          {CHRONICLE_MONTHS.map((item,index)=><MenuItem key={item.name} value={index}>{item.name}</MenuItem>)}
        </Select>
      </FormControl>
      <TextField size="small" type="number" label="День" value={value.day}
        helperText={'1–'+month.days} inputProps={{min:1,max:month.days}}
        onChange={event=>set({day:Math.min(month.days,Math.max(1,Number(event.target.value)||1))})}/>
    </Stack>
  </Stack>;
}

function hexToRgb(hex:string){
  const match=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if(!match)return {r:214,g:183,b:122};
  return {r:parseInt(match[1]!,16),g:parseInt(match[2]!,16),b:parseInt(match[3]!,16)};
}
function rgbToHex(r:number,g:number,b:number){
  const one=(value:number)=>Math.round(value).toString(16).padStart(2,'0');
  return '#'+one(r)+one(g)+one(b);
}
