import React from 'react';
import { fmt, Icon } from './format.jsx';
import { TopBarList, Histogram, Donut } from './charts.jsx';

// Summary section: stat cards + charts (top holdings, sector donut, ownership histogram)

export var SECTOR_COLORS = {
  'Technology':            'oklch(0.78 0.13 80)',
  'Financial Services':    'oklch(0.72 0.11 230)',
  'Healthcare':            'oklch(0.78 0.13 155)',
  'Consumer Cyclical':     'oklch(0.72 0.14 30)',
  'Consumer Defensive':    'oklch(0.74 0.10 110)',
  'Industrials':           'oklch(0.68 0.07 65)',
  'Communication Services':'oklch(0.72 0.12 310)',
  'Energy':                'oklch(0.7 0.16 50)',
  'Basic Materials':       'oklch(0.7 0.09 200)',
  'Utilities':             'oklch(0.7 0.08 260)',
  'Real Estate':           'oklch(0.72 0.10 20)',
  '':                      'oklch(0.5 0.005 80)',
};

export function Summary({ data, filtered, onPickCompany, onSetFilter }) {
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

  // Sector breakdown
  const sectors = React.useMemo(() => {
    const bySector = new Map();
    for (const c of filtered) {
      const k = c.sector || c.industry || '—';
      bySector.set(k, (bySector.get(k) || 0) + c.mvUsd);
    }
    return [...bySector.entries()]
      .map(([label, value]) => ({ label, value, color: SECTOR_COLORS[label] || 'oklch(0.5 0.005 80)' }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const [sectorHover, setSectorHover] = React.useState(null);
  const activeSlice = sectorHover != null ? sectors[sectorHover] : sectors[0];

  const owns = React.useMemo(() => filtered.map(c => c.ownership).filter(v => v > 0), [filtered]);
  const ownStats = React.useMemo(() => ({
    median: median(owns),
    topDecile: percentile(owns, 0.9),
    above5: owns.filter(v => v >= 5).length,
    max: owns.length ? Math.max(...owns) : 0,
  }), [owns]);

  return (
    <section style={{ display:'grid', gridTemplateColumns:'1fr', gap: 20 }}>
      {/* Editorial top: headline + stat strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
        gap: 32,
        alignItems: 'end',
        padding: '8px 4px 4px',
      }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            <Icon name="dot" size={8} color="var(--accent)"/> &nbsp;Portfolio · Quarterly cut
          </div>
          <h1 className="display" style={{
            fontSize: 'clamp(34px, 4.4vw, 56px)',
            lineHeight: 1.05, margin: 0,
            letterSpacing: '-0.02em',
            fontWeight: 400,
            textWrap: 'balance',
          }}>
            The world&apos;s largest <span className="display-italic">sovereign wealth fund</span>, tracked equity by equity.
          </h1>
          <p style={{
            color: 'var(--muted)', fontSize: 14.5, maxWidth: 560, marginTop: 20, marginBottom: 0, lineHeight: 1.55
          }}>
            Norway&apos;s Government Pension Fund Global holds positions in {fmt.short(data.length, 0)}+ public companies across six markets.
            Filter, compare, and click through to see how every krone is allocated.
          </p>
        </div>

        <div style={{
          display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap: 1,
          background: 'var(--hairline)',
          border: '1px solid var(--hairline)', borderRadius: 14, overflow: 'hidden',
        }}>
          <StatCell
            label="Total holdings"
            value={fmt.money(totalUsd, 'USD', 1)}
            sub={`${fmt.money(totalNok, 'NOK', 1)} · ${filtered.length.toLocaleString()} of ${data.length.toLocaleString()} cos`}
            accent
          />
          <StatCell
            label="Avg ownership"
            value={fmt.pct(avgOwn, 2)}
            sub={`${ownStats.above5} positions above 5%`}
          />
          <StatCell
            label="Markets covered"
            value={countries.toString()}
            sub={`${sectorCount} sectors`}
          />
          <StatCell
            label="Top single position"
            value={top10[0] ? top10[0].name : '—'}
            sub={top10[0] ? `${top10[0].ticker} · ${fmt.money(top10[0].mvUsd, 'USD', 1)}` : ''}
            clickable
            onClick={() => top10[0] && onPickCompany(top10[0])}
          />
        </div>
      </div>

      {/* Three charts */}
      <div style={{
        display:'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
        gridTemplateAreas: '"top sector" "top own"',
        gap: 16,
      }}>
        {/* Top holdings */}
        <div style={{ gridArea: 'top' }}>
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
        </div>

        {/* Sector donut */}
        <div style={{ gridArea: 'sector' }}>
        <Card title="Sector allocation" eyebrow="By USD value">
          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap: 18, alignItems:'center' }}>
            <div style={{ position: 'relative' }}>
              <Donut slices={sectors} size={170} thickness={20}
                hoverIndex={sectorHover}
                onHover={setSectorHover}
              />
              <div style={{
                position:'absolute', inset:0, display:'grid', placeItems:'center',
                pointerEvents:'none', textAlign:'center'
              }}>
                <div>
                  <div className="eyebrow" style={{ fontSize: 9 }}>{activeSlice ? activeSlice.label : 'Total'}</div>
                  <div className="display" style={{ fontSize: 22, lineHeight: 1.1, marginTop: 2 }}>
                    {activeSlice ? fmt.money(activeSlice.value, 'USD', 1) : fmt.money(totalUsd, 'USD', 1)}
                  </div>
                  {activeSlice && (
                    <div className="mono" style={{ fontSize: 10.5, color:'var(--muted)' }}>
                      {((activeSlice.value / totalUsd) * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display:'grid', gap: 4 }}>
              {sectors.slice(0, 6).map((s, i) => (
                <div key={s.label}
                  onMouseEnter={() => setSectorHover(i)}
                  onMouseLeave={() => setSectorHover(null)}
                  onClick={() => onSetFilter && onSetFilter({ sector: s.label })}
                  style={{
                    display:'grid', gridTemplateColumns: '10px 1fr auto', alignItems:'center', gap: 8,
                    padding: '3px 6px', borderRadius: 4, cursor: 'pointer',
                    background: sectorHover === i ? 'var(--surface-2)' : 'transparent',
                    transition:'background .1s'
                  }}>
                  <span style={{ width:10, height:10, borderRadius: 2, background: s.color }}/>
                  <span style={{ fontSize: 12, color:'var(--ink-2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.label || '—'}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{((s.value / totalUsd) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        </div>

        {/* Ownership histogram */}
        <div style={{ gridArea: 'own' }}>
        <Card title="Ownership distribution" eyebrow="% per holding"
          rightSlot={<span className="eyebrow">{owns.length.toLocaleString()} cos</span>}
        >
          <div style={{ paddingTop: 6 }}>
            <Histogram data={owns} bins={28} height={130} accent="var(--accent)"
              xFmt={v => v.toFixed(1) + '%'}/>
            <div style={{
              display:'flex', justifyContent:'space-between', alignItems:'baseline',
              marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)'
            }}>
              <StatMini label="Median" value={fmt.pct(ownStats.median, 2)}/>
              <StatMini label="Top decile" value={fmt.pct(ownStats.topDecile, 2)}/>
              <StatMini label="Above 5%" value={ownStats.above5.toLocaleString()}/>
              <StatMini label="Max" value={fmt.pct(ownStats.max, 2)}/>
            </div>
          </div>
        </Card>
        </div>
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

export function StatCell({ label, value, sub, accent, clickable, onClick }) {
  return (
    <div
      onClick={clickable ? onClick : undefined}
      style={{
        background: accent ? 'linear-gradient(180deg, color-mix(in oklch, var(--accent) 12%, var(--surface)), var(--surface))' : 'var(--surface)',
        padding: '16px 18px',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { if (clickable) e.currentTarget.style.background = accent ? 'linear-gradient(180deg, color-mix(in oklch, var(--accent) 12%, var(--surface)), var(--surface))' : 'var(--surface)'; }}
    >
      <div className="eyebrow" style={{ fontSize: 9.5 }}>{label}</div>
      <div className="display" style={{
        fontSize: 26, lineHeight: 1.15, marginTop: 6, letterSpacing: '-0.01em',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
      }}>{value}</div>
      <div className="mono" style={{ fontSize: 11, color:'var(--muted)', marginTop: 4 }}>{sub}</div>
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

export function Card({ title, eyebrow, rightSlot, children, padding = 18 }) {
  return (
    <div className="card" style={{ padding }}>
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
