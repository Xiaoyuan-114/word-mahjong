export type Mode = 'pin-ci' | 'pao-pao';
export type ClaimPolicy = 'next' | 'all' | 'off';

export type Seat = number;
export type TileId = string;

export interface GameConfig {
  mode: Mode;
  seats: number;
  seed: number;
  turnMs: number;
  voteMs: number;
  claimMs: number;
  claimPolicy: ClaimPolicy;
}

export type VoteKind = 'hu' | 'phrase';
export type VoteChoice = 'approve' | 'reject';
export type ClaimChoice = 'take' | 'pass';

export interface VoteState {
  id: string;
  kind: VoteKind;
  proposerSeat: Seat;
  segments: TileId[][];
  eligibleSeats: Seat[];
  votes: Record<number, VoteChoice>;
  deadline: number;
}

export interface VoteSummary {
  approvals: number;
  rejects: number;
  eligible: number;
  required: number;
  votes: Record<number, VoteChoice>;
}

export type RoundEndReason =
  | 'hu-approved'
  | 'phrase-win'
  | 'wall-empty-pin-ci'
  | 'wall-empty-pao-pao'
  | 'abandoned';

export interface RoundResult {
  winnerSeat: Seat | null;
  draw: boolean;
  reason: RoundEndReason;
  winningSegments?: TileId[][];
  vote?: VoteSummary;
}

export type Phase =
  | {
      kind: 'turn';
      id: string;
      seat: Seat;
      canHu: boolean;
      mustDiscard: boolean;
      deadline: number;
    }
  | {
      kind: 'claim';
      id: string;
      discarderSeat: Seat;
      tileId: TileId;
      eligibleSeats: Seat[];
      responses: Record<number, ClaimChoice>;
      deadline: number;
    }
  | {
      kind: 'vote';
      id: string;
      vote: VoteState;
    }
  | {
      kind: 'over';
      id: string;
      result: RoundResult;
    };

export interface DiscardEntry {
  tileId: TileId;
  seat: Seat;
  claimedBy: Seat | null;
}

export interface PhraseEntry {
  seat: Seat;
  tileIds: TileId[];
  text: string;
  at: number;
}

export type LogKind =
  | 'start'
  | 'turn'
  | 'discard'
  | 'claim'
  | 'hu'
  | 'phrase'
  | 'vote'
  | 'timeout'
  | 'round';

export interface LogEntry {
  id: string;
  at: number;
  kind: LogKind;
  text: string;
  seat?: Seat;
}

export interface GameState {
  version: number;
  seq: number;
  logSeq: number;
  config: GameConfig;
  hands: TileId[][];
  wall: TileId[];
  chars: Record<TileId, string>;
  discards: DiscardEntry[];
  phrases: PhraseEntry[];
  turnSeat: Seat;
  drawnTileId: TileId | null;
  claimChain: number;
  phase: Phase;
  log: LogEntry[];
  result: RoundResult | null;
}

export type GameAction =
  | { type: 'discard'; seat: Seat; phaseId: string; tileId: TileId }
  | { type: 'declareHu'; seat: Seat; phaseId: string; segments: TileId[][] }
  | { type: 'playPhrase'; seat: Seat; phaseId: string; tileIds: TileId[] }
  | { type: 'passTurn'; seat: Seat; phaseId: string }
  | { type: 'respondClaim'; seat: Seat; phaseId: string; take: boolean }
  | { type: 'castVote'; seat: Seat; phaseId: string; approve: boolean };

export type EngineErrorCode =
  | 'NOT_YOUR_TURN'
  | 'PHASE_MISMATCH'
  | 'INVALID_TILES'
  | 'WRONG_TILE_COUNT'
  | 'SEGMENT_EMPTY'
  | 'HU_NOT_ALLOWED'
  | 'PHRASE_SIZE'
  | 'NOT_ELIGIBLE'
  | 'ALREADY_RESPONDED'
  | 'ALREADY_VOTED'
  | 'VOTE_CLOSED'
  | 'CLAIM_CLOSED'
  | 'INVALID_ACTION'
  | 'WRONG_MODE';

export interface EngineError {
  code: EngineErrorCode;
  message: string;
}

export type EngineEvent =
  | {
      type: 'voteOpened';
      phaseId: string;
      voteId: string;
      voteKind: VoteKind;
      proposerSeat: Seat;
    }
  | { type: 'turnStarted'; phaseId: string; seat: Seat }
  | { type: 'claimOpened'; phaseId: string; discarderSeat: Seat; tileId: TileId }
  | { type: 'roundOver'; result: RoundResult };

export type TransitionResult =
  | { ok: true; state: GameState; events: EngineEvent[] }
  | { ok: false; error: EngineError };

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: EngineErrorCode; message: string };
