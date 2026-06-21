import React from 'react';
import { fmt, Icon } from './format.jsx';

// Top navigation bar with brand, search, theme toggle, compare toggle

export function TopBar({ data, query, setQuery, theme, setTheme, onPick, compareOn, setCompareOn, compareCount, onOpenColumns, lastFetched }) {
  const [focused, setFocused] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const wrapRef = React.useRef(null);

  const matches = React.useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    const list = data
      .filter(c => (c.name||'').toLowerCase().includes(q) || (c.ticker||'').toLowerCase().includes(q) || (c.country||'').toLowerCase().includes(q))
      .slice(0, 8);
    return list;
  }, [query, data]);

  React.useEffect(() => { setActive(0); }, [query]);

  React.useEffect(() => {
    const onKey = (e) => {
      // Slash to focus search
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        const el = wrapRef.current?.querySelector('input');
        if (el) { e.preventDefault(); el.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleKey = (e) => {
    if (!matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter') { e.preventDefault(); onPick(matches[active]); setQuery(''); }
    else if (e.key === 'Escape') { setQuery(''); e.target.blur(); }
  };

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'color-mix(in oklch, var(--bg) 86%, transparent)',
      backdropFilter: 'blur(14px) saturate(140%)',
      WebkitBackdropFilter: 'blur(14px) saturate(140%)',
      borderBottom: '1px solid var(--line)',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center', gap: 16,
        padding: '14px clamp(16px, 3vw, 32px)',
        maxWidth: 1680, margin: '0 auto',
      }}>
        {/* Brand */}
        <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'var(--accent)',
            display:'grid', placeItems:'center',
            color: 'var(--treemap-cell-fg)', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
          }}>S</div>
          <div>
            <div className="display" style={{ fontSize: 18, lineHeight: 1, letterSpacing: '-0.015em', fontWeight: 600 }}>
              Sovereign <span style={{ color: 'var(--accent-text)' }}>Insights</span>
            </div>
            <div className="eyebrow" style={{ marginTop: 3, fontSize: 9.5 }}>
              Norway GPFG · Equity Holdings · {lastFetched}
            </div>
          </div>
        </div>

        {/* Search */}
        <div ref={wrapRef} style={{ position: 'relative', maxWidth: 540, width: '100%', justifySelf:'center' }}>
          <div style={{
            display:'flex', alignItems:'center', gap: 10,
            padding: '9px 16px',
            background: 'var(--surface)',
            border: `1px solid ${focused ? 'var(--accent-text)' : 'var(--line)'}`,
            borderRadius: 999,
            transition: 'border-color .15s ease',
          }}>
            <Icon name="search" size={15} color="var(--soft)"/>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              onKeyDown={handleKey}
              placeholder="Search companies — by name, ticker, or country"
              style={{
                flex: 1,
                border: 'none', outline: 'none', background: 'transparent',
                color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 13,
              }}
            />
            <span className="mono" style={{
              fontSize: 10.5, color: 'var(--soft)',
              padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 4,
            }}>/</span>
          </div>

          {focused && query && matches.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 24px 48px -24px rgba(0,0,0,.45)',
              animation: 'rise .12s ease-out'
            }}>
              {matches.map((m, i) => (
                <div key={m.ticker}
                  onMouseDown={() => { onPick(m); setQuery(''); }}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    padding: '11px 16px',
                    display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems:'center', gap: 12,
                    background: i === active ? 'var(--row-hover)' : 'transparent',
                    cursor: 'pointer',
                    borderBottom: i < matches.length - 1 ? '1px solid var(--line)' : 'none',
                  }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{m.name}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--soft)' }}>{m.country} · {m.sector || m.industry}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--sub)' }}>{m.ticker}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--soft)' }}>{fmt.money(m.mvUsd, 'USD', 1)}</span>
                </div>
              ))}
            </div>
          )}
          {focused && query && matches.length === 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 16, padding: '16px',
              color: 'var(--soft)', fontSize: 12,
            }}>
              No companies matched &ldquo;{query}&rdquo;. Try a ticker, country, or partial name.
            </div>
          )}
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TopBtn onClick={onOpenColumns} title="Columns">
            <Icon name="columns" size={14}/> <span>Columns</span>
          </TopBtn>
          <TopBtn
            active={compareOn}
            onClick={() => setCompareOn(!compareOn)}
            title="Compare mode (multi-select rows to compare)"
          >
            <Icon name="compare" size={14}/>
            <span>Compare</span>
            {compareCount > 0 && (
              <span className="mono" style={{
                padding: '1px 6px', borderRadius: 999,
                background: 'var(--accent)', color: 'var(--treemap-cell-fg)',
                fontSize: 10, fontWeight: 600
              }}>{compareCount}</span>
            )}
          </TopBtn>
          <TopBtn onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14}/>
          </TopBtn>
        </div>
      </div>
    </header>
  );
}

// Ghost pill button (STYLE_GUIDE §5): mono/uppercase, rounded, inverts on hover/active.
export function TopBtn({ children, onClick, active, title }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        display:'inline-flex', alignItems:'center', gap: 6,
        padding: '7px 13px',
        background: active ? 'var(--ink)' : 'transparent',
        color: active ? 'var(--bg)' : 'var(--ink)',
        border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
        borderRadius: 999,
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
        letterSpacing: '0.04em', textTransform: 'uppercase',
        transition: 'all .14s ease'
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--ink)'; e.currentTarget.style.color = 'var(--bg)'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink)'; } }}
    >
      {children}
    </button>
  );
}
