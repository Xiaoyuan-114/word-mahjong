import { useEffect, useMemo, useState } from 'react';
import type { TileView } from '@shared/types';

export interface HandOrder {
  orderedHand: TileView[];
  moveTile: (draggedId: string, targetId: string) => void;
}

export function useHandOrder(hand: TileView[]): HandOrder {
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    setOrder((current) => {
      const ids = new Set(hand.map((tile) => tile.id));
      const next = current.filter((id) => ids.has(id));
      for (const tile of hand) {
        if (!next.includes(tile.id)) {
          next.push(tile.id);
        }
      }
      if (
        next.length === current.length &&
        next.every((id, index) => id === current[index])
      ) {
        return current;
      }
      return next;
    });
  }, [hand]);

  const orderedHand = useMemo(() => {
    const byId = new Map(hand.map((tile) => [tile.id, tile]));
    const ordered = order
      .map((id) => byId.get(id))
      .filter((tile): tile is TileView => Boolean(tile));
    const seen = new Set(ordered.map((tile) => tile.id));
    for (const tile of hand) {
      if (!seen.has(tile.id)) {
        ordered.push(tile);
      }
    }
    return ordered;
  }, [hand, order]);

  function moveTile(draggedId: string, targetId: string) {
    setOrder((current) => {
      const base = current.length > 0 ? current : hand.map((tile) => tile.id);
      const from = base.indexOf(draggedId);
      const to = base.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) {
        return base;
      }
      const next = [...base];
      next.splice(from, 1);
      const insertAt = from < to ? to - 1 : to;
      next.splice(insertAt, 0, draggedId);
      return next;
    });
  }

  return { orderedHand, moveTile };
}
