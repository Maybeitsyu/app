const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Set a clean test directory
const testUserData = path.resolve(__dirname, 'test_user_data');
app.setPath('userData', testUserData);
app.setName('AgriLedgerTest');

app.whenReady().then(async () => {
  try {
    const dbModulePath = path.resolve(__dirname, '..', 'electron', 'db.js');
    const { createRepository } = require(dbModulePath);
    
    console.log('Creating repository...');
    const repo = createRepository();
    
    console.log('Importing Excel...');
    const importRes = await repo.importSalesFromExcel(
      path.resolve(__dirname, '..', 'example xl', 'agriledger back up.xlsx'),
      ['SALES MAY 2026']
    );
    console.log('Import results:', importRes);
    
    // Read the database we just populated
    const dbPath = repo.dbPath;
    console.log('Checking database at:', dbPath);
    const db = new Database(dbPath, { readonly: true });
    
    const count = db.prepare('SELECT COUNT(*) as count FROM sales').get().count;
    const sum = db.prepare('SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales').get().total;
    const filteredSum = db.prepare("SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales WHERE status NOT IN ('FAILED', 'Return')").get().total;

    console.log(`\n=== IMPORTED DATA STATS ===`);
    console.log('Total sales row count in DB:', count);
    console.log('Total sales sum (all):', sum);
    console.log('Total sales sum (excluding FAILED/Return):', filteredSum);

    // List all rows with status = 'Return' or similar
    console.log('\n=== NON-PAID SALES IN DB ===');
    const returnRows = db.prepare("SELECT date, si_number, gross_amount, input_vat, vat_exempt_amount, status, remarks FROM sales WHERE status IN ('FAILED', 'Return')").all();
    console.log(JSON.stringify(returnRows, null, 2));

    // Show date ranges in DB
    const minMaxDate = db.prepare("SELECT MIN(date) as min_d, MAX(date) as max_d FROM sales").get();
    console.log('\nDate range in DB:', minMaxDate);

  } catch (e) {
    console.error('ERROR:', e.stack);
  }
  app.quit();
});
