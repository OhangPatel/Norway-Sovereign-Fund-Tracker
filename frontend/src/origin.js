// WHERE EACH NUMBER CAME FROM. Every "as of" label in the UI must come from here.
//
// A row on screen is two different things stitched together:
//
//   NBIM   what the fund disclosed for the selected period. As of 31 Dec 2022 when you
//          are viewing 2022. Historical, frozen, never changes again.
//   MARKET what Yahoo reports right now. The same "today" whichever period is selected,
//          because that is the agreed design — we do not fetch 2022 prices.
//
// On the latest period the two are close enough that nobody notices. On 2022 they are
// three and a half years apart, and an unlabelled "$21.3 B / P/E 35.5" invites the
// reader to assume both belong to 2022. Only one does.
//
// The lists mirror merge_and_enrich.py's HOLDING_FIELDS and METRIC_COLUMNS, which decide
// which file each field is written to. assertSplit() below re-checks that at runtime, so
// the two cannot quietly disagree.

export const NBIM_FIELDS = Object.freeze([
  'country', 'name', 'ticker', 'industry',
  'mvNok', 'mvUsd', 'voting', 'ownership', 'reason',
]);

export const MARKET_FIELDS = Object.freeze([
  'sector', 'pe', 'fwdPe', 'pb', 'divYield', 'marketCap', 'rec',
  'targetPrice', 'high52', 'low52', 'beta', 'price', 'change', 'fetchedAt',
]);

const NBIM = new Set(NBIM_FIELDS);
const MARKET = new Set(MARKET_FIELDS);

/** 'nbim' | 'market' | 'unknown' — 'unknown' is a bug, not a category. */
export function originOf(field) {
  if (NBIM.has(field)) return 'nbim';
  if (MARKET.has(field)) return 'market';
  return 'unknown';
}

/**
 * Check a loaded period file really contains the NBIM fields and nothing else.
 *
 * The pipeline decides the split; this file describes it. If someone adds a field on
 * one side only, the UI would silently label it wrong — so shout in the console instead.
 * Dev-time only: a warning is enough, this must never break the page for a visitor.
 */
export function assertSplit(row) {
  if (!row || !import.meta.env?.DEV) return;
  const keys = Object.keys(row).filter(k => k !== 'id');
  const extra = keys.filter(k => !NBIM.has(k));
  const missing = NBIM_FIELDS.filter(k => !keys.includes(k));
  if (extra.length || missing.length) {
    console.warn(
      '[origin] period file does not match NBIM_FIELDS — labels may be wrong.',
      { unexpected: extra, missing },
      'Update frontend/src/origin.js to match merge_and_enrich.py.'
    );
  }
}
