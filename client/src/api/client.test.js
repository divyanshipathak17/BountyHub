import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createApiClient, ApiError } from './client';

describe('api client', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  const ok = (body, status = 200) => Promise.resolve({ ok: true, status, json: () => Promise.resolve(body) });
  const fail = (body, status) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(body) });

  test('sends JSON and the bearer token', async () => {
    fetchMock.mockReturnValue(ok({ bounty: { id: '1' } }, 201));
    const api = createApiClient({ fetch: fetchMock, getToken: () => 'abc' });
    const res = await api.createBounty({ title: 'x' });
    expect(res.bounty.id).toBe('1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/bounties');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer abc');
    expect(JSON.parse(init.body)).toEqual({ title: 'x' });
  });

  test('omits Authorization when there is no token', async () => {
    fetchMock.mockReturnValue(ok({ token: 't' }));
    const api = createApiClient({ fetch: fetchMock, getToken: () => null });
    await api.login({ email: 'a', password: 'b' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test('throws ApiError with server message and status', async () => {
    fetchMock.mockReturnValue(fail({ error: 'This bounty has already been taken' }, 409));
    const api = createApiClient({ fetch: fetchMock, getToken: () => 't' });
    const err = await api.acceptBounty('42').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toMatch(/already been taken/);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bounties/42/accept');
  });
});
