import type { RoomSnapshot } from '@shared/types';
import { respondClaim } from '../actions';
import { useStore } from '../store';
import { Countdown } from './Countdown';
import { Tile } from './Tile';

type ClaimPhase = Extract<
  NonNullable<RoomSnapshot['game']>['phase'],
  { kind: 'claim' }
>;

interface ClaimPromptProps {
  snapshot: RoomSnapshot;
  phase: ClaimPhase;
}

export function ClaimPrompt({ snapshot, phase }: ClaimPromptProps) {
  const skew = useStore((state) => state.clockSkew);
  const pending = useStore((state) => state.pendingAction !== null);
  const discarder = snapshot.players.find(
    (player) => player.seat === phase.discarderSeat,
  );
  const eligibleNames = phase.eligibleSeats
    .map(
      (seat) =>
        snapshot.players.find((player) => player.seat === seat)?.name ??
        `座位 ${seat + 1}`,
    )
    .join('、');
  const canRespond =
    phase.youAreEligible &&
    phase.yourResponse === null &&
    snapshot.status === 'playing';

  return (
    <section className="panel claim-panel">
      <header className="claim-head">
        <div>
          <p className="eyebrow">抢字窗口</p>
          <h2>{discarder?.name ?? '有玩家'} 弃了一张牌</h2>
          <p className="table-hint">
            下家可以抢走，然后弃一张。抢字后本回合不能胡。
          </p>
        </div>
        <Countdown deadline={phase.deadline} skew={skew} />
      </header>

      <div className="claim-body">
        <Tile tile={phase.tile} size="lg" />
        <div className="claim-actions">
          {canRespond ? (
            <>
              <button
                type="button"
                className="btn btn--jade"
                onClick={() => void respondClaim(phase.phaseId, true)}
                disabled={pending}
              >
                取走
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void respondClaim(phase.phaseId, false)}
                disabled={pending}
              >
                不要
              </button>
            </>
          ) : phase.yourResponse === 'take' ? (
            <p className="vote-your is-approve">你已取走，等待弃牌…</p>
          ) : phase.yourResponse === 'pass' ? (
            <p className="vote-your">你已放弃，等待结算…</p>
          ) : (
            <p className="vote-your">等待 {eligibleNames} 抢字…</p>
          )}
        </div>
      </div>
    </section>
  );
}
