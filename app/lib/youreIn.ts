// "You're in." variant logic, kept pure so it can be tested without rendering.
//
//  going       -> the full moment: pin drops, squashes, "You're in." lands, then
//                 the title and time, then the quick actions.
//  waitlisted  -> a calmer variant: no drop, no squash, a single fade. The copy
//                 says they'll be notified (waitlist promotion notifications).
//  Reduce Motion -> same content, crossfaded: no drop, no squash.
export type MomentVariant = 'going' | 'waitlist';
export type MomentMotion = 'drop' | 'fade';
export type MomentAction = 'share' | 'directions' | 'done';
export type Moment = { variant: MomentVariant; motion: MomentMotion; actions: MomentAction[] };

// Timings (ms) for the drop sequence. Total ~1.3s from open to the actions
// being fully visible.
export const momentTiming = {
  scrim: 180,
  sheet: 240,       // sheet slides up (skipped under Reduce Motion)
  dropAt: 120,      // pin starts falling while the sheet is still arriving
  drop: 380,        // pin falls onto the sheet
  squash: 110,      // compress on landing
  headlineAt: 660,  // "You're in." after the land
  lineAt: 860,      // title + date/time
  actionsAt: 1060,   // quick actions
  reveal: 220,      // each text beat's fade/rise
  fade: 300,        // crossfade (Reduce Motion and waitlist)
} as const;

// Returns null when an RSVP state deserves no moment (cancelled, none).
// `canGetDirections` is the screen's existing rule (private locations only
// reveal directions to someone with an active RSVP).
export function momentFor(
  state: string | null | undefined,
  reduceMotion: boolean,
  canGetDirections = false,
): Moment | null {
  if (state === 'going') {
    return {
      variant: 'going',
      motion: reduceMotion ? 'fade' : 'drop',
      actions: canGetDirections ? ['share', 'directions', 'done'] : ['share', 'done'],
    };
  }
  if (state === 'waitlisted') {
    // Nothing to celebrate and no confirmed spot: acknowledge and dismiss.
    return { variant: 'waitlist', motion: 'fade', actions: ['done'] };
  }
  return null;
}
