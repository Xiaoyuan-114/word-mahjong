import { useState, type FormEvent } from 'react';
import type { ClaimPolicy, Mode, RoomSettings } from '@shared/types';
import { createRoom, joinRoom } from '../actions';
import { CLAIM_LABELS, MODE_HINTS, MODE_LABELS } from '../labels';
import { useStore } from '../store';

export function HomeScreen() {
  const savedNickname = useStore((state) => state.nickname);
  const connected = useStore((state) => state.connected);
  const pendingAction = useStore((state) => state.pendingAction);
  const showToast = useStore((state) => state.showToast);

  const [nickname, setNickname] = useState(savedNickname);
  const [joinCode, setJoinCode] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('room') ?? '';
    return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  });
  const [mode, setMode] = useState<Mode>('pin-ci');
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(4);
  const [openHands, setOpenHands] = useState(false);
  const [claimPolicy, setClaimPolicy] = useState<ClaimPolicy>('next');

  const pending = pendingAction !== null;
  const busy = !connected || pending;
  const validNickname = nickname.trim().length > 0 && nickname.trim().length <= 12;

  function requireNickname(): boolean {
    if (!validNickname) {
      showToast('error', '请输入 1–12 个字的昵称');
      return false;
    }
    return true;
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!requireNickname() || busy) {
      return;
    }
    const settings: RoomSettings = {
      mode,
      maxPlayers,
      openHands,
      claimPolicy: mode === 'pao-pao' ? 'off' : claimPolicy,
    };
    void createRoom(nickname.trim(), settings);
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    if (!requireNickname() || busy) {
      return;
    }
    if (!/^[A-Z0-9]{5}$/.test(joinCode)) {
      showToast('error', '请输入 5 位房间码');
      return;
    }
    void joinRoom(nickname.trim(), joinCode);
  }

  return (
    <main className="home">
      <section className="home-brand">
        <div className="brand-seal" aria-hidden="true">
          字
        </div>
        <div className="brand-copy">
          <p className="eyebrow">线上文字麻将 · 自创风格 MVP</p>
          <h1>一桌好字</h1>
          <p className="lede">摸字、抢字、组句，把一手散字编成一出好戏；能不能胡，由朋友投票说了算。</p>
          <div className={`conn ${connected ? 'is-online' : ''}`} role="status">
            <span className="conn-dot" />
            {connected ? '牌桌服务在线' : '正在连接牌桌…'}
          </div>
        </div>
      </section>

      <div className="home-grid">
        <section className="panel home-play">
          <label className="field">
            <span className="field-label">你的昵称</span>
            <input
              className="input"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="例如：是小源鸭"
              maxLength={12}
              autoComplete="nickname"
            />
          </label>

          <div className="home-columns">
            <form className="home-form" onSubmit={handleCreate}>
              <div className="form-heading">
                <h2>创建房间</h2>
                <p className="muted">选好玩法，把房间码发给朋友。</p>
              </div>

              <label className="field">
                <span className="field-label">玩法</span>
                <select
                  className="select"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as Mode)}
                  disabled={busy}
                >
                  {(Object.keys(MODE_LABELS) as Mode[]).map((value) => (
                    <option key={value} value={value}>
                      {MODE_LABELS[value]}
                    </option>
                  ))}
                </select>
                <span className="field-hint">{MODE_HINTS[mode]}</span>
              </label>

              <div className="field-row">
                <label className="field">
                  <span className="field-label">人数上限</span>
                  <select
                    className="select"
                    value={maxPlayers}
                    onChange={(event) =>
                      setMaxPlayers(Number(event.target.value) as 2 | 3 | 4)
                    }
                    disabled={busy}
                  >
                    <option value={2}>2 人</option>
                    <option value={3}>3 人</option>
                    <option value={4}>4 人</option>
                  </select>
                </label>

                {mode === 'pin-ci' && (
                  <label className="field">
                    <span className="field-label">抢字</span>
                    <select
                      className="select"
                      value={claimPolicy}
                      onChange={(event) =>
                        setClaimPolicy(event.target.value as ClaimPolicy)
                      }
                      disabled={busy}
                    >
                      {(Object.keys(CLAIM_LABELS) as ClaimPolicy[]).map((value) => (
                        <option key={value} value={value}>
                          {CLAIM_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={openHands}
                  onChange={(event) => setOpenHands(event.target.checked)}
                  disabled={busy}
                />
                <span>
                  明牌开局
                  <small>所有人互相看得见手牌，更适合熟人整活。</small>
                </span>
              </label>

              <button type="submit" className="btn btn--primary" disabled={busy}>
                {pendingAction === 'create' ? '正在创建…' : '创建房间'}
              </button>
            </form>

            <form className="home-form" onSubmit={handleJoin}>
              <div className="form-heading">
                <h2>加入房间</h2>
                <p className="muted">输入朋友发来的 5 位房间码。</p>
              </div>

              <label className="field">
                <span className="field-label">房间码</span>
                <input
                  className="input input--code"
                  value={joinCode}
                  onChange={(event) =>
                    setJoinCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 5),
                    )
                  }
                  placeholder="8KNX4"
                  maxLength={5}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
              </label>

              <button type="submit" className="btn btn--jade" disabled={busy}>
                {pendingAction === 'join' ? '正在加入…' : '加入房间'}
              </button>

              <div className="deco-row" aria-hidden="true">
                {['摸', '字', '组', '句'].map((char) => (
                  <span key={char} className="tile tile--deco">
                    {char}
                  </span>
                ))}
              </div>
            </form>
          </div>
        </section>

        <aside className="panel home-rules">
          <div className="form-heading">
            <h2>怎么玩</h2>
            <p className="muted">2–4 人 · 房间码联机 · 刷新可恢复</p>
          </div>
          <ol className="rules-list">
            <li>
              <strong>摸字、抢字、弃牌</strong>
              <span>轮到你时自动摸一张，再决定弃牌或宣布胡。</span>
            </li>
            <li>
              <strong>用手牌组词、组句</strong>
              <span>拼词胡要用完 14 张；跑跑胡打出 2–5 张的短句。</span>
            </li>
            <li>
              <strong>朋友投票才算数</strong>
              <span>除发起者外，超过半数认可才通过；3 人局需要另外两人都认可。</span>
            </li>
          </ol>
          <p className="fine-print">
            纯投票判定，没有词典标准答案。说得通、够好玩，就有人认。
          </p>
        </aside>
      </div>
    </main>
  );
}
