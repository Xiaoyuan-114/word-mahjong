import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';

export function createHttpApp(): Express {
  const app = express();
  app.use(express.json());

  app.get('/healthz', (_request, response) => {
    response.json({ ok: true });
  });

  const clientDir = path.resolve(import.meta.dirname, '../client');
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    app.use((request, response, next) => {
      if (request.method !== 'GET') {
        next();
        return;
      }
      response.sendFile(path.join(clientDir, 'index.html'), (error) => {
        if (error) {
          next(error);
        }
      });
    });
  }

  return app;
}
