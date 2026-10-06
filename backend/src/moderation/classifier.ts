/**
 * Llama Guard 3 text classifier via the Workers AI binding (`AI`).
 *   model:  @cf/meta/llama-guard-3-8b
 *   input:  { messages: [{ role: 'user', content }], max_tokens }
 *   output: { response: { safe: boolean, categories?: string[] }, usage }
 *           (older/raw shape: a string "safe" or "unsafe\nS10,S1")
 *
 * Fails OPEN: a missing binding, timeout, error or unparseable answer returns
 * null (logged) and the caller treats the text as not flagged. The blocklist
 * (blocklist.ts) is the fail-closed layer.
 */

export const LLAMA_GUARD_MODEL = '@cf/meta/llama-guard-3-8b';
export const CLASSIFIER_TIMEOUT_MS = 4000;

/** Llama Guard 3 hazard categories that reject a publish outright (hate, violence, sexual harm to minors). */
export const REJECT_CATEGORIES = new Set([
  'S1', // violent crimes
  'S3', // sex-related crimes
  'S4', // child sexual exploitation
  'S9', // indiscriminate weapons
  'S10', // hate
]);

export type ClassifierResult = { safe: boolean; categories: string[] };

export type ClassifierFn = (env: Env, text: string) => Promise<ClassifierResult | null>;

// Test-only injection point (same pattern as __setEmailGuardTestHooks). Not
// reachable from any route input.
let override: ClassifierFn | null = null;
export function __setClassifierForTests(fn: ClassifierFn | null): void {
  override = fn;
}

/** Parses either response shape into { safe, categories } or null. */
export function parseGuardOutput(raw: unknown): ClassifierResult | null {
  if (raw && typeof raw === 'object' && 'response' in raw) return parseGuardOutput((raw as { response: unknown }).response);
  if (raw && typeof raw === 'object' && 'safe' in raw) {
    const o = raw as { safe: unknown; categories?: unknown };
    const categories = Array.isArray(o.categories) ? o.categories.map((c) => String(c).toUpperCase().trim()) : [];
    return { safe: o.safe === true, categories };
  }
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    if (t.startsWith('safe')) return { safe: true, categories: [] };
    if (t.startsWith('unsafe')) {
      return { safe: false, categories: [...raw.toUpperCase().matchAll(/S\d{1,2}/g)].map((m) => m[0]) };
    }
  }
  return null;
}

export async function classifyText(env: Env, text: string): Promise<ClassifierResult | null> {
  if (override) {
    try {
      return await override(env, text);
    } catch (err) {
      console.error('[moderation] classifier (injected) failed, failing open:', err);
      return null;
    }
  }
  const e = env as Env & { MODERATION_AI?: string };
  if (!env.AI || e.MODERATION_AI === 'off' || !text.trim()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = env.AI.run(LLAMA_GUARD_MODEL as never, {
      messages: [{ role: 'user', content: text.slice(0, 4000) }],
      max_tokens: 40,
    } as never) as Promise<unknown>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('classifier timeout')), CLASSIFIER_TIMEOUT_MS);
    });
    const parsed = parseGuardOutput(await Promise.race([run, timeout]));
    if (!parsed) console.error('[moderation] classifier returned an unparseable answer, failing open');
    return parsed;
  } catch (err) {
    console.error('[moderation] classifier unavailable, failing open:', err);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
