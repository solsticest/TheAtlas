import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import type { LayerRecord, WorldRecord } from '@atlas/shared';
import { assetUrl, opacityAtZoom, depthOf, worldBox } from './geometry';
import { RotatableImageOverlay } from './LeafletAtlas';

type Props={
  open:boolean; world:WorldRecord|null; layers:LayerRecord[];
  x:number|null; y:number|null;
  onChoose:(x:number,y:number)=>void; onClose:()=>void;
};
export function MapPointPicker({open,world,layers,x,y,onChoose,onClose}:Props){
  const element=useRef<HTMLDivElement>(null);
  const change=useRef(onChoose);
  useEffect(()=>{change.current=onChoose;},[onChoose]);
  useEffect(()=>{
    const el=element.current;
    if(!open||!el||!world)return;
    const map=L.map(el,{crs:L.CRS.Simple,zoomSnap:0,minZoom:-6,maxZoom:8,attributionControl:false});
    const bounds=[[0,0],[world.height,world.width]] as L.LatLngBoundsExpression;
    const pane=map.createPane('picker-overlays');pane.style.zIndex='280';
    if(world.image)L.imageOverlay(assetUrl('maps',world.image),bounds).addTo(map);
    const details=layers.map(layer=>{
      const box=worldBox(world,layers,layer.id);
      if(!box||!layer.image)return null;
      const overlay=new RotatableImageOverlay(assetUrl('maps',layer.image),
        [[box.y1,box.x1],[box.y2,box.x2]],{pane:'picker-overlays',opacity:0});
      overlay.setRotation(layer.rotation);
      return {layer,overlay};
    }).filter((x):x is {layer:LayerRecord;overlay:L.ImageOverlay&{setRotation:(d:number)=>void}}=>!!x)
      .sort((a,b)=>depthOf(a.layer,layers)-depthOf(b.layer,layers));
    const cursor=L.circleMarker([y??world.height/2,x??world.width/2],{
      radius:7,color:'#f4c677',fillColor:'#222832',fillOpacity:1,weight:2,
    }).addTo(map);
    const update=()=>{
      for(const {layer,overlay} of details){
        if(map.getZoom()>=layer.showAtZoom && layer.enabled){
          if(!map.hasLayer(overlay))overlay.addTo(map);
          overlay.setOpacity(opacityAtZoom(layer,map.getZoom()));
        }else if(map.hasLayer(overlay))map.removeLayer(overlay);
      }
      for(const {overlay} of details)if(map.hasLayer(overlay))overlay.bringToFront();
      cursor.bringToFront();
    };
    map.on('zoomend',update);
    map.on('click',e=>{
      cursor.setLatLng(e.latlng);
      change.current(e.latlng.lng,e.latlng.lat);
    });
    map.fitBounds(bounds,{animate:false,padding:[10,10]});
    update();
    const frame=requestAnimationFrame(()=>map.invalidateSize({pan:false}));
    return ()=>{cancelAnimationFrame(frame);map.off();map.remove();};
  },[open,world,layers]);
  return <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
    <DialogTitle>Выбрать координаты на карте</DialogTitle>
    <DialogContent>
      <Typography fontSize={13} color="text.secondary" sx={{mb:1}}>
        Нажми на нужную точку. Координаты записываются в системе мира, без широты и долготы.
      </Typography>
      <div ref={element} style={{height:'min(58vh,620px)',minHeight:300,background:'#121820'}}/>
      <Typography sx={{mt:1}} fontSize={13}>
        Выбрано: {x?.toFixed(3)??'—'} / {y?.toFixed(3)??'—'}
      </Typography>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Готово</Button></DialogActions>
  </Dialog>;
}
