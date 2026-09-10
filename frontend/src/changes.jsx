import React from 'react';
import { createPortal } from 'react-dom';
import { fmt, Chip, Tag, Icon, MicroBar, btn } from './format.jsx';
import { Detail } from './detail.jsx';
import { OptionList, SheetSection, useIsPhone } from './filters.jsx';
import { Card, SECTOR_COLORS } from './summary.jsx';
import { formatPeriod, periodLabel } from './snapshot.js';
import { sectorOf } from './sectors.js';
import { navigate, changesHash, DASHBOARD_HASH } from './router.js';

// What NBIM added and removed in one reporting period, against the one before it.
//
// A page of its own (#/changes/<period>), not a panel on the dashboard. The panel put
// four lists of 12px rows in one card with nothing to click, filter or sort; a step that
// moves a thousand companies gets the same treatment the ledger gives the holdings — a
// stat row, two charts, and a table with controls.
//
// TWO LEVELS, kept apart and in this order. The stat row leads with the raw figures —
// every company NBIM holds — because that is what the fund actually did. The explorer
// under it can show either level and starts on the tracked set: those rows carry
// tickers, so every one opens in the drawer, and the list is complete rather than cut at
// the 100 largest. Presented together and unlabelled, the tracked numbers would read as
// the headline and say the opposite of the truth — over 2025 H2 the tracked set moved
// +208/−205 while NBIM was cutting 1,173 companies.

const LEVELS = [
  { key: 'raw',      label: 'All NBIM holdings' },
  { key: 'filtered', label: 'Tracked set' },
];
const SIDES = [
  { key: 'both',    label: 'Both' },
  { key: 'added',   label: 'Added' },
  { key: 'removed', label: 'Removed' },
];
const SORT_LABEL = { mvUsd: 'value', name: 'company', country: 'country', sector: 'sector', side: 'change' };
const EMPTY_FILTERS = { sectors: [], countries: [], query: '' };
// Rows rendered before a "show more". Six hundred rows of seven cells is a lot of DOM for
// a list most readers scan from the top.
const PAGE = 100;

// Same normalisation as match_key() in build_changes.py, for the one place a row is
// matched on its name: a raw-level company, which carries no ticker.
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The oldest period has nothing before it to compare against, so there is no file.
 */
export function hasPreviousPeriod(manifest, period) {
  return !!(manifest && period &&
    manifest.periods[manifest.periods.length - 1].period !== period);
}

// The period one step older than `period` in the manifest, or null for the oldest.
function previousOf(manifest, period) {
  const i = manifest.periods.findIndex(p => p.period === period);
  return i >= 0 && i < manifest.periods.length - 1 ? manifest.periods[i + 1].period : null;
}

// ticker → holding and normalised name → holding, for resolving a change row to the
// full row the drawer needs. Ticker first: it is the key that survives a respelling.
function indexRows(rows) {
  if (!rows) return null;
  const byTicker = new Map(), byName = new Map();
  for (const r of rows) {
    if (r.ticker) byTicker.set(r.ticker, r);
    byName.set(norm(r.name), r);
  }
  return { byTicker, byName };
}

function resolve(index, row) {
  if (!index) return null;
  return (row.ticker && index.byTicker.get(row.ticker)) || index.byName.get(norm(row.name)) || null;
}

// A tally keyed by the file's own labels, folded onto the app's: sectorOf() merges the
// GICS spellings ("Health Care") into the names the dashboard uses ("Healthcare"), so
// the chart here and the treemap there agree on what a sector is called.
function fold(tally, label) {
  const out = new Map();
  for (const [k, v] of Object.entries(tally || {})) {
    const l = label(k);
    const cur = out.get(l) || { label: l, added: 0, removed: 0 };
    cur.added += v.added;
    cur.removed += v.removed;
    out.set(l, cur);
  }
  return [...out.values()].sort((a, b) => (b.added + b.removed) - (a.added + a.removed));
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ChangesPage({ manifest, period, loadRows, pinned, togglePin, lastFetched }) {
  const previous = previousOf(manifest, period);

  // The changes file for this period. Cached, so switching back is free. Both branches
  // resolve through a promise so the effect never sets state synchronously.
  const [state, setState] = React.useState({ key: null, data: null, error: null });
  const cache = React.useRef(new Map());
  React.useEffect(() => {
    if (!previous || state.key === period) return;
    let cancelled = false;
    const hit = cache.current.get(period);
    const req = hit ? Promise.resolve(hit) : fetch(`changes-${period}.json`)
      .then(r => { if (!r.ok) throw new Error(`changes-${period}.json returned ${r.status}`); return r.json(); })
      .then(d => { cache.current.set(period, d); return d; });
    req
      .then(d => { if (!cancelled) setState({ key: period, data: d, error: null }); })
      .catch(e => { if (!cancelled) setState({ key: period, data: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [period, previous, state.key]);

  // The holdings of both periods, so a row can open in the drawer: an added company is
  // in this period's file, a removed one only in the previous period's. Fetched in the
  // background through the app's own loader and cache — the current period is usually
  // there already — and the page reads fine without them; rows simply do not open.
  const [holdings, setHoldings] = React.useState({ key: null, cur: null, prev: null });
  React.useEffect(() => {
    if (!previous) return;
    let cancelled = false;
    Promise.all([loadRows(period), loadRows(previous)])
      .then(([cur, prev]) => { if (!cancelled) setHoldings({ key: period, cur, prev }); })
      .catch(() => { /* the ledger still reads; rows just cannot open */ });
    return () => { cancelled = true; };
  }, [period, previous, loadRows]);
  const index = React.useMemo(() => ({
    cur:  indexRows(holdings.key === period ? holdings.cur  : null),
    prev: indexRows(holdings.key === period ? holdings.prev : null),
  }), [holdings, period]);

  // Explorer controls. Level and side survive a period switch; the narrower filters are
  // keyed to the period, since a sector picked on one step means little on another.
  const [level, setLevel] = React.useState('filtered');
  const [side, setSide] = React.useState('both');
  const [filterState, setFilterState] = React.useState({ key: period, ...EMPTY_FILTERS });
  const filters = filterState.key === period ? filterState : EMPTY_FILTERS;
  const { sectors, countries, query } = filters;
  const patch = (f) => setFilterState(prev => ({
    ...(prev.key === period ? prev : EMPTY_FILTERS), key: period, ...f,
  }));
  const toggleIn = (key, value) => patch({
    [key]: filters[key].includes(value) ? filters[key].filter(v => v !== value) : [...filters[key], value],
  });
  const [sort, setSort] = React.useState({ key: 'mvUsd', dir: 'desc' });
  // "Show more" is keyed to the exact list it extended, so any change to the list falls
  // back to the first page without an effect having to reset it.
  const [more, setMore] = React.useState({ key: '', n: PAGE });
  const [selected, setSelected] = React.useState(null);
  const [search, setSearch] = React.useState(false);

  // On a phone the toolbar folds into the bottom sheet the holdings ledger uses: one
  // Filters trigger, sections that expand inline, Done with the row count. Portalled
  // to document.body for the reason FilterPanel gives — the ledger card is .enter,
  // whose transform would make it the containing block for position:fixed.
  const isPhone = useIsPhone();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  React.useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  React.useEffect(() => {
    const before = document.title;
    document.title = `What changed in ${periodLabel(period)} — Sovereign Insights`;
    return () => { document.title = before; };
  }, [period]);

  const d = state.key === period ? state.data : null;
  const lv = d ? d[level] : null;
  const levelLabel = LEVELS.find(l => l.key === level).label;

  const all = React.useMemo(() => {
    if (!lv) return [];
    const tag = (rows, s) => rows.map(r => ({
      ...r, side: s, sector: sectorOf(r, '—'), country: r.country || '—',
    }));
    return [...tag(lv.addedTop, 'added'), ...tag(lv.removedTop, 'removed')];
  }, [lv]);
  const bySector  = React.useMemo(() => fold(lv?.bySector,  k => sectorOf({ industry: k }, '—')), [lv]);
  const byCountry = React.useMemo(() => fold(lv?.byCountry, k => k || '—'), [lv]);

  const visible = React.useMemo(() => {
    const q = norm(query);
    const arr = all.filter(r =>
      (side === 'both' || r.side === side) &&
      (!sectors.length || sectors.includes(r.sector)) &&
      (!countries.length || countries.includes(r.country)) &&
      (!q || norm(r.name).includes(q) || norm(r.ticker).includes(q)));
    const dir = sort.dir === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir;
    });
    return arr;
  }, [all, side, sectors, countries, query, sort]);

  const listKey = [period, level, side, sectors.join('|'), countries.join('|'), query].join(' ');
  const limit = more.key === listKey ? more.n : PAGE;
  const shown = visible.slice(0, limit);
  const maxValue = Math.max(1, ...visible.map(r => r.mvUsd || 0));
  const addedShown = visible.filter(r => r.side === 'added').length;
  const removedShown = visible.length - addedShown;
  // Side counts as a filter — it narrows the list — but level does not: it swaps the
  // list for another one, and the default is a view, not the absence of one.
  const activeCount = sectors.length + countries.length + (side !== 'both' ? 1 : 0);
  const dirty = activeCount > 0 || query !== '';
  const reset = () => { patch(EMPTY_FILTERS); setSide('both'); };
  // The raw lists are cut at the largest N per side (build_changes.py); the counts and
  // the tallies behind the charts are not.
  const cut = lv ? (lv.addedTop.length < lv.added || lv.removedTop.length < lv.removed) : false;

  const indexFor = (row) => (row.side === 'added' ? index.cur : index.prev);
  const openable = (row) => !!resolve(indexFor(row), row);
  const open = (row) => {
    const hit = resolve(indexFor(row), row);
    if (!hit) return;
    const fromCurrent = row.side === 'added';
    setSelected({
      company: hit,
      rows: fromCurrent ? holdings.cur : holdings.prev,
      period: fromCurrent ? period : previous,
    });
  };

  // Count shown beside each option: for the side on screen, so "Technology · 12" is the
  // number of rows the option would leave, not a total the list never shows.
  const optionCount = (items) => (label) => {
    const it = items.find(x => x.label === label);
    if (!it) return 0;
    return side === 'added' ? it.added : side === 'removed' ? it.removed : it.added + it.removed;
  };

  const sortBy = (key) => setSort(s => (
    s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'mvUsd' ? 'desc' : 'asc' }
  ));

  const exportCsv = () => {
    const head = ['change', 'company', 'ticker', 'country', 'sector', 'market_value_usd'];
    const lines = [head.join(','), ...visible.map(r =>
      [r.side, r.name, r.ticker || '', r.country, r.sector, r.mvUsd ?? ''].map(csvCell).join(','))];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `gpfg-changes-${period}-${level}-${side}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pills = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {/* Every period but the oldest has a step before it; half-years are always
          listed here, since each one IS a step. */}
      {manifest.periods.slice(0, -1).map(p => {
        const on = p.period === period;
        return (
          <button key={p.period} type="button" aria-pressed={on}
            onClick={() => navigate(changesHash(p.period))}
            style={btn({ variant: on ? 'primary' : 'ghost', shape: 'pill' })}>
            {p.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <main style={{
        maxWidth: 'var(--page-max)', margin: '0 auto',
        padding: '22px var(--gutter) 32px',
        display: 'grid', gap: 'var(--gap)',
      }}>
        <PageHeader period={period} previous={previous} pills={pills}/>

        {!previous ? (
          <Notice eyebrow="Nothing to compare against"
            title={`${periodLabel(period)} is the earliest period on file.`}>
            Changes are measured against the disclosure before, and there is none. Pick a
            later period above.
          </Notice>
        ) : state.error ? (
          <Notice eyebrow="Could not load" tone="neg" title="The changes for this period did not load.">
            {state.error}
          </Notice>
        ) : !d ? (
          <div className="card" role="status" aria-live="polite" style={{ padding: 'var(--pad-card)', animation: 'pulse 1.6s ease-in-out infinite' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--soft)' }}>Loading {periodLabel(period)}…</span>
          </div>
        ) : (
          <>
            {/* Stat row. The fund's own figures first; the tracked set is one cell. */}
            <div className="r-chg-stats">
              <StatCard i={1} label="Companies held" value={d.raw.heldNow.toLocaleString()}
                sub={<>was {d.raw.heldBefore.toLocaleString()} · net <Signed n={d.raw.heldNow - d.raw.heldBefore}/></>}/>
              <StatCard i={2} label="Positions opened" tone="pos" value={'+' + d.raw.added.toLocaleString()}
                sub="companies the fund did not hold before"/>
              <StatCard i={3} label="Positions closed" tone="neg" value={'−' + d.raw.removed.toLocaleString()}
                sub="companies sold out of entirely"/>
              <StatCard i={4} label="Tracked by this site" value={d.filtered.trackedNow.toLocaleString()}
                sub={<>
                  was {d.filtered.trackedBefore.toLocaleString()} ·{' '}
                  <span style={{ color: 'var(--bull-text)' }}>+{d.filtered.added.toLocaleString()}</span>
                  {' / '}
                  <span style={{ color: 'var(--bear-text)' }}>−{d.filtered.removed.toLocaleString()}</span>
                  {d.filtered.renamesSuppressed > 0 && (
                    <> · {d.filtered.renamesSuppressed} rename{d.filtered.renamesSuppressed === 1 ? '' : 's'} collapsed</>
                  )}
                </>}/>
            </div>

            {/* Charts. Exact at either level — drawn from the tallies, not the listed
                rows — and each bar is a filter on the ledger below. */}
            <div className="r-split">
              <Card i={5} title="By sector" eyebrow={`Opened vs closed · ${levelLabel}`}
                rightSlot={sectors.length ? (
                  <ClearBtn onClick={() => patch({ sectors: [] })}>← All sectors</ClearBtn>
                ) : (
                  <span className="eyebrow">{bySector.length} sectors</span>
                )}>
                <DivergingBars items={bySector} selected={sectors}
                  onToggle={(l) => toggleIn('sectors', l)}
                  colorOf={(l) => SECTOR_COLORS[l] || 'var(--soft)'}/>
              </Card>
              <Card i={6} title="By market" eyebrow={`Opened vs closed · ${levelLabel}`}
                rightSlot={countries.length ? (
                  <ClearBtn onClick={() => patch({ countries: [] })}>← All markets</ClearBtn>
                ) : (
                  <span className="eyebrow">{byCountry.length} markets</span>
                )}>
                <DivergingBars items={byCountry} selected={countries}
                  onToggle={(l) => toggleIn('countries', l)}
                  maxItems={10} otherLabel="markets"/>
              </Card>
            </div>

            {/* The ledger. No overflow:hidden on the card itself — the filter popovers
                hang off its header and would be clipped by it; the rows wrapper below
                carries the bottom corners instead. */}
            <section className="card enter" style={{ '--i': 7, padding: 0 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                <div className="r-ledger-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="eyebrow r-ledger-eyebrow">Change ledger</div>
                    <div className="display" style={{ fontSize: 22, marginTop: 2, letterSpacing: '-0.01em' }}>
                      {visible.length.toLocaleString()} {visible.length === 1 ? 'company' : 'companies'}
                      <span className="display-italic" style={{ color: 'var(--soft)' }}>
                        {' · '}
                        <span style={{ color: 'var(--bull-text)' }}>+{addedShown.toLocaleString()}</span>
                        {' / '}
                        <span style={{ color: 'var(--bear-text)' }}>−{removedShown.toLocaleString()}</span>
                      </span>
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--soft)', marginTop: 6 }}>
                      Sorted by <span style={{ color: 'var(--sub)' }}>{SORT_LABEL[sort.key]}</span> {sort.dir === 'desc' ? '↓' : '↑'}
                      {cut && <> · the {d.topN} largest per side are listed; counts and charts cover all</>}
                    </div>
                  </div>
                  <div className="r-ledger-tools">
                    <SearchField value={query} onChange={(q) => patch({ query: q })}
                      focused={search} setFocused={setSearch}/>
                    {isPhone && (
                      <button type="button" onClick={() => setSheetOpen(true)} aria-expanded={sheetOpen}
                        style={btn({ variant: 'ghost', shape: 'pill', active: sheetOpen || activeCount > 0 })}>
                        <Icon name="filter" size={13}/>
                        Filters
                        {activeCount > 0 && <span className="mono" style={countBadge}>{activeCount}</span>}
                        <Icon name={sheetOpen ? 'chev-up' : 'chev-down'} size={12} color="var(--soft)"/>
                      </button>
                    )}
                    <button type="button" onClick={exportCsv} disabled={!visible.length}
                      title="Download the rows on screen as a CSV file"
                      style={{ ...btn({ variant: 'ghost', shape: 'pill' }), opacity: visible.length ? 1 : 0.5 }}>
                      <Icon name="download" size={13}/> Export CSV
                    </button>
                  </div>
                </div>

                {/* The inline toolbar is a desktop object: two segmented controls and two
                    popovers need a row of room. On a phone the same controls are in
                    the sheet below. */}
                {!isPhone && (
                  <div className="r-chg-tools" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                    <Segmented label="Level" options={LEVELS} value={level} onChange={setLevel}/>
                    <Segmented label="Change" options={SIDES} value={side} onChange={setSide}/>
                    <Dropdown label="Sector" icon="wave" options={bySector.map(s => s.label)}
                      selected={sectors} onToggle={(l) => toggleIn('sectors', l)}
                      onClear={() => patch({ sectors: [] })} counter={optionCount(bySector)}/>
                    <Dropdown label="Country" icon="globe" options={byCountry.map(c => c.label)}
                      selected={countries} onToggle={(l) => toggleIn('countries', l)}
                      onClear={() => patch({ countries: [] })} counter={optionCount(byCountry)}/>
                    {dirty && (
                      <button type="button" onClick={reset}
                        style={{ ...btn({ variant: 'ghost', shape: 'pill' }), borderColor: 'transparent', color: 'var(--sub)' }}>
                        <Icon name="x" size={12}/> Reset
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div style={{ overflow: 'hidden', borderRadius: '0 0 var(--r-xl) var(--r-xl)' }}>
                <div className="r-chg-row r-chg-thead" style={{ borderBottom: '1px solid var(--line)' }}>
                  <HeadCell className="r-chg-rank" align="right">#</HeadCell>
                  <HeadCell sortKey="name" sort={sort} onSort={sortBy}>Company</HeadCell>
                  <HeadCell className="r-chg-country" sortKey="country" sort={sort} onSort={sortBy}>Country</HeadCell>
                  <HeadCell className="r-chg-sector" sortKey="sector" sort={sort} onSort={sortBy}>Sector</HeadCell>
                  <HeadCell sortKey="side" sort={sort} onSort={sortBy}>Change</HeadCell>
                  <HeadCell sortKey="mvUsd" sort={sort} onSort={sortBy} align="right">Value · USD</HeadCell>
                  <HeadCell className="r-chg-arrow"/>
                </div>

                {shown.map((row, i) => (
                  <ChangeRow key={`${row.side}:${row.ticker || row.name}`} row={row} rank={i + 1}
                    max={maxValue} openable={openable(row)} onOpen={open}/>
                ))}

                {visible.length === 0 && (
                  <div style={{ padding: '64px 24px', textAlign: 'center', color: 'var(--soft)' }}>
                    <div className="display-italic" style={{ fontSize: 24, color: 'var(--sub)' }}>
                      No companies match these filters.
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>Try clearing a filter, or switch the level or side above.</div>
                  </div>
                )}

                {visible.length > limit && (
                  <div style={{ padding: 14, borderBottom: '1px solid var(--line)' }}>
                    <button type="button"
                      onClick={() => setMore({ key: listKey, n: limit + PAGE })}
                      style={{ ...btn({ variant: 'ghost', shape: 'block', tone: 'text' }), width: '100%' }}>
                      Show {Math.min(PAGE, visible.length - limit)} more · {(visible.length - limit).toLocaleString()} remaining
                    </button>
                  </div>
                )}

                <div className="mono" style={{ padding: '12px 20px', fontSize: 10.5, color: 'var(--soft)', lineHeight: 1.6 }}>
                  Rows with a ticker open in the detail drawer — a removed company shows what the
                  fund held at the previous disclosure. Companies outside the tracked set carry
                  no market data here, so they stay as listed.
                </div>
              </div>
            </section>

            {d.filtered.renames.length > 0 && (
              <Card i={8} title="Renames, not trades" eyebrow="Collapsed from the tracked set"
                rightSlot={<span className="eyebrow">{d.filtered.renames.length}</span>}>
                <div style={{
                  display: 'grid', gap: 1, background: 'var(--line)',
                  border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden',
                }}>
                  {d.filtered.renames.map(r => {
                    const hit = index.cur?.byTicker.get(r.ticker) || null;
                    return (
                      <RenameRow key={r.ticker} rename={r} openable={!!hit}
                        onOpen={() => hit && setSelected({ company: hit, rows: holdings.cur, period })}/>
                    );
                  })}
                </div>
              </Card>
            )}

            <Notes topN={d.topN}/>
          </>
        )}
      </main>

      {isPhone && sheetOpen && createPortal(
        <>
          <div className="r-sheet-back" onClick={() => setSheetOpen(false)}/>
          <div className="r-sheet" role="dialog" aria-label="Filters">
            <div className="r-sheet-grip" aria-hidden="true"/>
            <div className="r-sheet-body">
              <SheetBlock label="Level">
                <Segmented label="Level" options={LEVELS} value={level} onChange={setLevel} full/>
              </SheetBlock>
              <SheetBlock label="Change">
                <Segmented label="Change" options={SIDES} value={side} onChange={setSide} full/>
              </SheetBlock>
              <SheetSection label="Sector" icon="wave" count={sectors.length}>
                <OptionList options={bySector.map(s => s.label)} selected={sectors}
                  onToggle={(l) => toggleIn('sectors', l)} onClear={() => patch({ sectors: [] })}
                  counter={optionCount(bySector)}/>
              </SheetSection>
              <SheetSection label="Country" icon="globe" count={countries.length}>
                <OptionList options={byCountry.map(c => c.label)} selected={countries}
                  onToggle={(l) => toggleIn('countries', l)} onClear={() => patch({ countries: [] })}
                  counter={optionCount(byCountry)}/>
              </SheetSection>
              {dirty && (
                <button className="r-sheet-reset" onClick={reset}>Reset all filters</button>
              )}
            </div>
            <button className="r-sheet-done" onClick={() => setSheetOpen(false)}>
              Done · {visible.length.toLocaleString()} {visible.length === 1 ? 'company' : 'companies'}
            </button>
          </div>
        </>,
        document.body
      )}

      {selected && (
        <Detail
          company={selected.company}
          allData={selected.rows}
          onClose={() => setSelected(null)}
          onPickCompany={(c) => setSelected(s => ({ ...s, company: c }))}
          pinned={pinned} togglePin={togglePin}
          lastFetched={lastFetched}
          period={selected.period}
          isLatestPeriod={selected.period === manifest.latest}
        />
      )}
    </>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function PageHeader({ period, previous, pills }) {
  return (
    <section className="r-chg-head enter" style={{ '--i': 0 }}>
      <div style={{ minWidth: 0 }}>
        <button type="button" onClick={() => navigate(DASHBOARD_HASH)} className="mono"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 0',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--sub)',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--sub)'; }}>
          ← Dashboard
        </button>
        <div className="eyebrow" style={{ marginTop: 14 }}>
          Portfolio changes{previous && <> · {formatPeriod(previous)} → {formatPeriod(period)}</>}
        </div>
        <h1 className="display" style={{
          fontSize: 'clamp(28px, 3.4vw, 44px)', lineHeight: 1.02, letterSpacing: '-0.03em',
          margin: '8px 0 0', textWrap: 'balance',
        }}>
          What changed in {periodLabel(period)}
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--sub)', maxWidth: 620, margin: '10px 0 0' }}>
          Every company that entered or left the fund&apos;s equity portfolio between the
          two disclosures — for the whole fund, and for the set this site tracks.
        </p>
      </div>
      <div>
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Period</div>
        {pills}
      </div>
    </section>
  );
}

// ── Stat row ─────────────────────────────────────────────────────────────────

function StatCard({ i, label, value, tone, sub }) {
  const color = tone === 'pos' ? 'var(--bull-text)' : tone === 'neg' ? 'var(--bear-text)' : 'var(--ink)';
  return (
    <div className="card enter" style={{
      '--i': i, padding: 'var(--pad-card)', minHeight: 118,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10,
    }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--soft)' }}>{label}</div>
      <div>
        <div className="display" style={{
          fontSize: 'clamp(28px, 2.4vw, 38px)', fontWeight: 600, lineHeight: 1.05,
          letterSpacing: '-0.03em', color,
        }}>{value}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--soft)', marginTop: 6, lineHeight: 1.5 }}>{sub}</div>
      </div>
    </div>
  );
}

function Signed({ n }) {
  const color = n === 0 ? 'var(--soft)' : n > 0 ? 'var(--bull-text)' : 'var(--bear-text)';
  return <span style={{ color }}>{n > 0 ? '+' : n < 0 ? '−' : ''}{Math.abs(n).toLocaleString()}</span>;
}

// ── Charts ───────────────────────────────────────────────────────────────────

/**
 * Opened vs closed per category, as a bar to each side of a centre line: removed to the
 * left in the bear fill, added to the right in the bull fill, both on one scale so a
 * sector that lost twenty and gained five reads at a glance. Each row is a button that
 * toggles that category in the ledger's filter.
 */
function DivergingBars({ items, selected, onToggle, colorOf, maxItems = 12, otherLabel = 'more' }) {
  const shown = items.slice(0, maxItems);
  const rest = items.slice(maxItems);
  const peak = Math.max(1, ...shown.map(it => Math.max(it.added, it.removed)));
  const restAdded = rest.reduce((s, it) => s + it.added, 0);
  const restRemoved = rest.reduce((s, it) => s + it.removed, 0);
  if (!items.length) {
    return <div className="mono" style={{ fontSize: 11, color: 'var(--soft)', padding: '24px 0' }}>Nothing moved.</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {shown.map(it => {
        const on = selected.includes(it.label);
        const dim = selected.length > 0 && !on;
        return (
          <button key={it.label} type="button" aria-pressed={on}
            onClick={() => onToggle(it.label)}
            title={`${it.label}: ${it.added} opened, ${it.removed} closed. Click to filter the ledger.`}
            style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 34px minmax(0, 1.6fr) 34px',
              alignItems: 'center', gap: 8,
              width: 'calc(100% + 16px)', margin: '0 -8px', padding: '5px 8px',
              background: on ? 'var(--row-hover)' : 'transparent',
              border: 'none', borderRadius: 'var(--r-sm)',
              font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer',
              opacity: dim ? 0.5 : 1, transition: 'background .12s, opacity .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--row-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = on ? 'var(--row-hover)' : 'transparent'; }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 12, color: 'var(--ink)' }}>
              {colorOf && <span style={{ width: 6, height: 6, borderRadius: 'var(--r-pill)', background: colorOf(it.label), flexShrink: 0 }}/>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            </span>
            <span className="mono" style={{ fontSize: 11, textAlign: 'right', color: it.removed ? 'var(--bear-text)' : 'var(--soft)' }}>
              {it.removed ? `−${it.removed}` : '·'}
            </span>
            <span style={{ position: 'relative', height: 10, background: 'var(--track)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
              <span style={{
                position: 'absolute', top: 0, bottom: 0, right: '50%',
                width: `${(it.removed / peak) * 50}%`, background: 'var(--bear)',
              }}/>
              <span style={{
                position: 'absolute', top: 0, bottom: 0, left: '50%',
                width: `${(it.added / peak) * 50}%`, background: 'var(--bull)',
              }}/>
              <span style={{ position: 'absolute', top: 0, bottom: 0, left: 'calc(50% - 1px)', width: 2, background: 'var(--surface)' }}/>
            </span>
            <span className="mono" style={{ fontSize: 11, color: it.added ? 'var(--bull-text)' : 'var(--soft)' }}>
              {it.added ? `+${it.added}` : '·'}
            </span>
          </button>
        );
      })}
      {rest.length > 0 && (
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--soft)', padding: '8px 0 0', lineHeight: 1.5 }}>
          {rest.length} other {otherLabel} · +{restAdded} / −{restRemoved} — pick them in the Country filter
        </div>
      )}
    </div>
  );
}

function ClearBtn({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="eyebrow" style={{
      cursor: 'pointer', border: '1px solid var(--line)', borderRadius: 'var(--r-xs)',
      background: 'var(--surface)', color: 'var(--ink)', padding: '3px 9px',
    }}>{children}</button>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

// A row of peers where exactly one is on. The pressed segment takes the ghost/active
// treatment the ledger's own triggers use; the group border does the rest. `full`
// is the sheet variant: the row fills its width and the segments share it, at a
// height that is a thumb target rather than a pointer one.
function Segmented({ label, options, value, onChange, full = false }) {
  return (
    <div role="group" aria-label={label} style={{
      display: full ? 'flex' : 'inline-flex', width: full ? '100%' : undefined,
      gap: 2, padding: 3,
      border: '1px solid var(--line)', borderRadius: 'var(--r-pill)',
    }}>
      {options.map(o => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" aria-pressed={on} onClick={() => onChange(o.key)}
            style={{
              ...btn({ variant: 'ghost', shape: 'pill', active: on }),
              height: full ? 34 : 26, padding: '0 12px', flex: full ? 1 : undefined,
              borderColor: on ? 'var(--ink)' : 'transparent',
              color: on ? 'var(--ink)' : 'var(--sub)',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Trigger plus a checkbox list, hung off the button like the Columns menu. The outside-
// click check covers both, or clicking the trigger to close would reopen it.
function Dropdown({ label, icon, options, selected, onToggle, onClear, counter }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={btn({ variant: 'ghost', shape: 'pill', active: open || selected.length > 0 })}>
        <Icon name={icon} size={13}/>
        {label}
        {selected.length > 0 && <span className="mono" style={countBadge}>{selected.length}</span>}
        <Icon name={open ? 'chev-up' : 'chev-down'} size={12} color="var(--soft)"/>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 40,
          width: 260, maxHeight: 340, overflowY: 'auto', padding: 8,
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-menu)',
          animation: 'rise .12s ease-out',
        }}>
          <OptionList options={options} selected={selected} onToggle={onToggle} onClear={onClear} counter={counter}/>
        </div>
      )}
    </div>
  );
}

const countBadge = {
  padding: '1px 6px', borderRadius: 'var(--r-pill)',
  background: 'var(--accent)', color: 'var(--treemap-cell-fg)',
  fontSize: 10, fontWeight: 600,
};

// A block of the phone sheet that does not collapse: for a control that is a row of
// peers rather than a list worth folding away. Same rule and rhythm as SheetSection.
function SheetBlock({ label, children }) {
  return (
    <div className="r-sheet-sec" style={{ padding: '14px 2px' }}>
      <div className="eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}

function SearchField({ value, onChange, focused, setFocused }) {
  return (
    <label className="r-chg-search" style={{
      display: 'flex', alignItems: 'center', gap: 8,
      height: 'var(--control-h)', padding: '0 12px',
      background: 'var(--row-hover)',
      border: `1px solid ${focused ? 'var(--ink)' : 'var(--line)'}`,
      borderRadius: 'var(--r-md)',
      boxShadow: focused ? '0 0 0 3px var(--accent-ring)' : 'none',
      transition: 'border-color .15s ease, box-shadow .15s ease',
    }}>
      <Icon name="search" size={14} color="var(--soft)"/>
      <input value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder="Search this list" aria-label="Search the change ledger"
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 13,
        }}/>
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search"
          style={{ display: 'grid', placeItems: 'center', padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)' }}>
          <Icon name="x" size={12}/>
        </button>
      )}
    </label>
  );
}

// ── Ledger ───────────────────────────────────────────────────────────────────

const headText = {
  fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500,
  color: 'var(--soft)', textTransform: 'uppercase', letterSpacing: '0.08em',
  whiteSpace: 'nowrap',
};

// Sortable headers are real buttons — the ledger's are divs with hand-declared roles
// because they also have to be drag sources; nothing here is dragged.
function HeadCell({ children, className = '', align = 'left', sortKey, sort, onSort }) {
  const base = {
    ...headText, padding: '12px 14px', overflow: 'hidden',
    display: 'flex', alignItems: 'center',
    justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
  };
  if (!sortKey) return <div className={className} style={base}>{children}</div>;
  const on = sort.key === sortKey;
  return (
    <button type="button" className={className}
      onClick={() => onSort(sortKey)}
      aria-sort={on ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
      title={`Sort by ${children}`}
      style={{ ...base, gap: 4, background: 'none', border: 'none', cursor: 'pointer', textAlign: align }}>
      {children}
      <span style={{ opacity: on ? 1 : 0.25, color: on ? 'var(--accent-text)' : 'var(--soft)', fontSize: 9 }}>
        {on ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}
      </span>
    </button>
  );
}

const cell = { padding: '0 14px', minHeight: 50, display: 'flex', alignItems: 'center', overflow: 'hidden' };

function ChangeRow({ row, rank, max, openable, onOpen }) {
  const Root = openable ? 'button' : 'div';
  const added = row.side === 'added';
  return (
    <Root type={openable ? 'button' : undefined} className="r-chg-row"
      onClick={openable ? () => onOpen(row) : undefined}
      title={openable ? `Open ${row.name}` : `${row.name} is outside the tracked set, so there is no detail view for it`}
      style={{
        width: '100%', padding: 0, background: 'transparent',
        border: 'none', borderBottom: '1px solid var(--line)',
        font: 'inherit', color: 'inherit', textAlign: 'left',
        cursor: openable ? 'pointer' : 'default', transition: 'background .1s',
      }}
      onMouseEnter={openable ? (e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--row-hover) 50%, transparent)'; } : undefined}
      onMouseLeave={openable ? (e) => { e.currentTarget.style.background = 'transparent'; } : undefined}>
      <span className="mono r-chg-rank" style={{ ...cell, justifyContent: 'flex-end', fontSize: 11, color: 'var(--soft)' }}>
        {String(rank).padStart(3, '0')}
      </span>
      <span style={{ ...cell, minWidth: 0 }}>
        <span style={{ minWidth: 0, padding: '8px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{
              fontSize: 13, fontWeight: 500, color: openable ? 'var(--ink)' : 'var(--sub)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{row.name}</span>
            {row.ticker && <Tag>{row.ticker}</Tag>}
          </span>
          {/* Country and sector, for the widths where their columns are gone. */}
          <span className="mono r-chg-sub">
            <span className="r-chg-sub-country">{row.country} · </span>{row.sector}
          </span>
        </span>
      </span>
      <span className="r-chg-country" style={{ ...cell, fontSize: 12, color: 'var(--sub)' }}>{row.country}</span>
      <span className="r-chg-sector" style={{ ...cell, fontSize: 12, color: 'var(--sub)', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 'var(--r-pill)', flexShrink: 0, background: SECTOR_COLORS[row.sector] || 'var(--soft)' }}/>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.sector}</span>
      </span>
      <span style={cell}>
        <Chip tone={added ? 'pos' : 'neg'}>{added ? 'Added' : 'Removed'}</Chip>
      </span>
      <span style={{ ...cell, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 4 }}>
        <span className="mono" style={{ fontSize: 13, color: 'var(--ink)', textAlign: 'right' }}>
          {row.mvUsd != null ? fmt.money(row.mvUsd, 'USD', 1) : '—'}
        </span>
        <MicroBar value={row.mvUsd || 0} max={max} tone={added ? 'pos' : 'neg'}/>
      </span>
      <span className="r-chg-arrow" style={{ ...cell, justifyContent: 'center', padding: 0 }}>
        {openable && <Icon name="arrow-right" size={13} color="var(--soft)"/>}
      </span>
    </Root>
  );
}

function RenameRow({ rename, openable, onOpen }) {
  const Root = openable ? 'button' : 'div';
  return (
    <Root type={openable ? 'button' : undefined} onClick={openable ? onOpen : undefined}
      title={openable ? `Open ${rename.to}` : undefined}
      style={{
        display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 12, alignItems: 'center',
        width: '100%', padding: '10px 12px', background: 'var(--surface)',
        border: 'none', font: 'inherit', color: 'inherit', textAlign: 'left',
        cursor: openable ? 'pointer' : 'default', transition: 'background .12s',
      }}
      onMouseEnter={openable ? (e) => { e.currentTarget.style.background = 'var(--row-hover)'; } : undefined}
      onMouseLeave={openable ? (e) => { e.currentTarget.style.background = 'var(--surface)'; } : undefined}>
      <Tag>{rename.ticker}</Tag>
      <span style={{ fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--sub)' }}>{rename.from}</span>
        <span style={{ color: 'var(--soft)' }}> → </span>
        <span style={{ color: 'var(--ink)' }}>{rename.to}</span>
      </span>
      {openable && <Icon name="arrow-right" size={13} color="var(--soft)"/>}
    </Root>
  );
}

// ── Notes and states ─────────────────────────────────────────────────────────

function Notes({ topN }) {
  return (
    <section className="card enter" style={{ '--i': 9, padding: 'var(--pad-card)' }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>How to read these figures</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'clamp(16px, 2vw, 32px)' }}>
        <Note title="All NBIM holdings is the fund's own list.">
          Entering or leaving it means NBIM opened or closed a position. Companies are
          matched by name — NBIM publishes no ISIN or ticker — so a company that renamed
          itself appears once as removed and once as added. The counts and charts cover
          every company; the ledger lists the {topN} largest per side at this level.
        </Note>
        <Note title="The tracked set is not a record of trades.">
          This site tracks the largest holdings per country and industry, so a company
          crossing that boundary enters or leaves the set without NBIM buying or selling a
          share. Where two names share a ticker the pair is collapsed as a rename. Every
          tracked row opens in the detail drawer.
        </Note>
      </div>
    </section>
  );
}

function Note({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--sub)', margin: '6px 0 0' }}>{children}</p>
    </div>
  );
}

function Notice({ eyebrow, title, tone, children }) {
  return (
    <section className="card enter" role={tone === 'neg' ? 'alert' : undefined}
      style={{ '--i': 1, padding: 'clamp(24px, 4vw, 40px)', maxWidth: 640 }}>
      <div className="eyebrow" style={{ color: tone === 'neg' ? 'var(--bear-text)' : undefined }}>{eyebrow}</div>
      <h2 className="display" style={{ fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.02em', margin: '8px 0 0' }}>{title}</h2>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--sub)', margin: '10px 0 0', overflowWrap: 'anywhere' }}>{children}</p>
    </section>
  );
}
