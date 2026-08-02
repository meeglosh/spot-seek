import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Universal Link + spotseek://e/:id target. The path is short and public-
// facing (shared in messages, previewed via Open Graph tags) because it's
// also served as a real web page by the backend (backend/src/deeplinks.ts)
// for anyone without the app installed — this route only ever runs once the
// app is already open, so all it does is forward to the real screen.
export default function EventDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/(tabs)/discover/${id}`);
  }, [id, router]);

  return null;
}
