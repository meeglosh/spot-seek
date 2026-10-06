// Key parity: every locale carries exactly the English key set per namespace.
/* eslint-disable @typescript-eslint/no-require-imports */
// Node built-ins via require: the app has no @types/node. Jest runs with the
// app directory as cwd, so `locales` resolves relative to it.
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.resolve('locales');
const LANGS = ['fr', 'es', 'de', 'pt'];

function keys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

// Plural suffixes legitimately differ per language (e.g. fr/pt add _many).
const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '');

const namespaces = fs.readdirSync(path.join(LOCALES_DIR, 'en')).filter((f: string) => f.endsWith('.json'));

describe('locale parity', () => {
  it.each(namespaces as string[])('%s has the same keys in every language', (file: string) => {
    const read = (l: string) => JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, l, file), 'utf8'));
    const en = new Set(keys(read('en')).map(base));
    for (const l of LANGS) {
      const other = new Set(keys(read(l)).map(base));
      expect([...en].filter((k) => !other.has(k))).toEqual([]);
      expect([...other].filter((k) => !en.has(k))).toEqual([]);
    }
  });
});
