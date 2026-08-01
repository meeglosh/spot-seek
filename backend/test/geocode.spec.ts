import { SELF, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { featureToSuggestion } from '../src/geocode';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

const PHOTON_FEATURES = {
  features: [
    {
      geometry: { coordinates: [-73.9857, 40.7484] },
      properties: {
        name: 'The Underground Pub',
        street: 'W 33rd St',
        housenumber: '450',
        city: 'New York',
        state: 'New York',
        country: 'United States',
        osm_key: 'amenity',
        osm_value: 'pub',
      },
    },
    {
      geometry: { coordinates: [-0.1276, 51.5072] },
      properties: {
        street: 'Whitehall',
        city: 'London',
        country: 'United Kingdom',
      },
    },
  ],
};

describe('GET /api/geocode', () => {
  it('returns empty suggestions without calling upstream for short queries', async () => {
    const res = await SELF.fetch('https://example.com/api/geocode?q=ab');
    expect(res.status).toBe(200);
    const body = await res.json() as { suggestions: unknown[] };
    expect(body.suggestions).toEqual([]);
  });

  it('maps Photon features to compact suggestions with coordinates', async () => {
    fetchMock
      .get('https://photon.komoot.io')
      .intercept({ path: /\/api\/.*/ })
      .reply(200, PHOTON_FEATURES);

    const res = await SELF.fetch('https://example.com/api/geocode?q=underground%20pub');
    expect(res.status).toBe(200);
    const body = await res.json() as {
      suggestions: Array<{ label: string; name: string; lat: number; lng: number; city: string | null }>;
    };
    expect(body.suggestions).toHaveLength(2);

    const [pub, street] = body.suggestions;
    expect(pub.name).toBe('The Underground Pub');
    // 'New York, New York' (city + identical state) collapses to one part.
    expect(pub.label).toBe('The Underground Pub, W 33rd St 450, New York, United States');
    expect(pub.lat).toBeCloseTo(40.7484);
    expect(pub.lng).toBeCloseTo(-73.9857);
    expect(pub.city).toBe('New York');

    // Address-only feature: label built without a POI name.
    expect(street.name).toBe('Whitehall');
    expect(street.label).toBe('Whitehall, London, United Kingdom');
  });

  it('returns 502 when the upstream errors', async () => {
    fetchMock
      .get('https://photon.komoot.io')
      .intercept({ path: /\/api\/.*/ })
      .reply(500, 'nope');

    const res = await SELF.fetch('https://example.com/api/geocode?q=somewhere%20else%20entirely');
    expect(res.status).toBe(502);
  });
});

describe('featureToSuggestion', () => {
  it('drops features without valid coordinates or any label parts', () => {
    expect(
      featureToSuggestion({ geometry: { coordinates: [0, 0] }, properties: {} } as never),
    ).toBeNull();
  });

  it('dedupes consecutive duplicate label parts (name === street)', () => {
    const s = featureToSuggestion({
      geometry: { coordinates: [2.35, 48.85] },
      properties: { name: 'Rue de Rivoli', street: 'Rue de Rivoli', city: 'Paris', country: 'France' },
    });
    expect(s?.label).toBe('Rue de Rivoli, Paris, France');
  });
});
