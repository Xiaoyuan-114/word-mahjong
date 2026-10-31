export interface ServerTimers {
  turnMs: number;
  voteMs: number;
  claimMs: number;
  disconnectedTurnMs: number;
  roomSweepMs: number;
  roomIdleMs: number;
}

export const defaultTimers: ServerTimers = {
  turnMs: 90_000,
  voteMs: 20_000,
  claimMs: 5_000,
  disconnectedTurnMs: 2_000,
  roomSweepMs: 30_000,
  roomIdleMs: 5 * 60_000,
};

export const SERVER_PORT = Number(process.env.PORT ?? 3001);
