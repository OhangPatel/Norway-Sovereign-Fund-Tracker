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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const ORIGIN = 'https://invest.learnbasecase.com';
const PER_PAGE = 200;

// data.json carries two sector taxonomies: `sector` uses Yahoo's names, while 78
// rows have no sector and fall back to `industry`, which uses GICS names. The app
// does the same `sector || industry` fallback, so mirror it here and fold the GICS
// synonyms onto their Yahoo equivalents — otherwise "Health Care" and "Healthcare"
// become two pages competing for the same topic.
// NOTE: the app's own Sector filter shows both spellings for this same reason.
// The real fix is normalising in the pipeline; see audit.
const CANON = {
  'Health Care': 'Healthcare',
  'Financials': 'Financial Services',
  'Consumer Discretionary': 'Consumer Cyclical',
  'Consumer Staples': 'Consumer Defensive',
  'Telecommunications': 'Communication Services',
};

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

const sectorOf = (r) => {
  const s = r.sector || r.industry || 'Unclassified';
  return CANON[s] || s;
};

const bySector = new Map();
for (const r of rows) {
  const s = sectorOf(r);
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
:root{--bg:#F4F3EE;--surface:#fff;--line:#E4E2DA;--ink:#1B1A17;--sub:#5F5B52;--soft:#6B685F;--accent:#D6E134;--accent-ink:#6F7610;--zebra:#FAF9F5;
  --logo-tile:#16181B;--logo-stroke:transparent;--logo-crown:#F7F6F2;--logo-gold:#C9A227}
/* Onyx field — neutral greys, mirroring the app's dark tokens in index.html.
   Not the same names (these pages predate the token set and have no theme
   toggle, only the OS preference), but the same values, so a reader arriving
   from the dashboard lands on the same ground. */
@media(prefers-color-scheme:dark){:root{--bg:#000000;--surface:#1C1C1E;--line:#2C2C2E;--ink:#FFFFFF;--sub:#98989D;--soft:#8E8E93;--accent:#D6E134;--accent-ink:#D6E134;--zebra:#161618;
  --logo-tile:#0F1113;--logo-stroke:#2B2F33}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);line-height:1.6;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.wrap{max-width:1240px;margin:0 auto;padding:0 clamp(16px,3vw,32px)}
header{border-bottom:1px solid var(--line);background:var(--surface)}
.hd{display:flex;align-items:center;gap:12px;padding:16px 0;flex-wrap:wrap}
.tile{flex-shrink:0;line-height:0}
.brand{font-weight:650;letter-spacing:-.01em;text-decoration:none;color:var(--ink)}
.brand span{color:var(--accent-ink)}
nav.crumb{font-size:13px;color:var(--soft);padding:14px 0}
nav.crumb a{color:var(--sub)}
h1{font-size:clamp(24px,3.4vw,36px);letter-spacing:-.022em;margin:18px 0 6px;text-wrap:balance}
.lede{color:var(--sub);max-width:70ch;margin:0 0 18px}
.eyebrow{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;text-transform:uppercase;
  letter-spacing:.12em;color:var(--soft)}
a{color:var(--ink)}
a:hover{background:var(--accent);color:#1B1A17}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--surface);margin:18px 0}
table{border-collapse:collapse;width:100%;font-size:14px}
caption{text-align:left;padding:14px 16px;color:var(--soft);font-size:13px;border-bottom:1px solid var(--line)}
th,td{padding:9px 14px;text-align:left;white-space:nowrap}
thead th{position:sticky;top:0;background:var(--surface);border-bottom:1px solid var(--line);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;text-transform:uppercase;
  letter-spacing:.08em;color:var(--soft);font-weight:500}
tbody tr:nth-child(even){background:var(--zebra)}
tbody th{font-weight:550;white-space:normal;min-width:180px}
td.n{text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin:20px 0}
.card{border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:16px 18px;text-decoration:none;display:block;color:var(--ink)}
.card:hover{border-color:var(--accent-ink);background:var(--surface)}
.card b{display:block;font-size:17px;letter-spacing:-.01em;margin-bottom:4px}
.card .m{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--soft)}
.pager{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:18px 0;font-size:14px}
footer{border-top:1px solid var(--line);margin-top:40px;padding:22px 0 60px;color:var(--soft);font-size:13px}
:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`.trim();

// Crown Ridge mark, inlined from logo/crown-ridge-mark.svg. Its fills are theme
// tokens so the tile darkens and takes a hairline on the onyx ground.
const MARK = `<svg width="30" height="30" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">`
  + `<rect x=".5" y=".5" width="47" height="47" rx="5" fill="var(--logo-tile)" stroke="var(--logo-stroke)"/>`
  + `<path d="M9 32V16l7.5 8L24 14l7.5 10L39 16v16z" fill="var(--logo-crown)"/>`
  + `<rect x="9" y="35" width="30" height="4" fill="var(--logo-gold)"/></svg>`;

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
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
<header><div class="wrap hd">
  <span class="tile">${MARK}</span>
  <a class="brand" href="/">Sovereign <span>Insights</span></a>
  <span class="eyebrow" style="margin-left:auto">Norway GPFG &middot; as of ${AS_OF_LABEL}</span>
</div></header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap">
  <p>Holdings sourced from NBIM's published GPFG equity disclosure, joined with market data from Yahoo Finance. Snapshot dated ${AS_OF_LABEL} &mdash; not live.</p>
  <p>Sovereign Insights is an independent research tool published by <a href="https://learnbasecase.com">Basecase</a>. It is not affiliated with or endorsed by NBIM, Norges Bank, or the Norwegian government. Nothing here is investment advice.</p>
  <p><a href="/">Open the interactive dashboard</a> &middot; <a href="/holdings/">All sectors</a> &middot; <a href="/llms.txt">llms.txt</a></p>
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
  return `<div class="tw"><table>
<caption>Every position in this sector, largest first. Values are the fund's holding; ownership is the share of the company held.</caption>
<thead><tr>${head.map((h, i) => `<th scope="col"${i >= 3 ? ' style="text-align:right"' : ''}>${h}</th>`).join('')}</tr></thead>
<tbody>
${list.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td class="mono">${esc(r.ticker)}</td><td>${esc(r.country)}</td><td class="n">${money(r.mvUsd, '$')}</td><td class="n">${money(r.mvNok, 'kr')}</td><td class="n">${pct(r.ownership)}</td><td class="n">${esc(r.voting ?? '—')}</td><td class="n">${num(r.price)}</td><td class="n">${num(r.pe)}</td><td class="n">${money(r.marketCap, '$')}</td><td>${esc(rec(r.rec))}</td></tr>`).join('\n')}
</tbody></table></div>`;
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
${sectors.map((s) => `<a class="card" href="/holdings/${s.slug}.html"><b>${esc(s.name)}</b><span class="m">${s.count} holdings &middot; ${money(s.usd, '$')} &middot; ${((s.usd / TOTAL_USD) * 100).toFixed(1)}% of value</span></a>`).join('\n')}
</div>
<p><a href="/">Open the interactive dashboard</a> to filter, sort, and compare these holdings.</p>`,
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
${s.pages > 1 ? `<nav class="pager">${prev ? `<a href="${prev}">&larr; Previous</a>` : ''}<span class="mono">Page ${p} of ${s.pages}</span>${next ? `<a href="${next}">Next &rarr;</a>` : ''}</nav>` : ''}
<p><a href="/holdings/">All sectors</a> &middot; <a href="/">Open the interactive dashboard</a></p>`,
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
