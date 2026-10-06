/**
 * Shared HTML shell for the public web pages (/e/:id, guest RSVP pages).
 * "High-Energy Action" look: dark, cyan/orange/volt, Anton caps, sharp corners,
 * 2px borders, hard offset shadow on the primary CTA. Mobile-first.
 * Everything interpolated into markup MUST go through escapeHtml().
 */
import { escapeHtml } from './email';

export { escapeHtml };

/** JSON for inline <script>: escapes `<` (and line separators) so it cannot close the tag. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(new RegExp('\\u2028', 'g'), '\\u2028')
    .replace(new RegExp('\\u2029', 'g'), '\\u2029');
}

const FONTS =
  'https://fonts.googleapis.com/css2?family=Anton&amp;family=Archivo+Narrow:wght@400;700&amp;family=Space+Grotesk:wght@500;700&amp;display=swap';

export const PAGE_CSS = `
:root { --bg:#0F0F12; --card:#1a1a20; --line:#2a2a33; --cyan:#00e5ff; --orange:#ff5e07; --volt:#b4e100; --muted:#9a9aa6; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:#fff; font-family:'Archivo Narrow',Arial,sans-serif; font-size:17px; line-height:1.45; }
.wrap { max-width:520px; margin:0 auto; padding:0 0 48px; }
.brand { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:3px solid var(--orange); font-family:Anton,Impact,'Arial Narrow Bold',sans-serif; font-size:24px; letter-spacing:2px; text-transform:uppercase; }
.brand span { color:var(--cyan); }
.cover { width:100%; max-height:300px; object-fit:cover; display:block; border-bottom:2px solid var(--line); }
.content { padding:20px 16px 0; }
h1 { font-family:Anton,Impact,'Arial Narrow Bold',sans-serif; font-weight:400; font-size:38px; line-height:1.05; letter-spacing:1px; text-transform:uppercase; margin:6px 0 12px; word-wrap:break-word; }
h2 { font-family:Anton,Impact,'Arial Narrow Bold',sans-serif; font-weight:400; font-size:26px; letter-spacing:1px; text-transform:uppercase; margin:0 0 8px; }
.label { font-family:'Space Grotesk',Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:var(--muted); }
.meta { margin:0 0 6px; color:#e6e6ea; }
.chips { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
.chip { border:2px solid var(--line); padding:4px 10px; font-family:'Space Grotesk',Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
.chip-hot { border-color:var(--orange); color:var(--orange); }
.chip-volt { border-color:var(--volt); color:var(--volt); }
.chip-cyan { border-color:var(--cyan); color:var(--cyan); }
.panel { background:var(--card); border:2px solid var(--line); padding:18px 16px; margin:20px 0; }
.panel-cyan { border-color:var(--cyan); }
label { display:block; margin:12px 0 4px; }
input[type=text], input[type=email] { width:100%; background:#0F0F12; color:#fff; border:2px solid var(--line); border-radius:0; padding:14px 12px; font:inherit; font-size:17px; }
input[type=text]:focus, input[type=email]:focus { outline:none; border-color:var(--cyan); }
.hp { position:absolute !important; left:-10000px; width:1px; height:1px; overflow:hidden; }
.btn { display:block; width:100%; text-align:center; background:var(--cyan); color:#0F0F12; border:0; border-radius:0; padding:16px 20px; margin-top:16px; font-family:Anton,Impact,'Arial Narrow Bold',sans-serif; font-size:22px; letter-spacing:1px; text-transform:uppercase; text-decoration:none; box-shadow:5px 5px 0 var(--orange); cursor:pointer; }
.btn:active { transform:translate(3px,3px); box-shadow:2px 2px 0 var(--orange); }
.btn-ghost { background:transparent; color:var(--cyan); border:2px solid var(--cyan); box-shadow:none; }
.btn-disabled { background:#2a2a33; color:var(--muted); box-shadow:none; cursor:default; }
.btn-small { display:inline-block; width:auto; font-size:16px; padding:10px 16px; margin-top:8px; }
.status-going { color:var(--volt); } .status-wait { color:var(--orange); } .status-off { color:var(--muted); }
.fine { font-size:13px; color:var(--muted); margin:10px 0 0; }
.big { font-family:Anton,Impact,'Arial Narrow Bold',sans-serif; font-size:44px; line-height:1; text-transform:uppercase; margin:0 0 8px; }
a { color:var(--cyan); }
.link-btn { background:none; border:0; padding:0; color:var(--muted); text-decoration:underline; font:inherit; font-size:14px; cursor:pointer; }
`;

export interface PageOpts {
  title: string;
  /** Extra <head> markup (already escaped / trusted). */
  head?: string;
  body: string;
  noindex?: boolean;
}

export function renderPage(o: PageOpts): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(o.title)}</title>${o.noindex ? '\n<meta name="robots" content="noindex, nofollow">' : ''}
<link href="${FONTS}" rel="stylesheet">${o.head ? `\n${o.head}` : ''}
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="brand">SPOT <span>SEEK</span></div>
${o.body}
</div>
</body>
</html>`;
}

/** App install CTAs. `appStoreUrl` null/undefined -> "Coming soon" (as before). */
export function installCtas(appStoreUrl: string | null | undefined, eventId: string): string {
  const store = appStoreUrl
    ? `<a class="btn" href="${escapeHtml(appStoreUrl)}">GET THE SPOTSEEK APP</a>`
    : '<span class="btn btn-disabled">APP STORE &mdash; COMING SOON</span>';
  return `<div class="panel panel-cyan">
  <div class="label">Get the full experience</div>
  <h2>FIND PARTIES. CHAT. RSVP IN ONE TAP.</h2>
  ${store}
  <a class="btn btn-ghost" href="spotseek://e/${escapeHtml(encodeURIComponent(eventId))}">ALREADY HAVE IT? OPEN IN APP</a>
</div>`;
}
