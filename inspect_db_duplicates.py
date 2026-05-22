import os
import sqlite3
from pathlib import Path

appdata = os.getenv('APPDATA')
if not appdata:
    raise SystemExit('APPDATA env var missing')

path = Path(appdata) / 'AgriLedger' / 'data' / 'agridb.db'
print('DB PATH:', path)
conn = sqlite3.connect(path)
cur = conn.cursor()
cur.execute('SELECT COUNT(*) FROM purchases')
print('Total purchases:', cur.fetchone()[0])
cur.execute('''
SELECT date, supplier_name, receipt_number, expense_category, gross_amount, COUNT(*) as cnt
FROM purchases
GROUP BY date, supplier_name, receipt_number, expense_category, gross_amount
HAVING cnt > 1
ORDER BY cnt DESC, expense_category
LIMIT 50
''')
dups = cur.fetchall()
print('Duplicate groups:', len(dups))
for row in dups:
    print(row)
cur.execute('''
SELECT expense_category, COUNT(*) as cnt, SUM(gross_amount) as total
FROM purchases
GROUP BY expense_category
ORDER BY total DESC
''')
print('--- category totals ---')
for row in cur.fetchall():
    print(row)
conn.close()
