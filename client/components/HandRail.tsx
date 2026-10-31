import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { TileView } from '@shared/types';
import { Tile } from './Tile';

interface HandRailProps {
  tiles: TileView[];
  selectedIds: string[];
  canSelect: boolean;
  onToggleSelect: (tile: TileView) => void;
  onReorder: (draggedId: string, targetId: string) => void;
}

interface DragState {
  id: string;
  element: HTMLElement;
  startX: number;
  startY: number;
  moved: boolean;
  pointerId: number;
}

export function HandRail({
  tiles,
  selectedIds,
  canSelect,
  onToggleSelect,
  onReorder,
}: HandRailProps) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOrder = useMemo(
    () => tiles.filter((tile) => selectedSet.has(tile.id)).map((tile) => tile.id),
    [tiles, selectedSet],
  );
  const dragRef = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function handlePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    tileId: string,
  ) {
    if (event.button !== 0) {
      return;
    }
    const element = event.currentTarget;
    dragRef.current = {
      id: tileId,
      element,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    };
    element.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (!drag.moved) {
      if (
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8
      ) {
        return;
      }
      drag.moved = true;
      suppressClick.current = true;
      setDraggingId(drag.id);
    }
    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-hand-tile-id]');
    const targetId = target?.dataset.handTileId;
    if (targetId && targetId !== drag.id) {
      onReorder(drag.id, targetId);
    }
  }

  function endDrag(event?: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    dragRef.current = null;
    setDraggingId(null);
    if (drag.element.hasPointerCapture(drag.pointerId)) {
      drag.element.releasePointerCapture(drag.pointerId);
    }
    if (drag.moved) {
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 60);
    }
    if (event) {
      event.preventDefault();
    }
  }

  function handleClick(tile: TileView) {
    if (suppressClick.current || !canSelect) {
      return;
    }
    onToggleSelect(tile);
  }

  return (
    <div
      className={`hand-rail ${draggingId ? 'is-dragging' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {tiles.map((tile) => {
        const selectedIndex = selectedOrder.indexOf(tile.id);
        return (
          <div
            key={tile.id}
            className={`hand-tile-wrap ${draggingId === tile.id ? 'is-source' : ''}`}
            data-hand-tile-id={tile.id}
            onPointerDown={(event) => handlePointerDown(event, tile.id)}
          >
            <Tile
              tile={tile}
              selected={selectedIndex >= 0}
              order={selectedIndex >= 0 ? selectedIndex + 1 : undefined}
              onClick={() => handleClick(tile)}
            />
          </div>
        );
      })}
    </div>
  );
}
