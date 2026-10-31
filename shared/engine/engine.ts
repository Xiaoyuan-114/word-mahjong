import {
  appendLog,
  charOf,
  cloneState,
  endRound,
  failure,
  nextPhaseId,
  segmentsText,
  textOf,
} from './helpers';
import { validateHuSegments } from './hu';
import { validatePhrase } from './phrase';
import { buildWall } from './tiles';
import { isSeat, otherSeats, summarizeVote, tallyVote } from './vote';
import type {
  EngineError,
  EngineEvent,
  GameAction,
  GameConfig,
  GameState,
  Phase,
  RoundResult,
  Seat,
  TileId,
  TransitionResult,
  VoteState,
} from './types';

export function createGame(config: GameConfig, now: number): GameState {
  if (!Number.isInteger(config.seats) || config.seats < 2 || config.seats > 4) {
    throw new Error('seats must be 2-4');
  }

  const built = buildWall(config.seed);
  const hands: TileId[][] = Array.from({ length: config.seats }, () => []);
  const wall = built.tiles;
  const dealCount = config.mode === 'pin-ci' ? 13 : 14;

  for (let round = 0; round < dealCount; round += 1) {
    for (let seat = 0; seat < config.seats; seat += 1) {
      const tile = wall.pop();
      if (tile === undefined) {
        throw new Error('wall exhausted while dealing');
      }
      hands[seat]!.push(tile);
    }
  }

  const state: GameState = {
    version: 0,
    seq: 0,
    logSeq: 1,
    config: { ...config },
    hands,
    wall,
    chars: built.chars,
    discards: [],
    phrases: [],
    turnSeat: 0,
    drawnTileId: null,
    claimChain: 0,
    phase: {
      kind: 'over',
      id: 'phase-0',
      result: { winnerSeat: null, draw: true, reason: 'abandoned' },
    },
    log: [],
    result: null,
  };

  appendLog(
    state,
    now,
    'start',
    `牌局开始：${config.mode === 'pin-ci' ? '拼词胡' : '跑跑胡'}，${config.seats} 人`,
  );

  const events: EngineEvent[] = [];
  beginTurn(state, 0, now, true, events);
  state.version = 1;
  return state;
}

export function applyAction(state: GameState, action: GameAction, now: number): TransitionResult {
  if (state.phase.kind === 'over') {
    return failure('PHASE_MISMATCH', '本局已经结束');
  }
  if (state.phase.id !== action.phaseId) {
    return failure('PHASE_MISMATCH', '操作已过期，请以最新牌桌为准');
  }
  if (!isSeat(state.config.seats, action.seat)) {
    return failure('INVALID_ACTION', '无效的座位');
  }

  const draft = cloneState(state);
  const events: EngineEvent[] = [];
  let error: EngineError | null = null;

  switch (action.type) {
    case 'discard':
      error = handleDiscard(draft, action.seat, action.tileId, now, events);
      break;
    case 'declareHu':
      error = handleDeclareHu(draft, action.seat, action.segments, now, events);
      break;
    case 'playPhrase':
      error = handlePlayPhrase(draft, action.seat, action.tileIds, now, events);
      break;
    case 'passTurn':
      error = handlePassTurn(draft, action.seat, now, events);
      break;
    case 'respondClaim':
      error = handleRespondClaim(draft, action.seat, action.take, now, events);
      break;
    case 'castVote':
      error = handleCastVote(draft, action.seat, action.approve, now, events);
      break;
    default:
      error = { code: 'INVALID_ACTION', message: '未知操作' };
  }

  if (error) {
    return { ok: false, error };
  }

  draft.version = state.version + 1;
  return { ok: true, state: draft, events };
}

export function applyTimeout(state: GameState, now: number): TransitionResult {
  if (state.phase.kind === 'over') {
    return { ok: true, state, events: [] };
  }

  const draft = cloneState(state);
  const events: EngineEvent[] = [];

  switch (draft.phase.kind) {
    case 'turn': {
      const seat = draft.phase.seat;
      if (draft.config.mode === 'pin-ci') {
        const hand = draft.hands[seat]!;
        const fallback =
          draft.drawnTileId !== null && hand.includes(draft.drawnTileId)
            ? draft.drawnTileId
            : hand[hand.length - 1];
        if (fallback === undefined) {
          return { ok: true, state, events: [] };
        }
        appendLog(draft, now, 'timeout', `${seat + 1}号位超时，自动弃牌`, seat);
        const error = handleDiscard(draft, seat, fallback, now, events);
        if (error) {
          return { ok: true, state, events: [] };
        }
      } else {
        appendLog(draft, now, 'timeout', `${seat + 1}号位超时，自动过`, seat);
        advanceTurn(draft, now, events);
      }
      break;
    }
    case 'claim':
      appendLog(draft, now, 'timeout', '抢字超时', undefined);
      resolveClaim(draft, draft.phase, now, events);
      break;
    case 'vote': {
      appendLog(draft, now, 'timeout', '投票超时', undefined);
      for (const seat of draft.phase.vote.eligibleSeats) {
        if (draft.phase.vote.votes[seat] === undefined) {
          draft.phase.vote.votes[seat] = 'reject';
        }
      }
      const tally = tallyVote(draft.phase.vote);
      resolveVote(draft, tally.outcome === 'approved' ? 'approved' : 'rejected', now, events);
      break;
    }
    case 'over':
      return { ok: true, state, events: [] };
  }

  draft.version = state.version + 1;
  return { ok: true, state: draft, events };
}

export function abandonGame(state: GameState, now: number): TransitionResult {
  if (state.phase.kind === 'over') {
    return { ok: true, state, events: [] };
  }

  const draft = cloneState(state);
  const events: EngineEvent[] = [];
  const result: RoundResult = { winnerSeat: null, draw: true, reason: 'abandoned' };

  endRound(draft, result, now);
  events.push({ type: 'roundOver', result });
  draft.version = state.version + 1;
  return { ok: true, state: draft, events };
}

function beginTurn(
  state: GameState,
  seat: Seat,
  now: number,
  draw: boolean,
  events: EngineEvent[],
): void {
  if (draw) {
    const tile = state.wall.pop();
    if (tile === undefined) {
      finishWallEmpty(state, now, events);
      return;
    }
    state.hands[seat]!.push(tile);
    state.drawnTileId = tile;
    state.claimChain = 0;
    state.turnSeat = seat;
    const canHu = state.config.mode === 'pin-ci';
    state.phase = {
      kind: 'turn',
      id: nextPhaseId(state),
      seat,
      canHu,
      mustDiscard: false,
      deadline: now + state.config.turnMs,
    };
    appendLog(
      state,
      now,
      'turn',
      `${seat + 1}号位摸牌，${canHu ? '请弃牌或宣布胡' : '请打出短句或过'}`,
      seat,
    );
  } else {
    state.drawnTileId = null;
    state.turnSeat = seat;
    state.phase = {
      kind: 'turn',
      id: nextPhaseId(state),
      seat,
      canHu: false,
      mustDiscard: true,
      deadline: now + state.config.turnMs,
    };
    appendLog(state, now, 'turn', `${seat + 1}号位抢字成功，请弃一张`, seat);
  }

  events.push({ type: 'turnStarted', phaseId: state.phase.id, seat });
}

function advanceTurn(state: GameState, now: number, events: EngineEvent[]): void {
  const nextSeat = (state.turnSeat + 1) % state.config.seats;
  beginTurn(state, nextSeat, now, true, events);
}

function finishWallEmpty(state: GameState, now: number, events: EngineEvent[]): void {
  if (state.config.mode === 'pin-ci') {
    appendLog(state, now, 'round', '牌墙摸空', undefined);
    const result: RoundResult = {
      winnerSeat: null,
      draw: true,
      reason: 'wall-empty-pin-ci',
    };
    endRound(state, result, now);
    events.push({ type: 'roundOver', result });
    return;
  }

  const counts = state.hands.map((hand) => hand.length);
  const minimum = Math.min(...counts);
  const winners = counts
    .map((count, seat) => (count === minimum ? seat : -1))
    .filter((seat) => seat >= 0);
  const winnerSeat = winners.length === 1 ? winners[0]! : null;

  appendLog(
    state,
    now,
    'round',
    winnerSeat === null
      ? '牌墙摸空，手牌最少者并列'
      : `牌墙摸空，${winnerSeat + 1}号位手牌最少`,
    winnerSeat ?? undefined,
  );

  const result: RoundResult = {
    winnerSeat,
    draw: winnerSeat === null,
    reason: 'wall-empty-pao-pao',
  };
  endRound(state, result, now);
  events.push({ type: 'roundOver', result });
}

function handleDiscard(
  state: GameState,
  seat: Seat,
  tileId: TileId,
  now: number,
  events: EngineEvent[],
): EngineError | null {
  if (state.config.mode !== 'pin-ci') {
    return { code: 'WRONG_MODE', message: '跑跑胡不能弃牌' };
  }

  const phase = state.phase;
  if (phase.kind !== 'turn') {
    return { code: 'PHASE_MISMATCH', message: '现在不能弃牌' };
  }
  if (phase.seat !== seat) {
    return { code: 'NOT_YOUR_TURN', message: '还没轮到你' };
  }

  const hand = state.hands[seat]!;
  const index = hand.indexOf(tileId);
  if (index < 0) {
    return { code: 'INVALID_TILES', message: '这张牌不在你的手里' };
  }

  hand.splice(index, 1);
  state.discards.push({ tileId, seat, claimedBy: null });
  state.drawnTileId = null;
  appendLog(state, now, 'discard', `${seat + 1}号位弃了「${charOf(state, tileId)}」`, seat);
  openClaimOrAdvance(state, seat, tileId, now, events);
  return null;
}

function openClaimOrAdvance(
  state: GameState,
  discarderSeat: Seat,
  tileId: TileId,
  now: number,
  events: EngineEvent[],
): void {
  const policy = state.config.claimPolicy;
  const chainLimit = 2 * state.config.seats;

  if (policy !== 'off' && state.claimChain < chainLimit) {
    const eligibleSeats =
      policy === 'next'
        ? [(discarderSeat + 1) % state.config.seats]
        : otherSeats(state.config.seats, discarderSeat);

    if (eligibleSeats.length > 0) {
      state.phase = {
        kind: 'claim',
        id: nextPhaseId(state),
        discarderSeat,
        tileId,
        eligibleSeats,
        responses: {},
        deadline: now + state.config.claimMs,
      };
      events.push({
        type: 'claimOpened',
        phaseId: state.phase.id,
        discarderSeat,
        tileId,
      });
      return;
    }
  }

  advanceTurn(state, now, events);
}

function claimOrder(phase: Extract<Phase, { kind: 'claim' }>, seats: number): Seat[] {
  const distance = (seat: Seat) => (seat - phase.discarderSeat + seats) % seats;
  return [...phase.eligibleSeats].sort((left, right) => distance(left) - distance(right));
}

function claimCanResolve(phase: Extract<Phase, { kind: 'claim' }>, seats: number): boolean {
  for (const seat of claimOrder(phase, seats)) {
    const response = phase.responses[seat];
    if (response === 'take') {
      return true;
    }
    if (response === undefined) {
      return false;
    }
  }
  return true;
}

function resolveClaim(
  state: GameState,
  phase: Extract<Phase, { kind: 'claim' }>,
  now: number,
  events: EngineEvent[],
): void {
  const winner = claimOrder(phase, state.config.seats).find(
    (seat) => phase.responses[seat] === 'take',
  );

  if (winner !== undefined) {
    const discard = state.discards.find(
      (entry) => entry.tileId === phase.tileId && entry.claimedBy === null,
    );
    if (discard) {
      discard.claimedBy = winner;
      state.hands[winner]!.push(phase.tileId);
      state.claimChain += 1;
      appendLog(
        state,
        now,
        'claim',
        `${winner + 1}号位抢走了「${charOf(state, phase.tileId)}」`,
        winner,
      );
      beginTurn(state, winner, now, false, events);
      return;
    }
  }

  appendLog(state, now, 'claim', '无人抢字', undefined);
  advanceTurn(state, now, events);
}

function handleRespondClaim(
  state: GameState,
  seat: Seat,
  take: boolean,
  now: number,
  events: EngineEvent[],
): EngineError | null {
  if (state.config.mode !== 'pin-ci') {
    return { code: 'WRONG_MODE', message: '跑跑胡没有抢字' };
  }

  const phase = state.phase;
  if (phase.kind !== 'claim') {
    return { code: 'PHASE_MISMATCH', message: '现在没有抢字窗口' };
  }
  if (now > phase.deadline) {
    return { code: 'CLAIM_CLOSED', message: '抢字窗口已经关闭' };
  }
  if (!phase.eligibleSeats.includes(seat)) {
    return { code: 'NOT_ELIGIBLE', message: '你没有抢字资格' };
  }
  if (phase.responses[seat] !== undefined) {
    return { code: 'ALREADY_RESPONDED', message: '你已经回应过了' };
  }

  phase.responses[seat] = take ? 'take' : 'pass';
  if (claimCanResolve(phase, state.config.seats)) {
    resolveClaim(state, phase, now, events);
  }
  return null;
}

function createVote(
  state: GameState,
  kind: VoteState['kind'],
  proposerSeat: Seat,
  segments: TileId[][],
  now: number,
): VoteState {
  const phaseSeq = state.seq + 1;
  return {
    id: `vote-${phaseSeq}`,
    kind,
    proposerSeat,
    segments,
    eligibleSeats: otherSeats(state.config.seats, proposerSeat),
    votes: {},
    deadline: now + state.config.voteMs,
  };
}

function handleDeclareHu(
  state: GameState,
  seat: Seat,
  segments: TileId[][],
  now: number,
  events: EngineEvent[],
): EngineError | null {
  if (state.config.mode !== 'pin-ci') {
    return { code: 'WRONG_MODE', message: '跑跑胡不能宣布胡' };
  }

  const phase = state.phase;
  if (phase.kind !== 'turn') {
    return { code: 'PHASE_MISMATCH', message: '现在不能宣布胡' };
  }
  if (phase.seat !== seat) {
    return { code: 'NOT_YOUR_TURN', message: '还没轮到你' };
  }
  if (!phase.canHu) {
    return { code: 'HU_NOT_ALLOWED', message: '抢字后需要先弃一张，不能马上胡' };
  }

  const validation = validateHuSegments(state, seat, segments);
  if (!validation.ok) {
    return { code: validation.code, message: validation.message };
  }

  const vote = createVote(
    state,
    'hu',
    seat,
    segments.map((segment) => [...segment]),
    now,
  );
  state.phase = { kind: 'vote', id: nextPhaseId(state), vote };
  appendLog(
    state,
    now,
    'hu',
    `${seat + 1}号位申请胡：${segmentsText(state, segments)}`,
    seat,
  );
  events.push({
    type: 'voteOpened',
    phaseId: state.phase.id,
    voteId: vote.id,
    voteKind: vote.kind,
    proposerSeat: seat,
  });
  return null;
}

function handlePlayPhrase(
  state: GameState,
  seat: Seat,
  tileIds: TileId[],
  now: number,
  events: EngineEvent[],
): EngineError | null {
  if (state.config.mode !== 'pao-pao') {
    return { code: 'WRONG_MODE', message: '拼词胡不能打短句' };
  }

  const phase = state.phase;
  if (phase.kind !== 'turn') {
    return { code: 'PHASE_MISMATCH', message: '现在不能打短句' };
  }
  if (phase.seat !== seat) {
    return { code: 'NOT_YOUR_TURN', message: '还没轮到你' };
  }

  const validation = validatePhrase(state, seat, tileIds);
  if (!validation.ok) {
    return { code: validation.code, message: validation.message };
  }

  const segments = [[...tileIds]];
  const vote = createVote(state, 'phrase', seat, segments, now);
  state.phase = { kind: 'vote', id: nextPhaseId(state), vote };
  appendLog(
    state,
    now,
    'phrase',
    `${seat + 1}号位打出短句：${textOf(state, tileIds)}`,
    seat,
  );
  events.push({
    type: 'voteOpened',
    phaseId: state.phase.id,
    voteId: vote.id,
    voteKind: vote.kind,
    proposerSeat: seat,
  });
  return null;
}

function handlePassTurn(
  state: GameState,
  seat: Seat,
  now: number,
  events: EngineEvent[],
): EngineError | null {
  if (state.config.mode !== 'pao-pao') {
    return { code: 'WRONG_MODE', message: '拼词胡不能跳过回合' };
  }

  const phase = state.phase;
  if (phase.kind !== 'turn') {
    return { code: 'PHASE_MISMATCH', message: '现在不能跳过' };
  }
  if (phase.seat !== seat) {
    return { code: 'NOT_YOUR_TURN', message: '还没轮到你' };
  }

  appendLog(state, now, 'turn', `${seat + 1}号位过`, seat);
  advanceTurn(state, now, events);
  return null;
}

function handleCastVote(
  state: GameState,
  seat: Seat,
  approve: boolean,
  now: number,
  events: EngineEvent[],
): EngineError | null {
  const phase = state.phase;
  if (phase.kind !== 'vote') {
    return { code: 'PHASE_MISMATCH', message: '现在没有投票' };
  }
  if (now > phase.vote.deadline) {
    return { code: 'VOTE_CLOSED', message: '投票已经结束' };
  }
  if (!phase.vote.eligibleSeats.includes(seat)) {
    return { code: 'NOT_ELIGIBLE', message: '你没有投票资格' };
  }
  if (phase.vote.votes[seat] !== undefined) {
    return { code: 'ALREADY_VOTED', message: '你已经投过票了' };
  }

  phase.vote.votes[seat] = approve ? 'approve' : 'reject';
  const tally = tallyVote(phase.vote);
  if (tally.outcome === 'approved' || tally.outcome === 'rejected') {
    resolveVote(state, tally.outcome, now, events);
  }
  return null;
}

function resolveVote(
  state: GameState,
  outcome: 'approved' | 'rejected',
  now: number,
  events: EngineEvent[],
): void {
  const phase = state.phase;
  if (phase.kind !== 'vote') {
    return;
  }

  const vote = phase.vote;
  const summary = summarizeVote(vote);
  const label = `${summary.approvals}/${summary.eligible}`;

  if (vote.kind === 'hu') {
    if (outcome === 'approved') {
      appendLog(state, now, 'vote', `胡牌通过（${label}）`, vote.proposerSeat);
      const result: RoundResult = {
        winnerSeat: vote.proposerSeat,
        draw: false,
        reason: 'hu-approved',
        winningSegments: vote.segments.map((segment) => [...segment]),
        vote: summary,
      };
      endRound(state, result, now);
      events.push({ type: 'roundOver', result });
      return;
    }

    appendLog(state, now, 'vote', `胡牌未通过（${label}）`, vote.proposerSeat);
    state.turnSeat = vote.proposerSeat;
    state.phase = {
      kind: 'turn',
      id: nextPhaseId(state),
      seat: vote.proposerSeat,
      canHu: false,
      mustDiscard: true,
      deadline: now + state.config.turnMs,
    };
    appendLog(state, now, 'turn', `${vote.proposerSeat + 1}号位需要弃一张`, vote.proposerSeat);
    events.push({
      type: 'turnStarted',
      phaseId: state.phase.id,
      seat: vote.proposerSeat,
    });
    return;
  }

  if (outcome === 'approved') {
    const tileIds = vote.segments[0] ?? [];
    const removed = new Set(tileIds);
    state.hands[vote.proposerSeat] = state.hands[vote.proposerSeat]!.filter(
      (tileId) => !removed.has(tileId),
    );
    const text = textOf(state, tileIds);
    state.phrases.push({
      seat: vote.proposerSeat,
      tileIds: [...tileIds],
      text,
      at: now,
    });
    appendLog(state, now, 'vote', `短句通过（${label}）`, vote.proposerSeat);
    appendLog(state, now, 'phrase', `${vote.proposerSeat + 1}号位打出：${text}`, vote.proposerSeat);

    if (state.hands[vote.proposerSeat]!.length <= 3) {
      const result: RoundResult = {
        winnerSeat: vote.proposerSeat,
        draw: false,
        reason: 'phrase-win',
        winningSegments: [[...tileIds]],
        vote: summary,
      };
      endRound(state, result, now);
      events.push({ type: 'roundOver', result });
      return;
    }

    advanceTurn(state, now, events);
    return;
  }

  appendLog(state, now, 'vote', `短句未通过（${label}）`, vote.proposerSeat);
  advanceTurn(state, now, events);
}
