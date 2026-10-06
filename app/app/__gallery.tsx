import React from 'react';
import { Redirect } from 'expo-router';

// DEV-ONLY visual-QA gallery route (`/__gallery`). Gate: it renders only when
// BOTH `__DEV__` (a Metro/Debug build; false in Release, where the guarded
// branch and the Gallery require are dead-code-eliminated) AND
// EXPO_PUBLIC_GALLERY=1 are set. Otherwise it redirects home. Reach it with no
// deep link or auth via EXPO_PUBLIC_START_ROUTE=__gallery (see app/index.tsx).
const ENABLED = __DEV__ && process.env.EXPO_PUBLIC_GALLERY === '1';

export default function GalleryRoute() {
  if (!ENABLED) return <Redirect href="/" />;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Gallery = require('../components/dev/Gallery').default as React.ComponentType;
  return <Gallery />;
}
