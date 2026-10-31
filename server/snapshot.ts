import { getDeadline, tallyVote } from '@shared/engine';
import type { GameState, LogEntry, RoundResult, Seat, TileId } from '@shared/engine';
import type {
  DiscardView,
  GameView,
  LogEntryView,
  Permissions,
  PhaseView,
  PlayerView,
  RoomSnapshot,
  RoundResultView,
  TileView,
} from '@shared/types';
import type { Room, RoomPlayer } from './rooms/roomTypes';
import { connectedPlayers, nameForSeat, playersBySeat } from './rooms/roomUtils';

function tileView(game: GameState, tileId: TileId): TileView {
  return { id: tileId, char: game.chars[tileId] ?? '？' };
}

function tilesView(game: GameState, tileIds: TileId[]): TileView[] {
  return tileIds.map((tileId) => tileView(game, tileId));
}

function segmentsView(game: GameState, segments: TileId[][]): TileView[][] {
  return segments.map((segment) => tilesView(game, segment));
}

function segmentsText(game: GameState, segments: TileId[][]): string {
  return segments
    .map((segment) => segment.map((tileId) => game.chars[tileId] ?? '？').join(''))
    .join('｜');
}

function resultView(game: GameState, result: RoundResult): RoundResultView {
  const winningSegments = result.winningSegments
    ? segmentsView(game, result.winningSegments)
    : undefined;

  return {
    winnerSeat: result.winnerSeat,
    draw: result.draw,
    reason: result.reason,
    ...(winningSegments
      ? {
          winningSegments,
          winningText: winningSegments
            .map((segment) => segment.map((tile) => tile.char).join(''))
            .join('｜'),
        }
      : {}),
    ...(result.vote
      ? {
          vote: {
            approvals: result.vote.approvals,
            rejects: result.vote.rejects,
            eligible: result.vote.eligible,
            required: result.vote.required,
            votes: { ...result.vote.votes },
          },
        }
      : {}),
  };
}

function displayLog(room: Room, entry: LogEntry): LogEntryView {
  const text =
    entry.seat === undefined
      ? entry.text
      : entry.text.split(`${entry.seat + 1}号位`).join(nameForSeat(room, entry.seat));

  return {
    id: entry.id,
    at: entry.at,
    kind: entry.kind,
    text,
    ...(entry.seat === undefined ? {} : { seat: entry.seat }),
  };
}

function isTurnFor(game: GameState, seat: Seat): boolean {
  if (game.phase.kind === 'turn') {
    return game.phase.seat === seat;
  }
  if (game.phase.kind === 'vote') {
    return game.phase.vote.proposerSeat === seat;
  }
  return false;
}

function buildPermissions(
  room: Room,
  viewer: RoomPlayer,
  game: GameState | null,
): Permissions {
  const connected = connectedPlayers(room);
  const isHost = room.hostId === viewer.id;
  const isPlaying = room.status === 'playing' && game !== null;
  const mode = game?.config.mode ?? room.settings.mode;
  const myTurn = !!game && game.phase.kind === 'turn' && game.phase.seat === viewer.seat;
  const turnPhase = game?.phase.kind === 'turn' ? game.phase : null;
  const handCount = game ? (game.hands[viewer.seat]?.length ?? 0) : 0;
  const myClaim =
    !!game &&
    game.phase.kind === 'claim' &&
    game.phase.eligibleSeats.includes(viewer.seat) &&
    game.phase.responses[viewer.seat] === undefined;
  const myVote =
    !!game &&
    game.phase.kind === 'vote' &&
    game.phase.vote.eligibleSeats.includes(viewer.seat) &&
    game.phase.vote.votes[viewer.seat] === undefined;
  const hasVoted =
    !!game &&
    game.phase.kind === 'vote' &&
    game.phase.vote.votes[viewer.seat] !== undefined;

  return {
    canReady: room.status === 'lobby',
    canStart:
      room.status === 'lobby' &&
      isHost &&
      connected.length >= 2 &&
      connected.every((player) => player.ready),
    canEditSettings: room.status === 'lobby' && isHost,
    canDiscard: isPlaying && mode === 'pin-ci' && myTurn,
    canHu: isPlaying && mode === 'pin-ci' && myTurn && turnPhase?.canHu === true,
    canPlayPhrase: isPlaying && mode === 'pao-pao' && myTurn && handCount >= 2,
    canPass: isPlaying && mode === 'pao-pao' && myTurn,
    canClaim: isPlaying && mode === 'pin-ci' && myClaim,
    canVote: isPlaying && myVote,
    hasVoted,
  };
}

function buildPhaseView(room: Room, viewer: RoomPlayer, game: GameState): PhaseView {
  const phase = game.phase;
  switch (phase.kind) {
    case 'turn':
      return {
        kind: 'turn',
        phaseId: phase.id,
        seat: phase.seat,
        canHu: phase.canHu,
        mustDiscard: phase.mustDiscard,
        deadline: room.timerDeadline ?? phase.deadline,
      };
    case 'claim':
      return {
        kind: 'claim',
        phaseId: phase.id,
        discarderSeat: phase.discarderSeat,
        tile: tileView(game, phase.tileId),
        eligibleSeats: [...phase.eligibleSeats],
        respondedSeats: Object.keys(phase.responses).map(Number),
        youAreEligible: phase.eligibleSeats.includes(viewer.seat),
        deadline: room.timerDeadline ?? phase.deadline,
      };
    case 'vote': {
      const tally = tallyVote(phase.vote);
      return {
        kind: 'vote',
        phaseId: phase.id,
        voteId: phase.vote.id,
        voteKind: phase.vote.kind,
        proposerSeat: phase.vote.proposerSeat,
        preview: {
          segments: segmentsView(game, phase.vote.segments),
          text: segmentsText(game, phase.vote.segments),
        },
        eligibleSeats: [...phase.vote.eligibleSeats],
        votedSeats: Object.keys(phase.vote.votes).map(Number),
        approvals: tally.approvals,
        rejects: tally.rejects,
        required: tally.required,
        yourVote: phase.vote.votes[viewer.seat] ?? null,
        deadline: room.timerDeadline ?? phase.vote.deadline,
      };
    }
    case 'over':
      return {
        kind: 'over',
        phaseId: phase.id,
        result: resultView(game, phase.result),
      };
  }
}

export function buildSnapshot(room: Room, viewerId: string, now: number): RoomSnapshot {
  const viewer = room.players.get(viewerId);
  if (!viewer) {
    throw new Error('snapshot viewer is not in the room');
  }

  const game = room.game;
  const revealAll = room.status === 'round-over';

  const players: PlayerView[] = playersBySeat(room).map((player) => {
    const revealHand =
      player.id === viewer.id || room.settings.openHands || revealAll;
    const hand =
      revealHand && game ? tilesView(game, game.hands[player.seat] ?? []) : undefined;

    return {
      id: player.id,
      name: player.name,
      seat: player.seat,
      ready: player.ready,
      connected: player.connected,
      wins: player.wins,
      handCount: game ? (game.hands[player.seat]?.length ?? 0) : 0,
      isTurn: !!game && isTurnFor(game, player.seat),
      ...(hand ? { hand } : {}),
    };
  });

  let gameView: GameView | undefined;
  if (game) {
    gameView = {
      mode: game.config.mode,
      roundNo: room.roundNo,
      wallCount: game.wall.length,
      turnSeat: game.turnSeat,
      phase: buildPhaseView(room, viewer, game),
      discards: game.discards.map<DiscardView>((entry) => ({
        tile: tileView(game, entry.tileId),
        bySeat: entry.seat,
        claimedBy: entry.claimedBy,
      })),
      phrases: game.phrases.map((entry) => ({
        seat: entry.seat,
        tiles: tilesView(game, entry.tileIds),
        text: entry.text,
        at: entry.at,
      })),
      log: game.log.slice(-120).map((entry) => displayLog(room, entry)),
      deadline: room.timerDeadline ?? getDeadline(game),
      ...(game.result ? { result: resultView(game, game.result) } : {}),
    };
  }

  return {
    roomCode: room.code,
    status: room.status,
    settings: { ...room.settings },
    hostId: room.hostId,
    serverNow: now,
    stateVersion: room.version,
    you: {
      playerId: viewer.id,
      seat: viewer.seat,
      isHost: room.hostId === viewer.id,
      permissions: buildPermissions(room, viewer, game),
    },
    players,
    ...(gameView ? { game: gameView } : {}),
  };
}
