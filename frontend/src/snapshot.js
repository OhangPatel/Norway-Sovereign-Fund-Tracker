// THE snapshot date. Every place that shows "as of <date>" must come from here.
//
// This file exists because the same date was derived three separate ways and two of them
// were wrong in ways nothing could flag:
//   * the chatbot used the data file's modification time, which moves on every copy and
//     deploy — it reported a date six weeks after the real snapshot;
//   * the header returned a hard-coded 'May 7 2026' under a comment claiming it came
//     from the data.
// Both looked authoritative. Neither was connected to anything.
//
// Plain .js so Node (scripts/build-static.mjs) and the browser bundle (app.jsx) load the
// identical code — frontend/package.json sets "type": "module".
//
// chatbot/data_store.py holds the one unavoidable second implementation, since Python
// cannot import this. The weekly CI workflow runs both against the same data.json and
// fails if they disagree, so that copy cannot drift silently.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Latest fetchedAt across holdings, as 'YYYY-MM-DD'. Null when none is usable —
 * callers must say the date is unknown rather than invent one.
 *
 * Rows legitimately carry different timestamps: a holding Yahoo could not refresh keeps
 * its previous value, so the newest one is what the dataset as a whole is "as of".
 *
 * fetchedAt is a naive local timestamp ("2026-08-04 14:03:07") with no zone. Comparing
 * the date portion AS A STRING is deliberate: Date.parse would read it as local time and
 * toISOString() would roll it to the previous or next day depending on the machine's
 * offset. No parsing, no timezone, no drift.
 */
export function snapshotDate(rows) {
  let best = null;
  for (const r of rows) {
    const d = typeof r?.fetchedAt === 'string' ? r.fetchedAt.slice(0, 10) : null;
    if (d && ISO_DATE.test(d) && (best === null || d > best)) best = d;
  }
  return best;
}

/**
 * Format a 'YYYY-MM-DD' from snapshotDate for display.
 *   'short' → "Aug 4 2026"   (header, drawer, table)
 *   'long'  → "4 August 2026" (static holdings pages)
 *
 * Built by hand rather than with Date/toLocaleDateString, which would reintroduce the
 * timezone day-roll this module exists to prevent.
 */
export function formatSnapshot(iso, style = 'short') {
  if (!iso || !ISO_DATE.test(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return style === 'long'
    ? `${d} ${MONTHS_LONG[m - 1]} ${y}`
    : `${MONTHS_SHORT[m - 1]} ${d} ${y}`;
}

// ── Reporting periods ────────────────────────────────────────────────────────
// A PERIOD is not a snapshot date. The period is when NBIM's figures are as of
// (31 December or 30 June); the snapshot date above is when we last fetched prices
// from Yahoo. On a historical view the two are years apart, and conflating them is
// exactly how a header ends up claiming a date nothing in the data supports.
//
// NBIM publishes only these two dates a year, so anything else is not a period.
const PERIOD = /^(\d{4})-(12-31|06-30)$/;

export function isPeriod(iso) {
  return PERIOD.test(iso || '');
}

export function isHalfYear(iso) {
  return isPeriod(iso) && iso.endsWith('-06-30');
}

/**
 * Short name for a period, using NBIM's own wording: "2025", "H1 2025".
 * Returns '—' for anything that is not a real period, rather than inventing a label.
 */
export function periodLabel(iso) {
  if (!isPeriod(iso)) return '—';
  return isHalfYear(iso) ? `H1 ${iso.slice(0, 4)}` : iso.slice(0, 4);
}

/**
 * Full period date for "as of" wording — "31 December 2025" / "Dec 31 2025".
 *
 * NBIM's own year button renders these one day early (it shows 30.12.2025 for the
 * 31-12 period, 29.06 for 30-06) while the panel above it says "as of 31.12." and the
 * URL says 12-31. We use the real period end, not their off-by-one label.
 */
export function formatPeriod(iso, style = 'long') {
  return isPeriod(iso) ? formatSnapshot(iso, style) : '—';
}
