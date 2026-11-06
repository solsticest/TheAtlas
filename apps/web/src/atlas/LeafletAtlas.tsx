import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type {
  EventRecord, LayerBounds, LayerRecord, LocationRecord, MarkerTypeRecord, WorldRecord,
} from '@atlas/shared';
import { assetUrl, depthOf, opacityAtZoom, worldBox } from './geometry';
import { moveHandle, type LayerHandle } from './layerEditorMath';
import type { EditorSection, EditorTarget } from '../admin/AtlasObjectEditor';

type Focus={kind:'world'|'layer'|'location'|'event';id:string;sequence:number};
export type AtlasMapPoint={x:number;y:number;clientX:number;clientY:number};
export type AtlasContextTarget=
  | {kind:'map';point:AtlasMapPoint}
  | {kind:'location';point:AtlasMapPoint;location:LocationRecord}
  | {kind:'event';point:AtlasMapPoint;event:EventRecord}
  | {kind:'layer';point:AtlasMapPoint;layer:LayerRecord};

type Preview={target:EditorTarget;draft:Record<string,unknown>}|null;
type Props={
  world:WorldRecord;
  layers:LayerRecord[];
  locations:LocationRecord[];
  types:MarkerTypeRecord[];
  events:EventRecord[];
  visibleTypes:Set<string>;
  focus:Focus|null;
  canEdit:boolean;
  preview:Preview;
  placementTool:'location'|'event'|null;
  moveLocationId:string|null;
  onSelectLocation:(location:LocationRecord)=>void;
  onSelectEvent:(event:EventRecord)=>void;
  onEditLocation:(location:LocationRecord,section:EditorSection)=>void;
  onContext:(target:AtlasContextTarget)=>void;
  onPlace:(point:AtlasMapPoint)=>void;
  onMoveLocation:(location:LocationRecord,x:number,y:number)=>void;
  onLayerGeometryDraft:(bounds:LayerBounds)=>void;
};
type OverlayInternal=L.ImageOverlay&{_atlasBitmap?:HTMLElement};

export const RotatableImageOverlay=L.ImageOverlay.extend({
  _initImage(this:L.ImageOverlay){
    const base=L.ImageOverlay.prototype as unknown as {_initImage:(this:L.ImageOverlay)=>void};
    base._initImage.call(this);
    const internal=this as unknown as {_image:HTMLElement;_atlasBitmap?:HTMLElement};
    const bitmap=internal._image;
    const wrapper=document.createElement('div');
    wrapper.className=bitmap.className+' atlas-image-positioner';
    bitmap.className='atlas-rotated-content';
    Object.assign(bitmap.style,{
      transform:'',translate:'',scale:'',rotate:'0deg',
      left:'0',top:'0',width:'100%',height:'100%',position:'absolute',
    });
    wrapper.appendChild(bitmap);
    internal._atlasBitmap=bitmap;internal._image=wrapper;
  },
  setRotation(this:OverlayInternal,degrees:number){
    if(this._atlasBitmap)this._atlasBitmap.style.rotate=String(degrees||0)+'deg';
    return this;
  },
}) as unknown as new(url:string,bounds:L.LatLngBoundsExpression,options?:L.ImageOverlayOptions)=>
  L.ImageOverlay&{setRotation:(degrees:number)=>void};

function leafletBounds(box:LayerBounds):L.LatLngBoundsExpression{
  return [[box.y1,box.x1],[box.y2,box.x2]];
}
function intersects(map:L.Map,box:LayerBounds){
  const bounds=map.getBounds();
  const extra=Math.max(box.x2-box.x1,box.y2-box.y1)*.1;
  return bounds.getEast()>=box.x1-extra&&bounds.getWest()<=box.x2+extra&&
    bounds.getNorth()>=box.y1-extra&&bounds.getSouth()<=box.y2+extra;
}
function pointOf(event:L.LeafletMouseEvent):AtlasMapPoint{
  const original=event.originalEvent as MouseEvent;
  return {x:event.latlng.lng,y:event.latlng.lat,clientX:original.clientX,clientY:original.clientY};
}
function markerColor(location:LocationRecord,type?:MarkerTypeRecord){
  // Preserve legacy per-location colors until a type receives an explicit non-default color.
  const typeColor=type?.color;
  if(typeColor&&typeColor.toLowerCase()!=='#d6b77a')return typeColor;
  return /^#[\da-f]{6}$/i.test(location.color)?location.color:(typeColor||'#d6b77a');
}
function markerIcon(location:LocationRecord,type?:MarkerTypeRecord,preview=false):L.DivIcon{
  const bubble=document.createElement('span');
  bubble.className='atlas-marker-bubble'+(preview?' atlas-marker-preview':'');
  bubble.style.borderColor=markerColor(location,type);
  if(type?.iconSvg){
    const image=document.createElement('img');
    image.src=assetUrl('icons',type.iconSvg);
    image.alt='';
    image.className='atlas-marker-svg';
    bubble.appendChild(image);
  }else bubble.textContent=type?.symbol||'◆';
  return L.divIcon({className:'atlas-marker-icon',iconSize:[30,30],iconAnchor:[15,15],html:bubble});
}
function eventIcon(preview=false){
  const span=document.createElement('span');
  span.className='atlas-event-symbol'+(preview?' atlas-event-preview':'');
  span.textContent='✦';
  return L.divIcon({className:'atlas-event-icon',html:span,iconSize:[32,32],iconAnchor:[16,16]});
}
function makePopup(location:LocationRecord,details:()=>void,edit:()=>void,canEdit:boolean):HTMLElement{
  const container=document.createElement('div');
  container.className='atlas-popup';
  const heading=document.createElement('strong');
  heading.textContent=location.name;container.append(heading);
  if(location.description){
    const summary=document.createElement('p');summary.textContent=location.description;container.append(summary);
  }
  const actions=document.createElement('div');actions.className='atlas-popup-actions';
  const more=document.createElement('button');more.type='button';more.textContent='Подробнее';
  more.addEventListener('click',details);actions.append(more);
  if(canEdit){
    const change=document.createElement('button');change.type='button';change.textContent='Редактировать маркер';
    change.addEventListener('click',edit);actions.append(change);
  }
  container.append(actions);return container;
}

export function LeafletAtlas({
  world,layers,locations,types,visibleTypes,focus,onSelectLocation,events,onSelectEvent,
  canEdit,preview,placementTool,moveLocationId,onEditLocation,onContext,onPlace,onMoveLocation,
  onLayerGeometryDraft,
}:Props){
  const elementRef=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<L.Map|null>(null);
  const markersRef=useRef<Map<string,L.Marker>>(new Map());
  const markerLayerRef=useRef<L.LayerGroup|null>(null);
  const eventLayerRef=useRef<L.LayerGroup|null>(null);
  const eventMarkersRef=useRef<Map<string,L.Marker>>(new Map());
  const boxesRef=useRef<Map<string,LayerBounds>>(new Map());
  const layerObjectsRef=useRef<Map<string,{layer:LayerRecord;box:LayerBounds;overlay:L.ImageOverlay&{setRotation:(d:number)=>void}}>>(new Map());
  const selectRef=useRef(onSelectLocation);
  const eventClickRef=useRef(onSelectEvent);
  const editRef=useRef(onEditLocation);
  const contextRef=useRef(onContext);
  const placeRef=useRef(onPlace);
  const moveRef=useRef(onMoveLocation);
  const layerGeometryRef=useRef(onLayerGeometryDraft);
  const filterRef=useRef(visibleTypes);
  const toolRef=useRef(placementTool);

  useEffect(()=>{selectRef.current=onSelectLocation;},[onSelectLocation]);
  useEffect(()=>{eventClickRef.current=onSelectEvent;},[onSelectEvent]);
  useEffect(()=>{editRef.current=onEditLocation;},[onEditLocation]);
  useEffect(()=>{contextRef.current=onContext;},[onContext]);
  useEffect(()=>{placeRef.current=onPlace;},[onPlace]);
  useEffect(()=>{moveRef.current=onMoveLocation;},[onMoveLocation]);
  useEffect(()=>{layerGeometryRef.current=onLayerGeometryDraft;},[onLayerGeometryDraft]);
  useEffect(()=>{filterRef.current=visibleTypes;},[visibleTypes]);
  useEffect(()=>{toolRef.current=placementTool;},[placementTool]);

  useEffect(()=>{
    const container=elementRef.current;if(!container)return;
    const map=L.map(container,{
      crs:L.CRS.Simple,minZoom:-6,maxZoom:8,zoomSnap:0,zoomDelta:.25,
      wheelPxPerZoomLevel:180,wheelDebounceTime:20,preferCanvas:true,attributionControl:false,
    });
    mapRef.current=map;
    const basePane=map.createPane('atlasBasePane');basePane.style.zIndex='210';
    const regionPane=map.createPane('atlasRegionPane');regionPane.style.zIndex='260';
    const markerPane=map.createPane('atlasMarkerPane');markerPane.style.zIndex='460';
    const eventPane=map.createPane('atlasEventPane');eventPane.style.zIndex='490';
    const draftPane=map.createPane('atlasDraftPane');draftPane.style.zIndex='520';

    const bounds=[[0,0],[world.height,world.width]] as L.LatLngBoundsExpression;
    map.setMaxBounds([[-world.height,-world.width],[world.height*2,world.width*2]]);
    if(world.image)L.imageOverlay(assetUrl('maps',world.image),bounds,{pane:'atlasBasePane',interactive:false}).addTo(map);
    else L.rectangle(bounds,{pane:'atlasBasePane',color:'#b5986d',weight:2,fillColor:'#27303d',fillOpacity:1}).addTo(map);

    const layerObjects:{layer:LayerRecord;box:LayerBounds;overlay:L.ImageOverlay&{setRotation:(d:number)=>void}}[]=[];
    boxesRef.current=new Map();layerObjectsRef.current=new Map();
    for(const layer of [...layers].sort((a,b)=>depthOf(a,layers)-depthOf(b,layers))){
      const box=worldBox(world,layers,layer.id);if(!box||!layer.image)continue;
      boxesRef.current.set(layer.id,box);
      const overlay=new RotatableImageOverlay(assetUrl('maps',layer.image),leafletBounds(box),
        {pane:'atlasRegionPane',interactive:false,opacity:0});
      overlay.setRotation(layer.rotation);
      const object={layer,box,overlay};layerObjects.push(object);layerObjectsRef.current.set(layer.id,object);
    }

    const markerLayer=L.layerGroup().addTo(map);markerLayerRef.current=markerLayer;
    const eventLayer=L.layerGroup().addTo(map);eventLayerRef.current=eventLayer;
    const markerTypes=new Map(types.map(type=>[type.id,type]));
    const markerObjects:{loc:LocationRecord;marker:L.Marker}[]=[];
    for(const loc of locations){
      const marker=L.marker([loc.y,loc.x],{
        icon:markerIcon(loc,markerTypes.get(loc.type)),interactive:true,draggable:false,pane:'atlasMarkerPane',
      });
      marker.bindPopup(makePopup(loc,()=>selectRef.current(loc),()=>editRef.current(loc,'marker'),canEdit));
      marker.on('contextmenu',(event:L.LeafletMouseEvent)=>contextRef.current({
        kind:'location',point:pointOf(event),location:loc,
      }));
      markerObjects.push({loc,marker});markersRef.current.set(loc.id,marker);
    }

    function update(){
      const zoom=map.getZoom();let orderChanged=false;
      for(const {layer,box,overlay} of layerObjects){
        const show=layer.enabled&&zoom>=layer.showAtZoom-.8&&intersects(map,box);
        if(show){
          if(!map.hasLayer(overlay)){overlay.addTo(map);orderChanged=true;}
          overlay.setRotation(layer.rotation);overlay.setOpacity(opacityAtZoom(layer,zoom));
        }else if(map.hasLayer(overlay)){map.removeLayer(overlay);orderChanged=true;}
      }
      if(orderChanged)for(const {overlay} of layerObjects)if(map.hasLayer(overlay))overlay.bringToFront();
      for(const {loc,marker} of markerObjects){
        const visible=zoom>=loc.minZoom&&filterRef.current.has(loc.type);
        if(visible&&!markerLayer.hasLayer(marker))markerLayer.addLayer(marker);
        if(!visible&&markerLayer.hasLayer(marker))markerLayer.removeLayer(marker);
      }
    }
    map.on('zoomend moveend',update);
    map.on('click',(event:L.LeafletMouseEvent)=>{
      if(toolRef.current)placeRef.current(pointOf(event));
    });
    map.on('contextmenu',(event:L.LeafletMouseEvent)=>{
      const point=pointOf(event),zoom=map.getZoom();
      const hit=[...layerObjects].reverse().find(({layer,box})=>
        layer.enabled&&zoom>=layer.showAtZoom-.8&&
        point.x>=box.x1&&point.x<=box.x2&&point.y>=box.y1&&point.y<=box.y2);
      contextRef.current(hit?{kind:'layer',point,layer:hit.layer}:{kind:'map',point});
    });
    map.fitBounds(bounds,{padding:[28,28],animate:false});update();

    let resizeFrame=0;
    const resize=()=>{
      cancelAnimationFrame(resizeFrame);
      resizeFrame=requestAnimationFrame(()=>{if(mapRef.current===map)map.invalidateSize({pan:false});});
    };
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;
    observer?.observe(container);resize();
    return()=>{
      observer?.disconnect();cancelAnimationFrame(resizeFrame);
      map.off();map.remove();mapRef.current=null;
      markersRef.current=new Map();markerLayerRef.current=null;eventLayerRef.current=null;
      eventMarkersRef.current=new Map();boxesRef.current=new Map();layerObjectsRef.current=new Map();
    };
  },[world,layers,locations,types,canEdit]);

  useEffect(()=>{
    const map=mapRef.current,layer=markerLayerRef.current;if(!map||!layer)return;
    for(const [id,marker] of markersRef.current){
      const loc=locations.find(item=>item.id===id);if(!loc)continue;
      const show=visibleTypes.has(loc.type)&&map.getZoom()>=loc.minZoom;
      if(show&&!layer.hasLayer(marker))layer.addLayer(marker);
      if(!show&&layer.hasLayer(marker))layer.removeLayer(marker);
    }
  },[visibleTypes,locations]);

  useEffect(()=>{
    const map=mapRef.current,layer=eventLayerRef.current;if(!map||!layer)return;
    layer.clearLayers();const markers=new Map<string,L.Marker>();
    for(const event of events){
      const location=event.locationId?locations.find(loc=>loc.id===event.locationId):undefined;
      const x=location?.x??event.x,y=location?.y??event.y;if(x==null||y==null)continue;
      const marker=L.marker([y,x],{interactive:true,draggable:false,pane:'atlasEventPane',icon:eventIcon()});
      marker.on('click',()=>eventClickRef.current(event));
      marker.on('contextmenu',(mouse:L.LeafletMouseEvent)=>contextRef.current({
        kind:'event',point:pointOf(mouse),event,
      }));
      const tooltip=document.createElement('span');tooltip.textContent=event.title+(event.dateLabel?' · '+event.dateLabel:'');
      marker.bindTooltip(tooltip);layer.addLayer(marker);markers.set(event.id,marker);
    }
    eventMarkersRef.current=markers;
    return()=>{layer.clearLayers();eventMarkersRef.current=new Map();};
  },[events,locations]);

  useEffect(()=>{
    for(const [id,marker] of markersRef.current){
      const location=locations.find(item=>item.id===id);
      const draggable=id===moveLocationId;
      const handler=(marker as L.Marker&{dragging?:L.Handler}).dragging;
      if(draggable)handler?.enable();else{
        handler?.disable();
        if(location)marker.setLatLng([location.y,location.x]);
      }
      marker.off('drag');
      if(draggable&&location)marker.on('drag',()=>{
        const value=marker.getLatLng();moveRef.current(location,value.lng,value.lat);
      });
    }
    const container=elementRef.current;
    if(container)container.classList.toggle('atlas-map-moving-marker',Boolean(moveLocationId));
  },[moveLocationId,locations]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||!preview)return;
    const draftLayer=L.layerGroup().addTo(map);
    const typeMap=new Map(types.map(type=>[type.id,type]));
    const kind=preview.target.kind,draft=preview.draft;

    if(kind==='location'&&preview.target.id!==moveLocationId){
      const x=Number(draft.x),y=Number(draft.y),typeId=String(draft.type??'');
      if(Number.isFinite(x)&&Number.isFinite(y)){
        const base=locations.find(loc=>loc.id===preview.target.id);
        const loc={...(base??{
          id:'__draft__',worldId:world.id,name:'Новый маркер',x,y,type:typeId,
          color:'#d6b77a',minZoom:-6,description:'',article:'',tags:[],
        }),...draft,x,y,type:typeId} as LocationRecord;
        L.marker([y,x],{pane:'atlasDraftPane',interactive:false,
          icon:markerIcon(loc,typeMap.get(typeId),true)}).addTo(draftLayer);
        if(base)markersRef.current.get(base.id)?.setOpacity(.22);
      }
    }
    if(kind==='event'){
      const linked=draft.locationId?locations.find(loc=>loc.id===draft.locationId):undefined;
      const x=linked?.x??(draft.x==null?null:Number(draft.x));
      const y=linked?.y??(draft.y==null?null:Number(draft.y));
      if(x!=null&&y!=null&&Number.isFinite(x)&&Number.isFinite(y))
        L.marker([y,x],{pane:'atlasDraftPane',interactive:false,icon:eventIcon(true)}).addTo(draftLayer);
    }
    if(kind==='layer'&&draft.image){
      let working:LayerBounds={
        x1:Number(draft.x1),y1:Number(draft.y1),x2:Number(draft.x2),y2:Number(draft.y2),
      };
      const id=preview.target.id??'__draft_layer__';
      const makeSynthetic=(bounds:LayerBounds):LayerRecord=>({
        id,worldId:world.id,name:String(draft.name??'Новый регион'),
        parentId:draft.parentId?String(draft.parentId):null,
        image:String(draft.image),width:Number(draft.width),height:Number(draft.height),bounds,
        rotation:Number(draft.rotation??0),showAtZoom:Number(draft.showAtZoom??0),
        fadeRange:Number(draft.fadeRange??.75),enabled:Boolean(draft.enabled??true),
      });
      const makeList=(bounds:LayerBounds)=>{
        const synthetic=makeSynthetic(bounds);
        return preview.target.id
          ?layers.map(layer=>layer.id===preview.target.id?synthetic:layer)
          :[...layers,synthetic];
      };
      const initialSynthetic=makeSynthetic(working);
      const initialList=makeList(working);
      const box=worldBox(world,initialList,id);
      const parentBox=worldBox(world,initialList,initialSynthetic.parentId);
      const parent=initialSynthetic.parentId
        ?initialList.find(layer=>layer.id===initialSynthetic.parentId):undefined;
      const parentWidth=parent?.width??world.width,parentHeight=parent?.height??world.height;
      if(box&&parentBox&&parentBox.x2!==parentBox.x1&&parentBox.y2!==parentBox.y1){
        const overlay=new RotatableImageOverlay(assetUrl('maps',initialSynthetic.image!),leafletBounds(box),
          {pane:'atlasDraftPane',interactive:false,opacity:.72});
        overlay.setRotation(initialSynthetic.rotation);overlay.addTo(draftLayer);
        const handles:LayerHandle[]=['nw','ne','sw','se','center'];
        const symbols:Record<LayerHandle,string>={nw:'↖',ne:'↗',sw:'↙',se:'↘',center:'✥'};
        const markers=new Map<LayerHandle,L.Marker>();
        const worldBoxFor=(bounds:LayerBounds)=>worldBox(world,makeList(bounds),id);
        const parentPoint=(latlng:L.LatLng)=>({
          x:(latlng.lng-parentBox.x1)*parentWidth/(parentBox.x2-parentBox.x1),
          y:(latlng.lat-parentBox.y1)*parentHeight/(parentBox.y2-parentBox.y1),
        });
        const worldPoint=(bounds:LayerBounds,handle:LayerHandle)=>{
          const current=worldBoxFor(bounds)!;
          if(handle==='center')return {x:(current.x1+current.x2)/2,y:(current.y1+current.y2)/2};
          return {
            x:handle==='nw'||handle==='sw'?current.x1:current.x2,
            y:handle==='nw'||handle==='ne'?current.y2:current.y1,
          };
        };
        const display=(active?:LayerHandle)=>{
          const current=worldBoxFor(working);if(!current)return;
          overlay.setBounds(L.latLngBounds(leafletBounds(current)));overlay.setRotation(initialSynthetic.rotation);
          for(const [handle,marker] of markers){
            if(handle===active)continue;
            const point=worldPoint(working,handle);marker.setLatLng([point.y,point.x]);
          }
        };
        for(const handle of handles){
          const point=worldPoint(working,handle);
          const marker=L.marker([point.y,point.x],{
            pane:'atlasDraftPane',draggable:true,autoPan:true,
            icon:L.divIcon({className:'atlas-editor-handle',
              html:'<span class="atlas-editor-handle-shape">'+symbols[handle]+'</span>',
              iconSize:[25,25],iconAnchor:[12,12]}),
          }).addTo(draftLayer);
          marker.bindTooltip(handle==='center'?'Переместить регион':'Изменить размер',{direction:'top'});
          marker.on('drag',()=>{
            try{
              working=moveHandle(working,handle,parentPoint(marker.getLatLng()));
              display(handle);
            }catch{/* keep last valid bounds while pointer crosses the opposite corner */}
          });
          marker.on('dragend',()=>{
            display();
            layerGeometryRef.current({...working});
          });
          markers.set(handle,marker);
        }
      }
    }
    return()=>{
      draftLayer.remove();
      if(preview.target.kind==='location'&&preview.target.id)
        markersRef.current.get(preview.target.id)?.setOpacity(1);
    };
  },[preview,types,world,layers,locations,moveLocationId]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||!focus)return;
    if(focus.kind==='world'){
      map.fitBounds([[0,0],[world.height,world.width]],{padding:[28,28],animate:false});return;
    }
    if(focus.kind==='layer'){
      const box=boxesRef.current.get(focus.id);if(box)map.fitBounds(leafletBounds(box),{padding:[45,45],animate:false});return;
    }
    if(focus.kind==='event'){
      const event=events.find(item=>item.id===focus.id);if(!event)return;
      const linked=event.locationId?locations.find(loc=>loc.id===event.locationId):undefined;
      const x=linked?.x??event.x,y=linked?.y??event.y;if(x==null||y==null)return;
      map.setView([y,x],Math.min(8,Math.max(map.getZoom(),1)),{animate:false});
      eventMarkersRef.current.get(event.id)?.openTooltip();return;
    }
    const loc=locations.find(item=>item.id===focus.id);if(!loc)return;
    const zoom=Math.min(8,Math.max(map.getZoom(),loc.minZoom+.5,1));
    map.setView([loc.y,loc.x],zoom,{animate:false});markersRef.current.get(loc.id)?.openPopup();
  },[focus,world,locations,events]);

  useEffect(()=>{
    const container=elementRef.current;if(!container)return;
    container.classList.toggle('atlas-map-placement',Boolean(placementTool));
  },[placementTool]);

  return <div ref={elementRef} className="atlas-map" role="application"
    aria-label={'Карта мира '+world.name}/>;
}
