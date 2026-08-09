import React from 'react';
import { Icon } from './format.jsx';
import { formatPeriod, formatSnapshot, periodLabel } from './snapshot.js';

// Reporting-period selector, mirroring NBIM's own control: annual years by default,
// with half-year entries revealed by a checkbox.
//
// The year list is never hardcoded here — it comes from periods.json, which the pipeline
// writes from whatever it has actually built. Back-filling a new period makes it appear
// with no change to this file.

/**
 * The picker body — year pills plus the half-year toggle. Deliberately carries no
 * positioning, width or chrome of its own: it is rendered inside the nav menu, which
 * owns the panel it sits in.
 */
export function PeriodPicker({ manifest, period, onChange }) {
  const [showHalf, setShowHalf] = React.useState(false);

  if (!manifest) return null;

  // Half-year periods stay hidden until asked for, exactly as on nbim.no. If the
  // selected period IS a half-year one, force them visible — hiding the active choice
  // would leave the panel with nothing highlighted.
  const selectedIsHalf = manifest.periods.find(p => p.period === period)?.half;
  const visible = manifest.periods.filter(p => !p.half || showHalf || selectedIsHalf);

  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 9.5, color: 'var(--soft)', marginBottom: 10 }}>
        Annual holdings are as of 31 Dec · half-year as of 30 Jun
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {visible.map(p => {
          const on = p.period === period;
          return (
            <button
              key={p.period}
              onClick={() => onChange(p.period)}
              style={{
                padding: '7px 12px',
                background: on ? 'var(--accent)' : 'transparent',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: 999, cursor: 'pointer',
                // --treemap-cell-fg, not --accent-text: in dark mode the latter
                // IS --accent (#D8F34A), so the selected pill rendered lime text
                // on a lime background and the active year vanished.
                color: on ? 'var(--treemap-cell-fg)' : 'var(--ink)',
                fontFamily: 'var(--font-mono)', fontSize: 12,
                fontWeight: on ? 600 : 400,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
        paddingTop: 12, borderTop: '1px solid var(--line)',
        cursor: selectedIsHalf ? 'default' : 'pointer',
        fontSize: 12, color: selectedIsHalf ? 'var(--soft)' : 'var(--ink)',
      }}>
        <input
          type="checkbox"
          checked={showHalf || !!selectedIsHalf}
          disabled={!!selectedIsHalf}
          onChange={e => setShowHalf(e.target.checked)}
        />
        Show half-year holdings (H1 — as of 30.06.)
      </label>
    </div>
  );
}

/**
 * What is left on the page once the picker itself moved into the nav menu: the
 * loading line while a period is being fetched, and the mixed-dates warning. Both
 * are feedback, not controls, so neither belongs behind a menu. Renders nothing at
 * all on the latest period — an empty section would still cost a grid gap in main.
 */
export function PeriodBar({ manifest, period, loading, marketAsOf }) {
  if (!manifest) return null;

  const isLatest = period === manifest.latest;
  if (!loading && isLatest) return null;

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      {loading && (
        <span className="mono" style={{ fontSize: 11, color: 'var(--soft)' }}>
          Loading {periodLabel(period)}…
        </span>
      )}

      {/* The two dates on screen are years apart on a historical view. Saying so once,
          prominently, is what stops "$21.3 B / P/E 35.5" reading as one moment in time. */}
      {!isLatest && !loading && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          padding: '10px 14px',
          background: 'color-mix(in oklch, var(--accent) 22%, var(--surface))',
          border: '1px solid var(--line)', borderRadius: 10,
          fontSize: 12, lineHeight: 1.5, color: 'var(--ink)',
        }}>
          <Icon name="clock" size={15} color="var(--ink)" />
          <div>
            <strong>Viewing a past period.</strong>{' '}
            Fund value, ownership and voting are NBIM&apos;s disclosed figures{' '}
            <strong>as of {formatPeriod(period)}</strong>. Price, P/E, market cap and
            analyst ratings are <strong>today&apos;s market data</strong>
            {marketAsOf ? ` (${formatSnapshot(marketAsOf)})` : ''}, not the period&apos;s.
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Inline "where this number came from" tag. Used wherever a single figure is shown
 * away from the banner above — chiefly the company drawer.
 */
export function OriginTag({ origin, period }) {
  const nbim = origin === 'nbim';
  return (
    <span className="mono" style={{
      fontSize: 9.5, padding: '2px 6px', borderRadius: 4,
      whiteSpace: 'nowrap',
      background: nbim ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'transparent',
      border: `1px solid ${nbim ? 'transparent' : 'var(--line)'}`,
      color: nbim ? 'var(--ink)' : 'var(--soft)',
    }}>
      {nbim ? `NBIM ${periodLabel(period)}` : 'Current'}
    </span>
  );
}
