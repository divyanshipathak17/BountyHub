import { useState } from 'react';

const initial = { title: '', description: '', tags: '', reward: 10, sessionMinutes: 120, acceptWindowMinutes: 30 };

const parseTags = (s) =>
  [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];

export default function PostBountyForm({ balance, onSubmit }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const reward = Number(form.reward);
    if (!form.title.trim()) return setError('Give your bounty a title.');
    if (!Number.isInteger(reward) || reward < 1) return setError('Reward must be a whole number of tokens.');
    if (reward > balance) return setError(`You only have ${balance} tokens.`);

    setBusy(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        description: form.description.trim(),
        tags: parseTags(form.tags),
        reward,
        sessionMinutes: Number(form.sessionMinutes),
        acceptWindowMinutes: Number(form.acceptWindowMinutes),
      });
      setForm(initial);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel post-form" onSubmit={handleSubmit} noValidate>
      <h2>Post a bounty</h2>
      <label>
        Title
        <input value={form.title} onChange={set('title')} maxLength={120} placeholder="Debug my Docker container" />
      </label>
      <label>
        Details
        <textarea value={form.description} onChange={set('description')} rows={3} placeholder="What's broken, what you tried…" />
      </label>
      <label>
        Skills needed
        <input value={form.tags} onChange={set('tags')} placeholder="docker, node (comma separated)" />
      </label>
      <div className="row">
        <label>
          Reward (tokens)
          <input type="number" min="1" value={form.reward} onChange={set('reward')} />
        </label>
        <label>
          Session length
          <select value={form.sessionMinutes} onChange={set('sessionMinutes')}>
            <option value={30}>30 min</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
            <option value={240}>4 hours</option>
          </select>
        </label>
        <label>
          Accept within
          <select value={form.acceptWindowMinutes} onChange={set('acceptWindowMinutes')}>
            <option value={5}>5 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>1 hour</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? 'Posting…' : 'Post bounty'}
      </button>
      <p className="hint">The reward is held in escrow and refunded if nobody accepts in time.</p>
    </form>
  );
}
