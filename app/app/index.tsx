import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { getOnboardingSeen } from '../lib/api';

// Root route (`/`) — expo-router needs an explicit index to land on. Without
// this file, the router's cold-start default fell through to `(auth)/index`
// (the welcome screen) for every user regardless of session state, which was
// the "signed out every launch" bug: token restore in lib/auth.tsx worked
// fine, but nothing ever routed an authenticated user past the welcome
// screen. AuthProvider renders null while status is 'loading', so by the
// time this component mounts, status has already settled.
export default function Index() {
  const auth = useAuth();

  // Onboarding only ever applies to unauthenticated users, so this read is
  // skipped entirely once someone is signed in — authenticated users must
  // NEVER see it. The flag is read async (SecureStore), so we hold an
  // "unresolved" state and render nothing until it settles; auth status
  // itself is already settled by the time this component mounts (see above),
  // so the only wait here is the onboarding-flag lookup.
  const [onboardingSeen, setOnboardingSeen] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (auth.status === 'authenticated') return;
    getOnboardingSeen()
      .then(setOnboardingSeen)
      .catch(() => setOnboardingSeen(true)); // fail open: worst case they miss the slideshow, never a blank app
  }, [auth.status]);

  if (auth.status === 'authenticated') {
    return <Redirect href="/(tabs)/discover" />;
  }
  if (onboardingSeen === null) {
    // Still resolving the SecureStore read — render nothing rather than
    // flashing onboarding then immediately replacing it (or vice versa).
    return null;
  }
  return <Redirect href={onboardingSeen ? '/(auth)' : '/onboarding'} />;
}
