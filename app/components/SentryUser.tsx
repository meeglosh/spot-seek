import React from 'react';
import { useAuth } from '../lib/auth';
import { setSentryUser } from '../lib/sentry';

/** Renders nothing. Keeps Sentry's user context at the account id (never email or name). */
export default function SentryUser() {
  const auth = useAuth();
  const id = auth.status === 'authenticated' ? auth.user.id : null;
  React.useEffect(() => {
    setSentryUser(id);
  }, [id]);
  return null;
}
