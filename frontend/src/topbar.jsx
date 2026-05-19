// Top navigation bar with brand, search, theme toggle, compare toggle

function TopBar({ data, query, setQuery, theme, setTheme, onPick, compareOn, setCompareOn, compareCount, onOpenColumns, lastFetched }) {
  const [focused, setFocused] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const wrapRef = React.useRef(null);

  const matches = React.useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    const list = data
      .filter(c => c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q) || (c.country||'').toLowerCase().includes(q))
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
      borderBottom: '1px solid var(--hairline)',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center', gap: 16,
        padding: '14px clamp(16px, 3vw, 32px)',
        maxWidth: 1680, margin: '0 auto',
      }}>
        {/* Brand */}
        <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 50%, var(--info)))',
            display:'grid', placeItems:'center',
            color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontStyle:'italic', fontSize: 19, fontWeight: 700,
            boxShadow: '0 1px 0 rgba(255,255,255,.2) inset, 0 4px 12px rgba(0,0,0,.3)'
          }}>S</div>
          <div>
            <div className="display" style={{ fontSize: 19, lineHeight: 1, letterSpacing: '-0.015em' }}>
              Sovereign <span className="display-italic">Insights</span>
            </div>
            <div className="eyebrow" style={{ marginTop: 2, fontSize: 9.5 }}>
              Norway GPFG · Equity Holdings · {lastFetched}
            </div>
          </div>
        </div>

        {/* Search */}
        <div ref={wrapRef} style={{ position: 'relative', maxWidth: 540, width: '100%', justifySelf:'center' }}>
          <div style={{
            display:'flex', alignItems:'center', gap: 10,
            padding: '8px 12px',
            background: focused ? 'var(--surface)' : 'var(--bg-2)',
            border: `1px solid ${focused ? 'var(--accent)' : 'var(--hairline)'}`,
            borderRadius: 10,
            transition: 'all .15s ease',
            boxShadow: focused ? '0 0 0 4px color-mix(in oklch, var(--accent) 18%, transparent)' : 'none',
          }}>
            <Icon name="search" size={15} color="var(--muted)"/>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              onKeyDown={handleKey}
              placeholder="Search 1,412 companies — by name, ticker, or country"
              style={{
                flex: 1,
                border: 'none', outline: 'none', background: 'transparent',
                color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 13,
              }}
            />
            <span className="mono" style={{
              fontSize: 10.5, color: 'var(--muted)',
              padding: '2px 6px', border: '1px solid var(--hairline)', borderRadius: 4,
            }}>/</span>
          </div>

          {focused && query && matches.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--surface)', border: '1px solid var(--hairline-strong)',
              borderRadius: 10, overflow: 'hidden',
              boxShadow: '0 30px 60px -20px rgba(0,0,0,.6)',
              animation: 'rise .12s ease-out'
            }}>
              {matches.map((m, i) => (
                <div key={m.ticker}
                  onMouseDown={() => { onPick(m); setQuery(''); }}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    padding: '10px 12px',
                    display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems:'center', gap: 12,
                    background: i === active ? 'var(--surface-2)' : 'transparent',
                    cursor: 'pointer',
                    borderBottom: i < matches.length - 1 ? '1px solid var(--hairline)' : 'none',
                  }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--ink)' }}>{m.name}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{m.country} · {m.sector || m.industry}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{m.ticker}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt.money(m.mvUsd, 'USD', 1)}</span>
                </div>
              ))}
            </div>
          )}
          {focused && query && matches.length === 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              borderRadius: 10, padding: '14px',
              color: 'var(--muted)', fontSize: 12,
            }}>
              <span className="display-italic">No companies matched "{query}".</span> Try a ticker, country, or partial name.
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
                padding: '1px 6px', borderRadius: 99,
                background: 'var(--accent)', color: 'var(--accent-ink)',
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

function TopBtn({ children, onClick, active, title }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        display:'inline-flex', alignItems:'center', gap: 6,
        padding: '7px 11px',
        background: active ? 'var(--accent)' : 'var(--bg-2)',
        color: active ? 'var(--accent-ink)' : 'var(--ink-2)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500,
        transition: 'all .12s ease'
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'var(--bg-2)'; }}
    >
      {children}
    </button>
  );
}

window.TopBar = TopBar;
