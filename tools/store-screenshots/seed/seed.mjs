import { neon } from '/Users/mikejerugim/spot-seek/node_modules/@neondatabase/serverless/index.mjs';
import { branch } from './guard.mjs';
import fs from 'node:fs';
const q=neon(branch.unpooled);
const U=JSON.parse(fs.readFileSync('users.json','utf8'));
const byName=Object.fromEntries(Object.values(U).map(u=>[u.name,u.id]));
const all=Object.values(U).map(u=>u.id);
const E=[
 ['derby','Derby day at Golden Hour','Derby day','Maya Alvarez',-90,150,60,'Golden Hour Social','1425 N Vermont Ave, Los Angeles, CA 90027',34.0985,-118.2917,false,'Big screens, cold drinks and a whole room of people who care way too much about the last lap. Come hungry, grab a seat near the front, and bring a friend who needs convincing.',14],
 ['rooftop','Finals night rooftop','Finals night','Theo Brandt',270,510,40,'Skyline Terrace','700 S Flower St, Los Angeles, CA 90017',34.0480,-118.2580,false,'Projector on the roof, string lights, and the whole skyline behind it. We have blankets for when the sun goes down and a snack table that never quits.',9],
 ['tacos','Monday night kickoff + tacos','Kickoff','Priya Nair',150,390,30,'La Playita Cantina','3201 W Sunset Blvd, Los Angeles, CA 90026',34.0777,-118.2638,false,'Three kinds of tacos, a salsa bar, and the first game of the night on every screen. Casual, loud, friendly. Newcomers always welcome.',12],
 ['fight','Fight night watch party','Fight night','Maya Alvarez',1560,1800,50,'The Rusty Anchor','4501 Santa Monica Blvd, Los Angeles, CA 90029',34.0907,-118.2864,false,'Main card on the big screen with the sound up. Pick your winner on the board by the door and loser buys a round of nachos.',11],
 ['awards','Awards night red carpet party','Awards night','Dana Whitfield',2880,3180,24,'Silver Lake Loft','Silver Lake, Los Angeles, CA',34.0869,-118.2702,false,'Dress up, fill out a ballot, and judge the red carpet like it is your job. Sparkling drinks and a prize for the best prediction card.',10],
 ['finale','Season finale on the big couch','Season finale','Marcus Bell',1620,1770,12,'Echo Park Living Room','Echo Park, Los Angeles, CA',34.0782,-118.2606,true,'Cozy living room, giant couch, zero spoilers. Bring a blanket and a snack to share. We will do a group reaction round after the credits.',8],
 ['election','Election night results party','Election night','Lena Ortiz',4320,4680,45,'Civic Corner Cafe','1200 W 7th St, Los Angeles, CA 90017',34.0535,-118.2646,false,'Coffee, snacks, and a wall of live results for people who like to watch the numbers roll in together. Friendly, no shouting at the screen. Mostly.',9],
 ['brunch','Match day patio brunch','Match day','Theo Brandt',3000,3180,36,'Sunny Side Patio','2100 Sunset Blvd, Los Angeles, CA 90026',34.0770,-118.2600,false,'Brunch on the patio with the early match on the big screen. Bottomless coffee, bottomless good vibes.',7],
 ['speakeasy','Late game at the speakeasy','Late game','Priya Nair',3500,3700,28,'The Back Room','611 N La Brea Ave, Los Angeles, CA 90036',34.0830,-118.3440,false,'Hidden door, low lights, one big screen and a very good bartender. Late game, small crowd, big energy.',6],
 ['backyard','Backyard game night','Game night','Dana Whitfield',5760,6000,20,'Dana\'s Backyard','Los Feliz, Los Angeles, CA',34.1066,-118.2879,false,'Fire pit, folding chairs, and the game on a projector against the fence. Bring a dish to share.',8],
];
const ids={};
for(const [k,t,subj,host,s,e,cap,vn,va,lat,lng,priv,desc] of E){
  const r=await q.query(`insert into events (host_id,title,description,broadcast_subject,starts_at,ends_at,capacity,status,cover_image_url,venue_name,venue_address,venue_lat,venue_lng,venue_timezone,is_private_location,moderation_status) values ($1,$2,$3,$4,(now() + $5::int * interval '1 minute'),(now() + $6::int * interval '1 minute'),$7,'published',$8,$9,$10,$11,$12,'America/Los_Angeles',$13,'ok') returning id`,[byName[host],t,desc,subj,s,e,cap,`/api/images/events/seed-${k}/cover.jpg`,vn,va,lat,lng,priv]);
  ids[k]=r[0].id;
}
const casey=byName['Casey Morgan'];
const going={derby:['Casey Morgan'],tacos:['Casey Morgan'],awards:['Casey Morgan'],finale:['Casey Morgan']};
let seedi=3;
for(const [k,,,host,,,,,,,,,,n] of E){
  const pool=all.filter(id=>id!==byName[host]&&id!==casey);
  const pick=[...pool].sort((a,b)=>((a.charCodeAt(3)*seedi+a.charCodeAt(5))%17)-((b.charCodeAt(3)*seedi+b.charCodeAt(5))%17)).slice(0,n);
  seedi+=2;
  const rows=pick.map(id=>[id,'going']); if(going[k]) rows.push([casey,'going']);
  if(k==='election') rows.push([casey,'interested']);
  for(const [uid,st] of rows) await q.query('insert into rsvps (event_id,user_id,state) values ($1,$2,$3)',[ids[k],uid,st]);
}
fs.writeFileSync('events.json',JSON.stringify(ids,null,1));
console.log(ids);