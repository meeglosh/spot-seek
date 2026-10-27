const http=require('http'),fs=require('fs');
http.createServer((q,r)=>{r.setHeader('Cache-Control','no-store');try{r.end(fs.readFileSync('/private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/seed/ctl.json'))}catch(e){r.end('{}')}}).listen(8798);
