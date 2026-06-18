import React from 'react';
import { TopBar } from './topbar.jsx';
import { Filters } from './filters.jsx';
import { Summary } from './summary.jsx';
import { DataTable } from './table.jsx';
import { Detail } from './detail.jsx';
import { CompareDock, CompareModal } from './compare.jsx';

// ── Pipeline Controls ─────────────────────────────────────────────────────────

export var PIPELINE_API = 'http://127.0.0.1:8000';

export function PipelineBtn(props) {
  var children = props.children;
  var disabled  = props.disabled;
  var active    = props.active;
  var onClick   = props.onClick;

  var base = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 11px',
    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--hairline)'),
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-ui)',
    fontSize: 12, fontWeight: 500,
    opacity: (disabled && !active) ? 0.55 : 1,
    transition: 'all .12s ease',
    whiteSpace: 'nowrap',
    background: active ? 'var(--surface-2)' : 'var(--surface)',
    color: active ? 'var(--accent)' : (disabled ? 'var(--muted-2)' : 'var(--ink-2)'),
  };

  return React.createElement('button', {
    onClick: onClick,
    disabled: disabled,
    style: base,
  }, children);
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

  function fmtAt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
  }

  function getEmoji(step) {
    if (!step) return '⚙️';
    if (/launch|browser/i.test(step)) return '🌐';
    if (/download/i.test(step))       return '📥';
    if (/filter|apply/i.test(step))   return '🔍';
    if (/sav/i.test(step))            return '💾';
    if (/fetch|batch/i.test(step))    return '📡';
    if (/merg|join/i.test(step))      return '🔀';
    if (/done/i.test(step))           return '✅';
    return '⚙️';
  }

  function trigger(endpoint) {
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
  var barColor  = isError ? 'var(--neg)' : 'var(--accent)';
  var displayElapsed = elapsed;

  var estLeft = null;
  if (isRunning && pct > 5 && displayElapsed > 0) {
    estLeft = Math.max(0, Math.round(((100 - pct) / pct) * displayElapsed));
  }

  return (
    <div style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--bg-2)' }}>
      <div style={{
        maxWidth: 1680, margin: '0 auto',
        padding: '10px clamp(16px, 3vw, 32px)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>

        {/* Button row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="eyebrow" style={{ flexShrink: 0, fontSize: 10 }}>Data Pipeline</span>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>

            <PipelineBtn
              disabled={isRunning || !online}
              active={isRunning && status.job_type === 'fetch_clean'}
              onClick={() => trigger('fetch-clean')}
            >
              {isRunning && status.job_type === 'fetch_clean' ? '⏳ Fetching…' : '🌐 Fetch Latest Data'}
            </PipelineBtn>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <PipelineBtn
                disabled={isRunning || !rl.can_run || !online}
                active={isRunning && status.job_type === 'metrics_merge'}
                onClick={() => trigger('metrics-merge')}
              >
                {isRunning && status.job_type === 'metrics_merge' ? '⏳ Updating…' : '📊 Update Metrics & Merge'}
              </PipelineBtn>
              <span className="mono" style={{
                fontSize: 9.5, paddingLeft: 2,
                color: rl.metrics_runs_today >= rl.max_per_day ? 'var(--neg)' : 'var(--muted)',
              }}>
                {rl.metrics_runs_today}/{rl.max_per_day} uses today · resets midnight
              </span>
            </div>

            <PipelineBtn disabled={true}>
              🤖 AI Report &amp; Export{' '}
              <span className="mono" style={{
                fontSize: 9, padding: '1px 5px', marginLeft: 4,
                border: '1px solid var(--hairline)', borderRadius: 4,
                color: 'var(--muted-2)',
              }}>soon</span>
            </PipelineBtn>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {!online && (
              <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>backend offline</span>
            )}
            {isRunning && (
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                ⏱ {fmtTime(displayElapsed)}
                {estLeft !== null ? ' · ~' + fmtTime(estLeft) + ' left' : ''}
              </span>
            )}
            {!isRunning && status.completed_at && !isError && (
              <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                Last updated {fmtAt(status.completed_at)}
              </span>
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
              <span style={{ color: isError ? 'var(--neg)' : 'var(--ink-2)' }}>
                {getEmoji(status.step)}&nbsp;
                {isError ? status.error : (status.step || status.message)}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>
                {pct}%
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--hairline)', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: pct + '%', background: barColor,
                borderRadius: 2, transition: 'width .7s ease',
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
  const [theme, setTheme] = React.useState(() => localStorage.getItem('sov-theme') || 'dark');
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
    if (data && filters.ownMax === 100) {
      const max = Math.max(...data.map(d => d.ownership || 0));
      setFilters(f => ({ ...f, ownMax: max }));
    }
  }, [data]);

  // Filter + sort
  const filtered = React.useMemo(() => {
    if (!data) return [];
    const q = query.toLowerCase();
    let arr = data.filter(c => {
      if (filters.countries.length && !filters.countries.includes(c.country)) return false;
      if (filters.sectors.length && !filters.sectors.includes(c.sector || c.industry)) return false;
      if (filters.recs.length && !filters.recs.includes(c.rec)) return false;
      const o = c.ownership || 0;
      if (o < filters.ownMin || o > filters.ownMax) return false;
      if (filters.pinned && !pinned.has(c.ticker)) return false;
      if (q && !(c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q))) return false;
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

  // Stable max ownership for bars
  const maxOwn = React.useMemo(() => data ? Math.max(...data.map(d => d.ownership || 0)) : 1, [data]);

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
    return <div style={{ padding: 60, color: 'var(--neg)' }}>
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

      <PipelineControls onComplete={() => setDataKey(k => k + 1)} />

      <main style={{
        maxWidth: 1680, margin: '0 auto',
        padding: '32px clamp(16px, 3vw, 32px) 120px',
        display: 'grid', gap: 28,
      }}>
        <Summary
          data={data}
          filtered={filtered}
          onPickCompany={setSelected}
          onSetFilter={({ sector }) => setFilters(f => ({ ...f, sectors: [sector] }))}
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
            fontSize: 10.5, color: 'var(--muted)',
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
    </>
  );
}

export var kbd = {
  fontFamily: 'var(--font-mono)',
  padding: '1px 5px',
  border: '1px solid var(--hairline)',
  borderRadius: 3,
  fontSize: 10,
  background: 'var(--surface)',
  color: 'var(--ink-2)',
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
            border: '1px solid var(--hairline)',
            borderRadius: 14,
            animation: 'pulse 1.6s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`
          }}/>
        ))}
      </div>
      <div style={{
        marginTop: 24, height: 420,
        background: 'var(--surface)', border: '1px solid var(--hairline)',
        borderRadius: 14,
        animation: 'pulse 1.6s ease-in-out infinite'
      }}/>
    </div>
  );
}

