/**
 * GET /support: the App Store "Support URL". Contact info plus a short FAQ.
 * Same shell as /guidelines. Every answer is traced to app or backend code:
 * - RSVP / cancel: app discover/[id].tsx, rsvps.ts (capacity overflow -> waitlisted)
 * - Private addresses: maskPrivateLocation in feed.ts, used by events.ts
 * - Waitlist: waitlist.ts (earliest waitlisted is promoted, then notified)
 * - Report / block: moderation menu in the app, Settings > Safety > Blocked people
 * - Delete account: Settings > Account, account.ts
 * - Notifications: Settings > Notifications toggles, iOS Settings fallback
 * Plain, short copy. No em dashes. No chat, no sponsorship or payments.
 */
import { escapeHtml, renderPage } from './webpage';
import { legalFooter, LEGAL_FOOT_CSS } from './legal';

export const SUPPORT_CONTACT = 'hello@spotseek.app';

const FAQ: [string, string][] = [
  ['How do I RSVP?', 'Open a party in Discover and tap RSVP. You need to be signed in. If the party is full, you join the waitlist instead.'],
  ['How do I cancel my RSVP?', 'Open the party and tap Cancel RSVP. If you were going, your spot opens up for the next person.'],
  ['How do I host a party?', 'Tap Host a party, add a title and a time, then publish. A venue is optional: a bar, a rooftop, your living room, or decide later and add it when you know.'],
  ["Why can't I see the address?", 'Hosts can keep a location private, like a home. The venue name shows up, but the exact address stays hidden until you RSVP.'],
  ['How does the waitlist work?', 'When a party is at capacity, new RSVPs join the waitlist in the order they arrive. If a spot opens, the first person in line moves to going and gets a notification.'],
  ['How do I report or block someone?', 'Open the party, tap More options, then Report party or Block this host. Blocked hosts never show up for you. You can unblock anyone in Settings, under Safety, then Blocked people.'],
  ['How do I delete my account?', 'Open Settings, go to Account and tap Delete account. This removes your profile, your RSVPs and any past, draft or cancelled parties you host. If you still host upcoming parties, cancel them first so guests are told, then try again.'],
  ['Notifications not arriving?', 'Check Settings, then Notifications, and make sure push and email are on. Also check iPhone Settings, then SpotSeek, then Notifications, and allow them there.'],
];

export function renderSupportPage(opts: { baseUrl: string }): string {
  const base = escapeHtml(opts.baseUrl);
  const faq = FAQ.map(([q, a]) => `<h3>${escapeHtml(q)}</h3>\n      <p class="meta">${escapeHtml(a)}</p>`).join('\n      ');
  const body = `<div class="content">
    <div class="label">Support</div>
    <h1>Support</h1>
    <p class="meta">Questions or something not working? Email <a href="mailto:${SUPPORT_CONTACT}">${SUPPORT_CONTACT}</a>. We reply within a few days.</p>

    <div class="panel">
      <h2>Quick answers</h2>
      ${faq}
    </div>

    <p class="meta">More: <a href="${base}/guidelines">Community guidelines</a> · <a href="${base}/privacy">Privacy</a> · <a href="${base}/terms">Terms</a></p>
    <p class="fine"><a href="${base}/">Back to SpotSeek</a></p>
  </div>
  ${legalFooter(opts.baseUrl)}`;
  return renderPage({
    title: 'Support · SpotSeek',
    head: '<meta name="description" content="Contact SpotSeek support and get quick answers about RSVPs, hosting, addresses, the waitlist, safety and your account.">\n' + LEGAL_FOOT_CSS,
    body,
  });
}
