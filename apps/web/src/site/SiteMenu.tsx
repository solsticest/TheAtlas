import { useEffect, useState } from 'react';
import { Box, ButtonBase, Snackbar, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import './siteMenu.css';

type Destination='atlas'|'chronicle'|'bible';

export function SiteMenu(){
  const navigate=useNavigate();
  const location=useLocation();
  const [open,setOpen]=useState(false);
  const [notice,setNotice]=useState(false);

  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setOpen(false);
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[open]);

  const active:Destination=location.pathname.startsWith('/chronicle')
    ?'chronicle'
    :location.pathname.startsWith('/bible')
      ?'bible'
      :'atlas';

  function go(destination:Destination){
    if(destination==='bible'){
      setOpen(false);
      setNotice(true);
      return;
    }
    navigate(destination==='atlas'?'/':'/chronicle');
    setOpen(false);
  }

  return <>
    <ButtonBase
      className={'site-menu-trigger'+(open?' is-open':'')}
      aria-label={open?'Закрыть меню сайта':'Открыть меню сайта'}
      aria-expanded={open}
      onClick={()=>setOpen(value=>!value)}
    >
      <span/><span/><span/>
    </ButtonBase>

    <Box
      className={'site-menu-backdrop'+(open?' is-open':'')}
      onClick={()=>setOpen(false)}
      aria-hidden={!open}
    />
    <Box
      component="nav"
      className={'site-menu-panel'+(open?' is-open':'')}
      aria-label="Разделы сайта"
      aria-hidden={!open}
    >
      <Typography className="site-menu-eyebrow">WORLD ARCHIVE</Typography>
      <Typography className="site-menu-title">Навигация</Typography>
      <Box className="site-menu-links">
        <ButtonBase className={'site-menu-link'+(active==='atlas'?' is-active':'')}
          onClick={()=>go('atlas')}>
          <span className="site-menu-index">01</span>
          <span>
            <strong>Atlas</strong>
            <small>Карты и места</small>
          </span>
        </ButtonBase>
        <ButtonBase className={'site-menu-link'+(active==='chronicle'?' is-active':'')}
          onClick={()=>go('chronicle')}>
          <span className="site-menu-index">02</span>
          <span>
            <strong>Chronicle</strong>
            <small>История и временные шкалы</small>
          </span>
        </ButtonBase>
        <ButtonBase className="site-menu-link" onClick={()=>go('bible')}>
          <span className="site-menu-index">03</span>
          <span>
            <strong>Bible</strong>
            <small>Боги и космология</small>
          </span>
          <span className="site-menu-soon">SOON</span>
        </ButtonBase>
      </Box>
      <Typography className="site-menu-footer">Atlas & Chronicle</Typography>
    </Box>

    <Snackbar
      open={notice}
      autoHideDuration={2600}
      onClose={()=>setNotice(false)}
      message="В разработке!"
      anchorOrigin={{vertical:'bottom',horizontal:'center'}}
    />
  </>;
}
