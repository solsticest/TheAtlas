import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LayerBounds, LayerRecord, LocationRecord, MarkerTypeRecord, WorldRecord, EventRecord } from '@atlas/shared';
import { assetUrl, depthOf, opacityAtZoom, worldBox } from './geometry';

type Focus = { kind: 'world' | 'layer' | 'location' | 'event'; id: string; sequence: number };
type Props = {
  world: WorldRecord;
  layers: LayerRecord[];
  locations: LocationRecord[];
  types: MarkerTypeRecord[];
  events: EventRecord[];
  onSelectEvent: (event: EventRecord) => void;
  visibleTypes: Set<string>;
  focus: Focus | null;
  onSelectLocation: (location: LocationRecord) => void;
};
type OverlayInternal = L.ImageOverlay & { _atlasBitmap?: HTMLElement };

// A faithful port of legacy js/app.js's rotated bitmap wrapper. Leaflet owns
// the outer positioner; its animated transform MUST NOT be applied to the bitmap.
export const RotatableImageOverlay = L.ImageOverlay.extend({
  _initImage(this: L.ImageOverlay) {
    const base = L.ImageOverlay.prototype as unknown as {
      _initImage: (this: L.ImageOverlay) => void;
    };
    base._initImage.call(this);
    const internal = this as unknown as { _image: HTMLElement; _atlasBitmap?: HTMLElement };
    const bitmap = internal._image;
    const wrapper = document.createElement('div');
    wrapper.className = bitmap.className + ' atlas-image-positioner';
    bitmap.className = 'atlas-rotated-content';
    Object.assign(bitmap.style, {
      transform: '', translate: '', scale: '', rotate: '0deg',
      left: '0', top: '0', width: '100%', height: '100%', position: 'absolute',
    });
    wrapper.appendChild(bitmap);
    internal._atlasBitmap = bitmap;
    internal._image = wrapper;
  },
  setRotation(this: OverlayInternal, degrees: number) {
    if (this._atlasBitmap) this._atlasBitmap.style.rotate = String(degrees || 0) + 'deg';
    return this;
  },
}) as unknown as new (url: string, bounds: L.LatLngBoundsExpression, options?: L.ImageOverlayOptions) =>
  L.ImageOverlay & { setRotation: (degrees: number) => void };

function leafletBounds(box: LayerBounds): L.LatLngBoundsExpression {
  return [[box.y1, box.x1], [box.y2, box.x2]];
}

function intersects(map: L.Map, box: LayerBounds): boolean {
  const bounds = map.getBounds();
  const extra = Math.max(box.x2 - box.x1, box.y2 - box.y1) * 0.1;
  return bounds.getEast() >= box.x1 - extra &&
    bounds.getWest() <= box.x2 + extra &&
    bounds.getNorth() >= box.y1 - extra &&
    bounds.getSouth() <= box.y2 + extra;
}

function markerIcon(location: LocationRecord, markerType?: MarkerTypeRecord): L.DivIcon {
  const bubble = document.createElement('span');
  bubble.className = 'atlas-marker-bubble';
  bubble.textContent = markerType?.symbol || '◆';
  bubble.style.borderColor = /^#[\da-f]{6}$/i.test(location.color) ? location.color : '#d6b77a';
  return L.divIcon({
    className: 'atlas-marker-icon', iconSize: [30, 30], iconAnchor: [15, 15],
    html: bubble,
  });
}

function makePopup(location: LocationRecord, onClick: () => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'atlas-popup';
  const heading = document.createElement('strong');
  heading.textContent = location.name;
  container.append(heading);
  if (location.description) {
    const summary = document.createElement('p');
    summary.textContent = location.description;
    container.append(summary);
  }
  const details = document.createElement('button');
  details.type = 'button';
  details.textContent = 'Подробнее';
  details.addEventListener('click', onClick);
  container.append(details);
  return container;
}

export function LeafletAtlas({
  world, layers, locations, types, visibleTypes, focus, onSelectLocation, events, onSelectEvent,
}: Props) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const eventLayerRef = useRef<L.LayerGroup | null>(null);
  const eventMarkersRef = useRef<Map<string,L.Marker>>(new Map());
  const eventClickRef = useRef(onSelectEvent);
  const boxesRef = useRef<Map<string, LayerBounds>>(new Map());
  const selectRef = useRef(onSelectLocation);
  const filterRef = useRef(visibleTypes);

  useEffect(() => { selectRef.current = onSelectLocation; }, [onSelectLocation]);
  useEffect(() => { filterRef.current = visibleTypes; }, [visibleTypes]);
  useEffect(() => { eventClickRef.current = onSelectEvent; }, [onSelectEvent]);

  useEffect(() => {
    const container = elementRef.current;
    if (!container) return;
    const map = L.map(container, {
      crs: L.CRS.Simple, minZoom: -6, maxZoom: 8, zoomSnap: 0,
      zoomDelta: 0.25, wheelPxPerZoomLevel: 180, wheelDebounceTime: 20,
      preferCanvas: true, attributionControl: false,
    });
    mapRef.current = map;
    const basePane = map.createPane('atlasBasePane');
    basePane.style.zIndex = '210';
    const regionPane = map.createPane('atlasRegionPane');
    regionPane.style.zIndex = '260';
    const markerPane = map.createPane('atlasMarkerPane');
    markerPane.style.zIndex = '460';
    const eventPane = map.createPane('atlasEventPane');
    eventPane.style.zIndex = '490';

    const bounds = [[0, 0], [world.height, world.width]] as L.LatLngBoundsExpression;
    map.setMaxBounds([[-world.height, -world.width], [world.height * 2, world.width * 2]]);
    if (world.image) {
      L.imageOverlay(assetUrl('maps', world.image), bounds, {
        pane: 'atlasBasePane', interactive: false,
      }).addTo(map);
    } else {
      L.rectangle(bounds, { pane: 'atlasBasePane', color: '#b5986d',
        weight: 2, fillColor: '#27303d', fillOpacity: 1 }).addTo(map);
    }

    const layerObjects: { layer: LayerRecord; box: LayerBounds; overlay: L.ImageOverlay & { setRotation: (degrees: number) => void } }[] = [];
    boxesRef.current = new Map();
    for (const layer of [...layers].sort((a, b) => depthOf(a, layers) - depthOf(b, layers))) {
      const box = worldBox(world, layers, layer.id);
      if (!box || !layer.image) continue;
      boxesRef.current.set(layer.id, box);
      const overlay = new RotatableImageOverlay(assetUrl('maps', layer.image),
        leafletBounds(box), { pane: 'atlasRegionPane', interactive: false, opacity: 0 });
      overlay.setRotation(layer.rotation);
      layerObjects.push({ layer, box, overlay });
    }

    const markerLayer = L.layerGroup().addTo(map);
    markerLayerRef.current = markerLayer;
    const eventLayer = L.layerGroup().addTo(map);
    eventLayerRef.current = eventLayer;
    const markerObjects: { loc: LocationRecord; marker: L.Marker }[] = [];
    const markerTypes = new Map(types.map(t => [t.id, t]));
    for (const loc of locations) {
      const marker = L.marker([loc.y, loc.x], {
        icon: markerIcon(loc, markerTypes.get(loc.type)), interactive: true, draggable: false,
        pane: 'atlasMarkerPane',
      });
      marker.bindPopup(makePopup(loc, () => selectRef.current(loc)));
      marker.on('click', () => selectRef.current(loc));
      markerObjects.push({ loc, marker });
      markersRef.current.set(loc.id, marker);
    }

    function update() {
      const zoom = map.getZoom();
      let orderChanged = false;
      for (const item of layerObjects) {
        const { layer, box, overlay } = item;
        const shouldShow = layer.enabled &&
          zoom >= layer.showAtZoom - 0.8 && intersects(map, box);
        if (shouldShow) {
          if (!map.hasLayer(overlay)) {
            overlay.addTo(map);
            orderChanged = true;
          }
          overlay.setRotation(layer.rotation);
          overlay.setOpacity(opacityAtZoom(layer, zoom));
        } else if (map.hasLayer(overlay)) {
          map.removeLayer(overlay);
          orderChanged = true;
        }
      }
      // Only reorder after mounts/unmounts, never every fractional zoom frame:
      // moving image nodes during a zoom animation makes them jump sideways.
      if (orderChanged) {
        for (const { overlay } of layerObjects) {
          if (map.hasLayer(overlay)) overlay.bringToFront();
        }
      }
      for (const { loc, marker } of markerObjects) {
        const visible = zoom >= loc.minZoom && filterRef.current.has(loc.type);
        if (visible && !markerLayer.hasLayer(marker)) markerLayer.addLayer(marker);
        if (!visible && markerLayer.hasLayer(marker)) markerLayer.removeLayer(marker);
      }
    }
    map.on('zoomend moveend', update);
    map.fitBounds(bounds, { padding: [28, 28], animate: false });
    update();
    // Leaflet calculates sizes after React has mounted the container.
    const frame = requestAnimationFrame(() => {
      if (mapRef.current === map) map.invalidateSize({ pan: false });
    });

    return () => {
      cancelAnimationFrame(frame);
      map.off('zoomend moveend', update);
      map.remove();
      mapRef.current = null;
      markersRef.current = new Map();
      markerLayerRef.current = null;
      eventLayerRef.current = null;
      eventMarkersRef.current = new Map();
      boxesRef.current = new Map();
    };
  }, [world, layers, locations, types]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markerLayer = markerLayerRef.current;
    // Marker visibility changes without rebuilding the Leaflet map.
    if (!markerLayer) return;
    for (const [id, marker] of markersRef.current) {
      const loc = locations.find(l => l.id === id);
      if (!loc) continue;
      const show = visibleTypes.has(loc.type) && map.getZoom() >= loc.minZoom;
      if (show && !markerLayer.hasLayer(marker)) markerLayer.addLayer(marker);
      if (!show && markerLayer.hasLayer(marker)) markerLayer.removeLayer(marker);
    }
  }, [visibleTypes, locations]);

  useEffect(() => {
    const map = mapRef.current, layer = eventLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const markers = new Map<string,L.Marker>();
    for (const event of events) {
      const location = event.locationId ? locations.find(loc => loc.id === event.locationId) : undefined;
      const x = location?.x ?? event.x, y = location?.y ?? event.y;
      if (x == null || y == null) continue;
      const marker = L.marker([y, x], {
        interactive:true, draggable:false, pane:'atlasEventPane',
        icon:L.divIcon({className:'atlas-event-icon',
          html:'<span class="atlas-event-symbol">✦</span>',
          iconSize:[32,32],iconAnchor:[16,16]}),
      });
      marker.on('click', () => eventClickRef.current(event));
      const popup=document.createElement('span');
      popup.textContent=event.title + (event.dateLabel?' · '+event.dateLabel:'');
      marker.bindTooltip(popup);
      layer.addLayer(marker);
      markers.set(event.id,marker);
    }
    eventMarkersRef.current = markers;
    return () => { layer.clearLayers(); eventMarkersRef.current = new Map(); };
  }, [events, locations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (focus.kind === 'world') {
      map.fitBounds([[0, 0], [world.height, world.width]], { padding: [28, 28], animate: false });
      return;
    }
    if (focus.kind === 'layer') {
      const box = boxesRef.current.get(focus.id);
      if (box) map.fitBounds(leafletBounds(box), { padding: [45, 45], animate: false });
      return;
    }
    if (focus.kind === 'event') {
      const event = events.find(item => item.id === focus.id);
      if (!event) return;
      const linked = event.locationId ? locations.find(loc=>loc.id===event.locationId) : undefined;
      const x = linked?.x ?? event.x, y = linked?.y ?? event.y;
      if (x == null || y == null) return;
      map.setView([y,x],Math.min(8,Math.max(map.getZoom(),1)),{animate:false});
      eventMarkersRef.current.get(event.id)?.openTooltip();
      return;
    }
    const loc = locations.find(item => item.id === focus.id);
    if (!loc) return;
    const zoom = Math.min(8, Math.max(map.getZoom(), loc.minZoom + 0.5, 1));
    map.setView([loc.y, loc.x], zoom, { animate: false });
    markersRef.current.get(loc.id)?.openPopup();
  }, [focus, world, locations, events]);

  return <div ref={elementRef} className="atlas-map" role="application" aria-label={'Карта мира ' + world.name} />;
}
