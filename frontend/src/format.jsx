// Formatting + small UI primitives shared across components.

export const fmt = {
  // Compact short form: 1.2B, 845M, 3.4K
  short(n, digits = 1) {
    if (n == null || isNaN(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(digits) + 'T';
    if (a >= 1e9)  return (n / 1e9).toFixed(digits) + 'B';
    if (a >= 1e6)  return (n / 1e6).toFixed(digits) + 'M';
    if (a >= 1e3)  return (n / 1e3).toFixed(digits) + 'K';
    return n.toFixed(digits);
  },
  // money in NOK or USD with prefix
  money(n, ccy = 'USD', digits = 2) {
    if (n == null || isNaN(n)) return '—';
    const sym = ccy === 'NOK' ? 'kr ' : '$ ';
    return sym + fmt.short(n, digits);
  },
  pct(n, digits = 2) {
    if (n == null || isNaN(n)) return '—';
    return n.toFixed(digits) + '%';
  },
  // n is already a percent value (e.g. -1.74 -> "-1.74%"), matching pct().
  signedPct(n, digits = 2) {
    if (n == null || isNaN(n)) return '—';
    const s = n >= 0 ? '+' : '';
    return s + n.toFixed(digits) + '%';
  },
  price(n, digits = 2) {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  rec(r) {
    if (!r) return '—';
    return r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
};

// ── Controls ────────────────────────────────────────────────────────────────
// One geometry for everything the user can press.
//
// This used to be five near-copies: pillStyle() in filters.jsx, btnStyle() in
// compare.jsx, the year pills in period.jsx, the Data Tools trigger in app.jsx and
// .r-sheet-done in index.html. They agreed on intent and on nothing else — radius
// 7 / 12 / 999, padding 6/12 · 7/12 · 7/13 · 11/20, two font families, and three
// different accent fills — so a primary action looked like a different control on
// every screen it appeared on.
//
// `variant` is the button's WEIGHT in the hierarchy, `shape` is its silhouette:
//   primary — the accent fill. One per view; it is the thing to press.
//   ghost   — a hairline. Everything else, including destructive-adjacent actions;
//             the app has no red button and does not need one.
//   solid   — --ink fill. Only for a trigger whose menu is open, where the button
//             has to read as pressed rather than as the page's primary action.
//   pill    — a mode or a filter: something toggled, living in a row of peers.
//   block   — a committed action inside a panel: Done, Open comparison, a link out.
//
// `tone` picks the type treatment, and the two mean different things:
//   label — mono, uppercase, tracked. Names a MODE or a COMMAND.
//   text  — display, sentence case. Names a DESTINATION or an OBJECT
//           ("Yahoo Finance"), which uppercasing would mangle.
export function btn({ variant = 'ghost', shape = 'pill', tone = 'label', active = false } = {}) {
  const fill = {
    primary: { bg: 'var(--accent)', fg: 'var(--treemap-cell-fg)', bd: 'var(--accent)' },
    solid:   { bg: 'var(--ink)',    fg: 'var(--bg)',              bd: 'var(--ink)' },
    ghost:   active
      ? { bg: 'var(--row-hover)', fg: 'var(--ink)', bd: 'var(--ink)' }
      : { bg: 'transparent',      fg: 'var(--ink)', bd: 'var(--line)' },
  }[variant] || {};

  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    // A fixed height rather than symmetric padding: it is what makes a pill, an
    // icon button and a select line up when they share a row, whatever is inside them.
    height: 'var(--control-h)',
    padding: '0 14px',
    background: fill.bg, color: fill.fg,
    border: `1px solid ${fill.bd}`,
    borderRadius: shape === 'pill' ? 'var(--r-pill)' : 'var(--r-md)',
    cursor: 'pointer',
    textDecoration: 'none', whiteSpace: 'nowrap',
    fontFamily: tone === 'label' ? 'var(--font-mono)' : 'var(--font-display)',
    fontSize: tone === 'label' ? 11 : 13,
    fontWeight: variant === 'ghost' ? 500 : 600,
    letterSpacing: tone === 'label' ? '0.06em' : '0',
    textTransform: tone === 'label' ? 'uppercase' : 'none',
    transition: 'background .14s ease, border-color .14s ease, color .14s ease',
  };
}

// Square icon-only button. Same height as btn() so the two sit on one baseline;
// --r-md so it reads as a control rather than as a small card. The drawer drew
// these at 32px/radius 8 and the nav at 40px/radius 10, which is why the nav's
// buttons never lined up with the search field beside them.
export function iconBtnStyle({ active = false, large = false } = {}) {
  const side = large ? 'var(--control-h-lg)' : 'var(--control-h)';
  return {
    width: side, height: side, flexShrink: 0,
    display: 'grid', placeItems: 'center',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--treemap-cell-fg)' : 'var(--sub)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
    borderRadius: 'var(--r-md)', cursor: 'pointer',
    transition: 'background .14s ease, border-color .14s ease, color .14s ease',
  };
}

// Small chip / badge
export function Chip({ children, tone = 'neutral', style = {} }) {
  const tones = {
    neutral: { bg: 'var(--row-hover)', fg: 'var(--sub)', bd: 'var(--line)' },
    // Ground and border are areas, so they take the fill token; the label is read as
    // text, so it takes the -text one. On the dark theme the two are the same value.
    pos:     { bg: 'color-mix(in srgb, var(--bull) 14%, transparent)', fg: 'var(--bull-text)', bd: 'color-mix(in srgb, var(--bull) 35%, transparent)' },
    neg:     { bg: 'color-mix(in srgb, var(--bear) 14%, transparent)', fg: 'var(--bear-text)', bd: 'color-mix(in srgb, var(--bear) 35%, transparent)' },
    accent:  { bg: 'color-mix(in srgb, var(--accent) 18%, transparent)', fg: 'var(--accent-text)', bd: 'color-mix(in srgb, var(--accent) 35%, transparent)' },
    info:    { bg: 'color-mix(in srgb, var(--sector-tech) 14%, transparent)', fg: 'var(--sector-tech)', bd: 'color-mix(in srgb, var(--sector-tech) 30%, transparent)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems:'center', gap: 6,
      padding: '2px 8px',
      borderRadius: 'var(--r-pill)',
      fontFamily: 'var(--font-mono)',
      fontSize: 10.5,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      background: t.bg,
      color: t.fg,
      border: `1px solid ${t.bd}`,
      whiteSpace: 'nowrap',
      ...style
    }}>{children}</span>
  );
}

// Squared monospace tag, for an IDENTIFIER rather than a status: a ticker, a
// keyboard key, a source marker. Chip above is its rounded counterpart and says
// something about state ("Buy", "+2.4%"); a Tag just names a thing, which is why
// it is square-ish and never coloured by tone alone.
//
// There were six of these — radius 3 in the compare modal, 4 in the table, the nav
// and the period bar, 8 in the drawer, 3 in the footer — each with its own padding
// and font size, all rendering the same ticker symbol.
export function Tag({ children, size = 'sm', tone = 'neutral', style = {} }) {
  const lg = size === 'lg';
  const tones = {
    neutral: { bg: 'var(--row-hover)', fg: 'var(--sub)', bd: 'var(--line)' },
    accent:  { bg: 'var(--accent-wash)', fg: 'var(--accent-text)', bd: 'var(--accent-edge)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: lg ? '5px 10px' : '2px 7px',
      borderRadius: 'var(--r-xs)',
      fontSize: lg ? 12 : 10.5,
      fontWeight: lg ? 600 : 500,
      letterSpacing: '0.04em',
      background: t.bg, color: t.fg,
      border: `1px solid ${t.bd}`,
      whiteSpace: 'nowrap', flexShrink: 0,
      ...style,
    }}>{children}</span>
  );
}

// Tiny up/down delta
export function Delta({ value, fmt: f = 'pct' }) {
  if (value == null) return <span className="mono" style={{color:'var(--soft)'}}>—</span>;
  const pos = value >= 0;
  const arrow = pos ? '▲' : '▼';
  const label = f === 'pct' ? fmt.signedPct(value) : (pos ? '+' : '') + fmt.short(value, 2);
  return (
    <span className="mono" style={{
      color: pos ? 'var(--bull-text)' : 'var(--bear-text)',
      fontSize: 12, fontWeight: 500,
      display: 'inline-flex', alignItems:'center', gap: 4,
    }}>
      <span style={{ fontSize: 9 }}>{arrow}</span>{label}
    </span>
  );
}

// 52-week range visual: low ─── current ─── high
export function RangeBar({ low, high, value, height = 8, showLabels = false }) {
  if (low == null || high == null || value == null) {
    return <div style={{ height, background: 'var(--row-hover)', borderRadius: 'var(--r-pill)' }}/>;
  }
  const range = Math.max(high - low, 0.0001);
  const t = Math.max(0, Math.min(1, (value - low) / range));
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        position: 'relative', height, borderRadius: 'var(--r-pill)',
        background: 'linear-gradient(90deg, color-mix(in srgb, var(--bear) 40%, transparent), color-mix(in srgb, var(--soft) 30%, transparent) 50%, color-mix(in srgb, var(--bull) 40%, transparent))',
        border: '1px solid var(--line)',
        overflow: 'visible',
      }}>
        <div style={{
          position: 'absolute',
          left: `calc(${t * 100}% - 1px)`,
          top: -3, bottom: -3,
          width: 2,
          background: 'var(--ink)',
          borderRadius: 2,
          boxShadow: '0 0 0 3px var(--bg)'
        }}/>
      </div>
      {showLabels && (
        <div className="mono" style={{
          display:'flex', justifyContent:'space-between',
          fontSize: 10.5, color:'var(--soft)', marginTop: 4
        }}>
          <span>{fmt.price(low)}</span>
          <span>{fmt.price(high)}</span>
        </div>
      )}
    </div>
  );
}

// Sparkline-ish micro bar: percent fill (for ownership column)
export function MicroBar({ value, max, tone = 'accent', height = 4 }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const tones = {
    accent: 'var(--accent)',
    pos: 'var(--bull)',
    neg: 'var(--bear)',
    info: 'var(--sector-tech)',
    muted: 'var(--soft)',
  };
  return (
    <div style={{
      height, background: 'var(--row-hover)',
      borderRadius: 'var(--r-pill)', overflow: 'hidden',
      border: '1px solid var(--line)',
    }}>
      <div style={{ height: '100%', width: pct + '%', background: tones[tone], transition: 'width .3s ease' }}/>
    </div>
  );
}

// Crown Ridge brand mark — geometry from logo/crown-ridge-mark.svg.
// Inlined rather than an <img> so it can follow the theme (on the onyx ground the
// tile darkens and gains a hairline, matching logo/crown-ridge-dark.svg) and so it
// costs no extra request. Decorative: the adjacent wordmark carries the name.
export function BrandMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none"
      aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="0.5" width="47" height="47" rx="5"
        fill="var(--logo-tile)" stroke="var(--logo-stroke)"/>
      <path d="M9 32V16l7.5 8L24 14l7.5 10L39 16v16z" fill="var(--logo-crown)"/>
      <rect x="9" y="35" width="30" height="4" fill="var(--logo-gold)"/>
    </svg>
  );
}

// Icon (24px stroke) — minimal, sketched glyphs
export function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.5 }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round'
  };
  switch (name) {
    case 'search':  return <svg {...props}><circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/></svg>;
    case 'sun':     return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
    case 'moon':    return <svg {...props}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>;
    case 'pin':     return <svg {...props}><path d="M12 2v6M12 8l4 4v3H8v-3l4-4zM12 15v7"/></svg>;
    case 'pinned':  return <svg {...props} fill="currentColor"><path d="M12 2v6M12 8l4 4v3H8v-3l4-4zM12 15v7"/></svg>;
    case 'x':       return <svg {...props}><path d="M5 5l14 14M19 5 5 19"/></svg>;
    case 'menu':    return <svg {...props}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'arrow-up': return <svg {...props}><path d="M12 19V5M5 12l7-7 7 7"/></svg>;
    case 'arrow-down': return <svg {...props}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>;
    case 'arrow-right': return <svg {...props}><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
    case 'filter':  return <svg {...props}><path d="M3 5h18M6 12h12M10 19h4"/></svg>;
    case 'sliders': return <svg {...props}><path d="M4 7h8M16 7h4M4 17h4M12 17h8"/><circle cx="14" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>;
    case 'columns': return <svg {...props}><rect x="3" y="4" width="6" height="16" rx="1"/><rect x="11" y="4" width="4" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>;
    case 'compare': return <svg {...props}><rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/></svg>;
    case 'chev-down': return <svg {...props}><path d="m6 9 6 6 6-6"/></svg>;
    case 'chev-up':   return <svg {...props}><path d="m6 15 6-6 6 6"/></svg>;
    case 'check':   return <svg {...props}><path d="m5 13 4 4L19 7"/></svg>;
    case 'globe':   return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
    case 'wave':    return <svg {...props}><path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/></svg>;
    case 'sparkle': return <svg {...props}><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6 9 9M15 15l3.4 3.4M5.6 18.4 9 15M15 9l3.4-3.4"/></svg>;
    case 'dot':     return <svg {...props} fill="currentColor"><circle cx="12" cy="12" r="3" stroke="none"/></svg>;
    case 'download': return <svg {...props}><path d="M12 3v12M8 11l4 4 4-4M5 21h14"/></svg>;
    case 'refresh':  return <svg {...props}><path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5"/></svg>;
    case 'clock':    return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>;
    case 'export':   return <svg {...props}><path d="M12 15V3M8 7l4-4 4 4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>;
    default: return null;
  }
}

// Expose
Object.assign(window, { fmt, Chip, Tag, Delta, RangeBar, MicroBar, Icon, btn, iconBtnStyle });
