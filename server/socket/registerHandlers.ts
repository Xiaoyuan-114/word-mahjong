import type { Clock } from '../clock';
import type { RoomService, ServiceResult } from '../rooms/roomService';
import type { Room, RoomPlayer } from '../rooms/roomTypes';
import { fail, ok, reply, type AckHandler } from './ack';
import {
  claimSchema,
  createRoomSchema,
  discardSchema,
  huSchema,
  joinRoomSchema,
  parsePayload,
  passSchema,
  phraseSchema,
  readySchema,
  resumeSchema,
  settingsPatchSchema,
  voteSchema,
} from './payloads';
import type { TypedServer, TypedSocket } from './types';

interface SocketContext {
  room: Room;
  player: RoomPlayer;
}

export function registerHandlers(io: TypedServer, service: RoomService, clock: Clock): void {
  const buckets = new Map<string, { start: number; count: number }>();

  function allow(socket: TypedSocket): boolean {
    const now = clock.now();
    const bucket = buckets.get(socket.id);
    if (!bucket || now - bucket.start >= 1000) {
      buckets.set(socket.id, { start: now, count: 1 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= 20;
  }

  function contextFor(socket: TypedSocket): SocketContext | null {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) {
      return null;
    }
    return service.context(roomCode, playerId, socket.id);
  }

  function sendResult<T>(
    ack: AckHandler<T> | undefined,
    result: ServiceResult<T>,
  ): void {
    if (result.ok) {
      reply(ack, ok(result.data));
    } else {
      reply(ack, fail(result.error.code, result.error.message));
    }
  }

  io.on('connection', (socket) => {
    socket.on('room:create', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      if (socket.data.roomCode) {
        reply(ack, fail('BAD_REQUEST', '你已经在房间里了'));
        return;
      }
      const parsed = parsePayload(createRoomSchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const result = service.createRoom(socket.id, parsed.data.nickname, parsed.data.settings);
      if (!result.ok) {
        reply(ack, fail(result.error.code, result.error.message));
        return;
      }
      socket.data.roomCode = result.data.roomCode;
      socket.data.playerId = result.data.playerId;
      reply(
        ack,
        ok({
          roomCode: result.data.roomCode,
          token: result.data.token,
          snapshot: result.data.snapshot,
        }),
      );
    });

    socket.on('room:join', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      if (socket.data.roomCode) {
        reply(ack, fail('BAD_REQUEST', '你已经在房间里了'));
        return;
      }
      const parsed = parsePayload(joinRoomSchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const result = service.joinRoom(socket.id, parsed.data.roomCode, parsed.data.nickname);
      if (!result.ok) {
        reply(ack, fail(result.error.code, result.error.message));
        return;
      }
      socket.data.roomCode = result.data.roomCode;
      socket.data.playerId = result.data.playerId;
      reply(ack, ok({ token: result.data.token, snapshot: result.data.snapshot }));
    });

    socket.on('session:resume', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const parsed = parsePayload(resumeSchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const result = service.resume(socket.id, parsed.data.roomCode, parsed.data.token);
      if (!result.ok) {
        reply(ack, fail(result.error.code, result.error.message));
        return;
      }
      socket.data.roomCode = result.data.roomCode;
      socket.data.playerId = result.data.playerId;
      reply(ack, ok({ snapshot: result.data.snapshot }));
    });

    socket.on('room:leave', (_payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      const result = service.leave(context.room, context.player);
      if (result.ok) {
        socket.data.roomCode = undefined;
        socket.data.playerId = undefined;
      }
      sendResult(ack, result);
    });

    socket.on('lobby:ready', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const parsed = parsePayload(readySchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      sendResult(ack, service.ready(context.room, context.player, parsed.data.ready));
    });

    socket.on('lobby:settings', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const parsed = parsePayload(settingsPatchSchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      sendResult(
        ack,
        service.updateSettings(context.room, context.player, parsed.data.patch),
      );
    });

    socket.on('lobby:start', (_payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      sendResult(ack, service.start(context.room, context.player));
    });

    socket.on('game:discard', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const parsed = parsePayload(discardSchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      sendResult(
        ack,
        service.discard(context.room, context.player, parsed.data.phaseId, parsed.data.tileId),
      );
    });

    socket.on('game:hu', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const parsed = parsePayload(huSchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      sendResult(
        ack,
        service.declareHu(context.room, context.player, parsed.data.phaseId, parsed.data.segments),
      );
    });

    socket.on('game:phrase', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const parsed = parsePayload(phraseSchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      sendResult(
        ack,
        service.playPhrase(context.room, context.player, parsed.data.phaseId, parsed.data.tileIds),
      );
    });

    socket.on('game:pass', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const parsed = parsePayload(passSchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      sendResult(ack, service.pass(context.room, context.player, parsed.data.phaseId));
    });

    socket.on('game:claim', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const parsed = parsePayload(claimSchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      sendResult(
        ack,
        service.respondClaim(context.room, context.player, parsed.data.phaseId, parsed.data.take),
      );
    });

    socket.on('game:vote', (payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const parsed = parsePayload(voteSchema, payload);
      if (!parsed.ok) {
        reply(ack, fail('BAD_REQUEST', parsed.message));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      sendResult(
        ack,
        service.castVote(context.room, context.player, parsed.data.phaseId, parsed.data.approve),
      );
    });

    socket.on('round:next', (_payload, ack) => {
      if (!allow(socket)) {
        reply(ack, fail('RATE_LIMITED', '操作太快了'));
        return;
      }
      const context = contextFor(socket);
      if (!context) {
        reply(ack, fail('SESSION_INVALID', '会话已失效，请重新进入房间'));
        return;
      }
      sendResult(ack, service.nextRound(context.room, context.player));
    });

    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      if (roomCode && playerId) {
        service.disconnect(roomCode, playerId, socket.id);
      }
      buckets.delete(socket.id);
    });
  });
}
