import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('--- All March 2026 DB Sales (Including Returns/Failed) ---');

const allMarchSales = db.prepare(`
  SELECT 
    s.id as sale_id,
    s.date,
    s.si_number,
    s.status,
    s.remarks,
    s.gross_amount,
    s.profit,
    s.input_vat,
    s.output_vat,
    s.vat_exempt_amount,
    COALESCE((SELECT SUM(total_cost) FROM sale_items WHERE sale_id = s.id), 0) as total_cogs
  FROM sales s
  WHERE s.date >= '2026-03-01' AND s.date <= '2026-03-31'
  ORDER BY s.date, s.si_number
`).all();

console.log(`Total March 2026 sales rows in DB: ${allMarchSales.length}`);

// Group by status
const statusCounts = {};
const statusCogs = {};
allMarchSales.forEach(s => {
  statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  statusCogs[s.status] = (statusCogs[s.status] || 0) + s.total_cogs;
});

console.log('\nStatus Breakdown:');
Object.keys(statusCounts).forEach(status => {
  console.log(`  Status: ${status} | Count: ${statusCounts[status]} | Total COGS: ₱${statusCogs[status].toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
});

console.log('\n--- Checking for Return/Failed/Other status rows in March 2026 ---');
allMarchSales.forEach(s => {
  if (s.status === 'Return' || s.status === 'FAILED') {
    console.log(`Sale: SI="${s.si_number}", Date=${s.date}, Status=${s.status}, Remarks="${s.remarks}", Gross=${s.gross_amount}, COGS=${s.total_cogs}`);
  }
});

console.log('\n--- Checking if any March sale has COGS equal to 3000 ---');
allMarchSales.forEach(s => {
  if (Math.abs(s.total_cogs - 3000) < 0.01) {
    console.log(`Found March sale with COGS=3000: SI="${s.si_number}", Date=${s.date}, Status=${s.status}, Remarks="${s.remarks}", Gross=${s.gross_amount}, COGS=${s.total_cogs}`);
  }
});

console.log('\n--- Checking if any March sale has gross_amount or profit equal to 3000 ---');
allMarchSales.forEach(s => {
  if (Math.abs(s.gross_amount - 3000) < 0.01) {
    console.log(`Found March sale with Gross=3000: SI="${s.si_number}", Date=${s.date}, Status=${s.status}, Remarks="${s.remarks}", Gross=${s.gross_amount}, COGS=${s.total_cogs}`);
  }
});

db.close();
