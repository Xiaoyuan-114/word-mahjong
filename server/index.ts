import { createGameServer } from './server';

const server = createGameServer();

server
  .listen()
  .then((port) => {
    console.log(`[word-mahjong] server listening on http://localhost:${port}`);
  })
  .catch((error: unknown) => {
    console.error('[word-mahjong] failed to start', error);
    process.exitCode = 1;
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close().finally(() => process.exit(0));
  });
}
