import { escapeHtml, renderPage, safeJson } from './webpage';

const HOME_CSS = `
.wrap.home { max-width:720px; }
.hero { padding:36px 16px 8px; }
.hero h1 { font-size:clamp(46px,13vw,84px); line-height:.98; margin:8px 0 14px; }
.hero h1 em { font-style:normal; color:var(--cyan); }
.sub { font-size:19px; color:#e6e6ea; margin:0 0 6px; max-width:34em; }
.props { display:grid; gap:14px; padding:8px 16px 0; }
.prop { background:var(--card); border:2px solid var(--line); border-left:6px solid var(--orange); padding:16px; }
.prop h2 { color:var(--cyan); }
.prop p { margin:0; color:#e6e6ea; }
.cta { margin:28px 16px 0; }
.cta .btn { margin-top:12px; }
.foot { margin:36px 16px 0; padding-top:16px; border-top:2px solid var(--line); font-size:14px; color:var(--muted); }
@media (min-width:700px) { .props { grid-template-columns:repeat(3,1fr); } .cta { display:grid; grid-template-columns:1fr 1fr; gap:14px; } }
`;

export interface HomeOpts {
  baseUrl: string;
  appStoreUrl?: string | null;
}

/** Marketing home page served at GET /. Every interpolated value is escaped. */
export function renderHomePage(o: HomeOpts): string {
  const base = o.baseUrl;
  const canonical = `${base}/`;
  const title = 'SpotSeek — Find your watch party';
  const description =
    'Host it, find it, pack the place. Sports and entertainment watch parties near you.';
  const logo = `${base}/static/email-logo.png`;
  const store = o.appStoreUrl
    ? `<a class="btn" href="${escapeHtml(o.appStoreUrl)}">DOWNLOAD ON THE APP STORE</a>`
    : '<span class="btn btn-disabled">COMING SOON TO THE APP STORE</span>';
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'SpotSeek',
      url: canonical,
      logo,
      email: 'hello@spotseek.app',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'SpotSeek',
      url: canonical,
    },
  ];
  const head = [
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<link rel="icon" type="image/png" href="${escapeHtml(logo)}">`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    '<meta property="og:site_name" content="SpotSeek">',
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:image" content="${escapeHtml(logo)}">`,
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(logo)}">`,
    '<meta name="theme-color" content="#0F0F12">',
    `<style>${HOME_CSS}</style>`,
    `<script type="application/ld+json">${safeJson(jsonLd)}</script>`,
  ].join('\n');

  const body = `  <div class="hero">
    <img src="${escapeHtml(logo)}" alt="SpotSeek" width="64" height="64">
    <h1>FIND YOUR <em>WATCH PARTY.</em></h1>
    <p class="sub">Host it, find it, pack the place. Sports and entertainment watch parties near you.</p>
  </div>
  <div class="props">
    <div class="prop"><h2>FANS</h2><p>Find the room where your game is on and the crowd is loud. RSVP in one tap.</p></div>
    <div class="prop"><h2>HOSTS</h2><p>Create a watch party in minutes. Fill your venue and keep the energy up.</p></div>
    <div class="prop"><h2>SPONSORS</h2><p>Back the events your audience already shows up for.</p></div>
  </div>
  <div class="cta">
    <div class="panel panel-cyan">
      <div class="label">Get the app</div>
      <h2>FIND PARTIES NEAR YOU</h2>
      ${store}
    </div>
    <div class="panel">
      <div class="label">Hosting a watch party?</div>
      <h2>PACK THE PLACE</h2>
      <span class="btn btn-disabled">HOST SIGN-UP COMING SOON</span>
    </div>
  </div>
  <div class="foot">Questions? <a href="mailto:hello@spotseek.app">hello@spotseek.app</a></div>`;

  return renderPage({ title, head, body }).replace('<div class="wrap">', '<div class="wrap home">');
}
