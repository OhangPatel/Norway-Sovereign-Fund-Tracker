import { useState } from 'react';

// Hand-rolled SVG charts — bar, histogram, horizontal bar, donut

// Horizontal bar list (top holdings)
export function TopBarList({ items, max, valueFmt, height = 280, onClick, accent = 'var(--accent)' }) {
  const n = items.length;
  const rowH = Math.max(18, (height - 8) / n);
  return (
    <div style={{ width: '100%' }}>
      {items.map((it, i) => {
        const pct = max ? (it.value / max) * 100 : 0;
        return (
          <div key={it.key || i}
            onClick={() => onClick && onClick(it)}
            style={{
              display: 'grid',
              gridTemplateColumns: '20px 1fr auto',
              alignItems: 'center',
              gap: 10,
              padding: '6px 0',
              cursor: onClick ? 'pointer' : 'default',
              borderBottom: i < n - 1 ? '1px solid var(--hairline)' : 'none',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in oklch, var(--surface-2) 40%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{String(i + 1).padStart(2,'0')}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{
                display:'flex', justifyContent:'space-between', alignItems:'baseline',
                fontSize: 12, marginBottom: 4, gap: 8
              }}>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: 'var(--ink)' }}>{it.label}</span>
                <span className="mono" style={{ fontSize: 11, color:'var(--muted)' }}>{it.sub}</span>
              </div>
              <div style={{ position: 'relative', height: 4, background:'var(--surface-2)', borderRadius:2 }}>
                <div style={{
                  position:'absolute', left:0, top:0, bottom:0, width: pct + '%',
                  background: accent, borderRadius: 2
                }}/>
              </div>
            </div>
            <span className="mono" style={{ fontSize: 12, color:'var(--ink)', whiteSpace:'nowrap' }}>{valueFmt(it.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Histogram (distribution of ownership %)
export function Histogram({ data, bins = 20, height = 140, accent = 'var(--accent)', xFmt = v => v.toFixed(1) }) {
  if (!data || !data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(max - min, 0.0001);
  const buckets = new Array(bins).fill(0);
  for (const v of data) {
    let b = Math.floor(((v - min) / range) * bins);
    if (b >= bins) b = bins - 1;
    if (b < 0) b = 0;
    buckets[b] += 1;
  }
  const peak = Math.max(...buckets);
  const w = 1000;
  const h = height;
  const barW = w / bins;
  return (
    <div style={{ width:'100%' }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h}
        style={{ display:'block', overflow:'visible' }}>
        {/* grid */}
        {[0.25, 0.5, 0.75].map(g => (
          <line key={g} x1={0} x2={w} y1={h * (1-g)} y2={h * (1-g)} stroke="var(--hairline)" strokeDasharray="2 4"/>
        ))}
        {buckets.map((c, i) => {
          const bh = peak ? (c / peak) * (h - 8) : 0;
          return (
            <g key={i}>
              <rect x={i*barW + 1} y={h - bh} width={barW - 2} height={bh}
                fill={accent} opacity={0.85} rx={1}/>
            </g>
          );
        })}
      </svg>
      <div className="mono" style={{
        display:'flex', justifyContent:'space-between',
        fontSize: 10.5, color:'var(--muted)', marginTop: 4
      }}>
        <span>{xFmt(min)}</span><span>{xFmt((min+max)/2)}</span><span>{xFmt(max)}</span>
      </div>
    </div>
  );
}

// Donut (sector breakdown)
export function Donut({ slices, size = 180, thickness = 22, hoverIndex, onHover }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 2;
  const ir = r - thickness;
  const cx = size / 2, cy = size / 2;
  let acc = 0;
  const arcs = slices.map((s, i) => {
    const start = acc / total;
    acc += s.value;
    const end = acc / total;
    const a0 = start * Math.PI * 2 - Math.PI / 2;
    const a1 = end * Math.PI * 2 - Math.PI / 2;
    const large = end - start > 0.5 ? 1 : 0;
    const x0 = cx + Math.cos(a0) * r,  y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r,  y1 = cy + Math.sin(a1) * r;
    const ix0 = cx + Math.cos(a0) * ir, iy0 = cy + Math.sin(a0) * ir;
    const ix1 = cx + Math.cos(a1) * ir, iy1 = cy + Math.sin(a1) * ir;
    const d = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${large} 0 ${ix0} ${iy0} Z`;
    return { d, color: s.color, label: s.label, value: s.value, pct: (s.value/total)*100, i };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display:'block' }}>
      {arcs.map(a => (
        <path key={a.i} d={a.d} fill={a.color}
          opacity={hoverIndex == null || hoverIndex === a.i ? 1 : 0.32}
          onMouseEnter={() => onHover && onHover(a.i)}
          onMouseLeave={() => onHover && onHover(null)}
          style={{ transition: 'opacity .15s', cursor: onHover ? 'pointer' : 'default' }}
        />
      ))}
    </svg>
  );
}

// Interactive price chart: line + fill + hover crosshair with a date/price tooltip
const _MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDay(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${_MONTHS[+m - 1]} ${+d}, ${y}`;
}

export function PriceChart({ points, dates, width = 320, height = 84, color = 'auto', valueFmt = (v) => v }) {
  const [hover, setHover] = useState(null);
  if (!points || points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 0.0001);
  const sx = (i) => (i / (points.length - 1)) * width;
  const sy = (v) => height - ((v - min) / range) * (height - 2) - 1;
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${sx(i).toFixed(1)} ${sy(p).toFixed(1)}`).join(' ');
  const stroke = color === 'auto' ? (points[points.length - 1] >= points[0] ? 'var(--pos)' : 'var(--neg)') : color;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = rect.width ? (e.clientX - rect.left) / rect.width : 0;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))));
  };

  const hx = hover != null ? sx(hover) : 0;
  const hy = hover != null ? sy(points[hover]) : 0;

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={stroke} opacity={0.12}/>
        <path d={d} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round"/>
        {hover != null && (
          <g>
            <line x1={hx} y1={0} x2={hx} y2={height} stroke="var(--muted)" strokeWidth={0.75} strokeDasharray="3 3"/>
            <circle cx={hx} cy={hy} r={3} fill={stroke} stroke="var(--bg)" strokeWidth={1.5}/>
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="mono" style={{
          position: 'absolute', top: 0,
          left: Math.max(0, Math.min(hx - 40, width - 96)),
          transform: 'translateY(-100%)',
          pointerEvents: 'none',
          background: 'var(--surface)', border: '1px solid var(--hairline-strong)',
          borderRadius: 6, padding: '4px 8px', whiteSpace: 'nowrap',
          boxShadow: '0 6px 16px rgba(0,0,0,.28)',
        }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{dates ? fmtDay(dates[hover]) : ''}</div>
          <div style={{ fontSize: 12, color: 'var(--ink)', marginTop: 1 }}>{valueFmt(points[hover])}</div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { TopBarList, Histogram, Donut, PriceChart });
