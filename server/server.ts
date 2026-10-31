import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { Express } from 'express';
import { Server as SocketServer } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@shared/types';
import { systemClock, type Clock } from './clock';
import { defaultTimers, SERVER_PORT, type ServerTimers } from './config';
import { createHttpApp } from './httpApp';
import { RoomManager } from './rooms/RoomManager';
import { RoomService } from './rooms/roomService';
import { RoomTimerScheduler } from './rooms/timerScheduler';
import { registerHandlers } from './socket/registerHandlers';
import type { TypedServer } from './socket/types';

export interface GameServerOptions {
  port?: number;
  timers?: Partial<ServerTimers>;
  clock?: Clock;
}

export interface GameServer {
  app: Express;
  httpServer: HttpServer;
  io: TypedServer;
  port: number;
  timers: ServerTimers;
  clock: Clock;
  manager: RoomManager;
  service: RoomService;
  scheduler: RoomTimerScheduler;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export function createGameServer(options: GameServerOptions = {}): GameServer {
  const port = options.port ?? SERVER_PORT;
  const timers: ServerTimers = { ...defaultTimers, ...options.timers };
  const clock = options.clock ?? systemClock;
  const app = createHttpApp();
  const httpServer = createHttpServer(app);
  const io: TypedServer = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: { origin: true },
    serveClient: false,
  });

  const manager = new RoomManager(clock, timers);
  let service!: RoomService;
  const scheduler = new RoomTimerScheduler(clock, timers, (room, now) => {
    service.timeout(room, now);
  });
  service = new RoomService(io, manager, scheduler, clock, timers);
  registerHandlers(io, service, clock);
  manager.startSweeper((room) => service.closeRoom(room, '房间闲置太久'));

  return {
    app,
    httpServer,
    io,
    port,
    timers,
    clock,
    manager,
    service,
    scheduler,
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
      service.dispose();
      manager.stopSweeper();
      return new Promise<void>((resolve, reject) => {
        try {
          io.close(() => resolve());
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
  };
}
