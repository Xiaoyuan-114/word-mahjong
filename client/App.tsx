import { ConfirmDialog } from './components/ConfirmDialog';
import { Toast } from './components/Toast';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { useStore } from './store';

export function App() {
  const snapshot = useStore((state) => state.snapshot);
  const connected = useStore((state) => state.connected);
  const resuming = useStore((state) => state.resuming);

  return (
    <div className="app">
      {snapshot ? (
        snapshot.status === 'lobby' ? (
          <LobbyScreen />
        ) : (
          <GameScreen />
        )
      ) : (
        <HomeScreen />
      )}

      {!connected && (
        <div className="connection-banner" role="status">
          <span className="conn-dot" />
          连接中断，正在重连…
        </div>
      )}

      {resuming && (
        <div className="resume-overlay" role="status">
          <div className="resume-card">
            <span className="spinner" aria-hidden="true" />
            <p>正在恢复你的牌桌…</p>
          </div>
        </div>
      )}

      <Toast />
      <ConfirmDialog />
    </div>
  );
}
