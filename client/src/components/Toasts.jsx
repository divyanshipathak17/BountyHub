export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={`toast toast-${t.tone || 'info'}`}>
          <div className="toast-text">
            <strong>{t.title}</strong>
            {t.body && <span>{t.body}</span>}
          </div>
          <div className="toast-actions">
            {t.action && (
              <button
                className="btn primary small"
                onClick={() => {
                  t.action.onClick();
                  onDismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="btn ghost small" aria-label="Dismiss" onClick={() => onDismiss(t.id)}>
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
