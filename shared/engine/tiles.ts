import { mulberry32, shuffle } from './rng';
import type { TileId } from './types';

export const CHARACTER_POOL = [
  '我', '你', '他', '她', '它', '们', '的', '了', '是', '不', '有', '没', '在', '这', '那',
  '一', '个', '人', '上', '下', '来', '去', '说', '想', '看', '到', '过', '就', '都', '也',
  '很', '还', '因', '所', '以', '但', '被', '把', '给', '让', '对', '从', '会', '能', '要',
  '可', '别', '太', '最', '更', '再', '又', '已', '经', '着', '得', '地', '之', '和', '与',
  '或', '如', '果', '虽', '然', '吗', '呢', '吧', '啊',
  '天', '日', '年', '月', '风', '雨', '花', '山', '水', '火', '土', '心', '手', '口', '目',
  '耳', '马', '牛', '羊', '猫', '狗', '鱼', '鸟', '神', '鬼', '王', '老', '板', '朋', '友',
  '爱', '恨', '吃', '喝', '睡', '走', '跑', '笑', '哭', '唱', '跳', '买', '书', '字', '词',
  '句', '诗', '歌', '酒', '茶', '饭', '面', '肉', '菜', '春', '夏', '秋', '冬', '东',
  '南', '西', '北', '中', '大', '小', '多', '少', '好', '坏', '事', '物', '理', '真', '假',
  '美', '丑', '新', '旧', '快', '慢', '高', '低', '长', '短', '远', '近', '前', '后', '回',
  '出', '入', '开', '关', '坐', '立', '站', '躺', '飞', '游',
] as const;

export const TILE_COPIES = 2;
export const TOTAL_TILES = CHARACTER_POOL.length * TILE_COPIES;

export interface BuiltWall {
  tiles: TileId[];
  chars: Record<TileId, string>;
}

export function buildWall(seed: number): BuiltWall {
  const tiles: TileId[] = [];
  const chars: Record<TileId, string> = {};

  CHARACTER_POOL.forEach((char, charIndex) => {
    for (let copy = 0; copy < TILE_COPIES; copy += 1) {
      const tileId = `t${charIndex}-${copy}`;
      tiles.push(tileId);
      chars[tileId] = char;
    }
  });

  shuffle(tiles, mulberry32(seed));
  return { tiles, chars };
}
