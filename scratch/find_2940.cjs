const { app } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

app.whenReady().then(() => {
  try {
    const dbPath = path.join(app.getPath('userData'), 'data', 'agridbfgh.db');
    console.log('Reading DB from:', dbPath);
    const db = new Database(dbPath);

    // 1. Grand total in DB
    const total = db.prepare(`SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales WHERE status NOT IN ('FAILED','Return')`).get();
    console.log('\n=== GRAND TOTAL IN DB ===');
    console.log('Total:', total.total);

    // 2. Sales grouped by date (most recent first)
    console.log('\n=== SALES GROUPED BY DATE (last 20 dates) ===');
    const byDate = db.prepare(`
      SELECT date, COUNT(*) as count, SUM(input_vat + vat_exempt_amount) as day_total
      FROM sales 
      WHERE status NOT IN ('FAILED','Return')
      GROUP BY date
      ORDER BY date DESC
      LIMIT 20
    `).all();
    byDate.forEach(r => console.log(`${r.date} | rows: ${r.count} | total: ${r.day_total}`));

    // 3. Most recent rows
    console.log('\n=== MOST RECENT 10 SALES ROWS ===');
    const rows = db.prepare(`
      SELECT date, si_number, gross_amount, input_vat, vat_exempt_amount, 
             (input_vat + vat_exempt_amount) as line_total, status, created_at
      FROM sales 
      ORDER BY created_at DESC
      LIMIT 10
    `).all();
    rows.forEach(r => console.log(JSON.stringify(r)));

  } catch(e) {
    console.error('ERROR:', e.message);
  }
  app.quit();
});
