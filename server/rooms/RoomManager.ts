import { randomInt, randomUUID } from 'node:crypto';
import type { Clock } from '../clock';
import type { ServerTimers } from '../config';
import type { RoomSettings } from '@shared/types';
import type { Room, RoomPlayer } from './roomTypes';
import { nextFreeSeat, normalizeNickname } from './roomUtils';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const ABSOLUTE_IDLE_MS = 2 * 60 * 60 * 1000;
const PLAYING_IDLE_MS = 10 * 60 * 1000;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private sweepHandle: ReturnType<typeof setTimeout> | null = null;
  private sweepEnabled = false;
  private onClose: ((room: Room) => void) | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly timers: ServerTimers,
  ) {}

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(room: Room): void {
    this.rooms.delete(room.code);
  }

  values(): IterableIterator<Room> {
    return this.rooms.values();
  }

  get size(): number {
    return this.rooms.size;
  }

  createRoom(
    settings: RoomSettings,
    nickname: string,
    socketId: string,
    token: string,
    now: number,
  ): { room: Room; player: RoomPlayer } {
    const code = this.generateCode();
    const room: Room = {
      code,
      status: 'lobby',
      version: 1,
      settings: { ...settings },
      hostId: '',
      players: new Map(),
      game: null,
      roundNo: 0,
      createdAt: now,
      lastActivityAt: now,
      timerHandle: null,
      timerGen: 0,
      timerDeadline: null,
    };

    const player: RoomPlayer = {
      id: randomUUID(),
      token,
      name: normalizeNickname(nickname, []),
      seat: 0,
      ready: false,
      connected: true,
      socketId,
      wins: 0,
    };

    room.players.set(player.id, player);
    room.hostId = player.id;
    this.rooms.set(room.code, room);
    return { room, player };
  }

  addPlayer(
    room: Room,
    nickname: string,
    socketId: string,
    token: string,
  ): RoomPlayer {
    const seat = nextFreeSeat(room);
    if (seat < 0) {
      throw new Error('room is full');
    }

    const player: RoomPlayer = {
      id: randomUUID(),
      token,
      name: normalizeNickname(
        nickname,
        [...room.players.values()].map((existing) => existing.name),
      ),
      seat,
      ready: false,
      connected: true,
      socketId,
      wins: 0,
    };
    room.players.set(player.id, player);
    return player;
  }

  startSweeper(onClose: (room: Room) => void): void {
    this.stopSweeper();
    this.onClose = onClose;
    this.sweepEnabled = true;
    this.scheduleSweep();
  }

  stopSweeper(): void {
    this.sweepEnabled = false;
    if (this.sweepHandle !== null) {
      this.clock.clearTimeout(this.sweepHandle);
      this.sweepHandle = null;
    }
  }

  sweep(): void {
    const now = this.clock.now();
    for (const room of [...this.rooms.values()]) {
      const hasConnectedPlayer = [...room.players.values()].some((player) => player.connected);
      const idleMs = now - room.lastActivityAt;
      const absoluteIdleMs = now - room.createdAt;
      const idleLimit = room.status === 'playing' ? PLAYING_IDLE_MS : this.timers.roomIdleMs;
      const shouldClose =
        absoluteIdleMs > ABSOLUTE_IDLE_MS || (!hasConnectedPlayer && idleMs > idleLimit);

      if (shouldClose) {
        this.onClose?.(room);
        this.rooms.delete(room.code);
      }
    }
  }

  private scheduleSweep(): void {
    if (!this.sweepEnabled) {
      return;
    }
    this.sweepHandle = this.clock.setTimeout(() => {
      if (!this.sweepEnabled) {
        return;
      }
      this.sweep();
      this.scheduleSweep();
    }, this.timers.roomSweepMs);
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let code = '';
      for (let index = 0; index < CODE_LENGTH; index += 1) {
        code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    throw new Error('could not allocate a room code');
  }
}
