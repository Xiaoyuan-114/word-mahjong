import type { PlayerView } from '@shared/types';
import { Tile } from './Tile';

interface PlayerSeatProps {
  player: PlayerView;
  isYou?: boolean;
  isHost?: boolean;
  isTurn?: boolean;
  showHand?: boolean;
}

export function PlayerSeat({
  player,
  isYou = false,
  isHost = false,
  isTurn = false,
  showHand = true,
}: PlayerSeatProps) {
  const className = [
    'seat',
    `seat--tone-${player.seat % 4}`,
    isTurn ? 'is-turn' : '',
    isYou ? 'is-you' : '',
    !player.connected ? 'is-offline' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className}>
      <div className={`avatar avatar--tone-${player.seat % 4}`} aria-hidden="true">
        {player.name.slice(0, 1)}
      </div>
      <div className="seat-meta">
        <div className="seat-name">
          {player.name}
          {isYou && <span className="tag">你</span>}
          {isHost && <span className="tag tag--gold">房主</span>}
        </div>
        <div className="seat-sub">
          座位 {player.seat + 1} · {player.connected ? `${player.handCount} 张` : '离线'}
          {player.wins > 0 ? ` · 胜场 ${player.wins}` : ''}
        </div>
      </div>
      {showHand && player.hand && (
        <div className="seat-hand">
          {player.hand.map((tile) => (
            <Tile key={tile.id} tile={tile} size="sm" />
          ))}
        </div>
      )}
      {isTurn && <span className="seat-turn" aria-label="当前回合" />}
    </article>
  );
}
