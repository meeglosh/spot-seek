import { neon } from '/Users/mikejerugim/spot-seek/node_modules/@neondatabase/serverless/index.mjs';
import fs from 'node:fs'; import { branch } from './guard.mjs';
const q=neon(branch.unpooled);
const U=JSON.parse(fs.readFileSync('users.json','utf8'));const ev=JSON.parse(fs.readFileSync('events.json','utf8'));
const casey=U['casey.morgan@spotseek.test'].id, maya=U['maya.alvarez@spotseek.test'].id;
const N=[
 [casey,'reminder_1h','Happening now','Derby day at Golden Hour is on now. Grab your seat.',ev.derby,false,'33 minutes'],
 [casey,'rsvp','You\'re in','Your spot at Monday night kickoff + tacos is confirmed.',ev.tacos,false,'3 hours'],
 [casey,'favorite_nearby','New party near you','Finals night rooftop is happening nearby tonight.',ev.rooftop,false,'5 hours'],
 [casey,'reminder_24h','Tomorrow','Season finale on the big couch is tomorrow at 8:00 PM.',ev.finale,true,'20 hours'],
 [casey,'rsvp','You\'re in','Your spot at Awards night red carpet party is confirmed.',ev.awards,true,'1 day'],
 [casey,'venue_changed','Venue updated','Awards night red carpet party has a new address. Check the details.',ev.awards,true,'2 days'],
 [maya,'rsvp','New RSVP','Priya Nair is going to Derby day at Golden Hour.',ev.derby,false,'15 minutes'],
 [maya,'rsvp','New RSVP','Omar Haddad is going to Fight night watch party.',ev.fight,false,'2 hours'],
 [maya,'rsvp','New RSVP','Bea Calloway is going to Derby day at Golden Hour.',ev.derby,true,'6 hours'],
];
for(const [u,t,ti,bo,e,r,ago] of N) await q.query(`insert into notifications (user_id,type,title,body,event_id,read,created_at) values ($1,$2,$3,$4,$5,$6,now()-$7::interval)`,[u,t,ti,bo,e,r,ago]);
console.log('ok');
