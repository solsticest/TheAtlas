import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const app = createApp();
const host = process.env.HOST ?? '127.0.0.1';

app.listen(port, host, () => {
  console.log(`The Atlas API is listening on http://${host}:${port}`);
});
