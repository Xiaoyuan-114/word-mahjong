import type { TileView } from '@shared/types';
import { Tile } from './Tile';

interface HandRackProps {
  tiles: TileView[];
  selectedIds?: string[];
  disabledIds?: string[];
  disabled?: boolean;
  showOrder?: boolean;
  emptyLabel?: string;
  onTileClick?: (tile: TileView) => void;
}

export function HandRack({
  tiles,
  selectedIds = [],
  disabledIds = [],
  disabled = false,
  showOrder = false,
  emptyLabel = '暂无手牌',
  onTileClick,
}: HandRackProps) {
  if (tiles.length === 0) {
    return <p className="hand-empty">{emptyLabel}</p>;
  }

  return (
    <div className="hand-rack">
      {tiles.map((tile) => {
        const selectedIndex = selectedIds.indexOf(tile.id);
        return (
          <Tile
            key={tile.id}
            tile={tile}
            selected={selectedIndex >= 0}
            disabled={disabled || disabledIds.includes(tile.id)}
            order={showOrder && selectedIndex >= 0 ? selectedIndex + 1 : undefined}
            onClick={onTileClick ? () => onTileClick(tile) : undefined}
          />
        );
      })}
    </div>
  );
}
