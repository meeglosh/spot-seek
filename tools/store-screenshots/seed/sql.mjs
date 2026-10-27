import { neon } from '/Users/mikejerugim/spot-seek/node_modules/@neondatabase/serverless/index.mjs';
import { branch } from './guard.mjs';
const q = neon(branch.unpooled);
console.log(JSON.stringify(await q.query(process.argv[2])).slice(0, +process.argv[3] || 3000));
