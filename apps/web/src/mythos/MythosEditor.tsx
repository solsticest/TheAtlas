import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography, Alert } from '@mui/material';
import type { MythosDeityInput, MythosDeityRecord, MythosPantheonInput,
  MythosPantheonRecord, WorldRecord } from '@atlas/shared';
import { BufferedColorField } from './BufferedColorField';

export type DeityDraft=MythosDeityInput & {domainsText:string;primaryDomainsText:string};

export const defaultDeityDraft=(worldId:string|null):DeityDraft=>({
  name:'',epithet:'',summary:'',description:'',symbol:'',color:'#d6b77a',
  rank:'Божество',power:'',influence:50,domains:[],primaryDomains:[],domainsText:'',primaryDomainsText:'',
  graphX:50,graphY:50,visibility:'gm',pantheonId:null,
  worldIds:worldId?[worldId]:[],
});
export const defaultPantheonDraft=(worldId:string|null):MythosPantheonInput=>({
  name:'',description:'',worldId,visibility:'gm',
});
export const deityRecordToDraft=(record:MythosDeityRecord):DeityDraft=>({
  name:record.name,epithet:record.epithet,summary:record.summary,
  description:record.description,symbol:record.symbol,color:record.color,
  rank:record.rank,power:record.power,influence:record.influence,
  domains:record.domains,primaryDomains:record.primaryDomains,
  domainsText:record.domains.join(', '),primaryDomainsText:record.primaryDomains.join(', '),
  graphX:record.graphX,graphY:record.graphY,visibility:record.visibility,pantheonId:record.pantheonId,
  worldIds:record.worlds.map(world=>world.id),
});
export const deityDraftToInput=({domainsText,primaryDomainsText,...draft}:DeityDraft):MythosDeityInput=>{
  const parse=(text:string)=>{
    const unique=new Map<string,string>();
    for(const raw of text.split(',')){
      const name=raw.trim(),key=name.toLocaleLowerCase('ru');
      if(name&&!unique.has(key))unique.set(key,name);
    }
    return [...unique.values()];
  };
  const domains=parse(domainsText);
  const domainKeys=new Set(domains.map(name=>name.toLocaleLowerCase('ru')));
  const primaryDomains=parse(primaryDomainsText).filter(name=>domainKeys.has(name.toLocaleLowerCase('ru')));
  return {...draft,domains,primaryDomains};
};

export function DeityEditorDialog({open,editing,draft,onChange,onClose,onSave,busy,error,worlds,
  pantheons,domainSuggestions}:{
  open:boolean;editing:boolean;draft:DeityDraft|null;
  onChange:(draft:DeityDraft)=>void;onClose:()=>void;onSave:()=>void;
  busy:boolean;error:string;worlds:WorldRecord[];
  pantheons:MythosPantheonRecord[];domainSuggestions:string[];
}){
  if(!draft)return null;
  const set=(patch:Partial<DeityDraft>)=>onChange({...draft,...patch});
  const parsed=deityDraftToInput(draft);
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle>{editing?'Редактировать божество':'Новое божество'}</DialogTitle>
    <DialogContent>
      <Stack gap={2} sx={{pt:1}}>
        {error&&<Alert severity="error">{error}</Alert>}
        <Stack direction={{xs:'column',sm:'row'}} gap={1.5}>
          <TextField autoFocus fullWidth label="Имя" required value={draft.name}
            onChange={event=>set({name:event.target.value})}/>
          <TextField fullWidth label="Эпитет / титул" placeholder="Хранитель забытых путей"
            value={draft.epithet} onChange={event=>set({epithet:event.target.value})}/>
        </Stack>
        <Stack direction={{xs:'column',sm:'row'}} gap={1.5}>
          <TextField label="Ранг / природа" fullWidth placeholder="Божество, первосущность, дух…"
            value={draft.rank} onChange={event=>set({rank:event.target.value})}/>
          <TextField label="Символ" value={draft.symbol} helperText="Эмодзи или короткий знак"
            inputProps={{maxLength:12}} onChange={event=>set({symbol:event.target.value})}/>
          <BufferedColorField value={draft.color} onCommit={color=>set({color})}/>
        </Stack>
        <Stack direction={{xs:'column',sm:'row'}} gap={1.5}>
          <TextField fullWidth label="Фактическая сила / статус" placeholder="Региональная сила, космический принцип…"
            value={draft.power} onChange={event=>set({power:event.target.value})}/>
          <TextField type="number" label="Влияние" value={draft.influence}
            helperText="0–100: условная мощь / вес в мире" inputProps={{min:0,max:100}}
            onChange={event=>set({influence:Math.max(0,Math.min(100,Number(event.target.value)||0))})}/>
        </Stack>
        <TextField label="Краткая суть" multiline minRows={2}
          placeholder="Чем уникально это божество? Одна-две мысли."
          value={draft.summary} onChange={event=>set({summary:event.target.value})}/>
        <TextField label="Домены" value={draft.domainsText} multiline minRows={2}
          helperText="Через запятую. Например: Эволюция, Природа, Перемены"
          onChange={event=>set({domainsText:event.target.value})}/>
        <TextField label="Основные домены" value={draft.primaryDomainsText}
          helperText="Подмножество доменов выше. В матрице они будут отмечены сильнее."
          onChange={event=>set({primaryDomainsText:event.target.value})}/>
        {domainSuggestions.length>0&&<Box>
          <Typography variant="caption" color="text.secondary">Уже используемые домены (нажми, чтобы добавить):</Typography>
          <Stack direction="row" gap={.7} flexWrap="wrap" sx={{mt:1}}>
            {domainSuggestions.map(name=><Chip size="small" key={name}
              label={name} variant={parsed.domains.some(d=>d.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'))
                ?'filled':'outlined'}
              onClick={()=>{
                if(parsed.domains.some(d=>d.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))return;
                set({domainsText:draft.domainsText.trim()?draft.domainsText.trim().replace(/,$/,'')+', '+name:name});
              }}/>)}
          </Stack>
        </Box>}
        <Stack direction={{xs:'column',sm:'row'}} gap={1.5}>
          <FormControl size="small" fullWidth>
            <InputLabel>Пантеон</InputLabel>
            <Select label="Пантеон" value={draft.pantheonId??''}
              onChange={event=>set({pantheonId:event.target.value||null})}>
              <MenuItem value="">Без пантеона</MenuItem>
              {pantheons.map(item=><MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Миры</InputLabel>
            <Select multiple label="Миры" value={draft.worldIds}
              renderValue={value=>value.length?value.map(id=>worlds.find(w=>w.id===id)?.name??id).join(', '):'Все миры'}
              onChange={event=>set({worldIds:typeof event.target.value==='string'
                ?event.target.value.split(','):event.target.value})}>
              {worlds.map(item=><MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Видимость</InputLabel>
            <Select label="Видимость" value={draft.visibility}
              onChange={event=>set({visibility:event.target.value as DeityDraft['visibility']})}>
              <MenuItem value="gm">Только мастер</MenuItem>
              <MenuItem value="public">Публичное</MenuItem>
              <MenuItem value="draft">Черновик</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        <Typography color="text.secondary" variant="caption">
          Без выбранных миров божество считается общим для всей мультивселенной.
          Черновики и записи «Только мастер» скрыты от гостей.
        </Typography>
        <TextField label="Предания, культ и устройство" multiline minRows={6}
          placeholder="Происхождение, философия, последователи, ритуалы, конфликты…"
          value={draft.description} onChange={event=>set({description:event.target.value})}/>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Отмена</Button>
      <Button variant="contained" disabled={busy||!draft.name.trim()||!draft.rank.trim()}
        onClick={onSave}>{busy?'Сохранение…':'Сохранить'}</Button>
    </DialogActions>
  </Dialog>;
}

export function PantheonEditorDialog({open,editing,draft,onChange,onClose,onSave,busy,error,worlds}:{
  open:boolean;editing:boolean;draft:MythosPantheonInput|null;
  onChange:(draft:MythosPantheonInput)=>void;onClose:()=>void;onSave:()=>void;
  busy:boolean;error:string;worlds:WorldRecord[];
}){
  if(!draft)return null;
  const set=(patch:Partial<MythosPantheonInput>)=>onChange({...draft,...patch});
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>{editing?'Редактировать пантеон':'Новый пантеон'}</DialogTitle>
    <DialogContent>
      <Stack gap={2} sx={{pt:1}}>
        {error&&<Alert severity="error">{error}</Alert>}
        <TextField autoFocus fullWidth required label="Название" value={draft.name}
          onChange={event=>set({name:event.target.value})}/>
        <FormControl size="small" fullWidth>
          <InputLabel>Принадлежность</InputLabel>
          <Select label="Принадлежность" value={draft.worldId??''}
            onChange={event=>set({worldId:event.target.value||null})}>
            <MenuItem value="">Мультивселенная / общий</MenuItem>
            {worlds.map(item=><MenuItem value={item.id} key={item.id}>{item.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth>
          <InputLabel>Видимость</InputLabel>
          <Select label="Видимость" value={draft.visibility}
            onChange={event=>set({visibility:event.target.value as MythosPantheonInput['visibility']})}>
            <MenuItem value="gm">Только мастер</MenuItem>
            <MenuItem value="public">Публичное</MenuItem>
            <MenuItem value="draft">Черновик</MenuItem>
          </Select>
        </FormControl>
        <TextField label="История и устройство пантеона" multiline minRows={5}
          placeholder="Происхождение, взаимоотношения, культ, космологическая роль…"
          value={draft.description} onChange={event=>set({description:event.target.value})}/>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Отмена</Button>
      <Button variant="contained" disabled={busy||!draft.name.trim()}
        onClick={onSave}>{busy?'Сохранение…':'Сохранить'}</Button>
    </DialogActions>
  </Dialog>;
}
