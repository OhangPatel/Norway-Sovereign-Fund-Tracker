import React from 'react';
import { fmt, Chip, RangeBar, Icon } from './format.jsx';
import { PriceChart } from './charts.jsx';
import { REC_TONE } from './table.jsx';
import { PIPELINE_API } from './app.jsx';
import { formatPeriod, periodLabel } from './snapshot.js';

// Slide-over detail drawer for a single company

const RANGE_LABEL = { '1d': 'Market open', '1y': '1 year ago', '5y': '5 years ago', 'max': 'All time' };

// Suffix on the headline delta, naming the window it measures.
const DELTA_LABEL = { '1d': '24h', '1y': '1Y', '5y': '5Y', 'max': 'all time' };

/**
 * Move in the headline price over the selected chart range, as an absolute amount
 * and a percent — the pair Yahoo prints under a quote.
 *
 * Both ends come from the snapshot side: the headline price is "now", the baseline
 * is where the range starts. 1d is the exception — its baseline is the stored 24h
 * change, not the chart's first point, because the intraday series opens at the
 * market open while "24h" means the previous close. Yahoo splits these the same way.
 */
function rangeDelta(range, price, change, points) {
  if (price == null) return null;
  if (range === '1d') {
    if (change == null) return null;
    return { abs: price - price / (1 + change / 100), pct: change };
  }
  const base = points && points.length >= 2 ? points[0] : null;
  if (!base) return null;
  return { abs: price - base, pct: (price / base - 1) * 100 };
}

// Grouped, signed percent. fmt.signedPct is toFixed only, which is fine for a 24h
// move but unreadable on an all-time one — AAPL's max return prints as 312180.10.
const groupedPct = (n) =>
  (n >= 0 ? '+' : '-') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

// Headline delta: "▲ +12.40 (+6.14%) 1Y". Arrow and sign match Delta in format.jsx.
function RangeDelta({ delta, label }) {
  if (!delta) return <span className="mono" style={{ fontSize: 11, color: 'var(--soft)' }}>—</span>;
  const pos = delta.pct >= 0;
  return (
    <span className="mono" style={{
      color: pos ? 'var(--bull)' : 'var(--bear)',
      fontSize: 12, fontWeight: 500,
      display: 'inline-flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 9 }}>{pos ? '▲' : '▼'}</span>
      <span>{(pos ? '+' : '-') + fmt.price(Math.abs(delta.abs))} ({groupedPct(delta.pct)})</span>
      <span style={{ color: 'var(--soft)', fontSize: 9.5, fontWeight: 400 }}>{label}</span>
    </span>
  );
}

export function Detail({ company, allData, onClose, onPickCompany, pinned, togglePin, lastFetched,
                         period, isLatestPeriod = true }) {
  // On the latest period NBIM's figures and the market data describe roughly the same
  // moment, so labelling every cell would be noise. On a past period they are years
  // apart and the labels are the only thing telling them apart.
  const historical = !isLatestPeriod && !!period;
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
  const [range, setRange] = React.useState('1d');
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

  // Transient "current price" — fetched live on demand, shown inline only, never
  // stored and never fed into the chart, the headline, or any other field. Each
  // value is tagged with its ticker so it's treated as stale (rather than reset
  // via an effect) when the company changes.
  const [quote, setQuote] = React.useState({ ticker: null, loading: false, price: null, at: null, error: null });
  const [cooldown, setCooldown] = React.useState({ ticker: null, active: false });

  // Trim the live series so the chart ends at the snapshot moment (point-in-time
  // model): drop any points dated after this company's snapshot date.
  const snapshotDate = company?.fetchedAt || lastFetched;
  const chart = React.useMemo(() => {
    const { points, dates } = history;
    if (!points || !dates) return { points, dates };
    const cutoff = snapshotDate ? new Date(snapshotDate) : null;
    if (!cutoff || isNaN(cutoff)) return { points, dates };
    const pts = [], dts = [];
    for (let i = 0; i < dates.length; i++) {
      // Intraday points are "2026-08-07 15:55"; the space form is not spec-defined
      // for Date, so it becomes the ISO 'T' before parsing. Plain dates are untouched.
      if (new Date(dates[i].replace(' ', 'T')) <= cutoff) { pts.push(points[i]); dts.push(dates[i]); }
    }
    return pts.length >= 2 ? { points: pts, dates: dts } : { points, dates };
  }, [history, snapshotDate]);

  if (!company) return null;

  const loading = history.key !== `${company.ticker}|${range}`;

  // While a new range is in flight `chart` still holds the previous one, so the
  // delta would describe a window the user is no longer looking at. 1d needs no
  // series at all, so it survives the wait.
  const delta = (loading && range !== '1d')
    ? null
    : rangeDelta(range, company.price, company.change, chart.points);

  // Quote/cooldown only apply to the company they were fetched for.
  const q = quote.ticker === company.ticker ? quote : { loading: false, price: null, at: null, error: null };
  const onCooldown = cooldown.ticker === company.ticker && cooldown.active;

  const fetchQuote = () => {
    if (q.loading || onCooldown) return;
    const ticker = company.ticker;
    setQuote({ ticker, loading: true, price: null, at: null, error: null });
    fetch(`${PIPELINE_API}/api/quote/${encodeURIComponent(ticker)}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setQuote(ok
        ? { ticker, loading: false, price: j.price, at: j.fetched_at, error: null }
        : { ticker, loading: false, price: null, at: null, error: j.error || 'Unavailable' }))
      .catch(() => setQuote({ ticker, loading: false, price: null, at: null, error: 'Cannot reach backend' }))
      .finally(() => {
        // Brief client-side cooldown so the button can't be hammered into a burst.
        setCooldown({ ticker, active: true });
        setTimeout(() => setCooldown(c => (c.ticker === ticker ? { ticker, active: false } : c)), 5000);
      });
  };

  const peerSet = allData
    .filter(c => (c.sector || c.industry) === (company.sector || company.industry) && c.id !== company.id)
    .sort((a, b) => b.mvUsd - a.mvUsd)
    .slice(0, 5);

  const isPinned = pinned.has(company.id);

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
          padding: '12px 20px',
          borderBottom: '1px solid var(--line)',
          background: 'color-mix(in oklch, var(--bg) 90%, transparent)',
          backdropFilter: 'blur(10px)',
          position: 'sticky', top: 0, zIndex: 5,
        }}>
          <div className="eyebrow">Position detail</div>
          <div style={{ display:'flex', gap: 6 }}>
            <IconBtn onClick={() => togglePin(company.id)} active={isPinned} title={isPinned ? 'Unpin' : 'Pin'}>
              <Icon name={isPinned ? 'pinned' : 'pin'} size={14}/>
            </IconBtn>
            <IconBtn onClick={onClose} title="Close (Esc)">
              <Icon name="x" size={14}/>
            </IconBtn>
          </div>
        </div>

        {/* Type here runs a step below the dashboard's: the drawer is a dense read,
            and every point of headline size costs a metric off the first screen. */}
        <div style={{ padding: 'clamp(16px, 3.2vw, 22px) clamp(14px, 3.2vw, 26px) 40px' }}>
          {/* Title block */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap: 24 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display:'flex', alignItems:'center', gap: 9, marginBottom: 7 }}>
                <span className="mono" style={{
                  fontSize: 11, color:'var(--sub)',
                  background:'var(--surface)', border:'1px solid var(--line)',
                  padding: '2px 7px', borderRadius: 4
                }}>{company.ticker}</span>
                <span style={{ fontSize: 11.5, color:'var(--soft)' }}>{company.country}</span>
                <span style={{ width: 3, height: 3, background:'var(--soft)', borderRadius: 99 }}/>
                <span style={{ fontSize: 11.5, color:'var(--soft)' }}>{company.industry}</span>
              </div>
              <h2 className="display" style={{
                fontSize: 30, lineHeight: 1.06, margin: 0,
                letterSpacing: '-0.015em',
              }}>{company.name}</h2>
              {company.reason && (
                <div className="mono" style={{ marginTop: 7, fontSize: 10.5, color: 'var(--soft)', letterSpacing:'0.04em' }}>
                  Inclusion basis · <span style={{ color:'var(--sub)' }}>{company.reason}</span>
                </div>
              )}
            </div>
          </div>

          {/* Price block */}
          <div className="r-priceblock" style={{ marginTop: 22 }}>
            <div>
              <div className="eyebrow" style={{ fontSize: 9 }}>Last price</div>
              <div style={{ display:'flex', alignItems:'baseline', gap: 10, marginTop: 5 }}>
                <span className="display" style={{ fontSize: 38, lineHeight: 1, letterSpacing:'-0.02em' }}>
                  {fmt.price(company.price)}
                </span>
                <RangeDelta delta={delta} label={DELTA_LABEL[range]}/>
              </div>
              {company.targetPrice && (
                <div className="mono" style={{ marginTop: 6, fontSize: 10.5, color: 'var(--soft)' }}>
                  Analyst target · <span style={{ color:'var(--sub)' }}>{fmt.price(company.targetPrice)}</span>
                  &nbsp;
                  <span style={{ color: company.targetPrice > company.price ? 'var(--bull)' : 'var(--bear)' }}>
                    ({((company.targetPrice / company.price - 1) * 100).toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
            <div style={{ alignSelf:'stretch', minWidth: 0 }}>
              {/* Live spot-check — temporary, shown inline only; never touches the
                  chart, the headline price, or any stored data. */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 8, marginBottom: 6, minHeight: 22 }}>
                <button onClick={fetchQuote} disabled={q.loading || onCooldown}
                  className="mono"
                  title="Fetch the latest live price (display only)"
                  style={{
                    fontSize: 10, padding: '3px 9px', borderRadius: 5,
                    textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    background: 'transparent',
                    color: (q.loading || onCooldown) ? 'var(--soft)' : 'var(--accent-text)',
                    border: '1px solid var(--line)',
                    cursor: (q.loading || onCooldown) ? 'not-allowed' : 'pointer',
                    transition: 'all .12s',
                  }}>
                  {q.loading ? 'Fetching…' : 'Get current price'}
                </button>
                <span className="mono" style={{ fontSize: 11, textAlign:'right', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', minWidth: 0 }}>
                  {q.error ? (
                    <span style={{ color:'var(--bear)' }}>{q.error}</span>
                  ) : q.price != null ? (
                    <>
                      <span style={{ color:'var(--ink)' }}>{fmt.price(q.price)}</span>
                      <span style={{ color:'var(--soft)', marginLeft: 6, fontSize: 9.5 }}>live · not saved</span>
                    </>
                  ) : (
                    <span style={{ color:'var(--soft)', fontSize: 9.5 }}>live spot price</span>
                  )}
                </span>
              </div>
              <div style={{ display:'flex', gap: 4, justifyContent:'flex-end', marginBottom: 6 }}>
                {['1d', '1y', '5y', 'max'].map(r => (
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
                ) : (history.error || !chart.points || chart.points.length < 2) ? (
                  <span className="mono" style={{ fontSize: 11, color:'var(--soft)' }}>{history.error || 'No price history'}</span>
                ) : (
                  <PriceChart points={chart.points} dates={chart.dates} valueFmt={fmt.price} height={84} color="auto"/>
                )}
              </div>
              <div className="mono" style={{ display:'flex', justifyContent:'space-between', marginTop: 6, fontSize: 10, color:'var(--soft)' }}>
                <span>{RANGE_LABEL[range]}</span>
                <span>{(chart.dates && chart.dates.length) ? chart.dates[chart.dates.length - 1] : 'Snapshot'}</span>
              </div>
            </div>
          </div>

          {/* 52w range */}
          <div style={{ marginTop: 22 }}>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 9 }}>52-week range</div>
            <RangeBar low={company.low52} high={company.high52} value={company.price} height={10} showLabels={true}/>
          </div>

          {/* Fund holding card */}
          <div style={{
            marginTop: 22,
            padding: 18,
            border:'1px solid var(--line)',
            background: 'color-mix(in oklch, var(--accent) 7%, var(--surface))',
            borderRadius: 18,
          }}>
            <SectionLabel text="Norway GPFG holding"
              tag={historical ? `disclosed as of ${formatPeriod(period)}` : null}/>
            <div className="r-metrics3">
              <Metric label="USD value" value={fmt.money(company.mvUsd, 'USD', 2)}/>
              <Metric label="NOK value" value={fmt.money(company.mvNok, 'NOK', 2)}/>
              <Metric label="Ownership" value={fmt.pct(company.ownership, 3)}
                accent={company.ownership >= 5}/>
            </div>
            <div className="r-metrics3" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <Metric label="Voting rights" value={fmt.pct(company.voting, 3)}/>
              <Metric label="Mkt cap (USD)" value={fmt.money(company.marketCap, 'USD', 1)}
                note={historical ? 'today' : null}/>
              {/* The only figure on this screen built from BOTH sides: a market value
                  disclosed for the period over a market cap read today. On the latest
                  period that is one moment; on 2022 it divides a 2022 numerator by a
                  2026 denominator, so it says so rather than presenting a clean number. */}
              <Metric label="% of mkt cap"
                value={company.marketCap ? fmt.pct((company.mvUsd / company.marketCap) * 100, 3) : '—'}
                note={historical ? `${periodLabel(period)} holding ÷ today's cap` : null}/>
            </div>
          </div>

          {/* Financial metrics */}
          <div style={{ marginTop: 22 }}>
            <SectionLabel text="Financials"
              tag={historical ? 'current market data, not the period’s' : null}/>
            <div className="r-kv2" style={{
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
            <div style={{ marginTop: 22 }}>
              <div className="eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>Top peers in {company.sector || company.industry}</div>
              <div style={{ display: 'grid', gap: 1, background: 'var(--line)', borderRadius: 10, overflow:'hidden', border: '1px solid var(--line)' }}>
                {peerSet.map(p => (
                  <div key={p.ticker} onClick={() => onPickCompany(p)}
                    style={{
                      display:'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, alignItems:'center',
                      padding: '9px 12px',
                      background: 'var(--surface)',
                      cursor:'pointer', transition:'background .12s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                      <div className="mono" style={{ fontSize: 10, color:'var(--soft)' }}>{p.ticker} · {p.country}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 11.5, color:'var(--sub)' }}>{fmt.money(p.mvUsd, 'USD', 1)}</span>
                    <span className="mono" style={{ fontSize: 11.5, color:'var(--soft)' }}>{fmt.pct(p.ownership, 2)}</span>
                    <Icon name="arrow-right" size={13} color="var(--soft)"/>
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

export function Metric({ label, value, accent, note }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 9 }}>{label}</div>
      <div className="display" style={{
        fontSize: 18, marginTop: 3, letterSpacing: '-0.01em',
        color: accent ? 'var(--accent-text)' : 'var(--ink)'
      }}>{value}</div>
      {note && (
        <div className="mono" style={{ fontSize: 8.5, color: 'var(--sub)', marginTop: 3 }}>{note}</div>
      )}
    </div>
  );
}

/**
 * Section heading with an optional provenance tag. The tag is what stops a reader
 * assuming every number under one heading belongs to the same date.
 */
export function SectionLabel({ text, tag }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
      <span className="eyebrow" style={{ fontSize: 10 }}>{text}</span>
      {tag && (
        <span className="mono" style={{ fontSize: 8.5, color: 'var(--sub)', fontWeight: 400 }}>
          · {tag}
        </span>
      )}
    </div>
  );
}

export function KvCell({ label, value }) {
  return (
    <div style={{ background:'var(--surface)', padding: '11px 14px' }}>
      <div className="eyebrow" style={{ fontSize: 8.5 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, color: 'var(--ink)', marginTop: 3 }}>{value}</div>
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
