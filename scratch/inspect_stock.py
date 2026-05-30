import sqlite3
import os
import time
from pathlib import Path

appdata = os.getenv('APPDATA')
if not appdata:
    raise SystemExit('APPDATA env var missing')

db_path = Path(appdata) / 'AgriLedger' / 'data' / 'agridb.db'
print('DB PATH:', db_path)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Start a transaction so we can rollback
cur.execute('BEGIN TRANSACTION')

try:
    # 1. Total legacy batches before
    cur.execute("SELECT COUNT(*) FROM batches WHERE batch_number LIKE 'LEGACY-%'")
    print(f"Legacy batches before: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM products WHERE stock_qty > 0")
    print(f"Products with stock_qty > 0 before: {cur.fetchone()[0]}")

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
    print(f"Deleted duplicate legacy batches: {cur.rowcount}")

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
    print(f"Zeroed out products.stock_qty for already migrated products: {cur.rowcount}")

    # Step C: Migrate remaining products where stock_qty > 0
    cur.execute("SELECT id, stock_qty, cost, srp, unit FROM products WHERE stock_qty > 0")
    to_migrate = cur.fetchall()
    print(f"Products remaining to migrate: {len(to_migrate)}")
    
    for row in to_migrate:
        pid, stock_qty, cost, srp, unit = row
        # create batch
        batch_id = f"test-legacy-id-{pid}"
        cur.execute("""
            INSERT INTO batches (id, product_id, batch_number, date, unit_cost, srp, remaining_qty, unit, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (batch_id, pid, f"LEGACY-{int(time.time()*1000)}", "2026-05-30", cost, srp, stock_qty, unit or "pc", "2026-05-30T15:00:00Z", "2026-05-30T15:00:00Z"))
        
        # zero out product stock_qty
        cur.execute("UPDATE products SET stock_qty = 0 WHERE id = ?", (pid,))
        print(f"Migrated product {pid} with qty {stock_qty}")

    # 4. Total legacy batches after
    cur.execute("SELECT COUNT(*) FROM batches WHERE batch_number LIKE 'LEGACY-%'")
    print(f"Legacy batches after: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM products WHERE stock_qty > 0")
    print(f"Products with stock_qty > 0 after: {cur.fetchone()[0]}")

finally:
    # Rollback so we don't modify the real database during the test run!
    conn.rollback()
    print("Transaction rolled back successfully.")
    conn.close()
