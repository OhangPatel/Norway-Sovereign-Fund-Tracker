// Slide-over detail drawer for a single company

function Detail({ company, allData, onClose, onPickCompany, pinned, togglePin }) {
  const [entered, setEntered] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Trigger transition on next frame
    requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!company) return null;

  // Synthetic price history seeded by ticker
  const series = React.useMemo(() => {
    const lo = company.low52 || 50;
    const hi = company.high52 || 100;
    const base = (lo + hi) / 2;
    const vol = (hi - lo) / base * 0.18 + 0.005;
    return genSeries(company.ticker, 120, base, vol);
  }, [company.ticker]);

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
        borderLeft: '1px solid var(--hairline-strong)',
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
          borderBottom: '1px solid var(--hairline)',
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
                  fontSize: 12, color:'var(--ink-2)',
                  background:'var(--surface)', border:'1px solid var(--hairline)',
                  padding: '3px 8px', borderRadius: 4
                }}>{company.ticker}</span>
                <span style={{ fontSize: 12, color:'var(--muted)' }}>{company.country}</span>
                <span style={{ width: 3, height: 3, background:'var(--muted)', borderRadius: 99 }}/>
                <span style={{ fontSize: 12, color:'var(--muted)' }}>{company.industry}</span>
              </div>
              <h2 className="display" style={{
                fontSize: 38, lineHeight: 1.05, margin: 0,
                letterSpacing: '-0.015em',
              }}>{company.name}</h2>
              {company.reason && (
                <div className="mono" style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', letterSpacing:'0.04em' }}>
                  Inclusion basis · <span style={{ color:'var(--ink-2)' }}>{company.reason}</span>
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
                <div className="mono" style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                  Analyst target · <span style={{ color:'var(--ink-2)' }}>{fmt.price(company.targetPrice)}</span>
                  &nbsp;
                  <span style={{ color: company.targetPrice > company.price ? 'var(--pos)' : 'var(--neg)' }}>
                    ({((company.targetPrice / company.price - 1) * 100).toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
            <div style={{ alignSelf:'stretch' }}>
              <Sparkline points={series} width={320} height={84} color="auto" fill={true}/>
              <div className="mono" style={{ display:'flex', justifyContent:'space-between', marginTop: 6, fontSize: 10, color:'var(--muted)' }}>
                <span>120d ago</span><span>Today</span>
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
            border:'1px solid var(--hairline-strong)',
            background: 'linear-gradient(180deg, color-mix(in oklch, var(--accent) 9%, var(--surface)), var(--surface))',
            borderRadius: 14,
          }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Norway GPFG holding</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 16 }}>
              <Metric label="USD value" value={fmt.money(company.mvUsd, 'USD', 2)}/>
              <Metric label="NOK value" value={fmt.money(company.mvNok, 'NOK', 2)}/>
              <Metric label="Ownership" value={fmt.pct(company.ownership, 3)}
                accent={company.ownership >= 5}/>
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--hairline)', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 16 }}>
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
              background:'var(--hairline)', borderRadius: 12, overflow:'hidden',
              border:'1px solid var(--hairline)'
            }}>
              <KvCell label="P/E ratio (trailing)" value={company.pe?.toFixed(2) ?? '—'}/>
              <KvCell label="Forward P/E" value={company.fwdPe?.toFixed(2) ?? '—'}/>
              <KvCell label="Price / Book" value={company.pb?.toFixed(2) ?? '—'}/>
              <KvCell label="Dividend yield" value={company.divYield ? (company.divYield * 100).toFixed(2) + '%' : '—'}/>
              <KvCell label="Beta (5y)" value={company.beta?.toFixed(2) ?? '—'}/>
              <KvCell label="Analyst rec" value={<Chip tone={REC_TONE[company.rec] || 'neutral'}>{fmt.rec(company.rec)}</Chip>}/>
            </div>
          </div>

          {/* Peers */}
          {peerSet.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Top peers in {company.sector || company.industry}</div>
              <div style={{ display: 'grid', gap: 1, background: 'var(--hairline)', borderRadius: 10, overflow:'hidden', border: '1px solid var(--hairline)' }}>
                {peerSet.map(p => (
                  <div key={p.ticker} onClick={() => onPickCompany(p)}
                    style={{
                      display:'grid', gridTemplateColumns: '1fr auto auto auto', gap: 14, alignItems:'center',
                      padding: '10px 14px',
                      background: 'var(--surface)',
                      cursor:'pointer', transition:'background .12s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                      <div className="mono" style={{ fontSize: 10.5, color:'var(--muted)' }}>{p.ticker} · {p.country}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 12, color:'var(--ink-2)' }}>{fmt.money(p.mvUsd, 'USD', 1)}</span>
                    <span className="mono" style={{ fontSize: 12, color:'var(--muted)' }}>{fmt.pct(p.ownership, 2)}</span>
                    <Icon name="arrow-right" size={14} color="var(--muted)"/>
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

function Metric({ label, value, accent }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 9.5 }}>{label}</div>
      <div className="display" style={{
        fontSize: 22, marginTop: 4, letterSpacing: '-0.01em',
        color: accent ? 'var(--accent)' : 'var(--ink)'
      }}>{value}</div>
    </div>
  );
}

function KvCell({ label, value }) {
  return (
    <div style={{ background:'var(--surface)', padding: '14px 16px' }}>
      <div className="eyebrow" style={{ fontSize: 9 }}>{label}</div>
      <div className="mono" style={{ fontSize: 15, color: 'var(--ink)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function IconBtn({ children, onClick, title, active }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        width: 32, height: 32,
        display:'grid', placeItems:'center',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--accent-ink)' : 'var(--ink-2)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline)'}`,
        borderRadius: 8, cursor:'pointer',
        transition: 'all .12s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >{children}</button>
  );
}

window.Detail = Detail;
