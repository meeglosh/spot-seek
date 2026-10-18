import { apiFetch } from './api';
import { unregisterPushOnSignOut } from './push';

/**
 * Server half of sign-out. The push token is unregistered FIRST and the
 * session revoked only after that settles: once the session is revoked the
 * DELETE would 401 and the token would stay registered to the old account.
 * The caller clears local state immediately and passes the bearer it captured.
 * Best-effort: a failed unregister still revokes the session.
 */
export async function signOutRemote(bearer: string | null): Promise<void> {
  await unregisterPushOnSignOut(bearer).catch(() => {});
  await apiFetch('/api/auth/sign-out', bearer
    ? { method: 'POST', headers: { Authorization: `Bearer ${bearer}` }, skipAuth: true }
    : { method: 'POST' },
  ).catch(() => {});
}
