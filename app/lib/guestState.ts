// Guest-mode state: things a signed-out person has chosen that must outlive
// the moment they sign up.
//
//  1. Interests picked during onboarding, stored locally in SecureStore (the
//     same store the app already uses for the onboarding flag and locale) and
//     synced to the account after sign-up / sign-in.
//  2. The pending intent: what the guest was trying to do when the sign-up
//     sheet opened (e.g. RSVP to event X), so the screen can finish it once
//     they are authenticated. In memory only: it is meant to survive one
//     in-app auth round trip, never an app restart.
import * as SecureStore from 'expo-secure-store';
import { fetchFavourites, saveFavouritesBulk } from './api';

export type GuestFavourite = { type: string; value: string; sport?: string };

const GUEST_INTERESTS_KEY = 'spotseek_guest_interests';

export async function getGuestInterests(): Promise<GuestFavourite[]> {
  try {
    const raw = await SecureStore.getItemAsync(GUEST_INTERESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as GuestFavourite[]) : [];
  } catch {
    return [];
  }
}

export async function setGuestInterests(favs: GuestFavourite[]): Promise<void> {
  try {
    if (favs.length === 0) await SecureStore.deleteItemAsync(GUEST_INTERESTS_KEY);
    else await SecureStore.setItemAsync(GUEST_INTERESTS_KEY, JSON.stringify(favs));
  } catch (err) {
    console.error('[guest] failed to persist interests:', err);
  }
}

// Push local guest picks to the account, then clear them. The bulk endpoint
// REPLACES the account's favourites, so merge with what the account already
// has (an existing user signing in must never lose their saved teams).
// Failure is non-fatal and keeps the local copy so the next sign-in retries.
export async function syncGuestInterests(): Promise<void> {
  const guest = await getGuestInterests();
  if (guest.length === 0) return;
  try {
    const existing = await fetchFavourites();
    const seen = new Set(existing.map((f) => `${f.type}:${f.value}`));
    const merged: GuestFavourite[] = existing.map((f) => ({
      type: f.type, value: f.value, sport: f.sport ?? undefined,
    }));
    for (const f of guest) {
      if (!seen.has(`${f.type}:${f.value}`)) merged.push(f);
    }
    await saveFavouritesBulk(merged);
    await setGuestInterests([]);
  } catch (err) {
    console.error('[guest] interest sync failed, will retry next sign-in:', err);
  }
}

// ─── Pending intent ──────────────────────────────────────────────────────────

export type PendingIntent = { kind: 'rsvp'; eventId: string; at: number };

const INTENT_TTL_MS = 15 * 60 * 1000;
let pending: PendingIntent | null = null;

export function setPendingIntent(intent: Omit<PendingIntent, 'at'> | null): void {
  pending = intent ? { ...intent, at: Date.now() } : null;
}

// Returns true only if the intent matches and is fresh, and clears it either
// way so an action can never run twice.
export function consumePendingIntent(kind: PendingIntent['kind'], eventId: string): boolean {
  const p = pending;
  if (!p || p.kind !== kind || p.eventId !== eventId) return false;
  pending = null;
  return Date.now() - p.at < INTENT_TTL_MS;
}
