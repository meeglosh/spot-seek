const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete store[k]; }),
}));

const mockFetchFavourites = jest.fn();
const mockSaveBulk = jest.fn();
jest.mock('../lib/api', () => ({
  fetchFavourites: (...a: unknown[]) => mockFetchFavourites(...a),
  saveFavouritesBulk: (...a: unknown[]) => mockSaveBulk(...a),
}));

import {
  getGuestInterests, setGuestInterests, syncGuestInterests,
  setPendingIntent, consumePendingIntent,
} from '../lib/guestState';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  mockFetchFavourites.mockReset();
  mockSaveBulk.mockReset();
  setPendingIntent(null);
});

describe('guest interests', () => {
  it('round-trips and clears', async () => {
    await setGuestInterests([{ type: 'sport', value: 'Football' }]);
    expect(await getGuestInterests()).toEqual([{ type: 'sport', value: 'Football' }]);
    await setGuestInterests([]);
    expect(await getGuestInterests()).toEqual([]);
  });

  it('merges with the account favourites instead of replacing them, then clears', async () => {
    await setGuestInterests([
      { type: 'sport', value: 'Football' },
      { type: 'team', value: 'Arsenal', sport: 'Football' },
    ]);
    mockFetchFavourites.mockResolvedValue([{ type: 'sport', value: 'Football', sport: null }]);
    mockSaveBulk.mockResolvedValue([]);
    await syncGuestInterests();
    expect(mockSaveBulk).toHaveBeenCalledWith([
      { type: 'sport', value: 'Football', sport: undefined },
      { type: 'team', value: 'Arsenal', sport: 'Football' },
    ]);
    expect(await getGuestInterests()).toEqual([]);
  });

  it('keeps the local picks when the sync fails', async () => {
    await setGuestInterests([{ type: 'sport', value: 'Tennis' }]);
    mockFetchFavourites.mockResolvedValue([]);
    mockSaveBulk.mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await syncGuestInterests();
    expect(await getGuestInterests()).toEqual([{ type: 'sport', value: 'Tennis' }]);
  });

  it('does nothing when there are no guest picks', async () => {
    await syncGuestInterests();
    expect(mockSaveBulk).not.toHaveBeenCalled();
  });
});

describe('pending intent', () => {
  it('is consumed once, only by the matching event', () => {
    setPendingIntent({ kind: 'rsvp', eventId: 'e1' });
    expect(consumePendingIntent('rsvp', 'other')).toBe(false);
    expect(consumePendingIntent('rsvp', 'e1')).toBe(true);
    expect(consumePendingIntent('rsvp', 'e1')).toBe(false);
  });

  it('expires', () => {
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    setPendingIntent({ kind: 'rsvp', eventId: 'e1' });
    spy.mockReturnValue(now + 16 * 60 * 1000);
    expect(consumePendingIntent('rsvp', 'e1')).toBe(false);
    spy.mockRestore();
  });
});
