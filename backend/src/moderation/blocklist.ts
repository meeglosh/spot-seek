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

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Each letter matches one or more times: "nigger" -> ^n+i+g+g+e+r+$ (needs 2 g's).
const WORD_RES = WORDS.map((w) => new RegExp(`^${[...w].map((ch) => `${esc(ch)}+`).join('')}$`));

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
    const i = WORD_RES.findIndex((re) => re.test(w));
    if (i !== -1) return WORDS[i];
  }
  // Runs of 4+ single letters ("n i g g e r") are joined and tested as one word.
  let run = '';
  const flush = (): string | null => {
    if (run.length >= 4) {
      const i = WORD_RES.findIndex((re) => re.test(run));
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
