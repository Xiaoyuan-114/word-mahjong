import type { TileView } from '@shared/types';

export type TileSize = 'sm' | 'md' | 'lg';

interface TileProps {
  tile: TileView;
  size?: TileSize;
  selected?: boolean;
  disabled?: boolean;
  dimmed?: boolean;
  order?: number;
  faceDown?: boolean;
  onClick?: () => void;
}

export function Tile({
  tile,
  size = 'md',
  selected = false,
  disabled = false,
  dimmed = false,
  order,
  faceDown = false,
  onClick,
}: TileProps) {
  const className = [
    'tile',
    `tile--${size}`,
    selected ? 'is-selected' : '',
    dimmed ? 'is-dimmed' : '',
    faceDown ? 'tile--back' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (faceDown) {
    return (
      <div className={className} aria-hidden="true">
        <span className="tile-back-mark" />
      </div>
    );
  }

  if (!onClick) {
    return (
      <div className={className} role="img" aria-label={`牌 ${tile.char}`}>
        <span className="tile-char">{tile.char}</span>
        {order !== undefined && <span className="tile-order">{order}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`牌 ${tile.char}`}
      onClick={onClick}
    >
      <span className="tile-char">{tile.char}</span>
      {order !== undefined && <span className="tile-order">{order}</span>}
    </button>
  );
}
