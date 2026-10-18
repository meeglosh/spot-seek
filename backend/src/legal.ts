/**
 * GET /privacy and GET /terms: DRAFT legal pages for the owner's review.
 * Same shell as /guidelines. Every statement in the privacy policy is traced
 * to code (see docs/app-store-privacy.md for the data-flow map). Owner
 * decisions are filled in; no bracketed placeholders remain (a test asserts it).
 * Plain, short copy. No em dashes. Never claims legal review (the draft banner
 * stays until counsel has reviewed).
 *
 * Retention sources (checked 2026-10-14):
 * - Cloudflare Workers Logs: 3 days on Workers Free, 7 days on Workers Paid.
 *   https://developers.cloudflare.com/workers/observability/logs/workers-logs/
 *   We say "up to 30 days" to stay conservative if the plan or defaults change.
 * - Neon point-in-time history window: default 6 hours (Free), 1 day (Launch,
 *   Scale); configurable up to 7 days (Launch) or 30 days (Scale).
 *   https://neon.com/docs/postgres/backup-restore/history-window
 *   We say deleted data can persist in backups "for up to 30 days".
 */
import { escapeHtml, renderPage } from './webpage';

/** Bump when either document changes. */
export const LEGAL_LAST_UPDATED = '2026-10-14';
export const LEGAL_COMPANY = 'GAPCO Limited Liability Company';
const CONTACT = 'hello@spotseek.app';

const LEGAL_CSS = `<style>
.banner { margin:16px 16px 0; padding:12px 14px; border:2px solid var(--orange); background:#2a1608; color:#ffd2b3; font-family:'Space Grotesk',Arial,sans-serif; font-size:14px; font-weight:700; }
.ph { background:#3a3a10; color:#f3ff9a; padding:0 4px; }
.legal h2 { font-size:22px; }
.legal p, .legal li { color:#e6e6ea; margin:0 0 8px; }
.legal ul { padding-left:20px; margin:0 0 8px; }
.legal table { width:100%; border-collapse:collapse; font-size:15px; margin:8px 0; }
.legal th, .legal td { border:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; }
.legal th { font-family:'Space Grotesk',Arial,sans-serif; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:var(--muted); }
.legal-foot { margin:28px 16px 0; padding-top:14px; border-top:2px solid var(--line); font-size:14px; color:var(--muted); }
.legal-foot a { margin-right:14px; }
</style>`;

/** Compact copy of the footer styles, for pages that do not load LEGAL_CSS. */
export const LEGAL_FOOT_CSS = `<style>.legal-foot{margin:28px 16px 0;padding-top:14px;border-top:2px solid var(--line);font-size:14px;color:var(--muted)}.legal-foot a{margin-right:14px}</style>`;

export function draftBanner(): string {
  return `<div class="banner" role="note">Draft, last updated ${LEGAL_LAST_UPDATED}. Not yet reviewed by counsel.</div>`;
}

/** Footer shared by /privacy, /terms and /guidelines: links between all three. */
export function legalFooter(baseUrl: string): string {
  const base = escapeHtml(baseUrl);
  return `<div class="legal-foot">
    <a href="${base}/terms">Terms</a><a href="${base}/privacy">Privacy</a><a href="${base}/guidelines">Community guidelines</a><a href="${base}/support">Support</a><a href="${base}/">Home</a>
    <p class="fine"><a href="mailto:${CONTACT}">${CONTACT}</a> · ${escapeHtml(LEGAL_COMPANY)}</p>
  </div>`;
}

function shell(opts: {
  baseUrl: string;
  title: string;
  description: string;
  label: string;
  heading: string;
  intro: string;
  sections: string;
}): string {
  const body = `${draftBanner()}
  <div class="content legal">
    <div class="label">${escapeHtml(opts.label)}</div>
    <h1>${escapeHtml(opts.heading)}</h1>
    <p class="meta">${escapeHtml(opts.intro)}</p>
    ${opts.sections}
  </div>
  ${legalFooter(opts.baseUrl)}`;
  return renderPage({
    title: opts.title,
    head: `<meta name="description" content="${escapeHtml(opts.description)}">\n${LEGAL_CSS}`,
    body,
  });
}

const panel = (h: string, inner: string): string => `<div class="panel"><h2>${h}</h2>${inner}</div>`;

export function renderPrivacyPage(opts: { baseUrl: string }): string {
  const base = escapeHtml(opts.baseUrl);
  const mail = `<a href="mailto:${CONTACT}">${CONTACT}</a>`;
  const sections = [
    panel('Who we are', `<p>SpotSeek is run by ${escapeHtml(LEGAL_COMPANY)} ("GAPCO", "we", "us"), 132 S Rodeo Dr, Beverly Hills, CA 90212, USA. We are the controller of the personal data described here. Contact: ${mail}.</p>
      <p>This policy covers the SpotSeek app and the spotseek.app website. Plain version: we collect what we need to run watch parties, we do not sell it, and you can ask us to delete it.</p>`),
    panel('What we collect', `<ul>
      <li><b>Account.</b> Your email, display name and a password. We never see your password in plain text; Better Auth, our sign-in library, stores a hash. Sign-in sessions also record the device type and IP address they were opened from.</li>
      <li><b>Profile and interests.</b> Your avatar if you have one, the teams and sports you pick as interests, and who you follow.</li>
      <li><b>Location, only if you allow it.</b> The app asks for your device location (while you use the app) to show parties near you. For Discover and the map, your coordinates are sent with the request to find nearby parties and are not saved by that request. The one place we store a location is notifications: if you turn on nearby alerts, we save your position rounded to about 1 km (two decimal places) with a timestamp, so we can tell you about parties inside your chosen radius. You can say no and still use SpotSeek.</li>
      <li><b>Events and RSVPs.</b> Parties you host (title, description, what is being watched, time, capacity, venue name and address, whether the location is private, cover photo), your RSVPs and waitlist spots, and chat messages on a party.</li>
      <li><b>Guest RSVPs.</b> If you RSVP on the web without an account we collect your name and email for that party. If you later sign up with the same email, the guest RSVP is linked to your account.</li>
      <li><b>Reviews.</b> Ratings and comments you leave about a host or venue.</li>
      <li><b>Reports and blocks.</b> Reports you file (reason and optional note) and the people you block. Moderation actions on parties are logged.</li>
      <li><b>Push tokens.</b> If you allow notifications, your device's Apple push token. We also keep your notification preferences (email on or off, push on or off, radius) and an in-app notification history.</li>
      <li><b>Sponsorships and payments.</b> Sponsor profile details (company, website, categories, budget range), bids and notes. Card and bank details are entered with Stripe and held by Stripe, not by us. We store only Stripe identifiers (a connected account id and a payouts-ready flag for hosts; PaymentIntent and transfer ids for sponsorships), the amounts, the status and timestamps.</li>
      <li><b>Images.</b> Party cover photos you upload are stored in Cloudflare R2.</li>
      <li><b>Server logs.</b> Our hosting records technical request logs (time, path, status, errors), and we use your IP address for rate limiting and abuse prevention.</li>
      <li><b>Crash and error reports.</b> If the app or our server hits a crash or an error, a report goes to Sentry: the error and where it happened in the code, the app version and build, device model and iOS version, and a short trail of recent screens and network calls with no query strings. It carries no email, name, IP address, cookies, passwords or request bodies. The only identifier attached is your internal account id, if you are signed in. We use it only to find and fix bugs.</li>
    </ul>`),
    panel('Who processes it for us', `<table><tr><th>Provider</th><th>What for</th></tr>
      <tr><td>Cloudflare</td><td>Hosting (Workers), image storage (R2), chat rooms (Durable Objects), request logs and rate limiting, and Workers AI, which screens party text for policy violations before it goes live.</td></tr>
      <tr><td>Neon</td><td>Our Postgres database.</td></tr>
      <tr><td>Resend</td><td>Sending email: password reset, RSVP confirmations, reminders and notifications.</td></tr>
      <tr><td>Stripe</td><td>Sponsorship payments, host payouts, and identity and bank checks for hosts who set up payouts.</td></tr>
      <tr><td>Sentry (Functional Software, Inc.)</td><td>Crash and error diagnostics for the app and our server. Reports carry no personal data beyond an internal account id (see "Crash and error reports" above), and Sentry does not use them for advertising.</td></tr>
      <tr><td>Apple</td><td>Push notifications through the Apple Push Notification service (APNs).</td></tr>
      <tr><td>Photon (komoot.io, OpenStreetMap data)</td><td>Address search. When you type a venue address, the text, and your approximate position if the app has it, goes through our server to Photon to get suggestions.</td></tr>
      <tr><td>Google Fonts</td><td>Our public web pages load fonts from Google, which receives your IP address when a page loads.</td></tr></table>
      <p class="fine">Some of these providers are outside your country, including in the United States. We rely on their standard contractual terms and safeguards for those transfers.</p>`),
    panel('What we do not do', `<ul>
      <li>We do not sell your data.</li>
      <li>We do not run advertising or cross-app tracking, and we do not share data with ad networks.</li>
      <li>There is no analytics SDK in the app. The only diagnostics SDK is Sentry, for crash and error reports without personal data. The website sets no cookies.</li>
    </ul>`),
    panel('Why we use it, and our legal basis', `<ul>
      <li><b>To run the service you asked for</b> (accounts, parties, RSVPs, chat, reviews, sponsorships, payments, password reset emails). Basis: performing our contract with you.</li>
      <li><b>To keep SpotSeek safe</b> (moderation, reports, blocks, rate limiting, fraud and abuse prevention, security logs). Basis: our legitimate interests, and legal obligations.</li>
      <li><b>To tell you what is happening</b> (reminders, nearby-party alerts, host and sponsor updates). Basis: your consent for push and location, which you can withdraw in your device settings or in the app; our contract with you for service messages.</li>
      <li><b>To keep payment and dispute records.</b> Basis: legal obligations and legitimate interests.</li>
    </ul>`),
    panel('Who can see what', `<p>Your display name, avatar, reviews and chat messages can be seen by other users. A party's exact address is hidden when the host marks the location private. Guest RSVP emails are never shown to other people.</p>`),
    panel('How long we keep it', `<ul>
      <li>Account data stays until you delete your account.</li>
      <li>Sign-in sessions expire on their own schedule, and password reset links expire quickly.</li>
      <li>Your saved notification location is overwritten when you update it and deleted with your account.</li>
      <li>Server logs are kept by Cloudflare for a short period, currently up to 30 days.</li>
      <li><b>When you delete your account</b> in the app, we delete your profile, sign-in records, RSVPs, reviews, follows, interests, notifications, preferences and chat messages, along with parties you hosted and their images. Two limits apply. We cannot delete while a sponsorship payment is in flight; you wait until it is released or refunded. And we keep records of payments that already happened: the party or sponsorship stays, but is re-assigned to an anonymous placeholder ("Deleted host" or "Deleted sponsor"), and your name, email, party description, cover photo and any private location are removed. Stripe keeps its own records of payouts and identity checks under its own policies. Guest RSVPs made with your email are deleted too.</li>
      <li>Backups and logs may keep deleted data for up to 30 days before they roll off.</li>
    </ul>`),
    panel('Your rights', `<p>Depending on where you live, you can ask to access, correct, delete or export your data, to object to or restrict some processing, and to withdraw consent. You can delete your account in the app. For anything else, email ${mail}. We respond to privacy requests within 30 days. If you are in the EU, UK or a similar region, you can also complain to your local data protection authority.</p>`),
    panel('Children', `<p>SpotSeek is for people aged 16 or older. We do not knowingly collect personal data from anyone under 16, and if we learn that we have, we delete it. If you think a child under 16 has an account, email ${mail} and we will remove it.</p>`),
    panel('California residents', `<p>This section applies to California residents under the CCPA/CPRA. In the last 12 months we collected these categories of personal information, all described above:</p>
      <ul>
        <li><b>Identifiers:</b> email, display name, account and device identifiers (push token), IP address.</li>
        <li><b>Customer records and commercial information:</b> your name and email, RSVPs, sponsorships and payment records (Stripe ids and amounts).</li>
        <li><b>Geolocation:</b> precise location if you allow it, and your notification location rounded to about 1 km.</li>
        <li><b>Internet and device activity:</b> sign-in session details (device type, IP address) and server request logs.</li>
        <li><b>User content and inferences:</b> photos, party text, chat, reviews, and the teams and sports you pick as interests.</li>
      </ul>
      <p>We do not sell personal information, and we do not share it for cross-context behavioural advertising. We use it only for the purposes in this policy, and we disclose it only to the processors listed above.</p>
      <p>You have the right to know what we collect and use, to delete it, to correct it, and to opt out of sale or sharing (which does not apply, because we do not sell or share). We will not discriminate against you for using these rights.</p>
      <p>To make a request, email ${mail} from the email address on your account, so we can verify it is you. We respond within 30 days.</p>`),
    panel('Visitors from the EU and UK', `<p>Our processors may be located in, or process data in, the United States and other countries outside the EU and UK. Where they do, each offers transfer safeguards in its data processing terms, such as the European Commission's Standard Contractual Clauses (SCCs) and the UK addendum. Email ${mail} if you want more detail.</p>`),
    panel('Changes', `<p>If we change this policy in a way that matters, we will update the date at the top and tell you in the app or by email.</p>`),
    panel('Contact', `<p>${escapeHtml(LEGAL_COMPANY)}, 132 S Rodeo Dr, Beverly Hills, CA 90212, USA. Email ${mail}. See also our <a href="${base}/terms">terms</a> and <a href="${base}/guidelines">community guidelines</a>.</p>`),
  ].join('\n');
  return shell({
    baseUrl: opts.baseUrl,
    title: 'Privacy policy · SpotSeek',
    description: 'What data SpotSeek collects, who processes it, how long we keep it, and your rights.',
    label: 'Privacy policy',
    heading: 'Your data, plainly',
    intro: 'What we collect, why, who helps us handle it, and how to get it deleted.',
    sections,
  });
}

export function renderTermsPage(opts: { baseUrl: string }): string {
  const base = escapeHtml(opts.baseUrl);
  const mail = `<a href="mailto:${CONTACT}">${CONTACT}</a>`;
  const sections = [
    panel('The deal', `<p>These terms are between you and ${escapeHtml(LEGAL_COMPANY)} ("GAPCO", "we", "us") for the SpotSeek app and website. By creating an account or using SpotSeek you agree to them, to our <a href="${base}/guidelines">community guidelines</a> and to our <a href="${base}/privacy">privacy policy</a>. If you do not agree, do not use SpotSeek.</p>`),
    panel('Who can use SpotSeek', `<p>You must be at least 16 years old, and old enough to form a binding contract where you live, or have a parent or guardian agree for you. Do not use SpotSeek if we have removed you before.</p>`),
    panel('Your account', `<ul>
      <li>You must be 16 or older to create an account. Give us true details and keep your password safe. You are responsible for what happens under your account.</li>
      <li>Tell us at ${mail} if you think someone else has got in.</li>
      <li>You can delete your account any time in the app. Some payment records are kept, as set out in the privacy policy.</li>
    </ul>`),
    panel('What you post', `<p>You keep ownership of what you post: party titles, descriptions, photos, chat, reviews. You give us a worldwide, non-exclusive, royalty-free licence to host, store, display, reproduce and share it as needed to run and promote SpotSeek (for example showing a party in Discover, on its public page and in share links). The licence ends when you delete the content or your account, except for copies we must keep for legal or payment reasons and ordinary backups.</p>
      <p>You promise you have the right to post it and that it does not break the law or anyone's rights.</p>`),
    panel('What is not allowed', `<ul>
      <li>Anything banned in the <a href="${base}/guidelines">community guidelines</a>: hate, harassment, threats, sexual content, violence, spam, scams and fake parties.</li>
      <li>Breaking the law, or helping someone else to.</li>
      <li>Impersonating people, or posting someone's private details without consent.</li>
      <li>Scraping, reverse engineering, overloading or attacking SpotSeek, or getting around rate limits, blocks or moderation.</li>
      <li>Collecting other users' data, or sending unsolicited promotion.</li>
    </ul>`),
    panel('Moderation and removal', `<p>New parties are screened automatically before they go live. Anyone can report a party. If a report looks serious, or several people report the same party, we may hide it straight away and then review it. You can block a host to stop seeing their parties. We may remove content, limit publishing or suspend accounts that break these terms or the guidelines. We tell hosts when their party is hidden or removed and why. To appeal, email ${mail}.</p>`),
    panel('Hosts run the party. We do not.', `<p>SpotSeek helps people find and organize watch parties. We are not the organizer, venue or host of any party and we do not check venues, hosts or attendees. Hosts are solely responsible for their parties: safety, licences and permissions for showing a broadcast, local law, age limits, alcohol, accessibility, capacity and what they promise in their listing. Attendees go at their own risk and should use common sense. Cancellations, changes and no-shows are between hosts and attendees.</p>`),
    panel('Sponsorships and payments', `<ul>
      <li>Sponsors can offer money for a party, and hosts can accept. Payments are processed by Stripe, and Stripe's terms apply to them. Hosts who want payouts must finish Stripe's onboarding, including identity and bank checks.</li>
      <li><b>Fee.</b> SpotSeek keeps a platform fee of 15% of each sponsorship. The host's share is the rest.</li>
      <li><b>When money moves.</b> When a host accepts a bid the sponsor pays the full amount, which we hold. After the party has ended and a 24 hour dispute window has passed, we send the host's share to the host's Stripe account.</li>
      <li><b>Refunds.</b> Before the party starts, a sponsor can withdraw a paid sponsorship and gets a full refund. After the start time, a sponsor can no longer withdraw. If the host cancels the party before the money is released, the sponsor is refunded in full. After the money is released there are no refunds through SpotSeek. Sponsorships that are not yet paid can be cancelled at any time.</li>
      <li>You are responsible for your own taxes. Stripe handles tax reporting for payouts where it is required.</li>
      <li>Payments are currently in test mode and not available to the public, and sponsorships may be unavailable during the beta.</li>
    </ul>`),
    panel('Our stuff', `<p>SpotSeek's name, logo, design and software belong to GAPCO. We give you a limited, personal, revocable licence to use the app. Feedback you send us can be used without obligation to you.</p>`),
    panel('Disclaimers', `<p>SpotSeek is provided "as is" and "as available". We do not promise it will be uninterrupted or error free, or that listings, times, venues or users are accurate or safe. We are not responsible for what users post or do. Nothing here limits rights you have by law that cannot be waived.</p>`),
    panel('Limit of liability', `<p>To the extent the law allows, GAPCO and its members, staff and suppliers are not liable for indirect, incidental, special or consequential losses, or lost profits or data, arising from your use of SpotSeek. Our total liability to you is limited to the greater of US$100 or the fees you paid to SpotSeek in the 12 months before the claim. You agree to cover claims arising from your content, your party or your breach of these terms, to the extent the law allows.</p>`),
    panel('Ending things', `<p>You can stop using SpotSeek and delete your account at any time. We can suspend or end your access if you break these terms or the guidelines, or if we have to by law, and we will tell you why where we can. Parts that by nature should outlast the account (records we must keep, payments owed, disclaimers, liability, governing law) do.</p>`),
    panel('Governing law', `<p>These terms are governed by the laws of the State of California, and disputes go to the state and federal courts located in Los Angeles County, California, except where your local consumer law says otherwise.</p>`),
    panel('Changes', `<p>We may update these terms. If a change matters we will update the date at the top and tell you in the app or by email. Using SpotSeek after a change means you accept it.</p>`),
    panel('Contact', `<p>${escapeHtml(LEGAL_COMPANY)}, 132 S Rodeo Dr, Beverly Hills, CA 90212, USA. Email ${mail}.</p>`),
  ].join('\n');
  return shell({
    baseUrl: opts.baseUrl,
    title: 'Terms of service · SpotSeek',
    description: 'The terms for using SpotSeek: accounts, content, hosts, sponsorships and payments, moderation.',
    label: 'Terms of service',
    heading: 'The ground rules',
    intro: 'Short version: be decent, hosts run their own parties, and sponsorship money follows the rules below.',
    sections,
  });
}
