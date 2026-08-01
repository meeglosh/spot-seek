import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const API_BASE = __DEV__
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:8787'
    : 'http://localhost:8787'
  : 'https://spot-seek-api.dry-base-037d.workers.dev';

const TOKEN_KEY = 'spotseek_bearer_token';

// Mirrored in-memory for synchronous reads (apiFetch, uploadEventCover)
// alongside expo-secure-store, which persists it across app restarts.
let _bearerToken = '';

export function setBearerToken(token: string) {
  _bearerToken = token;
  SecureStore.setItemAsync(TOKEN_KEY, token).catch((err) => {
    console.error('[api] failed to persist bearer token:', err);
  });
}
export function clearBearerToken() {
  _bearerToken = '';
  SecureStore.deleteItemAsync(TOKEN_KEY).catch((err) => {
    console.error('[api] failed to clear persisted bearer token:', err);
  });
}
export function getBearerToken() {
  return _bearerToken;
}

// Called once on app launch, before any authenticated request, to restore
// the token saved on a previous run — SecureStore access is async, unlike
// the in-memory mirror above.
export async function restoreBearerToken(): Promise<string> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  _bearerToken = token ?? '';
  return _bearerToken;
}

// Keep old names as aliases so auth.tsx compiles without changes.
export const setSessionCookie = setBearerToken;
export const clearSessionCookie = clearBearerToken;
export const getSessionCookie = getBearerToken;

type FetchOptions = RequestInit & { skipAuth?: boolean };

export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  const { skipAuth, ...rest } = opts;
  const headers = new Headers(rest.headers as Record<string, string> | undefined);

  if (!skipAuth && _bearerToken) {
    headers.set('Authorization', `Bearer ${_bearerToken}`);
  }
  if (!headers.has('Content-Type') && rest.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${API_BASE}${path}`, { ...rest, headers });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiEvent = {
  id: string;
  hostId: string;
  title: string;
  broadcastSubject: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  status: string;
  coverImageUrl: string | null;
  recurrenceRule: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueLat: number | null;
  venueLng: number | null;
  isPrivateLocation: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiRsvp = {
  id: string;
  eventId: string;
  userId: string;
  state: 'going' | 'interested' | 'waitlisted' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  event?: ApiEvent | null;
};

export type ApiDashboardEvent = ApiEvent & {
  rsvpCounts: { going: number; interested: number; waitlisted: number; cancelled: number };
};

export type ApiProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
};

export type CreateEventInput = {
  title: string;
  broadcastSubject: string;
  description?: string;
  capacity?: number;
  status?: 'draft' | 'published';
  venueName?: string;
  venueAddress?: string;
  venueLat?: number;
  venueLng?: number;
  isPrivateLocation?: boolean;
  recurrenceRule?: string;
  startsAt?: string;
  endsAt?: string;
};

export async function fetchFeed(params?: {
  after?: string;
  before?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  q?: string;
  sport?: string;
}): Promise<ApiEvent[]> {
  const q = new URLSearchParams();
  if (params?.after) q.set('after', params.after);
  if (params?.before) q.set('before', params.before);
  if (params?.lat != null) q.set('lat', String(params.lat));
  if (params?.lng != null) q.set('lng', String(params.lng));
  if (params?.radiusKm != null) q.set('radiusKm', String(params.radiusKm));
  if (params?.q) q.set('q', params.q);
  if (params?.sport) q.set('sport', params.sport);

  const qs = q.toString();
  const res = await apiFetch(`/api/feed${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  const { events } = await res.json() as { events: ApiEvent[] };
  return events;
}

export async function fetchEvent(id: string): Promise<ApiEvent> {
  const res = await apiFetch(`/api/events/${id}`);
  if (!res.ok) throw new Error(`Event fetch failed: ${res.status}`);
  const { event } = await res.json() as { event: ApiEvent };
  return event;
}

export async function rsvpToEvent(eventId: string): Promise<ApiRsvp> {
  const res = await apiFetch('/api/rsvps', {
    method: 'POST',
    body: JSON.stringify({ eventId }),
  });
  if (res.status === 409) throw new Error('already_rsvpd');
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`RSVP failed: ${res.status}`);
  const { rsvp } = await res.json() as { rsvp: ApiRsvp };
  return rsvp;
}

export async function cancelRsvp(rsvpId: string): Promise<void> {
  const res = await apiFetch(`/api/rsvps/${rsvpId}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'cancelled' }),
  });
  // Previously unchecked: a failed cancel left the UI showing "cancelled"
  // while the RSVP was still live on the server.
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Cancel failed: ${res.status}`);
}

export async function createEvent(input: CreateEventInput): Promise<ApiEvent> {
  const res = await apiFetch('/api/events', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Create failed: ${res.status}`);
  }
  const { event } = await res.json() as { event: ApiEvent };
  return event;
}

export async function fetchDashboard(): Promise<ApiDashboardEvent[]> {
  const res = await apiFetch('/api/dashboard');
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Dashboard fetch failed: ${res.status}`);
  const { events } = await res.json() as { events: ApiDashboardEvent[] };
  return events;
}

export async function fetchMyRsvps(): Promise<ApiRsvp[]> {
  const res = await apiFetch('/api/rsvps/mine');
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`RSVPs fetch failed: ${res.status}`);
  const { rsvps } = await res.json() as { rsvps: ApiRsvp[] };
  return rsvps;
}

export async function fetchProfile(id: string): Promise<ApiProfile> {
  const res = await apiFetch(`/api/profiles/${id}`);
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
  const { user } = await res.json() as { user: ApiProfile };
  return user;
}

export async function deleteEvent(id: string): Promise<void> {
  const res = await apiFetch(`/api/events/${id}`, { method: 'DELETE' });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export function uploadEventCover(eventId: string, uri: string, mimeType: string): Promise<ApiEvent> {
  // Uploads deliberately go through XMLHttpRequest rather than fetch.
  //
  // Expo SDK 54+ replaces global fetch with a WinterCG implementation whose
  // multipart encoder rejects React Native's proprietary { uri, name, type }
  // file part ("Unsupported FormDataPart implementation"), so the request
  // never left the device. Expo does NOT replace XMLHttpRequest, and RN's
  // native networking supports that part shape directly — it also streams the
  // file from disk instead of loading it into JS memory.
  //
  // The obvious alternative, expo-file-system's Blob-compatible File, shipped
  // a prebuilt XCFramework whose Swift ABI didn't match expo-modules-core
  // 57.0.2 and hard-crashed the app at launch (dyld "Symbol not found").
  // Avoiding the extra native module removes that class of risk entirely.
  const filename = uri.split('/').pop() || 'cover.jpg';
  const formData = new FormData();
  formData.append('image', { uri, name: filename, type: mimeType } as unknown as Blob);

  const token = getBearerToken();

  return new Promise<ApiEvent>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/events/${eventId}/cover`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Content-Type is intentionally unset: RN derives multipart/form-data
    // plus the boundary from the FormData body.
    xhr.onload = () => {
      if (xhr.status === 401) return reject(new Error('unauthorized'));
      if (xhr.status < 200 || xhr.status >= 300) {
        const detail = typeof xhr.responseText === 'string' ? xhr.responseText.slice(0, 120) : '';
        return reject(new Error(`Upload failed: ${xhr.status}${detail ? ` — ${detail}` : ''}`));
      }
      try {
        const { event } = JSON.parse(xhr.responseText) as { event: ApiEvent };
        resolve(event);
      } catch {
        reject(new Error('Upload succeeded but the response could not be read.'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out.'));
    xhr.send(formData);
  });
}

// ─── Favourites ───────────────────────────────────────────────────────────────

export type ApiFavourite = {
  id: string;
  userId: string;
  type: 'sport' | 'team' | 'venue';
  value: string;
  sport: string | null;
  createdAt: string;
};

export async function fetchFavourites(): Promise<ApiFavourite[]> {
  const res = await apiFetch('/api/favourites');
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`Favourites fetch failed: ${res.status}`);
  const { favourites } = await res.json() as { favourites: ApiFavourite[] };
  return favourites;
}

export async function addFavourite(type: string, value: string, sport?: string): Promise<void> {
  await apiFetch('/api/favourites', {
    method: 'POST',
    body: JSON.stringify({ type, value, sport }),
  });
}

export async function removeFavourite(type: string, value: string): Promise<void> {
  await apiFetch('/api/favourites', {
    method: 'DELETE',
    body: JSON.stringify({ type, value }),
  });
}

export async function saveFavouritesBulk(
  favourites: Array<{ type: string; value: string; sport?: string }>,
): Promise<ApiFavourite[]> {
  const res = await apiFetch('/api/favourites/bulk', {
    method: 'PUT',
    body: JSON.stringify({ favourites }),
  });
  if (!res.ok) throw new Error(`Bulk save failed: ${res.status}`);
  const { favourites: saved } = await res.json() as { favourites: ApiFavourite[] };
  return saved;
}

// Resolve a stored cover path (e.g. "/api/images/…") to a fetchable URL.
// Every screen must use this — passing the raw path to <Image> silently
// renders nothing.
export function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('/') ? `${API_BASE}${path}` : path;
}

// ─── Geocoding (venue address autocomplete) ──────────────────────────────────

export type GeocodeSuggestion = {
  label: string;   // full display string, also what fills the address field
  name: string;    // POI/venue name when the provider has one
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
};

export async function searchAddresses(
  q: string,
  bias?: { latitude: number; longitude: number },
): Promise<GeocodeSuggestion[]> {
  const params = new URLSearchParams({ q });
  if (bias) {
    params.set('lat', String(bias.latitude));
    params.set('lon', String(bias.longitude));
  }
  const res = await apiFetch(`/api/geocode?${params.toString()}`, { skipAuth: true });
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  const { suggestions } = await res.json() as { suggestions: GeocodeSuggestion[] };
  return suggestions;
}

// ─── Sponsors (Phase 3 — payments stubbed, see BLOCKED.md) ───────────────────

export type ApiSponsorProfile = {
  id: string;
  companyName: string;
  website: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SponsorshipStatus = 'pending' | 'active' | 'rejected' | 'cancelled';

export type ApiSponsorBid = {
  id: string;
  eventId: string;
  sponsorId: string;
  amountCents: number;
  platformFeeCents: number;
  note: string | null;
  status: SponsorshipStatus;
  createdAt: string;
  updatedAt: string;
};

export type ApiHostAnalyticsEvent = ApiEvent & {
  confirmedAttendees: number;
  sponsorRevenueCents: number;
  platformRevenueCents: number;
  activeSponsorships: number;
};

export type ApiSponsorAnalytics = {
  bids: ApiSponsorBid[];
  summary: {
    totalBids: number;
    activeBids: number;
    totalSpendCents: number;
    totalFeeCents: number;
    totalReach: number;
  };
};

export async function registerSponsor(companyName: string, website?: string): Promise<ApiSponsorProfile> {
  const res = await apiFetch('/api/sponsors/register', {
    method: 'POST',
    body: JSON.stringify({ companyName, website }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Sponsor registration failed: ${res.status}`);
  const { sponsor } = await res.json() as { sponsor: ApiSponsorProfile };
  return sponsor;
}

// Returns null when the signed-in user has no sponsor profile yet.
export async function fetchMySponsorProfile(): Promise<ApiSponsorProfile | null> {
  const res = await apiFetch('/api/sponsors/me');
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`Sponsor profile fetch failed: ${res.status}`);
  const { sponsor } = await res.json() as { sponsor: ApiSponsorProfile };
  return sponsor;
}

export async function placeSponsorBid(eventId: string, amountCents: number, note?: string): Promise<ApiSponsorBid> {
  const res = await apiFetch('/api/sponsors/bids', {
    method: 'POST',
    body: JSON.stringify({ eventId, amountCents, note }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (res.status === 403) throw new Error('not_a_sponsor');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Bid failed: ${res.status}`);
  }
  const { bid } = await res.json() as { bid: ApiSponsorBid };
  return bid;
}

export async function fetchMyBids(): Promise<ApiSponsorBid[]> {
  const res = await apiFetch('/api/sponsors/bids/mine');
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`Bids fetch failed: ${res.status}`);
  const { bids } = await res.json() as { bids: ApiSponsorBid[] };
  return bids;
}

// Host-only: bids on one of the host's own events.
export async function fetchEventBids(eventId: string): Promise<ApiSponsorBid[]> {
  const res = await apiFetch(`/api/sponsors/events/${eventId}/bids`);
  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) throw new Error(`Event bids fetch failed: ${res.status}`);
  const { bids } = await res.json() as { bids: ApiSponsorBid[] };
  return bids;
}

// Host sets 'active' | 'rejected'; sponsor may set 'cancelled'.
export async function updateBidStatus(bidId: string, status: SponsorshipStatus): Promise<ApiSponsorBid> {
  const res = await apiFetch(`/api/sponsors/bids/${bidId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Bid update failed: ${res.status}`);
  }
  const { bid } = await res.json() as { bid: ApiSponsorBid };
  return bid;
}

export async function fetchHostAnalytics(): Promise<ApiHostAnalyticsEvent[]> {
  const res = await apiFetch('/api/sponsors/analytics/host');
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`Host analytics fetch failed: ${res.status}`);
  const { events } = await res.json() as { events: ApiHostAnalyticsEvent[] };
  return events;
}

export async function fetchSponsorAnalytics(): Promise<ApiSponsorAnalytics | null> {
  const res = await apiFetch('/api/sponsors/analytics/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Sponsor analytics fetch failed: ${res.status}`);
  return await res.json() as ApiSponsorAnalytics;
}

export async function fetchFollowCounts(id: string): Promise<{ followers: number; following: number }> {
  const [frs, fing] = await Promise.all([
    apiFetch(`/api/profiles/${id}/followers`).then((r) => r.json() as Promise<{ followers: unknown[] }>),
    apiFetch(`/api/profiles/${id}/following`).then((r) => r.json() as Promise<{ following: unknown[] }>),
  ]);
  return { followers: frs.followers.length, following: fing.following.length };
}
