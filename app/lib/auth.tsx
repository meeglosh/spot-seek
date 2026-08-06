import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  API_BASE, apiFetch, setBearerToken, clearBearerToken, restoreBearerToken,
  setStoredUser, clearStoredUser, getStoredUser,
} from './api';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: AuthUser };

type AuthCtx = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

// Better Auth's bearer plugin returns the session token directly in the
// response body as `body.token`. This is the correct approach for React Native
// because RN's fetch does not expose Set-Cookie response headers.
function extractToken(body: Record<string, unknown> | null): string {
  return (body?.token as string) ?? '';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    (async () => {
      const [token, cachedUser] = await Promise.all([
        restoreBearerToken(),
        getStoredUser<AuthUser>(),
      ]);
      if (!token) {
        setState({ status: 'unauthenticated' });
        return;
      }

      // A definitive-invalid response means the server has actively rejected
      // the session (401/403, or a 200 with no `.user` — Better Auth returns
      // that for an invalid/expired token). Anything else — network error,
      // 5xx, a timeout — is inconclusive and must never sign the user out;
      // the next authenticated request will surface a real auth failure.
      async function validateInBackground() {
        try {
          const res = await fetch(`${API_BASE}/api/auth/get-session`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const body = await res.json().catch(() => null) as { user?: AuthUser } | null;
          if (res.ok && body?.user) {
            setStoredUser(body.user);
            setState({ status: 'authenticated', user: body.user });
          } else if (res.status === 401 || res.status === 403 || (res.ok && !body?.user)) {
            clearBearerToken();
            clearStoredUser();
            setState({ status: 'unauthenticated' });
          }
          // else: inconclusive (non-401/403 error status) — stay signed in.
        } catch (err) {
          // Network failure — stay signed in over a transient connectivity gap.
          console.error('[auth] background session validation failed:', err);
        }
      }

      if (cachedUser) {
        // Optimistic restore: trust the cached user immediately so cold
        // start never shows the sign-in screen to an already-signed-in
        // user, then reconcile with the server in the background.
        setState({ status: 'authenticated', user: cachedUser });
        validateInBackground();
        return;
      }

      // Pre-existing installs from before user caching was added: no cached
      // user yet, so fall back to validating before rendering — but still
      // only clear the token on a definitive-invalid response, not on a
      // network error or 5xx.
      try {
        const res = await fetch(`${API_BASE}/api/auth/get-session`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => null) as { user?: AuthUser } | null;
        if (res.ok && body?.user) {
          setStoredUser(body.user);
          setState({ status: 'authenticated', user: body.user });
        } else if (res.status === 401 || res.status === 403 || (res.ok && !body?.user)) {
          clearBearerToken();
          clearStoredUser();
          setState({ status: 'unauthenticated' });
        } else {
          // Inconclusive network/5xx error with no cached user to fall back
          // on — this launch renders signed-out, but the token is preserved
          // so a later successful validation (or request) can still use it.
          setState({ status: 'unauthenticated' });
        }
      } catch (err) {
        console.error('[auth] session restore failed:', err);
        setState({ status: 'unauthenticated' });
      }
    })();
  }, []);

  async function signUp(name: string, email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const body = await res.json().catch(() => null) as Record<string, unknown> | null;

    if (!res.ok) {
      const msg =
        (body?.message as string) ||
        (body?.error as string) ||
        `Sign up failed (HTTP ${res.status})`;
      console.error('[auth] sign-up error:', res.status, body);
      throw new Error(msg);
    }

    const token = extractToken(body);
    if (token) {
      setBearerToken(token);
    } else {
      // No token in sign-up body — sign in immediately to get one.
      await signIn(email, password);
      return;
    }

    const user = body?.user as AuthUser;
    setStoredUser(user);
    setState({ status: 'authenticated', user });
  }

  async function signIn(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const body = await res.json().catch(() => null) as Record<string, unknown> | null;

    if (!res.ok) {
      const msg =
        (body?.message as string) ||
        (body?.error as string) ||
        `Sign in failed (HTTP ${res.status})`;
      console.error('[auth] sign-in error:', res.status, body);
      throw new Error(msg);
    }

    const token = extractToken(body);
    if (token) setBearerToken(token);

    const user = body?.user as AuthUser;
    setStoredUser(user);
    setState({ status: 'authenticated', user });
  }

  function signOut() {
    apiFetch('/api/auth/sign-out', { method: 'POST' });
    clearBearerToken();
    clearStoredUser();
    setState({ status: 'unauthenticated' });
  }

  // Hold rendering until a persisted session has been restored (or ruled
  // out) — otherwise every screen's `status !== 'authenticated'` gate
  // flashes its signed-out state for the split second before restoration
  // resolves, even when the user is about to come back authenticated.
  if (state.status === 'loading') return null;

  return (
    <Ctx.Provider value={{ ...state, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
