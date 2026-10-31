import type { PlayerView, TileView } from '@shared/types';
import { HandRail } from './HandRail';

interface HandDockProps {
  you: PlayerView;
  isHost: boolean;
  orderedHand: TileView[];
  selectedIds: string[];
  selectedCount: number;
  canSelect: boolean;
  pending: boolean;
  primaryLabel: string;
  primaryEnabled: boolean;
  showSkip: boolean;
  skipEnabled: boolean;
  hint: string;
  caption: string;
  showSelectAll?: boolean;
  selectAllLabel?: string;
  onSelectAll?: () => void;
  onToggleSelect: (tile: TileView) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  onPrimary: () => void;
  onSkip: () => void;
  onClear: () => void;
}

export function HandDock({
  you,
  isHost,
  orderedHand,
  selectedIds,
  selectedCount,
  canSelect,
  pending,
  primaryLabel,
  primaryEnabled,
  showSkip,
  skipEnabled,
  hint,
  caption,
  showSelectAll = false,
  selectAllLabel,
  onSelectAll,
  onToggleSelect,
  onReorder,
  onPrimary,
  onSkip,
  onClear,
}: HandDockProps) {
  return (
    <section className="hand-dock">
      <div className="hand-dock-row">
        <div className="play-orb-wrap">
          <button
            type="button"
            className="play-orb"
            onClick={onPrimary}
            disabled={!primaryEnabled || pending}
            aria-label={primaryLabel}
          >
            <span aria-hidden="true">▶</span>
          </button>
          <span className="play-orb-label">{primaryLabel}</span>
        </div>

        <HandRail
          tiles={orderedHand}
          selectedIds={selectedIds}
          canSelect={canSelect}
          onToggleSelect={onToggleSelect}
          onReorder={onReorder}
        />

        {showSkip ? (
          <button
            type="button"
            className="skip-button"
            onClick={onSkip}
            disabled={!skipEnabled || pending}
          >
            跳过
          </button>
        ) : (
          <span className="hand-dock-spacer" aria-hidden="true" />
        )}
      </div>

      <div className="hand-status">
        <span className="hand-hint">{hint}</span>
        <div className="hand-status-actions">
          {showSelectAll && onSelectAll && (
            <button
              type="button"
              className="hand-mini-btn"
              onClick={onSelectAll}
              disabled={pending}
            >
              {selectAllLabel ?? '全选'}
            </button>
          )}
          {selectedCount > 0 && (
            <button
              type="button"
              className="hand-mini-btn"
              onClick={onClear}
              disabled={pending}
            >
              清空选择
            </button>
          )}
        </div>
      </div>

      <div className="self-row">
        <div className={`avatar avatar--tone-${you.seat % 4}`} aria-hidden="true">
          {you.name.slice(0, 1)}
        </div>
        <div className="self-copy">
          <div className="seat-name">
            {you.name}
            <span className="tag">你</span>
            {isHost && <span className="tag tag--gold">房主</span>}
          </div>
          <div className="seat-sub">
            座位 {you.seat + 1} · 手牌 {you.handCount} 张
            {you.wins > 0 ? ` · 胜场 ${you.wins}` : ''} ·{' '}
            <span className="drag-caption">{caption}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
