import sqlite3
import os
from pathlib import Path

appdata = os.getenv('APPDATA')
if not appdata:
    raise SystemExit('APPDATA env var missing')

db_path = Path(appdata) / 'AgriLedger' / 'data' / 'agridb.db'
print('DB PATH:', db_path)

if not db_path.exists():
    print("Database file does not exist!")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Start transaction
cur.execute('BEGIN TRANSACTION')

try:
    # 1. Total legacy batches before
    cur.execute("SELECT COUNT(*) FROM batches WHERE batch_number LIKE 'LEGACY-%'")
    before_batches = cur.fetchone()[0]
    print(f"Legacy batches before: {before_batches}")
    
    cur.execute("SELECT COUNT(*) FROM products WHERE stock_qty > 0")
    before_stock = cur.fetchone()[0]
    print(f"Products with stock_qty > 0 before: {before_stock}")

    # Step A: Delete duplicate legacy batches, keeping only the oldest one
    cur.execute("""
        DELETE FROM batches
        WHERE batch_number LIKE 'LEGACY-%'
          AND rowid NOT IN (
            SELECT MIN(rowid)
            FROM batches
            WHERE batch_number LIKE 'LEGACY-%'
            GROUP BY product_id
          )
    """)
    deleted = cur.rowcount
    print(f"Deleted duplicate legacy batches: {deleted}")

    # Step B: Zero out products.stock_qty for products that already have a legacy batch
    cur.execute("""
        UPDATE products
        SET stock_qty = 0
        WHERE stock_qty > 0
          AND id IN (
            SELECT DISTINCT product_id
            FROM batches
            WHERE batch_number LIKE 'LEGACY-%'
          )
    """)
    zeroed = cur.rowcount
    print(f"Zeroed out products.stock_qty for already migrated products: {zeroed}")

    # Commit the changes!
    conn.commit()
    print("Cleanup transaction committed successfully!")

    # Verify final counts
    cur.execute("SELECT COUNT(*) FROM batches WHERE batch_number LIKE 'LEGACY-%'")
    print(f"Legacy batches after: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM products WHERE stock_qty > 0")
    print(f"Products with stock_qty > 0 after: {cur.fetchone()[0]}")

except Exception as e:
    conn.rollback()
    print("Error occurred, transaction rolled back:", e)

finally:
    conn.close()
