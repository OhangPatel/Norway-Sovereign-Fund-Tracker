import { useState, useRef, useEffect, useMemo } from 'react';

// Hand-rolled SVG charts: histogram, treemap, price line

// Histogram (distribution of ownership %)
export function Histogram({ data, bins = 20, height = 140, accent = 'var(--accent)', xFmt = v => v.toFixed(1), onSelect }) {
  const [selected, setSelected] = useState(null); // selected bin index, or null
  // Drop a stale selection (and notify) whenever the underlying data changes.
  useEffect(() => { setSelected(null); onSelect && onSelect(null); }, [data]);
  if (!data || !data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(max - min, 0.0001);

  const toggle = (i) => {
    const next = selected === i ? null : i;
    setSelected(next);
    if (onSelect) onSelect(next == null ? null : {
      lo: min + (i / bins) * range,
      hi: min + ((i + 1) / bins) * range,
      last: i === bins - 1,
    });
  };
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
        role="group" aria-label="Histogram of ownership share per company; select a bar to filter the ledger"
        style={{ display:'block', overflow:'visible' }}>
        {/* grid */}
        {[0.25, 0.5, 0.75].map(g => (
          <line key={g} x1={0} x2={w} y1={h * (1-g)} y2={h * (1-g)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke"/>
        ))}
        {buckets.map((c, i) => {
          const bh = peak ? (c / peak) * (h - 8) : 0;
          const dimmed = selected != null && selected !== i;
          return (
            <g key={i}>
              <rect className="r-hist-bar" x={i*barW + barW * 0.18} y={h - bh} width={barW * 0.64} height={bh}
                fill={accent} opacity={dimmed ? 0.25 : 1} rx={barW * 0.32}
                style={{ cursor: 'pointer', '--i': i }}
                onClick={() => toggle(i)}/>
              {/* Full-height hit area so thin/empty bars stay clickable */}
              <rect x={i*barW} y={0} width={barW} height={h} fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => toggle(i)}/>
            </g>
          );
        })}
      </svg>
      <div className="mono" style={{
        display:'flex', justifyContent:'space-between',
        fontSize: 'var(--text-xs)', color:'var(--soft)', marginTop: 4
      }}>
        <span>{xFmt(min)}</span><span>{xFmt((min+max)/2)}</span><span>{xFmt(max)}</span>
      </div>
    </div>
  );
}


// Squarified treemap (sector weight) — S&P-500-style heat grid (STYLE_GUIDE §5).
// Cell area ∝ value; the squarified algorithm (Bruls et al.) keeps every cell as
// close to square as possible instead of producing thin slivers.
function computeSquarified(values, W, H) {
  const result = new Array(values.length);
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0 || W <= 0 || H <= 0) return values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));

  const nodes = values.map((v, idx) => ({ area: (v / total) * (W * H), idx }));

  const worst = (row, len) => {
    const sum = row.reduce((a, r) => a + r.area, 0);
    let max = -Infinity, min = Infinity;
    for (const r of row) { if (r.area > max) max = r.area; if (r.area < min) min = r.area; }
    const s2 = sum * sum, l2 = len * len;
    return Math.max((l2 * max) / s2, s2 / (l2 * min));
  };

  const place = (items, x, y, w, h) => {
    if (!items.length) return;
    if (w <= 0 || h <= 0) { for (const n of items) result[n.idx] = { x, y, w: 0, h: 0 }; return; }
    const len = Math.min(w, h);
    let row = [], i = 0;
    while (i < items.length) {
      const cand = row.concat(items[i]);
      if (row.length === 0 || worst(cand, len) <= worst(row, len)) { row = cand; i++; }
      else break;
    }
    const rest = items.slice(i);
    const sum = row.reduce((a, r) => a + r.area, 0);
    if (w >= h) {
      const bandW = sum / h;
      let cy = y;
      for (const r of row) { const ch = r.area / bandW; result[r.idx] = { x, y: cy, w: bandW, h: ch }; cy += ch; }
      place(rest, x + bandW, y, w - bandW, h);
    } else {
      const bandH = sum / w;
      let cx = x;
      for (const r of row) { const cw = r.area / bandH; result[r.idx] = { x: cx, y, w: cw, h: bandH }; cx += cw; }
      place(rest, x, y + bandH, w, h - bandH);
    }
  };

  place(nodes, 0, 0, W, H);
  return result;
}

// `highlight` lights the tile with that label from outside (a list beside it), and
// `onHover` reports the tile under the pointer back, so the two stay in step.
export function Treemap({ items, height = 300, gap = 5, radius = 4, minShare = 0.011, onClick, highlight = null, onHover }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => { for (const e of entries) setWidth(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [hover, setHover] = useState(null); // { i, x, y }

  const data = useMemo(
    () => (items || []).filter(it => it.value > 0).sort((a, b) => b.value - a.value),
    [items]
  );
  // Lay out on floored values so the smallest sectors stay clickable. The true
  // share (it.pct) is still shown in labels/tooltip — only the geometry is nudged.
  const rects = useMemo(() => {
    const vals = data.map(d => d.value);
    const total = vals.reduce((a, b) => a + b, 0);
    const floor = total * minShare;
    return computeSquarified(vals.map(v => Math.max(v, floor)), width, height);
  }, [data, width, height, minShare]);

  const hovered = hover != null ? data[hover.i] : null;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height }}>
      {data.map((it, i) => {
        const r = rects[i];
        if (!r || r.w <= 0 || r.h <= 0) return null;
        // Adaptive gutter so even tiny cells keep a visible, hoverable footprint.
        const gx = Math.min(gap, Math.max(0, r.w - 1));
        const gy = Math.min(gap, Math.max(0, r.h - 1));
        const cw = r.w - gx, ch = r.h - gy;
        const showName = cw > 44 && ch > 22;
        const showPct = cw > 44 && ch > 40;
        // Clicking a tile filters the whole table, so it is a control and has to be one. aria-label carries the share, which is otherwise
        // only in the hover tooltip and on the cells too small to print a label.
        const Tag = onClick ? 'button' : 'div';
        return (
          <Tag key={it.label}
            type={onClick ? 'button' : undefined}
            aria-label={onClick ? `${it.label}: ${it.pct.toFixed(1)}% of value. Filter to this sector.` : undefined}
            onClick={() => onClick && onClick(it)}
            className="r-tile"
            onMouseEnter={e => { setHover({ i, x: e.clientX, y: e.clientY }); onHover && onHover(it.label); }}
            onMouseMove={e => setHover({ i, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => { setHover(null); onHover && onHover(null); }}
            onFocus={() => onHover && onHover(it.label)}
            onBlur={() => onHover && onHover(null)}
            style={{
              '--i': i,
              position: 'absolute',
              border: 'none', font: 'inherit', textAlign: 'left', display: 'block',
              left: r.x + gx / 2, top: r.y + gy / 2,
              width: cw, height: ch,
              background: it.color, borderRadius: Math.min(radius, cw / 2, ch / 2),
              padding: showName ? '7px 9px' : 0, overflow: 'hidden',
              color: 'var(--treemap-cell-fg)', boxSizing: 'border-box',
              cursor: onClick ? 'pointer' : 'default',
              // Hover draws an inset ring; at rest no outline is set inline, so the
              // stylesheet's :focus-visible ring shows for keyboard users.
              outline: (hover && hover.i === i) || highlight === it.label ? '2px solid var(--ink)' : undefined,
              outlineOffset: (hover && hover.i === i) || highlight === it.label ? -2 : undefined,
            }}>
            {showName && (
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
            )}
            {showPct && (
              <div className="mono" style={{ fontSize: 'var(--text-xs)', marginTop: 1 }}>{it.pct.toFixed(1)}%</div>
            )}
          </Tag>
        );
      })}

      {hovered && (() => {
        // Flip the tooltip to the left of the cursor near the right edge so it
        // doesn't run off-screen for right-side cells.
        const flip = hover.x > window.innerWidth * 0.6;
        return (
        <div style={{
          position: 'fixed',
          left: flip ? hover.x - 14 : hover.x + 14, top: hover.y + 14, zIndex: 'var(--z-tooltip)',
          transform: flip ? 'translateX(-100%)' : 'none',
          pointerEvents: 'none', whiteSpace: 'nowrap',
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 'var(--r-sm)', padding: '7px 10px', boxShadow: 'var(--shadow-pop)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: hovered.color, flexShrink: 0 }}/>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{hovered.label}</span>
          </div>
          <div className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--soft)', marginTop: 3 }}>{hovered.pct.toFixed(2)}% of value</div>
        </div>
        );
      })()}
    </div>
  );
}

// Interactive price chart: line + fill + hover crosshair with a date/price tooltip
const _MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Intraday points arrive as "2026-08-07 15:55" — the time is what separates them,
// so it replaces the year. Daily and coarser stay "Aug 7, 2026".
function fmtDay(s) {
  if (!s) return '';
  const [date, time] = s.split(' ');
  const [y, m, d] = date.split('-');
  return `${_MONTHS[+m - 1]} ${+d}, ${time || y}`;
}

export function PriceChart({ points, dates, height = 84, color = 'auto', valueFmt = (v) => v }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);

  // Fill the available width responsively so the chart can never overflow its
  // grid column (the column shrinks/grows; the chart follows).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => { for (const e of entries) setWidth(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Always render the measuring container so width is known; draw once we have a
  // measured width and enough points.
  let body = null;
  if (points && points.length >= 2 && width > 0) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = Math.max(max - min, 0.0001);
    const sx = (i) => (i / (points.length - 1)) * width;
    const sy = (v) => height - ((v - min) / range) * (height - 2) - 1;
    const d = points.map((p, i) => `${i ? 'L' : 'M'} ${sx(i).toFixed(1)} ${sy(p).toFixed(1)}`).join(' ');
    // -text, not the fill token: this is a 1.25px line, and #4ADE80 on --surface is
    // 1.74:1 — below the 3:1 WCAG asks of a graphic you have to be able to trace. The
    // area under it reuses the same colour at 12%, which reads as a tint either way.
    const stroke = color === 'auto' ? (points[points.length - 1] >= points[0] ? 'var(--bull-text)' : 'var(--bear-text)') : color;

    const onMove = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const rel = rect.width ? (e.clientX - rect.left) / rect.width : 0;
      setHover(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))));
    };

    const hx = hover != null ? sx(hover) : 0;
    const hy = hover != null ? sy(points[hover]) : 0;

    body = (
      <>
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}
          role="img" aria-label="Price history line chart"
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={stroke} opacity={0.12}/>
          <path d={d} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round"/>
          {hover != null && (
            <g>
              <line x1={hx} y1={0} x2={hx} y2={height} stroke="var(--soft)" strokeWidth={1}/>
              <circle cx={hx} cy={hy} r={3} fill={stroke} stroke="var(--surface)" strokeWidth={1.5}/>
            </g>
          )}
        </svg>
        {hover != null && (
          <div className="mono" style={{
            position: 'absolute', top: 0,
            left: Math.max(0, Math.min(hx - 40, width - 96)),
            transform: 'translateY(-100%)',
            pointerEvents: 'none',
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-sm)', padding: '4px 8px', whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-pop)',
          }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--soft)' }}>{dates ? fmtDay(dates[hover]) : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--ink)', marginTop: 1 }}>{valueFmt(points[hover])}</div>
          </div>
        )}
      </>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height }}>
      {body}
    </div>
  );
}

Object.assign(window, { Histogram, Treemap, PriceChart });
