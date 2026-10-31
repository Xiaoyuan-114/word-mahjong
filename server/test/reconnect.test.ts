import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomSnapshot } from '@shared/types';
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
  testServer = await startTestServer({
    turnMs: 10_000,
    voteMs: 3000,
    claimMs: 3000,
    disconnectedTurnMs: 5000,
  });
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

function ownHand(snapshot: RoomSnapshot) {
  const hand = snapshot.players.find((player) => player.id === snapshot.you.playerId)?.hand;
  if (!hand) throw new Error('own hand was not visible');
  return hand;
}

describe('resume and duplicate sessions', () => {
  it('resumes an in-game session and preserves the hand', async () => {
    const a = await newClient();
    const b = await newClient();
    const created = await createRoom(a, '房主');
    const joined = await joinRoom(b, created.roomCode, '玩家B');
    await actAndWait(a, 'lobby:ready', { ready: true });
    await actAndWait(b, 'lobby:ready', { ready: true });
    const started = await actAndWait(a, 'lobby:start', {});
    await waitForVersion(b, started.stateVersion);

    const originalHand = ownHand(started).map((tile) => tile.id);
    a.close();
    await b.waitForSnapshot(
      (snapshot) =>
        snapshot.hostId === joined.snapshot.you.playerId &&
        snapshot.players.find((player) => player.id === started.you.playerId)?.connected === false,
      3000,
    );

    const resumed = await newClient();
    const response = await resumed.emitAck<{ snapshot: RoomSnapshot }>('session:resume', {
      roomCode: created.roomCode,
      token: created.token,
    });
    if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);

    expect(response.data.snapshot.status).toBe('playing');
    expect(response.data.snapshot.you.isHost).toBe(false);
    expect(ownHand(response.data.snapshot).map((tile) => tile.id)).toEqual(originalHand);
    expect(
      response.data.snapshot.players.find((player) => player.id === started.you.playerId)
        ?.connected,
    ).toBe(true);

    const bView = await b.waitForSnapshot(
      (snapshot) =>
        snapshot.players.find((player) => player.id === started.you.playerId)?.connected === true,
      3000,
    );
    expect(bView.hostId).toBe(joined.snapshot.you.playerId);
  });

  it('replaces a duplicate session token and disconnects the old socket', async () => {
    const a = await newClient();
    const created = await createRoom(a, '房主');
    const b = await newClient();

    const replaced = new Promise<void>((resolve) => {
      a.socket.once('session:replaced', () => resolve());
    });

    const response = await b.emitAck<{ snapshot: RoomSnapshot }>('session:resume', {
      roomCode: created.roomCode,
      token: created.token,
    });
    if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
    await replaced;

    expect(response.data.snapshot.you.isHost).toBe(true);
    expect(response.data.snapshot.players).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(a.socket.connected).toBe(false);
    expect(b.socket.connected).toBe(true);
  });

  it('rejects an invalid resume token', async () => {
    const a = await newClient();
    const created = await createRoom(a, '房主');
    const b = await newClient();

    await expectError(
      b,
      'session:resume',
      { roomCode: created.roomCode, token: 'invalid-token-value' },
      'SESSION_INVALID',
    );
  });
});
