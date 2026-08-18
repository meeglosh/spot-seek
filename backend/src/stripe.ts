/**
 * Minimal fetch-based Stripe REST client (no `stripe` SDK — Workers-friendly).
 * Test-mode only, per PAYMENTS.md / CLAUDE.md non-negotiables. There is no
 * live key anywhere in this repo; `realStripe()` is exercised in tests only
 * against `fetchMock`-intercepted requests (see test/payments.spec.ts).
 *
 * Interface-first: callers depend on `StripeClient`, not on this file's
 * internals, so a fake implementation can be swapped in for tests without
 * touching route code.
 */

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_API_VERSION = '2024-06-20';

export type StripeAccount = { id: string; payoutsEnabled: boolean };
export type StripePaymentIntent = { id: string; clientSecret: string };
export type StripeTransfer = { id: string };
export type StripeRefund = { id: string };
export type StripeEvent = { id?: string; type: string; data: { object: Record<string, unknown> } };

export type StripeClient = {
  createAccount(): Promise<{ id: string }>;
  createAccountLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<{ url: string }>;
  getAccount(accountId: string): Promise<StripeAccount>;
  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata: Record<string, string>;
  }): Promise<StripePaymentIntent>;
  createTransfer(params: {
    amountCents: number;
    currency: string;
    destination: string;
    metadata?: Record<string, string>;
  }): Promise<StripeTransfer>;
  createRefund(params: { paymentIntentId: string }): Promise<StripeRefund>;
  // Verifies the Stripe-Signature header and parses the payload. Returns null
  // on any verification failure (bad signature, stale timestamp, bad JSON).
  constructWebhookEvent(payload: string, signatureHeader: string, secret: string): Promise<StripeEvent | null>;
};

// ─── Form encoding (Stripe's API is application/x-www-form-urlencoded, with
// nested objects flattened using bracket notation, e.g. metadata[foo]=bar) ──

function encodeForm(params: Record<string, unknown>): string {
  const pairs: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      const paramKey = prefix ? `${prefix}[${key}]` : key;
      if (typeof value === 'object' && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, paramKey);
      } else {
        pairs.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(String(value))}`);
      }
    }
  };
  walk(params, '');
  return pairs.join('&');
}

async function stripeRequest(
  secretKey: string,
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Stripe-Version': STRIPE_API_VERSION,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? encodeForm(params ?? {}) : undefined,
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof body?.error === 'object' && body.error && 'message' in body.error
        ? String((body.error as { message?: unknown }).message)
        : JSON.stringify(body);
    throw new Error(`Stripe error ${res.status}: ${message}`);
  }
  return body;
}

// ─── Webhook signature verification (Stripe's v1 scheme) ─────────────────────
// HMAC-SHA256 of `${timestamp}.${payload}` with the webhook secret, compared
// (constant-time) against the `v1` signature(s) in the Stripe-Signature
// header. 5-minute tolerance on the timestamp. Pure Web Crypto — no SDK.

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bufferToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 5 * 60,
): Promise<StripeEvent | null> {
  const parts = signatureHeader.split(',').reduce<Record<string, string[]>>((acc, part) => {
    const [k, v] = part.split('=');
    if (!k || v === undefined) return acc;
    (acc[k] ??= []).push(v);
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const candidateSigs = parts.v1 ?? [];
  if (!timestamp || candidateSigs.length === 0) return null;

  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds)) return null;
  if (Math.abs(Date.now() / 1000 - tsSeconds) > toleranceSeconds) return null;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = bufferToHex(signatureBuf);

  const valid = candidateSigs.some((sig) => timingSafeEqualHex(sig, expected));
  if (!valid) return null;

  try {
    return JSON.parse(payload) as StripeEvent;
  } catch {
    return null;
  }
}

// ─── Real implementation ──────────────────────────────────────────────────────

export function realStripe(secretKey: string): StripeClient {
  return {
    async createAccount() {
      const acct = await stripeRequest(secretKey, 'POST', '/accounts', {
        type: 'express',
        capabilities: { transfers: { requested: 'true' } },
      });
      return { id: acct.id as string };
    },

    async createAccountLink(accountId, refreshUrl, returnUrl) {
      const link = await stripeRequest(secretKey, 'POST', '/account_links', {
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
      return { url: link.url as string };
    },

    async getAccount(accountId) {
      const acct = await stripeRequest(secretKey, 'GET', `/accounts/${accountId}`);
      return { id: acct.id as string, payoutsEnabled: !!acct.payouts_enabled };
    },

    async createPaymentIntent({ amountCents, currency, metadata }) {
      const pi = await stripeRequest(secretKey, 'POST', '/payment_intents', {
        amount: amountCents,
        currency,
        metadata,
      });
      return { id: pi.id as string, clientSecret: pi.client_secret as string };
    },

    async createTransfer({ amountCents, currency, destination, metadata }) {
      const tr = await stripeRequest(secretKey, 'POST', '/transfers', {
        amount: amountCents,
        currency,
        destination,
        metadata,
      });
      return { id: tr.id as string };
    },

    async createRefund({ paymentIntentId }) {
      const rf = await stripeRequest(secretKey, 'POST', '/refunds', { payment_intent: paymentIntentId });
      return { id: rf.id as string };
    },

    async constructWebhookEvent(payload, signatureHeader, secret) {
      return verifyStripeSignature(payload, signatureHeader, secret);
    },
  };
}
