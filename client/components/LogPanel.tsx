import type { LogEntryView } from '@shared/types';

interface LogPanelProps {
  entries: LogEntryView[];
  bare?: boolean;
}

export function LogPanel({ entries, bare = false }: LogPanelProps) {
  const recent = entries.slice(-12);
  const list =
    recent.length === 0 ? (
      <p className="muted">还没有动作。</p>
    ) : (
      <ol className="log-list" aria-live="polite">
        {recent.map((entry) => (
          <li key={entry.id} className={`log-item log--${entry.kind}`}>
            {entry.text}
          </li>
        ))}
      </ol>
    );

  if (bare) {
    return list;
  }

  return (
    <section className="panel log-panel">
      <div className="panel-heading">
        <h2>牌桌记录</h2>
        <span className="muted">{entries.length} 条</span>
      </div>
      {list}
    </section>
  );
}
