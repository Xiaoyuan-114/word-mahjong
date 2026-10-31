import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { Express } from 'express';
import { Server as SocketServer } from 'socket.io';
import { systemClock, type Clock } from './clock';
import { defaultTimers, SERVER_PORT, type ServerTimers } from './config';
import { createHttpApp } from './httpApp';

export interface GameServerOptions {
  port?: number;
  timers?: Partial<ServerTimers>;
  clock?: Clock;
}

export interface GameServer {
  app: Express;
  httpServer: HttpServer;
  io: SocketServer;
  port: number;
  timers: ServerTimers;
  clock: Clock;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export function createGameServer(options: GameServerOptions = {}): GameServer {
  const port = options.port ?? SERVER_PORT;
  const timers: ServerTimers = { ...defaultTimers, ...options.timers };
  const clock = options.clock ?? systemClock;
  const app = createHttpApp();
  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, {
    cors: { origin: true },
    serveClient: false,
  });

  io.on('connection', (socket) => {
    socket.emit('notice', { level: 'info', message: '已连接到牌桌服务' });
  });

  return {
    app,
    httpServer,
    io,
    port,
    timers,
    clock,
    listen(listenPort = port) {
      return new Promise<number>((resolve, reject) => {
        const onError = (error: Error) => {
          httpServer.off('error', onError);
          reject(error);
        };
        httpServer.once('error', onError);
        httpServer.listen(listenPort, () => {
          httpServer.off('error', onError);
          const address = httpServer.address();
          resolve(typeof address === 'object' && address ? address.port : listenPort);
        });
      });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        io.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
