/**
 * Branded transactional email layout ("High-Energy Action" design system).
 * Table-based, inline CSS only (Gmail / Apple Mail / Outlook safe). Web fonts
 * are progressive enhancement via <link>; fallbacks are Impact / Arial.
 */

export const DEFAULT_PUBLIC_BASE_URL = 'https://spot-seek-api.dry-base-037d.workers.dev';
export const REPLY_TO = 'hello@spotseek.app';

const BG = '#0F0F12';
const CARD = '#1a1a20';
const CYAN = '#00e5ff';
const ORANGE = '#ff5e07';
const HEAD_FONT = "Anton, Impact, 'Arial Narrow Bold', sans-serif";
const BODY_FONT = "'Archivo Narrow', Arial, sans-serif";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HEADLINES: Record<string, string> = {
  rsvp: 'NEW RSVP',
  waitlist_promoted: "YOU'RE IN!",
  reminder_24h: 'GAME DAY IS TOMORROW',
  reminder_1h: 'GAME TIME SOON',
  review_request: 'HOW WAS IT?',
  event_cancelled: 'EVENT CANCELLED',
  venue_changed: 'VENUE CHANGED',
  favorite_nearby: 'NEW PARTY NEARBY',
  sponsor_bid: 'NEW SPONSOR BID',
  sponsorship_request: 'SPONSOR REQUEST',
  sponsorship_accepted: 'SPONSORSHIP ACCEPTED',
  sponsorship_rejected: 'SPONSORSHIP UPDATE',
  payment_due: 'PAYMENT DUE',
  payment_received: 'PAYMENT RECEIVED',
  payout_sent: 'PAYOUT SENT',
  payment_refunded: 'PAYMENT REFUNDED',
};

export function headlineFor(type?: string): string {
  return (type && HEADLINES[type]) || 'SPOT SEEK UPDATE';
}

export interface EmailContent {
  /** Notification type; drives the headline. */
  type?: string;
  /** Sub-headline (usually the notification title). Escaped. */
  title: string;
  /** Body text; blank lines separate paragraphs. Escaped. */
  body: string;
  eventId?: string;
  baseUrl?: string;
}

export function eventUrl(eventId: string, baseUrl = DEFAULT_PUBLIC_BASE_URL): string {
  return `${baseUrl.replace(/\/+$/, '')}/e/${encodeURIComponent(eventId)}`;
}

export function renderEmailHtml(c: EmailContent): string {
  const base = (c.baseUrl ?? DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
  const headline = escapeHtml(headlineFor(c.type));
  const title = escapeHtml(c.title);
  const paragraphs = c.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-family:${BODY_FONT};font-size:17px;line-height:25px;color:#e6e6ea;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');

  const cta = c.eventId
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0;">
<tr><td bgcolor="${CYAN}" style="background-color:${CYAN};border-right:5px solid ${ORANGE};border-bottom:5px solid ${ORANGE};border-radius:0;">
<a href="${escapeHtml(eventUrl(c.eventId, base))}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${HEAD_FONT};font-size:20px;line-height:24px;letter-spacing:1px;color:${BG};text-decoration:none;text-transform:uppercase;">VIEW EVENT</a>
</td></tr></table>`
    : '';

  const font = 'https://fonts.googleapis.com/css2?family=Anton&amp;family=Archivo+Narrow&amp;display=swap';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${title}</title>
<link href="${font}" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${BG};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${title}&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background-color:${BG};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 0 20px 0;border-bottom:3px solid ${ORANGE};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:12px;"><img src="${escapeHtml(base)}/static/email-logo.png" width="48" height="48" alt="SpotSeek" style="display:block;border:0;outline:none;"></td>
<td valign="middle" style="font-family:${HEAD_FONT};font-size:28px;line-height:32px;letter-spacing:2px;color:#ffffff;text-transform:uppercase;">SPOT <span style="color:${CYAN};">SEEK</span></td>
</tr></table>
</td></tr>
<tr><td bgcolor="${CARD}" style="background-color:${CARD};padding:32px 28px;border-left:1px solid #2a2a33;border-right:1px solid #2a2a33;border-bottom:1px solid #2a2a33;">
<div style="font-family:${HEAD_FONT};font-size:36px;line-height:40px;letter-spacing:1px;color:${CYAN};text-transform:uppercase;margin:0 0 10px 0;">${headline}</div>
<div style="font-family:${BODY_FONT};font-size:20px;line-height:26px;font-weight:bold;color:#ffffff;margin:0 0 20px 0;">${title}</div>
${paragraphs}
${cta}
</td></tr>
<tr><td style="padding:20px 8px 0 8px;font-family:${BODY_FONT};font-size:13px;line-height:19px;color:#8a8a96;">
You're getting this because you have a SpotSeek account and this activity involves you.<br>
You can manage email notifications in Settings in the SpotSeek app.
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

/** Plain-text fallback, with the event link appended when present. */
export function renderEmailText(c: EmailContent): string {
  return c.eventId ? `${c.body}\n\nView event: ${eventUrl(c.eventId, c.baseUrl)}` : c.body;
}
