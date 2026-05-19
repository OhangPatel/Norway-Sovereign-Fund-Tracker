// Formatting + small UI primitives shared across components.

const fmt = {
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
  signedPct(n, digits = 2) {
    if (n == null || isNaN(n)) return '—';
    const s = n >= 0 ? '+' : '';
    return s + (n * 100).toFixed(digits) + '%';
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

// Small chip / badge
function Chip({ children, tone = 'neutral', style = {} }) {
  const tones = {
    neutral: { bg: 'var(--surface-2)', fg: 'var(--ink-2)', bd: 'var(--hairline)' },
    pos:     { bg: 'color-mix(in oklch, var(--pos) 14%, transparent)', fg: 'var(--pos)', bd: 'color-mix(in oklch, var(--pos) 35%, transparent)' },
    neg:     { bg: 'color-mix(in oklch, var(--neg) 14%, transparent)', fg: 'var(--neg)', bd: 'color-mix(in oklch, var(--neg) 35%, transparent)' },
    accent:  { bg: 'color-mix(in oklch, var(--accent) 18%, transparent)', fg: 'var(--accent)', bd: 'color-mix(in oklch, var(--accent) 35%, transparent)' },
    info:    { bg: 'color-mix(in oklch, var(--info) 14%, transparent)', fg: 'var(--info)', bd: 'color-mix(in oklch, var(--info) 30%, transparent)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems:'center', gap: 6,
      padding: '2px 8px',
      borderRadius: 999,
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

// Tiny up/down delta
function Delta({ value, fmt: f = 'pct' }) {
  if (value == null) return <span className="mono" style={{color:'var(--muted)'}}>—</span>;
  const pos = value >= 0;
  const arrow = pos ? '▲' : '▼';
  const label = f === 'pct' ? fmt.signedPct(value) : (pos ? '+' : '') + fmt.short(value, 2);
  return (
    <span className="mono" style={{
      color: pos ? 'var(--pos)' : 'var(--neg)',
      fontSize: 12, fontWeight: 500,
      display: 'inline-flex', alignItems:'center', gap: 4,
    }}>
      <span style={{ fontSize: 9 }}>{arrow}</span>{label}
    </span>
  );
}

// 52-week range visual: low ─── current ─── high
function RangeBar({ low, high, value, height = 8, showLabels = false }) {
  if (low == null || high == null || value == null) {
    return <div style={{ height, background: 'var(--surface-2)', borderRadius: 99 }}/>;
  }
  const range = Math.max(high - low, 0.0001);
  const t = Math.max(0, Math.min(1, (value - low) / range));
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        position: 'relative', height, borderRadius: 99,
        background: 'linear-gradient(90deg, color-mix(in oklch, var(--neg) 40%, transparent), color-mix(in oklch, var(--muted-2) 30%, transparent) 50%, color-mix(in oklch, var(--pos) 40%, transparent))',
        border: '1px solid var(--hairline)',
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
          fontSize: 10.5, color:'var(--muted)', marginTop: 4
        }}>
          <span>{fmt.price(low)}</span>
          <span>{fmt.price(high)}</span>
        </div>
      )}
    </div>
  );
}

// Sparkline-ish micro bar: percent fill (for ownership column)
function MicroBar({ value, max, tone = 'accent', height = 4 }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const tones = {
    accent: 'var(--accent)',
    pos: 'var(--pos)',
    neg: 'var(--neg)',
    info: 'var(--info)',
    muted: 'var(--muted-2)',
  };
  return (
    <div style={{
      height, background: 'var(--surface-2)',
      borderRadius: 2, overflow: 'hidden',
      border: '1px solid var(--hairline)',
    }}>
      <div style={{ height: '100%', width: pct + '%', background: tones[tone], transition: 'width .3s ease' }}/>
    </div>
  );
}

// Icon (24px stroke) — minimal, sketched glyphs
function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.5 }) {
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
    case 'arrow-up': return <svg {...props}><path d="M12 19V5M5 12l7-7 7 7"/></svg>;
    case 'arrow-down': return <svg {...props}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>;
    case 'arrow-right': return <svg {...props}><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
    case 'filter':  return <svg {...props}><path d="M3 5h18M6 12h12M10 19h4"/></svg>;
    case 'columns': return <svg {...props}><rect x="3" y="4" width="6" height="16" rx="1"/><rect x="11" y="4" width="4" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>;
    case 'compare': return <svg {...props}><rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/></svg>;
    case 'chev-down': return <svg {...props}><path d="m6 9 6 6 6-6"/></svg>;
    case 'chev-up':   return <svg {...props}><path d="m6 15 6-6 6 6"/></svg>;
    case 'check':   return <svg {...props}><path d="m5 13 4 4L19 7"/></svg>;
    case 'globe':   return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
    case 'wave':    return <svg {...props}><path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/></svg>;
    case 'sparkle': return <svg {...props}><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6 9 9M15 15l3.4 3.4M5.6 18.4 9 15M15 9l3.4-3.4"/></svg>;
    case 'dot':     return <svg {...props} fill="currentColor"><circle cx="12" cy="12" r="3" stroke="none"/></svg>;
    default: return null;
  }
}

// Expose
Object.assign(window, { fmt, Chip, Delta, RangeBar, MicroBar, Icon });
