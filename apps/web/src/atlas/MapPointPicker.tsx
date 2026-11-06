import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
} from '@mui/material';
import type { LayerRecord, WorldRecord } from '@atlas/shared';
import { assetUrl, opacityAtZoom, depthOf, worldBox } from './geometry';
import { RotatableImageOverlay } from './LeafletAtlas';

type Props = {
  open: boolean;
  world: WorldRecord | null;
  layers: LayerRecord[];
  x: number | null;
  y: number | null;
  onChoose: (x: number, y: number) => void;
  onClose: () => void;
};

export function MapPointPicker({ open, world, layers, x, y, onChoose, onClose }: Props) {
  // MUI Dialog renders content inside a *conditional portal*. When the dialog
  // opens, this parent component's effect can run BEFORE its child div is
  // attached, leaving the map permanently blank. A callback ref that updates
  // state runs again when the portal actually mounts the container.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [imageError, setImageError] = useState('');
  const change = useRef(onChoose);
  useEffect(() => { change.current = onChoose; }, [onChoose]);

  useEffect(() => {
    if (!open || !container || !world) return;
    let disposed = false;
    setImageError('');
    const map = L.map(container, {
      crs: L.CRS.Simple,
      zoomSnap: 0,
      minZoom: -6,
      maxZoom: 8,
      attributionControl: false,
    });
    const bounds = L.latLngBounds([0, 0], [world.height, world.width]);
    const pane = map.createPane('picker-overlays');
    pane.style.zIndex = '280';

    if (world.image) {
      L.imageOverlay(assetUrl('maps', world.image), bounds)
        .on('error', () => {
          if (!disposed) setImageError('Не удалось загрузить изображение мира. Проверь /api/assets/maps/.');
        })
        .addTo(map);
    } else {
      L.rectangle(bounds, {
        color: '#c2a36b',
        weight: 2,
        fillColor: '#25313f',
        fillOpacity: 1,
      }).addTo(map);
    }

    const details = layers.map(layer => {
      const box = worldBox(world, layers, layer.id);
      if (!box || !layer.image) return null;
      const overlay = new RotatableImageOverlay(
        assetUrl('maps', layer.image),
        [[box.y1, box.x1], [box.y2, box.x2]],
        { pane: 'picker-overlays', opacity: 0, interactive: false },
      );
      overlay.setRotation(layer.rotation);
      return { layer, overlay };
    }).filter((item): item is {
      layer: LayerRecord;
      overlay: L.ImageOverlay & { setRotation: (degrees: number) => void };
    } => item !== null).sort(
      (a, b) => depthOf(a.layer, layers) - depthOf(b.layer, layers),
    );

    const cursor = L.circleMarker(
      [y ?? world.height / 2, x ?? world.width / 2],
      { radius: 7, color: '#f4c677', fillColor: '#222832', fillOpacity: 1, weight: 2 },
    ).addTo(map);

    const update = () => {
      const zoom = map.getZoom();
      let changed = false;
      for (const { layer, overlay } of details) {
        if (layer.enabled && zoom >= layer.showAtZoom) {
          if (!map.hasLayer(overlay)) { overlay.addTo(map); changed = true; }
          overlay.setRotation(layer.rotation);
          overlay.setOpacity(opacityAtZoom(layer, zoom));
        } else if (map.hasLayer(overlay)) {
          map.removeLayer(overlay);
          changed = true;
        }
      }
      if (changed) {
        for (const { overlay } of details) {
          if (map.hasLayer(overlay)) overlay.bringToFront();
        }
      }
      cursor.bringToFront();
    };

    map.on('zoomend', update);
    map.on('click', event => {
      cursor.setLatLng(event.latlng);
      change.current(event.latlng.lng, event.latlng.lat);
    });

    // The portal's bounds may initially be 0×0 during the Dialog animation.
    // Fit only once the DOM has real dimensions; later resizes keep the
    // user's chosen camera/zoom intact.
    let fitted = false;
    const resize = () => {
      if (disposed || !container.clientWidth || !container.clientHeight) return;
      if (!fitted) {
        map.fitBounds(bounds, { animate: false, padding: [10, 10] });
        fitted = true;
        update();
      }
      map.invalidateSize({ pan: false });
    };
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    observer?.observe(container);
    const frame = requestAnimationFrame(resize);
    resize();

    return () => {
      disposed = true;
      observer?.disconnect();
      cancelAnimationFrame(frame);
      map.off();
      map.remove();
    };
  }, [open, container, world, layers]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Выбрать координаты на карте</DialogTitle>
      <DialogContent>
        <Typography fontSize={13} color="text.secondary" sx={{ mb: 1 }}>
          Нажми на нужную точку. Координаты записываются в системе мира, без широты и долготы.
        </Typography>
        {imageError && <Alert severity="warning" sx={{ mb: 1 }}>{imageError}</Alert>}
        <div ref={setContainer} data-testid="atlas-point-picker-map" style={{
          height: 'min(58vh,620px)',
          minHeight: 300,
          width: '100%',
          background: '#121820',
        }} />
        <Typography sx={{ mt: 1 }} fontSize={13}>
          Выбрано: {x?.toFixed(3) ?? '—'} / {y?.toFixed(3) ?? '—'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Готово</Button>
      </DialogActions>
    </Dialog>
  );
}
