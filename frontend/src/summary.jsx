import React from 'react';
import { fmt, btn } from './format.jsx';
import { Histogram, Treemap } from './charts.jsx';
import { sectorOf } from './sectors.js';

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

export function Summary({ data, filtered, onPickCompany, onSetFilter, activeSectors = [], onClearSectors, onOwnSelect }) {
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

  const top10 = React.useMemo(
    () => [...filtered].sort((a, b) => b.mvNok - a.mvNok).slice(0, 8),
    [filtered]
  );

  // Sector breakdown (share of total USD value)
  const sectors = React.useMemo(() => {
    const bySector = new Map();
    let tot = 0;
    for (const c of filtered) {
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
  }, [filtered]);

  const owns = React.useMemo(() => filtered.map(c => c.ownership).filter(v => v > 0), [filtered]);
  const ownStats = React.useMemo(() => ({
    median: median(owns),
    topDecile: percentile(owns, 0.9),
    above5: owns.filter(v => v >= 5).length,
    max: owns.length ? Math.max(...owns) : 0,
  }), [owns]);

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
            Norway&apos;s Government Pension Fund Global holds positions in {data.length.toLocaleString()} public companies across six markets.
            Filter, compare, and click through to see how every krone is allocated.
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
              <p className="eyebrow" style={{ margin: '2px 0 0' }}>Market value in NOK</p>
            </div>
            <span className="eyebrow">Top 8 of {filtered.length.toLocaleString()}</span>
          </div>
          <ol className="r-acct">
            {top10.map(c => (
              <li key={c.ticker || c.name}>
                <button type="button" className="r-acct-row" onClick={() => onPickCompany(c)}>
                  <span className="r-acct-init" aria-hidden="true">{(c.name || '').charAt(0)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="r-acct-name" style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span className="mono" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--soft)' }}>{c.ticker}, {countryCode(c.country)}</span>
                  </span>
                  <span className="mono" style={{ fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>{fmt.money(c.mvNok, 'NOK', 1)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The ruled tally, in one glass strip at the foot of the photograph. */}
      <dl className="r-tally glass" style={{ margin: 0 }}>
        <TallyCell lead label="Total holdings" value={fmt.money(totalUsd, 'USD', 1)}
          sub={`${fmt.money(totalNok, 'NOK', 1)}, across ${filtered.length.toLocaleString()} companies`} />
        <TallyCell label="Avg ownership" value={fmt.pct(avgOwn, 2)} sub={`${ownStats.above5} positions above 5%`} />
        <TallyCell label="Markets covered" value={countries.toString()} sub={`${sectorCount} sectors`} />
        <TallyCell
          label="Top position"
          value={top10[0] ? top10[0].name : 'n/a'}
          sub={top10[0] ? `${top10[0].ticker}, ${fmt.money(top10[0].mvUsd, 'USD', 1)}` : ''}
          onClick={top10[0] ? () => onPickCompany(top10[0]) : undefined}
        />
      </dl>

      {/* Sectors: a ruled list beside one pane. Every row and every tile filters the ledger. */}
      <section className="r-sec" aria-labelledby="sector-head">
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
        <div className="r-duo">
          <ul className="r-rows">
            {sectors.map(it => (
              <li key={it.label}>
                <button type="button" className="r-row-btn" aria-pressed={activeSectors.includes(it.label)}
                  onClick={() => onSetFilter && it.label !== 'n/a' && onSetFilter({ sector: it.label })}>
                  <span className="r-row-name">{it.label}</span>
                  <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>{it.pct.toFixed(1)}%</span>
                  <span className="r-row-bar" aria-hidden="true">
                    <span style={{ transform: `scaleX(${sectors[0].pct ? it.pct / sectors[0].pct : 0})`, background: it.color }}/>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="glass" style={{ padding: 'var(--space-md)' }}>
            <Treemap items={sectors} height={580}
              onClick={(it) => onSetFilter && it.label !== 'n/a' && onSetFilter({ sector: it.label })}
            />
          </div>
        </div>
      </section>

      {/* Ownership: slim bars, then the ruled tally of four figures under them. */}
      <section className="r-sec" aria-labelledby="own-head">
        <div className="r-sec-head">
          <div>
            <h2 id="own-head">Ownership distribution</h2>
            <p>Share held, per company</p>
          </div>
          <span className="eyebrow">{owns.length.toLocaleString()} companies</span>
        </div>
        <Histogram data={owns} bins={28} height={160} accent="var(--accent)"
          xFmt={v => v.toFixed(1) + '%'} onSelect={onOwnSelect}/>
        <dl className="r-tally" style={{ margin: 'var(--space-lg) 0 0' }}>
          <TallyCell label="Median" value={fmt.pct(ownStats.median, 2)}/>
          <TallyCell label="Top decile" value={fmt.pct(ownStats.topDecile, 2)}/>
          <TallyCell label="Above 5%" value={ownStats.above5.toLocaleString()}/>
          <TallyCell label="Max" value={fmt.pct(ownStats.max, 2)}/>
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

// One cell of the ruled tally: a label, the figure, one line under it. A cell that
// opens something renders its figure as a real <button>, so it is reachable by
// keyboard and announced as a control; a static one stays text.
export function TallyCell({ label, value, sub, onClick, lead = false }) {
  const fig = `r-tally-fig${lead ? ' is-lead' : ''}`;
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
