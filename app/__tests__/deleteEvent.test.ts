jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import { deleteEvent, ApiError } from '../lib/api';

describe('deleteEvent', () => {
  const respond = (status: number, body: unknown) => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }));
  };

  it('resolves on success', async () => {
    respond(200, { deleted: true });
    await expect(deleteEvent('e1')).resolves.toBeUndefined();
  });

  it('surfaces 409 has_sponsorship_history as an ApiError with the backend message', async () => {
    respond(409, { error: 'has_sponsorship_history', message: 'This party has sponsorship payments. Cancel it instead.' });
    const err = await deleteEvent('e1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('has_sponsorship_history');
    expect(err.message).toBe('This party has sponsorship payments. Cancel it instead.');
  });

  it('other failures keep the generic error', async () => {
    respond(500, {});
    await expect(deleteEvent('e1')).rejects.toThrow('Delete failed: 500');
  });
});
