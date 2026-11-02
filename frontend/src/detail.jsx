import React from 'react';
import { fmt, Chip, Tag, RangeBar, Icon, iconBtnStyle, btn, CompanyLogo } from './format.jsx';
import { PriceChart } from './charts.jsx';
import { REC_TONE } from './table.jsx';
import { PIPELINE_API } from './app.jsx';
import { formatPeriod, periodLabel } from './snapshot.js';
import { sectorOf } from './sectors.js';

// Detail for a single company: a drawer from the right on a wide screen, a bottom
// sheet on a narrow or upright one.

// After the headline delta, naming the window it measures.
const DELTA_LABEL = { '1d': 'over 24h', '1y': 'over 1 year', '5y': 'over 5 years', 'max': 'all time' };

// Where the detail is a bottom sheet. The same query is the .r-detail block in
// index.html; JS needs it as well because the two slide in from different edges and
// only the sheet is dragged.
const SHEET_QUERY = '(max-width: 640px), (orientation: portrait) and (max-width: 1024px)';
const subscribeSheet = (cb) => {
  const mq = window.matchMedia(SHEET_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const useSheetMode = () => React.useSyncExternalStore(subscribeSheet, () => window.matchMedia(SHEET_QUERY).matches);

// In slow, out quick. The drag writes SLIDE_IN back by hand, so it must stay the exact
// string React sets. LEAVE_MS matches --dur-short.
const SLIDE_IN = 'transform var(--dur-long) var(--ease-out)';
const SLIDE_OUT = 'transform var(--dur-short) var(--ease-out)';
const LEAVE_MS = 220;
// How far a finger moves before it counts as a drag, and which way.
const SWIPE_SLOP = 6;

/**
 * Move in the headline price over the selected chart range, as an absolute amount
 * and a percent — the pair Yahoo prints under a quote.
 *
 * One formula, one baseline: 1d measures from the previous close (which is what
 * "24h" means, and why it is not the chart's first point — the intraday series
 * opens at the market open). Everything else measures from where the range starts.
 */
function rangeDelta(range, price, prevClose, points) {
  if (price == null) return null;
  const base = range === '1d'
    ? prevClose
    : (points && points.length >= 2 ? points[0] : null);
  if (!base) return null;
  return { abs: price - base, pct: (price / base - 1) * 100 };
}

// The snapshot stores a 24h percent rather than the close it was measured against,
// so the fallback headline has to recover that close before rangeDelta can use it.
function prevCloseFromChange(price, change) {
  if (price == null || change == null) return null;
  return price / (1 + change / 100);
}

// Wall-clock time of a live quote, in the reader's own zone. Time only — snapshot.js
// owns dates precisely because formatting them is where the day-roll bugs came from.
function fmtClock(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// "2026-08-06 13:35:28" -> "2026-08-06 13:35". lastFetched arrives already formatted
// ("Aug 6 2026"), so anything that is not the raw stamp passes straight through.
function fmtStamp(s) {
  return (typeof s === 'string' && /^\d{4}-\d{2}-\d{2} /.test(s)) ? s.slice(0, 16) : (s || 'n/a');
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-08-06 13:35:28" -> { date: "Aug 6, 2026", time: "1:35 PM" }. Built by hand
// rather than with Date — same reason as snapshot.js: the stamp carries no timezone,
// and a Date would silently apply the reader's local one. Falls back to fmtStamp's raw
// slice, as the date with no time, for anything (e.g. a pre-formatted lastFetched
// string) that doesn't match the pattern.
function snapshotParts(s) {
  const m = typeof s === 'string' && s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return { date: fmtStamp(s), time: null };
  const [, y, mo, d, h, mi] = m;
  const hour = +h % 12 || 12;
  return { date: `${MONTHS_SHORT[+mo - 1]} ${+d}, ${y}`, time: `${hour}:${mi} ${+h < 12 ? 'AM' : 'PM'}` };
}

// "Aug 6, 2026, 1:35 PM", the whole stamp as one phrase.
function fmtSnapshotStamp(s) {
  const { date, time } = snapshotParts(s);
  return time ? `${date}, ${time}` : date;
}

// Grouped, signed percent. fmt.signedPct is toFixed only, which is fine for a 24h
// move but unreadable on an all-time one — AAPL's max return prints as 312180.10.
const groupedPct = (n) =>
  (n >= 0 ? '+' : '-') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

// Headline delta: "▲ +12.40 (+6.14%)". The window it measures is named beside it
// (DELTA_LABEL), not repeated here.
function RangeDelta({ delta }) {
  if (!delta) return <span className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--soft)' }}>n/a</span>;
  const pos = delta.pct >= 0;
  return (
    <span className="mono" style={{
      color: pos ? 'var(--bull-text)' : 'var(--bear-text)',
      fontSize: 12, fontWeight: 500,
      display: 'inline-flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap',
    }}>
      <span aria-hidden="true" style={{ fontSize: 9 }}>{pos ? '▲' : '▼'}</span>
      <span>{(pos ? '+' : '-') + fmt.price(Math.abs(delta.abs))} ({groupedPct(delta.pct)})</span>
    </span>
  );
}

export function Detail({ company, allData, onClose, onPickCompany, pinned, togglePin, lastFetched,
                         period, isLatestPeriod = true }) {
  // On the latest period NBIM's figures and the market data describe roughly the same
  // moment, so labelling every cell would be noise. On a past period they are years
  // apart and the labels are the only thing telling them apart.
  const historical = !isLatestPeriod && !!period;
  const [entered, setEntered] = React.useState(false);
  const sheet = useSheetMode();
  const asideRef = React.useRef(null);
  const headRef = React.useRef(null);

  // Every exit (back, close, Escape, the scrim, a swipe) slides out first and unmounts
  // after, instead of vanishing mid-frame.
  const [leaving, setLeaving] = React.useState(false);
  const leaveTimer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const close = React.useCallback(() => {
    setLeaving(true);
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(onClose, LEAVE_MS);
  }, [onClose]);
  // The swipe listeners read it through a ref, so a parent re-render mid-drag (a new
  // onClose) does not tear them down and drop the drag.
  const closeRef = React.useRef(close);
  React.useEffect(() => { closeRef.current = close; }, [close]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    // Trigger transition on next frame
    requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Swipe down to dismiss, as an iOS sheet does. From the header a drag always moves
  // the sheet; from the body only once it is scrolled to the top, so pulling down
  // mid-page still scrolls. Native listeners because React's touchmove is passive and
  // cannot stop the page from scrolling under the drag.
  React.useEffect(() => {
    const el = asideRef.current;
    if (!sheet || !el) return;
    let startY = 0, startT = 0, dy = 0, armed = false, dragging = false;
    const start = (e) => {
      armed = e.touches.length === 1 && (el.scrollTop <= 0 || headRef.current.contains(e.target));
      startY = e.touches[0].clientY; startT = e.timeStamp; dy = 0; dragging = false;
    };
    const move = (e) => {
      if (!armed) return;
      dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (dy < -SWIPE_SLOP) { armed = false; return; }
        if (dy < SWIPE_SLOP) return;
        dragging = true;
        el.style.transition = 'none';
      }
      e.preventDefault();
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const end = (e) => {
      if (!dragging) return;
      dragging = armed = false;
      el.style.transition = SLIDE_IN;
      const speed = dy / Math.max(1, e.timeStamp - startT);
      // A quarter of the way down, or a flick: gone. Anything less springs back.
      if (dy > el.offsetHeight * 0.25 || (dy > 60 && speed > 0.5)) closeRef.current();
      else el.style.transform = 'none';
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [sheet]);

  // Live price history fetched on demand from the backend (yfinance, not stored).
  // `loading` is derived from the request key so the effect never sets state synchronously.
  const [range, setRange] = React.useState('1d');
  const [history, setHistory] = React.useState({ key: null, points: null, dates: null, error: null });

  React.useEffect(() => {
    if (!company?.ticker) return;
    const ctrl = new AbortController();
    const key = `${company.ticker}|${range}`;
    fetch(`${PIPELINE_API}/api/history/${encodeURIComponent(company.ticker)}?range=${range}`, { signal: ctrl.signal })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        setHistory(ok
          ? { key, points: j.points, dates: j.dates, error: null }
          : { key, points: null, dates: null, error: j.error || 'Unavailable' });
      })
      .catch(e => {
        if (e.name !== 'AbortError') setHistory({ key, points: null, dates: null, error: 'Cannot reach backend' });
      });
    return () => ctrl.abort();
  }, [company?.ticker, range]);

  // The live quote drives the headline, so it is fetched on open rather than on a
  // button press. Transient either way: shown inline, never written back to
  // data.json — that file is a single cross-sectional moment and per-company live
  // writes would leave its totals summing prices from different days. Keyed by
  // ticker like `history` above, so `loading` is derived rather than set in an effect.
  //
  // `refreshTick` exists only so the refresh button can re-run this same effect for
  // the same ticker. `tick` travels inside `quote` (same trick as `history.key` above)
  // so "busy" can be derived by comparing against `refreshTick` below, rather than
  // set synchronously inside the effect.
  const [quote, setQuote] = React.useState({ key: null, tick: -1, price: null, prevClose: null, at: null, error: null });
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    const ticker = company?.ticker;
    if (!ticker) return;
    const ctrl = new AbortController();
    fetch(`${PIPELINE_API}/api/quote/${encodeURIComponent(ticker)}`, { signal: ctrl.signal })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setQuote(prev => ok
        ? { key: ticker, tick: refreshTick, price: j.price, prevClose: j.previous_close, at: j.fetched_at, error: null }
        // A failed *refresh* (as opposed to the first load) must not throw away a
        // still-good live price the user is already looking at — only the initial
        // fetch for this ticker has nothing to fall back to.
        : { key: ticker, tick: refreshTick, error: j.error || 'Unavailable',
            price: prev.key === ticker ? prev.price : null,
            prevClose: prev.key === ticker ? prev.prevClose : null,
            at: prev.key === ticker ? prev.at : null }))
      .catch(e => {
        if (e.name !== 'AbortError') {
          setQuote(prev => ({ key: ticker, tick: refreshTick, error: 'Cannot reach backend',
            price: prev.key === ticker ? prev.price : null,
            prevClose: prev.key === ticker ? prev.prevClose : null,
            at: prev.key === ticker ? prev.at : null }));
        }
      });
    return () => ctrl.abort();
  }, [company?.ticker, refreshTick]);

  // Null until a quote for THIS company has actually landed, so a stale one from the
  // previously opened company can never reach the headline.
  const live = (quote.key === company?.ticker && quote.price != null) ? quote : null;

  // Trim the live series so the chart ends at the snapshot moment (point-in-time
  // model): drop any points dated after this company's snapshot date. Skipped while
  // the headline is live — trimming the chart to a snapshot the price above it no
  // longer follows is exactly what made the two disagree.
  const snapshotDate = company?.fetchedAt || lastFetched;
  const chart = React.useMemo(() => {
    const { points, dates } = history;
    if (!points || !dates) return { points, dates };
    const cutoff = (!live && snapshotDate) ? new Date(snapshotDate) : null;
    if (!cutoff || isNaN(cutoff)) return { points, dates };
    const pts = [], dts = [];
    for (let i = 0; i < dates.length; i++) {
      // Intraday points are "2026-08-07 15:55"; the space form is not spec-defined
      // for Date, so it becomes the ISO 'T' before parsing. Plain dates are untouched.
      if (new Date(dates[i].replace(' ', 'T')) <= cutoff) { pts.push(points[i]); dts.push(dates[i]); }
    }
    return pts.length >= 2 ? { points: pts, dates: dts } : { points, dates };
  }, [history, snapshotDate, live]);

  if (!company) return null;

  const loading = history.key !== `${company.ticker}|${range}`;
  const quoteBusy = quote.key !== company.ticker || quote.tick !== refreshTick;
  // Guarded by key too, not just quoteBusy: while a new ticker's request is in
  // flight this would otherwise show the previous ticker's error underneath it.
  const quoteError = (quote.key === company.ticker && !quoteBusy) ? quote.error : null;

  // The headline and its 24h baseline travel together, so the delta can never be
  // measured against a price other than the one printed above it. Live when we have
  // a quote; otherwise the snapshot, said out loud rather than passed off as current.
  const headline = live
    ? { price: live.price, prevClose: live.prevClose, live: true, at: live.at }
    : { price: company.price, prevClose: prevCloseFromChange(company.price, company.change),
        live: false, at: snapshotDate };

  // While a new range is in flight `chart` still holds the previous one, so the
  // delta would describe a window the user is no longer looking at. 1d needs no
  // series at all, so it survives the wait.
  const delta = (loading && range !== '1d')
    ? null
    : rangeDelta(range, headline.price, headline.prevClose, chart.points);

  // Where the headline price sits between the 52-week low and high, as a percent —
  // the number the "52w position" tile shows next to the bar itself.
  const range52 = company.high52 - company.low52;
  const pos52 = (company.low52 != null && company.high52 != null && headline.price != null && range52 > 0)
    ? Math.max(0, Math.min(100, (headline.price - company.low52) / range52 * 100))
    : null;

  const peerSet = allData
    .filter(c => sectorOf(c) === sectorOf(company) && c.id !== company.id)
    .sort((a, b) => b.mvUsd - a.mvUsd)
    .slice(0, 5);

  const isPinned = pinned.has(company.id);
  const shown = entered && !leaving;
  const asOf = headline.live ? { date: fmtClock(headline.at), time: 'Live' } : snapshotParts(headline.at);

  return (
    <>
      <div onClick={close} style={{
        position:'fixed', inset:0, zIndex: 80,
        background: 'var(--scrim)',
        backdropFilter: 'var(--scrim-blur)',
        opacity: shown ? 1 : 0,
        transition: 'opacity var(--dur-short) var(--ease-out)',
      }}/>
      <aside ref={asideRef} className="r-detail glass-float" role="dialog" aria-modal="true" aria-label={`${company.name}, position detail`} style={{
        transform: shown ? 'none' : (sheet ? 'translateY(100%)' : 'translateX(100%)'),
        transition: leaving ? SLIDE_OUT : SLIDE_IN,
      }}>
        {/* Sticky header. On the sheet it carries the grab handle and a back arrow, and
            dragging anywhere on it pulls the sheet down. */}
        <div ref={headRef} className="r-detail-head">
          <div className="r-detail-grip" aria-hidden="true"/>
          <div className="r-detail-bar">
            <button type="button" className="r-detail-back" onClick={close}>
              <Icon name="chev-left" size={18}/>
              Back
            </button>
            <span className="r-detail-title">Position detail</span>
            <div className="r-detail-actions">
              <IconBtn onClick={() => togglePin(company.id)} active={isPinned} title={isPinned ? 'Unpin' : 'Pin'}>
                <Icon name={isPinned ? 'pinned' : 'pin'} size={14}/>
              </IconBtn>
              <span className="r-detail-x">
                <IconBtn onClick={close} title="Close (Esc)">
                  <Icon name="x" size={14}/>
                </IconBtn>
              </span>
            </div>
          </div>
        </div>

        {/* Type here runs a step below the dashboard's: the drawer is a dense read,
            and every point of headline size costs a metric off the first screen. */}
        <div className="r-detail-body">
          {/* Title block. The ticker repeats — once in the meta line, once as its own
              chip — because the two do different jobs: the line reads as a sentence,
              the chip is what a returning eye lands on first. */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap: 16 }}>
            <CompanyLogo ticker={company.ticker} name={company.name} size={44}/>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 className="display" style={{
                fontSize: 'var(--text-2xl)', lineHeight: 1.08, margin: 0,
              }}>{company.name}</h2>
              <p className="eyebrow" style={{ margin: '6px 0 0' }}>
                {company.country}, {sectorOf(company, 'n/a')}
              </p>
              {company.reason && (
                <p className="eyebrow" style={{ fontSize: 'var(--text-xs)', margin: '4px 0 0' }}>
                  Inclusion basis: <span style={{ color:'var(--sub)' }}>{company.reason}</span>
                </p>
              )}
            </div>
            <Tag size="lg" tone="accent">{company.ticker}</Tag>
          </div>

          {/* Price panel, an inset on the drawer's glass. Price and its window at the
              top, the chart under it, and the range tabs at the BOTTOM — under the
              chart they control, so the eye reads price, chart, range. */}
          <section className="r-inset r-dprice">
            <div className="r-dlabel">Last price</div>
            <div style={{ display:'flex', alignItems:'baseline', gap: 10, flexWrap:'wrap', marginTop: 4 }}>
              <span className="display" style={{ fontSize: 'var(--text-3xl)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {fmt.price(headline.price)}
              </span>
              <RangeDelta delta={delta}/>
              <span className="r-dlabel">{DELTA_LABEL[range]}</span>
            </div>

            {/* Faint grid behind the line — a bare chart on a blank field read as
                unfinished; this reads as an instrument. */}
            <div className="r-dchart">
              {loading ? (
                <span style={{ fontSize: 'var(--text-xs)', color:'var(--soft)' }}>Loading price history…</span>
              ) : (history.error || !chart.points || chart.points.length < 2) ? (
                <span style={{ fontSize: 'var(--text-xs)', color:'var(--soft)' }}>{history.error || 'No price history'}</span>
              ) : (
                <PriceChart points={chart.points} dates={chart.dates} valueFmt={fmt.price} height={130} color="auto"/>
              )}
            </div>

            <div className="r-dprice-foot">
              {/* Dusk's tabs: a row of words, the chosen one marked by a dot. */}
              <div className="r-range">
                {['1d', '1y', '5y', 'max'].map(r => (
                  <button key={r} type="button" className="r-range-btn" onClick={() => setRange(r)} aria-pressed={range === r}>
                    {r === 'max' ? 'Max' : r.toUpperCase()}
                  </button>
                ))}
              </div>
              {/* Which clock the price above is on, plus a manual refresh. Never
                  omitted: an unlabelled price that is sometimes live and sometimes
                  days old is the whole problem. */}
              <p className="r-dstatus" role="status">
                <span>
                  {headline.live ? `Live at ${fmtClock(headline.at)}` : `Snapshot of ${fmtSnapshotStamp(headline.at)}`}
                  {!headline.live && quoteError && `. Live price unavailable: ${quoteError}`}
                </span>
                <RefreshQuoteBtn onClick={() => setRefreshTick(t => t + 1)} busy={quoteBusy}/>
              </p>
            </div>
          </section>

          {/* As of / target / 52-week position as a ruled tally: one row of figures
              parted by hairlines, not a tile each. */}
          <div className="r-dtally r-dsec">
            <Metric label="As of" value={asOf.date} note={asOf.time}/>
            <Metric label="Analyst target" value={company.targetPrice ? fmt.price(company.targetPrice) : 'n/a'}
              note={company.targetPrice ? (
                <span style={{ color: company.targetPrice > headline.price ? 'var(--bull-text)' : 'var(--bear-text)' }}>
                  {((company.targetPrice / headline.price - 1) * 100).toFixed(1)}% from last
                </span>
              ) : null}/>
            <Metric label="52-week position" value={pos52 != null ? `${pos52.toFixed(0)}%` : 'n/a'}/>
          </div>

          {/* 52w range */}
          <div style={{ marginTop: 18 }}>
            <RangeBar low={company.low52} high={company.high52} value={headline.price} height={10} showLabels={true}/>
          </div>

          <ResearchLinks ticker={company.ticker} name={company.name}/>

          {/* The fund's own figures in their own inset, so they read as the fund's
              record rather than market data. Two ruled rows of three. */}
          <section className="r-inset r-dhold r-dsec">
            <SectionLabel text="Norway GPFG holding"
              tag={historical ? `Disclosed as of ${formatPeriod(period)}` : null}/>
            <div className="r-dtally">
              <Metric label="USD value" value={fmt.money(company.mvUsd, 'USD', 2)}/>
              <Metric label="NOK value" value={fmt.money(company.mvNok, 'NOK', 2)}/>
              <Metric label="Ownership" value={fmt.pct(company.ownership, 3)}
                accent={company.ownership >= 5}/>
            </div>
            <div className="r-dtally">
              <Metric label="Voting rights" value={fmt.pct(company.voting, 3)}/>
              <Metric label="Market cap (USD)" value={fmt.money(company.marketCap, 'USD', 1)}
                note={historical ? 'Today' : null}/>
              {/* The only figure on this screen built from BOTH sides: a market value
                  disclosed for the period over a market cap read today. On the latest
                  period that is one moment; on 2022 it divides a 2022 numerator by a
                  2026 denominator, so it says so rather than presenting a clean number. */}
              <Metric label="% of market cap"
                value={company.marketCap ? fmt.pct((company.mvUsd / company.marketCap) * 100, 3) : 'n/a'}
                note={historical ? `${periodLabel(period)} holding over today's cap` : null}/>
            </div>
          </section>

          {/* Financial metrics, a ruled list in two columns. */}
          <div className="r-dsec">
            <SectionLabel text="Financials"
              tag={historical ? 'Current market data, not the period’s' : null}/>
            <div className="r-dkv">
              {/* "P/E (trailing)", matching the compare modal — the same figure was
                  named two ways across two screens. */}
              <KvCell label="P/E (trailing)" value={company.pe?.toFixed(2) ?? 'n/a'}/>
              <KvCell label="Forward P/E" value={company.fwdPe?.toFixed(2) ?? 'n/a'}/>
              <KvCell label="Price / Book" value={company.pb?.toFixed(2) ?? 'n/a'}/>
              <KvCell label="Dividend yield" value={company.divYield ? company.divYield.toFixed(2) + '%' : 'n/a'}/>
              <KvCell label="Beta (5y)" value={company.beta?.toFixed(2) ?? 'n/a'}/>
              <KvCell label="Analyst rec" value={<Chip tone={REC_TONE[company.rec] || 'neutral'}>{fmt.rec(company.rec)}</Chip>}/>
            </div>
          </div>

          {/* Peers, as the home page's run of accounts: logo, name, value. */}
          {peerSet.length > 0 && (
            <div className="r-dsec">
              <SectionLabel text={`Top peers in ${sectorOf(company, 'this sector')}`}/>
              <ol className="r-acct r-dpeers">
                {peerSet.map((p, i) => (
                  <li key={p.ticker} style={{ '--i': i }}>
                    <button type="button" className="r-acct-row" onClick={() => onPickCompany(p)}>
                      <CompanyLogo ticker={p.ticker} name={p.name} size={32}/>
                      <span style={{ minWidth: 0 }}>
                        <span className="r-acct-name" style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <span className="mono" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--soft)' }}>{p.ticker}, {p.country}</span>
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <span className="mono" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>{fmt.money(p.mvUsd, 'USD', 1)}</span>
                        <span className="mono" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--soft)' }}>{fmt.pct(p.ownership, 2)} owned</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * Outbound research links for one company. Both sites are deep-linked straight from
 * `company.ticker` with no mapping table: the dataset already stores Yahoo symbols
 * (exchange suffix and all), and Perplexity resolves those same suffixed symbols —
 * 1U1.DE and BN4.SI were both checked by hand.
 *
 * The name search is a manual fallback, not an automatic one, because nothing here
 * can tell whether a direct lookup actually landed: the links are cross-origin, so
 * the browser never reports the destination's status back to us, and both sites
 * answer 200 and render "not found" client-side. So the escape hatch is simply kept
 * one click away rather than swapped in on a failure we cannot observe.
 *
 * That fallback goes to Brave, not to Perplexity's own search: /search there opens
 * the gated AI chat, which is useless to a logged-out reader. Brave needs no account
 * and answers a "<name> <ticker> stock" query with a quote card and news.
 */
function ResearchLinks({ ticker, name }) {
  if (!ticker) return null;
  const sym = encodeURIComponent(ticker);
  const q = encodeURIComponent(`${name} ${ticker} stock`);
  return (
    <div className="r-dsec">
      <SectionLabel text="Research"/>
      <div className="r-research3">
        <ExtLink href={`https://www.perplexity.ai/finance/${sym}`} brand="perplexity"
          title={`Open ${ticker} on Perplexity Finance`}>Perplexity</ExtLink>
        <ExtLink href={`https://finance.yahoo.com/quote/${sym}`} brand="yahoo"
          title={`Open ${ticker} on Yahoo Finance`}>Yahoo Finance</ExtLink>
        <ExtLink href={`https://search.brave.com/search?q=${q}`} brand="brave"
          title={`Search the web for ${name}`}>Brave Search</ExtLink>
      </div>
    </div>
  );
}

/**
 * Brand glyphs, drawn in currentColor so they take the chip's own text colour and
 * survive both themes — the style guide rules out pulling in each brand's accent.
 *
 * Perplexity and Brave are the official marks (simple-icons, CC0). Yahoo publishes no
 * freely-licensed glyph, so its wordmark stands in as type in the app's own display
 * face; a redrawn-from-memory logo would be both wrong and worse-looking than type.
 */
const BRAND_PATH = {
  perplexity: 'M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z',
  brave: 'M15.68 0l2.096 2.38s1.84-.512 2.709.358c.868.87 1.584 1.638 1.584 1.638l-.562 1.381.715 2.047s-2.104 7.98-2.35 8.955c-.486 1.919-.818 2.66-2.198 3.633-1.38.972-3.884 2.66-4.293 2.916-.409.256-.92.692-1.38.692-.46 0-.97-.436-1.38-.692a185.796 185.796 0 01-4.293-2.916c-1.38-.973-1.712-1.714-2.197-3.633-.247-.975-2.351-8.955-2.351-8.955l.715-2.047-.562-1.381s.716-.768 1.585-1.638c.868-.87 2.708-.358 2.708-.358L8.321 0h7.36zm-3.679 14.936c-.14 0-1.038.317-1.758.69-.72.373-1.242.637-1.409.742-.167.104-.065.301.087.409.152.107 2.194 1.69 2.393 1.866.198.175.489.464.687.464.198 0 .49-.29.688-.464.198-.175 2.24-1.759 2.392-1.866.152-.108.254-.305.087-.41-.167-.104-.689-.368-1.41-.741-.72-.373-1.617-.69-1.757-.69zm0-11.278s-.409.001-1.022.206-1.278.46-1.584.46c-.307 0-2.581-.434-2.581-.434S4.119 7.152 4.119 7.849c0 .697.339.881.68 1.243l2.02 2.149c.192.203.59.511.356 1.066-.235.555-.58 1.26-.196 1.977.384.716 1.042 1.194 1.464 1.115.421-.08 1.412-.598 1.776-.834.364-.237 1.518-1.19 1.518-1.554 0-.365-1.193-1.02-1.413-1.168-.22-.15-1.226-.725-1.247-.95-.02-.227-.012-.293.284-.851.297-.559.831-1.304.742-1.8-.089-.495-.95-.753-1.565-.986-.615-.232-1.799-.671-1.947-.74-.148-.068-.11-.133.339-.175.448-.043 1.719-.212 2.292-.052.573.16 1.552.403 1.632.532.079.13.149.134.067.579-.081.445-.5 2.581-.541 2.96-.04.38-.12.63.288.724.409.094 1.097.256 1.333.256s.924-.162 1.333-.256c.408-.093.329-.344.288-.723-.04-.38-.46-2.516-.541-2.961-.082-.445-.012-.45.067-.579.08-.129 1.059-.372 1.632-.532.573-.16 1.845.009 2.292.052.449.042.487.107.339.175-.148.069-1.332.508-1.947.74-.615.233-1.476.49-1.565.986-.09.496.445 1.241.742 1.8.297.558.304.624.284.85-.02.226-1.026.802-1.247.95-.22.15-1.413.804-1.413 1.169 0 .364 1.154 1.317 1.518 1.554.364.236 1.355.755 1.776.834.422.079 1.08-.4 1.464-1.115.384-.716.039-1.422-.195-1.977-.235-.555.163-.863.355-1.066l2.02-2.149c.341-.362.68-.546.68-1.243 0-.697-2.695-3.96-2.695-3.96s-2.274.436-2.58.436c-.307 0-.972-.256-1.585-.461-.613-.205-1.022-.206-1.022-.206z',
};

function BrandMark({ brand }) {
  // Set slightly above the 11px label so the wordmark reads as a mark, not as a letter
  // that wandered out of the text beside it.
  if (brand === 'yahoo') {
    return (
      <span className="display" aria-hidden="true"
        style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, width: 13, flexShrink: 0 }}>
        Y!
      </span>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}>
      <path d={BRAND_PATH[brand]}/>
    </svg>
  );
}

// One outbound link, one cell of the r-research3 grid. All three carry equal weight
// now that each is named, marked, and given equal width: the destination is the
// label, so the row says where it goes rather than making the reader guess from an
// icon or hunt for the shortest button.
function ExtLink({ href, children, brand, title }) {
  const reset = (el) => {
    el.style.background = 'transparent';
    el.style.borderColor = 'var(--line)';
  };
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title}
      style={{ ...btn({ variant: 'ghost', shape: 'pill' }), width: '100%', height: 'var(--control-h-lg)' }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--row-hover)';
        e.currentTarget.style.borderColor = 'var(--ink)';
      }}
      onMouseLeave={e => reset(e.currentTarget)}
      onBlur={e => reset(e.currentTarget)}
    >
      <BrandMark brand={brand}/>
      {children}
    </a>
  );
}

// One cell of a ruled tally (.r-dtally): label, figure, and an optional line under it
// for the figure's time or provenance.
export function Metric({ label, value, accent, note }) {
  return (
    <div>
      <div className="r-dlabel">{label}</div>
      <div className="r-dtally-fig" style={accent ? { color: 'var(--accent-text)' } : undefined}>{value}</div>
      {note && <div className="r-dtally-note">{note}</div>}
    </div>
  );
}

/**
 * Section heading with an optional provenance line under it. The line is what stops a
 * reader assuming every number under one heading belongs to the same date.
 */
export function SectionLabel({ text, tag }) {
  return (
    <div className="r-dsec-head">
      <h3>{text}</h3>
      {tag && <p>{tag}</p>}
    </div>
  );
}

// One row of the financials list: label left, figure right, a hairline under it.
export function KvCell({ label, value }) {
  return (
    <div className="r-dkv-row">
      <span>{label}</span>
      <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', textAlign:'right', flexShrink: 0 }}>{value}</span>
    </div>
  );
}

// Refetches the live quote in place — the replacement for closing and reopening the
// drawer to get a newer price. Small and borderless: it sits inline in the provenance
// line, not styled as a peer of the header's pin/close buttons.
//
// The quote cache (backend, 60s TTL) usually answers in single-digit milliseconds, so
// `busy` alone would flip on and off too fast to read as a spin. `minSpin` holds the
// icon spinning for a floor of 500ms after a click regardless of how fast the request
// actually returns; `busy` still keeps it spinning for however much longer a real
// (uncached) fetch takes.
const REFRESH_MIN_SPIN_MS = 500;

function RefreshQuoteBtn({ onClick, busy }) {
  const [minSpin, setMinSpin] = React.useState(false);
  const timerRef = React.useRef(null);
  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleClick = () => {
    onClick();
    setMinSpin(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMinSpin(false), REFRESH_MIN_SPIN_MS);
  };

  const spinning = busy || minSpin;
  return (
    <button onClick={handleClick} disabled={spinning} title={spinning ? 'Refreshing…' : 'Refresh price'}
      aria-label={spinning ? 'Refreshing price' : 'Refresh price'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, padding: 0,
        background: 'transparent', border: 'none', color: 'var(--soft)',
        cursor: spinning ? 'default' : 'pointer',
      }}
      onMouseEnter={e => { if (!spinning) e.currentTarget.style.color = 'var(--ink)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--soft)'; }}
    >
      {spinning
        ? <span style={{ display: 'inline-flex', animation: 'spin 1s linear infinite' }}><Icon name="refresh" size={11}/></span>
        : <Icon name="refresh" size={11}/>}
    </button>
  );
}

export function IconBtn({ children, onClick, title, active }) {
  return (
    // title is a hover tooltip; aria-label is what a screen reader or a voice
    // command has to work from, and these buttons have no text of their own.
    <button onClick={onClick} title={title} aria-label={title}
      style={iconBtnStyle({ active })}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--row-hover)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >{children}</button>
  );
}
