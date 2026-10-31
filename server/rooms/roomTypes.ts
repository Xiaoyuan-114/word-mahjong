import type { GameState } from '@shared/engine';
import type { RoomSettings, RoomStatus } from '@shared/types';

export interface RoomPlayer {
  id: string;
  token: string;
  name: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
  wins: number;
}

export interface Room {
  code: string;
  status: RoomStatus;
  version: number;
  settings: RoomSettings;
  hostId: string;
  players: Map<string, RoomPlayer>;
  game: GameState | null;
  roundNo: number;
  createdAt: number;
  lastActivityAt: number;
  timerHandle: ReturnType<typeof setTimeout> | null;
  timerGen: number;
  timerDeadline: number | null;
}
