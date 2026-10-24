/**
 * Per-type notification preferences. Five groups, each with a push and an email
 * switch, all default ON. Stored as one jsonb blob (notification_prefs.type_prefs);
 * a missing key means ON. Types outside every group are ungrouped: governed only
 * by the master switches (emailEnabled / pushEnabled). In-app rows are always
 * created regardless (the notification centre is the history).
 */

export const PREF_GROUPS = ['reminders', 'updates', 'hosting', 'nearby', 'reviews'] as const;
export type PrefGroup = (typeof PREF_GROUPS)[number];
export const PREF_CHANNELS = ['push', 'email'] as const;
export type PrefChannel = (typeof PREF_CHANNELS)[number];

export type TypePrefs = Record<PrefGroup, Record<PrefChannel, boolean>>;
export type PartialTypePrefs = { [G in PrefGroup]?: { [C in PrefChannel]?: boolean } };

/** Notification type -> group. Types absent here are ungrouped. */
export const TYPE_GROUP: Readonly<Record<string, PrefGroup>> = {
  reminder_24h: 'reminders',
  reminder_1h: 'reminders',
  event_cancelled: 'updates',
  venue_changed: 'updates',
  waitlist_promoted: 'updates',
  rsvp: 'hosting',
  favorite_nearby: 'nearby',
  review_request: 'reviews',
};

/** Fill every missing/invalid value with true. Never trusts the stored shape. */
export function resolveTypePrefs(stored: unknown): TypePrefs {
  const src = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const out = {} as TypePrefs;
  for (const g of PREF_GROUPS) {
    const grp = src[g] && typeof src[g] === 'object' ? (src[g] as Record<string, unknown>) : {};
    out[g] = { push: grp.push !== false, email: grp.email !== false };
  }
  return out;
}

/** Validate a PUT `types` payload. Returns the cleaned partial, or an error string. */
export function parseTypePrefsPatch(
  input: unknown,
): { ok: true; value: PartialTypePrefs } | { ok: false; error: string } {
  if (input === undefined) return { ok: true, value: {} };
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'types must be an object' };
  const value: PartialTypePrefs = {};
  for (const [g, grp] of Object.entries(input as Record<string, unknown>)) {
    if (!(PREF_GROUPS as readonly string[]).includes(g)) return { ok: false, error: `Unknown notification group: ${g}` };
    if (grp === null || typeof grp !== 'object' || Array.isArray(grp)) return { ok: false, error: `types.${g} must be an object` };
    const clean: { push?: boolean; email?: boolean } = {};
    for (const [k, v] of Object.entries(grp as Record<string, unknown>)) {
      if (!(PREF_CHANNELS as readonly string[]).includes(k)) return { ok: false, error: `Unknown key types.${g}.${k}` };
      if (typeof v !== 'boolean') return { ok: false, error: `types.${g}.${k} must be a boolean` };
      clean[k as PrefChannel] = v;
    }
    value[g as PrefGroup] = clean;
  }
  return { ok: true, value };
}

/** Deep-merge a validated patch over stored values; result is always complete. */
export function mergeTypePrefs(stored: unknown, patch: PartialTypePrefs): TypePrefs {
  const base = resolveTypePrefs(stored);
  for (const g of PREF_GROUPS) {
    const p = patch[g];
    if (!p) continue;
    if (typeof p.push === 'boolean') base[g].push = p.push;
    if (typeof p.email === 'boolean') base[g].email = p.email;
  }
  return base;
}

/** Does the per-type switch allow this channel? Ungrouped types always allow. */
export function typeAllows(stored: unknown, type: string, channel: PrefChannel): boolean {
  const group = TYPE_GROUP[type];
  if (!group) return true;
  return resolveTypePrefs(stored)[group][channel];
}
