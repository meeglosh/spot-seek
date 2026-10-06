// "Get directions" chooser. The pure part (URL building + option list) has no
// side effects; `openDirections` is the thin native UI on top.
//
// URL formats (checked against current docs):
//   Apple Maps  http://maps.apple.com/?daddr=…&q=…   developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
//   Google app  comgooglemaps://?daddr=…&directionsmode=driving   developers.google.com/maps/documentation/urls/ios-urlscheme
//   Google web  https://www.google.com/maps/dir/?api=1&destination=…   developers.google.com/maps/documentation/urls/get-started#directions-action
//   Waze        waze://?ll=…&navigate=yes  /  https://waze.com/ul?ll=…&navigate=yes   developers.google.com/waze/deeplinks
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

export type DirectionsTarget = {
  lat?: number | null;
  lng?: number | null;
  name?: string | null;
  address?: string | null;
};

export type InstalledMaps = { googleMaps: boolean; waze: boolean };

export type DirectionsAppId = 'apple' | 'google' | 'googleWeb' | 'waze';

export type DirectionsOption = { id: DirectionsAppId; url: string };

export const GOOGLE_MAPS_PROBE = 'comgooglemaps://';
export const WAZE_PROBE = 'waze://';

// Coordinates win; the address string is the fallback. Returns null when the
// event has neither (callers should not render the CTA then).
function destination(t: DirectionsTarget): { dest: string; byCoords: boolean } | null {
  if (t.lat != null && t.lng != null && Number.isFinite(t.lat) && Number.isFinite(t.lng)) {
    return { dest: `${t.lat},${t.lng}`, byCoords: true };
  }
  const addr = t.address?.trim();
  if (addr) return { dest: encodeURIComponent(addr), byCoords: false };
  return null;
}

export function buildDirectionsUrls(t: DirectionsTarget) {
  const d = destination(t);
  if (!d) return null;
  const name = t.name?.trim();
  return {
    apple: `http://maps.apple.com/?daddr=${d.dest}${name ? `&q=${encodeURIComponent(name)}` : ''}`,
    google: `comgooglemaps://?daddr=${d.dest}&directionsmode=driving`,
    googleWeb: `https://www.google.com/maps/dir/?api=1&destination=${d.dest}`,
    waze: d.byCoords
      ? `https://waze.com/ul?ll=${d.dest}&navigate=yes`
      : `https://waze.com/ul?q=${d.dest}&navigate=yes`,
    wazeApp: d.byCoords ? `waze://?ll=${d.dest}&navigate=yes` : `waze://?q=${d.dest}&navigate=yes`,
  };
}

// Options to offer. Apple Maps only exists on iOS. Google Maps is always
// offered (app when installed, otherwise the web page, which works anywhere,
// so the sheet is never a single-item list). Waze only when installed on iOS;
// on Android its https link is handed to the OS, which opens the app or web.
export function buildDirectionsOptions(
  t: DirectionsTarget,
  installed: InstalledMaps,
  platform: string = Platform.OS,
): DirectionsOption[] {
  const u = buildDirectionsUrls(t);
  if (!u) return [];
  const ios = platform === 'ios';
  const out: DirectionsOption[] = [];
  if (ios) out.push({ id: 'apple', url: u.apple });
  out.push(
    ios && installed.googleMaps
      ? { id: 'google', url: u.google }
      : { id: 'googleWeb', url: u.googleWeb },
  );
  if (!ios) out.push({ id: 'waze', url: u.waze });
  else if (installed.waze) out.push({ id: 'waze', url: u.wazeApp });
  return out;
}

export function hasDirectionsTarget(t: DirectionsTarget): boolean {
  return destination(t) !== null;
}

export type DirectionsLabels = {
  title: string;
  cancel: string;
  apps: Record<DirectionsAppId, string>;
};

export async function openDirections(t: DirectionsTarget, labels: DirectionsLabels): Promise<void> {
  const [googleMaps, waze] = await Promise.all([
    Linking.canOpenURL(GOOGLE_MAPS_PROBE).catch(() => false),
    Linking.canOpenURL(WAZE_PROBE).catch(() => false),
  ]);
  const options = buildDirectionsOptions(t, { googleMaps, waze });
  if (options.length === 0) return;
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  const names = options.map((o) => labels.apps[o.id]);

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title: labels.title, options: [...names, labels.cancel], cancelButtonIndex: names.length },
      (i) => { if (i < options.length) open(options[i].url); },
    );
  } else {
    // Alert renders as the themed system dialog; a custom sheet adds no value here.
    Alert.alert(labels.title, undefined, [
      ...options.map((o, i) => ({ text: names[i], onPress: () => open(o.url) })),
      { text: labels.cancel, style: 'cancel' as const },
    ]);
  }
}

// Hook returning a ready-to-call opener with translated labels.
export function useOpenDirections() {
  const { t: tr } = useTranslation('discover');
  const { t: trCommon } = useTranslation('common');
  return (target: DirectionsTarget) =>
    openDirections(target, {
      title: tr('detail.directions.title'),
      cancel: trCommon('cancel'),
      apps: {
        apple: tr('detail.directions.appleMaps'),
        google: tr('detail.directions.googleMaps'),
        googleWeb: tr('detail.directions.googleMapsWeb'),
        waze: tr('detail.directions.waze'),
      },
    });
}
