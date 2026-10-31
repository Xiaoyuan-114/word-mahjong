import type {
  ClaimPolicy,
  LogKind,
  Mode,
  RoundEndReason,
  VoteChoice,
  VoteKind,
} from './engine/types';

export type { ClaimPolicy, Mode } from './engine/types';

export interface RoomSettings {
  mode: Mode;
  maxPlayers: 2 | 3 | 4;
  openHands: boolean;
  claimPolicy: ClaimPolicy;
}

export interface TileView {
  id: string;
  char: string;
}

export type SocketErrorCode =
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'NAME_INVALID'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_STARTED'
  | 'ROOM_LOCKED'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_ALL_READY'
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
  | 'WRONG_MODE'
  | 'SESSION_INVALID'
  | 'INTERNAL';

export interface SocketError {
  code: SocketErrorCode;
  message: string;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: SocketError };

export type RoomStatus = 'lobby' | 'playing' | 'round-over';

export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  wins: number;
  handCount: number;
  isTurn: boolean;
  hand?: TileView[];
}

export interface LogEntryView {
  id: string;
  at: number;
  kind: LogKind;
  text: string;
  seat?: number;
}

export interface DiscardView {
  tile: TileView;
  bySeat: number;
  claimedBy: number | null;
}

export interface PhraseView {
  seat: number;
  tiles: TileView[];
  text: string;
  at: number;
}

export interface RoundResultView {
  winnerSeat: number | null;
  draw: boolean;
  reason: RoundEndReason;
  winningSegments?: TileView[][];
  winningText?: string;
  vote?: {
    approvals: number;
    rejects: number;
    eligible: number;
    required: number;
    votes: Record<number, VoteChoice>;
  };
}

export type PhaseView =
  | {
      kind: 'turn';
      phaseId: string;
      seat: number;
      canHu: boolean;
      mustDiscard: boolean;
      deadline: number;
    }
  | {
      kind: 'claim';
      phaseId: string;
      discarderSeat: number;
      tile: TileView;
      eligibleSeats: number[];
      respondedSeats: number[];
      youAreEligible: boolean;
      yourResponse: 'take' | 'pass' | null;
      deadline: number;
    }
  | {
      kind: 'vote';
      phaseId: string;
      voteId: string;
      voteKind: VoteKind;
      proposerSeat: number;
      preview: {
        segments: TileView[][];
        text: string;
      };
      eligibleSeats: number[];
      votedSeats: number[];
      approvals: number;
      rejects: number;
      required: number;
      yourVote: VoteChoice | null;
      deadline: number;
    }
  | {
      kind: 'over';
      phaseId: string;
      result: RoundResultView;
    };

export interface GameView {
  mode: Mode;
  roundNo: number;
  wallCount: number;
  turnSeat: number;
  phase: PhaseView;
  discards: DiscardView[];
  phrases: PhraseView[];
  log: LogEntryView[];
  deadline: number | null;
  result?: RoundResultView;
}

export interface Permissions {
  canReady: boolean;
  canStart: boolean;
  canEditSettings: boolean;
  canDiscard: boolean;
  canHu: boolean;
  canPlayPhrase: boolean;
  canPass: boolean;
  canClaim: boolean;
  canVote: boolean;
  hasVoted: boolean;
}

export interface RoomSnapshot {
  roomCode: string;
  status: RoomStatus;
  settings: RoomSettings;
  hostId: string;
  serverNow: number;
  stateVersion: number;
  you: {
    playerId: string;
    seat: number;
    isHost: boolean;
    permissions: Permissions;
  };
  players: PlayerView[];
  game?: GameView;
}

export interface Notice {
  level: 'info' | 'warn';
  message: string;
}

export interface InterServerEvents {}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
}

type EmptyAck = Ack<null>;

export interface ClientToServerEvents {
  'session:resume': (
    payload: { roomCode: string; token: string },
    ack: (response: Ack<{ snapshot: RoomSnapshot }>) => void,
  ) => void;
  'room:create': (
    payload: { nickname: string; settings: RoomSettings },
    ack: (response: Ack<{ roomCode: string; token: string; snapshot: RoomSnapshot }>) => void,
  ) => void;
  'room:join': (
    payload: { roomCode: string; nickname: string },
    ack: (response: Ack<{ token: string; snapshot: RoomSnapshot }>) => void,
  ) => void;
  'room:leave': (payload: Record<string, never>, ack: (response: EmptyAck) => void) => void;
  'lobby:ready': (
    payload: { ready: boolean },
    ack: (response: EmptyAck) => void,
  ) => void;
  'lobby:settings': (
    payload: {
      patch: Partial<Pick<RoomSettings, 'mode' | 'openHands' | 'claimPolicy'>>;
    },
    ack: (response: EmptyAck) => void,
  ) => void;
  'lobby:start': (payload: Record<string, never>, ack: (response: EmptyAck) => void) => void;
  'game:discard': (
    payload: { phaseId: string; tileId: string },
    ack: (response: EmptyAck) => void,
  ) => void;
  'game:hu': (
    payload: { phaseId: string; segments: string[][] },
    ack: (response: EmptyAck) => void,
  ) => void;
  'game:phrase': (
    payload: { phaseId: string; tileIds: string[] },
    ack: (response: EmptyAck) => void,
  ) => void;
  'game:pass': (
    payload: { phaseId: string },
    ack: (response: EmptyAck) => void,
  ) => void;
  'game:claim': (
    payload: { phaseId: string; take: boolean },
    ack: (response: EmptyAck) => void,
  ) => void;
  'game:vote': (
    payload: { phaseId: string; approve: boolean },
    ack: (response: EmptyAck) => void,
  ) => void;
  'round:next': (payload: Record<string, never>, ack: (response: EmptyAck) => void) => void;
}

export interface ServerToClientEvents {
  'room:snapshot': (snapshot: RoomSnapshot) => void;
  notice: (notice: Notice) => void;
  'session:replaced': (payload: { reason: 'duplicate' }) => void;
  'room:closed': (payload: { reason: string }) => void;
}
