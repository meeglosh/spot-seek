import React, { createContext, useContext, useState } from 'react';
import { API_BASE, apiFetch, setSessionCookie, clearSessionCookie } from './api';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthState =
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: AuthUser };

type AuthCtx = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

function extractCookie(res: Response): string {
  // React Native doesn't auto-manage cookies — extract the token manually.
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/better-auth\.session_token=[^;]+/);
  return match ? match[0] : '';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'unauthenticated' });

  async function signUp(name: string, email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      throw new Error(body.message ?? 'Sign up failed');
    }
    const { user } = await res.json() as { user: AuthUser };

    // Sign in immediately to get a session cookie.
    await signIn(email, password);
    setState({ status: 'authenticated', user });
  }

  async function signIn(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Invalid email or password');
    const cookie = extractCookie(res);
    if (cookie) setSessionCookie(cookie);

    const { user } = await res.json() as { user: AuthUser };
    setState({ status: 'authenticated', user });
  }

  function signOut() {
    apiFetch('/api/auth/sign-out', { method: 'POST' });
    clearSessionCookie();
    setState({ status: 'unauthenticated' });
  }

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
