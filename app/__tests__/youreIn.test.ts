import { momentFor, momentTiming } from '../lib/youreIn';

describe("You're in moment variants", () => {
  it('going plays the full drop with share, directions and done', () => {
    expect(momentFor('going', false, true)).toEqual({
      variant: 'going', motion: 'drop', actions: ['share', 'directions', 'done'],
    });
  });

  it('going omits directions when the location is not available', () => {
    expect(momentFor('going', false, false)?.actions).toEqual(['share', 'done']);
  });

  it('going under Reduce Motion crossfades: no drop, no squash', () => {
    expect(momentFor('going', true, true)?.motion).toBe('fade');
  });

  it('waitlisted is the calm variant: fade only, done only, regardless of motion setting', () => {
    for (const reduce of [false, true]) {
      expect(momentFor('waitlisted', reduce, true)).toEqual({
        variant: 'waitlist', motion: 'fade', actions: ['done'],
      });
    }
  });

  it('cancelled or missing RSVPs get no moment', () => {
    expect(momentFor('cancelled', false)).toBeNull();
    expect(momentFor(undefined, false)).toBeNull();
    expect(momentFor(null, true)).toBeNull();
  });

  it('the drop sequence finishes within 1.8s', () => {
    expect(momentTiming.actionsAt + momentTiming.reveal).toBeLessThanOrEqual(1800);
  });
});
