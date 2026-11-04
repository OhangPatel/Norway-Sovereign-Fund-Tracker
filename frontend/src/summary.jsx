import React from 'react';
import { fmt, btn, CompanyLogo } from './format.jsx';
import { Histogram, Treemap } from './charts.jsx';
import { sectorOf } from './sectors.js';
import { useSeen } from './motion.js';

// Summary: the photo hero with the top holdings in glass, the ruled tally, then the sector and ownership sections.

// Each sector mapped to its --sector-* token (index.html, one quiet family under Dusk).
export var SECTOR_COLORS = {
  'Technology':            'var(--sector-tech)',
  'Communication Services':'var(--sector-tech)',
  'Telecommunications':    'var(--sector-tech)',
  'Financial Services':    'var(--sector-financials)',
  'Financials':            'var(--sector-financials)',
  'Healthcare':            'var(--sector-healthcare)',
  'Health Care':           'var(--sector-healthcare)',
  'Energy':                'var(--sector-energy)',
  'Basic Materials':       'var(--sector-energy)',
  'Industrials':           'var(--sector-industrials)',
  'Consumer Cyclical':     'var(--sector-consumer)',
  'Consumer Discretionary':'var(--sector-consumer)',
  'Consumer Defensive':    'var(--sector-consumer)',
  'Consumer Staples':      'var(--sector-consumer)',
  'Utilities':             'var(--sector-utilities)',
  'Real Estate':           'var(--sector-realestate)',
  '':                      'var(--soft)',
};

// Where .r-duo stacks into one column (index.html, max-width 900px). The sector list is
// dropped there: stacked over the treemap it only repeated the same names and shares.
// The treemap then carries them alone, sized by its width (1.8x on a phone) so the small
// sectors keep room for a label.
const STACKED_QUERY = '(max-width: 900px)';
const subscribeStacked = (cb) => {
  const mq = window.matchMedia(STACKED_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const useStacked = () => React.useSyncExternalStore(subscribeStacked, () => window.matchMedia(STACKED_QUERY).matches);

// Ownership bands by panel width, widest first. None is narrower than 0.5, and each narrower
// set only merges bands of the one above it, so an edge never moves between screens. They
// widen as they climb because companies crowd under 3% and only a handful sit above 10%;
// every band holds companies in all seven periods. A minWidth keeps that set's labels apart.
const OWNERSHIP_TIERS = [
  { minWidth: 900, edges: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10, 15] },
  { minWidth: 560, edges: [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] },
  { minWidth: 290, edges: [0, 0.5, 1, 1.5, 2, 3, 5, 10] },
  { minWidth: 0, edges: [0, 1, 2, 3, 5, 10] },
];

export function Summary({ data, filtered, sectorBase, onPickCompany, onSetFilter, activeSectors = [], onClearSectors, onOwnSelect, periodInfo }) {
  const stacked = useStacked();
  const { totalNok, totalUsd, avgOwn, countries, sectorCount } = React.useMemo(() => {
    let totalNok = 0, totalUsd = 0, ownSum = 0;
    const countrySet = new Set();
    const sectorSet = new Set();
    for (const c of filtered) {
      totalNok += c.mvNok || 0;
      totalUsd += c.mvUsd || 0;
      ownSum += c.ownership || 0;
      countrySet.add(c.country);
      const s = sectorOf(c);
      if (s) sectorSet.add(s);
    }
    return {
      totalNok, totalUsd,
      avgOwn: filtered.length ? ownSum / filtered.length : 0,
      countries: countrySet.size,
      sectorCount: sectorSet.size,
    };
  }, [filtered]);

  // The hero's top holdings are the fund's, whatever the filters below are set to:
  // the hero is the overview, and a sector pick used to turn it into that sector's top 8.
  const top10 = React.useMemo(
    () => [...data].sort((a, b) => b.mvUsd - a.mvUsd).slice(0, 8),
    [data]
  );

  // Sector breakdown (share of total USD value), over every filter but the sector
  // pick (sectorBase, app.jsx), so all sectors stay on screen and the pick is marked.
  const sectors = React.useMemo(() => {
    const bySector = new Map();
    let tot = 0;
    for (const c of sectorBase) {
      const k = sectorOf(c, 'n/a');
      bySector.set(k, (bySector.get(k) || 0) + c.mvUsd);
      tot += c.mvUsd || 0;
    }
    return [...bySector.entries()]
      .map(([label, value]) => ({
        label, value,
        pct: tot ? (value / tot) * 100 : 0,
        color: SECTOR_COLORS[label] || 'var(--soft)',
      }))
      .sort((a, b) => b.value - a.value);
  }, [sectorBase]);

  // A sector row or tile picks that sector; picking the one already picked clears it,
  // now that the others stay on screen to switch to.
  const pickSector = (label) => {
    if (!onSetFilter || label === 'n/a') return;
    if (activeSectors.includes(label)) onClearSectors();
    else onSetFilter({ sector: label });
  };

  const owns = React.useMemo(() => filtered.map(c => c.ownership).filter(v => v > 0), [filtered]);
  const ownStats = React.useMemo(() => ({
    median: median(owns),
    topDecile: percentile(owns, 0.9),
    above5: owns.filter(v => v >= 5).length,
    max: owns.length ? Math.max(...owns) : 0,
  }), [owns]);

  // The sector a pointer or focus rests on, in the list or on the treemap: each lights
  // the other's matching mark.
  const [hot, setHot] = React.useState(null);
  // Each chart section grows its marks the first time it is on screen (motion.js).
  const [sectorRef, sectorSeen] = useSeen();
  const [ownRef, ownSeen] = useSeen();

  // With no filter on, the lead figure is NBIM's own equity total for the period: every
  // company it holds, not only the ones tracked here. A filter can only narrow the tracked
  // rows, so then it is their sum.
  const nbim = filtered.length === data.length && periodInfo?.equityUsd ? periodInfo : null;

  // The hero's one action: down to the ledger, without touching the hash router.
  const toLedger = () => {
    const el = document.getElementById('ledger');
    if (!el) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <>
      {/* Stage hero. The head sits on the photograph's fog; the top holdings sit in
          glass over its dark hills, as a run of accounts. */}
      <section className="r-hero" aria-labelledby="hero-head">
        <div className="on-photo">
          <h1 id="hero-head">The world&apos;s largest sovereign wealth fund, tracked equity by equity.</h1>
          <p className="r-hero-lede">
            This site tracks {data.length.toLocaleString()} of the public companies held by Norway&apos;s Government Pension Fund Global, across six markets.
            Filter, compare, and click through to see how every dollar is allocated.
          </p>
          <div className="r-hero-actions">
            <button type="button" onClick={toLedger} style={{
              ...btn({ variant: 'primary', shape: 'pill' }),
              height: 'var(--control-h-lg)', padding: '0 var(--space-lg)',
            }}>Browse all holdings</button>
          </div>
        </div>

        <div className="glass" style={{ padding: 'var(--space-lg) var(--space-xl) var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-sm)', marginBottom: 'var(--space-2xs)' }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-lg)', lineHeight: 1.2, margin: 0 }}>Top holdings</h2>
              <p className="eyebrow" style={{ margin: '2px 0 0' }}>Market value in USD</p>
            </div>
            <span className="eyebrow">Top 8 of {data.length.toLocaleString()}</span>
          </div>
          <ol className="r-acct">
            {top10.map((c, i) => (
              <li key={c.ticker || c.name} style={{ '--i': i }}>
                <button type="button" className="r-acct-row" onClick={() => onPickCompany(c)}>
                  <CompanyLogo ticker={c.ticker} name={c.name} size={32}/>
                  <span style={{ minWidth: 0 }}>
                    <span className="r-acct-name" style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span className="mono" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--soft)' }}>{c.ticker}, {countryCode(c.country)}</span>
                    <span className="r-acct-bar" aria-hidden="true">
                      <span style={{ '--w': top10[0].mvUsd ? c.mvUsd / top10[0].mvUsd : 0 }}/>
                    </span>
                  </span>
                  <span className="mono" style={{ fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>{fmt.money(c.mvUsd, 'USD', 1)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The ruled tally, in one glass strip at the foot of the photograph. */}
      <dl className="r-tally glass" style={{ margin: 0 }}>
        <TallyCell lead count label="Total holdings" value={fmt.money(nbim ? nbim.equityUsd : totalUsd, 'USD', 1)}
          sub={`${fmt.money(nbim ? nbim.equityNok : totalNok, 'NOK', 1)}, across ${(nbim ? nbim.companies : filtered.length).toLocaleString()} companies`} />
        <TallyCell count label="Avg ownership" value={fmt.pct(avgOwn, 2)} sub={`${ownStats.above5} positions above 5%`} />
        <TallyCell count label="Markets covered" value={countries.toString()} sub={`${sectorCount} sectors`} />
        <TallyCell
          label="Top position"
          value={top10[0] ? top10[0].name : 'n/a'}
          sub={top10[0] ? `${top10[0].ticker}, ${fmt.money(top10[0].mvUsd, 'USD', 1)}` : ''}
          onClick={top10[0] ? () => onPickCompany(top10[0]) : undefined}
        />
      </dl>

      {/* Sectors: a ruled list beside one pane. Every row and every tile filters the ledger. */}
      <section className="r-sec" aria-labelledby="sector-head" ref={sectorRef} data-seen={sectorSeen}>
        <div className="r-sec-head">
          <div>
            {/* The asterisk points at the page footnote in app.jsx. */}
            <h2 id="sector-head">Sector weight*</h2>
            <p>By USD value</p>
          </div>
          {activeSectors.length ? (
            <button type="button" onClick={onClearSectors} style={{ ...btn(), height: 32 }}>Show all sectors</button>
          ) : (
            <span className="eyebrow">{sectors.length} sectors</span>
          )}
        </div>
        <div className="r-duo r-sector-duo">
          {!stacked && (
            <ul className={activeSectors.length ? 'r-rows has-pick' : 'r-rows'}>
              {sectors.map((it, i) => (
                <li key={it.label}>
                  <button type="button" className={`r-row-btn${hot === it.label ? ' is-hot' : ''}`} aria-pressed={activeSectors.includes(it.label)}
                    onMouseEnter={() => setHot(it.label)} onMouseLeave={() => setHot(null)}
                    onFocus={() => setHot(it.label)} onBlur={() => setHot(null)}
                    onClick={() => pickSector(it.label)}>
                    <span className="r-row-name">{it.label}</span>
                    <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>{it.pct.toFixed(1)}%</span>
                    <span className="r-row-bar" aria-hidden="true">
                      <span style={{ '--i': i, transform: `scaleX(${sectors[0].pct ? it.pct / sectors[0].pct : 0})`, background: it.color }}/>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="glass r-sector-map">
            <Treemap items={sectors} height={stacked ? (w => (w < 500 ? w * 1.8 : w)) : 580} highlight={hot} onHover={setHot}
              selected={activeSectors}
              onClick={(it) => pickSector(it.label)}
            />
          </div>
        </div>
      </section>

      {/* Ownership, night by night: slim bars in one glass panel, then the ruled
          tally of four figures under them. */}
      <section className="r-sec" aria-labelledby="own-head" ref={ownRef} data-seen={ownSeen}>
        <div className="r-sec-head">
          <div>
            <h2 id="own-head">Ownership distribution</h2>
            <p>Share held, per company</p>
          </div>
          <span className="eyebrow">{owns.length.toLocaleString()} companies</span>
        </div>
        <div className="glass">
          <Histogram data={owns} tiers={OWNERSHIP_TIERS} height={220}
            caption="% of company owned" onSelect={onOwnSelect}/>
        </div>
        <dl className="r-tally" style={{ margin: 'var(--space-lg) 0 0' }}>
          <TallyCell label="Median" value={<Cents text={fmt.pct(ownStats.median, 2)}/>}/>
          <TallyCell label="Top decile" value={<Cents text={fmt.pct(ownStats.topDecile, 2)}/>}/>
          <TallyCell label="Above 5%" value={ownStats.above5.toLocaleString()}/>
          <TallyCell label="Max" value={<Cents text={fmt.pct(ownStats.max, 2)}/>}/>
        </dl>
      </section>
    </>
  );
}

// Two-letter codes for the six markets the dataset covers. Anything else is spelled
// out rather than guessed: slicing the name gave "UNI" for both United States and
// United Kingdom.
const ISO2 = { 'United States': 'US', 'United Kingdom': 'GB', 'Canada': 'CA', 'Germany': 'DE', 'India': 'IN', 'Singapore': 'SG' };
function countryCode(name) { return ISO2[name] || name || ''; }

export function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b)=>a-b);
  const m = Math.floor(s.length/2);
  return s.length % 2 ? s[m] : (s[m-1]+s[m])/2;
}
export function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b)=>a-b);
  return s[Math.min(s.length-1, Math.floor(p * s.length))];
}

// A figure that counts up from zero once, when it first renders, keeping its prefix,
// decimals and thousands separators ("$ 1.0T", "1.43%", "7,077"). Text with no number
// stays as it is. A screen reader is only ever given the final value, and with
// reduced motion the figure simply appears.
export function CountUp({ text }) {
  const str = String(text);
  const m = /^(.*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(str);
  const [k, setK] = React.useState(() =>
    m && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1);
  React.useEffect(() => {
    if (k === 1) return;
    let raf, start;
    const step = (t) => {
      if (start === undefined) start = t;
      const p = Math.min(1, (t - start) / 1100);
      setK(p === 1 ? 1 : 1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  // Runs once: the count is the arrival, not a reaction to later changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!m || k === 1) return str;
  const [, pre, num, post] = m;
  const dec = (num.split('.')[1] || '').length;
  const n = parseFloat(num.replace(/,/g, '')) * k;
  const shown = num.includes(',')
    ? n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : n.toFixed(dec);
  return <><span aria-hidden="true">{pre}{shown}{post}</span><span className="sr-only">{str}</span></>;
}

// A figure whose decimals sit in the muted ink, the way Dusk sets money ("180.00").
function Cents({ text }) {
  const [whole, frac] = String(text).split('.');
  return <span>{whole}{frac !== undefined && <span style={{ color: 'var(--soft)' }}>.{frac}</span>}</span>;
}

// One cell of the ruled tally: a label, the figure, one line under it. A cell that
// opens something renders its figure as a real <button>, so it is reachable by
// keyboard and announced as a control; a static one stays text. `count` makes a
// text figure count up once (CountUp).
export function TallyCell({ label, value, sub, onClick, lead = false, count = false }) {
  const fig = `r-tally-fig${lead ? ' is-lead' : ''}`;
  if (count && typeof value === 'string') value = <CountUp text={value}/>;
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd style={{ margin: 0 }}>
        {onClick ? (
          <button type="button" onClick={onClick} className={`${fig} lift`} style={{
            display: 'block', maxWidth: '100%', padding: '0 var(--space-xs)', marginLeft: 'calc(-1 * var(--space-xs))',
            background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--r-sm)',
            color: 'inherit', textAlign: 'left', cursor: 'pointer',
          }}>{value}</button>
        ) : (
          <div className={fig}>{value}</div>
        )}
      </dd>
      {sub && <dd className="r-tally-sub" style={{ margin: 0 }}>{sub}</dd>}
    </div>
  );
}

Object.assign(window, { Summary, SECTOR_COLORS });
