import type { GameState, Seat, TileId, ValidationResult } from './types';

export const MIN_PHRASE_TILES = 2;
export const MAX_PHRASE_TILES = 5;

export function validatePhrase(
  state: GameState,
  seat: Seat,
  tileIds: TileId[],
): ValidationResult {
  const hand = state.hands[seat];
  if (!hand) {
    return { ok: false, code: 'INVALID_TILES', message: '无效座位' };
  }
  if (!Array.isArray(tileIds) || tileIds.length < MIN_PHRASE_TILES || tileIds.length > MAX_PHRASE_TILES) {
    return {
      ok: false,
      code: 'PHRASE_SIZE',
      message: `短句需要 ${MIN_PHRASE_TILES}–${MAX_PHRASE_TILES} 张牌`,
    };
  }
  if (new Set(tileIds).size !== tileIds.length) {
    return { ok: false, code: 'INVALID_TILES', message: '同一张牌不能重复使用' };
  }

  const handSet = new Set(hand);
  if (tileIds.some((tileId) => !handSet.has(tileId))) {
    return { ok: false, code: 'INVALID_TILES', message: '使用了不在手里的牌' };
  }

  return { ok: true };
}
