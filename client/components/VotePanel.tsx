import type { RoomSnapshot } from '@shared/types';
import { castVote } from '../actions';
import { useStore } from '../store';
import { Countdown } from './Countdown';
import { Tile } from './Tile';

type GamePhase = NonNullable<RoomSnapshot['game']>['phase'];
type VotePhase = Extract<GamePhase, { kind: 'vote' }>;

interface VotePanelProps {
  snapshot: RoomSnapshot;
  phase: VotePhase;
}

export function VotePanel({ snapshot, phase }: VotePanelProps) {
  const skew = useStore((state) => state.clockSkew);
  const pending = useStore((state) => state.pendingAction !== null);
  const proposer = snapshot.players.find((player) => player.seat === phase.proposerSeat);
  const eligibleCount = phase.eligibleSeats.length;
  const isEligible = phase.eligibleSeats.includes(snapshot.you.seat);
  const canVote =
    isEligible && phase.yourVote === null && snapshot.status === 'playing';
  const progress =
    phase.required > 0
      ? Math.min(100, Math.round((phase.approvals / phase.required) * 100))
      : 0;
  const title = phase.voteKind === 'hu' ? '胡牌申请' : '短句表决';
  const hint =
    phase.voteKind === 'hu'
      ? '请判断这句话是否值得认胡。'
      : '请判断这句短句是否成立。';

  return (
    <section className="panel vote-panel">
      <header className="vote-head">
        <div>
          <p className="eyebrow">表决 · {title}</p>
          <h2>{proposer?.name ?? '有玩家'} 的{title}</h2>
          <p className="table-hint">{hint}</p>
        </div>
        <Countdown deadline={phase.deadline} skew={skew} />
      </header>

      <div className="vote-preview">
        {phase.preview.segments.map((segment, index) => (
          <div className="vote-segment" key={index}>
            {index > 0 && (
              <span className="staged-sep" aria-hidden="true">
                ｜
              </span>
            )}
            {segment.map((tile) => (
              <Tile key={tile.id} tile={tile} size="md" />
            ))}
          </div>
        ))}
      </div>

      <div className="vote-counts">
        <div>
          <strong>{phase.approvals}</strong>
          <span>认可</span>
        </div>
        <div>
          <strong>{phase.required}</strong>
          <span>需要</span>
        </div>
        <div>
          <strong>{phase.rejects}</strong>
          <span>否决</span>
        </div>
        <div>
          <strong>{Math.max(0, eligibleCount - phase.votedSeats.length)}</strong>
          <span>待表决</span>
        </div>
      </div>

      <div className="vote-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="vote-actions">
        {canVote ? (
          <>
            <button
              type="button"
              className="btn btn--jade"
              onClick={() => void castVote(phase.phaseId, true)}
              disabled={pending}
            >
              认可
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void castVote(phase.phaseId, false)}
              disabled={pending}
            >
              不认可
            </button>
          </>
        ) : phase.yourVote === 'approve' ? (
          <p className="vote-your is-approve">你已认可，等待其他玩家…</p>
        ) : phase.yourVote === 'reject' ? (
          <p className="vote-your is-reject">你已否决，等待其他玩家…</p>
        ) : phase.proposerSeat === snapshot.you.seat ? (
          <p className="vote-your">这是你的宣称，等待朋友表决。</p>
        ) : (
          <p className="vote-your">等待其他玩家表决。</p>
        )}
      </div>
    </section>
  );
}
