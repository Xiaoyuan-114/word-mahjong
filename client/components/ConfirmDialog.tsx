import { useStore } from '../store';

export function ConfirmDialog() {
  const confirm = useStore((state) => state.confirm);
  const dismissConfirm = useStore((state) => state.dismissConfirm);

  if (!confirm) {
    return null;
  }

  function handleConfirm() {
    if (!confirm) {
      return;
    }
    const action = confirm.onConfirm;
    dismissConfirm();
    action();
  }

  return (
    <div
      className="overlay confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="overlay-backdrop" onClick={dismissConfirm} />
      <section className="confirm-card">
        <p className="eyebrow">请确认</p>
        <h2 id="confirm-title">{confirm.message}</h2>
        <div className="confirm-actions">
          <button type="button" className="btn btn--ghost" onClick={dismissConfirm}>
            {confirm.cancelLabel}
          </button>
          <button type="button" className="btn btn--danger" onClick={handleConfirm}>
            {confirm.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
