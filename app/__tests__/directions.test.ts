import { buildDirectionsUrls, buildDirectionsOptions, hasDirectionsTarget } from '../lib/directions';

const coords = { lat: 40.7128, lng: -74.006, name: 'Joe & Sons Bar', address: '1 Main St' };
const none = { googleMaps: false, waze: false };
const both = { googleMaps: true, waze: true };

describe('buildDirectionsUrls', () => {
  it('builds every URL from coordinates, encoding the name', () => {
    expect(buildDirectionsUrls(coords)).toEqual({
      apple: 'http://maps.apple.com/?daddr=40.7128,-74.006&q=Joe%20%26%20Sons%20Bar',
      google: 'comgooglemaps://?daddr=40.7128,-74.006&directionsmode=driving',
      googleWeb: 'https://www.google.com/maps/dir/?api=1&destination=40.7128,-74.006',
      waze: 'https://waze.com/ul?ll=40.7128,-74.006&navigate=yes',
      wazeApp: 'waze://?ll=40.7128,-74.006&navigate=yes',
    });
  });
  it('treats 0 coordinates as valid', () => {
    expect(buildDirectionsUrls({ lat: 0, lng: 0 })?.googleWeb).toContain('destination=0,0');
  });
  it('falls back to the encoded address without coordinates', () => {
    const address = "12 Rue de l'Église, Paris";
    const u = buildDirectionsUrls({ address, lat: null, lng: null })!;
    const enc = encodeURIComponent(address);
    expect(u.apple).toBe(`http://maps.apple.com/?daddr=${enc}`);
    expect(u.googleWeb).toBe(`https://www.google.com/maps/dir/?api=1&destination=${enc}`);
    expect(u.waze).toBe(`https://waze.com/ul?q=${enc}&navigate=yes`);
    expect(u.wazeApp).toBe(`waze://?q=${enc}&navigate=yes`);
  });
  it('returns null with no coordinates and no address', () => {
    expect(buildDirectionsUrls({ name: 'X', address: '  ' })).toBeNull();
    expect(hasDirectionsTarget({ lat: 1, lng: null })).toBe(false);
    expect(hasDirectionsTarget({ address: 'x' })).toBe(true);
  });
});

describe('buildDirectionsOptions', () => {
  it('iOS with nothing installed: Apple Maps + Google Maps web', () => {
    expect(buildDirectionsOptions(coords, none, 'ios').map((o) => o.id)).toEqual(['apple', 'googleWeb']);
  });
  it('iOS with both installed uses the app schemes', () => {
    const o = buildDirectionsOptions(coords, both, 'ios');
    expect(o.map((x) => x.id)).toEqual(['apple', 'google', 'waze']);
    expect(o[1].url.startsWith('comgooglemaps://')).toBe(true);
    expect(o[2].url.startsWith('waze://')).toBe(true);
  });
  it('iOS with only Waze installed', () => {
    expect(buildDirectionsOptions(coords, { googleMaps: false, waze: true }, 'ios').map((o) => o.id))
      .toEqual(['apple', 'googleWeb', 'waze']);
  });
  it('Android has no Apple Maps and offers web links', () => {
    expect(buildDirectionsOptions(coords, none, 'android').map((o) => o.id)).toEqual(['googleWeb', 'waze']);
  });
  it('returns nothing without a target', () => {
    expect(buildDirectionsOptions({}, both, 'ios')).toEqual([]);
  });
});
