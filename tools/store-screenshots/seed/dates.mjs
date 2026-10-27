// Writes composer/dates.js from the seeded events (read-only query on the throwaway branch).
import { neon } from '/Users/mikejerugim/spot-seek/node_modules/@neondatabase/serverless/index.mjs';
import { branch } from './guard.mjs'; import fs from 'node:fs';
const q = neon(branch.unpooled);
const r = await q.query(`select title, starts_at from events where title in ('Finals night rooftop')`);
const d = new Date(r[0].starts_at);
const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).formatToParts(d);
const g = (t) => f.find((x) => x.type === t).value;
const str = `${g('weekday')}, ${g('month')} ${g('day')} at ${g('hour')}:${g('minute')} ${g('dayPeriod')} ${g('timeZoneName')}`;
fs.writeFileSync('../composer/dates.js', `window.DATES = { rooftop: ${JSON.stringify(str)}, tacosTitle: "Monday night kickoff + tacos" };\n`);
console.log(str);
