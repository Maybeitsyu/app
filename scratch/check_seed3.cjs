const { app } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

app.whenReady().then(() => {
  try {
    // Directly use the root project db file
    const dbPath = path.join(app.getAppPath(), '..', 'agridbfgh.db');
    console.log('Seed DB path:', dbPath);

    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name).join(', '));

    if (tables.find(t => t.name === 'sales')) {
      const total = db.prepare(`SELECT COUNT(*) as count, SUM(input_vat + vat_exempt_amount) as total FROM sales WHERE status NOT IN ('FAILED','Return')`).get();
      console.log('\nSales count:', total.count);
      console.log('Sales total:', total.total);

      const rows = db.prepare(`SELECT date, si_number, gross_amount, input_vat, vat_exempt_amount, status FROM sales ORDER BY date DESC LIMIT 20`).all();
      console.log('\nAll sales rows:');
      rows.forEach(r => console.log(JSON.stringify(r)));
    } else {
      console.log('No sales table');
    }
  } catch(e) {
    console.error('ERROR:', e.message);
  }
  app.quit();
});
