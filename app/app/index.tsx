import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';

// Root route (`/`) — expo-router needs an explicit index to land on. Without
// this file, the router's cold-start default fell through to `(auth)/index`
// (the welcome screen) for every user regardless of session state, which was
// the "signed out every launch" bug: token restore in lib/auth.tsx worked
// fine, but nothing ever routed an authenticated user past the welcome
// screen. AuthProvider renders null while status is 'loading', so by the
// time this component mounts, status has already settled.
export default function Index() {
  const auth = useAuth();

  if (auth.status === 'authenticated') {
    return <Redirect href="/(tabs)/discover" />;
  }
  return <Redirect href="/(auth)" />;
}
