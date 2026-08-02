# Legacy ticker-resolution scripts (recovered)

Recovered from VS Code local history on 2026-08-01. These originally lived in an
earlier copy of the project at `~/Desktop/Norway Fund/nbim-tracker/`, which no
longer exists on disk, and were never committed to git.

| File | Original path | Last edited |
|---|---|---|
| `resolve_ticker.py` | `backend/pipeline/resolve_ticker.py` | 2026-05-07 11:30 |
| `ai_resolve_tickers.py` | `backend/app/ai_resolve_tickers.py` | 2026-05-07 10:16 |
| `resolve_tickers_app.py` | `backend/app/resolve_tickers.py` | 2026-05-06 11:54 |

These are what produced `data/holdings_with_tickers.csv`. All three ask Gemini to
return a Yahoo ticker from a company name, with no verification against the
exchange. That is the origin of the duplicate-ticker bug: asked for "Canada
Packers Inc", the model answered `WN.TO` — its former parent George Weston.

Kept for reference only. The replacement is `../resolve_tickers.py`, which
verifies every candidate against the exchange's own record and writes a blank
rather than a guess.
