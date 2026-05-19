// Filters strip — country/sector multi-select chips + ownership range slider + reset

function Filters({ data, filters, setFilters, columns, setColumns, showColumns, setShowColumns, count }) {
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
      background: 'var(--bg-2)',
      border: '1px solid var(--hairline)',
      borderRadius: 12,
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
          style={{
            display:'inline-flex', alignItems:'center', gap: 6,
            padding: '7px 11px',
            background: filters.pinned ? 'var(--accent)' : 'var(--bg-2)',
            color: filters.pinned ? 'var(--accent-ink)' : 'var(--ink-2)',
            border: `1px solid ${filters.pinned ? 'var(--accent)' : 'var(--hairline)'}`,
            borderRadius: 8, cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500,
          }}>
          <Icon name={filters.pinned ? 'pinned' : 'pin'} size={13}/>
          Pinned only
        </button>

        {dirty && (
          <button onClick={reset}
            style={{
              padding: '7px 10px', background: 'transparent',
              color: 'var(--muted)', border: '1px dashed var(--hairline-strong)',
              borderRadius: 8, cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 12,
            }}>
            Reset filters
          </button>
        )}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
        <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{count.toLocaleString()}</span> / {data.length.toLocaleString()} companies
        </div>
      </div>

      {showColumns && (
        <ColumnsPopover columns={columns} setColumns={setColumns} onClose={() => setShowColumns(false)}/>
      )}
    </div>
  );
}

function FilterMenu({ label, icon, options, selected, onToggle, onClear, format = (v) => v, counter }) {
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
      <button onClick={() => setOpen(o => !o)}
        style={{
          display:'inline-flex', alignItems:'center', gap: 6,
          padding: '7px 11px',
          background: active ? 'color-mix(in oklch, var(--accent) 14%, var(--bg-2))' : 'var(--bg-2)',
          color: active ? 'var(--ink)' : 'var(--ink-2)',
          border: `1px solid ${active ? 'color-mix(in oklch, var(--accent) 50%, var(--hairline))' : 'var(--hairline)'}`,
          borderRadius: 8, cursor: 'pointer',
          fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500,
        }}>
        <Icon name={icon} size={13}/>
        <span>{label}</span>
        {active && (
          <span className="mono" style={{
            padding: '1px 6px', borderRadius: 99,
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 10, fontWeight: 600
          }}>{selected.length}</span>
        )}
        <Icon name="chev-down" size={12} color="var(--muted)"/>
      </button>
      {open && (
        <div style={{
          position:'absolute', top: 'calc(100% + 6px)', left: 0,
          minWidth: 240, maxHeight: 360, overflowY: 'auto',
          background: 'var(--surface)', border:'1px solid var(--hairline-strong)',
          borderRadius: 10, padding: 4, zIndex: 30,
          boxShadow: '0 24px 48px -16px rgba(0,0,0,.55)',
          animation: 'rise .12s ease-out'
        }}>
          {options.map(opt => {
            const sel = selected.includes(opt);
            return (
              <button key={opt} onClick={() => onToggle(opt)}
                style={{
                  display:'grid', gridTemplateColumns:'14px 1fr auto', alignItems:'center', gap: 10,
                  width:'100%', padding:'7px 10px',
                  background: sel ? 'var(--surface-2)' : 'transparent',
                  border:'none', borderRadius: 6,
                  textAlign:'left', cursor:'pointer',
                  color:'var(--ink)', fontFamily:'var(--font-ui)', fontSize: 12.5,
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'color-mix(in oklch, var(--surface-2) 50%, transparent)'; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  width:14, height:14, borderRadius:3,
                  border:`1.5px solid ${sel ? 'var(--accent)' : 'var(--hairline-strong)'}`,
                  background: sel ? 'var(--accent)' : 'transparent',
                  display:'grid', placeItems:'center',
                }}>
                  {sel && <Icon name="check" size={10} color="var(--accent-ink)" strokeWidth={2.5}/>}
                </span>
                <span>{format(opt)}</span>
                {counter && <span className="mono" style={{ fontSize: 10.5, color:'var(--muted)' }}>{counter(opt)}</span>}
              </button>
            );
          })}
          {selected.length > 0 && (
            <button onClick={onClear}
              style={{
                width:'100%', padding:'7px 10px', marginTop: 4,
                background:'transparent', border:'none',
                borderTop: '1px solid var(--hairline)',
                color:'var(--muted)', fontFamily:'var(--font-mono)', fontSize: 10.5,
                cursor:'pointer', textAlign:'left',
                letterSpacing:'0.06em', textTransform: 'uppercase',
              }}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RangeFilter({ label, min, max, step, valueMin, valueMax, onChange, formatValue }) {
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
      <button onClick={() => setOpen(o => !o)}
        style={{
          display:'inline-flex', alignItems:'center', gap: 6,
          padding: '7px 11px',
          background: active ? 'color-mix(in oklch, var(--accent) 14%, var(--bg-2))' : 'var(--bg-2)',
          color: active ? 'var(--ink)' : 'var(--ink-2)',
          border: `1px solid ${active ? 'color-mix(in oklch, var(--accent) 50%, var(--hairline))' : 'var(--hairline)'}`,
          borderRadius: 8, cursor: 'pointer',
          fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500,
        }}>
        <Icon name="filter" size={13}/>
        <span>{label}</span>
        {active && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>
            {formatValue(valueMin)}–{formatValue(valueMax)}
          </span>
        )}
        <Icon name="chev-down" size={12} color="var(--muted)"/>
      </button>
      {open && (
        <div style={{
          position:'absolute', top: 'calc(100% + 6px)', left: 0,
          width: 320,
          background: 'var(--surface)', border:'1px solid var(--hairline-strong)',
          borderRadius: 10, padding: 16, zIndex: 30,
          boxShadow: '0 24px 48px -16px rgba(0,0,0,.55)',
          animation: 'rise .12s ease-out'
        }}>
          <div className="eyebrow" style={{ fontSize: 9.5, marginBottom: 14 }}>{label}</div>
          <div style={{ position: 'relative', height: 32 }}>
            <div style={{ position:'absolute', left: 0, right: 0, top: 14, height: 4, background:'var(--surface-2)', borderRadius:2 }}/>
            <div style={{
              position:'absolute',
              left:  ((valueMin - min) / (max - min) * 100) + '%',
              right: (100 - ((valueMax - min) / (max - min) * 100)) + '%',
              top: 14, height: 4, background:'var(--accent)', borderRadius:2
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
            fontSize: 11, color:'var(--ink-2)', marginTop: 8
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
          cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.4);
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

function ColumnsPopover({ columns, setColumns, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position:'absolute', top: 'calc(100% + 6px)', right: 18,
      width: 240,
      background: 'var(--surface)', border:'1px solid var(--hairline-strong)',
      borderRadius: 10, padding: 8, zIndex: 40,
      boxShadow: '0 24px 48px -16px rgba(0,0,0,.55)',
    }}>
      <div className="eyebrow" style={{ padding: '6px 10px', fontSize: 9.5 }}>Visible columns</div>
      {Object.entries(columns).map(([key, col]) => (
        <button key={key} onClick={() => setColumns(c => ({ ...c, [key]: { ...c[key], visible: !c[key].visible } }))}
          style={{
            display:'grid', gridTemplateColumns:'14px 1fr', alignItems:'center', gap: 10,
            width:'100%', padding:'6px 10px',
            background: 'transparent', border:'none', borderRadius: 6,
            textAlign:'left', cursor:'pointer',
            color: col.visible ? 'var(--ink)' : 'var(--muted-2)',
            fontFamily:'var(--font-ui)', fontSize: 12.5,
          }}>
          <span style={{
            width:14, height:14, borderRadius:3,
            border:`1.5px solid ${col.visible ? 'var(--accent)' : 'var(--hairline-strong)'}`,
            background: col.visible ? 'var(--accent)' : 'transparent',
            display:'grid', placeItems:'center',
          }}>
            {col.visible && <Icon name="check" size={10} color="var(--accent-ink)" strokeWidth={2.5}/>}
          </span>
          {col.label}
        </button>
      ))}
    </div>
  );
}

window.Filters = Filters;
