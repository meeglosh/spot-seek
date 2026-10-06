import { describe, it, expect } from 'vitest';
import { HEADLINES, headlineFor } from '../src/email';

// Voice guard (see app/locales/VOICE.md): no em dashes, and no entirely
// uppercase copy in server-generated emails or notifications. Tags are caps
// via CSS, never via the string.

const EM_DASH = '—';
const isAllCaps = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();
// Drop ${...} interpolations and quoted event titles before checking caps.
const stripDynamic = (s: string) => s.replace(/\$\{[^}]*\}/g, '').replace(/"[^"]*"/g, '');

const sources = import.meta.glob('../src/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// Every `title:` / `body:` / `subject` / `text` literal that feeds notify() or a
// notification-shaped email, extracted from the source.
function copyLiterals(src: string): string[] {
  const out: string[] = [];
  const re = /\b(?:title|body|subject|text)\s*[:=]\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
  for (const m of src.matchAll(re)) out.push(m[1].slice(1, -1));
  return out;
}

describe('server voice', () => {
  it('email headlines are not uppercase and have no em dash', () => {
    for (const [type, h] of Object.entries(HEADLINES)) {
      expect(h, type).not.toContain(EM_DASH);
      expect(isAllCaps(h), `${type}: ${h}`).toBe(false);
    }
    expect(headlineFor()).not.toContain(EM_DASH);
    expect(isAllCaps(headlineFor())).toBe(false);
    expect(headlineFor('rsvp')).toBe('New RSVP');
  });

  it('no sport-only wording in headlines', () => {
    for (const h of Object.values(HEADLINES)) expect(h).not.toMatch(/game ?(day|time)/i);
  });

  it('notification and email copy literals have no em dash and are not all caps', () => {
    const files = ['notifications', 'events', 'rsvps', 'guests', 'waitlist', 'sponsors', 'payments', 'reminders', 'password-reset', 'webrsvp', 'deeplinks', 'account'];
    let checked = 0;
    for (const f of files) {
      const src = sources[`../src/${f}.ts`];
      expect(src, f).toBeTruthy();
      for (const lit of copyLiterals(src)) {
        expect(lit, `${f}: ${lit}`).not.toContain(EM_DASH);
        const t = stripDynamic(lit).trim();
        if (/[A-Za-z]{2}/.test(t)) expect(isAllCaps(t), `${f}: ${lit}`).toBe(false);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('no Command Center, game day/time or &mdash; copy anywhere in src', () => {
    for (const [file, src] of Object.entries(sources)) {
      const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      expect(code, file).not.toMatch(/Command Center|game ?day|game ?time/i);
      expect(code, file).not.toContain('&mdash;');
    }
  });
});
