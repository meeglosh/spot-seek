const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete store[k]; }),
}));
jest.mock('expo-notifications', () => ({}));

const mockDeletePushToken = jest.fn();
jest.mock('../lib/api', () => ({
  registerPushToken: jest.fn(),
  deletePushToken: (...a: unknown[]) => mockDeletePushToken(...a),
  updateNotificationPrefs: jest.fn(),
}));

import { unregisterPushOnSignOut } from '../lib/push';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  mockDeletePushToken.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('unregisterPushOnSignOut', () => {
  it('deletes the stored token using the captured bearer, then forgets it', async () => {
    store.spotseek_push_token = 'abcd';
    mockDeletePushToken.mockResolvedValue(undefined);
    await unregisterPushOnSignOut('bearer-1');
    expect(mockDeletePushToken).toHaveBeenCalledWith('abcd', 'bearer-1');
    expect(store.spotseek_push_token).toBeUndefined();
  });

  it('does nothing when no token was registered', async () => {
    await unregisterPushOnSignOut('bearer-1');
    expect(mockDeletePushToken).not.toHaveBeenCalled();
  });

  it('swallows network failures so sign-out is never blocked', async () => {
    store.spotseek_push_token = 'abcd';
    mockDeletePushToken.mockRejectedValue(new Error('offline'));
    await expect(unregisterPushOnSignOut('bearer-1')).resolves.toBeUndefined();
  });
});
