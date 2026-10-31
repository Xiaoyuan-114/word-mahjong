import { useStore } from '../store';

export function Toast() {
  const toast = useStore((state) => state.toast);
  const dismissToast = useStore((state) => state.dismissToast);

  if (!toast) {
    return null;
  }

  return (
    <div className={`toast toast--${toast.level}`} role="status">
      <span>{toast.message}</span>
      <button
        type="button"
        className="toast-close"
        aria-label="关闭提示"
        onClick={() => dismissToast(toast.id)}
      >
        ×
      </button>
    </div>
  );
}
