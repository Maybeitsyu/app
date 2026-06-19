import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

"""
fix_inflated_stock.py

One-time fix: purchase batch remaining_qty is inflated because editing a purchase
deleted and recreated the batch with full qty, ignoring already-consumed stock.

Formula per product per purchase batch:
  correctRemaining = purchasedQty - alreadyConsumed
  alreadyConsumed  = purchasedQty - oldBatchRemaining  (before last edit blew it away)

Since we can't recover oldRemaining, we derive it from SALE movements:
  totalSold = SUM(qty_out) from inventory_movements WHERE movement_type='SALES' for this product
  stockFromOtherPurchases = SUM(remaining_qty) of batches NOT from this purchase
  consumedFromThisPurchase = max(0, totalSold - stockFromOtherPurchases... tricky)

Simplest correct approach:
  Correct total stock for a product = purchasedQty - soldQty + returns + restocks
  We set PURCHASE batch remaining_qty so that totalBatchStock == purchasedQty - soldQty

Run this ONCE against the live DB to correct current data.
"""

import sqlite3
import os
from pathlib import Path

appdata = os.getenv('APPDATA')
if not appdata:
    raise SystemExit('APPDATA env var missing')

db_path = Path(appdata) / 'AgriLedger' / 'data' / 'agridb.db'
print(f'DB PATH: {db_path}')

conn = sqlite3.connect(str(db_path))
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("\n=== CURRENT STOCK AUDIT ===")
# Show current state for products with PURCHASE batches
cur.execute("""
    SELECT 
        p.id,
        p.name,
        p.stock_qty AS legacy_qty,
        COALESCE(SUM(b.remaining_qty), 0) AS batch_total,
        p.stock_qty + COALESCE(SUM(b.remaining_qty), 0) AS display_stock
    FROM products p
    LEFT JOIN batches b ON b.product_id = p.id AND b.remaining_qty > 0
    GROUP BY p.id
    ORDER BY p.name
""")
products = cur.fetchall()
for row in products:
    print(f"  {row['name']}: legacy={row['legacy_qty']}, batches={row['batch_total']}, display={row['display_stock']}")

print("\n=== PURCHASE BATCH vs SOLD ANALYSIS ===")
# For each product: show purchased qty (from purchase_items), total sold, and current batch remaining
cur.execute("""
    SELECT
        p.id AS product_id,
        p.name,
        COALESCE(pi_agg.total_purchased, 0) AS total_purchased,
        COALESCE(sold_agg.total_sold, 0) AS total_sold,
        COALESCE(batch_agg.total_remaining, 0) AS total_batch_remaining,
        p.stock_qty AS legacy_qty
    FROM products p
    LEFT JOIN (
        SELECT product_id, SUM(qty) AS total_purchased
        FROM purchase_items
        GROUP BY product_id
    ) pi_agg ON pi_agg.product_id = p.id
    LEFT JOIN (
        SELECT product_id, SUM(qty_out) AS total_sold
        FROM inventory_movements
        WHERE movement_type = 'SALES'
        GROUP BY product_id
    ) sold_agg ON sold_agg.product_id = p.id
    LEFT JOIN (
        SELECT product_id, SUM(remaining_qty) AS total_remaining
        FROM batches
        WHERE remaining_qty > 0
        GROUP BY product_id
    ) batch_agg ON batch_agg.product_id = p.id
    WHERE pi_agg.total_purchased IS NOT NULL
    ORDER BY p.name
""")
rows = cur.fetchall()

issues = []
for row in rows:
    purchased = row['total_purchased']
    sold = row['total_sold']
    remaining = row['total_batch_remaining']
    legacy = row['legacy_qty']
    expected_remaining = max(0, purchased - sold)
    actual_total = remaining + legacy

    status = "OK"
    if abs(actual_total - expected_remaining) > 0.01:
        status = f"MISMATCH (expected {expected_remaining}, got {actual_total}, diff={actual_total - expected_remaining:+.2f})"
        issues.append({
            'product_id': row['product_id'],
            'name': row['name'],
            'purchased': purchased,
            'sold': sold,
            'expected_remaining': expected_remaining,
            'actual_remaining': actual_total,
        })
    print(f"  {row['name']}: purchased={purchased}, sold={sold}, expected_remaining={expected_remaining}, actual={actual_total} → {status}")

if not issues:
    print("\nNo issues found. Stock looks correct.")
    conn.close()
    exit(0)

print(f"\n=== FOUND {len(issues)} PRODUCTS WITH INFLATED STOCK ===")
print("The following products will be corrected:\n")
for iss in issues:
    print(f"  {iss['name']}: {iss['actual_remaining']} → {iss['expected_remaining']} (reduce by {iss['actual_remaining'] - iss['expected_remaining']:.2f})")

confirm = input("\nApply corrections? [y/N]: ").strip().lower()
if confirm != 'y':
    print("Aborted. No changes made.")
    conn.close()
    exit(0)

print("\nApplying corrections...")

for iss in issues:
    pid = iss['product_id']
    expected = iss['expected_remaining']

    # Get batches for this product ordered by date ASC (FIFO)
    cur.execute("""
        SELECT id, remaining_qty, batch_number
        FROM batches
        WHERE product_id = ? AND remaining_qty > 0
        ORDER BY date ASC, created_at ASC
    """, (pid,))
    batches = cur.fetchall()

    if not batches:
        print(f"  WARNING: {iss['name']} has no active batches but expected {expected} remaining. Skipping.")
        continue

    # Distribute expected_remaining across batches from the end (newest keeps remaining, oldest gets reduced)
    # Simplest: set first PURCHASE batch to corrected qty, zero out duplicates
    remaining_to_distribute = expected
    for b in batches:
        if remaining_to_distribute <= 0:
            cur.execute("UPDATE batches SET remaining_qty = 0 WHERE id = ?", (b['id'],))
            print(f"    Zeroed batch {b['batch_number']} (id={b['id']})")
        else:
            assign = min(remaining_to_distribute, b['remaining_qty'])
            cur.execute("UPDATE batches SET remaining_qty = ? WHERE id = ?", (assign, b['id']))
            print(f"    Set batch {b['batch_number']} remaining_qty: {b['remaining_qty']} → {assign}")
            remaining_to_distribute -= assign

    print(f"  ✓ {iss['name']}: corrected to {expected}")

conn.commit()
print("\nDone. DB committed.")
conn.close()
