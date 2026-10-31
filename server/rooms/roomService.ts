import { abandonGame, applyAction, applyTimeout, createGame } from '@shared/engine';
import type { GameAction, GameConfig } from '@shared/engine';
import type { RoomSettings, RoomSnapshot, SocketErrorCode } from '@shared/types';
import type { Clock } from '../clock';
import type { ServerTimers } from '../config';
import { buildSnapshot } from '../snapshot';
import { createRoomSeed, createSessionToken } from '../sessions';
import type { TypedServer } from '../socket/types';
import type { RoomManager } from './RoomManager';
import type { RoomTimerScheduler } from './timerScheduler';
import type { Room, RoomPlayer } from './roomTypes';
import {
  compactSeats,
  connectedPlayers,
  ensureHost,
  findPlayerByToken,
  nameForSeat,
  playerAtSeat,
} from './roomUtils';

export interface ServiceError {
  code: SocketErrorCode;
  message: string;
}

export type ServiceResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

export interface SessionData {
  roomCode: string;
  playerId: string;
  token: string;
  snapshot: RoomSnapshot;
}

function success<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

function fail<T = null>(code: SocketErrorCode, message: string): ServiceResult<T> {
  return { ok: false, error: { code, message } };
}

function normalizeSettings(settings: RoomSettings): RoomSettings {
  const maxPlayers =
    settings.maxPlayers === 2 || settings.maxPlayers === 3 || settings.maxPlayers === 4
      ? settings.maxPlayers
      : 4;
  const mode = settings.mode === 'pao-pao' ? 'pao-pao' : 'pin-ci';
  const claimPolicy =
    mode === 'pao-pao'
      ? 'off'
      : settings.claimPolicy === 'all' || settings.claimPolicy === 'off'
        ? settings.claimPolicy
        : 'next';

  return {
    mode,
    maxPlayers,
    openHands: Boolean(settings.openHands),
    claimPolicy,
  };
}

export class RoomService {
  private disposed = false;

  constructor(
    private readonly io: TypedServer,
    private readonly manager: RoomManager,
    private readonly scheduler: RoomTimerScheduler,
    private readonly clock: Clock,
    private readonly timers: ServerTimers,
  ) {}

  createRoom(
    socketId: string,
    nickname: string,
    settings: RoomSettings,
  ): ServiceResult<SessionData> {
    const now = this.clock.now();
    const token = createSessionToken();
    const { room, player } = this.manager.createRoom(
      normalizeSettings(settings),
      nickname,
      socketId,
      token,
      now,
    );

    this.scheduler.schedule(room);
    this.broadcast(room);

    return success({
      roomCode: room.code,
      playerId: player.id,
      token,
      snapshot: buildSnapshot(room, player.id, now),
    });
  }

  joinRoom(socketId: string, code: string, nickname: string): ServiceResult<SessionData> {
    const room = this.manager.get(code);
    if (!room) {
      return fail('ROOM_NOT_FOUND', '房间不存在或已解散');
    }
    if (room.status !== 'lobby') {
      return fail('ROOM_STARTED', '房间已经开始，不能再加入');
    }
    if (room.players.size >= room.settings.maxPlayers) {
      return fail('ROOM_FULL', '房间已满');
    }

    const now = this.clock.now();
    const token = createSessionToken();
    let player: RoomPlayer;
    try {
      player = this.manager.addPlayer(room, nickname, socketId, token);
    } catch {
      return fail('ROOM_FULL', '房间已满');
    }

    room.version += 1;
    room.lastActivityAt = now;
    this.ensureHostAndNotify(room);
    this.scheduler.schedule(room);
    this.broadcast(room);
    this.notify(room, `${player.name} 加入了房间`);

    return success({
      roomCode: room.code,
      playerId: player.id,
      token,
      snapshot: buildSnapshot(room, player.id, now),
    });
  }

  resume(socketId: string, code: string, token: string): ServiceResult<SessionData> {
    const room = this.manager.get(code);
    if (!room) {
      return fail('SESSION_INVALID', '房间已失效，请重新创建');
    }

    const player = findPlayerByToken(room, token);
    if (!player) {
      return fail('SESSION_INVALID', '会话无效，请重新加入');
    }

    if (player.socketId && player.socketId !== socketId) {
      this.io.to(player.socketId).emit('session:replaced', { reason: 'duplicate' });
      this.io.sockets.sockets.get(player.socketId)?.disconnect(true);
    }

    const now = this.clock.now();
    player.socketId = socketId;
    player.connected = true;
    room.version += 1;
    room.lastActivityAt = now;
    this.ensureHostAndNotify(room);
    this.scheduler.schedule(room);
    this.broadcast(room);

    return success({
      roomCode: room.code,
      playerId: player.id,
      token: player.token,
      snapshot: buildSnapshot(room, player.id, now),
    });
  }

  context(
    roomCode: string,
    playerId: string,
    socketId: string,
  ): { room: Room; player: RoomPlayer } | null {
    const room = this.manager.get(roomCode);
    if (!room) {
      return null;
    }
    const player = room.players.get(playerId);
    if (!player || player.socketId !== socketId) {
      return null;
    }
    return { room, player };
  }

  leave(room: Room, player: RoomPlayer): ServiceResult<null> {
    const now = this.clock.now();
    room.players.delete(player.id);
    room.version += 1;
    room.lastActivityAt = now;

    if (room.status === 'playing' && room.game) {
      const abandoned = abandonGame(room.game, now);
      if (abandoned.ok) {
        room.game = abandoned.state;
      }
      room.status = 'round-over';

      if (room.players.size === 0) {
        this.closeRoom(room, '房间已空');
        this.manager.delete(room);
        return success(null);
      }

      this.ensureHostAndNotify(room);
      this.scheduler.schedule(room);
      this.broadcast(room);
      this.notify(room, `${player.name} 离开，本局中止`, 'warn');
      return success(null);
    }

    if (room.players.size === 0) {
      this.closeRoom(room, '房间已空');
      this.manager.delete(room);
      return success(null);
    }

    this.ensureHostAndNotify(room);
    this.scheduler.schedule(room);
    this.broadcast(room);
    this.notify(room, `${player.name} 离开了房间`);
    return success(null);
  }

  disconnect(roomCode: string, playerId: string, socketId: string): void {
    if (this.disposed) {
      return;
    }
    const room = this.manager.get(roomCode);
    if (!room) {
      return;
    }
    const player = room.players.get(playerId);
    if (!player || player.socketId !== socketId) {
      return;
    }

    player.connected = false;
    player.socketId = null;
    room.version += 1;
    room.lastActivityAt = this.clock.now();
    this.ensureHostAndNotify(room);
    this.scheduler.schedule(room);
    this.broadcast(room);
  }

  ready(room: Room, player: RoomPlayer, ready: boolean): ServiceResult<null> {
    if (room.status !== 'lobby') {
      return fail('ROOM_LOCKED', '现在不能准备');
    }

    player.ready = ready;
    room.version += 1;
    room.lastActivityAt = this.clock.now();
    this.scheduler.schedule(room);
    this.broadcast(room);
    return success(null);
  }

  updateSettings(
    room: Room,
    player: RoomPlayer,
    patch: Partial<Pick<RoomSettings, 'mode' | 'openHands' | 'claimPolicy'>>,
  ): ServiceResult<null> {
    if (room.status !== 'lobby') {
      return fail('ROOM_LOCKED', '开局后不能修改设置');
    }
    if (room.hostId !== player.id) {
      return fail('NOT_HOST', '只有房主能修改设置');
    }

    const next: RoomSettings = { ...room.settings, ...patch };
    if (next.mode !== 'pin-ci' && next.mode !== 'pao-pao') {
      return fail('BAD_REQUEST', '未知的模式');
    }
    if (
      next.claimPolicy !== 'next' &&
      next.claimPolicy !== 'all' &&
      next.claimPolicy !== 'off'
    ) {
      return fail('BAD_REQUEST', '未知的抢字策略');
    }
    if (next.mode === 'pao-pao') {
      next.claimPolicy = 'off';
    }

    room.settings = next;
    room.version += 1;
    room.lastActivityAt = this.clock.now();
    this.scheduler.schedule(room);
    this.broadcast(room);
    return success(null);
  }

  start(room: Room, player: RoomPlayer): ServiceResult<null> {
    if (room.status !== 'lobby') {
      return fail('ROOM_LOCKED', '现在不能开局');
    }
    if (room.hostId !== player.id) {
      return fail('NOT_HOST', '只有房主能开始游戏');
    }

    const connected = connectedPlayers(room);
    if (connected.length < 2) {
      return fail('NOT_ENOUGH_PLAYERS', '至少需要 2 名在线玩家');
    }
    if (connected.some((candidate) => !candidate.ready)) {
      return fail('NOT_ALL_READY', '还有玩家没有准备');
    }

    for (const candidate of [...room.players.values()]) {
      if (!candidate.connected) {
        room.players.delete(candidate.id);
      }
    }

    const seated = connectedPlayers(room);
    compactSeats(seated);
    ensureHost(room);

    const now = this.clock.now();
    const config: GameConfig = {
      mode: room.settings.mode,
      seats: seated.length,
      seed: createRoomSeed(),
      turnMs: this.timers.turnMs,
      voteMs: this.timers.voteMs,
      claimMs: this.timers.claimMs,
      claimPolicy:
        room.settings.mode === 'pao-pao' ? 'off' : room.settings.claimPolicy,
    };

    room.game = createGame(config, now);
    room.status = 'playing';
    room.roundNo += 1;
    room.version += 1;
    room.lastActivityAt = now;
    for (const candidate of room.players.values()) {
      candidate.ready = false;
    }

    this.scheduler.schedule(room);
    this.broadcast(room);
    this.notify(room, `第 ${room.roundNo} 局开始`);
    return success(null);
  }

  nextRound(room: Room, player: RoomPlayer): ServiceResult<null> {
    if (room.status !== 'round-over') {
      return fail('ROOM_LOCKED', '本局还没有结束');
    }
    if (room.hostId !== player.id) {
      return fail('NOT_HOST', '只有房主能开始下一局');
    }

    room.status = 'lobby';
    room.game = null;
    room.version += 1;
    room.lastActivityAt = this.clock.now();
    for (const candidate of room.players.values()) {
      candidate.ready = false;
    }
    ensureHost(room);

    this.scheduler.schedule(room);
    this.broadcast(room);
    this.notify(room, '回到大厅，准备下一局');
    return success(null);
  }

  discard(
    room: Room,
    player: RoomPlayer,
    phaseId: string,
    tileId: string,
  ): ServiceResult<null> {
    return this.applyGameAction(room, {
      type: 'discard',
      seat: player.seat,
      phaseId,
      tileId,
    });
  }

  declareHu(
    room: Room,
    player: RoomPlayer,
    phaseId: string,
    segments: string[][],
  ): ServiceResult<null> {
    return this.applyGameAction(room, {
      type: 'declareHu',
      seat: player.seat,
      phaseId,
      segments,
    });
  }

  playPhrase(
    room: Room,
    player: RoomPlayer,
    phaseId: string,
    tileIds: string[],
  ): ServiceResult<null> {
    return this.applyGameAction(room, {
      type: 'playPhrase',
      seat: player.seat,
      phaseId,
      tileIds,
    });
  }

  pass(room: Room, player: RoomPlayer, phaseId: string): ServiceResult<null> {
    return this.applyGameAction(room, {
      type: 'passTurn',
      seat: player.seat,
      phaseId,
    });
  }

  respondClaim(
    room: Room,
    player: RoomPlayer,
    phaseId: string,
    take: boolean,
  ): ServiceResult<null> {
    return this.applyGameAction(room, {
      type: 'respondClaim',
      seat: player.seat,
      phaseId,
      take,
    });
  }

  castVote(
    room: Room,
    player: RoomPlayer,
    phaseId: string,
    approve: boolean,
  ): ServiceResult<null> {
    return this.applyGameAction(room, {
      type: 'castVote',
      seat: player.seat,
      phaseId,
      approve,
    });
  }

  timeout(room: Room, now: number): void {
    if (this.disposed || room.status !== 'playing' || !room.game) {
      return;
    }
    const result = applyTimeout(room.game, now);
    if (!result.ok) {
      return;
    }
    this.applyGameState(room, result.state, now);
  }

  closeRoom(room: Room, reason: string): void {
    this.scheduler.clear(room);
    for (const player of room.players.values()) {
      if (player.connected && player.socketId) {
        this.io.to(player.socketId).emit('room:closed', { reason });
      }
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const room of this.manager.values()) {
      this.scheduler.clear(room);
    }
  }

  private applyGameAction(room: Room, action: GameAction): ServiceResult<null> {
    if (room.status !== 'playing' || !room.game) {
      return fail('ROOM_LOCKED', '本局尚未开始或已结束');
    }

    const now = this.clock.now();
    const result = applyAction(room.game, action, now);
    if (!result.ok) {
      return fail(result.error.code, result.error.message);
    }

    this.applyGameState(room, result.state, now);
    return success(null);
  }

  private applyGameState(
    room: Room,
    state: NonNullable<Room['game']>,
    now: number,
  ): void {
    const wasPlaying = room.status === 'playing';
    room.game = state;
    room.version += 1;
    room.lastActivityAt = now;

    if (state.phase.kind === 'over' && wasPlaying) {
      room.status = 'round-over';
      const winner = state.result?.winnerSeat;
      if (winner !== null && winner !== undefined) {
        const winnerPlayer = playerAtSeat(room, winner);
        if (winnerPlayer) {
          winnerPlayer.wins += 1;
        }
      }

      const message =
        state.result?.reason === 'abandoned'
          ? '本局中止'
          : winner === null || winner === undefined
            ? '流局'
            : `${nameForSeat(room, winner)} 获胜`;
      this.notify(room, message);
    }

    this.scheduler.schedule(room);
    this.broadcast(room);
  }

  private broadcast(room: Room): void {
    if (this.disposed) {
      return;
    }
    const now = this.clock.now();
    for (const player of room.players.values()) {
      if (!player.connected || !player.socketId) {
        continue;
      }
      this.io.to(player.socketId).emit('room:snapshot', buildSnapshot(room, player.id, now));
    }
  }

  private notify(room: Room, message: string, level: 'info' | 'warn' = 'info'): void {
    if (this.disposed) {
      return;
    }
    for (const player of room.players.values()) {
      if (player.connected && player.socketId) {
        this.io.to(player.socketId).emit('notice', { level, message });
      }
    }
  }

  private ensureHostAndNotify(room: Room): void {
    const previous = room.hostId;
    if (!ensureHost(room) || room.hostId === previous) {
      return;
    }
    const hostName = room.players.get(room.hostId)?.name;
    if (hostName) {
      this.notify(room, `房主已转移给 ${hostName}`);
    }
  }
}
