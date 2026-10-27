// READ-ONLY App Store Connect helper: GET only. Never prints key or token.
import crypto from 'node:crypto'; import fs from 'node:fs'; import os from 'node:os';
const KID='UD4K88XVTT', ISS='b24f8676-542c-4f39-93de-7f011745a5f0';
const key=fs.readFileSync(os.homedir()+`/.appstoreconnect/private_keys/AuthKey_${KID}.p8`);
const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const h=b({alg:'ES256',kid:KID,typ:'JWT'}), p=b({iss:ISS,iat:now,exp:now+1100,aud:'appstoreconnect-v1'});
const sig=crypto.sign('sha256',Buffer.from(h+'.'+p),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
const path=process.argv[2];
const r=await fetch(path.startsWith('http')?path:'https://api.appstoreconnect.apple.com'+path,{method:'GET',headers:{Authorization:`Bearer ${h}.${p}.${sig}`}});
console.log(r.status); console.log(await r.text());
