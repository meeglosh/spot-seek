# App Store privacy "nutrition label" (DRAFT)

Draft for the owner to enter in App Store Connect (App Privacy). Derived from
the code, not from the policy text. Re-check before each submission that adds a
data flow. Privacy policy URL to enter: `https://spotseek.app/privacy`.

**Tracking: No.** No advertising SDK, no data brokers, no cross-app/site
tracking, no analytics or crash SDK in the app (verified: no analytics,
Sentry, Firebase, Amplitude, Mixpanel or PostHog in `app/` or `backend/src/`).
Because there is no tracking, no App Tracking Transparency prompt is needed.

All purposes below are **App Functionality** unless noted. Nothing is used for
Third-Party Advertising, Developer's Advertising, or Analytics. Everything
collected is **linked to the user** (it hangs off the account) except where
marked.

| Apple category | Data type | Collected? | Linked | Purpose | Source in code |
|---|---|---|---|---|---|
| Contact Info | Email address | Yes | Linked | App Functionality (sign-in, notifications) | `users.email`, `auth_user` |
| Contact Info | Name | Yes | Linked | App Functionality | `users.display_name`; guest RSVP `guest_rsvps.name` |
| Contact Info | Physical address | Yes (venue addresses typed by hosts) | Linked | App Functionality | `events.venue_address` (hidden from others when private) |
| Location | Precise Location | Yes, only if the user grants it. Sent with Discover/map requests (not stored by them) | Not stored by those requests | App Functionality | `expo-location` in Discover, map |
| Location | Coarse Location | Yes. Notification location stored rounded to 2 decimals (about 1 km) | Linked | App Functionality (nearby alerts) | `users.last_lat/last_lng`, `PUT /api/notifications/prefs` |
| User Content | Photos or Videos | Yes (event cover images) | Linked | App Functionality | R2 via `POST /api/events/:id/cover` |
| User Content | Other User Content | Yes (event text, chat, reviews, RSVPs, interests, reports, notes) | Linked | App Functionality | `events`, `comments`, `reviews`, `event_reports`, `user_favourites` |
| Identifiers | User ID | Yes | Linked | App Functionality | `users.id` |
| Identifiers | Device ID | Yes (APNs push token; not an advertising id) | Linked | App Functionality | `push_tokens.token` |
| Purchases | Purchase History | Yes (sponsorship payments: amounts, status, Stripe ids) | Linked | App Functionality | `sponsorships.*` |
| Financial Info | Payment Info | Collected by Stripe, not by us. We hold only Stripe ids, no card or bank numbers | Linked (ids) | App Functionality | `stripe_account_id`, `payment_intent_id`, `transfer_id` |
| Usage Data | Product Interaction | Not collected | n/a | n/a | No analytics |
| Diagnostics | Crash or Performance Data | Not collected by the app. Cloudflare keeps server request logs | n/a | n/a | `observability.enabled` in `wrangler.jsonc` |
| Sensitive Info, Health, Browsing/Search History, Contacts, Surroundings, Body | Not collected | n/a | n/a | n/a | |

Notes for the owner:

- **Payment Info:** Apple says data collected and held entirely by a third party
  (Stripe's SDK/hosted flows) is still declared when the app or its SDK collects
  it. The Stripe React Native SDK collects card details in the app. Declare
  Payment Info (Financial Info) as collected, linked, App Functionality, to be
  safe. Confirm in Connect once live payments exist.
- **Location:** declare Precise Location as collected only if you consider the
  transient request coordinates "collected" (Apple counts data sent off-device
  and kept longer than needed to serve the request). The server does not log or
  store them from Discover, but declaring it is the conservative choice.
- **Search-term text** for address search is forwarded to Photon (komoot.io)
  through our server; it is not linked to the user by us.
- **Server logs:** Cloudflare may log IP addresses. Declare IP-derived Coarse
  Location / Device ID only if you decide logs count; sessions also store IP and
  user agent (`auth_session.ip_address`, `user_agent`) for sign-in security.
- **Third-party processors:** Cloudflare, Neon, Resend, Stripe, Apple (APNs),
  Photon. None use the data for their own advertising by our configuration.
