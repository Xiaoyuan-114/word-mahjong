import { io, type Socket } from 'socket.io-client';
import type { Ack, RoomSettings, RoomSnapshot } from '@shared/types';
import { createGameServer, type GameServer } from '../../server';

export interface TestServer {
  server: GameServer;
  port: number;
  url: string;
  close(): Promise<void>;
}

export interface TestClient {
  socket: Socket;
  readonly lastSnapshot: RoomSnapshot | null;
  waitForSnapshot(
    predicate?: (snapshot: RoomSnapshot) => boolean,
    timeoutMs?: number,
  ): Promise<RoomSnapshot>;
  emitAck<T>(event: string, payload: unknown): Promise<Ack<T>>;
  close(): void;
}

interface Waiter {
  predicate: (snapshot: RoomSnapshot) => boolean;
  resolve: (snapshot: RoomSnapshot) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  mode: 'pin-ci',
  maxPlayers: 4,
  openHands: false,
  claimPolicy: 'off',
};

export async function startTestServer(
  timers: Record<string, number> = {},
): Promise<TestServer> {
  const server = createGameServer({
    port: 0,
    timers: {
      turnMs: 10_000,
      voteMs: 3000,
      claimMs: 3000,
      disconnectedTurnMs: 5000,
      roomSweepMs: 600_000,
      roomIdleMs: 600_000,
      ...timers,
    },
  });
  const port = await server.listen();
  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => server.close(),
  };
}

export async function connectClient(url: string): Promise<TestClient> {
  const socket = io(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    autoConnect: false,
  });

  let lastSnapshot: RoomSnapshot | null = null;
  const waiters: Waiter[] = [];

  socket.on('room:snapshot', (snapshot: RoomSnapshot) => {
    lastSnapshot = snapshot;
    for (const waiter of [...waiters]) {
      if (waiter.predicate(snapshot)) {
        clearTimeout(waiter.timer);
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        waiter.resolve(snapshot);
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
    socket.connect();
  });

  return {
    socket,
    get lastSnapshot() {
      return lastSnapshot;
    },
    waitForSnapshot(predicate = () => true, timeoutMs = 3000) {
      return new Promise<RoomSnapshot>((resolve, reject) => {
        if (lastSnapshot && predicate(lastSnapshot)) {
          resolve(lastSnapshot);
          return;
        }
        const timer = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.timer === timer);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('timed out waiting for a room snapshot'));
        }, timeoutMs);
        waiters.push({ predicate, resolve, reject, timer });
      });
    },
    emitAck<T>(event: string, payload: unknown) {
      return new Promise<Ack<T>>((resolve) => {
        socket.emit(event, payload, (response: Ack<T>) => resolve(response));
      });
    },
    close() {
      socket.disconnect();
    },
  };
}

export async function createRoom(
  client: TestClient,
  nickname: string,
  settings: Partial<RoomSettings> = {},
): Promise<{ roomCode: string; token: string; snapshot: RoomSnapshot }> {
  const response = await client.emitAck<{
    roomCode: string;
    token: string;
    snapshot: RoomSnapshot;
  }>('room:create', {
    nickname,
    settings: { ...DEFAULT_SETTINGS, ...settings },
  });
  if (!response.ok) {
    throw new Error(`${response.error.code}: ${response.error.message}`);
  }
  return response.data;
}

export async function joinRoom(
  client: TestClient,
  roomCode: string,
  nickname: string,
): Promise<{ token: string; snapshot: RoomSnapshot }> {
  const response = await client.emitAck<{ token: string; snapshot: RoomSnapshot }>(
    'room:join',
    { roomCode, nickname },
  );
  if (!response.ok) {
    throw new Error(`${response.error.code}: ${response.error.message}`);
  }
  return response.data;
}

export async function actAndWait(
  client: TestClient,
  event: string,
  payload: unknown,
): Promise<RoomSnapshot> {
  const current = client.lastSnapshot?.stateVersion ?? 0;
  const snapshotPromise = client.waitForSnapshot(
    (snapshot) => snapshot.stateVersion > current,
  );
  const response = await client.emitAck<null>(event, payload);
  if (!response.ok) {
    throw new Error(`${response.error.code}: ${response.error.message}`);
  }
  return snapshotPromise;
}

export async function expectError(
  client: TestClient,
  event: string,
  payload: unknown,
  code: string,
): Promise<void> {
  const response = await client.emitAck<null>(event, payload);
  if (response.ok) {
    throw new Error(`expected ${code}, but the action succeeded`);
  }
  if (response.error.code !== code) {
    throw new Error(`expected ${code}, got ${response.error.code}: ${response.error.message}`);
  }
}

export function waitForVersion(
  client: TestClient,
  version: number,
  timeoutMs = 3000,
): Promise<RoomSnapshot> {
  return client.waitForSnapshot((snapshot) => snapshot.stateVersion >= version, timeoutMs);
}
