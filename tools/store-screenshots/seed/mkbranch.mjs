import { readFileSync, writeFileSync } from 'node:fs';
const P='muddy-hall-40509626', PARENT='br-dark-term-att297p4', API='https://console.neon.tech/api/v2';
const v={}; for (const l of readFileSync('/Users/mikejerugim/spot-seek/backend/.dev.vars','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) v[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
const key=v.NEON_API_KEY;
const f=async(m,p,b)=>{const r=await fetch(API+p,{method:m,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const t=await r.text(); if(!r.ok) throw new Error(m+' '+p+' '+r.status+' '+t.slice(0,200)); return t?JSON.parse(t):{};};
const mode=process.argv[2];
if(mode==='create'){
  const name='duo-screens-'+Date.now();
  const c=await f('POST',`/projects/${P}/branches`,{branch:{parent_id:PARENT,name},endpoints:[{type:'read_write',autoscaling_limit_min_cu:0.25,autoscaling_limit_max_cu:1,suspend_timeout_seconds:0}]});
  for(const op of c.operations??[]) for(let i=0;i<60;i++){const {operation}=await f('GET',`/projects/${P}/operations/${op.id}`); if(operation.status==='finished')break; await new Promise(r=>setTimeout(r,1000));}
  const host=c.endpoints[0].host; const pooled=host.replace(/^([^.]+)\./,'$1-pooler.');
  const bu=(t,h)=>{const u=new URL(t);u.host=h;return u.toString();};
  writeFileSync(process.argv[3],JSON.stringify({id:c.branch.id,name,pooled:bu(v.DATABASE_URL,pooled),unpooled:bu(v.DATABASE_URL_UNPOOLED??v.DATABASE_URL,host)}),{mode:0o600});
  console.log('created',name,c.branch.id);
} else if(mode==='delete'){
  const b=JSON.parse(readFileSync(process.argv[3],'utf8'));
  await f('DELETE',`/projects/${P}/branches/${b.id}`); console.log('delete requested',b.id);
  const l=await f('GET',`/projects/${P}/branches`); console.log('still listed:',l.branches.some(x=>x.id===b.id));
}
