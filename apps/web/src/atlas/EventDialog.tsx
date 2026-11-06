import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import type { EventRecord } from '@atlas/shared';
import { assetUrl } from './geometry';

type Props={
  event:EventRecord|null; onClose:()=>void; onLink:(worldId:string,locationId:string)=>void;
  canEdit?:boolean; onEdit?:()=>void;
};
export function EventDialog({event,onClose,onLink,canEdit=false,onEdit}:Props){
  const html=useMemo(()=>DOMPurify.sanitize(event?.article??'',{
    ADD_ATTR:['data-world','data-location'],FORBID_TAGS:['script','style','iframe','object','embed','form','svg'],
  }),[event?.article]);
  const image=event?.image && /^[A-Za-z0-9][\w.-]*$/.test(event.image) && !event.image.includes('..')?
    assetUrl('media',event.image):null;
  return <Dialog open={!!event} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle sx={{pr:6}}>{event?.title}
      <IconButton aria-label="Закрыть" onClick={onClose} sx={{position:'absolute',right:10,top:10}}>✕</IconButton>
    </DialogTitle>
    <DialogContent>
      {canEdit&&event&&<Stack direction="row" justifyContent="flex-end" sx={{mb:1}}>
        <Button size="small" variant="outlined" onClick={onEdit}>Редактировать событие</Button>
      </Stack>}
      {event?.dateLabel&&<Typography variant="subtitle2" color="primary.main">{event.dateLabel}</Typography>}
      {event?.summary&&<Typography sx={{my:2}}>{event.summary}</Typography>}
      {!!event?.tags.length&&<Stack direction="row" gap={1} flexWrap="wrap" sx={{my:1}}>
        {event.tags.map(t=><Chip size="small" label={t} key={t}/>)}
      </Stack>}
      {image&&<Box component="img" alt={event?.title??''} src={image} sx={{maxWidth:'100%',my:1,borderRadius:1}}/>}
      <Box className="atlas-article" onClick={e=>{
        const link=e.target instanceof Element?e.target.closest('a[data-world][data-location]'):null;
        const world=link?.getAttribute('data-world'),location=link?.getAttribute('data-location');
        if(world&&location){e.preventDefault();onLink(world,location);}
      }} dangerouslySetInnerHTML={{__html:html}}/>
    </DialogContent>
  </Dialog>;
}
