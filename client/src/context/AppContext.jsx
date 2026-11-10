import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { createApiClient } from '../api/client';

const AppContext = createContext(null);
const TOKEN_KEY = 'bountyhub.token';

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
};

/** Holds auth state, the API client, the live socket and the toast queue. */
export function AppProvider({ children }) {
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(readToken()));
  const [socket, setSocket] = useState(null);
  const [toasts, setToasts] = useState([]);
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const api = useMemo(() => createApiClient({ getToken: () => tokenRef.current }), []);

  const pushToast = useCallback((t) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((list) => [...list, { id, ...t }].slice(-5));
    if (!t.sticky) setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.ttl || 8000);
    return id;
  }, []);
  const dismissToast = useCallback((id) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  const refreshMe = useCallback(async () => {
    const { user: me } = await api.me();
    setUser(me);
    return me;
  }, [api]);

  // Restore session on load
  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    refreshMe()
      .catch(() => {
        writeToken(null);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token, refreshMe]);

  // One authenticated socket per session
  useEffect(() => {
    if (!token) return undefined;
    const s = io({ auth: { token }, transports: ['websocket', 'polling'] });
    // A bounty that was taken/cancelled/expired should drop its "New bounty" toast everywhere.
    s.on('bounty:taken', ({ bountyId }) => setToasts((list) => list.filter((t) => t.bountyId !== bountyId)));
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
  }, [token]);

  const finishAuth = (res) => {
    writeToken(res.token);
    tokenRef.current = res.token;
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const value = {
    api,
    user,
    token,
    loading,
    socket,
    toasts,
    pushToast,
    dismissToast,
    refreshMe,
    login: async (body) => finishAuth(await api.login(body)),
    register: async (body) => finishAuth(await api.register(body)),
    logout: () => {
      writeToken(null);
      setToken(null);
      setUser(null);
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
