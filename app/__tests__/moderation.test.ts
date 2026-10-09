import { ApiError } from '../lib/api';
import {
  REPORT_REASON_KEYS, reasonLabelKey, reportErrorKey, publishProblem, isRsvpForbidden, hostBannerKind,
  GUIDELINES_URL,
  TERMS_URL,
  PRIVACY_URL,
} from '../lib/moderation';
import { routeFor, iconFor } from '../lib/notificationRoutes';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
const en = JSON.parse(fs.readFileSync(path.resolve('locales/en/moderation.json'), 'utf8'));

describe('report reasons', () => {
  it('lists exactly the six API reasons, each once', () => {
    expect([...REPORT_REASON_KEYS].sort()).toEqual(['harassment', 'hate', 'other', 'sexual', 'spam', 'violence']);
    expect(new Set(REPORT_REASON_KEYS).size).toBe(6);
  });

  it('maps every reason to its own label key with distinct copy', () => {
    const labels = REPORT_REASON_KEYS.map((r) => {
      const key = reasonLabelKey(r);
      expect(key).toBe(`report.reasons.${r}`);
      return en.report.reasons[r] as string;
    });
    labels.forEach((l) => expect(typeof l).toBe('string'));
    expect(new Set(labels).size).toBe(6);
  });
});

describe('reportErrorKey', () => {
  it('maps 429 to the rate-limit copy', () => {
    expect(reportErrorKey(new ApiError(429, 'Too many requests'))).toBe('report.errors.rateLimited');
  });
  it('maps 403 cannot_report_own_event', () => {
    expect(reportErrorKey(new ApiError(403, 'cannot_report_own_event'))).toBe('report.errors.ownEvent');
  });
  it('maps 400 note_too_long, 404 and 401', () => {
    expect(reportErrorKey(new ApiError(400, 'note_too_long'))).toBe('report.errors.noteTooLong');
    expect(reportErrorKey(new ApiError(404, 'Not found'))).toBe('report.errors.notFound');
    expect(reportErrorKey(new ApiError(401, 'Unauthorized'))).toBe('report.errors.signIn');
  });
  it('falls back to generic for other API errors and network for fetch failures', () => {
    expect(reportErrorKey(new ApiError(500, 'boom'))).toBe('report.errors.generic');
    expect(reportErrorKey(new TypeError('Network request failed'))).toBe('report.errors.network');
  });
  it('only returns keys that exist in the English copy', () => {
    const errs = [
      new ApiError(429, 'x'), new ApiError(403, 'cannot_report_own_event'), new ApiError(400, 'note_too_long'),
      new ApiError(404, 'x'), new ApiError(401, 'x'), new ApiError(500, 'x'), new TypeError('x'),
    ];
    for (const e of errs) {
      const key = reportErrorKey(e).replace(/^report\.errors\./, '');
      expect(typeof en.report.errors[key]).toBe('string');
    }
  });
});

describe('publishProblem (create and edit)', () => {
  it('422 content_rejected carries the backend message', () => {
    expect(publishProblem(new ApiError(422, 'content_rejected', "This doesn't meet our community guidelines.")))
      .toEqual({ kind: 'content_rejected', message: "This doesn't meet our community guidelines." });
  });
  it('422 content_rejected without a message yields null so the screen uses its fallback', () => {
    expect(publishProblem(new ApiError(422, 'content_rejected')))
      .toEqual({ kind: 'content_rejected', message: null });
  });
  it('403 publishing_paused and event_removed', () => {
    expect(publishProblem(new ApiError(403, 'publishing_paused'))).toEqual({ kind: 'publishing_paused' });
    expect(publishProblem(new ApiError(403, 'event_removed'))).toEqual({ kind: 'event_removed' });
  });
  it('ignores everything else, including a plain Forbidden', () => {
    expect(publishProblem(new ApiError(403, 'Forbidden'))).toBeNull();
    expect(publishProblem(new ApiError(500, 'boom'))).toBeNull();
    expect(publishProblem(new Error('content_rejected'))).toBeNull();
  });
});

describe('isRsvpForbidden', () => {
  it('treats any 403 as the neutral "can\'t RSVP" case', () => {
    expect(isRsvpForbidden(new ApiError(403, 'rsvp_forbidden'))).toBe(true);
    expect(isRsvpForbidden(new ApiError(403, 'Forbidden'))).toBe(true);
    expect(isRsvpForbidden(new ApiError(409, 'x'))).toBe(false);
    expect(isRsvpForbidden(new Error('already_rsvpd'))).toBe(false);
  });
  it('the neutral copy never mentions blocking', () => {
    const discover = JSON.parse(fs.readFileSync(path.resolve('locales/en/discover.json'), 'utf8'));
    expect(discover.detail.rsvpForbidden).toBe("You can't RSVP to this party.");
    expect(discover.detail.rsvpForbidden.toLowerCase()).not.toContain('block');
  });
});

describe('hostBannerKind', () => {
  it('shows a banner only for hidden and removed', () => {
    expect(hostBannerKind('hidden')).toBe('hidden');
    expect(hostBannerKind('removed')).toBe('removed');
    expect(hostBannerKind('ok')).toBeNull();
    expect(hostBannerKind('flagged')).toBeNull();
    expect(hostBannerKind(undefined)).toBeNull();
  });
});

describe('guidelines link', () => {
  it('points at the public page', () => {
    expect(GUIDELINES_URL).toBe('https://spotseek.app/guidelines');
  });
  it('points the terms and privacy links at the public pages', () => {
    expect(TERMS_URL).toBe('https://spotseek.app/terms');
    expect(PRIVACY_URL).toBe('https://spotseek.app/privacy');
  });
});

describe('moderation notification routes', () => {
  it('routes event_under_review and event_removed to the host dashboard', () => {
    expect(routeFor('event_under_review', 'e1')).toBe('/(tabs)/parties/dashboard');
    expect(routeFor('event_removed', 'e1')).toBe('/(tabs)/parties/dashboard');
  });
  it('returns null without an event', () => {
    expect(routeFor('event_removed', null)).toBeNull();
  });
  it('gives the two types a Notification Center icon and leaves others bare', () => {
    expect(iconFor('event_under_review')).toBe('shield');
    expect(iconFor('event_removed')).toBe('block');
    expect(iconFor('rsvp')).toBeNull();
  });
});
