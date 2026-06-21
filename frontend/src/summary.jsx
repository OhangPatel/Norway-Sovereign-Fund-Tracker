import React from 'react';
import { fmt } from './format.jsx';
import { TopBarList, Histogram, Treemap } from './charts.jsx';

// Summary section: hero bento + charts (top holdings, sector treemap, ownership histogram)

// Each sector mapped to its semantic Lime --sector-* token (STYLE_GUIDE §2).
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
      const s = c.sector || c.industry;
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
  const topMax = top10[0]?.mvNok || 1;

  // Sector breakdown (share of total USD value)
  const sectors = React.useMemo(() => {
    const bySector = new Map();
    let tot = 0;
    for (const c of filtered) {
      const k = c.sector || c.industry || '—';
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

  return (
    <section style={{ display:'grid', gridTemplateColumns:'1fr', gap: 20 }}>
      {/* Hero bento (STYLE_GUIDE §6) */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gridAutoRows: 'minmax(118px, auto)', gap: 14,
      }}>
        {/* Lead card — spans 3×2 */}
        <div className="card" style={{
          gridColumn: 'span 3', gridRow: 'span 2', borderRadius: 24,
          padding: 'clamp(28px, 3vw, 44px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="eyebrow" style={{ color: 'var(--accent-text)' }}>Portfolio · Quarterly cut</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--soft)' }}>[ 01 / 04 ]</div>
          </div>
          <h1 className="display" style={{
            fontSize: 'clamp(32px, 4.2vw, 58px)', fontWeight: 600,
            lineHeight: 0.99, letterSpacing: '-0.03em', margin: '20px 0', maxWidth: 760, textWrap: 'balance',
          }}>
            The world&apos;s largest sovereign wealth fund, tracked equity by equity.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--sub)', maxWidth: 560, margin: 0 }}>
            Norway&apos;s Government Pension Fund Global holds positions in {fmt.short(data.length, 0)}+ public companies across six markets.
            Filter, compare, and click through to see how every krone is allocated.
          </p>
        </div>

        {/* Feature card — spans 1×3, inverts between themes */}
        <div style={{
          gridRow: 'span 3', background: 'var(--feature)', color: 'var(--feature-ink)',
          borderRadius: 24, padding: '32px 30px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          transition: 'transform .18s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
        >
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--feature-sub)' }}>Total holdings</div>
          <div>
            <div className="display" style={{ fontSize: 'clamp(34px, 3vw, 46px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 0.95, color: 'var(--feature-num)' }}>
              {fmt.money(totalUsd, 'USD', 1)}
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--feature-sub)', marginTop: 10 }}>
              {fmt.money(totalNok, 'NOK', 1)} · {filtered.length.toLocaleString()} cos
            </div>
          </div>
        </div>

        {/* Stat cells — single cells fill the bottom row */}
        <StatCell label="Avg ownership" value={fmt.pct(avgOwn, 2)} sub={`${ownStats.above5} positions above 5%`} />
        <StatCell label="Markets covered" value={countries.toString()} sub={`${sectorCount} sectors`} />
        <StatCell
          label="Top position"
          value={top10[0] ? top10[0].name : '—'}
          sub={top10[0] ? `${top10[0].ticker} · ${fmt.money(top10[0].mvUsd, 'USD', 1)}` : ''}
          clickable
          onClick={() => top10[0] && onPickCompany(top10[0])}
        />
      </div>

      {/* Detail row: holdings table + sector treemap (STYLE_GUIDE §6) */}
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 14 }}>
          <Card title="Top holdings" eyebrow="Market value · NOK"
            rightSlot={<span className="eyebrow">Top 8 / {filtered.length.toLocaleString()}</span>}
          >
            <TopBarList
              items={top10.map(c => ({
                key: c.ticker,
                label: c.name,
                sub: (c.ticker || '') + ' · ' + ((c.country || '').slice(0,3).toUpperCase()),
                value: c.mvNok,
                raw: c
              }))}
              max={topMax}
              valueFmt={v => fmt.money(v, 'NOK', 1)}
              onClick={(it) => onPickCompany(it.raw)}
              accent="var(--accent)"
            />
          </Card>

          <Card title="Sector weight*" eyebrow="By USD value"
            rightSlot={activeSectors.length ? (
              <button onClick={onClearSectors} className="eyebrow" style={{
                cursor: 'pointer', border: '1px solid var(--line)', borderRadius: 6,
                background: 'var(--surface)', color: 'var(--ink)', padding: '3px 9px',
              }}>← All sectors</button>
            ) : (
              <span className="eyebrow">{sectors.length} sectors</span>
            )}
          >
            <Treemap items={sectors} height={300}
              onClick={(it) => onSetFilter && it.label !== '—' && onSetFilter({ sector: it.label })}
            />
            <div className="mono" style={{ fontSize: 10, color: 'var(--soft)', marginTop: 12, lineHeight: 1.4 }}>
              * Tile areas are approximate — the smallest sectors are enlarged so they stay clickable. Hover any tile for its true share; click to filter.
            </div>
          </Card>
        </div>

        {/* Ownership distribution — full-width histogram panel */}
        <Card title="Ownership distribution" eyebrow="% per holding"
          rightSlot={<span className="eyebrow">{owns.length.toLocaleString()} cos</span>}
        >
          <div style={{ paddingTop: 6 }}>
            <Histogram data={owns} bins={28} height={130} accent="var(--accent)"
              xFmt={v => v.toFixed(1) + '%'} onSelect={onOwnSelect}/>
            <div style={{
              display:'flex', justifyContent:'space-between', alignItems:'baseline',
              marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)'
            }}>
              <StatMini label="Median" value={fmt.pct(ownStats.median, 2)}/>
              <StatMini label="Top decile" value={fmt.pct(ownStats.topDecile, 2)}/>
              <StatMini label="Above 5%" value={ownStats.above5.toLocaleString()}/>
              <StatMini label="Max" value={fmt.pct(ownStats.max, 2)}/>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

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

export function StatCell({ label, value, sub, clickable, onClick }) {
  return (
    <div
      className="card"
      onClick={clickable ? onClick : undefined}
      style={{
        padding: '20px 22px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--soft)' }}>{label}</div>
      <div className="display" style={{
        fontSize: 32, fontWeight: 600, lineHeight: 1.1, marginTop: 8, letterSpacing: '-0.02em',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
      }}>{value}</div>
      <div className="mono" style={{ fontSize: 11, color:'var(--soft)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

export function StatMini({ label, value }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 9 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, color: 'var(--ink)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

export function Card({ title, eyebrow, rightSlot, children, padding = 22 }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 24, padding }}>
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'baseline',
        marginBottom: 14, gap: 10
      }}>
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <div className="display" style={{ fontSize: 19, marginTop: 2, letterSpacing: '-0.01em' }}>
            {title}
          </div>
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

Object.assign(window, { Summary, Card, SECTOR_COLORS });
