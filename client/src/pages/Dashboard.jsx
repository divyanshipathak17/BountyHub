import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BountyCard from '../components/BountyCard';
import PostBountyForm from '../components/PostBountyForm';

export default function Dashboard() {
  const { api, user, socket, pushToast, refreshMe } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState([]);
  const [mine, setMine] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const isMentor = user.role === 'mentor';

  const load = useCallback(async () => {
    const [o, m] = await Promise.all([isMentor ? api.listOpen() : Promise.resolve({ bounties: [] }), api.listMine()]);
    setOpen(o.bounties);
    setMine(m.bounties);
  }, [api, isMentor]);

  useEffect(() => {
    load().catch((e) => pushToast({ title: 'Could not load bounties', body: e.message, tone: 'error' }));
  }, [load, pushToast]);

  const accept = useCallback(
    async (id) => {
      setBusyId(id);
      try {
        const { room } = await api.acceptBounty(id);
        pushToast({ title: 'You got it!', body: 'Opening the workspace…', tone: 'success' });
        navigate(`/rooms/${room.id}`);
      } catch (e) {
        pushToast({ title: 'Too late', body: e.message, tone: 'error' });
        load();
      } finally {
        setBusyId(null);
      }
    },
    [api, navigate, pushToast, load],
  );

  // Live updates
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = (b) => {
      setOpen((list) => (list.some((x) => x.id === b.id) ? list : [{ ...b, eligible: true }, ...list]));
      pushToast({
        title: `New bounty: ${b.title}`,
        body: `${b.reward} tokens · ${(b.tags || []).join(', ') || 'any skill'}`,
        tone: 'bounty',
        sticky: true,
        bountyId: b.id,
        action: { label: 'Accept', onClick: () => accept(b.id) },
      });
    };
    const onTaken = ({ bountyId }) => setOpen((list) => list.filter((x) => x.id !== bountyId));
    const onAccepted = (e) => {
      pushToast({
        title: `${e.mentorName} accepted "${e.title}"`,
        body: 'Your workspace is ready.',
        tone: 'success',
        sticky: true,
        action: { label: 'Join room', onClick: () => navigate(`/rooms/${e.roomId}`) },
      });
      load();
    };
    const onExpired = (e) => {
      pushToast({ title: `"${e.title}" expired`, body: `${e.refunded} tokens refunded.`, tone: 'error' });
      load();
      refreshMe();
    };
    const onCompleted = (e) => {
      pushToast({ title: `+${e.reward} tokens`, body: `"${e.title}" marked complete.`, tone: 'success' });
      load();
      refreshMe();
    };
    socket.on('bounty:new', onNew);
    socket.on('bounty:taken', onTaken);
    socket.on('bounty:accepted', onAccepted);
    socket.on('bounty:expired', onExpired);
    socket.on('bounty:completed', onCompleted);
    return () => {
      socket.off('bounty:new', onNew);
      socket.off('bounty:taken', onTaken);
      socket.off('bounty:accepted', onAccepted);
      socket.off('bounty:expired', onExpired);
      socket.off('bounty:completed', onCompleted);
    };
  }, [socket, pushToast, accept, navigate, load, refreshMe]);

  async function post(body) {
    await api.createBounty(body);
    await Promise.all([load(), refreshMe()]);
    pushToast({ title: 'Bounty posted', body: 'Matching mentors have been notified.', tone: 'success' });
  }

  async function act(fn, id, msg) {
    setBusyId(id);
    try {
      await fn(id);
      await Promise.all([load(), refreshMe()]);
      pushToast({ title: msg, tone: 'success' });
    } catch (e) {
      pushToast({ title: 'Action failed', body: e.message, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const openRoom = (roomId) => navigate(`/rooms/${roomId}`);

  return (
    <div className={`dashboard ${isMentor ? 'mentor' : 'student'}`}>
      {!isMentor && <PostBountyForm balance={user.tokens} onSubmit={post} />}

      {isMentor && (
        <section>
          <div className="section-head">
            <h2>Live bounty feed</h2>
            <span className="live-dot" aria-label={socket?.connected ? 'live' : 'connecting'} />
          </div>
          {open.length === 0 && <p className="empty">No open bounties right now. You'll get a ping the moment one matches your skills.</p>}
          <div className="grid">
            {open.map((b) => (
              <BountyCard key={b.id} bounty={b} viewerRole="mentor" onAccept={accept} busy={busyId === b.id} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>{isMentor ? 'Sessions you took' : 'Your bounties'}</h2>
        {mine.length === 0 && <p className="empty">{isMentor ? 'Nothing accepted yet.' : 'You have not posted anything yet.'}</p>}
        <div className="grid">
          {mine.map((b) => (
            <BountyCard
              key={b.id}
              bounty={b}
              viewerRole={user.role}
              busy={busyId === b.id}
              onOpenRoom={openRoom}
              onCancel={(id) => act(api.cancelBounty, id, 'Bounty cancelled, tokens refunded')}
              onComplete={(id) => act(api.completeBounty, id, 'Marked complete, mentor paid')}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
