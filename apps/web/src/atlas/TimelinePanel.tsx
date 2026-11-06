import {
  Box, Divider, FormControl, InputLabel, List, ListItemButton, ListItemText,
  MenuItem, Select, Stack, Typography,
} from '@mui/material';
import type { TimelineRecord, EraRecord, EventRecord } from '@atlas/shared';

type Props={
  timelines:TimelineRecord[];
  eras:EraRecord[];
  events:EventRecord[];
  timelineId:string;
  eraId:string;
  onTimeline:(id:string)=>void;
  onEra:(id:string)=>void;
  onEvent:(event:EventRecord)=>void;
  loading:boolean;
};
export function TimelinePanel({timelines,eras,events,timelineId,eraId,onTimeline,onEra,onEvent,loading}:Props){
  return <Stack gap={1.5}>
    <Divider />
    <Typography variant="subtitle2" color="primary.main">История мира</Typography>
    {timelines.length===0 && <Typography fontSize={12} color="text.secondary">
      Опубликованных линий времени пока нет.
    </Typography>}
    {timelines.length>0 && <>
      <FormControl size="small" fullWidth>
        <InputLabel id="timeline-choice">Таймлайн</InputLabel>
        <Select labelId="timeline-choice" label="Таймлайн" value={timelineId} onChange={event=>onTimeline(event.target.value)}>
          {timelines.map(t=><MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" fullWidth disabled={!eras.length}>
        <InputLabel id="era-choice">Эпоха</InputLabel>
        <Select labelId="era-choice" label="Эпоха" value={eraId} onChange={event=>onEra(event.target.value)}>
          {eras.map(e=><MenuItem key={e.id} value={e.id}>{e.name}{e.dateLabel?' — '+e.dateLabel:''}</MenuItem>)}
        </Select>
      </FormControl>
      <Typography color="text.secondary" fontSize={12}>
        {loading?'Загружаем события…':eras.length===0?'В этом таймлайне нет эпох.':events.length===0?'В этой эпохе пока нет опубликованных событий.':'События эпохи'}
      </Typography>
      <List dense disablePadding>
        {events.map(event=><ListItemButton key={event.id} onClick={()=>onEvent(event)} sx={{borderLeft:'2px solid #8f744e',pl:1.5}}>
          <ListItemText primary={event.title} secondary={
            <Box component="span" sx={{display:'block',fontSize:12,color:'text.secondary'}}>
              {event.dateLabel && <Box component="span" sx={{display:'block',color:'primary.main'}}>{event.dateLabel}</Box>}
              {event.summary}
            </Box>
          } />
        </ListItemButton>)}
      </List>
    </>}
  </Stack>;
}
