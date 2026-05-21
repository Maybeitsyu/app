const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');

app.whenReady().then(() => {
  try {
    const dbPath = path.join(app.getPath('userData'), 'data', 'agridbfgh.db');
    const db = new Database(dbPath);
    
    // Total sales
    const total = db.prepare(`
      SELECT SUM(input_vat + vat_exempt_amount) as total
      FROM sales 
      WHERE status NOT IN ('FAILED', 'Return')
    `).get().total;
    
    // Find sales matching 2940 or similar discrepancy
    const rows = db.prepare(`
      SELECT date, si_number, gross_amount, input_vat, vat_exempt_amount, status, remarks 
      FROM sales 
      WHERE input_vat + vat_exempt_amount = 2940 OR (gross_amount >= 2900 AND gross_amount <= 3000)
    `).all();
    
    console.log('RESULTS_START');
    console.log('DB Path:', dbPath);
    console.log('Total sales:', total);
    console.log('Rows around 2940:', JSON.stringify(rows, null, 2));
    console.log('RESULTS_END');
  } catch (e) {
    console.error(e);
  }
  app.quit();
});
