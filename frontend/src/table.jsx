import React from 'react';
import { fmt, Chip, Delta, RangeBar, MicroBar, Icon } from './format.jsx';
import { SECTOR_COLORS } from './summary.jsx';

// Core data table — sortable, virtualized scroll, sticky header, compare/pin support

export var ALL_COLUMNS = {
  rank:    { label: '#',         width: 48,  align: 'right', sortable: false },
  name:    { label: 'Company',   width: 280, align: 'left',  sortable: true,  sortKey: 'name' },
  ticker:  { label: 'Ticker',    width: 86,  align: 'left',  sortable: true,  sortKey: 'ticker' },
  country: { label: 'Country',   width: 120, align: 'left',  sortable: true,  sortKey: 'country' },
  sector:  { label: 'Sector',    width: 150, align: 'left',  sortable: true,  sortKey: 'sector' },
  price:   { label: 'Price',     width: 100, align: 'right', sortable: true,  sortKey: 'price' },
  change:  { label: '24h',       width: 78,  align: 'right', sortable: true,  sortKey: 'change' },
  range:   { label: '52-week range',  width: 200, align: 'left',  sortable: false },
  mvUsd:   { label: 'Fund value',    width: 132, align: 'right', sortable: true,  sortKey: 'mvUsd' },
  ownership: { label: 'Ownership %', width: 154, align: 'left',  sortable: true,  sortKey: 'ownership' },
  rec:     { label: 'Rec',       width: 110, align: 'left',  sortable: true,  sortKey: 'rec' },
  pe:      { label: 'P/E',       width: 70,  align: 'right', sortable: true,  sortKey: 'pe' },
  pin:     { label: '',          width: 38,  align: 'center', sortable: false },
};

export const REC_TONE = {
  strong_buy: 'pos',
  buy: 'pos',
  hold: 'neutral',
  underperform: 'neg',
  sell: 'neg',
  strong_sell: 'neg',
  none: 'neutral',
};

export function DataTable({
  data, columns, setColumns,
  sort, setSort,
  pinned, togglePin,
  compareOn, compared, toggleCompare,
  onOpen,
  maxOwnership
}) {
  // Drag-to-reorder columns: order is the key order of `columns`, so a drop
  // just rebuilds that object with the dragged key spliced before the target.
  const [dragKey, setDragKey] = React.useState(null);
  const [overKey, setOverKey] = React.useState(null);

  const moveColumn = (from, to) => {
    if (!from || from === to) return;
    setColumns(prev => {
      const keys = Object.keys(prev);
      const fromI = keys.indexOf(from);
      const toI = keys.indexOf(to);
      if (fromI < 0 || toI < 0) return prev;
      keys.splice(toI, 0, keys.splice(fromI, 1)[0]);
      const next = {};
      keys.forEach(k => { next[k] = prev[k]; });
      return next;
    });
  };
  const visibleCols = Object.entries(columns).filter(([k, v]) => v.visible).map(([k]) => k);
  const minTableWidth = visibleCols.reduce((s, k) => s + (ALL_COLUMNS[k]?.width || 0), 0) + (compareOn ? 40 : 0);

  // Virtualization
  const ROW_H = 50;
  const VIEW_H = 640;
  const scrollRef = React.useRef(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - 8);
  const endIdx = Math.min(data.length, Math.ceil((scrollTop + VIEW_H) / ROW_H) + 8);
  const visible = data.slice(startIdx, endIdx);

  const onScroll = (e) => setScrollTop(e.target.scrollTop);

  const headerCellStyle = (col) => ({
    padding: '12px 14px',
    fontSize: 10.5, fontFamily: 'var(--font-mono)', fontWeight: 500,
    color: 'var(--soft)', textTransform: 'uppercase', letterSpacing: '0.08em',
    textAlign: col.align,
    cursor: col.sortable ? 'pointer' : 'default',
    userSelect: 'none', whiteSpace: 'nowrap',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--line)',
    position: 'sticky', top: 0, zIndex: 2,
  });

  const headerSortClick = (key) => {
    const sortKey = ALL_COLUMNS[key].sortKey;
    if (!sortKey) return;
    setSort(s => {
      if (s.key === sortKey) return { key: sortKey, dir: s.dir === 'desc' ? 'asc' : 'desc' };
      return { key: sortKey, dir: ALL_COLUMNS[key].align === 'right' ? 'desc' : 'asc' };
    });
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 24, padding: 0, overflow: 'hidden' }}>
      <div style={{
        display:'flex', alignItems:'baseline', justifyContent:'space-between',
        padding: '16px 20px', borderBottom: '1px solid var(--line)',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Holdings ledger</div>
          <div className="display" style={{ fontSize: 22, marginTop: 2, letterSpacing:'-0.01em', whiteSpace: 'nowrap' }}>
            All positions <span className="display-italic" style={{ color:'var(--soft)' }}>· {data.length.toLocaleString()} rows</span>
          </div>
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--soft)' }}>
          Sorted by <span style={{ color:'var(--sub)' }}>{sort.key}</span> {sort.dir === 'desc' ? '↓' : '↑'}
          {compareOn && <span style={{ marginLeft: 14, color: 'var(--accent-text)' }}>· Compare mode</span>}
        </div>
      </div>

      <div ref={scrollRef} onScroll={onScroll} style={{
        height: VIEW_H,
        overflow: 'auto',
        position: 'relative',
      }}>
        <div style={{ minWidth: minTableWidth, position: 'relative' }}>
          {/* Header row */}
          <div style={{
            display:'grid',
            gridTemplateColumns: (compareOn ? '40px ' : '') + visibleCols.map(k => `${ALL_COLUMNS[k].width}px`).join(' '),
            position: 'sticky', top: 0, zIndex: 3,
          }}>
            {compareOn && <div style={headerCellStyle({ align:'center', sortable: false })}></div>}
            {visibleCols.map(k => {
              const col = ALL_COLUMNS[k];
              const isSorted = sort.key === col.sortKey;
              const isDragging = dragKey === k;
              const isOver = overKey === k && dragKey && dragKey !== k;
              return (
                <div key={k}
                  draggable
                  onClick={() => { if (!dragKey) headerSortClick(k); }}
                  onDragStart={(e) => { setDragKey(k); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => { e.preventDefault(); if (overKey !== k) setOverKey(k); }}
                  onDrop={(e) => { e.preventDefault(); moveColumn(dragKey, k); setDragKey(null); setOverKey(null); }}
                  onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                  style={{
                    ...headerCellStyle(col),
                    cursor: 'grab',
                    opacity: isDragging ? 0.4 : 1,
                    boxShadow: isOver ? 'inset 2px 0 0 var(--accent)' : 'none',
                  }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap: 4 }}>
                    {col.label}
                    {col.sortable && (
                      <span style={{
                        opacity: isSorted ? 1 : 0.25,
                        color: isSorted ? 'var(--accent-text)' : 'var(--soft)',
                        fontSize: 9, marginLeft: 2,
                      }}>
                        {isSorted ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Body — virtualized */}
          <div style={{ height: data.length * ROW_H, position: 'relative' }}>
            <div style={{ position: 'absolute', top: startIdx * ROW_H, left: 0, right: 0 }}>
              {visible.map((row, i) => (
                <Row key={row.ticker}
                  row={row}
                  rank={startIdx + i + 1}
                  visibleCols={visibleCols}
                  onOpen={onOpen}
                  pinned={pinned.has(row.ticker)}
                  togglePin={togglePin}
                  compareOn={compareOn}
                  compared={compared.has(row.ticker)}
                  toggleCompare={toggleCompare}
                  maxOwnership={maxOwnership}
                />
              ))}
            </div>
          </div>

          {data.length === 0 && (
            <div style={{
              padding: '64px 24px', textAlign:'center',
              color:'var(--soft)',
            }}>
              <div className="display-italic" style={{ fontSize: 24, color:'var(--sub)' }}>
                No companies match these filters.
              </div>
              <div style={{ marginTop: 8, fontSize: 13 }}>Try clearing a filter or widening the ownership range.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Row({ row, rank, visibleCols, onOpen, pinned, togglePin, compareOn, compared, toggleCompare, maxOwnership }) {
  const [hover, setHover] = React.useState(false);

  const cellBase = {
    padding: '0 14px',
    fontSize: 13,
    height: 50,
    display: 'flex', alignItems: 'center',
    borderBottom: '1px solid var(--line)',
    overflow:'hidden',
  };

  const onRowClick = (e) => {
    if (compareOn) { toggleCompare(row.ticker); return; }
    onOpen(row);
  };

  const bg = compared ? 'color-mix(in oklch, var(--accent) 10%, transparent)'
    : pinned ? 'color-mix(in oklch, var(--accent) 4%, transparent)'
    : hover ? 'color-mix(in oklch, var(--row-hover) 50%, transparent)'
    : 'transparent';

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onRowClick}
      style={{
        display:'grid',
        gridTemplateColumns: (compareOn ? '40px ' : '') + visibleCols.map(k => `${ALL_COLUMNS[k].width}px`).join(' '),
        background: bg,
        cursor: 'pointer',
        transition: 'background .1s',
      }}
    >
      {compareOn && (
        <div style={{ ...cellBase, padding: 0, justifyContent:'center' }}>
          <span style={{
            width:16, height:16, borderRadius:4,
            border:`1.5px solid ${compared ? 'var(--accent)' : 'var(--line)'}`,
            background: compared ? 'var(--accent)' : 'transparent',
            display:'grid', placeItems:'center',
          }}>
            {compared && <Icon name="check" size={11} color="var(--treemap-cell-fg)" strokeWidth={2.5}/>}
          </span>
        </div>
      )}
      {visibleCols.map(k => <Cell key={k} colKey={k} row={row} rank={rank} cellBase={cellBase}
        pinned={pinned} togglePin={togglePin} hover={hover} maxOwnership={maxOwnership}/>)}
    </div>
  );
}

export function Cell({ colKey, row, rank, cellBase, pinned, togglePin, hover, maxOwnership }) {
  const col = ALL_COLUMNS[colKey];
  const style = { ...cellBase, justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start' };

  switch (colKey) {
    case 'rank':
      return <div style={style}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--soft)' }}>{String(rank).padStart(3,'0')}</span>
      </div>;

    case 'name':
      return <div style={style}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            color: 'var(--ink)', fontSize: 13, fontWeight: 500,
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
            maxWidth: 240
          }}>{row.name}</div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--soft)', marginTop: 1, whiteSpace:'nowrap' }}>
            {row.industry || row.sector || '—'}
          </div>
        </div>
      </div>;

    case 'ticker':
      return <div style={style}>
        <span className="mono" style={{
          fontSize: 11.5, fontWeight: 500, color: 'var(--sub)',
          background: 'var(--row-hover)',
          padding: '3px 7px', borderRadius: 4,
          border: '1px solid var(--line)',
        }}>{row.ticker}</span>
      </div>;

    case 'country':
      return <div style={style}>
        <span style={{ fontSize: 12.5, color: 'var(--sub)' }}>{row.country}</span>
      </div>;

    case 'sector':
      return <div style={style}>
        <span style={{
          fontSize: 11.5, color: 'var(--sub)',
          display:'inline-flex', alignItems:'center', gap: 6
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 99,
            background: (SECTOR_COLORS && SECTOR_COLORS[row.sector]) || 'var(--soft)'
          }}/>
          {row.sector || row.industry || '—'}
        </span>
      </div>;

    case 'price':
      return <div style={style}>
        <span className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>
          {fmt.price(row.price)}
        </span>
      </div>;

    case 'change':
      return <div style={style}>
        <Delta value={row.change} fmt="pct"/>
      </div>;

    case 'range':
      return <div style={{ ...style, padding: '0 14px' }}>
        <div style={{ width: '100%' }}>
          <RangeBar low={row.low52} high={row.high52} value={row.price}/>
          <div className="mono" style={{
            display:'flex', justifyContent:'space-between',
            fontSize: 9.5, color:'var(--soft)', marginTop: 4
          }}>
            <span>{fmt.price(row.low52)}</span>
            <span>{fmt.price(row.high52)}</span>
          </div>
        </div>
      </div>;

    case 'mvUsd':
      return <div style={style}>
        <div style={{ textAlign:'right' }}>
          <div className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{fmt.money(row.mvUsd, 'USD', 1)}</div>
          <div className="mono" style={{ fontSize: 10, color:'var(--soft)' }}>{fmt.money(row.mvNok, 'NOK', 1)}</div>
        </div>
      </div>;

    case 'ownership': {
      const o = row.ownership || 0;
      const isHigh = o >= 5;
      return <div style={{ ...style, padding: '0 14px' }}>
        <div style={{ width: '100%' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 4 }}>
            <span className="mono" style={{ fontSize: 13, color: isHigh ? 'var(--accent-text)' : 'var(--ink)', fontWeight: isHigh ? 600 : 400 }}>
              {fmt.pct(o, 2)}
            </span>
            {isHigh && <span style={{ fontSize: 9, color: 'var(--accent-text)', letterSpacing: '0.04em', fontFamily:'var(--font-mono)' }}>HIGH</span>}
          </div>
          <MicroBar value={o} max={maxOwnership} tone={isHigh ? 'accent' : 'muted'}/>
        </div>
      </div>;
    }

    case 'rec':
      return <div style={style}>
        <Chip tone={REC_TONE[row.rec] || 'neutral'}>{fmt.rec(row.rec)}</Chip>
      </div>;

    case 'pe':
      return <div style={style}>
        <span className="mono" style={{ fontSize: 12.5, color: row.pe ? 'var(--sub)' : 'var(--soft)' }}>
          {row.pe ? row.pe.toFixed(1) : '—'}
        </span>
      </div>;

    case 'pin':
      return <div style={style}>
        <button
          onClick={(e) => { e.stopPropagation(); togglePin(row.ticker); }}
          style={{
            background:'transparent', border:'none', padding: 6,
            cursor:'pointer', display:'grid', placeItems:'center',
            opacity: pinned ? 1 : hover ? 0.6 : 0.2,
            color: pinned ? 'var(--accent-text)' : 'var(--sub)',
            transition: 'opacity .15s, transform .12s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          title={pinned ? 'Unpin' : 'Pin'}
        >
          <Icon name={pinned ? 'pinned' : 'pin'} size={14}/>
        </button>
      </div>;
  }
  return null;
}

Object.assign(window, { DataTable, ALL_COLUMNS, REC_TONE });
