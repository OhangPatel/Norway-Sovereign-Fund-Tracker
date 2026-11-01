import React from 'react';
import { createPortal } from 'react-dom';
import { fmt, Icon, btn } from './format.jsx';
import { sectorOf } from './sectors.js';

// Filters strip — country/sector multi-select chips + ownership range slider + reset

// The three ledger triggers are ghost pills. Geometry comes from btn() in
// format.jsx so they match every other control in the app; this wrapper only
// carries the one thing that is local to them, which is what "active" means here.
// A trigger whose menu is open is solid, as the style guide and Data tools have it.
const pillStyle = (active, open = false) => btn({ variant: open ? 'solid' : 'ghost', shape: 'pill', active });

const countBadge = {
  padding: '1px 6px', borderRadius: 'var(--r-pill)',
  background: 'var(--accent)', color: 'var(--accent-ink)',
  fontSize: 'var(--text-xs)', fontWeight: 600,
};

// Glass comes from .glass-float (index.html); this is only what is local to a popover.
const popoverStyle = {
  position: 'fixed', zIndex: 'var(--z-dropdown)',
  animation: 'rise .12s ease-out',
};

// A menu whose trigger sits inside a glass card renders into <body> and is pinned
// under the trigger from here. Left inside the card it was glass nested in glass, and
// a backdrop-filter inside another only sees what is inside the outer element: the
// rows under the menu showed through it sharp instead of frosted. The card is also
// .enter, whose transform would capture position:fixed.
//
// Placed imperatively from the menu's ref, so it is in place before its first paint:
// its right edge on the trigger's right edge (or left on left, or both edges with
// 'stretch', for a list as wide as the field it drops from), kept on screen, and
// never taller than the room below the trigger. Re-placed on scroll and resize, and
// every frame as well: the sticky top bar condenses as the page scrolls, which moves
// the trigger with no scroll event of its own.
export function useAnchoredMenu(open, align = 'right') {
  const anchorRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const place = React.useCallback(() => {
    const a = anchorRef.current, m = menuRef.current;
    if (!a || !m) return;
    const r = a.getBoundingClientRect();
    if (align === 'stretch') m.style.width = `${r.width}px`;
    const w = align === 'stretch' ? r.width : m.offsetWidth;
    const x = align === 'right' ? r.right - w : r.left;
    m.style.top = `${r.bottom + 8}px`;
    m.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
    m.style.maxHeight = `${Math.min(560, window.innerHeight * 0.7, window.innerHeight - r.bottom - 24)}px`;
  }, [align]);
  const setMenu = React.useCallback((el) => { menuRef.current = el; if (el) place(); }, [place]);
  React.useEffect(() => {
    if (!open) return;
    let id;
    const tick = () => { place(); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);
  return { anchorRef, menuRef, setMenu };
}

// Which presentation the filter panel takes. A media query in JS rather than CSS
// because the two mount at different points in the tree, not just different boxes.
// Shared with the what-changed page, whose ledger folds into the same sheet.
export function useIsPhone() {
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
  const allSectors = React.useMemo(() => [...new Set(data.map(d => sectorOf(d)))].filter(Boolean).sort(), [data]);
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

// Trigger plus its panel: the panel hangs off the button on a large screen, and
// re-seats as a bottom sheet on a phone. Sections expand inline rather than into
// popovers — on the sheet a popover would open downward, off the screen.
//
// Both portal to document.body, clear of the ledger card (see useAnchoredMenu): the
// sheet because the card's transform would capture its position:fixed, the panel for
// that and so its glass frosts the page rather than nesting in the card's.
export function FilterPanel({ data, filters, setFilters, count, open, setOpen, activeCount }) {
  const { allCountries, allSectors, allRecs, maxOwn, toggleSet, reset, dirty } = useFilters(data, filters, setFilters);
  const isPhone = useIsPhone();
  const { anchorRef, setMenu } = useAnchoredMenu(open && !isPhone);

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
      <div className="r-sheet" role="dialog" aria-label="Filters"
        ref={isPhone ? undefined : setMenu}
        style={isPhone ? undefined : { position: 'fixed', right: 'auto', marginTop: 0, zIndex: 'var(--z-dropdown)' }}>
            <div className="r-sheet-grip" aria-hidden="true"/>
            <SheetHead title="Filters" active={activeCount}/>
            <div className="r-sheet-body">
              <SheetSection label="Country" count={filters.countries.length}>
                <OptionList
                  options={allCountries} selected={filters.countries}
                  onToggle={(v) => toggleSet('countries', v)}
                  onClear={() => setFilters(f => ({ ...f, countries: [] }))}
                  counter={(opt) => data.filter(d => d.country === opt).length}
                />
              </SheetSection>
              <SheetSection label="Sector" count={filters.sectors.length}>
                <OptionList
                  options={allSectors} selected={filters.sectors}
                  onToggle={(v) => toggleSet('sectors', v)}
                  onClear={() => setFilters(f => ({ ...f, sectors: [] }))}
                  counter={(opt) => data.filter(d => sectorOf(d) === opt).length}
                />
              </SheetSection>
              <SheetSection label="Analyst rec" count={filters.recs.length}>
                <OptionList
                  options={allRecs} selected={filters.recs}
                  onToggle={(v) => toggleSet('recs', v)}
                  onClear={() => setFilters(f => ({ ...f, recs: [] }))}
                  format={v => fmt.rec(v)}
                  counter={(opt) => data.filter(d => d.rec === opt).length}
                />
              </SheetSection>
              <SheetSection label="Ownership %"
                count={(filters.ownMin > 0 || filters.ownMax < maxOwn) ? 1 : 0}
                hint={(filters.ownMin > 0 || filters.ownMax < maxOwn) ? `${filters.ownMin.toFixed(1)} to ${filters.ownMax.toFixed(1)}%` : null}>
                <RangeBody
                  min={0} max={maxOwn} step={0.1}
                  valueMin={filters.ownMin} valueMax={filters.ownMax}
                  onChange={(lo, hi) => setFilters(f => ({ ...f, ownMin: lo, ownMax: hi }))}
                  formatValue={v => v.toFixed(1) + '%'}
                />
              </SheetSection>

              <div className="r-sheet-sec">
                <button className="r-sheet-sec-head" role="switch" aria-checked={filters.pinned}
                  onClick={() => setFilters(f => ({ ...f, pinned: !f.pinned }))}>
                  <span style={{ flex: 1, textAlign: 'left' }}>Pinned only</span>
                  <span className="r-switch" aria-hidden="true"/>
                </button>
              </div>

              {dirty && (
                <button className="r-sheet-reset" onClick={reset}>Reset all filters</button>
              )}
            </div>
            <button className="r-sheet-done" onClick={() => setOpen(false)}>
              Show {count.toLocaleString()} {count === 1 ? 'company' : 'companies'}
            </button>
      </div>
    </>
  );

  return (
    <div ref={anchorRef} style={{ position: 'relative' }}>
      <button className="r-filter-trigger" onClick={() => setOpen(!open)} aria-expanded={open}
        style={pillStyle(activeCount > 0, open)}>
        <Icon name="filter" size={13}/>
        Filters
        {activeCount > 0 && <span className="mono" style={countBadge}>{activeCount}</span>}
        <Icon name={open ? 'chev-up' : 'chev-down'} size={12} color={open ? 'currentColor' : 'var(--soft)'}/>
      </button>
      {open && createPortal(panel, document.body)}
    </div>
  );
}

// Filters, Columns and Compare all act on the table, so table.jsx renders the three
// of them together in the ledger header. They live in this file because they share
// the pill styling and popover chrome — exporting components beats exporting styles.

// Trigger + popover. The outside-click check has to cover BOTH, or clicking the
// trigger to close closes and immediately reopens; the popover is portalled, so it
// is checked on its own ref.
export function ColumnsMenu({ columns, setColumns, open, setOpen }) {
  const { anchorRef, menuRef, setMenu } = useAnchoredMenu(open);

  React.useEffect(() => {
    const close = (e) => {
      if (anchorRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, setOpen, anchorRef, menuRef]);

  return (
    <div ref={anchorRef} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={pillStyle(false, open)}>
        <Icon name="columns" size={13}/>
        <span>Columns</span>
        <Icon name={open ? 'chev-up' : 'chev-down'} size={12} color={open ? 'currentColor' : 'var(--soft)'}/>
      </button>
      {open && createPortal(<ColumnsPopover menuRef={setMenu} columns={columns} setColumns={setColumns}/>, document.body)}
    </div>
  );
}

// One row of an option list: the label, its count, and a check when chosen. Dusk's
// list rather than a column of checkboxes: the check is the only mark, and only on
// the rows that are on. Styled in index.html (.r-opt) so the sheet can size it for a
// thumb.
export function OptionRow({ on, label, count, onClick, role = 'checkbox' }) {
  return (
    <button type="button" className="r-opt" role={role} aria-checked={on} onClick={onClick}>
      <span className="r-opt-label">{label}</span>
      {/* Always rendered, empty when there is no count, so the check keeps its column. */}
      <span className="r-opt-count">{count}</span>
      <span className="r-opt-check" aria-hidden="true">{on && <Icon name="check" size={14} strokeWidth={2.25}/>}</span>
    </button>
  );
}

// The option rows themselves, with no chrome of their own — the sheet's sections
// render them inline, and the what-changed page's filter dropdowns reuse them.
export function OptionList({ options, selected, onToggle, onClear, format = (v) => v, counter }) {
  return (
    <>
      {options.map(opt => (
        <OptionRow key={opt} on={selected.includes(opt)} label={format(opt)}
          count={counter ? counter(opt) : null} onClick={() => onToggle(opt)}/>
      ))}
      {selected.length > 0 && (
        <button type="button" className="r-opt-clear" onClick={onClear}>Clear selection</button>
      )}
    </>
  );
}

// Single choice, the same rows: for a control that picks one of a few (Level,
// Change). Dusk's tabs are a ruled list with a mark, never boxed segments.
export function RadioList({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label}>
      {options.map(o => (
        <OptionRow key={o.key} role="radio" on={o.key === value} label={o.label} onClick={() => onChange(o.key)}/>
      ))}
    </div>
  );
}

// The sheet's title, shown only where the panel is a sheet (index.html).
export function SheetHead({ title, active }) {
  return (
    <div className="r-sheet-head">
      <h2>{title}</h2>
      {active > 0 && <span>{active} active</span>}
    </div>
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
      <div style={{
        display:'flex', justifyContent:'space-between',
        fontSize: 'var(--text-xs)', color:'var(--sub)', marginTop: 8, fontVariantNumeric: 'tabular-nums',
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

// One collapsible row of the sheet. It says what is chosen ("All", "2 selected", or
// the caller's own hint) so the sheet reads without opening every section.
export function SheetSection({ label, count, hint, children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="r-sheet-sec">
      <button className="r-sheet-sec-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        <span className={count > 0 ? 'r-sheet-hint is-on' : 'r-sheet-hint'}>
          {hint || (count > 0 ? `${count} selected` : 'All')}
        </span>
        <Icon name={open ? 'chev-up' : 'chev-down'} size={14} color="var(--soft)"/>
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

// Placed by useAnchoredMenu through menuRef, which keeps it on screen whichever side
// of the header the trigger lands on.
export function ColumnsPopover({ columns, setColumns, menuRef }) {
  return (
    <div ref={menuRef} className="glass-float" style={{
      ...popoverStyle,
      width: 240, padding: 8, overflowY: 'auto',
    }}>
      <div className="eyebrow" style={{ padding: '6px 10px', fontSize: 'var(--text-xs)' }}>Visible columns</div>
      {Object.entries(columns).map(([key, col]) => (
        <button key={key} onClick={() => setColumns(c => ({ ...c, [key]: { ...c[key], visible: !c[key].visible } }))}
          style={{
            display:'grid', gridTemplateColumns:'16px 1fr', alignItems:'center', gap: 10,
            width:'100%', padding:'7px 10px',
            background: 'transparent', border:'none', borderRadius: 'var(--r-sm)',
            textAlign:'left', cursor:'pointer',
            color: col.visible ? 'var(--ink)' : 'var(--soft)',
            fontFamily:'var(--font-body)', fontSize: 13,
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
      width:16, height:16, borderRadius:'var(--r-xs)',
      border:`1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
      background: on ? 'var(--accent)' : 'transparent',
      display:'grid', placeItems:'center',
    }}>
      {on && <Icon name="check" size={10} color="var(--accent-ink)" strokeWidth={2.5}/>}
    </span>
  );
}
