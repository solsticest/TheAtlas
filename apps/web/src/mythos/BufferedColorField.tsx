import { useEffect, useRef, useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';

const colorPattern=/^#[0-9a-f]{6}$/i;
const normalizeColor=(value:string)=>colorPattern.test(value)?value.toLowerCase():null;

export function BufferedColorField({value,onCommit,label='Цвет'}:{
  value:string;onCommit:(value:string)=>void;label?:string;
}){
  const [local,setLocal]=useState(value);
  const [hex,setHex]=useState(value.toUpperCase());
  const frame=useRef<number|null>(null);
  const pending=useRef(value);

  useEffect(()=>{
    pending.current=value;
    setLocal(value);
    setHex(value.toUpperCase());
  },[value]);

  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);

  const preview=(next:string)=>{
    pending.current=next;
    if(frame.current!==null)return;
    frame.current=requestAnimationFrame(()=>{
      frame.current=null;
      setLocal(pending.current);
      setHex(pending.current.toUpperCase());
    });
  };
  const commit=(candidate:string)=>{
    const next=normalizeColor(candidate);
    if(!next){
      setLocal(value);setHex(value.toUpperCase());pending.current=value;
      return;
    }
    setLocal(next);setHex(next.toUpperCase());pending.current=next;
    if(next!==value)onCommit(next);
  };

  return <Box className="mythos-color-field">
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Box className="mythos-color-controls">
      <input
        className="mythos-native-color"
        type="color"
        aria-label={label}
        value={local}
        onInput={event=>preview((event.currentTarget as HTMLInputElement).value)}
        onBlur={()=>commit(pending.current)}
      />
      <TextField
        size="small"
        value={hex}
        inputProps={{maxLength:7,'aria-label':label+' HEX'}}
        onChange={event=>{
          const next=event.target.value;
          setHex(next);
          if(normalizeColor(next))setLocal(next.toLowerCase());
        }}
        onBlur={()=>commit(hex)}
        onKeyDown={event=>{
          if(event.key==='Enter'){
            event.preventDefault();
            commit(hex);
            event.currentTarget.blur();
          }
        }}
        sx={{width:118}}
      />
    </Box>
  </Box>;
}
