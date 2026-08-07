import React from 'react';
import { fmt, Icon } from './format.jsx';
import { formatPeriod, periodLabel } from './snapshot.js';

// What NBIM added and removed, for the selected period against the one before it.
//
// The two levels are shown apart and in this order deliberately. The raw list is what
// NBIM actually did; the tracked set is an artefact of this site's top-N filter, which
// stays roughly the same size no matter what the fund does. Presented together and
// unlabelled, the filtered numbers read as the headline and say the opposite of the
// truth — over the last half-year the tracked set moved +209/-206 while NBIM was cutting
// 1,173 companies.

function Row({ c }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8,
      padding: '5px 0', borderBottom: '1px solid var(--line)',
    }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--ink)',
                     overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.name}
      </span>
      <span className="mono" style={{ fontSize: 9.5, color: 'var(--soft)', flexShrink: 0 }}>
        {c.country || '—'}
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--sub)', flexShrink: 0,
                                      width: 62, textAlign: 'right' }}>
        {c.mvUsd ? fmt.money(c.mvUsd, 'USD', 1) : '—'}
      </span>
    </div>
  );
}

function List({ title, tone, count, rows, shown }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span className="display" style={{ fontSize: 20, color: `var(--${tone})` }}>
          {tone === 'bull' ? '+' : '−'}{count.toLocaleString()}
        </span>
        <span className="eyebrow" style={{ fontSize: 9.5 }}>{title}</span>
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
        {rows.map(c => <Row key={c.name} c={c} />)}
      </div>
      {count > shown && (
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--soft)', marginTop: 6 }}>
          showing the {shown} largest of {count.toLocaleString()}
        </div>
      )}
    </div>
  );
}

function Level({ eyebrow, headline, note, data, shown }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <div className="eyebrow" style={{ fontSize: 9.5 }}>{eyebrow}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink)', marginTop: 3 }}>{headline}</div>
        {note && (
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 5, lineHeight: 1.5 }}>
            {note}
          </div>
        )}
      </div>
      <div className="r-changes2">
        <List title="added" tone="bull" count={data.added} rows={data.addedTop} shown={shown} />
        <List title="removed" tone="bear" count={data.removed} rows={data.removedTop} shown={shown} />
      </div>
    </div>
  );
}

/**
 * The oldest period has nothing before it to compare against, so there is no file.
 * The nav menu asks this before offering the row, rather than offering one that
 * opens an empty panel.
 */
export function hasPreviousPeriod(manifest, period) {
  return !!(manifest && period &&
    manifest.periods[manifest.periods.length - 1].period !== period);
}

// Open/closed is owned by the app now: the control that toggles this panel lives in
// the nav menu, and the panel itself stays here where two columns of company names
// have room to breathe.
export function ChangesPanel({ period, manifest, open, onClose }) {
  const [state, setState] = React.useState({ key: null, data: null, error: null });
  const cache = React.useRef(new Map());

  const hasPrevious = hasPreviousPeriod(manifest, period);

  React.useEffect(() => {
    if (!open || !hasPrevious || state.key === period) return;
    const cached = cache.current.get(period);
    if (cached) { setState({ key: period, data: cached, error: null }); return; }
    let cancelled = false;
    fetch(`changes-${period}.json`)
      .then(r => { if (!r.ok) throw new Error(`changes-${period}.json returned ${r.status}`); return r.json(); })
      .then(d => {
        if (cancelled) return;
        cache.current.set(period, d);
        setState({ key: period, data: d, error: null });
      })
      .catch(e => { if (!cancelled) setState({ key: period, data: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [open, period, hasPrevious, state.key]);

  if (!hasPrevious || !open) return null;

  const d = state.key === period ? state.data : null;

  return (
    <section style={{
      padding: 18, background: 'var(--surface)',
      border: '1px solid var(--line)', borderRadius: 12,
      display: 'grid', gap: 24,
    }}>
      {/* The panel is opened from a menu that is closed by the time it appears, so
          it has to say what it is and offer its own way out. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Icon name="compare" size={14} color="var(--soft)" />
        <span className="display" style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>
          What changed in {periodLabel(period)}
        </span>
        <button
          onClick={onClose}
          aria-label="Close what changed"
          style={{
            display: 'inline-flex', padding: 6, background: 'transparent',
            border: '1px solid var(--line)', borderRadius: 8,
            color: 'var(--soft)', cursor: 'pointer',
          }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      {state.error && (
        <div style={{ fontSize: 12, color: 'var(--bear)' }}>
          Could not load the changes for this period. {state.error}
        </div>
      )}
      {!d && !state.error && (
        <div className="mono" style={{ fontSize: 11, color: 'var(--soft)' }}>Loading…</div>
      )}
      {d && (
        <>
          <Level
            eyebrow="All NBIM equity holdings"
            headline={
              <>
                <strong>{d.raw.heldBefore.toLocaleString()} → {d.raw.heldNow.toLocaleString()} companies</strong>
                {' '}between {formatPeriod(d.previous)} and {formatPeriod(d.period)}
              </>
            }
            note="Entering or leaving this list means NBIM opened or closed a position. Companies are matched by name — NBIM publishes no ISIN or ticker — so a company that renamed itself appears once as removed and once as added."
            data={d.raw}
            shown={d.topN}
          />

          <div style={{ borderTop: '1px solid var(--line)' }} />

          <Level
            eyebrow="This site's tracked set"
            headline={
              <>
                <strong>{d.filtered.trackedBefore.toLocaleString()} → {d.filtered.trackedNow.toLocaleString()} tracked</strong>
                {' '}of those
              </>
            }
            note={
              <>
                <strong>Not trades.</strong> This site tracks the largest holdings per
                country and industry, so a company crossing that boundary enters or
                leaves this list without NBIM buying or selling a single share. The
                figures above are the ones that describe what the fund actually did.
                {d.filtered.renamesSuppressed > 0 && (
                  <> {d.filtered.renamesSuppressed} rename
                    {d.filtered.renamesSuppressed === 1 ? '' : 's'} collapsed.</>
                )}
              </>
            }
            data={d.filtered}
            shown={d.topN}
          />
        </>
      )}
    </section>
  );
}
