import React, { createContext, useContext, useState } from 'react';

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

const API = 'http://localhost:8787';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'unauthenticated' });

  async function signUp(name: string, email: string, password: string) {
    const res = await fetch(`${API}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) throw new Error('Sign up failed');
    const { user } = await res.json() as { user: AuthUser };
    setState({ status: 'authenticated', user });
  }

  async function signIn(email: string, password: string) {
    const res = await fetch(`${API}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Sign in failed');
    const { user } = await res.json() as { user: AuthUser };
    setState({ status: 'authenticated', user });
  }

  function signOut() {
    fetch(`${API}/api/auth/sign-out`, { method: 'POST', credentials: 'include' });
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
