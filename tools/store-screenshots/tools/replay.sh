set -e
mkdir -p /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer
# ---- L118
C=/private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; cd $C; rm -rf ../pv; mkdir -p fonts out; cp /Users/mikejerugim/spot-seek/node_modules/@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf fonts/; cp /Users/mikejerugim/spot-seek/node_modules/@expo-google-fonts/space-grotesk/{700Bold,500Medium,600SemiBold}/*.ttf fonts/; true; ls fonts photos
cat > CREDITS.md <<'E'
# Photo credits (Unsplash License, free for commercial use)
- photos/group-couch.jpg: "Group of people on a couch in a living room", Vitaly Gariev, https://unsplash.com/photos/HHsq_3FF2W4
- photos/women-popcorn.jpg: "Two smiling young women watching television with popcorn", Vitaly Gariev, https://unsplash.com/photos/gg7VozgvWqk
Chosen because no visible brand logos, team marks or jerseys.
Fonts: Anton and Space Grotesk (SIL OFL), copied from @expo-google-fonts in the app repo.
E
cat > config.js <<'E'
// Image slots. Each slot is a list of candidates tried in order (first that loads wins).
// Swap the first entry per slot with the real captures once store/raw/ is populated.
const P3 = "../../shots/stage3/", P4 = "../../shots/stage4/";
window.SHOTS = {
  iphone: {
    discover: ["../raw/iphone/discover.png", P3 + "01-discover-search-empty.png"],
    detail:   ["../raw/iphone/detail.png",   P3 + "07-detail-guest-noimage.png"],
    host:     ["../raw/iphone/host.png",     P3 + "05-dashboard.png"],
    chat:     ["../raw/iphone/chat.png",     P3 + "07-detail-guest-noimage.png"],
    notifs:   ["../raw/iphone/notifications.png", P3 + "04-notifications.png"],
  },
  ipad: {
    discover: ["../raw/ipad/discover.png", P3 + "01-discover-search-empty.png"],
    detail:   ["../raw/ipad/detail.png",   P3 + "07-detail-guest-noimage.png"],
    host:     ["../raw/ipad/host.png",     P3 + "05-dashboard.png"],
    chat:     ["../raw/ipad/chat.png",     P3 + "07-detail-guest-noimage.png"],
    notifs:   ["../raw/ipad/notifications.png", P3 + "04-notifications.png"],
  },
};
window.PHOTOS = { crowd: "photos/group-couch.jpg", smile: "photos/women-popcorn.jpg" };
E
cp /Users/mikejerugim/spot-seek/app/assets/icon.png icon.png; sips -g pixelWidth icon.png
# ---- L124
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; cat > slides.html <<'E'
<!doctype html><html><head><meta charset="utf-8"><title>SpotSeek slides</title>
<style>
@font-face{font-family:Anton;src:url(fonts/Anton_400Regular.ttf)}
@font-face{font-family:SG;font-weight:500;src:url(fonts/SpaceGrotesk_500Medium.ttf)}
@font-face{font-family:SG;font-weight:600;src:url(fonts/SpaceGrotesk_600SemiBold.ttf)}
@font-face{font-family:SG;font-weight:700;src:url(fonts/SpaceGrotesk_700Bold.ttf)}
:root{--ink:#0f0f12;--l1:#1c1c1c;--l2:#242424;--l3:#2c2c2c;--paper:#f2f1ec;--cyan:#00e5ff;--orange:#ff5e07;--lime:#b4e100;--white:#fff}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--ink);overflow:hidden}
.slide{position:relative;overflow:hidden;background:var(--bg,var(--ink));color:var(--fg,#fff)}
.abs{position:absolute}
.h{position:absolute;font-family:Anton;text-transform:uppercase;line-height:.93;letter-spacing:.005em;z-index:5}
.sub{position:absolute;font-family:SG;font-weight:700;text-transform:uppercase;letter-spacing:.16em;z-index:5}
.dev{position:absolute;width:1000px;transform-origin:0 0;background:#000;border:2px solid #34343a;box-shadow:0 0 0 10px #17171b}
.dev .screen{position:absolute;overflow:hidden;background:var(--ink)}
.dev .screen img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.dev .isl{position:absolute;left:50%;background:#000;border-radius:99px}
.phone{height:2121px;border-radius:150px}
.phone .screen{inset:22px;border-radius:128px}
.phone .isl{width:290px;height:84px;top:44px;margin-left:-145px}
.ipad{height:1313px;border-radius:76px}
.ipad .screen{inset:30px;border-radius:50px}
.ipad .isl{display:none}
.ov{position:absolute;z-index:8}
.pill{display:inline-flex;align-items:center;font-family:Anton;text-transform:uppercase;white-space:nowrap}
.sg{font-family:SG}
</style></head><body>
<div id="root"></div>
<script src="config.js"></script>
<script>
const q=new URLSearchParams(location.search);const S=+q.get('s')||1, D=q.get('d')||'iphone';
const T=D==='iphone'?{W:1320,H:2868,hs:262,ht:120,hx:80,sub:46,sc:1.0,dx:160,dy:800,photoH:1150,pad:80}
                    :{W:2064,H:2752,hs:330,ht:150,hx:130,sub:58,sc:1.5,dx:282,dy:800,photoH:1000,pad:130};
const sh=slot=>{const l=window.SHOTS[D][slot];window._l=window._l||{};window._l[slot]=l;
 return `<img src="${l[0]}" data-slot="${slot}" data-i="0" onerror="var l=window._l[this.dataset.slot],i=+this.dataset.i+1;if(l[i]){this.dataset.i=i;this.src=l[i]}">`};
const dev=(slot,o)=>`<div class="dev ${D==='iphone'?'phone':'ipad'}" style="left:${o.x??T.dx}px;top:${o.y??T.dy}px;transform:rotate(${o.rot||0}deg) scale(${o.sc??T.sc})"><div class="screen">${sh(slot)}</div><div class="isl"></div>${o.ov||''}</div>`;
const head=(lines,o={})=>`<div class="h" style="left:${T.hx}px;top:${o.top??T.ht}px;font-size:${o.fs??T.hs}px;color:${o.c||'inherit'}">${lines.join('<br>')}</div>`;
const sub=(t,top,o={})=>`<div class="sub" style="left:${T.hx}px;top:${top}px;font-size:${T.sub}px;color:${o.c||'var(--cyan)'}">${t}</div>`;
const pin=(c,s)=>`<svg width="${s}" height="${s*1.3}" viewBox="0 0 40 52"><path d="M20 2C10 2 2 10 2 20c0 13 18 30 18 30s18-17 18-30C38 10 30 2 20 2z" fill="${c}" stroke="#0f0f12" stroke-width="3"/><circle cx="20" cy="20" r="7" fill="#0f0f12"/></svg>`;
const av=(t,c,fg='#0f0f12')=>`<span style="display:inline-flex;width:112px;height:112px;border-radius:99px;background:${c};color:${fg};border:6px solid #0f0f12;align-items:center;justify-content:center;font:700 52px SG;margin-right:-22px">${t}</span>`;
const hostScale=D==='iphone'?1:1; 
const slides={
1:()=>`<div class="abs" style="left:0;top:0;width:${T.W}px;height:${T.photoH}px;background:#0f0f12 url(${PHOTOS.crowd}) 50% 35%/cover"></div>
 <div class="abs" style="left:0;top:0;width:${T.W}px;height:${T.photoH}px;background:rgba(15,15,18,.52)"></div>
 ${head(['NEVER WATCH','ALONE.'],{top:T.ht,fs:T.hs})}
 <div class="sub" style="left:${T.hx}px;top:${T.ht+T.hs*1.9}px;font-size:${T.sub}px;color:#fff;background:var(--cyan);color:#0f0f12;padding:20px 30px;letter-spacing:.12em;border-radius:99px">Find watch parties near you</div>
 ${dev('discover',{y:T.photoH-(D==='iphone'?60:0)+(D==='iphone'?0:-0)})}`,
2:()=>`${head(['FIND YOUR','CROWD.'])}${sub('Parties near you, tonight',T.ht+T.hs*1.9)}
 ${dev('detail',{ov:`
  <div class="ov pill" style="right:-120px;top:420px;background:var(--orange);color:#fff;font-size:190px;padding:14px 56px 8px 44px;border-radius:40px;transform:rotate(7deg);box-shadow:0 0 0 12px var(--ink)"><i style="width:60px;height:60px;border-radius:99px;background:#fff;margin-right:34px;display:inline-block"></i>LIVE</div>
  <div class="ov" style="left:-90px;top:160px;transform:rotate(-8deg)">${pin('#00e5ff',230)}</div>
  <div class="ov" style="right:-40px;top:1080px;transform:rotate(9deg)">${pin('#b4e100',190)}</div>
  <div class="ov pill" style="left:-110px;top:1020px;background:var(--cyan);color:#0f0f12;font-size:110px;padding:14px 50px 6px;border-radius:99px;transform:rotate(-5deg);box-shadow:0 0 0 10px var(--ink)">Near me</div>`})}`,
3:()=>`${head(['ONE TAP.'])}${sub('See who else is going before you leave the house',T.ht+T.hs*1.05)}
 ${dev('detail',{y:T.dy+(D==='iphone'?100:60),ov:`
  <div class="ov" style="left:${D==='iphone'?-110:-80}px;right:${D==='iphone'?-110:-80}px;top:${D==='iphone'?1000:560}px;background:var(--lime);color:#0f0f12;border-radius:90px;padding:80px 90px 74px;transform:rotate(-4deg);box-shadow:0 0 0 14px var(--ink)">
   <div style="display:flex;align-items:center"><span style="width:200px;height:200px;border-radius:99px;background:#0f0f12;display:inline-flex;align-items:center;justify-content:center"><svg width="110" height="110" viewBox="0 0 24 24" fill="none" stroke="#b4e100" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg></span>
   <span style="font:400 250px/0.9 Anton;margin-left:50px;text-transform:uppercase">You're in.</span></div>
   <div class="sg" style="font-weight:700;font-size:56px;margin-top:50px;letter-spacing:.04em">Big Game Night · The Corner Pub</div>
   <div style="margin-top:44px;display:flex;align-items:center;padding-left:22px">${av('M','#00e5ff')}${av('D','#fff')}${av('J','#ff5e07')}${av('+','#0f0f12','#b4e100').replace('border:6px solid #0f0f12','border:6px solid #b4e100')}<span class="sg" style="font-weight:700;font-size:48px;margin-left:50px">going with you</span></div>
  </div>`})}`,
4:()=>`${head(['HOST THE','PARTY.'],{})}${sub('Bar, couch or rooftop. Your call.',T.ht+T.hs*1.9,{c:'#0f0f12'})}
 ${dev('host',{ov:`
  <div class="ov pill" style="left:-120px;top:360px;background:#0f0f12;color:#fff;font-size:200px;padding:20px 70px 10px;border-radius:120px;transform:rotate(-5deg)">Bar</div>
  <div class="ov pill" style="right:-130px;top:760px;background:var(--lime);color:#0f0f12;font-size:200px;padding:20px 70px 10px;border-radius:120px;transform:rotate(4deg);box-shadow:0 0 0 12px #0f0f12">Living room</div>
  <div class="ov pill" style="left:-100px;top:1160px;background:#0f0f12;color:#fff;font-size:200px;padding:20px 70px 10px;border-radius:120px;transform:rotate(-3deg)">Rooftop</div>
  <div class="ov pill" style="right:-90px;top:1560px;background:#fff;color:#0f0f12;font-size:150px;padding:18px 60px 8px;border-radius:120px;transform:rotate(5deg);box-shadow:0 0 0 12px #0f0f12">Venue TBD</div>`})}`,
5:()=>`${head(['YOUR CREW.','ONE CHAT.'])}${sub('Plan it, hype it, show up together',T.ht+T.hs*1.9)}
 ${dev('chat',{ov:`
  <div class="ov sg" style="left:-130px;top:380px;max-width:760px;background:var(--l2);color:#fff;font-weight:600;font-size:76px;line-height:1.1;padding:50px 60px;border-radius:70px 70px 70px 14px;box-shadow:0 0 0 12px var(--ink);transform:rotate(-3deg)">Who's bringing snacks? 🍿</div>
  <div class="ov sg" style="right:-130px;top:800px;max-width:760px;background:var(--cyan);color:#0f0f12;font-weight:700;font-size:76px;line-height:1.1;padding:50px 60px;border-radius:70px 70px 14px 70px;box-shadow:0 0 0 12px var(--ink);transform:rotate(3deg)">Me! Saved you a seat.</div>
  <div class="ov sg" style="left:-110px;top:1240px;max-width:700px;background:var(--l2);color:#fff;font-weight:600;font-size:76px;line-height:1.1;padding:50px 60px;border-radius:70px 70px 70px 14px;box-shadow:0 0 0 12px var(--ink);transform:rotate(-2deg)">Doors open at 7!</div>
  <div class="ov sg" style="right:-100px;top:1640px;background:var(--lime);color:#0f0f12;font-weight:700;font-size:76px;padding:44px 66px;border-radius:70px 70px 14px 70px;box-shadow:0 0 0 12px var(--ink);transform:rotate(4deg)">I'm in. 🙌</div>`})}`,
6:()=>`${head(['NEVER MISS','THE MOMENT.'])}${sub('Reminders before the party starts',T.ht+T.hs*1.9,{c:'#0f0f12'})}
 ${dev('notifs',{ov:`
  ${[['Starting soon','Big Game Night at The Corner Pub kicks off in 30 min.',300,-130,-3],['You\'re in','Your host confirmed the party. See you there.',760,-90,2.5],['New message','Mia: saved you a seat!',1180,-120,-2]].map(n=>`<div class="ov sg" style="left:${n[3]}px;width:1060px;top:${n[2]}px;background:var(--paper);color:#0f0f12;border-radius:80px;padding:56px 64px;display:flex;gap:50px;align-items:center;transform:rotate(${n[4]}deg);box-shadow:0 0 0 12px var(--orange)"><img src="icon.png" style="width:150px;height:150px;border-radius:36px;flex:none"><div><div style="font-weight:700;font-size:44px;letter-spacing:.12em;text-transform:uppercase;color:#6a6a70">SpotSeek · now</div><div style="font-weight:700;font-size:68px;margin-top:6px">${n[0]}</div><div style="font-weight:500;font-size:56px;line-height:1.15;margin-top:6px;color:#2c2c2c">${n[1]}</div></div></div>`).join('')}`})}`,
7:()=>`<div class="abs" style="left:0;top:0;width:${T.W}px;height:${T.photoH}px;background:#0f0f12 url(${PHOTOS.smile}) 50% 30%/cover"></div>
 <div class="abs" style="left:0;top:${T.photoH-12}px;width:${T.W}px;height:24px;background:var(--lime)"></div>
 ${head(['FREE TO','JOIN.'],{top:T.photoH+(D==='iphone'?70:110),fs:T.hs*1.02})}
 <div class="abs" style="left:${T.hx}px;top:${T.photoH+T.hs*2.05+(D==='iphone'?120:170)}px;right:${T.hx}px;display:grid;gap:${D==='iphone'?34:44}px">
 ${['Host-confirmed parties','Real RSVPs','Report & block built in','Host anywhere: bar, couch or rooftop'].map((t,i)=>`<div class="sg" style="display:flex;align-items:center;gap:36px;font-weight:700;font-size:${T.sub*1.12}px"><span style="flex:none;width:${T.sub*1.7}px;height:${T.sub*1.7}px;border-radius:99px;background:${['#b4e100','#00e5ff','#ff5e07','#b4e100'][i]};display:inline-flex;align-items:center;justify-content:center"><svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="#0f0f12" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg></span>${t}</div>`).join('')}</div>
 <div class="abs" style="left:${T.hx}px;bottom:${D==='iphone'?90:80}px;display:flex;align-items:center;gap:36px"><img src="icon.png" style="width:${T.sub*2.6}px;height:${T.sub*2.6}px;border-radius:${T.sub*.6}px"><span style="font:400 ${T.sub*2.4}px Anton;letter-spacing:.02em">SPOT SEEK</span></div>`
};
const bgs={1:'var(--ink)',2:'var(--ink)',3:'var(--ink)',4:'var(--cyan)',5:'var(--ink)',6:'var(--orange)',7:'var(--ink)'};
const fgs={4:'#0f0f12',6:'#0f0f12'};
const el=document.createElement('div');el.className='slide';el.style.cssText=`width:${T.W}px;height:${T.H}px;--bg:${bgs[S]};--fg:${fgs[S]||'#fff'}`;
el.innerHTML=slides[S]();document.getElementById('root').appendChild(el);
document.fonts.ready.then(()=>document.body.dataset.ready=1);
</script></body></html>
E
cat > render.sh <<'E'
#!/bin/bash
# Rebuilds out/iphone/*.png (1320x2868), out/ipad/*.png (2064x2752), out/contact.png
set -e
cd "$(dirname "$0")"; D="$PWD"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p out/iphone out/ipad
shot(){ # dev n W H file
  "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=$3,$4 \
    --virtual-time-budget=4000 --allow-file-access-from-files --screenshot="$5" "file://$D/slides.html?d=$1&s=$2" >/dev/null 2>&1
  # flatten: PNG -> JPEG -> PNG guarantees no alpha channel
  sips -s format jpeg -s formatOptions 100 "$5" --out "$5.jpg" >/dev/null; sips -s format png "$5.jpg" --out "$5" >/dev/null; rm "$5.jpg"
}
names=(x never-watch-alone find-your-crowd one-tap host-the-party crew-chat never-miss free-to-join)
for n in 1 2 3 4 5 6 7; do
  shot iphone $n 1320 2868 "out/iphone/0$n-${names[$n]}.png"
  shot ipad $n 2064 2752 "out/ipad/0$n-${names[$n]}.png"
done
"$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=2400,760 --virtual-time-budget=3000 --allow-file-access-from-files --screenshot="out/contact.png" "file://$D/contact.html" >/dev/null 2>&1
for f in out/iphone/*.png out/ipad/*.png out/contact.png; do echo "$f $(sips -g pixelWidth -g pixelHeight -g hasAlpha "$f" | awk '/pixel|hasAlpha/{printf $2" "}')"; done
E
cat > contact.html <<'E'
<!doctype html><meta charset=utf-8><style>body{margin:0;background:#0f0f12;display:flex;gap:16px;padding:40px 20px;width:2400px;height:760px;box-sizing:border-box}img{width:315px;height:auto;border-radius:6px;display:block}</style>
<script>for(const f of ["01-never-watch-alone","02-find-your-crowd","03-one-tap","04-host-the-party","05-crew-chat","06-never-miss","07-free-to-join"])document.write(`<img src="out/iphone/${f}.png">`)</script>
E
chmod +x render.sh
# ---- L137
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
p='slides.html';s=open(p).read()
s=s.replace("hs:262,","hs:236,").replace("hs:330,","hs:300,")
s=s.replace("line-height:.93;","line-height:.93;white-space:nowrap;")
# sub top placed relative to headline via JS: replace explicit tops with 'auto' marker
s=s.replace("document.fonts.ready.then(","""const hh=el.querySelector('.h');if(hh){const maxW=T.W-2*T.hx;let f=parseFloat(hh.style.fontSize);while(hh.scrollWidth>maxW&&f>100){f-=4;hh.style.fontSize=f+'px'}
 const sb=el.querySelector('.sub');if(sb&&S!==1&&S!==7){sb.style.top=(hh.offsetTop+hh.offsetHeight+T.sub*.55)+'px'}}
document.fonts.ready.then(""")
s=s.replace("sub('See who else is going before you leave the house'","sub('See who\\'s going before you leave'")
s=s.replace("font:400 250px/0.9 Anton;margin-left:50px","font:400 215px/0.9 Anton;margin-left:44px;white-space:nowrap")
s=s.replace("width:200px;height:200px;border-radius:99px;background:#0f0f12","width:170px;height:170px;flex:none;border-radius:99px;background:#0f0f12")
open(p,'w').write(s)
E
grep -n "T.hs\*1.9\|T.hs\*1.05" slides.html | head -3; :
# ---- L146
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
p='slides.html';s=open(p).read()
s=s.replace("hs:236,","hs:310,").replace("hs:300,","hs:380,").replace("sc:1.0,dx:160,dy:800","sc:1.0,dx:160,dy:860").replace("sc:1.5,dx:282,dy:800","sc:1.5,dx:282,dy:1040")
s=s.replace("line-height:.93;","line-height:.95;")
s=s.replace("S!==1&&S!==7","S!==7")
s=s.replace("top:${T.ht+T.hs*1.9}px;font-size:${T.sub}px;color:#fff;background","top:0;font-size:${T.sub}px;color:#fff;background")
open(p,'w').write(s)
E
:
# ---- L155
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
p='slides.html';s=open(p).read()
a=s.index("const hh=el.querySelector('.h')");b=s.index("document.fonts.ready.then(")
blk=s[a:b]
s=s[:a]+"const fit=()=>{"+blk+"};\n"+"document.fonts.ready.then(()=>{fit();document.body.dataset.ready=1});</script></body></html>"
open(p,'w').write(s)
E
tail -c 300 slides.html; :
# ---- L164
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
p='slides.html';s=open(p).read()
s=s.replace("head(['ONE TAP.'])}${sub('See who\\'s going before you leave',T.ht+T.hs*1.05)}","head(['RSVP IN','ONE TAP.'])}${sub('See who\\'s going before you leave',0)}")
s=s.replace("y:T.dy+(D==='iphone'?100:60),ov","y:T.dy,ov")
s=s.replace("Big Game Night at The Corner Pub kicks off in 30 min.","Big Game Night starts in 30 min.")
s=s.replace("gap:${D==='iphone'?34:44}px","gap:${D==='iphone'?52:70}px").replace("font-size:${T.sub*1.12}px","font-size:${T.sub*1.3}px")
s=s.replace("width:${T.sub*1.7}px;height:${T.sub*1.7}px","width:${T.sub*1.9}px;height:${T.sub*1.9}px")
open(p,'w').write(s)
E
:
# ---- L177
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
p='slides.html';s=open(p).read()
s=s.replace("Host anywhere: bar, couch or rooftop","Host at a bar, couch or rooftop").replace("font-size:${T.sub*1.3}px","font-size:${T.sub*1.2}px")
i=s.index("${av('+'");j=s.index("<span class=\"sg\" style=\"font-weight:700;font-size:48px")
s=s[:i]+s[j:]
open(p,'w').write(s)
E
:
# ---- L196
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
p='slides.html';s=open(p).read()
s=s.replace("<div class=\"isl\"></div>${o.ov||''}</div>`;","<div class=\"isl\"></div>${D==='iphone'?(o.ov||''):`<div style=\"position:absolute;left:0;top:0;width:1428px;height:1px;transform:scale(.7);transform-origin:0 0\">${o.ov||''}</div>`}</div>`;")
s=s.replace("D==='iphone'?1000:560","1000")
open(p,'w').write(s)
E
:
cat > /tmp/ipad_contact.html <<'E'
E
cat > ipad-contact.html <<'E'
<!doctype html><meta charset=utf-8><style>body{margin:0;background:#0f0f12;display:flex;gap:14px;padding:30px;width:2400px;height:760px;box-sizing:border-box}img{width:300px;display:block}</style>
<script>for(const f of ["01-never-watch-alone","02-find-your-crowd","03-one-tap","04-host-the-party","05-crew-chat","06-never-miss","07-free-to-join"])document.write(`<img src="out/ipad/${f}.png">`)</script>
E
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=2400,760 --virtual-time-budget=3000 --allow-file-access-from-files --screenshot=/tmp/ipad-contact.png "file://$PWD/ipad-contact.html" >/dev/null 2>&1; mv /tmp/ipad-contact.png out/ipad-contact.png; rm -f /tmp/ipad_contact.html
# ---- L205
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
p='slides.html';s=open(p).read()
a=s.index(" ${head(['FREE TO','JOIN.']");b=s.index("${['Host-confirmed parties'")
new=""" <div class="abs" style="left:${T.hx}px;right:${T.hx}px;top:${T.photoH+(D==='iphone'?50:60)}px;bottom:${D==='iphone'?80:70}px;display:flex;flex-direction:column;justify-content:space-between">
 <div class="h" style="position:static;font-size:${D==='iphone'?T.hs*1.02:T.hs*0.9}px">${D==='iphone'?'FREE TO<br>JOIN.':'FREE TO JOIN.'}</div>
 <div style="display:grid;gap:${D==='iphone'?44:34}px">
 """
s=s[:a]+new+s[b:]
# close: list end then wordmark inside flex container
s=s.replace(""").join('')}</div>
 <div class="abs" style="left:${T.hx}px;bottom:${D==='iphone'?90:80}px;display:flex;align-items:center;gap:36px">""",""").join('')}</div>
 <div style="display:flex;align-items:center;gap:36px">""")
s=s.replace("""Anton;letter-spacing:.02em">SPOT SEEK</span></div>`""","""Anton;letter-spacing:.02em">SPOT SEEK</span></div></div>`""")
open(p,'w').write(s)
E
:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=2400,760 --virtual-time-budget=3000 --allow-file-access-from-files --screenshot=/tmp/ic.png "file://$PWD/ipad-contact.html" >/dev/null 2>&1; mv /tmp/ic.png out/ipad-contact.png
# ---- L249
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
import re
s=open('slides.html').read()
# island: real captures include it
s=s.replace(".dev .isl{position:absolute;",".dev .isl{display:none;position:absolute;")
# new slides
a=s.index("const slides={");b=s.index("const bgs=")
card=lambda t,b,tm,i:""
new=r'''const slides={
1:()=>`<div class="abs" style="left:0;top:0;width:${T.W}px;height:${T.photoH}px;background:#0f0f12 url(${PHOTOS.crowd}) 50% 35%/cover"></div>
 <div class="abs" style="left:0;top:0;width:${T.W}px;height:${T.photoH}px;background:rgba(15,15,18,.52)"></div>
 ${head(['NEVER WATCH','ALONE.'],{top:T.ht,fs:T.hs})}
 <div class="sub" style="left:${T.hx}px;top:0;font-size:${T.sub}px;background:var(--cyan);color:#0f0f12;padding:20px 30px;letter-spacing:.12em;border-radius:99px">Find watch parties near you</div>
 ${dev('discover',{y:T.photoH-(D==='iphone'?60:0)})}`,
2:()=>`${head(['FIND YOUR','CROWD.'])}${sub('Parties near you, tonight',0)}
 ${dev('map',{ov:`
  <div class="ov pill" style="right:-120px;top:300px;background:var(--orange);color:#0f0f12;font-size:170px;padding:14px 56px 8px 44px;border-radius:40px;transform:rotate(7deg);box-shadow:0 0 0 12px var(--ink)"><i style="width:56px;height:56px;border-radius:99px;background:#0f0f12;margin-right:30px;display:inline-block"></i>ON NOW</div>
  <div class="ov" style="left:-100px;top:560px;transform:rotate(-8deg)">${pin('#00e5ff',260)}</div>
  <div class="ov" style="right:-60px;top:1240px;transform:rotate(9deg)">${pin('#ff5e07',230)}</div>
  <div class="ov" style="left:80px;top:1500px;transform:rotate(-5deg)">${pin('#b4e100',190)}</div>`})}`,
3:()=>`${head(['RSVP IN','ONE TAP.'])}${sub('One tap. You\'re on the list.',0)}
 ${dev('rsvp',{ov:`
  <div class="ov" style="left:-110px;right:-110px;top:270px;background:var(--lime);color:#0f0f12;border-radius:90px;padding:70px 90px 64px;transform:rotate(-4deg);box-shadow:0 0 0 14px var(--ink)">
   <div style="display:flex;align-items:center"><span style="width:170px;height:170px;flex:none;border-radius:99px;background:#0f0f12;display:inline-flex;align-items:center;justify-content:center"><svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="#b4e100" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg></span>
   <span style="font:400 215px/0.9 Anton;margin-left:44px;white-space:nowrap;text-transform:uppercase">You're in.</span></div>
   <div class="sg" style="font-weight:700;font-size:62px;margin-top:44px;letter-spacing:.02em">Finals night rooftop</div>
   <div class="sg" style="font-weight:600;font-size:54px;margin-top:8px">Sun, Oct 18 at 6:30 PM PDT</div>
  </div>`})}`,
4:()=>`${head(['HOST THE','PARTY.'])}${sub('Bar, couch or rooftop. Your call.',0,{c:'#0f0f12'})}
 ${dev('host',{ov:`
  <div class="ov pill" style="left:-120px;top:290px;background:#0f0f12;color:#fff;font-size:190px;padding:20px 70px 10px;border-radius:120px;transform:rotate(-5deg)">Bar</div>
  <div class="ov pill" style="right:-130px;top:560px;background:var(--lime);color:#0f0f12;font-size:190px;padding:20px 70px 10px;border-radius:120px;transform:rotate(4deg);box-shadow:0 0 0 12px #0f0f12">Living room</div>
  <div class="ov pill" style="left:-100px;top:830px;background:#0f0f12;color:#fff;font-size:190px;padding:20px 70px 10px;border-radius:120px;transform:rotate(-3deg)">Rooftop</div>`})}`,
5:()=>`${head(['NEVER MISS','THE MOMENT.'])}${sub('Reminders before the party starts',0,{c:'#0f0f12'})}
 ${dev('notifs',{ov:`
  ${[['Happening now','Derby day at Golden Hour is on now. Grab your seat.','33m ago',325,-110,-3],['You\'re in','Your spot at Sunday kickoff + tacos is confirmed.','3h ago',745,-80,2.5],['New party near you','Finals night rooftop is happening nearby tonight.','5h ago',1165,-110,-2]].map(n=>`<div class="ov sg" style="left:${n[4]}px;width:1060px;top:${n[3]}px;background:var(--paper);color:#0f0f12;border-radius:70px;padding:56px 70px;transform:rotate(${n[5]}deg);box-shadow:0 0 0 12px #0f0f12"><div style="font-weight:700;font-size:76px">${n[0]}</div><div style="font-weight:500;font-size:58px;line-height:1.18;margin-top:12px;color:#2c2c2c">${n[1]}</div><div style="font-weight:600;font-size:46px;margin-top:16px;color:#6a6a70">${n[2]}</div></div>`).join('')}`})}`,
6:()=>`<div class="abs" style="left:0;top:0;width:${T.W}px;height:${T.photoH}px;background:#0f0f12 url(${PHOTOS.smile}) 50% 30%/cover"></div>
 <div class="abs" style="left:0;top:${T.photoH-12}px;width:${T.W}px;height:24px;background:var(--lime)"></div>
 <div class="abs" style="left:${T.hx}px;right:${T.hx}px;top:${T.photoH+(D==='iphone'?50:60)}px;bottom:${D==='iphone'?80:70}px;display:flex;flex-direction:column;justify-content:space-between">
 <div class="h" style="position:static;font-size:${D==='iphone'?T.hs*1.02:T.hs*0.9}px">${D==='iphone'?'FREE TO<br>JOIN.':'FREE TO JOIN.'}</div>
 <div style="display:grid;gap:${D==='iphone'?44:34}px">
 ${['Host-confirmed parties','Directions to the door','Report & block built in','Host at a bar, couch or rooftop'].map((t,i)=>`<div class="sg" style="display:flex;align-items:center;gap:36px;font-weight:700;font-size:${T.sub*1.2}px"><span style="flex:none;width:${T.sub*1.9}px;height:${T.sub*1.9}px;border-radius:99px;background:${['#b4e100','#00e5ff','#ff5e07','#b4e100'][i]};display:inline-flex;align-items:center;justify-content:center"><svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="#0f0f12" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg></span>${t}</div>`).join('')}</div>
 <div style="display:flex;align-items:center;gap:36px"><img src="icon.png" style="width:${T.sub*2.6}px;height:${T.sub*2.6}px;border-radius:${T.sub*.6}px"><span style="font:400 ${T.sub*2.4}px Anton;letter-spacing:.02em">SPOT SEEK</span></div></div>`
};
'''
s=s[:a]+new+s[b:]
s=s.replace("const bgs={1:'var(--ink)',2:'var(--ink)',3:'var(--ink)',4:'var(--cyan)',5:'var(--ink)',6:'var(--orange)',7:'var(--ink)'};","const bgs={1:'var(--ink)',2:'var(--ink)',3:'var(--ink)',4:'var(--cyan)',5:'var(--orange)',6:'var(--ink)'};")
s=s.replace("const fgs={4:'#0f0f12',6:'#0f0f12'};","const fgs={4:'#0f0f12',5:'#0f0f12'};").replace("S!==7","S!==6")
open('slides.html','w').write(s)
c=open('config.js').read()
c=re.sub(r"window.SHOTS = \{.*?\n\};\n","""window.SHOTS = {
  iphone: {
    discover: ["../raw/iphone/01_discover_live.png"],
    map:      ["../raw/iphone/07_map.png"],
    rsvp:     ["../raw/iphone/04_rsvp_confirmed.png"],
    host:     ["../raw/iphone/08_host_dashboard.png"],
    notifs:   ["../raw/iphone/06_notifications.png"],
  },
  ipad: {
    discover: ["../raw/ipad/01_discover_live.png"],
    map:      ["../raw/ipad/07_map.png"],
    rsvp:     ["../raw/ipad/04_rsvp_confirmed.png"],
    host:     ["../raw/ipad/08_host_dashboard.png"],
    notifs:   ["../raw/ipad/06_notifications.png"],
  },
};
""",c,flags=re.S)
c=c.replace('const P3 = "../../shots/stage3/", P4 = "../../shots/stage4/";\n','')
open('config.js','w').write(c)
r=open('render.sh').read()
r=r.replace("names=(x never-watch-alone find-your-crowd one-tap host-the-party crew-chat never-miss free-to-join)","names=(x never-watch-alone find-your-crowd one-tap host-the-party never-miss free-to-join)").replace("for n in 1 2 3 4 5 6 7; do","rm -f out/iphone/*.png out/ipad/*.png\nfor n in 1 2 3 4 5 6; do")
r=r.replace('--window-size=2400,760 --virtual-time-budget=3000 --allow-file-access-from-files --screenshot="out/contact.png" "file://$D/contact.html" >/dev/null 2>&1','--window-size=2400,760 --virtual-time-budget=3000 --allow-file-access-from-files --screenshot="out/contact.png" "file://$D/contact.html" >/dev/null 2>&1\n"$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=2400,760 --virtual-time-budget=3000 --allow-file-access-from-files --screenshot="out/ipad-contact.png" "file://$D/ipad-contact.html" >/dev/null 2>&1')
r=r.replace("out/contact.png; do","out/contact.png out/ipad-contact.png; do")
open('render.sh','w').write(r)
names='["01-never-watch-alone","02-find-your-crowd","03-one-tap","04-host-the-party","05-never-miss","06-free-to-join"]'
for f,d,w in (('contact.html','iphone',330),('ipad-contact.html','ipad',380)):
    open(f,'w').write(f'<!doctype html><meta charset=utf-8><style>body{{margin:0;background:#0f0f12;display:flex;gap:24px;padding:40px 40px;width:2400px;height:760px;box-sizing:border-box;align-items:flex-start}}img{{width:{w}px;height:auto;display:block;border-radius:6px}}</style>\n<script>for(const f of {names})document.write(`<img src="out/{d}/${{f}}.png">`)</script>\n')
E
cat >> CREDITS.md <<'E'

# Cover photos visible inside the real app captures (from store/raw/CREDITS.md; Unsplash License)
Derby day at Golden Hour: photo-1541532713592-79a0317b6b77, John Arano
Finals night rooftop: photo-1758272133693-d2124dbe00de, Vitaly Gariev
Sunday kickoff + tacos: photo-1683062332605-4e1209d75346, We The Creators
Fight night watch party: photo-1558151748-f2621b5e52f0, Hanson Lu
Awards night red carpet party: photo-1776982298320-888d9f0ee1cd, Franco Debartolo
Season finale on the big couch: photo-1758525862263-af89b090fb56, Vitaly Gariev (also used as the closer slide photo)
Election night results party: photo-1540910419892-4a36d2c3266c, Element5 Digital
Match day patio brunch: photo-1517457373958-b7bdd4587205, Samantha Gades
Late game at the speakeasy: photo-1485872299829-c673f5194813, Michael Discenza
Backyard game night: photo-1714978444538-9097293e5b20, Vitaly Gariev (also used as the slide 1 photo)
URL pattern: https://images.unsplash.com/photo-<id>. Photographer names come from search-page alt text; verify before publishing credit.
E
:
# ---- L264
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
s=open('slides.html').read()
s=s.replace("left:-100px;top:560px;transform:rotate(-8deg)\">${pin('#00e5ff',260)}","left:-90px;top:980px;transform:rotate(-8deg)\">${pin('#00e5ff',260)}")
s=s.replace("left:-120px;top:290px;background:#0f0f12;color:#fff;font-size:190px","right:-130px;top:355px;background:#0f0f12;color:#fff;font-size:160px")
s=s.replace("right:-130px;top:560px;background:var(--lime);color:#0f0f12;font-size:190px","left:-110px;top:640px;background:var(--lime);color:#0f0f12;font-size:160px")
s=s.replace("left:-100px;top:830px;background:#0f0f12;color:#fff;font-size:190px","right:-110px;top:850px;background:#0f0f12;color:#fff;font-size:160px")
open('slides.html','w').write(s)
E
:
# ---- L319
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
s=open('slides.html').read()
s=s.replace("html,body{background:var(--ink);overflow:hidden}","html,body{background:var(--ink);overflow:hidden;width:100%;height:100%}")
s=s.replace(".slide{position:relative;overflow:hidden;",".slide{position:relative;overflow:hidden;contain:paint;")
s=s.replace("'33m ago',325,","'33m ago',310,").replace("'3h ago',745,","'3h ago',755,").replace("'5h ago',1165,","'5h ago',1200,")
open('slides.html','w').write(s)
E
:
# ---- L344
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
s=open('slides.html').read()
old="${D==='iphone'?(o.ov||''):`<div style=\"position:absolute;left:0;top:0;width:1428px;height:1px;transform:scale(.7);transform-origin:0 0\">${o.ov||''}</div>`}"
assert old in s
new="${D==='iphone'?(o.ov||''):`<div style=\"position:absolute;left:0;top:0;width:${1000/(o.ovs||.7)}px;height:1px;transform:scale(${o.ovs||.7});transform-origin:0 0\">${o.ovi||o.ov||''}</div>`}"
s=s.replace(old,new)
# slide 2 lime pin
s=s.replace("left:80px;top:1500px;transform:rotate(-5deg)","left:80px;top:${D==='iphone'?1500:1130}px;transform:rotate(-5deg)")
# slide 5 tops
s=s.replace("33m ago',310,","33m ago',${D==='iphone'?310:190},").replace("3h ago',755,","3h ago',${D==='iphone'?755:585},").replace("5h ago',1200,","5h ago',${D==='iphone'?1200:980},")
s=s.replace("'33m ago',${","'33m ago',${") 
# slide 4 ipad overlays
s=s.replace("${dev('host',{ov:`","${dev('host',{ovs:.5,ovi:`\n  <div class=\"ov pill\" style=\"right:-20px;top:250px;background:#0f0f12;color:#fff;font-size:160px;padding:20px 70px 10px;border-radius:120px;transform:rotate(4deg)\">Bar</div>\n  <div class=\"ov pill\" style=\"right:-30px;top:540px;background:var(--lime);color:#0f0f12;font-size:160px;padding:20px 70px 10px;border-radius:120px;transform:rotate(-3deg);box-shadow:0 0 0 12px #0f0f12\">Living room</div>\n  <div class=\"ov pill\" style=\"right:-10px;top:830px;background:#0f0f12;color:#fff;font-size:160px;padding:20px 70px 10px;border-radius:120px;transform:rotate(3deg)\">Rooftop</div>`,ov:`")
open('slides.html','w').write(s)
E
grep -c "ovi" slides.html; grep -n "33m ago" slides.html | head -2
# ---- L350
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
s=open('slides.html').read()
for a in ["${D==='iphone'?310:190}","${D==='iphone'?755:585}","${D==='iphone'?1200:980}"]:
    s=s.replace(a,a[2:-1].join(["(",")"]))
open('slides.html','w').write(s)
E
:
# ---- L369
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; python3 - <<'E'
s=open('slides.html').read()
s=s.replace(":190),",":165),").replace(":585),",":600),").replace(":980),",":1035),")
s=s.replace("left:80px;top:${D==='iphone'?1500:1130}px","left:${D==='iphone'?80:420}px;top:${D==='iphone'?1500:1130}px")
s=s.replace("right:-20px;top:250px","right:-20px;top:215px").replace("right:-30px;top:540px","right:-30px;top:495px").replace("right:-10px;top:830px","right:-10px;top:775px")
open('slides.html','w').write(s)
E
:
# ---- L387
cd /private/tmp/claude-501/-Users-mikejerugim-spot-seek/8da5e4ac-01f9-4256-838b-1498d9f86cca/scratchpad/duo-store/composer; sed -i '' 's/width:380px/width:340px/' ipad-contact.html; :
