import type { ReactNode } from 'react';
import { Box, Button, Chip, Divider, Menu, Stack, TextField, Typography } from '@mui/material';
import type { ChronicleEventRecord } from '@atlas/shared';
import {
  chronicleFilterCount, emptyChronicleFilters, toggleFilterValue,
  type ChronicleFilterState,
} from './filters';

type Option<T extends string>={value:T;label:string};

const SIGNIFICANCE:Option<ChronicleEventRecord['significance']>[]=[
  {value:'normal',label:'Обычные'},
  {value:'important',label:'Важные'},
  {value:'key',label:'Ключевые'},
];
const KINDS:Option<ChronicleEventRecord['kind']>[]=[
  {value:'point',label:'Моменты'},
  {value:'period',label:'Периоды'},
];
const VISIBILITY:Option<ChronicleEventRecord['visibility']>[]=[
  {value:'public',label:'Публичные'},
  {value:'gm',label:'Только мастер'},
  {value:'draft',label:'Черновики'},
];

export function ChronicleFilterMenu({
  anchor,title,filters,worlds,tags,onChange,onClose,
}:{
  anchor:HTMLElement|null;
  title:string;
  filters:ChronicleFilterState;
  worlds?:{id:string;name:string}[];
  tags:string[];
  onChange:(filters:ChronicleFilterState)=>void;
  onClose:()=>void;
}){
  const count=chronicleFilterCount(filters);
  const patch=(next:Partial<ChronicleFilterState>)=>onChange({...filters,...next});
  return <Menu open={Boolean(anchor)} anchorEl={anchor} onClose={onClose}
    slotProps={{paper:{className:'chronicle-filter-menu-paper'}}}>
    <Box className="chronicle-filter-menu" onClick={event=>event.stopPropagation()}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
        <Box>
          <Typography fontWeight={800}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {count?count+' активных условий':'Все события'}
          </Typography>
        </Box>
        {count>0&&<Button size="small" onClick={()=>onChange(emptyChronicleFilters())}>Сбросить</Button>}
      </Stack>

      <TextField size="small" fullWidth label="Поиск по событиям" value={filters.query}
        placeholder="Название, описание, тег…"
        onChange={event=>patch({query:event.target.value})}/>

      {worlds&&worlds.length>0&&<FilterSection title="Миры">
        {worlds.map(world=><Chip key={world.id} size="small" label={world.name}
          variant={filters.worldIds.includes(world.id)?'filled':'outlined'}
          className={filters.worldIds.includes(world.id)?'is-selected':''}
          onClick={()=>patch({worldIds:toggleFilterValue(filters.worldIds,world.id)})}/>)}
      </FilterSection>}

      <FilterSection title="Значимость">
        {SIGNIFICANCE.map(option=><Chip key={option.value} size="small" label={option.label}
          variant={filters.significances.includes(option.value)?'filled':'outlined'}
          className={filters.significances.includes(option.value)?'is-selected':''}
          onClick={()=>patch({significances:toggleFilterValue(filters.significances,option.value)})}/>)}
      </FilterSection>

      <FilterSection title="Тип события">
        {KINDS.map(option=><Chip key={option.value} size="small" label={option.label}
          variant={filters.kinds.includes(option.value)?'filled':'outlined'}
          className={filters.kinds.includes(option.value)?'is-selected':''}
          onClick={()=>patch({kinds:toggleFilterValue(filters.kinds,option.value)})}/>)}
      </FilterSection>

      <FilterSection title="Видимость">
        {VISIBILITY.map(option=><Chip key={option.value} size="small" label={option.label}
          variant={filters.visibilities.includes(option.value)?'filled':'outlined'}
          className={filters.visibilities.includes(option.value)?'is-selected':''}
          onClick={()=>patch({visibilities:toggleFilterValue(filters.visibilities,option.value)})}/>)}
      </FilterSection>

      <Divider/>
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={800}>ТЕГИ</Typography>
        {tags.length?<Stack direction="row" gap={.7} flexWrap="wrap" sx={{mt:.8}}>
          {tags.map(tag=><Chip key={tag} size="small" label={'#'+tag}
            variant={filters.tags.includes(tag)?'filled':'outlined'}
            className={filters.tags.includes(tag)?'is-selected':''}
            onClick={()=>patch({tags:toggleFilterValue(filters.tags,tag)})}/>)}
        </Stack>:<Typography variant="body2" color="text.secondary" sx={{mt:.7}}>
          В доступных событиях пока нет тегов.
        </Typography>}
      </Box>

      <Typography variant="caption" color="text.secondary">
        Внутри одной категории варианты складываются как «ИЛИ», между категориями — как «И».
      </Typography>
    </Box>
  </Menu>;
}

function FilterSection({title,children}:{title:string;children:ReactNode}){
  return <Box>
    <Typography variant="caption" color="text.secondary" fontWeight={800}>{title.toUpperCase()}</Typography>
    <Stack direction="row" gap={.7} flexWrap="wrap" sx={{mt:.7}}>{children}</Stack>
  </Box>;
}
