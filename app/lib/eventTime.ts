// When is a party over? The ONE app-side definition; the backend mirrors it in
// backend/src/eventTime.ts (keep the two in step).
//
//   ended     endsAt < now, or, with no endsAt, startsAt < now - 4h.
//   live      started and not yet ended ("On now").
//   upcoming  not started yet. A party with no date is never "ended".
//
// Everything here compares instants (epoch ms), never local calendar dates, so
// a venue in another timezone cannot shift the answer.

/** Default length of a watch party when the host gave no end time. */
export const DEFAULT_EVENT_DURATION_MS = 4 * 60 * 60 * 1000;

export type EventPhase = 'upcoming' | 'live' | 'ended';

export type Timed = { startsAt?: string | null; endsAt?: string | null };

const toMs = (iso?: string | null): number | null => {
  if (!iso) return null;
  const n = new Date(iso).getTime();
  return Number.isNaN(n) ? null : n;
};

/** The instant a party counts as over, or null when it has no date. */
export function effectiveEndMs(event: Timed): number | null {
  const end = toMs(event.endsAt);
  if (end != null) return end;
  const start = toMs(event.startsAt);
  return start == null ? null : start + DEFAULT_EVENT_DURATION_MS;
}

export function eventPhase(event: Timed, now: Date | number = Date.now()): EventPhase {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const end = effectiveEndMs(event);
  if (end != null && end < nowMs) return 'ended';
  const start = toMs(event.startsAt);
  if (start != null && start <= nowMs) return 'live';
  return 'upcoming';
}

export const hasEnded = (event: Timed, now?: Date | number): boolean => eventPhase(event, now) === 'ended';

/** Newest first. Undated parties sort last. */
export function newestFirst<T extends Timed>(a: T, b: T): number {
  return (toMs(b.startsAt) ?? -Infinity) - (toMs(a.startsAt) ?? -Infinity);
}

/** Soonest first. Undated parties sort last. */
export function soonestFirst<T extends Timed>(a: T, b: T): number {
  return (toMs(a.startsAt) ?? Infinity) - (toMs(b.startsAt) ?? Infinity);
}

/**
 * How a party should present, by phase. One table for every surface, so the
 * rules in the brief live in a single testable place.
 *  - tag:      'ended' (neutral tag) or 'live' ("On now", live tone) or none.
 *  - muted:    dim the cover, use secondary text for the title.
 *  - canRsvp / showDirections / showYoureIn: false once the party is over.
 *  - detailPanel: what replaces the RSVP bar on the detail screen.
 */
export type PhasePresentation = {
  tag: 'ended' | 'live' | null;
  muted: boolean;
  canRsvp: boolean;
  showDirections: boolean;
  showYoureIn: boolean;
  detailPanel: 'rsvp' | 'ended';
};

export function presentationFor(phase: EventPhase): PhasePresentation {
  if (phase === 'ended') {
    return {
      tag: 'ended', muted: true, canRsvp: false, showDirections: false, showYoureIn: false, detailPanel: 'ended',
    };
  }
  return {
    tag: phase === 'live' ? 'live' : null,
    muted: false, canRsvp: true, showDirections: true, showYoureIn: true, detailPanel: 'rsvp',
  };
}

/** "Leave a review" is offered on an ended party to a guest who was going (never the host). */
export function canLeaveReview(phase: EventPhase, wasGoing: boolean, isHost: boolean): boolean {
  return phase === 'ended' && wasGoing && !isHost;
}
