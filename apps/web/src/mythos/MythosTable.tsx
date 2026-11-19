import { useMemo, useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import type { MythosDeityRecord } from '@atlas/shared';

type TableMode='list'|'matrix';
type SortKey='name'|'rank'|'pantheon'|'influence';

export function MythosTable({deities,onSelect}:{deities:MythosDeityRecord[];onSelect:(d:MythosDeityRecord)=>void}){
  const [mode,setMode]=useState<TableMode>('list');
  const [sort,setSort]=useState<SortKey>('name');
  const domains=useMemo(()=>[...new Map(deities.flatMap(d=>d.domains)
    .map(name=>[name.toLocaleLowerCase('ru'),name])).values()].sort((a,b)=>a.localeCompare(b,'ru')),[deities]);
  const rows=useMemo(()=>[...deities].sort((a,b)=>{
    if(sort==='rank')return a.rank.localeCompare(b.rank,'ru')||a.name.localeCompare(b.name,'ru');
    if(sort==='pantheon')return (a.pantheon?.name??'').localeCompare(b.pantheon?.name??'','ru')||a.name.localeCompare(b.name,'ru');
    if(sort==='influence')return b.influence-a.influence||a.name.localeCompare(b.name,'ru');
    return a.name.localeCompare(b.name,'ru');
  }),[deities,sort]);

  return <Box className="mythos-table-shell">
    <Stack direction="row" gap={1} justifyContent="space-between" flexWrap="wrap" alignItems="center">
      <Stack direction="row" gap={1}>
        <Button size="small" variant={mode==='list'?'contained':'outlined'} onClick={()=>setMode('list')}>Таблица</Button>
        <Button size="small" variant={mode==='matrix'?'contained':'outlined'} onClick={()=>setMode('matrix')}>Матрица доменов</Button>
      </Stack>
      {mode==='list'&&<Stack direction="row" gap={.7} alignItems="center">
        <Typography variant="caption" color="text.secondary">Сортировка:</Typography>
        <Chip size="small" clickable label="Имя" variant={sort==='name'?'filled':'outlined'} onClick={()=>setSort('name')}/>
        <Chip size="small" clickable label="Ранг" variant={sort==='rank'?'filled':'outlined'} onClick={()=>setSort('rank')}/>
        <Chip size="small" clickable label="Пантеон" variant={sort==='pantheon'?'filled':'outlined'} onClick={()=>setSort('pantheon')}/>
        <Chip size="small" clickable label="Влияние" variant={sort==='influence'?'filled':'outlined'} onClick={()=>setSort('influence')}/>
      </Stack>}
    </Stack>

    {mode==='list'?<Box className="mythos-table-scroll">
      <table className="mythos-data-table">
        <thead><tr><th>Божество</th><th>Природа</th><th>Сила</th><th>Влияние</th><th>Пантеон</th><th>Основные домены</th><th>Все домены</th><th>Миры</th></tr></thead>
        <tbody>{rows.map(d=><tr key={d.id} onClick={()=>onSelect(d)}>
          <td><span className="mythos-table-symbol" style={{color:d.color}}>{d.symbol||'✧'}</span><strong>{d.name}</strong>
            {d.epithet&&<small>{d.epithet}</small>}</td>
          <td>{d.rank}</td><td>{d.power||'—'}</td><td>{d.influence}</td><td>{d.pantheon?.name??'—'}</td>
          <td>{d.primaryDomains.length?d.primaryDomains.join(', '):'—'}</td>
          <td>{d.domains.length?d.domains.join(', '):'—'}</td>
          <td>{d.worlds.length?d.worlds.map(w=>w.name).join(', '):'Мультивселенная'}</td>
        </tr>)}</tbody>
      </table>
    </Box>:<Box className="mythos-table-scroll">
      <table className="mythos-domain-matrix">
        <thead><tr><th className="is-sticky">Божество</th>{domains.map(domain=><th key={domain} title={domain}>{domain}</th>)}</tr></thead>
        <tbody>{rows.map(d=><tr key={d.id} onClick={()=>onSelect(d)}>
          <td className="is-sticky"><span style={{color:d.color}}>{d.symbol||'✧'}</span> {d.name}</td>
          {domains.map(domain=>{
            const key=domain.toLocaleLowerCase('ru');
            const has=d.domains.some(x=>x.toLocaleLowerCase('ru')===key);
            const primary=d.primaryDomains.some(x=>x.toLocaleLowerCase('ru')===key);
            return <td key={domain} className={primary?'is-primary':has?'is-secondary':''}
              title={primary?'Основной домен':has?'Второстепенный домен':'Нет'}>
              {primary?'●':has?'○':'·'}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      <Stack direction="row" gap={2} sx={{mt:1}}>
        <Typography variant="caption" color="text.secondary">● основной домен</Typography>
        <Typography variant="caption" color="text.secondary">○ второстепенный</Typography>
        <Typography variant="caption" color="text.secondary">· отсутствует</Typography>
      </Stack>
    </Box>}
  </Box>;
}
