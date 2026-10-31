import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomSettings, RoomSnapshot } from '@shared/types';
import {
  actAndWait,
  connectClient,
  createRoom,
  expectError,
  joinRoom,
  startTestServer,
  waitForVersion,
  type TestClient,
  type TestServer,
} from './helpers/harness';

let testServer: TestServer;
let clients: TestClient[] = [];

beforeEach(async () => {
  testServer = await startTestServer();
  clients = [];
});

afterEach(async () => {
  for (const client of clients) {
    client.close();
  }
  await testServer.close();
});

async function newClient(): Promise<TestClient> {
  const client = await connectClient(testServer.url);
  clients.push(client);
  return client;
}

async function setupGame(
  settings: Partial<RoomSettings> = {},
): Promise<{
  a: TestClient;
  b: TestClient;
  created: { roomCode: string; token: string; snapshot: RoomSnapshot };
  aView: RoomSnapshot;
  bView: RoomSnapshot;
}> {
  const a = await newClient();
  const b = await newClient();
  const created = await createRoom(a, '房主', settings);
  await joinRoom(b, created.roomCode, '玩家B');
  await actAndWait(a, 'lobby:ready', { ready: true });
  await actAndWait(b, 'lobby:ready', { ready: true });
  const aView = await actAndWait(a, 'lobby:start', {});
  const bView = await waitForVersion(b, aView.stateVersion);
  return { a, b, created, aView, bView };
}

describe('lobby and room lifecycle', () => {
  it('creates a room, joins by code, and exposes the lobby snapshot', async () => {
    const a = await newClient();
    const b = await newClient();
    const created = await createRoom(a, '房主');

    expect(created.roomCode).toMatch(/^[A-Z0-9]{5}$/);
    expect(created.snapshot.status).toBe('lobby');
    expect(created.snapshot.you.isHost).toBe(true);
    expect(created.snapshot.players).toHaveLength(1);

    const joined = await joinRoom(b, created.roomCode, '玩家B');
    expect(joined.snapshot.you.isHost).toBe(false);
    expect(joined.snapshot.players.map((player) => player.name)).toEqual(['房主', '玩家B']);

    const aSnapshot = await a.waitForSnapshot((snapshot) => snapshot.players.length === 2);
    expect(aSnapshot.hostId).toBe(created.snapshot.you.playerId);
    expect(aSnapshot.players.map((player) => player.connected)).toEqual([true, true]);
  });

  it('rejects bad room codes, full rooms, and joining after start', async () => {
    const a = await newClient();
    const b = await newClient();
    const c = await newClient();

    await expectError(
      c,
      'room:join',
      { roomCode: 'ZZZZZ', nickname: '路人' },
      'ROOM_NOT_FOUND',
    );

    const created = await createRoom(a, '房主', { maxPlayers: 2 });
    await joinRoom(b, created.roomCode, '玩家B');
    await expectError(
      c,
      'room:join',
      { roomCode: created.roomCode, nickname: '第三人' },
      'ROOM_FULL',
    );

    await actAndWait(a, 'lobby:ready', { ready: true });
    await actAndWait(b, 'lobby:ready', { ready: true });
    await actAndWait(a, 'lobby:start', {});
    await expectError(
      c,
      'room:join',
      { roomCode: created.roomCode, nickname: '第三人' },
      'ROOM_STARTED',
    );
  });

  it('enforces ready, host, and settings rules before starting', async () => {
    const a = await newClient();
    const b = await newClient();
    const created = await createRoom(a, '房主');
    await joinRoom(b, created.roomCode, '玩家B');

    await expectError(a, 'lobby:start', {}, 'NOT_ALL_READY');
    await expectError(b, 'lobby:start', {}, 'NOT_HOST');
    await expectError(b, 'lobby:settings', { patch: { openHands: true } }, 'NOT_HOST');

    const settingsSnapshot = await actAndWait(a, 'lobby:settings', {
      patch: { openHands: true },
    });
    expect(settingsSnapshot.settings.openHands).toBe(true);

    await actAndWait(a, 'lobby:ready', { ready: true });
    await actAndWait(b, 'lobby:ready', { ready: true });
    const started = await actAndWait(a, 'lobby:start', {});
    expect(started.status).toBe('playing');
    expect(started.game?.phase.kind).toBe('turn');
    expect(started.game?.mode).toBe('pin-ci');
  });

  it('hides other hands unless openHands is enabled', async () => {
    const { aView, bView } = await setupGame();
    const aId = aView.you.playerId;
    const bId = bView.you.playerId;

    const aSeesSelf = aView.players.find((player) => player.id === aId);
    const aSeesOther = aView.players.find((player) => player.id === bId);
    const bSeesSelf = bView.players.find((player) => player.id === bId);
    const bSeesOther = bView.players.find((player) => player.id === aId);

    expect(aSeesSelf?.hand).toHaveLength(14);
    expect(aSeesOther?.hand).toBeUndefined();
    expect(bSeesSelf?.hand).toHaveLength(13);
    expect(bSeesOther?.hand).toBeUndefined();
  });

  it('reveals all hands with openHands and switches to pao-pao settings', async () => {
    const a = await newClient();
    const b = await newClient();
    const created = await createRoom(a, '房主', { mode: 'pin-ci' });
    await joinRoom(b, created.roomCode, '玩家B');

    const changed = await actAndWait(a, 'lobby:settings', {
      patch: { mode: 'pao-pao', openHands: true, claimPolicy: 'next' },
    });
    expect(changed.settings).toMatchObject({
      mode: 'pao-pao',
      openHands: true,
      claimPolicy: 'off',
    });

    await actAndWait(a, 'lobby:ready', { ready: true });
    await actAndWait(b, 'lobby:ready', { ready: true });
    const started = await actAndWait(a, 'lobby:start', {});
    const bView = await waitForVersion(b, started.stateVersion);

    expect(started.game?.mode).toBe('pao-pao');
    expect(started.players.every((player) => player.hand !== undefined)).toBe(true);
    expect(bView.players.every((player) => player.hand !== undefined)).toBe(true);
    const seatZero = started.players.find((player) => player.seat === 0);
    const seatOne = started.players.find((player) => player.seat === 1);
    expect(seatZero?.hand).toHaveLength(15);
    expect(seatOne?.hand).toHaveLength(14);
  });

  it('transfers the host when the host disconnects', async () => {
    const a = await newClient();
    const b = await newClient();
    const created = await createRoom(a, '房主');
    const joined = await joinRoom(b, created.roomCode, '玩家B');

    a.close();
    const transferred = await b.waitForSnapshot(
      (snapshot) => snapshot.hostId === joined.snapshot.you.playerId,
    );
    expect(transferred.you.isHost).toBe(true);
    expect(transferred.players.find((player) => player.name === '房主')?.connected).toBe(false);
  });

  it('sweeps an empty room', async () => {
    const a = await newClient();
    const created = await createRoom(a, '房主');
    a.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const room = testServer.server.manager.get(created.roomCode);
    expect(room).toBeDefined();
    if (!room) return;
    room.lastActivityAt = 0;
    testServer.server.manager.sweep();
    expect(testServer.server.manager.get(created.roomCode)).toBeUndefined();
  });
});
