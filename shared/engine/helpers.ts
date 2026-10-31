import type {
  EngineError,
  EngineErrorCode,
  GameState,
  LogKind,
  RoundResult,
  Seat,
  TileId,
} from './types';

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function nextPhaseId(state: GameState): string {
  state.seq += 1;
  return `phase-${state.seq}`;
}

export function appendLog(
  state: GameState,
  at: number,
  kind: LogKind,
  text: string,
  seat?: Seat,
): void {
  state.log.push({
    id: `log-${state.logSeq}`,
    at,
    kind,
    text,
    ...(seat === undefined ? {} : { seat }),
  });
  state.logSeq += 1;
  if (state.log.length > 200) {
    state.log.shift();
  }
}

export function charOf(state: GameState, tileId: TileId): string {
  return state.chars[tileId] ?? '？';
}

export function textOf(state: GameState, tileIds: TileId[]): string {
  return tileIds.map((tileId) => charOf(state, tileId)).join('');
}

export function segmentsText(state: GameState, segments: TileId[][]): string {
  return segments.map((segment) => textOf(state, segment)).join('｜');
}

export function getDeadline(state: GameState): number | null {
  switch (state.phase.kind) {
    case 'turn':
    case 'claim':
      return state.phase.deadline;
    case 'vote':
      return state.phase.vote.deadline;
    case 'over':
      return null;
  }
}

export function endRound(state: GameState, result: RoundResult, at: number): void {
  state.result = result;
  state.phase = { kind: 'over', id: nextPhaseId(state), result };
  state.drawnTileId = null;

  let text: string;
  if (result.reason === 'abandoned') {
    text = '本局中止';
  } else if (result.winnerSeat === null) {
    text = '流局';
  } else {
    text = `${result.winnerSeat + 1}号位获胜`;
  }

  if (result.winningSegments && result.winningSegments.length > 0) {
    text += `：${segmentsText(state, result.winningSegments)}`;
  }

  appendLog(state, at, 'round', text, result.winnerSeat ?? undefined);
}

export function failure(
  code: EngineErrorCode,
  message: string,
): { ok: false; error: EngineError } {
  return { ok: false, error: { code, message } };
}
