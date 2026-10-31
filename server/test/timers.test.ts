import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomSettings, RoomSnapshot } from '@shared/types';
import {
  actAndWait,
  connectClient,
  createRoom,
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
    turnMs: 1000,
    voteMs: 300,
    claimMs: 300,
    disconnectedTurnMs: 100,
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

async function setupTwo(
  settings: Partial<RoomSettings> = {},
): Promise<{ a: TestClient; b: TestClient; aView: RoomSnapshot; bView: RoomSnapshot }> {
  const a = await newClient();
  const b = await newClient();
  const created = await createRoom(a, '房主', settings);
  await joinRoom(b, created.roomCode, '玩家B');
  await actAndWait(a, 'lobby:ready', { ready: true });
  await actAndWait(b, 'lobby:ready', { ready: true });
  const aView = await actAndWait(a, 'lobby:start', {});
  const bView = await waitForVersion(b, aView.stateVersion);
  return { a, b, aView, bView };
}

function ownHand(snapshot: RoomSnapshot) {
  const hand = snapshot.players.find((player) => player.id === snapshot.you.playerId)?.hand;
  if (!hand) throw new Error('own hand was not visible');
  return hand;
}

describe('timeouts and auto-actions', () => {
  it('auto-discards when the current player runs out of time', async () => {
    const { a, b, aView } = await setupTwo();
    expect(aView.game?.phase).toMatchObject({ kind: 'turn', seat: 0 });

    const bTurn = await b.waitForSnapshot(
      (snapshot) => snapshot.game?.phase.kind === 'turn' && snapshot.game.phase.seat === 1,
      3000,
    );

    expect(bTurn.game?.phase).toMatchObject({ kind: 'turn', seat: 1 });
    expect(
      bTurn.players.find((player) => player.id === aView.you.playerId)?.handCount,
    ).toBe(13);
    expect(bTurn.game?.log.some((entry) => entry.kind === 'timeout')).toBe(true);
  });

  it('rejects a hu when the vote times out', async () => {
    const { a, b, aView } = await setupTwo();
    const phase = aView.game?.phase;
    if (phase?.kind !== 'turn') throw new Error('expected the first turn');

    await actAndWait(a, 'game:hu', {
      phaseId: phase.phaseId,
      segments: ownHand(aView).map((tile) => [tile.id]),
    });

    const forced = await a.waitForSnapshot(
      (snapshot) =>
        snapshot.game?.phase.kind === 'turn' && snapshot.game.phase.mustDiscard === true,
      3000,
    );
    expect(forced.status).toBe('playing');
    expect(forced.game?.result).toBeUndefined();
    expect(forced.game?.phase).toMatchObject({
      kind: 'turn',
      seat: 0,
      mustDiscard: true,
      canHu: false,
    });
    expect(forced.game?.log.some((entry) => entry.kind === 'timeout')).toBe(true);
  });

  it('passes a claim when the eligible player does not respond', async () => {
    const { a, b, aView } = await setupTwo({ claimPolicy: 'next' });
    const phase = aView.game?.phase;
    if (phase?.kind !== 'turn') throw new Error('expected the first turn');

    await actAndWait(a, 'game:discard', {
      phaseId: phase.phaseId,
      tileId: ownHand(aView)[0]!.id,
    });

    const bTurn = await b.waitForSnapshot(
      (snapshot) => snapshot.game?.phase.kind === 'turn' && snapshot.game.phase.seat === 1,
      3000,
    );
    expect(bTurn.game?.phase).toMatchObject({ kind: 'turn', seat: 1 });
    expect(bTurn.players.find((player) => player.id === b.lastSnapshot?.you.playerId)?.handCount).toBe(
      14,
    );
    expect(bTurn.game?.log.some((entry) => entry.text.includes('无人抢字'))).toBe(true);
  });
});
