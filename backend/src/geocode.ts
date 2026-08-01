/**
 * Address autocomplete / geocoding proxy.
 *
 * Proxies Photon (photon.komoot.io, OSM-based, no API key) so the app never
 * talks to the provider directly — lets us swap providers or add a key later
 * without an app update, and lets the Worker cache results at the edge.
 * Photon asks for fair use; the app debounces and this route caches a day.
 */
import { Hono } from 'hono';

type AppEnv = { Bindings: Env };

export const geocodeRouter = new Hono<AppEnv>();

const PHOTON_BASE = 'https://photon.komoot.io/api/';
const MAX_RESULTS = 6;
const CACHE_TTL_SECONDS = 86_400; // 1 day — addresses don't move often

type PhotonFeature = {
  geometry: { coordinates: [number, number] }; // [lng, lat]
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    osm_key?: string;
    osm_value?: string;
  };
};

export type GeocodeSuggestion = {
  label: string;   // full display string, also what fills the address field
  name: string;    // POI/venue name when Photon has one, else first label part
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
};

export function featureToSuggestion(f: PhotonFeature): GeocodeSuggestion | null {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const streetLine = [p.street, p.housenumber].filter(Boolean).join(' ');
  const parts = [p.name, streetLine, p.city, p.state, p.country]
    .filter((v): v is string => !!v && v.trim().length > 0);
  // Drop consecutive duplicates (Photon sets name === street for plain addresses).
  const deduped = parts.filter((v, i) => v !== parts[i - 1]);
  if (deduped.length === 0) return null;

  return {
    label: deduped.join(', '),
    name: p.name ?? deduped[0],
    lat,
    lng,
    city: p.city ?? null,
    country: p.country ?? null,
  };
}

geocodeRouter.get('/', async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  if (q.length < 3) return c.json({ suggestions: [] });

  const lat = c.req.query('lat');
  const lon = c.req.query('lon');

  const upstream = new URL(PHOTON_BASE);
  upstream.searchParams.set('q', q);
  upstream.searchParams.set('limit', String(MAX_RESULTS));
  upstream.searchParams.set('lang', 'en');
  // Location bias: rank results near the user first when the app knows where they are.
  if (lat && lon && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lon))) {
    upstream.searchParams.set('lat', lat);
    upstream.searchParams.set('lon', lon);
  }

  // Edge cache — key on the normalized upstream URL.
  const cache = caches.default;
  const cacheKey = new Request(upstream.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let res: Response;
  try {
    res = await fetch(upstream.toString(), {
      headers: { 'User-Agent': 'SpotSeek/1.0 (watch-party app; venue autocomplete)' },
    });
  } catch {
    return c.json({ error: 'Geocoding service unreachable' }, 502);
  }
  if (!res.ok) return c.json({ error: 'Geocoding service error' }, 502);

  const body = await res.json() as { features?: PhotonFeature[] };
  const suggestions = (body.features ?? [])
    .map(featureToSuggestion)
    .filter((s): s is GeocodeSuggestion => s !== null);

  const out = new Response(JSON.stringify({ suggestions }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
});
