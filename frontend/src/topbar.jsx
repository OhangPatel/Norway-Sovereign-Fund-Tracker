import React from 'react';
import { fmt, Icon, BrandMark } from './format.jsx';

// Top navigation bar with brand, search, theme toggle, compare toggle.
// UI 2.0: the bar floats inset from the page edges and the ticker band below it
// carries the bottom corners, so nav + band read as one card.

export function TopBar({ data, query, setQuery, theme, setTheme, onPick, compareOn, setCompareOn, compareCount, onOpenColumns, lastFetched }) {
  const [focused, setFocused] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [condensed, setCondensed] = React.useState(false);
  // Phone only (<=640px). The bar there is one row — brand, then a search toggle and
  // a menu button — and these two hold what that row no longer has space for. Both are
  // inert on wider screens, where CSS hides the buttons that set them.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const wrapRef = React.useRef(null);
  const navRef = React.useRef(null);

  const matches = React.useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    const list = data
      .filter(c => (c.name||'').toLowerCase().includes(q) || (c.ticker||'').toLowerCase().includes(q) || (c.country||'').toLowerCase().includes(q))
      .slice(0, 8);
    return list;
  }, [query, data]);

  // Ticker band content — the biggest positions and their 24h move. Direction
  // comes from the same `change` field the table sorts on; no new data.
  const ticks = React.useMemo(() => {
    return data
      .filter(c => c.ticker && c.change != null)
      .sort((a, b) => b.mvUsd - a.mvUsd)
      .slice(0, 16);
  }, [data]);

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

  // Dismiss the phone menu the two ways a menu is always expected to close:
  // Escape, and a tap anywhere outside it.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    const onDown = (e) => { if (!navRef.current?.contains(e.target)) setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [menuOpen]);

  // Opening search from the icon should put the caret in the field — otherwise it
  // costs two taps to do one thing.
  React.useEffect(() => {
    if (searchOpen) wrapRef.current?.querySelector('input')?.focus();
  }, [searchOpen]);

  // Animation 4 — past ~64px the bar condenses and the band collapses to 0.
  //
  // Two thresholds, not one. The band lives inside a position:sticky header and
  // animates its height over 320ms, so collapsing it changes layout enough to
  // nudge scrollY back across a single boundary. That flips the state, which
  // restores the band, which flips it again — a feedback loop that reads as
  // flicker for the whole length of the transition. Condensing at 64 but only
  // expanding again below 24 leaves a 40px dead zone, wider than any shift the
  // collapse itself can cause, so the state cannot oscillate.
  //
  // Coalesced into one read per frame: scroll fires far faster than paint, and
  // re-evaluating mid-transition is what made the loop so easy to hit.
  React.useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = window.scrollY;
      setCondensed(isCondensed => (isCondensed ? y > 24 : y > 64));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
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
      padding: '16px clamp(14px, 2vw, 22px) 0',
    }}>
      <div ref={navRef} style={{ maxWidth: 1680, margin: '0 auto', position: 'relative' }}>
        {/* Nav shell — top corners only; the band below carries the bottom. */}
        <div className="nav-shell" style={{
          '--nav-h': condensed ? '56px' : '68px',
          background: 'var(--nav-surface)',
          border: '1px solid var(--nav-line)',
          borderBottom: condensed ? '1px solid var(--nav-line)' : 'none',
          borderRadius: condensed ? 16 : '16px 16px 0 0',
        }}>
          <div className={`r-topbar${searchOpen ? ' search-open' : ''}`} style={{
            height: '100%',
            padding: '0 18px',
            gap: 18,
          }}>
            {/* Brand — the existing mark, re-mounted with a hairline divider after it */}
            <div className="r-brand" style={{ display:'flex', alignItems:'center', gap: 12 }}>
              <BrandMark size={28}/>
              <div>
                <div className="display" style={{ fontSize: 17, lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 600, color: 'var(--nav-ink)', whiteSpace: 'nowrap' }}>
                  Sovereign <span style={{ color: 'var(--nav-accent-text)' }}>Insights</span>
                </div>
                <div className="eyebrow" style={{
                  marginTop: 4, fontSize: 9.5, whiteSpace: 'nowrap', color: 'var(--nav-soft)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {/* Animation 7 — live dot */}
                  <span className="live-dot"/>
                  Norway GPFG<span className="r-hide-sm"> · Equity Holdings · {lastFetched}</span>
                </div>
              </div>
              <span className="r-hide-sm" style={{
                width: 1, height: 30, marginLeft: 6,
                background: 'var(--nav-line)', flexShrink: 0,
              }}/>
            </div>

            {/* Search */}
            <div ref={wrapRef} className="r-search" style={{ position: 'relative', width: '100%', justifySelf:'stretch' }}>
              <div style={{
                display:'flex', alignItems:'center', gap: 10,
                padding: '8px 14px',
                background: 'var(--nav-field)',
                border: `1px solid ${focused ? 'var(--nav-ink)' : 'var(--nav-line)'}`,
                borderRadius: 10,
                boxShadow: focused ? '0 0 0 4px color-mix(in oklch, var(--accent) 55%, transparent)' : 'none',
                transition: 'border-color .15s ease, box-shadow .15s ease',
              }}>
                <Icon name="search" size={15} color="var(--nav-soft)"/>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setTimeout(() => setFocused(false), 120)}
                  onKeyDown={handleKey}
                  placeholder="Search companies — by name, ticker, or country"
                  style={{
                    flex: 1, minWidth: 0,
                    border: 'none', outline: 'none', background: 'transparent',
                    color: 'var(--nav-ink)', fontFamily: 'var(--font-display)', fontSize: 13,
                  }}
                />
                <span className="mono" style={{
                  fontSize: 10.5, color: 'var(--nav-soft)',
                  padding: '2px 6px', border: '1px solid var(--nav-line)', borderRadius: 4,
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
                    <div key={m.id}
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

            {/* Right actions — labels collapse to icons on the smallest screens. */}
            <div className="r-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TopBtn onClick={onOpenColumns} title="Columns">
                <Icon name="columns" size={14}/> <span className="r-hide-sm">Columns</span>
              </TopBtn>
              <TopBtn
                fill
                active={compareOn}
                onClick={() => setCompareOn(!compareOn)}
                title="Compare mode (multi-select rows to compare)"
              >
                <Icon name="compare" size={14}/>
                <span className="r-hide-sm">Compare</span>
                {compareCount > 0 && (
                  <span className="mono" style={{
                    padding: '1px 6px', borderRadius: 999,
                    background: 'var(--accent)', color: 'var(--nav-ink)',
                    fontSize: 10, fontWeight: 600
                  }}>{compareCount}</span>
                )}
              </TopBtn>
              <TopBtn onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14}/>
              </TopBtn>
            </div>

            {/* Phone cluster — replaces the three action buttons and the search row
                below 640px, so the whole bar fits on one line. CSS owns the
                breakpoint (see index.html); this is always rendered. */}
            <div className="r-nav-mobile">
              <NavIconBtn
                onClick={() => { setSearchOpen(o => !o); setMenuOpen(false); }}
                label={searchOpen ? 'Close search' : 'Search companies'}
                expanded={searchOpen}
              >
                <Icon name={searchOpen ? 'x' : 'search'} size={17}/>
              </NavIconBtn>
              <NavIconBtn
                onClick={() => { setMenuOpen(o => !o); setSearchOpen(false); }}
                label={menuOpen ? 'Close menu' : 'Open menu'}
                expanded={menuOpen}
                badge={!menuOpen && compareCount > 0 ? compareCount : 0}
              >
                <Icon name={menuOpen ? 'x' : 'menu'} size={17}/>
              </NavIconBtn>
            </div>
          </div>
        </div>

        {/* Phone menu — everything the one-line bar cannot hold. Absolute so opening
            it never reflows the page behind the sticky header. */}
        {menuOpen && (
          <div className="r-nav-menu" role="menu" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 8,
            zIndex: 60,
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 16, overflow: 'hidden',
            boxShadow: '0 24px 48px -24px rgba(0,0,0,.45)',
            animation: 'rise .12s ease-out',
          }}>
            <MenuRow
              icon="columns"
              onClick={() => { setMenuOpen(false); onOpenColumns(); }}
            >Columns</MenuRow>
            <MenuRow
              icon="compare"
              active={compareOn}
              hint={compareCount > 0 ? `${compareCount} selected` : (compareOn ? 'On' : null)}
              onClick={() => { setMenuOpen(false); setCompareOn(!compareOn); }}
            >Compare</MenuRow>
            <MenuRow
              icon={theme === 'dark' ? 'sun' : 'moon'}
              hint={theme === 'dark' ? 'Dark' : 'Light'}
              last
              onClick={() => { setMenuOpen(false); setTheme(theme === 'dark' ? 'light' : 'dark'); }}
            >Theme</MenuRow>
          </div>
        )}

        {/* Ticker band — one continuous marquee line; carries the bottom corners. */}
        <div className="tick-band" style={{
          height: condensed ? 0 : 27,
          opacity: condensed ? 0 : 1,
          background: 'var(--nav-band)',
          borderRadius: '0 0 16px 16px',
          overflow: 'hidden',
        }}>
          <div className="tick-track">
            {[0, 1].map(copy => (
              <div key={copy} aria-hidden={copy === 1 ? 'true' : undefined}
                style={{ display: 'flex', gap: 28, paddingRight: 28, paddingLeft: copy === 0 ? 18 : 0 }}>
                {ticks.map(t => <Tick key={t.id} row={t}/>)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

// One ticker cell: neutral symbol, then arrow + value sharing a single
// coloured span at weight 600.
function Tick({ row }) {
  const up = row.change >= 0;
  return (
    <span className="mono" style={{
      fontSize: 11, lineHeight: '27px', whiteSpace: 'nowrap',
      color: 'var(--nav-band-ink)',
    }}>
      {row.ticker}{' '}
      <span style={{ color: up ? 'var(--tick-up)' : 'var(--tick-down)', fontWeight: 600 }}>
        {up ? '▲' : '▼'} {fmt.signedPct(row.change)}
      </span>
    </span>
  );
}

// Square icon button for the phone bar. Same outline treatment as TopBtn, sized as a
// touch target rather than a pill, and with a real aria-label since it has no text.
function NavIconBtn({ children, onClick, label, expanded, badge = 0 }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 40, height: 40, flexShrink: 0,
        background: expanded ? 'var(--nav-ink)' : 'transparent',
        color: expanded ? 'var(--accent)' : 'var(--nav-ink)',
        border: `1px solid ${expanded ? 'var(--nav-ink)' : 'var(--nav-line)'}`,
        borderRadius: 10, cursor: 'pointer',
        transition: 'background .14s ease, color .14s ease, border-color .14s ease',
      }}
    >
      {children}
      {badge > 0 && (
        <span className="mono" aria-hidden="true" style={{
          position: 'absolute', top: -5, right: -5,
          minWidth: 16, height: 16, padding: '0 4px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 999, background: 'var(--accent)', color: 'var(--nav-ink)',
          fontSize: 9.5, fontWeight: 600, lineHeight: 1,
        }}>{badge}</span>
      )}
    </button>
  );
}

// One row of the phone menu: icon, label, and an optional state hint on the right.
function MenuRow({ children, icon, onClick, active, hint, last }) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        background: active ? 'var(--row-hover)' : 'transparent',
        border: 'none',
        borderBottom: last ? 'none' : '1px solid var(--line)',
        color: 'var(--ink)', cursor: 'pointer', textAlign: 'left',
        fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 500,
      }}
    >
      <Icon name={icon} size={16} color="var(--sub)"/>
      <span style={{ flex: 1 }}>{children}</span>
      {hint && (
        <span className="mono" style={{
          fontSize: 10.5, color: 'var(--soft)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>{hint}</span>
      )}
    </button>
  );
}

// Nav pill button (STYLE_GUIDE §5): mono/uppercase. `fill` is the ink-filled
// primary (lime text); the rest are outlines. Both lift 1px on hover.
export function TopBtn({ children, onClick, active, title, fill }) {
  const solid = fill || active;
  return (
    <button onClick={onClick} title={title}
      style={{
        display:'inline-flex', alignItems:'center', gap: 6,
        padding: '7px 13px',
        background: solid ? 'var(--nav-ink)' : 'transparent',
        color: solid ? 'var(--accent)' : 'var(--nav-ink)',
        border: `1px solid ${solid ? 'var(--nav-ink)' : 'var(--nav-line)'}`,
        borderRadius: 10,
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        transition: 'transform .25s cubic-bezier(.2,.7,.3,1), background .14s ease, color .14s ease, border-color .14s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        if (!solid) { e.currentTarget.style.background = 'var(--nav-ink)'; e.currentTarget.style.color = 'var(--accent)'; }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none';
        if (!solid) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--nav-ink)'; }
      }}
    >
      {children}
    </button>
  );
}
