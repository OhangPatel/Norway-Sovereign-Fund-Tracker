import React from 'react';
import { createPortal } from 'react-dom';
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

// Which presentation the filter panel takes. A media query in JS rather than CSS
// because the two mount at different points in the tree, not just different boxes.
function useIsPhone() {
  const [isPhone, setIsPhone] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  );
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = (e) => setIsPhone(e.matches);
    mq.addEventListener('change', onChange);
    setIsPhone(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isPhone;
}

// Option lists, the ownership ceiling, and the shared mutators. Derived once for
// whichever presentation is on screen — the desktop pill row or the phone sheet.
function useFilters(data, filters, setFilters) {
  const allCountries = React.useMemo(() => [...new Set(data.map(d => d.country))].filter(Boolean).sort(), [data]);
  const allSectors = React.useMemo(() => [...new Set(data.map(d => d.sector || d.industry))].filter(Boolean).sort(), [data]);
  const allRecs = React.useMemo(() => [...new Set(data.map(d => d.rec))].filter(Boolean).sort(), [data]);
  const maxOwn = React.useMemo(() => Math.max(...data.map(d => d.ownership || 0)), [data]);

  const toggleSet = (key, value) => {
    setFilters(f => {
      const s = new Set(f[key]);
      if (s.has(value)) s.delete(value); else s.add(value);
      return { ...f, [key]: [...s] };
    });
  };

  const reset = () => setFilters({
    countries: [], sectors: [], recs: [],
    ownMin: 0, ownMax: maxOwn,
    pinned: false,
  });

  const dirty = filters.countries.length || filters.sectors.length || filters.recs.length || filters.ownMin > 0 || filters.ownMax < maxOwn || filters.pinned;

  return { allCountries, allSectors, allRecs, maxOwn, toggleSet, reset, dirty };
}

// Trigger plus its panel, anchored together the way the nav menu is: the panel
// hangs off the button on a large screen, and re-seats as a bottom sheet on a
// phone. Sections expand inline rather than into popovers — on the sheet a popover
// would open downward, off the screen.
//
// The dropdown is absolute inside the ledger card, which clips to overflow:hidden.
// That is safe because .r-tscroll fixes the table viewport at 640px, so the card is
// always taller than the panel's max-height however few rows are showing.
//
// The sheet cannot live there. The card is .enter, whose cardIn keyframes hold a
// transform, and a transformed ancestor becomes the containing block for
// position:fixed — the sheet would anchor to the card instead of the viewport. So
// the phone branch portals to document.body, clear of the transform.
export function FilterPanel({ data, filters, setFilters, count, open, setOpen, activeCount }) {
  const { allCountries, allSectors, allRecs, maxOwn, toggleSet, reset, dirty } = useFilters(data, filters, setFilters);
  const isPhone = useIsPhone();

  // Escape closes it — the backdrop must not be the only exit.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const panel = (
    <>
      {/* Full-screen catcher for outside clicks. Transparent on a large screen —
          a dropdown should not dim the page — and the dimming scrim on a phone. */}
      <div className="r-sheet-back" onClick={() => setOpen(false)}/>
      <div className="r-sheet" role="dialog" aria-label="Filters">
            <div className="r-sheet-grip" aria-hidden="true"/>
            <div className="r-sheet-body">
              <SheetSection label="Country" icon="globe" count={filters.countries.length}>
                <OptionList
                  options={allCountries} selected={filters.countries}
                  onToggle={(v) => toggleSet('countries', v)}
                  onClear={() => setFilters(f => ({ ...f, countries: [] }))}
                  counter={(opt) => data.filter(d => d.country === opt).length}
                />
              </SheetSection>
              <SheetSection label="Sector" icon="wave" count={filters.sectors.length}>
                <OptionList
                  options={allSectors} selected={filters.sectors}
                  onToggle={(v) => toggleSet('sectors', v)}
                  onClear={() => setFilters(f => ({ ...f, sectors: [] }))}
                  counter={(opt) => data.filter(d => (d.sector || d.industry) === opt).length}
                />
              </SheetSection>
              <SheetSection label="Analyst rec" icon="sparkle" count={filters.recs.length}>
                <OptionList
                  options={allRecs} selected={filters.recs}
                  onToggle={(v) => toggleSet('recs', v)}
                  onClear={() => setFilters(f => ({ ...f, recs: [] }))}
                  format={v => fmt.rec(v)}
                  counter={(opt) => data.filter(d => d.rec === opt).length}
                />
              </SheetSection>
              <SheetSection label="Ownership %" icon="filter"
                count={(filters.ownMin > 0 || filters.ownMax < maxOwn) ? 1 : 0}>
                <RangeBody
                  min={0} max={maxOwn} step={0.1}
                  valueMin={filters.ownMin} valueMax={filters.ownMax}
                  onChange={(lo, hi) => setFilters(f => ({ ...f, ownMin: lo, ownMax: hi }))}
                  formatValue={v => v.toFixed(1) + '%'}
                />
              </SheetSection>

              <div className="r-sheet-sec">
                <button className="r-sheet-sec-head"
                  onClick={() => setFilters(f => ({ ...f, pinned: !f.pinned }))}>
                  <Icon name={filters.pinned ? 'pinned' : 'pin'} size={14}/>
                  <span style={{ flex: 1, textAlign: 'left' }}>Pinned only</span>
                  <Check on={filters.pinned}/>
                </button>
              </div>

              {dirty && (
                <button className="r-sheet-reset" onClick={reset}>Reset all filters</button>
              )}
            </div>
            <button className="r-sheet-done" onClick={() => setOpen(false)}>
              Done · {count.toLocaleString()} companies
            </button>
      </div>
    </>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button className="r-filter-trigger" onClick={() => setOpen(!open)} aria-expanded={open}
        style={pillStyle(open || activeCount > 0)}>
        <Icon name="filter" size={13}/>
        Filters
        {activeCount > 0 && <span className="mono" style={countBadge}>{activeCount}</span>}
        <Icon name={open ? 'chev-up' : 'chev-down'} size={12} color="var(--soft)"/>
      </button>
      {open && (isPhone ? createPortal(panel, document.body) : panel)}
    </div>
  );
}

// Filters, Columns and Compare all act on the table, so table.jsx renders the three
// of them together in the ledger header. They live in this file because they share
// the pill styling and popover chrome — exporting components beats exporting styles.

// Trigger + popover. The outside-click check has to cover BOTH, or clicking the
// trigger to close closes and immediately reopens.
export function ColumnsMenu({ columns, setColumns, open, setOpen }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, setOpen]);

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={pillStyle(open)}>
        <Icon name="columns" size={13}/>
        <span>Columns</span>
        <Icon name="chev-down" size={12} color="var(--soft)"/>
      </button>
      {open && <ColumnsPopover columns={columns} setColumns={setColumns}/>}
    </div>
  );
}

// The checkbox rows themselves, with no chrome of their own — the sheet's sections
// render them inline.
function OptionList({ options, selected, onToggle, onClear, format = (v) => v, counter }) {
  return (
    <>
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
    </>
  );
}

// The dual slider, carrying its own thumb CSS so it works wherever it is mounted.
function RangeBody({ min, max, step, valueMin, valueMax, onChange, formatValue }) {
  return (
    <>
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
    </>
  );
}

// One collapsible row of the phone sheet.
function SheetSection({ label, icon, count, children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="r-sheet-sec">
      <button className="r-sheet-sec-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Icon name={icon} size={14}/>
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        {count > 0 && <span className="mono" style={countBadge}>{count}</span>}
        <Icon name={open ? 'chev-up' : 'chev-down'} size={12} color="var(--soft)"/>
      </button>
      {open && <div className="r-sheet-sec-body">{children}</div>}
    </div>
  );
}

export function CompareButton({ compareOn, setCompareOn, compareCount }) {
  return (
    <button onClick={() => setCompareOn(!compareOn)} style={pillStyle(compareOn)}>
      <Icon name="compare" size={13}/>
      Compare
      {compareCount > 0 && <span className="mono" style={countBadge}>{compareCount}</span>}
    </button>
  );
}

// The ledger card clips to its rounded corners with overflow:hidden, so this panel
// has to open on whichever side keeps it inside the card: the trigger sits at the
// card's right edge on desktop and near its left edge once the header wraps on a
// phone. index.html owns that flip (.r-colpop) — hence no left/right here.
// Opening downward is always safe: the table below is 640px of the same card.
export function ColumnsPopover({ columns, setColumns }) {
  return (
    <div className="r-colpop" style={{
      ...popoverStyle,
      position:'absolute', top: 'calc(100% + 8px)',
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
