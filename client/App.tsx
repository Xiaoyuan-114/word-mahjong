import { useEffect, useState } from 'react';
import { socket } from './socket';

export function App() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  return (
    <main className="home">
      <section className="home-card">
        <p className="eyebrow">文字麻将 · MVP</p>
        <h1>一桌好字</h1>
        <p className="lede">摸字、抢字、组句，让朋友投票认不认。</p>
        <div className={`conn ${connected ? 'is-online' : ''}`}>
          <span className="conn-dot" />
          {connected ? '牌桌服务已连接' : '连接中…'}
        </div>
      </section>
    </main>
  );
}
