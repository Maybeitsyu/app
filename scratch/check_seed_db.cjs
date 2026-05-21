const { app } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

app.whenReady().then(() => {
  try {
    // Check seed DB in the project folder
    const seedPath = path.resolve(app.getAppPath(), 'agridbfgh.db');
    console.log('Checking seed DB at:', seedPath);

    let db;
    try {
      db = new Database(seedPath, { readonly: true });
    } catch(e) {
      console.log('Could not open seed DB:', e.message);
      app.quit(); return;
    }

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name).join(', '));

    if (tables.find(t => t.name === 'sales')) {
      const total = db.prepare(`SELECT COUNT(*) as count, SUM(input_vat + vat_exempt_amount) as total FROM sales WHERE status NOT IN ('FAILED','Return')`).get();
      console.log('Sales count:', total.count);
      console.log('Sales total:', total.total);

      // Show all sales
      const rows = db.prepare(`SELECT date, si_number, gross_amount, input_vat, vat_exempt_amount, status FROM sales ORDER BY date DESC LIMIT 20`).all();
      console.log('\nSales rows (last 20):');
      rows.forEach(r => console.log(JSON.stringify(r)));
    }

  } catch(e) {
    console.error('ERROR:', e.message);
  }
  app.quit();
});
