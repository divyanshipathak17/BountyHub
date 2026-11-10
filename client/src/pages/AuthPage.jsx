import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function AuthPage() {
  const { login, register } = useApp();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student', skills: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login({ email: form.email, password: form.password });
      else
        await register({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <section className="auth-hero">
        <h1>
          Bounty<span>Hub</span>
        </h1>
        <p>
          Stuck? Post a bounty, put tokens on it, and the first mentor who knows the stack jumps into a
          time-locked room with you.
        </p>
        <ol className="steps">
          <li>Post the problem and a reward</li>
          <li>Matching mentors get a live ping</li>
          <li>First to accept opens the workspace</li>
        </ol>
      </section>

      <form className="panel auth-form" onSubmit={submit}>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => setMode('login')}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => setMode('register')}>
            Create account
          </button>
        </div>

        {mode === 'register' && (
          <label>
            Name
            <input value={form.name} onChange={set('name')} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {mode === 'register' && (
          <>
            <fieldset className="role-pick">
              <legend>I am a</legend>
              <label className="radio">
                <input type="radio" name="role" value="student" checked={form.role === 'student'} onChange={set('role')} /> Student
              </label>
              <label className="radio">
                <input type="radio" name="role" value="mentor" checked={form.role === 'mentor'} onChange={set('role')} /> Mentor
              </label>
            </fieldset>
            {form.role === 'mentor' && (
              <label>
                Your skills
                <input value={form.skills} onChange={set('skills')} placeholder="docker, node, react" />
              </label>
            )}
          </>
        )}
        {error && <p role="alert" className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <p className="hint">Demo: student@bountyhub.dev / mentor@bountyhub.dev, password <code>password123</code> (after <code>npm run seed</code>)</p>
      </form>
    </div>
  );
}
