import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from './store';
import {
  selectWorld, resolveDefaultWorld, navigateToWorld, selectTimeline, selectEra,
  toggleMarkerType, focusMap,
} from './viewSlice';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControl,
  FormControlLabel, InputLabel, List, ListItemButton, ListItemText, MenuItem,
  Select, Stack, TextField, Typography,
} from '@mui/material';
import type { EventRecord, LocationRecord, SearchItem } from '@atlas/shared';
import {
  useErasQuery, useEventsQuery, useLayersQuery, useLocationsQuery,
  useMarkerTypesQuery, useSearchQuery, useTimelinesQuery, useWorldsQuery,
} from './api';
import { LeafletAtlas } from './LeafletAtlas';
import { ArticleDialog } from './ArticleDialog';
import { TimelinePanel } from './TimelinePanel';
import { EventDialog } from './EventDialog';
import {
  InlineEditorPanel, type InlineEditorKind, type InlineEditorSelection,
} from '../admin/InlineEditorPanel';

export function AtlasViewer() {
  const worldsQuery = useWorldsQuery();
  const typesQuery = useMarkerTypesQuery();
  const worlds = worldsQuery.currentData ?? [];
  const types = typesQuery.currentData ?? [];
  const dispatch = useDispatch();
  const { worldId, timelineId, eraId, hiddenTypes, focus } =
    useSelector((state: RootState) => state.atlasView);

  const [eventId, setEventId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [articleId, setArticleId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editSelection, setEditSelection] = useState<InlineEditorSelection | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);

  const world = worlds.find(item => item.id === worldId) ?? worlds[0];
  const selectedWorldId = world?.id ?? '';
  const layersQuery = useLayersQuery(selectedWorldId, { skip: !selectedWorldId });
  const locationsQuery = useLocationsQuery(selectedWorldId, { skip: !selectedWorldId });
  const searchQuery = useSearchQuery(search.trim(), { skip: search.trim().length < 2 });
  const layers = layersQuery.currentData ?? [];
  const locations = locationsQuery.currentData ?? [];

  const timelinesQuery = useTimelinesQuery(selectedWorldId, { skip: !selectedWorldId });
  const timelines = timelinesQuery.currentData ?? [];
  const timeline = timelines.find(item => item.id === timelineId) ??
    timelines.find(item => item.isDefault) ?? timelines[0];
  const erasQuery = useErasQuery(timeline?.id ?? '', { skip: !timeline });
  const eras = erasQuery.currentData ?? [];
  const era = eras.find(item => item.id === eraId) ?? eras[0];
  const eventsQuery = useEventsQuery(era?.id ?? '', { skip: !era });
  const events = eventsQuery.currentData ?? [];

  useEffect(() => {
    if (!world) return;
    const query = new URLSearchParams();
    query.set('world', world.id);
    if (timeline) query.set('timeline', timeline.id);
    if (era) query.set('era', era.id);
    window.history.replaceState(null, '', window.location.pathname + '?' + query.toString());
  }, [world?.id, timeline?.id, era?.id]);

  const visibleTypes = useMemo(
    () => new Set(types.map(type => type.id).filter(id => !hiddenTypes.includes(id))),
    [types, hiddenTypes],
  );

  useEffect(() => {
    if (!worldId && worlds.length) dispatch(resolveDefaultWorld(worlds[0]?.id ?? ''));
  }, [worldId, worlds, dispatch]);

  const nextFocus = (kind: 'world' | 'layer' | 'location' | 'event', id: string) => {
    dispatch(focusMap({ kind, id }));
  };

  function confirmDiscard() {
    return !editorDirty || window.confirm('Отменить несохранённые изменения в редакторе?');
  }

  function chooseEdit(kind: InlineEditorKind, id: string) {
    if (!confirmDiscard()) return false;
    setEditMode(true);
    setEditSelection({ kind, id });
    setArticleId(null);
    setEventId(null);
    return true;
  }

  function enterEditMode() {
    if (!world) return;
    setEditMode(true);
    setEditSelection(current => current ?? { kind: 'world', id: world.id });
  }

  function exitEditMode() {
    if (!confirmDiscard()) return;
    setEditMode(false);
    setEditSelection(null);
    setEditorDirty(false);
  }

  const openWorld = (id: string) => {
    if (editMode && !confirmDiscard()) return;
    dispatch(selectWorld(id));
    setArticleId(null);
    setEventId(null);
    if (editMode) {
      setEditorDirty(false);
      setEditSelection({ kind: 'world', id });
    }
  };

  const selectLocation = (location: LocationRecord) => {
    if (editMode) {
      chooseEdit('location', location.id);
      nextFocus('location', location.id);
      return;
    }
    setArticleId(location.id);
  };

  const navigate = (
    worldIdTarget: string,
    kind: 'world' | 'layer' | 'location' | 'event',
    id: string,
  ) => {
    if (worldIdTarget !== selectedWorldId) dispatch(navigateToWorld(worldIdTarget));
    setArticleId(null);
    setEventId(null);
    nextFocus(kind, id);
  };

  const clickSearchResult = (item: SearchItem) => {
    navigate(item.worldId, item.kind, item.id);
    if (editMode && (item.kind === 'world' || item.kind === 'layer' || item.kind === 'location')) {
      chooseEdit(item.kind, item.id);
    }
    setSearch('');
  };

  const pending = worldsQuery.isLoading || typesQuery.isLoading ||
    (selectedWorldId && (layersQuery.isLoading || locationsQuery.isLoading));
  const error = worldsQuery.isError || typesQuery.isError ||
    layersQuery.isError || locationsQuery.isError;
  const selectedArticle = locations.find(location => location.id === articleId) ?? null;
  const selectedEvent = events.find(event => event.id === eventId) ?? null;

  const focusEvent = (event: EventRecord) => {
    nextFocus('event', event.id);
    if (editMode) {
      chooseEdit('event', event.id);
      return;
    }
    setEventId(event.id);
  };

  async function refetchVisibleData() {
    const tasks: PromiseLike<unknown>[] = [worldsQuery.refetch(), typesQuery.refetch()];
    if (selectedWorldId) {
      tasks.push(layersQuery.refetch(), locationsQuery.refetch(), timelinesQuery.refetch());
    }
    if (timeline) tasks.push(erasQuery.refetch());
    if (era) tasks.push(eventsQuery.refetch());
    await Promise.allSettled(tasks);
  }

  async function afterDelete() {
    await refetchVisibleData();
    if (selectedWorldId) {
      setEditSelection({ kind: 'world', id: selectedWorldId });
      nextFocus('world', selectedWorldId);
    } else {
      setEditMode(false);
      setEditSelection(null);
    }
  }

  return (
    <Box className="atlas-shell">
      <Box component="header" className="atlas-topbar">
        <Typography component="h1" fontSize={17} fontWeight={700} color="primary.main">
          The Atlas
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant={editMode ? 'contained' : 'outlined'}
          onClick={editMode ? exitEditMode : enterEditMode} disabled={!world}>
          {editMode ? 'Закрыть редактор' : 'Редактировать'}
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
          {editMode ? 'Редактор · карта остаётся открытой' : 'Просмотр · база SQLite'}
        </Typography>
      </Box>

      <Box className="atlas-workspace">
        <Box component="aside" className="atlas-sidebar" aria-label="Навигация атласа">
          <Stack spacing={2} sx={{ p: 2 }}>
            <FormControl fullWidth size="small" disabled={!worlds.length}>
              <InputLabel id="atlas-world-label">Мир</InputLabel>
              <Select labelId="atlas-world-label" label="Мир" value={selectedWorldId}
                onChange={event => openWorld(event.target.value)}>
                {worlds.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
              </Select>
            </FormControl>

            <TextField size="small" fullWidth value={search}
              onChange={event => setSearch(event.target.value)}
              label="Поиск по всем мирам" placeholder="Карта, локация, статья, тег" />
            {search.trim().length >= 2 && (
              <Box className="atlas-results">
                <Typography fontSize={12} color="text.secondary" sx={{ mb: 1 }}>
                  {searchQuery.isFetching ? 'Поиск…' : 'Результаты поиска'}
                </Typography>
                <List dense disablePadding>
                  {(searchQuery.currentData ?? []).map(item => (
                    <ListItemButton key={item.kind + item.id} onClick={() => clickSearchResult(item)}>
                      <ListItemText primary={item.title} secondary={item.subtitle + ' · ' +
                        (item.kind === 'world' ? 'мир' : item.kind === 'layer' ? 'карта' : 'локация')} />
                    </ListItemButton>
                  ))}
                </List>
                {!searchQuery.isFetching && !searchQuery.currentData?.length && (
                  <Typography color="text.secondary" fontSize={12}>Совпадений нет.</Typography>
                )}
              </Box>
            )}

            <Divider />
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography variant="subtitle2" color="primary.main" sx={{ flex: 1 }}>
                {world?.name ?? 'Миры'}
              </Typography>
              {editMode && world && (
                <Button size="small" onClick={() => chooseEdit('world', world.id)}>Править</Button>
              )}
            </Stack>
            <Typography color="text.secondary" variant="caption">
              Карты: {layers.length} · Локации: {locations.length}
            </Typography>

            <Typography variant="subtitle2">Карты-слои</Typography>
            <List dense disablePadding>
              {layers.map(layer => (
                <ListItemButton key={layer.id} selected={editSelection?.kind === 'layer' &&
                  editSelection.id === layer.id} onClick={() => {
                    nextFocus('layer', layer.id);
                    if (editMode) chooseEdit('layer', layer.id);
                  }} sx={{ pl: layer.parentId ? 3.5 : 1 }}>
                  <ListItemText primary={layer.name}
                    secondary={layer.parentId ? 'Вложенная карта' : 'Регион'} />
                </ListItemButton>
              ))}
              {!layers.length && (
                <Typography color="text.secondary" fontSize={12}>Нет вложенных карт.</Typography>
              )}
            </List>

            <TimelinePanel timelines={timelines} eras={eras} events={events}
              timelineId={timeline?.id ?? ''} eraId={era?.id ?? ''}
              onTimeline={id => { dispatch(selectTimeline(id)); setEventId(null); }}
              onEra={id => { dispatch(selectEra(id)); setEventId(null); }}
              onEvent={focusEvent}
              editing={editMode}
              onEditTimeline={id => chooseEdit('timeline', id)}
              onEditEra={id => chooseEdit('era', id)}
              loading={timelinesQuery.isFetching || erasQuery.isFetching || eventsQuery.isFetching} />

            <Typography variant="subtitle2">Типы маркеров</Typography>
            <Stack spacing={0}>
              {types.map(type => (
                <Stack key={type.id} direction="row" alignItems="center">
                  <FormControlLabel sx={{ my: -0.5, flex: 1, mr: 0 }}
                    control={<Checkbox size="small" checked={!hiddenTypes.includes(type.id)}
                      onChange={(_, checked) =>
                        dispatch(toggleMarkerType({ id: type.id, visible: checked }))} />}
                    label={<Typography fontSize={13}>{type.symbol} {type.name}</Typography>} />
                  {editMode && (
                    <Button size="small" sx={{ minWidth: 34 }}
                      onClick={() => chooseEdit('type', type.id)}>✎</Button>
                  )}
                </Stack>
              ))}
            </Stack>

            <Typography variant="subtitle2">Локации</Typography>
            <List dense disablePadding>
              {[...locations].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(location => (
                <ListItemButton key={location.id}
                  selected={editSelection?.kind === 'location' &&
                    editSelection.id === location.id}
                  onClick={() => {
                    if (hiddenTypes.includes(location.type)) {
                      dispatch(toggleMarkerType({ id: location.type, visible: true }));
                    }
                    nextFocus('location', location.id);
                    if (editMode) chooseEdit('location', location.id);
                  }}>
                  <ListItemText primary={location.name}
                    secondary={location.description || 'Локация'} />
                </ListItemButton>
              ))}
            </List>

            <Button size="small" color="secondary" variant="outlined"
              onClick={() => selectedWorldId && nextFocus('world', selectedWorldId)}>
              Показать весь мир
            </Button>
            <Divider />
            <Typography variant="caption" color="text.secondary">
              {editMode
                ? 'Кликай по маркерам, событиям и слоям: выбранный объект открывается справа, а карта остаётся на месте.'
                : 'Для обычной работы используй карту. Редактор включается кнопкой сверху.'}
            </Typography>
          </Stack>
        </Box>

        <Box component="main" className="atlas-map-area">
          {pending && (
            <Stack className="atlas-status-overlay" alignItems="center" spacing={2}>
              <CircularProgress size={30} />
              <Typography>Загружаем карту…</Typography>
            </Stack>
          )}
          {error && (
            <Alert severity="error" sx={{ m: 2, maxWidth: 650 }}>
              Не удалось прочитать данные Atlas из SQLite. Проверь, что выполнены команды
              npm.cmd run db:setup и импорт с --apply, а сервер API запущен.
            </Alert>
          )}
          {!error && !pending && world && (
            <LeafletAtlas key={world.id} world={world} layers={layers} locations={locations}
              types={types} visibleTypes={visibleTypes} focus={focus} events={events}
              onSelectLocation={selectLocation} onSelectEvent={focusEvent} />
          )}
          {!error && !pending && !world && (
            <Stack className="atlas-status-overlay" spacing={1} alignItems="center">
              <Typography variant="h6">Пока нет миров</Typography>
              <Typography color="text.secondary">Импортируй данные старого атласа в SQLite.</Typography>
            </Stack>
          )}
        </Box>

        {editMode && world && editSelection && (
          <InlineEditorPanel selection={editSelection} world={world} layers={layers}
            locations={locations} types={types} timelines={timelines} eras={eras} events={events}
            timelineId={timeline?.id ?? ''} eraId={era?.id ?? ''}
            onSaved={refetchVisibleData} onDeleted={afterDelete}
            onDirtyChange={setEditorDirty} onExit={exitEditMode} />
        )}
      </Box>

      {!editMode && (
        <>
          <EventDialog event={selectedEvent} onClose={() => setEventId(null)}
            onLink={(targetWorldId, targetId) => navigate(targetWorldId, 'location', targetId)} />
          <ArticleDialog location={selectedArticle} onClose={() => setArticleId(null)}
            onLink={(targetWorldId, targetId) => navigate(targetWorldId, 'location', targetId)} />
        </>
      )}
    </Box>
  );
}
