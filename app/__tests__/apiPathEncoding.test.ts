jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import { fetchEvent, fetchProfile, blockUser, fetchEventBids, deletePushToken } from '../lib/api';

const evil = '../admin/x?y=1#z';
const enc = encodeURIComponent(evil);

describe('API path ids are URL-encoded', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  it.each([
    ['fetchEvent', (id: string) => fetchEvent(id), `/api/events/${enc}`],
    ['fetchProfile', (id: string) => fetchProfile(id), `/api/profiles/${enc}`],
    ['blockUser', (id: string) => blockUser(id), `/api/users/${enc}/block`],
    ['fetchEventBids', (id: string) => fetchEventBids(id), `/api/sponsors/events/${enc}/bids`],
  ])('%s', async (_n, call, expectedPath) => {
    await call(evil).catch(() => {});
    expect(String(fetchMock.mock.calls[0][0]).endsWith(expectedPath)).toBe(true);
  });

  it('deletePushToken with an explicit bearer sends it', async () => {
    await deletePushToken('tok', 'b1');
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('DELETE');
    expect(init.headers.get('Authorization')).toBe('Bearer b1');
  });
});
