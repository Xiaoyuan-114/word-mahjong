import { describe, expect, it } from 'vitest';
import {
  abandonGame,
  applyAction,
  applyTimeout,
  CHARACTER_POOL,
  createGame,
  requiredApprovals,
  TOTAL_TILES,
} from './index';
import type { GameAction, GameConfig, GameState, Seat, TileId } from './index';

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    mode: 'pin-ci',
    seats: 3,
    seed: 7,
    turnMs: 1000,
    voteMs: 500,
    claimMs: 200,
    claimPolicy: 'next',
    ...overrides,
  };
}

function game(overrides: Partial<GameConfig> = {}): GameState {
  return createGame(config(overrides), 1000);
}

function act(state: GameState, action: GameAction, now = 1000): GameState {
  const result = applyAction(state, action, now);
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.state;
}

function attempt(state: GameState, action: GameAction, now = 1000) {
  return applyAction(state, action, now);
}

function oneTileSegments(state: GameState, seat: Seat): TileId[][] {
  return state.hands[seat]!.map((tileId) => [tileId]);
}

function cast(
  state: GameState,
  seats: Seat[],
  approve: boolean,
  now = 1000,
): GameState {
  let current = state;
  for (const seat of seats) {
    if (current.phase.kind !== 'vote') {
      throw new Error('vote already resolved');
    }
    current = act(
      current,
      { type: 'castVote', seat, phaseId: current.phase.id, approve },
      now,
    );
  }
  return current;
}

function lastDiscard(state: GameState) {
  return state.discards[state.discards.length - 1];
}

describe('tiles and game setup', () => {
  it('has a unique character pool and the expected wall size', () => {
    expect(CHARACTER_POOL.length).toBeGreaterThan(100);
    expect(new Set(CHARACTER_POOL).size).toBe(CHARACTER_POOL.length);
    expect(CHARACTER_POOL.every((char) => typeof char === 'string' && char.length === 1)).toBe(true);
    expect(TOTAL_TILES).toBe(CHARACTER_POOL.length * 2);
  });

  it('deals the correct number of tiles and starts with seat 0', () => {
    for (const seats of [2, 3, 4]) {
      const pin = game({ seats });
      expect(pin.hands).toHaveLength(seats);
      expect(pin.hands[0]).toHaveLength(14);
      expect(pin.hands.slice(1).every((hand) => hand.length === 13)).toBe(true);
      expect(pin.phase).toMatchObject({ kind: 'turn', seat: 0, canHu: true, mustDiscard: false });
      expect(pin.wall.length).toBe(TOTAL_TILES - seats * 13 - 1);

      const pao = game({ seats, mode: 'pao-pao' });
      expect(pao.hands[0]).toHaveLength(15);
      expect(pao.hands.slice(1).every((hand) => hand.length === 14)).toBe(true);
      expect(pao.phase).toMatchObject({ kind: 'turn', seat: 0, canHu: false, mustDiscard: false });
      expect(pao.wall.length).toBe(TOTAL_TILES - seats * 14 - 1);
    }
  });

  it('reproduces the same deal for the same seed and keeps all tiles accounted for', () => {
    const first = game({ seed: 42 });
    const second = game({ seed: 42 });
    expect(second.hands).toEqual(first.hands);
    expect(second.wall).toEqual(first.wall);

    const allTiles = [...first.wall, ...first.hands.flat()];
    expect(new Set(allTiles).size).toBe(TOTAL_TILES);
    expect(allTiles.every((tileId) => first.chars[tileId] !== undefined)).toBe(true);
  });

  it('does not mutate the input state when applying an action', () => {
    const state = game();
    const before = structuredClone(state);
    act(state, {
      type: 'discard',
      seat: 0,
      phaseId: state.phase.id,
      tileId: state.hands[0]![0]!,
    });
    expect(state).toEqual(before);
  });
});

describe('vote threshold', () => {
  it('requires a strict majority of other players', () => {
    expect(requiredApprovals(1)).toBe(1);
    expect(requiredApprovals(2)).toBe(2);
    expect(requiredApprovals(3)).toBe(2);
  });

  it('approves a hu in a 2-player game with one approval', () => {
    const state = game({ seats: 2 });
    const voted = act(state, {
      type: 'declareHu',
      seat: 0,
      phaseId: state.phase.id,
      segments: oneTileSegments(state, 0),
    });
    const finished = cast(voted, [1], true);
    expect(finished.phase.kind).toBe('over');
    expect(finished.result).toMatchObject({
      winnerSeat: 0,
      draw: false,
      reason: 'hu-approved',
      vote: { approvals: 1, eligible: 1, required: 1 },
    });
  });

  it('requires both other players to approve in a 3-player game', () => {
    const state = game({ seats: 3 });
    const voted = act(state, {
      type: 'declareHu',
      seat: 0,
      phaseId: state.phase.id,
      segments: oneTileSegments(state, 0),
    });
    const afterFirst = cast(voted, [1], true);
    expect(afterFirst.phase.kind).toBe('vote');
    const afterSecond = cast(afterFirst, [2], true);
    expect(afterSecond.phase.kind).toBe('over');
    expect(afterSecond.result?.winnerSeat).toBe(0);
  });

  it('needs 2 of 3 approvals and rejects immediately on 2 rejections in a 4-player game', () => {
    const state = game({ seats: 4 });
    const voted = act(state, {
      type: 'declareHu',
      seat: 0,
      phaseId: state.phase.id,
      segments: oneTileSegments(state, 0),
    });
    const afterFirst = cast(voted, [1], true);
    const afterSecond = cast(afterFirst, [2], true);
    expect(afterSecond.phase.kind).toBe('over');
    expect(afterSecond.result?.vote).toMatchObject({ approvals: 2, eligible: 3, required: 2 });

    const state2 = game({ seats: 4 });
    const voted2 = act(state2, {
      type: 'declareHu',
      seat: 0,
      phaseId: state2.phase.id,
      segments: oneTileSegments(state2, 0),
    });
    const rejected1 = cast(voted2, [1], false);
    expect(rejected1.phase.kind).toBe('vote');
    const rejected2 = cast(rejected1, [2], false);
    expect(rejected2.phase.kind).toBe('turn');
    if (rejected2.phase.kind === 'turn') {
      expect(rejected2.phase.seat).toBe(0);
      expect(rejected2.phase.mustDiscard).toBe(true);
      expect(rejected2.phase.canHu).toBe(false);
    }
  });

  it('treats missing votes as rejection when time runs out', () => {
    const state = game({ seats: 3 });
    const voted = act(state, {
      type: 'declareHu',
      seat: 0,
      phaseId: state.phase.id,
      segments: oneTileSegments(state, 0),
    });
    const afterApprove = cast(voted, [1], true);
    expect(afterApprove.phase.kind).toBe('vote');

    const timedOut = applyTimeout(afterApprove, 1000 + 500 + 1);
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.state.phase.kind).toBe('turn');
    if (timedOut.state.phase.kind === 'turn') {
      expect(timedOut.state.phase.seat).toBe(0);
      expect(timedOut.state.phase.mustDiscard).toBe(true);
    }
    expect(timedOut.state.result).toBeNull();
    expect(timedOut.state.log.some((entry) => entry.kind === 'timeout')).toBe(true);
  });
});

describe('pin-ci turn and claim flow', () => {
  it('discards, opens a claim window for the next player, and lets them claim', () => {
    const state = game({ seats: 3 });
    const tile = state.hands[0]![0]!;
    const discarded = act(state, {
      type: 'discard',
      seat: 0,
      phaseId: state.phase.id,
      tileId: tile,
    });

    expect(discarded.phase.kind).toBe('claim');
    if (discarded.phase.kind !== 'claim') return;
    expect(discarded.phase.eligibleSeats).toEqual([1]);
    expect(discarded.phase.tileId).toBe(tile);
    expect(discarded.discards).toHaveLength(1);
    expect(lastDiscard(discarded)?.claimedBy).toBeNull();

    const claimed = act(discarded, {
      type: 'respondClaim',
      seat: 1,
      phaseId: discarded.phase.id,
      take: true,
    });

    expect(claimed.phase.kind).toBe('turn');
    if (claimed.phase.kind === 'turn') {
      expect(claimed.phase.seat).toBe(1);
      expect(claimed.phase.mustDiscard).toBe(true);
      expect(claimed.phase.canHu).toBe(false);
    }
    expect(claimed.hands[1]).toHaveLength(14);
    expect(lastDiscard(claimed)?.claimedBy).toBe(1);
    expect(claimed.claimChain).toBe(1);
  });

  it('advances after the claim window times out', () => {
    const state = game({ seats: 3 });
    const discarded = act(state, {
      type: 'discard',
      seat: 0,
      phaseId: state.phase.id,
      tileId: state.hands[0]![0]!,
    });
    const timedOut = applyTimeout(discarded, 1000 + 200 + 1);
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.state.phase.kind).toBe('turn');
    if (timedOut.state.phase.kind === 'turn') {
      expect(timedOut.state.phase.seat).toBe(1);
      expect(timedOut.state.phase.mustDiscard).toBe(false);
    }
    expect(timedOut.state.hands[1]).toHaveLength(14);
    expect(timedOut.state.log.some((entry) => entry.text.includes('无人抢字'))).toBe(true);
  });

  it('supports the all-players claim policy with nearest-seat priority', () => {
    const state = game({ seats: 3, claimPolicy: 'all' });
    const discarded = act(state, {
      type: 'discard',
      seat: 0,
      phaseId: state.phase.id,
      tileId: state.hands[0]![0]!,
    });
    if (discarded.phase.kind !== 'claim') throw new Error('expected claim');
    expect(discarded.phase.eligibleSeats).toEqual([1, 2]);

    const fartherTakes = act(discarded, {
      type: 'respondClaim',
      seat: 2,
      phaseId: discarded.phase.id,
      take: true,
    });
    expect(fartherTakes.phase.kind).toBe('claim');

    const nearestPasses = act(fartherTakes, {
      type: 'respondClaim',
      seat: 1,
      phaseId: fartherTakes.phase.id,
      take: false,
    });
    expect(nearestPasses.phase.kind).toBe('turn');
    if (nearestPasses.phase.kind === 'turn') {
      expect(nearestPasses.phase.seat).toBe(2);
      expect(nearestPasses.phase.mustDiscard).toBe(true);
    }
    expect(lastDiscard(nearestPasses)?.claimedBy).toBe(2);
  });

  it('skips claims when the policy is off', () => {
    const state = game({ seats: 3, claimPolicy: 'off' });
    const discarded = act(state, {
      type: 'discard',
      seat: 0,
      phaseId: state.phase.id,
      tileId: state.hands[0]![0]!,
    });
    expect(discarded.phase.kind).toBe('turn');
    if (discarded.phase.kind === 'turn') {
      expect(discarded.phase.seat).toBe(1);
    }
    expect(discarded.hands[1]).toHaveLength(14);
  });

  it('rejects a second action with a stale phase id', () => {
    const state = game({ seats: 3 });
    const tile = state.hands[0]![0]!;
    const discarded = act(state, {
      type: 'discard',
      seat: 0,
      phaseId: state.phase.id,
      tileId: tile,
    });

    const second = attempt(discarded, {
      type: 'discard',
      seat: 0,
      phaseId: state.phase.id,
      tileId: state.hands[0]![1]!,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('PHASE_MISMATCH');
    }
  });

  it('forces a discard after a rejected hu', () => {
    const state = game({ seats: 3 });
    const voted = act(state, {
      type: 'declareHu',
      seat: 0,
      phaseId: state.phase.id,
      segments: oneTileSegments(state, 0),
    });
    const rejected = cast(voted, [1], false);
    expect(rejected.phase.kind).toBe('turn');
    if (rejected.phase.kind === 'turn') {
      expect(rejected.phase.mustDiscard).toBe(true);
      expect(rejected.phase.canHu).toBe(false);
    }
    expect(rejected.hands[0]).toHaveLength(14);
  });

  it('auto-discards on turn timeout', () => {
    const state = game({ seats: 3 });
    const timedOut = applyTimeout(state, 1000 + 1000 + 1);
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.state.phase.kind).toBe('claim');
    expect(timedOut.state.hands[0]).toHaveLength(13);
    expect(timedOut.state.log.some((entry) => entry.kind === 'timeout')).toBe(true);
  });

  it('ends in a draw when the wall is empty on a draw', () => {
    const state = game({ seats: 3, claimPolicy: 'off' });
    const nearEnd = structuredClone(state);
    nearEnd.wall = [];
    const discarded = act(nearEnd, {
      type: 'discard',
      seat: 0,
      phaseId: nearEnd.phase.id,
      tileId: nearEnd.hands[0]![0]!,
    });
    expect(discarded.phase.kind).toBe('over');
    expect(discarded.result).toMatchObject({
      winnerSeat: null,
      draw: true,
      reason: 'wall-empty-pin-ci',
    });
  });
});

describe('hu validation', () => {
  it('rejects a hu that does not use every hand tile', () => {
    const state = game({ seats: 3 });
    const result = attempt(state, {
      type: 'declareHu',
      seat: 0,
      phaseId: state.phase.id,
      segments: [[state.hands[0]![0]!]],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_TILE_COUNT');
  });

  it('rejects duplicate tiles in a hu', () => {
    const state = game({ seats: 3 });
    const segments = oneTileSegments(state, 0);
    segments[1] = [segments[0]![0]!];
    const result = attempt(state, {
      type: 'declareHu',
      seat: 0,
      phaseId: state.phase.id,
      segments,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_TILES');
  });

  it('rejects an empty segment', () => {
    const state = game({ seats: 3 });
    const segments = oneTileSegments(state, 0);
    segments.push([]);
    const result = attempt(state, {
      type: 'declareHu',
      seat: 0,
      phaseId: state.phase.id,
      segments,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SEGMENT_EMPTY');
  });

  it('rejects a hu on a claim turn', () => {
    const state = game({ seats: 3 });
    const discarded = act(state, {
      type: 'discard',
      seat: 0,
      phaseId: state.phase.id,
      tileId: state.hands[0]![0]!,
    });
    const claimed = act(discarded, {
      type: 'respondClaim',
      seat: 1,
      phaseId: discarded.phase.id,
      take: true,
    });
    const result = attempt(claimed, {
      type: 'declareHu',
      seat: 1,
      phaseId: claimed.phase.id,
      segments: oneTileSegments(claimed, 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('HU_NOT_ALLOWED');
  });
});

describe('pao-pao flow', () => {
  it('passes a phrase, votes it, removes tiles, and advances', () => {
    const state = game({ mode: 'pao-pao', seats: 3 });
    const tileIds = state.hands[0]!.slice(0, 3);
    const before = state.hands[0]!.length;
    const proposed = act(state, {
      type: 'playPhrase',
      seat: 0,
      phaseId: state.phase.id,
      tileIds,
    });
    expect(proposed.phase.kind).toBe('vote');
    const approved = cast(proposed, [1, 2], true);

    expect(approved.phase.kind).toBe('turn');
    if (approved.phase.kind === 'turn') {
      expect(approved.phase.seat).toBe(1);
    }
    expect(approved.hands[0]).toHaveLength(before - 3);
    expect(approved.phrases).toHaveLength(1);
    expect(approved.phrases[0]?.text).toHaveLength(3);
  });

  it('keeps tiles and passes the turn on a rejected phrase', () => {
    const state = game({ mode: 'pao-pao', seats: 3 });
    const tileIds = state.hands[0]!.slice(0, 2);
    const before = state.hands[0]!.length;
    const proposed = act(state, {
      type: 'playPhrase',
      seat: 0,
      phaseId: state.phase.id,
      tileIds,
    });
    const rejected = cast(proposed, [1], false);

    expect(rejected.phase.kind).toBe('turn');
    if (rejected.phase.kind === 'turn') {
      expect(rejected.phase.seat).toBe(1);
    }
    expect(rejected.hands[0]).toHaveLength(before);
    expect(rejected.phrases).toHaveLength(0);
  });

  it('requires 2 of 3 approvals in a 4-player game', () => {
    const state = game({ mode: 'pao-pao', seats: 4 });
    const tileIds = state.hands[0]!.slice(0, 2);
    const proposed = act(state, {
      type: 'playPhrase',
      seat: 0,
      phaseId: state.phase.id,
      tileIds,
    });
    const approved = cast(proposed, [1, 2], true);
    expect(approved.phase.kind).toBe('turn');
    if (approved.phase.kind === 'turn') {
      expect(approved.phase.seat).toBe(1);
    }
  });

  it('wins when an approved phrase leaves 3 or fewer tiles', () => {
    const state = game({ mode: 'pao-pao', seats: 3 });
    const nearWin = structuredClone(state);
    nearWin.hands[0] = nearWin.hands[0]!.slice(0, 4);
    const tileIds = nearWin.hands[0]!.slice(0, 2);
    const proposed = act(nearWin, {
      type: 'playPhrase',
      seat: 0,
      phaseId: nearWin.phase.id,
      tileIds,
    });
    const finished = cast(proposed, [1, 2], true);

    expect(finished.phase.kind).toBe('over');
    expect(finished.result).toMatchObject({
      winnerSeat: 0,
      draw: false,
      reason: 'phrase-win',
    });
    expect(finished.hands[0]).toHaveLength(2);
  });

  it('passes without removing tiles', () => {
    const state = game({ mode: 'pao-pao', seats: 3 });
    const before = state.hands[0]!.length;
    const passed = act(state, {
      type: 'passTurn',
      seat: 0,
      phaseId: state.phase.id,
    });
    expect(passed.phase.kind).toBe('turn');
    if (passed.phase.kind === 'turn') expect(passed.phase.seat).toBe(1);
    expect(passed.hands[0]).toHaveLength(before);
    expect(passed.log.some((entry) => entry.text.includes('过'))).toBe(true);
  });

  it('rejects phrases outside 2–5 tiles', () => {
    const state = game({ mode: 'pao-pao', seats: 3 });
    const tooShort = attempt(state, {
      type: 'playPhrase',
      seat: 0,
      phaseId: state.phase.id,
      tileIds: [state.hands[0]![0]!],
    });
    expect(tooShort.ok).toBe(false);
    if (!tooShort.ok) expect(tooShort.error.code).toBe('PHRASE_SIZE');

    const tooLong = attempt(state, {
      type: 'playPhrase',
      seat: 0,
      phaseId: state.phase.id,
      tileIds: state.hands[0]!.slice(0, 6),
    });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error.code).toBe('PHRASE_SIZE');
  });

  it('auto-passes on turn timeout', () => {
    const state = game({ mode: 'pao-pao', seats: 3 });
    const timedOut = applyTimeout(state, 1000 + 1000 + 1);
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.state.phase.kind).toBe('turn');
    if (timedOut.state.phase.kind === 'turn') {
      expect(timedOut.state.phase.seat).toBe(1);
    }
    expect(timedOut.state.log.some((entry) => entry.kind === 'timeout')).toBe(true);
  });

  it('picks the fewest tiles when the wall is empty', () => {
    const state = game({ mode: 'pao-pao', seats: 3 });
    const nearEnd = structuredClone(state);
    nearEnd.wall = [];
    nearEnd.hands[0] = nearEnd.hands[0]!.slice(0, 5);
    nearEnd.hands[1] = nearEnd.hands[1]!.slice(0, 4);
    nearEnd.hands[2] = nearEnd.hands[2]!.slice(0, 6);

    const ended = act(nearEnd, {
      type: 'passTurn',
      seat: 0,
      phaseId: nearEnd.phase.id,
    });
    expect(ended.phase.kind).toBe('over');
    expect(ended.result).toMatchObject({
      winnerSeat: 1,
      draw: false,
      reason: 'wall-empty-pao-pao',
    });
  });

  it('draws when the fewest tile counts are tied at the wall end', () => {
    const state = game({ mode: 'pao-pao', seats: 3 });
    const nearEnd = structuredClone(state);
    nearEnd.wall = [];
    nearEnd.hands[0] = nearEnd.hands[0]!.slice(0, 4);
    nearEnd.hands[1] = nearEnd.hands[1]!.slice(0, 4);
    nearEnd.hands[2] = nearEnd.hands[2]!.slice(0, 6);

    const ended = act(nearEnd, {
      type: 'passTurn',
      seat: 0,
      phaseId: nearEnd.phase.id,
    });
    expect(ended.phase.kind).toBe('over');
    expect(ended.result).toMatchObject({
      winnerSeat: null,
      draw: true,
      reason: 'wall-empty-pao-pao',
    });
  });
});

describe('abandon and guard rails', () => {
  it('abandons a round without a winner', () => {
    const state = game({ seats: 3 });
    const abandoned = abandonGame(state, 1000);
    expect(abandoned.ok).toBe(true);
    if (!abandoned.ok) return;
    expect(abandoned.state.phase.kind).toBe('over');
    expect(abandoned.state.result).toMatchObject({
      winnerSeat: null,
      draw: true,
      reason: 'abandoned',
    });
  });

  it('rejects actions after the round is over', () => {
    const state = game({ seats: 2 });
    const voted = act(state, {
      type: 'declareHu',
      seat: 0,
      phaseId: state.phase.id,
      segments: oneTileSegments(state, 0),
    });
    const finished = cast(voted, [1], true);
    const result = attempt(finished, {
      type: 'discard',
      seat: 0,
      phaseId: finished.phase.id,
      tileId: state.hands[0]![0]!,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PHASE_MISMATCH');
  });

  it('rejects a vote from an ineligible player and a duplicate vote', () => {
    const state = game({ seats: 3 });
    const voted = act(state, {
      type: 'declareHu',
      seat: 0,
      phaseId: state.phase.id,
      segments: oneTileSegments(state, 0),
    });
    const proposerVote = attempt(voted, {
      type: 'castVote',
      seat: 0,
      phaseId: voted.phase.id,
      approve: true,
    });
    expect(proposerVote.ok).toBe(false);
    if (!proposerVote.ok) expect(proposerVote.error.code).toBe('NOT_ELIGIBLE');

    const firstVote = act(voted, {
      type: 'castVote',
      seat: 1,
      phaseId: voted.phase.id,
      approve: true,
    });
    const duplicate = attempt(firstVote, {
      type: 'castVote',
      seat: 1,
      phaseId: firstVote.phase.id,
      approve: true,
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe('ALREADY_VOTED');
  });
});
