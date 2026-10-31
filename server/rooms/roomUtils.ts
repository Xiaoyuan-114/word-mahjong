import type { Room, RoomPlayer } from './roomTypes';

export function playersBySeat(room: Room): RoomPlayer[] {
  return [...room.players.values()].sort((left, right) => left.seat - right.seat);
}

export function connectedPlayers(room: Room): RoomPlayer[] {
  return playersBySeat(room).filter((player) => player.connected);
}

export function playerAtSeat(room: Room, seat: number): RoomPlayer | undefined {
  return playersBySeat(room).find((player) => player.seat === seat);
}

export function nextFreeSeat(room: Room): number {
  const used = new Set([...room.players.values()].map((player) => player.seat));
  for (let seat = 0; seat < room.settings.maxPlayers; seat += 1) {
    if (!used.has(seat)) {
      return seat;
    }
  }
  return -1;
}

export function compactSeats(players: RoomPlayer[]): void {
  [...players]
    .sort((left, right) => left.seat - right.seat)
    .forEach((player, index) => {
      player.seat = index;
    });
}

export function normalizeNickname(raw: string, existingNames: Iterable<string>): string {
  const cleaned =
    raw
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, 12) || '玩家';
  const names = new Set(existingNames);
  if (!names.has(cleaned)) {
    return cleaned;
  }

  let suffix = 2;
  while (suffix < 10_000) {
    const suffixText = String(suffix);
    const candidate = `${cleaned.slice(0, Math.max(1, 12 - suffixText.length))}${suffixText}`;
    if (!names.has(candidate)) {
      return candidate;
    }
    suffix += 1;
  }
  return cleaned.slice(0, 8) + String(Date.now()).slice(-4);
}

export function ensureHost(room: Room): boolean {
  const current = room.players.get(room.hostId);
  if (current?.connected) {
    return false;
  }

  const next = connectedPlayers(room)[0] ?? playersBySeat(room)[0];
  const nextHostId = next?.id ?? '';
  if (nextHostId === room.hostId) {
    return false;
  }
  room.hostId = nextHostId;
  return true;
}

export function nameForSeat(room: Room, seat: number): string {
  return playerAtSeat(room, seat)?.name ?? `${seat + 1}号位`;
}

export function findPlayerByToken(room: Room, token: string): RoomPlayer | undefined {
  for (const player of room.players.values()) {
    if (player.token === token) {
      return player;
    }
  }
  return undefined;
}
