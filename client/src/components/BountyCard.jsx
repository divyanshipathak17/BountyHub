import { relativeFromNow, sessionLabel } from '../lib/time';

const STATUS_LABEL = {
  open: 'Open',
  accepted: 'In session',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export default function BountyCard({ bounty, viewerRole, onAccept, onCancel, onOpenRoom, onComplete, busy }) {
  const b = bounty;
  return (
    <article className={`card status-${b.status}`}>
      <header className="card-head">
        <span className="reward" title="Reward">
          <span className="coin" aria-hidden>◆</span> {b.reward} tokens
        </span>
        <span className={`pill pill-${b.status}`}>{STATUS_LABEL[b.status] || b.status}</span>
      </header>
      <h3>{b.title}</h3>
      {b.description && <p className="desc">{b.description}</p>}
      <ul className="tags">
        {(b.tags || []).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="meta">
        {sessionLabel(b.sessionMinutes)}
        {b.postedByName && <> · by {b.postedByName}</>}
        {b.status === 'open' && <> · closes {relativeFromNow(b.expiresAt)}</>}
      </p>

      <footer className="card-actions">
        {viewerRole === 'mentor' && b.status === 'open' && onAccept && (
          <button
            className="btn primary"
            disabled={!b.eligible || busy}
            onClick={() => onAccept(b.id)}
            title={b.eligible ? '' : 'You need one of the listed skills'}
          >
            {b.eligible ? 'Accept bounty' : "Skills don't match"}
          </button>
        )}
        {viewerRole === 'student' && b.status === 'open' && onCancel && (
          <button className="btn ghost" disabled={busy} onClick={() => onCancel(b.id)}>
            Cancel & refund
          </button>
        )}
        {b.status === 'accepted' && b.roomId && onOpenRoom && (
          <button className="btn primary" onClick={() => onOpenRoom(b.roomId)}>
            Open room
          </button>
        )}
        {viewerRole === 'student' && b.status === 'accepted' && onComplete && (
          <button className="btn ghost" disabled={busy} onClick={() => onComplete(b.id)}>
            Mark complete
          </button>
        )}
      </footer>
    </article>
  );
}
