import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import RoomPage from './pages/RoomPage';
import Toasts from './components/Toasts';

function Shell() {
  const { user, loading, logout, toasts, dismissToast } = useApp();

  if (loading) return <p className="empty">Loading…</p>;

  return (
    <>
      {user && (
        <nav className="topbar">
          <a href="/" className="brand">
            Bounty<span>Hub</span>
          </a>
          <div className="who">
            <span className="balance" title="Token balance">◆ {user.tokens}</span>
            <span className="name">
              {user.name} <em>{user.role}</em>
            </span>
            <button className="btn ghost small" onClick={logout}>Sign out</button>
          </div>
        </nav>
      )}
      <main className="container">
        <Routes>
          {!user ? (
            <Route path="*" element={<AuthPage />} />
          ) : (
            <>
              <Route path="/" element={<Dashboard />} />
              <Route path="/rooms/:id" element={<RoomPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </main>
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </BrowserRouter>
  );
}
