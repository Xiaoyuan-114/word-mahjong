import { Fragment, useEffect, useMemo, useState } from 'react';
import type { TileView } from '@shared/types';
import {
  declareHu,
  discard,
  leaveRoom,
  passTurn,
  playPhrase,
} from '../actions';
import { ClaimPrompt } from '../components/ClaimPrompt';
import { Countdown } from '../components/Countdown';
import { HandDock } from '../components/HandDock';
import { LogPanel } from '../components/LogPanel';
import { ResultOverlay } from '../components/ResultOverlay';
import { RulesOverlay } from '../components/RulesOverlay';
import { TableSeat } from '../components/TableSeat';
import { Tile } from '../components/Tile';
import { VotePanel } from '../components/VotePanel';
import { useHandOrder } from '../hooks/useHandOrder';
import { MODE_LABELS } from '../labels';
import { useStore } from '../store';

export function GameScreen() {
  const snapshot = useStore((state) => state.snapshot);
  const skew = useStore((state) => state.clockSkew);
  const pendingAction = useStore((state) => state.pendingAction);
  const connected = useStore((state) => state.connected);
  const showToast = useStore((state) => state.showToast);
  const requestConfirm = useStore((state) => state.requestConfirm);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [breakAfter, setBreakAfter] = useState<Set<string>>(() => new Set());
  const [rulesOpen, setRulesOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const phaseId = snapshot?.game?.phase.phaseId;
  const you = snapshot?.players.find((player) => player.id === snapshot.you.playerId);
  const hand = you?.hand ?? [];
  const { orderedHand, moveTile } = useHandOrder(hand);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedTiles = useMemo(
    () => orderedHand.filter((tile) => selectedSet.has(tile.id)),
    [orderedHand, selectedSet],
  );
  const segments = useMemo(() => {
    const result: string[][] = [];
    let current: string[] = [];
    selectedTiles.forEach((tile, index) => {
      current.push(tile.id);
      if (index < selectedTiles.length - 1 && breakAfter.has(tile.id)) {
        result.push(current);
        current = [];
      }
    });
    if (current.length > 0) {
      result.push(current);
    }
    return result;
  }, [selectedTiles, breakAfter]);

  useEffect(() => {
    setSelectedIds([]);
    setBreakAfter(new Set());
  }, [phaseId]);

  useEffect(() => {
    const ids = new Set(hand.map((tile) => tile.id));
    setSelectedIds((current) =>
      current.every((id) => ids.has(id))
        ? current
        : current.filter((id) => ids.has(id)),
    );
  }, [hand]);

  if (!snapshot || snapshot.status === 'lobby' || !snapshot.game || !you) {
    return null;
  }

  const room = snapshot;
  const me = you;
  const game = room.game!;
  const phase = game.phase;
  const pending = pendingAction !== null;
  const disabled = !connected || pending;
  const isPin = game.mode === 'pin-ci';
  const selectedCount = selectedTiles.length;
  const isActiveTurn =
    phase.kind === 'turn' && phase.seat === room.you.seat;
  const canSelect =
    phase.kind === 'turn' &&
    phase.seat === room.you.seat &&
    room.status === 'playing' &&
    !disabled;
  const canDiscard = room.you.permissions.canDiscard;
  const canHu = room.you.permissions.canHu;
  const canPlayPhrase = room.you.permissions.canPlayPhrase;
  const canPass = room.you.permissions.canPass;
  const deadline = phase.kind === 'over' ? null : phase.deadline;
  const opponents = room.players.filter((player) => player.id !== me.id);
  const topPlayer = opponents.length >= 2 ? opponents[1] : opponents[0];
  const leftPlayer = opponents.length >= 2 ? opponents[0] : undefined;
  const rightPlayer = opponents.length >= 3 ? opponents[2] : undefined;
  const revealOpponentHands =
    room.settings.openHands || room.status === 'round-over';

  const primaryEnabled = isPin
    ? (canHu && selectedCount === hand.length && hand.length > 0) ||
      (canDiscard && selectedCount === 1)
    : canPlayPhrase && selectedCount >= 2 && selectedCount <= 5;
  const primaryLabel = !isActiveTurn
    ? '出牌'
    : isPin
      ? selectedCount === 1 && canDiscard
        ? '弃牌'
        : canHu
          ? '宣布胡'
          : '弃牌'
      : '打出短句';
  const phaseName =
    phase.kind === 'turn'
      ? '出牌'
      : phase.kind === 'claim'
        ? '抢字'
        : phase.kind === 'vote'
          ? '表决'
          : '结算';

  const lastDiscard = game.discards[game.discards.length - 1];
  const lastPhrase = game.phrases[game.phrases.length - 1];

  function nameOf(seat: number): string {
    return (
      room.players.find((player) => player.seat === seat)?.name ??
      `座位 ${seat + 1}`
    );
  }

  function playTitle(): string {
    if (phase.kind === 'claim') {
      return '抢字窗口';
    }
    if (phase.kind === 'vote') {
      return phase.voteKind === 'hu' ? '胡牌表决' : '短句表决';
    }
    if (phase.kind === 'over') {
      return '本局结束';
    }
    if (phase.seat !== room.you.seat) {
      return `等待 ${nameOf(phase.seat)} 出牌`;
    }
    if (isPin) {
      return phase.mustDiscard ? '请弃一张牌' : '请你组句宣布胡';
    }
    return '请你打出词语或短句';
  }

  function emptyText(): string {
    if (phase.kind === 'over') {
      return '本局已经结束';
    }
    if (phase.kind === 'claim' || phase.kind === 'vote') {
      return '';
    }
    if (phase.seat !== room.you.seat) {
      return `等待 ${nameOf(phase.seat)} 出牌`;
    }
    if (isPin) {
      return phase.mustDiscard
        ? '选 1 张牌弃掉'
        : '点选手牌，中央会按手牌顺序组句';
    }
    return '点选 2–5 张，中央会组成短句';
  }

  function handHint(): string {
    if (phase.kind === 'over') {
      return '本局已经结束';
    }
    if (phase.kind === 'claim') {
      return '抢字结算中…';
    }
    if (phase.kind === 'vote') {
      return '等待其他玩家表决…';
    }
    if (phase.seat !== room.you.seat) {
      return `等待 ${nameOf(phase.seat)} 出牌`;
    }
    if (isPin) {
      if (phase.mustDiscard) {
        return selectedCount === 1
          ? '只选 1 张，点击 ▶ 弃牌'
          : '请只选中 1 张牌弃掉';
      }
      if (selectedCount === 0) {
        return '点选手牌组句；选满 14 张宣布胡，或只选 1 张弃牌';
      }
      if (selectedCount === hand.length) {
        return '已选满，点击 ▶ 宣布胡';
      }
      if (selectedCount === 1) {
        return '只选 1 张：点击 ▶ 弃牌；继续选牌可组句';
      }
      return `已选 ${selectedCount} / ${hand.length} 张，还差 ${
        hand.length - selectedCount
      } 张`;
    }
    if (selectedCount === 0) {
      return '点选 2–5 张组成短句，或直接跳过';
    }
    if (selectedCount === 1) {
      return '再选 1–4 张（短句 2–5 张）';
    }
    if (selectedCount <= 5) {
      return `已选 ${selectedCount} 张，点击 ▶ 打出短句`;
    }
    return `已选 ${selectedCount} 张，最多 5 张，请去掉一些`;
  }

  function toggleSelected(tile: TileView) {
    if (!canSelect) {
      return;
    }
    setSelectedIds((current) =>
      current.includes(tile.id)
        ? current.filter((id) => id !== tile.id)
        : [...current, tile.id],
    );
  }

  function removeSelected(tileId: string) {
    if (!canSelect) {
      return;
    }
    setSelectedIds((current) => current.filter((id) => id !== tileId));
  }

  function toggleBreak(tileId: string) {
    if (!isPin || !canSelect) {
      return;
    }
    setBreakAfter((current) => {
      const next = new Set(current);
      if (next.has(tileId)) {
        next.delete(tileId);
      } else {
        next.add(tileId);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds([]);
    setBreakAfter(new Set());
  }

  function selectAll() {
    if (!isPin || !canHu || !canSelect) {
      return;
    }
    setSelectedIds(hand.map((tile) => tile.id));
  }

  async function handlePrimary() {
    if (phase.kind !== 'turn' || !primaryEnabled) {
      return;
    }
    if (isPin) {
      if (canDiscard && selectedCount === 1) {
        await discard(selectedTiles[0]!.id, phase.phaseId);
        return;
      }
      if (canHu && selectedCount === hand.length) {
        await declareHu(phase.phaseId, segments);
      }
      return;
    }
    if (canPlayPhrase && selectedCount >= 2 && selectedCount <= 5) {
      await playPhrase(
        phase.phaseId,
        selectedTiles.map((tile) => tile.id),
      );
    }
  }

  async function handleSkip() {
    if (phase.kind === 'turn' && canPass) {
      await passTurn(phase.phaseId);
    }
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
    <main className="game-shell">
      <header className="table-topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="leave-button"
            onClick={handleLeave}
            aria-label="离开房间"
          >
            ←
          </button>
          <div className="wall-badge">
            <span>剩余牌数</span>
            <strong>{game.wallCount}</strong>
          </div>
        </div>

        <div className="topbar-center">
          <span className="eyebrow">
            {MODE_LABELS[game.mode]} · 第 {game.roundNo} 局
          </span>
          <button
            type="button"
            className="room-chip"
            onClick={copyRoomLink}
            title="复制房间链接"
          >
            房间 {room.roomCode}
          </button>
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="topbar-btn"
            onClick={() => setLogOpen(true)}
          >
            记录
          </button>
          <button
            type="button"
            className="topbar-btn"
            onClick={() => setRulesOpen(true)}
          >
            规则
          </button>
        </div>
      </header>

      <div
        className={`table-stage table-stage--${Math.max(
          1,
          opponents.length,
        )}`}
      >
        {topPlayer && (
          <TableSeat
            player={topPlayer}
            position="top"
            isTurn={topPlayer.isTurn}
            isHost={topPlayer.id === room.hostId}
            revealHand={revealOpponentHands}
          />
        )}
        {leftPlayer && (
          <TableSeat
            player={leftPlayer}
            position="left"
            isTurn={leftPlayer.isTurn}
            isHost={leftPlayer.id === room.hostId}
            revealHand={revealOpponentHands}
          />
        )}

        <section
          className={`play-area play-area--${phase.kind}`}
          aria-label="出牌区"
        >
          <div className="play-watermark" aria-hidden="true">
            {isPin ? '出牌区' : '短句区'}
          </div>

          {phase.kind === 'claim' ? (
            <ClaimPrompt snapshot={room} phase={phase} />
          ) : phase.kind === 'vote' ? (
            <VotePanel snapshot={room} phase={phase} />
          ) : (
            <>
              <header className="play-head">
                <div>
                  <p className="eyebrow">{phaseName}</p>
                  <h2 className="play-title">{playTitle()}</h2>
                </div>
                <div className="play-head-side">
                  <Countdown deadline={deadline} skew={skew} />
                  <span className="compose-count">
                    {isPin
                      ? `已选 ${selectedCount} / ${hand.length}`
                      : `已选 ${selectedCount} / 5`}
                  </span>
                </div>
              </header>

              <div className="compose-area">
                {selectedTiles.length === 0 ? (
                  <div className="compose-empty">{emptyText()}</div>
                ) : (
                  <div className="compose-row">
                    {selectedTiles.map((tile, index) => (
                      <Fragment key={tile.id}>
                        <Tile
                          tile={tile}
                          size="md"
                          onClick={() => removeSelected(tile.id)}
                        />
                        {isPin && index < selectedTiles.length - 1 && (
                          <button
                            type="button"
                            className={`compose-break ${
                              breakAfter.has(tile.id) ? 'is-break' : ''
                            }`}
                            onClick={() => toggleBreak(tile.id)}
                            disabled={!canSelect}
                            title={
                              breakAfter.has(tile.id)
                                ? '取消此处分段'
                                : '在此处分段'
                            }
                            aria-label={
                              breakAfter.has(tile.id)
                                ? '取消此处分段'
                                : '在此处分段'
                            }
                          >
                            ｜
                          </button>
                        )}
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>

              <div className="play-foot">
                <div className="play-last">
                  <span className="eyebrow">最近动作</span>
                  {game.mode === 'pin-ci' && lastDiscard ? (
                    <div className="last-line">
                      <span>{nameOf(lastDiscard.bySeat)} 弃了</span>
                      <Tile tile={lastDiscard.tile} size="sm" />
                      {lastDiscard.claimedBy !== null && (
                        <span className="muted">
                          被 {nameOf(lastDiscard.claimedBy)} 抢走
                        </span>
                      )}
                    </div>
                  ) : game.mode === 'pao-pao' && lastPhrase ? (
                    <div className="last-line">
                      <span>{nameOf(lastPhrase.seat)} 打出</span>
                      <strong>{lastPhrase.text}</strong>
                    </div>
                  ) : (
                    <p className="muted">还没有出牌。</p>
                  )}
                </div>
                <div className="play-river">
                  {game.mode === 'pin-ci'
                    ? game.discards
                        .slice(-10)
                        .map((entry, index) => (
                          <div
                            className="river-chip"
                            key={`${entry.tile.id}-${index}`}
                          >
                            <Tile tile={entry.tile} size="sm" />
                            <span>{nameOf(entry.bySeat).slice(0, 4)}</span>
                          </div>
                        ))
                    : game.phrases
                        .slice(-6)
                        .map((entry, index) => (
                          <span
                            className="phrase-chip"
                            key={`${entry.at}-${index}`}
                          >
                            {entry.text}
                          </span>
                        ))}
                </div>
              </div>
            </>
          )}
        </section>

        {rightPlayer && (
          <TableSeat
            player={rightPlayer}
            position="right"
            isTurn={rightPlayer.isTurn}
            isHost={rightPlayer.id === room.hostId}
            revealHand={revealOpponentHands}
          />
        )}
      </div>

      <HandDock
        you={me}
        isHost={me.id === room.hostId}
        orderedHand={orderedHand}
        selectedIds={selectedIds}
        selectedCount={selectedCount}
        canSelect={canSelect}
        pending={pending}
        primaryLabel={primaryLabel}
        primaryEnabled={primaryEnabled}
        showSkip={!isPin}
        skipEnabled={canPass}
        hint={handHint()}
        caption={
          isPin
            ? '拖动排序 · 点击选中 · 中心 ｜ 可断句'
            : '拖动排序 · 点击选中'
        }
        showSelectAll={isPin && canHu && selectedCount < hand.length}
        selectAllLabel={`全选 ${hand.length} 张`}
        onSelectAll={selectAll}
        onToggleSelect={toggleSelected}
        onReorder={moveTile}
        onPrimary={() => void handlePrimary()}
        onSkip={() => void handleSkip()}
        onClear={clearSelection}
      />

      {snapshot.status === 'round-over' && <ResultOverlay />}
      {rulesOpen && (
        <RulesOverlay mode={game.mode} onClose={() => setRulesOpen(false)} />
      )}
      {logOpen && (
        <div
          className="overlay log-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="牌桌记录"
        >
          <div
            className="overlay-backdrop"
            onClick={() => setLogOpen(false)}
          />
          <section className="modal-card log-modal">
            <header className="modal-head">
              <div>
                <p className="eyebrow">本局</p>
                <h2>牌桌记录</h2>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setLogOpen(false)}
              >
                关闭
              </button>
            </header>
            <LogPanel entries={game.log} bare />
          </section>
        </div>
      )}
    </main>
  );
}
