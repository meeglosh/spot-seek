// i18next + react-i18next setup for SpotSeek.
//
// ─── Key-naming convention (read this before adding new strings) ─────────────
// One JSON file per domain under locales/<lang>/<namespace>.json (see the ns
// list below). Within a namespace file, keys are NESTED objects grouped by
// the screen section they belong to, not flat dot-strings — e.g.
// settings.json has `{ "account": { "signOut": "..." } }`, not
// `{ "account.signOut": "..." }`. On a screen, call
// `useTranslation('settings')` to scope to that namespace, then
// `t('account.signOut')` — no repeated namespace prefix. For strings that are
// truly shared across screens (button labels like Cancel/Save/Retry), use the
// `common` namespace instead of duplicating them per-domain; it is also the
// `defaultNS`, so `t('cancel')` works without specifying a namespace.
// Interpolation uses the standard i18next `{{var}}` syntax — see
// settings.json's `notifications.radiusValue` for an example.
//
// ─── Static resource loading ──────────────────────────────────────────────────
// Locale JSON is bundled via static ES `import` (Metro resolves these at
// bundle time, same as any other module — not fetched at runtime), so every
// language ships in the app binary and is available synchronously at init —
// no network dependency and no loading state for translations.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { getStoredLocale, setStoredLocale, clearStoredLocale } from './api';

import enCommon from '../locales/en/common.json';
import enOnboarding from '../locales/en/onboarding.json';
import enAuth from '../locales/en/auth.json';
import enDiscover from '../locales/en/discover.json';
import enParties from '../locales/en/parties.json';
import enSponsorship from '../locales/en/sponsorship.json';
import enSettings from '../locales/en/settings.json';
import enNotifications from '../locales/en/notifications.json';
import enProfile from '../locales/en/profile.json';

import frCommon from '../locales/fr/common.json';
import frOnboarding from '../locales/fr/onboarding.json';
import frAuth from '../locales/fr/auth.json';
import frDiscover from '../locales/fr/discover.json';
import frParties from '../locales/fr/parties.json';
import frSponsorship from '../locales/fr/sponsorship.json';
import frSettings from '../locales/fr/settings.json';
import frNotifications from '../locales/fr/notifications.json';
import frProfile from '../locales/fr/profile.json';

import esCommon from '../locales/es/common.json';
import esOnboarding from '../locales/es/onboarding.json';
import esAuth from '../locales/es/auth.json';
import esDiscover from '../locales/es/discover.json';
import esParties from '../locales/es/parties.json';
import esSponsorship from '../locales/es/sponsorship.json';
import esSettings from '../locales/es/settings.json';
import esNotifications from '../locales/es/notifications.json';
import esProfile from '../locales/es/profile.json';

import deCommon from '../locales/de/common.json';
import deOnboarding from '../locales/de/onboarding.json';
import deAuth from '../locales/de/auth.json';
import deDiscover from '../locales/de/discover.json';
import deParties from '../locales/de/parties.json';
import deSponsorship from '../locales/de/sponsorship.json';
import deSettings from '../locales/de/settings.json';
import deNotifications from '../locales/de/notifications.json';
import deProfile from '../locales/de/profile.json';

import ptCommon from '../locales/pt/common.json';
import ptOnboarding from '../locales/pt/onboarding.json';
import ptAuth from '../locales/pt/auth.json';
import ptDiscover from '../locales/pt/discover.json';
import ptParties from '../locales/pt/parties.json';
import ptSponsorship from '../locales/pt/sponsorship.json';
import ptSettings from '../locales/pt/settings.json';
import ptNotifications from '../locales/pt/notifications.json';
import ptProfile from '../locales/pt/profile.json';

export const SUPPORTED_LOCALE_CODES = ['en', 'fr', 'es', 'de', 'pt'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALE_CODES)[number];

export const SUPPORTED_LOCALES: { code: SupportedLocale; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'es', nativeName: 'Español' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'pt', nativeName: 'Português' },
];

export const NAMESPACES = [
  'common',
  'onboarding',
  'auth',
  'discover',
  'parties',
  'sponsorship',
  'settings',
  'notifications',
  'profile',
] as const;

function isSupportedLocale(code: string | null | undefined): code is SupportedLocale {
  return !!code && (SUPPORTED_LOCALE_CODES as readonly string[]).includes(code);
}

const resources = {
  en: {
    common: enCommon,
    onboarding: enOnboarding,
    auth: enAuth,
    discover: enDiscover,
    parties: enParties,
    sponsorship: enSponsorship,
    settings: enSettings,
    notifications: enNotifications,
    profile: enProfile,
  },
  fr: {
    common: frCommon,
    onboarding: frOnboarding,
    auth: frAuth,
    discover: frDiscover,
    parties: frParties,
    sponsorship: frSponsorship,
    settings: frSettings,
    notifications: frNotifications,
    profile: frProfile,
  },
  es: {
    common: esCommon,
    onboarding: esOnboarding,
    auth: esAuth,
    discover: esDiscover,
    parties: esParties,
    sponsorship: esSponsorship,
    settings: esSettings,
    notifications: esNotifications,
    profile: esProfile,
  },
  de: {
    common: deCommon,
    onboarding: deOnboarding,
    auth: deAuth,
    discover: deDiscover,
    parties: deParties,
    sponsorship: deSponsorship,
    settings: deSettings,
    notifications: deNotifications,
    profile: deProfile,
  },
  pt: {
    common: ptCommon,
    onboarding: ptOnboarding,
    auth: ptAuth,
    discover: ptDiscover,
    parties: ptParties,
    sponsorship: ptSponsorship,
    settings: ptSettings,
    notifications: ptNotifications,
    profile: ptProfile,
  },
};

// Device language, read once at module init — used as the synchronous
// startup guess before the (async) persisted override can be read. See
// `applyStoredLocaleOverride` below for why this two-step dance exists.
function deviceLocale(): SupportedLocale {
  const code = Localization.getLocales()[0]?.languageCode;
  return isSupportedLocale(code) ? code : 'en';
}

// ─── Plurals on Hermes ─────────────────────────────────────────────────────────
// i18next 26 dropped the legacy v1/v2/v3 plural suffix systems entirely —
// `compatibilityJSON: 'v4'` (Intl.PluralRules-based plurals) is now the only
// supported mode, so there is no fallback to configure even if we wanted one.
// This is safe here: Expo has shipped Hermes builds with full ICU4X data
// (including Intl.PluralRules, Intl.DateTimeFormat with real locale/CLDR
// data, etc.) since SDK 47, and this app targets SDK 57. No plural keys exist
// in the seeded locale files yet, but later agents can use i18next's
// `key_one` / `key_other` etc. convention directly.
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: deviceLocale(),
    fallbackLng: 'en',
    ns: NAMESPACES,
    defaultNS: 'common',
    compatibilityJSON: 'v4',
    interpolation: { escapeValue: false }, // React already escapes — avoid double-escaping.
    returnNull: false,
  });

// Called once from app/_layout.tsx on launch. SecureStore reads are async, so
// i18next is initialized synchronously above with the device-derived
// language first (see `deviceLocale`), then this applies any persisted
// override once it resolves. The launch splash screen covers this window, so
// there is no visible language flash.
export async function applyStoredLocaleOverride(): Promise<void> {
  const stored = await getStoredLocale();
  if (isSupportedLocale(stored) && stored !== i18n.language) {
    await i18n.changeLanguage(stored);
  }
}

// Sets the app's language. Pass a supported locale code to persist and apply
// it, or `null` to clear the override and revert to the device's language.
// Accepts `string` (not just `SupportedLocale`) so callers—e.g. a settings
// row built from `SUPPORTED_LOCALES`—don't need a cast; unsupported codes are
// rejected rather than silently applied.
export async function setAppLocale(code: string | null): Promise<void> {
  if (code === null) {
    clearStoredLocale(); // fire-and-forget, matching clearBearerToken/clearStoredUser
    await i18n.changeLanguage(deviceLocale());
    return;
  }
  if (!isSupportedLocale(code)) {
    console.error(`[i18n] setAppLocale called with unsupported locale: ${code}`);
    return;
  }
  setStoredLocale(code); // fire-and-forget, matching setBearerToken/setStoredUser
  await i18n.changeLanguage(code);
}

// The active language code — used by dateFormat.ts to pick an Intl locale
// (e.g. 'en' -> 'en-US') without dateFormat.ts needing its own i18n import.
export function currentDisplayLocale(): string {
  return isSupportedLocale(i18n.language) ? i18n.language : 'en';
}

export default i18n;
