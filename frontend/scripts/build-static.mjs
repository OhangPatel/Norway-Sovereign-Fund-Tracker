/**
 * Emits crawlable static HTML for the holdings dataset, plus the sitemap.
 *
 * WHY THIS EXISTS
 * The dashboard is client-rendered: every figure lives in data.json and is only
 * reachable after JavaScript runs. Search engines mostly cope; the AI crawlers
 * this project cares about largely do not, so none of the 1,430 holdings were
 * readable by them (audit H5). This script renders the same data as plain,
 * semantic HTML at stable URLs so the numbers exist without executing anything.
 *
 * It reads data.json directly rather than prerendering the React app with a
 * headless browser: deterministic, no browser in CI, and it can emit per-sector
 * pages the single-route app has no URLs for.
 *
 * Runs after `vite build` (see package.json) and writes into dist/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotDate, formatSnapshot } from '../src/snapshot.js';
import { sectorOf } from '../src/sectors.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const ORIGIN = 'https://invest.learnbasecase.com';
const PER_PAGE = 200;

// The `sector || industry` fallback and the GICS→Yahoo synonym fold both live in
// src/sectors.js now, shared with the app bundle — otherwise "Health Care" and
// "Healthcare" become two pages competing for the same topic here, while the
// dashboard's own filter shows them as two sectors. One map, both surfaces.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function short(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(digits) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(digits) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(digits) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(digits) + 'K';
  return Number(n).toFixed(digits);
}
const money = (n, sym) => (n == null ? '—' : sym + ' ' + short(n));
const pct = (n, d = 2) => (n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(d) + '%');
const num = (n, d = 2) => (n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(d));
const rec = (r) => (!r ? '—' : String(r).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));

// ── Load + group ────────────────────────────────────────────────────────────
const rows = JSON.parse(readFileSync(resolve(ROOT, 'public/data.json'), 'utf8'));

// Shared with the app bundle so the static pages and the header cannot disagree.
const AS_OF = snapshotDate(rows);
// A build is the right place to be strict: unlike the running app, there is nobody to
// show "unknown" to, and a wrong date would be baked into every generated page.
if (!AS_OF) throw new Error('No usable fetchedAt in data.json — refusing to guess the snapshot date.');
const AS_OF_LABEL = formatSnapshot(AS_OF, 'long');

const bySector = new Map();
for (const r of rows) {
  const s = sectorOf(r, 'Unclassified');
  if (!bySector.has(s)) bySector.set(s, []);
  bySector.get(s).push(r);
}
for (const list of bySector.values()) list.sort((a, b) => (b.mvUsd || 0) - (a.mvUsd || 0));

const sectors = [...bySector.entries()]
  .map(([name, list]) => ({
    name,
    slug: slug(name),
    list,
    count: list.length,
    usd: list.reduce((s, r) => s + (r.mvUsd || 0), 0),
    pages: Math.max(1, Math.ceil(list.length / PER_PAGE)),
  }))
  .sort((a, b) => b.usd - a.usd);

const TOTAL_USD = sectors.reduce((s, x) => s + x.usd, 0);

// ── Shared chrome ───────────────────────────────────────────────────────────
const CSS = `
/* These pages are part of the same product as the dashboard, so they are built
   from the same design language rather than a lookalike of it. Everything below
   is either a token copied from index.html or a rule derived from one.

   They cannot import index.html's <style> block — they are emitted at build time
   and served without the app bundle — so the palette is duplicated here. The
   STYLE_GUIDE calls this out: changing a neutral means changing both files. What
   is NOT duplicated any more is the geometry: radius, gutter and container width
   were previously invented here (12px cards, a 1240px container, its own gutter)
   and so drew a visibly different product. */
:root{
  /* Geometry — the same scale as :root in index.html. */
  --r-xs:4px;--r-sm:8px;--r-md:12px;--r-lg:16px;--r-xl:18px;--r-pill:999px;
  --page-max:1680px;--gutter:clamp(14px,2vw,22px);--gap:16px;--pad-card:24px;
  --control-h:34px;
  --font-display:'Space Grotesk',ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  /* Whisper olive — the app's light tokens. --zebra is gone: the app's tables use
     --row-hover for the same job, and a second near-white was a token competing
     with one that already existed. */
  --bg:#F4F5F0;--surface:#FFFFFF;--line:#E2E4D7;--track:#E2E4D7;
  --ink:#16170F;--sub:#626054;--soft:#5E624C;--row-hover:#F2F3ED;
  --accent:#D8F34A;--accent-text:#617416;--card-hover-border:#16170F;
  /* Neutral, matching index.html: these were olive (#14150F / #A9AB9C / #8A8C7D,
     6-15 point channel spreads) and the band read green. */
  --foot-surface:#141414;--foot-ink:#F2F2F2;--foot-sub:#BABABA;--foot-soft:#9F9F9F;
  --foot-line:rgba(242,242,242,.11);--foot-accent:#D8F34A;
  --shadow-lift:0 18px 34px -22px rgba(22,23,15,.55);
  --logo-tile:#16181B;--logo-stroke:transparent;--logo-crown:#F7F6F2;--logo-gold:#C9A227;
}
/* Onyx field — the app's dark tokens. Selected by the [data-theme] attribute the
   inline script sets, so a reader who chose dark in the dashboard stays in dark
   here; prefers-color-scheme is the fallback for a first visit. Previously these
   pages honoured the OS alone, so choosing dark in the app and following a link
   landed you on a white page. */
:root[data-theme=dark]{
  --bg:#000000;--surface:#1C1C1E;--line:#2C2C2E;--track:#2C2C2E;
  --ink:#FFFFFF;--sub:#98989D;--soft:#8E8E93;--row-hover:#242426;
  --accent:#D8F34A;--accent-text:#D8F34A;--card-hover-border:#D8F34A;
  --foot-surface:#1C1C1E;--foot-ink:#FFFFFF;--foot-sub:#C1C1C1;--foot-soft:#A6A6A6;
  --foot-line:rgba(255,255,255,.11);--foot-accent:#D8F34A;
  --shadow-lift:0 18px 34px -22px rgba(0,0,0,.8);
  --logo-tile:#0F1113;--logo-stroke:#2B2F33;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--ink);line-height:1.5;font-family:var(--font-display)}
.mono{font-family:var(--font-mono)}
.wrap{max-width:var(--page-max);margin:0 auto;padding:0 var(--gutter)}

/* Nav — the dashboard's floating card, not a full-bleed bar. Same 16px radius,
   same hairline, same brand lockup and eyebrow. */
header{padding:16px var(--gutter) 0;position:sticky;top:0;z-index:50;background:var(--bg)}
.nav{max-width:var(--page-max);margin:0 auto;background:var(--surface);
  border:1px solid var(--line);border-radius:var(--r-lg);
  display:flex;align-items:center;gap:12px;padding:0 18px;min-height:68px;flex-wrap:wrap}
.tile{flex-shrink:0;line-height:0}
.brand{text-decoration:none;color:var(--ink);font-size:17px;font-weight:600;letter-spacing:-.02em;line-height:1}
.brand span{color:var(--accent-text)}
.brand-sub{margin-top:4px}
.eyebrow{font-family:var(--font-mono);font-size:11px;text-transform:uppercase;
  letter-spacing:.14em;color:var(--soft);font-weight:500}
.nav .eyebrow{font-size:10px}
.nav-cta{margin-left:auto;display:inline-flex;align-items:center;height:var(--control-h);
  padding:0 14px;border:1px solid var(--line);border-radius:var(--r-pill);
  color:var(--ink);text-decoration:none;font-family:var(--font-mono);font-size:11px;
  font-weight:500;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;
  transition:background .14s ease,border-color .14s ease}
.nav-cta:hover{background:var(--row-hover);border-color:var(--ink)}

main.wrap{padding-top:22px;padding-bottom:32px}
nav.crumb{font-family:var(--font-mono);font-size:11px;text-transform:uppercase;
  letter-spacing:.1em;color:var(--soft);padding:6px 0 18px}
nav.crumb a{color:var(--soft);text-decoration:none;border-bottom:1px solid transparent}
nav.crumb a:hover{color:var(--ink);border-bottom-color:var(--line)}

/* Type — the dashboard's scale. h1 tracks the hero headline's clamp, the lede is
   its 15px/1.6 body. */
h1{font-size:clamp(32px,4.2vw,54px);font-weight:600;letter-spacing:-.03em;
  line-height:1.02;margin:0 0 14px;text-wrap:balance;max-width:20ch}
h2{font-size:24px;font-weight:600;letter-spacing:-.02em;margin:36px 0 14px}
.lede{font-size:15px;line-height:1.6;color:var(--sub);max-width:70ch;margin:0 0 26px}
a{color:var(--ink)}

/* Links carry a hairline underline that thickens to the accent on hover. The old
   rule filled the whole link with lime on hover, a highlighter effect that exists
   nowhere in the app. */
main a:not(.card):not(.btn){text-decoration:none;border-bottom:1px solid var(--line);
  transition:border-color .14s ease,color .14s ease}
main a:not(.card):not(.btn):hover{color:var(--accent-text);border-bottom-color:var(--accent)}

/* Table — the ledger card. Header cells, hairlines and hover all match table.jsx;
   the zebra stripe is gone, replaced by the app's row hover. */
.tw{border:1px solid var(--line);border-radius:var(--r-xl);overflow:hidden;
  background:var(--surface);margin:var(--gap) 0}
.tscroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13px}
.tcap{margin:0;padding:16px 20px;color:var(--soft);font-size:11px;line-height:1.6;
  font-family:var(--font-mono);border-bottom:1px solid var(--line)}
th,td{padding:0 14px;height:44px;text-align:left;white-space:nowrap}
thead th{position:sticky;top:0;background:var(--surface);border-bottom:1px solid var(--line);
  font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;
  letter-spacing:.08em;color:var(--soft);font-weight:500;height:auto;padding:12px 14px}
tbody tr{border-bottom:1px solid var(--line)}
tbody tr:last-child{border-bottom:none}
tbody tr:hover{background:var(--row-hover)}
tbody th{font-weight:500;font-size:13px;white-space:normal;min-width:180px}
td.n{text-align:right;font-family:var(--font-mono);font-variant-numeric:tabular-nums;color:var(--sub)}

/* Sector cards — .card + .lift from index.html, at the same radius and with the
   same hover: a 4px rise, the shared shadow, and the border shifting to
   --card-hover-border. They were flat 12px boxes with a border-colour swap. */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
  gap:var(--gap);margin:var(--gap) 0}
.card{border:1px solid var(--line);background:var(--surface);border-radius:var(--r-xl);
  padding:var(--pad-card);text-decoration:none;display:block;color:var(--ink);
  transition:transform .25s cubic-bezier(.2,.7,.3,1),box-shadow .25s ease,border-color .25s ease}
.card:hover,.card:focus-visible{transform:translateY(-4px);box-shadow:var(--shadow-lift);
  border-color:var(--card-hover-border)}
.card .eyebrow{display:block;font-size:10px;letter-spacing:.14em}
.card b{display:block;font-size:32px;font-weight:600;letter-spacing:-.03em;line-height:1.1;margin:10px 0 6px}
.card .m{display:block;font-family:var(--font-mono);font-size:11px;color:var(--soft)}

.pager{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:var(--gap) 0;
  font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.btn{display:inline-flex;align-items:center;height:var(--control-h);padding:0 14px;
  border:1px solid var(--line);border-radius:var(--r-pill);color:var(--ink);
  text-decoration:none;font-family:var(--font-mono);font-size:11px;font-weight:500;
  letter-spacing:.06em;text-transform:uppercase;transition:background .14s ease,border-color .14s ease}
.btn:hover{background:var(--row-hover);border-color:var(--ink)}
.btn-primary{background:var(--accent);border-color:var(--accent);color:#16170F;font-weight:600}
.btn-primary:hover{background:var(--accent);border-color:var(--accent)}

/* Footer — the dashboard's ink band, in both themes, with the oversized lockup
   that closes every page there. */
footer{background:var(--foot-surface);color:var(--foot-sub);margin-top:56px;
  border-top:1px solid var(--foot-line)}
footer .wrap{padding-top:clamp(40px,5vw,64px);padding-bottom:clamp(32px,4vw,48px)}
footer p{margin:0 0 12px;font-size:12px;line-height:1.7;max-width:900px;color:var(--foot-soft)}
footer a{color:var(--foot-sub);text-decoration:none;border-bottom:1px solid var(--foot-line)}
footer a:hover{color:var(--foot-ink);border-bottom-color:var(--foot-sub)}
.foot-lockup{display:flex;align-items:center;gap:clamp(12px,1.4vw,20px);
  border-top:1px solid var(--foot-line);margin-top:28px;padding-top:clamp(24px,3vw,36px)}
.foot-lockup svg{width:clamp(34px,4.4vw,56px);height:auto}
.foot-lockup span{font-size:clamp(26px,7vw,58px);line-height:.9;letter-spacing:-.035em;
  font-weight:600;color:var(--foot-ink);white-space:nowrap}
.foot-lockup span i{font-style:normal;color:var(--foot-accent)}

:focus-visible{outline:2px solid var(--accent-text);outline-offset:2px}
@media(max-width:640px){
  .nav{min-height:0;padding:12px 16px;gap:10px}
  .nav .eyebrow[data-asof]{display:none}
  .nav-cta{margin-left:auto;padding:0 12px}
  h1{font-size:32px}
  .tcap{padding:14px 16px}
  h2{margin-top:28px}
  th,td{padding:0 10px}
  thead th{padding:10px;font-size:9px;letter-spacing:.03em}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}
  .card:hover,.card:focus-visible{transform:none;box-shadow:none}}
`.trim();

// Crown Ridge mark, inlined from logo/crown-ridge-mark.svg. Its fills are theme
// tokens so the tile darkens and takes a hairline on the onyx ground.
const MARK = `<svg width="30" height="30" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">`
  + `<rect x=".5" y=".5" width="47" height="47" rx="5" fill="var(--logo-tile)" stroke="var(--logo-stroke)"/>`
  + `<path d="M9 32V16l7.5 8L24 14l7.5 10L39 16v16z" fill="var(--logo-crown)"/>`
  + `<rect x="9" y="35" width="30" height="4" fill="var(--logo-gold)"/></svg>`;

// The same mark again for the footer's closing lockup, where the CSS scales it
// with the wordmark beside it. Sized by the stylesheet, not this attribute.
const MARK_LG = MARK.replace('width="30" height="30"', 'width="56" height="56"');

function page({ title, desc, canonical, jsonld, body, prev, next }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${prev ? `<link rel="prev" href="${prev}">` : ''}${next ? `<link rel="next" href="${next}">` : ''}
<meta name="robots" content="index, follow, max-snippet:-1">
<link rel="icon" href="/favicon.ico?v=2" sizes="32x32">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ORIGIN}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F4F5F0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
<!-- Theme, resolved before first paint so the page never flashes the wrong one.
     Reads the same localStorage key the dashboard writes (src/app.jsx), so a
     reader who chose dark there stays in dark here; falls back to the OS
     preference on a first visit. Wrapped because localStorage throws outright in
     a cookie-blocked context, and a static page must still render if it does. -->
<script>try{var t=localStorage.getItem('sov-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
<header><div class="nav">
  <span class="tile">${MARK}</span>
  <div>
    <a class="brand" href="/">Sovereign <span>Insights</span></a>
    <div class="eyebrow brand-sub" data-asof>Norway GPFG &middot; Equity Holdings &middot; ${AS_OF_LABEL}</div>
  </div>
  <a class="nav-cta" href="/">Open dashboard</a>
</div></header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap">
  <p>Holdings sourced from NBIM's published GPFG equity disclosure, joined with market data from Yahoo Finance. Snapshot dated ${AS_OF_LABEL} &mdash; not live.</p>
  <p>Sovereign Insights is an independent research tool published by <a href="https://learnbasecase.com">Basecase</a>. It is not affiliated with or endorsed by NBIM, Norges Bank, or the Norwegian government. Nothing here is investment advice.</p>
  <p><a href="/">Open the interactive dashboard</a> &middot; <a href="/holdings/">All sectors</a> &middot; <a href="/llms.txt">llms.txt</a></p>
  <div class="foot-lockup">${MARK_LG}<span>Sovereign <i>Insights</i></span></div>
</div></footer>
</body>
</html>`;
}

const crumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem', position: i + 1, name: it.name, item: it.url,
  })),
});

function table(list) {
  const head = ['Company', 'Ticker', 'Country', 'Fund value (USD)', 'Fund value (NOK)',
    'Ownership', 'Voting', 'Price', 'P/E', 'Market cap', 'Analyst rec'];
  return `<div class="tw">
<p class="tcap">Every position in this sector, largest first. Values are the fund's holding; ownership is the share of the company held.</p>
<div class="tscroll"><table>
<thead><tr>${head.map((h, i) => `<th scope="col"${i >= 3 ? ' style="text-align:right"' : ''}>${h}</th>`).join('')}</tr></thead>
<tbody>
${list.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td class="mono">${esc(r.ticker)}</td><td>${esc(r.country)}</td><td class="n">${money(r.mvUsd, '$')}</td><td class="n">${money(r.mvNok, 'kr')}</td><td class="n">${pct(r.ownership)}</td><td class="n">${esc(r.voting ?? '—')}</td><td class="n">${num(r.price)}</td><td class="n">${num(r.pe)}</td><td class="n">${money(r.marketCap, '$')}</td><td>${esc(rec(r.rec))}</td></tr>`).join('\n')}
</tbody></table></div></div>`;
}

// ── Write pages ─────────────────────────────────────────────────────────────
mkdirSync(resolve(DIST, 'holdings'), { recursive: true });
const urls = [{ loc: `${ORIGIN}/`, pri: '1.0' }, { loc: `${ORIGIN}/holdings/`, pri: '0.9' }];
let written = 0;

// Hub
writeFileSync(resolve(DIST, 'holdings/index.html'), page({
  title: `All ${rows.length.toLocaleString('en-US')} Norway GPFG equity holdings, by sector`,
  desc: `Browse every one of the ${rows.length.toLocaleString('en-US')} public equity positions held by Norway's Government Pension Fund Global, grouped into ${sectors.length} sectors. Fund value, ownership stake, and valuation metrics for each. Snapshot as of ${AS_OF}.`,
  canonical: `${ORIGIN}/holdings/`,
  jsonld: {
    '@context': 'https://schema.org',
    '@graph': [
      crumbs([{ name: 'Sovereign Insights', url: `${ORIGIN}/` }, { name: 'Holdings', url: `${ORIGIN}/holdings/` }]),
      {
        '@type': 'Dataset',
        name: 'Norway GPFG equity holdings by sector',
        description: `All ${rows.length} public equity positions held by Norway's Government Pension Fund Global, grouped by sector.`,
        temporalCoverage: AS_OF,
        url: `${ORIGIN}/holdings/`,
        creator: { '@type': 'Organization', name: 'Basecase', url: 'https://learnbasecase.com' },
        isBasedOn: 'https://www.nbim.no/en/responsible-investment/holdings/',
      },
      {
        '@type': 'ItemList',
        itemListElement: sectors.map((s, i) => ({
          '@type': 'ListItem', position: i + 1, name: s.name, url: `${ORIGIN}/holdings/${s.slug}.html`,
        })),
      },
    ],
  },
  body: `<nav class="crumb"><a href="/">Dashboard</a> / Holdings</nav>
<h1>Norway GPFG equity holdings</h1>
<p class="lede">Norway's Government Pension Fund Global &mdash; the world's largest sovereign wealth fund &mdash; held <strong>${rows.length.toLocaleString('en-US')}</strong> listed equity positions worth <strong>${money(TOTAL_USD, '$')}</strong> across ${sectors.length} sectors and six markets as of ${AS_OF_LABEL}. Every position is listed below with the fund's stake and standard valuation metrics.</p>
<div class="grid">
${sectors.map((s) => `<a class="card" href="/holdings/${s.slug}.html"><span class="eyebrow">${esc(s.name)}</span><b>${money(s.usd, '$')}</b><span class="m">${s.count} holdings &middot; ${((s.usd / TOTAL_USD) * 100).toFixed(1)}% of value</span></a>`).join('\n')}
</div>
<p class="lede">Or open the interactive dashboard to filter, sort, and compare these holdings.</p>
<p><a class="btn btn-primary" href="/">Open the dashboard</a></p>`,
}));
written++;

// Sector pages
for (const s of sectors) {
  for (let p = 1; p <= s.pages; p++) {
    const file = p === 1 ? `${s.slug}.html` : `${s.slug}-${p}.html`;
    const url = `${ORIGIN}/holdings/${file}`;
    const slice = s.list.slice((p - 1) * PER_PAGE, p * PER_PAGE);
    const suffix = s.pages > 1 ? ` (page ${p} of ${s.pages})` : '';
    const prev = p > 1 ? `${ORIGIN}/holdings/${p === 2 ? `${s.slug}.html` : `${s.slug}-${p - 1}.html`}` : null;
    const next = p < s.pages ? `${ORIGIN}/holdings/${s.slug}-${p + 1}.html` : null;

    writeFileSync(resolve(DIST, 'holdings', file), page({
      // Literal character, not an HTML entity: title/desc go through esc(), which
      // would turn "&mdash;" into a visible "&amp;mdash;".
      title: `Norway GPFG ${s.name} holdings — ${s.count} positions${suffix}`,
      desc: `The ${s.count} ${s.name.toLowerCase()} companies held by Norway's Government Pension Fund Global, worth ${money(s.usd, '$')}. Fund value, ownership stake, P/E, and market cap for each. Snapshot as of ${AS_OF}.`,
      canonical: url, prev, next,
      jsonld: {
        '@context': 'https://schema.org',
        '@graph': [
          crumbs([
            { name: 'Sovereign Insights', url: `${ORIGIN}/` },
            { name: 'Holdings', url: `${ORIGIN}/holdings/` },
            { name: s.name, url: `${ORIGIN}/holdings/${s.slug}.html` },
          ]),
          {
            '@type': 'Dataset',
            name: `Norway GPFG ${s.name} equity holdings`,
            description: `${s.count} ${s.name} companies held by Norway's Government Pension Fund Global, worth ${money(s.usd, '$')}.`,
            temporalCoverage: AS_OF,
            url,
            variableMeasured: ['Fund value (USD)', 'Fund value (NOK)', 'Ownership percentage',
              'Voting rights', 'Share price', 'Price/earnings ratio', 'Market capitalisation', 'Analyst recommendation'],
            creator: { '@type': 'Organization', name: 'Basecase', url: 'https://learnbasecase.com' },
            isBasedOn: 'https://www.nbim.no/en/responsible-investment/holdings/',
          },
        ],
      },
      body: `<nav class="crumb"><a href="/">Dashboard</a> / <a href="/holdings/">Holdings</a> / ${esc(s.name)}</nav>
<h1>Norway GPFG ${esc(s.name)} holdings</h1>
<p class="lede">Norway's Government Pension Fund Global holds <strong>${s.count}</strong> ${esc(s.name.toLowerCase())} companies worth <strong>${money(s.usd, '$')}</strong> &mdash; ${((s.usd / TOTAL_USD) * 100).toFixed(1)}% of its listed equity value &mdash; as of ${AS_OF_LABEL}.${suffix ? ` Showing positions ${(p - 1) * PER_PAGE + 1}&ndash;${Math.min(p * PER_PAGE, s.count)}.` : ''}</p>
${table(slice)}
${s.pages > 1 ? `<nav class="pager">${prev ? `<a class="btn" href="${prev}">&larr; Previous</a>` : ''}<span>Page ${p} of ${s.pages}</span>${next ? `<a class="btn" href="${next}">Next &rarr;</a>` : ''}</nav>` : ''}
<nav class="pager"><a class="btn" href="/holdings/">All sectors</a><a class="btn btn-primary" href="/">Open the dashboard</a></nav>`,
    }));
    urls.push({ loc: url, pri: '0.8' });
    written++;
  }
}

// ── Sitemap (this script owns it, so it can never drift from the pages) ─────
writeFileSync(resolve(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${AS_OF}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`).join('\n') +
  `\n</urlset>\n`);

console.log(`static: ${written} page(s) in dist/holdings/, ${urls.length} sitemap URLs, ${rows.length} holdings, as of ${AS_OF}`);
