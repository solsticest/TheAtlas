import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Typography,
} from '@mui/material';
import { alignTwoPoints, type Point, type ImageBounds } from './atlasMath';
import { assetUrl } from './geometry';

type ImageSpec = { image: string | null; width: number; height: number; name: string };
type Props = {
  open: boolean;
  child: ImageSpec;
  parent: ImageSpec;
  onApply: (bounds: ImageBounds, rotation: number) => void;
  onClose: () => void;
};

function ImagePointMap({
  spec, points, onPoint,
}: { spec: ImageSpec; points: Point[]; onPoint: (point: Point) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marks = useRef<L.LayerGroup | null>(null);
  const callback = useRef(onPoint);
  useEffect(() => { callback.current = onPoint; }, [onPoint]);

  useEffect(() => {
    if (!element.current || !spec.image || spec.width <= 0 || spec.height <= 0) return;
    const view = L.map(element.current, {
      crs: L.CRS.Simple, minZoom: -7, maxZoom: 6, zoomSnap: 0,
      attributionControl: false,
    });
    map.current = view;
    const bounds = [[0, 0], [spec.height, spec.width]] as L.LatLngBoundsExpression;
    L.imageOverlay(assetUrl('maps', spec.image), bounds).addTo(view);
    marks.current = L.layerGroup().addTo(view);
    view.on('click', event => {
      callback.current({ x: event.latlng.lng, y: event.latlng.lat });
    });
    view.fitBounds(bounds, { padding: [15, 15], animate: false });
    const frame = requestAnimationFrame(() => view.invalidateSize({ pan: false }));
    return () => {
      cancelAnimationFrame(frame);
      view.remove();
      map.current = null;
      marks.current = null;
    };
  }, [spec.image, spec.width, spec.height]);

  useEffect(() => {
    const group = marks.current;
    if (!group) return;
    group.clearLayers();
    points.forEach((point, i) => {
      L.circleMarker([point.y, point.x], {
        radius: 8, color: '#e9c27d', weight: 3,
        fillColor: '#1b222c', fillOpacity: 1,
      }).bindTooltip(String(i + 1), { permanent: true, direction: 'right' }).addTo(group);
    });
  }, [points]);

  return <Box>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>{spec.name}</Typography>
    {spec.image ? (
      <div ref={element} style={{
        height: 300, width: '100%', borderRadius: 5, background: '#10151c',
      }} />
    ) : (
      <Alert severity="warning">У этого изображения нет файла. Выбери карту перед совмещением.</Alert>
    )}
    <Typography color="text.secondary" fontSize={12} sx={{ mt: 1 }}>
      {points.length === 0 ? 'Нажми на первый ориентир.' :
        points.length === 1 ? 'Нажми на второй ориентир.' :
          'Оба ориентира выбраны.'}
    </Typography>
  </Box>;
}

export function TwoPointAlignDialog({ open, child, parent, onApply, onClose }: Props) {
  const [source, setSource] = useState<Point[]>([]);
  const [target, setTarget] = useState<Point[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) { setSource([]); setTarget([]); setError(''); }
  }, [open]);

  const available = !!child.image && !!parent.image &&
    child.width > 0 && child.height > 0 && parent.width > 0 && parent.height > 0;
  const choose = (previous: Point[], next: Point) => previous.length < 2
    ? [...previous, next] : [next];

  function apply() {
    if (source.length !== 2 || target.length !== 2) return;
    try {
      const geometry = alignTwoPoints(
        [source[0]!, source[1]!], [target[0]!, target[1]!],
        child.width, child.height,
      );
      onApply(geometry.bounds, geometry.rotation);
      onClose();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось совместить изображения');
    }
  }

  return <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
    <DialogTitle>Совмещение по двум ориентирам</DialogTitle>
    <DialogContent>
      <Typography color="text.secondary" fontSize={13} sx={{ mb: 2 }}>
        Сначала нажми две узнаваемые точки на дочерней карте, затем эти же
        две точки в том же порядке на изображении родителя. Координаты и поворот
        будут рассчитаны в пикселях родителя — ровно как в исходном Atlas v4.1.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {available ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <ImagePointMap spec={child} points={source}
            onPoint={point => setSource(old => choose(old, point))} />
          <ImagePointMap spec={parent} points={target}
            onPoint={point => setTarget(old => choose(old, point))} />
        </Box>
      ) : (
        <Alert severity="warning">
          Совмещение доступно, когда у дочерней карты и её родителя есть изображения
          и указаны положительные размеры файлов.
        </Alert>
      )}
      <Stack direction="row" gap={2} sx={{ mt: 2 }}>
        <Button size="small" variant="outlined" onClick={() => setSource([])}>Сбросить левую пару</Button>
        <Button size="small" variant="outlined" onClick={() => setTarget([])}>Сбросить правую пару</Button>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Отмена</Button>
      <Button variant="contained" disabled={!available || source.length !== 2 || target.length !== 2} onClick={apply}>
        Рассчитать bounds и поворот
      </Button>
    </DialogActions>
  </Dialog>;
}
