import express from 'express';
import { healthResponseSchema } from '@atlas/shared';

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  const payload = healthResponseSchema.parse({
    ok: true,
    service: 'the-atlas-api',
  });

  response.json(payload);
});

app.listen(port, '127.0.0.1', () => {
  console.log(`The Atlas API is listening on http://127.0.0.1:${port}`);
});
