import { useEffect, useState } from 'react';
import {
  declareHu,
  discard,
  leaveRoom,
  passTurn,
  playPhrase,
} from '../actions';
import { ClaimPrompt } from '../components/ClaimPrompt';
import { Countdown } from '../components/Countdown';
import { HandRack } from '../components/HandRack';
import { LogPanel } from '../components/LogPanel';
import { PhraseSelector } from '../components/PhraseSelector';
import { PlayerSeat } from '../components/PlayerSeat';
import { ResultOverlay } from '../components/ResultOverlay';
import { RulesOverlay } from '../components/RulesOverlay';
import { SentenceComposer } from '../components/SentenceComposer';
import { Tile } from '../components/Tile';
import { VotePanel } from '../components/VotePanel';
import { MODE_LABELS } from '../labels';
import { useStore } from '../store';

export function GameScreen() {
  const snapshot = useStore((state) => state.snapshot);
  const skew = useStore((state) => state.clockSkew);
  const pendingAction = useStore((state) => state.pendingAction);
  const connected = useStore((state) => state.connected);
  const showToast = useStore((state) => state.showToast);
  const requestConfirm = useStore((state) => state.requestConfirm);

  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const phaseId = snapshot?.game?.phase.phaseId;

  useEffect(() => {
    setSelectedTileId(null);
    setComposerOpen(false);
  }, [phaseId]);

  if (!snapshot || snapshot.status === 'lobby' || !snapshot.game) {
    return null;
  }

  const game = snapshot.game;
  const phase = game.phase;
  const you = snapshot.players.find((player) => player.id === snapshot.you.playerId);
  if (!you) {
    return null;
  }
  const room = snapshot;

  const hand = you.hand ?? [];
  const opponents = snapshot.players.filter((player) => player.id !== you.id);
  const pending = pendingAction !== null;
  const disabled = !connected || pending;
  const isMyTurn = phase.kind === 'turn' && phase.seat === snapshot.you.seat;
  const canDiscard = snapshot.you.permissions.canDiscard;
  const canHu = snapshot.you.permissions.canHu;
  const canPlayPhrase = snapshot.you.permissions.canPlayPhrase;
  const deadline = phase.kind === 'over' ? null : phase.deadline;
  const discardSelected = selectedTileId
    ? hand.find((tile) => tile.id === selectedTileId)
    : undefined;
  const lastDiscard = game.discards[game.discards.length - 1];
  const lastPhrase = game.phrases[game.phrases.length - 1];

  function nameOf(seat: number): string {
    return (
      room.players.find((player) => player.seat === seat)?.name ??
      `座位 ${seat + 1}`
    );
  }

  function phaseLabel(): string {
    switch (phase.kind) {
      case 'turn':
        return phase.seat === room.you.seat
          ? '轮到你'
          : `${nameOf(phase.seat)} 的回合`;
      case 'claim':
        return `${nameOf(phase.discarderSeat)} 弃了「${phase.tile.char}」`;
      case 'vote':
        return `${nameOf(phase.proposerSeat)} 发起${
          phase.voteKind === 'hu' ? '胡牌申请' : '短句表决'
        }`;
      case 'over':
        return '本局结束';
    }
  }

  function phaseHint(): string {
    switch (phase.kind) {
      case 'turn':
        if (phase.mustDiscard) {
          return '请打出一张牌。';
        }
        return game.mode === 'pin-ci'
          ? '弃牌，或把手牌组句宣布胡。'
          : '打出 2–5 张短句，或选择过。';
      case 'claim':
        return '下家可在 5 秒内抢走这张牌。';
      case 'vote':
        return '由其他玩家表决，超过半数才通过。';
      case 'over':
        return '本局结果已结算。';
    }
  }

  const phasePill =
    phase.kind === 'turn'
      ? '出牌'
      : phase.kind === 'claim'
        ? '抢字'
        : phase.kind === 'vote'
          ? '表决'
          : '结算';

  async function handleDiscard() {
    if (!selectedTileId || phase.kind !== 'turn') {
      return;
    }
    const ok = await discard(selectedTileId, phase.phaseId);
    if (ok) {
      setSelectedTileId(null);
    }
  }

  async function handleHu(segments: string[][]): Promise<boolean> {
    if (phase.kind !== 'turn') {
      return false;
    }
    const ok = await declareHu(phase.phaseId, segments);
    if (ok) {
      setComposerOpen(false);
    }
    return ok;
  }

  async function handlePhrase(tileIds: string[]): Promise<boolean> {
    if (phase.kind !== 'turn') {
      return false;
    }
    return playPhrase(phase.phaseId, tileIds);
  }

  async function handlePass(): Promise<boolean> {
    if (phase.kind !== 'turn') {
      return false;
    }
    return passTurn(phase.phaseId);
  }

  function handleLeave() {
    const message =
      room.status === 'playing'
        ? '离开会中止本局，确定离开？'
        : '离开房间？';
    requestConfirm(
      message,
      () => {
        void leaveRoom();
      },
      '离开',
    );
  }

  async function copyRoomLink() {
    const link = `${window.location.origin}${window.location.pathname}?room=${room.roomCode}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('info', '房间链接已复制');
    } catch {
      showToast('warn', `复制失败，请手动复制房间码 ${room.roomCode}`);
    }
  }

  return (
    <main className="game">
      <header className="game-header">
        <div className="game-title">
          <p className="eyebrow">
            {MODE_LABELS[game.mode]} · 第 {game.roundNo} 局
          </p>
          <div className="room-code-row">
            <h1 className="room-code">{snapshot.roomCode}</h1>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={copyRoomLink}
            >
              复制
            </button>
          </div>
        </div>

        <div className="game-stats">
          <span className="stat">
            <span className="stat-label">牌墙</span>
            <strong>{game.wallCount}</strong>
          </span>
          <span className="stat">
            <span className="stat-label">你的手牌</span>
            <strong>{hand.length}</strong>
          </span>
          <span className={`conn ${connected ? 'is-online' : ''}`}>
            <span className="conn-dot" />
            {connected ? '在线' : '重连中'}
          </span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setRulesOpen(true)}
          >
            规则
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--danger btn--sm"
            onClick={handleLeave}
          >
            离开
          </button>
        </div>
      </header>

      <section className={`opponents opponents--${opponents.length}`}>
        {opponents.map((player) => (
          <PlayerSeat
            key={player.id}
            player={player}
            isTurn={player.isTurn}
            isHost={player.id === snapshot.hostId}
            showHand={
              snapshot.settings.openHands || snapshot.status === 'round-over'
            }
          />
        ))}
      </section>

      <section className="table">
        <div className="table-center">
          <div className="table-watermark" aria-hidden="true">
            {game.mode === 'pin-ci' ? '出牌区' : '短句区'}
          </div>
          <div className="table-turn">
            <span className={`phase-pill phase-pill--${phase.kind}`}>{phasePill}</span>
            <h2>{phaseLabel()}</h2>
            <p className="table-hint">{phaseHint()}</p>
            <Countdown deadline={deadline} skew={skew} />
          </div>

          <div className="table-last">
            <span className="eyebrow">最近动作</span>
            {game.mode === 'pin-ci' && lastDiscard ? (
              <div className="last-play">
                <span>{nameOf(lastDiscard.bySeat)} 弃了</span>
                <Tile tile={lastDiscard.tile} size="md" />
                {lastDiscard.claimedBy !== null && (
                  <span className="muted">
                    被 {nameOf(lastDiscard.claimedBy)} 抢走
                  </span>
                )}
              </div>
            ) : game.mode === 'pao-pao' && lastPhrase ? (
              <div className="last-play">
                <span>{nameOf(lastPhrase.seat)} 打出</span>
                <strong>{lastPhrase.text}</strong>
              </div>
            ) : (
              <p className="muted">还没有出牌。</p>
            )}
          </div>

          {phase.kind === 'claim' && (
            <ClaimPrompt snapshot={snapshot} phase={phase} />
          )}
          {phase.kind === 'vote' && (
            <VotePanel snapshot={snapshot} phase={phase} />
          )}

          <div className="river-section">
            <span className="eyebrow">
              {game.mode === 'pin-ci' ? '牌河' : '已打出的短句'}
            </span>
            <div className="river">
              {game.mode === 'pin-ci' ? (
                game.discards.length === 0 ? (
                  <p className="muted">牌河还是空的。</p>
                ) : (
                  game.discards.slice(-16).map((entry, index) => (
                    <div
                      key={`${entry.tile.id}-${index}`}
                      className={`river-tile ${
                        entry.claimedBy !== null ? 'is-claimed' : ''
                      }`}
                    >
                      <Tile tile={entry.tile} size="sm" />
                      <span>{nameOf(entry.bySeat).slice(0, 6)}</span>
                    </div>
                  ))
                )
              ) : game.phrases.length === 0 ? (
                <p className="muted">还没有人打出短句。</p>
              ) : (
                game.phrases.slice(-8).map((entry, index) => (
                  <div key={`${entry.at}-${index}`} className="river-phrase">
                    <span>{nameOf(entry.seat)}</span>
                    <strong>{entry.text}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <LogPanel entries={game.log} />
      </section>

      <section className="you-area">
        <div className="you-head">
          <PlayerSeat
            player={you}
            isYou
            isHost={you.id === snapshot.hostId}
            isTurn={you.isTurn}
            showHand={false}
          />
          <span className="muted">手牌 {hand.length} 张</span>
        </div>

        {composerOpen && phase.kind === 'turn' && canHu ? (
          <SentenceComposer
            key={phase.phaseId}
            hand={hand}
            pending={pending}
            onCancel={() => setComposerOpen(false)}
            onSubmit={handleHu}
          />
        ) : phase.kind === 'turn' &&
          isMyTurn &&
          game.mode === 'pao-pao' &&
          canPlayPhrase ? (
          <PhraseSelector
            key={phase.phaseId}
            hand={hand}
            pending={pending}
            onPlay={handlePhrase}
            onPass={handlePass}
          />
        ) : (
          <div className="hand-panel">
            <HandRack
              tiles={hand}
              selectedIds={selectedTileId ? [selectedTileId] : []}
              disabled={disabled || !canDiscard}
              onTileClick={
                canDiscard
                  ? (tile) =>
                      setSelectedTileId((current) =>
                        current === tile.id ? null : tile.id,
                      )
                  : undefined
              }
            />

            {discardSelected && canDiscard && (
              <div className="discard-bar">
                <span>打出「{discardSelected.char}」？</span>
                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  onClick={() => void handleDiscard()}
                  disabled={disabled}
                >
                  确认弃牌
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setSelectedTileId(null)}
                >
                  取消
                </button>
              </div>
            )}

            {phase.kind === 'turn' && isMyTurn && canHu && !composerOpen && (
              <div className="action-bar">
                <button
                  type="button"
                  className="btn btn--jade"
                  onClick={() => {
                    setSelectedTileId(null);
                    setComposerOpen(true);
                  }}
                  disabled={disabled}
                >
                  宣布胡
                </button>
                <span className="muted">或者点一张牌弃掉</span>
              </div>
            )}

            {phase.kind === 'turn' && isMyTurn && !canHu && canDiscard && (
              <p className="table-hint hand-hint">请打出一张牌。</p>
            )}

            {!isMyTurn && phase.kind !== 'over' && (
              <p className="table-hint hand-hint">
                {phase.kind === 'turn'
                  ? `等待 ${nameOf(phase.seat)} 出牌`
                  : '等待当前动作结算…'}
              </p>
            )}
          </div>
        )}
      </section>

      {snapshot.status === 'round-over' && <ResultOverlay />}
      {rulesOpen && (
        <RulesOverlay mode={game.mode} onClose={() => setRulesOpen(false)} />
      )}
    </main>
  );
}
