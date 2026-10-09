// Landing page for GET / (spotseek.app). Approved static design; do not change copy here
// without owner sign-off. Images live in backend/public/site/ (Workers Static Assets) with
// content-hashed filenames; see HANDOFF.md ("Landing page") for how to update them.
import { safeJson } from './webpage';
import { buildCalendar, type CalRow } from './landing-calendar';

const HOME_CSS = `
:root{
  --ink:#0F0F12; --ink2:#1A1A20; --line:#3a3a44;
  --paper:#F2F1EC; --white:#fff; --mute:#B4B4C0;
  --cyan:#00e5ff; --orange:#ff5e07; --lime:#b4e100;
  --display:"Anton","Impact","Arial Narrow Bold",sans-serif;
  --body:"Archivo Narrow","Arial Narrow",Arial,sans-serif;
  --label:"Space Grotesk",system-ui,sans-serif;
  --gut:16px;
}
*{box-sizing:border-box;margin:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{background:var(--ink);color:var(--white);font:400 18px/1.45 var(--body);overflow-x:hidden}
img{display:block;max-width:100%}
a{color:inherit}
:focus-visible{outline:3px solid var(--cyan);outline-offset:3px}
.skip{position:absolute;left:-999px;top:0;background:var(--cyan);color:var(--ink);padding:10px 14px;font:700 14px var(--label);z-index:20}
.skip:focus{left:0}
.wrap{width:100%;max-width:1200px;margin:0 auto;padding:0 var(--gut)}

/* header */
.top{position:absolute;inset:0 0 auto 0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:12px var(--gut)}
.brand{display:flex;align-items:center;gap:8px;text-decoration:none;font:400 24px/1 var(--display);letter-spacing:.04em;background:var(--ink);padding:7px 12px 7px 9px;border:2px solid var(--ink)}
.top__cta{font:700 13px/1 var(--label);letter-spacing:.08em;text-transform:uppercase;text-decoration:none;background:var(--cyan);color:var(--ink);padding:11px 14px;border:2px solid var(--ink);box-shadow:4px 4px 0 var(--ink)}
.top__cta:active{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--ink)}

/* hero */
.hero{position:relative;min-height:max(660px,100svh);display:flex;flex-direction:column;justify-content:flex-end;padding:0 var(--gut) 22px;overflow:hidden;background:var(--ink)}
.hero__photo{position:absolute;left:0;top:0;width:100%;height:calc(100% - 380px);min-height:300px;object-fit:cover;object-position:13% 30%}
.hero__block{--sh:8px;position:relative;margin-right:8px;animation:rise .75s cubic-bezier(.2,.7,.2,1) both}
.hero__block::before{content:"";position:absolute;inset:0;background:var(--cyan);transform:translate(var(--sh),var(--sh));animation:hslam .95s cubic-bezier(.2,.7,.2,1) both}
.hero__card{position:relative;background:var(--ink);border:2px solid var(--white);padding:14px 16px 16px}
.hero h1{font:400 clamp(46px,13.5vw,64px)/.98 var(--display);letter-spacing:.005em}
.hero__sub{margin:10px 0 14px;font-size:16px;color:var(--white);max-width:34ch}
.hero__actions{display:flex;flex-direction:column;gap:10px;align-items:stretch}

/* buttons */
.btn{display:flex;flex-direction:column;justify-content:center;text-decoration:none;border:2px solid var(--ink);min-height:56px;padding:10px 16px;transition:transform .12s,box-shadow .12s,background .12s,color .12s}
.btn--primary{background:var(--cyan);color:var(--ink);box-shadow:5px 5px 0 var(--white)}
.btn--primary:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--white)}
.btn--primary:active{transform:translate(4px,4px);box-shadow:1px 1px 0 var(--white)}
.btn__small{font:700 11px/1.2 var(--label);letter-spacing:.1em;text-transform:uppercase}
.btn__big{font:400 28px/1.05 var(--display);letter-spacing:.03em;text-transform:uppercase}
.btn--ghost{align-items:center;border-color:var(--white);color:var(--white);font:700 14px/1 var(--label);letter-spacing:.1em;text-transform:uppercase;min-height:48px}
.btn--ghost:hover{background:var(--white);color:var(--ink)}
.btn--sm .btn__big{font-size:24px}

@keyframes rise{from{opacity:0;transform:translateY(46px)}to{opacity:1;transform:none}}
/* hard-shadow settle: the cyan shadow sits flush, overshoots, then locks at its offset */
@keyframes hslam{0%,55%{transform:none}80%{transform:translate(calc(var(--sh)*1.7),calc(var(--sh)*1.7))}100%{transform:translate(var(--sh),var(--sh))}}

/* ticker */
.ticker{background:var(--orange);color:var(--ink);border-block:2px solid var(--ink);overflow:hidden;white-space:nowrap}
.ticker__track{display:inline-flex;list-style:none;padding:0;animation:tick 48s linear infinite}
.ticker:hover .ticker__track,.ticker:focus-within .ticker__track{animation-play-state:paused}
.ticker li{font:700 14px/1 var(--label);letter-spacing:.1em;padding:14px 0}
.ticker li::after{content:"";display:inline-block;width:10px;height:10px;background:var(--ink);margin:0 24px;vertical-align:-1px}
@keyframes tick{to{transform:translateX(-50%)}}

/* shared headings */
.h2{font:400 clamp(40px,11vw,76px)/1 var(--display);letter-spacing:.005em}
.h2--dark{color:var(--ink)}
h3{font:400 28px/1 var(--display);letter-spacing:.03em}

/* how */
.how{padding-block:64px 24px}
.steps{list-style:none;padding:0;margin-top:32px;display:grid;gap:0;border-top:2px solid var(--white)}
.steps li{position:relative;padding:20px 0 24px 64px;border-bottom:2px solid var(--line)}
.steps__n{position:absolute;left:0;top:14px;font:400 64px/1 var(--display);color:var(--cyan)}
.steps h3{margin-bottom:6px}
.steps p{max-width:36ch;color:var(--mute)}

/* vs */
.vs{padding-block:48px 64px}
.vs__grid{display:grid;gap:20px;margin-top:28px}
.vs__card{border:2px solid var(--line);padding:20px;background:var(--ink)}
.vs__card h3{margin-bottom:12px}
.vs__card ul{list-style:none;padding:0;display:grid;gap:10px}
.vs__card li{padding-left:22px;position:relative}
.vs__card li::before{content:"";position:absolute;left:0;top:.5em;width:10px;height:10px}
.vs__card--old{color:var(--mute)}
.vs__card--old li{text-decoration:line-through;text-decoration-thickness:1px}
.vs__card--old li::before{border:2px solid var(--mute)}
.vs__card--new{border-color:var(--white);box-shadow:8px 8px 0 var(--lime)}
.vs__card--new li::before{background:var(--lime)}

/* season (light) */
.season{background:var(--paper);color:var(--ink);padding-block:64px;border-block:2px solid var(--ink)}
.season__lead{margin:14px 0 28px;font-size:19px}
.fixtures{list-style:none;padding:0;border-top:2px solid var(--ink)}
.fx{display:grid;gap:2px;padding:16px 12px;border-bottom:2px solid var(--ink);transition:background .12s,color .12s}
.fx__date{font:700 13px/1.2 var(--label);letter-spacing:.1em}
.fx__name{font:400 clamp(30px,8.5vw,44px)/1.05 var(--display);letter-spacing:.01em}
.fx__note{font-size:17px}
.fx:hover{background:var(--ink);color:var(--white)}
.fx:hover .fx__date{color:var(--cyan)}

/* host */
.host__in{padding-block:72px;display:grid;gap:36px}
.host__copy p{margin:18px 0 26px;max-width:42ch;font-size:19px;color:var(--mute)}
.host .btn--primary{display:inline-flex;min-width:240px}
.host__visual{display:grid;align-self:start}
.host__frame{position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;isolation:isolate;background:var(--ink2);border:2px solid var(--white);box-shadow:8px 8px 0 var(--lime)}
.hp{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 45%;opacity:0;z-index:1;transform:scale(1.04);transition:opacity 0s .7s}
.hp--roof{opacity:1;transform:none}
.host__cap{margin:22px 0 0 20px;font:700 14px/1.2 var(--label);letter-spacing:.12em;text-transform:uppercase;color:var(--lime);visibility:hidden}
.host__rn{display:none}
.host__visual .evt{margin:-44px 0 0 20px;position:relative;margin-right:8px}
.evt{border:2px solid var(--white);background:var(--ink2);padding:20px;box-shadow:8px 8px 0 var(--orange);align-self:start}
.evt__tag{display:inline-block;background:var(--orange);color:var(--ink);font:700 11px/1 var(--label);letter-spacing:.12em;padding:6px 8px}
.evt__title{font:400 clamp(30px,8vw,40px)/1.05 var(--display);margin:12px 0 14px;letter-spacing:.01em}
.evt__rows div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-top:1px solid var(--line)}
.evt dt{font:700 12px/1.6 var(--label);letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
.evt dd{text-align:right;font-weight:700;text-wrap:balance}
.evt dt{white-space:nowrap}
.evt__venue span{display:none}
.evt input:focus-visible+span{outline:2px solid var(--lime);outline-offset:2px}
.evt:has([value=bar]:checked) [data-v=bar],.evt:has([value=home]:checked) [data-v=home],.evt:has([value=roof]:checked) [data-v=roof],.evt:has([value=none]:checked) [data-v=none]{display:inline}
.evt fieldset{border:0;padding:0;margin:14px 0 0;display:flex;flex-wrap:wrap;gap:8px}
.evt legend{font:700 12px/1 var(--label);letter-spacing:.1em;text-transform:uppercase;color:var(--mute);margin-bottom:10px;padding:0}
.evt label{cursor:pointer}
.evt input{position:absolute;opacity:0;pointer-events:none}
.evt label span{display:block;border:2px solid var(--white);padding:10px 14px;font:700 13px/1 var(--label);letter-spacing:.06em;text-transform:uppercase;min-height:44px;display:flex;align-items:center;transition:background .12s,color .12s}
.evt label:hover span{border-color:var(--cyan);color:var(--cyan)}
.evt input:checked+span{background:var(--cyan);border-color:var(--cyan);color:var(--ink)}
.evt input:focus-visible+span{outline:3px solid var(--white);outline-offset:3px}

/* brands */
.brands{padding-block:8px 72px}
.brands>*{border-top:2px solid var(--line);padding-top:20px}
.brands__h{font:700 13px/1.3 var(--label);letter-spacing:.1em;color:var(--mute)}
.brands__h span{position:relative;display:inline-block;padding-bottom:6px}
.brands__h span::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--cyan);transform-origin:0 50%}
.brands p{font-size:19px;max-width:52ch;margin-top:-1px;border:0;padding-top:6px}
.brands a{color:var(--cyan);text-underline-offset:3px}

/* close */
.close{background:var(--paper);color:var(--ink);padding:72px 0 80px;border-top:2px solid var(--ink)}
.close__in{display:flex;flex-direction:column;align-items:flex-start;gap:24px}
.close__pin{width:54px;height:auto}
.close__h{font:400 clamp(56px,17vw,150px)/.95 var(--display)}
.close .btn--primary{box-shadow:6px 6px 0 var(--ink);border-color:var(--ink);min-width:260px;display:inline-flex}
.close .btn--primary:hover{box-shadow:9px 9px 0 var(--ink)}
.close .btn--primary:active{box-shadow:1px 1px 0 var(--ink)}
.close__honest{max-width:56ch;font-size:17px}

.foot{display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between;padding:20px var(--gut);background:var(--ink);font:500 13px/1.4 var(--label);letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.foot__brand{font:400 20px/1 var(--display);color:var(--white);letter-spacing:.05em}
.foot a{color:var(--white)}

/* tablet and up */
@media (min-width:760px){
  :root{--gut:32px}
  body{font-size:20px}
  .top{padding:20px var(--gut)}
  .hero{min-height:max(720px,100svh);padding:0 var(--gut) 40px}
  .hero__photo{height:calc(100% - 380px)}
  .hero__block{--sh:12px;max-width:640px;margin-left:auto;margin-right:0}
  .hero__card{padding:26px 28px}
  .hero h1{font-size:clamp(72px,7vw,96px)}
  .hero__sub{font-size:20px;max-width:44ch}
  .hero__actions{flex-direction:row}
  .btn--ghost{padding:10px 22px}
  .steps{grid-template-columns:repeat(3,1fr);border-top:2px solid var(--white)}
  .steps li{padding:24px 24px 28px 0;border-bottom:0;border-right:2px solid var(--line);padding-left:24px}
  .steps li:first-child{padding-left:0}
  .steps li:last-child{border-right:0}
  .steps__n{position:static;display:block;font-size:120px;margin-bottom:8px}
  .vs__grid{grid-template-columns:1fr 1fr;gap:36px}
  .fx{grid-template-columns:260px 1fr auto;align-items:baseline;gap:24px;padding:20px 16px}
  .fx__note{text-align:right}
  .host__in{grid-template-columns:1.1fr 1fr;gap:64px;align-items:center}
  .close__in{align-items:flex-start}
  .close__pin{width:72px}
}
@media (min-width:1100px){
  .hero{justify-content:flex-start;padding:84px var(--gut) 56px}
  .hero__photo{width:100%;height:100%;object-position:50% 30%}
  .hero__block{max-width:480px;margin-left:auto;margin-right:0}
  .hero h1{font-size:clamp(72px,5.2vw,84px)}
  .hero__sub{font-size:19px}
  .hero__actions{flex-direction:column}
}
@media (prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important;scroll-behavior:auto!important}
  .ticker{overflow-x:auto}
}
`;

// Scroll moments. Everything here is an enhancement: with JS off, or with reduced motion, the page
// renders in its static final state. One code path for every browser: a tiny IntersectionObserver
// (inline script below) adds html.sx-io, then adds `.in` to each moment's element as it enters the
// viewport, and CSS transitions play. (An earlier version used CSS scroll-driven animations
// (animation-timeline: view()) with this as the fallback; two paths, plus a gate that also required
// `content` alt-text support, meant some engines showed little or nothing, so it is gone.)
// `--i` (set by the script) staggers elements that enter in the same batch.
// transform / opacity / clip-path only; no scroll handlers; nothing moves while you read.
const SX_CSS = `
/* 1. Three moves: bar draws, numeral lights up, in sequence */
.sx-io .steps li::before{content:"";position:absolute;left:0;top:-2px;width:100%;height:4px;background:var(--cyan);transform:scaleX(0);transform-origin:0 50%;transition:transform .7s cubic-bezier(.23,1,.32,1) calc(var(--i,0)*.22s)}
.sx-io .steps li.in::before{transform:none}
.sx-io .steps__n{opacity:.15;transform:translateY(16px) scale(.9);transform-origin:0 100%;transition:opacity .5s calc(.1s + var(--i,0)*.22s),transform .6s cubic-bezier(.23,1,.32,1) calc(var(--i,0)*.22s)}
.sx-io .steps li.in .steps__n{opacity:1;transform:none}

/* 2. Stale listings struck through, then the SpotSeek card's shadow slams out */
.sx-io .vs__grid{isolation:isolate}
@supports (content:"a" / ""){
.sx-io .vs__card--old li{text-decoration:none}
.sx-io .vs__card--old li::after{content:attr(data-t) / "";position:absolute;left:22px;right:0;top:0;color:transparent;text-decoration:line-through;text-decoration-color:var(--white);text-decoration-thickness:2px;pointer-events:none;clip-path:inset(0 100% 0 0);transition:clip-path .7s cubic-bezier(.23,1,.32,1) calc(var(--i,0)*.18s)}
.sx-io .vs__card--old li.in::after{clip-path:inset(0)}
}
.sx-io .vs__card--new{box-shadow:none;position:relative}
.sx-io .vs__card--new::after{content:"";position:absolute;inset:-2px;z-index:-1;background:var(--lime);transition:transform .22s cubic-bezier(.3,1.7,.5,1) calc(.35s + var(--i,0)*.18s)}
.sx-io .vs__card--new.in::after{transform:translate(8px,8px)}

/* 3. Calendar rows wipe in; the NEXT UP tag stamps on */
.sx-io .fx{clip-path:inset(0 100% 0 0);transition:clip-path .6s cubic-bezier(.23,1,.32,1) calc(var(--i,0)*.07s)}
.sx-io .fx.in{clip-path:inset(0)}
.sx-io .fx__tag{opacity:0;transform:scale(.6);transition:opacity .2s calc(.5s + var(--i,0)*.07s),transform .3s cubic-bezier(.3,1.7,.5,1) calc(.5s + var(--i,0)*.07s)}
.sx-io .fx.in .fx__tag{opacity:1;transform:none}

/* 4. Host: one pinned stage scrubbed by scroll. The script writes --p (0..1) on .host; CSS maps it to the
   vertical split (p 0 to .3). The same script steps the venue chips at .4/.6/.8 (chips are radios; :has() drives
   the venue text and the photo crossfade, so scroll and a tap share one path) and reveals the caption at .9. */
.sx-pin .host__visual{container-type:inline-size}
.sx-pin .host__in{--s:min(1,max(0,calc(var(--p,1) / .3)));--e:calc(1 - (1 - var(--s)) * (1 - var(--s)))}
.sx-pin .host__frame,.sx-pin .host__visual .evt{--fh:75cqw}
.sx-pin .host__frame{height:var(--fh);aspect-ratio:auto;transform:translateY(calc((1 - var(--e)) * (var(--fh) / 2 - 22px)))}
.sx-pin .host__visual .evt{transform:translateY(calc((1 - var(--e)) * (22px - var(--fh) / 2)))}
.sx-pin .host__rn{display:block;height:230vh;height:230svh}
.host__visual:has([value=bar]:checked) .hp--roof,.host__visual:has([value=home]:checked) .hp--roof{opacity:0}
.host__visual:has([value=bar]:checked) .hp--bar,.host__visual:has([value=home]:checked) .hp--home,.host__visual:has([value=roof]:checked) .hp--roof,.sx-st .host__visual:has([value=none]:checked) .hp--roof{opacity:1;z-index:2;transform:none;transition:opacity .7s,transform 1.3s cubic-bezier(.23,1,.32,1)}
.sx-st .host__visual:has([value=none]:checked) .hp--roof{opacity:.3}
.sx-st .evt__venue span{animation:sx-v .4s both}
@keyframes sx-v{from{opacity:0;transform:translateY(6px)}}
.sx-st .host__cap{visibility:visible;opacity:0;transition:opacity .6s .3s}
.sx-cap .host__cap{opacity:1}
@media (min-width:900px){
.sx-pin .host__stage{position:sticky;top:0;height:100vh;height:100svh;display:flex;align-items:center;overflow-x:clip}
.sx-pin .host__in{width:100%;padding-block:0}
}
@media (max-width:899.98px){
/* phone: text + visual cannot share one viewport legibly, so the text scrolls first and only the visual pins */
.sx-pin .host__stage,.sx-pin .host__in{display:contents}
.sx-pin .host{padding:72px var(--gut)}
.sx-pin .host__visual{position:sticky;top:max(8px,calc(50vh - 380px));top:max(8px,calc(50svh - 380px));margin:36px auto 0;max-width:520px}
}
@media (max-width:899.98px) and (max-height:759px){
/* short phones (iPhone SE/mini, Safari toolbar showing): compact layout so the pinned visual always fits 100svh */
.sx-pin .host__frame,.sx-pin .host__visual .evt{--fh:min(75cqw,40svh)}
.sx-pin .host__visual{top:8px}
.sx-pin .host__visual .evt{padding:14px 16px}
.sx-pin .evt__title{margin:8px 0 6px;font-size:clamp(26px,7vw,32px)}
.sx-pin .evt__rows div{padding:5px 0}
.sx-pin .evt dt{font-size:11px;line-height:1.4}
.sx-pin .evt dd{font-size:14px;line-height:1.25}
.sx-pin .evt fieldset{margin-top:8px}
.sx-pin .evt legend{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);margin:0}
.sx-pin .evt label span{min-height:40px;padding:8px 11px}
.sx-pin .host__cap{margin-top:12px}
}
@media (max-width:899.98px) and (max-height:520px){
/* landscape phone: nothing can pin, so show the static final layout */
.sx-pin .host__rn{display:none}
.sx-pin .host__visual{position:static}
}

/* 5. Brands line underlines itself */
.sx-io .brands__h span::after{transform:scaleX(0);transition:transform .8s cubic-bezier(.23,1,.32,1) .15s}
.sx-io .brands__h.in span::after{transform:none}

/* 6. Closing (the peak): headline slides together, the pin drops */
.sx-io .close{overflow:clip}
.sx-io .close__a,.sx-io .close__b{display:inline-block;opacity:0;transition:opacity .5s,transform .85s cubic-bezier(.23,1,.32,1)}
.sx-io .close__a{transform:translateX(-22vw)}
.sx-io .close__b{transform:translateX(22vw);transition-delay:.12s}
.sx-io .close__in.in .close__a,.sx-io .close__in.in .close__b{opacity:1;transform:none}
.sx-io .close__pin{opacity:0;transform-origin:50% 100%}
.sx-io .close__in.in .close__pin{animation:sx-drop .8s ease-out .55s both}
@keyframes sx-drop{0%{opacity:0;transform:translateY(-170px) rotate(-14deg)}58%{opacity:1;transform:none}74%{transform:scaleY(.85)}90%{transform:scaleY(1.04)}100%{opacity:1;transform:none}}
`;

// Inline script (the only non-JSON-LD script; test/index.spec.ts enforces < 4 KB).
const SX_JS = `(()=>{
var d=document,de=d.documentElement,h=d.querySelector('.host__visual'),f=h&&h.querySelector('form'),R=f?[].slice.call(f.querySelectorAll('input')):[],O=['none','bar','home','roof'];
function set(n){R.forEach(r=>r.checked=r.value==O[n])}
if(window.IntersectionObserver){
if(matchMedia('(prefers-reduced-motion:reduce)').matches){if(f){de.classList.add('sx-st','sx-cap');set(3)}}
else{
var io=new IntersectionObserver(l=>{var i=0;l.forEach(e=>{if(e.isIntersecting||e.boundingClientRect.top<0){var t=e.target;t.style.setProperty('--i',i++);t.classList.add('in');io.unobserve(t)}})},{rootMargin:'0px 0px -14% 0px'});
de.classList.add('sx-io');
[].forEach.call(d.querySelectorAll('.steps li,.vs__card--old li,.vs__card--new,.fx,.brands__h,.close__in'),e=>io.observe(e));
var hs=d.querySelector('.host'),rn=d.querySelector('.host__rn'),st=d.querySelector('.host__stage');
if(f&&hs&&rn&&st){
var mq=matchMedia('(min-width:900px)'),u=0,n=0,q=0;
de.classList.add('sx-st','sx-pin');
['click','change'].forEach(v=>f.addEventListener(v,()=>{u=1;de.classList.add('sx-cap')}));
function upd(){q=0;var e=mq.matches?st:h,p=rn.offsetHeight?((parseFloat(getComputedStyle(e).top)||0)+e.offsetHeight-rn.getBoundingClientRect().top)/rn.offsetHeight:1;p=p<0?0:p>1?1:p;hs.style.setProperty('--p',p);if(!u){var s=p<.4?0:p<.6?1:p<.8?2:3;if(s!=n)set(n=s)}if(p>.9)de.classList.add('sx-cap')}
function rq(){q||(q=requestAnimationFrame(upd))}
new IntersectionObserver(l=>{upd();l[0].isIntersecting?addEventListener('scroll',rq,{passive:true}):removeEventListener('scroll',rq)},{rootMargin:'50% 0px'}).observe(hs);
addEventListener('resize',rq);
new IntersectionObserver((l,o)=>{if(l[0].isIntersecting){[].forEach.call(d.querySelectorAll('.hp'),i=>i.loading='eager');o.disconnect()}},{rootMargin:'100% 0px'}).observe(hs)
}
}
}
})()`;

const SX_NEXT_CSS = `
.fx--next{background:var(--ink);color:var(--white)}
.fx--next .fx__date{color:var(--cyan)}
.fx__tag{display:inline-block;margin-left:10px;padding:3px 6px;background:var(--orange);color:var(--ink);font:700 11px/1 var(--label);letter-spacing:.12em;vertical-align:1px}
`;

export interface HomeOpts {
  baseUrl: string;
  /** Injectable clock (tests); defaults to the current time. */
  now?: Date;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function tickerHtml(rows: CalRow[]): string {
  const items = rows.map((r) => esc(r.ticker));
  return items.map((t) => `<li>${t}</li>`).join('') + '\n    ' + items.map((t) => `<li aria-hidden="true">${t}</li>`).join('');
}

function calendarHtml(rows: CalRow[]): string {
  return rows
    .map(
      (r) => `      <li class="fx${r.tag ? ' fx--next' : ''}">
        <span class="fx__date">${esc(r.dateLabel)}${r.tag ? `<span class="fx__tag">${r.tag}</span>` : ''}</span>
        <span class="fx__name">${esc(r.name)}</span>
        <span class="fx__note">${esc(r.note)}</span>
      </li>`,
    )
    .join('\n');
}

/** Landing page HTML. baseUrl (PUBLIC_BASE_URL, no trailing slash) anchors canonical/og URLs. */
export function renderHomePage(o: HomeOpts): string {
  const base = o.baseUrl.replace(/\/+$/, '');
  const now = o.now ?? new Date();
  const rows = buildCalendar(now);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'SpotSeek',
      url: `${base}/`,
      logo: `${base}/static/email-logo.png`,
      email: 'hello@spotseek.app',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'SpotSeek',
      url: `${base}/`,
    },
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SpotSeek | Never watch alone. Find and host watch parties</title>
<meta name="description" content="SpotSeek is a host-centric app for creating, discovering and RSVPing to watch parties for games, award shows, finales and election nights. Host-confirmed parties, real people going. Coming soon to the App Store.">
<meta name="theme-color" content="#0F0F12">
<link rel="canonical" href="${base}/">
<link rel="icon" type="image/png" href="/site/icon-96.8680fb9b.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SpotSeek">
<meta property="og:url" content="${base}/">
<meta property="og:title" content="SpotSeek | Never watch alone.">
<meta property="og:description" content="Find host-confirmed watch parties nearby for the game, the finale, the big night, with real people going. Or host your own. Coming soon to the App Store.">
<meta property="og:image" content="${base}/site/og.c847f29a.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Friends cheering with fists in the air on a living room couch as a player in a blue number 10 shirt celebrates on the TV, with popcorn and drinks on the coffee table">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="SpotSeek | Never watch alone.">
<meta name="twitter:description" content="Find host-confirmed watch parties nearby for the game, the finale, the big night, with real people going. Or host your own. Coming soon to the App Store.">
<meta name="twitter:image" content="${base}/site/og.c847f29a.jpg">
<meta name="twitter:image:alt" content="Friends cheering with fists in the air on a living room couch as a player in a blue number 10 shirt celebrates on the TV, with popcorn and drinks on the coffee table">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Narrow:wght@400;500;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
${HOME_CSS}${SX_NEXT_CSS}${SX_CSS}
</style>
<script type="application/ld+json">${safeJson(jsonLd)}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<header class="top">
  <a class="brand" href="#top" aria-label="SpotSeek home">
    <img src="/site/pin.36450ac1.webp" width="26" height="33" alt="">
    <span>SPOTSEEK</span>
  </a>
  <a class="top__cta" href="#notify">Notify me</a>
</header>

<main id="main">

<section class="hero" id="top">
  <img class="hero__photo" src="/site/living-room-1536.8aa17217.webp" srcset="/site/living-room-800.cfea0bf0.webp 800w, /site/living-room-1536.8aa17217.webp 1536w" sizes="100vw" width="1536" height="1024" alt="Four friends cheering with fists and arms in the air in a warm living room as their team scores on a big TV, with beers and bowls of popcorn and snacks on the coffee table" fetchpriority="high">
  <div class="hero__block"><div class="hero__card">
    <h1>NEVER WATCH<br>ALONE.</h1>
    <p class="hero__sub">Games, award shows, season finales, election nights. Find host-confirmed watch parties near you, with real people going. Or host your own.</p>
    <div class="hero__actions">
      <a class="btn btn--primary" href="mailto:hello@spotseek.app?subject=Notify%20me%20when%20SpotSeek%20launches">
        <span class="btn__small">Coming soon to the App Store</span>
        <span class="btn__big">Notify me</span>
      </a>
      <a class="btn btn--ghost" href="#host">Host a watch party</a>
    </div>
  </div></div>
</section>

<div class="ticker" role="region" aria-label="What's on: upcoming big nights">
  <ul class="ticker__track">
    ${tickerHtml(rows)}
  </ul>
</div>

<section class="how wrap" aria-labelledby="how-h">
  <h2 id="how-h" class="h2">THREE MOVES.<br>ONE GOOD NIGHT.</h2>
  <ol class="steps">
    <li>
      <span class="steps__n" aria-hidden="true">1</span>
      <h3>FIND</h3>
      <p>Pick what's on: a game, a finale, the big night. See parties near you that a host has confirmed, not a guess from an old listing.</p>
    </li>
    <li>
      <span class="steps__n" aria-hidden="true">2</span>
      <h3>RSVP</h3>
      <p>Say you're in. You can see who else is going before you leave the house.</p>
    </li>
    <li>
      <span class="steps__n" aria-hidden="true">3</span>
      <h3>SHOW UP</h3>
      <p>Walk into a room that is expecting you. Same screen, same moment, people who came for it.</p>
    </li>
  </ol>
</section>

<section class="vs wrap" aria-labelledby="vs-h">
  <h2 id="vs-h" class="h2">NOT ANOTHER<br>STALE LISTING.</h2>
  <div class="vs__grid">
    <article class="vs__card vs__card--old">
      <h3>THE OLD LISTING</h3>
      <ul>
        <li data-t="A venue page nobody has touched in a while">A venue page nobody has touched in a while</li>
        <li data-t="&quot;Probably has it on&quot;">"Probably has it on"</li>
        <li data-t="No idea who is actually going, or if anyone is">No idea who is actually going, or if anyone is</li>
      </ul>
    </article>
    <article class="vs__card vs__card--new">
      <h3>A SPOTSEEK PARTY</h3>
      <ul>
        <li>Created and confirmed by a host</li>
        <li>RSVPs from real people</li>
        <li>A bar, a rooftop or a living room, and the host can change it</li>
      </ul>
    </article>
  </div>
</section>

<section class="season" aria-labelledby="season-h">
  <div class="wrap">
    <h2 id="season-h" class="h2 h2--dark">WHAT'S ON,<br>THE CALENDAR.</h2>
    <p class="season__lead">Sports, awards, elections, finales. The dates worth getting people together for.</p>
    <ul class="fixtures">
${calendarHtml(rows)}
    </ul>
  </div>
</section>

<section class="host" id="host" aria-labelledby="host-h">
<div class="host__stage"><div class="host__in wrap">
  <div class="host__copy">
    <h2 id="host-h" class="h2">YOU HOST.<br>THE ROOM IS OPTIONAL.</h2>
    <p>A party belongs to its host, not to a venue. Start with the show and the people. Add a bar, your living room or a rooftop when you know where, and change it with one edit.</p>
    <a class="btn btn--primary btn--sm" href="mailto:hello@spotseek.app?subject=I%20want%20to%20host%20a%20watch%20party">
      <span class="btn__small">Coming soon to the App Store</span>
      <span class="btn__big">Host a watch party</span>
    </a>
  </div>

  <div class="host__visual">
    <div class="host__frame">
      <img class="hp hp--bar" src="/site/bar-1536.d684602b.webp" srcset="/site/bar-800.cc7fb890.webp 800w, /site/bar-1536.d684602b.webp 1536w" sizes="(min-width:900px) 45vw, 100vw" width="1536" height="1152" alt="" loading="lazy" decoding="async">
      <img class="hp hp--home" src="/site/living-room-1536.8aa17217.webp" srcset="/site/living-room-800.cfea0bf0.webp 800w, /site/living-room-1536.8aa17217.webp 1536w" sizes="(min-width:900px) 45vw, 100vw" width="1536" height="1024" alt="" loading="lazy" decoding="async">
      <img class="hp hp--roof" src="/site/rooftop-1536.e43efa47.webp" srcset="/site/rooftop-800.1bec80b8.webp 800w, /site/rooftop-1536.e43efa47.webp 1536w" sizes="(min-width:900px) 45vw, 100vw" width="1536" height="1024" alt="Friends on a rooftop couch cheering with raised arms as a man in a tuxedo accepts a gold statuette on a big outdoor screen, under string lights at dusk with a city skyline behind" loading="lazy" decoding="async">
    </div>
  <form class="evt" onsubmit="return false" aria-label="Example party: choose a venue">
    <p class="evt__tag">EXAMPLE PARTY</p>
    <p class="evt__title">YOUR WATCH PARTY</p>
    <dl class="evt__rows">
      <div><dt>Host</dt><dd>You</dd></div>
      <div><dt>What's on</dt><dd>The game, the finale, the big one</dd></div>
      <div><dt>Date</dt><dd>You pick</dd></div>
      <div><dt>Venue</dt><dd class="evt__venue"><span data-v="bar">A bar near you</span><span data-v="home">Your living room</span><span data-v="roof">A rooftop</span><span data-v="none">To be decided</span></dd></div>
    </dl>
    <fieldset>
      <legend>Pick a venue</legend>
      <label><input type="radio" name="v" value="bar"><span>Bar</span></label>
      <label><input type="radio" name="v" value="home"><span>Living room</span></label>
      <label><input type="radio" name="v" value="roof"><span>Rooftop</span></label>
      <label><input type="radio" name="v" value="none" checked><span>None yet</span></label>
    </fieldset>
  </form>
    <p class="host__cap">Same party. Any room.</p>
  </div>
</div></div>
  <i class="host__rn" aria-hidden="true"></i>
</section>

<section class="brands wrap" aria-labelledby="brands-h">
  <h2 id="brands-h" class="brands__h"><span>RUN A BAR, A SHOP OR A BRAND?</span></h2>
  <p>Brands and local businesses can sponsor a party. <a href="mailto:hello@spotseek.app?subject=Sponsoring%20a%20party">Say hello</a> and we'll tell you how it will work.</p>
</section>

<section class="close" id="notify" aria-labelledby="close-h">
  <div class="wrap close__in">
    <img src="/site/pin.36450ac1.webp" width="72" height="90" alt="" class="close__pin">
    <h2 id="close-h" class="close__h"><span class="close__a">NEVER WATCH</span><br><span class="close__b">ALONE.</span></h2>
    <a class="btn btn--primary btn--lg" href="mailto:hello@spotseek.app?subject=Notify%20me%20when%20SpotSeek%20launches">
      <span class="btn__small">Coming soon to the App Store</span>
      <span class="btn__big">Notify me</span>
    </a>
    <p class="close__honest">Notify me opens your email app with a message to hello@spotseek.app. This page has no form and stores nothing: no sign-up list, no cookies. We only have your address if you send the email.</p>
  </div>
</section>

</main>

<footer class="foot">
  <span class="foot__brand">SPOTSEEK</span>
  <a href="mailto:hello@spotseek.app">hello@spotseek.app</a>
  <a href="/guidelines">Community guidelines</a>
  <a href="/terms">Terms</a>
  <a href="/privacy">Privacy</a>
  <span>Coming soon to the App Store</span>
</footer>
<script>${SX_JS}</script>
</body>
</html>
`;
}
