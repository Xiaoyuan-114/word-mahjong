import type { RoomSnapshot, RoundResultView } from '@shared/types';
import { leaveRoom, nextRound } from '../actions';
import { MODE_LABELS } from '../labels';
import { useStore } from '../store';
import { Tile } from './Tile';

function nameOf(snapshot: RoomSnapshot, seat: number): string {
  return snapshot.players.find((player) => player.seat === seat)?.name ?? `座位 ${seat + 1}`;
}

function reasonText(result: RoundResultView): string {
  switch (result.reason) {
    case 'hu-approved':
      return '朋友们超过半数认可，这句话正式成立。';
    case 'phrase-win':
      return '短句通过，手牌已经只剩 3 张以内。';
    case 'wall-empty-pin-ci':
      return '没有人宣布胡，牌墙先摸空了。';
    case 'wall-empty-pao-pao':
      return '牌墙摸空，按手牌数量结算。';
    case 'abandoned':
      return '有玩家离开，本局中止，不计胜场。';
  }
}

function titleText(
  snapshot: RoomSnapshot,
  result: RoundResultView,
  winnerName: string | null,
): string {
  switch (result.reason) {
    case 'hu-approved':
      return `${winnerName ?? '有人'} 胡了！`;
    case 'phrase-win':
      return `${winnerName ?? '有人'} 手牌先到 3 张以内！`;
    case 'wall-empty-pin-ci':
      return '牌墙摸空，流局';
    case 'wall-empty-pao-pao':
      return winnerName ? `${winnerName} 手牌最少，获胜` : '牌墙摸空，并列流局';
    case 'abandoned':
      return '本局中止';
  }
}

export function ResultOverlay() {
  const snapshot = useStore((state) => state.snapshot);
  const pending = useStore((state) => state.pendingAction !== null);
  const connected = useStore((state) => state.connected);
  const requestConfirm = useStore((state) => state.requestConfirm);

  if (!snapshot || snapshot.status !== 'round-over' || !snapshot.game?.result) {
    return null;
  }

  const result = snapshot.game.result;
  const winnerName =
    result.winnerSeat !== null ? nameOf(snapshot, result.winnerSeat) : null;
  const voteEntries = result.vote
    ? Object.entries(result.vote.votes).map(([seat, choice]) => ({
        seat: Number(seat),
        choice,
      }))
    : [];
  const canNext = snapshot.you.isHost && !pending && connected;

  function handleLeave() {
    requestConfirm(
      '离开房间？',
      () => {
        void leaveRoom();
      },
      '离开',
    );
  }

  return (
    <div
      className="overlay result-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
    >
      <div className="overlay-backdrop" />
      <section className="result-card">
        <header className="result-head">
            <p className="eyebrow">
              本局结束 · {MODE_LABELS[snapshot.settings.mode]}
            </p>
            <h2 id="result-title">{titleText(snapshot, result, winnerName)}</h2>
            <p className="result-reason">{reasonText(result)}</p>
          </header>

          {result.winningText && (
            <div className="result-quote">「{result.winningText}」</div>
          )}

          {result.winningSegments && result.winningSegments.length > 0 && (
            <div className="result-segments">
              {result.winningSegments.map((segment, index) => (
                <div className="result-segment" key={index}>
                  {segment.map((tile) => (
                    <Tile key={tile.id} tile={tile} size="md" />
                  ))}
                </div>
              ))}
            </div>
          )}

          {result.vote && (
            <div className="result-votes">
              <p className="muted">
                认可 {result.vote.approvals} · 需要 {result.vote.required} · 否决{' '}
                {result.vote.rejects}
              </p>
              {voteEntries.length > 0 && (
                <ul>
                  {voteEntries.map(({ seat, choice }) => (
                    <li key={seat}>
                      <span>{nameOf(snapshot, seat)}</span>
                      <strong className={choice === 'approve' ? 'is-approve' : 'is-reject'}>
                        {choice === 'approve' ? '认可' : '否决'}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <section className="result-hands">
            <h3>所有人的手牌</h3>
            {snapshot.players.map((player) => (
              <article
                key={player.id}
                className={`result-hand ${
                  player.seat === result.winnerSeat ? 'is-winner' : ''
                }`}
              >
                <div className="result-hand-head">
                  <strong>
                    {player.name}
                    {player.seat === result.winnerSeat && (
                      <span className="tag tag--gold">胜</span>
                    )}
                  </strong>
                  <span className="muted">
                    {player.handCount} 张 · {player.wins} 胜
                  </span>
                </div>
                <div className="result-hand-tiles">
                  {player.hand ? (
                    player.hand.map((tile) => (
                      <Tile key={tile.id} tile={tile} size="sm" />
                    ))
                  ) : (
                    <span className="muted">手牌未公开</span>
                  )}
                </div>
              </article>
            ))}
          </section>

        <footer className="result-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleLeave}
            disabled={pending}
          >
            离开房间
          </button>
          {snapshot.you.isHost ? (
            <button
              type="button"
              className="btn btn--jade"
              onClick={() => void nextRound()}
              disabled={!canNext}
            >
              {pending ? '正在准备…' : '再来一局'}
            </button>
          ) : (
            <p className="muted">等待房主开始下一局</p>
          )}
        </footer>
      </section>
    </div>
  );
}
