import type { ClaimPolicy, Mode } from '@shared/types';
import { leaveRoom, setReady, startGame, updateSettings } from '../actions';
import { CLAIM_LABELS, MODE_LABELS } from '../labels';
import { useStore } from '../store';

export function LobbyScreen() {
  const snapshot = useStore((state) => state.snapshot);
  const pendingAction = useStore((state) => state.pendingAction);
  const connected = useStore((state) => state.connected);
  const showToast = useStore((state) => state.showToast);
  const requestConfirm = useStore((state) => state.requestConfirm);

  if (!snapshot || snapshot.status !== 'lobby') {
    return null;
  }

  const you = snapshot.players.find((player) => player.id === snapshot.you.playerId);
  if (!you) {
    return null;
  }

  const isHost = snapshot.you.isHost;
  const disabled = !connected || pendingAction !== null;
  const roomCode = snapshot.roomCode;
  const roomLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

  async function copyRoomLink() {
    try {
      await navigator.clipboard.writeText(roomLink);
      showToast('info', '房间链接已复制');
    } catch {
      showToast('warn', `复制失败，请手动复制房间码 ${roomCode}`);
    }
  }

  function handleLeave() {
    requestConfirm(
      '离开房间？',
      () => {
        void leaveRoom();
      },
      '离开',
    );
  }

  function handleModeChange(mode: Mode) {
    void updateSettings({ mode });
  }

  function handleClaimPolicyChange(claimPolicy: ClaimPolicy) {
    void updateSettings({ claimPolicy });
  }

  function handleOpenHandsChange(openHands: boolean) {
    void updateSettings({ openHands });
  }

  return (
    <main className="lobby">
      <header className="screen-header">
        <div>
          <p className="eyebrow">房间大厅 · {MODE_LABELS[snapshot.settings.mode]}</p>
          <div className="room-code-row">
            <h1 className="room-code">{snapshot.roomCode}</h1>
            <button type="button" className="btn btn--ghost btn--sm" onClick={copyRoomLink}>
              复制链接
            </button>
          </div>
          <p className="muted">
            {snapshot.players.length}/{snapshot.settings.maxPlayers} 人 · 至少 2 人在线且全部准备后开局
          </p>
        </div>
        <div className="header-actions">
          <span className={`conn ${connected ? 'is-online' : ''}`}>
            <span className="conn-dot" />
            {connected ? '在线' : '重连中'}
          </span>
          <button type="button" className="btn btn--danger btn--ghost" onClick={handleLeave}>
            离开
          </button>
        </div>
      </header>

      <div className="lobby-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>座位</h2>
            <span className="muted">{snapshot.players.length} 位玩家</span>
          </div>

          <div className="lobby-players">
            {snapshot.players.map((player) => (
              <article
                key={player.id}
                className={`lobby-player ${player.connected ? '' : 'is-offline'}`}
              >
                <div className={`avatar avatar--tone-${player.seat % 4}`} aria-hidden="true">
                  {player.name.slice(0, 1)}
                </div>
                <div className="lobby-player-copy">
                  <h3>
                    {player.name}
                    {player.id === snapshot.hostId && <span className="tag tag--gold">房主</span>}
                    {player.id === you.id && <span className="tag">你</span>}
                  </h3>
                  <p className="muted">
                    座位 {player.seat + 1}
                    {player.wins > 0 ? ` · 胜场 ${player.wins}` : ''}
                  </p>
                </div>
                <span
                  className={`ready-pill ${
                    !player.connected ? 'is-offline' : player.ready ? 'is-ready' : ''
                  }`}
                >
                  {!player.connected ? '离线' : player.ready ? '已准备' : '未准备'}
                </span>
              </article>
            ))}
          </div>

          <div className="lobby-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void setReady(!you.ready)}
              disabled={disabled}
            >
              {you.ready ? '取消准备' : '准备'}
            </button>

            {isHost ? (
              <button
                type="button"
                className="btn btn--jade"
                onClick={() => void startGame()}
                disabled={disabled || !snapshot.you.permissions.canStart}
              >
                {pendingAction === 'start' ? '正在开局…' : '开始游戏'}
              </button>
            ) : (
              <p className="muted lobby-waiting">等待房主开始</p>
            )}
          </div>

          {isHost && !snapshot.you.permissions.canStart && (
            <p className="fine-print">至少 2 名在线玩家，并且所有在线玩家都已准备。</p>
          )}
        </section>

        <aside className="lobby-side">
          <section className="panel">
            <div className="panel-heading">
              <h2>房间设置</h2>
              <span className="muted">{isHost ? '房主可修改' : '仅房主可修改'}</span>
            </div>

            {isHost ? (
              <div className="settings-form">
                <label className="field">
                  <span className="field-label">玩法</span>
                  <select
                    className="select"
                    value={snapshot.settings.mode}
                    onChange={(event) => handleModeChange(event.target.value as Mode)}
                    disabled={disabled}
                  >
                    {(Object.keys(MODE_LABELS) as Mode[]).map((value) => (
                      <option key={value} value={value}>
                        {MODE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>

                {snapshot.settings.mode === 'pin-ci' && (
                  <label className="field">
                    <span className="field-label">抢字</span>
                    <select
                      className="select"
                      value={snapshot.settings.claimPolicy}
                      onChange={(event) =>
                        handleClaimPolicyChange(event.target.value as ClaimPolicy)
                      }
                      disabled={disabled}
                    >
                      {(Object.keys(CLAIM_LABELS) as ClaimPolicy[]).map((value) => (
                        <option key={value} value={value}>
                          {CLAIM_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={snapshot.settings.openHands}
                    onChange={(event) => handleOpenHandsChange(event.target.checked)}
                    disabled={disabled}
                  />
                  <span>
                    明牌开局
                    <small>所有人可见彼此手牌。</small>
                  </span>
                </label>
              </div>
            ) : (
              <dl className="settings-readout">
                <div>
                  <dt>玩法</dt>
                  <dd>{MODE_LABELS[snapshot.settings.mode]}</dd>
                </div>
                <div>
                  <dt>人数上限</dt>
                  <dd>{snapshot.settings.maxPlayers} 人</dd>
                </div>
                <div>
                  <dt>明牌</dt>
                  <dd>{snapshot.settings.openHands ? '开启' : '关闭'}</dd>
                </div>
                {snapshot.settings.mode === 'pin-ci' && (
                  <div>
                    <dt>抢字</dt>
                    <dd>{CLAIM_LABELS[snapshot.settings.claimPolicy]}</dd>
                  </div>
                )}
              </dl>
            )}
          </section>

          <section className="panel invite-panel">
            <h2>邀请朋友</h2>
            <p className="muted">把房间码或链接发给朋友，同一 Wi-Fi 下也能直接打开。</p>
            <div className="invite-code">{snapshot.roomCode}</div>
            <button type="button" className="btn btn--ghost" onClick={copyRoomLink}>
              复制房间链接
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}
