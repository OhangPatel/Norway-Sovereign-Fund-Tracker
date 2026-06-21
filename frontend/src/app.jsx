import React from 'react';
import { Icon } from './format.jsx';
import { TopBar } from './topbar.jsx';
import { Filters } from './filters.jsx';
import { Summary } from './summary.jsx';
import { DataTable } from './table.jsx';
import { Detail } from './detail.jsx';
import { CompareDock, CompareModal } from './compare.jsx';
import { ChatWidget } from './chat.jsx';

// ── Pipeline Controls ─────────────────────────────────────────────────────────

export var PIPELINE_API = 'http://127.0.0.1:8000';

// A single row inside the Data Tools dropdown: icon tile · title + caption · chip.
export function ToolRow(props) {
  var disabled = props.disabled;
  return (
    <button
      onClick={disabled ? undefined : props.onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
        padding: '11px 12px', background: 'transparent', border: 'none', borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'background .12s ease',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--row-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: 'var(--row-hover)', border: '1px solid var(--line)', color: 'var(--ink)',
      }}>{props.icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="mono" style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink)' }}>{props.title}</span>
        <span className="mono" style={{ display: 'block', fontSize: 10.5, color: 'var(--soft)', marginTop: 3 }}>{props.caption}</span>
      </span>
      {props.chip || null}
    </button>
  );
}

export function PipelineControls(props) {
  var defaultStatus = {
    is_running: false, job_type: null, step: '', progress: 0,
    message: 'Idle', started_at: null, completed_at: null, error: null,
    rate_limit: { metrics_runs_today: 0, max_per_day: 2, can_run: true },
  };

  var statusState  = React.useState(defaultStatus);
  var status       = statusState[0];
  var setStatus    = statusState[1];

  var onlineState  = React.useState(false);
  var online       = onlineState[0];
  var setOnline    = onlineState[1];

  var elapsedState = React.useState(0);
  var elapsed      = elapsedState[0];
  var setElapsed   = elapsedState[1];

  var prevRunning  = React.useRef(false);

  var openState    = React.useState(false);
  var open         = openState[0];
  var setOpen      = openState[1];
  var menuRef      = React.useRef(null);

  // Close the Data Tools menu on outside click
  React.useEffect(function() {
    if (!open) return;
    function onDown(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); }
    window.addEventListener('mousedown', onDown);
    return function() { window.removeEventListener('mousedown', onDown); };
  }, [open]);

  // Poll every 3 s
  React.useEffect(function() {
    function poll() {
      fetch(PIPELINE_API + '/api/pipeline/status')
        .then(function(res) { return res.json(); })
        .then(function(d) {
          // Detect running → done transition
          if (prevRunning.current && !d.is_running && !d.error && d.completed_at) {
            if (props.onComplete) props.onComplete();
          }
          prevRunning.current = d.is_running;
          setStatus(d);
          setOnline(true);
        })
        .catch(function() { setOnline(false); });
    }
    poll();
    var id = setInterval(poll, 3000);
    return function() { clearInterval(id); };
  }, []);

  // Elapsed tick
  React.useEffect(function() {
    if (!status.is_running || !status.started_at) return;
    var t0 = new Date(status.started_at).getTime();
    var id = setInterval(function() {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return function() { clearInterval(id); };
  }, [status.is_running, status.started_at]);

  function fmtTime(s) {
    return s >= 60 ? (Math.floor(s / 60) + 'm ' + (s % 60) + 's') : (s + 's');
  }

  // All clock/calendar parts are rendered in Winnipeg time, regardless of the
  // viewer's own timezone. Age is an absolute difference, so it's tz-agnostic.
  var TZ = 'America/Winnipeg';
  function fmtAt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var ageMs = Date.now() - d.getTime();
    var DAY = 86400000, YEAR = 365 * DAY;

    // Less than a day old → "today at 11:27 PM" (12-hour clock).
    if (ageMs < DAY) {
      var time = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(d);
      return 'today at ' + time;
    }
    // Within the last year → day and month, e.g. "21 Jun".
    if (ageMs < YEAR) {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, day: 'numeric', month: 'short',
      }).format(d);
    }
    // Older than a year → month and year, e.g. "Jun 2024".
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, month: 'short', year: 'numeric',
    }).format(d);
  }

  function trigger(endpoint) {
    setOpen(false);
    fetch(PIPELINE_API + '/api/pipeline/' + endpoint, { method: 'POST' })
      .then(function(res) {
        return res.json().then(function(data) {
          if (!res.ok) { alert(data.error || 'Failed to start pipeline'); return; }
          prevRunning.current = true;
          setElapsed(0);
          setStatus(function(s) {
            return Object.assign({}, s, {
              is_running: true, error: null, progress: 0,
              job_type: endpoint === 'fetch-clean' ? 'fetch_clean' : 'metrics_merge',
              started_at: new Date().toISOString(), completed_at: null,
            });
          });
        });
      })
      .catch(function() {
        alert('Cannot reach backend at ' + PIPELINE_API + '. Is uvicorn running?');
      });
  }

  var isRunning = status.is_running;
  var rl        = status.rate_limit;
  var pct       = status.progress;
  var isError   = !!status.error;
  var showBar   = isRunning || isError;
  var barColor  = isError ? 'var(--bear)' : 'var(--accent)';
  var displayElapsed = elapsed;

  var estLeft = null;
  if (isRunning && pct > 5 && displayElapsed > 0) {
    estLeft = Math.max(0, Math.round(((100 - pct) / pct) * displayElapsed));
  }

  var runsLeft = Math.max(0, rl.max_per_day - rl.metrics_runs_today);

  // Plain-language freshness headline for the status card — what a real user
  // wants to know: is this current, is it updating, or is the source down.
  var stateColor, headline;
  if (!online) {
    stateColor = 'var(--bear)';
    headline = 'Source offline';
  } else if (isError) {
    stateColor = 'var(--bear)';
    headline = 'Update failed';
  } else if (isRunning) {
    stateColor = 'var(--accent)';
    headline = (status.job_type === 'fetch_clean' ? 'Refreshing holdings' : 'Updating prices') +
      '… ' + fmtTime(displayElapsed) + (estLeft !== null ? ' · ~' + fmtTime(estLeft) + ' left' : '');
  } else if (status.completed_at) {
    stateColor = 'var(--accent)';
    headline = 'Updated ' + fmtAt(status.completed_at);
  } else {
    stateColor = 'var(--accent)';
    headline = 'Current as of ' + (props.lastFetched || '—');
  }

  // Pill chip styling for the menu rows: lime (ok) · red (limit reached) · grey (soon).
  function chip(kind) {
    var warn = kind === 'warn', soon = kind === 'soon';
    return {
      fontFamily: 'var(--font-mono)', fontSize: 9.5, flexShrink: 0,
      padding: '2px 9px', borderRadius: 999,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      border: '1px solid ' + (warn ? 'color-mix(in oklch, var(--bear) 45%, transparent)'
        : soon ? 'var(--line)'
        : 'color-mix(in oklch, var(--accent) 45%, transparent)'),
      color: warn ? 'var(--bear)' : soon ? 'var(--soft)' : 'var(--accent-text)',
    };
  }
  var spinner = <span style={{ display: 'inline-flex', animation: 'spin 1s linear infinite', color: 'var(--accent-text)' }}><Icon name="refresh" size={17}/></span>;

  return (
    <div style={{ borderBottom: '1px solid var(--line)', background: 'transparent' }}>
      <div style={{
        maxWidth: 1680, margin: '0 auto',
        padding: '16px clamp(16px, 3vw, 32px)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>

        {/* Status card + Data Tools menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>

          {/* Left — live data status card */}
          <div style={{
            border: '1.5px solid ' + stateColor,
            borderRadius: 14, padding: '11px 22px',
            boxShadow: '0 0 22px -8px color-mix(in oklch, ' + stateColor + ' 55%, transparent)',
            transition: 'border-color .2s ease',
          }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>Live Data</div>
            <div className="display" style={{
              fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em',
              marginTop: 4, whiteSpace: 'nowrap',
            }}>
              {headline}
            </div>
          </div>

          {/* Right — Data Tools dropdown */}
          <div ref={menuRef} style={{ marginLeft: 'auto', position: 'relative' }}>
            <button
              onClick={() => setOpen(o => !o)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 9,
                padding: '10px 16px',
                background: open ? 'var(--ink)' : 'transparent',
                color: open ? 'var(--bg)' : 'var(--ink)',
                border: '1px solid ' + (open ? 'var(--ink)' : 'var(--line)'),
                borderRadius: 999, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 500,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                transition: 'all .14s ease',
              }}
              onMouseEnter={(e) => { if (!open) { e.currentTarget.style.background = 'var(--ink)'; e.currentTarget.style.color = 'var(--bg)'; } }}
              onMouseLeave={(e) => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink)'; } }}
            >
              <Icon name="sliders" size={15}/>
              <span>Data Tools</span>
              <span style={{ display: 'inline-flex', transition: 'transform .18s ease', transform: open ? 'rotate(180deg)' : 'none' }}>
                <Icon name="chev-down" size={14}/>
              </span>
            </button>

            {open && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 344, zIndex: 60,
                background: 'var(--surface)', border: '1px solid var(--line)',
                borderRadius: 18, padding: 8,
                boxShadow: '0 28px 56px -28px rgba(0,0,0,.5)',
                animation: 'rise .12s ease-out',
              }}>
                <ToolRow
                  icon={isRunning && status.job_type === 'fetch_clean' ? spinner : <Icon name="download" size={17}/>}
                  title="Refresh Holdings"
                  caption="Newest fund positions"
                  disabled={isRunning || !online}
                  onClick={() => trigger('fetch-clean')}
                />
                <ToolRow
                  icon={isRunning && status.job_type === 'metrics_merge' ? spinner : <Icon name="refresh" size={17}/>}
                  title="Update Prices"
                  caption="Live prices · resets midnight"
                  disabled={isRunning || !rl.can_run || !online}
                  onClick={() => trigger('metrics-merge')}
                  chip={<span style={chip(runsLeft === 0 ? 'warn' : 'ok')}>{runsLeft} left</span>}
                />
                <ToolRow
                  icon={<Icon name="sparkle" size={17}/>}
                  title="AI Report"
                  caption="Auto portfolio analysis"
                  disabled={true}
                  chip={<span style={chip('soon')}>soon</span>}
                />
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {showBar && (
          <div style={{ animation: 'rise .2s ease-out' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 4, fontSize: 11,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: isError ? 'var(--bear)' : 'var(--sub)' }}>
                {!isError && <span style={{ display: 'inline-flex', animation: 'spin 1s linear infinite', color: 'var(--accent-text)' }}><Icon name="refresh" size={12}/></span>}
                {isError ? status.error : (status.step || status.message)}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--soft)', fontWeight: 600 }}>
                {pct}%
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: 'var(--track)', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: pct + '%', background: barColor,
                borderRadius: 999, transition: 'width .7s ease',
              }}/>
              {isRunning && !isError && (
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: (pct * 0.5) + '%', width: '20%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent)',
                  animation: 'pipeShimmer 1.6s ease-in-out infinite',
                }}/>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main app composition ──────────────────────────────────────────────────────

export function App() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [dataKey, setDataKey] = React.useState(0);
  const [theme, setTheme] = React.useState(() => localStorage.getItem('sov-theme') || 'light');
  const [query, setQuery] = React.useState('');
  const [filters, setFilters] = React.useState({
    countries: [], sectors: [], recs: [],
    ownMin: 0, ownMax: 100,
    pinned: false,
  });
  const [sort, setSort] = React.useState({ key: 'mvNok', dir: 'desc' });
  const [pinned, setPinned] = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('sov-pinned') || '[]')); }
    catch { return new Set(); }
  });
  const [selected, setSelected] = React.useState(null);
  const [compareOn, setCompareOn] = React.useState(false);
  const [compared, setCompared] = React.useState(new Set());
  const [compareModal, setCompareModal] = React.useState(false);
  const [showColumns, setShowColumns] = React.useState(false);
  const [columns, setColumns] = React.useState({
    rank:      { label: 'Rank',           visible: true },
    name:      { label: 'Company',        visible: true },
    ticker:    { label: 'Ticker',         visible: true },
    country:   { label: 'Country',        visible: true },
    sector:    { label: 'Sector',         visible: true },
    price:     { label: 'Price',          visible: true },
    change:    { label: '24h change',     visible: true },
    range:     { label: '52-week range',  visible: true },
    mvUsd:     { label: 'Fund value',     visible: true },
    ownership: { label: 'Ownership %',    visible: true },
    rec:       { label: 'Analyst rec',    visible: true },
    pe:        { label: 'P/E ratio',      visible: false },
    pin:       { label: 'Pin',            visible: true },
  });

  // Load (or reload) data — re-runs when dataKey increments after pipeline completes.
  // ?v= includes Date.now() on first load so a stale browser cache never serves old data.
  React.useEffect(() => {
    const bust = dataKey === 0 ? Date.now() : dataKey;
    fetch('data.json?v=' + bust)
      .then(r => r.json())
      .then(setData)
      .catch(e => setErr(e.message));
  }, [dataKey]);

  // Theme effect
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sov-theme', theme);
  }, [theme]);

  // Persist pinned
  React.useEffect(() => {
    localStorage.setItem('sov-pinned', JSON.stringify([...pinned]));
  }, [pinned]);

  // Max ownership (set ownMax dynamically once data is loaded)
  React.useEffect(() => {
    if (data && data.length && filters.ownMax === 100) {
      const max = Math.max(...data.map(d => d.ownership || 0));
      setFilters(f => ({ ...f, ownMax: max }));
    }
  }, [data]);

  // Ownership-histogram bar selection ({ lo, hi, last } | null) — narrows the
  // table only, while the histogram itself keeps showing the full distribution.
  const [ownSel, setOwnSel] = React.useState(null);

  // Filter + sort (base set — drives the summary charts, excludes the histogram pick)
  const baseFiltered = React.useMemo(() => {
    if (!data) return [];
    const q = query.toLowerCase();
    let arr = data.filter(c => {
      if (filters.countries.length && !filters.countries.includes(c.country)) return false;
      if (filters.sectors.length && !filters.sectors.includes(c.sector || c.industry)) return false;
      if (filters.recs.length && !filters.recs.includes(c.rec)) return false;
      const o = c.ownership || 0;
      if (o < filters.ownMin || o > filters.ownMax) return false;
      if (filters.pinned && !pinned.has(c.ticker)) return false;
      if (q && !((c.name || '').toLowerCase().includes(q) || (c.ticker || '').toLowerCase().includes(q))) return false;
      return true;
    });
    // sort
    const k = sort.key, dir = sort.dir === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      const va = a[k], vb = b[k];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
    return arr;
  }, [data, filters, sort, pinned, query]);

  // Table set — base set narrowed to the selected ownership-histogram bin.
  const filtered = React.useMemo(() => {
    if (!ownSel) return baseFiltered;
    return baseFiltered.filter(c => {
      const o = c.ownership || 0;
      return o >= ownSel.lo && (ownSel.last ? o <= ownSel.hi : o < ownSel.hi);
    });
  }, [baseFiltered, ownSel]);

  // Stable max ownership for bars
  const maxOwn = React.useMemo(() => (data && data.length) ? Math.max(...data.map(d => d.ownership || 0)) : 1, [data]);

  const togglePin = (ticker) => {
    setPinned(prev => {
      const s = new Set(prev);
      if (s.has(ticker)) s.delete(ticker); else s.add(ticker);
      return s;
    });
  };
  const toggleCompare = (ticker) => {
    setCompared(prev => {
      const s = new Set(prev);
      if (s.has(ticker)) s.delete(ticker);
      else if (s.size < 6) s.add(ticker);
      return s;
    });
  };
  const clearCompare = () => { setCompared(new Set()); setCompareOn(false); };

  const comparedRows = React.useMemo(() => {
    if (!data) return [];
    return data.filter(d => compared.has(d.ticker));
  }, [data, compared]);

  const lastFetched = React.useMemo(() => {
    if (!data) return '—';
    // already encoded in dataset (latest fetched_at); just static
    return 'May 7 2026';
  }, [data]);

  if (err) {
    return <div style={{ padding: 60, color: 'var(--bear)' }}>
      <div className="display" style={{ fontSize: 24 }}>Failed to load data.</div>
      <pre style={{ marginTop: 8, fontSize: 12 }}>{err}</pre>
    </div>;
  }

  if (!data) {
    return <LoadingState/>;
  }

  return (
    <>
      <TopBar
        data={data}
        query={query} setQuery={setQuery}
        theme={theme} setTheme={setTheme}
        onPick={(c) => setSelected(c)}
        compareOn={compareOn} setCompareOn={(v) => { setCompareOn(v); if (!v) setCompared(new Set()); }}
        compareCount={compared.size}
        onOpenColumns={() => setShowColumns(o => !o)}
        lastFetched={lastFetched}
      />

      <PipelineControls onComplete={() => setDataKey(k => k + 1)} lastFetched={lastFetched} />

      <main style={{
        maxWidth: 1680, margin: '0 auto',
        padding: '32px clamp(16px, 3vw, 32px) 120px',
        display: 'grid', gap: 28,
      }}>
        <Summary
          data={data}
          filtered={baseFiltered}
          onPickCompany={setSelected}
          onSetFilter={({ sector }) => setFilters(f => ({ ...f, sectors: [sector] }))}
          activeSectors={filters.sectors}
          onClearSectors={() => setFilters(f => ({ ...f, sectors: [] }))}
          onOwnSelect={setOwnSel}
        />

        <section style={{ display:'grid', gap: 14, position: 'relative' }}>
          <Filters
            data={data}
            filters={filters}
            setFilters={setFilters}
            columns={columns}
            setColumns={setColumns}
            showColumns={showColumns}
            setShowColumns={setShowColumns}
            count={filtered.length}
          />
          <DataTable
            data={filtered}
            columns={columns}
            setColumns={setColumns}
            sort={sort} setSort={setSort}
            pinned={pinned} togglePin={togglePin}
            compareOn={compareOn}
            compared={compared} toggleCompare={toggleCompare}
            onOpen={setSelected}
            maxOwnership={maxOwn}
          />

          {/* Footnote */}
          <div className="mono" style={{
            display:'flex', justifyContent:'space-between',
            fontSize: 10.5, color: 'var(--soft)',
            padding: '4px 6px'
          }}>
            <span>Press <kbd style={kbd}>/</kbd> to search · <kbd style={kbd}>Esc</kbd> to close</span>
            <span>Norway GPFG · {data.length.toLocaleString()} positions · USD values estimated at acquisition FX</span>
          </div>
        </section>
      </main>

      {selected && (
        <Detail
          company={selected}
          allData={data}
          onClose={() => setSelected(null)}
          onPickCompany={setSelected}
          pinned={pinned} togglePin={togglePin}
        />
      )}

      {compareOn && compared.size > 0 && (
        <CompareDock
          companies={comparedRows}
          onRemove={(t) => setCompared(prev => { const s = new Set(prev); s.delete(t); return s; })}
          onClear={clearCompare}
          onExpand={() => setCompareModal(true)}
          onOpenCompany={(c) => setSelected(c)}
        />
      )}

      {compareModal && (
        <CompareModal
          companies={comparedRows}
          onClose={() => setCompareModal(false)}
          allData={data}
        />
      )}

      <ChatWidget />
    </>
  );
}

export var kbd = {
  fontFamily: 'var(--font-mono)',
  padding: '1px 5px',
  border: '1px solid var(--line)',
  borderRadius: 3,
  fontSize: 10,
  background: 'var(--surface)',
  color: 'var(--sub)',
};

export function LoadingState() {
  return (
    <div style={{ padding: '80px 32px', maxWidth: 1680, margin: '0 auto' }}>
      <div className="eyebrow">Sovereign Insights</div>
      <div className="display" style={{ fontSize: 48, lineHeight: 1.05, marginTop: 10, letterSpacing:'-0.02em' }}>
        Loading <span className="display-italic">sovereign holdings</span>…
      </div>
      <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{
            height: 110,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 14,
            animation: 'pulse 1.6s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`
          }}/>
        ))}
      </div>
      <div style={{
        marginTop: 24, height: 420,
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 14,
        animation: 'pulse 1.6s ease-in-out infinite'
      }}/>
    </div>
  );
}

