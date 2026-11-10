const pad = (n) => String(n).padStart(2, '0');

/** 3725 -> "1:02:05", 65 -> "01:05" */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function secondsUntil(date, now = new Date()) {
  return Math.max(0, Math.floor((new Date(date) - now) / 1000));
}

export function relativeFromNow(date, now = new Date()) {
  const s = secondsUntil(date, now);
  if (s === 0) return 'expired';
  const min = Math.floor(s / 60);
  if (min < 1) return 'in <1 min';
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `in ${h} h ${rest} min` : `in ${h} h`;
}

export function sessionLabel(minutes) {
  if (minutes < 60) return `${minutes} min session`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min session` : `${h} h session`;
}
