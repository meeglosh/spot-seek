// Drives the real AuthProvider.signOut: the push-token DELETE must reach the
// server BEFORE the session is revoked, or it 401s and the token stays put.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
import React from 'react';
import { act } from 'react';

const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async (k: string) => { delete store[k]; }),
}));
jest.mock('expo-notifications', () => ({}));
jest.mock('../lib/guestState', () => ({ syncGuestInterests: jest.fn() }));

const user = { id: 'u1', name: 'U', email: 'u@example.com' };
const calls: string[] = [];
const mockDelete = jest.fn();
const mockApiFetch = jest.fn();
jest.mock('../lib/api', () => ({
  API_BASE: 'http://api.test',
  registerPushToken: jest.fn(),
  updateNotificationPrefs: jest.fn(),
  setBearerToken: jest.fn(),
  clearBearerToken: jest.fn(),
  restoreBearerToken: jest.fn(async () => 'b1'),
  getBearerToken: jest.fn(() => 'b1'),
  setStoredUser: jest.fn(),
  clearStoredUser: jest.fn(),
  getStoredUser: jest.fn(async () => user),
  deletePushToken: (...a: unknown[]) => mockDelete(...a),
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
}));

import { AuthProvider, useAuth } from '../lib/auth';

const holder: { auth: ReturnType<typeof useAuth> } = { auth: null as never };
function Probe() {
  const a = useAuth();
  React.useEffect(() => { holder.auth = a; });
  return null;
}

async function mountSignedIn() {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    ok: true, status: 200, json: async () => ({ user }),
  }));
  let r: { unmount: () => void };
  await act(async () => {
    r = TestRenderer.create(<AuthProvider><Probe /></AuthProvider>);
  });
  return r!;
}

beforeEach(() => {
  calls.length = 0;
  store.spotseek_push_token = 'abcd';
  mockDelete.mockReset();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (p: string) => { calls.push(`POST ${p}`); return { ok: true }; });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

async function flush() {
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
}

describe('AuthProvider.signOut', () => {
  it('sends the push-token DELETE before the sign-out POST, with the captured bearer', async () => {
    mockDelete.mockImplementation(async () => { await Promise.resolve(); calls.push('DELETE token'); });
    const r = await mountSignedIn();
    await act(async () => { holder.auth.signOut(); });
    await flush();
    expect(holder.auth.status).toBe('unauthenticated');
    expect(calls).toEqual(['DELETE token', 'POST /api/auth/sign-out']);
    expect(mockDelete).toHaveBeenCalledWith('abcd', 'b1');
    expect(mockApiFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer b1');
    r.unmount();
  });

  it('still signs out when the DELETE rejects', async () => {
    mockDelete.mockRejectedValue(new Error('offline'));
    const r = await mountSignedIn();
    await act(async () => { holder.auth.signOut(); });
    await flush();
    expect(holder.auth.status).toBe('unauthenticated');
    expect(calls).toEqual(['POST /api/auth/sign-out']);
    r.unmount();
  });
});
