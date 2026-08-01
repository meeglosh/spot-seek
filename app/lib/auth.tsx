import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  API_BASE, apiFetch, setBearerToken, clearBearerToken, restoreBearerToken,
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
      const token = await restoreBearerToken();
      if (!token) {
        setState({ status: 'unauthenticated' });
        return;
      }
      // A persisted token may have expired since the last launch — validate
      // it against the server instead of trusting it blindly.
      try {
        const res = await fetch(`${API_BASE}/api/auth/get-session`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => null) as { user?: AuthUser } | null;
        if (res.ok && body?.user) {
          setState({ status: 'authenticated', user: body.user });
        } else {
          clearBearerToken();
          setState({ status: 'unauthenticated' });
        }
      } catch (err) {
        // Network failure on launch — don't clear the persisted token over a
        // transient connectivity gap; the UI just treats this launch as
        // signed-out and the next successful request can re-validate it.
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
      await signIn(name, password);
      return;
    }

    const user = body?.user as AuthUser;
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
    setState({ status: 'authenticated', user });
  }

  function signOut() {
    apiFetch('/api/auth/sign-out', { method: 'POST' });
    clearBearerToken();
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
