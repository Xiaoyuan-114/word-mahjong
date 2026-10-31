import { useMemo, useState } from 'react';
import type { TileView } from '@shared/types';
import { HandRack } from './HandRack';
import { Tile } from './Tile';

interface SentenceComposerProps {
  hand: TileView[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (segments: string[][]) => Promise<boolean>;
}

export function SentenceComposer({
  hand,
  pending,
  onCancel,
  onSubmit,
}: SentenceComposerProps) {
  const [segments, setSegments] = useState<string[][]>([[]]);
  const stagedIds = useMemo(() => segments.flat(), [segments]);
  const stagedSet = useMemo(() => new Set(stagedIds), [stagedIds]);
  const tileById = useMemo(() => new Map(hand.map((tile) => [tile.id, tile])), [hand]);

  const used = stagedIds.length;
  const allUsed = hand.length > 0 && used === hand.length;
  const noEmpty = segments.length > 0 && segments.every((segment) => segment.length > 0);
  const canSubmit = allUsed && noEmpty && !pending;
  const lastSegment = segments[segments.length - 1];

  function append(tile: TileView) {
    if (stagedSet.has(tile.id)) {
      return;
    }
    setSegments((current) => {
      const next = current.map((segment) => [...segment]);
      const last = next[next.length - 1];
      if (last) {
        last.push(tile.id);
      } else {
        next.push([tile.id]);
      }
      return next;
    });
  }

  function remove(tileId: string) {
    setSegments((current) => {
      const next = current.map((segment) => segment.filter((id) => id !== tileId));
      const kept = next.filter(
        (segment, index) => segment.length > 0 || index === next.length - 1,
      );
      return kept.length > 0 ? kept : [[]];
    });
  }

  function breakSegment() {
    setSegments((current) => {
      const last = current[current.length - 1];
      if (!last || last.length === 0) {
        return current;
      }
      return [...current, []];
    });
  }

  function undo() {
    setSegments((current) => {
      const next = current.map((segment) => [...segment]);
      while (next.length > 1 && next[next.length - 1]!.length === 0) {
        next.pop();
      }
      const last = next[next.length - 1];
      if (last && last.length > 0) {
        last.pop();
      }
      return next;
    });
  }

  async function submit() {
    if (!canSubmit) {
      return;
    }
    await onSubmit(segments.map((segment) => [...segment]));
  }

  return (
    <section className="composer panel">
      <header className="composer-head">
        <div>
          <p className="eyebrow">组句胡牌</p>
          <h2>把手里的字编成一出戏</h2>
        </div>
        <span className={`composer-counter ${allUsed ? 'is-full' : ''}`}>
          已用 {used} / {hand.length}
        </span>
      </header>

      <p className="composer-hint">按顺序点牌；想分段就点“断句”。必须用完手里全部牌。</p>

      <div className="staged-row" aria-live="polite">
        {segments.map((segment, index) => (
          <div className="staged-group" key={index}>
            {index > 0 && (
              <span className="staged-sep" aria-hidden="true">
                ｜
              </span>
            )}
            {segment.length === 0 ? (
              <span className="staged-empty">待续</span>
            ) : (
              segment.map((tileId) => {
                const tile = tileById.get(tileId);
                return tile ? (
                  <Tile
                    key={tileId}
                    tile={tile}
                    size="md"
                    onClick={() => remove(tileId)}
                  />
                ) : null;
              })
            )}
          </div>
        ))}
      </div>

      <div className="composer-hand">
        <HandRack
          tiles={hand}
          selectedIds={stagedIds}
          disabledIds={stagedIds}
          disabled={pending}
          showOrder
          onTileClick={append}
        />
      </div>

      <div className="composer-actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={breakSegment}
          disabled={pending || !lastSegment || lastSegment.length === 0}
        >
          断句
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={undo}
          disabled={pending || used === 0}
        >
          撤销
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setSegments([[]])}
          disabled={pending || used === 0}
        >
          清空
        </button>
        <span className="composer-spacer" />
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onCancel}
          disabled={pending}
        >
          取消
        </button>
        <button
          type="button"
          className="btn btn--jade"
          onClick={() => void submit()}
          disabled={!canSubmit}
        >
          {pending ? '提交中…' : '提交胡牌'}
        </button>
      </div>
    </section>
  );
}
