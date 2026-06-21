import React from 'react';
import { fmt, Chip, Delta, RangeBar, Icon } from './format.jsx';
import { PriceChart } from './charts.jsx';
import { REC_TONE } from './table.jsx';
import { PIPELINE_API } from './app.jsx';

// Slide-over detail drawer for a single company

const RANGE_LABEL = { '1y': '1 year ago', '5y': '5 years ago', 'max': 'All time' };

export function Detail({ company, allData, onClose, onPickCompany, pinned, togglePin }) {
  const [entered, setEntered] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Trigger transition on next frame
    requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Live price history fetched on demand from the backend (yfinance, not stored).
  // `loading` is derived from the request key so the effect never sets state synchronously.
  const [range, setRange] = React.useState('1y');
  const [history, setHistory] = React.useState({ key: null, points: null, dates: null, error: null });

  React.useEffect(() => {
    if (!company?.ticker) return;
    const ctrl = new AbortController();
    const key = `${company.ticker}|${range}`;
    fetch(`${PIPELINE_API}/api/history/${encodeURIComponent(company.ticker)}?range=${range}`, { signal: ctrl.signal })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        setHistory(ok
          ? { key, points: j.points, dates: j.dates, error: null }
          : { key, points: null, dates: null, error: j.error || 'Unavailable' });
      })
      .catch(e => {
        if (e.name !== 'AbortError') setHistory({ key, points: null, dates: null, error: 'Cannot reach backend' });
      });
    return () => ctrl.abort();
  }, [company?.ticker, range]);

  if (!company) return null;

  const loading = history.key !== `${company.ticker}|${range}`;

  const peerSet = allData
    .filter(c => (c.sector || c.industry) === (company.sector || company.industry) && c.ticker !== company.ticker)
    .sort((a, b) => b.mvUsd - a.mvUsd)
    .slice(0, 5);

  const isPinned = pinned.has(company.ticker);

  return (
    <>
      <div onClick={onClose} style={{
        position:'fixed', inset:0, zIndex: 80,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)',
        opacity: entered ? 1 : 0,
        transition: 'opacity .18s ease',
      }}/>
      <aside style={{
        position:'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(640px, 96vw)',
        background: 'var(--bg)',
        borderLeft: '1px solid var(--line)',
        zIndex: 81,
        overflowY: 'auto',
        boxShadow: '-30px 0 60px -20px rgba(0,0,0,.6)',
        transform: entered ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform .3s cubic-bezier(.22,.61,.36,1)',
      }}>
        {/* Sticky header strip */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding: '14px 24px',
          borderBottom: '1px solid var(--line)',
          background: 'color-mix(in oklch, var(--bg) 90%, transparent)',
          backdropFilter: 'blur(10px)',
          position: 'sticky', top: 0, zIndex: 5,
        }}>
          <div className="eyebrow">Position detail</div>
          <div style={{ display:'flex', gap: 6 }}>
            <IconBtn onClick={() => togglePin(company.ticker)} active={isPinned} title={isPinned ? 'Unpin' : 'Pin'}>
              <Icon name={isPinned ? 'pinned' : 'pin'} size={14}/>
            </IconBtn>
            <IconBtn onClick={onClose} title="Close (Esc)">
              <Icon name="x" size={14}/>
            </IconBtn>
          </div>
        </div>

        <div style={{ padding: '28px 32px 48px' }}>
          {/* Title block */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap: 24 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 8 }}>
                <span className="mono" style={{
                  fontSize: 12, color:'var(--sub)',
                  background:'var(--surface)', border:'1px solid var(--line)',
                  padding: '3px 8px', borderRadius: 4
                }}>{company.ticker}</span>
                <span style={{ fontSize: 12, color:'var(--soft)' }}>{company.country}</span>
                <span style={{ width: 3, height: 3, background:'var(--soft)', borderRadius: 99 }}/>
                <span style={{ fontSize: 12, color:'var(--soft)' }}>{company.industry}</span>
              </div>
              <h2 className="display" style={{
                fontSize: 38, lineHeight: 1.05, margin: 0,
                letterSpacing: '-0.015em',
              }}>{company.name}</h2>
              {company.reason && (
                <div className="mono" style={{ marginTop: 8, fontSize: 11, color: 'var(--soft)', letterSpacing:'0.04em' }}>
                  Inclusion basis · <span style={{ color:'var(--sub)' }}>{company.reason}</span>
                </div>
              )}
            </div>
          </div>

          {/* Price block */}
          <div style={{
            marginTop: 28,
            display:'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'flex-end',
          }}>
            <div>
              <div className="eyebrow" style={{ fontSize: 9.5 }}>Last price</div>
              <div style={{ display:'flex', alignItems:'baseline', gap: 10, marginTop: 6 }}>
                <span className="display" style={{ fontSize: 48, lineHeight: 1, letterSpacing:'-0.02em' }}>
                  {fmt.price(company.price)}
                </span>
                <Delta value={company.change} fmt="pct"/>
              </div>
              {company.targetPrice && (
                <div className="mono" style={{ marginTop: 6, fontSize: 11, color: 'var(--soft)' }}>
                  Analyst target · <span style={{ color:'var(--sub)' }}>{fmt.price(company.targetPrice)}</span>
                  &nbsp;
                  <span style={{ color: company.targetPrice > company.price ? 'var(--bull)' : 'var(--bear)' }}>
                    ({((company.targetPrice / company.price - 1) * 100).toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
            <div style={{ alignSelf:'stretch' }}>
              <div style={{ display:'flex', gap: 4, justifyContent:'flex-end', marginBottom: 6 }}>
                {['1y', '5y', 'max'].map(r => (
                  <button key={r} onClick={() => setRange(r)}
                    className="mono"
                    style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 5, cursor: 'pointer',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      background: range === r ? 'var(--accent)' : 'transparent',
                      color: range === r ? 'var(--treemap-cell-fg)' : 'var(--soft)',
                      border: `1px solid ${range === r ? 'var(--accent)' : 'var(--line)'}`,
                      transition: 'all .12s',
                    }}>{r}</button>
                ))}
              </div>
              <div style={{ height: 84, display:'grid', placeItems:'center' }}>
                {loading ? (
                  <span className="mono" style={{ fontSize: 11, color:'var(--soft)' }}>Loading price history…</span>
                ) : (history.error || !history.points || history.points.length < 2) ? (
                  <span className="mono" style={{ fontSize: 11, color:'var(--soft)' }}>{history.error || 'No price history'}</span>
                ) : (
                  <PriceChart points={history.points} dates={history.dates} valueFmt={fmt.price} width={320} height={84} color="auto"/>
                )}
              </div>
              <div className="mono" style={{ display:'flex', justifyContent:'space-between', marginTop: 6, fontSize: 10, color:'var(--soft)' }}>
                <span>{RANGE_LABEL[range]}</span><span>Today</span>
              </div>
            </div>
          </div>

          {/* 52w range */}
          <div style={{ marginTop: 28 }}>
            <div className="eyebrow" style={{ fontSize: 9.5, marginBottom: 10 }}>52-week range</div>
            <RangeBar low={company.low52} high={company.high52} value={company.price} height={10} showLabels={true}/>
          </div>

          {/* Fund holding card */}
          <div style={{
            marginTop: 28,
            padding: 22,
            border:'1px solid var(--line)',
            background: 'color-mix(in oklch, var(--accent) 7%, var(--surface))',
            borderRadius: 20,
          }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Norway GPFG holding</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 16 }}>
              <Metric label="USD value" value={fmt.money(company.mvUsd, 'USD', 2)}/>
              <Metric label="NOK value" value={fmt.money(company.mvNok, 'NOK', 2)}/>
              <Metric label="Ownership" value={fmt.pct(company.ownership, 3)}
                accent={company.ownership >= 5}/>
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 16 }}>
              <Metric label="Voting rights" value={fmt.pct(company.voting, 3)}/>
              <Metric label="Mkt cap (USD)" value={fmt.money(company.marketCap, 'USD', 1)}/>
              <Metric label="% of mkt cap"
                value={company.marketCap ? fmt.pct((company.mvUsd / company.marketCap) * 100, 3) : '—'}/>
            </div>
          </div>

          {/* Financial metrics */}
          <div style={{ marginTop: 28 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Financials</div>
            <div style={{
              display:'grid', gridTemplateColumns:'1fr 1fr', gap: 1,
              background:'var(--line)', borderRadius: 12, overflow:'hidden',
              border:'1px solid var(--line)'
            }}>
              <KvCell label="P/E ratio (trailing)" value={company.pe?.toFixed(2) ?? '—'}/>
              <KvCell label="Forward P/E" value={company.fwdPe?.toFixed(2) ?? '—'}/>
              <KvCell label="Price / Book" value={company.pb?.toFixed(2) ?? '—'}/>
              <KvCell label="Dividend yield" value={company.divYield ? company.divYield.toFixed(2) + '%' : '—'}/>
              <KvCell label="Beta (5y)" value={company.beta?.toFixed(2) ?? '—'}/>
              <KvCell label="Analyst rec" value={<Chip tone={REC_TONE[company.rec] || 'neutral'}>{fmt.rec(company.rec)}</Chip>}/>
            </div>
          </div>

          {/* Peers */}
          {peerSet.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Top peers in {company.sector || company.industry}</div>
              <div style={{ display: 'grid', gap: 1, background: 'var(--line)', borderRadius: 10, overflow:'hidden', border: '1px solid var(--line)' }}>
                {peerSet.map(p => (
                  <div key={p.ticker} onClick={() => onPickCompany(p)}
                    style={{
                      display:'grid', gridTemplateColumns: '1fr auto auto auto', gap: 14, alignItems:'center',
                      padding: '10px 14px',
                      background: 'var(--surface)',
                      cursor:'pointer', transition:'background .12s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                      <div className="mono" style={{ fontSize: 10.5, color:'var(--soft)' }}>{p.ticker} · {p.country}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 12, color:'var(--sub)' }}>{fmt.money(p.mvUsd, 'USD', 1)}</span>
                    <span className="mono" style={{ fontSize: 12, color:'var(--soft)' }}>{fmt.pct(p.ownership, 2)}</span>
                    <Icon name="arrow-right" size={14} color="var(--soft)"/>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export function Metric({ label, value, accent }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 9.5 }}>{label}</div>
      <div className="display" style={{
        fontSize: 22, marginTop: 4, letterSpacing: '-0.01em',
        color: accent ? 'var(--accent-text)' : 'var(--ink)'
      }}>{value}</div>
    </div>
  );
}

export function KvCell({ label, value }) {
  return (
    <div style={{ background:'var(--surface)', padding: '14px 16px' }}>
      <div className="eyebrow" style={{ fontSize: 9 }}>{label}</div>
      <div className="mono" style={{ fontSize: 15, color: 'var(--ink)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

export function IconBtn({ children, onClick, title, active }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        width: 32, height: 32,
        display:'grid', placeItems:'center',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--treemap-cell-fg)' : 'var(--sub)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 8, cursor:'pointer',
        transition: 'all .12s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--row-hover)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >{children}</button>
  );
}
