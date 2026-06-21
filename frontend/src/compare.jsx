import React from 'react';
import { fmt, Chip, Delta, Icon } from './format.jsx';
import { REC_TONE } from './table.jsx';
import { IconBtn } from './detail.jsx';

// Compare dock — pinned bottom bar showing selected companies side-by-side

export function CompareDock({ companies, onRemove, onClear, onExpand, onOpenCompany }) {
  if (!companies.length) return null;

  return (
    <div style={{
      position:'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)',
      zIndex: 70,
      width: 'min(1140px, 96vw)',
      animation: 'rise .25s cubic-bezier(.22,.61,.36,1)',
    }}>
      <div style={{
        background: 'color-mix(in oklch, var(--surface) 92%, transparent)',
        backdropFilter: 'blur(20px) saturate(140%)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        boxShadow: '0 30px 60px -20px rgba(0,0,0,.6)',
        overflow: 'hidden',
      }}>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--line)'
        }}>
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <Icon name="compare" size={14} color="var(--accent-text)"/>
            <div className="display" style={{ fontSize: 16 }}>Comparing <span style={{ color:'var(--accent-text)' }}>{companies.length}</span> companies</div>
          </div>
          <div style={{ display:'flex', gap: 6 }}>
            <button onClick={onExpand} style={btnStyle(true)}>Open comparison</button>
            <button onClick={onClear} style={btnStyle(false)}>Clear</button>
          </div>
        </div>

        <div style={{
          display:'flex', overflowX:'auto', padding: 14, gap: 12,
        }}>
          {companies.map(c => (
            <div key={c.ticker}
              onClick={() => onOpenCompany(c)}
              style={{
                minWidth: 180,
                padding: '12px 14px',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 10,
                cursor: 'pointer',
                position: 'relative',
                transition: 'background .12s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--row-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg)'}
            >
              <button onClick={(e) => { e.stopPropagation(); onRemove(c.ticker); }}
                style={{
                  position:'absolute', top: 6, right: 6,
                  width: 20, height: 20, padding:0,
                  background:'transparent', border:'none',
                  cursor:'pointer', color:'var(--soft)',
                  display:'grid', placeItems:'center', borderRadius: 4,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--line)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Icon name="x" size={11}/>
              </button>
              <div className="mono" style={{ fontSize: 10.5, color:'var(--soft)' }}>{c.ticker}</div>
              <div style={{
                fontSize: 13, color: 'var(--ink)', marginTop: 2, marginBottom: 8,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                maxWidth: 150,
              }}>{c.name}</div>
              <div className="mono" style={{ fontSize: 14, color:'var(--ink)' }}>{fmt.money(c.mvUsd, 'USD', 1)}</div>
              <div style={{ marginTop: 4, display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <span className="mono" style={{ fontSize: 10.5, color:'var(--soft)' }}>own</span>
                <span className="mono" style={{ fontSize: 11, color: c.ownership >= 5 ? 'var(--accent-text)' : 'var(--sub)' }}>{fmt.pct(c.ownership, 2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function btnStyle(primary) {
  return {
    padding: '6px 12px',
    background: primary ? 'var(--accent)' : 'transparent',
    color: primary ? 'var(--treemap-cell-fg)' : 'var(--sub)',
    border: `1px solid ${primary ? 'var(--accent)' : 'var(--line)'}`,
    borderRadius: 7, cursor: 'pointer',
    fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500,
  };
}

// Modal: side-by-side comparison
export function CompareModal({ companies, onClose, allData }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!companies.length) return null;

  const rows = [
    { label: 'Country',         val: c => c.country },
    { label: 'Industry',        val: c => c.industry || c.sector },
    { label: 'Current price',   val: c => fmt.price(c.price), mono: true },
    { label: '24h change',      val: c => <Delta value={c.change} fmt="pct"/>, html: true },
    { label: '52-week low',     val: c => fmt.price(c.low52), mono: true },
    { label: '52-week high',    val: c => fmt.price(c.high52), mono: true },
    { label: 'Analyst target',  val: c => fmt.price(c.targetPrice), mono: true },
    { label: 'Fund value (USD)', val: c => fmt.money(c.mvUsd, 'USD', 2), mono: true, divider: true },
    { label: 'Fund value (NOK)', val: c => fmt.money(c.mvNok, 'NOK', 2), mono: true },
    { label: 'Ownership %',     val: c => fmt.pct(c.ownership, 3), mono: true, hi: c => c.ownership >= 5 },
    { label: 'Voting rights %', val: c => fmt.pct(c.voting, 3), mono: true },
    { label: 'P/E (trailing)',  val: c => c.pe?.toFixed(2) ?? '—', mono: true, divider: true },
    { label: 'Forward P/E',     val: c => c.fwdPe?.toFixed(2) ?? '—', mono: true },
    { label: 'Price / Book',    val: c => c.pb?.toFixed(2) ?? '—', mono: true },
    { label: 'Dividend yield',  val: c => c.divYield ? c.divYield.toFixed(2) + '%' : '—', mono: true },
    { label: 'Beta (5y)',       val: c => c.beta?.toFixed(2) ?? '—', mono: true },
    { label: 'Market cap',      val: c => fmt.money(c.marketCap, 'USD', 1), mono: true },
    { label: 'Recommendation',  val: c => <Chip tone={REC_TONE[c.rec] || 'neutral'}>{fmt.rec(c.rec)}</Chip>, html: true },
  ];

  return (
    <>
      <div onClick={onClose} style={{
        position:'fixed', inset:0, zIndex: 90,
        background:'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)',
        animation:'fadeIn .15s ease'
      }}/>
      <div style={{
        position: 'fixed', inset: 32,
        zIndex: 91,
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        overflow: 'hidden',
        display:'flex', flexDirection:'column',
        animation: 'rise .25s cubic-bezier(.22,.61,.36,1)'
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding: '20px 28px', borderBottom: '1px solid var(--line)' }}>
          <div>
            <div className="eyebrow">Side-by-side</div>
            <div className="display" style={{ fontSize: 26, marginTop: 2, letterSpacing:'-0.01em' }}>
              Comparing <span className="display-italic" style={{ color:'var(--accent-text)' }}>{companies.length}</span> positions
            </div>
          </div>
          <IconBtn onClick={onClose} title="Close"><Icon name="x" size={14}/></IconBtn>
        </div>

        <div style={{ overflow:'auto', padding: '24px 28px 32px' }}>
          {/* Company headers */}
          <div style={{
            display:'grid',
            gridTemplateColumns: `180px repeat(${companies.length}, minmax(180px, 1fr))`,
            gap: 0, alignItems:'end',
            marginBottom: 16,
          }}>
            <div></div>
            {companies.map(c => (
              <div key={c.ticker} style={{ padding: '0 14px', borderLeft: '1px solid var(--line)' }}>
                <span className="mono" style={{
                  fontSize: 10.5, color:'var(--sub)',
                  background:'var(--surface)', padding:'2px 6px', borderRadius:3,
                  border:'1px solid var(--line)'
                }}>{c.ticker}</span>
                <div className="display" style={{
                  fontSize: 20, lineHeight: 1.1, marginTop: 8, letterSpacing:'-0.01em',
                }}>{c.name}</div>
              </div>
            ))}
          </div>

          {rows.map((row, i) => {
            return (
              <div key={i} style={{
                display:'grid',
                gridTemplateColumns: `180px repeat(${companies.length}, minmax(180px, 1fr))`,
                alignItems:'center',
                padding: '12px 0',
                borderTop: row.divider ? '1px solid var(--line)' : '1px solid var(--line)',
              }}>
                <div className="mono" style={{ fontSize: 10.5, color:'var(--soft)', letterSpacing:'0.06em', textTransform:'uppercase' }}>
                  {row.label}
                </div>
                {companies.map(c => {
                  const isHi = row.hi && row.hi(c);
                  return (
                    <div key={c.ticker} style={{ padding: '0 14px', borderLeft:'1px solid var(--line)' }}>
                      {row.html ? (
                        row.val(c)
                      ) : (
                        <span className={row.mono ? 'mono' : ''} style={{
                          fontSize: row.mono ? 14 : 13,
                          color: isHi ? 'var(--accent-text)' : 'var(--ink)',
                          fontWeight: isHi ? 600 : 400,
                        }}>{row.val(c)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
