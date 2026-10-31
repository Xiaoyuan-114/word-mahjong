import { randomBytes, randomInt } from 'node:crypto';

export function createSessionToken(): string {
  return randomBytes(24).toString('base64url');
}

export function createRoomSeed(): number {
  return randomInt(1, 2_147_483_647);
}
