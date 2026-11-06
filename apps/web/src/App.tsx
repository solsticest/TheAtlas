import { useEffect, useState } from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';

type HealthResponse = {
  ok: boolean;
  service: string;
};

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as HealthResponse;
      })
      .then(setHealth)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') {
          return;
        }
        setError(reason instanceof Error ? reason.message : 'Неизвестная ошибка');
      });

    return () => controller.abort();
  }, []);

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateRows: '64px 1fr',
        bgcolor: 'background.default',
      }}
    >
      <Box
        component="header"
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 3,
          borderBottom: 1,
          borderColor: 'rgba(214,183,122,0.2)',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="h6" color="primary.main">
          The Atlas
        </Typography>
      </Box>

      <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ p: 4 }}>
        <Typography variant="h4">Миграционный shell</Typography>
        <Typography color="text.secondary" textAlign="center" maxWidth={720}>
          Legacy-атлас пока не заменён. Этот экран подтверждает только запуск нового React-клиента
          и связь с Node.js API.
        </Typography>

        {!health && !error && <CircularProgress size={28} />}
        {health && (
          <Typography color="primary.main">
            API: {health.ok ? 'доступен' : 'ошибка'} · {health.service}
          </Typography>
        )}
        {error && <Typography color="error.main">API недоступен: {error}</Typography>}
      </Stack>
    </Box>
  );
}
