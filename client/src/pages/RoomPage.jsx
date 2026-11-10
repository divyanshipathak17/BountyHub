import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useNow } from '../hooks/useNow';
import { formatDuration, secondsUntil } from '../lib/time';

export default function RoomPage() {
  const { id } = useParams();
  const { api, user, socket, pushToast, refreshMe } = useApp();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [closed, setClosed] = useState(false);
  const now = useNow(1000);
  const listRef = useRef(null);
  const notesTimer = useRef(null);

  // Join over the socket (authorises + subscribes); fall back to REST for initial load.
  useEffect(() => {
    let cancelled = false;
    api
      .getRoom(id)
      .then(({ room: r }) => {
        if (cancelled) return;
        setRoom(r);
        setNotes(r.notes);
        setClosed(r.status === 'closed');
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  useEffect(() => {
    if (!socket) return undefined;
    const join = () => socket.emit('room:join', { roomId: id }, (ack) => !ack?.ok && setError(ack?.error || 'Cannot join room'));
    if (socket.connected) join();
    socket.on('connect', join);
    const onMsg = (m) => m.roomId === id && setRoom((r) => (r && !r.messages.some((x) => x.id === m.id) ? { ...r, messages: [...r.messages, m] } : r));
    const onNotes = (n) => n.roomId === id && n.by !== user.id && setNotes(n.notes);
    const onClosed = (c) => {
      if (c.roomId !== id) return;
      setClosed(true);
      pushToast({ title: 'Session closed', body: 'The bounty was marked complete.', tone: 'success' });
      refreshMe();
    };
    socket.on('room:message', onMsg);
    socket.on('room:notes', onNotes);
    socket.on('room:closed', onClosed);
    return () => {
      socket.emit('room:leave', { roomId: id });
      socket.off('connect', join);
      socket.off('room:message', onMsg);
      socket.off('room:notes', onNotes);
      socket.off('room:closed', onClosed);
    };
  }, [socket, id, user.id, pushToast, refreshMe]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [room?.messages?.length]);

  if (error) {
    return (
      <div className="panel room-error">
        <h2>Can't open this room</h2>
        <p>{error}</p>
        <Link to="/" className="btn ghost">Back to dashboard</Link>
      </div>
    );
  }
  if (!room) return <p className="empty">Opening workspace…</p>;

  const remaining = secondsUntil(room.expiresAt, now);
  const locked = closed || remaining === 0;
  const names = Object.fromEntries(room.participantsInfo.map((p) => [p.id, p.name]));
  const isPoster = room.bounty?.postedBy === user.id;
  const urgent = remaining > 0 && remaining < 300;

  function send(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !socket) return;
    socket.emit('room:message', { roomId: id, text: t }, (ack) => {
      if (ack?.ok) setText('');
      else pushToast({ title: 'Message not sent', body: ack?.error, tone: 'error' });
    });
  }

  function editNotes(value) {
    setNotes(value);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => socket?.emit('room:notes', { roomId: id, notes: value }), 400);
  }

  async function complete() {
    try {
      await api.completeBounty(room.bountyId);
      setClosed(true);
      refreshMe();
    } catch (e) {
      pushToast({ title: 'Could not complete', body: e.message, tone: 'error' });
    }
  }

  return (
    <div className="room">
      <header className="room-head panel">
        <div>
          <Link to="/" className="back">← Dashboard</Link>
          <h2>{room.bounty?.title}</h2>
          <p className="meta">
            {room.participantsInfo.map((p) => `${p.name} (${p.role})`).join(' · ')} · {room.bounty?.reward} tokens
          </p>
        </div>
        <div className={`timer ${locked ? 'locked' : urgent ? 'urgent' : ''}`} aria-live="polite">
          <span className="timer-label">{locked ? 'Locked' : 'Time left'}</span>
          <span className="timer-value">{locked ? '🔒' : formatDuration(remaining)}</span>
        </div>
        {isPoster && !closed && (
          <button className="btn primary" onClick={complete}>
            Mark complete & pay
          </button>
        )}
      </header>

      {room.bounty?.description && <p className="panel brief">{room.bounty.description}</p>}

      <div className="room-body">
        <section className="panel chat">
          <h3>Chat</h3>
          <ol className="messages" ref={listRef}>
            {room.messages.length === 0 && <li className="empty">Say hi and share what you've tried.</li>}
            {room.messages.map((m) => (
              <li key={m.id} className={m.sender === user.id ? 'mine' : ''}>
                <span className="who">{names[m.sender] || 'Someone'}</span>
                <span className="text">{m.text}</span>
              </li>
            ))}
          </ol>
          <form onSubmit={send} className="composer">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={locked ? 'This workspace is read-only now' : 'Type a message…'}
              disabled={locked}
              aria-label="Message"
            />
            <button className="btn primary" disabled={locked || !text.trim()}>Send</button>
          </form>
        </section>

        <section className="panel notes">
          <h3>Shared scratchpad</h3>
          <textarea
            value={notes}
            onChange={(e) => editNotes(e.target.value)}
            disabled={locked}
            spellCheck={false}
            placeholder="Paste logs, Dockerfiles, commands… both of you see edits live."
            aria-label="Shared notes"
          />
        </section>
      </div>
    </div>
  );
}
