import { Platform } from 'react-native';

// In dev: iOS Simulator uses localhost; Android Emulator uses 10.0.2.2 to reach host.
// In production: replace with your deployed Workers URL.
export const API_BASE = __DEV__
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:8787'
    : 'http://localhost:8787'
  : 'https://spot-seek-api.YOUR_SUBDOMAIN.workers.dev';

// In-memory session cookie — updated by auth.tsx after sign-in/sign-up.
// Upgrade to expo-secure-store for persistence across app restarts.
let _sessionCookie = '';

export function setSessionCookie(cookie: string) {
  _sessionCookie = cookie;
}
export function clearSessionCookie() {
  _sessionCookie = '';
}
export function getSessionCookie() {
  return _sessionCookie;
}

type FetchOptions = RequestInit & { skipAuth?: boolean };

export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  const { skipAuth, ...rest } = opts;
  const headers = new Headers(rest.headers as Record<string, string> | undefined);

  if (!skipAuth && _sessionCookie) {
    headers.set('Cookie', _sessionCookie);
  }
  if (!headers.has('Content-Type') && rest.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${API_BASE}${path}`, { ...rest, headers });
}

// ─── Typed wrappers ────────────────────────────────────────────────────────────

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
};

export async function fetchFeed(params?: {
  after?: string;
  before?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}): Promise<ApiEvent[]> {
  const q = new URLSearchParams();
  if (params?.after) q.set('after', params.after);
  if (params?.before) q.set('before', params.before);
  if (params?.lat != null) q.set('lat', String(params.lat));
  if (params?.lng != null) q.set('lng', String(params.lng));
  if (params?.radiusKm != null) q.set('radiusKm', String(params.radiusKm));

  const qs = q.toString();
  const res = await apiFetch(`/api/feed${qs ? `?${qs}` : ''}`, { skipAuth: false });
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
  await apiFetch(`/api/rsvps/${rsvpId}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'cancelled' }),
  });
}
