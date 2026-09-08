// THE sector name. Every place that groups, filters, colours or counts by sector
// must come from here.
//
// data.json carries two taxonomies. Yahoo's names cover most rows; 51 rows have no
// `sector` at all and fall back to `industry`, which uses GICS names. The two
// disagree on five labels, so the same sector arrives under two spellings:
//
//   Healthcare (159)            vs  Health Care (3)
//   Financial Services (178)    vs  Financials (9)
//   Consumer Cyclical (170)     vs  Consumer Discretionary (3)
//   Consumer Defensive (92)     vs  Consumer Staples (2)
//   Communication Services (60) vs  Telecommunications (2)
//
// Nineteen rows out of 1,398 — but they were enough to put five duplicate entries in
// the Sector filter (each with its own count, so neither total is the real one), five
// duplicate slivers in the treemap sharing a colour with the tile they belong to, and
// "16 sectors" on the stat card where the honest answer is 11.
//
// Plain .js so Node (scripts/build-static.mjs) and the browser bundle load the
// identical map — the static pages folded these synonyms already, and folding them in
// only one of the two places is how /holdings/ and the dashboard would come to
// disagree about how many sectors the fund is in.
//
// This is a display-layer fold, not a fix. The durable fix is normalising `sector` in
// backend/pipeline/merge_and_enrich.py, which is a change to the shape of data.json
// and therefore a call for whoever owns the dataset.
const CANON = {
  'Health Care': 'Healthcare',
  'Financials': 'Financial Services',
  'Consumer Discretionary': 'Consumer Cyclical',
  'Consumer Staples': 'Consumer Defensive',
  'Telecommunications': 'Communication Services',
};

/**
 * The sector a holding belongs to, under one name. `fallback` is what to return for a
 * row that has neither field — the app shows an em dash, the static build labels the
 * page "Unclassified".
 */
export function sectorOf(row, fallback = '') {
  const s = row?.sector || row?.industry;
  if (!s) return fallback;
  return CANON[s] || s;
}
