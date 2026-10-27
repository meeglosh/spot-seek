import {execFileSync} from 'node:child_process';import fs from 'node:fs';
const ev=JSON.parse(fs.readFileSync('events.json','utf8'));
const H={derby:'maya.alvarez',fight:'maya.alvarez',rooftop:'theo.brandt',brunch:'theo.brandt',tacos:'priya.nair',speakeasy:'priya.nair',awards:'dana.whitfield',backyard:'dana.whitfield',finale:'marcus.bell',election:'lena.ortiz'};
const T={};const c=(...a)=>execFileSync('curl',a).toString();
for(const [k,h] of Object.entries(H)){const e=h+'@spotseek.test';
 if(!T[e]){T[e]=JSON.parse(c('-s','-X','POST','localhost:8787/api/auth/sign-in/email','-H','content-type: application/json','-d',JSON.stringify({email:e,password:'Throwaway-pass-1'}))).token; await new Promise(r=>setTimeout(r,7000));}
 console.log(k,c('-s','-o','/dev/null','-w','%{http_code}','-X','POST',`localhost:8787/api/events/${ev[k]}/cover`,'-H','Authorization: Bearer '+T[e],'-F',`image=@dl/${k}.jpg;type=image/jpeg`));}
