/**
 * Pre-publish blocklist: a deliberately SMALL curated list of unambiguous
 * slurs and hate phrases. Ordinary profanity is not on it, and neither are
 * words with an innocent everyday meaning (e.g. "chink", "coon"). Matching is
 * whole-word and case-insensitive, with obfuscation normalisation:
 *   - accents / zero-width characters stripped
 *   - leetspeak (1 3 4 5 7 0 @ $ !) mapped back to letters
 *   - repeated characters ("niiiigger"): each letter of a term matches one or more
 *     times, so "niger" (the country) does NOT match the n-word
 *   - separators: "n.i.g.g.e.r", "n i g g e r", "nig-ger"
 *
 * The blocklist fails CLOSED: it is pure code, so a hit always rejects.
 */

// Single-word terms (lowercase letters only). Kept short on purpose.
const WORDS = [
  'nigger', 'nigga', 'faggot', 'kike', 'spic', 'gook', 'wetback', 'towelhead', 'tranny', 'beaner',
];

// Multi-word hate phrases, as regex sources over space-joined normalised words.
const PHRASES = [
  'white +power',
  'heil +hitler',
  'sieg +heil',
  'gas +the +jews',
  'race +war',
  'kill +all +(jews|blacks|muslims|gays|whites|arabs|immigrants)',
  'death +to +(all +)?(jews|blacks|muslims|gays|arabs)',
];

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'i',
};

// Each letter matches one or more times: "nigger" needs n, i, 2+ g, e, r. Done by
// comparing run-length encodings so matching is linear (the equivalent regex
// ^n+i+g+g+e+r+$ backtracks quadratically on long runs of a repeated letter).
type Runs = { ch: string; n: number }[];

function runLengths(w: string): Runs {
  const runs: Runs = [];
  for (const ch of w) {
    const last = runs[runs.length - 1];
    if (last && last.ch === ch) last.n++;
    else runs.push({ ch, n: 1 });
  }
  return runs;
}

const WORD_RUNS = WORDS.map(runLengths);

function matchesWord(s: string, term: Runs): boolean {
  const r = runLengths(s);
  return r.length === term.length && r.every((x, i) => x.ch === term[i].ch && x.n >= term[i].n);
}

function findWord(s: string): number {
  return WORD_RUNS.findIndex((t) => matchesWord(s, t));
}

const PHRASE_RES = PHRASES.map((p) => new RegExp(`(^| )${p}( |$)`));

/** Lowercase, strip accents/zero-width, map leetspeak. Result contains a-z and separators. */
export function normalizeForModeration(text: string): string {
  const base = text
    .normalize('NFKD')
    .replace(/[̀-ͯ​-‏⁠﻿]/g, '')
    .toLowerCase();
  let out = '';
  for (const ch of base) out += LEET[ch] ?? ch;
  return out;
}

function words(s: string): string[] {
  return s.split(/[^a-z]+/).filter(Boolean);
}

function hitWord(ws: string[]): string | null {
  for (const w of ws) {
    const i = findWord(w);
    if (i !== -1) return WORDS[i];
  }
  // Runs of 4+ single letters ("n i g g e r") are joined and tested as one word.
  let run = '';
  const flush = (): string | null => {
    if (run.length >= 4) {
      const i = findWord(run);
      if (i !== -1) return WORDS[i];
    }
    run = '';
    return null;
  };
  for (const w of ws) {
    if (w.length === 1) run += w;
    else {
      const h = flush();
      if (h) return h;
    }
  }
  return flush();
}

/**
 * Returns the matched term (for the internal moderation log only, never shown
 * to the user) or null when the text is clean.
 */
export function matchBlocklist(text: string): string | null {
  if (!text) return null;
  const norm = normalizeForModeration(text);

  // Pass 1: words as written.
  const w1 = words(norm);
  const h1 = hitWord(w1);
  if (h1) return h1;

  // Pass 2: punctuation joiners inside a word removed ("nig-ger", "n.i.g.g.e.r").
  const joined = norm.replace(/(?<=[a-z])[-_.*+~·'](?=[a-z])/g, '');
  if (joined !== norm) {
    const h2 = hitWord(words(joined));
    if (h2) return h2;
  }

  // Phrases (on pass-1 and pass-2 word streams).
  for (const stream of [w1.join(' '), words(joined).join(' ')]) {
    for (let i = 0; i < PHRASE_RES.length; i++) {
      if (PHRASE_RES[i].test(stream)) return PHRASES[i];
    }
  }
  return null;
}

/** Screens several fields at once; returns the first hit. */
export function matchBlocklistFields(fields: (string | null | undefined)[]): string | null {
  for (const f of fields) {
    if (!f) continue;
    const hit = matchBlocklist(f);
    if (hit) return hit;
  }
  return null;
}

// ─── Soft rules: held for admin review, never a hard reject ─────────────────────
//
// The hard list above rejects unambiguous slurs. These rules catch "group versus
// group" violence framing ("Jews vs Muslims : public brawl", "Religion War") that
// has no slur in it. Precision is uncertain (the Utah/BYU rivalry really is called
// "Holy War"), so a hit only FLAGS: the event publishes and enters the admin queue.
// The classifier can still reject it outright.

// Plural / demonym identity terms only. Singular colour words ("black", "white") and
// ambiguous names ("indians", "celtics") are left out on purpose: too many innocent
// uses. Country names ("france", "brazil") are never identity terms.
const GROUPS = new Set([
  'jews', 'jewish', 'muslims', 'muslim', 'christians', 'christian', 'catholics', 'protestants',
  'hindus', 'sikhs', 'buddhists', 'atheists', 'mormons',
  'blacks', 'whites', 'asians', 'arabs', 'latinos', 'hispanics', 'gypsies', 'roma',
  'israelis', 'palestinians',
]);

const VERSUS = new Set(['vs', 'versus', 'v', 'against']);

const VIOLENCE = new Set([
  'brawl', 'war', 'wars', 'warfare', 'fight', 'fights', 'fighting', 'battle', 'battles', 'riot',
  'rumble', 'clash', 'kill', 'killing', 'murder', 'massacre', 'slaughter', 'attack', 'lynch',
  'genocide', 'bloodbath',
]);

// Topic-style phrases that frame a group conflict on their own.
const WAR_PHRASES = [
  /(^| )religio(n|ns|us) +wars?( |$)/,
  /(^| )holy +wars?( |$)/,
  /(^| )ethnic +(wars?|cleansing)( |$)/,
];

const VS_WINDOW = 3;

/**
 * Returns a rule name ("religion_war" | "group_vs_group_violence") or null.
 * group_vs_group_violence needs identity terms on BOTH sides of a vs/versus/
 * against (within 3 words) plus a violence word anywhere in the same text.
 */
export function matchFlagRules(fields: (string | null | undefined)[]): string | null {
  const text = fields.filter(Boolean).join('\n');
  if (!text) return null;
  // Two readings: leetspeak as written ("J3ws"), and with !|$@ as punctuation
  // rather than letters, because "Brawl!" must not become "brawli".
  return flagRulesOn(text) ?? flagRulesOn(text.replace(/[!|$@]/g, ' '));
}

function flagRulesOn(text: string): string | null {
  const ws = words(normalizeForModeration(text));
  const stream = ws.join(' ');
  for (const re of WAR_PHRASES) if (re.test(stream)) return 'religion_war';

  if (!ws.some((w) => VIOLENCE.has(w))) return null;
  for (let i = 0; i < ws.length; i++) {
    if (!VERSUS.has(ws[i])) continue;
    const before = ws.slice(Math.max(0, i - VS_WINDOW), i).some((w) => GROUPS.has(w));
    const after = ws.slice(i + 1, i + 1 + VS_WINDOW).some((w) => GROUPS.has(w));
    if (before && after) return 'group_vs_group_violence';
  }
  return null;
}
