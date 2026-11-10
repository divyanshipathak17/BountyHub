export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Thin fetch wrapper. `fetch` and `getToken` are injected so it is trivially testable.
 */
export function createApiClient({ fetch: fetchImpl = (...a) => fetch(...a), getToken, baseUrl = '/api' } = {}) {
  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
    return data;
  }

  return {
    register: (body) => request('POST', '/auth/register', body),
    login: (body) => request('POST', '/auth/login', body),
    me: () => request('GET', '/auth/me'),
    listOpen: () => request('GET', '/bounties'),
    listMine: () => request('GET', '/bounties/mine'),
    createBounty: (body) => request('POST', '/bounties', body),
    acceptBounty: (id) => request('POST', `/bounties/${id}/accept`),
    completeBounty: (id) => request('POST', `/bounties/${id}/complete`),
    cancelBounty: (id) => request('POST', `/bounties/${id}/cancel`),
    getRoom: (id) => request('GET', `/rooms/${id}`),
  };
}
