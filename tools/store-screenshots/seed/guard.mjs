// Shared guard: refuse unless target is the throwaway branch endpoint and NOT the live one.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
export const branch = JSON.parse(readFileSync(join(here, 'branch.json'), 'utf8'));
const liveVars = {};
for (const l of readFileSync('/Users/mikejerugim/spot-seek/backend/.dev.vars', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) liveVars[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); }
const hostOf = (u) => new URL(u).host.replace('-pooler', '');
const liveHosts = [liveVars.DATABASE_URL, liveVars.DATABASE_URL_UNPOOLED].filter(Boolean).map(hostOf);
export function assertSafe(url) {
  const h = hostOf(url);
  if (liveHosts.includes(h)) throw new Error('GUARD: target is the LIVE db host, refusing');
  if (h !== hostOf(branch.unpooled)) throw new Error('GUARD: target is not the throwaway branch endpoint');
  if (!/^br-/.test(branch.id) || branch.id === 'br-dark-term-att297p4') throw new Error('GUARD: bad branch id');
}
assertSafe(branch.unpooled); assertSafe(branch.pooled);
