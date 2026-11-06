import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography,
} from '@mui/material';
import { RotatableImageOverlay } from './LeafletAtlas';
import { assetUrl } from './geometry';
import { handlePoint, moveHandle, type LayerHandle } from './layerEditorMath';
import type { ImageBounds } from './atlasMath';

type ImageSpec = { image: string | null; width: number; height: number; name: string };
type Props = {
  open: boolean;
  parent: ImageSpec;
  child: ImageSpec;
  bounds: ImageBounds;
  rotation: number;
  onApply: (bounds: ImageBounds) => void;
  onClose: () => void;
};
const handles: LayerHandle[] = ['nw', 'ne', 'sw', 'se', 'center'];
const names: Record<LayerHandle, string> = {
  nw: '↖', ne: '↗', sw: '↙', se: '↘', center: '✥',
};
const asLeafletBounds = (bounds: ImageBounds): L.LatLngBounds =>
  L.latLngBounds([bounds.y1, bounds.x1], [bounds.y2, bounds.x2]);

export function LayerGeometryDialog({
  open, parent, child, bounds, rotation, onApply, onClose,
}: Props) {
  // This Dialog uses a conditional MUI portal: wait for the actual DOM node.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const working = useRef(bounds);
  const [preview, setPreview] = useState(bounds);
  const [error, setError] = useState('');
  const available = Boolean(parent.image && child.image &&
    parent.width > 0 && parent.height > 0 &&
    child.width > 0 && child.height > 0 &&
    Number.isFinite(bounds.x1) && Number.isFinite(bounds.x2) &&
    Number.isFinite(bounds.y1) && Number.isFinite(bounds.y2) &&
    bounds.x2 > bounds.x1 && bounds.y2 > bounds.y1);

  useEffect(() => {
    if (!open) return;
    working.current = { ...bounds };
    setPreview({ ...bounds });
    setError('');
  }, [open]); // Starting bounds are captured only when the dialog opens.

  useEffect(() => {
    if (!open || !container || !available || !parent.image || !child.image) return;
    const map = L.map(container, {
      crs: L.CRS.Simple, zoomSnap: 0, minZoom: -7, maxZoom: 9,
      attributionControl: false,
    });
    const parentPane = map.createPane('geometryParent');
    parentPane.style.zIndex = '210';
    const childPane = map.createPane('geometryChild');
    childPane.style.zIndex = '270';
    const parentBounds = [[0, 0], [parent.height, parent.width]] as L.LatLngBoundsExpression;
    L.imageOverlay(assetUrl('maps', parent.image), parentBounds, {
      pane: 'geometryParent',
    }).addTo(map);
    const overlay = new RotatableImageOverlay(assetUrl('maps', child.image),
      asLeafletBounds(working.current), {
        pane: 'geometryChild', opacity: 0.85, interactive: false,
      });
    overlay.setRotation(rotation);
    overlay.addTo(map);
    const outline = L.rectangle(asLeafletBounds(working.current), {
      color: '#eac47f', fillOpacity: 0, weight: 2, dashArray: '5 4',
    }).addTo(map);
    const points = new Map<LayerHandle, L.Marker>();

    function display(active?: LayerHandle) {
      const current = working.current;
      overlay.setBounds(asLeafletBounds(current));
      overlay.setRotation(rotation);
      outline.setBounds(asLeafletBounds(current));
      for (const [handle, marker] of points) {
        if (handle === active) continue;
        const point = handlePoint(current, handle);
        marker.setLatLng([point.y, point.x]);
      }
    }
    for (const handle of handles) {
      const point = handlePoint(working.current, handle);
      const marker = L.marker([point.y, point.x], {
        draggable: true,
        autoPan: true,
        icon: L.divIcon({
          className: 'atlas-editor-handle',
          html: '<span class="atlas-editor-handle-shape">' + names[handle] + '</span>',
          iconSize: [25, 25], iconAnchor: [12, 12],
        }),
      }).addTo(map);
      marker.bindTooltip(handle === 'center' ? 'Переместить карту' : 'Изменить размер', {
        direction: 'top',
      });
      marker.on('drag', () => {
        const position = marker.getLatLng();
        try {
          working.current = moveHandle(working.current, handle, {
            x: position.lng, y: position.lat,
          });
          display(handle);
        } catch (reason: unknown) {
          setError(reason instanceof Error ? reason.message : 'Не удалось изменить размеры');
        }
      });
      marker.on('dragend', () => {
        display();
        setPreview({ ...working.current });
      });
      points.set(handle, marker);
    }
    let disposed = false;
    let fitted = false;
    const resize = () => {
      if (disposed || !container.clientWidth || !container.clientHeight) return;
      if (!fitted) {
        map.fitBounds(parentBounds, { padding: [20, 20], animate: false });
        fitted = true;
        display();
      }
      map.invalidateSize({ pan: false });
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(container);
    const frame = requestAnimationFrame(resize);
    resize();
    return () => {
      disposed = true;
      observer?.disconnect();
      cancelAnimationFrame(frame);
      map.remove();
    };
  }, [
    open, available, container,
    parent.image, parent.width, parent.height,
    child.image, child.width, child.height, rotation,
  ]);

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
    <DialogTitle>Положение и размер карты в координатах родителя</DialogTitle>
    <DialogContent>
      <Typography fontSize={13} color="text.secondary" sx={{ mb: 2 }}>
        Перетаскивай центральную точку, чтобы переместить карту, и четыре угловые,
        чтобы изменить её размеры. Поворот сохраняется; дочерние карты не наследуют
        поворот родителя. Изменения попадут в форму, но не сохранятся в базу до «Сохранить».
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {available ? (
        <div ref={setContainer} data-testid="atlas-layer-geometry-map" style={{
          height: 'min(62vh,650px)', minHeight: 340, width: '100%',
          background: '#10151d', borderRadius: 5,
        }}/>
      ) : (
        <Alert severity="warning">
          Для настройки нужно выбрать файл дочерней карты и изображение родителя,
          указать положительные размеры и корректные границы.
        </Alert>
      )}
      <Typography variant="caption" sx={{ mt: 2, display: 'block' }}>
        X: {preview.x1.toFixed(3)} — {preview.x2.toFixed(3)}; Y: {preview.y1.toFixed(3)} — {preview.y2.toFixed(3)}
      </Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Отмена</Button>
      <Button variant="contained" disabled={!available} onClick={() => {
        onApply({ ...working.current });
        onClose();
      }}>Применить к форме</Button>
    </DialogActions>
  </Dialog>;
}
