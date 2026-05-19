// Main app composition

function App() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);
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

  // Load data
  React.useEffect(() => {
    fetch('data.json')
      .then(r => r.json())
      .then(setData)
      .catch(e => setErr(e.message));
  }, []);

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

const kbd = {
  fontFamily: 'var(--font-mono)',
  padding: '1px 5px',
  border: '1px solid var(--hairline)',
  borderRadius: 3,
  fontSize: 10,
  background: 'var(--surface)',
  color: 'var(--ink-2)',
};

function LoadingState() {
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

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(<App/>);
