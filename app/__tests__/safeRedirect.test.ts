import { safeRedirect } from '../lib/safeRedirect';

const FALLBACK = '/(tabs)/discover';

describe('safeRedirect', () => {
  it.each([
    '/(tabs)/parties',
    '/events/abc?x=1#top',
    '/(tabs)/sponsorship/browse?eventId=1',
  ])('accepts in-app path %s', (p) => {
    expect(safeRedirect(p, FALLBACK)).toBe(p);
  });

  it.each([
    '//evil.example',
    '//evil.example/path',
    '/\\evil.example',
    '/\\/evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    'evil.example',
    '/ok\\path',
    '/ok\npath',
    '/ok\tpath',
    '',
    undefined,
    null,
    ['/a'],
  ])('rejects %p', (p) => {
    expect(safeRedirect(p, FALLBACK)).toBe(FALLBACK);
  });
});
