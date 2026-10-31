import { getDeadline } from '@shared/engine';
import type { Clock } from '../clock';
import type { ServerTimers } from '../config';
import type { Room } from './roomTypes';
import { playerAtSeat } from './roomUtils';

export type TimeoutHandler = (room: Room, now: number) => void;

export class RoomTimerScheduler {
  constructor(
    private readonly clock: Clock,
    private readonly timers: ServerTimers,
    private readonly onTimeout: TimeoutHandler,
  ) {}

  clear(room: Room): void {
    room.timerGen += 1;
    if (room.timerHandle !== null) {
      this.clock.clearTimeout(room.timerHandle);
      room.timerHandle = null;
    }
    room.timerDeadline = null;
  }

  schedule(room: Room): void {
    this.clear(room);
    if (room.status !== 'playing' || !room.game) {
      return;
    }

    const now = this.clock.now();
    const deadline = getDeadline(room.game);
    if (deadline === null) {
      return;
    }

    let effective = deadline;
    if (room.game.phase.kind === 'turn') {
      const player = playerAtSeat(room, room.game.phase.seat);
      if (player && !player.connected) {
        effective = Math.min(deadline, now + this.timers.disconnectedTurnMs);
      }
    }

    room.timerDeadline = effective;
    this.arm(room, room.timerGen, effective);
  }

  private arm(room: Room, generation: number, deadline: number): void {
    const now = this.clock.now();
    const delay = Math.max(0, deadline - now) + 15;
    room.timerHandle = this.clock.setTimeout(() => {
      if (generation !== room.timerGen) {
        return;
      }
      if (room.status !== 'playing' || !room.game) {
        return;
      }

      const current = this.clock.now();
      if (current < deadline) {
        this.arm(room, generation, deadline);
        return;
      }

      room.timerHandle = null;
      this.onTimeout(room, current);
    }, delay);
  }
}
