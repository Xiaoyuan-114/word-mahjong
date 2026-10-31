import type { GameState, Seat, TileId, ValidationResult } from './types';

export function validateHuSegments(
  state: GameState,
  seat: Seat,
  segments: TileId[][],
): ValidationResult {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { ok: false, code: 'SEGMENT_EMPTY', message: '至少要有一段话' };
  }
  if (segments.some((segment) => !Array.isArray(segment) || segment.length === 0)) {
    return { ok: false, code: 'SEGMENT_EMPTY', message: '每一段都不能为空' };
  }

  const hand = state.hands[seat];
  if (!hand) {
    return { ok: false, code: 'INVALID_TILES', message: '无效座位' };
  }

  const flat = segments.flat();
  if (flat.length !== hand.length) {
    return {
      ok: false,
      code: 'WRONG_TILE_COUNT',
      message: `需要用完手里的 ${hand.length} 张牌`,
    };
  }
  if (new Set(flat).size !== flat.length) {
    return { ok: false, code: 'INVALID_TILES', message: '同一张牌不能重复使用' };
  }

  const handSet = new Set(hand);
  if (flat.some((tileId) => !handSet.has(tileId))) {
    return { ok: false, code: 'INVALID_TILES', message: '使用了不在手里的牌' };
  }

  return { ok: true };
}
