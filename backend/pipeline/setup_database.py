# 0

import sqlite3
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR.parent / "nbim.db"

# Single ticker PK: the pipeline stores one current snapshot per ticker
# (fetch step uses INSERT OR REPLACE). No per-ticker history is kept by design.
CREATE_TABLE_QUERY = """
CREATE TABLE {name} (
    ticker TEXT PRIMARY KEY,
    fetched_at DATETIME,
    pe_ratio REAL,
    forward_pe REAL,
    price_to_book REAL,
    dividend_yield REAL,
    market_cap REAL,
    analyst_recommendation TEXT,
    target_mean_price REAL,
    high_52w REAL,
    low_52w REAL,
    beta REAL,
    sector TEXT,
    industry TEXT,
    price REAL,
    change REAL
);
"""

# Column order used when copying rows during migration.
COLUMNS = [
    "ticker", "fetched_at", "pe_ratio", "forward_pe", "price_to_book",
    "dividend_yield", "market_cap", "analyst_recommendation", "target_mean_price",
    "high_52w", "low_52w", "beta", "sector", "industry", "price", "change",
]


def _migrate_composite_pk(conn, cursor):
    """Older DBs created the table with PRIMARY KEY (ticker, fetched_at), so each
    run accumulated rows while newer DBs (single ticker PK) overwrite. Because
    CREATE TABLE IF NOT EXISTS never alters an existing table, that divergence
    would persist per machine. Rebuild any composite-PK table to the single-PK
    schema, keeping the most recently fetched row per ticker. History is dropped
    intentionally — the pipeline only ever uses the current snapshot."""
    cursor.execute("PRAGMA table_info(financial_metrics)")
    info = cursor.fetchall()
    if not info:
        return  # table doesn't exist yet

    pk_cols = [row[1] for row in info if row[5] > 0]  # row[5] = pk position (0 = not PK)
    if len(pk_cols) <= 1:
        return  # already single (or no) PK — nothing to migrate

    print("Migrating financial_metrics: composite PK -> single ticker PK (keeping latest row per ticker)...")
    old_cols = {row[1] for row in info}
    common = [c for c in COLUMNS if c in old_cols]
    col_list = ", ".join(common)

    cursor.execute(CREATE_TABLE_QUERY.format(name="financial_metrics_new"))
    # MAX(fetched_at) with GROUP BY ticker returns the row from the most recent
    # snapshot per ticker (SQLite's bare-column / min-max special case).
    cursor.execute(
        f"INSERT INTO financial_metrics_new ({col_list}) "
        f"SELECT {col_list} FROM ("
        f"  SELECT *, MAX(fetched_at) FROM financial_metrics GROUP BY ticker"
        f")"
    )
    cursor.execute("DROP TABLE financial_metrics")
    cursor.execute("ALTER TABLE financial_metrics_new RENAME TO financial_metrics")
    conn.commit()
    print("Migration complete.")


def setup_metrics_schema():
    print(f"Connecting to database at: {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    try:
        _migrate_composite_pk(conn, cursor)

        cursor.execute(CREATE_TABLE_QUERY.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS").format(name="financial_metrics"))
        conn.commit()
        print("Success! The 'financial_metrics' table is ready.")

        cursor.execute("PRAGMA table_info(financial_metrics);")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"Columns: {', '.join(columns)}")

    except Exception as e:
        print(f"Database error: {e}")

    finally:
        conn.close()

if __name__ == "__main__":
    setup_metrics_schema()
