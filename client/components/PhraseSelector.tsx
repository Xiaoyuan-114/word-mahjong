import { useMemo, useState } from 'react';
import type { TileView } from '@shared/types';
import { HandRack } from './HandRack';

interface PhraseSelectorProps {
  hand: TileView[];
  pending: boolean;
  onPlay: (tileIds: string[]) => Promise<boolean>;
  onPass: () => Promise<boolean>;
}

export function PhraseSelector({
  hand,
  pending,
  onPlay,
  onPass,
}: PhraseSelectorProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const tileById = useMemo(() => new Map(hand.map((tile) => [tile.id, tile])), [hand]);
  const text = selected.map((tileId) => tileById.get(tileId)?.char ?? '').join('');
  const canPlay = selected.length >= 2 && selected.length <= 5 && !pending;

  function toggle(tile: TileView) {
    setSelected((current) => {
      if (current.includes(tile.id)) {
        return current.filter((id) => id !== tile.id);
      }
      if (current.length >= 5) {
        return current;
      }
      return [...current, tile.id];
    });
  }

  async function play() {
    if (!canPlay) {
      return;
    }
    await onPlay([...selected]);
  }

  return (
    <section className="phrase-panel panel">
      <header className="phrase-head">
        <div>
          <p className="eyebrow">跑跑胡 · 你的回合</p>
          <h2>打出一句短句</h2>
          <p className="composer-hint">先只剩 3 张牌的人获胜；提交后由其他玩家表决。</p>
        </div>
        <span className="composer-counter">{selected.length} / 5</span>
      </header>

      <div className={`phrase-preview ${text ? 'has-text' : ''}`}>
        <span className="phrase-label">短句</span>
        <strong>{text || '从手牌里选 2–5 张'}</strong>
      </div>

      <div className="composer-hand">
        <HandRack
          tiles={hand}
          selectedIds={selected}
          disabled={pending}
          showOrder
          onTileClick={toggle}
        />
      </div>

      <div className="composer-actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setSelected([])}
          disabled={pending || selected.length === 0}
        >
          清空
        </button>
        <span className="composer-spacer" />
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void onPass()}
          disabled={pending}
        >
          过
        </button>
        <button
          type="button"
          className="btn btn--jade"
          onClick={() => void play()}
          disabled={!canPlay}
        >
          {pending ? '提交中…' : '打出短句'}
        </button>
      </div>
    </section>
  );
}
