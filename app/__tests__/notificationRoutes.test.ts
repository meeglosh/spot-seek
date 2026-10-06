import { routeFor } from '../lib/notificationRoutes';

describe('routeFor (shared by Notification Center and push taps)', () => {
  it('returns null without an event', () => {
    expect(routeFor('rsvp', null)).toBeNull();
  });
  it('routes host-facing types to the Command Center', () => {
    expect(routeFor('sponsor_bid', 'e1')).toBe('/(tabs)/parties/dashboard');
    expect(routeFor('payment_received', 'e1')).toBe('/(tabs)/parties/dashboard');
  });
  it('routes sponsor payment states to the bid screen', () => {
    expect(routeFor('payment_due', 'e1')).toBe('/(tabs)/sponsorship/e1');
  });
  it('defaults to the event page', () => {
    expect(routeFor('reminder_1h', 'e1')).toBe('/(tabs)/discover/e1');
    expect(routeFor(undefined, 'e1')).toBe('/(tabs)/discover/e1');
  });
});
