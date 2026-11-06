import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Box, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import type { LocationRecord } from '@atlas/shared';
import { assetUrl } from './geometry';

type Props = {
  location: LocationRecord | null;
  onClose: () => void;
  onLink: (worldId: string, locationId: string) => void;
};

function safeHtml(html: string): string {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-world', 'data-location', 'data-asset'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'svg'],
  });

  for (const image of wrapper.querySelectorAll('img')) {
    const name = image.getAttribute('data-asset');
    if (!name || !/^[a-zA-Z0-9][\w.-]*$/.test(name) || name.includes('..')) {
      image.remove();
      continue;
    }
    image.setAttribute('src', assetUrl('media', name));
    image.removeAttribute('srcset');
    image.removeAttribute('onerror');
    image.setAttribute('loading', 'lazy');
  }
  for (const anchor of wrapper.querySelectorAll('a')) {
    const world = anchor.getAttribute('data-world'), location = anchor.getAttribute('data-location');
    if (world && location) {
      anchor.setAttribute('href', '#location');
      anchor.removeAttribute('target');
    } else {
      const href = anchor.getAttribute('href') ?? '';
      if (!/^https?:\/\//i.test(href)) anchor.removeAttribute('href');
      else {
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
      }
    }
  }
  return wrapper.innerHTML;
}

export function ArticleDialog({ location, onClose, onLink }: Props) {
  const html = useMemo(() => safeHtml(location?.article ?? ''), [location?.article]);
  return (
    <Dialog open={!!location} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', minHeight: 280 } }}>
      <DialogTitle sx={{ pr: 7 }}>
        {location?.name ?? 'Локация'}
        <IconButton aria-label="Закрыть статью" onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12 }}>✕</IconButton>
      </DialogTitle>
      <DialogContent>
        {location?.description && (
          <Typography color="text.secondary" sx={{ mb: 2 }}>{location.description}</Typography>
        )}
        {location?.tags && location.tags.length > 0 && (
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
            {location.tags.map(tag => <Chip key={tag} label={tag} size="small" />)}
          </Stack>
        )}
        {html ? (
          <Box className="atlas-article" onClick={event => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const link = target.closest('a[data-world][data-location]');
            if (!link) return;
            const worldId = link.getAttribute('data-world'), locationId = link.getAttribute('data-location');
            if (worldId && locationId) {
              event.preventDefault();
              onLink(worldId, locationId);
            }
          }} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <Typography color="text.secondary">Полная статья пока не добавлена.</Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}
