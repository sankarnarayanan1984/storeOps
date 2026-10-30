import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  console.log(`StoreOps API listening on http://localhost:${port}`);
});
