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

async function setupThree(): Promise<{
  a: TestClient;
  b: TestClient;
  c: TestClient;
  aView: RoomSnapshot;
}> {
  const a = await newClient();
  const b = await newClient();
  const c = await newClient();
  const created = await createRoom(a, '房主', { maxPlayers: 3 });
  await joinRoom(b, created.roomCode, '玩家B');
  await joinRoom(c, created.roomCode, '玩家C');
  await actAndWait(a, 'lobby:ready', { ready: true });
  await actAndWait(b, 'lobby:ready', { ready: true });
  await actAndWait(c, 'lobby:ready', { ready: true });
  const aView = await actAndWait(a, 'lobby:start', {});
  await waitForVersion(b, aView.stateVersion);
  await waitForVersion(c, aView.stateVersion);
  return { a, b, c, aView };
}

function ownHand(snapshot: RoomSnapshot) {
  const hand = snapshot.players.find((player) => player.id === snapshot.you.playerId)?.hand;
  if (!hand) throw new Error('own hand was not visible');
  return hand;
}

describe('pin-ci server flow', () => {
  it('approves a hu, ends the round, adds a win, and returns to the lobby', async () => {
    const { a, b, aView } = await setupTwo();
    const phase = aView.game?.phase;
    if (phase?.kind !== 'turn') throw new Error('expected the first turn');

    const segments = ownHand(aView).map((tile) => [tile.id]);
    const proposed = await actAndWait(a, 'game:hu', {
      phaseId: phase.phaseId,
      segments,
    });
    expect(proposed.game?.phase.kind).toBe('vote');

    const bView = await waitForVersion(b, proposed.stateVersion);
    if (bView.game?.phase.kind !== 'vote') throw new Error('expected b vote phase');
    expect(bView.game.phase.required).toBe(1);

    const decided = await actAndWait(b, 'game:vote', {
      phaseId: bView.game.phase.phaseId,
      approve: true,
    });
    const aFinal = await waitForVersion(a, decided.stateVersion);

    expect(aFinal.status).toBe('round-over');
    expect(aFinal.game?.result).toMatchObject({
      winnerSeat: 0,
      draw: false,
      reason: 'hu-approved',
    });
    expect(aFinal.players.find((player) => player.id === aView.you.playerId)?.wins).toBe(1);

    const lobby = await actAndWait(a, 'round:next', {});
    const bLobby = await waitForVersion(b, lobby.stateVersion);
    expect(lobby.status).toBe('lobby');
    expect(lobby.game).toBeUndefined();
    expect(bLobby.players.find((player) => player.id === aView.you.playerId)?.wins).toBe(1);
  });

  it('rejects a hu and forces the proposer to discard', async () => {
    const { a, b, aView } = await setupTwo();
    const phase = aView.game?.phase;
    if (phase?.kind !== 'turn') throw new Error('expected the first turn');

    const proposed = await actAndWait(a, 'game:hu', {
      phaseId: phase.phaseId,
      segments: ownHand(aView).map((tile) => [tile.id]),
    });
    const bView = await waitForVersion(b, proposed.stateVersion);
    if (bView.game?.phase.kind !== 'vote') throw new Error('expected b vote phase');

    const rejected = await actAndWait(b, 'game:vote', {
      phaseId: bView.game.phase.phaseId,
      approve: false,
    });
    const aRejected = await waitForVersion(a, rejected.stateVersion);
    const forcedPhase = aRejected.game?.phase;
    if (forcedPhase?.kind !== 'turn') throw new Error('expected forced discard turn');
    expect(forcedPhase).toMatchObject({ seat: 0, mustDiscard: true, canHu: false });

    const discarded = await actAndWait(a, 'game:discard', {
      phaseId: forcedPhase.phaseId,
      tileId: ownHand(aRejected)[0]!.id,
    });
    const bTurn = await waitForVersion(b, discarded.stateVersion);
    expect(bTurn.game?.phase).toMatchObject({ kind: 'turn', seat: 1 });
  });

  it('lets the next player claim a discard and continues a claim chain', async () => {
    const { a, b, aView } = await setupTwo({ claimPolicy: 'next' });
    const phase = aView.game?.phase;
    if (phase?.kind !== 'turn') throw new Error('expected the first turn');

    const discarded = await actAndWait(a, 'game:discard', {
      phaseId: phase.phaseId,
      tileId: ownHand(aView)[0]!.id,
    });
    const bClaim = await waitForVersion(b, discarded.stateVersion);
    if (bClaim.game?.phase.kind !== 'claim') throw new Error('expected claim window');
    expect(bClaim.game.phase.eligibleSeats).toEqual([1]);
    expect(bClaim.game.phase.youAreEligible).toBe(true);

    const claimed = await actAndWait(b, 'game:claim', {
      phaseId: bClaim.game.phase.phaseId,
      take: true,
    });
    if (claimed.game?.phase.kind !== 'turn') throw new Error('expected claimed turn');
    expect(claimed.game.phase).toMatchObject({ seat: 1, mustDiscard: true, canHu: false });

    const bDiscarded = await actAndWait(b, 'game:discard', {
      phaseId: claimed.game.phase.phaseId,
      tileId: ownHand(claimed)[0]!.id,
    });
    const aClaim = await waitForVersion(a, bDiscarded.stateVersion);
    if (aClaim.game?.phase.kind !== 'claim') throw new Error('expected claim chain');
    expect(aClaim.game.phase.eligibleSeats).toEqual([0]);

    const passed = await actAndWait(a, 'game:claim', {
      phaseId: aClaim.game.phase.phaseId,
      take: false,
    });
    expect(passed.game?.phase).toMatchObject({ kind: 'turn', seat: 0 });
  });

  it('requires 2 of 2 other approvals in a 3-player game', async () => {
    const { a, b, c, aView } = await setupThree();
    const phase = aView.game?.phase;
    if (phase?.kind !== 'turn') throw new Error('expected the first turn');

    const proposed = await actAndWait(a, 'game:hu', {
      phaseId: phase.phaseId,
      segments: ownHand(aView).map((tile) => [tile.id]),
    });
    const bVote = await waitForVersion(b, proposed.stateVersion);
    const cVote = await waitForVersion(c, proposed.stateVersion);
    if (bVote.game?.phase.kind !== 'vote' || cVote.game?.phase.kind !== 'vote') {
      throw new Error('expected vote phase for both voters');
    }
    expect(bVote.game.phase.required).toBe(2);

    const afterFirst = await actAndWait(b, 'game:vote', {
      phaseId: bVote.game.phase.phaseId,
      approve: true,
    });
    expect(afterFirst.game?.phase.kind).toBe('vote');

    const afterSecond = await actAndWait(c, 'game:vote', {
      phaseId: cVote.game.phase.phaseId,
      approve: true,
    });
    const aFinal = await waitForVersion(a, afterSecond.stateVersion);
    expect(aFinal.status).toBe('round-over');
    expect(aFinal.game?.result?.winnerSeat).toBe(0);
  });

  it('rejects actions from the wrong player or with a stale phase id', async () => {
    const { a, b, aView } = await setupTwo();
    const phase = aView.game?.phase;
    if (phase?.kind !== 'turn') throw new Error('expected the first turn');

    await expectError(
      b,
      'game:discard',
      { phaseId: phase.phaseId, tileId: ownHand(aView)[0]!.id },
      'NOT_YOUR_TURN',
    );

    const discarded = await actAndWait(a, 'game:discard', {
      phaseId: phase.phaseId,
      tileId: ownHand(aView)[0]!.id,
    });
    await expectError(
      a,
      'game:discard',
      { phaseId: phase.phaseId, tileId: ownHand(discarded)[0]!.id },
      'PHASE_MISMATCH',
    );
  });
});

describe('pao-pao server flow', () => {
  it('approves a phrase, removes its tiles, and rejects a later phrase without removing tiles', async () => {
    const { a, b, aView } = await setupTwo({ mode: 'pao-pao' });
    const phase = aView.game?.phase;
    if (phase?.kind !== 'turn') throw new Error('expected the first turn');

    const phraseTiles = ownHand(aView).slice(0, 3).map((tile) => tile.id);
    const proposed = await actAndWait(a, 'game:phrase', {
      phaseId: phase.phaseId,
      tileIds: phraseTiles,
    });
    const bVote = await waitForVersion(b, proposed.stateVersion);
    if (bVote.game?.phase.kind !== 'vote') throw new Error('expected phrase vote');

    const approved = await actAndWait(b, 'game:vote', {
      phaseId: bVote.game.phase.phaseId,
      approve: true,
    });
    const aAfterPhrase = await waitForVersion(a, approved.stateVersion);
    expect(aAfterPhrase.game?.phrases).toHaveLength(1);
    expect(
      aAfterPhrase.players.find((player) => player.id === aView.you.playerId)?.handCount,
    ).toBe(12);
    expect(aAfterPhrase.game?.phase).toMatchObject({ kind: 'turn', seat: 1 });

    const bPhase = aAfterPhrase.game?.phase;
    if (bPhase?.kind !== 'turn') throw new Error('expected b turn');
    const bView = await waitForVersion(b, aAfterPhrase.stateVersion);
    const bViewPhase = bView.game?.phase;
    if (bViewPhase?.kind !== 'turn') throw new Error('expected b turn view');
    const bBefore = ownHand(bView).length;
    const rejectedPhrase = ownHand(bView).slice(0, 2).map((tile) => tile.id);

    const bProposed = await actAndWait(b, 'game:phrase', {
      phaseId: bViewPhase.phaseId,
      tileIds: rejectedPhrase,
    });
    const aVote = await waitForVersion(a, bProposed.stateVersion);
    if (aVote.game?.phase.kind !== 'vote') throw new Error('expected a vote');

    const rejected = await actAndWait(a, 'game:vote', {
      phaseId: aVote.game.phase.phaseId,
      approve: false,
    });
    const bAfter = await waitForVersion(b, rejected.stateVersion);
    expect(bAfter.game?.phrases).toHaveLength(1);
    expect(bAfter.players.find((player) => player.id === bView.you.playerId)?.handCount).toBe(
      bBefore,
    );
    expect(bAfter.game?.phase).toMatchObject({ kind: 'turn', seat: 0 });
  });
});
