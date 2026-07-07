import { Platform } from 'react-native';

export const API_BASE = __DEV__
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:8787'
    : 'http://localhost:8787'
  : 'https://spot-seek-api.YOUR_SUBDOMAIN.workers.dev';

// In-memory bearer token — set after sign-in/sign-up.
// Upgrade to expo-secure-store for persistence across app restarts.
let _bearerToken = '';

export function setBearerToken(token: string) {
  _bearerToken = token;
}
export function clearBearerToken() {
  _bearerToken = '';
}
export function getBearerToken() {
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
}): Promise<ApiEvent[]> {
  const q = new URLSearchParams();
  if (params?.after) q.set('after', params.after);
  if (params?.before) q.set('before', params.before);
  if (params?.lat != null) q.set('lat', String(params.lat));
  if (params?.lng != null) q.set('lng', String(params.lng));
  if (params?.radiusKm != null) q.set('radiusKm', String(params.radiusKm));

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
  await apiFetch(`/api/rsvps/${rsvpId}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'cancelled' }),
  });
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

export async function uploadEventCover(eventId: string, uri: string, mimeType: string): Promise<ApiEvent> {
  const formData = new FormData();
  const filename = uri.split('/').pop() ?? 'cover.jpg';
  // React Native FormData accepts this shape for file uploads
  formData.append('image', { uri, name: filename, type: mimeType } as unknown as Blob);

  const token = getBearerToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/events/${eventId}/cover`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const { event } = await res.json() as { event: ApiEvent };
  return event;
}

export async function fetchFollowCounts(id: string): Promise<{ followers: number; following: number }> {
  const [frs, fing] = await Promise.all([
    apiFetch(`/api/profiles/${id}/followers`).then((r) => r.json() as Promise<{ followers: unknown[] }>),
    apiFetch(`/api/profiles/${id}/following`).then((r) => r.json() as Promise<{ following: unknown[] }>),
  ]);
  return { followers: frs.followers.length, following: fing.following.length };
}
