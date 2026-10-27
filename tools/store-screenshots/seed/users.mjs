import fs from 'node:fs'; import {execFileSync} from 'node:child_process';
const names=["Maya Alvarez","Casey Morgan","Theo Brandt","Priya Nair","Dana Whitfield","Marcus Bell","Lena Ortiz","Sam Okafor","Jules Fontaine","Nico Reyes","Ari Goldman","Tessa Lindqvist","Omar Haddad","Bea Calloway","Kenji Mori","Rosa Delgado","Finn Gallagher"];
const out=fs.existsSync('users.json')?JSON.parse(fs.readFileSync('users.json','utf8')):{};
for(const n of names){const email=n.toLowerCase().replace(/[^a-z]+/g,'.')+'@spotseek.test'; if(out[email])continue;
 const j=JSON.parse(execFileSync('curl',['-s','-X','POST','localhost:8787/api/auth/sign-up/email','-H','content-type: application/json','-d',JSON.stringify({email,password:'Throwaway-pass-1',name:n})]).toString());
 if(!j.user){console.log('fail',email,JSON.stringify(j));break;} out[email]={name:n,id:j.user.id}; fs.writeFileSync('users.json',JSON.stringify(out,null,1)); await new Promise(r=>setTimeout(r,7000));}
console.log(Object.keys(out).length);
