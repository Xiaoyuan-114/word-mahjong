import type { PlayerView } from '@shared/types';
import { Tile } from './Tile';

export type SeatPosition = 'top' | 'left' | 'right';

interface TableSeatProps {
  player: PlayerView;
  position: SeatPosition;
  isTurn: boolean;
  isHost: boolean;
  revealHand: boolean;
}

export function TableSeat({
  player,
  position,
  isTurn,
  isHost,
  revealHand,
}: TableSeatProps) {
  return (
    <article
      className={`table-seat table-seat--${position} ${
        isTurn ? 'is-turn' : ''
      } ${player.connected ? '' : 'is-offline'}`}
    >
      <header className="table-seat-head">
        <div className={`avatar avatar--tone-${player.seat % 4}`} aria-hidden="true">
          {player.name.slice(0, 1)}
        </div>
        <div className="table-seat-meta">
          <div className="seat-name">
            {player.name}
            {isHost && <span className="tag tag--gold">房主</span>}
          </div>
          <div className="seat-sub">
            {position === 'top' ? `座位 ${player.seat + 1} · ` : ''}
            {player.connected ? `${player.handCount} 张` : '离线'}
            {player.wins > 0 ? ` · 胜场 ${player.wins}` : ''}
          </div>
        </div>
        {isTurn && <span className="seat-turn" aria-label="当前回合" />}
      </header>

      {revealHand && player.hand ? (
        <div className={`opponent-hand opponent-hand--${position}`}>
          {player.hand.map((tile) => (
            <Tile key={tile.id} tile={tile} size="sm" />
          ))}
        </div>
      ) : (
        <div className="back-stack" aria-label={`手牌 ${player.handCount} 张`}>
          <span className="back-tile" />
          <span className="back-tile" />
          <span className="back-tile" />
          <span className="back-count">× {player.handCount}</span>
        </div>
      )}
    </article>
  );
}
