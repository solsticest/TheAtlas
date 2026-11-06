import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, CircularProgress, Divider, FormControl, InputLabel, List,
  ListItemButton, ListItemText, MenuItem, Select, Stack, TextField, Typography,
  Checkbox, FormControlLabel, Button,
} from '@mui/material';
import type { LocationRecord, SearchItem } from '@atlas/shared';
import { useLayersQuery, useLocationsQuery, useMarkerTypesQuery, useSearchQuery, useWorldsQuery } from './api';
import { LeafletAtlas } from './LeafletAtlas';
import { ArticleDialog } from './ArticleDialog';

type Focus = { kind: 'world' | 'layer' | 'location'; id: string; sequence: number };

export function AtlasViewer() {
  const worldsQuery = useWorldsQuery();
  const typesQuery = useMarkerTypesQuery();
  const worlds = worldsQuery.currentData ?? [];
  const types = typesQuery.currentData ?? [];
  const [worldId, setWorldId] = useState('');
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState<Focus | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);

  const world = worlds.find(item => item.id === worldId) ?? worlds[0];
  const selectedWorldId = world?.id ?? '';
  const layersQuery = useLayersQuery(selectedWorldId, { skip: !selectedWorldId });
  const locationsQuery = useLocationsQuery(selectedWorldId, { skip: !selectedWorldId });
  const searchQuery = useSearchQuery(search.trim(), { skip: search.trim().length < 2 });
  const layers = layersQuery.currentData ?? [];
  const locations = locationsQuery.currentData ?? [];

  const visibleTypes = useMemo(() => new Set(types.map(t => t.id).filter(id => !hiddenTypes.includes(id))),
    [types, hiddenTypes]);

  useEffect(() => {
    if (!worldId && worlds.length) setWorldId(worlds[0]?.id ?? '');
  }, [worldId, worlds]);

  const nextFocus = (kind: Focus['kind'], id: string) => {
    setFocus(prev => ({ kind, id, sequence: (prev?.sequence ?? 0) + 1 }));
  };

  const openWorld = (id: string) => {
    setWorldId(id);
    setArticleId(null);
    nextFocus('world', id);
  };

  const selectLocation = (loc: LocationRecord) => {
    setArticleId(loc.id);
  };

  const navigate = (worldIdTarget: string, kind: Focus['kind'], id: string) => {
    if (worldIdTarget !== selectedWorldId) setWorldId(worldIdTarget);
    setArticleId(null);
    nextFocus(kind, id);
  };

  const clickSearchResult = (item: SearchItem) => {
    navigate(item.worldId, item.kind, item.id);
    setSearch('');
  };

  const pending = worldsQuery.isLoading || typesQuery.isLoading ||
    (selectedWorldId && (layersQuery.isLoading || locationsQuery.isLoading));
  const error = worldsQuery.isError || typesQuery.isError || layersQuery.isError || locationsQuery.isError;
  const selectedArticle = locations.find(loc => loc.id === articleId) ?? null;

  return (
    <Box className="atlas-shell">
      <Box component="header" className="atlas-topbar">
        <Typography component="h1" fontSize={17} fontWeight={700} color="primary.main">The Atlas</Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">Просмотр · база SQLite</Typography>
      </Box>

      <Box className="atlas-workspace">
        <Box component="aside" className="atlas-sidebar" aria-label="Навигация атласа">
          <Stack spacing={2} sx={{ p: 2 }}>
            <FormControl fullWidth size="small" disabled={!worlds.length}>
              <InputLabel id="atlas-world-label">Мир</InputLabel>
              <Select labelId="atlas-world-label" label="Мир" value={selectedWorldId}
                onChange={event => openWorld(event.target.value)}>
                {worlds.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
              </Select>
            </FormControl>

            <TextField size="small" fullWidth value={search} onChange={event => setSearch(event.target.value)}
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
            <Typography variant="subtitle2" color="primary.main">
              {world?.name ?? 'Миры'}
            </Typography>
            <Typography color="text.secondary" variant="caption">
              Карты: {layers.length} · Локации: {locations.length}
            </Typography>

            <Typography variant="subtitle2">Карты-слои</Typography>
            <List dense disablePadding>
              {layers.map(layer => (
                <ListItemButton key={layer.id} onClick={() => nextFocus('layer', layer.id)}
                  sx={{ pl: layer.parentId ? 3.5 : 1 }}>
                  <ListItemText primary={layer.name} secondary={layer.parentId ? 'Вложенная карта' : 'Регион'} />
                </ListItemButton>
              ))}
              {!layers.length && <Typography color="text.secondary" fontSize={12}>Нет вложенных карт.</Typography>}
            </List>

            <Typography variant="subtitle2">Типы маркеров</Typography>
            <Stack spacing={0}>
              {types.map(type => (
                <FormControlLabel key={type.id} sx={{ my: -0.5 }}
                  control={<Checkbox size="small" checked={!hiddenTypes.includes(type.id)}
                    onChange={(_, checked) => setHiddenTypes(prev => checked
                      ? prev.filter(id => id !== type.id) : [...prev, type.id])} />}
                  label={<Typography fontSize={13}>{type.symbol} {type.name}</Typography>} />
              ))}
            </Stack>

            <Typography variant="subtitle2">Локации</Typography>
            <List dense disablePadding>
              {[...locations].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(loc => (
                <ListItemButton key={loc.id} onClick={() => {
                  if (hiddenTypes.includes(loc.type)) setHiddenTypes(prev => prev.filter(t => t !== loc.type));
                  nextFocus('location', loc.id);
                }}>
                  <ListItemText primary={loc.name} secondary={loc.description || 'Локация'} />
                </ListItemButton>
              ))}
            </List>

            <Button size="small" color="secondary" variant="outlined"
              onClick={() => selectedWorldId && nextFocus('world', selectedWorldId)}>
              Показать весь мир
            </Button>
            <Divider />
            <Typography variant="caption" color="text.secondary">
              Это новая версия только для просмотра. Редактирование пока остаётся в старом Atlas v4.1.
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
              types={types} visibleTypes={visibleTypes} focus={focus}
              onSelectLocation={selectLocation} />
          )}
          {!error && !pending && !world && (
            <Stack className="atlas-status-overlay" spacing={1} alignItems="center">
              <Typography variant="h6">Пока нет миров</Typography>
              <Typography color="text.secondary">Импортируй данные старого атласа в SQLite.</Typography>
            </Stack>
          )}
        </Box>
      </Box>

      <ArticleDialog location={selectedArticle} onClose={() => setArticleId(null)}
        onLink={(targetWorldId, targetId) => navigate(targetWorldId, 'location', targetId)} />
    </Box>
  );
}
