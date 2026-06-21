import React from 'react';
import { fmt, Icon } from './format.jsx';

// Filters strip — country/sector multi-select chips + ownership range slider + reset

// Shared ghost-pill trigger style (STYLE_GUIDE §5): mono/uppercase, rounded.
function pillStyle(active) {
  return {
    display:'inline-flex', alignItems:'center', gap: 6,
    padding: '7px 13px',
    background: active ? 'var(--row-hover)' : 'transparent',
    color: 'var(--ink)',
    border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
    borderRadius: 999, cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
    letterSpacing: '0.04em', textTransform: 'uppercase',
    transition: 'border-color .14s, background .14s',
  };
}

const countBadge = {
  padding: '1px 6px', borderRadius: 999,
  background: 'var(--accent)', color: 'var(--treemap-cell-fg)',
  fontSize: 10, fontWeight: 600,
};

const popoverStyle = {
  background: 'var(--surface)', border: '1px solid var(--line)',
  borderRadius: 16, zIndex: 30,
  boxShadow: '0 24px 48px -20px rgba(0,0,0,.45)',
  animation: 'rise .12s ease-out',
};

export function Filters({ data, filters, setFilters, columns, setColumns, showColumns, setShowColumns, count }) {
  const allCountries = React.useMemo(() => [...new Set(data.map(d => d.country))].filter(Boolean).sort(), [data]);
  const allSectors = React.useMemo(() => [...new Set(data.map(d => d.sector || d.industry))].filter(Boolean).sort(), [data]);
  const allRecs = React.useMemo(() => [...new Set(data.map(d => d.rec))].filter(Boolean).sort(), [data]);

  const toggleSet = (key, value) => {
    setFilters(f => {
      const s = new Set(f[key]);
      if (s.has(value)) s.delete(value); else s.add(value);
      return { ...f, [key]: [...s] };
    });
  };

  const ownerships = data.map(d => d.ownership || 0);
  const maxOwn = Math.max(...ownerships);

  const reset = () => setFilters({
    countries: [], sectors: [], recs: [],
    ownMin: 0, ownMax: maxOwn,
    pinned: false,
  });

  const dirty = filters.countries.length || filters.sectors.length || filters.recs.length || filters.ownMin > 0 || filters.ownMax < maxOwn || filters.pinned;

  return (
    <div style={{
      display:'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center',
      padding: '14px 18px',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 16,
    }}>
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap: 8 }}>
        <FilterMenu
          label="Country"
          icon="globe"
          options={allCountries}
          selected={filters.countries}
          onToggle={(v) => toggleSet('countries', v)}
          onClear={() => setFilters(f => ({ ...f, countries: [] }))}
          counter={(opt) => data.filter(d => d.country === opt).length}
        />
        <FilterMenu
          label="Sector"
          icon="wave"
          options={allSectors}
          selected={filters.sectors}
          onToggle={(v) => toggleSet('sectors', v)}
          onClear={() => setFilters(f => ({ ...f, sectors: [] }))}
          counter={(opt) => data.filter(d => (d.sector || d.industry) === opt).length}
        />
        <FilterMenu
          label="Analyst rec"
          icon="sparkle"
          options={allRecs}
          selected={filters.recs}
          onToggle={(v) => toggleSet('recs', v)}
          onClear={() => setFilters(f => ({ ...f, recs: [] }))}
          format={v => fmt.rec(v)}
          counter={(opt) => data.filter(d => d.rec === opt).length}
        />

        {/* Ownership range */}
        <RangeFilter
          label="Ownership %"
          min={0}
          max={maxOwn}
          step={0.1}
          valueMin={filters.ownMin}
          valueMax={filters.ownMax}
          onChange={(lo, hi) => setFilters(f => ({ ...f, ownMin: lo, ownMax: hi }))}
          formatValue={v => v.toFixed(1) + '%'}
        />

        <button onClick={() => setFilters(f => ({ ...f, pinned: !f.pinned }))}
          style={pillStyle(filters.pinned)}>
          <Icon name={filters.pinned ? 'pinned' : 'pin'} size={13}/>
          Pinned only
        </button>

        {dirty && (
          <button onClick={reset}
            style={{
              padding: '7px 12px', background: 'transparent',
              color: 'var(--soft)', border: '1px dashed var(--line)',
              borderRadius: 999, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
            Reset
          </button>
        )}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
        <div className="mono" style={{ fontSize: 11.5, color: 'var(--soft)' }}>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{count.toLocaleString()}</span> / {data.length.toLocaleString()} companies
        </div>
      </div>

      {showColumns && (
        <ColumnsPopover columns={columns} setColumns={setColumns} onClose={() => setShowColumns(false)}/>
      )}
    </div>
  );
}

export function FilterMenu({ label, icon, options, selected, onToggle, onClear, format = (v) => v, counter }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const active = selected.length > 0;
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={pillStyle(active)}>
        <Icon name={icon} size={13}/>
        <span>{label}</span>
        {active && <span className="mono" style={countBadge}>{selected.length}</span>}
        <Icon name="chev-down" size={12} color="var(--soft)"/>
      </button>
      {open && (
        <div style={{
          ...popoverStyle,
          position:'absolute', top: 'calc(100% + 8px)', left: 0,
          minWidth: 240, maxHeight: 360, overflowY: 'auto', padding: 6,
        }}>
          {options.map(opt => {
            const sel = selected.includes(opt);
            return (
              <button key={opt} onClick={() => onToggle(opt)}
                style={{
                  display:'grid', gridTemplateColumns:'16px 1fr auto', alignItems:'center', gap: 10,
                  width:'100%', padding:'8px 10px',
                  background: sel ? 'var(--row-hover)' : 'transparent',
                  border:'none', borderRadius: 8,
                  textAlign:'left', cursor:'pointer',
                  color:'var(--ink)', fontFamily:'var(--font-display)', fontSize: 13,
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--row-hover)'; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
              >
                <Check on={sel}/>
                <span>{format(opt)}</span>
                {counter && <span className="mono" style={{ fontSize: 10.5, color:'var(--soft)' }}>{counter(opt)}</span>}
              </button>
            );
          })}
          {selected.length > 0 && (
            <button onClick={onClear}
              style={{
                width:'100%', padding:'8px 10px', marginTop: 4,
                background:'transparent', border:'none',
                borderTop: '1px solid var(--line)',
                color:'var(--soft)', fontFamily:'var(--font-mono)', fontSize: 10.5,
                cursor:'pointer', textAlign:'left',
                letterSpacing:'0.08em', textTransform: 'uppercase',
              }}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function RangeFilter({ label, min, max, step, valueMin, valueMax, onChange, formatValue }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const active = valueMin > min || valueMax < max;

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={pillStyle(active)}>
        <Icon name="filter" size={13}/>
        <span>{label}</span>
        {active && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--sub)', textTransform: 'none', letterSpacing: 0 }}>
            {formatValue(valueMin)}–{formatValue(valueMax)}
          </span>
        )}
        <Icon name="chev-down" size={12} color="var(--soft)"/>
      </button>
      {open && (
        <div style={{
          ...popoverStyle,
          position:'absolute', top: 'calc(100% + 8px)', left: 0,
          width: 320, padding: 18,
        }}>
          <div className="eyebrow" style={{ fontSize: 9.5, marginBottom: 14 }}>{label}</div>
          <div style={{ position: 'relative', height: 32 }}>
            <div style={{ position:'absolute', left: 0, right: 0, top: 14, height: 4, background:'var(--track)', borderRadius:999 }}/>
            <div style={{
              position:'absolute',
              left:  ((valueMin - min) / (max - min) * 100) + '%',
              right: (100 - ((valueMax - min) / (max - min) * 100)) + '%',
              top: 14, height: 4, background:'var(--accent)', borderRadius:999
            }}/>
            <input type="range" min={min} max={max} step={step} value={valueMin}
              onChange={e => onChange(Math.min(+e.target.value, valueMax), valueMax)}
              style={{ position:'absolute', inset:0, width:'100%', appearance:'none', background:'transparent', pointerEvents:'auto' }}
              className="range-input"
            />
            <input type="range" min={min} max={max} step={step} value={valueMax}
              onChange={e => onChange(valueMin, Math.max(+e.target.value, valueMin))}
              style={{ position:'absolute', inset:0, width:'100%', appearance:'none', background:'transparent', pointerEvents:'auto' }}
              className="range-input"
            />
          </div>
          <div className="mono" style={{
            display:'flex', justifyContent:'space-between',
            fontSize: 11, color:'var(--sub)', marginTop: 8
          }}>
            <span>{formatValue(valueMin)}</span>
            <span>{formatValue(valueMax)}</span>
          </div>
        </div>
      )}
      <style>{`
        .range-input::-webkit-slider-thumb {
          appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: var(--ink); border: 3px solid var(--accent);
          cursor: pointer;
        }
        .range-input::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--ink); border: 3px solid var(--accent);
          cursor: pointer;
        }
        .range-input::-webkit-slider-runnable-track,
        .range-input::-moz-range-track { background: transparent; }
      `}</style>
    </div>
  );
}

export function ColumnsPopover({ columns, setColumns, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      ...popoverStyle,
      position:'absolute', top: 'calc(100% + 8px)', right: 18,
      width: 240, padding: 8, zIndex: 40,
    }}>
      <div className="eyebrow" style={{ padding: '6px 10px', fontSize: 9.5 }}>Visible columns</div>
      {Object.entries(columns).map(([key, col]) => (
        <button key={key} onClick={() => setColumns(c => ({ ...c, [key]: { ...c[key], visible: !c[key].visible } }))}
          style={{
            display:'grid', gridTemplateColumns:'16px 1fr', alignItems:'center', gap: 10,
            width:'100%', padding:'7px 10px',
            background: 'transparent', border:'none', borderRadius: 8,
            textAlign:'left', cursor:'pointer',
            color: col.visible ? 'var(--ink)' : 'var(--soft)',
            fontFamily:'var(--font-display)', fontSize: 13,
          }}>
          <Check on={col.visible}/>
          {col.label}
        </button>
      ))}
    </div>
  );
}

// Lime checkbox: accent fill + dark check when on, hairline box when off.
function Check({ on }) {
  return (
    <span style={{
      width:16, height:16, borderRadius:4,
      border:`1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
      background: on ? 'var(--accent)' : 'transparent',
      display:'grid', placeItems:'center',
    }}>
      {on && <Icon name="check" size={10} color="var(--treemap-cell-fg)" strokeWidth={2.5}/>}
    </span>
  );
}
